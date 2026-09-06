import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders an agent's chat text as markdown — model replies come back as prose with
 * occasional bold/lists/code, not literal `**`/`-`. Not used for user bubbles, which
 * are typed text, not agent-generated markdown. No rehype-raw, so raw HTML in the
 * model's output stays escaped rather than executed. */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
