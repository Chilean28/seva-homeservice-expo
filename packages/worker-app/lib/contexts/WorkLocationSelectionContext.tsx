import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type PendingWorkLocation = {
  lat: number;
  lng: number;
  displayName: string | null;
  link: string | null;
};

type WorkLocationSelectionContextValue = {
  setPending: (value: PendingWorkLocation | null) => void;
  getAndClear: () => PendingWorkLocation | null;
};

const WorkLocationSelectionContext = createContext<WorkLocationSelectionContextValue | null>(null);

export function WorkLocationSelectionProvider({ children }: { children: React.ReactNode }) {
  const pendingRef = useRef<PendingWorkLocation | null>(null);
  const [, setTick] = useState(0);

  const setPending = useCallback((value: PendingWorkLocation | null) => {
    pendingRef.current = value;
    setTick((t) => t + 1);
  }, []);

  const getAndClear = useCallback(() => {
    const value = pendingRef.current;
    pendingRef.current = null;
    return value;
  }, []);

  const value: WorkLocationSelectionContextValue = { setPending, getAndClear };

  return (
    <WorkLocationSelectionContext.Provider value={value}>
      {children}
    </WorkLocationSelectionContext.Provider>
  );
}

export function useWorkLocationSelection() {
  const ctx = useContext(WorkLocationSelectionContext);
  if (!ctx) throw new Error('useWorkLocationSelection must be used within WorkLocationSelectionProvider');
  return ctx;
}
