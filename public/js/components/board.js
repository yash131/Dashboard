/**
 * Kanban Board Component
 * 4 columns, drag & drop with touch fallback, ghost card, optimistic update & rollback.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../router.js';
import { escapeHtml } from '../utils/escape.js';
import { highlightText } from '../utils/highlight.js';
import { formatRelativeTime, formatFullDateTime, isOverdue } from '../utils/time.js';
import { getInitials, getAvatarColor } from '../utils/avatar.js';
import { showToast } from './toast.js';

export function setupBoardComponent({ onRefreshStats }) {
  const columns = {
    open: document.getElementById('card-list-open'),
    in_progress: document.getElementById('card-list-in-progress'),
    resolved: document.getElementById('card-list-resolved'),
    closed: document.getElementById('card-list-closed'),
  };

  const countEls = {
    open: document.getElementById('count-col-open'),
    in_progress: document.getElementById('count-col-in-progress'),
    resolved: document.getElementById('count-col-resolved'),
    closed: document.getElementById('count-col-closed'),
  };

  let draggedTicket = null;
  let draggedCardElement = null;
  let ghostCard = null;

  function initGhostCard() {
    if (!ghostCard) {
      ghostCard = document.createElement('div');
      ghostCard.className = 'ghost-drop-card';
    }
  }

  function render(tickets) {
    initGhostCard();
    const snap = store.getSnapshot();
    const query = snap.filters.q;

    // Clear columns
    Object.values(columns).forEach(col => { if (col) col.innerHTML = ''; });

    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };

    tickets.forEach(ticket => {
      const status = ticket.status || 'open';
      if (!columns[status]) return;

      counts[status]++;
      const highlightedTitle = highlightText(ticket.title, query);
      const relTime = formatRelativeTime(ticket.created_at);
      const fullTime = formatFullDateTime(ticket.created_at);
      const overdue = isOverdue(ticket);
      const commentsCount = ticket.comments?.length || 0;
      const initials = getInitials(ticket.assignee || ticket.requester_name);
      const avatarBg = getAvatarColor(ticket.assignee || ticket.requester_name);

      const card = document.createElement('div');
      card.className = `kanban-card kanban-card-prio-${ticket.priority || 'medium'}`;
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-ticket-id', ticket.id);
      card.setAttribute('tabindex', '0');

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span class="ticket-num-tag" style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-subtle); border: 1px solid var(--border-base);">
            ${escapeHtml(ticket.ticket_number)}
          </span>
          <span class="badge-pill badge-priority-${escapeHtml(ticket.priority)}" style="font-size: 0.6875rem; padding: 1px 6px;">
            <span class="badge-dot"></span>
            <span>${escapeHtml(ticket.priority)}</span>
          </span>
        </div>

        <div style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${highlightedTitle}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 6px; border-top: 1px solid var(--border-subtle); font-size: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="avatar-circle" style="width: 20px; height: 20px; font-size: 0.625rem; background-color: ${avatarBg};">
              ${escapeHtml(initials)}
            </span>
            <span class="category-tag">${escapeHtml(ticket.category)}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; color: var(--text-muted);">
            ${overdue ? `
              <span class="due-chip is-overdue" title="Overdue ticket" style="padding: 1px 4px;">
                <i data-lucide="alert-circle" style="width: 10px; height: 10px;"></i>
              </span>
            ` : ''}
            ${commentsCount > 0 ? `
              <span style="display: inline-flex; align-items: center; gap: 2px;" title="${commentsCount} comments">
                <i data-lucide="message-square" style="width: 11px; height: 11px;"></i>
                <span>${commentsCount}</span>
              </span>
            ` : ''}
            <span title="${escapeHtml(fullTime)}">${escapeHtml(relTime)}</span>
          </div>
        </div>
      `;

      // Drag listeners
      setupDragEvents(card, ticket, tickets);

      // Click to open drawer
      card.addEventListener('click', () => {
        router.openTicketDeepLink(ticket.id);
      });

      columns[status].appendChild(card);
    });

    // Update column counters
    Object.keys(countEls).forEach(k => {
      if (countEls[k]) countEls[k].textContent = String(counts[k] || 0);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function setupDragEvents(card, ticket, tickets) {
    card.addEventListener('dragstart', (e) => {
      draggedTicket = ticket;
      draggedCardElement = card;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ticket.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      if (ghostCard && ghostCard.parentElement) {
        ghostCard.parentElement.removeChild(ghostCard);
      }
      document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
      draggedTicket = null;
      draggedCardElement = null;
    });

    // Touch event fallback
    let touchStartY = 0;
    card.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      draggedTicket = ticket;
      draggedCardElement = card;
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndX = e.changedTouches[0].clientX;
      const targetElement = document.elementFromPoint(touchEndX, touchEndY);
      const targetColumn = targetElement?.closest('.kanban-column');

      if (targetColumn && draggedTicket) {
        const newStatus = targetColumn.getAttribute('data-status');
        if (newStatus && newStatus !== draggedTicket.status) {
          executeMove(draggedTicket, newStatus, tickets);
        }
      }
      draggedTicket = null;
      draggedCardElement = null;
    });
  }

  // Column Drop Handlers
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');

      const cardList = col.querySelector('.kanban-card-list');
      if (cardList && ghostCard && !cardList.contains(ghostCard)) {
        cardList.appendChild(ghostCard);
      }
    });

    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
        if (ghostCard && ghostCard.parentElement === col.querySelector('.kanban-card-list')) {
          ghostCard.parentElement.removeChild(ghostCard);
        }
      }
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (ghostCard && ghostCard.parentElement) {
        ghostCard.parentElement.removeChild(ghostCard);
      }

      const targetStatus = col.getAttribute('data-status');
      if (draggedTicket && targetStatus && targetStatus !== draggedTicket.status) {
        const snap = store.getSnapshot();
        executeMove(draggedTicket, targetStatus, snap.tickets);
      }
    });
  });

  async function executeMove(ticket, nextStatus, tickets) {
    const prevStatus = ticket.status;

    // Optimistic UI move
    ticket.status = nextStatus;
    render(tickets);

    try {
      await api.patchTicket(ticket.id, { status: nextStatus });
      showToast({
        title: 'Status Updated',
        message: `${ticket.ticket_number} moved to ${nextStatus.replace('_', ' ')}.`,
        type: 'success',
      });
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      // Rollback on failure (e.g. 409 transition from closed)
      console.warn('Move failed, rolling back:', err);
      ticket.status = prevStatus;
      render(tickets);

      showToast({
        title: 'Cannot Move Ticket',
        message: err.message || 'The requested status transition is not permitted.',
        type: 'error',
      });
    }
  }

  return { render };
}
