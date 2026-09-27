'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  approveServiceRequest,
  rejectServiceRequest,
  updateServiceRequestStatus,
} from '../actions';
import {
  categoryBadge,
  nextStatusFor,
  priorityBadge,
  statusBadge,
} from './badges';
import { getTeachingActor } from '@internal/shared';
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
  'Legal',
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

function slaSignal(slaDueAt: string | Date | null | undefined, status: ServiceRequestStatus): string {
  if (!slaDueAt) return 'No SLA';
  if (['Resolved', 'Declined'].includes(status)) return 'Closed';
  const due = new Date(slaDueAt).getTime();
  if (Number.isNaN(due)) return 'No SLA';
  return due < Date.now() ? 'Overdue' : 'On track';
}

function readActorId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('x-user-id='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
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
  const [actorId, setActorId] = useState('');

  useEffect(() => {
    setActorId(readActorId());
  }, []);

  const teaching = getTeachingActor(actorId);
  const role = teaching?.role ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (status !== 'All' && r.status !== status) return false;
      if (q && !`${r.title} ${r.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [initial, category, status, query]);

  async function advance(id: string, next: ServiceRequestStatus | null, blockedReason?: string) {
    if (!next) return;
    setBusyId(id);
    try {
      const res = await updateServiceRequestStatus(id, next, blockedReason);
      if (res.error) alert(res.error);
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      const res = await approveServiceRequest(id);
      if (res.error) alert(res.error);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string, rationale: string) {
    setBusyId(id);
    try {
      const res = await rejectServiceRequest(id, rationale);
      if (res.error) alert(res.error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or ID…"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none sm:max-w-xs"
        />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="filter-category">Category</label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-400 sm:ml-auto">
          Showing {filtered.length} of {initial.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 p-10 text-center">
          <p className="text-sm font-semibold text-slate-200">No requests match</p>
          <p className="mt-1 text-xs text-slate-500">
            Adjust filters or create a request. Select an actor above — anonymous views return 403.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          {filtered.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              busy={busyId === req.id}
              role={role}
              onAdvance={advance}
              onApprove={approve}
              onReject={reject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  req,
  busy,
  role,
  onAdvance,
  onApprove,
  onReject,
}: {
  req: ServiceRequest;
  busy: boolean;
  role: string;
  onAdvance: (id: string, next: ServiceRequestStatus | null, blockedReason?: string) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, rationale: string) => Promise<void>;
}) {
  const action = nextStatusFor(req.status);
  const [rejecting, setRejecting] = useState(false);
  const [rationale, setRationale] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [blockedReason, setBlockedReason] = useState('');
  const sla = slaSignal(req.slaDueAt, req.status);

  const isRequester = role === 'requester';
  const isHandler = role === 'handler' || role === 'operator';
  const isApprover = role === 'approver';
  const isAdmin = role === 'admin';

  return (
    <article className="border-b border-slate-700 bg-slate-800 p-4 last:border-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(req.status)}`}>
          {req.status}
        </span>
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryBadge(req.category)}`}>
          {req.category}
        </span>
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(req.priority ?? 'Standard')}`}>
          {req.priority ?? 'Standard'}
        </span>
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sla === 'Overdue' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-slate-600 text-slate-300'}`}>
          {sla}
        </span>
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-white">
        <Link href={`/requests/${req.id}`} className="hover:text-indigo-300 hover:underline">
          {req.title}
        </Link>
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        {req.category} queue
        {req.ownerId ? ` · handler assigned` : ' · unassigned'}
        {req.requesterId ? ` · by ${req.requesterId}` : ''}
        {` · updated ${formatDate(req.updatedAt)}`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/requests/${req.id}`} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline">
          Open →
        </Link>
        <span className="ml-auto flex flex-wrap gap-2">
          {!role && <span className="text-xs text-slate-500">Select an actor to act (403 without identity)</span>}
          {isRequester && <span className="text-xs text-slate-500">Track status · comment on detail page</span>}
          {isAdmin && <span className="text-xs text-slate-500">Admin view · workflow via handlers</span>}
          {isHandler && req.status === 'Submitted' && (
            <>
              <button type="button" disabled={busy} onClick={() => onAdvance(req.id, 'In Progress')} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy ? 'Working…' : 'Start work'}
              </button>
              <button type="button" disabled={busy} onClick={() => onAdvance(req.id, 'Pending Approval')} title="Route through approval" className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                Request approval
              </button>
            </>
          )}
          {isHandler && req.status === 'In Progress' && (
            <>
              <button type="button" disabled={busy} onClick={() => onAdvance(req.id, 'Resolved')} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Working…' : 'Resolve'}</button>
              <button type="button" disabled={busy} onClick={() => setBlocking((v) => !v)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">Block</button>
            </>
          )}
          {isHandler && req.status === 'Blocked' && action.next && (
            <button type="button" disabled={busy} onClick={() => onAdvance(req.id, action.next)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {busy ? 'Working…' : action.label}
            </button>
          )}
          {isApprover && req.status === 'Pending Approval' && (
            <>
              <button type="button" disabled={busy} onClick={() => onApprove(req.id)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy ? 'Working…' : 'Approve'}
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {isApprover && req.status !== 'Pending Approval' && (
            <span className="text-xs text-slate-500">Approvals act only on Pending Approval</span>
          )}
          {req.status === 'Resolved' && (
            <span className="text-xs font-semibold text-emerald-300">Completed</span>
          )}
          {req.status === 'Declined' && (
            <span className="text-xs text-slate-500">Declined</span>
          )}
        </span>
      </div>
      {rejecting && req.status === 'Pending Approval' && (
        <form
          className="mt-3 space-y-2 rounded-lg border border-slate-600 bg-slate-900 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onReject(req.id, rationale).then(() => {
              setRejecting(false);
              setRationale('');
            });
          }}
        >
          <label className="block text-[11px] font-semibold text-slate-300">Rejection rationale (required)</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} placeholder="Why is this being declined?" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || rationale.trim().length === 0} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Working…' : 'Confirm reject'}</button>
            <button type="button" onClick={() => { setRejecting(false); setRationale(''); }} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button>
          </div>
        </form>
      )}
      {blocking && req.status === 'In Progress' && (
        <form className="mt-3 space-y-2 rounded-lg border border-slate-600 bg-slate-900 p-3" onSubmit={(event) => { event.preventDefault(); void onAdvance(req.id, 'Blocked', blockedReason).then(() => { setBlocking(false); setBlockedReason(''); }); }}>
          <label className="block text-[11px] font-semibold text-slate-300">Blockage reason (required)</label>
          <textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={2} placeholder="What is preventing progress?" className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none" />
          <div className="flex gap-2"><button type="submit" disabled={busy || blockedReason.trim().length === 0} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm block</button><button type="button" onClick={() => { setBlocking(false); setBlockedReason(''); }} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancel</button></div>
        </form>
      )}
    </article>
  );
}
