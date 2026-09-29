'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Notification } from '@internal/shared';
import { loadNotifications, markNotificationRead } from '../components/notification-api';

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await loadNotifications();
      setNotifications(result.notifications);
      setError('');
    } catch {
      setError('Notifications are temporarily unavailable.');
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  async function openNotification(notification: Notification) {
    if (!notification.readAt) {
      await markNotificationRead(notification.id).catch(() => undefined);
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date() } : item,
      ));
    }
    router.push(`/requests/${notification.requestId}`);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8 lg:px-8">
      <section className="surface-elevated p-6">
        <p className="text-[11px] font-bold tracking-[0.2em] text-blue-600 uppercase">Inbox</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Notifications</h1>
        <p className="mt-2 text-sm text-slate-600">Workflow updates for your active identity.</p>
      </section>

      {error && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>}
      {!error && notifications.length === 0 && (
        <div className="surface-elevated p-10 text-center text-sm text-slate-500">You’re all caught up.</div>
      )}
      <section className="space-y-3" aria-label="Notification inbox">
        {notifications.map((notification) => (
          <Link
            key={notification.id}
            href={`/requests/${notification.requestId}`}
            onClick={(event) => {
              event.preventDefault();
              void openNotification(notification);
            }}
            className={`block rounded-lg border p-4 transition hover:border-blue-300 hover:shadow-sm ${notification.readAt ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50/60'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{notification.message}</p>
                <p className="mt-1 text-xs text-slate-500">{notification.event} · {formatDate(notification.createdAt)}</p>
              </div>
              {!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
