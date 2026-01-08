import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

const SERVICES = [
  { id: '1', name: 'House Cleaning', price: '$50/hr', icon: '🧹' },
  { id: '2', name: 'Plumbing', price: '$60/hr', icon: '🔧' },
  { id: '3', name: 'Electrical', price: '$70/hr', icon: '⚡' },
  { id: '4', name: 'Moving', price: '$80/hr', icon: '📦' },
  { id: '5', name: 'Painting', price: '$45/hr', icon: '🎨' },
  { id: '6', name: 'Gardening', price: '$40/hr', icon: '🌱' },
  { id: '7', name: 'AC Repair', price: '$65/hr', icon: '❄️' },
  { id: '8', name: 'Carpentry', price: '$55/hr', icon: '🪚' },
];

export default function ServicesScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>All Services</Text>
        <Text style={styles.subtitle}>Choose a service to book</Text>
      </View>

      <View style={styles.list}>
        {SERVICES.map((service) => (
          <TouchableOpacity key={service.id} style={styles.serviceCard}>
            <Text style={styles.icon}>{service.icon}</Text>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.servicePrice}>{service.price}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 100,
  },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  icon: {
    fontSize: 32,
    marginRight: 16,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  servicePrice: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 2,
  },
  arrow: {
    fontSize: 20,
    color: '#999',
  },
});
