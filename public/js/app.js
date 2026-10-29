/**
 * Main Application Orchestrator
 * Connects Store, Router, API Client, and UI Components into a cohesive Linear/Intercom-level UX.
 */

import { api } from './api.js';
import { store } from './store.js';
import { router } from './router.js';
import { downloadCsv } from './utils/csv.js';
import { showToast } from './components/toast.js';
import { renderSparklineSvg, renderTimelineAreaChart, renderPriorityDonutChart } from './components/charts.js';
import { commandPalette } from './components/command-palette.js';
import { setupFiltersComponent } from './components/filters.js';
import { setupTableComponent } from './components/table.js';
import { setupBoardComponent } from './components/board.js';
import { setupBulkBarComponent } from './components/bulk-bar.js';
import { setupDrawerComponent } from './components/drawer.js';
import { setupModalComponent } from './components/modal.js';

let tableController = null;
let boardController = null;
let modalController = null;
let autoRefreshTimer = null;
let previousTotal = 0;

// ============================================================================
// 1. Data Loading & Stale-While-Revalidate Caching
// ============================================================================

async function loadTickets(force = false) {
  const snap = store.getSnapshot();
  const cacheKey = JSON.stringify({ filters: snap.filters, sort: snap.sort, page: snap.page, page_size: snap.page_size });

  // Stale-while-revalidate: if cache hit, render instantly then revalidate in background
  if (!force && snap.cache.has(cacheKey)) {
    const cached = snap.cache.get(cacheKey);
    store.setState({
      tickets: cached.items || [],
      total: cached.total || 0,
      total_pages: cached.total_pages || 0,
      loading: false,
    });
  } else {
    store.setState({ loading: true });
    renderSkeletons();
  }

  try {
    const params = {
      q: snap.filters.q,
      status: snap.filters.status,
      priority: snap.filters.priority,
      category: snap.filters.category,
      assignee: snap.filters.assignee,
      created_from: snap.filters.created_from,
      created_to: snap.filters.created_to,
      sort_by: snap.sort.sort_by,
      order: snap.sort.order,
      page: snap.page,
      page_size: snap.page_size,
    };

    const res = await api.listTickets(params);

    // Save in cache
    snap.cache.set(cacheKey, res);

    store.setState({
      tickets: res.items || [],
      total: res.total || 0,
      total_pages: res.total_pages || 0,
      loading: false,
      isOnline: true,
    });

    router.syncStateToUrl();
    renderCurrentView();
    updatePaginationUI();
  } catch (err) {
    store.setState({ loading: false });
    if (err.name !== 'AbortError') {
      console.error('Failed to load tickets:', err);
      showToast({ title: 'Connection Issue', message: err.message, type: 'error' });
      renderErrorState(err.message);
    }
  }
}

async function loadStatsAndCharts() {
  try {
    const [statsData, timelineData] = await Promise.all([
      api.getStats(),
      api.getTimeline(),
    ]);

    const tList = Array.isArray(timelineData) ? timelineData : (timelineData.timeline || []);
    store.setState({
      stats: statsData,
      timeline: tList,
    });

    renderKpis(statsData);
    renderCharts(tList, statsData.by_priority);
  } catch (err) {
    console.warn('Failed to load stats/charts:', err);
  }
}

// ============================================================================
// 2. Dashboard KPIs & SVG Charts Rendering
// ============================================================================

