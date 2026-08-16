/**
 * Prints when this page was last generated. Because pages are statically
 * rendered, the stamp only changes when ISR regenerates the page — which makes
 * revalidation visible to a reader and assertable by scripts/verify-isr.sh.
 */
export function RenderStamp() {
  const now = new Date().toISOString();

  return (
    <span data-render-stamp={now} className="font-display text-xs uppercase tracking-widest">
      Rendered {now.replace('T', ' ').slice(0, 19)} UTC
    </span>
  );
}
