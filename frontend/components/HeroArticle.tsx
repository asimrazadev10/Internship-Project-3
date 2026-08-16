import Link from 'next/link';
import { Byline } from '@/components/Byline';
import { CoverImage } from '@/components/CoverImage';
import type { Article } from '@/lib/types';

export function HeroArticle({ article }: { article: Article }) {
  return (
    <article className="border-b border-rule pb-10">
      {article.kicker && (
        <p className="font-display text-xs uppercase tracking-widest text-accent">
          {article.kicker}
        </p>
      )}
      <Link href={`/articles/${article.slug}`}>
        <h1
          className="uppercase"
          style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.95 }}
        >
          {article.title}
        </h1>
      </Link>
      <CoverImage
        media={article.cover}
        alt={article.title}
        priority
        sizes="(max-width: 1024px) 100vw, 66vw"
      />
      {article.excerpt && <p className="mt-5 max-w-2xl text-xl">{article.excerpt}</p>}
      <div className="mt-4">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
    </article>
  );
}
