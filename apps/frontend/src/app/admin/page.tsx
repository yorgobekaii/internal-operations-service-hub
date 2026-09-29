import AdminDashboard from '../components/AdminDashboard';
import AdminUsers from '../components/AdminUsers';
import AdminDepartments from '../components/AdminDepartments';
import AdminSettings from '../components/AdminSettings';
import AdminAudit from '../components/AdminAudit';
import AdminAccessGate from '../components/AdminAccessGate';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">
          Operations
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Admin command center
        </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
          Manage teaching identities, departments, routing, tunables, and the
          operational audit trail. Backend authorization remains authoritative.
        </p>
      </div>

      <AdminAccessGate>
        <div className="space-y-6">
          <AdminDashboard />
          <AdminUsers />
          <AdminDepartments />
          <AdminSettings />
          <AdminAudit />
        </div>
      </AdminAccessGate>
    </main>
  );
}
