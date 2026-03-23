import { addPaymentMethod } from '@/lib/paymentMethods';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const THEME_ORANGE = '#F9A825';

export interface AddCardStripeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  setAsDefault?: boolean;
  /** Pass the same userId the parent uses for getPaymentMethods so the new card is saved to the same list. */
  userId?: string | null;
}

export function AddCardStripeModal({
  visible,
  onClose,
  onSuccess,
  setAsDefault = false,
  userId: userIdProp,
}: AddCardStripeModalProps) {
  const { user, session } = useAuth();
  const userId = userIdProp ?? user?.id;
  /** Captured when modal opens - used for save so we always use the same key the parent uses for load */
  const saveUserIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const openedRef = useRef(false);

  if (visible && userId) saveUserIdRef.current = userId;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const loadStripeForm = useCallback(() => {
    if (!supabaseUrl || !publishableKey) return;
    setHtml(null);
    const url = `${supabaseUrl}/functions/v1/serve-add-card-page?pk=${encodeURIComponent(publishableKey)}`;
    setWebViewUrl(url);
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((content) => {
        setHtml(content);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setWebViewUrl(null);
      });
  }, [supabaseUrl, publishableKey]);

  useEffect(() => {
    if (visible && userId && supabaseUrl && publishableKey && !openedRef.current) {
      openedRef.current = true;
      loadStripeForm();
    }
    if (!visible) {
      openedRef.current = false;
      setWebViewUrl(null);
      setHtml(null);
    }
  }, [visible, userId, supabaseUrl, publishableKey, loadStripeForm]);

  const handleAddCardSuccess = useCallback(
    async (paymentMethodId: string) => {
      setWebViewUrl(null);
      setHtml(null);
      const currentUserId = saveUserIdRef.current ?? userIdProp ?? user?.id ?? userId;
      if (!currentUserId) return;
      setSaving(true);
      try {
        if (session?.access_token && session?.refresh_token) {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        }
        await supabase.auth.refreshSession();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.access_token) {
          setSaving(false);
          onClose();
          return;
        }

        const callAttach = async (accessToken: string) => {
          const url = `${supabaseUrl}/functions/v1/attach-payment-method`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              payment_method_id: paymentMethodId,
              set_as_default: setAsDefault,
              access_token: accessToken,
            }),
          });
          const body = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, data: body };
        };

        let result = await callAttach(sessionData.session.access_token);

        if (!result.ok && result.status === 401) {
          await supabase.auth.refreshSession();
          const { data: retrySession } = await supabase.auth.getSession();
          const retryToken = retrySession?.session?.access_token;
          if (retryToken) result = await callAttach(retryToken);
        }

        if (!result.ok) {
          const status = result.status;
          const errMsg = (result.data as { error?: string })?.error ?? 'Edge Function failed';
          Alert.alert('Could not save card', status === 401 ? 'Session expired. Please sign in again.' : status === 500 ? 'Server error. Ensure Edge Function secrets (STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, etc.) are set.' : errMsg, [{ text: 'OK' }]);
          setSaving(false);
          onClose();
          return;
        }

        const raw = result.data as { success?: boolean; last4?: string; brand?: string; data?: { success?: boolean; last4?: string; brand?: string } } | null;
        const res = (raw?.data ?? raw) as { success?: boolean; last4?: string; brand?: string } | null;
        if (!res?.success || !res?.last4) {
          setSaving(false);
          onClose();
          return;
        }
        const brand =
          (res.brand ?? 'card').charAt(0).toUpperCase() + (res.brand ?? '').slice(1);
        await addPaymentMethod(
          currentUserId,
          { label: `•••• ${res.last4}`, last4: res.last4, brand, stripePaymentMethodId: paymentMethodId },
          { setAsDefault }
        );
        await new Promise((r) => setTimeout(r, 100));
        onSuccess?.();
        onClose();
      } catch {
        setSaving(false);
        onClose();
      } finally {
        setSaving(false);
      }
    },
    [userIdProp, user?.id, userId, session, setAsDefault, onSuccess, onClose]
  );

  const handleNavigation = useCallback(
    (url: string) => {
      if (!url.startsWith('sevacustomer://add-card-success')) return false;
      const parsed = new URL(url);
      const pmId = parsed.searchParams.get('payment_method_id');
      if (pmId) handleAddCardSuccess(pmId);
      else {
        setWebViewUrl(null);
        setHtml(null);
      }
      return true;
    },
    [handleAddCardSuccess]
  );

  const handleClose = useCallback(() => {
    setWebViewUrl(null);
    setHtml(null);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Add card</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        {loading || saving ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={THEME_ORANGE} />
            <Text style={styles.loadingText}>
              {saving ? 'Saving card…' : 'Loading form…'}
            </Text>
          </View>
        ) : html && webViewUrl ? (
          <WebView
            source={{ html, baseUrl: webViewUrl }}
            style={styles.webView}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={(req) => {
              if (req.url?.startsWith('sevacustomer://add-card-success')) {
                if (handleNavigation(req.url)) return false;
              }
              return true;
            }}
            onNavigationStateChange={(nav) => {
              if (nav.url?.startsWith('sevacustomer://add-card-success')) {
                handleNavigation(nav.url);
              }
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFEB3B',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#000' },
  closeBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#666' },
  webView: { flex: 1 },
});
