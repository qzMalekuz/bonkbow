import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path } from '@shopify/react-native-skia';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { usePostHog } from 'posthog-react-native';
import { HapticTouchable } from '@/components/haptic-touchable';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { playSfx } from '@/audio/sound';
import { COLORS, STICKMAN } from '@/game/constants';
import { haptic } from '@/game/haptics';
import { SKINS, formatSol, isFreeSkin, type Currency, type Skin } from '@/game/skins';
import { bowPath, bowStringPath, hatPath, stickmanPath } from '@/game/stickman';
import { useGameStore } from '@/game/store';
import { sessionWalletAddress, useWalletAuth } from '@/solana/auth';
import { CLUSTER, SHOP_ENABLED, SKR_ENABLED } from '@/solana/config';
import { buySkin, restorePendingPurchase } from '@/solana/payments';
import { formatSkr, useSkrBalance } from '@/solana/skr';
import { isSupabaseConfigured } from '@/utils/supabase';

// In-game shop. Skins are paid in SOL or SKR through the connected wallet
// (MWA signs and sends a transfer to the treasury); ownership is granted
// server-side after on-chain verification. Prices are placeholders — skins.ts.
export default function ShopScreen() {
  useScreenMusic('shop');
  const wallet = useMobileWallet();
  const { session, signIn, signingIn, refreshOwnedSkins } = useWalletAuth();
  const posthog = usePostHog();
  const owned = useGameStore((s) => s.ownedSkins);
  const equipped = useGameStore((s) => s.equippedSkin);
  const equipSkin = useGameStore((s) => s.equipSkin);
  const addOwnedSkin = useGameStore((s) => s.addOwnedSkin);
  const pending = useGameStore((s) => s.pendingPurchase);
  const preferred = useGameStore((s) => s.preferredCurrency);
  const setPreferredCurrency = useGameStore((s) => s.setPreferredCurrency);
  const currency: Currency = SKR_ENABLED ? preferred : 'SOL';
  const skrBalance = useSkrBalance();
  const [buying, setBuying] = useState<string | null>(null);
  // A purchase requested before the wallet was connected: sign in first, then
  // run it on the next render, when `wallet` reflects the connected account.
  const queued = useRef<{ skin: Skin; cur: Currency } | null>(null);

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
          Alert.alert('Purchase restored', `${SKINS.find((s) => s.id === id)?.name ?? 'Skin'} is now unlocked.`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const onEquip = (skin: Skin) => {
    haptic.release();
    equipSkin(skin.id);
    posthog.capture('skin_equipped', { skin: skin.id });
  };

  const purchase = async (skin: Skin, cur: Currency) => {
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
          `This skin costs ${formatSkr(price)} and your wallet holds ${formatSkr(skrBalance.baseUnits)}.` +
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
        equipSkin(skin.id);
        haptic.kill();
        playSfx('coins');
        posthog.capture('purchase_completed', { skin: skin.id, currency: cur, signature: result.signature });
        if (cur === 'SKR') skrBalance.refresh();
        Alert.alert('Yours!', `${skin.name} unlocked and equipped.`);
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

  const onBuy = async (skin: Skin, cur: Currency) => {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </HapticTouchable>
        <Text style={styles.title}>Shop</Text>
        <Text style={styles.cluster}>{CLUSTER.name}</Text>
      </View>

      <FlatList
        data={SKINS}
        keyExtractor={(s) => s.id}
        numColumns={2}
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
                  ? 'Skins stay tied to your wallet. Sign in when you buy.'
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
            {SKR_ENABLED && currency === 'SKR' && (
              <Text style={styles.hint}>SKR prices run ~20% under SOL, and the Seeker skin is SKR-only.</Text>
            )}
            {pending && session && (
              <Text style={styles.hint}>A payment is waiting for confirmation. It retries each time you open the shop.</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isOwned = owned.includes(item.id) || isFreeSkin(item);
          const isEquipped = equipped === item.id;
          // A skin not sold in the selected currency falls back to the other.
          const cur: Currency =
            currency === 'SKR' ? (item.priceSkr > 0 ? 'SKR' : 'SOL') : item.priceLamports > 0 ? 'SOL' : 'SKR';
          const label = cur === 'SKR' ? formatSkr(item.priceSkr) : formatSol(item.priceLamports);
          const sellable = cur === 'SOL' ? item.priceLamports > 0 : SKR_ENABLED && item.priceSkr > 0;
          return (
            <View style={[styles.card, isEquipped && styles.cardEquipped]}>
              {item.priceLamports === 0 && item.priceSkr > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>SKR ONLY</Text>
                </View>
              )}
              <SkinPreview skin={item} />
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
              {isOwned ? (
                <HapticTouchable
                  style={[styles.cta, isEquipped && styles.ctaGhost]}
                  onPress={() => onEquip(item)}
                  disabled={isEquipped}
                >
                  <Text style={[styles.ctaText, isEquipped && styles.ctaGhostText]}>{isEquipped ? 'Equipped' : 'Equip'}</Text>
                </HapticTouchable>
              ) : (
                <HapticTouchable
                  style={[styles.cta, !sellable && styles.ctaDisabled]}
                  onPress={() => onBuy(item, cur)}
                  disabled={!!buying || !sellable}
                >
                  {buying === item.id ? (
                    <ActivityIndicator color="#0B0B0F" />
                  ) : (
                    <Text style={styles.ctaText}>{sellable ? label : 'Needs SKR'}</Text>
                  )}
                </HapticTouchable>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

// Static Skia preview of the skin. The path builders are worklets but run fine
// on the JS thread too.
function SkinPreview({ skin }: { skin: Skin }) {
  const size = 120;
  const pose = useMemo(
    () => ({ x: size / 2, y: size - 14, facing: 1 as const, armAngle: -0.5, fall: 0, hat: skin.hat, draw: 0.6, breathe: 0 }),
    [skin.hat],
  );
  const body = useMemo(() => stickmanPath(pose), [pose]);
  const hat = useMemo(() => hatPath(pose), [pose]);
  const bow = useMemo(() => bowPath(pose), [pose]);
  const string = useMemo(() => bowStringPath(pose), [pose]);
  return (
    <Canvas style={{ width: size, height: size, alignSelf: 'center' }}>
      <Path path={bow} color={skin.bow} style="stroke" strokeWidth={3} strokeCap="round" />
      <Path path={string} color="rgba(255,255,255,0.75)" style="stroke" strokeWidth={1} />
      <Path path={body} color={skin.body} style="stroke" strokeWidth={STICKMAN.lineWidth} strokeCap="round" strokeJoin="round" />
      <Path path={hat} color={skin.accent} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.skyTop },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
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
  grid: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardEquipped: { borderColor: COLORS.arrow },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#14F195',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  badgeText: { color: '#0B0B0F', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  desc: { color: 'rgba(255,255,255,0.55)', fontSize: 12, minHeight: 32 },
  cta: { backgroundColor: COLORS.arrow, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#0B0B0F', fontWeight: '800', fontSize: 14 },
  ctaGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  ctaGhostText: { color: 'rgba(255,255,255,0.7)' },
});
