import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Stage, type Actor, type StageCamera } from '@/game3d/Stage';
import { AI_LOOK, lookFor, randomLoadout, type Look } from '@/game/cosmetics';
import { FONT, TIPS } from '@/ui/kit';

// Loading screens, shown at app start and before every duel. There are
// several designs; a shuffle bag hands them out in random order without
// repeats until every one has been seen.

export type LoadingVariant =
  | 'spinner'
  | 'faceoff'
  | 'forestWave'
  | 'townThink'
  | 'arenaDuel'
  | 'arenaTaunt'
  | 'frostYawn'
  | 'emberDance'
  | 'canyonSalute'
  | 'meadowCheer'
  | 'mistSmug'
  | 'reel';
const VARIANTS: LoadingVariant[] = [
  'spinner',
  'faceoff',
  'forestWave',
  'townThink',
  'arenaDuel',
  'arenaTaunt',
  'frostYawn',
  'emberDance',
  'canyonSalute',
  'meadowCheer',
  'mistSmug',
  'reel',
];

let bag: LoadingVariant[] = [];
let last: LoadingVariant | null = null;
export function nextLoadingVariant(): LoadingVariant {
  if (bag.length === 0) {
    bag = [...VARIANTS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Never show the same screen twice in a row across bag refills.
    if (bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  last = bag.pop()!;
  return last;
}

const randomTip = () => TIPS[Math.floor(Math.random() * TIPS.length)];

type Props = {
  variant: LoadingVariant;
  progress: number; // 0..1
  look?: Look; // the player's style, shown in the art
  label?: string;
};

export function LoadingScreen({ variant, progress, look, label }: Props) {
  const [tip] = useState(randomTip);
  const [rival] = useState(() => lookFor(randomLoadout()));
  const me = look ?? AI_LOOK;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(350)} style={[StyleSheet.absoluteFill, styles.root]}>
      {variant === 'spinner' ? <SpinnerArt /> : <SceneArt variant={variant} me={me} rival={rival} />}
      {variant !== 'spinner' && (
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
          style={styles.bottomShade}
          pointerEvents="none"
        />
      )}
      <View style={styles.footer} pointerEvents="none">
        {variant !== 'spinner' && <ProgressBar progress={progress} />}
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <Text style={styles.tip}>{tip}</Text>
      </View>
    </Animated.View>
  );
}

type SceneVariant = Exclude<LoadingVariant, 'spinner'>;
type Scene = { theme: string; camera: StageCamera; actors: Actor[]; ledges?: boolean; tint?: [string, string, string] };

function sceneFor(variant: SceneVariant, me: Look, rival: Look): Scene {
  switch (variant) {
    // Dramatic close face-off under a stormy sky.
    case 'faceoff':
      return {
        theme: 'town',
        camera: { x: 0, y: 1.7, z: 4.2, lookX: 0, lookY: 1.35, fov: 40, drift: 0.12 },
        actors: [
          { look: me, x: -1.05, facing: 1, performance: 'faceoff' },
          { look: rival, x: 1.05, facing: -1, performance: 'faceoff' },
        ],
        tint: ['rgba(120,0,10,0.35)', 'rgba(0,0,0,0)', 'rgba(60,0,10,0.45)'],
      };
    case 'forestWave':
      return {
        theme: 'forest',
        camera: { x: 1.2, y: 1.9, z: 6, lookX: 0.6, lookY: 1.3, drift: 0.2 },
        actors: [{ look: me, x: 0, facing: 1, performance: 'wave' }],
        ledges: true,
      };
    case 'townThink':
      return {
        theme: 'town',
        camera: { x: -0.6, y: 1.8, z: 5.5, lookX: 0.4, lookY: 1.3, drift: 0.2 },
        actors: [{ look: me, x: 0, facing: 1, performance: 'think' }],
        ledges: true,
      };
    case 'arenaDuel':
      return {
        theme: 'colosseum',
        camera: { x: 0, y: 2, z: 7, lookX: 0, lookY: 1.4, drift: 0.3 },
        actors: [
          { look: me, x: -1.6, facing: 1, performance: 'ready' },
          { look: rival, x: 1.6, facing: -1, performance: 'ready' },
        ],
      };
    case 'arenaTaunt':
      return {
        theme: 'colosseum',
        camera: { x: 0, y: 1.9, z: 6.4, lookX: 0, lookY: 1.4, drift: 0.25 },
        actors: [
          { look: me, x: -1.5, facing: 1, performance: 'flex' },
          { look: rival, x: 1.5, facing: -1, performance: 'scared' },
        ],
      };
    case 'frostYawn':
      return {
        theme: 'frost',
        camera: { x: 0.8, y: 1.7, z: 5.2, lookX: 0.2, lookY: 1.35, drift: 0.15 },
        actors: [{ look: me, x: 0, facing: 1, performance: 'yawn' }],
      };
    case 'emberDance':
      return {
        theme: 'ember',
        camera: { x: 0, y: 1.8, z: 5.6, lookX: 0, lookY: 1.35, drift: 0.2 },
        actors: [
          { look: me, x: -1, facing: 1, performance: 'dance' },
          { look: rival, x: 1, facing: -1, performance: 'smug' },
        ],
        tint: ['rgba(90,20,0,0.3)', 'rgba(0,0,0,0)', 'rgba(60,10,0,0.4)'],
      };
    case 'canyonSalute':
      return {
        theme: 'canyon',
        camera: { x: 0, y: 1.9, z: 6.4, lookX: 0, lookY: 1.4, drift: 0.22 },
        actors: [
          { look: me, x: -1.4, facing: 1, performance: 'salute' },
          { look: rival, x: 1.4, facing: -1, performance: 'bow' },
        ],
      };
    case 'meadowCheer':
      return {
        theme: 'meadow',
        camera: { x: 0, y: 1.9, z: 6.2, lookX: 0, lookY: 1.4, drift: 0.2 },
        actors: [
          { look: me, x: -1.3, facing: 1, performance: 'cheer' },
          { look: rival, x: 1.3, facing: -1, performance: 'thumbs' },
        ],
      };
    case 'mistSmug':
      return {
        theme: 'mist',
        camera: { x: 0, y: 1.7, z: 4.8, lookX: 0, lookY: 1.35, fov: 38, drift: 0.12 },
        actors: [
          { look: me, x: -1.2, facing: 1, performance: 'smug' },
          { look: rival, x: 1.2, facing: -1, performance: 'facepalm' },
        ],
      };
    // Close-up on the player running through the whole range of emotions.
    case 'reel':
      return {
        theme: 'colosseum',
        camera: { x: 0.9, y: 1.6, z: 3.6, lookX: 0.1, lookY: 1.45, fov: 36, drift: 0.1 },
        actors: [{ look: me, x: -0.2, facing: 1, performance: 'mixed' }],
      };
  }
}

function SceneArt({ variant, me, rival }: { variant: SceneVariant; me: Look; rival: Look }) {
  const scene = useMemo(() => sceneFor(variant, me, rival), [variant, me, rival]);
  return (
    <>
      <Stage theme={scene.theme} camera={scene.camera} actors={scene.actors} ledges={scene.ledges} />
      {scene.tint && <LinearGradient colors={scene.tint} style={StyleSheet.absoluteFill} pointerEvents="none" />}
    </>
  );
}

// Black screen with a spinning arrowhead inside a two-tone ring (page 8 of
// the reference).
function SpinnerArt() {
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1);
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1);
  }, [spin, bob]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const head = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 4 }, { rotate: `${-12 + bob.value * 6}deg` }] }));
  return (
    <View style={styles.spinnerWrap}>
      <Animated.View style={[styles.ring, ring]}>
        <Svg width={96} height={96} viewBox="0 0 96 96">
          <Circle cx={48} cy={48} r={40} stroke="rgba(255,255,255,0.35)" strokeWidth={6} fill="none" />
          <Path d="M48 8 A40 40 0 0 1 88 48" stroke="#FF9F1C" strokeWidth={6} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.arrowHead, head]}>
        <Svg width={44} height={44} viewBox="0 0 44 44">
          <Path d="M6 30 L34 6 L30 34 L20 26 Z" fill="#F2F2F2" />
          <Path d="M6 30 L20 26 L30 34 Z" fill="#BDBDBD" />
          <Path d="M20 26 L34 6 L30 34 Z" fill="#DADADA" />
        </Svg>
      </Animated.View>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, progress)), { duration: 300 });
  }, [progress, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.progressRow}>
      <Text style={styles.pct}>{Math.round(progress * 100)}%</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', zIndex: 50 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', gap: 6 },
  progressRow: { width: '38%', alignItems: 'center', gap: 4 },
  pct: {
    fontFamily: FONT.bold,
    fontSize: 15,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  track: { alignSelf: 'stretch', height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.7)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: '#FFFFFF' },
  label: { fontFamily: FONT.semi, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  tip: {
    fontFamily: FONT.semi,
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 40,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spinnerWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  arrowHead: { position: 'absolute' },
});
