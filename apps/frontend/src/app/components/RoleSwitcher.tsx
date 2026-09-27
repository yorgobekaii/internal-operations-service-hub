'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TEACHING_ACTORS, USER_ID_HEADER } from '@internal/shared';

const COOKIE = USER_ID_HEADER;

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function writeActorCookie(value: string) {
  const attrs = 'path=/; max-age=31536000; SameSite=Lax';
  document.cookie = value
    ? `${COOKIE}=${encodeURIComponent(value)}; ${attrs}`
    : `${COOKIE}=; path=/; max-age=0`;
  // Clear legacy client-declared role/dept cookies (never trusted).
  document.cookie = 'x-user-role=; path=/; max-age=0';
  document.cookie = 'x-user-dept=; path=/; max-age=0';
}

/**
 * Compact teaching simulation picker. Writes ONLY the actor id;
 * role/department resolve server-side from the teaching registry.
 */
export default function RoleSwitcher() {
  const router = useRouter();
  const [actorId, setActorId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActorId(readCookie(COOKIE) || readCookie('x-user-id'));
    setReady(true);
  }, []);

  function onSelect(value: string) {
    setActorId(value);
    writeActorCookie(value.trim());
    router.refresh();
  }

  function reset() {
    setActorId('');
    writeActorCookie('');
    router.refresh();
  }

  if (!ready) return null;

  const current = TEACHING_ACTORS.find((a) => a.id === actorId);

  return (
    <div className="flex items-center gap-2" title="Teaching simulation — backend resolves role from the actor id">
      <label htmlFor="actor-sim" className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Viewing as
      </label>
      <select
        id="actor-sim"
        value={actorId}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none"
      >
        <option value="">Select actor…</option>
        {TEACHING_ACTORS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.blurb}{a.department ? ` (${a.department})` : ''}
          </option>
        ))}
      </select>
      {current ? (
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
          {current.name} · {current.blurb}
        </span>
      ) : (
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
          No actor — actions return 403
        </span>
      )}
      {actorId && (
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white"
        >
          Reset
        </button>
      )}
    </div>
  );
}
