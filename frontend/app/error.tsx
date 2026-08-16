'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <h1 className="text-5xl uppercase">The presses stopped</h1>
      <p className="mt-4">
        The newsroom could not reach the CMS. Check that Strapi is running on port 1337.
      </p>
      <button
        onClick={reset}
        className="font-display mt-6 bg-accent px-5 py-3 text-sm uppercase tracking-widest text-paper"
      >
        Try again
      </button>
    </div>
  );
}
