export function truncateDiff(diff, maxChars) {
  if (diff.length <= maxChars) return { diff, truncated: false };
  const keep = Math.floor(maxChars / 2);
  const start = diff.slice(0, keep);
  const end = diff.slice(diff.length - keep);
  return {
    diff: `${start}\n\n...diff truncated...\n\n${end}`,
    truncated: true,
  };
}
