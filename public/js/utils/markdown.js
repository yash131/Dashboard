import { escapeHtml } from './escape.js';

/**
 * Safely parse basic markdown into HTML (bold, italic, code, links, breaks).
 * Input is escaped first to guarantee XSS prevention.
 */
export function renderSimpleMarkdown(rawText) {
  if (!rawText) return '';

  // 1. First escape all raw HTML characters
  let text = escapeHtml(rawText);

  // 2. Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 3. Italic: *text* or _text_
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');

  // 4. Inline code: `code`
  text = text.replace(/`([^`]+)`/g, '<code style="background: var(--bg-subtle); padding: 1px 4px; border-radius: 3px; font-family: var(--font-mono); font-size: 0.85em;">$1</code>');

  // 5. Links: [label](url) - only allow http/https
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">$1</a>');

  // 6. Line breaks
  text = text.replace(/\n/g, '<br>');

  return text;
}
