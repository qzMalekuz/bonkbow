import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from '@/components/haptic-touchable';
import { lookFor } from '@/game/cosmetics';
import { FACES, FACE_IDS, type FaceId } from '@/game/faces';
import { Showcase, type ShowAction, type ShowAngle, type ShowState } from '@/game3d/Showcase';
import type { Mood } from '@/game3d/sim';
import { FONT } from '@/ui/kit';

// Developer-only character inspector (Settings → Character showcase in dev
// builds): every hero on the shared rig, from any angle, in any pose.

const ACTIONS: ShowAction[] = ['idle', 'aim', 'shoot', 'walk', 'hit', 'win', 'lose', 'death'];
const ANGLES: ShowAngle[] = ['spin', 'front', 'front34', 'side', 'back'];
const MOODS: (Mood | 'auto')[] = ['auto', 'neutral', 'happy', 'angry', 'shock', 'hurt', 'sad', 'laugh', 'wink', 'smug', 'scared', 'sleepy'];
const ZOOMS = [2.2, 3.4, 4.8, 6.5];

export default function ShowcaseScreen() {
  const [who, setWho] = useState<FaceId | 'stick'>(FACE_IDS[0]);
  const [action, setAction] = useState<ShowAction>('idle');
  const [angle, setAngle] = useState<ShowAngle>('spin');
  const [mood, setMood] = useState<Mood | 'auto'>('auto');
  const [zoom, setZoom] = useState(4.8);
  const [wire, setWire] = useState(false);
  const state = useMemo<ShowState>(
    () => ({ look: lookFor({ head: who === 'stick' ? 'bare' : `bro_${who}`, bow: 'hunter', trail: 'fire' }), action, mood, angle, zoom, wire }),
    [who, action, mood, angle, zoom, wire],
  );
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.container}>
      <Showcase state={state} style={styles.stage} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <HapticTouchable onPress={() => router.back()} hitSlop={12} sound="ui_back">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </HapticTouchable>
          <Text style={styles.title}>Character showcase</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Group label="Character">
            {FACE_IDS.map((id) => (
              <Chip key={id} label={FACES[id].name} on={who === id} onPress={() => setWho(id)} />
            ))}
            <Chip label="Stickman" on={who === 'stick'} onPress={() => setWho('stick')} />
          </Group>
          <Group label="Action">
            {ACTIONS.map((a) => (
              <Chip key={a} label={a} on={action === a} onPress={() => setAction(a)} />
            ))}
          </Group>
          <Group label="View">
            {ANGLES.map((a) => (
              <Chip key={a} label={a === 'front34' ? '45°' : a} on={angle === a} onPress={() => setAngle(a)} />
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
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <HapticTouchable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </HapticTouchable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#12141C' },
  stage: { flex: 1.1 },
  panel: { flex: 1, paddingHorizontal: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  title: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 18 },
  scroll: { paddingBottom: 16, gap: 10 },
  group: { gap: 4 },
  label: { color: 'rgba(255,255,255,0.55)', fontFamily: FONT.medium, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: '#FFB020' },
  chipText: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: 13, textTransform: 'capitalize' },
  chipTextOn: { color: '#0B0B0F' },
});
