'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveServiceRequest,
  rejectServiceRequest,
  updateServiceRequestStatus,
} from '../actions';
import { nextStatusFor } from './badges';
import { getTeachingActor } from '@internal/shared';
import type { ServiceRequest, ServiceRequestStatus } from '@internal/shared';

function readActorId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('x-user-id='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

/**
 * Slice 1 — reusable workflow actions for the detail page.
 * Mirrors the DashboardClient table actions (Start / Request approval /
 * Resolve / Block+reason / Resume / Approve / Reject+rationale) with
 * identical role gating, so deep links (/requests/:id) are actionable.
 * Teaching identity: reads ONLY x-user-id; role resolves via registry.
 */
export default function RequestActions({ req }: { req: ServiceRequest }) {
  const router = useRouter();
  const [actorId, setActorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<'reject' | 'block' | null>(null);
  const [rationale, setRationale] = useState('');
  const [blockedReason, setBlockedReason] = useState('');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setActorId(readActorId()));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2200);
    return () => clearTimeout(t);
  }, [success]);

  const teaching = getTeachingActor(actorId);
  const role = teaching?.role ?? '';
  const isHandler = role === 'handler' || (role as string) === 'operator';
  const isApprover = role === 'approver';
  const isRequester = role === 'requester';
  const isAdmin = role === 'admin';
  const action = nextStatusFor(req.status);

  function done(message: string) {
    setSuccess(message);
    setError(null);
    setExpanded(null);
    setRationale('');
    setBlockedReason('');
    router.refresh();
  }

  function fail(message: string) {
    setError(message);
    setSuccess(null);
  }

  async function advance(
    next: ServiceRequestStatus | null,
    key: string,
    reason?: string,
  ) {
    if (!next) return;
    setBusy(true);
    setBusyAction(key);
    setError(null);
    try {
      const res = await updateServiceRequestStatus(req.id, next, reason);
      if (res.error) fail(typeof res.error === 'string' ? res.error : 'Update failed.');
      else done(`Moved to ${next}.`);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function approve() {
    setBusy(true);
    setBusyAction('approve');
    setError(null);
    try {
      const res = await approveServiceRequest(req.id);
      if (res.error) fail(typeof res.error === 'string' ? res.error : 'Approve failed.');
      else done('Approved — now In Progress.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function reject() {
    setBusy(true);
    setBusyAction('reject-confirm');
    setError(null);
    try {
      const res = await rejectServiceRequest(req.id, rationale);
      if (res.error) fail(typeof res.error === 'string' ? res.error : 'Reject failed.');
      else done('Declined with rationale.');
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  const labelFor = (key: string, fallback: string) =>
    busy && busyAction === key ? 'Working…' : fallback;

  return (
    <section
      aria-label="Workflow actions"
      className="rounded-xl border border-slate-700 bg-slate-800 p-5"
    >
      <h2 className="text-sm font-bold text-white">Workflow actions</h2>

      {!role && (
        <p className="mt-2 text-xs text-slate-400">
          Select an actor in the sidebar — anonymous actions return 403.
        </p>
      )}
      {isRequester && (
        <p className="mt-2 text-xs text-slate-400">Track status · comment below.</p>
      )}
      {isAdmin && (
        <p className="mt-2 text-xs text-slate-400">
          Admin view · workflow via handlers.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isHandler && req.status === 'Submitted' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void advance('In Progress', 'start')}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {labelFor('start', 'Start work → In Progress')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void advance('Pending Approval', 'request-approval')}
              title="Route through approval"
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              {labelFor('request-approval', 'Request approval')}
            </button>
          </>
        )}
        {isHandler && req.status === 'In Progress' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void advance('Resolved', 'resolve')}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {labelFor('resolve', 'Resolve → Resolved')}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded === 'block'}
              onClick={() => setExpanded((p) => (p === 'block' ? null : 'block'))}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              Block
            </button>
          </>
        )}
        {isHandler && req.status === 'Blocked' && action.next && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void advance(action.next, 'resume')}
            className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {labelFor('resume', action.label)}
          </button>
        )}
        {isApprover && req.status === 'Pending Approval' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void approve()}
              className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {labelFor('approve', 'Approve → In Progress')}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded === 'reject'}
              onClick={() => setExpanded((p) => (p === 'reject' ? null : 'reject'))}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {isApprover && req.status !== 'Pending Approval' && (
          <p className="py-2 text-xs text-slate-400">Approvals act only on Pending.</p>
        )}
        {req.status === 'Resolved' && (
          <span className="py-2 text-xs font-semibold text-emerald-300">Completed</span>
        )}
        {req.status === 'Declined' && (
          <span className="py-2 text-xs text-slate-400">Declined</span>
        )}
      </div>

      {expanded === 'reject' && req.status === 'Pending Approval' && (
        <form
          aria-label={`Reject ${req.title}`}
          className="mt-4 rounded-lg border border-slate-600 bg-slate-900 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void reject();
          }}
        >
          <label
            htmlFor={`detail-rationale-${req.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
          >
            Rationale (required)
          </label>
          <textarea
            id={`detail-rationale-${req.id}`}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            placeholder="Why is this being declined?"
            className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={busy || rationale.trim().length === 0}
              className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {busy && busyAction === 'reject-confirm' ? 'Working…' : 'Confirm reject'}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(null);
                setRationale('');
              }}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {expanded === 'block' && req.status === 'In Progress' && (
        <form
          aria-label={`Block ${req.title}`}
          className="mt-4 rounded-lg border border-slate-600 bg-slate-900 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void advance('Blocked', 'block-confirm', blockedReason);
          }}
        >
          <label
            htmlFor={`detail-blocked-${req.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-slate-300"
          >
            Blockage reason (required)
          </label>
          <textarea
            id={`detail-blocked-${req.id}`}
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            rows={2}
            placeholder="What is preventing progress?"
            className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={busy || blockedReason.trim().length === 0}
              className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {busy && busyAction === 'block-confirm' ? 'Working…' : 'Confirm block'}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(null);
                setBlockedReason('');
              }}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {success && (
        <p role="status" className="mt-3 text-xs font-semibold text-emerald-300">
          ✓ {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200"
        >
          {error}
        </p>
      )}
    </section>
  );
}
