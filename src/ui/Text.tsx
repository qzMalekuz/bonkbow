import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import Animated from 'react-native-reanimated';

// Text that honours the phone's font-size setting without breaking the game
// layout: the OS can grow it up to MAX_FONT_SCALE (on top of the screen
// scale in responsive.ts), past that it holds. Use these instead of the
// react-native components everywhere; pass maxFontSizeMultiplier to override
// (HUD numbers that sit in fixed badges use TIGHT_FONT_SCALE).
export const MAX_FONT_SCALE = 1.35;
export const TIGHT_FONT_SCALE = 1.15;

export function Text(props: TextProps) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export const AnimatedText = Animated.createAnimatedComponent(Text);
