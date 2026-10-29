/**
 * Modals Component
 * New/Edit modal with templates, blur validation, focus trap, unsaved changes warning,
 * Delete modal with undo support, and Shortcuts help modal (?).
 */

import { api } from '../api.js';
import { escapeHtml } from '../utils/escape.js';
import { showToast } from './toast.js';

const TEMPLATES = {
  bug: {
    title: '[Bug] Issue with ',
    description: `### Steps to Reproduce:\n1. Navigate to...\n2. Click on...\n\n### Expected Behavior:\n\n### Actual Behavior:\n\n### Environment (Browser/OS):`,
    category: 'bug',
    priority: 'high',
  },
  billing: {
    title: '[Billing] Payment discrepancy on invoice #',
    description: `### Account / Organization:\n\n### Invoice Number:\n\n### Issue Description:\nCharges appear incorrect because...`,
    category: 'billing',
    priority: 'medium',
  },
  feature_request: {
    title: '[Feature] Add ability to ',
    description: `### Problem Statement:\nAs a user, it is difficult to...\n\n### Proposed Solution:\n\n### Value & Impact:`,
    category: 'feature_request',
    priority: 'medium',
  },
};

export function setupModalComponent({ onTicketCreated, onTicketUpdated, onTicketDeleted }) {
  // --------------------------------------------------------------------------
  // Focus Trap Helper
  // --------------------------------------------------------------------------
  function trapFocus(modalEl) {
    const focusable = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // Create / Edit Modal
  // --------------------------------------------------------------------------
  const createBackdrop = document.getElementById('modal-create-backdrop');
  const createForm = document.getElementById('form-create-ticket');
  const templateSelect = document.getElementById('create-template-select');
  const titleInput = document.getElementById('create-title');
  const descInput = document.getElementById('create-description');
  const titleCount = document.getElementById('create-title-count');
  const descCount = document.getElementById('create-desc-count');
  const btnSubmit = document.getElementById('btn-create-submit');

  let isFormDirty = false;

  function openCreateModal(initialData = null) {
    if (!createBackdrop || !createForm) return;
    createForm.reset();
    isFormDirty = false;

    if (initialData) {
      if (titleInput) titleInput.value = initialData.title || '';
      if (descInput) descInput.value = initialData.description || '';
      const prio = document.getElementById('create-priority');
      if (prio && initialData.priority) prio.value = initialData.priority;
      const cat = document.getElementById('create-category');
      if (cat && initialData.category) cat.value = initialData.category;
      const ass = document.getElementById('create-assignee');
      if (ass && initialData.assignee) ass.value = initialData.assignee;
      isFormDirty = true;
    }

    updateCharCounters();
    clearErrors(createForm);

    createBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    trapFocus(createBackdrop);

    setTimeout(() => {
      if (titleInput) titleInput.focus();
    }, 50);
  }

  function closeCreateModal(force = false) {
    if (!createBackdrop) return;
    if (!force && isFormDirty) {
      if (!confirm('You have unsaved changes. Discard them and close?')) {
        return;
      }
    }
    createBackdrop.hidden = true;
    document.body.style.overflow = '';
    isFormDirty = false;
  }

  // Template pre-fill
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      const tmpl = TEMPLATES[templateSelect.value];
      if (tmpl) {
        if (titleInput && (!titleInput.value || titleInput.value.startsWith('['))) titleInput.value = tmpl.title;
        if (descInput) descInput.value = tmpl.description;
        const catSelect = document.getElementById('create-category');
        if (catSelect) catSelect.value = tmpl.category;
        const prioSelect = document.getElementById('create-priority');
        if (prioSelect) prioSelect.value = tmpl.priority;
        isFormDirty = true;
        updateCharCounters();
      }
    });
  }

  function updateCharCounters() {
    if (titleCount && titleInput) titleCount.textContent = `${titleInput.value.length}/120`;
    if (descCount && descInput) descCount.textContent = `${descInput.value.length}/2000`;
  }

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      isFormDirty = true;
      updateCharCounters();
    });
    titleInput.addEventListener('blur', () => {
      validateField(titleInput, document.getElementById('create-title-error'), val => {
        if (!val || val.length < 5) return 'Title must be at least 5 characters.';
        if (val.length > 120) return 'Title cannot exceed 120 characters.';
        return null;
      });
    });
  }

  if (descInput) {
    descInput.addEventListener('input', () => {
      isFormDirty = true;
      updateCharCounters();
    });
    descInput.addEventListener('blur', () => {
      validateField(descInput, document.getElementById('create-desc-error'), val => {
        if (!val) return 'Description is required.';
        if (val.length > 2000) return 'Description cannot exceed 2000 characters.';
        return null;
      });
    });
  }

  const nameInput = document.getElementById('create-requester-name');
  if (nameInput) {
    nameInput.addEventListener('blur', () => {
      validateField(nameInput, document.getElementById('create-name-error'), val => {
        if (!val) return 'Requester name is required.';
        return null;
      });
    });
  }

  const emailInput = document.getElementById('create-requester-email');
  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      validateField(emailInput, document.getElementById('create-email-error'), val => {
        if (!val) return 'Email is required.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Please enter a valid email address.';
        return null;
      });
    });
  }

  function validateField(field, errorEl, rule) {
    const error = rule(field.value.trim());
    if (error) {
      field.classList.add('is-invalid');
      if (errorEl) {
        errorEl.textContent = error;
        errorEl.hidden = false;
      }
      return false;
    } else {
      field.classList.remove('is-invalid');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.hidden = true;
      }
      return true;
    }
  }

  function clearErrors(form) {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.form-error-msg').forEach(el => { el.textContent = ''; el.hidden = true; });
  }

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleValid = validateField(titleInput, document.getElementById('create-title-error'), val => (!val || val.length < 5) ? 'Title must be 5-120 chars' : null);
      const descValid = validateField(descInput, document.getElementById('create-desc-error'), val => !val ? 'Description required' : null);
      const nameValid = validateField(nameInput, document.getElementById('create-name-error'), val => !val ? 'Name required' : null);
      const emailValid = validateField(emailInput, document.getElementById('create-email-error'), val => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? 'Valid email required' : null);

      if (!titleValid || !descValid || !nameValid || !emailValid) return;

      const payload = {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        priority: document.getElementById('create-priority')?.value || 'medium',
        category: document.getElementById('create-category')?.value || 'general',
        requester_name: nameInput.value.trim(),
        requester_email: emailInput.value.trim(),
        assignee: document.getElementById('create-assignee')?.value.trim() || null,
      };

      if (btnSubmit) {
        btnSubmit.disabled = true;
        const sp = btnSubmit.querySelector('.btn-spinner');
        if (sp) sp.hidden = false;
      }

      try {
        const created = await api.createTicket(payload);
        closeCreateModal(true);
        showToast({ title: 'Ticket Created', message: `${created.ticket_number} was successfully added.`, type: 'success' });
        if (onTicketCreated) onTicketCreated(created);
      } catch (err) {
        showToast({ title: 'Error', message: err.message, type: 'error' });
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          const sp = btnSubmit.querySelector('.btn-spinner');
          if (sp) sp.hidden = true;
        }
      }
    });
  }

  // Close triggers
  createBackdrop?.querySelectorAll('[data-close-modal]').forEach(b => {
    b.addEventListener('click', () => closeCreateModal(false));
  });

  // --------------------------------------------------------------------------
  // Delete Modal with 6-Second Undo Option
  // --------------------------------------------------------------------------
  const deleteBackdrop = document.getElementById('modal-delete-backdrop');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  let pendingDelete = null;

  function openDeleteModal(ticketId, ticketNumber) {
    if (!deleteBackdrop) return;
    pendingDelete = { id: ticketId, number: ticketNumber };
    const numEl = document.getElementById('delete-ticket-num-text');
    if (numEl) numEl.textContent = ticketNumber || ticketId;

    deleteBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    trapFocus(deleteBackdrop);
  }

  function closeDeleteModal() {
    if (!deleteBackdrop) return;
    deleteBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
      if (!pendingDelete) return;
      const target = { ...pendingDelete };
      closeDeleteModal();

      // Optimistic delete: hide immediately and offer 6s Undo
      if (onTicketDeleted) onTicketDeleted(target.id, true);

      let actuallyDeleted = false;
      const executeActualDelete = async () => {
        if (actuallyDeleted) return;
        actuallyDeleted = true;
        try {
          await api.deleteTicket(target.id);
        } catch (err) {
          console.warn('Delete error:', err);
        }
      };

      // Timer to execute delete after 6 seconds
      const timer = setTimeout(executeActualDelete, 6000);

      showToast({
        title: 'Ticket Deleted',
        message: `${target.number || 'Ticket'} deleted.`,
        type: 'info',
        durationMs: 6000,
        undoCallback: () => {
          clearTimeout(timer);
          showToast({ title: 'Action Undone', message: `${target.number} restored.`, type: 'success' });
          if (onTicketDeleted) onTicketDeleted(target.id, false); // rollback
        },
      });
    });
  }

  deleteBackdrop?.querySelectorAll('[data-close-modal]').forEach(b => {
    b.addEventListener('click', closeDeleteModal);
  });

  // --------------------------------------------------------------------------
  // Shortcuts Help Modal (?)
  // --------------------------------------------------------------------------
  const shortcutsBackdrop = document.getElementById('modal-shortcuts-backdrop');
  const btnHelp = document.getElementById('btn-shortcuts-help');

  function openShortcutsModal() {
    if (!shortcutsBackdrop) return;
    shortcutsBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeShortcutsModal() {
    if (!shortcutsBackdrop) return;
    shortcutsBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  if (btnHelp) btnHelp.addEventListener('click', openShortcutsModal);
  shortcutsBackdrop?.querySelectorAll('[data-close-modal]').forEach(b => {
    b.addEventListener('click', closeShortcutsModal);
  });

  // Listen for '?' key to open help
  window.addEventListener('keydown', (e) => {
    const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === '?' && !isEditing) {
      e.preventDefault();
      openShortcutsModal();
    }
  });

  return {
    openCreateModal,
    openDeleteModal,
    openShortcutsModal,
  };
}
