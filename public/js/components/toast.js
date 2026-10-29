/**
 * Toast Notifications Component
 * Supports stacking, progress bar, auto-dismiss, and undo action callbacks.
 */

import { escapeHtml } from '../utils/escape.js';

const toastStack = document.getElementById('toast-stack');

export function showToast({
  title = '',
  message = '',
  type = 'info', // 'success' | 'error' | 'info'
  durationMs = 4000,
  undoCallback = null,
}) {
  if (!toastStack) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const iconName = type === 'success' ? 'check-circle' :
                   type === 'error' ? 'alert-triangle' : 'info';

  let undoButtonHtml = '';
  if (undoCallback && typeof undoCallback === 'function') {
    undoButtonHtml = `
      <button type="button" class="toast-undo-btn" id="toast-undo-action">
        Undo
      </button>
    `;
  }

  toast.innerHTML = `
    <div class="toast-row">
      <i data-lucide="${iconName}" style="width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px;"></i>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
        ${title ? `<strong style="font-size: 0.8125rem; color: var(--text-primary);">${escapeHtml(title)}</strong>` : ''}
        <span style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(message)}</span>
      </div>
      ${undoButtonHtml}
      <button type="button" class="toast-close-btn" aria-label="Close" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px;">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
      </button>
    </div>
    ${durationMs > 0 ? `<div class="toast-progress-bar" style="animation-duration: ${durationMs}ms;"></div>` : ''}
  `;

  toastStack.appendChild(toast);
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  let timerId = null;

  function dismiss() {
    if (timerId) clearTimeout(timerId);
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 200);
  }

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  const undoBtn = toast.querySelector('#toast-undo-action');
  if (undoBtn && undoCallback) {
    undoBtn.addEventListener('click', () => {
      dismiss();
      undoCallback();
    });
  }

  if (durationMs > 0) {
    timerId = setTimeout(dismiss, durationMs);
  }

  return { dismiss };
}
