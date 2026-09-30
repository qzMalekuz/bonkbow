import { useMemo } from 'react';
import { BlurMask, Circle, Group, LinearGradient, Oval, Path, Rect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SCENERY } from '@/game/constants';
import { mulberry32 } from '@/game/rng';

// Layered painted backdrop drawn with Skia: dusk sky, glowing sun, drifting
// clouds, two mountain ranges with atmospheric fade, a tree line, and a
// grassy ground band. Geometry is deterministic from `seed` and built once;
// only the clouds animate (driven by the `clock` shared value, UI thread).
// Must be rendered inside a Skia <Canvas>.

type Props = {
  w: number;
  h: number;
  groundY: number;
  seed: number;
  clock: SharedValue<number>; // seconds, advanced by the parent's frame callback
};

// Smooth ridge line: random control heights joined with quadratic curves.
const ridge = (w: number, baseY: number, amp: number, points: number, rnd: () => number, bottom: number): SkPath => {
  const p = Skia.Path.Make();
  const step = w / (points - 1);
  const ys = Array.from({ length: points }, () => baseY - rnd() * amp);
  p.moveTo(-10, bottom);
  p.lineTo(-10, ys[0]);
  for (let i = 1; i < points; i++) {
    const x0 = (i - 1) * step;
    const x1 = i * step;
    p.quadTo(x0 + step / 2, Math.min(ys[i - 1], ys[i]) - amp * 0.15, x1, ys[i]);
  }
  p.lineTo(w + 10, ys[points - 1]);
  p.lineTo(w + 10, bottom);
  p.close();
  return p;
};

// Pine silhouettes along the horizon.
const treeLine = (w: number, groundY: number, rnd: () => number): SkPath => {
  const p = Skia.Path.Make();
  let x = -10;
  while (x < w + 20) {
    const th = 18 + rnd() * 26;
    const tw = th * 0.42;
    p.moveTo(x, groundY + 2);
    p.lineTo(x + tw / 2, groundY - th);
    p.lineTo(x + tw, groundY + 2);
    p.close();
    x += tw * (0.55 + rnd() * 0.5);
  }
  return p;
};

// Short grass blades on the ground's top edge.
const grass = (w: number, groundY: number, rnd: () => number): SkPath => {
  const p = Skia.Path.Make();
  for (let x = 0; x < w; x += 5 + rnd() * 6) {
    const bh = 3 + rnd() * 6;
    const lean = (rnd() - 0.5) * 4;
    p.moveTo(x, groundY + 2);
    p.lineTo(x + lean, groundY - bh);
  }
  return p;
};

type Cloud = { x: number; y: number; s: number; speed: number };

function CloudPuff({ cloud, w, clock }: { cloud: Cloud; w: number; clock: SharedValue<number> }) {
  const span = w + 240;
  const transform = useDerivedValue(() => {
    const x = ((((cloud.x + clock.value * cloud.speed) % span) + span) % span) - 120;
    return [{ translateX: x }, { translateY: cloud.y }, { scale: cloud.s }];
  });
  return (
    <Group transform={transform} opacity={0.85}>
      <Oval x={-50} y={-14} width={100} height={30} color={SCENERY.cloud} />
      <Oval x={-28} y={-30} width={56} height={40} color={SCENERY.cloud} />
      <Oval x={4} y={-22} width={44} height={30} color={SCENERY.cloud} />
      <BlurMask blur={3} style="normal" />
    </Group>
  );
}

export function Scenery({ w, h, groundY, seed, clock }: Props) {
  const geo = useMemo(() => {
    const rnd = mulberry32(seed ^ 0x5bd1e995);
    const clouds: Cloud[] = Array.from({ length: 4 }, (_, i) => ({
      x: rnd() * w,
      y: h * (0.08 + rnd() * 0.22),
      s: 0.6 + rnd() * 0.7,
      speed: 6 + rnd() * 10 + i * 2,
    }));
    return {
      far: ridge(w, groundY - h * 0.2, h * 0.16, 7, rnd, groundY),
      near: ridge(w, groundY - h * 0.08, h * 0.1, 9, rnd, groundY),
      trees: treeLine(w, groundY, rnd),
      grass: grass(w, groundY, rnd),
      clouds,
      sunX: w * (0.62 + rnd() * 0.25),
      sunY: h * (0.2 + rnd() * 0.12),
    };
  }, [w, h, groundY, seed]);

  return (
    <Group>
      {/* Sky */}
      <Rect x={0} y={0} width={w} height={groundY}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, groundY)}
          colors={[SCENERY.skyTop, SCENERY.skyMid, SCENERY.skyHorizon]}
          positions={[0, 0.55, 1]}
        />
      </Rect>

      {/* Sun with soft glow */}
      <Circle cx={geo.sunX} cy={geo.sunY} r={70} color={SCENERY.sunGlow} opacity={0.35}>
        <BlurMask blur={40} style="normal" />
      </Circle>
      <Circle cx={geo.sunX} cy={geo.sunY} r={30} color={SCENERY.sun}>
        <BlurMask blur={4} style="solid" />
      </Circle>

      {geo.clouds.map((c, i) => (
        <CloudPuff key={i} cloud={c} w={w} clock={clock} />
      ))}

      {/* Mountains: far range is lighter and hazier (atmospheric perspective) */}
      <Path path={geo.far} opacity={0.9}>
        <LinearGradient start={vec(0, groundY - h * 0.36)} end={vec(0, groundY)} colors={[SCENERY.farTop, SCENERY.farBottom]} />
      </Path>
      <Path path={geo.near}>
        <LinearGradient start={vec(0, groundY - h * 0.18)} end={vec(0, groundY)} colors={[SCENERY.nearTop, SCENERY.nearBottom]} />
      </Path>
      <Path path={geo.trees} color={SCENERY.trees} />

      {/* Ground */}
      <Rect x={0} y={groundY} width={w} height={h - groundY}>
        <LinearGradient start={vec(0, groundY)} end={vec(0, h)} colors={[SCENERY.groundTop, SCENERY.groundBottom]} />
      </Rect>
      <Rect x={0} y={groundY} width={w} height={3} color={SCENERY.grassEdge} />
      <Path path={geo.grass} color={SCENERY.grassEdge} style="stroke" strokeWidth={1.5} strokeCap="round" />
    </Group>
  );
}
