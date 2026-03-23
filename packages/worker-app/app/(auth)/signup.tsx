import { completeEmailOtpSignUp, requestEmailOtpSignUp } from '../../lib/supabase/auth';
import { UserType } from '../../lib/types/enums';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Step = 'form' | 'code';

export default function WorkerSignUpScreen() {
  const [step, setStep] = useState<Step>('form');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const name = username.trim();
    if (!name || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSendCode = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      await requestEmailOtpSignUp({ email: email.trim() });
      setCode('');
      setStep('code');
      Alert.alert('Check your email', 'We sent a 6-digit code. Enter it below to finish signing up.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not send code';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      await completeEmailOtpSignUp({
        email: email.trim(),
        token: digits,
        password,
        full_name: username.trim(),
        user_type: UserType.WORKER,
      });
      Alert.alert(
        'Success',
        'Worker account created! Complete your profile to start receiving jobs.'
      );
      router.replace('/(tabs)');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Invalid or expired code';
      Alert.alert('Verification failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      await requestEmailOtpSignUp({ email: email.trim() });
      Alert.alert('Sent', 'We sent a new code to your email.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not resend';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.badge}>WORKER</Text>
            <Text style={styles.title}>Join as Worker</Text>
            <Text style={styles.subtitle}>
              {step === 'form'
                ? 'Start earning with your skills'
                : 'Enter the code we emailed you'}
            </Text>
          </View>

          {step === 'form' ? (
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#999"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                />
              </View>

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
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.buttonText}>Send verification code</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.emailHint}>{email.trim()}</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor="#999"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={8}
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerify}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.buttonText}>Verify & create account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleResend}
                disabled={loading}
              >
                <Text style={styles.secondaryBtnText}>Resend code</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setStep('form');
                  setCode('');
                }}
                disabled={loading}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
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
  emailHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
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
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: '#F9A825',
    fontSize: 15,
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
