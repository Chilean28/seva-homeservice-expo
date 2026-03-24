import { useAuth } from '@/lib/contexts/AuthContext';
import { useLocationSelection } from '@/lib/contexts/LocationSelectionContext';
import {
  availableSlotStartsForDate,
  cambodiaLocalToUtc,
  cambodiaMinutesFromMidnight,
  formatCambodiaDateTime,
  getTodayCambodia,
  minutesTo12h,
  type AvailWindow,
} from '@/lib/cambodiaAvailability';
import { supabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerAddress } from '@/lib/types/database';
import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_ADDRESS = '';

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ROWS = 5;
const SNAP_THRESHOLD = 5; // only snap when this far from a tick (avoids loop; larger = less magnetic)
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * 2;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES_5 = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const AMPM = ['AM', 'PM'];

function hour24To12(h24: number): { hour: number; ampm: number } {
  if (h24 === 0) return { hour: 12, ampm: 0 };
  if (h24 < 12) return { hour: h24, ampm: 0 };
  if (h24 === 12) return { hour: 12, ampm: 1 };
  return { hour: h24 - 12, ampm: 1 };
}

function hour12To24(hour: number, ampm: number): number {
  if (ampm === 0) return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const pad = Array<null>(startPad).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  return [...pad, ...days];
}

function getDefaultScheduledDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  return d;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function cellIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First 5-minute-aligned local time on `dayAnchor`'s calendar day that is >= `instant`, or start of next day. */
function firstFiveMinuteSlotOnDayAtOrAfter(dayAnchor: Date, instant: Date): Date {
  const start = startOfLocalDay(dayAnchor);
  const endDay = new Date(start);
  endDay.setDate(endDay.getDate() + 1);
  let t = new Date(start);
  while (t < endDay) {
    if (t.getTime() >= instant.getTime()) return t;
    t = new Date(t.getTime() + 5 * 60 * 1000);
  }
  return endDay;
}

/** Earliest valid local schedule time for `anchor` (non–worker-slot / device-local picker). */
function minValidScheduleDateTimeLocal(anchor: Date): Date {
  const now = new Date();
  const a0 = startOfLocalDay(anchor);
  const n0 = startOfLocalDay(now);
  if (a0.getTime() > n0.getTime()) return a0;
  if (a0.getTime() < n0.getTime()) return anchor;
  return firstFiveMinuteSlotOnDayAtOrAfter(anchor, now);
}

function clampScheduleNotPastLocal(d: Date): Date {
  const minT = minValidScheduleDateTimeLocal(d);
  return d.getTime() >= minT.getTime() ? d : minT;
}

