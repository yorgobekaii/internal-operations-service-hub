'use client';

import { useEffect, useState } from 'react';
import { ADMIN_ROUTES } from '@internal/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const headers = (): Record<string, string> => { const id = document.cookie.split('; ').find((c) => c.startsWith('x-user-id='))?.split('=').slice(1).join('='); const result: Record<string, string> = { 'Content-Type': 'application/json' }; if (id) result['x-user-id'] = decodeURIComponent(id); return result; };

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]); const [departments, setDepartments] = useState<any[]>([]); const [error, setError] = useState('');
  const [form, setForm] = useState({ id: '', name: '', email: '', role: 'requester', departmentId: '' });
  async function load() { const [u, d] = await Promise.all([fetch(API + ADMIN_ROUTES.users, { headers: headers(), cache: 'no-store' }), fetch(API + ADMIN_ROUTES.departments, { headers: headers(), cache: 'no-store' })]); if (!u.ok) { setError('Admin access is required.'); return; } setUsers(await u.json()); if (d.ok) setDepartments(await d.json()); }
  useEffect(() => { void load(); }, []);
  async function add(e: React.FormEvent) { e.preventDefault(); setError(''); const res = await fetch(API + ADMIN_ROUTES.users, { method: 'POST', headers: headers(), body: JSON.stringify(form) }); if (!res.ok) { setError((await res.json()).message ?? 'Could not create user.'); return; } setForm({ id: '', name: '', email: '', role: 'requester', departmentId: '' }); void load(); }
  async function deactivate(id: string) { const replacement = window.prompt('Replacement user ID (leave blank only if no active assignments):') ?? ''; const res = await fetch(API + ADMIN_ROUTES.deactivateUser(id), { method: 'POST', headers: headers(), body: JSON.stringify({ replacementUserId: replacement || undefined }) }); if (!res.ok) setError((await res.json()).message ?? 'Could not deactivate user.'); else void load(); }
  return <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
    <div><h2 className="text-lg font-semibold text-white">Users & roles</h2><p className="text-xs text-slate-400">Manage teaching identities. Deactivation preserves history.</p></div>
    {error && <p className="rounded-lg bg-rose-950/50 p-3 text-sm text-rose-200">{error}</p>}
    <form onSubmit={add} className="grid gap-2 md:grid-cols-5">
      {(['id','name','email'] as const).map((key) => <input key={key} required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={key} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />)}
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">{['requester','handler','approver','admin'].map((r) => <option key={r}>{r}</option>)}</select>
      <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Add user</button>
    </form>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-2">Identity</th><th className="p-2">Role</th><th className="p-2">Department</th><th className="p-2">Status</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id} className="border-t border-slate-800"><td className="p-2 text-white">{u.name || u.email}<span className="block text-xs text-slate-500">{u.id}</span></td><td className="p-2 text-slate-300">{u.role}</td><td className="p-2 text-slate-300">{u.department || '—'}</td><td className="p-2">{u.active ? <span className="text-emerald-300">Active</span> : <span className="text-slate-500">Inactive</span>}</td><td className="p-2 text-right">{u.active && <button onClick={() => void deactivate(u.id)} className="text-xs text-rose-300 hover:text-rose-200">Deactivate</button>}</td></tr>)}</tbody></table></div>
  </section>;
}
