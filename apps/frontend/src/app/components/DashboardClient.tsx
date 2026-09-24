'use client';

import { useMemo, useState } from 'react';
import { updateServiceRequestStatus } from '../actions';
import {
  categoryBadge,
  nextStatusFor,
  priorityBadge,
  statusBadge,
} from './badges';
import type {
  ServiceRequest,
  ServiceRequestCategory,
  ServiceRequestStatus,
} from '@internal/shared';

const CATEGORIES: Array<'All' | ServiceRequestCategory> = [
  'All',
  'IT',
  'HR',
  'Finance',
  'Operations',
];
const STATUSES: Array<'All' | ServiceRequestStatus> = [
  'All',
  'Submitted',
  'Pending Approval',
  'In Progress',
  'Blocked',
  'Resolved',
  'Declined',
];

function formatDate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function DashboardClient({
  initial,
}: {
  initial: ServiceRequest[];
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (status !== 'All' && r.status !== status) return false;
      if (q && !`${r.title} ${r.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [initial, category, status, query]);

  async function advance(id: string, next: ServiceRequestStatus | null) {
    if (!next) return;
    setBusyId(id);
    try {
      await updateServiceRequestStatus(id, next);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:flex-row lg:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or ID…"
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none lg:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                category === c
                  ? 'border-indigo-400 bg-indigo-500/25 text-white'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 lg:ml-auto">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                status === s
                  ? 'border-cyan-300 bg-cyan-400/20 text-white'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Showing {filtered.length} of {initial.length} requests
        {category !== 'All' || status !== 'All' || query ? ' (filtered)' : ''}.
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
          <p className="text-sm font-semibold text-slate-200">No requests match</p>
          <p className="mt-1 text-xs text-slate-500">
            Adjust filters or create a request with the AI assistant.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((req) => {
            const action = nextStatusFor(req.status);
            const busy = busyId === req.id;
            return (
              <article
                key={req.id}
                className="card-sheen rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-xl shadow-black/20"
              >
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(req.status)}`}
                  >
                    {req.status}
                  </span>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryBadge(req.category)}`}
                  >
                    {req.category}
                  </span>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(req.priority ?? 'Standard')}`}
                  >
                    {req.priority ?? 'Standard'}
                  </span>
                </div>
                <h3 className="mt-3 text-[15px] font-bold text-white">{req.title}</h3>
                {(req.queueId || req.ownerId || req.requesterId) && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {req.category} queue
                    {req.ownerId ? ` · Owner ${req.ownerId.slice(0, 8)}` : ''}
                    {req.requesterId ? ` · By ${req.requesterId}` : ''}
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  {req.id.slice(0, 8)} · {formatDate(req.createdAt)}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500">
                    Updated {formatDate(req.updatedAt)}
                  </span>
                  {action.next ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => advance(req.id, action.next)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold shadow transition disabled:opacity-50 ${action.classes}`}
                    >
                      {busy ? 'Working…' : action.label}
                    </button>
                  ) : req.status === 'Resolved' ? (
                    <span className="text-xs font-bold text-emerald-300">✓ Completed</span>
                  ) : (
                    <span className="text-xs font-medium text-slate-500">Declined</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
