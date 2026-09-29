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

export function useCurrentActor(): { actor: TeachingActor | null; loading: boolean } {
  const [actor, setActor] = useState<TeachingActor | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}${ADMIN_ROUTES.currentActor}`, { cache: 'no-store', headers: actorHeaders() })
      .then((res) => res.ok ? res.json() : null)
      .then((row: { id: string; name: string; role: string; department: string | null } | null) => {
        setActor(row ? { id: row.id, name: row.name, role: row.role as TeachingActor['role'], department: row.department, blurb: row.role } : null);
      })
      .catch(() => setActor(null))
      .finally(() => setLoading(false));
  }, []);
  return { actor, loading };
}
