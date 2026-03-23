import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@customer_payment_methods_';

export type SavedPaymentMethod = {
  id: string;
  label: string;
  last4: string;
  brand: string;
  isDefault: boolean;
  /** Stripe payment method id (pm_xxx) for charging the saved card without opening Checkout */
  stripePaymentMethodId?: string;
};

export async function getPaymentMethods(userId: string): Promise<SavedPaymentMethod[]> {
  const key = KEY_PREFIX + userId;
  try {
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as SavedPaymentMethod[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function savePaymentMethods(
  userId: string,
  methods: SavedPaymentMethod[]
): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(methods));
}

export async function addPaymentMethod(
  userId: string,
  method: Omit<SavedPaymentMethod, 'id' | 'isDefault'> & { stripePaymentMethodId?: string },
  options?: { setAsDefault?: boolean }
): Promise<SavedPaymentMethod> {
  if (!userId || typeof userId !== 'string' || userId.length < 2) {
    throw new Error('addPaymentMethod: userId is required');
  }
  const list = await getPaymentMethods(userId);
  const isFirst = list.length === 0;
  const wantDefault = options?.setAsDefault ?? isFirst;
  const newMethod: SavedPaymentMethod = {
    ...method,
    id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    isDefault: wantDefault,
    stripePaymentMethodId: method.stripePaymentMethodId,
  };
  const next = isFirst
    ? [newMethod]
    : list
        .map((m) => (wantDefault ? { ...m, isDefault: false } : m))
        .concat([newMethod]);
  await savePaymentMethods(userId, next);
  return newMethod;
}

export async function removePaymentMethod(
  userId: string,
  methodId: string
): Promise<SavedPaymentMethod[]> {
  const list = await getPaymentMethods(userId);
  const filtered = list.filter((m) => m.id !== methodId);
  const hadDefault = list.find((m) => m.id === methodId)?.isDefault;
  if (hadDefault && filtered.length > 0 && !filtered.some((m) => m.isDefault)) {
    filtered[0].isDefault = true;
  }
  await savePaymentMethods(userId, filtered);
  return filtered;
}

export async function setDefaultPaymentMethod(
  userId: string,
  methodId: string
): Promise<SavedPaymentMethod[]> {
  const list = await getPaymentMethods(userId);
  const next = list.map((m) => ({
    ...m,
    isDefault: m.id === methodId,
  }));
  await savePaymentMethods(userId, next);
  return next;
}

export function getDefaultMethod(methods: SavedPaymentMethod[]): SavedPaymentMethod | null {
  return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
}

/** Display label for a saved card, e.g. "Visa •••• 4242" or "•••• 4242" */
export function getPaymentMethodDisplayLabel(m: SavedPaymentMethod): string {
  if (m.last4) {
    const prefix = m.brand ? `${m.brand} ` : '';
    return `${prefix}•••• ${m.last4}`;
  }
  return m.label;
}
