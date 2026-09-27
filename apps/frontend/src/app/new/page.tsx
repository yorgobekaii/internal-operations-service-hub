import { Suspense } from 'react';
import AiAssistant from '../components/AiAssistant';
import NewRequestForm from '../components/NewRequestForm';

export const dynamic = 'force-dynamic';

export default function NewRequestPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8 lg:px-8">
      <div className="reveal-up">
        <p className="text-[11px] font-bold tracking-[0.2em] text-blue-600 uppercase">
          Intake
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-slate-950">
          Create a request
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          Draft with AI for speed, or file manually — same governed queue.
        </p>
      </div>

      <div className="reveal-up reveal-delay-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
            1
          </span>
          <h2 className="text-sm font-bold text-slate-900">
            Advisory AI draft{' '}
            <span className="ml-1 font-normal text-slate-500">— optional, review before use</span>
          </h2>
        </div>
        <AiAssistant />
      </div>

      <section className="reveal-up reveal-delay-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-700">
            2
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-950">File manually</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Same contract as the API. Priority defaults to Standard.
            </p>
          </div>
        </div>
        <Suspense fallback={<p className="mt-4 text-xs text-slate-500">Loading form…</p>}>
          <NewRequestForm />
        </Suspense>
      </section>
    </main>
  );
}
