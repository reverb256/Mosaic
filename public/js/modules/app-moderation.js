'use strict';

/**
 * Mosiac Moderation UI
 *
 * Vanilla JS components for the moderation label system:
 * - Report button on posts/profiles
 * - Label viewer (own content labels with note + expiry)
 * - Appeal form
 * - Labeler trust management
 * - Report history
 */

const ModerationUI = (() => {
  // ─── State ──────────────────────────────────────────────

  let _state = {
    currentPubkey: null,
    currentIdentity: null,
  };

  // ─── API helpers ────────────────────────────────────────

  async function _api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    return res.json();
  }

  // ─── Report Button ──────────────────────────────────────

  /**
   * Create a "Report" button and attach the modal logic.
   * @param {string} uri — the URI of the content being reported
   * @param {HTMLElement} container — element to append the button to
   */
  function createReportButton(uri, container) {
    const btn = document.createElement('button');
    btn.className = 'mosiac-report-btn';
    btn.textContent = 'Report';
    btn.title = 'Report this content to moderators';
    btn.addEventListener('click', () => _openReportModal(uri));
    container.appendChild(btn);
  }

  function _openReportModal(uri) {
    const existing = document.getElementById('mosiac-report-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mosiac-report-modal';
    overlay.className = 'mosiac-modal-overlay';
    overlay.innerHTML = `
      <div class="mosiac-modal">
        <h3>Report Content</h3>
        <p>URI: <code>${htmlEscape(uri)}</code></p>
        <label>
          Reason type:
          <select id="mosiac-report-reason-type">
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="illegal">Illegal content</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Description:
          <textarea id="mosiac-report-reason" rows="4" placeholder="Explain why this content violates the rules…"></textarea>
        </label>
        <div class="mosiac-modal-actions">
          <button id="mosiac-report-submit" class="mosiac-btn-primary">Submit Report</button>
          <button id="mosiac-report-cancel" class="mosiac-btn-secondary">Cancel</button>
        </div>
        <p id="mosiac-report-status" class="mosiac-status"></p>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('mosiac-report-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('mosiac-report-submit').addEventListener('click', async () => {
      const reasonType = document.getElementById('mosiac-report-reason-type').value;
      const reason = document.getElementById('mosiac-report-reason').value;
      const statusEl = document.getElementById('mosiac-report-status');

      try {
        const result = await _api('/mosiac/report/create', {
          method: 'POST',
          body: JSON.stringify({ uri, reason_type: reasonType, reason }),
        });
        if (result.error) {
          statusEl.textContent = 'Error: ' + result.error;
          statusEl.className = 'mosiac-status mosiac-error';
        } else {
          statusEl.textContent = 'Report submitted. Thank you.';
          statusEl.className = 'mosiac-status mosiac-success';
          setTimeout(() => overlay.remove(), 1500);
        }
      } catch (err) {
        statusEl.textContent = 'Network error: ' + err.message;
        statusEl.className = 'mosiac-status mosiac-error';
      }
    });
  }

  // ─── Label Viewer ───────────────────────────────────────

  /**
   * Render a labels section showing all labels applied to the current user's content.
   * @param {string} uri — optional URI to filter labels
   * @param {HTMLElement} container
   */
  async function renderLabelsView(uri, container) {
    container.innerHTML = '<h3>Content Labels</h3><p class="mosiac-loading">Loading…</p>';

    try {
      const params = uri ? '?uri=' + encodeURIComponent(uri) : '';
      const data = await _api('/mosiac/label/list' + params);

      if (!data.labels || data.labels.length === 0) {
        container.innerHTML = '<h3>Content Labels</h3><p>No labels applied.</p>';
        return;
      }

      let html = '<h3>Content Labels</h3><ul class="mosiac-label-list">';
      for (const label of data.labels) {
        const isExpired = label.expires_at && new Date(label.expires_at) < new Date();
        html += `
          <li class="mosiac-label-item ${isExpired ? 'mosiac-label-expired' : ''}">
            <span class="mosiac-label-value">${htmlEscape(label.val)}</span>
            <span class="mosiac-label-note">${htmlEscape(label.note || '')}</span>
            <span class="mosiac-label-expiry">Expires: ${htmlEscape(label.expires_at || 'never')}</span>
            <span class="mosiac-label-source">By: ${htmlEscape(label.src)}</span>
            ${isExpired ? '<span class="mosiac-label-expired-badge">EXPIRED</span>' : ''}
            ${label.neg ? '<span class="mosiac-label-negated-badge">NEGATED</span>' : ''}
            <button class="mosiac-appeal-btn" data-cid="${htmlEscape(label.cid)}">Appeal</button>
          </li>
        `;
      }
      html += '</ul>';
      container.innerHTML = html;

      // Wire up appeal buttons
      container.querySelectorAll('.mosiac-appeal-btn').forEach(btn => {
        btn.addEventListener('click', () => _openAppealForm(btn.dataset.cid));
      });
    } catch (err) {
      container.innerHTML = '<h3>Content Labels</h3><p class="mosiac-error">Failed to load labels: ' + htmlEscape(err.message) + '</p>';
    }
  }

  // ─── Appeal Form ────────────────────────────────────────

  function _openAppealForm(labelCid) {
    const existing = document.getElementById('mosiac-appeal-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mosiac-appeal-modal';
    overlay.className = 'mosiac-modal-overlay';
    overlay.innerHTML = `
      <div class="mosiac-modal">
        <h3>Appeal Label</h3>
        <p>Label CID: <code>${htmlEscape(labelCid)}</code></p>
        <label>
          Reason for appeal:
          <textarea id="mosiac-appeal-reason" rows="4" placeholder="Explain why this label should be removed…"></textarea>
        </label>
        <label>
          Evidence (optional):
          <textarea id="mosiac-appeal-evidence" rows="3" placeholder="Links, screenshots, or other evidence…"></textarea>
        </label>
        <div class="mosiac-modal-actions">
          <button id="mosiac-appeal-submit" class="mosiac-btn-primary">Submit Appeal</button>
          <button id="mosiac-appeal-cancel" class="mosiac-btn-secondary">Cancel</button>
        </div>
        <p id="mosiac-appeal-status" class="mosiac-status"></p>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('mosiac-appeal-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('mosiac-appeal-submit').addEventListener('click', async () => {
      const reason = document.getElementById('mosiac-appeal-reason').value;
      const evidence = document.getElementById('mosiac-appeal-evidence').value;
      const statusEl = document.getElementById('mosiac-appeal-status');

      if (!reason.trim()) {
        statusEl.textContent = 'Please provide a reason for your appeal.';
        statusEl.className = 'mosiac-status mosiac-error';
        return;
      }

      try {
        const result = await _api('/mosiac/appeal/create', {
          method: 'POST',
          body: JSON.stringify({ label_cid: labelCid, reason, evidence }),
        });
        if (result.error) {
          statusEl.textContent = 'Error: ' + result.error;
          statusEl.className = 'mosiac-status mosiac-error';
        } else {
          statusEl.textContent = 'Appeal submitted. Awaiting moderator review.';
          statusEl.className = 'mosiac-status mosiac-success';
          setTimeout(() => overlay.remove(), 2000);
        }
      } catch (err) {
        statusEl.textContent = 'Network error: ' + err.message;
        statusEl.className = 'mosiac-status mosiac-error';
      }
    });
  }

  // ─── Labeler Trust Management ───────────────────────────

  /**
   * Render a labeler trust management panel in the settings UI.
   * @param {HTMLElement} container
   */
  function renderLabelerTrustPanel(container) {
    // Load saved trusted labelers from localStorage
    const saved = JSON.parse(localStorage.getItem('mosiac_trusted_labelers') || '[]');

    container.innerHTML = `
      <h3>Trusted Labelers</h3>
      <p>Only labels from trusted labelers will be applied to your feed.</p>
      <ul id="mosiac-trusted-labelers-list" class="mosiac-labeler-list">
        ${saved.length === 0 ? '<li class="mosiac-empty">No trusted labelers yet.</li>' : ''}
        ${saved.map(pk => `
          <li class="mosiac-labeler-item">
            <code>${htmlEscape(pk)}</code>
            <button class="mosiac-remove-labeler-btn" data-pubkey="${htmlEscape(pk)}">Remove</button>
          </li>
        `).join('')}
      </ul>
      <div class="mosiac-add-labeler">
        <input type="text" id="mosiac-labeler-pubkey-input" placeholder="Paste labeler pubkey…" />
        <button id="mosiac-add-labeler-btn" class="mosiac-btn-primary">Add Labeler</button>
      </div>
      <p id="mosiac-labeler-status" class="mosiac-status"></p>
    `;

    // Remove handlers
    container.querySelectorAll('.mosiac-remove-labeler-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pubkey = btn.dataset.pubkey;
        _removeTrustedLabeler(pubkey);
        renderLabelerTrustPanel(container); // re-render
      });
    });

    // Add handler
    document.getElementById('mosiac-add-labeler-btn').addEventListener('click', () => {
      const input = document.getElementById('mosiac-labeler-pubkey-input');
      const pubkey = input.value.trim();
      const statusEl = document.getElementById('mosiac-labeler-status');

      if (!pubkey) {
        statusEl.textContent = 'Please enter a pubkey.';
        statusEl.className = 'mosiac-status mosiac-error';
        return;
      }

      if (!pubkey.startsWith('ed25519:')) {
        statusEl.textContent = 'Invalid format. Use ed25519:<base64> format.';
        statusEl.className = 'mosiac-status mosiac-error';
        return;
      }

      _addTrustedLabeler(pubkey);
      input.value = '';
      statusEl.textContent = 'Labeler added.';
      statusEl.className = 'mosiac-status mosiac-success';
      renderLabelerTrustPanel(container); // re-render
    });
  }

  function _getTrustedLabelers() {
    return JSON.parse(localStorage.getItem('mosiac_trusted_labelers') || '[]');
  }

  function _addTrustedLabeler(pubkey) {
    const list = _getTrustedLabelers();
    if (!list.includes(pubkey)) {
      list.push(pubkey);
      localStorage.setItem('mosiac_trusted_labelers', JSON.stringify(list));
    }
  }

  function _removeTrustedLabeler(pubkey) {
    const list = _getTrustedLabelers().filter(pk => pk !== pubkey);
    localStorage.setItem('mosiac_trusted_labelers', JSON.stringify(list));
  }

  // ─── Report History ─────────────────────────────────────

  /**
   * Render a list of reports submitted by the current user.
   * @param {HTMLElement} container
   */
  async function renderReportHistory(container) {
    container.innerHTML = '<h3>Your Reports</h3><p class="mosiac-loading">Loading…</p>';

    try {
      const data = await _api('/mosiac/report/list');

      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = '<h3>Your Reports</h3><p>No reports submitted yet.</p>';
        return;
      }

      let html = '<h3>Your Reports</h3><table class="mosiac-reports-table"><thead><tr><th>Type</th><th>URI</th><th>Status</th><th>Date</th></tr></thead><tbody>';
      for (const r of data.reports) {
        html += `
          <tr>
            <td>${htmlEscape(r.reason_type)}</td>
            <td><code>${htmlEscape(r.uri)}</code></td>
            <td>${r.resolved ? 'Resolved' : 'Pending'}</td>
            <td>${htmlEscape(r.created_at)}</td>
          </tr>
        `;
      }
      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<h3>Your Reports</h3><p class="mosiac-error">Failed to load reports: ' + htmlEscape(err.message) + '</p>';
    }
  }

  // ─── Init ────────────────────────────────────────────────

  function init(currentPubkey) {
    _state.currentPubkey = currentPubkey;
  }

  // ─── Utility ─────────────────────────────────────────────

  function htmlEscape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Public API ──────────────────────────────────────────

  return {
    init,
    createReportButton,
    renderLabelsView,
    renderLabelerTrustPanel,
    renderReportHistory,
  };
})();

// Export for module bundlers or global access
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModerationUI;
} else if (typeof window !== 'undefined') {
  window.ModerationUI = ModerationUI;
}
