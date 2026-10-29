/**
 * Router Module
 * Syncs application state with URL query parameters and hash deep-linking.
 */

import { store } from './store.js';

class Router {
  constructor() {
    this.isUpdatingFromUrl = false;
  }

  init() {
    this.readFromUrl();

    window.addEventListener('popstate', () => {
      this.readFromUrl();
    });

    window.addEventListener('hashchange', () => {
      this.readHash();
    });
  }

  readFromUrl() {
    this.isUpdatingFromUrl = true;

    const urlParams = new URLSearchParams(window.location.search);
    const snap = store.getSnapshot();

    const filters = {
      q: urlParams.get('q') || '',
      status: urlParams.get('status') || '',
      priority: urlParams.get('priority') || '',
      category: urlParams.get('category') || '',
      assignee: urlParams.get('assignee') || '',
      date_preset: urlParams.get('date_preset') || '',
      created_from: urlParams.get('created_from') || '',
      created_to: urlParams.get('created_to') || '',
      overdue_only: urlParams.get('overdue') === 'true',
    };

    const sort = {
      sort_by: urlParams.get('sort_by') || snap.sort.sort_by,
      order: urlParams.get('order') || snap.sort.order,
    };

    const page = Math.max(1, parseInt(urlParams.get('page'), 10) || 1);
    const page_size = Math.min(50, Math.max(1, parseInt(urlParams.get('page_size'), 10) || 20));
    const viewMode = urlParams.get('view') || snap.viewMode;

    store.setState({
      filters,
      sort,
      page,
      page_size,
      viewMode: ['table', 'board', 'compact'].includes(viewMode) ? viewMode : 'table',
    });

    this.readHash();
    this.isUpdatingFromUrl = false;
  }

  readHash() {
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/ticket\/([^/]+)$/);
    if (match) {
      const ticketIdOrNum = decodeURIComponent(match[1]);
      store.setState({ activeTicketId: ticketIdOrNum });
    } else {
      store.setState({ activeTicketId: null, activeTicket: null });
    }
  }

  syncStateToUrl() {
    if (this.isUpdatingFromUrl) return;

    const snap = store.getSnapshot();
    const urlParams = new URLSearchParams();

    if (snap.filters.q) urlParams.set('q', snap.filters.q);
    if (snap.filters.status) urlParams.set('status', snap.filters.status);
    if (snap.filters.priority) urlParams.set('priority', snap.filters.priority);
    if (snap.filters.category) urlParams.set('category', snap.filters.category);
    if (snap.filters.assignee) urlParams.set('assignee', snap.filters.assignee);
    if (snap.filters.date_preset) urlParams.set('date_preset', snap.filters.date_preset);
    if (snap.filters.created_from) urlParams.set('created_from', snap.filters.created_from);
    if (snap.filters.created_to) urlParams.set('created_to', snap.filters.created_to);
    if (snap.filters.overdue_only) urlParams.set('overdue', 'true');

    if (snap.sort.sort_by !== 'created_at') urlParams.set('sort_by', snap.sort.sort_by);
    if (snap.sort.order !== 'desc') urlParams.set('order', snap.sort.order);
    if (snap.page > 1) urlParams.set('page', String(snap.page));
    if (snap.page_size !== 20) urlParams.set('page_size', String(snap.page_size));
    if (snap.viewMode !== 'table') urlParams.set('view', snap.viewMode);

    const queryStr = urlParams.toString();
    const hash = snap.activeTicketId ? `#/ticket/${encodeURIComponent(snap.activeTicketId)}` : '';
    const newUrl = `${window.location.pathname}${queryStr ? '?' + queryStr : ''}${hash}`;

    window.history.replaceState({}, '', newUrl);
  }

  openTicketDeepLink(ticketIdOrNum) {
    window.location.hash = `#/ticket/${encodeURIComponent(ticketIdOrNum)}`;
  }

  closeTicketDeepLink() {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      store.setState({ activeTicketId: null, activeTicket: null });
    }
  }
}

export const router = new Router();
