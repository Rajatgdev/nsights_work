export default function AdviserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-slate-50 p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Adviser
        </p>
        <nav className="flex flex-col gap-1 text-sm">
          <a className="rounded px-2 py-1 hover:bg-white" href="/dashboard">Dashboard</a>
          <a className="rounded px-2 py-1 hover:bg-white" href="/research">Research</a>
          <a className="rounded px-2 py-1 hover:bg-white" href="/portfolios">Portfolios</a>
          <a className="rounded px-2 py-1 hover:bg-white" href="/presentations">Presentations</a>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
