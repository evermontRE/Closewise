export default function DashboardLoading() {
  return <div className="mx-auto max-w-6xl animate-pulse"><div className="h-3 w-32 rounded bg-zinc-200" /><div className="mt-4 h-10 w-72 rounded bg-zinc-200" /><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 rounded-2xl bg-zinc-200" />)}</div></div>;
}
