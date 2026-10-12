import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { HapticTouchable } from '@/components/haptic-touchable';
import type { Sfx } from '@/audio/sound';

// Shared game-UI building blocks in the reference game's style: a rounded
// bold font, chunky buttons with a darker bottom edge, heart/shield bars and
// laurel badges.

export const FONT = {
  medium: 'Fredoka_500Medium',
  semi: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
};

export const INK = '#0B0B0F';

const BUTTONS = {
  orange: { face: '#FFB020', edge: '#C77A00', text: INK },
  green: { face: '#7CC23A', edge: '#4E8A1C', text: '#FFFFFF' },
  purple: { face: '#8E6CEF', edge: '#5B3FB8', text: '#FFFFFF' },
  blue: { face: '#3FA4F0', edge: '#1F6FB0', text: '#FFFFFF' },
  red: { face: '#E5484D', edge: '#A3252A', text: '#FFFFFF' },
  dark: { face: 'rgba(20,22,34,0.85)', edge: 'rgba(0,0,0,0.6)', text: '#FFFFFF' },
} as const;

export type ButtonColor = keyof typeof BUTTONS;

export function GameButton({
  label,
  color = 'orange',
  onPress,
  icon,
  style,
  textStyle,
  disabled,
  sound,
  small,
}: {
  label: string;
  color?: ButtonColor;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  sound?: Sfx | null;
  small?: boolean;
}) {
  const c = BUTTONS[color];
  return (
    <HapticTouchable onPress={onPress} disabled={disabled} sound={sound} style={[styles.btnWrap, style]}>
      <View style={[styles.btnEdge, { backgroundColor: c.edge }]} />
      <View style={[styles.btnFace, small && styles.btnFaceSmall, { backgroundColor: c.face }]}>
        {icon}
        <Text style={[styles.btnText, small && styles.btnTextSmall, { color: c.text }, textStyle]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </HapticTouchable>
  );
}

// The coin: what matches pay and the coin shop spends.
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Circle cx={13} cy={13} r={11} fill="#F7A21B" stroke="#B85C00" strokeWidth={2} />
      <Circle cx={13} cy={13} r={7} fill="#FFC83D" />
      <Path d="M10 9.5h6M13 9.5v7" stroke="#B85C00" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Coin balance chip; pops whenever the balance changes.
export function CoinPill({ coins, style }: { coins: number; style?: StyleProp<ViewStyle> }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = withSequence(withTiming(1.18, { duration: 110 }), withTiming(1, { duration: 260 }));
  }, [coins, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.coinPill, popStyle, style]}>
      <CoinIcon size={18} />
      <Text style={styles.coinText}>{coins.toLocaleString()}</Text>
    </Animated.View>
  );
}

// Heart / shield icons (SVG so they stay crisp at any size).
export function HeartIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21.3 3.6 13.2C1.2 10.9 1.2 7 3.6 4.8 5.9 2.6 9.4 2.8 11.4 5.2L12 5.9l.6-.7c2-2.4 5.5-2.6 7.8-.4 2.4 2.2 2.4 6.1 0 8.4Z"
        fill="#E5383B"
        stroke="#7A0F12"
        strokeWidth={1.4}
      />
      <Path d="M6 7.2c.8-1.2 2.2-1.6 3.2-1" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function ShieldIcon({ size = 22, broken = false }: { size?: number; broken?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5 20 5.6v6.1c0 4.9-3.3 8.4-8 9.8-4.7-1.4-8-4.9-8-9.8V5.6Z"
        fill={broken ? '#46505C' : '#2F8CE0'}
        stroke={broken ? '#20262E' : '#0F4C8A'}
        strokeWidth={1.4}
      />
      {broken ? (
        <Path d="M12 4 10.5 9l3 2.4L11 15l1.5 4" stroke="#20262E" strokeWidth={1.6} fill="none" />
      ) : (
        <Path d="M8 7.2c1-.6 2.4-1 3.4-1" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      )}
    </Svg>
  );
}

