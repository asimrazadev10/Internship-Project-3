/** Strapi 5 returns flattened attributes — no `attributes` wrapper. */
export interface Author {
  id: number;
  documentId: string;
  name: string;
  email: string;
  bio: string | null;
}

export interface Category {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description: string | null;
  articles?: Article[];
}

export interface Article {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  publishedAt: string;
  author?: Author | null;
  categories?: Category[];
}
