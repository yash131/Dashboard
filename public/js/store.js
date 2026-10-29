/**
 * Observable Store Module
 * Manages central application state, subscriptions, selections, caching, and persistence.
 * Luxury "Emerald & Champagne" Theme.
 */

const DEFAULT_SAVED_VIEWS = [
  {
    id: 'view-urgent',
    name: 'My urgent',
    filters: { priority: 'urgent' },
    sort: { sort_by: 'created_at', order: 'desc' },
    viewMode: 'table',
  },
  {
    id: 'view-unassigned',
    name: 'Unassigned',
    filters: { assignee: 'unassigned' },
    sort: { sort_by: 'created_at', order: 'desc' },
    viewMode: 'table',
  },
  {
    id: 'view-overdue',
    name: 'Overdue',
    filters: { overdue_only: true },
    sort: { sort_by: 'created_at', order: 'asc' },
    viewMode: 'table',
  },
];

class Store {
  constructor() {
    this.listeners = new Set();

    // Load persisted settings safely
    let storedTheme = null;
    let storedDensity = 'comfortable';
    let storedSavedViews = DEFAULT_SAVED_VIEWS;
    let storedDashboardCollapsed = false;

    try {
      storedTheme = localStorage.getItem('support_desk_theme');
      storedDensity = localStorage.getItem('support_desk_density') || 'comfortable';
      const viewsJson = localStorage.getItem('support_desk_saved_views');
      if (viewsJson) storedSavedViews = JSON.parse(viewsJson);
      storedDashboardCollapsed = localStorage.getItem('support_desk_dashboard_collapsed') === 'true';
    } catch {
      // LocalStorage unavailable (e.g. sandboxed iframe or private browsing)
    }

    if (!storedTheme) {
      // Dark is the default. Respect prefers-color-scheme only when user has never chosen.
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        storedTheme = 'light';
      } else {
        storedTheme = 'dark';
      }
    }

    this.state = {
      // Tickets & Stats
      tickets: [],
      stats: { total: 0, by_status: {}, by_priority: {}, overdue: 0 },
      timeline: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 0,

      // Filters & Search
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

      // Sorting
      sort: {
        sort_by: 'created_at',
        order: 'desc',
      },

      // Selection & Views
      selectedIds: new Set(),
      viewMode: 'table', // 'table' | 'board' | 'compact'
      density: storedDensity,
      theme: storedTheme,
      savedViews: storedSavedViews,

      // Overlays & Deep Link
      activeTicket: null,
      activeTicketId: null,

      // App state
      loading: false,
      isOnline: navigator.onLine !== false,
      hasNewTicketsPill: false,
      dashboardCollapsed: storedDashboardCollapsed,

      // Stale-While-Revalidate Cache
      cache: new Map(),
    };

    // Apply tokens to document
    this.applyTheme(this.state.theme);
    this.applyDensity(this.state.density);
  }

  getSnapshot() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setState(partialState) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...partialState };

    // Side-effects on state changes
    if (partialState.theme && partialState.theme !== prevState.theme) {
      this.applyTheme(partialState.theme);
    }
    if (partialState.density && partialState.density !== prevState.density) {
      this.applyDensity(partialState.density);
    }
    if (partialState.dashboardCollapsed !== undefined) {
      try {
        localStorage.setItem('support_desk_dashboard_collapsed', String(partialState.dashboardCollapsed));
      } catch {}
    }

    for (const listener of this.listeners) {
      listener(this.state, prevState);
    }
  }

  applyTheme(theme) {
    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('support_desk_theme', theme);
    } catch {}
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 220);
  }

  applyDensity(density) {
    document.documentElement.setAttribute('data-density', density);
    try {
      localStorage.setItem('support_desk_density', density);
    } catch {}
  }

  // Selection actions
  toggleSelection(id) {
    const next = new Set(this.state.selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.setState({ selectedIds: next });
  }

  selectAll(ids) {
    this.setState({ selectedIds: new Set(ids) });
  }

  clearSelection() {
    this.setState({ selectedIds: new Set() });
  }

  // Saved Views actions
  saveCurrentView(name) {
    if (!name || !name.trim()) return;
    const newView = {
      id: `view-${Date.now()}`,
      name: name.trim(),
      filters: { ...this.state.filters },
      sort: { ...this.state.sort },
      viewMode: this.state.viewMode,
    };
    const nextViews = [...this.state.savedViews, newView];
    try {
      localStorage.setItem('support_desk_saved_views', JSON.stringify(nextViews));
    } catch {}
    this.setState({ savedViews: nextViews });
    return newView;
  }

  deleteSavedView(id) {
    const nextViews = this.state.savedViews.filter(v => v.id !== id);
    try {
      localStorage.setItem('support_desk_saved_views', JSON.stringify(nextViews));
    } catch {}
    this.setState({ savedViews: nextViews });
  }

  applySavedView(view) {
    if (!view) return;
    this.setState({
      filters: { ...this.state.filters, ...(view.filters || {}) },
      sort: { ...this.state.sort, ...(view.sort || {}) },
      viewMode: view.viewMode || this.state.viewMode,
      page: 1,
    });
  }
}

export const store = new Store();
