'use client';

import { useEffect, useState } from 'react';
import { ADMIN_ROUTES, TEACHING_ACTORS, type TeachingActor } from '@internal/shared';

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
