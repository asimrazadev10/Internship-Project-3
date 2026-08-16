import Link from 'next/link';

export function Masthead() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <Link href="/" className="bg-headline px-3 py-2">
          <span className="font-display text-2xl font-bold uppercase tracking-tight text-paper">
            The Strapi Press
          </span>
        </Link>
        <nav className="font-display flex items-center gap-6 text-sm uppercase tracking-widest">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="cursor-default text-accent">Subscribe</span>
        </nav>
      </div>
    </header>
  );
}
