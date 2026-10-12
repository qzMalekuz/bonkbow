import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { HapticTouchable } from '@/components/haptic-touchable';
import type { Sfx } from '@/audio/sound';
import { AnimatedText, Text, TIGHT_FONT_SCALE } from '@/ui/Text';
import { makeStyles, useMetrics } from '@/ui/responsive';

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
  const styles = useStyles();
  const c = BUTTONS[color];
  return (
    <HapticTouchable onPress={onPress} disabled={disabled} sound={sound} style={[styles.btnWrap, style]}>
      <View style={[styles.btnEdge, { backgroundColor: c.edge }]} />
      <View style={[styles.btnFace, small && styles.btnFaceSmall, { backgroundColor: c.face }]}>
        {icon}
        <Text
          style={[styles.btnText, small && styles.btnTextSmall, { color: c.text }, textStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>
      </View>
    </HapticTouchable>
  );
}

// The coin: what matches pay and the coin shop spends.
export function CoinIcon({ size: design = 18 }: { size?: number }) {
  const size = useMetrics().s(design);
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
  const styles = useStyles();
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = withSequence(withTiming(1.18, { duration: 110 }), withTiming(1, { duration: 260 }));
  }, [coins, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.coinPill, popStyle, style]}>
      <CoinIcon size={18} />
      <Text style={styles.coinText} maxFontSizeMultiplier={TIGHT_FONT_SCALE} numberOfLines={1}>
        {coins.toLocaleString()}
      </Text>
    </Animated.View>
  );
}

// Heart / shield icons (SVG so they stay crisp at any size).
export function HeartIcon({ size: design = 22 }: { size?: number }) {
  const size = useMetrics().s(design);
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

export function ShieldIcon({ size: design = 22, broken = false }: { size?: number; broken?: boolean }) {
  const size = useMetrics().s(design);
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
  width: designWidth = 110,
}: {
  value: number;
  max: number;
  color: string;
  icon: React.ReactNode;
  right?: boolean;
  width?: number;
}) {
  const styles = useStyles();
  const width = useMetrics().s(designWidth);
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
      <AnimatedText
        style={[styles.statNum, right ? styles.statNumRight : styles.statNumLeft, popStyle]}
        maxFontSizeMultiplier={TIGHT_FONT_SCALE}
      >
        {Math.ceil(value)}
      </AnimatedText>
    </View>
  );
}

// "VICTORY!" / "Defeat" plaque between two laurel sprigs.
export function LaurelBadge({ label, win }: { label: string; win: boolean }) {
  const styles = useStyles();
  const leaf = win ? '#7CC23A' : '#7CC23A';
  return (
    <View style={styles.laurelRow}>
      <Laurel color={leaf} />
      <View style={[styles.plaque, { backgroundColor: win ? '#7B5CE0' : '#C8442E', borderColor: win ? '#F7C948' : '#F7A440' }]}>
        <Text style={styles.plaqueText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {label}
        </Text>
      </View>
      <Laurel color={leaf} flip />
    </View>
  );
}

function Laurel({ color, flip }: { color: string; flip?: boolean }) {
  const { s } = useMetrics();
  return (
    <Svg width={s(26)} height={s(40)} viewBox="0 0 26 40" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
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

const useStyles = makeStyles((m) => ({
  btnWrap: { borderRadius: m.s(14), paddingBottom: m.s(5) },
  btnEdge: { ...StyleSheet.absoluteFill, top: m.s(5), borderRadius: m.s(14) },
  btnFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.s(8),
    borderRadius: m.s(14),
    paddingVertical: m.s(12),
    paddingHorizontal: m.s(18),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  btnFaceSmall: { paddingVertical: m.s(8), paddingHorizontal: m.s(12) },
  btnText: { fontFamily: FONT.bold, fontSize: m.s(18), letterSpacing: m.s(0.5) },
  btnTextSmall: { fontSize: m.s(14) },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.s(6),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: m.s(10),
    paddingLeft: m.s(6),
    paddingRight: m.s(12),
    paddingVertical: m.s(5),
    borderWidth: 1.5,
    borderColor: 'rgba(255,200,61,0.45)',
  },
  coinText: { fontFamily: FONT.bold, fontSize: m.s(15), color: '#FFFFFF' },
  stat: { flexDirection: 'row', alignItems: 'center' },
  statRight: { flexDirection: 'row-reverse' },
  statIcon: { zIndex: 2, marginRight: m.s(-8), marginLeft: m.s(-8) },
  statTrack: {
    height: m.s(18),
    borderRadius: m.s(6),
    backgroundColor: '#0E0E12',
    borderWidth: 1.5,
    borderColor: '#000000',
    overflow: 'hidden',
  },
  statFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: m.s(4) },
  statGhost: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: m.s(4), backgroundColor: 'rgba(255,255,255,0.75)' },
  statGloss: { position: 'absolute', left: m.s(2), right: m.s(2), top: m.s(1), height: m.s(5), borderRadius: m.s(3), backgroundColor: 'rgba(255,255,255,0.22)' },
  statNum: {
    position: 'absolute',
    fontFamily: FONT.bold,
    fontSize: m.s(13),
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: m.s(1) },
    textShadowRadius: 2,
  },
  statNumLeft: { left: m.s(18) },
  statNumRight: { right: m.s(18) },
  laurelRow: { flexDirection: 'row', alignItems: 'center', gap: m.s(2) },
  plaque: { borderRadius: m.s(10), borderWidth: 3, paddingHorizontal: m.s(14), paddingVertical: m.s(4) },
  plaqueText: {
    fontFamily: FONT.bold,
    fontSize: m.s(18),
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: m.s(2) },
    textShadowRadius: 2,
  },
}));
