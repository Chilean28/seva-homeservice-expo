import React, { createContext, useCallback, useContext, useState } from 'react';

type UnreadChatContextValue = {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
};

const UnreadChatContext = createContext<UnreadChatContextValue | null>(null);

export function UnreadChatProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCountState] = useState(0);
  const setUnreadCount = useCallback((n: number) => setUnreadCountState(n), []);
  return (
    <UnreadChatContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </UnreadChatContext.Provider>
  );
}

export function useUnreadChat() {
  const ctx = useContext(UnreadChatContext);
  return ctx ?? { unreadCount: 0, setUnreadCount: () => {} };
}
