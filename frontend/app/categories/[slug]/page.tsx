import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/ArticleCard';
import { getCategories, getCategoryBySlug } from '@/lib/strapi';

export const revalidate = 60;

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  const articles = category.articles ?? [];

  return (
    <>
      <header className="border-b-2 border-headline pb-4">
        <h1 className="text-accent" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
          {category.name}
        </h1>
        {category.description && <p className="mt-3 max-w-2xl text-xl">{category.description}</p>}
      </header>

      {articles.length === 0 ? (
        <p className="font-display mt-8 uppercase tracking-widest">Nothing filed here yet.</p>
      ) : (
        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
