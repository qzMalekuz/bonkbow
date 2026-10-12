import { useMemo } from 'react';
import { PixelRatio, StyleSheet, useWindowDimensions } from 'react-native';

// One UI scale for every screen. The menus were laid out on a landscape phone
// about 390 dp tall and 700+ dp wide; `scale` maps that design onto the real
// window so a 360 dp phone, a 21:9 phone, a foldable and a 4:3 tablet all
// show the same layout at a sensible size.
//
// - Scale follows the short side, but never so far that the design's minimum
//   width (DESIGN_W) stops fitting: on a boxy 4:3 or 16:10 screen the width
//   is what runs out first.
// - Growth above the design size is damped (a tablet gets bigger UI, not 2x).
// - `vw` / `vh` are the window in design units (window / scale): use them for
//   layout decisions (`vh < 360` → stack tighter or scroll).
//
// System font size is separate: every Text goes through ui/Text.tsx, which
// lets the OS setting grow text up to MAX_FONT_SCALE on top of this.
export const DESIGN_H = 390;
export const DESIGN_W = 700;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.75;
const GROWTH = 0.7;

const fit = (k: number) => (k <= 1 ? Math.max(MIN_SCALE, k) : Math.min(MAX_SCALE, 1 + (k - 1) * GROWTH));

export type Metrics = {
  width: number;
  height: number;
  // Design-unit window (window / scale).
  vw: number;
  vh: number;
  aspect: number; // long side / short side
  scale: number;
  // A design size in dp at this scale, rounded to the pixel grid.
  s: (n: number) => number;
  // Short landscape phone: less than the design height once scaled.
  compact: boolean;
  // 20:9 and longer.
  wide: boolean;
  // Tablets, foldables (4:3 … 16:10).
  boxy: boolean;
};

export function metricsFor(width: number, height: number): Metrics {
  const long = Math.max(width, height);
  const short = Math.max(1, Math.min(width, height));
  const scale = Math.min(fit(short / DESIGN_H), fit(long / DESIGN_W));
  const aspect = long / short;
  return {
    width,
    height,
    vw: width / scale,
    vh: height / scale,
    aspect,
    scale,
    s: (n: number) => PixelRatio.roundToNearestPixel(n * scale),
    compact: short / scale < 360,
    wide: aspect >= 2.1,
    boxy: aspect < 1.7,
  };
}

export function useMetrics(): Metrics {
  const { width, height } = useWindowDimensions();
  return useMemo(() => metricsFor(width, height), [width, height]);
}

// A StyleSheet that follows the window: write the styles in design units
// through `m.s()`, call the returned hook in each component that uses them.
//   const useStyles = makeStyles((m) => ({ title: { fontSize: m.s(28) } }));
//   const styles = useStyles();
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (m: Metrics) => T & StyleSheet.NamedStyles<any>) {
  return function useStyles(): T {
    const m = useMetrics();
    return useMemo(() => StyleSheet.create(factory(m)), [m]);
  };
}
