'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { METRICS_ROUTE, type QueueHealthReport } from '@internal/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const REFRESH_MS = 4000;

function hours(v: number | null): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)}h`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card-sheen rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className={`text-2xl font-black ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
        {label}
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  const [report, setReport] = useState<QueueHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}${METRICS_ROUTE}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Backend ${res.status}`);
        const data = (await res.json()) as QueueHealthReport;
        if (!alive) return;
        setReport(data);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString());
      } catch {
        if (alive) setError('Could not reach metrics — is the backend running?');
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (error && !report) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  if (!report) {
    return <p className="text-xs text-slate-500">Loading queue health…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live · refreshes every {REFRESH_MS / 1000}s{updatedAt ? ` · updated ${updatedAt}` : ''}
        </p>
        {error && <p className="text-[11px] text-amber-300">{error}</p>}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Backlog (open)" value={String(report.backlog)} accent="text-white" />
        <Stat label="SLA breached" value={String(report.breachedOpen)} accent="text-rose-300" />
        <Stat label="Resolved late" value={String(report.resolvedLate)} accent="text-orange-300" />
        <Stat label="Volume total" value={String(report.volume.total)} accent="text-white" />
        <Stat label="Created 24h" value={String(report.volume.last24h)} accent="text-cyan-300" />
        <Stat label="Avg queue age" value={hours(report.avgQueueAgeHours)} accent="text-white" />
        <Stat label="Avg cycle time" value={hours(report.avgCycleHours)} accent="text-emerald-300" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] tracking-widest text-slate-400 uppercase">
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
                  No open requests.
                </td>
              </tr>
            ) : (
              report.perQueue.map((q) => (
                <tr key={`${q.category}-${q.queueId ?? 'none'}`} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-semibold text-white">
                    {q.name} <span className="ml-1 text-[11px] font-normal text-slate-500">{q.category}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{q.open}</td>
                  <td className={`px-4 py-3 font-semibold ${q.breached > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                    {q.breached}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{hours(q.avgAgeHours)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {report.breachedOpenIds.length > 0 && (
        <section className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] p-5">
          <h2 className="text-sm font-bold text-rose-200">
            Breached tickets ({report.breachedOpenIds.length})
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.breachedOpenIds.map((id) => (
              <li key={id}>
                <Link
                  href={`/requests/${id}`}
                  className="inline-block rounded-lg border border-rose-400/30 px-2 py-1 font-mono text-[11px] text-rose-100 hover:bg-rose-500/20"
                >
                  {id.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
