/** Generated files are downloaded through attachment controls, not sandbox URLs. */
export function normalizeMessageLinks(content: string): string {
  return content
    .replaceAll(/\[([^\]]+)\]\(sandbox:[^)]+\)/gi, '$1')
    .replaceAll(/sandbox:\/\/[^\s)]+|sandbox:\/[^\s)]+/gi, '')
}

export function toMessagePreview(content: string): string {
  return normalizeMessageLinks(content)
    .replaceAll(/^```.*$/gm, '')
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replaceAll(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm, '')
    .replaceAll(/(\*\*|__)(.*?)\1/g, '$2')
    .replaceAll(/`([^`]+)`/g, '$1')
}
