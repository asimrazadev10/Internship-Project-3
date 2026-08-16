/** Strapi 5 returns flattened attributes — no `attributes` wrapper. */
export interface Author {
  id: number;
  documentId: string;
  name: string;
  email: string;
  bio: string | null;
  avatar?: StrapiImage | null;
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
  body?: Block[];
  seo?: Seo | null;
  featured?: boolean | null;
  kicker?: string | null;
  cover?: StrapiImage | null;
}

/** Strapi tags each dynamic-zone entry with its component UID. */
export type Block =
  | { __component: 'blocks.rich-text'; id: number; body: string }
  | {
      __component: 'blocks.pull-quote';
      id: number;
      quote: string;
      attribution: string | null;
    }
  | {
      __component: 'blocks.callout';
      id: number;
      text: string;
      tone: 'note' | 'warning' | 'aside';
    }
  | {
      __component: 'blocks.code';
      id: number;
      code: string;
      language: string;
      showLineNumbers: boolean;
    }
  | {
      __component: 'blocks.image';
      id: number;
      image: StrapiImage | null;
      caption: string | null;
      credit: string | null;
    };

export interface StrapiImageFormat {
  url: string;
  width: number;
  height: number;
}

export interface StrapiImage {
  id: number;
  url: string;
  alternativeText: string | null;
  width: number;
  height: number;
  formats?: Record<string, StrapiImageFormat> | null;
}

export interface Seo {
  id: number;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
}

export interface NavLink {
  id: number;
  label: string;
  href: string;
}

export interface SiteSettings {
  id: number;
  documentId: string;
  tagline: string | null;
  subscribeLabel: string | null;
  footerText: string | null;
  navLinks?: NavLink[];
}
