import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/client';
import type { WorkerProfile } from '../types/database';

export function useWorkerProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('worker_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setLoading(false);
    if (err) {
      setError(err as unknown as Error);
      setProfile(null);
      return;
    }
    setProfile((data ?? null) as unknown as WorkerProfile | null);
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setAvailability = useCallback(
    async (isAvailable: boolean) => {
      if (!profile?.id) return;
      const { error: updateError } = await supabase
        .from('worker_profiles')
        .update({ is_available: isAvailable } as never)
        .eq('id', profile.id);
      if (!updateError) {
        setProfile((p) => (p ? { ...p, is_available: isAvailable } : null));
      }
    },
    [profile?.id]
  );

  return { profile, workerId: profile?.id ?? null, loading, error, refetch, setAvailability };
}
