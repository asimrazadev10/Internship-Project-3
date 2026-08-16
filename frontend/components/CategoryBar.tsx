import Link from 'next/link';
import type { Category } from '@/lib/types';

export function CategoryBar({ categories }: { categories: Category[] }) {
  return (
    <div className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl gap-8 overflow-x-auto px-5 py-3 whitespace-nowrap">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/categories/${category.slug}`}
            className="font-serif text-xl font-bold text-headline hover:text-accent"
          >
            {category.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
