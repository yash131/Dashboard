/**
 * Command Palette Component (Ctrl/Cmd+K)
 * Fuzzy search across Actions, Saved Views, and Tickets with keyboard navigation.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../router.js';
import { escapeHtml } from '../utils/escape.js';
import { debounce } from '../utils/debounce.js';

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.items = [];
    this.query = '';
    this.recentActions = JSON.parse(localStorage.getItem('support_desk_recent_palette') || '[]');
  }

  init({ onOpenCreate, onExportCsv, onClearFilters }) {
    this.onOpenCreate = onOpenCreate;
    this.onExportCsv = onExportCsv;
    this.onClearFilters = onClearFilters;

    this.backdrop = document.getElementById('command-palette-backdrop');
    this.input = document.getElementById('palette-input');
    this.resultsList = document.getElementById('palette-results-list');

    if (!this.backdrop || !this.input || !this.resultsList) return;

    // Listen for Ctrl+K / Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    this.input.addEventListener('input', debounce(() => {
      this.query = this.input.value.trim();
      this.selectedIndex = 0;
      this.updateResults();
    }, 150));

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.backdrop.hidden = false;
    this.input.value = '';
    this.query = '';
    this.selectedIndex = 0;
    this.updateResults();
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.isOpen = false;
    this.backdrop.hidden = true;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  getBaseActions() {
    const snap = store.getSnapshot();
    return [
      {
        id: 'action-new-ticket',
        group: 'Actions',
        title: 'Create New Ticket',
        icon: 'plus',
        action: () => this.onOpenCreate && this.onOpenCreate(),
      },
      {
        id: 'action-toggle-theme',
        group: 'Actions',
        title: `Switch to ${snap.theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        icon: snap.theme === 'dark' ? 'sun' : 'moon',
        action: () => store.setState({ theme: snap.theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 'action-toggle-density',
        group: 'Actions',
        title: `Set Density to ${snap.density === 'comfortable' ? 'Compact' : 'Comfortable'}`,
        icon: 'layout-grid',
        action: () => store.setState({ density: snap.density === 'comfortable' ? 'compact' : 'comfortable' }),
      },
      {
        id: 'action-view-table',
        group: 'Actions',
        title: 'Switch to Table View',
        icon: 'table',
        action: () => store.setState({ viewMode: 'table' }),
      },
      {
        id: 'action-view-board',
        group: 'Actions',
        title: 'Switch to Board (Kanban) View',
        icon: 'kanban',
        action: () => store.setState({ viewMode: 'board' }),
      },
      {
        id: 'action-view-compact',
        group: 'Actions',
        title: 'Switch to Compact List View',
        icon: 'list',
        action: () => store.setState({ viewMode: 'compact' }),
      },
      {
        id: 'action-export-csv',
        group: 'Actions',
        title: 'Export Filtered Tickets to CSV',
        icon: 'download',
        action: () => this.onExportCsv && this.onExportCsv(),
      },
      {
        id: 'action-clear-filters',
        group: 'Actions',
        title: 'Clear All Active Filters',
        icon: 'filter-x',
        action: () => this.onClearFilters && this.onClearFilters(),
      },
    ];
  }

  async updateResults() {
    const snap = store.getSnapshot();
    const q = this.query.toLowerCase();

    // 1. Filter Actions
    const matchingActions = this.getBaseActions().filter(a =>
      !q || a.title.toLowerCase().includes(q)
    );

    // 2. Filter Saved Views
    const matchingViews = snap.savedViews.filter(v =>
      !q || v.name.toLowerCase().includes(q)
    ).map(v => ({
      id: v.id,
      group: 'Saved Views',
      title: v.name,
      icon: 'bookmark',
      action: () => store.applySavedView(v),
    }));

    // 3. Search Tickets (API or local)
    let matchingTickets = [];
    try {
      const res = await api.suggestTickets(this.query);
      const raw = Array.isArray(res) ? res : (res.suggestions || []);
      matchingTickets = raw.map(t => ({
        id: t.id,
        group: 'Tickets',
        title: `${t.ticket_number} — ${t.title}`,
        icon: 'ticket',
        action: () => router.openTicketDeepLink(t.ticket_number || t.id),
      }));
    } catch (e) {
      // Fallback: search loaded tickets
      matchingTickets = snap.tickets.filter(t =>
        !q || t.title.toLowerCase().includes(q) || t.ticket_number.toLowerCase().includes(q)
      ).slice(0, 6).map(t => ({
        id: t.id,
        group: 'Tickets',
        title: `${t.ticket_number} — ${t.title}`,
        icon: 'ticket',
        action: () => router.openTicketDeepLink(t.ticket_number || t.id),
      }));
    }

    this.items = [...matchingActions, ...matchingViews, ...matchingTickets];
    this.renderItems();
  }

  renderItems() {
    if (!this.resultsList) return;

    if (this.items.length === 0) {
      this.resultsList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">
          No matching commands, saved views, or tickets found.
        </div>
      `;
      return;
    }

    // Group items
    const grouped = {};
    this.items.forEach((item, index) => {
      const g = item.group || 'Actions';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push({ ...item, globalIndex: index });
    });

    let html = '';
    Object.keys(grouped).forEach(groupName => {
      html += `<div class="palette-group-title">${escapeHtml(groupName)}</div>`;
      grouped[groupName].forEach(item => {
        const isSelected = item.globalIndex === this.selectedIndex;
        html += `
          <div class="palette-item ${isSelected ? 'active' : ''}" data-index="${item.globalIndex}">
            <div class="palette-item-left">
              <i data-lucide="${item.icon}" style="width: 15px; height: 15px; color: var(--text-muted);"></i>
              <span>${escapeHtml(item.title)}</span>
            </div>
            ${item.group === 'Actions' ? '<kbd class="search-shortcut" style="position:static;">↵</kbd>' : ''}
          </div>
        `;
      });
    });

    this.resultsList.innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    // Click handler on results
    this.resultsList.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        this.selectedIndex = idx;
        this.executeSelected();
      });
    });
  }

  moveSelection(delta) {
    if (this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
    this.renderItems();

    // Scroll active item into view
    const activeEl = this.resultsList.querySelector('.palette-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  executeSelected() {
    const item = this.items[this.selectedIndex];
    if (item && item.action) {
      this.close();
      item.action();
    }
  }
}

export const commandPalette = new CommandPalette();
