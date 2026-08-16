import { describe, expect, it } from 'vitest';
import { blockKey } from '@/components/Blocks';
import type { Block } from '@/lib/types';

describe('blockKey', () => {
  it('maps each known component to a stable key', () => {
    expect(blockKey({ __component: 'blocks.rich-text', id: 1, body: 'x' })).toBe('rich-text-1');
    expect(
      blockKey({ __component: 'blocks.pull-quote', id: 2, quote: 'q', attribution: null }),
    ).toBe('pull-quote-2');
    expect(blockKey({ __component: 'blocks.callout', id: 3, text: 't', tone: 'note' })).toBe(
      'callout-3',
    );
    expect(
      blockKey({
        __component: 'blocks.code',
        id: 4,
        code: 'c',
        language: 'ts',
        showLineNumbers: false,
      }),
    ).toBe('code-4');
  });

  it('returns null for a component the renderer does not know', () => {
    // An editor can add a block type in the admin UI before the renderer
    // exists. That must degrade to a gap in the page, never a crash.
    const unknown = { __component: 'blocks.embed', id: 9 } as unknown as Block;
    expect(blockKey(unknown)).toBeNull();
  });
});
