import React, { createContext, useCallback, useContext, useRef } from 'react';

export type PendingLocationSelection = {
  address: string;
  lat: number;
  lng: number;
  area_name?: string | null;
  location_link?: string | null;
};

type LocationSelectionContextType = {
  setPendingLocationSelection: (value: PendingLocationSelection | null) => void;
  getAndClearPendingLocationSelection: () => PendingLocationSelection | null;
};

const LocationSelectionContext = createContext<LocationSelectionContextType | undefined>(undefined);

export function LocationSelectionProvider({ children }: { children: React.ReactNode }) {
  const pendingRef = useRef<PendingLocationSelection | null>(null);

  const setPendingLocationSelection = useCallback((value: PendingLocationSelection | null) => {
    pendingRef.current = value;
  }, []);

  const getAndClearPendingLocationSelection = useCallback((): PendingLocationSelection | null => {
    const value = pendingRef.current;
    pendingRef.current = null;
    return value;
  }, []);

  return (
    <LocationSelectionContext.Provider
      value={{ setPendingLocationSelection, getAndClearPendingLocationSelection }}
    >
      {children}
    </LocationSelectionContext.Provider>
  );
}

export function useLocationSelection() {
  const ctx = useContext(LocationSelectionContext);
  if (ctx === undefined) {
    throw new Error('useLocationSelection must be used within LocationSelectionProvider');
  }
  return ctx;
}
