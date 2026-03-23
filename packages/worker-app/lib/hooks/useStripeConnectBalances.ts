import { useAuth } from '@/lib/contexts/AuthContext';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { useCallback, useEffect, useState } from 'react';

export type StripeBalances = {
  available_cents: number;
  pending_cents: number;
  noAccount: boolean;
  error: string | null;
};

export function useStripeConnectBalances() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<StripeBalances | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBalances = useCallback(async () => {
    if (!user?.id) {
      setBalances(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await invokeEdgeFunction<{
      available_cents?: number;
      pending_cents?: number;
      error?: string;
    }>('get-connect-payouts', {});
    setLoading(false);
    if (result.error && !result.data) {
      setBalances({
        available_cents: 0,
        pending_cents: 0,
        noAccount: false,
        error: result.error,
      });
      return;
    }
    const d = result.data;
    if (!d) {
      setBalances({ available_cents: 0, pending_cents: 0, noAccount: true, error: null });
      return;
    }
    const noStripe = d.error === 'No Stripe account connected';
    setBalances({
      available_cents: d.available_cents ?? 0,
      pending_cents: d.pending_cents ?? 0,
      noAccount: noStripe,
      error: d.error && !noStripe ? d.error : null,
    });
  }, [user?.id]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, refetch: fetchBalances };
}
