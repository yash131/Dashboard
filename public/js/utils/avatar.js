/**
 * Generate avatar initials and deterministic background colors from names.
 * Curated luxury jewel & mineral tones for the Emerald & Champagne aesthetic.
 */

const PALETTE = [
  '#1F8A6B', // Deep Emerald
  '#B8975A', // Champagne Gold
  '#3FA37C', // Sea Jade
  '#2E6F5E', // Forest Jade
  '#D4A24C', // Warm Amber
  '#5B7CFA', // Sapphire Blue
  '#8E6C36', // Antique Bronze
  '#2D4A41', // Dark Malachite
  '#6D7787', // Platinum Slate
];

export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function getAvatarColor(name) {
  if (!name) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
