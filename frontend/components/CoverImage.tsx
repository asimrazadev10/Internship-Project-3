import Image from 'next/image';
import { imageAlt, imageUrl } from '@/lib/media';
import type { StrapiImage } from '@/lib/types';

/**
 * Renders a 16:9 cover, or nothing at all when the media is absent — every
 * image on this site is optional, and a missing one falls back to the
 * text-only layout rather than a broken frame.
 */
export function CoverImage({
  media,
  alt,
  format,
  priority = false,
  sizes,
}: {
  media: StrapiImage | null | undefined;
  alt: string;
  format?: string;
  priority?: boolean;
  sizes: string;
}) {
  const src = imageUrl(media, format);

  if (!src) {
    return null;
  }

  return (
    <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden border border-rule">
      <Image
        src={src}
        alt={imageAlt(media, alt)}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
