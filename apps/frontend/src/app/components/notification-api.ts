'use client';

import { NOTIFICATION_ROUTES, USER_ID_HEADER, type Notification } from '@internal/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function actorIdFromCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${USER_ID_HEADER}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function headers(actorId: string): HeadersInit {
  return { [USER_ID_HEADER]: actorId };
}

export async function loadNotifications(): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const actorId = actorIdFromCookie();
  if (!actorId) return { notifications: [], unreadCount: 0 };
  const response = await fetch(`${API_BASE}${NOTIFICATION_ROUTES.base}`, {
    cache: 'no-store',
    headers: headers(actorId),
  });
  if (!response.ok) throw new Error('Unable to load notifications');
  return response.json() as Promise<{ notifications: Notification[]; unreadCount: number }>;
}

export async function markNotificationRead(id: string): Promise<void> {
  const actorId = actorIdFromCookie();
  if (!actorId) return;
  await fetch(`${API_BASE}${NOTIFICATION_ROUTES.readById(id)}`, {
    method: 'PATCH',
    headers: headers(actorId),
  });
}
