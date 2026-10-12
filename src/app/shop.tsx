import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { usePostHog } from 'posthog-react-native';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { playSfx } from '@/audio/sound';
import { COLORS } from '@/game/constants';
import { haptic } from '@/game/haptics';
import { SHOP_BOWS, SHOP_DERPS, SHOP_HATS, SKINS, formatSol, ownsProduct, type Currency, type Skin } from '@/game/skins';
import type { DerpId, HatId } from '@/game/derps';
import { DerpThumb } from '@/ui/DerpThumb';
import { SkinStage } from '@/game3d/SkinStage';
import { Stage } from '@/game3d/Stage';
import { MAPS, isFreeMap, type GameMap } from '@/game/maps';
import { lookFor, sanitizeLoadout } from '@/game/cosmetics';
import { useGameStore } from '@/game/store';
import { sessionWalletAddress, useWalletAuth } from '@/solana/auth';
import { CLUSTER, SHOP_ENABLED, SKR_ENABLED } from '@/solana/config';
import { buySkin, restorePendingPurchase } from '@/solana/payments';
import { formatSkr, useSkrBalance } from '@/solana/skr';
import { isSupabaseConfigured } from '@/utils/supabase';

// In-game shop, three tabs: the derps (who you play as; Gary is free), hats
// (they do not help) with the shovel bow on top, and the maps (Classic is
// free; the three Unity environment maps are locked until bought). All are
// paid in SOL or SKR through the connected wallet (MWA signs and sends a
// transfer to the treasury); ownership is granted server-side after
// on-chain verification. Prices are placeholders — skins.ts and maps.ts.
type Product = Skin | GameMap;
const isMap = (p: Product): p is GameMap => 'theme' in p;

type Tab = 'derps' | 'hats' | 'maps';
const TABS: { id: Tab; label: string }[] = [
  { id: 'derps', label: 'Derps' },
  { id: 'hats', label: 'Hats' },
  { id: 'maps', label: 'Maps' },
];
const TAB_BLURB: Record<Tab, string | null> = {
  derps: 'Same stick body. Same bow. Different idiot.',
  hats: 'They do not help.',
  maps: null,
};
const SHOVEL = SHOP_BOWS.find((b) => b.item === 'shovel');
const tabOf = (p: Skin): Tab => (p.kind === 'derp' ? 'derps' : 'hats');
const productById = (id: string | undefined) => [...SHOP_DERPS, ...SHOP_HATS, ...SHOP_BOWS].find((s) => s.id === id);

// The map preview: my archer on a ledge, framed wide enough to see the set.
const MAP_CAMERA = { x: 0.6, y: 2.1, z: 7, lookX: 1.4, lookY: 2.3, fov: 50, drift: 0.25 };
const MAP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  classic: 'shuffle',
  map_grove: 'leaf',
  map_valley: 'home',
  map_snow: 'snow',
};

