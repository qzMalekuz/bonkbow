import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '@/game/haptics';
import { playSfx, type Sfx } from '@/audio/sound';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  // Click sound on press; null for silent buttons. Honours Settings → Sound.
  sound?: Sfx | null;
};

// App-wide button: springy press-in scale, a light haptic tap and a subtle
// click, all honouring the Settings toggles. Runs the animation on the UI
// thread so it stays smooth while JS is busy.
export function HapticTouchable({ onPress, onPressIn, onPressOut, style, sound = 'ui_click', disabled, ...props }: Props) {
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.045 }],
    opacity: disabled ? 0.5 : 1 - pressed.value * 0.15,
  }));
  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      style={[style, anim]}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, { damping: 12, stiffness: 320 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        haptic.tap();
        if (sound) playSfx(sound);
        onPress?.(e);
      }}
    />
  );
}
