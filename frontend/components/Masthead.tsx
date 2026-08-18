'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SiteSettings } from '@/lib/types';

const FALLBACK_NAV = [{ id: 0, label: 'Home', href: '/' }];

export function Masthead({ settings }: { settings: SiteSettings | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
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

        {/* Desktop nav */}
        <nav className="font-display hidden items-center gap-6 text-sm uppercase tracking-widest md:flex">
          {navLinks.map((link) => (
            <Link key={link.id} href={link.href} className="hover:text-accent min-h-[44px] min-w-[44px] flex items-center">
              {link.label}
            </Link>
          ))}
          {/*
            A link, not a form POST. Payment now happens on /subscribe with the
            Payment Element, which needs a client secret minted per visitor —
            so there is nothing for a form to post, and no price ever travels
            through the browser.
          */}
          <Link
            href="/subscribe"
            className="min-h-[44px] min-w-[44px] flex items-center uppercase tracking-widest text-accent hover:underline"
          >
            {subscribeLabel}
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center md:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-headline/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div className="absolute top-0 right-0 h-full w-72 max-w-[85vw] bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-rule px-5 py-3">
              <span className="font-display text-sm font-bold uppercase tracking-widest">Menu</span>
              <button
                type="button"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="font-display flex flex-col gap-1 px-5 py-4 text-sm uppercase tracking-widest">
              {navLinks.map((link) => (
                <Link
                  key={link.id}
                  href={link.href}
                  className="min-h-[44px] flex items-center hover:text-accent"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/subscribe"
                className="mt-4 min-h-[44px] flex items-center uppercase tracking-widest text-accent hover:underline"
                onClick={() => setMenuOpen(false)}
              >
                {subscribeLabel}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
