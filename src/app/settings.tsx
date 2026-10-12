import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { useWalletAuth } from '@/solana/auth';
import { HapticTouchable } from '@/components/haptic-touchable';
import { checkForUpdateAndReload } from '@/hooks/useOTAUpdates';
import { levelOf, useGameStore } from '@/game/store';
import { haptic } from '@/game/haptics';
import { playSfx } from '@/audio/sound';
import { useScreenMusic } from '@/audio/useScreenMusic';
import { CLUSTER, SHOP_ENABLED, shortAddress } from '@/solana/config';
import { restorePurchasesFromChain } from '@/solana/payments';
import { clearBestRuns } from '@/utils/scores';
import { LEGAL_URLS, SUPPORT_URL } from '@/utils/legal';
import { CoinPill, FONT } from '@/ui/kit';
import { NameModal } from '@/ui/NameModal';
import { Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Settings in the game's own look: chunky dark cards with a darker bottom
// edge, coloured icon tiles, the Fredoka font and a springy ON/OFF switch.
// Left: your profile (name, level, record) and wallet. Right: sound and
// feel, then the about links.

export default function SettingsScreen() {
  const styles = useStyles();
  const metrics = useMetrics();
  useScreenMusic('menu');
  const { address, signOut } = useWalletAuth();
  const s = useGameStore();
  const lvl = levelOf(s.xp);
  const [naming, setNaming] = useState(false);

  // Guarded opener: mailto/http can throw if no handler is configured.
  const openUrl = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Unavailable', "Couldn't open that link on this device.");
    } catch {
      Alert.alert('Unavailable', "Couldn't open that link on this device.");
    }
  };

  // Each toggle demos itself as it turns on.
  const toggleSound = (on: boolean) => {
    s.setSound(on);
    if (on) playSfx('ui_toggle'); // store is updated first, so this is audible
  };
  const toggleMusic = (on: boolean) => {
    s.setMusic(on);
    playSfx('ui_toggle');
  };
  const toggleHaptics = (on: boolean) => {
    s.setHaptics(on);
    playSfx('ui_toggle');
    if (on) haptic.release();
  };
  const toggleVibration = (on: boolean) => {
    s.setVibration(on);
    playSfx('ui_toggle');
    if (on) haptic.takeHit();
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1F3B12', '#141428', '#3A1458']} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.top}>
          <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back" style={styles.back}>
            <Ionicons name="chevron-back" size={metrics.s(24)} color="#FFFFFF" />
          </HapticTouchable>
          <Animated.View entering={ZoomIn.duration(240)} style={styles.titleWrap}>
            <LinearGradient colors={['#6FBF3A', '#7E57E6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleBar}>
              <Text style={styles.title} numberOfLines={1}>
                Settings
              </Text>
            </LinearGradient>
          </Animated.View>
          <CoinPill coins={s.coins} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.cols}>
            <View style={styles.col}>
              <Card title="Profile" color="#8E6CEF" icon="person" delay={60}>
                <View style={styles.profile}>
                  <View style={styles.lvl}>
                    <Text style={styles.lvlText} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                      {lvl.level}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <HapticTouchable style={styles.nameRow} onPress={() => setNaming(true)} sound="ui_open">
                      <Text style={styles.name} numberOfLines={1}>
                        {s.playerName || 'Pick a name'}
                      </Text>
                      <View style={styles.editChip}>
                        <Ionicons name="pencil" size={metrics.s(12)} color="#0B0B0F" />
                        <Text style={styles.editText} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
                          Edit
                        </Text>
                      </View>
                    </HapticTouchable>
                    <XpBar into={lvl.into} need={lvl.need} />
                    <Text style={styles.xpText}>
                      Level {lvl.level} · {lvl.into}/{lvl.need} XP to level {lvl.level + 1}
                    </Text>
                  </View>
                </View>
                <View style={styles.stats}>
                  <Stat label="Duels" value={s.gamesPlayed} />
                  <Stat label="Best run" value={s.highScore} />
                  <Stat label="Streak" value={`${s.streak}d`} />
                  <Stat label="Coins" value={s.coins.toLocaleString()} />
                </View>
              </Card>

              <Card title={`Wallet · ${CLUSTER.name}`} color="#3FA4F0" icon="wallet" delay={140}>
                {address ? (
                  <Row
                    icon="log-out-outline"
                    tile="#3FA4F0"
                    label="Disconnect"
                    hint={shortAddress(address)}
                    onPress={async () => {
                      await signOut().catch(() => {});
                      haptic.tap();
                      router.replace('/');
                    }}
                  />
                ) : (
                  <Text style={styles.empty}>No wallet connected. Connect one from the home screen when you shop.</Text>
                )}
                {address && SHOP_ENABLED && (
                  <Row
                    icon="refresh"
                    tile="#7CC23A"
                    label="Restore purchases"
                    hint="Items this wallet paid for"
                    onPress={async () => {
                      haptic.tap();
                      try {
                        const found = await restorePurchasesFromChain(address);
                        Alert.alert('Restore purchases', found.length ? `Unlocked ${found.length} item${found.length === 1 ? '' : 's'} again.` : 'Everything this wallet bought is already unlocked.');
                      } catch (e) {
                        Alert.alert('Restore failed', e instanceof Error ? e.message : String(e));
                      }
                    }}
                  />
                )}
                <Row
                  icon="trash-outline"
                  tile="#E5484D"
                  label="Reset local data"
                  hint="Progress, coins, items, settings"
                  onPress={() =>
                    Alert.alert(
                      'Reset local data?',
                      'Everything Bonk Bow keeps on this phone goes: level, coins, coin items, best runs and settings. Items paid in SOL or SKR come back with "Restore purchases" from the same wallet.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Reset',
                          style: 'destructive',
                          onPress: async () => {
                            await clearBestRuns();
                            useGameStore.setState(useGameStore.getInitialState(), true);
                            haptic.warning();
                            router.replace('/');
                          },
                        },
                      ],
                    )
                  }
                />
              </Card>
            </View>

            <View style={styles.col}>
              <Card title="Sound & feel" color="#7CC23A" icon="musical-notes" delay={100}>
                <ToggleRow icon="volume-high" tile="#FFB020" label="Sound effects" hint="Bow, hits, buttons" value={s.soundEnabled} onChange={toggleSound} />
                <ToggleRow icon="musical-notes" tile="#E05A9C" label="Music" hint="Menu, battle and shop tracks" value={s.musicEnabled} onChange={toggleMusic} />
                <ToggleRow icon="finger-print" tile="#3FA4F0" label="Haptics" hint="Bow draw ticks, release, hits" value={s.hapticsEnabled} onChange={toggleHaptics} />
                <ToggleRow icon="phone-portrait" tile="#E5484D" label="Vibration" hint="Kills, taking damage, game over" value={s.vibrationEnabled} onChange={toggleVibration} />
              </Card>

              <Card title="About" color="#FFB020" icon="information-circle" delay={180}>
                <Row icon="shield-checkmark" tile="#7CC23A" label="Privacy Policy" onPress={() => openUrl(LEGAL_URLS.privacy)} />
                <Row icon="document-text" tile="#3FA4F0" label="Terms & Conditions" onPress={() => openUrl(LEGAL_URLS.terms)} />
                <Row icon="help-buoy" tile="#E05A9C" label="Get Help" onPress={() => openUrl(SUPPORT_URL)} />
                <Row icon="cloud-download" tile="#8E6CEF" label="Check for Updates" onPress={checkForUpdateAndReload} />
                {__DEV__ && <Row icon="body" tile="#5A5A66" label="Character showcase" hint="Developer" onPress={() => router.push('/showcase')} />}
              </Card>
            </View>
          </View>

          <Text style={styles.version}>
            Bonk Bow v{Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? 'dev'})
          </Text>
        </ScrollView>
      </SafeAreaView>
      <NameModal visible={naming} onClose={() => setNaming(false)} />
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

