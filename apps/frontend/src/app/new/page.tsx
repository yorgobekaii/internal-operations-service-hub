import { createServiceRequest } from '../actions';
import AiAssistant from '../components/AiAssistant';

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
        <form
          action={async (formData: FormData) => {
            'use server';
            await createServiceRequest(formData);
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
              Title
            </label>
            <input
              name="title"
              required
              placeholder="E.g., Need access to Jira"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
              Category
            </label>
            <select
              name="category"
              required
              defaultValue=""
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
            >
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
            <select
              name="priority"
              defaultValue="Standard"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
            >
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Standard">Standard</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow transition hover:bg-slate-200"
            >
              Submit request
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
