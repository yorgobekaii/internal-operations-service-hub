import Link from 'next/link';
import { cookies } from 'next/headers';
import { QUEUE_ROUTES, SERVICE_REQUEST_STATUSES, type ServiceRequest, type ServiceRequestStatus } from '@internal/shared';
import { categoryBadge, priorityBadge, statusBadge } from '../../../components/badges';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type QueuePage = { data: ServiceRequest[]; page: number; limit: number; total: number };

function validStatus(value: string | undefined): value is ServiceRequestStatus {
  return !!value && (SERVICE_REQUEST_STATUSES as string[]).includes(value);
}

export default async function QueueRequestsPage({ params, searchParams }: PageProps<'/queues/[id]/requests'>) {
  const { id } = await params;
  const query = await searchParams;
  const status = typeof query.status === 'string' && validStatus(query.status) ? query.status : undefined;
  const page = Math.max(1, Number(typeof query.page === 'string' ? query.page : '1') || 1);
  const url = new URL(`${API_BASE}${QUEUE_ROUTES.requestsByQueue(id)}`);
  url.searchParams.set('page', String(page));
  if (status) url.searchParams.set('status', status);

  let result: QueuePage | null = null;
  try {
    const store = await cookies().catch(() => undefined);
    const headers: Record<string, string> = {};
    const actorId = store?.get('x-user-id')?.value;
    if (actorId) headers['x-user-id'] = actorId;
    const response = await fetch(url, { cache: 'no-store', headers });
    if (response.ok) result = (await response.json()) as QueuePage;
  } catch {}

  const rows = result?.data ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const hrefFor = (nextPage: number, nextStatus?: ServiceRequestStatus) => {
    const params = new URLSearchParams({ page: String(nextPage) });
    if (nextStatus) params.set('status', nextStatus);
    return `/queues/${id}/requests?${params.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/queues" className="text-xs font-semibold text-indigo-300 hover:text-white">← Queue workbench</Link>
          <p className="mt-4 text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">Queue detail</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Active request stream</h1>
        </div>
        {result && <p className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400">{result.total} requests · page {result.page} of {totalPages}</p>}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3">
        <Link href={hrefFor(1)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!status ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>All</Link>
        {SERVICE_REQUEST_STATUSES.map((item) => <Link key={item} href={hrefFor(1, item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === item ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>{item}</Link>)}
      </div>

      {!result ? <div className="rounded-xl border border-slate-600 bg-slate-800 p-6 text-sm text-slate-300">This queue could not be loaded — select a handler for this department or an admin actor.</div> : rows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-600 p-10 text-center text-sm text-slate-500">No requests match this view.</div> : (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
          {rows.map((request) => <Link key={request.id} href={`/requests/${request.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-4 transition hover:bg-slate-700/50 last:border-0">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{request.title}</p><p className="mt-1 text-[11px] text-slate-500">{request.category} queue · by {request.requesterId ?? '—'} · owner {request.ownerId ?? 'unassigned'}</p></div>
            <div className="flex flex-wrap gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(request.status)}`}>{request.status}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${categoryBadge(request.category)}`}>{request.category}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityBadge(request.priority)}`}>{request.priority}</span></div>
          </Link>)}
        </div>
      )}
      {result && totalPages > 1 && <div className="flex justify-end gap-2"><Link aria-disabled={page <= 1} href={hrefFor(Math.max(1, page - 1), status)} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 aria-disabled:pointer-events-none aria-disabled:opacity-40">Previous</Link><Link aria-disabled={page >= totalPages} href={hrefFor(Math.min(totalPages, page + 1), status)} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 aria-disabled:pointer-events-none aria-disabled:opacity-40">Next</Link></div>}
    </main>
  );
}
