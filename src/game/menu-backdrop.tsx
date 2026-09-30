import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { Scenery } from '@/game/scenery';
import { SCENERY, STICKMAN } from '@/game/constants';
import { bowPath, bowStringPath, hatPath, stickmanPath, type Pose } from '@/game/stickman';
import type { Skin } from '@/game/skins';

// Living backdrop for the menu: the game's scenery with drifting clouds and
// your equipped archer idling on a pillar. A dark scrim keeps text readable.
export function MenuBackdrop({ skin }: { skin: Skin }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {size.w > 0 && <Scene w={size.w} h={size.h} skin={skin} />}
    </View>
  );
}

function Scene({ w, h, skin }: { w: number; h: number; skin: Skin }) {
  const groundY = h * 0.86;
  const clock = useSharedValue(0);
  useFrameCallback((f) => {
    clock.value += Math.min((f.timeSincePreviousFrame ?? 16) / 1000, 0.05);
  });

  const x = w * 0.78;
  const top = groundY - 70;
  const pose = useDerivedValue<Pose>(() => {
    const t = clock.value;
    // Slow idle: breathing plus a lazy draw-and-relax of the bow.
    const cycle = (Math.sin(t * 0.9) + 1) / 2;
    return {
      x,
      y: top,
      facing: -1,
      armAngle: Math.PI + 0.35 + Math.sin(t * 0.45) * 0.12,
      fall: 0,
      hat: skin.hat,
      draw: cycle > 0.6 ? (cycle - 0.6) * 1.8 : 0,
      breathe: Math.sin(t * 2.1) * 1.2,
    };
  });
  const body = useDerivedValue(() => stickmanPath(pose.value));
  const hat = useDerivedValue(() => hatPath(pose.value));
  const bow = useDerivedValue(() => bowPath(pose.value));
  const string = useDerivedValue(() => bowStringPath(pose.value));
  const pillar = Skia.Path.Make();
  pillar.addRRect(Skia.RRectXY(Skia.XYWHRect(x - 24, top, 48, groundY - top + 4), 3, 3));

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Scenery w={w} h={h} groundY={groundY} seed={20261008} clock={clock} />
      <Path path={pillar}>
        <LinearGradient start={vec(x - 24, 0)} end={vec(x + 24, 0)} colors={[SCENERY.pillarLight, SCENERY.pillarDark]} />
      </Path>
      <Path path={bow} color={skin.bow} style="stroke" strokeWidth={3.5} strokeCap="round" />
      <Path path={string} color="rgba(255,255,255,0.75)" style="stroke" strokeWidth={1} />
      <Path path={body} color={skin.body} style="stroke" strokeWidth={STICKMAN.lineWidth} strokeCap="round" strokeJoin="round" />
      <Path path={hat} color={skin.accent} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" />
      {/* Scrim: darker at top and bottom where the text and buttons sit */}
      <Rect x={0} y={0} width={w} height={h}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, h)}
          colors={['rgba(10,12,28,0.55)', 'rgba(10,12,28,0.1)', 'rgba(10,12,28,0.7)']}
          positions={[0, 0.45, 1]}
        />
      </Rect>
    </Canvas>
  );
}
