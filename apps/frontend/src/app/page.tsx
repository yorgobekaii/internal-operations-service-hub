import { cookies } from 'next/headers';
import { SERVICE_REQUEST_ROUTES, type ServiceRequest } from '@internal/shared';
import AiAssistant from './components/AiAssistant';
import DashboardClient from './components/DashboardClient';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function load(): Promise<ServiceRequest[]> {
  try {
    const store = await cookies().catch(() => undefined);
    const headers: Record<string, string> = {};
    const id = store?.get('x-user-id')?.value;
    if (id) headers['x-user-id'] = id;
    const res = await fetch(`${API_BASE}${SERVICE_REQUEST_ROUTES.base}`, {
      cache: 'no-store',
      headers,
    });
    if (!res.ok) return [];
    return (await res.json()) as ServiceRequest[];
  } catch {
    return [];
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
        {label}
      </p>
    </div>
  );
}

export default async function Page() {
  const requests = await load();
  const open = requests.filter((r) =>
    ['Submitted', 'Pending Approval', 'In Progress', 'Blocked'].includes(r.status),
  ).length;
  const approvals = requests.filter((r) => r.status === 'Pending Approval').length;
  const blocked = requests.filter((r) => r.status === 'Blocked').length;
  const resolved = requests.filter((r) => r.status === 'Resolved').length;
  // Time snapshot is intentional: force-dynamic server render, evaluated once per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const overdue = requests.filter((r) => {
    if (!r.slaDueAt) return false;
    if (['Resolved', 'Declined'].includes(r.status)) return false;
    const due = new Date(r.slaDueAt).getTime();
    return !Number.isNaN(due) && due < now;
  }).length;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8">
      <section className="enterprise-hero enterprise-grid reveal-up overflow-hidden rounded-lg border border-slate-200 p-6 shadow-sm sm:p-8">
        <p className="text-[11px] font-bold tracking-[0.2em] text-blue-600 uppercase">
          Operations overview
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-slate-950">
          Service requests, managed with clarity.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          One governed queue for intake, ownership, and workflow.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href="/new"
            className="focus-ring rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            + New request
          </a>
          <a
            href="/approvals"
            className="focus-ring rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Review approvals ({approvals})
          </a>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600">
            <span
              className={`h-1.5 w-1.5 rounded-full ${overdue > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
            {open} open · {blocked} blocked · {overdue} overdue
          </span>
        </div>
      </section>

      <section className="reveal-up reveal-delay-1 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Queue metrics">
        <Stat label="Open pipeline" value={open} />
        <Stat label="Pending approval" value={approvals} />
        <Stat label="Blocked" value={blocked} />
        <Stat label="Resolved" value={resolved} />
      </section>

      <div className="reveal-up reveal-delay-2"><AiAssistant /></div>

      <section className="reveal-up reveal-delay-3" aria-label="Operational queue">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Service request queue{' '}
              <span className="ml-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 align-middle text-[11px] font-semibold text-slate-600">
                {requests.length} in scope
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Search, review, and act.</p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live data
          </span>
        </div>
        <DashboardClient initial={requests} />
      </section>
    </main>
  );
}
