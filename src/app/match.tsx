import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Stage, type Actor } from '@/game3d/Stage';
import { arenaTheme } from '@/game3d/themes';
import { randomSeed } from '@/game/maps';
import { layoutFor } from '@/game3d/world';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { lookFor, randomLoadout, type Loadout } from '@/game/cosmetics';
import { mulberry32 } from '@/game/rng';
import { useGameStore, levelOf } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { FONT, GameButton, TIPS } from '@/ui/kit';
import { formatSol } from '@/game/skins';
import { DUEL_FEE_ENABLED, DUEL_FEE_LAMPORTS, shortAddress } from '@/solana/config';
import { isUserRejection, useWalletAuth } from '@/solana/auth';
import { duelCreditStatus, payDuelFee, spendDuelCredit } from '@/solana/payments';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Matchmaking / VS screen: you on the left, a VS badge in the middle, and an
// opponent slot that searches, then reveals the AI rival dropping into the
// colosseum. Picks the duel's seed (and so its map) and hands everything to
// /game.
//
// Every duel has an entry fee in SOL, paid from the player's wallet to the
// treasury through Mobile Wallet Adapter before the search starts. A fee
// already paid but not yet played (app killed, slow confirmation) is a
// credit the next duel uses instead of charging again (payments.ts).

const RIVAL_NAMES = [
  'ShadowQuiver',
  'Hedgehog in Sneakers',
  'BowBandit',
  'Ctg',
  'NockNorris',
  'Robin Hoodie',
  'ArrowDynamic',
  'Legolasagna',
  'StringTheory',
  'Feather Fury',
  'HeadshotHank',
  'Twang',
];

