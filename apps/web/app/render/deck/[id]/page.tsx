/**
 * Print layout for the PDF renderer (spec §10 /render/deck/:id?token=).
 * Served as 16:9 pages; the Playwright service loads this URL with a signed,
 * short-lived token and calls page.pdf(). Token verification happens in a
 * route handler / middleware in milestone 5.
 */
export const dynamic = 'force-dynamic';

export default async function RenderDeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  await searchParams; // token validated server-side in milestone 5
  return (
    <main className="deck">
      {/* 16:9 pages rendered here from the presentation @ its pinned data_version */}
      <section
        style={{ width: '1280px', height: '720px' }}
        className="flex items-center justify-center"
      >
        <p className="text-slate-400">Deck render target — presentation {id}</p>
      </section>
    </main>
  );
}
