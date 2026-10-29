/**
 * Filters & Toolbar Component
 * Multi-select popovers with counts, date presets, overdue toggle, saved views, and chips.
 */

import { store } from '../store.js';
import { escapeHtml } from '../utils/escape.js';
import { showToast } from './toast.js';

export function setupFiltersComponent({ onFilterChange }) {
  // --------------------------------------------------------------------------
  // Popover Toggle Helper
  // --------------------------------------------------------------------------
  function setupPopover(triggerId, popoverId) {
    const trigger = document.getElementById(triggerId);
    const popover = document.getElementById(popoverId);
    if (!trigger || !popover) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !popover.hidden;
      // Close all open popovers first
      document.querySelectorAll('.filter-popover').forEach(p => p.hidden = true);
      document.querySelectorAll('.popover-trigger-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

      popover.hidden = isOpen;
      trigger.setAttribute('aria-expanded', !isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && !trigger.contains(e.target)) {
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  setupPopover('btn-filter-status', 'popover-filter-status');
  setupPopover('btn-filter-priority', 'popover-filter-priority');
  setupPopover('btn-filter-category', 'popover-filter-category');
  setupPopover('btn-filter-date', 'popover-filter-date');
  setupPopover('btn-saved-views', 'popover-saved-views');

  // --------------------------------------------------------------------------
  // Multi-Select Checkboxes (Status, Priority, Category)
  // --------------------------------------------------------------------------
  function setupMultiSelect(containerId, filterKey) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const checkedBoxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
      const values = checkedBoxes.map(cb => cb.value).filter(Boolean);

      const snap = store.getSnapshot();
      const nextFilters = {
        ...snap.filters,
        [filterKey]: values.join(','),
      };

      store.setState({ filters: nextFilters, page: 1 });
      updateTriggerLabel(filterKey, values.length);
      if (onFilterChange) onFilterChange();
    });
  }

  setupMultiSelect('popover-filter-status', 'status');
  setupMultiSelect('popover-filter-priority', 'priority');
  setupMultiSelect('popover-filter-category', 'category');

  function updateTriggerLabel(key, count) {
    const labelEl = document.getElementById(`filter-${key}-label`);
    if (!labelEl) return;
    const names = { status: 'Status', priority: 'Priority', category: 'Category' };
    labelEl.textContent = count > 0 ? `${names[key]} (${count})` : names[key];
  }

  // --------------------------------------------------------------------------
  // Date Range Presets & Overdue Toggle
  // --------------------------------------------------------------------------
  const datePresets = document.querySelectorAll('.date-preset-btn');
  const dateFromInput = document.getElementById('date-from-input');
  const dateToInput = document.getElementById('date-to-input');
  const btnApplyDate = document.getElementById('btn-apply-custom-date');
  const btnClearDate = document.getElementById('btn-clear-date-filter');
  const overdueToggle = document.getElementById('toggle-overdue-only');

  datePresets.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      applyDatePreset(preset);
    });
  });

  function applyDatePreset(preset) {
    const now = new Date();
    let from = null;
    let to = new Date();

    if (preset === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (preset === '7d') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === '30d') {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const fromIso = from ? from.toISOString() : '';
    const toIso = to ? to.toISOString() : '';

    const snap = store.getSnapshot();
    store.setState({
      filters: {
        ...snap.filters,
        date_preset: preset,
        created_from: fromIso,
        created_to: toIso,
      },
      page: 1,
    });

    const datePopover = document.getElementById('popover-filter-date');
    if (datePopover) datePopover.hidden = true;
    updateDateTriggerLabel(preset ? `Date: ${preset}` : 'Date Range');

    if (onFilterChange) onFilterChange();
  }

  if (btnApplyDate) {
    btnApplyDate.addEventListener('click', () => {
      const fromVal = dateFromInput?.value;
      const toVal = dateToInput?.value;

      if (fromVal && toVal && new Date(fromVal) > new Date(toVal)) {
        showToast({ title: 'Invalid Dates', message: "'From' date cannot be after 'To' date.", type: 'error' });
        return;
      }

      const snap = store.getSnapshot();
      store.setState({
        filters: {
          ...snap.filters,
          date_preset: 'custom',
          created_from: fromVal ? `${fromVal}T00:00:00Z` : '',
          created_to: toVal ? `${toVal}T23:59:59Z` : '',
        },
        page: 1,
      });

      const datePopover = document.getElementById('popover-filter-date');
      if (datePopover) datePopover.hidden = true;
      updateDateTriggerLabel((fromVal || toVal) ? 'Date: Custom' : 'Date Range');

      if (onFilterChange) onFilterChange();
    });
  }

  if (btnClearDate) {
    btnClearDate.addEventListener('click', () => {
      if (dateFromInput) dateFromInput.value = '';
      if (dateToInput) dateToInput.value = '';
      const snap = store.getSnapshot();
      store.setState({
        filters: {
          ...snap.filters,
          date_preset: '',
          created_from: '',
          created_to: '',
        },
        page: 1,
      });

      const datePopover = document.getElementById('popover-filter-date');
      if (datePopover) datePopover.hidden = true;
      updateDateTriggerLabel('Date Range');

      if (onFilterChange) onFilterChange();
    });
  }

  if (overdueToggle) {
    overdueToggle.addEventListener('change', () => {
      const snap = store.getSnapshot();
      store.setState({
        filters: {
          ...snap.filters,
          overdue_only: overdueToggle.checked,
        },
        page: 1,
      });
      if (onFilterChange) onFilterChange();
    });
  }

  function updateDateTriggerLabel(label) {
    const el = document.getElementById('filter-date-label');
    if (el) el.textContent = label;
  }

  // --------------------------------------------------------------------------
  // Saved Views Management
  // --------------------------------------------------------------------------
  const btnSaveCurrentView = document.getElementById('btn-save-current-view');
  const savedViewsList = document.getElementById('saved-views-list');

  if (btnSaveCurrentView) {
    btnSaveCurrentView.addEventListener('click', () => {
      const name = prompt('Name this view (e.g. "High Priority Billing"):');
      if (name) {
        store.saveCurrentView(name);
        showToast({ title: 'Saved View', message: `View "${name}" saved to your browser.`, type: 'success' });
        renderSavedViewsMenu();
      }
    });
  }

  function renderSavedViewsMenu() {
    if (!savedViewsList) return;
    const snap = store.getSnapshot();
    const views = snap.savedViews || [];

    savedViewsList.innerHTML = views.map(v => `
      <div class="suggestion-item saved-view-item" data-view-id="${v.id}">
        <span class="suggestion-title">
          <i data-lucide="bookmark" style="width: 14px; height: 14px; color: var(--primary);"></i>
          ${escapeHtml(v.name)}
        </span>
        <button type="button" class="btn-delete-saved-view" data-del-id="${v.id}" title="Delete saved view" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">
          <i data-lucide="x" style="width: 12px; height: 12px;"></i>
        </button>
      </div>
    `).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    savedViewsList.querySelectorAll('.saved-view-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-saved-view')) return;
        const vid = el.getAttribute('data-view-id');
        const view = views.find(v => v.id === vid);
        if (view) {
          store.applySavedView(view);
          document.getElementById('popover-saved-views').hidden = true;
          if (onFilterChange) onFilterChange();
        }
      });
    });

    savedViewsList.querySelectorAll('.btn-delete-saved-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vid = btn.getAttribute('data-del-id');
        store.deleteSavedView(vid);
        renderSavedViewsMenu();
      });
    });
  }

  renderSavedViewsMenu();

  // --------------------------------------------------------------------------
  // Active Filter Chips Bar
  // --------------------------------------------------------------------------
  const chipsContainer = document.getElementById('active-chips-bar');
  const chipsList = document.getElementById('active-chips-list');
  const btnClearAll = document.getElementById('btn-clear-all-chips');

  function renderChips() {
    if (!chipsContainer || !chipsList) return;
    const snap = store.getSnapshot();
    const f = snap.filters;

    const chips = [];

    if (f.q) chips.push({ key: 'q', label: `Search: "${f.q}"` });
    if (f.status) chips.push({ key: 'status', label: `Status: ${f.status}` });
    if (f.priority) chips.push({ key: 'priority', label: `Priority: ${f.priority}` });
    if (f.category) chips.push({ key: 'category', label: `Category: ${f.category}` });
    if (f.overdue_only) chips.push({ key: 'overdue_only', label: 'Overdue only' });
    if (f.created_from || f.created_to) {
      chips.push({ key: 'date', label: f.date_preset ? `Date: ${f.date_preset}` : 'Date: Custom' });
    }

    if (chips.length === 0) {
      chipsContainer.hidden = true;
      chipsList.innerHTML = '';
      return;
    }

    chipsContainer.hidden = false;
    chipsList.innerHTML = chips.map(c => `
      <span class="filter-chip">
        <span>${escapeHtml(c.label)}</span>
        <button type="button" class="chip-remove-btn" data-chip-key="${c.key}" aria-label="Remove filter">
          <i data-lucide="x" style="width: 12px; height: 12px;"></i>
        </button>
      </span>
    `).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    chipsList.querySelectorAll('.chip-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-chip-key');
        removeFilterKey(key);
      });
    });
  }

  function removeFilterKey(key) {
    const snap = store.getSnapshot();
    const nextFilters = { ...snap.filters };

    if (key === 'q') nextFilters.q = '';
    else if (key === 'status') nextFilters.status = '';
    else if (key === 'priority') nextFilters.priority = '';
    else if (key === 'category') nextFilters.category = '';
    else if (key === 'overdue_only') nextFilters.overdue_only = false;
    else if (key === 'date') {
      nextFilters.date_preset = '';
      nextFilters.created_from = '';
      nextFilters.created_to = '';
    }

    store.setState({ filters: nextFilters, page: 1 });
    renderChips();
    if (onFilterChange) onFilterChange();
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      const snap = store.getSnapshot();
      store.setState({
        filters: {
          q: '',
          status: '',
          priority: '',
          category: '',
          assignee: '',
          date_preset: '',
          created_from: '',
          created_to: '',
          overdue_only: false,
        },
        page: 1,
      });
      renderChips();
      if (onFilterChange) onFilterChange();
    });
  }

  // Subscribe to store changes to keep chips and popover checkboxes in sync
  store.subscribe((state) => {
    renderChips();
  });
}
