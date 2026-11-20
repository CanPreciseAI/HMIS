import { Fragment, type ReactNode } from "react";

/**
 * Small Markdown renderer for the bot panel. Gemini is asked for headings,
 * bullets and **bold** only; anything else falls back to plain paragraphs, so
 * a model that ignores the format still renders safely.
 */

type Block =
  | { kind: "heading"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbers"; items: string[] }
  | { kind: "paragraph"; text: string };

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong
          key={`${keyPrefix}-${index}`}
          className="font-semibold text-foreground"
        >
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>
      ),
    );
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: "heading", text: line.replace(/^#{1,6}\s+/, "") });
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      const item = line.replace(/^[-*•]\s+/, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === "bullets") last.items.push(item);
      else blocks.push({ kind: "bullets", items: [item] });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const item = line.replace(/^\d+[.)]\s+/, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === "numbers") last.items.push(item);
      else blocks.push({ kind: "numbers", items: [item] });
      continue;
    }

    // A line that is only bold text is a section label (common model output).
    if (/^\*\*[^*]+\*\*:?$/.test(line)) {
      blocks.push({
        kind: "heading",
        text: line.replace(/^\*\*/, "").replace(/\*\*:?$/, ""),
      });
      continue;
    }

    blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseBlocks(text);

  return (
    <div
      className={
        className ?? "space-y-2 text-xs leading-relaxed text-foreground"
      }
    >
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p
              key={`block-${index}`}
              className="mt-3.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-primary uppercase first:mt-0"
            >
              <span
                aria-hidden="true"
                className="h-px w-3 shrink-0 bg-primary/50"
              />
              {renderInline(block.text, `h-${index}`)}
            </p>
          );
        }

        if (block.kind === "bullets") {
          return (
            <ul key={`block-${index}`} className="space-y-1.5">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`item-${index}-${itemIndex}`}
                  className="flex gap-2 rounded-lg bg-background/60 px-2 py-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70"
                  />
                  <span className="min-w-0 flex-1">
                    {renderInline(item, `b-${index}-${itemIndex}`)}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === "numbers") {
          return (
            <ol key={`block-${index}`} className="space-y-1.5">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`item-${index}-${itemIndex}`}
                  className="flex gap-2 rounded-lg bg-background/60 px-2 py-1.5"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                    {itemIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {renderInline(item, `n-${index}-${itemIndex}`)}
                  </span>
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`block-${index}`}>{renderInline(block.text, `p-${index}`)}</p>
        );
      })}
    </div>
  );
}
