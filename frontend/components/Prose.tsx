export type Block = { type: 'heading' | 'paragraph'; text: string };

/**
 * The seeded content is markdown limited to `##` headings and paragraphs, so a
 * ten-line parser covers it. Anything else renders as a paragraph rather than
 * pulling in a markdown dependency the content does not need.
 */
export function parseBlocks(content: string): Block[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      block.startsWith('## ')
        ? { type: 'heading' as const, text: block.slice(3).trim() }
        : { type: 'paragraph' as const, text: block },
    );
}

export function Prose({ content }: { content: string }) {
  return (
    <div className="mt-8">
      {parseBlocks(content).map((block, index) =>
        block.type === 'heading' ? (
          <h2 key={index} className="mt-10 text-3xl">
            {block.text}
          </h2>
        ) : (
          <p key={index} className="mt-5">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
