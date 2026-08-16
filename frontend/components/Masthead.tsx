import Link from 'next/link';
import type { SiteSettings } from '@/lib/types';

const FALLBACK_NAV = [{ id: 0, label: 'Home', href: '/' }];

export function Masthead({ settings }: { settings: SiteSettings | null }) {
  // Falls back to the hardcoded copy so a database without site settings —
  // a fresh install before seeding — still renders a complete masthead.
  const navLinks = settings?.navLinks?.length ? settings.navLinks : FALLBACK_NAV;
  const subscribeLabel = settings?.subscribeLabel || 'Subscribe';

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <div>
          <Link href="/" className="bg-headline inline-block px-3 py-2">
            <span className="font-display text-2xl font-bold uppercase tracking-tight text-paper">
              The Strapi Press
            </span>
          </Link>
          {settings?.tagline && (
            <p className="font-display mt-2 text-xs uppercase tracking-widest">{settings.tagline}</p>
          )}
        </div>
        <nav className="font-display flex items-center gap-6 text-sm uppercase tracking-widest">
          {navLinks.map((link) => (
            <Link key={link.id} href={link.href} className="hover:text-accent">
              {link.label}
            </Link>
          ))}
          <form action="/api/checkout" method="POST">
            <button
              type="submit"
              className="cursor-pointer uppercase tracking-widest text-accent hover:underline"
            >
              {subscribeLabel}
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
