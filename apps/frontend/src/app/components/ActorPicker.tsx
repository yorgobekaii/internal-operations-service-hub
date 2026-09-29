'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TEACHING_ACTORS, USER_ID_HEADER } from '@internal/shared';

const COOKIE = USER_ID_HEADER;

export type PickerMode = 'landing' | 'sidebar';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`));
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

export function useActorPicker(mode: PickerMode) {
  const router = useRouter();
  const pathname = usePathname();
  const [actorId, setActorId] = useState('');
  const [ready, setReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setActorId(readCookie(COOKIE) || readCookie('x-user-id'));
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const target = mode === 'landing' ? '/' : '/select-role';
    if (!isSwitching || pathname !== target) return;
    const frame = requestAnimationFrame(() => setIsSwitching(false));
    return () => cancelAnimationFrame(frame);
  }, [isSwitching, mode, pathname]);

  function selectActor(value: string) {
    if (isSwitching || !value.trim()) return;
    setIsSwitching(true);
    setActorId(value);
    writeActorCookie(value.trim());
    router.replace('/');
    router.refresh();
  }

  function logOff() {
    if (isSwitching) return;
    setIsSwitching(true);
    setActorId('');
    writeActorCookie('');
    router.replace('/select-role');
    router.refresh();
  }

  const current = TEACHING_ACTORS.find((actor) => actor.id === actorId);

  return {
    actorId,
    current,
    isSwitching,
    ready,
    selectActor,
    logOff,
  };
}

export default function ActorPicker({ mode }: { mode: PickerMode }) {
  const { actorId, current, isSwitching, ready, selectActor, logOff } = useActorPicker(mode);
  const isLanding = mode === 'landing';

  if (!ready) return null;

  return (
    <div className={isLanding ? 'w-full max-w-md space-y-5' : 'flex flex-wrap items-center gap-2'}>
      {isLanding && (
        <div className="space-y-2 text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] text-blue-600 uppercase">Internal services</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Select your role</h1>
          <p className="text-sm leading-relaxed text-slate-600">
            Choose a teaching actor to enter the Operations Hub.
          </p>
        </div>
      )}
      {!isLanding && (
        <label htmlFor="actor-sim" className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
          Viewing as
        </label>
      )}
      <select
        id={isLanding ? 'landing-actor-sim' : 'actor-sim'}
        value={actorId}
        onChange={(event) => selectActor(event.target.value)}
        disabled={isSwitching}
        aria-label={isLanding ? 'Select a role' : undefined}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-wait disabled:opacity-60"
      >
        <option value="">Select actor…</option>
        {TEACHING_ACTORS.map((actor) => (
          <option key={actor.id} value={actor.id}>
            {actor.name} · {actor.blurb}{actor.department ? ` (${actor.department})` : ''}
          </option>
        ))}
      </select>
      {!isLanding && (current ? (
        <span className="rounded-full border border-indigo-400 bg-indigo-900 px-2 py-0.5 text-[11px] font-semibold text-indigo-100">
          {current.name} · {current.blurb}
        </span>
      ) : (
        <span className="rounded-full border border-indigo-800 px-2 py-0.5 text-[11px] text-indigo-300">
          No actor — actions return 403
        </span>
      ))}
      {isLanding && current && (
        <p className="text-center text-xs font-medium text-slate-500">
          {current.name} · {current.blurb}
        </p>
      )}
      {!isLanding && current && (
        <button
          type="button"
          onClick={logOff}
          disabled={isSwitching}
          className="rounded-lg border border-indigo-700 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-900 hover:text-white"
        >
          Log off
        </button>
      )}
      <div aria-live="polite" role="status" className="sr-only">
        {isSwitching
          ? isLanding
            ? 'Entering the Operations Hub…'
            : 'Logging off and returning to role selection…'
          : ''}
      </div>
    </div>
  );
}
