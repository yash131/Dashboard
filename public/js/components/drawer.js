/**
 * Ticket Detail Drawer Component
 * Deep-linked, prev/next navigation, inline title/description edit,
 * markdown comments thread, activity timeline, copy link, and duplicate.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../router.js';
import { escapeHtml } from '../utils/escape.js';
import { renderSimpleMarkdown } from '../utils/markdown.js';
import { formatRelativeTime, formatFullDateTime } from '../utils/time.js';
import { getInitials, getAvatarColor } from '../utils/avatar.js';
import { showToast } from './toast.js';

export function setupDrawerComponent({ onDuplicateTicket, onDeleteTicket, onRefreshStats }) {
  const backdrop = document.getElementById('drawer-backdrop');
  if (!backdrop) return;

  const btnClose = document.getElementById('btn-drawer-close');
  const btnPrev = document.getElementById('btn-drawer-prev');
  const btnNext = document.getElementById('btn-drawer-next');
  const btnCopyLink = document.getElementById('btn-drawer-copy-link');
  const btnDuplicate = document.getElementById('btn-drawer-duplicate');
  const btnDelete = document.getElementById('btn-drawer-delete');

  const titleInput = document.getElementById('drawer-title-input');
  const titleSaved = document.getElementById('drawer-title-saved');
  const descView = document.getElementById('drawer-desc-view');
  const descEdit = document.getElementById('drawer-desc-edit');
  const descTextarea = document.getElementById('drawer-desc-textarea');
  const btnSaveDesc = document.getElementById('btn-drawer-save-desc');
  const btnCancelDesc = document.getElementById('btn-drawer-cancel-desc');

  const statusSelect = document.getElementById('drawer-status-select');
  const prioritySelect = document.getElementById('drawer-priority-select');
  const categorySelect = document.getElementById('drawer-category-select');
  const assigneeInput = document.getElementById('drawer-assignee-input');

  const tabComments = document.getElementById('drawer-tab-comments');
  const tabActivity = document.getElementById('drawer-tab-activity');
  const panelComments = document.getElementById('drawer-panel-comments');
  const panelActivity = document.getElementById('drawer-panel-activity');

  const formAddComment = document.getElementById('drawer-form-add-comment');
  const commentAuthorInput = document.getElementById('drawer-comment-author');
  const commentMsgInput = document.getElementById('drawer-comment-msg');
  const commentCharCount = document.getElementById('drawer-comment-count');
  const btnPostComment = document.getElementById('btn-drawer-post-comment');

  let currentTicket = null;

  // --------------------------------------------------------------------------
  // Deep-link store observation
  // --------------------------------------------------------------------------
  store.subscribe((state, prevState) => {
    if (state.activeTicketId && state.activeTicketId !== prevState.activeTicketId) {
      loadAndOpenTicket(state.activeTicketId);
    } else if (!state.activeTicketId && prevState.activeTicketId) {
      closeDrawer();
    }
  });

  async function loadAndOpenTicket(ticketIdOrNum) {
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    // Find in store tickets or fetch by ID
    const snap = store.getSnapshot();
    let ticket = snap.tickets.find(t => t.id === ticketIdOrNum || t.ticket_number === ticketIdOrNum);

    renderLoadingState();

    try {
      if (!ticket || !ticket.comments) {
        ticket = await api.getTicket(ticket?.id || ticketIdOrNum);
      }
      currentTicket = ticket;
      store.setState({ activeTicket: ticket });
      populateDrawer(ticket);
    } catch (err) {
      showToast({ title: 'Error Loading Ticket', message: err.message, type: 'error' });
      closeDrawer();
    }
  }

  function renderLoadingState() {
    document.getElementById('drawer-ticket-number').textContent = 'Loading…';
    if (titleInput) titleInput.value = 'Loading ticket details…';
    if (descView) descView.textContent = 'Please wait…';
  }

  function populateDrawer(ticket) {
    document.getElementById('drawer-ticket-number').textContent = ticket.ticket_number;
    if (titleInput) {
      titleInput.value = ticket.title;
      titleInput.setAttribute('data-original', ticket.title);
    }
    if (descView) descView.textContent = ticket.description;
    if (descTextarea) descTextarea.value = ticket.description;
    if (descEdit) descEdit.hidden = true;
    if (descView) descView.hidden = false;

    if (statusSelect) statusSelect.value = ticket.status;
    if (prioritySelect) prioritySelect.value = ticket.priority;
    if (categorySelect) categorySelect.value = ticket.category;
    if (assigneeInput) assigneeInput.value = ticket.assignee || '';

    document.getElementById('drawer-requester-val').textContent = `${ticket.requester_name} (${ticket.requester_email})`;
    document.getElementById('drawer-created-val').textContent = formatFullDateTime(ticket.created_at);
    document.getElementById('drawer-updated-val').textContent = formatFullDateTime(ticket.updated_at);

    // Pre-fill remembered author name
    const rememberedAuthor = localStorage.getItem('support_desk_author_name') || '';
    if (commentAuthorInput && !commentAuthorInput.value) {
      commentAuthorInput.value = rememberedAuthor;
    }

    renderComments(ticket.comments || []);
    renderActivity(ticket);
    updatePrevNextButtons();

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function closeDrawer() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
    currentTicket = null;
    router.closeTicketDeepLink();
  }

  if (btnClose) btnClose.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDrawer();
  });

  // Prev / Next Navigation in list
  function updatePrevNextButtons() {
    const snap = store.getSnapshot();
    const tickets = snap.tickets;
    if (!currentTicket || tickets.length === 0) return;

    const idx = tickets.findIndex(t => t.id === currentTicket.id);
    if (btnPrev) btnPrev.disabled = idx <= 0;
    if (btnNext) btnNext.disabled = idx < 0 || idx >= tickets.length - 1;
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const idx = snap.tickets.findIndex(t => t.id === currentTicket?.id);
      if (idx > 0) {
        router.openTicketDeepLink(snap.tickets[idx - 1].id);
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const snap = store.getSnapshot();
      const idx = snap.tickets.findIndex(t => t.id === currentTicket?.id);
      if (idx >= 0 && idx < snap.tickets.length - 1) {
        router.openTicketDeepLink(snap.tickets[idx + 1].id);
      }
    });
  }

  // Copy Link
  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      if (!currentTicket) return;
      const url = `${window.location.origin}${window.location.pathname}#/ticket/${currentTicket.ticket_number}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast({ title: 'Link Copied', message: 'Ticket deep link copied to clipboard.', type: 'success' });
      }).catch(() => {
        showToast({ title: 'URL', message: url, type: 'info' });
      });
    });
  }

  // Duplicate Ticket
  if (btnDuplicate) {
    btnDuplicate.addEventListener('click', () => {
      if (currentTicket && onDuplicateTicket) {
        onDuplicateTicket(currentTicket);
        closeDrawer();
      }
    });
  }

  // Delete
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (currentTicket && onDeleteTicket) {
        onDeleteTicket(currentTicket.id, currentTicket.ticket_number);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Inline Title & Description Editing
  // --------------------------------------------------------------------------
  async function saveTitle() {
    if (!currentTicket || !titleInput) return;
    const nextTitle = titleInput.value.trim();
    const origTitle = titleInput.getAttribute('data-original');

    if (!nextTitle || nextTitle.length < 5 || nextTitle.length > 120 || nextTitle === origTitle) {
      if (nextTitle.length < 5) titleInput.value = origTitle;
      return;
    }

    try {
      await api.patchTicket(currentTicket.id, { title: nextTitle });
      currentTicket.title = nextTitle;
      titleInput.setAttribute('data-original', nextTitle);

      if (titleSaved) {
        titleSaved.style.opacity = '1';
        setTimeout(() => { titleSaved.style.opacity = '0'; }, 2000);
      }
    } catch (err) {
      showToast({ title: 'Error', message: err.message, type: 'error' });
      titleInput.value = origTitle;
    }
  }

  if (titleInput) {
    titleInput.addEventListener('blur', saveTitle);
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.blur();
      } else if (e.key === 'Escape') {
        titleInput.value = titleInput.getAttribute('data-original') || '';
        titleInput.blur();
      }
    });
  }

  // Click description to edit
  if (descView && descEdit) {
    descView.addEventListener('click', () => {
      descView.hidden = true;
      descEdit.hidden = false;
      descTextarea.focus();
    });
  }

  if (btnCancelDesc) {
    btnCancelDesc.addEventListener('click', () => {
      descEdit.hidden = true;
      descView.hidden = false;
      if (descTextarea && currentTicket) descTextarea.value = currentTicket.description;
    });
  }

  if (btnSaveDesc) {
    btnSaveDesc.addEventListener('click', async () => {
      if (!currentTicket || !descTextarea) return;
      const nextDesc = descTextarea.value.trim();
      if (!nextDesc) {
        showToast({ title: 'Validation', message: 'Description cannot be empty.', type: 'error' });
        return;
      }

      try {
        await api.patchTicket(currentTicket.id, { description: nextDesc });
        currentTicket.description = nextDesc;
        descView.textContent = nextDesc;
        descEdit.hidden = true;
        descView.hidden = false;
        showToast({ title: 'Saved', message: 'Description updated.', type: 'success' });
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      }
    });
  }

  // Ctrl+Enter to save description
  if (descTextarea) {
    descTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        btnSaveDesc?.click();
      } else if (e.key === 'Escape') {
        btnCancelDesc?.click();
      }
    });
  }

  // Instant Save: Status, Priority, Category, Assignee
  if (statusSelect) {
    statusSelect.addEventListener('change', async () => {
      if (!currentTicket) return;
      const val = statusSelect.value;
      const prev = currentTicket.status;

      try {
        await api.patchTicket(currentTicket.id, { status: val });
        currentTicket.status = val;
        showToast({ title: 'Status Saved', message: `Ticket status set to ${val}.`, type: 'success' });
        if (onRefreshStats) onRefreshStats();
      } catch (err) {
        statusSelect.value = prev;
        showToast({ title: 'Status Transition Not Allowed', message: err.message, type: 'error' });
      }
    });
  }

  if (prioritySelect) {
    prioritySelect.addEventListener('change', async () => {
      if (!currentTicket) return;
      const val = prioritySelect.value;
      try {
        await api.patchTicket(currentTicket.id, { priority: val });
        currentTicket.priority = val;
        showToast({ title: 'Priority Saved', message: `Priority set to ${val}.`, type: 'success' });
        if (onRefreshStats) onRefreshStats();
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      }
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', async () => {
      if (!currentTicket) return;
      const val = categorySelect.value;
      try {
        await api.patchTicket(currentTicket.id, { category: val });
        currentTicket.category = val;
        showToast({ title: 'Category Saved', message: 'Ticket category updated.', type: 'success' });
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      }
    });
  }

  if (assigneeInput) {
    assigneeInput.addEventListener('change', async () => {
      if (!currentTicket) return;
      const val = assigneeInput.value.trim() || null;
      try {
        await api.patchTicket(currentTicket.id, { assignee: val });
        currentTicket.assignee = val;
        showToast({ title: 'Assignee Saved', message: 'Assignee updated.', type: 'success' });
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      }
    });
  }

  // --------------------------------------------------------------------------
  // Tabs: Comments vs Activity
  // --------------------------------------------------------------------------
  if (tabComments && tabActivity) {
    tabComments.addEventListener('click', () => {
      tabComments.classList.add('active');
      tabActivity.classList.remove('active');
      panelComments.hidden = false;
      panelActivity.hidden = true;
    });

    tabActivity.addEventListener('click', () => {
      tabActivity.classList.add('active');
      tabComments.classList.remove('active');
      panelActivity.hidden = false;
      panelComments.hidden = true;
    });
  }

  // --------------------------------------------------------------------------
  // Comments Thread (Markdown Rendering & Submission)
  // --------------------------------------------------------------------------
  function renderComments(comments) {
    const listEl = document.getElementById('drawer-comments-list');
    const badgeEl = document.getElementById('drawer-comments-count-badge');
    if (!listEl) return;

    if (badgeEl) badgeEl.textContent = String(comments.length);

    if (comments.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">
          No comments yet. Write a message below to start the thread.
        </div>
      `;
      return;
    }

    listEl.innerHTML = comments.map(c => {
      const author = c.author || 'Anonymous';
      const initials = getInitials(author);
      const bg = getAvatarColor(author);
      const relTime = formatRelativeTime(c.created_at);
      const fullTime = formatFullDateTime(c.created_at);
      const formattedMsg = renderSimpleMarkdown(c.message);

      return `
        <div class="comment-card" style="display: flex; gap: 10px; padding: 12px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1px solid var(--border-base);">
          <span class="avatar-circle" style="width: 28px; height: 28px; font-size: 0.6875rem; background-color: ${bg};">
            ${escapeHtml(initials)}
          </span>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; align-items: baseline; justify-content: space-between;">
              <strong style="font-size: 0.8125rem; color: var(--text-primary);">${escapeHtml(author)}</strong>
              <span style="font-size: 0.6875rem; color: var(--text-muted);" title="${escapeHtml(fullTime)}">${escapeHtml(relTime)}</span>
            </div>
            <div style="font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.5; word-break: break-word;">
              ${formattedMsg}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Add Comment Form
  if (commentMsgInput && commentCharCount) {
    commentMsgInput.addEventListener('input', () => {
      commentCharCount.textContent = `${commentMsgInput.value.length}/1000`;
    });

    commentMsgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        formAddComment?.requestSubmit();
      }
    });
  }

  if (formAddComment) {
    formAddComment.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTicket) return;

      const author = commentAuthorInput?.value.trim();
      const message = commentMsgInput?.value.trim();

      if (!author) {
        showToast({ title: 'Validation', message: 'Author name is required.', type: 'error' });
        commentAuthorInput?.focus();
        return;
      }
      if (!message || message.length > 1000) {
        showToast({ title: 'Validation', message: 'Message is required (max 1000 characters).', type: 'error' });
        commentMsgInput?.focus();
        return;
      }

      localStorage.setItem('support_desk_author_name', author);

      if (btnPostComment) btnPostComment.disabled = true;

      try {
        const updated = await api.addComment(currentTicket.id, { author, message });
        currentTicket.comments = updated.comments || [];
        renderComments(currentTicket.comments);
        renderActivity(currentTicket);

        if (commentMsgInput) {
          commentMsgInput.value = '';
          if (commentCharCount) commentCharCount.textContent = '0/1000';
        }

        showToast({ title: 'Comment Posted', message: 'Your comment has been recorded.', type: 'success' });
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      } finally {
        if (btnPostComment) btnPostComment.disabled = false;
      }
    });
  }

  // --------------------------------------------------------------------------
  // Activity Timeline
  // --------------------------------------------------------------------------
  function renderActivity(ticket) {
    const timelineEl = document.getElementById('drawer-activity-timeline');
    if (!timelineEl) return;

    const events = [];

    if (Array.isArray(ticket.activity) && ticket.activity.length > 0) {
      ticket.activity.forEach(a => {
        let desc = '';
        const fromVal = a.from || a.from_val;
        if (a.type === 'create') {
          desc = `Ticket created (status: ${a.to || 'open'})`;
        } else if (a.type === 'status') {
          desc = `Status changed: ${fromVal || 'open'} \u2192 ${a.to}`;
        } else if (a.type === 'priority') {
          desc = `Priority changed: ${fromVal || 'default'} \u2192 ${a.to}`;
        } else if (a.type === 'assignee') {
          desc = a.to ? `Assigned to ${a.to}` : 'Unassigned';
        } else {
          desc = `${a.type}: ${fromVal || ''} \u2192 ${a.to || ''}`;
        }
        events.push({ desc, time: a.at });
      });
      // Also include comments in the activity feed
      (ticket.comments || []).forEach(c => {
        events.push({
          desc: `${c.author} added a comment`,
          time: c.created_at,
        });
      });
    } else {
      // Fallback
      events.push({
        desc: `Ticket created by ${ticket.requester_name}`,
        time: ticket.created_at,
      });

      (ticket.comments || []).forEach(c => {
        events.push({
          desc: `${c.author} added a comment`,
          time: c.created_at,
        });
      });

      if (ticket.updated_at && ticket.updated_at !== ticket.created_at) {
        events.push({
          desc: `Last updated / modified`,
          time: ticket.updated_at,
        });
      }
    }

    events.sort((a, b) => new Date(b.time) - new Date(a.time));

    timelineEl.innerHTML = events.map(ev => `
      <div class="activity-item">
        <span class="activity-dot"></span>
        <span class="activity-desc">${escapeHtml(ev.desc)}</span>
        <span class="activity-time">${escapeHtml(formatRelativeTime(ev.time))} &bull; ${escapeHtml(formatFullDateTime(ev.time))}</span>
      </div>
    `).join('');
  }
}
