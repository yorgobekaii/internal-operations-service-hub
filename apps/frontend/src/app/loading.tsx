export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div className="skeleton h-44 rounded-3xl bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="skeleton h-20 rounded-2xl bg-white/[0.06]" />
        <div className="skeleton h-20 rounded-2xl bg-white/[0.06]" />
        <div className="skeleton h-20 rounded-2xl bg-white/[0.06]" />
        <div className="skeleton h-20 rounded-2xl bg-white/[0.06]" />
      </div>
      <div className="skeleton h-52 rounded-2xl bg-white/[0.06]" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-40 rounded-2xl bg-white/[0.06]" />
        <div className="skeleton h-40 rounded-2xl bg-white/[0.06]" />
      </div>
    </main>
  );
}
