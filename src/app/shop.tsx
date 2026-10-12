import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { usePostHog } from 'posthog-react-native';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { playSfx } from '@/audio/sound';
import { COLORS } from '@/game/constants';
import { haptic } from '@/game/haptics';
import { SKINS, isCoinSkin, isFreeSkin, ownsProduct, productId, type Currency, type ProductKind, type Skin } from '@/game/skins';
import { SkinStage } from '@/game3d/SkinStage';
import { Stage } from '@/game3d/Stage';
import { MAPS, isFreeMap, type GameMap } from '@/game/maps';
import { DEFAULT_LOADOUT, lookFor, sanitizeLoadout, type Loadout } from '@/game/cosmetics';
import { useGameStore } from '@/game/store';
import { isUserRejection, useWalletAuth } from '@/solana/auth';
import { CLUSTER, SHOP_ENABLED, SKR_ENABLED } from '@/solana/config';
import { buySkin, restorePendingPurchase, restorePurchasesFromChain } from '@/solana/payments';
import { formatSkr, useSkrBalance } from '@/solana/skr';
import { CoinIcon, CoinPill, FONT } from '@/ui/kit';
import { PartThumb, PriceTag, SECTIONS, SectionIcon, priceOf } from '@/ui/PartThumb';
import { makeStyles, useMetrics } from '@/ui/responsive';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';

// In-game shop, one tab per section: characters, clothes, hats, bows,
// arrows (skins.ts) and maps (maps.ts). The newer items cost coins, earned
// by playing; the originals (four derps, ten hats, the shovel bow, the three
// Unity maps) are paid in SOL or SKR through the connected wallet (MWA signs
// and sends a transfer to the treasury) and unlocked on this device once the
// transfer is confirmed on-chain (solana/payments.ts). Free defaults (Gary,
// Classic) are listed too.
type Product = Skin | GameMap;
const isMap = (p: Product): p is GameMap => 'theme' in p;

type Tab = ProductKind | 'maps';
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  ...SECTIONS.map((s) => ({ id: s.kind as Tab, label: s.label, icon: s.icon })),
  { id: 'maps', label: 'Maps', icon: <SectionIcon ion="map" size={15} /> },
];
const BLURB: Record<Tab, string> = {
  ...(Object.fromEntries(SECTIONS.map((s) => [s.kind, s.blurb])) as Record<ProductKind, string>),
  maps: 'Where your duels happen. Equip one and every duel is fought there.',
};
// Each section lists what's for sale: the free default of every slot but
// the derps (Gary stays, to switch back to) is left out.
const LISTS: Record<ProductKind, Skin[]> = Object.fromEntries(
  SECTIONS.map(({ kind }) => [kind, SKINS.filter((s) => s.kind === kind && (kind === 'derp' || !isFreeSkin(s)))]),
) as Record<ProductKind, Skin[]>;
const ALL_SKINS = Object.values(LISTS).flat();
const productById = (id: string | undefined) => ALL_SKINS.find((s) => s.id === id);
// Old links say derps / hats.
const tabParam = (t: string | undefined): Tab | null =>
  t === 'derps' ? 'derp' : t === 'hats' ? 'hat' : TABS.some((x) => x.id === t) ? (t as Tab) : null;

// The map preview: my archer on a ledge, framed wide enough to see the set.
const MAP_CAMERA = { x: 0.6, y: 2.1, z: 7, lookX: 1.4, lookY: 2.3, fov: 50, drift: 0.25 };
// Grid: the narrowest a card may get (design units) before a column drops.
// 3 skin columns at the design size, 4 on a long 21:9 phone, 2 on a narrow one.
const CARD_MIN = { skin: 125, map: 190 };
const GRID_GAP = 10;
const GRID_PAD = 16;
const MAP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  classic: 'shuffle',
  map_grove: 'leaf',
  map_valley: 'home',
  map_snow: 'snow',
};

