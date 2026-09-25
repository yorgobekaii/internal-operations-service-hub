import { Suspense } from 'react';
import AiAssistant from '../components/AiAssistant';
import NewRequestForm from '../components/NewRequestForm';

export const dynamic = 'force-dynamic';

export default function NewRequestPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-indigo-300 uppercase">
          Intake
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
          Create a request
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-400">
          Start with the AI draft for speed, or file manually — both land in the
          same governed queue with category and priority validation.
        </p>
      </div>

      <AiAssistant />

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-base font-bold text-white">File manually</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Same contract as the API and curl examples. Priority defaults to Standard.
        </p>
        <Suspense fallback={<p className="mt-4 text-xs text-slate-500">Loading form…</p>}>
          <NewRequestForm />
        </Suspense>
      </section>
    </main>
  );
}
