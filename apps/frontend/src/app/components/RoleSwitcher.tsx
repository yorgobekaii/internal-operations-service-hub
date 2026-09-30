import { useActorPicker } from './ActorPicker';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Executive identity panel for the active teaching session. */
export default function RoleSwitcher() {
  const { current, isSwitching, ready, logOff } = useActorPicker('sidebar');

  if (!ready) return null;

  return (
    <section className="border-t border-indigo-800/80 bg-indigo-950/60 px-3 py-4" aria-label="Active identity">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] text-indigo-300 uppercase">Logged in as</p>
        {isSwitching && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-blue-300" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            Updating
          </span>
        )}
      </div>

      <div className="rounded-xl border border-indigo-800/80 bg-indigo-900/75 p-3 shadow-inner shadow-indigo-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold tracking-wide text-white shadow-sm shadow-blue-950/30">
            {current ? initials(current.name) : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {current?.name ?? 'No actor selected'}
            </p>
            <p className="truncate text-[11px] text-indigo-300">
              {current?.department ? `${current.blurb} · ${current.department}` : current?.blurb ?? 'Select an identity to continue'}
            </p>
          </div>
          {current && (
            <span className="shrink-0 rounded-full border border-indigo-700 bg-indigo-950/70 px-2 py-1 text-[10px] font-semibold text-indigo-200">
              Active
            </span>
          )}
        </div>

        {current ? (
          <button
            type="button"
            onClick={logOff}
            disabled={isSwitching}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-xs font-semibold text-indigo-300 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span aria-hidden="true">↪</span>
            Log off
          </button>
        ) : (
          <a
            href="/select-role"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-400/40 bg-blue-500/15 px-2.5 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/25 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
          >
            <span aria-hidden="true">→</span>
            Choose actor
          </a>
        )}
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {isSwitching ? 'Updating active identity…' : ''}
      </div>
    </section>
  );
}
