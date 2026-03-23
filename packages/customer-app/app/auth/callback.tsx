import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * Route target for email confirmation / password recovery deep links
 * (`…/auth/callback`). Session tokens are applied in root `_layout` via `Linking`.
 */
export default function AuthCallbackScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#666" />
      <Text style={styles.text}>Completing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
});
