'use client';

import { useEffect, useState } from 'react';
import { ADMIN_ROUTES, TEACHING_ACTORS, type TeachingActor } from '@internal/shared';

function actorHeaders(): Record<string, string> {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('x-user-id='));
  const id = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
  return id ? { 'x-user-id': id } : {};
}

export function useRuntimeActors(): TeachingActor[] {
  const [actors, setActors] = useState<TeachingActor[]>(TEACHING_ACTORS);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${ADMIN_ROUTES.actors}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : [])
      .then((rows: Array<{ id: string; name: string; role: string; department: string | null }>) => {
        if (rows.length) setActors(rows.map((row) => ({ id: row.id, name: row.name, role: row.role as TeachingActor['role'], department: row.department, blurb: row.role })));
      })
      .catch(() => undefined);
  }, []);
  return actors;
}

export type ActorResolution = 'loading' | 'valid' | 'invalid' | 'unavailable';

function currentActorId(): string {
  if (typeof document === 'undefined') return '';
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('x-user-id='));
  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
}

export function useCurrentActor(watchedId?: string): { actor: TeachingActor | null; loading: boolean; resolution: ActorResolution } {
  const [actor, setActor] = useState<TeachingActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<ActorResolution>('loading');
  useEffect(() => {
    let cancelled = false;
    const actorId = watchedId ?? currentActorId();

    // Do not validate an empty session. In the role picker this request used
    // to race with selection and its stale 403 could clear the new cookie.
    if (!actorId) {
      // Deferred so the effect body does not call setState synchronously
      // (react-hooks/set-state-in-effect). Runs before paint, guarded by `cancelled`.
      queueMicrotask(() => {
        if (cancelled) return;
        setActor(null);
        setLoading(false);
        setResolution('unavailable');
      });
      return () => {
        cancelled = true;
      };
    }

    // Resetting loading on actor change is intentional fetch state, not derived render state.
    // Deferred for the same lint reason; still runs before the fetch below resolves.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setResolution('loading');
      setActor(null);
    });
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${ADMIN_ROUTES.currentActor}`, { cache: 'no-store', headers: actorHeaders() })
      .then((res) => {
        if (cancelled) return null;
        if (!res.ok) {
          setResolution(res.status === 403 ? 'invalid' : 'unavailable');
          return null;
        }
        setResolution('valid');
        return res.json();
      })
      .then((row: { id: string; name: string; role: string; department: string | null } | null) => {
        if (cancelled) return;
        setActor(row ? { id: row.id, name: row.name, role: row.role as TeachingActor['role'], department: row.department, blurb: row.role } : null);
      })
      .catch(() => {
        if (cancelled) return;
        setActor(null);
        setResolution('unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [watchedId]);
  return { actor, loading, resolution };
}