// A chunky card with a coloured, slightly tilted label on its top edge.
function Card({ title, color, icon, delay, children }: { title: string; color: string; icon: IconName; delay: number; children: React.ReactNode }) {
  const styles = useStyles();
  const { s } = useMetrics();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(380)} style={styles.cardWrap}>
      <View style={styles.cardEdge} />
      <View style={styles.card}>
        <View style={[styles.cardLabel, { backgroundColor: color }]}>
          <Ionicons name={icon} size={s(13)} color="#FFFFFF" />
          {/* Sits on the card's top edge: held near its size so it doesn't cover the first row. */}
          <Text style={styles.cardLabelText} numberOfLines={1} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
            {title}
          </Text>
        </View>
        {children}
      </View>
    </Animated.View>
  );
}

function Tile({ icon, color }: { icon: IconName; color: string }) {
  const styles = useStyles();
  const { s } = useMetrics();
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <Ionicons name={icon} size={s(17)} color="#FFFFFF" />
    </View>
  );
}

function Row({ icon, tile, label, hint, onPress }: { icon: IconName; tile: string; label: string; hint?: string; onPress: () => void }) {
  const styles = useStyles();
  const { s } = useMetrics();
  return (
    <HapticTouchable style={styles.row} onPress={onPress}>
      <Tile icon={icon} color={tile} />
      <View style={styles.flex}>
        <Text style={styles.rowText}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={s(18)} color="rgba(255,255,255,0.45)" />
    </HapticTouchable>
  );
}

