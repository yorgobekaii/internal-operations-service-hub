'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function writeCookie(name: string, value: string) {
  const attrs = 'path=/; max-age=31536000; SameSite=Lax';
  document.cookie = value
    ? `${name}=${encodeURIComponent(value)}; ${attrs}`
    : `${name}=; path=/; max-age=0`;
}

export default function RoleSwitcher() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUserId(readCookie('x-user-id'));
    setRole(readCookie('x-user-role'));
    setDept(readCookie('x-user-dept'));
    setReady(true);
  }, []);

  function apply() {
    writeCookie('x-user-id', userId.trim());
    writeCookie('x-user-role', role);
    writeCookie('x-user-dept', dept);
    router.refresh();
  }

  function clear() {
    setUserId('');
    setRole('');
    setDept('');
    writeCookie('x-user-id', '');
    writeCookie('x-user-role', '');
    writeCookie('x-user-dept', '');
    router.refresh();
  }

  if (!ready) return null;

  const inputCls =
    'rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none';

  return (
    <div className="flex flex-wrap items-center gap-1.5" title="Dev identity stub — sets x-user-* cookies sent to the backend">
      <input
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="user id (e.g. alice)"
        className={`${inputCls} w-32`}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
        <option value="">role…</option>
        <option value="requester">requester</option>
        <option value="operator">operator</option>
        <option value="admin">admin</option>
      </select>
      <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls}>
        <option value="">dept…</option>
        <option value="IT">IT</option>
        <option value="HR">HR</option>
        <option value="Finance">Finance</option>
        <option value="Operations">Operations</option>
      </select>
      <button
        type="button"
        onClick={apply}
        className="rounded-lg bg-indigo-500 px-2 py-1 text-xs font-bold text-white hover:bg-indigo-400"
      >
        Use
      </button>
      {(userId || role) && (
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white"
        >
          Clear
        </button>
      )}
    </div>
  );
}
