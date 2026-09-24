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
    const role = store?.get('x-user-role')?.value;
    const dept = store?.get('x-user-dept')?.value;
    if (id) headers['x-user-id'] = id;
    if (role) headers['x-user-role'] = role;
    if (dept) headers['x-user-dept'] = dept;
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
        <p className="text-[11px] font-bold tracking-[0.2em] text-violet-300 uppercase">
          Governance
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
          Approval queue
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Cost-bearing, access-granting and policy-sensitive requests wait here.
          Approving releases them to <span className="text-slate-200">In Progress</span>;
          fulfillment stays blocked while pending.
        </p>
      </div>

      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100">
        <span className="font-bold">{pending.length} awaiting decision</span>
        <span className="text-violet-300"> — approve or reject with rationale from each card.</span>
      </div>

      <DashboardClient initial={pending} />
    </main>
  );
}
