import { Skia, type SkPath } from '@shopify/react-native-skia';
import { STICKMAN } from '@/game/constants';
import type { Hat } from '@/game/skins';

// Procedural stickman — a circle head plus line segments. Drawn on the UI
// thread inside useDerivedValue (Skia objects can be created in worklets), so
// every function here is a worklet. No sprite assets needed; the bow arm
// rotates to the exact aim angle and death is a whole-body tip-over. Skins
// change colors and add a hat path.

export type Facing = 1 | -1; // 1 = facing right (self), -1 = facing left (opponent)

export type Pose = {
  x: number; // feet x (ground contact)
  y: number; // feet y (ground contact)
  facing: Facing;
  armAngle: number; // radians, bow arm direction in screen space (y down)
  fall: number; // 0 = standing, 1 = fully fallen (death animation progress)
  hat: Hat;
};

export const bodyHeight = () => {
  'worklet';
  return STICKMAN.legLen + STICKMAN.torso + STICKMAN.neck + STICKMAN.headR * 2;
};

// Key joints for a standing figure, before the death rotation is applied.
const joints = (p: Pose) => {
  'worklet';
  const hipY = p.y - STICKMAN.legLen;
  const shoulderY = hipY - STICKMAN.torso;
  const headCY = shoulderY - STICKMAN.neck - STICKMAN.headR;
  return { hipY, shoulderY, headCY };
};

// Rotate a point around the feet so the figure tips over on death.
const tip = (px: number, py: number, p: Pose) => {
  'worklet';
  if (p.fall === 0) return { x: px, y: py };
  const a = p.fall * (Math.PI / 2) * -p.facing; // fall away from the opponent
  const dx = px - p.x;
  const dy = py - p.y;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: p.x + dx * cos - dy * sin, y: p.y + dx * sin + dy * cos };
};

export const stickmanPath = (p: Pose): SkPath => {
  'worklet';
  const path = Skia.Path.Make();
  const { hipY, shoulderY, headCY } = joints(p);
  const f = p.facing;

  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const a = tip(x1, y1, p);
    const b = tip(x2, y2, p);
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
  };

  // Torso
  seg(p.x, hipY, p.x, shoulderY);
  // Legs (slight stance)
  seg(p.x, hipY, p.x - 9, p.y);
  seg(p.x, hipY, p.x + 9, p.y);
  // Bow arm: from shoulder along armAngle. Rear arm: pulled back at the chest.
  const hx = p.x + Math.cos(p.armAngle) * STICKMAN.armLen;
  const hy = shoulderY + Math.sin(p.armAngle) * STICKMAN.armLen;
  seg(p.x, shoulderY, hx, hy);
  seg(p.x, shoulderY, p.x - f * 10, shoulderY + 12);

  // Head as a full circle
  const h = tip(p.x, headCY, p);
  path.addCircle(h.x, h.y, STICKMAN.headR);
  return path;
};