function ToggleRow({ icon, tile, label, hint, value, onChange }: { icon: IconName; tile: string; label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  return (
    <HapticTouchable style={styles.row} onPress={() => onChange(!value)} sound={null}>
      <Tile icon={icon} color={tile} />
      <View style={styles.flex}>
        <Text style={styles.rowText}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <GameToggle on={value} />
    </HapticTouchable>
  );
}

// ON/OFF pill: the knob springs across, the track turns green.
const TRACK_W = 64;
const KNOB = 24;
function GameToggle({ on }: { on: boolean }) {
  const styles = useStyles();
  const { s } = useMetrics();
  const knobStart = s(3);
  const knobTravel = s(TRACK_W - KNOB - 10);
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    x.value = withSpring(on ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: knobStart + x.value * knobTravel }] }));
  return (
    <View style={[styles.track, on ? styles.trackOn : styles.trackOff]}>
      <Text style={[styles.trackText, on ? styles.trackTextOn : styles.trackTextOff]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={TIGHT_FONT_SCALE}>
        {on ? 'ON' : 'OFF'}
      </Text>
      <Animated.View style={[styles.knob, knob]} />
    </View>
  );
}

function XpBar({ into, need }: { into: number; need: number }) {
  const styles = useStyles();
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(into / need, { duration: 700 });
  }, [into, need, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.xpTrack}>
      <Animated.View style={[styles.xpFill, style]} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 };

