'use client';

import { useRef, useState } from 'react';
import { addComment } from '../actions';

export default function CommentForm({ id }: { id: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setBusy(true);
    try {
      const res = await addComment(id, formData);
      if ('error' in res && res.error) {
        setError(res.error);
      } else {
        formRef.current?.reset();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <textarea
        name="body"
        rows={2}
        placeholder="Ask for an update, add context…"
        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
      />
      {error && (
        <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-white px-4 py-1.5 text-xs font-bold text-slate-950 shadow transition hover:bg-slate-200 disabled:opacity-50"
      >
        {busy ? 'Posting…' : 'Post comment'}
      </button>
    </form>
  );
}
