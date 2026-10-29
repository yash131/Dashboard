/**
 * Table View & Compact List Component
 * Sticky header, column show/hide, shift-click select, inline badge edit, j/k navigation.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../router.js';
import { escapeHtml } from '../utils/escape.js';
import { highlightText } from '../utils/highlight.js';
import { formatRelativeTime, formatFullDateTime, isOverdue } from '../utils/time.js';
import { getInitials, getAvatarColor } from '../utils/avatar.js';
import { showToast } from './toast.js';

export function setupTableComponent({ onEditTicket, onDeleteTicket, onRefreshStats }) {
  let focusedRowIndex = -1;
  let lastCheckedIndex = -1;

  // Active columns configuration (can be toggled via column show/hide menu)
  const columnsConfig = {
    ticket_num: true,
    title: true,
    status: true,
    priority: true,
    category: true,
    assignee: true,
    created: true,
    due: true,
    actions: true,
  };

  const tbody = document.getElementById('tickets-tbody');
  const selectAllCheckbox = document.getElementById('select-all-tickets');

  // --------------------------------------------------------------------------
  // Keyboard Navigation: j/k or arrows, Enter, x to select, e to edit
  // --------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    // Only handle if not inside an input/textarea/select/modal/drawer
    const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const hasOverlayOpen = document.querySelector('.modal-backdrop:not([hidden]), .drawer-backdrop:not([hidden]), .command-palette-backdrop:not([hidden])');
    if (isEditing || hasOverlayOpen) return;

    const rows = Array.from(document.querySelectorAll('.tickets-table tbody tr.ticket-row'));
    if (rows.length === 0) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusedRowIndex = Math.min(rows.length - 1, focusedRowIndex + 1);
      updateRowFocus(rows);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusedRowIndex = Math.max(0, focusedRowIndex - 1);
      updateRowFocus(rows);
    } else if (e.key === 'Enter') {
      if (focusedRowIndex >= 0 && rows[focusedRowIndex]) {
        e.preventDefault();
        const id = rows[focusedRowIndex].getAttribute('data-ticket-id');
        if (id) router.openTicketDeepLink(id);
      }
    } else if (e.key === 'x') {
      if (focusedRowIndex >= 0 && rows[focusedRowIndex]) {
        e.preventDefault();
        const id = rows[focusedRowIndex].getAttribute('data-ticket-id');
        if (id) store.toggleSelection(id);
      }
    } else if (e.key === 'e') {
      if (focusedRowIndex >= 0 && rows[focusedRowIndex]) {
        e.preventDefault();
        const id = rows[focusedRowIndex].getAttribute('data-ticket-id');
        if (id && onEditTicket) onEditTicket(id);
      }
    }
  });

  function updateRowFocus(rows) {
    rows.forEach((r, i) => {
      r.classList.toggle('row-focused', i === focusedRowIndex);
    });
    if (rows[focusedRowIndex]) {
      rows[focusedRowIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // --------------------------------------------------------------------------
  // Select All Checkbox Handler
  // --------------------------------------------------------------------------
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      const snap = store.getSnapshot();
      if (selectAllCheckbox.checked) {
        const allIds = snap.tickets.map(t => t.id);
        store.selectAll(allIds);
      } else {
        store.clearSelection();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Render Function
  // --------------------------------------------------------------------------
  function render(tickets) {
    if (!tbody) return;
    const snap = store.getSnapshot();
    const query = snap.filters.q;
    const selectedIds = snap.selectedIds;

    // Update select-all state
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = tickets.length > 0 && tickets.every(t => selectedIds.has(t.id));
      selectAllCheckbox.indeterminate = tickets.some(t => selectedIds.has(t.id)) && !selectAllCheckbox.checked;
    }

    if (!tickets || tickets.length === 0) {
      tbody.innerHTML = '';
      return;
    }

    const rowsHtml = tickets.map((t, idx) => {
      const isSelected = selectedIds.has(t.id);
      const highlightedTitle = highlightText(t.title, query);
      const fullDate = formatFullDateTime(t.created_at);
      const relDate = formatRelativeTime(t.created_at);
      const overdue = isOverdue(t);
      const initials = getInitials(t.assignee || t.requester_name);
      const avatarBg = getAvatarColor(t.assignee || t.requester_name);

      return `
        <tr
          class="ticket-row ${isSelected ? 'row-selected' : ''}"
          data-ticket-id="${escapeHtml(t.id)}"
          data-ticket-num="${escapeHtml(t.ticket_number)}"
          data-row-index="${idx}"
          tabindex="0"
        >
          <!-- Checkbox Selection -->
          <td onclick="event.stopPropagation();" style="width: 40px; text-align: center;">
            <input
              type="checkbox"
              class="ticket-checkbox row-select-cb"
              data-id="${escapeHtml(t.id)}"
              data-index="${idx}"
              ${isSelected ? 'checked' : ''}
              aria-label="Select ticket ${escapeHtml(t.ticket_number)}"
            >
          </td>

          <!-- Ticket Number -->
          ${columnsConfig.ticket_num ? `
            <td style="width: 110px;">
              <span class="ticket-num-tag" style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-subtle); border: 1px solid var(--border-base);">
                ${escapeHtml(t.ticket_number)}
              </span>
            </td>
          ` : ''}

          <!-- Title & Requester -->
          ${columnsConfig.title ? `
            <td>
              <div class="cell-title-wrap">
                <span class="cell-ticket-title">${highlightedTitle}</span>
                <span class="cell-requester-sub">${escapeHtml(t.requester_name)} &bull; ${escapeHtml(t.requester_email)}</span>
              </div>
            </td>
          ` : ''}

          <!-- Status Badge with Inline Edit Trigger -->
          ${columnsConfig.status ? `
            <td onclick="event.stopPropagation();">
              <span class="badge-pill badge-interactive badge-status-${escapeHtml(t.status)}" data-action="inline-status" data-id="${escapeHtml(t.id)}" title="Click to change status">
                <span class="badge-dot"></span>
                <span>${escapeHtml(formatStatus(t.status))}</span>
              </span>
            </td>
          ` : ''}

          <!-- Priority Badge with Inline Edit Trigger -->
          ${columnsConfig.priority ? `
            <td onclick="event.stopPropagation();">
              <span class="badge-pill badge-interactive badge-priority-${escapeHtml(t.priority)}" data-action="inline-priority" data-id="${escapeHtml(t.id)}" title="Click to change priority">
                <span class="badge-dot"></span>
                <span>${escapeHtml(formatPriority(t.priority))}</span>
              </span>
            </td>
          ` : ''}

          <!-- Category -->
          ${columnsConfig.category ? `
            <td>
              <span class="category-tag">${escapeHtml(formatCategory(t.category))}</span>
            </td>
          ` : ''}

          <!-- Assignee -->
          ${columnsConfig.assignee ? `
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="avatar-circle" style="background-color: ${avatarBg};">
                  ${escapeHtml(initials)}
                </span>
                <span style="font-size: 0.8125rem; color: var(--text-secondary); white-space: nowrap;">
                  ${t.assignee ? escapeHtml(t.assignee) : '<em style="color:var(--text-muted)">Unassigned</em>'}
                </span>
              </div>
            </td>
          ` : ''}

          <!-- Created Date -->
          ${columnsConfig.created ? `
            <td>
              <span style="font-size: 0.8125rem; color: var(--text-muted); white-space: nowrap;" title="${escapeHtml(fullDate)}">
                ${escapeHtml(relDate)}
              </span>
            </td>
          ` : ''}

          <!-- Due Date / Overdue Status -->
          ${columnsConfig.due ? `
            <td>
              <span class="due-chip ${overdue ? 'is-overdue' : ''}">
                <i data-lucide="${overdue ? 'alert-circle' : 'calendar'}" style="width: 12px; height: 12px;"></i>
                <span>${overdue ? 'Overdue' : 'On Track'}</span>
              </span>
            </td>
          ` : ''}

          <!-- Actions -->
          ${columnsConfig.actions ? `
            <td onclick="event.stopPropagation();">
              <div class="row-actions">
                <button type="button" class="btn-row-action" data-action="view" data-id="${escapeHtml(t.id)}" title="View details">
                  <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                </button>
                <button type="button" class="btn-row-action" data-action="edit" data-id="${escapeHtml(t.id)}" title="Edit ticket">
                  <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                </button>
                <button type="button" class="btn-row-action action-delete" data-action="delete" data-id="${escapeHtml(t.id)}" data-num="${escapeHtml(t.ticket_number)}" title="Delete ticket">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    attachTableEvents(tickets);
  }

  // --------------------------------------------------------------------------
  // Table Events (Row clicks, Shift-click select, Inline edit popovers)
  // --------------------------------------------------------------------------
  function attachTableEvents(tickets) {
    const rows = Array.from(tbody.querySelectorAll('tr.ticket-row'));

    rows.forEach(row => {
      // Row click opens drawer
      row.addEventListener('click', (e) => {
        if (e.target.closest('input, button, .badge-interactive')) return;
        const id = row.getAttribute('data-ticket-id');
        if (id) router.openTicketDeepLink(id);
      });

      // Shift-click checkbox selection
      const cb = row.querySelector('.row-select-cb');
      if (cb) {
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          const currentIndex = parseInt(cb.getAttribute('data-index'), 10);

          if (e.shiftKey && lastCheckedIndex !== -1) {
            const start = Math.min(lastCheckedIndex, currentIndex);
            const end = Math.max(lastCheckedIndex, currentIndex);
            const snap = store.getSnapshot();
            const next = new Set(snap.selectedIds);

            for (let i = start; i <= end; i++) {
              if (tickets[i]) next.add(tickets[i].id);
            }
            store.setState({ selectedIds: next });
          } else {
            const id = cb.getAttribute('data-id');
            store.toggleSelection(id);
          }
          lastCheckedIndex = currentIndex;
        });
      }

      // Row action buttons
      row.querySelectorAll('.btn-row-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          const num = btn.getAttribute('data-num');

          if (action === 'view') {
            router.openTicketDeepLink(id);
          } else if (action === 'edit' && onEditTicket) {
            onEditTicket(id);
          } else if (action === 'delete' && onDeleteTicket) {
            onDeleteTicket(id, num);
          }
        });
      });

      // Inline Badge Edit: Status
      const statusBadge = row.querySelector('[data-action="inline-status"]');
      if (statusBadge) {
        statusBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = statusBadge.getAttribute('data-id');
          showInlineStatusPopover(statusBadge, id, tickets);
        });
      }

      // Inline Badge Edit: Priority
      const prioBadge = row.querySelector('[data-action="inline-priority"]');
      if (prioBadge) {
        prioBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = prioBadge.getAttribute('data-id');
          showInlinePriorityPopover(prioBadge, id, tickets);
        });
      }
    });
  }

  // Inline Status Popover with Optimistic UI & Rollback on failure
  function showInlineStatusPopover(targetEl, ticketId, tickets) {
    closeAnyInlinePopover();

    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const popover = document.createElement('div');
    popover.className = 'inline-badge-popover';
    popover.id = 'active-inline-popover';

    const statuses = ['open', 'in_progress', 'resolved', 'closed'];
    popover.innerHTML = statuses.map(s => `
      <div class="popover-item" data-value="${s}">
        <span class="badge-dot" style="background: var(--status-${s});"></span>
        <span>${formatStatus(s)}</span>
      </div>
    `).join('');

    document.body.appendChild(popover);

    const rect = targetEl.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;

    popover.querySelectorAll('.popover-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextStatus = item.getAttribute('data-value');
        closeAnyInlinePopover();
        if (nextStatus === ticket.status) return;

        const prevStatus = ticket.status;
        // Optimistic UI
        ticket.status = nextStatus;
        render(tickets);

        try {
          await api.patchTicket(ticketId, { status: nextStatus });
          showToast({ title: 'Status Updated', message: `${ticket.ticket_number} is now ${formatStatus(nextStatus)}.`, type: 'success' });
          if (onRefreshStats) onRefreshStats();
        } catch (err) {
          // Rollback on failure (e.g. 409 transition from closed)
          ticket.status = prevStatus;
          render(tickets);
          showToast({ title: 'Transition Not Allowed', message: err.message, type: 'error' });
        }
      });
    });

    const closeListener = (e) => {
      if (!popover.contains(e.target)) {
        closeAnyInlinePopover();
        document.removeEventListener('click', closeListener);
      }
    };
    setTimeout(() => document.addEventListener('click', closeListener), 10);
  }

  // Inline Priority Popover
  function showInlinePriorityPopover(targetEl, ticketId, tickets) {
    closeAnyInlinePopover();

    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const popover = document.createElement('div');
    popover.className = 'inline-badge-popover';
    popover.id = 'active-inline-popover';

    const priorities = ['low', 'medium', 'high', 'urgent'];
    popover.innerHTML = priorities.map(p => `
      <div class="popover-item" data-value="${p}">
        <span class="badge-dot" style="background: var(--priority-${p});"></span>
        <span>${formatPriority(p)}</span>
      </div>
    `).join('');

    document.body.appendChild(popover);

    const rect = targetEl.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;

    popover.querySelectorAll('.popover-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextPriority = item.getAttribute('data-value');
        closeAnyInlinePopover();
        if (nextPriority === ticket.priority) return;

        const prevPriority = ticket.priority;
        ticket.priority = nextPriority;
        render(tickets);

        try {
          await api.patchTicket(ticketId, { priority: nextPriority });
          showToast({ title: 'Priority Updated', message: `${ticket.ticket_number} set to ${formatPriority(nextPriority)}.`, type: 'success' });
          if (onRefreshStats) onRefreshStats();
        } catch (err) {
          ticket.priority = prevPriority;
          render(tickets);
          showToast({ title: 'Priority Update Failed', message: err.message, type: 'error' });
        }
      });
    });

    const closeListener = (e) => {
      if (!popover.contains(e.target)) {
        closeAnyInlinePopover();
        document.removeEventListener('click', closeListener);
      }
    };
    setTimeout(() => document.addEventListener('click', closeListener), 10);
  }

  function closeAnyInlinePopover() {
    const existing = document.getElementById('active-inline-popover');
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  }

  // Helpers
  function formatStatus(s) {
    const map = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
    return map[s] || s;
  }
  function formatPriority(p) {
    const map = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
    return map[p] || p;
  }
  function formatCategory(c) {
    const map = { bug: 'Bug', billing: 'Billing', feature_request: 'Feature', general: 'General' };
    return map[c] || c;
  }

  return { render };
}
