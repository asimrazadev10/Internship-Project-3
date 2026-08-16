import Link from 'next/link';
import type { Category } from '@/lib/types';

export function CategoryPills({ categories }: { categories?: Category[] }) {
  if (!categories?.length) return null;

  return (
    <p className="font-display flex gap-4 text-xs uppercase tracking-widest text-accent">
      {categories.map((category) => (
        <Link key={category.slug} href={`/categories/${category.slug}`} className="hover:underline">
          {category.name}
        </Link>
      ))}
    </p>
  );
}
