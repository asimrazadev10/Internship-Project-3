import Link from 'next/link';
import type { Category } from '@/lib/types';

export function CategoryPills({ categories }: { categories?: Category[] }) {
  if (!categories?.length) return null;

  return (
    <p className="font-display flex flex-wrap gap-4 text-xs uppercase tracking-widest text-accent">
      {categories.map((category) => (
        <Link key={category.slug} href={`/categories/${category.slug}`} className="min-h-[44px] min-w-[44px] flex items-center hover:underline">
          {category.name}
        </Link>
      ))}
    </p>
  );
}