export default function MatchScreen() {
  const styles = useStyles();
  useScreenMusic('menu');
  const loadout = useGameStore((s) => s.loadout);
  const xp = useGameStore((s) => s.xp);
  const playerName = useGameStore((s) => s.playerName);
  const me = useMemo(() => lookFor(loadout), [loadout]);

  // Everything about the match is decided up front from one seed.
  const [match] = useState(() => {
    // The duel happens on my chosen map.
    const seed = randomSeed(useGameStore.getState().equippedMap);
    const rnd = mulberry32(seed ^ 0xa11ce);
    const rivalLoadout: Loadout = randomLoadout(rnd);
    return {
      seed,
      rivalLoadout,
      rivalName: RIVAL_NAMES[Math.floor(rnd() * RIVAL_NAMES.length)],
      rivalLevel: Math.max(1, levelOf(xp).level + Math.floor(rnd() * 5) - 2),
      searchMs: 1700 + rnd() * 1500,
      tip: TIPS[Math.floor(rnd() * TIPS.length)],
    };
  });
  const rival = useMemo(() => lookFor(match.rivalLoadout), [match]);
  const arena = arenaTheme(match.seed, layoutFor(match.seed, 0).theme);
  const [found, setFound] = useState(false);

  // ---- entry fee -------------------------------------------------------------------
  // checking: looking for an unused paid entry · fee: waiting for the player
  // to pay · paying: wallet sheet / confirmation · search: paid, matchmaking.
  const [phase, setPhase] = useState<'checking' | 'fee' | 'paying' | 'search'>(DUEL_FEE_ENABLED ? 'checking' : 'search');
  // A payment that went out but isn't confirmed yet: the button re-checks it
  // instead of charging again.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const wallet = useMobileWallet();
  const { signIn } = useWalletAuth();
  const queued = useRef(false);

  const checkCredit = useCallback(async () => {
    const status = await duelCreditStatus();
    if (status === 'ready') {
      setUnconfirmed(false);
      setPhase('search');
      return;
    }
    setUnconfirmed(status === 'pending');
    setNote(status === 'pending' ? 'Your last entry fee is still confirming. Check again in a moment.' : null);
    setPhase('fee');
  }, []);

  useEffect(() => {
    // Deferred so no state is set synchronously in the effect.
    if (phase === 'checking') Promise.resolve().then(checkCredit);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = useCallback(async () => {
    if (!wallet.account) return;
    setPhase('paying');
    setNote(null);
    const result = await payDuelFee({ address: wallet.account.address, sendTransactions: wallet.sendTransactions });
    if (result.ok) {
      haptic.success();
      playSfx('coins');
      setPhase('search');
      return;
    }
    haptic.warning();
    setPhase('fee');
    if (result.reason === 'cancelled') setNote(null);
    else if (result.reason === 'verify-failed' && result.retryable) {
      setUnconfirmed(true);
      setNote("Payment sent, but it isn't confirmed yet. Check again in a moment. You won't be charged twice.");
    } else if (result.reason === 'verify-failed') setNote(`Payment not accepted: ${result.detail ?? 'unknown error'}`);
    else setNote(result.detail ?? 'The payment did not go through.');
  }, [wallet.account, wallet.sendTransactions]);

  // Pays once a connect started from the button has gone through and this
  // render sees the account (the kit's send closes over the selected account).
  useEffect(() => {
    if (!queued.current || !wallet.account) return;
    queued.current = false;
    Promise.resolve().then(pay);
  }, [wallet.account, pay]);

  const onPay = async () => {
    if (phase !== 'fee') return;
    if (unconfirmed) {
      setPhase('paying');
      await checkCredit();
      return;
    }
    if (wallet.account) return pay();
    queued.current = true;
    try {
      await signIn();
    } catch (e) {
      queued.current = false;
      const msg = e instanceof Error ? e.message : String(e);
      if (!isUserRejection(msg)) setNote('Connect a Solana wallet (Phantom, Solflare or Seed Vault) to pay the entry fee.');
    }
  };

  // ---- search → duel -----------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'search') return;
    playSfx('search_loop');
    const loop = setInterval(() => playSfx('search_loop'), 1600);
    const t1 = setTimeout(() => {
      clearInterval(loop);
      setFound(true);
      playSfx('match_found');
      haptic.matchFound();
      setTimeout(() => playSfx('vs_slam'), 250);
    }, match.searchMs);
    const t2 = setTimeout(() => {
      const q = new URLSearchParams({
        seed: String(match.seed),
        rivalDerp: match.rivalLoadout.derp,
        rivalHat: match.rivalLoadout.hat,
        rivalBow: match.rivalLoadout.bow,
        rivalOutfit: match.rivalLoadout.outfit,
        rivalArrow: match.rivalLoadout.arrow,
        rivalName: match.rivalName,
      });
      // The paid entry is used by this duel.
      spendDuelCredit();
      router.replace(`/game?${q.toString()}`);
    }, match.searchMs + 2600);
    return () => {
      clearInterval(loop);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [match, phase]);

  const actors = useMemo<Actor[]>(
    () => [
      { look: me, x: -1.5, facing: 1, performance: 'ready' },
      { look: rival, x: 1.5, facing: -1, performance: found ? 'dropIn' : 'idle', hidden: !found },
    ],
    [me, rival, found],
  );

  return (
    <View style={styles.root}>
      <Stage theme="colosseum" camera={{ x: 0, y: 1.9, z: 5.4, lookX: 0, lookY: 1.35, fov: 38, drift: 0.15 }} actors={actors} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <Animated.View entering={FadeInDown.duration(400)} style={[styles.plate, styles.plateLeft]}>
        <Text style={styles.plateName} numberOfLines={1}>
          {playerName || 'You'}
        </Text>
        <Text style={styles.plateLevel} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
          Lv {levelOf(xp).level}
        </Text>
      </Animated.View>

      {found ? (
        <Animated.View entering={FadeInRight.duration(350)} style={[styles.plate, styles.plateRight]}>
          <Text style={styles.plateName} numberOfLines={1}>
            {match.rivalName}
          </Text>
          <Text style={styles.plateLevel} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
            Lv {match.rivalLevel}
          </Text>
        </Animated.View>
      ) : (
        phase === 'search' && (
          <View style={styles.searching}>
            <PaperPlaneSpinner />
            <Text style={styles.searchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              Searching for an opponent
            </Text>
          </View>
        )
      )}

      {phase === 'search' && <VsBadge slammed={found} />}

      {found && (
        <Animated.View entering={FadeIn.delay(500).duration(400)} style={styles.arenaTag}>
          <Text style={styles.arenaLabel}>ARENA</Text>
          <Text style={styles.arenaName} numberOfLines={1}>
            {arena.name}
          </Text>
        </Animated.View>
      )}

      {/* Fee card above the tip in one column so they can't collide: on a short
          phone or with a large font the card's text scrolls, the Pay and Back
          buttons stay on screen. */}
      <View style={styles.lower} pointerEvents="box-none">
        <View style={styles.feeArea} pointerEvents="box-none">
          {!found && phase !== 'search' && (
            <Animated.View entering={FadeIn.duration(250)} style={styles.feeCard}>
              <ScrollView style={styles.feeScroll} contentContainerStyle={styles.feeInfo} showsVerticalScrollIndicator={false} bounces={false}>
                <Text style={styles.feeLabel}>ENTRY FEE</Text>
                <Text style={styles.feeAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatSol(DUEL_FEE_LAMPORTS)}
                </Text>
                <Text style={styles.feeSub}>
                  {wallet.account ? `From ${shortAddress(wallet.account.address)} to the Bonk Bow treasury` : 'Paid from your Solana wallet'}
                </Text>
                {phase !== 'fee' && (
                  <View style={styles.feeBusy}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.feeSub}>{phase === 'checking' ? 'Checking your wallet…' : 'Confirm in your wallet…'}</Text>
                  </View>
                )}
                {!!note && <Text style={styles.feeNote}>{note}</Text>}
              </ScrollView>
              {phase === 'fee' && (
                <>
                  <GameButton
                    label={unconfirmed ? 'Check payment' : wallet.account ? `Pay ${formatSol(DUEL_FEE_LAMPORTS)} & fight` : 'Connect wallet & pay'}
                    color="green"
                    onPress={onPay}
                    style={styles.feeBtn}
                  />
                  <GameButton label="Back" color="red" small onPress={() => router.back()} style={styles.feeBack} sound="ui_back" />
                </>
              )}
            </Animated.View>
          )}
        </View>
        <Text style={styles.tip}>{match.tip}</Text>
      </View>
    </View>
  );
}

// "VS" coin: idles with a gentle pulse, then slams in bigger when matched.
function VsBadge({ slammed }: { slammed: boolean }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const pulse = useSharedValue(1);
  const slam = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 600 }), withTiming(1, { duration: 600 })), -1);
  }, [pulse]);
  useEffect(() => {
    if (slammed) slam.value = withSequence(withTiming(1.9, { duration: 120 }), withTiming(1.25, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [slammed, slam]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value * slam.value }] }));
  return (
    <Animated.View entering={ZoomIn.duration(240)} style={[styles.vs, style]}>
      <Svg width={s(74)} height={s(74)} viewBox="0 0 74 74" style={StyleSheet.absoluteFill}>
        <Circle cx={37} cy={37} r={34} fill="#F7A21B" stroke="#B85C00" strokeWidth={4} />
        <Circle cx={37} cy={37} r={27} fill="#FFC23D" stroke="#FFE08A" strokeWidth={2} />
      </Svg>
      <Text style={styles.vsText} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
        VS
      </Text>
    </Animated.View>
  );
}

