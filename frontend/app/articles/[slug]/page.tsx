import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { Byline } from '@/components/Byline';
import { CategoryPills } from '@/components/CategoryPills';
import { CoverImage } from '@/components/CoverImage';
import { Prose } from '@/components/Prose';
import { getArticleBySlug, getArticles } from '@/lib/strapi';

export const revalidate = 60;

export async function generateStaticParams() {
  const articles = await getArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: 'Not found' };
  }

  // SEO fields are optional, so every one falls back to the article itself.
  return {
    title: article.seo?.metaTitle || article.title,
    description: article.seo?.metaDescription || article.excerpt || undefined,
    alternates: article.seo?.canonicalUrl ? { canonical: article.seo.canonicalUrl } : undefined,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  return (
    <article className="mx-auto" style={{ maxWidth: '68ch' }}>
      <CategoryPills categories={article.categories} />
      {article.kicker && (
        <p className="font-display mt-4 text-xs uppercase tracking-widest text-accent">
          {article.kicker}
        </p>
      )}
      <h1 className="mt-4" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
        {article.title}
      </h1>
      <div className="mt-5 border-b border-rule pb-5">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
      <CoverImage
        media={article.cover}
        alt={article.title}
        priority
        sizes="(max-width: 680px) 100vw, 68ch"
      />
      {article.body && article.body.length > 0 ? (
        <Blocks blocks={article.body} />
      ) : (
        <Prose content={article.content} />
      )}
    </article>
  );
}