export default function ShopScreen() {
  useScreenMusic('shop');
  const styles = useStyles();
  const { s, scale, width } = useMetrics();
  const insets = useSafeAreaInsets();
  const wallet = useMobileWallet();
  const { signIn, signingIn } = useWalletAuth();
  const posthog = usePostHog();
  const owned = useGameStore((s) => s.ownedSkins);
  const coinItems = useGameStore((s) => s.coinItems);
  const coins = useGameStore((s) => s.coins);
  const buyWithCoins = useGameStore((s) => s.buyWithCoins);
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
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  // What the derp on the stage is doing (the derp reel).
  const [step, setStep] = useState('');
  // Opens on the tab and item we were sent to (from "Choose your style"),
  // else on the characters with the one I'm wearing.
  const params = useLocalSearchParams<{ skin?: string; tab?: string }>();
  const sentTo = productById(params.skin);
  const [tab, setTabState] = useState<Tab>(() => tabParam(params.tab) ?? sentTo?.kind ?? 'derp');
  const [mapId, setMapId] = useState(equippedMap);
  const previewMap = MAPS.find((m) => m.id === mapId) ?? MAPS[0];
  const myLook = useMemo(() => lookFor(loadout), [loadout]);
  const mapActors = useMemo(() => [{ look: myLook, x: 0, facing: 1 as const, performance: 'idle' as const }], [myLook]);
  // The product on the 3D stage: what I wear of that section, else its first.
  const wornFor = (t: Tab) => {
    if (t === 'maps') return '';
    const id = productId(t, loadout[t as keyof Loadout]);
    return LISTS[t].some((s) => s.id === id) ? id : LISTS[t][0].id;
  };
  const [previewId, setPreviewId] = useState(() => sentTo?.id ?? wornFor(tab));
  const preview = productById(previewId) ?? LISTS.derp[0];
  // The part goes on my archer; everything else stays as I wear it.
  const previewLook = useMemo(() => lookFor(sanitizeLoadout({ ...loadout, [preview.kind]: preview.item })), [loadout, preview]);
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t !== 'maps') setPreviewId(wornFor(t));
  };
  // A purchase requested before the wallet was connected: sign in first, then
  // run it on the next render, when `wallet` reflects the connected account.
  const queued = useRef<{ skin: Product; cur: Currency } | null>(null);

  // "Yours." banner after a purchase; a new one restarts the timer.
  const toastSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const celebrate = (text: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  // ---- SOL / SKR purchases --------------------------------------------------------
  // On open: finish any payment whose confirmation was interrupted last time
  // (`pending` clears itself once the chain shows it), and, with a wallet
  // connected, pull back items this wallet bought on another install (its
  // "bonkbow:<item>" memos to the treasury).
  const walletAddress = wallet.account?.address;
  useEffect(() => {
    if (!SHOP_ENABLED) return;
    const unlocked = (ids: string[]) => {
      if (!ids.length) return;
      haptic.success();
      const names = ids.map((id) => [...SKINS, ...MAPS].find((s) => s.id === id)?.name ?? id);
      Alert.alert('Purchases restored', `${names.join(', ')} ${ids.length === 1 ? 'is' : 'are'} unlocked again.`);
    };
    restorePendingPurchase()
      .then((id) => unlocked(id ? [id] : []))
      .then(() => (walletAddress ? restorePurchasesFromChain(walletAddress) : []))
      .then(unlocked)
      .catch(() => {});
  }, [walletAddress]);

  const purchase = async (skin: Product, cur: Currency) => {
    if (!wallet.account) return; // guarded by callers
    const price = cur === 'SKR' ? skin.priceSkr : skin.priceLamports;
    setBuying(skin.id);
    try {
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
        posthog.capture('purchase_completed', { skin: skin.id, currency: cur });
        if (cur === 'SKR') skrBalance.refresh();
        celebrate(`${skin.name}: yours.${!isMap(skin) && skin.kind === 'hat' ? ' It does not help.' : ''}`);
      } else if (result.reason === 'cancelled') {
        haptic.tap();
      } else if (result.reason === 'verify-failed') {
        haptic.warning();
        Alert.alert(
          result.retryable ? 'Payment sent, unlock pending' : 'Payment sent, not accepted',
          result.retryable
            ? `The transfer went through but we couldn't confirm it yet. Reopen the shop in a moment and it will retry automatically.\n\n${result.detail ?? ''}`
            : `The transfer was sent but it doesn't pay the treasury the price of this item, so it won't be retried. Keep this signature:\n${result.signature ?? ''}\n\n${result.detail ?? ''}`,
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
    if (!q || !wallet.account) return;
    queued.current = null;
    Promise.resolve().then(() => purchase(q.skin, q.cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.account]);

  const onBuy = async (skin: Product, cur: Currency) => {
    if (buying || queued.current) return;
    if (!SHOP_ENABLED) {
      Alert.alert('Shop not configured', 'Set EXPO_PUBLIC_TREASURY_ADDRESS to enable purchases.');
      return;
    }
    if (wallet.account) {
      await purchase(skin, cur);
      return;
    }
    // No wallet yet: connect sheet first, then the effect above buys
    // (it takes over the spinner via `buying`).
    setBuying(skin.id);
    try {
      queued.current = { skin, cur };
      await signIn();
    } catch (e) {
      queued.current = null;
      setBuying(null);
      const msg = e instanceof Error ? e.message : String(e);
      if (!isUserRejection(msg)) Alert.alert('Wallet not connected', msg);
    }
  };
  // ---- end SOL / SKR purchases ----------------------------------------------------

  // Coin items: confirm, spend, put it on.
  const onBuyCoins = (item: Skin) => {
    if (coins < item.priceCoins) {
      haptic.warning();
      playSfx('ui_error');
      Alert.alert(
        'Not enough coins',
        `${item.name} costs ${item.priceCoins.toLocaleString()} coins. You need ${(item.priceCoins - coins).toLocaleString()} more.\n\nEvery match pays coins, and your first match each day pays a bonus.`,
      );
      return;
    }
    haptic.tap();
    Alert.alert(`Buy ${item.name}?`, `${item.priceCoins.toLocaleString()} coins. You'll have ${(coins - item.priceCoins).toLocaleString()} left.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Buy it',
        onPress: () => {
          if (!buyWithCoins(item.id)) return;
          equip(item.kind, item.item);
          haptic.kill();
          playSfx('coins');
          posthog.capture('coin_purchase', { skin: item.id, price: item.priceCoins });
          celebrate(`${item.name}: yours.`);
        },
      },
    ]);
  };

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

  // Everything but a derp comes off again, back to the slot's free default.
  const onTakeOff = (item: Skin) => {
    haptic.release();
    equip(item.kind, DEFAULT_LOADOUT[item.kind as keyof Loadout]);
  };

  const isOwned = (item: Product) => (isMap(item) ? isFreeMap(item) || owned.includes(item.id) : ownsProduct(item.id, owned, coinItems));
  const isWorn = (item: Product) => (isMap(item) ? equippedMap === item.id : loadout[item.kind as keyof Loadout] === item.item);

  // Equip / take off / buy, for a card.
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
          <Text style={[styles.ctaText, worn && styles.ctaGhostText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {removable ? 'Take off' : worn ? (map ? 'Playing here' : 'Equipped') : map ? 'Play here' : 'Equip'}
          </Text>
        </HapticTouchable>
      );
    }
    if (!map && isCoinSkin(item as Skin)) {
      const price = (item as Skin).priceCoins;
      const short = coins < price;
      return (
        <HapticTouchable style={[styles.cta, styles.ctaCoins, short && styles.ctaShort]} onPress={() => onBuyCoins(item as Skin)} sound={null}>
          <CoinIcon size={16} />
          <Text style={[styles.ctaText, styles.ctaCoinsText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {price.toLocaleString()}
          </Text>
        </HapticTouchable>
      );
    }
    const price = priceOf({ priceCoins: 0, priceLamports: item.priceLamports, priceSkr: item.priceSkr }, currency);
    const cur = price.kind === 'coins' ? 'SOL' : price.kind;
    const sellable = cur === 'SOL' ? item.priceLamports > 0 : SKR_ENABLED && item.priceSkr > 0;
    return (
      <HapticTouchable style={[styles.cta, !sellable && styles.ctaDisabled]} onPress={() => onBuy(item, cur)} disabled={!!buying || !sellable}>
        {buying === item.id ? (
          <ActivityIndicator color="#0B0B0F" />
        ) : (
          <Text style={styles.ctaText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {sellable ? price.label : 'Needs SKR'}
          </Text>
        )}
      </HapticTouchable>
    );
  };

  const data: Product[] = tab === 'maps' ? MAPS : LISTS[tab];
  // Wallet, currency and balance only matter where something is sold in SOL/SKR.
  const paidHere = data.some((p) => p.priceLamports > 0 || p.priceSkr > 0);
  const stageItem: Product = tab === 'maps' ? previewMap : preview;
  // The list column is what the 36% stage column leaves of the safe area;
  // fit as many columns of at least CARD_MIN as it holds (never fewer than 2).
  const gridW = ((width - insets.left - insets.right) * 0.64) / scale - GRID_PAD * 2;
  const cols = Math.max(2, Math.floor((gridW + GRID_GAP) / ((tab === 'maps' ? CARD_MIN.map : CARD_MIN.skin) + GRID_GAP)));
  // Cap each card at one column's width so a short last row doesn't stretch.
  const cardMax = s((gridW - GRID_GAP * (cols - 1)) / cols);

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
              <Text style={styles.stepText} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                {step}
              </Text>
            </View>
          )}
          {!isOwned(stageItem) && (
            <View style={[styles.stepChip, styles.lockChip, tab !== 'maps' && styles.lockChipRight]} pointerEvents="none">
              <Ionicons name="lock-closed" size={s(12)} color="#FFFFFF" />
              <Text style={styles.stepText} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                Locked
              </Text>
            </View>
          )}
          <Animated.View key={stageItem.id} entering={FadeInDown.duration(260)} style={styles.stageInfo} pointerEvents="none">
            <Text style={styles.stageName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {stageItem.name}
            </Text>
            <Text style={styles.stageDesc} numberOfLines={3}>
              {stageItem.description}
            </Text>
            {!isOwned(stageItem) &&
              (isMap(stageItem) ? (
                <Text style={styles.stagePrice} numberOfLines={1}>{priceOf({ priceCoins: 0, priceLamports: stageItem.priceLamports, priceSkr: stageItem.priceSkr }, currency).label}</Text>
              ) : (
                <PriceTag part={stageItem} currency={currency} style={styles.stageTag} />
              ))}
          </Animated.View>
        </View>
        <View style={styles.listCol}>
          <View style={styles.header}>
            <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back" style={styles.back}>
              <Ionicons name="chevron-back" size={s(24)} color="#FFFFFF" />
            </HapticTouchable>
            <Text style={styles.title} numberOfLines={1}>
              Shop
            </Text>
            <CoinPill coins={coins} />
            <Text style={styles.cluster} numberOfLines={1}>
              {CLUSTER.name}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
            {TABS.map((t) => (
              <HapticTouchable key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)} sound="ui_click">
                {t.icon}
                <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </HapticTouchable>
            ))}
          </ScrollView>

          <FlatList<Product>
            key={`${tab}-${cols}`}
            data={data}
            keyExtractor={(p) => p.id}
            numColumns={cols}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.grid}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <Text style={styles.tabBlurb}>{BLURB[tab]}</Text>
                {paidHere && SKR_ENABLED && (
                  <View style={styles.segment}>
                    {(['SKR', 'SOL'] as Currency[]).map((c) => (
                      <HapticTouchable
                        key={c}
                        style={[styles.segmentItem, currency === c && styles.segmentActive]}
                        onPress={() => setPreferredCurrency(c)}
                      >
                        <Text style={[styles.segmentText, currency === c && styles.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          Pay in {c}
                        </Text>
                      </HapticTouchable>
                    ))}
                  </View>
                )}
                {paidHere ? (
                  <View style={styles.balanceRow}>
                    <Ionicons name="wallet-outline" size={s(15)} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.hint}>
                      {!wallet.account
                        ? 'Paid from your wallet. Connect it when you buy.'
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
                ) : (
                  <View style={styles.balanceRow}>
                    <CoinIcon size={14} />
                    <Text style={styles.hint}>Earned in every match. Your first match each day pays a bonus.</Text>
                  </View>
                )}
                {pending && paidHere && (
                  <Text style={styles.hint}>A payment is waiting for confirmation. It retries each time you open the shop.</Text>
                )}
              </View>
            }
            renderItem={({ item, index }) => {
              const map = isMap(item) ? item : null;
              const skin = map ? null : (item as Skin);
              const isPreview = map ? item.id === mapId : item.id === previewId;
              return (
                <Animated.View entering={FadeInDown.delay(Math.min(index, 9) * 35).duration(260)} style={[styles.cardWrap, { maxWidth: cardMax }]}>
                  <HapticTouchable
                    style={[styles.card, isWorn(item) && styles.cardEquipped, isPreview && styles.cardPreview]}
                    onPress={() => (map ? setMapId(item.id) : setPreviewId(item.id))}
                    sound="ui_click"
                  >
                    {map ? (
                      <View style={[styles.mapSwatch, { backgroundColor: map.color }]}>
                        <Ionicons name={MAP_ICONS[map.id] ?? 'map'} size={s(22)} color="#0B0B0F" />
                        {!isOwned(item) && (
                          <View style={styles.mapLock}>
                            <Ionicons name="lock-closed" size={s(12)} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                    ) : (
                      skin && (
                        <View style={styles.thumbRow}>
                          <PartThumb part={skin} derp={loadout.derp} size={48} />
                          {skin.id === 'bow_shovel' && (
                            <Text style={styles.kicker} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                              BY REQUEST
                            </Text>
                          )}
                          {isWorn(item) && <Ionicons name="checkmark-circle" size={s(18)} color="#7CC23A" style={styles.wornTick} />}
                        </View>
                      )
                    )}
                    <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {item.name}
                    </Text>
                    {action(item)}
                  </HapticTouchable>
                </Animated.View>
              );
            }}
          />
          {toast && (
            <Animated.View key={toast.id} entering={ZoomIn.duration(220)} exiting={FadeOut.duration(250)} style={styles.toast} pointerEvents="none">
              <Ionicons name="sparkles" size={s(18)} color="#FFD23F" />
              <Text style={styles.toastText} numberOfLines={2}>
                {toast.text}
              </Text>
            </Animated.View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const textShadow = { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };

const useStyles = makeStyles((m) => ({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  body: { flex: 1, flexDirection: 'row' },
  stageCol: { width: '36%', padding: m.s(12), paddingRight: 0 },
  stage: { flex: 1, borderRadius: m.s(20) },
  clip: { overflow: 'hidden' },
  lockChip: { flexDirection: 'row', alignItems: 'center', gap: m.s(4) },
  lockChipRight: { top: m.s(52) }, // under the reel's step chip
  mapSwatch: { height: m.s(48), borderRadius: m.s(14), alignItems: 'center', justifyContent: 'center', marginBottom: m.s(2) },
  mapLock: { position: 'absolute', top: m.s(6), right: m.s(6), backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: m.s(9), padding: m.s(3) },
  stageInfo: { position: 'absolute', left: m.s(28), right: m.s(16), bottom: m.s(26), gap: m.s(2) },
  stepChip: { position: 'absolute', top: m.s(22), left: m.s(24), backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: m.s(10), paddingHorizontal: m.s(10), paddingVertical: m.s(4) },
  stepText: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(12), letterSpacing: m.s(0.6), textTransform: 'uppercase' },
  stageName: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(24), ...textShadow, textShadowOffset: { width: 0, height: m.s(2) } },
  stageDesc: { fontFamily: FONT.medium, color: 'rgba(255,255,255,0.88)', fontSize: m.s(12), lineHeight: m.s(16), ...textShadow },
  stageTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: m.s(8), paddingHorizontal: m.s(8), paddingVertical: m.s(3), marginTop: m.s(4) },
  stagePrice: { fontFamily: FONT.bold, fontSize: m.s(13), color: '#D9C6FF', marginTop: m.s(4), ...textShadow },
  listCol: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: m.s(10), paddingHorizontal: m.s(16), paddingTop: m.s(8), paddingBottom: m.s(4) },
  back: { width: m.s(36), height: m.s(36), borderRadius: m.s(18), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  title: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(24), flex: 1 },
  cluster: { flexShrink: 1, fontFamily: FONT.semi, color: 'rgba(255,255,255,0.45)', fontSize: m.s(11), textTransform: 'uppercase', letterSpacing: m.s(1) },
  tabsScroll: { flexGrow: 0, flexShrink: 0 },
  tabs: { gap: m.s(6), paddingHorizontal: m.s(16), paddingVertical: m.s(6) },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(5),
    paddingHorizontal: m.s(12),
    paddingVertical: m.s(6),
    borderRadius: m.s(10),
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tabActive: { backgroundColor: '#8E6CEF', borderColor: '#F7C948' },
  tabText: { fontFamily: FONT.bold, color: 'rgba(255,255,255,0.75)', fontSize: m.s(13) },
  tabTextActive: { color: '#FFFFFF' },
  headerBlock: { gap: m.s(8), marginBottom: m.s(10) },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: m.s(12), padding: m.s(4) },
  segmentItem: { flex: 1, paddingVertical: m.s(8), borderRadius: m.s(9), alignItems: 'center' },
  segmentActive: { backgroundColor: COLORS.arrow },
  segmentText: { fontFamily: FONT.bold, color: 'rgba(255,255,255,0.7)', fontSize: m.s(13) },
  segmentTextActive: { color: '#0B0B0F' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(8) },
  hint: { flex: 1, fontFamily: FONT.medium, color: 'rgba(255,255,255,0.6)', fontSize: m.s(12), lineHeight: m.s(16) },
  tabBlurb: { fontFamily: FONT.semi, color: 'rgba(255,255,255,0.85)', fontSize: m.s(14) },
  grid: { paddingHorizontal: m.s(GRID_PAD), paddingTop: m.s(4), gap: m.s(GRID_GAP), paddingBottom: m.s(24) },
  gridRow: { gap: m.s(GRID_GAP) },
  cardWrap: { flex: 1 },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: m.s(16),
    padding: m.s(10),
    gap: m.s(4),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardEquipped: { borderColor: COLORS.arrow },
  cardPreview: { backgroundColor: 'rgba(255,255,255,0.15)' },
  thumbRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: m.s(2) },
  wornTick: { marginLeft: 'auto' },
  kicker: { flexShrink: 1, fontFamily: FONT.bold, color: '#FFD23F', fontSize: m.s(9), letterSpacing: m.s(1), marginLeft: m.s(6), marginTop: m.s(2) },
  name: { fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(15) },
  cta: {
    flexDirection: 'row',
    gap: m.s(5),
    justifyContent: 'center',
    backgroundColor: COLORS.arrow,
    borderRadius: m.s(11),
    paddingVertical: m.s(8),
    alignItems: 'center',
    marginTop: m.s(2),
    borderBottomWidth: 3,
    borderBottomColor: '#B86B2E',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { flexShrink: 1, fontFamily: FONT.bold, color: '#0B0B0F', fontSize: m.s(14) },
  ctaCoins: { backgroundColor: '#2A2440', borderBottomColor: '#15122A', borderWidth: 1.5, borderColor: 'rgba(255,200,61,0.6)' },
  ctaCoinsText: { color: '#FFC83D' },
  ctaShort: { opacity: 0.55 },
  ctaGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.35)' },
  ctaGhostText: { color: 'rgba(255,255,255,0.75)' },
  toast: {
    position: 'absolute',
    top: m.s(56),
    alignSelf: 'center',
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(8),
    backgroundColor: '#1B1A33',
    borderRadius: m.s(14),
    borderWidth: 2.5,
    borderColor: '#F7C948',
    paddingHorizontal: m.s(16),
    paddingVertical: m.s(8),
  },
  toastText: { flexShrink: 1, fontFamily: FONT.bold, color: '#FFFFFF', fontSize: m.s(15) },
}));
