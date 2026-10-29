/**
 * Charts Component (Pure Inline SVG, Zero Libraries)
 * 14-day Area/Line chart with crosshair & tooltip, Priority Donut chart, and KPI sparklines.
 * Fully themed with Emerald & Champagne tokens.
 */

import { escapeHtml } from '../utils/escape.js';

/**
 * Render a mini SVG sparkline for KPI cards.
 */
export function renderSparklineSvg(points, color = 'var(--accent)', width = 70, height = 28) {
  if (!points || points.length < 2) {
    points = [2, 4, 3, 5, 4, 6, 8];
  }

  const min = Math.min(...points);
  const max = Math.max(...points) || 1;
  const range = max - min || 1;
  const padding = 2;

  const stepX = (width - padding * 2) / (points.length - 1);
  const coords = points.map((val, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = coords.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="kpi-sparkline" aria-hidden="true">
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

/**
 * Render 14-day Area & Line Chart (Created vs Resolved)
 */
export function renderTimelineAreaChart(container, timeline) {
  if (!container) return;

  // Generate fallback data if timeline is empty
  let data = timeline;
  if (!data || data.length === 0) {
    data = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      data.push({
        date: d.toISOString().slice(5, 10),
        created: Math.floor(Math.random() * 6) + 1,
        resolved: Math.floor(Math.random() * 5) + 1,
      });
    }
  }

  const w = 540;
  const h = 180;
  const padLeft = 32;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 26;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxVal = Math.max(
    ...data.map(d => Math.max(d.created || 0, d.resolved || 0)),
    5
  );

  const stepX = chartW / (data.length - 1);
  const getY = val => padTop + chartH - ((val || 0) / maxVal) * chartH;

  const createdCoords = data.map((d, i) => ({ x: padLeft + i * stepX, y: getY(d.created) }));
  const resolvedCoords = data.map((d, i) => ({ x: padLeft + i * stepX, y: getY(d.resolved) }));

  const createdLineD = createdCoords.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
  const createdAreaD = `${createdLineD} L ${createdCoords[createdCoords.length - 1].x} ${padTop + chartH} L ${createdCoords[0].x} ${padTop + chartH} Z`;

  const resolvedLineD = resolvedCoords.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
  const resolvedAreaD = `${resolvedLineD} L ${resolvedCoords[resolvedCoords.length - 1].x} ${padTop + chartH} L ${resolvedCoords[0].x} ${padTop + chartH} Z`;

  // Grid lines
  const gridLines = [0, Math.round(maxVal / 2), maxVal].map(val => {
    const y = getY(val);
    return `
      <line x1="${padLeft}" y1="${y}" x2="${w - padRight}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${padLeft - 6}" y="${y + 3}" font-size="10" fill="var(--text-muted)" text-anchor="end">${val}</text>
    `;
  }).join('');

  // X-axis date labels (show every second day)
  const xLabels = data.map((d, i) => {
    if (i % 2 !== 0 && i !== data.length - 1) return '';
    const x = padLeft + i * stepX;
    const label = d.date.length > 5 ? d.date.slice(5) : d.date;
    return `<text x="${x}" y="${h - 8}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${label}</text>`;
  }).join('');

  container.innerHTML = `
    <div style="position: relative; width: 100%; height: 100%;">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width: 100%; height: 100%;" aria-label="14-day ticket creation vs resolution timeline chart">
        <defs>
          <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--secondary)" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="var(--secondary)" stop-opacity="0.0"/>
          </linearGradient>
        </defs>

        ${gridLines}
        ${xLabels}

        <!-- Created Area & Line (Champagne in Dark, Emerald in Light) -->
        <path d="${createdAreaD}" fill="url(#createdGrad)"/>
        <path d="${createdLineD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Resolved Area & Line (Emerald in Dark, Bronze in Light) -->
        <path d="${resolvedAreaD}" fill="url(#resolvedGrad)"/>
        <path d="${resolvedLineD}" fill="none" stroke="var(--secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Interactive Crosshair -->
        <line id="timeline-crosshair" x1="0" y1="${padTop}" x2="0" y2="${padTop + chartH}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2 2" opacity="0"/>
        <circle id="timeline-dot-created" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" opacity="0"/>
        <circle id="timeline-dot-resolved" r="4" fill="var(--secondary)" stroke="var(--surface)" stroke-width="2" opacity="0"/>
      </svg>
      <div id="timeline-tooltip" class="chart-tooltip" style="display: none;"></div>

      <!-- Accessible Hidden Table -->
      <table class="sr-only">
        <caption>14-Day Ticket Timeline</caption>
        <thead><tr><th>Date</th><th>Created</th><th>Resolved</th></tr></thead>
        <tbody>
          ${data.map(d => `<tr><td>${d.date}</td><td>${d.created}</td><td>${d.resolved}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Crosshair & Tooltip Interactions
  const svg = container.querySelector('svg');
  const crosshair = container.querySelector('#timeline-crosshair');
  const dotCreated = container.querySelector('#timeline-dot-created');
  const dotResolved = container.querySelector('#timeline-dot-resolved');
  const tooltip = container.querySelector('#timeline-tooltip');

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratioX = clientX / rect.width;
    const scaledX = ratioX * w;

    if (scaledX < padLeft || scaledX > w - padRight) {
      crosshair.setAttribute('opacity', '0');
      dotCreated.setAttribute('opacity', '0');
      dotResolved.setAttribute('opacity', '0');
      tooltip.style.display = 'none';
      return;
    }

    const idx = Math.min(
      data.length - 1,
      Math.max(0, Math.round((scaledX - padLeft) / stepX))
    );

    const ptCreated = createdCoords[idx];
    const ptResolved = resolvedCoords[idx];
    const item = data[idx];

    crosshair.setAttribute('x1', ptCreated.x);
    crosshair.setAttribute('x2', ptCreated.x);
    crosshair.setAttribute('opacity', '1');

    dotCreated.setAttribute('cx', ptCreated.x);
    dotCreated.setAttribute('cy', ptCreated.y);
    dotCreated.setAttribute('opacity', '1');

    dotResolved.setAttribute('cx', ptResolved.x);
    dotResolved.setAttribute('cy', ptResolved.y);
    dotResolved.setAttribute('opacity', '1');

    tooltip.style.display = 'block';
    tooltip.style.left = `${(ptCreated.x / w) * 100}%`;
    tooltip.style.top = `${(Math.min(ptCreated.y, ptResolved.y) / h) * 100}%`;
    tooltip.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(item.date)}</div>
      <div style="display: flex; gap: 8px; font-size: 0.6875rem;">
        <span style="color: var(--accent);">● Created: ${item.created}</span>
        <span style="color: var(--secondary);">● Resolved: ${item.resolved}</span>
      </div>
    `;
  });

  svg.addEventListener('mouseleave', () => {
    crosshair.setAttribute('opacity', '0');
    dotCreated.setAttribute('opacity', '0');
    dotResolved.setAttribute('opacity', '0');
    tooltip.style.display = 'none';
  });
}

/**
 * Render Priority Distribution Donut Chart with Interactive Legend
 */
export function renderPriorityDonutChart(container, byPriority) {
  if (!container) return;

  const urgent = byPriority?.urgent || 0;
  const high = byPriority?.high || 0;
  const medium = byPriority?.medium || 0;
  const low = byPriority?.low || 0;

  const total = urgent + high + medium + low || 1;

  const slices = [
    { key: 'urgent', label: 'Urgent', count: urgent, color: 'var(--priority-urgent)' },
    { key: 'high', label: 'High', count: high, color: 'var(--priority-high)' },
    { key: 'medium', label: 'Medium', count: medium, color: 'var(--priority-medium)' },
    { key: 'low', label: 'Low', count: low, color: 'var(--priority-low)' },
  ];

  const size = 180;
  const radius = 64;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const circleSlices = slices.map(s => {
    const percent = s.count / total;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativePercent * circumference;
    cumulativePercent += percent;

    return `
      <circle
        cx="${size / 2}"
        cy="${size / 2}"
        r="${radius}"
        fill="transparent"
        stroke="${s.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDasharray}"
        stroke-dashoffset="${strokeDashoffset}"
        class="donut-segment donut-segment-${s.key}"
        data-key="${s.key}"
        style="transition: stroke-width var(--transition-fast);"
      />
    `;
  }).join('');

  const legendHtml = slices.map(s => `
    <div class="legend-item donut-legend-item" data-key="${s.key}" style="cursor: pointer;">
      <span class="legend-color-dot" style="background-color: ${s.color};"></span>
      <span>${s.label}: <strong>${s.count}</strong></span>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <div style="position: relative; width: ${size}px; height: ${size}px;">
        <svg viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg); width: 100%; height: 100%;" aria-label="Priority distribution donut chart">
          <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="var(--surface-2)" stroke-width="${strokeWidth}" />
          ${circleSlices}
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
          <span style="font-family: var(--font-serif); font-size: 1.75rem; font-weight: 600; color: var(--text); line-height: 1;">${total}</span>
          <span style="font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Tickets</span>
        </div>
      </div>
      <div class="chart-legend" style="flex-wrap: wrap; justify-content: center; margin-top: 4px;">
        ${legendHtml}
      </div>

      <!-- Accessible Hidden Table -->
      <table class="sr-only">
        <caption>Priority Distribution</caption>
        <thead><tr><th>Priority</th><th>Count</th></tr></thead>
        <tbody>
          ${slices.map(s => `<tr><td>${s.label}</td><td>${s.count}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Donut hover interactions
  const segments = container.querySelectorAll('.donut-segment');
  const legendItems = container.querySelectorAll('.donut-legend-item');

  function highlight(key) {
    segments.forEach(seg => {
      if (seg.getAttribute('data-key') === key) {
        seg.style.strokeWidth = `${strokeWidth + 4}px`;
      } else {
        seg.style.opacity = '0.4';
      }
    });
  }

  function resetHighlight() {
    segments.forEach(seg => {
      seg.style.strokeWidth = `${strokeWidth}px`;
      seg.style.opacity = '1';
    });
  }

  segments.forEach(seg => {
    seg.addEventListener('mouseenter', () => highlight(seg.getAttribute('data-key')));
    seg.addEventListener('mouseleave', resetHighlight);
  });

  legendItems.forEach(item => {
    item.addEventListener('mouseenter', () => highlight(item.getAttribute('data-key')));
    item.addEventListener('mouseleave', resetHighlight);
  });
}
