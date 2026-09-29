'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { METRICS_ROUTE, type QueueHealthReport } from '@internal/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const REFRESH_MS = 4000;

function hours(v: number | null): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}h`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function actorHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.split('; ').find((c) => c.startsWith('x-user-id='));
  const id = match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
  return id ? { 'x-user-id': id } : {};
}

export default function AdminDashboard() {
  const [report, setReport] = useState<QueueHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [asOf, setAsOf] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
        const res = await fetch(`${API_BASE}${METRICS_ROUTE}${query}`, { cache: 'no-store', headers: actorHeaders() });
        if (res.status === 403) throw new Error('Backend 403: select a handler, approver, or admin actor');
        if (!res.ok) throw new Error(`Backend ${res.status}`);
        const data = (await res.json()) as QueueHealthReport;
        if (!alive) return;
        setReport(data);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not reach metrics — is the backend running?');
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [asOf]);

  if (error && !report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!report) {
    return <p className="text-xs text-slate-500">Loading queue health…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          {asOf ? `Metrics snapshot through ${asOf}` : 'All-time metrics'} · refreshes every {REFRESH_MS / 1000}s{updatedAt ? ` · updated ${updatedAt}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAsOf('')} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${!asOf ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>All time</button>
          <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${asOf ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700'}`}>
            <span>Calendar</span>
            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className="bg-transparent text-slate-900 outline-none" />
          </label>
        </div>
      </div>
      {error && <p className="text-[11px] text-amber-700">{error}</p>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Backlog (open)" value={String(report.backlog)} />
        <Stat label="SLA breached" value={String(report.breachedOpen)} />
        <Stat label="Resolved late" value={String(report.resolvedLate)} />
        <Stat label="Declined" value={String(report.declined ?? 0)} />
        <Stat label="Volume total" value={String(report.volume.total)} />
        <Stat label="Created 24h" value={String(report.volume.last24h)} />
        <Stat label="Avg queue age" value={hours(report.avgQueueAgeHours)} />
        <Stat label="Avg cycle time" value={hours(report.avgCycleHours)} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-[11px] tracking-widest text-slate-600 uppercase">
              <th className="px-4 py-3 font-semibold">Queue</th>
              <th className="px-4 py-3 font-semibold">Open</th>
              <th className="px-4 py-3 font-semibold">Breached</th>
              <th className="px-4 py-3 font-semibold">Avg age</th>
            </tr>
          </thead>
          <tbody>
            {report.perQueue.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-500">
                  No open requests in scope.
                </td>
              </tr>
            ) : (
              report.perQueue.map((q) => (
                <tr key={`${q.category}-${q.queueId ?? 'none'}`} className="border-b border-slate-200 bg-white last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {q.name} <span className="ml-1 text-[11px] font-normal text-slate-500">{q.category}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{q.open}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {q.breached}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{hours(q.avgAgeHours)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {report.breachedOpenIds.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">
            Breached tickets ({report.breachedOpenIds.length})
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.breachedOpenIds.map((id) => (
              <li key={id}>
                <Link
                  href={`/requests/${id}`}
                  className="inline-block rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                >
                  View ticket
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
