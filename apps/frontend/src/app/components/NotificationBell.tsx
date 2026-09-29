'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadNotifications } from './notification-api';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = await loadNotifications();
        if (active) setUnreadCount(result.unreadCount);
      } catch {
        if (active) setUnreadCount(0);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const onVisible = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      className="relative inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-800 hover:text-white"
    >
      <span aria-hidden="true" className="text-lg">♢</span>
      <span className="ml-2">Notifications</span>
      {unreadCount > 0 && (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
