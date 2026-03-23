import React, { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = { hasError: boolean; error?: Error };

/**
 * Error boundary so a crash in one tab doesn't kill the whole app.
 * Wrap tab layout content (e.g. Tabs) with this.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message ?? 'An error occurred'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    color: '#000',
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
