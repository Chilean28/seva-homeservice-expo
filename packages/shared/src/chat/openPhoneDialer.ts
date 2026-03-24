import { Alert, Linking } from 'react-native';

export type PhoneDialerCopy = {
  noPhoneTitle: string;
  noPhoneMessage: string;
  invalidTitle: string;
  invalidMessage: string;
  dialerUnsupportedTitle: string;
  dialerUnsupportedMessage: string;
  openFailedTitle: string;
  openFailedMessage: string;
};

/**
 * Open system dialer for a phone string; shows alerts on missing/invalid/unsupported (both apps).
 */
export function openPhoneDialer(raw: string | null | undefined, copy: PhoneDialerCopy): void {
  const trimmed = raw?.trim();
  if (!trimmed) {
    Alert.alert(copy.noPhoneTitle, copy.noPhoneMessage);
    return;
  }
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.replace(/^\+/, '').length < 8) {
    Alert.alert(copy.invalidTitle, copy.invalidMessage);
    return;
  }
  const url = `tel:${digits}`;
  void Linking.canOpenURL(url)
    .then((supported) => {
      if (!supported) {
        Alert.alert(copy.dialerUnsupportedTitle, copy.dialerUnsupportedMessage);
        return;
      }
      return Linking.openURL(url);
    })
    .catch(() => {
      Alert.alert(copy.openFailedTitle, copy.openFailedMessage);
    });
}
