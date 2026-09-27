import AdminDashboard from '../components/AdminDashboard';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">
          Operations
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
          Queue health
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Aggregate volume, backlog, SLA breaches and cycle times. Admin sees
          full aggregates; handlers and approvers see only their scoped queues.
          Sensitive HR/Legal payloads stay redacted for admins.
        </p>
      </div>

      <AdminDashboard />
    </main>
  );
}
