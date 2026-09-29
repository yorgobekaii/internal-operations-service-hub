import AdminSettings from '../../components/AdminSettings';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8"><p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">Administration</p><h1 className="text-2xl font-bold text-white">System settings</h1><AdminSettings /></main>;
}
