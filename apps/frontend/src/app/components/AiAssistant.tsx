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
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          ✦
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-950">AI Intake Assistant</h2>
          <p className="text-xs text-slate-500">
            Advisory draft only — you review before anything is created.
          </p>
        </div>
        {suggestion && (
          <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[10px] text-slate-500">
            {suggestion.modelVersion}
          </span>
        )}
      </div>

      <label
        htmlFor="ai-description"
        className="mt-4 block text-xs font-semibold tracking-wide text-slate-700 uppercase"
      >
        Describe your need
      </label>
      <textarea
        id="ai-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="e.g. My laptop screen is flickering and will not turn on"
        className="field-input mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={runSuggest}
          disabled={loading || description.trim().length < 3}
          className="focus-ring rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          {loading ? 'Drafting…' : '✦ Suggest with AI'}
        </button>
        <span className="text-[11px] text-slate-500">
          Advisory only · IT/HR/Finance/Operations/Legal
        </span>
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {loading
          ? 'Drafting suggestion…'
          : error ?? (suggestion ? `Draft ready: ${suggestion.title}` : '')}
      </div>

      {loading && (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-16 w-full rounded-lg" />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
        >
          {error}
        </p>
      )}

      {suggestion && !loading && (
        <div
          key={suggestion.title}
          className="animate-fade-in mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-wrap gap-2">
            <span className={`pill-base ${categoryBadge(suggestion.category)}`}>
              {suggestion.category}
            </span>
            <span className={`pill-base ${priorityBadge(suggestion.priority)}`}>
              {suggestion.priority}
            </span>
            <span className="pill-base border-slate-200 bg-white text-slate-600">
              {(suggestion.confidence * 100).toFixed(0)}% confident
            </span>
            {suggestion.needsHumanReview && (
              <span className="pill-base border-amber-200 bg-amber-50 text-amber-700">
                Needs human review
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-bold text-slate-950">{suggestion.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{suggestion.summary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyToForm}
              className="focus-ring rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              Continue in intake form →
            </button>
            <button
              type="button"
              onClick={() => {
                setSuggestion(null);
              }}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Discard
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Review the draft, fill the {suggestion.category} fields, then submit.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        <span className={`rounded border px-1.5 py-0.5 font-semibold ${statusBadge('Submitted')}`}>Advisory</span>{' '}
        The model only drafts — nothing is stored until you submit the form.
      </p>
    </section>
  );
}
