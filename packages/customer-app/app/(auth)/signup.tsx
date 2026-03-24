import { UserType } from '@/lib/types/enums';
import { completeEmailOtpSignUp, otpErrorMessage, requestEmailOtpSignUp } from '@/lib/supabase/auth';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
/** Wait between resend / initial send cooldown on code step (reduces duplicate OTP emails). */
const RESEND_COOLDOWN_SECONDS = 45;
/** Wrong-code tries before asking user to request a new email code (Supabase may rate-limit sooner). */
const MAX_VERIFY_ATTEMPTS = 5;

export default function SignUpScreen() {
  const sendOtpInFlightRef = useRef(false);
  const [step, setStep] = useState<Step>('form');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [verifyAttempts, setVerifyAttempts] = useState(0);

  const normalizedEmail = email.trim().toLowerCase();
  const cooldownRemaining = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - nowMs) / 1000)) : 0;
  const resendOnCooldown = cooldownRemaining > 0;
  const verifyLocked = verifyAttempts >= MAX_VERIFY_ATTEMPTS;
  const attemptsLeft = Math.max(0, MAX_VERIFY_ATTEMPTS - verifyAttempts);

  useEffect(() => {
    if (step !== 'code' || !resendOnCooldown) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, resendOnCooldown]);

  const validateForm = () => {
    const name = username.trim();
    if (!name || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }
    // Catch common Gmail typos/malformed domains before sending OTP.
    if (/@g(mai|mial|mail|amil|mal|maiil)\./i.test(normalizedEmail) && !normalizedEmail.endsWith('@gmail.com')) {
      Alert.alert('Error', 'Invalid Gmail address. Did you mean @gmail.com?');
      return false;
    }
    if (normalizedEmail.includes('@gmail') && !normalizedEmail.endsWith('@gmail.com')) {
      Alert.alert('Error', 'Gmail addresses must end with @gmail.com');
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
    if (!validateForm() || sendOtpInFlightRef.current) return;
    sendOtpInFlightRef.current = true;
    setLoading(true);
    try {
      await requestEmailOtpSignUp({ email: normalizedEmail });
      setCode('');
      setStep('code');
      setVerifyAttempts(0);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      Alert.alert('Check your email', 'We sent a 6-digit code. Enter it below to finish signing up.');
    } catch (error: unknown) {
      const msg = otpErrorMessage(error, 'Could not send code');
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      sendOtpInFlightRef.current = false;
    }
  };

  const handleVerify = async () => {
    if (verifyLocked) {
      Alert.alert('Too many attempts', 'Please request a new code and try again.');
      return;
    }
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      await completeEmailOtpSignUp({
        email: normalizedEmail,
        token: digits,
        password,
        full_name: username.trim(),
        user_type: UserType.CUSTOMER,
      });
      router.replace('/(tabs)');
    } catch (error: unknown) {
      setVerifyAttempts((n) => n + 1);
      const msg = otpErrorMessage(error);
      Alert.alert('Verification failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendOnCooldown || sendOtpInFlightRef.current) return;
    if (!validateForm()) return;
    sendOtpInFlightRef.current = true;
    setLoading(true);
    try {
      await requestEmailOtpSignUp({ email: normalizedEmail });
      setVerifyAttempts(0);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      Alert.alert('Sent', 'We sent a new code to your email.');
    } catch (error: unknown) {
      const msg = otpErrorMessage(error, 'Could not resend');
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      sendOtpInFlightRef.current = false;
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              {step === 'form'
                ? 'Book services at home'
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
                  autoCapitalize="words"
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
                  autoComplete="off"
                  textContentType="none"
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
                  autoComplete="off"
                  textContentType="none"
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
              {verifyLocked ? (
                <Text style={styles.warnText}>
                  Too many invalid attempts. Request a new code to continue.
                </Text>
              ) : verifyAttempts > 0 ? (
                <Text style={styles.hintText}>Attempts left: {attemptsLeft}</Text>
              ) : null}
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
                disabled={loading || verifyLocked}
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
                disabled={loading || resendOnCooldown}
              >
                <Text style={styles.secondaryBtnText}>
                  {resendOnCooldown ? `Resend in ${cooldownRemaining}s` : 'Resend code'}
                </Text>
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
  warnText: {
    fontSize: 12,
    color: '#B45309',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
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
