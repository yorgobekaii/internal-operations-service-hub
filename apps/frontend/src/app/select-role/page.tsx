import ActorPicker from '../components/ActorPicker';

export const dynamic = 'force-dynamic';

export default function SelectRolePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <ActorPicker mode="landing" />
      </section>
    </main>
  );
}
