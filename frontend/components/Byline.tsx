import Image from 'next/image';
import { imageAlt, imageUrl } from '@/lib/media';
import type { Author } from '@/lib/types';

/** Formats an ISO date the way the reference masthead does: 08.16.26 */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}.${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

export function Byline({ author, date }: { author?: Author | null; date: string }) {
  const avatar = imageUrl(author?.avatar, 'thumbnail');

  return (
    <p className="font-display flex items-center gap-2 text-sm uppercase tracking-widest">
      {avatar && (
        <Image
          src={avatar}
          alt={imageAlt(author?.avatar, author?.name ?? 'Author')}
          width={28}
          height={28}
          className="rounded-full object-cover"
        />
      )}
      <span className="text-accent">{author?.name ?? 'The Strapi Press'}</span>
      <span className="text-ink"> — {formatStamp(date)}</span>
    </p>
  );
}
