import Link from 'next/link';
import { Byline } from '@/components/Byline';
import type { Article } from '@/lib/types';

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="border-t border-rule pt-4">
      {article.kicker && (
        <p className="font-display text-xs uppercase tracking-widest text-accent">
          {article.kicker}
        </p>
      )}
      <Link href={`/articles/${article.slug}`}>
        <h2 className="text-2xl hover:text-accent">{article.title}</h2>
      </Link>
      {article.excerpt && <p className="mt-2 text-base">{article.excerpt}</p>}
      <div className="mt-3">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
    </article>
  );
}
