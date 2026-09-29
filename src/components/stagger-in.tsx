import { Children, isValidElement } from 'react';
import { View, ViewProps } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type Props = ViewProps & { delay?: number; step?: number };

// Staggers each direct child in with a FadeInDown entrance. Used on every
// onboarding screen for a polished feel with zero per-screen animation code.
export function StaggerIn({ children, delay = 100, step = 90, style, ...rest }: Props) {
  return (
    <View style={style} {...rest}>
      {Children.toArray(children).map((child, i) =>
        isValidElement(child) ? (
          <Animated.View key={i} entering={FadeInDown.delay(delay + i * step).duration(450)}>
            {child}
          </Animated.View>
        ) : (
          child
        ),
      )}
    </View>
  );
}
