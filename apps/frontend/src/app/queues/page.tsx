import Link from 'next/link';
import { cookies } from 'next/headers';
import { QUEUE_ROUTES, type Queue } from '@internal/shared';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type QueueWithCounts = Queue & { openCount: number; totalCount: number };

async function loadQueues(): Promise<QueueWithCounts[]> {
  try {
    const store = await cookies().catch(() => undefined);
    const headers: Record<string, string> = {};
    const id = store?.get('x-user-id')?.value;
    if (id) headers['x-user-id'] = id;
    const response = await fetch(`${API_BASE}${QUEUE_ROUTES.base}`, { cache: 'no-store', headers });
    return response.ok ? (await response.json()) as QueueWithCounts[] : [];
  } catch {
    return [];
  }
}

export default async function QueuesPage() {
  const queues = await loadQueues();
  const totalOpen = queues.reduce((sum, queue) => sum + queue.openCount, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <section className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">Service operations</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Queue workbench</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Handler queues are scoped to your department. Requesters and approvers use Dashboard / Approvals instead.</p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-3">
            <p className="text-2xl font-bold text-white">{totalOpen}</p>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Open in scope</p>
          </div>
        </div>
      </section>

      {queues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 p-10 text-center text-sm text-slate-400">No queue data in scope. Select a handler or admin actor above.</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {queues.map((queue) => (
            <Link key={queue.id} href={`${QUEUE_ROUTES.requestsByQueue(queue.id)}?page=1`} className="rounded-xl border border-slate-700 bg-slate-800 p-5 transition hover:border-indigo-400">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{queue.category}</p>
                  <h2 className="mt-1 text-base font-semibold text-white">{queue.name}</h2>
                </div>
                <span className="rounded-full border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-300">{queue.totalCount} total</span>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div><p className="text-3xl font-bold text-white">{queue.openCount}</p><p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Open work</p></div>
                <span className="text-xs font-semibold text-indigo-300">View queue →</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