export default function ShopScreen() {
  useScreenMusic('shop');
  const wallet = useMobileWallet();
  const { session, signIn, signingIn, refreshOwnedSkins } = useWalletAuth();
  const posthog = usePostHog();
  const owned = useGameStore((s) => s.ownedSkins);
  const equip = useGameStore((s) => s.equip);
  const equippedMap = useGameStore((s) => s.equippedMap);
  const equipMap = useGameStore((s) => s.equipMap);
  const loadout = useGameStore((s) => s.loadout);
  const addOwnedSkin = useGameStore((s) => s.addOwnedSkin);
  const pending = useGameStore((s) => s.pendingPurchase);
  const preferred = useGameStore((s) => s.preferredCurrency);
  const setPreferredCurrency = useGameStore((s) => s.setPreferredCurrency);
  const currency: Currency = SKR_ENABLED ? preferred : 'SOL';
  const skrBalance = useSkrBalance();
  const [buying, setBuying] = useState<string | null>(null);
  // What the derp on the stage is doing (the derp reel).
  const [step, setStep] = useState('');
  // Opens on the tab and item we were sent to (from "Choose your style"),
  // else on the derps with the one I'm wearing.
  const params = useLocalSearchParams<{ skin?: string; tab?: string }>();
  const sentTo = productById(params.skin);
  const [tab, setTabState] = useState<Tab>(() =>
    params.tab === 'maps' || params.tab === 'hats' || params.tab === 'derps' ? params.tab : sentTo ? tabOf(sentTo) : 'derps',
  );
  const [mapId, setMapId] = useState(equippedMap);
  const previewMap = MAPS.find((m) => m.id === mapId) ?? MAPS[0];
  const myLook = useMemo(() => lookFor(loadout), [loadout]);
  const mapActors = useMemo(() => [{ look: myLook, x: 0, facing: 1 as const, performance: 'idle' as const }], [myLook]);
  // The product on the 3D stage: what I wear of that tab's kind by default.
  const wornFor = (t: Tab) =>
    t === 'derps' ? `derp_${loadout.derp}` : loadout.bow === 'shovel' ? 'bow_shovel' : loadout.hat !== 'none' ? `hat_${loadout.hat}` : SHOP_HATS[0].id;
  const [previewId, setPreviewId] = useState(() => sentTo?.id ?? wornFor(tab));
  const preview = productById(previewId) ?? (tab === 'hats' ? SHOP_HATS[0] : SHOP_DERPS[0]);
  // A derp keeps my hat and bow; a hat or the shovel bow goes on my derp.
  const previewLook = useMemo(() => lookFor(sanitizeLoadout({ ...loadout, [preview.kind]: preview.item })), [loadout, preview]);
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t !== 'maps') setPreviewId(wornFor(t));
  };
  // A purchase requested before the wallet was connected: sign in first, then
  // run it on the next render, when `wallet` reflects the connected account.
  const queued = useRef<{ skin: Product; cur: Currency } | null>(null);

  // On open: pull server-side ownership and finish any purchase whose
  // verification was interrupted last time. `pending` clears itself in the
  // store once the server confirms the grant.
  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    refreshOwnedSkins().catch(() => {});
    if (pending) {
      restorePendingPurchase().then((id) => {
        if (id) {
          haptic.success();
          const name = [...SKINS, ...MAPS].find((s) => s.id === id)?.name ?? 'Your item';
          Alert.alert('Purchase restored', `${name} is now unlocked.`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const onEquip = (item: Product) => {
    haptic.release();
    if (isMap(item)) {
      equipMap(item.id);
      posthog.capture('map_equipped', { map: item.id });
    } else {
      equip(item.kind, item.item);
      posthog.capture('skin_equipped', { skin: item.id });
    }
  };

  // Hats and the shovel bow come off again; a derp is swapped, not removed.
  const onTakeOff = (item: Skin) => {
    haptic.release();
    equip(item.kind, item.kind === 'bow' ? 'bow' : 'none');
  };

  const purchase = async (skin: Product, cur: Currency) => {
    if (!wallet.account) return; // guarded by callers
    const price = cur === 'SKR' ? skin.priceSkr : skin.priceLamports;
    setBuying(skin.id);
    try {
      // The server grants the skin to the account that signed in. If the
      // wallet has since switched accounts, paying would burn funds from the
      // wrong one — stop before any transfer.
      const sessionAddr = sessionWalletAddress(session);
      if (sessionAddr && sessionAddr !== wallet.account.address) {
        haptic.warning();
        Alert.alert(
          'Wallet changed',
          `You signed in as ${sessionAddr.slice(0, 4)}… but the wallet is on ${wallet.account.address.slice(0, 4)}…. Sign out and back in with the account you want to buy with.`,
        );
        return;
      }
      if (cur === 'SKR' && skrBalance.baseUnits !== null && skrBalance.baseUnits < BigInt(price)) {
        haptic.warning();
        Alert.alert(
          'Not enough SKR',
          `${skin.name} costs ${formatSkr(price)} and your wallet holds ${formatSkr(skrBalance.baseUnits)}.` +
            (skin.priceLamports > 0 ? ' You can pay in SOL instead.' : ''),
        );
        return;
      }
      posthog.capture('purchase_started', { skin: skin.id, currency: cur, price });
      const result = await buySkin(
        { address: wallet.account.address, sendTransactions: wallet.sendTransactions },
        skin,
        cur,
      );
      if (result.ok) {
        addOwnedSkin(skin.id);
        if (isMap(skin)) equipMap(skin.id);
        else equip(skin.kind, skin.item);
        haptic.kill();
        playSfx('coins');
        posthog.capture('purchase_completed', { skin: skin.id, currency: cur, signature: result.signature });
        if (cur === 'SKR') skrBalance.refresh();
        Alert.alert('Yours.', `${skin.name} unlocked and equipped.${!isMap(skin) && skin.kind === 'hat' ? ' It does not help.' : ''}`);
      } else if (result.reason === 'cancelled') {
        haptic.tap();
      } else if (result.reason === 'verify-failed') {
        haptic.warning();
        Alert.alert(
          result.retryable ? 'Payment sent, unlock pending' : 'Payment sent, not accepted',
          result.retryable
            ? `The transfer went through but we couldn't confirm it yet. Reopen the shop in a moment and it will retry automatically.\n\n${result.detail ?? ''}`
            : `The transfer was sent but the server rejected it, so it won't be retried. Keep this signature and contact support:\n${result.signature ?? ''}\n\n${result.detail ?? ''}`,
        );
      } else {
        haptic.warning();
        Alert.alert('Purchase failed', result.detail ?? result.reason);
      }
    } finally {
      setBuying(null);
    }
  };

  // Runs the queued purchase once the connected account is visible to this render.
  useEffect(() => {
    const q = queued.current;
    if (!q || !wallet.account || !session) return;
    queued.current = null;
    Promise.resolve().then(() => purchase(q.skin, q.cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.account, session]);

  const onBuy = async (skin: Product, cur: Currency) => {
    if (buying || queued.current) return;
    if (!SHOP_ENABLED) {
      Alert.alert('Shop not configured', 'Set EXPO_PUBLIC_TREASURY_ADDRESS to enable purchases.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Shop needs a backend', 'Purchases are verified server-side. Configure Supabase (README → Services).');
      return;
    }
    if (wallet.account && session) {
      await purchase(skin, cur);
      return;
    }
    // Not signed in: wallet sheet → SIWS → session, then the effect above buys
    // (it takes over the spinner via `buying`).
    setBuying(skin.id);
    try {
      queued.current = { skin, cur };
      await signIn();
    } catch (e) {
      queued.current = null;
      setBuying(null);
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|declin|reject/i.test(msg)) Alert.alert('Sign-in failed', msg);
    }
  };

  const isOwned = (item: Product) => (isMap(item) ? isFreeMap(item) || owned.includes(item.id) : ownsProduct(item.id, owned));
  const isWorn = (item: Product) => (isMap(item) ? equippedMap === item.id : loadout[item.kind] === item.item);

  // Equip / take off / buy, for a card or the shovel-bow banner.
  const action = (item: Product) => {
    const map = isMap(item) ? item : null;
    const worn = isWorn(item);
    if (isOwned(item)) {
      const removable = !map && worn && (item as Skin).kind !== 'derp';
      return (
        <HapticTouchable
          style={[styles.cta, worn && styles.ctaGhost]}
          onPress={() => (removable ? onTakeOff(item as Skin) : onEquip(item))}
          disabled={worn && !removable}
        >
          <Text style={[styles.ctaText, worn && styles.ctaGhostText]}>
            {removable ? 'Take off' : worn ? (map ? 'Playing here' : 'Equipped') : map ? 'Play here' : 'Equip'}
          </Text>
        </HapticTouchable>
      );
    }
    // An item not sold in the selected currency falls back to the other.
    const cur: Currency = currency === 'SKR' ? (item.priceSkr > 0 ? 'SKR' : 'SOL') : item.priceLamports > 0 ? 'SOL' : 'SKR';
    const label = cur === 'SKR' ? formatSkr(item.priceSkr) : formatSol(item.priceLamports);
    const sellable = cur === 'SOL' ? item.priceLamports > 0 : SKR_ENABLED && item.priceSkr > 0;
    return (
      <HapticTouchable style={[styles.cta, !sellable && styles.ctaDisabled]} onPress={() => onBuy(item, cur)} disabled={!!buying || !sellable}>
        {buying === item.id ? <ActivityIndicator color="#0B0B0F" /> : <Text style={styles.ctaText}>{sellable ? label : 'Needs SKR'}</Text>}
      </HapticTouchable>
    );
  };

  const data: Product[] = tab === 'maps' ? MAPS : tab === 'derps' ? SHOP_DERPS : SHOP_HATS;
  const blurb = TAB_BLURB[tab];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.body}>
        <View style={styles.stageCol}>
          {tab === 'maps' ? (
            <View style={[styles.stage, styles.clip]}>
              <Stage key={previewMap.id} theme={previewMap.theme ?? 'forest'} actors={mapActors} camera={MAP_CAMERA} ledges />
            </View>
          ) : (
            <SkinStage look={previewLook} style={styles.stage} onStep={setStep} />
          )}
          {tab !== 'maps' && !!step && (
            <View style={styles.stepChip} pointerEvents="none">
              <Text style={styles.stepText}>{step}</Text>
            </View>
          )}
          {(tab === 'maps' ? !isOwned(previewMap) : !isOwned(preview)) && (
            <View style={[styles.stepChip, styles.lockChip, tab !== 'maps' && styles.lockChipRight]} pointerEvents="none">
              <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
              <Text style={styles.stepText}>Locked</Text>
            </View>
          )}
          <View style={styles.stageInfo} pointerEvents="none">
            <Text style={styles.stageName}>{tab === 'maps' ? previewMap.name : preview.name}</Text>
            <Text style={styles.stageDesc} numberOfLines={3}>
              {tab === 'maps' ? previewMap.description : preview.description}
            </Text>
          </View>
        </View>
        <View style={styles.listCol}>
          <View style={styles.header}>
            <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </HapticTouchable>
            <Text style={styles.title}>Shop</Text>
            <View style={styles.tabs}>
              {TABS.map((t) => (
                <HapticTouchable key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)} sound="ui_click">
                  <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
                </HapticTouchable>
              ))}
            </View>
            <Text style={styles.cluster}>{CLUSTER.name}</Text>
          </View>

          <FlatList<Product>
            key={tab}
            data={data}
            keyExtractor={(s) => s.id}
            numColumns={tab === 'maps' ? 2 : 3}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={styles.grid}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                {SKR_ENABLED && (
                  <View style={styles.segment}>
                    {(['SKR', 'SOL'] as Currency[]).map((c) => (
                      <HapticTouchable
                        key={c}
                        style={[styles.segmentItem, currency === c && styles.segmentActive]}
                        onPress={() => setPreferredCurrency(c)}
                      >
                        <Text style={[styles.segmentText, currency === c && styles.segmentTextActive]}>Pay in {c}</Text>
                      </HapticTouchable>
                    ))}
                  </View>
                )}
                <View style={styles.balanceRow}>
                  <Ionicons name="wallet-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.blurb}>
                    {!wallet.account
                      ? 'Purchases stay tied to your wallet. Sign in when you buy.'
                      : SKR_ENABLED
                        ? skrBalance.loading
                          ? 'Reading SKR balance…'
                          : skrBalance.baseUnits === null
                            ? 'SKR balance unavailable'
                            : `${formatSkr(skrBalance.baseUnits)} in wallet`
                        : 'Paid in SOL from your wallet.'}
                    {signingIn ? ' Confirm in your wallet…' : ''}
                  </Text>
                </View>
                {SKR_ENABLED && currency === 'SKR' && <Text style={styles.hint}>SKR prices run ~20% under SOL.</Text>}
                {pending && session && (
                  <Text style={styles.hint}>A payment is waiting for confirmation. It retries each time you open the shop.</Text>
                )}
                {tab === 'hats' && SHOVEL && (
                  // The promised community item: its own banner above the hats.
                  <HapticTouchable
                    style={[styles.shovel, isWorn(SHOVEL) && styles.cardEquipped, previewId === SHOVEL.id && styles.cardPreview]}
                    onPress={() => setPreviewId(SHOVEL.id)}
                    sound="ui_click"
                  >
                    <View style={styles.shovelIcon}>
                      <MaterialCommunityIcons name="shovel" size={34} color="#0B0B0F" />
                    </View>
                    <View style={styles.shovelText}>
                      <Text style={styles.shovelKicker}>BY REQUEST</Text>
                      <Text style={styles.name}>{SHOVEL.name}</Text>
                      <Text style={styles.desc}>{SHOVEL.description}</Text>
                    </View>
                    <View style={styles.shovelCta}>{action(SHOVEL)}</View>
                  </HapticTouchable>
                )}
                {!!blurb && <Text style={styles.tabBlurb}>{blurb}</Text>}
              </View>
            }
            renderItem={({ item }) => {
              const map = isMap(item) ? item : null;
              const skin = map ? null : (item as Skin);
              const isPreview = map ? item.id === mapId : item.id === previewId;
              return (
                <HapticTouchable
                  style={[styles.card, isWorn(item) && styles.cardEquipped, isPreview && styles.cardPreview]}
                  onPress={() => (map ? setMapId(item.id) : setPreviewId(item.id))}
                  sound="ui_click"
                >
                  {map ? (
                    <View style={[styles.mapSwatch, { backgroundColor: map.color }]}>
                      <Ionicons name={MAP_ICONS[map.id] ?? 'map'} size={22} color="#0B0B0F" />
                      {!isOwned(item) && (
                        <View style={styles.mapLock}>
                          <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                  ) : (
                    skin && (
                      <View style={[styles.faceWrap, { borderColor: skin.color }]}>
                        {skin.kind === 'derp' ? (
                          <DerpThumb derp={skin.item as DerpId} size={44} />
                        ) : (
                          <DerpThumb derp={loadout.derp} hat={skin.item as HatId} size={44} />
                        )}
                      </View>
                    )
                  )}
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {action(item)}
                </HapticTouchable>
              );
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  body: { flex: 1, flexDirection: 'row' },
  stageCol: { width: '36%', padding: 12, paddingRight: 0 },
  stage: { flex: 1, borderRadius: 20 },
  clip: { overflow: 'hidden' },
  lockChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockChipRight: { top: 52 }, // under the reel's step chip
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, marginRight: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: '#0B0B0F' },
  mapSwatch: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  mapLock: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 9, padding: 3 },
  stageInfo: { position: 'absolute', left: 28, right: 16, bottom: 26 },
  stepChip: { position: 'absolute', top: 22, left: 24, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  stepText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  stageName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  stageDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  listCol: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  cluster: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  headerBlock: { gap: 10, marginBottom: 12 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: COLORS.arrow },
  segmentText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 14 },
  segmentTextActive: { color: '#0B0B0F' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blurb: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 },
  grid: { paddingHorizontal: 16, paddingTop: 4, gap: 10, paddingBottom: 24 },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardEquipped: { borderColor: COLORS.arrow },
  cardPreview: { backgroundColor: 'rgba(255,255,255,0.14)' },
  shovel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(150,96,45,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,210,63,0.5)',
  },
  shovelIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#FFD23F', alignItems: 'center', justifyContent: 'center' },
  shovelText: { flex: 1, gap: 2 },
  shovelKicker: { color: '#FFD23F', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  shovelCta: { width: 120 },
  tabBlurb: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontStyle: 'italic' },
  faceWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 2,
    backgroundColor: '#E9E4D8', // paper, so the ink reads
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  desc: { color: 'rgba(255,255,255,0.55)', fontSize: 12, minHeight: 32 },
  cta: { backgroundColor: COLORS.arrow, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#0B0B0F', fontWeight: '800', fontSize: 14 },
  ctaGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  ctaGhostText: { color: 'rgba(255,255,255,0.7)' },
});