export default function CreateBookingScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  /** RN % width + aspectRatio in flexWrap often collapses to 0 height; use explicit size. */
  const datePickerCellSize = useMemo(() => {
    const overlayInner = Math.max(windowWidth - 40, 260);
    const cardW = Math.min(overlayInner, 400);
    const gridInner = cardW - 40;
    return Math.max(36, Math.floor(gridInner / 7));
  }, [windowWidth]);
  const { user } = useAuth();
  const { getAndClearPendingLocationSelection } = useLocationSelection();
  const params = useLocalSearchParams<{
    serviceId: string;
    serviceName?: string;
    basePrice?: string;
    workerId?: string;
    workerName?: string;
  }>();

  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  /** Set from map pick or saved address with coordinates; required before continuing to review. */
  const [serviceLat, setServiceLat] = useState<number | null>(null);
  const [serviceLng, setServiceLng] = useState<number | null>(null);
  const [savedAddressesModalVisible, setSavedAddressesModalVisible] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [scheduledDate, setScheduledDate] = useState<Date>(getDefaultScheduledDate);
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [calendarViewYear, setCalendarViewYear] = useState(scheduledDate.getFullYear());
  const [calendarViewMonth, setCalendarViewMonth] = useState(scheduledDate.getMonth());
  const [wheelHour, setWheelHour] = useState(1);
  const [wheelMinute, setWheelMinute] = useState(0);
  const [wheelAmPm, setWheelAmPm] = useState(0);
  const [wheelScrollY, setWheelScrollY] = useState({ h: 0, m: 0, a: 0 });
  const [availWindows, setAvailWindows] = useState<AvailWindow[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [slotPickerVisible, setSlotPickerVisible] = useState(false);
  const [slotList, setSlotList] = useState<number[]>([]);
  const [slotPickerDateStr, setSlotPickerDateStr] = useState('');
  /** Active bookings on this worker (2h overlap); used to hide taken slots. */
  const [overlapStarts, setOverlapStarts] = useState<Date[]>([]);
  const [overlapLoading, setOverlapLoading] = useState(false);
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);
  const ampmScrollRef = useRef<ScrollView>(null);
  const initialWheelScroll = useRef({ h: 0, m: 0, a: 0 });
  const timePickerWheelLaidOut = useRef(false);
  const hapticCooldownRef = useRef(false);
  const wheelSnapInProgress = useRef<'h' | 'm' | 'a' | null>(null);

  const fireHapticOnce = useCallback(() => {
    if (Platform.OS !== 'ios' || hapticCooldownRef.current) return;
    hapticCooldownRef.current = true;
    Haptics.selectionAsync();
    setTimeout(() => {
      hapticCooldownRef.current = false;
    }, 350);
  }, []);

  const serviceId = params.serviceId;
  const serviceName = params.serviceName ?? 'Service';
  const basePrice = params.basePrice ? Number(params.basePrice) : 55.5;
  const workerId = params.workerId ?? undefined;
  const useWorkerSlots = !!workerId;

  const allowedDates = useMemo(() => new Set(availWindows.map((w) => w.work_date)), [availWindows]);
  const todayCambodia = useMemo(() => getTodayCambodia(), []);

  const fetchWorkerOverlapStarts = useCallback(async (): Promise<Date[]> => {
    if (!workerId) return [];
    const { data, error } = await (supabase as SupabaseClient).rpc('worker_booking_starts_for_overlap', {
      p_worker_id: workerId,
    });
    if (error) {
      console.warn('[create-booking] worker_booking_starts_for_overlap', error.message);
      return [];
    }
    const arr = (data as string[] | null) ?? [];
    return arr.map((iso) => new Date(iso));
  }, [workerId]);

  const hasWorkerBookableSlots = useMemo(() => {
    if (!useWorkerSlots) return true;
    if (availLoading || overlapLoading) return false;
    return availWindows.some(
      (w) =>
        w.work_date >= todayCambodia &&
        availableSlotStartsForDate(availWindows, w.work_date, overlapStarts).length > 0
    );
  }, [useWorkerSlots, availWindows, todayCambodia, overlapStarts, availLoading, overlapLoading]);

  useEffect(() => {
    if (!workerId) {
      setAvailWindows([]);
      setAvailLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setAvailLoading(true);
      const { data, error } = await supabase
        .from('worker_availability_windows')
        .select('work_date, start_minutes, end_minutes')
        .eq('worker_id', workerId)
        .gte('work_date', todayCambodia)
        .order('work_date', { ascending: true })
        .order('start_minutes', { ascending: true });
      if (!cancelled) {
        setAvailLoading(false);
        if (!error && data) setAvailWindows(data as AvailWindow[]);
        else setAvailWindows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workerId, todayCambodia]);

  useEffect(() => {
    if (!workerId || !useWorkerSlots) {
      setOverlapStarts([]);
      setOverlapLoading(false);
      return;
    }
    let cancelled = false;
    setOverlapLoading(true);
    fetchWorkerOverlapStarts().then((dates) => {
      if (!cancelled) {
        setOverlapStarts(dates);
        setOverlapLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workerId, useWorkerSlots, fetchWorkerOverlapStarts]);

  useEffect(() => {
    if (!useWorkerSlots || availLoading || overlapLoading || availWindows.length === 0) return;
    const dates = [...new Set(availWindows.map((w) => w.work_date))]
      .filter((d) => d >= todayCambodia)
      .sort();
    if (dates.length === 0) return;
    const first = dates[0];
    const slots = availableSlotStartsForDate(availWindows, first, overlapStarts);
    if (slots.length > 0) setScheduledDate(cambodiaLocalToUtc(first, slots[0]));
  }, [useWorkerSlots, availLoading, overlapLoading, availWindows, todayCambodia, overlapStarts]);

  /** If bookings load after a selection, drop to a slot that is still free. */
  useEffect(() => {
    if (!useWorkerSlots || overlapLoading || availLoading || availWindows.length === 0) return;
    const dateStr = formatCambodiaDateTime(scheduledDate).dateStr;
    const slots = availableSlotStartsForDate(availWindows, dateStr, overlapStarts);
    if (slots.length === 0) return;
    const currentMin = cambodiaMinutesFromMidnight(scheduledDate);
    if (!slots.includes(currentMin)) {
      setScheduledDate(cambodiaLocalToUtc(dateStr, slots[0]));
    }
  }, [useWorkerSlots, overlapLoading, availLoading, availWindows, overlapStarts, scheduledDate]);

  const buildScheduledDate = useCallback((): Date => scheduledDate, [scheduledDate]);

  const dateLabel = useMemo(() => {
    if (useWorkerSlots) return formatCambodiaDateTime(scheduledDate).dateStr;
    return scheduledDate.toISOString().slice(0, 10);
  }, [scheduledDate, useWorkerSlots]);

  const timeLabel = useMemo(() => {
    if (useWorkerSlots) return formatCambodiaDateTime(scheduledDate).timeLabel;
    return `${String(scheduledDate.getHours()).padStart(2, '0')}:${String(scheduledDate.getMinutes()).padStart(2, '0')}`;
  }, [scheduledDate, useWorkerSlots]);

  const calendarDays = useMemo(
    () => getCalendarDays(calendarViewYear, calendarViewMonth),
    [calendarViewYear, calendarViewMonth]
  );

  useFocusEffect(
    useCallback(() => {
      const pending = getAndClearPendingLocationSelection();
      if (pending) {
        setAddress(pending.address);
        setServiceLat(pending.lat);
        setServiceLng(pending.lng);
      }
    }, [getAndClearPendingLocationSelection])
  );

  useFocusEffect(
    useCallback(() => {
      if (!workerId || !useWorkerSlots) return;
      let cancelled = false;
      fetchWorkerOverlapStarts().then((dates) => {
        if (!cancelled) setOverlapStarts(dates);
      });
      return () => {
        cancelled = true;
      };
    }, [workerId, useWorkerSlots, fetchWorkerOverlapStarts])
  );

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('customer_addresses')
        .select('address, latitude, longitude')
        .eq('customer_id', user.id)
        .eq('is_default', true)
        .maybeSingle();
      const row = data as { address?: string; latitude?: number | null; longitude?: number | null } | null;
      const defaultAddress = row?.address;
      if (defaultAddress) {
        setAddress((prev) => (prev === DEFAULT_ADDRESS ? defaultAddress : prev));
      }
      if (
        row?.latitude != null &&
        row?.longitude != null &&
        !Number.isNaN(Number(row.latitude)) &&
        !Number.isNaN(Number(row.longitude))
      ) {
        setServiceLat(Number(row.latitude));
        setServiceLng(Number(row.longitude));
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('users').select('phone').eq('id', user.id).maybeSingle();
      const p = ((data as { phone?: string } | null)?.phone ?? '').trim();
      if (!cancelled && p) setPhone(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const openPickOnMap = useCallback(() => {
    router.push({
      pathname: '/search-location',
      params: { returnTo: 'create-booking' },
    });
  }, []);

  const loadSavedAddresses = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    setSavedAddresses((data as CustomerAddress[]) ?? []);
  }, [user?.id]);

  const openSavedAddresses = useCallback(async () => {
    if (!user?.id) return;
    await loadSavedAddresses();
    setSavedAddressesModalVisible(true);
  }, [user?.id, loadSavedAddresses]);

  const openAddAddressFromBooking = useCallback(() => {
    setSavedAddressesModalVisible(false);
    router.push({
      pathname: '/booking-address',
      params: { returnTo: 'create-booking' },
    } as Parameters<typeof router.push>[0]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedAddresses();
    }, [loadSavedAddresses])
  );

  const pickSavedAddress = useCallback((item: CustomerAddress) => {
    setAddress(item.address);
    if (item.latitude != null && item.longitude != null) {
      setServiceLat(Number(item.latitude));
      setServiceLng(Number(item.longitude));
    } else {
      setServiceLat(null);
      setServiceLng(null);
    }
    setSavedAddressesModalVisible(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!serviceId) {
      setError('Missing service.');
      return;
    }
    if (useWorkerSlots && !availLoading && availWindows.length === 0) {
      setError('This worker has not set availability yet.');
      return;
    }
    if (useWorkerSlots && overlapLoading) {
      setError('Loading availability…');
      return;
    }
    const scheduled = buildScheduledDate();
    if (scheduled.getTime() < Date.now()) {
      setError('Schedule must be in the future.');
      return;
    }
    if (!address.trim()) {
      setError('Enter an address.');
      return;
    }
    if (serviceLat == null || serviceLng == null || Number.isNaN(serviceLat) || Number.isNaN(serviceLng)) {
      setError('Pick a location on the map so we can match nearby workers.');
      return;
    }
    const phoneDigits = phone.trim().replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      setError('Enter a valid phone number (8–15 digits).');
      return;
    }
    if (useWorkerSlots && workerId) {
      const dateStr = formatCambodiaDateTime(scheduled).dateStr;
      const slots = availableSlotStartsForDate(availWindows, dateStr, overlapStarts);
      const currentMin = cambodiaMinutesFromMidnight(scheduled);
      if (!slots.includes(currentMin)) {
        setError('That time slot is no longer available. Please pick another time.');
        return;
      }
    }
    setError(null);
    router.push({
      pathname: '/review-booking',
      params: {
        workerId: workerId ?? '',
        workerName: params.workerName ?? '',
        serviceId,
        serviceName,
        basePrice: String(basePrice),
        scheduledDate: scheduled.toISOString(),
        address: address.trim(),
        notes: notes.trim(),
        customerPhone: phone.trim(),
        serviceLat: String(serviceLat),
        serviceLng: String(serviceLng),
      },
    } as Parameters<typeof router.push>[0]);
  }, [
    serviceId,
    serviceName,
    basePrice,
    workerId,
    params.workerName,
    address,
    notes,
    phone,
    serviceLat,
    serviceLng,
    buildScheduledDate,
    useWorkerSlots,
    availLoading,
    availWindows.length,
    overlapLoading,
    overlapStarts,
    availWindows,
  ]);

  const openDatePicker = useCallback(() => {
    if (useWorkerSlots && (availLoading || overlapLoading)) return;
    if (useWorkerSlots) {
      const { dateStr } = formatCambodiaDateTime(scheduledDate);
      const [y, mo] = dateStr.split('-').map(Number);
      setCalendarViewYear(y);
      setCalendarViewMonth(mo - 1);
    } else {
      setCalendarViewYear(scheduledDate.getFullYear());
      setCalendarViewMonth(scheduledDate.getMonth());
    }
    setDatePickerVisible(true);
  }, [scheduledDate, useWorkerSlots, availLoading, overlapLoading]);

  const openTimePicker = useCallback(() => {
    if (useWorkerSlots) {
      if (overlapLoading) return;
      const { dateStr } = formatCambodiaDateTime(scheduledDate);
      const slots = availableSlotStartsForDate(availWindows, dateStr, overlapStarts);
      if (slots.length === 0) {
        setError('Pick a date with availability first.');
        return;
      }
      setSlotPickerDateStr(dateStr);
      setSlotList(slots);
      setSlotPickerVisible(true);
      return;
    }
    const base = clampScheduleNotPastLocal(scheduledDate);
    if (base.getTime() !== scheduledDate.getTime()) {
      setScheduledDate(base);
    }
    const h24 = base.getHours();
    const m = base.getMinutes();
    const { hour, ampm } = hour24To12(h24);
    const minute5 = Math.min(55, Math.round(m / 5) * 5);
    setWheelHour(hour);
    setWheelMinute(minute5);
    setWheelAmPm(ampm);
    const h = (hour - 1) * WHEEL_ITEM_HEIGHT;
    const min = (minute5 / 5) * WHEEL_ITEM_HEIGHT;
    const a = ampm * WHEEL_ITEM_HEIGHT;
    setWheelScrollY({ h, m: min, a });
    initialWheelScroll.current = { h, m: min, a };
    timePickerWheelLaidOut.current = false;
    setTimePickerVisible(true);
  }, [scheduledDate, useWorkerSlots, availWindows, overlapStarts, overlapLoading]);

  const onTimePickerWheelLayout = useCallback(() => {
    if (!timePickerVisible || timePickerWheelLaidOut.current) return;
    timePickerWheelLaidOut.current = true;
    const { h, m, a } = initialWheelScroll.current;
    requestAnimationFrame(() => {
      hourScrollRef.current?.scrollTo({ y: h, animated: false });
      minuteScrollRef.current?.scrollTo({ y: m, animated: false });
      ampmScrollRef.current?.scrollTo({ y: a, animated: false });
    });
  }, [timePickerVisible]);

  const applyTimePicker = useCallback(() => {
    const h24 = hour12To24(wheelHour, wheelAmPm);
    const d = new Date(scheduledDate);
    d.setHours(h24, wheelMinute, 0, 0);
    setScheduledDate(clampScheduleNotPastLocal(d));
    setTimePickerVisible(false);
  }, [scheduledDate, wheelHour, wheelMinute, wheelAmPm]);

  const wheelDisplayTime = useMemo(() => {
    const m = String(wheelMinute).padStart(2, '0');
    return `${wheelHour}:${m} ${AMPM[wheelAmPm]}`;
  }, [wheelHour, wheelMinute, wheelAmPm]);

  const onSelectDate = useCallback(
    (year: number, month: number, day: number) => {
      if (useWorkerSlots) {
        const iso = cellIsoDate(year, month, day);
        if (iso < todayCambodia || !allowedDates.has(iso)) return;
        const slots = availableSlotStartsForDate(availWindows, iso, overlapStarts);
        if (slots.length === 0) return;
        setScheduledDate(cambodiaLocalToUtc(iso, slots[0]));
        return;
      }
      const d = new Date(scheduledDate);
      d.setFullYear(year, month, day);
      setScheduledDate(clampScheduleNotPastLocal(d));
    },
    [scheduledDate, useWorkerSlots, todayCambodia, allowedDates, availWindows, overlapStarts]
  );

  if (!serviceId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>No service selected.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book: {serviceName}</Text>
        <View style={styles.headerBack} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address or choose below"
              placeholderTextColor="#999"
            />
            <View style={styles.addressActions}>
              <TouchableOpacity style={styles.addressActionBtn} onPress={openPickOnMap} activeOpacity={0.8}>
                <Ionicons name="map-outline" size={20} color="#000" />
                <Text style={styles.addressActionBtnText}>Pick on map</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addressActionBtn} onPress={openSavedAddresses} activeOpacity={0.8}>
                <Ionicons name="location-outline" size={20} color="#000" />
                <Text style={styles.addressActionBtnText}>Choose saved address</Text>
              </TouchableOpacity>
            </View>
            {serviceLat == null || serviceLng == null ? (
              <Text style={styles.coordsHint}>
                Use Pick on map or a saved address with coordinates so we can match nearby workers.
              </Text>
            ) : null}
          </View>

          <Modal
            visible={savedAddressesModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setSavedAddressesModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.savedAddressesCard, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Saved addresses</Text>
                  <TouchableOpacity
                    onPress={() => setSavedAddressesModalVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close saved addresses"
                  >
                    <Text style={styles.modalCancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.savedAddressesList} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={styles.addSavedAddressBtn}
                    onPress={openAddAddressFromBooking}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={22} color="#000" />
                    <Text style={styles.addSavedAddressBtnText}>Add new address</Text>
                  </TouchableOpacity>
                  {savedAddresses.length === 0 ? (
                    <Text style={styles.savedAddressesEmpty}>
                      No saved addresses yet. Add one above or in Profile → Addresses.
                    </Text>
                  ) : (
                    savedAddresses.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.savedAddressItem}
                        onPress={() => pickSavedAddress(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.savedAddressLabel}>{item.label}</Text>
                        <Text style={styles.savedAddressText} numberOfLines={2}>{item.address}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <View style={styles.row}>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  useWorkerSlots && (availLoading || overlapLoading) && styles.inputDisabled,
                ]}
                onPress={openDatePicker}
                activeOpacity={0.7}
                disabled={useWorkerSlots && (availLoading || overlapLoading)}
              >
                <Text
                  style={[
                    styles.inputText,
                    useWorkerSlots && (availLoading || overlapLoading) && styles.inputTextMuted,
                  ]}
                >
                  {useWorkerSlots && (availLoading || overlapLoading) ? 'Loading…' : dateLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>Time</Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  useWorkerSlots && (!hasWorkerBookableSlots || availLoading || overlapLoading) && styles.inputDisabled,
                ]}
                onPress={openTimePicker}
                activeOpacity={0.7}
                disabled={useWorkerSlots && (!hasWorkerBookableSlots || availLoading || overlapLoading)}
              >
                <Text
                  style={[
                    styles.inputText,
                    useWorkerSlots && (!hasWorkerBookableSlots || availLoading || overlapLoading) && styles.inputTextMuted,
                  ]}
                >
                  {timeLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="For the worker to reach you"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
            <Text style={styles.phoneHint}>Required before continuing. Used to coordinate your visit.</Text>
          </View>

          {useWorkerSlots ? (
            <Text style={styles.cambodiaHint}>
              Date and time are in Cambodia (GMT+7), matching this worker&apos;s availability.
            </Text>
          ) : null}
          {useWorkerSlots && !availLoading && !overlapLoading && !hasWorkerBookableSlots ? (
            <Text style={styles.errorText}>
              This worker has no upcoming available times. Try another worker or check back later.
            </Text>
          ) : null}

          <Modal
            visible={datePickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setDatePickerVisible(false)}
          >
            <View style={styles.datePickerOverlay}>
              <View style={[styles.datePickerCard, { paddingTop: insets.top + 12 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Choose date</Text>
                  <TouchableOpacity
                    onPress={() => setDatePickerVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close date picker"
                  >
                    <Text style={styles.modalCancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarNav}>
                  <TouchableOpacity
                    onPress={() => {
                      if (calendarViewMonth === 0) {
                        setCalendarViewYear((y) => y - 1);
                        setCalendarViewMonth(11);
                      } else setCalendarViewMonth((m) => m - 1);
                    }}
                  >
                    <Ionicons name="chevron-back" size={24} color="#000" />
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthLabel}>
                    {MONTHS[calendarViewMonth]} {calendarViewYear}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (calendarViewMonth === 11) {
                        setCalendarViewYear((y) => y + 1);
                        setCalendarViewMonth(0);
                      } else setCalendarViewMonth((m) => m + 1);
                    }}
                  >
                    <Ionicons name="chevron-forward" size={24} color="#000" />
                  </TouchableOpacity>
                </View>
                <View style={[styles.weekdayRow, { width: datePickerCellSize * 7, alignSelf: 'center' }]}>
                  {WEEKDAYS.map((wd) => (
                    <Text key={wd} style={[styles.weekdayCell, { width: datePickerCellSize }]}>
                      {wd}
                    </Text>
                  ))}
                </View>
                <View style={[styles.calendarGrid, { width: datePickerCellSize * 7 }]}>
                  {calendarDays.map((day, i) => {
                    const cellStyle = { width: datePickerCellSize, height: datePickerCellSize };
                    if (day === null) return <View key={`e-${i}`} style={[styles.dayCell, cellStyle]} />;
                    const dayIso = cellIsoDate(calendarViewYear, calendarViewMonth, day);
                    const workerDateDisabled =
                      useWorkerSlots &&
                      (availLoading ||
                        overlapLoading ||
                        dayIso < todayCambodia ||
                        availableSlotStartsForDate(availWindows, dayIso, overlapStarts).length === 0);
                    const isSelected = useWorkerSlots
                      ? formatCambodiaDateTime(scheduledDate).dateStr === dayIso
                      : scheduledDate.getFullYear() === calendarViewYear &&
                        scheduledDate.getMonth() === calendarViewMonth &&
                        scheduledDate.getDate() === day;
                    if (workerDateDisabled) {
                      return (
                        <View key={day} style={[styles.dayCell, cellStyle, styles.dayCellDisabled]}>
                          <View style={styles.dayCellLabelWrap}>
                            <Text style={styles.dayCellTextMuted}>{day}</Text>
                          </View>
                        </View>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayCell, cellStyle, isSelected && styles.dayCellSelected]}
                        onPress={() => onSelectDate(calendarViewYear, calendarViewMonth, day)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.dayCellLabelWrap}>
                          <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                            {day}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={styles.modalApply}
                  onPress={() => setDatePickerVisible(false)}
                >
                  <Text style={styles.modalApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={timePickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setTimePickerVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { paddingTop: insets.top + 12 }]}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    onPress={() => setTimePickerVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close time picker"
                  >
                    <Text style={styles.modalCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={styles.wheelHeaderCenter}>
                    <Text style={styles.modalTitle}>Time</Text>
                  </View>
                  <View style={styles.wheelTimeDisplay}>
                    <Text style={styles.wheelTimeDisplayText}>{wheelDisplayTime}</Text>
                  </View>
                </View>
                <View style={styles.wheelRow} onLayout={onTimePickerWheelLayout}>
                  <View style={styles.wheelColumn}>
                    <View style={styles.wheelHighlight} pointerEvents="none" />
                    <ScrollView
                      ref={hourScrollRef}
                      showsVerticalScrollIndicator={false}
                      style={styles.wheelScroll}
                      contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
                      onMomentumScrollEnd={(e) => {
                        if (wheelSnapInProgress.current === 'h') {
                          wheelSnapInProgress.current = null;
                          return;
                        }
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const snapped = Math.max(0, Math.min(11, idx)) * WHEEL_ITEM_HEIGHT;
                        setWheelHour(Math.max(1, Math.min(12, idx + 1)));
                        setWheelScrollY((prev) => ({ ...prev, h: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'h';
                          hourScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      onScrollEndDrag={(e) => {
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const snapped = Math.max(0, Math.min(11, idx)) * WHEEL_ITEM_HEIGHT;
                        setWheelHour(Math.max(1, Math.min(12, idx + 1)));
                        setWheelScrollY((prev) => ({ ...prev, h: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'h';
                          hourScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      snapToInterval={WHEEL_ITEM_HEIGHT}
                      snapToAlignment="start"
                      decelerationRate="fast"
                    >
                      {HOURS_12.map((hour, i) => {
                        const centerY = WHEEL_PADDING + i * WHEEL_ITEM_HEIGHT + WHEEL_ITEM_HEIGHT / 2;
                        const viewCenter = wheelScrollY.h + WHEEL_HEIGHT / 2;
                        const dist = Math.abs(centerY - viewCenter);
                        const opacity = Math.max(0.25, 1 - dist / (WHEEL_ITEM_HEIGHT * 2));
                        return (
                          <View key={hour} style={styles.wheelItem}>
                            <Text style={[styles.wheelItemText, { opacity }]}>{hour}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                  <View style={styles.wheelColumn}>
                    <View style={styles.wheelHighlight} pointerEvents="none" />
                    <ScrollView
                      ref={minuteScrollRef}
                      showsVerticalScrollIndicator={false}
                      style={styles.wheelScroll}
                      contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
                      onMomentumScrollEnd={(e) => {
                        if (wheelSnapInProgress.current === 'm') {
                          wheelSnapInProgress.current = null;
                          return;
                        }
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const clampedIdx = Math.max(0, Math.min(11, idx));
                        const snapped = clampedIdx * WHEEL_ITEM_HEIGHT;
                        setWheelMinute(clampedIdx * 5);
                        setWheelScrollY((prev) => ({ ...prev, m: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'm';
                          minuteScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      onScrollEndDrag={(e) => {
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const clampedIdx = Math.max(0, Math.min(11, idx));
                        const snapped = clampedIdx * WHEEL_ITEM_HEIGHT;
                        setWheelMinute(clampedIdx * 5);
                        setWheelScrollY((prev) => ({ ...prev, m: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'm';
                          minuteScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      snapToInterval={WHEEL_ITEM_HEIGHT}
                      snapToAlignment="start"
                      decelerationRate="fast"
                    >
                      {MINUTES_5.map((min, i) => {
                        const centerY = WHEEL_PADDING + i * WHEEL_ITEM_HEIGHT + WHEEL_ITEM_HEIGHT / 2;
                        const viewCenter = wheelScrollY.m + WHEEL_HEIGHT / 2;
                        const dist = Math.abs(centerY - viewCenter);
                        const opacity = Math.max(0.25, 1 - dist / (WHEEL_ITEM_HEIGHT * 2));
                        return (
                          <View key={min} style={styles.wheelItem}>
                            <Text style={[styles.wheelItemText, { opacity }]}>{min}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                  <View style={styles.wheelColumn}>
                    <View style={styles.wheelHighlight} pointerEvents="none" />
                    <ScrollView
                      ref={ampmScrollRef}
                      showsVerticalScrollIndicator={false}
                      style={styles.wheelScroll}
                      contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
                      onMomentumScrollEnd={(e) => {
                        if (wheelSnapInProgress.current === 'a') {
                          wheelSnapInProgress.current = null;
                          return;
                        }
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const snapped = Math.max(0, Math.min(1, idx)) * WHEEL_ITEM_HEIGHT;
                        setWheelAmPm(Math.max(0, Math.min(1, idx)));
                        setWheelScrollY((prev) => ({ ...prev, a: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'a';
                          ampmScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      onScrollEndDrag={(e) => {
                        const y = e.nativeEvent.contentOffset.y;
                        const idx = Math.round(y / WHEEL_ITEM_HEIGHT);
                        const snapped = Math.max(0, Math.min(1, idx)) * WHEEL_ITEM_HEIGHT;
                        setWheelAmPm(Math.max(0, Math.min(1, idx)));
                        setWheelScrollY((prev) => ({ ...prev, a: snapped }));
                        if (Math.abs(y - snapped) > SNAP_THRESHOLD) {
                          wheelSnapInProgress.current = 'a';
                          ampmScrollRef.current?.scrollTo({ y: snapped, animated: false });
                          fireHapticOnce();
                          setTimeout(() => { wheelSnapInProgress.current = null; }, 350);
                        }
                      }}
                      snapToInterval={WHEEL_ITEM_HEIGHT}
                      snapToAlignment="start"
                      decelerationRate="fast"
                    >
                      {AMPM.map((period, i) => {
                        const centerY = WHEEL_PADDING + i * WHEEL_ITEM_HEIGHT + WHEEL_ITEM_HEIGHT / 2;
                        const viewCenter = wheelScrollY.a + WHEEL_HEIGHT / 2;
                        const dist = Math.abs(centerY - viewCenter);
                        const opacity = Math.max(0.25, 1 - dist / (WHEEL_ITEM_HEIGHT * 2));
                        return (
                          <View key={period} style={styles.wheelItem}>
                            <Text style={[styles.wheelItemText, { opacity }]}>{period}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
                <TouchableOpacity style={styles.modalApply} onPress={applyTimePicker}>
                  <Text style={styles.modalApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={slotPickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setSlotPickerVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { paddingTop: insets.top + 12, maxHeight: '70%' }]}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    onPress={() => setSlotPickerVisible(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close time slot picker"
                  >
                    <Text style={styles.modalCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Time (GMT+7)</Text>
                  <View style={{ width: 56 }} />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.slotListScroll}>
                  {slotList.map((mins) => (
                    <TouchableOpacity
                      key={mins}
                      style={styles.slotRow}
                      onPress={() => {
                        setScheduledDate(cambodiaLocalToUtc(slotPickerDateStr, mins));
                        setSlotPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.slotRowText}>{minutesTo12h(mins)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <View style={styles.field}>
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any special instructions"
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
          </View>

          <Text style={styles.priceLine}>
            Price: ${basePrice.toFixed(2)}/hr
          </Text>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (useWorkerSlots && (availLoading || overlapLoading || !hasWorkerBookableSlots)) &&
                styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={useWorkerSlots && (availLoading || overlapLoading || !hasWorkerBookableSlots)}
          >
            <Text style={styles.submitBtnText}>Continue to review</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  headerBack: {
    width: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 20,
  },
  half: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fff',
  },
  inputText: {
    fontSize: 16,
    color: '#000',
  },
  inputDisabled: {
    opacity: 0.55,
  },
  inputTextMuted: {
    color: '#999',
  },
  cambodiaHint: {
    fontSize: 13,
    color: '#666',
    marginTop: -12,
    marginBottom: 16,
    lineHeight: 18,
  },
  phoneHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    lineHeight: 16,
  },
  slotListScroll: {
    maxHeight: 360,
  },
  slotRow: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  slotRowText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  coordsHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  addressActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  addressActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
  },
  addressActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  savedAddressesCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  addSavedAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  addSavedAddressBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  savedAddressesEmpty: {
    fontSize: 15,
    color: '#666',
    paddingVertical: 24,
  },
  savedAddressesList: {
    maxHeight: 400,
  },
  savedAddressItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  savedAddressLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  savedAddressText: {
    fontSize: 14,
    color: '#666',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priceLine: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  datePickerCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalCancel: {
    fontSize: 16,
    color: '#666',
  },
  headerSide: {
    width: 56,
  },
  wheelHeaderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelTimeDisplay: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  wheelTimeDisplayText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1976D2',
  },
  wheelRow: {
    flexDirection: 'row',
    height: WHEEL_HEIGHT,
    marginBottom: 20,
    alignItems: 'center',
  },
  wheelColumn: {
    flex: 1,
    height: WHEEL_HEIGHT,
    position: 'relative',
  },
  wheelScroll: {
    height: WHEEL_HEIGHT,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#000',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2,
    height: WHEEL_ITEM_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    alignSelf: 'center',
  },
  dayCell: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  dayCellLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#FFEB3B',
  },
  dayCellText: {
    fontSize: 15,
    lineHeight: 15,
    color: '#000',
    textAlign: 'center',
  },
  dayCellTextSelected: {
    fontWeight: '700',
  },
  dayCellDisabled: {
    opacity: 0.35,
  },
  dayCellTextMuted: {
    fontSize: 15,
    lineHeight: 15,
    color: '#BBB',
    textAlign: 'center',
  },
  modalApply: {
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalApplyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
