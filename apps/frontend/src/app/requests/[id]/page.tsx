import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  SERVICE_REQUEST_ROUTES,
  type AuditEntry,
  type Comment,
  type ServiceRequest,
} from '@internal/shared';
import { categoryBadge, priorityBadge, statusBadge } from '../../components/badges';
import CommentForm from '../../components/CommentForm';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function identity(): Promise<Record<string, string>> {
  const store = await cookies().catch(() => undefined);
  const headers: Record<string, string> = {};
  const id = store?.get('x-user-id')?.value;
  const role = store?.get('x-user-role')?.value;
  const dept = store?.get('x-user-dept')?.value;
  if (id) headers['x-user-id'] = id;
  if (role) headers['x-user-role'] = role;
  if (dept) headers['x-user-dept'] = dept;
  return headers;
}

function fmt(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function short(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headers = await identity();

  const [reqRes, auditRes, commentsRes] = await Promise.all([
    fetch(`${API_BASE}${SERVICE_REQUEST_ROUTES.byId(id)}`, { cache: 'no-store', headers }),
    fetch(`${API_BASE}${SERVICE_REQUEST_ROUTES.auditById(id)}`, { cache: 'no-store', headers }),
    fetch(`${API_BASE}${SERVICE_REQUEST_ROUTES.commentsById(id)}`, { cache: 'no-store', headers }),
  ]);

  if (reqRes.status === 404) notFound();
  if (!reqRes.ok) notFound();

  const req = (await reqRes.json()) as ServiceRequest;
  const audit = auditRes.ok ? ((await auditRes.json()) as AuditEntry[]) : [];
  const comments = commentsRes.ok ? ((await commentsRes.json()) as Comment[]) : [];
  const decisions = audit.filter((e) => e.action === 'approved' || e.action === 'rejected');

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <Link href="/" className="text-xs font-semibold text-slate-400 hover:text-white">
        ← Back to dashboard
      </Link>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-500/10 p-8">
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(req.status)}`}>
            {req.status}
          </span>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryBadge(req.category)}`}>
            {req.category}
          </span>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(req.priority ?? 'Standard')}`}>
            {req.priority ?? 'Standard'}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">{req.title}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{req.id}</p>
        {req.description && <p className="mt-3 max-w-2xl text-sm text-slate-300">{req.description}</p>}
      </section>

      {req.status === 'Blocked' && (
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm text-orange-100">
          <span className="font-bold">Blocked: </span>
          {req.blockedReason ?? 'No reason recorded.'}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Meta label="Owner" value={short(req.ownerId)} />
        <Meta label="Backup" value={short(req.backupOwnerId)} />
        <Meta label="Queue" value={req.queueId ? `${req.category} · ${short(req.queueId)}` : req.category} />
        <Meta label="Requester" value={req.requesterId ?? '—'} />
        <Meta label="SLA due" value={fmt(req.slaDueAt)} />
        <Meta label="Created" value={fmt(req.createdAt)} />
        <Meta label="Updated" value={fmt(req.updatedAt)} />
        <Meta label="Comments" value={String(comments.length)} />
      </section>

      {decisions.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold text-white">Approval history</h2>
          <ul className="mt-3 space-y-2">
            {decisions.map((d) => (
              <li key={d.id} className="text-xs text-slate-300">
                <span className={`font-bold ${d.action === 'approved' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {d.action === 'approved' ? 'Approved' : 'Rejected'}
                </span>{' '}
                by {d.actorId} · {fmt(d.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold text-white">Timeline</h2>
          {audit.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No history yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {audit.map((e) => (
                <li key={e.id} className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">{e.action}</span>
                  {e.from || e.to ? ` · ${e.from ?? '∅'} → ${e.to ?? '∅'}` : ''} · {e.actorId} ·{' '}
                  {fmt(e.createdAt)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-bold text-white">Comments ({comments.length})</h2>
          <div className="mt-3 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-500">No comments yet — start the thread.</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                    <p className="text-sm text-slate-100">{c.body}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {c.authorId} · {fmt(c.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-4">
            <CommentForm id={req.id} />
          </div>
        </section>
      </div>
    </main>
  );
}
