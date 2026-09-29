'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  approveServiceRequest,
  declineServiceRequest,
  reassignServiceRequest,
  rejectServiceRequest,
  updateServiceRequestStatus,
} from '../actions';
import {
  categoryBadge,
  nextStatusFor,
  priorityBadge,
  statusBadge,
} from './badges';
import { TEACHING_ACTORS, getTeachingActor } from '@internal/shared';
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

function slaSignal(
  slaDueAt: string | Date | null | undefined,
  status: ServiceRequestStatus,
): string {
  if (!slaDueAt) return 'No SLA';
  if (['Resolved', 'Declined'].includes(status)) return 'Closed';
  const due = new Date(slaDueAt).getTime();
  if (Number.isNaN(due)) return 'No SLA';
  return due < Date.now() ? 'Overdue' : 'On track';
}

function slaBadge(sla: string): string {
  if (sla === 'Overdue') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (sla === 'On track')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function readActorId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('x-user-id='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

type Expanded = { id: string; kind: 'reject' | 'block' | 'decline' | 'reassign' } | null;

export default function DashboardClient({
  initial,
}: {
  initial: ServiceRequest[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; message: string } | null>(
    null,
  );
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [liveMessage, setLiveMessage] = useState('');
  const [expanded, setExpanded] = useState<Expanded>(null);
  const [rationale, setRationale] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [declineRationale, setDeclineRationale] = useState('');
  const [reassignOwner, setReassignOwner] = useState('');
  const [actorId, setActorId] = useState('');

  useEffect(() => {
    // Sync teaching-actor identity from the external cookie store after mount.
    const frame = requestAnimationFrame(() => setActorId(readActorId()));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 1800);
    return () => clearTimeout(t);
  }, [success]);

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

  const filtersActive =
    category !== 'All' || status !== 'All' || query.trim().length > 0;
  const activeFilterCount =
    (category !== 'All' ? 1 : 0) +
    (status !== 'All' ? 1 : 0) +
    (query.trim().length > 0 ? 1 : 0);

  function clearFilters() {
    setCategory('All');
    setStatus('All');
    setQuery('');
    setLiveMessage('Filters cleared.');
  }

  function flashSuccess(id: string, message: string) {
    setSuccess({ id, message });
    setLiveMessage(message);
    router.refresh();
  }

  function flashError(id: string, message: string) {
    setRowErrors((prev) => ({ ...prev, [id]: message }));
    setLiveMessage(message);
  }

  async function advance(
    id: string,
    next: ServiceRequestStatus | null,
    actionKey: string,
    blockedReasonValue?: string,
  ) {
    if (!next) return;
    setBusyId(id);
    setBusyAction(actionKey);
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    try {
      const res = await updateServiceRequestStatus(
        id,
        next,
        blockedReasonValue,
      );
      if (res.error) {
        flashError(id, typeof res.error === 'string' ? res.error : 'Update failed.');
      } else {
        setExpanded(null);
        setBlockedReason('');
        flashSuccess(id, `Moved to ${next}.`);
      }
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    setBusyAction('approve');
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    try {
      const res = await approveServiceRequest(id);
      if (res.error) {
        flashError(id, typeof res.error === 'string' ? res.error : 'Approve failed.');
      } else {
        setExpanded(null);
        setRationale('');
        flashSuccess(id, 'Approved — now In Progress.');
      }
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function reject(id: string, rationaleValue: string) {
    setBusyId(id);
    setBusyAction('reject-confirm');
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    try {
      const res = await rejectServiceRequest(id, rationaleValue);
      if (res.error) {
        flashError(id, typeof res.error === 'string' ? res.error : 'Reject failed.');
      } else {
        setExpanded(null);
        setRationale('');
        flashSuccess(id, 'Declined with rationale.');
      }
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function reassign(id: string, ownerId: string) {
    setBusyId(id);
    setBusyAction('reassign-confirm');
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    try {
      const res = await reassignServiceRequest(id, ownerId);
      if (res.error) {
        flashError(id, typeof res.error === 'string' ? res.error : 'Reassign failed.');
      } else {
        setExpanded(null);
        setReassignOwner('');
        flashSuccess(id, `Reassigned to ${ownerId}.`);
      }
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function decline(id: string, rationaleValue: string) {
    setBusyId(id);
    setBusyAction('decline-confirm');
    setRowErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[id];
      return nextErrors;
    });
    try {
      const res = await declineServiceRequest(id, rationaleValue);
      if (res.error) {
        flashError(id, typeof res.error === 'string' ? res.error : 'Decline failed.');
      } else {
        setExpanded(null);
        setDeclineRationale('');
        flashSuccess(id, 'Declined with rationale.');
      }
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or ID…"
            aria-label="Search requests"
            className="field-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none sm:max-w-xs"
          />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as typeof category)
              }
              className="field-select rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'All categories' : c}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="filter-status">
              Status
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="field-select rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All statuses' : s}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 sm:ml-auto">
            Showing {filtered.length} of {initial.length}
          </p>
        </div>
        {filtersActive && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            <span className="pill-base border-blue-200 bg-blue-50 text-blue-700">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
            {category !== 'All' && (
              <span className="pill-base border-slate-200 bg-slate-100 text-slate-700">
                {category}
              </span>
            )}
            {status !== 'All' && (
              <span className="pill-base border-slate-200 bg-slate-100 text-slate-700">
                {status}
              </span>
            )}
            {query.trim().length > 0 && (
              <span className="pill-base border-slate-200 bg-slate-100 text-slate-700">
                “{query.trim().slice(0, 24)}”
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="focus-ring ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">No requests match</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Adjust filters or create a request. Select an actor in the sidebar —
            anonymous views return 403.
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary focus-ring mt-4 px-4 py-2 text-xs"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm max-h-[720px]">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Request
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Priority
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  SLA
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Updated
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => {
                const sla = slaSignal(req.slaDueAt, req.status);
                const busy = busyId === req.id;
                const isExpanded = expanded?.id === req.id;
                return (
                  <Fragment key={req.id}>
                    <tr
                      className="queue-row border-b border-slate-100 last:border-0"
                      data-busy={busy ? 'true' : 'false'}
                    >
                      <td className="max-w-[320px] px-4 py-3">
                        <Link
                          href={`/requests/${req.id}`}
                          className="focus-ring block truncate font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                          title={req.title}
                        >
                          {req.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {req.category} queue
                          {req.ownerId ? ` · owner ${req.ownerId}` : ' · unassigned'}
                          {` · ${req.id.slice(0, 8)}`}
                        </p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`pill-base ${statusBadge(req.status)}`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`pill-base ${categoryBadge(req.category)}`}
                        >
                          {req.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`pill-base ${priorityBadge(req.priority ?? 'Standard')}`}
                        >
                          {req.priority ?? 'Standard'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`pill-base ${slaBadge(sla)}`}>{sla}</span>
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500">
                        {formatDate(req.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <RequestActions
                          req={req}
                          role={role}
                          busy={busy}
                          busyAction={busyAction}
                          success={
                            success?.id === req.id ? success.message : null
                          }
                          error={rowErrors[req.id] ?? null}
                          expanded={expanded}
                          onAdvance={(next, key, reason) =>
                            advance(req.id, next, key, reason)
                          }
                          onApprove={() => approve(req.id)}
                          onToggleExpand={(kind) => {
                            setRowErrors((prev) => {
                              const n = { ...prev };
                              delete n[req.id];
                              return n;
                            });
                            setExpanded((prev) =>
                              prev?.id === req.id && prev.kind === kind
                                ? null
                                : { id: req.id, kind },
                            );
                          }}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        key={`${req.id}-panel`}
                        className="border-b border-slate-100 bg-slate-50"
                      >
                        <td colSpan={7} className="px-4 py-4">
                          {expanded.kind === 'reject' &&
                          req.status === 'Pending Approval' ? (
                            <form
                              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                              aria-label={`Reject ${req.title}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void reject(req.id, rationale);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-slate-900">
                                  Reject — rationale required
                                </h3>
                                <span className="pill-base border-slate-200 bg-slate-100 text-slate-600">
                                  {req.id.slice(0, 8)}
                                </span>
                              </div>
                              <label
                                htmlFor={`rationale-${req.id}`}
                                className="mt-2 block text-xs font-semibold tracking-wide text-slate-700 uppercase"
                              >
                                Rationale
                              </label>
                              <textarea
                                id={`rationale-${req.id}`}
                                value={rationale}
                                onChange={(e) => setRationale(e.target.value)}
                                rows={2}
                                placeholder="Why is this being declined?"
                                className="field-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                              />
                              {rowErrors[req.id] && (
                                <p
                                  role="alert"
                                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  {rowErrors[req.id]}
                                </p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="submit"
                                  disabled={
                                    busy || rationale.trim().length === 0
                                  }
                                  className="btn-table btn-table-solid focus-ring"
                                >
                                  {busy && busyAction === 'reject-confirm'
                                    ? 'Working…'
                                    : 'Confirm reject'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpanded(null);
                                    setRationale('');
                                  }}
                                  className="btn-table btn-table-quiet focus-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : expanded.kind === 'reassign' &&
                            req.status !== 'Resolved' &&
                            req.status !== 'Declined' ? (
                            <form
                              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                              aria-label={`Reassign ${req.title}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void reassign(req.id, reassignOwner);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-slate-900">
                                  Reassign ({req.category} handlers only)
                                </h3>
                                <span className="pill-base border-slate-200 bg-slate-100 text-slate-600">
                                  {req.id.slice(0, 8)}
                                </span>
                              </div>
                              <label
                                htmlFor={`owner-${req.id}`}
                                className="mt-2 block text-xs font-semibold tracking-wide text-slate-700 uppercase"
                              >
                                New owner
                              </label>
                              <select
                                id={`owner-${req.id}`}
                                value={reassignOwner}
                                onChange={(e) => setReassignOwner(e.target.value)}
                                className="field-select mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                              >
                                <option value="">Select…</option>
                                {TEACHING_ACTORS.filter(
                                  (a) =>
                                    (a.role === 'handler' || (a.role as string) === 'operator') &&
                                    a.department === req.category,
                                ).map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} · {a.id}
                                  </option>
                                ))}
                              </select>
                              {rowErrors[req.id] && (
                                <p
                                  role="alert"
                                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  {rowErrors[req.id]}
                                </p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="submit"
                                  disabled={busy || !reassignOwner}
                                  className="btn-table btn-table-solid focus-ring"
                                >
                                  {busy && busyAction === 'reassign-confirm'
                                    ? 'Working…'
                                    : 'Confirm reassign'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpanded(null);
                                    setReassignOwner('');
                                  }}
                                  className="btn-table btn-table-quiet focus-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : expanded.kind === 'decline' &&
                            (req.status === 'Submitted' ||
                              req.status === 'In Progress' ||
                              req.status === 'Blocked') ? (
                            <form
                              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                              aria-label={`Decline ${req.title}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void decline(req.id, declineRationale);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-slate-900">
                                  Decline — rationale required
                                </h3>
                                <span className="pill-base border-slate-200 bg-slate-100 text-slate-600">
                                  {req.id.slice(0, 8)}
                                </span>
                              </div>
                              <label
                                htmlFor={`decline-${req.id}`}
                                className="mt-2 block text-xs font-semibold tracking-wide text-slate-700 uppercase"
                              >
                                Rationale
                              </label>
                              <textarea
                                id={`decline-${req.id}`}
                                value={declineRationale}
                                onChange={(e) =>
                                  setDeclineRationale(e.target.value)
                                }
                                rows={2}
                                placeholder="Why is this being declined?"
                                className="field-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                              />
                              {rowErrors[req.id] && (
                                <p
                                  role="alert"
                                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  {rowErrors[req.id]}
                                </p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="submit"
                                  disabled={
                                    busy || declineRationale.trim().length === 0
                                  }
                                  className="btn-table btn-table-solid focus-ring"
                                >
                                  {busy && busyAction === 'decline-confirm'
                                    ? 'Working…'
                                    : 'Confirm decline'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpanded(null);
                                    setDeclineRationale('');
                                  }}
                                  className="btn-table btn-table-quiet focus-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : expanded.kind === 'block' &&
                            req.status === 'In Progress' ? (
                            <form
                              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                              aria-label={`Block ${req.title}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void advance(
                                  req.id,
                                  'Blocked',
                                  'block-confirm',
                                  blockedReason,
                                );
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-slate-900">
                                  Block — reason required
                                </h3>
                                <span className="pill-base border-slate-200 bg-slate-100 text-slate-600">
                                  {req.id.slice(0, 8)}
                                </span>
                              </div>
                              <label
                                htmlFor={`blocked-${req.id}`}
                                className="mt-2 block text-xs font-semibold tracking-wide text-slate-700 uppercase"
                              >
                                Blockage reason
                              </label>
                              <textarea
                                id={`blocked-${req.id}`}
                                value={blockedReason}
                                onChange={(e) =>
                                  setBlockedReason(e.target.value)
                                }
                                rows={2}
                                placeholder="What is preventing progress?"
                                className="field-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                              />
                              {rowErrors[req.id] && (
                                <p
                                  role="alert"
                                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                                >
                                  {rowErrors[req.id]}
                                </p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="submit"
                                  disabled={
                                    busy || blockedReason.trim().length === 0
                                  }
                                  className="btn-table btn-table-solid focus-ring"
                                >
                                  {busy && busyAction === 'block-confirm'
                                    ? 'Working…'
                                    : 'Confirm block'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpanded(null);
                                    setBlockedReason('');
                                  }}
                                  className="btn-table btn-table-quiet focus-ring"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RequestActions({
  req,
  role,
  busy,
  busyAction,
  success,
  error,
  expanded,
  onAdvance,
  onApprove,
  onToggleExpand,
}: {
  req: ServiceRequest;
  role: string;
  busy: boolean;
  busyAction: string | null;
  success: string | null;
  error: string | null;
  expanded: Expanded;
  onAdvance: (
    next: ServiceRequestStatus | null,
    key: string,
    reason?: string,
  ) => Promise<void>;
  onApprove: () => Promise<void>;
  onToggleExpand: (kind: 'reject' | 'block' | 'decline' | 'reassign') => void;
}) {
  const action = nextStatusFor(req.status);
  const isRequester = role === 'requester';
  const isHandler = role === 'handler' || role === 'operator';
  const isApprover = role === 'approver';
  const isAdmin = role === 'admin';
  const labelFor = (key: string, fallback: string) =>
    busy && busyAction === key ? 'Working…' : fallback;

  return (
    <div className="flex min-w-[220px] flex-col items-end gap-1">
      <div className="row-actions flex flex-wrap justify-end gap-2">
        <Link
          href={`/requests/${req.id}`}
          className="focus-ring rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:underline"
        >
          Open →
        </Link>
        {!role && (
          <span className="px-1 py-1.5 text-xs text-slate-400">
            Select an actor to act
          </span>
        )}
        {isRequester && (
          <span className="px-1 py-1.5 text-xs text-slate-400">
            Track status · comment on detail
          </span>
        )}
        {isAdmin && (
          <span className="px-1 py-1.5 text-xs text-slate-400">
            Admin view · workflow via handlers
          </span>
        )}
        {isHandler && req.status === 'Submitted' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance('In Progress', 'start')}
              className="btn-table btn-table-solid focus-ring"
            >
              {labelFor('start', 'Start work')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAdvance('Pending Approval', 'request-approval')}
              title="Route through approval"
              className="btn-table btn-table-quiet focus-ring"
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
              onClick={() => onAdvance('Resolved', 'resolve')}
              className="btn-table btn-table-solid focus-ring"
            >
              {labelFor('resolve', 'Resolve')}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded?.id === req.id && expanded.kind === 'block'}
              onClick={() => onToggleExpand('block')}
              className="btn-table btn-table-quiet focus-ring"
            >
              Block
            </button>
          </>
        )}
        {isHandler && req.status === 'Blocked' && action.next && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdvance(action.next, 'resume')}
            className="btn-table btn-table-solid focus-ring"
          >
            {labelFor('resume', action.label)}
          </button>
        )}
        {isHandler &&
          (req.status === 'Submitted' ||
            req.status === 'In Progress' ||
            req.status === 'Blocked') && (
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded?.id === req.id && expanded.kind === 'decline'}
              onClick={() => onToggleExpand('decline')}
              className="btn-table btn-table-quiet focus-ring"
            >
              Decline
            </button>
          )}
        {(isHandler || isAdmin) &&
          req.status !== 'Resolved' &&
          req.status !== 'Declined' && (
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded?.id === req.id && expanded.kind === 'reassign'}
              onClick={() => onToggleExpand('reassign')}
              className="btn-table btn-table-quiet focus-ring"
            >
              Reassign
            </button>
          )}
        {isApprover && req.status === 'Pending Approval' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="btn-table btn-table-solid focus-ring"
            >
              {labelFor('approve', 'Approve')}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-expanded={expanded?.id === req.id && expanded.kind === 'reject'}
              onClick={() => onToggleExpand('reject')}
              className="btn-table btn-table-quiet focus-ring"
            >
              Reject
            </button>
          </>
        )}
        {isApprover && req.status !== 'Pending Approval' && (
          <span className="px-1 py-1.5 text-xs text-slate-400">
            Approvals act only on Pending
          </span>
        )}
        {req.status === 'Resolved' && (
          <span className="px-1 py-1.5 text-xs font-semibold text-emerald-700">
            Completed
          </span>
        )}
        {req.status === 'Declined' && (
          <span className="px-1 py-1.5 text-xs text-slate-500">Declined</span>
        )}
      </div>
      {success && (
        <p
          role="status"
          className="animate-fade-in rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
        >
          ✓ {success}
        </p>
      )}
      {error && !expanded && (
        <p
          role="alert"
          className="max-w-[260px] rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-right text-[11px] font-medium text-rose-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
