import Image from 'next/image';
import { Prose } from '@/components/Prose';
import { imageAlt, imageUrl } from '@/lib/media';
import type { Block } from '@/lib/types';

const KNOWN: Record<string, string> = {
  'blocks.rich-text': 'rich-text',
  'blocks.pull-quote': 'pull-quote',
  'blocks.callout': 'callout',
  'blocks.code': 'code',
  'blocks.image': 'image',
};

/** Stable React key, and the test for whether this block can be rendered. */
export function blockKey(block: Block): string | null {
  const name = KNOWN[block.__component];
  return name ? `${name}-${block.id}` : null;
}

function CalloutBlock({ text, tone }: { text: string; tone: 'note' | 'warning' | 'aside' }) {
  // Tone changes the rule colour only — the palette stays fixed.
  const border = tone === 'warning' ? 'border-accent' : 'border-rule';
  return (
    <aside className={`mt-8 border-l-2 ${border} pl-5`}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">{tone}</p>
      <p className="mt-2">{text}</p>
    </aside>
  );
}

function CodeBlock({ code, showLineNumbers }: { code: string; showLineNumbers: boolean }) {
  const lines = code.split('\n');
  return (
    <pre className="mt-8 overflow-x-auto border border-rule p-5 font-mono text-sm">
      <code>
        {lines.map((line, index) => (
          <span key={index} className="block">
            {showLineNumbers && (
              <span className="mr-4 inline-block w-6 select-none text-right text-rule">
                {index + 1}
              </span>
            )}
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-8">
      {blocks.map((block) => {
        const key = blockKey(block);
        if (!key) {
          console.warn(`[blocks] no renderer for '${block.__component}', skipping`);
          return null;
        }

        switch (block.__component) {
          case 'blocks.rich-text':
            return <Prose key={key} content={block.body} />;
          case 'blocks.pull-quote':
            return (
              <blockquote key={key} className="mt-10 border-t border-rule pt-6">
                <p className="text-3xl leading-snug text-headline">{block.quote}</p>
                {block.attribution && (
                  <p className="font-display mt-3 text-xs uppercase tracking-widest text-accent">
                    {block.attribution}
                  </p>
                )}
              </blockquote>
            );
          case 'blocks.callout':
            return <CalloutBlock key={key} text={block.text} tone={block.tone} />;
          case 'blocks.code':
            return (
              <CodeBlock key={key} code={block.code} showLineNumbers={block.showLineNumbers} />
            );
          case 'blocks.image': {
            const src = imageUrl(block.image);
            if (!src) {
              console.warn('[blocks] image block has no populated media, skipping');
              return null;
            }
            return (
              <figure key={key} className="mt-10">
                <div className="relative aspect-[16/9] w-full overflow-hidden border border-rule">
                  <Image
                    src={src}
                    alt={imageAlt(block.image, block.caption ?? 'Article image')}
                    fill
                    sizes="(max-width: 680px) 100vw, 68ch"
                    className="object-cover"
                  />
                </div>
                {block.caption && <figcaption className="mt-3 text-base">{block.caption}</figcaption>}
                {block.credit && (
                  <p className="font-display mt-1 text-xs uppercase tracking-widest text-accent">
                    {block.credit}
                  </p>
                )}
              </figure>
            );
          }
        }
      })}
    </div>
  );
}
