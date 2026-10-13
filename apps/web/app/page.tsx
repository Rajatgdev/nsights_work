export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-brand">nSights</p>
        <h1 className="mt-2 text-4xl font-semibold text-brand-ink">
          Fund research &amp; branded client decks
        </h1>
        <p className="mt-4 max-w-prose text-base text-slate-600">
          Multi-tenant platform for Irish financial-advisory firms. Scaffold is up — route
          groups, API, packages and jobs are wired. Features land per the milestone plan.
        </p>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        <a className="rounded-md border px-4 py-2 hover:bg-slate-50" href="/dashboard">
          Adviser →
        </a>
        <a className="rounded-md border px-4 py-2 hover:bg-slate-50" href="/settings">
          Firm admin →
        </a>
        <a className="rounded-md border px-4 py-2 hover:bg-slate-50" href="/admin">
          Platform admin →
        </a>
        <a className="rounded-md border px-4 py-2 hover:bg-slate-50" href="/api/health">
          API health →
        </a>
      </nav>
    </main>
  );
}