// Folded paper-plane arrowhead circling inside a two-tone ring.
function PaperPlaneSpinner() {
  const styles = useStyles();
  const { s } = useMetrics();
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.linear }), -1);
  }, [spin]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={styles.spinner}>
      <Animated.View style={[StyleSheet.absoluteFill, ring]}>
        <Svg width={s(84)} height={s(84)} viewBox="0 0 84 84">
          <Circle cx={42} cy={42} r={34} stroke="rgba(255,255,255,0.4)" strokeWidth={5} fill="none" />
          <Path d="M42 8 A34 34 0 0 1 76 42" stroke="#FF9F1C" strokeWidth={5} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={s(40)} height={s(40)} viewBox="0 0 44 44">
        <Path d="M6 30 L34 6 L30 34 L20 26 Z" fill="#F2F2F2" />
        <Path d="M6 30 L20 26 L30 34 Z" fill="#BDBDBD" />
      </Svg>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.75)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 4,
};

const useStyles = makeStyles((m) => ({
  root: { flex: 1, backgroundColor: '#000000' },
  plate: {
    position: 'absolute',
    top: m.s(18),
    backgroundColor: '#0B0B0F',
    borderRadius: m.s(12),
    paddingHorizontal: m.s(18),
    paddingVertical: m.s(6),
    minWidth: m.s(180),
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(10),
  },
  plateLeft: { left: m.s(20) },
  plateRight: { right: m.s(20), justifyContent: 'flex-end' },
  plateName: { flexShrink: 1, fontFamily: FONT.bold, fontSize: m.s(20), color: '#FFFFFF', maxWidth: m.s(220) },
  plateLevel: { flexShrink: 0, fontFamily: FONT.semi, fontSize: m.s(13), color: '#F7C948' },
  searching: { position: 'absolute', right: '12%', top: '30%', maxWidth: '40%', alignItems: 'center', gap: m.s(10) },
  searchText: { fontFamily: FONT.bold, fontSize: m.s(19), color: '#FFFFFF', ...shadow },
  spinner: { width: m.s(84), height: m.s(84), alignItems: 'center', justifyContent: 'center' },
  vs: { position: 'absolute', alignSelf: 'center', top: '38%', width: m.s(74), height: m.s(74), alignItems: 'center', justifyContent: 'center' },
  vsText: { fontFamily: FONT.bold, fontSize: m.s(28), color: '#FFFFFF', ...shadow, textShadowColor: '#9A4A00' },
  arenaTag: { position: 'absolute', alignSelf: 'center', top: '62%', maxWidth: '60%', alignItems: 'center' },
  arenaLabel: { fontFamily: FONT.semi, fontSize: m.s(11), letterSpacing: m.s(3), color: 'rgba(255,255,255,0.75)', ...shadow },
  arenaName: { fontFamily: FONT.bold, fontSize: m.s(22), color: '#FFFFFF', ...shadow },
  // Fills the screen below the name plates; the tip sits at its bottom.
  lower: { position: 'absolute', top: m.s(64), left: 0, right: 0, bottom: m.s(14) },
  feeArea: { flex: 1, minHeight: 0, alignItems: 'flex-end', paddingRight: '6%' },
  feeCard: {
    width: m.s(300),
    maxWidth: '100%',
    flexShrink: 1,
    minHeight: 0,
    alignItems: 'center',
    gap: m.s(6),
    padding: m.s(18),
    borderRadius: m.s(18),
    backgroundColor: 'rgba(11,11,15,0.88)',
  },
  feeScroll: { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' },
  feeInfo: { alignItems: 'center', gap: m.s(6) },
  feeLabel: { fontFamily: FONT.semi, fontSize: m.s(11), letterSpacing: m.s(3), color: 'rgba(255,255,255,0.7)' },
  feeAmount: { fontFamily: FONT.bold, fontSize: m.s(30), color: '#FFFFFF' },
  feeSub: { fontFamily: FONT.semi, fontSize: m.s(13), color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  feeBtn: { alignSelf: 'stretch', marginTop: m.s(8) },
  feeBusy: { alignItems: 'center', gap: m.s(6), marginTop: m.s(8) },
  feeNote: { fontFamily: FONT.semi, fontSize: m.s(12), color: '#F7C948', textAlign: 'center' },
  feeBack: { marginTop: m.s(4) },
  tip: {
    marginTop: m.s(6),
    marginHorizontal: m.s(60),
    textAlign: 'center',
    fontFamily: FONT.semi,
    fontSize: m.s(14),
    color: '#FFFFFF',
    ...shadow,
  },
}));