const useStyles = makeStyles((m) => ({
  root: { flex: 1, backgroundColor: '#141428' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: m.s(12), paddingHorizontal: m.s(16), paddingTop: m.s(6), paddingBottom: m.s(4) },
  back: { width: m.s(38), height: m.s(38), borderRadius: m.s(19), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  titleWrap: { flexShrink: 1, transform: [{ rotate: '-1.5deg' }] },
  titleBar: { paddingHorizontal: m.s(32), paddingVertical: m.s(3), borderRadius: m.s(6), borderWidth: 3, borderColor: '#0B0B0F' },
  title: { fontFamily: FONT.bold, fontSize: m.s(24), color: '#FFFFFF', ...shadow },
  scroll: { paddingHorizontal: m.s(16), paddingTop: m.s(14), paddingBottom: m.s(28) },
  // Capped so the cards don't stretch across a very wide window.
  cols: { flexDirection: 'row', gap: m.s(14), width: '100%', maxWidth: m.s(1100), alignSelf: 'center' },
  col: { flex: 1, minWidth: 0, gap: m.s(18) },
  cardWrap: { borderRadius: m.s(18), paddingBottom: m.s(5) },
  cardEdge: { ...StyleSheet.absoluteFill, top: m.s(5), borderRadius: m.s(18), backgroundColor: '#07070C' },
  card: {
    backgroundColor: '#1D1B36',
    borderRadius: m.s(18),
    borderWidth: 2.5,
    borderColor: '#0B0B0F',
    paddingHorizontal: m.s(12),
    paddingTop: m.s(20),
    paddingBottom: m.s(8),
  },
  cardLabel: {
    position: 'absolute',
    top: m.s(-12),
    left: m.s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(5),
    paddingHorizontal: m.s(10),
    paddingVertical: m.s(2),
    borderRadius: m.s(8),
    borderWidth: 2.5,
    borderColor: '#0B0B0F',
    transform: [{ rotate: '-2deg' }],
  },
  cardLabelText: { fontFamily: FONT.bold, fontSize: m.s(13), color: '#FFFFFF', ...shadow, textShadowRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: m.s(12), paddingVertical: m.s(8), paddingHorizontal: m.s(2) },
  tile: { width: m.s(34), height: m.s(34), borderRadius: m.s(10), alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)' },
  rowText: { fontFamily: FONT.bold, fontSize: m.s(15), color: '#FFFFFF' },
  hint: { fontFamily: FONT.medium, fontSize: m.s(12), color: 'rgba(255,255,255,0.55)' },
  empty: { fontFamily: FONT.medium, fontSize: m.s(13), color: 'rgba(255,255,255,0.65)', paddingVertical: m.s(8) },
  track: { width: m.s(TRACK_W), height: m.s(30), borderRadius: m.s(15), justifyContent: 'center', borderWidth: 2, borderBottomWidth: 4 },
  trackOn: { backgroundColor: '#7CC23A', borderColor: '#4E8A1C' },
  trackOff: { backgroundColor: '#2C2A45', borderColor: '#141226' },
  // Each label gets the half of the track the knob isn't on, so they never meet.
  trackText: { position: 'absolute', textAlign: 'center', fontFamily: FONT.bold, fontSize: m.s(11), letterSpacing: m.s(0.5) },
  trackTextOn: { left: m.s(4), right: m.s(KNOB + 6), color: '#FFFFFF' },
  trackTextOff: { left: m.s(KNOB + 6), right: m.s(4), color: 'rgba(255,255,255,0.5)' },
  knob: { width: m.s(KNOB), height: m.s(KNOB), borderRadius: m.s(KNOB / 2), backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: 'rgba(0,0,0,0.25)' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: m.s(12) },
  lvl: {
    width: m.s(54),
    height: m.s(54),
    borderRadius: m.s(27),
    backgroundColor: '#7B5CE0',
    borderWidth: 3,
    borderColor: '#F7C948',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lvlText: { fontFamily: FONT.bold, fontSize: m.s(22), color: '#FFFFFF', ...shadow },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(8) },
  name: { fontFamily: FONT.bold, fontSize: m.s(20), color: '#FFFFFF', flexShrink: 1 },
  editChip: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: m.s(3), backgroundColor: '#FFB020', borderRadius: m.s(8), paddingHorizontal: m.s(7), paddingVertical: m.s(2) },
  editText: { fontFamily: FONT.bold, fontSize: m.s(11), color: '#0B0B0F' },
  xpTrack: { height: m.s(10), borderRadius: m.s(5), backgroundColor: 'rgba(0,0,0,0.6)', overflow: 'hidden', marginTop: m.s(6) },
  xpFill: { height: '100%', borderRadius: m.s(5), backgroundColor: '#8E6CEF' },
  xpText: { fontFamily: FONT.semi, fontSize: m.s(11), color: 'rgba(255,255,255,0.65)', marginTop: m.s(3) },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: m.s(12), paddingTop: m.s(10), borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.08)' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontFamily: FONT.bold, fontSize: m.s(18), color: '#FFFFFF' },
  statLabel: { fontFamily: FONT.semi, fontSize: m.s(10), letterSpacing: m.s(0.8), color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  version: { fontFamily: FONT.semi, color: 'rgba(255,255,255,0.35)', fontSize: m.s(11), textAlign: 'center', marginTop: m.s(18) },
}));
