'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { suggestTriage } from '../actions';
import { categoryBadge, priorityBadge, statusBadge } from './badges';
import type { AiTriageSuggestion } from '@internal/shared';

export default function AiAssistant() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AiTriageSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await suggestTriage(description);
      if (res.error || !res.suggestion) {
        setSuggestion(null);
        setError(res.error ?? 'Assistant failed.');
      } else {
        setSuggestion(res.suggestion);
      }
    } finally {
      setLoading(false);
    }
  }

  function applyToForm() {
    if (!suggestion) return;
    const params = new URLSearchParams({
      title: suggestion.title,
      category: suggestion.category,
      priority: suggestion.priority,
      description: suggestion.summary,
    });
    router.push(`/new?${params.toString()}`);
  }

  return (
    <section className="card-sheen overflow-hidden rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/[0.12] via-slate-900 to-cyan-400/[0.08] p-6 shadow-2xl shadow-indigo-950/40">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/30 text-indigo-100">
          ✦
        </span>
        <div>
          <h2 className="text-base font-bold text-white">AI Intake Assistant</h2>
          <p className="text-xs text-slate-400">
            Advisory draft only — you review before anything is created.
          </p>
        </div>
        {suggestion && (
          <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-400">
            {suggestion.modelVersion}
          </span>
        )}
      </div>

      <label className="mt-4 block text-xs font-semibold tracking-wide text-slate-300 uppercase">
        Describe your need
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="e.g. My laptop screen is flickering and will not turn on"
        className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runSuggest}
          disabled={loading || description.trim().length < 3}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:opacity-40"
        >
          {loading ? 'Drafting…' : '✦ Suggest with AI'}
        </button>
        <span className="text-[11px] text-slate-500">
          Instant preview · categories IT/HR/Finance/Operations/Legal · priorities
          Urgent/High/Standard/Low
        </span>
      </div>

      {loading && (
        <div className="mt-4 space-y-2" aria-label="Loading suggestion">
          <div className="skeleton h-4 w-2/3 rounded bg-white/10" />
          <div className="skeleton h-4 w-1/2 rounded bg-white/10" />
          <div className="skeleton h-16 w-full rounded-xl bg-white/[0.07]" />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200">
          {error}
        </p>
      )}

      {suggestion && !loading && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryBadge(suggestion.category)}`}>
              {suggestion.category}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadge(suggestion.priority)}`}>
              {suggestion.priority}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
              {(suggestion.confidence * 100).toFixed(0)}% confident
            </span>
            {suggestion.needsHumanReview && (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                Needs human review
              </span>
            )}
          </div>
          <p className="mt-2.5 text-sm font-bold text-white">{suggestion.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{suggestion.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyToForm}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 shadow transition hover:bg-emerald-400 disabled:opacity-40"
            >
              Continue in intake form →
            </button>
            <button
              type="button"
              onClick={() => {
                setSuggestion(null);
              }}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Discard
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Review the draft, fill the {suggestion.category} fields, then submit.
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <span className={`rounded border px-1.5 py-0.5 font-semibold ${statusBadge('Submitted')}`}>Advisory</span>{' '}
        The model only drafts — category, priority and title are re-validated by
        backend allowlists before display, and nothing is stored until you press Apply.
      </p>
    </section>
  );
}
