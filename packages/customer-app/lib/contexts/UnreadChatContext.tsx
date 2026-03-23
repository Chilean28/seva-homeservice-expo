import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type UnreadChatContextValue = {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  setRefetchUnread: (fn: (() => Promise<void>) | null) => void;
  refetchUnread: () => Promise<void>;
};

const UnreadChatContext = createContext<UnreadChatContextValue | null>(null);

export function UnreadChatProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCountState] = useState(0);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const setUnreadCount = useCallback((n: number) => setUnreadCountState(n), []);
  const setRefetchUnread = useCallback((fn: (() => Promise<void>) | null) => {
    refetchRef.current = fn;
  }, []);
  const refetchUnread = useCallback(async () => {
    await refetchRef.current?.();
  }, []);
  return (
    <UnreadChatContext.Provider value={{ unreadCount, setUnreadCount, setRefetchUnread, refetchUnread }}>
      {children}
    </UnreadChatContext.Provider>
  );
}

export function useUnreadChat() {
  const ctx = useContext(UnreadChatContext);
  return (
    ctx ?? {
      unreadCount: 0,
      setUnreadCount: () => {},
      setRefetchUnread: () => {},
      refetchUnread: async () => {},
    }
  );
}
