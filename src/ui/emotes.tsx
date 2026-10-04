import { ReactNode, useEffect, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

export type EmoteId = 'angry' | 'cry' | 'cool' | 'surrender' | 'dizzy' | 'laugh' | 'lol' | 'tongue' | 'thumbs';

// Grid order for the emote picker.
export const EMOTES: { id: EmoteId; label: string }[] = [
  { id: 'angry', label: 'Angry' },
  { id: 'cry', label: 'Crying' },
  { id: 'cool', label: 'Cool' },
  { id: 'surrender', label: 'Surrender' },
  { id: 'dizzy', label: 'Dizzy' },
  { id: 'laugh', label: 'Laugh' },
  { id: 'lol', label: 'LOL' },
  { id: 'tongue', label: 'Tongue' },
  { id: 'thumbs', label: 'Thumbs up' },
];

export const QUICK_MESSAGES: string[] = [
  'Thanks!',
  'Well played',
  'Oops!',
  'Missed',
  'Greetings',
  'Wow!',
  'Nice shot!',
  'Unlucky',
];

const CARD = '#BDBDBD';
const INK = '#111111';
const WHITE = '#FFFFFF';
const TEAR = '#4FC3F7';
const TONGUE = '#E53935';
const TAU = Math.PI * 2;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Clock = SharedValue<number>;
type ArtProps = { size: number; animate: boolean };

// ---------------------------------------------------------------------------
// Animation clocks
// ---------------------------------------------------------------------------

// Linear 0→1 phase that loops forever; parked at 0 when not animating.
function useLoop(animate: boolean, ms: number): Clock {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    if (!animate) return;
    t.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [animate, ms, t]);
  return t;
}

// One-shot springy 0→1 entrance; already settled at 1 when not animating.
function useEnter(animate: boolean, delay = 0): Clock {
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(delay, withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })));
    return () => cancelAnimation(p);
  }, [animate, delay, p]);
  return p;
}

// ---------------------------------------------------------------------------
// Path builders (worklets so they can run per-frame on the UI thread)
// ---------------------------------------------------------------------------

// Concave 4-point sparkle centred on (x, y).
function sparkleD(x: number, y: number, r: number) {
  'worklet';
  const a = (n: number) => n.toFixed(1);
  return (
    `M${a(x)} ${a(y - r)}Q${a(x)} ${a(y)} ${a(x + r)} ${a(y)}Q${a(x)} ${a(y)} ${a(x)} ${a(y + r)}` +
    `Q${a(x)} ${a(y)} ${a(x - r)} ${a(y)}Q${a(x)} ${a(y)} ${a(x)} ${a(y - r)}Z`
  );
}

// Archimedean spiral polyline, rotated by `ang` radians.
function spiralD(cx: number, cy: number, r: number, ang: number) {
  'worklet';
  const n = 22;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = ang + f * 2.25 * TAU;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * r * f).toFixed(1)} ${(cy + Math.sin(a) * r * f).toFixed(1)}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

// A full-card SVG layer (100×100 viewBox) that can be transformed as a unit.
function Layer({ size, style, children }: { size: number; style?: ViewStyle | object; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {children}
      </Svg>
    </Animated.View>
  );
}

