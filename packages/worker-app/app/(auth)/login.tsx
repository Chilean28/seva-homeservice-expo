import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../lib/contexts/AuthContext';
import { loginErrorMessage } from '../../lib/supabase/auth';

const isWeb = Platform.OS === 'web';

export default function WorkerLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signIn({ email, password });
      // Redirect to (tabs) is handled in app/_layout.tsx when user + workerCheck are set
    } catch (error: unknown) {
      Alert.alert('Login Failed', loginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const Wrapper = Platform.OS === 'web' ? View : KeyboardAvoidingView;
  const wrapperProps = Platform.OS === 'web' ? {} : { behavior: Platform.OS === 'ios' ? 'padding' as const : 'height' as const };

  return (
    <Wrapper style={styles.container} {...wrapperProps} pointerEvents="box-none">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.badge}>WORKER</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your worker account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {isWeb ? (
            <View style={[styles.button, loading && styles.buttonDisabled]}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
                disabled={loading}
                style={{
                  width: '100%',
                  height: '100%',
                  margin: 0,
                  padding: 0,
                  border: 'none',
                  borderRadius: 12,
                  background: '#FFEB3B',
                  color: '#000',
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.button, loading && styles.buttonDisabled, pressed && styles.buttonPressed]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </Pressable>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>New worker? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Create Account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    minHeight: Platform.OS === 'web' ? '100%' : undefined,
  },
  header: {
    marginBottom: 48,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F9A825',
    marginBottom: 16,
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
    color: '#000',
  },
  button: {
    height: 56,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    ...(Platform.OS === 'web' && { cursor: 'pointer' as const }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
  },
  linkText: {
    color: '#F9A825',
    fontSize: 14,
    fontWeight: '600',
  },
});
