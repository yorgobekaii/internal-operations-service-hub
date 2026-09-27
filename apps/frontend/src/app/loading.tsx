export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8" aria-label="Loading dashboard">
      <div className="skeleton h-44 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="skeleton h-20 rounded-lg" />
        <div className="skeleton h-20 rounded-lg" />
        <div className="skeleton h-20 rounded-lg" />
        <div className="skeleton h-20 rounded-lg" />
      </div>
      <div className="skeleton h-24 rounded-lg" />
      <div className="skeleton h-64 rounded-lg" />
    </main>
  );
}
