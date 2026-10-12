import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';
import { DERPS, HEAD_BOX, INK, derpDrawing, faceFor, type DerpId, type HatId, type InkPrim } from '@/game/derps';

// A derp's head (and hat) as a small SVG drawing, for shop cards and the
// style picker: the same ink primitives the 3D rig draws, frozen at one
// moment. Framed on the head's box plus room for the hat.

const T = 0.6; // the frozen moment: eyes mid-wander, a bit of drool
const PAD = 0.14;
const CHIN = -0.45; // drool hangs below the neck
const PEN = 1.3; // a slightly fatter pen, so the ink still reads at thumbnail size

export function DerpThumb({ derp, hat = 'none', size, style }: { derp: DerpId; hat?: HatId; size: number; style?: ViewStyle }) {
  const d = DERPS[derp] ?? DERPS.gary;
  const { prims, box } = useMemo(() => {
    const prims = derpDrawing(d.shape, hat, faceFor('neutral'), T, d.seed);
    const b = HEAD_BOX[d.shape];
    let minX = b.minX;
    let maxX = b.maxX;
    let maxY = b.maxY;
    // The hat sticks out past the head: grow the frame to whatever it draws.
    if (hat !== 'none') {
      for (const p of prims) {
        const pts = p.k === 'dot' ? [p.c] : p.pts;
        for (const [x, y] of pts) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    // Square, centred on the drawing.
    const side = Math.max(maxX - minX, maxY - CHIN) + PAD * 2;
    const cx = (minX + maxX) / 2;
    const cy = (CHIN + maxY) / 2;
    return { prims, box: { x: cx - side / 2, y: -(cy + side / 2), side } };
  }, [d, hat]);

  return (
    <Svg width={size} height={size} viewBox={`${box.x} ${box.y} ${box.side} ${box.side}`} style={style}>
      {prims.map((p, i) => (
        <Prim key={i} p={p} />
      ))}
    </Svg>
  );
}

// Head units are y up; SVG is y down.
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x},${-y}`).join(' ');

function Prim({ p }: { p: InkPrim }) {
  const col = p.col ?? INK;
  switch (p.k) {
    case 'blob':
      return <Polygon points={pts(p.pts)} fill={p.fill} stroke={col} strokeWidth={p.w * PEN} strokeLinejoin="round" />;
    case 'line':
      return <Polyline points={pts(p.pts)} fill="none" stroke={col} strokeWidth={p.w * PEN} strokeLinecap="round" strokeLinejoin="round" />;
    case 'dot':
      return <Circle cx={p.c[0]} cy={-p.c[1]} r={p.r} fill={col} />;
  }
}
