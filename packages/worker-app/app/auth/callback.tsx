import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/** Deep link target for email confirmation; session is set in root `_layout` via `Linking`. */
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
