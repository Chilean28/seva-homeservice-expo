import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { getInitials } from '@/lib/avatar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useBookingAlerts } from '@/lib/contexts/BookingAlertsContext';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { completeBooking } from '@/lib/completeBooking';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { clearPendingCardPayment, getPendingCardPayment, setPendingCardPayment } from '@/lib/pendingPayment';
import { getPaymentMethodDisplayLabel, getPaymentMethods } from '@/lib/paymentMethods';

const MIN_HOURS = 2;
const PROMO_DISCOUNT = 25;
const PROMO_CODE = 'LWK';

function formatReviewDate(iso: string): string {
  try {
    const d = new Date(iso);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[d.getDay()];
    const month = d.toLocaleString('default', { month: 'long' });
    const date = d.getDate();
    const year = d.getFullYear();
    return `${day} - ${month} ${date}, ${year}`;
  } catch {
    return iso;
  }
}

function formatReviewTime(iso: string): string {
  try {
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const am = h < 12;
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
  } catch {
    return iso;
  }
}

export default function ReviewBookingScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { setPendingBookingCount } = useBookingAlerts();
  const params = useLocalSearchParams<{
    workerId?: string;
    workerName?: string;
    serviceId: string;
    serviceName?: string;
    basePrice?: string;
    scheduledDate?: string;
    address?: string;
    notes?: string;
    paymentMethod?: string;
    paymentMethodStripeId?: string;
    customerPhone?: string;
    serviceLat?: string;
    serviceLng?: string;
  }>();

  const workerId = params.workerId ?? undefined;
  const workerName = params.workerName ?? 'Worker';
  const serviceId = params.serviceId;
  const serviceName = params.serviceName ?? 'Service';
  const basePrice = Number(params.basePrice ?? 0);
  const scheduledDateIso = params.scheduledDate ?? '';
  const address = params.address ?? '';
  const notes = params.notes ?? '';
  const paymentMethod = params.paymentMethod ?? undefined;
  const paymentMethodStripeId = params.paymentMethodStripeId ?? undefined;

  const serviceLatNum = useMemo(() => {
    const v = params.serviceLat != null ? parseFloat(String(params.serviceLat)) : NaN;
    return Number.isFinite(v) && Math.abs(v) <= 90 ? v : NaN;
  }, [params.serviceLat]);
  const serviceLngNum = useMemo(() => {
    const v = params.serviceLng != null ? parseFloat(String(params.serviceLng)) : NaN;
    return Number.isFinite(v) && Math.abs(v) <= 180 ? v : NaN;
  }, [params.serviceLng]);
  const hasServiceCoords = Number.isFinite(serviceLatNum) && Number.isFinite(serviceLngNum);

  const [resolvedDefaultPaymentMethod, setResolvedDefaultPaymentMethod] = useState<string | null>(null);
  const [resolvedDefaultPaymentMethodStripeId, setResolvedDefaultPaymentMethodStripeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showConfirmedModal, setShowConfirmedModal] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [phonePromptVisible, setPhonePromptVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const isExpoGo = Constants.appOwnership === 'expo';
  const stripeDisabled = false;
  const subtotal = basePrice * MIN_HOURS;
  const discount = promoApplied ? PROMO_DISCOUNT : 0;
  const afterDiscount = Math.max(0, subtotal - discount);
  const estimateTotal = afterDiscount;

  const applyPromo = useCallback(() => {
    const code = promoCode.trim().toUpperCase();
    if (code === PROMO_CODE) {
      setPromoApplied(code);
      setApplyingPromo(false);
    } else {
      setPromoApplied(null);
      setApplyingPromo(false);
    }
  }, [promoCode]);

  const removePromo = useCallback(() => {
    setPromoCode('');
    setPromoApplied(null);
  }, []);

  const goToPaymentMethods = useCallback(() => {
    router.push({
      pathname: '/payment-methods',
      params: {
        workerId: workerId ?? '',
        workerName: workerName ?? '',
        serviceId,
        serviceName: serviceName ?? '',
        basePrice: String(basePrice),
        scheduledDate: scheduledDateIso,
        address,
        notes,
        customerPhone: (customerPhone ?? phoneInput).trim(),
        serviceLat: String(serviceLatNum),
        serviceLng: String(serviceLngNum),
      },
    } as Parameters<typeof router.push>[0]);
  }, [
    workerId,
    workerName,
    serviceId,
    serviceName,
    basePrice,
    scheduledDateIso,
    address,
    notes,
    customerPhone,
    phoneInput,
    serviceLatNum,
    serviceLngNum,
  ]);

  useEffect(() => {
    if (paymentMethod != null || !user?.id) return;
    let cancelled = false;
    getPaymentMethods(user.id).then((list) => {
      if (cancelled) return;
      const defaultCard = list.find((m) => m.isDefault);
      setResolvedDefaultPaymentMethod(defaultCard ? getPaymentMethodDisplayLabel(defaultCard) : 'Cash');
      setResolvedDefaultPaymentMethodStripeId(defaultCard?.stripePaymentMethodId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, paymentMethod]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();
      const dbPhone = ((data as { phone?: string } | null)?.phone ?? '').trim();
      const raw = params.customerPhone;
      const paramPhone = Array.isArray(raw) ? (raw[0] ?? '').trim() : (raw ?? '').trim();
      if (!cancelled) {
        setCustomerPhone(paramPhone || dbPhone);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, params.customerPhone]);

  const effectivePaymentMethod = paymentMethod ?? resolvedDefaultPaymentMethod ?? undefined;
  const effectivePaymentMethodStripeId = paymentMethodStripeId ?? resolvedDefaultPaymentMethodStripeId ?? undefined;
  const isCash = effectivePaymentMethod?.toLowerCase() === 'cash';

  const syncCustomerPhoneToProfile = useCallback(async () => {
    if (!user?.id) return;
    const cleaned = ((customerPhone ?? '').trim() || phoneInput.trim()).trim();
    if (!cleaned) return;
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return;
    await supabase.from('users').update({ phone: cleaned } as never).eq('id', user.id);
  }, [user?.id, customerPhone, phoneInput]);

  const createBooking = useCallback(
    async (opts: {
      payment_method: 'card' | 'cash';
      payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded';
      stripe_payment_intent_id?: string;
      stripe_payment_method_id?: string;
      total_amount?: number;
    }) => {
      return completeBooking(supabase, {
        customer_id: user!.id,
        service_id: serviceId,
        scheduled_date_iso: scheduledDateIso,
        address: address.trim(),
        price: basePrice,
        total_amount: opts.total_amount,
        notes: notes.trim() || undefined,
        worker_id: workerId,
        latitude: serviceLatNum,
        longitude: serviceLngNum,
        payment_method: opts.payment_method,
        payment_status: opts.payment_status,
        stripe_payment_intent_id: opts.stripe_payment_intent_id,
        stripe_payment_method_id: opts.stripe_payment_method_id,
      });
    },
    [user?.id, serviceId, workerId, basePrice, scheduledDateIso, address, notes, serviceLatNum, serviceLngNum]
  );

  const handleConfirm = useCallback(async () => {
    if (!user?.id || !serviceId || !scheduledDateIso || !address.trim()) {
      setError('Missing booking details.');
      return;
    }
    if (!hasServiceCoords) {
      setError('Missing map location. Go back and use Pick on map (or a saved address with coordinates).');
      return;
    }
    const scheduled = new Date(scheduledDateIso);
    if (scheduled.getTime() < Date.now()) {
      setError('Scheduled time must be in the future.');
      return;
    }
    const digits = ((customerPhone ?? '').trim() || phoneInput.trim()).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setPhoneInput(customerPhone ?? '');
      setPhonePromptVisible(true);
      return;
    }
    setError(null);
    setConfirming(true);

    if (isCash) {
      const result = await createBooking({
        payment_method: 'cash',
        payment_status: 'unpaid',
        total_amount: estimateTotal,
      });
      setConfirming(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      await syncCustomerPhoneToProfile();
      setPendingBookingCount(0);
      setShowConfirmedModal(true);
      return;
    }

    if (isExpoGo || stripeDisabled) {
      setConfirming(false);
      Alert.alert(
        'Card payment',
        'Card payment is not available in this build. Use "Cash" for now.',
        [{ text: 'OK' }]
      );
      return;
    }

    const amountCents = Math.round(estimateTotal * 100);

    if (effectivePaymentMethodStripeId) {
      const result = await createBooking({
        payment_method: 'card',
        payment_status: 'pending',
        stripe_payment_method_id: effectivePaymentMethodStripeId,
        total_amount: estimateTotal,
      });
      setConfirming(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      await syncCustomerPhoneToProfile();
      setPendingBookingCount(0);
      setShowConfirmedModal(true);
      return;
    }

    const checkoutResult = await invokeEdgeFunction<{ url?: string; error?: string }>('create-checkout-session', {
      amount_cents: amountCents,
      currency: 'usd',
      user_id: user?.id ?? undefined,
      worker_id: workerId ?? undefined,
      payment_method: 'card',
    });
    setConfirming(false);
    if (checkoutResult.error) {
      setError(checkoutResult.status === 401 ? 'Session expired. Please sign out and sign in again.' : checkoutResult.error);
      return;
    }
    const res = checkoutResult.data;
    if (!res?.url) {
      setError(res?.error || 'Invalid payment response.');
      return;
    }
    await setPendingCardPayment({
      userId: user!.id,
      workerId,
      serviceId,
      serviceName,
      basePrice,
      scheduledDateIso,
      address,
      notes,
      estimateTotal,
      serviceLat: serviceLatNum,
      serviceLng: serviceLngNum,
    });
    setCheckoutUrl(res.url);
  }, [
    user?.id,
    serviceId,
    scheduledDateIso,
    address,
    customerPhone,
    phoneInput,
    estimateTotal,
    isCash,
    isExpoGo,
    stripeDisabled,
    serviceName,
    workerId,
    basePrice,
    notes,
    effectivePaymentMethodStripeId,
    createBooking,
    setPendingBookingCount,
    syncCustomerPhoneToProfile,
    serviceLatNum,
    serviceLngNum,
  ]);

  const savePhoneAndContinue = useCallback(async () => {
    if (!user?.id) return;
    const cleaned = phoneInput.trim();
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    setSavingPhone(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ phone: cleaned } as never)
      .eq('id', user.id);
    setSavingPhone(false);
    if (updateError) {
      Alert.alert('Error', updateError.message || 'Failed to save phone number.');
      return;
    }
    setCustomerPhone(cleaned);
    setPhonePromptVisible(false);
    // Continue the booking flow after successful save.
    handleConfirm();
  }, [user?.id, phoneInput, handleConfirm]);

  const onConfirmModalOk = useCallback(() => {
    setShowConfirmedModal(false);
    router.replace('/(tabs)/bookings');
  }, []);

  const handlePaymentSuccessFromWebView = useCallback(
    async (sessionId: string) => {
      setCheckoutUrl(null);
      try {
        const pending = await getPendingCardPayment();
        if (!pending) {
          Alert.alert('Payment', 'Session expired. Please check your bookings.');
          return;
        }
        const { data: piData, error: piErr } = await invokeEdgeFunction<{ payment_intent_id?: string; error?: string }>(
          'get-payment-intent-from-session',
          { session_id: sessionId }
        );
        if (piErr) {
          Alert.alert('Payment', piErr);
          await clearPendingCardPayment();
          return;
        }
        const res = piData;
        if (!res?.payment_intent_id) {
          Alert.alert('Payment', res?.error || 'Invalid session.');
          await clearPendingCardPayment();
          return;
        }
        const result = await completeBooking(supabase, {
          customer_id: pending.userId,
          service_id: pending.serviceId,
          scheduled_date_iso: pending.scheduledDateIso,
          address: pending.address,
          price: pending.basePrice,
          total_amount: pending.estimateTotal,
          notes: pending.notes,
          worker_id: pending.workerId,
          latitude: pending.serviceLat,
          longitude: pending.serviceLng,
          payment_method: 'card',
          payment_status: 'pending',
          stripe_payment_intent_id: res.payment_intent_id,
        });
        await clearPendingCardPayment();
        if (result.error) {
          Alert.alert('Booking', result.error);
          return;
        }
        setPendingBookingCount(0);
        Alert.alert('Success', 'Your booking is confirmed. You will be charged when the worker marks the job complete.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/bookings') },
        ]);
      } catch (e) {
        console.warn('[Payment] WebView success handler error', e);
        Alert.alert('Payment', 'Something went wrong. Please check your bookings.');
        await clearPendingCardPayment();
      }
    },
    [setPendingBookingCount]
  );

  const handleCheckoutNavigation = useCallback(
    (url: string) => {
      if (!url.startsWith('sevacustomer://')) return false;
      if (url.startsWith('sevacustomer://payment-success')) {
        const parsed = new URL(url);
        const sessionId = parsed.searchParams.get('session_id');
        if (sessionId) handlePaymentSuccessFromWebView(sessionId);
        else setCheckoutUrl(null);
        return true;
      }
      if (url.startsWith('sevacustomer://payment-cancel')) {
        setCheckoutUrl(null);
        return true;
      }
      return false;
    },
    [handlePaymentSuccessFromWebView]
  );

  const hasPayment = !!effectivePaymentMethod;
  const showContinueToPayment = !hasPayment;

  if (!serviceId || !scheduledDateIso || !address) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review Booking</Text>
            <View style={styles.headerBack} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Missing booking details. Please start from the booking form.</Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.linkBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Booking</Text>
          <View style={styles.headerBack} />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.workerRow}>
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{getInitials(workerName)}</Text>
          </View>
          <Text style={styles.workerName}>{workerName}</Text>
        </View>
        <View style={styles.serviceRow}>
          <Text style={styles.serviceName}>{serviceName}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Edit booking details"
          >
            <Ionicons name="options-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <Text style={styles.detailLine}><Text style={styles.detailLabel}>Date: </Text>{formatReviewDate(scheduledDateIso)}</Text>
        <Text style={styles.detailLine}><Text style={styles.detailLabel}>Time: </Text>{formatReviewTime(scheduledDateIso)}</Text>
        <Text style={styles.detailLine}><Text style={styles.detailLabel}>Location: </Text>{address}</Text>
        {notes.trim() ? (
          <Text style={styles.detailLine}>
            <Text style={styles.detailLabel}>Notes: </Text>
            {notes}
          </Text>
        ) : null}

        <TouchableOpacity style={styles.sectionRow} onPress={goToPaymentMethods}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.paymentMethodRight}>
            {hasPayment ? (
              <Text style={styles.paymentMethodLabel}>{effectivePaymentMethod}</Text>
            ) : (
              <Text style={styles.paymentMethodPlaceholder}>Select payment method</Text>
            )}
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </View>
        </TouchableOpacity>

        <View style={styles.promoSection}>
          <Text style={styles.promoLabel}>Promo Code</Text>
          {!promoApplied ? (
            <View style={styles.promoRow}>
              <TextInput
                style={styles.promoInput}
                value={promoCode}
                onChangeText={setPromoCode}
                placeholder="Enter code"
                placeholderTextColor="#999"
                onSubmitEditing={applyPromo}
              />
              <TouchableOpacity style={styles.promoApplyBtn} onPress={applyPromo}>
                <Text style={styles.promoApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.promoRow}>
              <Text style={styles.promoAppliedCode}>{promoApplied}</Text>
              <TouchableOpacity onPress={removePromo}>
                <Text style={styles.promoRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
          {promoApplied ? (
            <Text style={styles.promoSuccessText}>Your promo code {promoApplied} has successfully applied</Text>
          ) : null}
        </View>

        <View style={styles.priceSection}>
          <Text style={styles.priceSectionTitle}>Price Details</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Hourly Rate ({MIN_HOURS}h min)</Text>
            <Text style={styles.priceValue}>${basePrice.toFixed(2)}/hr</Text>
          </View>
          {promoApplied ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Discount (Promo code)</Text>
              <Text style={styles.priceDiscount}>-${PROMO_DISCOUNT.toFixed(0)}</Text>
            </View>
          ) : null}
          <View style={[styles.priceRow, styles.estimateTotalRow]}>
            <Text style={styles.estimateTotalLabel}>Estimate Total</Text>
            <Text style={styles.estimateTotalValue}>${estimateTotal.toFixed(2)}</Text>
          </View>
          <Text style={styles.priceLockExplainer}>
            Bookings start at a {MIN_HOURS}-hour minimum. Your worker may adjust the final hours after they
            review the job; when they lock the price, your total updates for payment.
          </Text>
        </View>

        <View style={styles.policyRow}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.policyText}>
            You can cancel from your booking when the app allows it. Timing and payment state (for example card
            authorization release) are shown on the booking detail screen.
          </Text>
        </View>
        <Text style={styles.policyTextSecondary}>
          A late-cancellation policy may apply in the future; this version does not automatically charge
          cancellation fees in-app.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {showContinueToPayment ? (
          <TouchableOpacity style={styles.continueBtn} onPress={goToPaymentMethods}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.continueBtn, confirming && styles.continueBtnDisabled]}
            onPress={handleConfirm}
            disabled={confirming}
          >
            {confirming ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.continueBtnText}>Confirm Booking</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        visible={phonePromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhonePromptVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.phoneModalCard}>
            <Text style={styles.phoneModalTitle}>Phone number required</Text>
            <Text style={styles.phoneModalSubtext}>
              Please add your phone number before confirming this booking.
            </Text>
            <TextInput
              style={styles.phoneModalInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="Enter phone number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <View style={styles.phoneModalActions}>
              <TouchableOpacity
                style={styles.phoneModalCancelBtn}
                onPress={() => setPhonePromptVisible(false)}
                disabled={savingPhone}
              >
                <Text style={styles.phoneModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.phoneModalSaveBtn, savingPhone && styles.continueBtnDisabled]}
                onPress={savePhoneAndContinue}
                disabled={savingPhone}
              >
                {savingPhone ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.phoneModalSaveText}>Save & Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showConfirmedModal}
        transparent
        animationType="fade"
        onRequestClose={onConfirmModalOk}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Your {serviceName} service is confirmed!</Text>
            <View style={styles.modalDetailRow}>
              <Ionicons name="calendar-outline" size={18} color="#666" />
              <Text style={styles.modalDetailText}>{formatReviewDate(scheduledDateIso)}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Ionicons name="time-outline" size={18} color="#666" />
              <Text style={styles.modalDetailText}>{formatReviewTime(scheduledDateIso)}</Text>
            </View>
            <Text style={styles.modalSubtext}>Your tasker will contact you in about 30 minutes.</Text>
            <TouchableOpacity style={styles.modalOkBtn} onPress={onConfirmModalOk}>
              <Text style={styles.modalOkBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!checkoutUrl}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCheckoutUrl(null)}
      >
        <View style={styles.checkoutModalContainer}>
          <View style={[styles.checkoutModalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.checkoutModalTitle}>Pay with card</Text>
            <TouchableOpacity
              onPress={() => setCheckoutUrl(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.checkoutModalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close card payment"
            >
              <Ionicons name="close" size={28} color="#000" />
            </TouchableOpacity>
          </View>
          {checkoutUrl ? (
            <WebView
              source={{ uri: checkoutUrl }}
              style={styles.checkoutWebView}
              onShouldStartLoadWithRequest={(req) => {
                if (req.url && req.url.startsWith('sevacustomer://')) {
                  if (handleCheckoutNavigation(req.url)) return false;
                }
                return true;
              }}
              onNavigationStateChange={(navState) => {
                const url = navState?.url;
                if (url && url.startsWith('sevacustomer://')) {
                  handleCheckoutNavigation(url);
                }
              }}
            />
          ) : null}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { minWidth: 44, minHeight: 44, padding: 4, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...appScreenHeaderTitleStyle },
  headerBack: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, color: '#FF3B30', marginBottom: 12 },
  linkBtn: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#FFEB3B', borderRadius: 12 },
  linkBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },

  workerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFEB3B',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {},
  avatarInitials: { fontSize: 20, fontWeight: '600', color: '#666' },
  workerName: { fontSize: 20, fontWeight: '700', color: '#000' },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  serviceName: { fontSize: 16, color: '#333' },
  detailLine: { fontSize: 15, color: '#333', marginBottom: 6 },
  detailLabel: { fontWeight: '600', color: '#333' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  paymentMethodRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paymentMethodLabel: { fontSize: 15, color: '#000' },
  paymentMethodPlaceholder: { fontSize: 15, color: '#999' },

  promoSection: { marginBottom: 20 },
  promoLabel: { fontSize: 15, fontWeight: '600', color: '#F9A825', marginBottom: 8 },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#000',
    backgroundColor: '#fff',
  },
  promoApplyBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  promoApplyText: { fontSize: 15, fontWeight: '600', color: '#F9A825' },
  promoAppliedCode: { fontSize: 15, color: '#000', fontWeight: '600' },
  promoRemoveText: { fontSize: 15, color: '#FF3B30', fontWeight: '600' },
  promoSuccessText: { fontSize: 14, color: '#34C759', marginTop: 6 },

  priceSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  priceSectionTitle: { fontSize: 16, fontWeight: '700', color: '#000', marginBottom: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 15, color: '#666' },
  priceValue: { fontSize: 15, color: '#000' },
  priceDiscount: { fontSize: 15, color: '#34C759' },
  estimateTotalRow: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEE' },
  estimateTotalLabel: { fontSize: 16, fontWeight: '700', color: '#000' },
  estimateTotalValue: { fontSize: 18, fontWeight: '700', color: '#000' },
  priceLockExplainer: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginTop: 12,
  },

  policyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  policyText: { fontSize: 13, color: '#666', flex: 1 },
  policyTextSecondary: { fontSize: 13, color: '#666', marginBottom: 20 },

  continueBtn: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  continueBtnDisabled: { opacity: 0.7 },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: '#000' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  modalDetailText: { fontSize: 15, color: '#333' },
  modalSubtext: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
  phoneModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  phoneModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  phoneModalSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
  },
  phoneModalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#000',
    backgroundColor: '#fff',
  },
  phoneModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  phoneModalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  phoneModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  phoneModalSaveBtn: {
    backgroundColor: '#FFEB3B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F9A825',
    minWidth: 132,
    alignItems: 'center',
  },
  phoneModalSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  cardModalTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 4 },
  cardModalSubtext: { fontSize: 15, color: '#666', marginBottom: 16 },
  cardFieldWrap: { width: '100%', marginBottom: 16, minHeight: 50 },
  cancelCardBtn: { marginTop: 12, paddingVertical: 10 },
  cancelCardBtnText: { fontSize: 15, color: '#666' },
  modalOkBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  modalOkBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  checkoutModalContainer: { flex: 1, backgroundColor: '#fff' },
  checkoutModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFEB3B',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  checkoutModalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  checkoutModalCloseBtn: { minWidth: 44, minHeight: 44, padding: 4, justifyContent: 'center', alignItems: 'center' },
  checkoutWebView: { flex: 1 },
});
