import { ArticleCard } from '@/components/ArticleCard';
import { HeroArticle } from '@/components/HeroArticle';
import { getArticles } from '@/lib/strapi';

export const revalidate = 60;

export default async function Home() {
  const articles = await getArticles();
  const [hero, ...rest] = articles;

  if (!hero) {
    return <p className="font-display uppercase tracking-widest">No articles published yet.</p>;
  }

  const rail = rest.slice(0, 2);
  const grid = rest.slice(2);

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <HeroArticle article={hero} />
        <div className="flex flex-col gap-6 lg:border-l lg:border-rule lg:pl-8">
          {rail.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>
      {grid.length > 0 && (
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {grid.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
