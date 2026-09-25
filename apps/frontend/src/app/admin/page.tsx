import AdminDashboard from '../components/AdminDashboard';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-cyan-300 uppercase">
          Operations
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
          Queue health
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Volume, backlog, SLA breaches and cycle times across every queue.
          Same data for every role — this page enforces no additional access rules.
        </p>
      </div>

      <AdminDashboard />
    </main>
  );
}
