/** Turns a snake_case tool/function name (e.g. `update_rubric_score`) into
 * Title Case words (`Update Rubric Score`) — the fallback display for any
 * tool call without a specific hand-written label in the chat panels, so a
 * newly added tool never leaks its raw code-symbol name into the chat UI. */
export function humanizeToolName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
