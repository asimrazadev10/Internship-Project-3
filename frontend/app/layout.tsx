import type { Metadata } from 'next';
import { Archivo_Narrow, Spectral } from 'next/font/google';
import { CategoryBar } from '@/components/CategoryBar';
import { Masthead } from '@/components/Masthead';
import { RenderStamp } from '@/components/RenderStamp';
import { getCategories } from '@/lib/strapi';
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
  const categories = await getCategories();

  return (
    <html lang="en" className={`${archivo.variable} ${spectral.variable}`}>
      <body>
        <Masthead />
        <CategoryBar categories={categories} />
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
        <footer className="mt-16 border-t border-rule">
          <div className="mx-auto flex max-w-6xl justify-between px-5 py-6">
            <span className="font-display text-xs uppercase tracking-widest">
              The Strapi Press
            </span>
            <RenderStamp />
          </div>
        </footer>
      </body>
    </html>
  );
}
