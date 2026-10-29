import { escapeHtml } from './escape.js';

/**
 * Safely highlight search query occurrences in text.
 */
export function highlightText(text, query) {
  if (!text) return '';
  if (!query || !query.trim()) return escapeHtml(text);

  const escapedText = escapeHtml(text);
  const cleanQuery = query.trim();
  const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapedText.replace(regex, '<mark style="background-color: rgba(253, 224, 71, 0.4); border-radius: 2px; padding: 0 2px;">$1</mark>');
}
