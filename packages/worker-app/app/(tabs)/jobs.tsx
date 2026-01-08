import { View, Text, StyleSheet } from 'react-native';

export default function JobsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jobs</Text>
      <Text style={styles.subtitle}>View and manage your jobs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
