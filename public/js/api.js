/**
 * API Client Module
 * Provides fetch wrapper with AbortController, timeout, network retry, and standard error parsing.
 */

export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}, retries = 2, timeoutMs = 10000) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = {
      'Accept': 'application/json',
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    // Set up timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine caller signal with timeout signal
    let combinedSignal = timeoutController.signal;
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('Aborted', 'AbortError');
      }
      options.signal.addEventListener('abort', () => timeoutController.abort());
    }

    const config = {
      ...options,
      signal: combinedSignal,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      if (response.status === 204) {
        return null;
      }

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        let code = 'API_ERROR';
        let message = `Request failed with status ${response.status}`;
        let details = null;

        if (data && data.error) {
          code = data.error.code || code;
          message = data.error.message || message;
          details = data.error.details || null;
        } else if (typeof data === 'string' && data.length > 0) {
          message = data;
        }

        const err = new Error(message);
        err.code = code;
        err.status = response.status;
        err.details = details;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw err;
      }

      // Retry network or transient errors if attempts remain
      if (retries > 0 && (!err.status || err.status >= 500)) {
        await new Promise(r => setTimeout(r, 600));
        return this.request(endpoint, options, retries - 1, timeoutMs);
      }

      throw err;
    }
  }

  // Endpoints
  async getHealth() {
    return this.request('/api/health', {}, 1, 4000);
  }

  async getStats() {
    return this.request('/api/stats');
  }

  async getTimeline() {
    try {
      return await this.request('/api/stats/timeline');
    } catch (err) {
      // Graceful fallback if timeline not yet seeded or fails
      return { timeline: [] };
    }
  }

  async listTickets(params = {}, signal = null) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        searchParams.set(key, String(val).trim());
      }
    }
    const queryStr = searchParams.toString();
    const endpoint = `/api/tickets${queryStr ? '?' + queryStr : ''}`;
    return this.request(endpoint, { signal });
  }

  async suggestTickets(query = '', signal = null) {
    try {
      const endpoint = `/api/tickets/suggest${query ? '?q=' + encodeURIComponent(query) : ''}`;
      return await this.request(endpoint, { signal });
    } catch (err) {
      return { suggestions: [] };
    }
  }

  async getTicket(id) {
    return this.request(`/api/tickets/${encodeURIComponent(id)}`);
  }

  async createTicket(payload) {
    return this.request('/api/tickets', {
      method: 'POST',
      body: payload,
    });
  }

  async updateTicket(id, payload) {
    return this.request(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
    });
  }

  async patchTicket(id, payload) {
    return this.request(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: payload,
    });
  }

  async deleteTicket(id) {
    return this.request(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async addComment(id, payload) {
    return this.request(`/api/tickets/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: payload,
    });
  }

  async bulkTickets(payload) {
    try {
      return await this.request('/api/tickets/bulk', {
        method: 'POST',
        body: payload,
      });
    } catch (err) {
      // Fallback: loop through items if bulk endpoint fails
      const action = payload.action;
      const ids = payload.ids || [];
      let updated = 0;
      let failed = 0;
      const errors = [];

      for (const id of ids) {
        try {
          if (action === 'delete') {
            await this.deleteTicket(id);
          } else if (action === 'update_status') {
            await this.patchTicket(id, { status: payload.status });
          } else if (action === 'update_priority') {
            await this.patchTicket(id, { priority: payload.priority });
          } else if (action === 'assign') {
            await this.patchTicket(id, { assignee: payload.assignee });
          }
          updated++;
        } catch (e) {
          failed++;
          errors.append({ id, message: e.message });
        }
      }
      return { updated, failed, errors };
    }
  }

  async exportTickets(params = {}) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        searchParams.set(key, String(val).trim());
      }
    }
    const queryStr = searchParams.toString();
    const endpoint = `/api/tickets/export${queryStr ? '?' + queryStr : ''}`;
    return this.request(endpoint);
  }
}

export const api = new ApiClient();