// A value bar: smooth drain plus a pale "recent damage" ghost that lags
// behind; the number pulses when it changes.
export function StatBar({
  value,
  max,
  color,
  icon,
  right,
  width = 110,
}: {
  value: number;
  max: number;
  color: string;
  icon: React.ReactNode;
  right?: boolean;
  width?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const fill = useSharedValue(pct);
  const ghost = useSharedValue(pct);
  const pop = useSharedValue(1);
  useEffect(() => {
    fill.value = withTiming(pct, { duration: 240 });
    ghost.value = pct >= ghost.value ? pct : withSequence(withTiming(ghost.value, { duration: 380 }), withTiming(pct, { duration: 480 }));
    pop.value = withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 220 }));
  }, [pct, fill, ghost, pop]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const ghostStyle = useAnimatedStyle(() => ({ width: `${ghost.value * 100}%` }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <View style={[styles.stat, right && styles.statRight]}>
      <View style={styles.statIcon}>{icon}</View>
      <View style={[styles.statTrack, { width }, right && { transform: [{ scaleX: -1 }] }]}>
        <Animated.View style={[styles.statGhost, ghostStyle]} />
        <Animated.View style={[styles.statFill, fillStyle, { backgroundColor: color }]} />
        <View style={styles.statGloss} />
      </View>
      <Animated.Text style={[styles.statNum, right ? styles.statNumRight : styles.statNumLeft, popStyle]}>{Math.ceil(value)}</Animated.Text>
    </View>
  );
}

// "VICTORY!" / "Defeat" plaque between two laurel sprigs.
export function LaurelBadge({ label, win }: { label: string; win: boolean }) {
  const leaf = win ? '#7CC23A' : '#7CC23A';
  return (
    <View style={styles.laurelRow}>
      <Laurel color={leaf} />
      <View style={[styles.plaque, { backgroundColor: win ? '#7B5CE0' : '#C8442E', borderColor: win ? '#F7C948' : '#F7A440' }]}>
        <Text style={styles.plaqueText}>{label}</Text>
      </View>
      <Laurel color={leaf} flip />
    </View>
  );
}

function Laurel({ color, flip }: { color: string; flip?: boolean }) {
  return (
    <Svg width={26} height={40} viewBox="0 0 26 40" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d="M20 38C8 32 4 20 8 6" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {[8, 15, 22, 29].map((y, i) => (
        <Path key={y} d={`M${10 - i * 0.5} ${y}c-6-1-8-5-7-8 4 0 7 3 7 8Z`} fill={color} />
      ))}
      {[11, 18, 25, 32].map((y, i) => (
        <Path key={`r${y}`} d={`M${11 + i * 1.6} ${y}c4-3 8-2 9 1-3 2-7 2-9-1Z`} fill={color} />
      ))}
    </Svg>
  );
}

export const TIPS = [
  'Drag back to aim. Further back, harder shot. This is the whole skill.',
  'Headshots go straight through the shield. The hat does not help.',
  'Body hits chew through the blue shield first. Leg hits split it half and half.',
  'The green dots are your last shot. Do something different.',
  'Hold the magnifier to see the whole field, and how far away he is.',
  'Run out of time and whatever you were doing gets fired. Or dropped.',
  'Shoot straight up and it comes straight back down. On you.',
  'The other guy gets better as you do. He will not say how.',
  'Hats, heads and the shovel bow change nothing. Wear them anyway.',
  'Every match pays coins. Your first match of the day pays extra.',
  'Coins buy clothes, arrows and new idiots. They still do not help.',
  'Tap the chat bubble to say something. He will not listen.',
];

const styles = StyleSheet.create({
  btnWrap: { borderRadius: 14, paddingBottom: 5 },
  btnEdge: { ...StyleSheet.absoluteFill, top: 5, borderRadius: 14 },
  btnFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  btnFaceSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnText: { fontFamily: FONT.bold, fontSize: 18, letterSpacing: 0.5 },
  btnTextSmall: { fontSize: 14 },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,200,61,0.45)',
  },
  coinText: { fontFamily: FONT.bold, fontSize: 15, color: '#FFFFFF' },
  stat: { flexDirection: 'row', alignItems: 'center' },
  statRight: { flexDirection: 'row-reverse' },
  statIcon: { zIndex: 2, marginRight: -8, marginLeft: -8 },
  statTrack: {
    height: 18,
    borderRadius: 6,
    backgroundColor: '#0E0E12',
    borderWidth: 1.5,
    borderColor: '#000000',
    overflow: 'hidden',
  },
  statFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  statGhost: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.75)' },
  statGloss: { position: 'absolute', left: 2, right: 2, top: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  statNum: {
    position: 'absolute',
    fontFamily: FONT.bold,
    fontSize: 13,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statNumLeft: { left: 18 },
  statNumRight: { right: 18 },
  laurelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  plaque: { borderRadius: 10, borderWidth: 3, paddingHorizontal: 14, paddingVertical: 4 },
  plaqueText: {
    fontFamily: FONT.bold,
    fontSize: 18,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
});
