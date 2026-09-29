'use client';

import { useCurrentActor } from './actor-registry';

export default function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const { actor, loading } = useCurrentActor();
  const allowed = !loading && actor?.role === 'admin';
  return (
    <div className="relative">
      <div className={!allowed ? 'pointer-events-none select-none blur-[5px] opacity-55' : ''} aria-hidden={!allowed}>
        {children}
      </div>
      {!allowed && !loading && (
        <div className="absolute inset-0 z-10 flex min-h-[520px] items-start justify-center rounded-xl bg-slate-900/15 px-6 pt-24 backdrop-blur-[2px]">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white/95 p-8 text-center shadow-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">!</div>
            <h2 className="mt-4 text-xl font-bold text-slate-950">Admin access needed</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">This command center is restricted to administrators. Your current teaching identity does not have admin access.</p>
          </div>
        </div>
      )}
    </div>
  );
}
