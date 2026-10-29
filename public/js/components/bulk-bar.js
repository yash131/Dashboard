/**
 * Bulk Action Bar Component
 * Floating bottom bar for batch updates: change status, change priority, assign, delete.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';

export function setupBulkBarComponent({ onRefreshData }) {
  const bulkBar = document.getElementById('bulk-action-bar');
  const countBadge = document.getElementById('bulk-selected-count');
  const btnBulkClear = document.getElementById('btn-bulk-clear');

  const btnBulkStatus = document.getElementById('btn-bulk-status');
  const btnBulkPriority = document.getElementById('btn-bulk-priority');
  const btnBulkAssign = document.getElementById('btn-bulk-assign');
  const btnBulkDelete = document.getElementById('btn-bulk-delete');

  if (!bulkBar) return;

  // React to selection changes
  store.subscribe((state) => {
    const count = state.selectedIds.size;
    if (count > 0) {
      bulkBar.classList.add('show');
      if (countBadge) countBadge.textContent = `${count} selected`;
    } else {
      bulkBar.classList.remove('show');
    }
  });

  if (btnBulkClear) {
    btnBulkClear.addEventListener('click', () => {
      store.clearSelection();
    });
  }

  // Bulk Status Change
  if (btnBulkStatus) {
    btnBulkStatus.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const ids = Array.from(snap.selectedIds);
      if (ids.length === 0) return;

      const choice = prompt('Select status for selected tickets (open, in_progress, resolved, closed):');
      if (!choice) return;
      const status = choice.toLowerCase().trim();
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        showToast({ title: 'Invalid Status', message: 'Status must be open, in_progress, resolved, or closed.', type: 'error' });
        return;
      }

      executeBulkAction('update_status', ids, { value: status, status });
    });
  }

  // Bulk Priority Change
  if (btnBulkPriority) {
    btnBulkPriority.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const ids = Array.from(snap.selectedIds);
      if (ids.length === 0) return;

      const choice = prompt('Select priority for selected tickets (low, medium, high, urgent):');
      if (!choice) return;
      const priority = choice.toLowerCase().trim();
      if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
        showToast({ title: 'Invalid Priority', message: 'Priority must be low, medium, high, or urgent.', type: 'error' });
        return;
      }

      executeBulkAction('update_priority', ids, { value: priority, priority });
    });
  }

  // Bulk Assignee Change
  if (btnBulkAssign) {
    btnBulkAssign.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const ids = Array.from(snap.selectedIds);
      if (ids.length === 0) return;

      const assignee = prompt('Enter assignee name for selected tickets (or leave empty to unassign):');
      if (assignee === null) return;

      executeBulkAction('assign', ids, { value: assignee.trim() || null, assignee: assignee.trim() || null });
    });
  }

  // Bulk Delete
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const ids = Array.from(snap.selectedIds);
      if (ids.length === 0) return;

      if (confirm(`Are you sure you want to delete ${ids.length} selected tickets? This cannot be undone.`)) {
        executeBulkAction('delete', ids, { value: null });
      }
    });
  }

  async function executeBulkAction(action, ids, extraPayload) {
    showToast({ title: 'Processing', message: `Updating ${ids.length} tickets…`, type: 'info', durationMs: 1500 });

    try {
      const res = await api.bulkTickets({
        action,
        ids,
        ...extraPayload,
      });

      const modified = res.modified ?? res.updated ?? 0;
      const failedList = Array.isArray(res.failed) ? res.failed : [];
      const failedCount = failedList.length;

      if (failedCount === 0) {
        showToast({
          title: 'Bulk Action Succeeded',
          message: `All ${modified} tickets successfully processed.`,
          type: 'success',
        });
      } else {
        const errorDetails = failedList.map(e => e.reason || e.message).slice(0, 2).join('; ');
        showToast({
          title: 'Partial Update',
          message: `${modified} succeeded, ${failedCount} failed (${errorDetails || 'transition constraints'}).`,
          type: 'error',
          durationMs: 6000,
        });
      }

      store.clearSelection();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      showToast({ title: 'Bulk Action Failed', message: err.message, type: 'error' });
    }
  }
}
