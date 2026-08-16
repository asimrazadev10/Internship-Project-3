import { describe, expect, it } from 'vitest';
import { parseBlocks } from '@/components/Prose';

describe('parseBlocks', () => {
  it('splits headings from paragraphs', () => {
    expect(parseBlocks('## The schema outlives the code\n\nApplication code gets rewritten.')).toEqual([
      { type: 'heading', text: 'The schema outlives the code' },
      { type: 'paragraph', text: 'Application code gets rewritten.' },
    ]);
  });

  it('treats anything unrecognised as a paragraph', () => {
    expect(parseBlocks('- a list item')).toEqual([{ type: 'paragraph', text: '- a list item' }]);
  });

  it('drops empty blocks', () => {
    expect(parseBlocks('One.\n\n\n\nTwo.')).toHaveLength(2);
  });
});
