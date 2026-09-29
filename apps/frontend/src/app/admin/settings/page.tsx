import AdminSettings from '../../components/AdminSettings';
import AdminAccessGate from '../../components/AdminAccessGate';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8"><p className="text-[11px] font-bold tracking-[0.2em] text-slate-500 uppercase">Administration</p><h1 className="text-2xl font-bold text-slate-950">System settings</h1><AdminAccessGate><AdminSettings /></AdminAccessGate></main>;
}
