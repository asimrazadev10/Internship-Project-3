import type { Metadata } from 'next';
import { Archivo_Narrow, Spectral } from 'next/font/google';
import { CategoryBar } from '@/components/CategoryBar';
import { Masthead } from '@/components/Masthead';
import { RenderStamp } from '@/components/RenderStamp';
import { getCategories, getSiteSettings } from '@/lib/strapi';
import './globals.css';

const archivo = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-archivo-narrow',
});

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-spectral',
});

export const metadata: Metadata = {
  title: 'The Strapi Press',
  description: 'Honest. Independent. Statically regenerated.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Both fetches run on every route because the masthead and category bar are
  // in the layout. That attaches BOTH the `categories` and `site-settings`
  // tags to every route: editing either invalidates the whole site. Correct —
  // they are on every page — but it is the widest invalidation we have.
  const [categories, settings] = await Promise.all([getCategories(), getSiteSettings()]);

  return (
    <html lang="en" className={`${archivo.variable} ${spectral.variable}`}>
      <body>
        <Masthead settings={settings} />
        <CategoryBar categories={categories} />
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
        <footer className="mt-16 border-t border-rule">
          <div className="mx-auto flex max-w-6xl justify-between px-5 py-6">
            <span className="font-display text-xs uppercase tracking-widest">
              {settings?.footerText ?? 'The Strapi Press'}
            </span>
            <RenderStamp />
          </div>
        </footer>
      </body>
    </html>
  );
}
