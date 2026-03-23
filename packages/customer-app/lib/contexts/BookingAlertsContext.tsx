import React, { createContext, useCallback, useContext, useState } from 'react';

type BookingAlertsContextValue = {
  /** Number of bookings waiting for worker to accept (pending). Red dot on Booking tab when > 0. */
  pendingBookingCount: number;
  setPendingBookingCount: (n: number) => void;
};

const BookingAlertsContext = createContext<BookingAlertsContextValue | null>(null);

export function BookingAlertsProvider({ children }: { children: React.ReactNode }) {
  const [pendingBookingCount, setPendingBookingCountState] = useState(0);
  const setPendingBookingCount = useCallback((n: number) => setPendingBookingCountState(n), []);
  return (
    <BookingAlertsContext.Provider value={{ pendingBookingCount, setPendingBookingCount }}>
      {children}
    </BookingAlertsContext.Provider>
  );
}

export function useBookingAlerts() {
  const ctx = useContext(BookingAlertsContext);
  return ctx ?? { pendingBookingCount: 0, setPendingBookingCount: () => {} };
}