// Hat / accessory in the skin's accent color. Drawn in head space then tipped.
export const hatPath = (p: Pose): SkPath => {
  'worklet';
  const path = Skia.Path.Make();
  if (p.hat === 'none') return path;
  const { headCY } = joints(p);
  const r = STICKMAN.headR;
  const top = headCY - r;
  const f = p.facing;
  const pt = (x: number, y: number) => tip(x, y, p);
  const move = (x: number, y: number) => {
    const q = pt(x, y);
    path.moveTo(q.x, q.y);
  };
  const line = (x: number, y: number) => {
    const q = pt(x, y);
    path.lineTo(q.x, q.y);
  };

  switch (p.hat) {
    case 'cap': {
      // Backwards cap: dome + brim pointing away from the opponent
      move(p.x - r, top + 3);
      line(p.x + r, top + 3);
      line(p.x + r * 0.7, top - 4);
      line(p.x - r * 0.7, top - 4);
      path.close();
      move(p.x - f * r, top + 3);
      line(p.x - f * (r + 9), top + 5);
      break;
    }
    case 'crown': {
      const b = top + 2;
      move(p.x - r * 0.9, b);
      line(p.x - r * 0.9, b - 9);
      line(p.x - r * 0.45, b - 4);
      line(p.x, b - 11);
      line(p.x + r * 0.45, b - 4);
      line(p.x + r * 0.9, b - 9);
      line(p.x + r * 0.9, b);
      path.close();
      break;
    }
    case 'horns': {
      move(p.x - r * 0.7, top + 2);
      line(p.x - r * 1.1, top - 9);
      line(p.x - r * 0.3, top + 1);
      path.close();
      move(p.x + r * 0.7, top + 2);
      line(p.x + r * 1.1, top - 9);
      line(p.x + r * 0.3, top + 1);
      path.close();
      break;
    }
    case 'halo': {
      const c = pt(p.x, top - 7);
      path.addOval(Skia.XYWHRect(c.x - r * 0.9, c.y - 3, r * 1.8, 6));
      break;
    }
    case 'visor': {
      // Seeker visor: a flat band across the eyes, open at the back.
      const y = headCY - r * 0.25;
      move(p.x - f * r * 0.2, y - 3);
      line(p.x + f * (r + 5), y - 3);
      line(p.x + f * (r + 5), y + 3);
      line(p.x - f * r * 0.2, y + 3);
      path.close();
      break;
    }
    case 'hood': {
      // Open hood: arc over the head, draping to the shoulders
      const c = pt(p.x, headCY);
      path.addArc(Skia.XYWHRect(c.x - r - 4, c.y - r - 4, (r + 4) * 2, (r + 4) * 2), 180, 180);
      move(p.x - r - 4, headCY);
      line(p.x - r - 6, headCY + r + 6);
      move(p.x + r + 4, headCY);
      line(p.x + r + 6, headCY + r + 6);
      break;
    }
  }
  return path;
};

// Bow: an arc at the hand, perpendicular to the aim. Returns a path.
export const bowPath = (p: Pose): SkPath => {
  'worklet';
  const path = Skia.Path.Make();
  if (p.fall > 0) return path;
  const { shoulderY } = joints(p);
  const hx = p.x + Math.cos(p.armAngle) * STICKMAN.armLen;
  const hy = shoulderY + Math.sin(p.armAngle) * STICKMAN.armLen;
  const r = 20;
  const perp = p.armAngle + Math.PI / 2;
  const ax = hx + Math.cos(perp) * r;
  const ay = hy + Math.sin(perp) * r;
  const bx = hx - Math.cos(perp) * r;
  const by = hy - Math.sin(perp) * r;
  // Control point pushed forward along the aim to bow the string
  const cx = hx + Math.cos(p.armAngle) * 14;
  const cy = hy + Math.sin(p.armAngle) * 14;
  path.moveTo(ax, ay);
  path.quadTo(cx, cy, bx, by);
  // String
  path.moveTo(ax, ay);
  path.lineTo(bx, by);
  return path;
};

// Where a fired arrow starts: the bow hand.
export const handPoint = (p: Pose) => {
  'worklet';
  const { shoulderY } = joints(p);
  return {
    x: p.x + Math.cos(p.armAngle) * STICKMAN.armLen,
    y: shoulderY + Math.sin(p.armAngle) * STICKMAN.armLen,
  };
};

// Hit test for an arrow tip against a STANDING figure (dead ones don't count).
// Returns 'head' | 'body' | null.
export const hitTest = (p: Pose, tx: number, ty: number): 'head' | 'body' | null => {
  'worklet';
  if (p.fall > 0) return null;
  const { shoulderY, headCY } = joints(p);
  const dx = tx - p.x;
  const dy = ty - headCY;
  if (dx * dx + dy * dy <= (STICKMAN.headR + 2) * (STICKMAN.headR + 2)) return 'head';
  if (Math.abs(dx) <= STICKMAN.hitHalfWidth && ty >= shoulderY - STICKMAN.neck && ty <= p.y) return 'body';
  return null;
};

// Center of the head — the enemy AI aims here.
export const headCenter = (p: Pose) => {
  'worklet';
  return { x: p.x, y: joints(p).headCY };
};
