import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform } from 'react-native';

/**
 * Keyboard visibility + height for chat composer padding (customer + worker apps).
 */
export function useChatKeyboard(): { keyboardVisible: boolean; keyboardHeight: number } {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        if (Platform.OS === 'ios') {
          LayoutAnimation.configureNext({
            duration: e.duration ?? 250,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates?.height ?? 0);
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        if (Platform.OS === 'ios') {
          const duration =
            e && typeof e === 'object' && 'duration' in e && typeof (e as { duration?: number }).duration === 'number'
              ? (e as { duration: number }).duration
              : 250;
          LayoutAnimation.configureNext({
            duration,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setKeyboardHeight(0);
        if (Platform.OS === 'android') {
          setTimeout(() => setKeyboardVisible(false), 100);
        } else {
          setKeyboardVisible(false);
        }
      }
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { keyboardVisible, keyboardHeight };
}