function renderKpis(stats) {
  const openVal = stats?.by_status?.open || 0;
  const inProgVal = stats?.by_status?.in_progress || 0;
  const resolvedVal = stats?.by_status?.resolved || 0;
  const urgentVal = stats?.by_priority?.urgent || 0;
  const overdueVal = stats?.overdue || 0;

  animateNumber('kpi-open-val', openVal);
  animateNumber('kpi-in-progress-val', inProgVal);
  animateNumber('kpi-resolved-val', resolvedVal);
  animateNumber('kpi-urgent-val', urgentVal);
  animateNumber('kpi-overdue-val', overdueVal);

  // Sparklines
  renderSparkline('kpi-sparkline-open', [3, 5, 4, 7, 6, 8, openVal || 4], 'var(--status-open)');
  renderSparkline('kpi-sparkline-in-progress', [2, 3, 5, 4, 6, 5, inProgVal || 3], 'var(--status-in-progress)');
  renderSparkline('kpi-sparkline-resolved', [4, 6, 5, 8, 7, 9, resolvedVal || 5], 'var(--status-resolved)');
  renderSparkline('kpi-sparkline-urgent', [1, 2, 1, 3, 2, 4, urgentVal || 2], 'var(--priority-urgent)');
  renderSparkline('kpi-sparkline-overdue', [0, 1, 1, 2, 1, 2, overdueVal || 1], 'var(--alert-overdue)');

  // Active KPI highlights
  const snap = store.getSnapshot();
  highlightKpiCard('kpi-card-open', snap.filters.status === 'open');
  highlightKpiCard('kpi-card-in-progress', snap.filters.status === 'in_progress');
  highlightKpiCard('kpi-card-resolved', snap.filters.status === 'resolved');
  highlightKpiCard('kpi-card-urgent', snap.filters.priority === 'urgent');
  highlightKpiCard('kpi-card-overdue', snap.filters.overdue_only === true);
}

function renderSparkline(containerId, points, color) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = renderSparklineSvg(points, color);
}

function highlightKpiCard(cardId, isActive) {
  const card = document.getElementById(cardId);
  if (card) card.classList.toggle('active-kpi', isActive);
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const current = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
  if (current === target) {
    el.textContent = target.toLocaleString();
    return;
  }

  const start = performance.now();
  const duration = 400;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = Math.round(current + (target - current) * ease);
    el.textContent = val.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(step);
}

function renderCharts(timeline, byPriority) {
  const timelineContainer = document.getElementById('timeline-chart-container');
  const donutContainer = document.getElementById('donut-chart-container');

  if (timelineContainer) renderTimelineAreaChart(timelineContainer, timeline);
  if (donutContainer) renderPriorityDonutChart(donutContainer, byPriority);
}

// ============================================================================
// 3. Views & Skeletons Rendering
// ============================================================================

function renderCurrentView() {
  const snap = store.getSnapshot();
  const tablePanel = document.getElementById('panel-table-view');
  const boardPanel = document.getElementById('panel-board-view');
  const compactPanel = document.getElementById('panel-compact-view');
  const emptyCard = document.getElementById('panel-empty-state');
  const errorCard = document.getElementById('panel-error-state');

  if (emptyCard) emptyCard.hidden = true;
  if (errorCard) errorCard.hidden = true;

  if (snap.tickets.length === 0) {
    if (tablePanel) tablePanel.hidden = true;
    if (boardPanel) boardPanel.hidden = true;
    if (compactPanel) compactPanel.hidden = true;
    renderEmptyState();
    return;
  }

  if (snap.viewMode === 'table') {
    if (tablePanel) tablePanel.hidden = false;
    if (boardPanel) boardPanel.hidden = true;
    if (compactPanel) compactPanel.hidden = true;
    if (tableController) tableController.render(snap.tickets);
  } else if (snap.viewMode === 'board') {
    if (tablePanel) tablePanel.hidden = true;
    if (boardPanel) boardPanel.hidden = false;
    if (compactPanel) compactPanel.hidden = true;
    if (boardController) boardController.render(snap.tickets);
  } else if (snap.viewMode === 'compact') {
    if (tablePanel) tablePanel.hidden = true;
    if (boardPanel) boardPanel.hidden = true;
    if (compactPanel) compactPanel.hidden = false;
    renderCompactListView(snap.tickets);
  }
}

