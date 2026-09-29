import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { haptic } from '@/game/haptics';

// Drop-in for TouchableOpacity that fires a light impact on press — honouring
// the Settings → Haptics toggle like every other haptic in the app.
export function HapticTouchable({ onPress, ...props }: TouchableOpacityProps) {
  return (
    <TouchableOpacity
      {...props}
      onPress={(e) => {
        haptic.tap();
        onPress?.(e);
      }}
    />
  );
}
