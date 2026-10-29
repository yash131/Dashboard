/**
 * Date and relative time formatting utilities.
 */

export function formatRelativeTime(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 30) return 'just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullDateTime(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function isOverdue(ticket) {
  if (!ticket) return false;
  const status = ticket.status;
  if (status === 'resolved' || status === 'closed') return false;

  // If created more than 3 days ago, consider overdue
  const created = new Date(ticket.created_at);
  if (isNaN(created.getTime())) return false;

  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  return diffMs > threeDaysMs;
}