// Thin black stick limb (polyline).
function Limb({ d, w = 5 }: { d: string; w?: number }) {
  return <Path d={d} stroke={INK} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

// White facial stroke (eyes, mouths, brows).
function Feature({ d, w = 3 }: { d: string; w?: number }) {
  return <Path d={d} stroke={WHITE} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

function Head({ cx = 50, cy = 44, r = 23, fill = INK }: { cx?: number; cy?: number; r?: number; fill?: string }) {
  return <Circle cx={cx} cy={cy} r={r} fill={fill} />;
}

// Rising, fading steam puff.
function Puff({ t, x, dx, y, phase }: { t: Clock; x: number; dx: number; y: number; phase: number }) {
  const props = useAnimatedProps(() => {
    const u = (t.get() * 2 + phase) % 1;
    return { cx: x + dx * u, cy: y - 18 * u, r: 2.5 + 5 * u, opacity: 0.95 * (1 - u) };
  });
  return <AnimatedCircle animatedProps={props} fill={WHITE} />;
}

// Tear drop that falls straight down from (x, y).
function FallingTear({ t, x, y, phase }: { t: Clock; x: number; y: number; phase: number }) {
  const props = useAnimatedProps(() => {
    const u = (t.get() + phase) % 1;
    return { cy: y + 30 * u * u, opacity: u < 0.85 ? 1 : (1 - u) / 0.15 };
  });
  return <AnimatedCircle animatedProps={props} cx={x} r={2.6} fill={TEAR} />;
}

// Tear of joy flung sideways in a little arc.
function FlungTear({ t, x, y, dir, phase }: { t: Clock; x: number; y: number; dir: number; phase: number }) {
  const props = useAnimatedProps(() => {
    const u = (t.get() * 2 + phase) % 1;
    return { cx: x + dir * 16 * u, cy: y - 8 * u + 26 * u * u, opacity: 1 - u };
  });
  return <AnimatedCircle animatedProps={props} r={2.6} fill={TEAR} />;
}

// ---------------------------------------------------------------------------
// Emotes
// ---------------------------------------------------------------------------

function Angry({ size, animate }: ArtProps) {
  const t = useLoop(animate, 1400);
  const k = size / 100;
  // Fast, irregular jitter so the whole stickman vibrates with rage.
  const shake = useAnimatedStyle(() => {
    const p = t.get() * TAU;
    return { transform: [{ translateX: Math.sin(p * 14) * 1.6 * k }, { translateY: Math.cos(p * 19) * 0.6 * k }] };
  });
  return (
    <>
      <Layer size={size}>
        <Puff t={t} x={27} dx={-7} y={24} phase={0} />
        <Puff t={t} x={73} dx={7} y={24} phase={0.5} />
      </Layer>
      <Layer size={size} style={shake}>
        <Limb d="M50 66L50 110" />
        <Limb d="M50 80L32 88L30 100" />
        <Limb d="M50 80L68 88L70 100" />
        <Circle cx={30} cy={100} r={5} fill={INK} />
        <Circle cx={70} cy={100} r={5} fill={INK} />
        <Head fill="#8B1A1A" />
        <Path d="M34 42L47 47Q46 54 40 54Q34 53 34 46Z" fill={WHITE} />
        <Path d="M66 42L53 47Q54 54 60 54Q66 53 66 46Z" fill={WHITE} />
        <Circle cx={42} cy={50} r={2.4} fill={INK} />
        <Circle cx={58} cy={50} r={2.4} fill={INK} />
        <Limb d="M31 38L48 45.5" w={4} />
        <Limb d="M69 38L52 45.5" w={4} />
        <Rect x={39} y={57} width={22} height={8} rx={2} fill={WHITE} />
        <Path d="M39 61H61M44.5 57V65M50 57V65M55.5 57V65" stroke="#8B1A1A" strokeWidth={1.2} />
      </Layer>
    </>
  );
}

function Cry({ size, animate }: ArtProps) {
  const t = useLoop(animate, 1400);
  const k = size / 100;
  const sob = useAnimatedStyle(() => ({ transform: [{ translateY: Math.sin(t.get() * TAU * 2) * 1.2 * k }] }));
  // Dashes crawl down the cheek streams so the tears look like they're flowing.
  const stream = useAnimatedProps(() => ({ strokeDashoffset: -t.get() * 16 }));
  return (
    <Layer size={size} style={sob}>
      <Limb d="M50 66L50 110" />
      <Limb d="M50 80L37 104" />
      <Limb d="M50 80L63 104" />
      <Head />
      <Circle cx={40} cy={46} r={6} fill={WHITE} />
      <Circle cx={60} cy={46} r={6} fill={WHITE} />
      <Circle cx={40} cy={49} r={3} fill={INK} />
      <Circle cx={60} cy={49} r={3} fill={INK} />
      {/* Droopy lids slanting up toward the middle read as sad. */}
      <Path d="M32 33L50 33L50 41L32 46Z" fill={INK} />
      <Path d="M68 33L50 33L50 41L68 46Z" fill={INK} />
      <Feature d="M42 63Q50 56 58 63" />
      <AnimatedPath
        animatedProps={stream}
        d="M37 52Q34.5 60 36 72M63 52Q65.5 60 64 72"
        stroke={TEAR}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray="5 3"
        fill="none"
      />
      <FallingTear t={t} x={36} y={72} phase={0} />
      <FallingTear t={t} x={64} y={72} phase={0.45} />
    </Layer>
  );
}

function Cool({ size, animate }: ArtProps) {
  const t = useLoop(animate, 2600);
  const enter = useEnter(animate, 150);
  const k = size / 100;
  // Shades drop from above the card and settle onto the face.
  const drop = useAnimatedStyle(() => {
    const e = enter.get();
    return { transform: [{ translateY: (1 - e) * -48 * k }, { rotate: `${(1 - e) * -12}deg` }] };
  });
  // Periodic glint on the lens once the glasses have landed.
  const glint = useAnimatedProps(() => {
    const u = t.get();
    const s = u < 0.25 ? Math.sin((u / 0.25) * Math.PI) : 0;
    return { d: sparkleD(70, 38, 0.01 + 6 * s * enter.get()) };
  });
  return (
    <>
      <Layer size={size}>
        <Limb d="M50 66L50 110" />
        <Limb d="M50 80L30 90L66 96" />
        <Limb d="M50 80L70 90L34 96" />
        <Head />
        <Feature d="M41 59Q52 64.5 61 55" />
      </Layer>
      <Layer size={size} style={drop}>
        <Path
          d="M27 39H73V43H70V47H68V50H55V47H53V43H47V47H45V50H32V47H30V43H27Z"
          fill={INK}
          stroke={WHITE}
          strokeWidth={1.4}
          strokeLinejoin="miter"
        />
        <Path d="M33 41h2.5v2.5h-2.5zM35.5 43.5h2.5v2.5h-2.5zM56 41h2.5v2.5h-2.5zM58.5 43.5h2.5v2.5h-2.5z" fill={WHITE} />
        <AnimatedPath animatedProps={glint} fill={WHITE} />
      </Layer>
    </>
  );
}

function Surrender({ size, animate }: ArtProps) {
  const t = useLoop(animate, 1200);
  // Flag edges ripple with a travelling sine wave that grows toward the free end.
  const flag = useAnimatedProps(() => {
    const ph = t.get() * TAU;
    const n = 6;
    let top = '';
    let bottom = '';
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = 74 + f * 23;
      const y = Math.sin(ph - f * 5) * 3 * f;
      top += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(13 + y).toFixed(1)}`;
      bottom = `L${x.toFixed(1)} ${(29 + y * 1.15).toFixed(1)}` + bottom;
    }
    return { d: `${top}${bottom}Z` };
  });
  return (
    <Layer size={size}>
      <Limb d="M44 68L44 110" />
      <Line x1={74} y1={98} x2={74} y2={11} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <AnimatedPath animatedProps={flag} fill={WHITE} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <Limb d="M44 80L60 72L73 57" />
      <Limb d="M44 80L28 68L24 52" />
      <Circle cx={73} cy={57} r={4} fill={INK} />
      <Circle cx={24} cy={51} r={3.6} fill={INK} />
      <Head cx={44} cy={46} r={22} />
      <Circle cx={36} cy={46} r={5.5} fill={WHITE} />
      <Circle cx={52} cy={46} r={5.5} fill={WHITE} />
      <Circle cx={36} cy={46.5} r={2} fill={INK} />
      <Circle cx={52} cy={46.5} r={2} fill={INK} />
      <Feature d="M31 38L39 35M49 35L57 38" w={2.2} />
      <Feature d="M38 59q2.5 -3 5 0t5 0" w={2.4} />
    </Layer>
  );
}

function Dizzy({ size, animate }: ArtProps) {
  const t = useLoop(animate, 2000);
  const k = size / 100;
  const wobble = useAnimatedStyle(() => {
    const s = Math.sin(t.get() * TAU);
    return { transform: [{ translateX: s * 1.5 * k }, { rotate: `${s * 8}deg` }] };
  });
  // Counter-rotating spirals for that cartoon "seeing stars" look.
  const eyes = useAnimatedProps(() => {
    const a = t.get() * TAU * 2;
    return { d: spiralD(40, 45, 7.5, a) + spiralD(60, 45, 7.5, -a) };
  });
  // Three sparkles orbit a flattened ellipse; the front ones are drawn bigger for depth.
  const stars = useAnimatedProps(() => {
    let d = '';
    for (let i = 0; i < 3; i++) {
      const a = t.get() * TAU + (i * TAU) / 3;
      d += sparkleD(50 + Math.cos(a) * 25, 15 + Math.sin(a) * 6, 3.6 + Math.sin(a) * 1.4);
    }
    return { d };
  });
  return (
    <Layer size={size} style={[wobble, { transformOrigin: '50% 100%' }]}>
      <Limb d="M50 66L50 110" />
      <Limb d="M50 80L35 101" />
      <Limb d="M50 80L65 101" />
      <Head />
      <AnimatedPath animatedProps={eyes} stroke={WHITE} strokeWidth={1.9} strokeLinecap="round" fill="none" />
      <Feature d="M39 60q2.75 -3 5.5 0t5.5 0t5.5 0" w={2.4} />
      <AnimatedPath animatedProps={stars} fill="#FFD54F" stroke={INK} strokeWidth={0.8} />
    </Layer>
  );
}

function Laugh({ size, animate }: ArtProps) {
  const t = useLoop(animate, 800);
  const k = size / 100;
  const bounce = useAnimatedStyle(() => {
    const p = t.get() * TAU;
    return { transform: [{ translateY: -Math.abs(Math.sin(p)) * 5 * k }, { rotate: `${Math.sin(p) * 3}deg` }] };
  });
  // Mouth flaps open and shut with each "HA".
  const mouth = useAnimatedProps(() => {
    const o = 9 + 4 * Math.abs(Math.sin(t.get() * TAU * 2));
    return { d: `M37 54L63 54Q63 ${54 + o} 50 ${54 + o}Q37 ${54 + o} 37 54Z` };
  });
  return (
    <Layer size={size} style={[bounce, { transformOrigin: '50% 100%' }]}>
      <Limb d="M50 66L50 110" />
      <Limb d="M50 80L29 76L22 63" />
      <Limb d="M50 80L71 76L78 63" />
      <Head />
      <Feature d="M34 46L40 39.5L46 46M54 46L60 39.5L66 46" />
      <AnimatedPath animatedProps={mouth} fill={WHITE} />
    </Layer>
  );
}

function Lol({ size, animate }: ArtProps) {
  const t = useLoop(animate, 1100);
  const tilt = useAnimatedStyle(() => ({ transform: [{ rotate: `${Math.sin(t.get() * TAU) * 10}deg` }] }));
  return (
    <Layer size={size} style={[tilt, { transformOrigin: '50% 100%' }]}>
      <Limb d="M50 66L50 110" />
      {/* Both hands clutching the belly. */}
      <Limb d="M50 78L29 87L45 97" />
      <Limb d="M50 78L71 87L55 97" />
      <Circle cx={45} cy={97} r={3.6} fill={INK} />
      <Circle cx={55} cy={97} r={3.6} fill={INK} />
      <Head />
      <Feature d="M34 40L44 45L34 50M66 40L56 45L66 50" />
      <Path d="M37 55Q50 74 63 55Z" fill={WHITE} />
      <FlungTear t={t} x={31} y={45} dir={-1} phase={0} />
      <FlungTear t={t} x={69} y={45} dir={1} phase={0.5} />
      <FlungTear t={t} x={31} y={45} dir={-1} phase={0.5} />
      <FlungTear t={t} x={69} y={45} dir={1} phase={0} />
    </Layer>
  );
}

function Tongue({ size, animate }: ArtProps) {
  const t = useLoop(animate, 900);
  const k = size / 100;
  const wiggle = useAnimatedStyle(() => {
    const s = Math.sin(t.get() * TAU);
    return { transform: [{ translateX: s * 1.2 * k }, { rotate: `${s * 6}deg` }] };
  });
  // Tongue tip waggles side to side at double the body rate.
  const tongue = useAnimatedProps(() => {
    const w = Math.sin(t.get() * TAU * 2) * 3.5;
    return { d: `M44.5 61C44.5 71 ${44 + w} 77 ${50 + w} 77C${56 + w} 77 55.5 71 55.5 61Z` };
  });
  const groove = useAnimatedProps(() => {
    const w = Math.sin(t.get() * TAU * 2) * 3.5;
    return { d: `M50 62L${(50 + w * 0.7).toFixed(1)} 71` };
  });
  return (
    <Layer size={size} style={[wiggle, { transformOrigin: '50% 100%' }]}>
      <Limb d="M50 70L50 110" />
      {/* Hands up on top of the head, like taunting ears. */}
      <Limb d="M50 82L20 68L31 32" />
      <Limb d="M50 82L80 68L69 32" />
      <Head cy={48} r={22} />
      <Circle cx={31} cy={31} r={5} fill={INK} />
      <Circle cx={69} cy={31} r={5} fill={INK} />
      <Circle cx={41} cy={46} r={5.5} fill={WHITE} />
      <Circle cx={42.5} cy={46} r={2.5} fill={INK} />
      <Feature d="M54 47Q59 41.5 64 47" w={2.8} />
      <AnimatedPath animatedProps={tongue} fill={TONGUE} />
      <AnimatedPath animatedProps={groove} stroke="#B71C1C" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <Feature d="M39 59Q50 64 61 59" w={2.6} />
    </Layer>
  );
}

function Thumbs({ size, animate }: ArtProps) {
  const t = useLoop(animate, 2400);
  const enter = useEnter(animate, 120);
  // Thumb pops in with a spring, then gives a small proud pump every loop.
  const pop = useAnimatedStyle(() => {
    const u = t.get();
    const pump = u < 0.2 ? Math.sin((u / 0.2) * Math.PI) : 0;
    const e = enter.get();
    return { transform: [{ scale: e * (1 + 0.1 * pump) }, { rotate: `${(1 - e) * -35 - pump * 6}deg` }] };
  });
  const sparkle = useAnimatedProps(() => {
    const u = (t.get() + 0.5) % 1;
    const s = u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
    return { d: sparkleD(58, 51, 0.01 + 5 * s) };
  });
  return (
    <>
      <Layer size={size}>
        <Limb d="M42 68L42 110" />
        <Limb d="M42 80L26 92L32 104" />
        <Limb d="M42 80L62 90L72 76" />
        <Head cx={42} cy={46} r={22} />
        <Path d="M30 45.5A5 5 0 0 0 40 45.5Z" fill={WHITE} />
        <Path d="M45 45.5A5 5 0 0 0 55 45.5Z" fill={WHITE} />
        <Feature d="M29 39Q35 35 41 38M45 39L55 39" w={2.4} />
        <Path d="M31 54Q42 68 54 54Z" fill={WHITE} />
        <Line x1={32.5} y1={57.5} x2={52.5} y2={57.5} stroke={INK} strokeWidth={1.2} />
        <AnimatedPath animatedProps={sparkle} fill={WHITE} />
      </Layer>
      <Layer size={size} style={[pop, { transformOrigin: '76% 74%' }]}>
        <Rect x={70} y={48} width={7.5} height={19} rx={3.75} fill={INK} stroke={CARD} strokeWidth={1.4} />
        <Rect x={68} y={63} width={17} height={15} rx={4} fill={INK} stroke={CARD} strokeWidth={1.4} />
        <Path d="M77 67.5H84M77 71H84M77 74.5H84" stroke={CARD} strokeWidth={1} strokeLinecap="round" />
      </Layer>
    </>
  );
}

const ART: Record<EmoteId, (p: ArtProps) => ReactNode> = {
  angry: Angry,
  cry: Cry,
  cool: Cool,
  surrender: Surrender,
  dizzy: Dizzy,
  laugh: Laugh,
  lol: Lol,
  tongue: Tongue,
  thumbs: Thumbs,
};

// Rounded grey card with the animated stickman emote inside.
export function EmoteArt({ id, size, animate = true }: { id: EmoteId; size: number; animate?: boolean }) {
  const Art = ART[id];
  if (!Art) return null; // an emote id this build has no art for (e.g. from a newer opponent)
  return (
    <View style={[styles.card, { width: size, height: size, borderRadius: size * 0.14 }]}>
      {/* key: restart the entrance animations when the emote changes. */}
      <Art key={id} size={size} animate={animate} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Blood splatter
// ---------------------------------------------------------------------------

// Small deterministic PRNG so the same seed always paints the same splat.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth closed blob through jittered radial points (quadratic curves via midpoints).
function blobD(rand: () => number, cx: number, cy: number, base: number, n: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + (rand() - 0.5) * 0.6) / n) * TAU;
    const spike = rand() < 0.22 ? 1.3 + rand() * 0.25 : 1;
    const r = base * (0.72 + rand() * 0.4) * spike;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const f = (v: number) => v.toFixed(1);
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

type Drop = { cx: number; cy: number; rx: number; ry: number; rot: number };

function makeSplat(seed: number) {
  const rand = mulberry32(seed * 9973 + 17);
  const paths = [blobD(rand, 50, 50, 24, 16)];
  // A couple of satellite blobs hugging the main one.
  for (let i = 0; i < 2; i++) {
    const a = rand() * TAU;
    const dist = 22 + rand() * 8;
    paths.push(blobD(rand, 50 + Math.cos(a) * dist, 50 + Math.sin(a) * dist, 5 + rand() * 4, 9));
  }
  const drops: Drop[] = [];
  const count = 8 + Math.floor(rand() * 5);
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU;
    const dist = 31 + rand() * 13;
    const r = 1.2 + rand() * 3.2;
    // Further droplets are stretched along their flight direction.
    const stretch = 1 + (dist - 31) / 13;
    drops.push({
      cx: 50 + Math.cos(a) * dist,
      cy: 50 + Math.sin(a) * dist,
      rx: r * stretch,
      ry: r,
      rot: (a * 180) / Math.PI,
    });
  }
  return { paths, drops };
}

// Static organic blood splatter for screen-edge hit overlays.
export function BloodSplat({
  size,
  seed,
  color = '#8E0E14',
  opacity = 0.85,
}: {
  size: number;
  seed: number;
  color?: string;
  opacity?: number;
}) {
  const { paths, drops } = useMemo(() => makeSplat(seed), [seed]);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity} pointerEvents="none">
      {paths.map((d, i) => (
        <Path key={`b${i}`} d={d} fill={color} />
      ))}
      {drops.map((p, i) => (
        <Ellipse
          key={`d${i}`}
          cx={p.cx}
          cy={p.cy}
          rx={p.rx}
          ry={p.ry}
          fill={color}
          transform={`rotate(${p.rot.toFixed(1)} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)})`}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    overflow: 'hidden',
  },
});
