import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@seva_pending_card_payment';

export type PendingCardPayment = {
  userId: string;
  workerId?: string;
  serviceId: string;
  serviceName: string;
  basePrice: number;
  scheduledDateIso: string;
  address: string;
  notes: string;
  estimateTotal: number;
  /** Service location for bookings row (RLS / nearby workers). */
  serviceLat?: number;
  serviceLng?: number;
};

export async function setPendingCardPayment(data: PendingCardPayment): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function getPendingCardPayment(): Promise<PendingCardPayment | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingCardPayment;
  } catch {
    return null;
  }
}

export async function clearPendingCardPayment(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
