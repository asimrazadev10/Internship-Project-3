import { notFound } from 'next/navigation';
import { Byline } from '@/components/Byline';
import { CategoryPills } from '@/components/CategoryPills';
import { Prose } from '@/components/Prose';
import { getArticleBySlug, getArticles } from '@/lib/strapi';

export const revalidate = 60;

export async function generateStaticParams() {
  const articles = await getArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  return (
    <article className="mx-auto" style={{ maxWidth: '68ch' }}>
      <CategoryPills categories={article.categories} />
      <h1 className="mt-4" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
        {article.title}
      </h1>
      <div className="mt-5 border-b border-rule pb-5">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
      <Prose content={article.content} />
    </article>
  );
}