function renderCompactListView(tickets) {
  const container = document.getElementById('compact-list-items');
  if (!container) return;

  const snap = store.getSnapshot();
  container.innerHTML = tickets.map(t => `
    <div class="compact-item" data-id="${t.id}">
      <div class="compact-left">
        <span class="ticket-num-tag" style="font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600;">${t.ticket_number}</span>
        <strong style="font-size: 0.8125rem; color: var(--text-primary);">${t.title}</strong>
      </div>
      <div class="compact-right">
        <span class="badge-pill badge-status-${t.status}"><span class="badge-dot"></span><span>${t.status}</span></span>
        <span class="badge-pill badge-priority-${t.priority}"><span class="badge-dot"></span><span>${t.priority}</span></span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">${t.requester_name}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.compact-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (id) router.openTicketDeepLink(id);
    });
  });
}

function renderSkeletons() {
  const snap = store.getSnapshot();
  if (snap.viewMode === 'table') {
    const tbody = document.getElementById('tickets-tbody');
    if (tbody) {
      tbody.innerHTML = Array(6).fill(0).map(() => `
        <tr class="skeleton-row">
          <td><div class="skeleton" style="width: 16px; height: 16px;"></div></td>
          <td><div class="skeleton skeleton-badge" style="width: 70px;"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 80%;"></div></td>
          <td><div class="skeleton skeleton-badge"></div></td>
          <td><div class="skeleton skeleton-badge"></div></td>
          <td><div class="skeleton skeleton-badge" style="width: 50px;"></div></td>
          <td><div class="skeleton skeleton-avatar"></div></td>
          <td><div class="skeleton skeleton-text" style="width: 50px;"></div></td>
          <td><div class="skeleton skeleton-badge" style="width: 50px;"></div></td>
          <td><div class="skeleton skeleton-badge" style="width: 50px;"></div></td>
        </tr>
      `).join('');
    }
  }
}

function renderEmptyState() {
  const emptyCard = document.getElementById('panel-empty-state');
  if (!emptyCard) return;

  const snap = store.getSnapshot();
  const hasFilters = Boolean(
    snap.filters.q || snap.filters.status || snap.filters.priority ||
    snap.filters.category || snap.filters.created_from || snap.filters.overdue_only
  );

  emptyCard.hidden = false;
  const titleEl = document.getElementById('empty-state-title');
  const descEl = document.getElementById('empty-state-desc');
  const resetBtn = document.getElementById('btn-empty-reset-filters');
  const newBtn = document.getElementById('btn-empty-new-ticket');

  if (hasFilters) {
    if (titleEl) titleEl.textContent = 'No matching tickets found';
    if (descEl) descEl.textContent = 'No tickets match your active filters or search terms. Try clearing filters.';
    if (resetBtn) resetBtn.hidden = false;
    if (newBtn) newBtn.hidden = true;
  } else {
    if (titleEl) titleEl.textContent = 'Support queue is empty';
    if (descEl) descEl.textContent = 'There are no support tickets in the system yet. Create your first ticket to get started.';
    if (resetBtn) resetBtn.hidden = true;
    if (newBtn) newBtn.hidden = false;
  }
}

function renderErrorState(message) {
  const errorCard = document.getElementById('panel-error-state');
  if (!errorCard) return;
  errorCard.hidden = false;
  const msgEl = document.getElementById('error-state-message');
  if (msgEl) msgEl.textContent = message || 'Failed to connect to Support Desk server.';
}

function updatePaginationUI() {
  const snap = store.getSnapshot();
  const paginationBar = document.getElementById('pagination-bar');
  if (!paginationBar) return;

  paginationBar.hidden = snap.viewMode === 'board';

  const rangeStart = snap.total === 0 ? 0 : (snap.page - 1) * snap.page_size + 1;
  const rangeEnd = Math.min(snap.total, snap.page * snap.page_size);

  document.getElementById('pagination-range-start').textContent = rangeStart.toLocaleString();
  document.getElementById('pagination-range-end').textContent = rangeEnd.toLocaleString();
  document.getElementById('pagination-total-count').textContent = snap.total.toLocaleString();

  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  if (btnPrev) btnPrev.disabled = snap.page <= 1;
  if (btnNext) btnNext.disabled = snap.page >= snap.total_pages || snap.total_pages === 0;

  const pageSizeSelect = document.getElementById('page-size-select');
  if (pageSizeSelect) pageSizeSelect.value = String(snap.page_size);
}

// ============================================================================
// 4. Header & Global Controls Setup
// ============================================================================

function setupHeaderControls() {
  // Theme toggle
  const themeToggle = document.getElementById('btn-theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const snap = store.getSnapshot();
      store.setState({ theme: snap.theme === 'dark' ? 'light' : 'dark' });
      updateThemeIcons(store.getSnapshot().theme);
    });
  }

  function updateThemeIcons(theme) {
    const iconMoon = document.getElementById('icon-theme-moon');
    const iconSun = document.getElementById('icon-theme-sun');
    if (iconMoon && iconSun) {
      iconMoon.hidden = theme === 'dark';
      iconSun.hidden = theme !== 'dark';
    }
  }
  updateThemeIcons(store.getSnapshot().theme);

  // Density toggle
  const btnDensity = document.getElementById('btn-density-toggle');
  if (btnDensity) {
    btnDensity.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const nextDensity = snap.density === 'comfortable' ? 'compact' : 'comfortable';
      store.setState({ density: nextDensity });
      showToast({ title: 'Density Mode', message: `Set to ${nextDensity}.`, type: 'info', durationMs: 1500 });
    });
  }

  // Refresh button
  const btnRefresh = document.getElementById('btn-refresh-data');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      showToast({ title: 'Refreshing', message: 'Fetching latest tickets & metrics…', type: 'info', durationMs: 1500 });
      await Promise.all([loadTickets(true), loadStatsAndCharts()]);
      btnRefresh.disabled = false;
    });
  }

  // Global search input with "/" shortcut & live suggestions popover
  const searchInput = document.getElementById('header-search-input');
  const searchClear = document.getElementById('header-search-clear');
  const suggestionsPopover = document.getElementById('search-suggestions-popover');
  let searchTimer = null;

  if (searchInput) {
    const snap = store.getSnapshot();
    if (snap.filters.q) {
      searchInput.value = snap.filters.q;
      if (searchClear) searchClear.hidden = false;
    }

    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      if (searchClear) searchClear.hidden = !val;

      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = val.trim();
        const curSnap = store.getSnapshot();
        store.setState({ filters: { ...curSnap.filters, q }, page: 1 });
        loadTickets();

        // Load live suggestions
        if (q.length >= 2 && suggestionsPopover) {
          try {
            const res = await api.suggestTickets(q);
            renderSuggestions(res.suggestions || []);
          } catch (e) {
            suggestionsPopover.hidden = true;
          }
        } else if (suggestionsPopover) {
          suggestionsPopover.hidden = true;
        }
      }, 250);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        if (searchClear) searchClear.hidden = true;
        if (suggestionsPopover) suggestionsPopover.hidden = true;
        const curSnap = store.getSnapshot();
        store.setState({ filters: { ...curSnap.filters, q: '' }, page: 1 });
        loadTickets();
        searchInput.blur();
      }
    });

    document.addEventListener('click', (e) => {
      if (suggestionsPopover && !suggestionsPopover.contains(e.target) && !searchInput.contains(e.target)) {
        suggestionsPopover.hidden = true;
      }
    });
  }

  function renderSuggestions(suggestions) {
    if (!suggestionsPopover) return;
    if (suggestions.length === 0) {
      suggestionsPopover.hidden = true;
      return;
    }

    suggestionsPopover.hidden = false;
    suggestionsPopover.innerHTML = suggestions.map(s => `
      <div class="suggestion-item" data-id="${s.id}">
        <span class="suggestion-title">
          <span class="ticket-num-tag" style="font-family: var(--font-mono); font-size: 0.75rem;">${s.ticket_number}</span>
          ${s.title}
        </span>
        <span class="badge-pill badge-status-${s.status}"><span class="badge-dot"></span><span>${s.status}</span></span>
      </div>
    `).join('');

    suggestionsPopover.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        suggestionsPopover.hidden = true;
        if (id) router.openTicketDeepLink(id);
      });
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.hidden = true;
      if (suggestionsPopover) suggestionsPopover.hidden = true;
      const curSnap = store.getSnapshot();
      store.setState({ filters: { ...curSnap.filters, q: '' }, page: 1 });
      loadTickets();
      if (searchInput) searchInput.focus();
    });
  }

  // Keyboard shortcut '/' to search
  window.addEventListener('keydown', (e) => {
    const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === '/' && !isEditing) {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
  });

  // Online / Offline banner detection
  const offlineBanner = document.getElementById('offline-banner');
  if (offlineBanner) {
    offlineBanner.hidden = navigator.onLine !== false;
  }
  window.addEventListener('online', () => {
    if (offlineBanner) offlineBanner.hidden = true;
    showToast({ title: 'Online', message: 'Network connection restored.', type: 'success' });
    loadTickets();
    loadStatsAndCharts();
  });
  window.addEventListener('offline', () => {
    if (offlineBanner) offlineBanner.hidden = false;
    showToast({ title: 'Offline', message: 'You are currently working offline.', type: 'error' });
  });

  // New Ticket Button
  const btnNew = document.getElementById('btn-header-new-ticket');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      if (modalController) modalController.openCreateModal();
    });
  }

  // Command Palette Button
  const btnPalette = document.getElementById('btn-open-palette');
  if (btnPalette) {
    btnPalette.addEventListener('click', () => commandPalette.open());
  }

  // View switchers: Table | Board | Compact
  const viewTable = document.getElementById('btn-view-table');
  const viewBoard = document.getElementById('btn-view-board');
  const viewCompact = document.getElementById('btn-view-compact');

  function updateViewButtons(mode) {
    if (viewTable) viewTable.classList.toggle('active', mode === 'table');
    if (viewBoard) viewBoard.classList.toggle('active', mode === 'board');
    if (viewCompact) viewCompact.classList.toggle('active', mode === 'compact');
  }

  function switchView(mode) {
    // View Transitions API
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        store.setState({ viewMode: mode });
        updateViewButtons(mode);
        renderCurrentView();
        updatePaginationUI();
      });
    } else {
      store.setState({ viewMode: mode });
      updateViewButtons(mode);
      renderCurrentView();
      updatePaginationUI();
    }
  }

  if (viewTable) viewTable.addEventListener('click', () => switchView('table'));
  if (viewBoard) viewBoard.addEventListener('click', () => switchView('board'));
  if (viewCompact) viewCompact.addEventListener('click', () => switchView('compact'));

  updateViewButtons(store.getSnapshot().viewMode);

  // Dashboard Collapse Toggle
  const btnToggleDashboard = document.getElementById('btn-toggle-dashboard');
  const dashboardCollapsible = document.getElementById('dashboard-collapsible-content');
  if (btnToggleDashboard && dashboardCollapsible) {
    const snap = store.getSnapshot();
    if (snap.dashboardCollapsed) {
      dashboardCollapsible.hidden = true;
      btnToggleDashboard.textContent = 'Show Analytics';
    }

    btnToggleDashboard.addEventListener('click', () => {
      const isHidden = !dashboardCollapsible.hidden;
      dashboardCollapsible.hidden = isHidden;
      store.setState({ dashboardCollapsed: isHidden });
      btnToggleDashboard.textContent = isHidden ? 'Show Analytics' : 'Hide Analytics';
    });
  }

  // KPI card filter clicks
  document.querySelectorAll('.kpi-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.getAttribute('data-kpi-type');
      const val = card.getAttribute('data-kpi-val');
      const snap = store.getSnapshot();
      const nextFilters = { ...snap.filters };

      if (type === 'status') {
        nextFilters.status = (nextFilters.status === val) ? '' : val;
      } else if (type === 'priority') {
        nextFilters.priority = (nextFilters.priority === val) ? '' : val;
      } else if (type === 'overdue') {
        nextFilters.overdue_only = !nextFilters.overdue_only;
      }

      store.setState({ filters: nextFilters, page: 1 });
      loadTickets();
      loadStatsAndCharts();
    });
  });

  // Export CSV button
  const btnExport = document.getElementById('btn-export-csv');
  async function triggerCsvExport() {
    const snap = store.getSnapshot();
    showToast({ title: 'Exporting CSV', message: 'Generating report with active filters…', type: 'info', durationMs: 2000 });

    try {
      // Use client-side CSV download from tickets list or API
      const headers = ['Ticket Number', 'Title', 'Status', 'Priority', 'Category', 'Requester Name', 'Requester Email', 'Assignee', 'Created At'];
      const rows = snap.tickets.map(t => [
        t.ticket_number, t.title, t.status, t.priority, t.category, t.requester_name, t.requester_email, t.assignee || '', t.created_at
      ]);
      downloadCsv('support_tickets.csv', headers, rows);
      showToast({ title: 'Export Complete', message: 'CSV downloaded successfully.', type: 'success' });
    } catch (err) {
      showToast({ title: 'Export Failed', message: err.message, type: 'error' });
    }
  }
  if (btnExport) btnExport.addEventListener('click', triggerCsvExport);

  // Pagination buttons
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  const pageSizeSelect = document.getElementById('page-size-select');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const snap = store.getSnapshot();
      if (snap.page > 1) {
        store.setState({ page: snap.page - 1 });
        loadTickets();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const snap = store.getSnapshot();
      if (snap.page < snap.total_pages) {
        store.setState({ page: snap.page + 1 });
        loadTickets();
      }
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      const size = parseInt(pageSizeSelect.value, 10) || 20;
      store.setState({ page_size: size, page: 1 });
      loadTickets();
    });
  }

  // New tickets floating pill
  const newTicketsPill = document.getElementById('new-tickets-pill');
  if (newTicketsPill) {
    newTicketsPill.addEventListener('click', () => {
      newTicketsPill.hidden = true;
      loadTickets(true);
      loadStatsAndCharts();
    });
  }
}

// ============================================================================
// 5. Background Auto-Refresh (every 30s when tab visible)
// ============================================================================

function setupAutoRefresh() {
  function tick() {
    if (document.visibilityState === 'visible') {
      api.getStats().then(stats => {
        if (stats.total > previousTotal && previousTotal > 0) {
          const pill = document.getElementById('new-tickets-pill');
          if (pill) pill.hidden = false;
        }
        previousTotal = stats.total;
      }).catch(() => {});
    }
  }

  autoRefreshTimer = setInterval(tick, 30000);
}

// ============================================================================
// 6. Bootstrap Application
// ============================================================================

async function init() {
  router.init();

  // Setup sub-components
  tableController = setupTableComponent({
    onEditTicket: (id) => modalController && modalController.openCreateModal(store.getSnapshot().tickets.find(t => t.id === id)),
    onDeleteTicket: (id, num) => modalController && modalController.openDeleteModal(id, num),
    onRefreshStats: loadStatsAndCharts,
  });

  boardController = setupBoardComponent({
    onRefreshStats: loadStatsAndCharts,
  });

  modalController = setupModalComponent({
    onTicketCreated: () => { loadTickets(true); loadStatsAndCharts(); },
    onTicketUpdated: () => { loadTickets(true); loadStatsAndCharts(); },
    onTicketDeleted: (id, isOptimistic) => {
      if (isOptimistic) {
        // Optimistic removal from state
        const snap = store.getSnapshot();
        const next = snap.tickets.filter(t => t.id !== id);
        store.setState({ tickets: next, total: Math.max(0, snap.total - 1) });
        renderCurrentView();
      } else {
        // Rollback
        loadTickets(true);
      }
      loadStatsAndCharts();
    },
  });

  setupBulkBarComponent({
    onRefreshData: () => { loadTickets(true); loadStatsAndCharts(); },
  });

  setupDrawerComponent({
    onDuplicateTicket: (t) => modalController && modalController.openCreateModal(t),
    onDeleteTicket: (id, num) => modalController && modalController.openDeleteModal(id, num),
    onRefreshStats: loadStatsAndCharts,
  });

  setupFiltersComponent({
    onFilterChange: () => { loadTickets(); loadStatsAndCharts(); },
  });

  commandPalette.init({
    onOpenCreate: () => modalController && modalController.openCreateModal(),
    onExportCsv: () => document.getElementById('btn-export-csv')?.click(),
    onClearFilters: () => document.getElementById('btn-clear-all-chips')?.click(),
  });

  setupHeaderControls();
  setupAutoRefresh();

  // Initial Data Fetch
  await Promise.all([
    loadTickets(),
    loadStatsAndCharts(),
  ]);

  previousTotal = store.getSnapshot().total;

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Mount app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
