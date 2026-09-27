import { cookies } from 'next/headers';
import { APPROVALS_ROUTE, type ServiceRequest } from '@internal/shared';
import DashboardClient from '../components/DashboardClient';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function load(): Promise<ServiceRequest[]> {
  try {
    const store = await cookies().catch(() => undefined);
    const headers: Record<string, string> = {};
    const id = store?.get('x-user-id')?.value;
    if (id) headers['x-user-id'] = id;
    const res = await fetch(`${API_BASE}${APPROVALS_ROUTE}`, {
      cache: 'no-store',
      headers,
    });
    if (!res.ok) return [];
    return (await res.json()) as ServiceRequest[];
  } catch {
    return [];
  }
}

export default async function ApprovalsPage() {
  const pending = await load();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">
          Governance
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          Approval queue
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Only the designated approver for each request can decide here.
          Approving releases to <span className="text-slate-200">In Progress</span>;
          fulfillment stays blocked while pending.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-200">
        <span className="font-semibold">{pending.length} awaiting decision in your scope</span>
        <span className="text-slate-400"> — designated approvers decide from each row.</span>
      </div>

      <DashboardClient initial={pending} />
    </main>
  );
}
