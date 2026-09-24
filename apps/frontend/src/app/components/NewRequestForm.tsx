'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createServiceRequest } from '../actions';

const inputCls =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none';

export default function NewRequestForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setBusy(true);
    try {
      const res = await createServiceRequest(formData);
      if ('error' in res && res.error) {
        setError(res.error);
        return;
      }
      if ('id' in res && res.id) {
        router.push(`/requests/${res.id}`);
        router.refresh();
      } else {
        router.push('/');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
          Title
        </label>
        <input
          name="title"
          required
          placeholder="E.g., Need access to Jira"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
          Category
        </label>
        <select name="category" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Select a category…
          </option>
          <option value="IT">IT</option>
          <option value="HR">HR</option>
          <option value="Finance">Finance</option>
          <option value="Operations">Operations</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
          Priority
        </label>
        <select name="priority" defaultValue="Standard" className={inputCls}>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Standard">Standard</option>
          <option value="Low">Low</option>
        </select>
      </div>
      {error && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow transition hover:bg-slate-200 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}
