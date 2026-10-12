import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { lookFor } from '@/game/cosmetics';
import { BOWS, DERPS, DERP_IDS, HATS, HAT_IDS, type BowId, type DerpId, type HatId } from '@/game/derps';
import { ARROWS, ARROW_IDS, OUTFITS, OUTFIT_IDS, type ArrowId, type OutfitId } from '@/game/gear';
import { Showcase, type ShowAction, type ShowAngle, type ShowState } from '@/game3d/Showcase';
import type { Mood } from '@/game3d/sim';
import { FONT } from '@/ui/kit';
import { Text } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

// Developer-only character inspector (Settings → Character showcase in dev
// builds): every derp, in any hat, with either bow, on the shared rig, from
// any angle, in any pose.

const ACTIONS: ShowAction[] = ['reel', 'idle', 'aim', 'shoot', 'eat', 'yawn', 'shrug', 'walk', 'run', 'crouch', 'lookback', 'hit', 'win', 'lose', 'death'];
const ANGLES: ShowAngle[] = ['front', 'side', 'back', 'left'];
const MOODS: (Mood | 'auto')[] = [
  'auto',
  'neutral',
  'happy',
  'angry',
  'shock',
  'hurt',
  'sad',
  'laugh',
  'wink',
  'smug',
  'scared',
  'sleepy',
  'chew',
  'camera',
  'dazed',
];
const ZOOMS = [2.2, 3.4, 4.8, 6.5];

export default function ShowcaseScreen() {
  const styles = useStyles();
  const { s } = useMetrics();
  const [derp, setDerp] = useState<DerpId>(DERP_IDS[0]);
  const [hat, setHat] = useState<HatId>('none');
  const [bow, setBow] = useState<BowId>('bow');
  const [outfit, setOutfit] = useState<OutfitId>('none');
  const [arrow, setArrow] = useState<ArrowId>('classic');
  const [action, setAction] = useState<ShowAction>('idle');
  const [angle, setAngle] = useState<ShowAngle>('front');
  const [mood, setMood] = useState<Mood | 'auto'>('auto');
  const [zoom, setZoom] = useState(4.8);
  const [wire, setWire] = useState(false);
  const state = useMemo<ShowState>(
    () => ({ look: lookFor({ derp, hat, outfit, bow, arrow }), action, mood, angle, zoom, wire }),
    [derp, hat, outfit, bow, arrow, action, mood, angle, zoom, wire],
  );
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.container}>
      <Showcase state={state} style={styles.stage} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
            <Ionicons name="chevron-back" size={s(24)} color="#FFFFFF" />
          </HapticTouchable>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            Character showcase
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Group label="Derp">
            {DERP_IDS.map((id) => (
              <Chip key={id} label={DERPS[id].name} on={derp === id} onPress={() => setDerp(id)} />
            ))}
          </Group>
          <Group label="Hat">
            {HAT_IDS.map((id) => (
              <Chip key={id} label={HATS[id].name} on={hat === id} onPress={() => setHat(id)} />
            ))}
          </Group>
          <Group label="Clothes">
            {OUTFIT_IDS.map((id) => (
              <Chip key={id} label={OUTFITS[id].name} on={outfit === id} onPress={() => setOutfit(id)} />
            ))}
          </Group>
          <Group label="Bow">
            {(Object.keys(BOWS) as BowId[]).map((id) => (
              <Chip key={id} label={BOWS[id].name} on={bow === id} onPress={() => setBow(id)} />
            ))}
          </Group>
          <Group label="Arrow">
            {ARROW_IDS.map((id) => (
              <Chip key={id} label={ARROWS[id].name} on={arrow === id} onPress={() => setArrow(id)} />
            ))}
          </Group>
          <Group label="Action">
            {ACTIONS.map((a) => (
              <Chip key={a} label={a} on={action === a} onPress={() => setAction(a)} />
            ))}
          </Group>
          <Group label="View">
            {ANGLES.map((a) => (
              <Chip key={a} label={a} on={angle === a} onPress={() => setAngle(a)} />
            ))}
          </Group>
          <Group label="Zoom">
            {ZOOMS.map((z, i) => (
              <Chip key={z} label={['head', 'bust', 'body', 'wide'][i]} on={zoom === z} onPress={() => setZoom(z)} />
            ))}
            <Chip label="wireframe" on={wire} onPress={() => setWire((w) => !w)} />
          </Group>
          <Group label="Face">
            {MOODS.map((m) => (
              <Chip key={m} label={m} on={mood === m} onPress={() => setMood(m)} />
            ))}
          </Group>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <HapticTouchable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </HapticTouchable>
  );
}

const useStyles = makeStyles((m) => ({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#12141C' },
  stage: { flex: 1.1 },
  panel: { flex: 1, paddingHorizontal: m.s(12) },
  header: { flexDirection: 'row', alignItems: 'center', gap: m.s(8), paddingVertical: m.s(8) },
  title: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: m.s(18), flexShrink: 1 },
  scroll: { paddingBottom: m.s(16), gap: m.s(10) },
  group: { gap: m.s(4) },
  label: { color: 'rgba(255,255,255,0.55)', fontFamily: FONT.medium, fontSize: m.s(12) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: m.s(6) },
  chip: { paddingHorizontal: m.s(10), paddingVertical: m.s(6), borderRadius: m.s(10), backgroundColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: '#FFB020' },
  chipText: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: m.s(13), textTransform: 'capitalize' },
  chipTextOn: { color: '#0B0B0F' },
}));
