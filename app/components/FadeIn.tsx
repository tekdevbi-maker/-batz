import { useEffect, useRef } from "react";
import { Animated } from "react-native";

// A JS-driven fade-in, used because react-native-screens' native-stack
// `animationDuration` option is iOS-only (confirmed in its source -- the
// duration logic only exists in the iOS native file, nothing on Android).
// On Android "fade" always runs at a fixed native transition length no
// matter what duration is requested, so this wraps each wizard screen's
// content instead, fading it in on mount with a duration that actually
// works on both platforms.
export default function FadeIn({ children, duration = 600 }: { children: React.ReactNode; duration?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [opacity, duration]);

  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}
