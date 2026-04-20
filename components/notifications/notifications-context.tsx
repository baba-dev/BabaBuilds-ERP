'use client';

import { createContext, useContext } from 'react';
import { useNotifications, type UseNotificationsReturn } from '@/hooks/use-notifications';

const NotificationsContext = createContext<UseNotificationsReturn | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notifications = useNotifications();
  return <NotificationsContext.Provider value={notifications}>{children}</NotificationsContext.Provider>;
}

export function useNotificationsContext(): UseNotificationsReturn {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return ctx;
}
