import { useAuth } from '@/lib/contexts/AuthContext';
import { fetchPendingJobRequestCount } from '@/lib/pendingJobsCount';
import { useRefreshOnAppActive } from '@seva/shared';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type PendingJobsContextValue = {
  pendingJobsCount: number;
  setPendingJobsCount: (n: number) => void;
};

const PendingJobsContext = createContext<PendingJobsContextValue | null>(null);

export function PendingJobsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [pendingJobsCount, setPendingJobsCountState] = useState(0);
  const setPendingJobsCount = useCallback((n: number) => setPendingJobsCountState(n), []);

  const refreshCountFromServer = useCallback(async () => {
    if (!user?.id) {
      setPendingJobsCountState(0);
      return;
    }
    try {
      const n = await fetchPendingJobRequestCount(user.id);
      setPendingJobsCountState(n);
    } catch {
      // keep previous count on error
    }
  }, [user?.id]);

  useEffect(() => {
    refreshCountFromServer();
  }, [refreshCountFromServer]);

  useRefreshOnAppActive(refreshCountFromServer);

  return (
    <PendingJobsContext.Provider value={{ pendingJobsCount, setPendingJobsCount }}>
      {children}
    </PendingJobsContext.Provider>
  );
}

export function usePendingJobs() {
  const ctx = useContext(PendingJobsContext);
  return ctx ?? { pendingJobsCount: 0, setPendingJobsCount: () => {} };
}
