'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createServiceRequest } from '../actions';
import {
  CATEGORY_SCHEMAS,
  SERVICE_REQUEST_CATEGORIES,
  type ServiceRequestCategory,
} from '@internal/shared';

const inputCls =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none';
const labelCls =
  'block text-xs font-semibold tracking-wide text-slate-300 uppercase';

function isCategory(v: string | null): v is ServiceRequestCategory {
  return (SERVICE_REQUEST_CATEGORIES as string[]).includes(v ?? '');
}

export default function NewRequestForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillCategory = params.get('category');
  const [category, setCategory] = useState<ServiceRequestCategory | ''>(
    isCategory(prefillCategory) ? prefillCategory : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setBusy(true);
    try {
      const res = await createServiceRequest(formData);
      if ('error' in res && res.error) {
        setError(typeof res.error === 'string' ? res.error : 'Submit failed.');
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

  const schema = category ? CATEGORY_SCHEMAS[category] : [];

  return (
    <form action={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelCls}>Title</label>
        <input
          name="title"
          required
          defaultValue={params.get('title') ?? ''}
          placeholder="E.g., Need access to Jira"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <select
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value as ServiceRequestCategory)}
          className={inputCls}
        >
          <option value="" disabled>
            Select a category…
          </option>
          {SERVICE_REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Priority</label>
        <select
          name="priority"
          defaultValue={params.get('priority') ?? 'Standard'}
          className={inputCls}
        >
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Standard">Standard</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {category === '' && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Pick a category to see only the fields triage actually needs.
        </p>
      )}

      {schema.map((field) =>
        field.type === 'select' ? (
          <div key={field.name} className={field.mapTo === 'description' ? 'sm:col-span-2' : ''}>
            <label className={labelCls}>
              {field.label}
              {field.required && <span className="text-rose-300"> *</span>}
            </label>
            <select name={field.name} required={field.required} defaultValue="" className={inputCls}>
              <option value="" disabled>
                Select…
              </option>
              {(field.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ) : field.type === 'textarea' ? (
          <div key={field.name} className="sm:col-span-2">
            <label className={labelCls}>
              {field.label}
              {field.required && <span className="text-rose-300"> *</span>}
            </label>
            <textarea
              name={field.mapTo === 'description' ? 'description' : field.name}
              required={field.required}
              rows={3}
              defaultValue={field.mapTo === 'description' ? (params.get('description') ?? '') : ''}
              placeholder={field.placeholder}
              className={`${inputCls} resize-none`}
            />
          </div>
        ) : (
          <div key={field.name}>
            <label className={labelCls}>
              {field.label}
              {field.required && <span className="text-rose-300"> *</span>}
            </label>
            <input
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              className={inputCls}
            />
          </div>
        ),
      )}

      {error && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy || category === ''}
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow transition hover:bg-slate-200 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}
