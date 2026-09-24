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
    const role = store?.get('x-user-role')?.value;
    const dept = store?.get('x-user-dept')?.value;
    if (id) headers['x-user-id'] = id;
    if (role) headers['x-user-role'] = role;
    if (dept) headers['x-user-dept'] = dept;
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

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="card-sheen rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className={`text-2xl font-black ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
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

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <section className="card-sheen overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/25 via-slate-900 to-cyan-500/15 p-8">
        <p className="text-[11px] font-bold tracking-[0.2em] text-indigo-300 uppercase">
          Executive operations view
        </p>
        <h1 className="mt-2 max-w-xl text-3xl font-black tracking-tight text-white sm:text-4xl">
          Every internal ask, triaged and traceable.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          Intake → classification → ownership → workflow → measurement. Draft with
          AI, confirm as a human, track to resolution without chasing threads.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/new"
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow transition hover:bg-slate-200"
          >
            + New request
          </a>
          <a
            href="/approvals"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Review approvals ({approvals})
          </a>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={open} accent="text-white" />
        <Stat label="Pending approval" value={approvals} accent="text-violet-300" />
        <Stat label="Blocked" value={blocked} accent="text-orange-300" />
        <Stat label="Resolved" value={resolved} accent="text-emerald-300" />
      </section>

      <AiAssistant />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Live queue</h2>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            force-dynamic · refreshes on every action
          </span>
        </div>
        <DashboardClient initial={requests} />
      </section>
    </main>
  );
}
