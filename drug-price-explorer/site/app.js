/* Medicare Drug Price Explorer — vanilla JS, no dependencies.
   Data files are built by ../build_data.py from public CMS data. */
'use strict';

(async function main() {
  // ---------- tiny DOM helpers (textContent only; labels are untrusted data) ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function svg(tag, attrs = {}) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
    return n;
  }
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- load data ----------
  let PD, PB, NEG, META;
  try {
    [PD, PB, NEG, META] = await Promise.all(
      ['partd', 'partb', 'negotiated', 'meta'].map((n) =>
        fetch(`data/${n}.json`).then((r) => {
          if (!r.ok) throw new Error(`${n}.json: HTTP ${r.status}`);
          return r.json();
        })
      )
    );
  } catch (err) {
    $('#detail').replaceChildren(
      el('div', { class: 'empty' }, [
        'Could not load the data files (', String(err.message), '). ',
        'Serve this folder over HTTP (for example ./serve.sh) rather than opening index.html directly.',
      ])
    );
    return;
  }

  const F = Object.fromEntries(PD.fields.map((f, i) => [f, i]));
  const YEARS = PD.years.map(String);
  const LATEST = YEARS[YEARS.length - 1];
  const PREV = YEARS[YEARS.length - 2];
  const NEG_BY_KEY = Object.fromEntries(NEG.drugs.map((d) => [d.key, d]));
  const BY_ID = new Map();
  for (const d of PD.drugs) BY_ID.set(d.id, d);
  for (const d of PB.drugs) BY_ID.set(d.id, d);

  $('#yearRange').textContent = `${YEARS[0]}–${LATEST}`;
  if (META.generated) {
    const dt = new Date(META.generated);
    $('#generated').textContent = `Data files built ${dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}; CMS release covers ${YEARS[0]}–${LATEST}.`;
  }

  // ---------- value access + formatting ----------
  const val = (d, year, field) => { const b = d.y[String(year)]; return b ? b[F[field]] : null; };
  const latest = (d, field) => val(d, LATEST, field);
  const prev = (d, field) => val(d, PREV, field);
  const pctChange = (a, b) => (a == null || b == null || b === 0 ? null : a / b - 1);

  const trimZeros = (str) => str.replace(/\.0+(?=[A-Z]?$)/, '').replace(/(\.\d*?)0+(?=[A-Z]?$)/, '$1');
  const fmtMoney = (v) => {
    if (v == null || Number.isNaN(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return `${s}$${trimZeros((a / 1e9).toFixed(a >= 1e10 ? 1 : 2))}B`;
    if (a >= 1e6) return `${s}$${trimZeros((a / 1e6).toFixed(a >= 1e8 ? 0 : 1))}M`;
    if (a >= 1e4) return `${s}$${Math.round(a / 1e3)}K`;
    if (a >= 1e3) return `${s}$${trimZeros((a / 1e3).toFixed(1))}K`;
    return `${s}$${a.toFixed(0)}`;
  };
  const fmtPrice = (v) => {
    if (v == null || Number.isNaN(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a < 100) return `${s}$${a.toFixed(2)}`;
    return `${s}$${Math.round(a).toLocaleString('en-US')}`;
  };
  const fmtCount = (v) => {
    if (v == null || Number.isNaN(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
    if (a >= 1e4) return `${Math.round(v / 1e3)}K`;
    return Math.round(v).toLocaleString('en-US');
  };
  const fmtInt = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
  const fmtPct = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`);
  const fmtSigned = (v) => (v == null || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`);
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const METRICS = [
    { k: 'spend', label: 'Total spending', fmt: fmtMoney, tile: `Total spending, ${LATEST}` },
    { k: 'benes', label: 'Beneficiaries', fmt: fmtCount, tile: `Beneficiaries, ${LATEST}` },
    { k: 'claims', label: 'Claims', fmt: fmtCount, tile: `Claims, ${LATEST}` },
    { k: 'per_claim', label: 'Per claim', fmt: fmtPrice, tile: 'Spending per claim' },
    { k: 'per_bene', label: 'Per beneficiary', fmt: fmtPrice, tile: 'Spending per beneficiary' },
    { k: 'per_unit', label: 'Per dosage unit', fmt: fmtPrice, tile: 'Spending per dosage unit' },
  ];
  const METRIC = Object.fromEntries(METRICS.map((m) => [m.k, m]));
  const SORT_LABEL = {
    spend: `${LATEST} Medicare spending`, benes: `${LATEST} beneficiaries`, per_bene: 'spending per beneficiary',
    per_unit: 'spending per dosage unit', growth: `per-unit change ${PREV}–${LATEST}`, name: 'name',
  };

  // ---------- state + URL ----------
  const state = {
    view: 'explore', program: 'D', filter: 'all', q: '', sort: 'spend', selected: null,
    metric: 'spend', shown: 60, trendTable: false, rebate: {}, ovSort: { key: 'gross_spend', dir: -1 }, discTable: false,
    expandAll: localStorage.getItem('dpe.expandAll') === '1', primerOpen: localStorage.getItem('dpe.primer') !== '0',
  };
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    state.view = h.get('view') === 'overview' ? 'overview' : 'explore';
    const id = h.get('drug');
    if (id && BY_ID.has(id)) { state.selected = id; state.program = id.startsWith('b:') ? 'B' : 'D'; }
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (state.view !== 'explore') h.set('view', state.view);
    if (state.selected) h.set('drug', state.selected);
    const s = h.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname);
  }

  // ---------- tooltip ----------
  const tip = $('#tip');
  function showTip(ev, rows) {
    tip.replaceChildren(
      ...rows.map((r) =>
        el('div', { class: 'tip-row' }, [
          r.color ? el('span', { class: 'tip-key', style: `background:${r.color}` }) : null,
          el('strong', { text: r.value }),
          el('span', { class: 'tip-label', text: r.label }),
        ])
      )
    );
    tip.hidden = false;
    let x, y;
    if (ev.type === 'focus' || ev.clientX == null) {
      const b = ev.target.getBoundingClientRect();
      x = b.left + b.width / 2; y = b.top;
    } else { x = ev.clientX; y = ev.clientY; }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + tw > window.innerWidth - 8) left = x - tw - 14;
    if (top + th > window.innerHeight - 8) top = y - th - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- charts (inline SVG) ----------
  function niceScale(max, n = 4) {
    if (!(max > 0)) return { step: 1, max: 1 };
    const raw = max / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { step, max: Math.ceil(max / step - 1e-9) * step };
  }
  const roundedTop = (x, y, w, h, r) =>
    h <= 0 ? '' : `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  const roundedRight = (x, y, w, h, r) =>
    w <= 0 ? '' : `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;

  /** Single-series column chart: years on x. Labels the latest value and the maximum (selective). */
  function columnChart(container, { labels, values, flags = [], fmt, title }) {
    container.replaceChildren();
    const W = Math.max(320, container.clientWidth || 640), H = 250;
    const m = { t: 30, r: 16, b: 34, l: 62 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const present = values.filter((v) => v != null);
    const { step, max: ymax } = niceScale(Math.max(0, ...present));
    const y = (v) => m.t + ih - (v / ymax) * ih;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${title} by year` });
    for (let t = 0; t <= ymax + 1e-9; t += step) {
      const yy = y(t);
      s.append(svg('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: t === 0 ? 'axis' : 'grid' }));
      const tx = svg('text', { x: m.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' });
      tx.textContent = t === 0 ? '0' : fmt(t);
      s.append(tx);
    }
    const band = iw / labels.length, bw = Math.min(24, band * 0.5);
    const maxIdx = present.length ? values.indexOf(Math.max(...present)) : -1;
    labels.forEach((lab, i) => {
      const v = values[i], cx = m.l + band * i + band / 2;
      const xl = svg('text', { x: cx, y: H - m.b + 20, class: 'lab', 'text-anchor': 'middle' });
      xl.textContent = lab; s.append(xl);
      if (v == null) {
        const na = svg('text', { x: cx, y: y(0) - 6, class: 'tick', 'text-anchor': 'middle' });
        na.textContent = 'n/a'; s.append(na); return;
      }
      const top = y(v), h = y(0) - top, r = Math.min(4, h / 2);
      const bar = svg('path', { d: roundedTop(cx - bw / 2, top, bw, h, r), class: 'bar-fill' });
      s.append(bar);
      const isLabelled = i === labels.length - 1 || i === maxIdx;
      if (isLabelled) {
        const lbl = svg('text', { x: cx, y: top - 8, class: 'val', 'text-anchor': 'middle' });
        lbl.textContent = fmt(v) + (flags[i] ? ' ⚑' : ''); s.append(lbl);
      } else if (flags[i]) {
        const fl = svg('text', { x: cx, y: top - 8, class: 'flag', 'text-anchor': 'middle' });
        fl.textContent = '⚑'; s.append(fl);
      }
      const hit = svg('rect', { x: m.l + band * i, y: m.t - 10, width: band, height: ih + 10, class: 'hit', tabindex: '0', role: 'graphics-symbol', 'aria-label': `${lab}: ${fmt(v)}${flags[i] ? ' (CMS outlier flag)' : ''}` });
      const show = (ev) => { bar.classList.add('is-hover'); showTip(ev, [{ value: fmt(v), label: `${title}, ${lab}${flags[i] ? ' · CMS outlier flag' : ''}`, color: cssVar('--s1') }]); };
      const hide = () => { bar.classList.remove('is-hover'); hideTip(); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
      s.append(hit);
    });
    container.append(s);
  }

  /** Horizontal bars, one row per item; value label at the tip. rows: {label, value, color, tipRows} */
  function hbarChart(container, { rows, fmt, rowH = 30, labelWidth }) {
    container.replaceChildren();
    const W = Math.max(320, container.clientWidth || 640);
    const m = { t: 6, r: 72, b: 6, l: labelWidth || Math.min(230, Math.round(W * 0.34)) };
    const H = m.t + m.b + rows.length * rowH;
    const iw = W - m.l - m.r;
    const max = Math.max(...rows.map((r) => r.value || 0), 1e-9);
    const x = (v) => m.l + (v / max) * iw;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    s.append(svg('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, class: 'axis' }));
    const maxChars = Math.max(6, Math.floor((m.l - 14) / 6.6));
    rows.forEach((r, i) => {
      const cy = m.t + rowH * i + rowH / 2, bh = Math.min(18, rowH - 10);
      const lt = svg('text', { x: m.l - 10, y: cy + 4, class: 'lab', 'text-anchor': 'end' });
      lt.textContent = r.label.length > maxChars ? r.label.slice(0, maxChars - 1) + '…' : r.label;
      s.append(lt);
      const w = Math.max(0, x(r.value) - m.l), rr = Math.min(4, w / 2, bh / 2);
      const bar = svg('path', { d: roundedRight(m.l, cy - bh / 2, w, bh, rr), class: 'bar-fill' });
      if (r.color) bar.style.fill = r.color;
      s.append(bar);
      const vt = svg('text', { x: x(r.value) + 8, y: cy + 4, class: 'val' });
      vt.textContent = fmt(r.value); s.append(vt);
      const hit = svg('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit', tabindex: '0', role: 'graphics-symbol', 'aria-label': `${r.label}: ${fmt(r.value)}` });
      const show = (ev) => { bar.classList.add('is-hover'); showTip(ev, r.tipRows || [{ value: fmt(r.value), label: r.label, color: r.color }]); };
      const hide = () => { bar.classList.remove('is-hover'); hideTip(); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show); hit.addEventListener('blur', hide);
      s.append(hit);
    });
    container.append(s);
  }

  function legend(items) {
    return el('div', { class: 'legend' }, items.map((it) => el('span', {}, [el('span', { class: 'key', style: `background:${it.color}` }), it.label])));
  }
  function table(headers, rows, opts = {}) {
    const t = el('table', { class: 'datatable' });
    t.append(el('thead', {}, el('tr', {}, headers.map((h) => el('th', { class: h.num ? 'num' : null, text: h.label })))));
    t.append(el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el('td', { class: headers[i].num ? 'num' : null, text: c }))))));
    if (opts.caption) t.prepend(el('caption', { class: 'hint', text: opts.caption }));
    return t;
  }
  function tile(label, value, delta, cls) {
    return el('div', { class: `tile${cls ? ' ' + cls : ''}` }, [
      el('div', { class: 'label', text: label }),
      el('div', { class: 'value', text: value }),
      delta ? el('div', { class: 'delta', text: delta }) : null,
    ]);
  }

  // ---------- list ----------
  const pool = () => (state.program === 'D' ? PD.drugs : PB.drugs);
  const rank = (d, q) => ((d.b || '').toLowerCase().startsWith(q) ? 2 : (d.g || '').toLowerCase().startsWith(q) ? 1 : 0);
  function sortRows(rows) {
    const cmp = {
      spend: (a, b) => (latest(b, 'spend') || 0) - (latest(a, 'spend') || 0),
      benes: (a, b) => (latest(b, 'benes') || 0) - (latest(a, 'benes') || 0),
      per_bene: (a, b) => (latest(b, 'per_bene') || 0) - (latest(a, 'per_bene') || 0),
      per_unit: (a, b) => (latest(b, 'per_unit') || 0) - (latest(a, 'per_unit') || 0),
      growth: (a, b) => (b.chg ?? -Infinity) - (a.chg ?? -Infinity),
      name: (a, b) => (a.b || '').localeCompare(b.b || ''),
    }[state.sort];
    return rows.slice().sort(cmp);
  }
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let rows = pool();
    if (state.program === 'D' && state.filter !== 'all') {
      rows = rows.filter((d) => d.neg && String(NEG_BY_KEY[d.neg].cohort) === state.filter);
    }
    if (q) {
      rows = rows.filter((d) =>
        (d.b || '').toLowerCase().includes(q) || (d.g || '').toLowerCase().includes(q) ||
        (d.desc || '').toLowerCase().includes(q) || (d.hcpcs || '').toLowerCase() === q ||
        (d.neg && NEG_BY_KEY[d.neg].name.toLowerCase().includes(q))
      );
      return rows.slice().sort((a, b) => rank(b, q) - rank(a, q) || (latest(b, 'spend') || 0) - (latest(a, 'spend') || 0));
    }
    return sortRows(rows);
  }
  function listItem(d) {
    const neg = d.neg ? NEG_BY_KEY[d.neg] : null;
    const sortVal = state.sort === 'benes' ? fmtCount(latest(d, 'benes')) : state.sort === 'per_bene' ? fmtPrice(latest(d, 'per_bene'))
      : state.sort === 'per_unit' ? fmtPrice(latest(d, 'per_unit')) : state.sort === 'growth' ? fmtSigned(d.chg) : fmtMoney(latest(d, 'spend'));
    const sortSub = state.sort === 'benes' ? `${LATEST} beneficiaries` : state.sort === 'per_bene' ? 'per beneficiary' : state.sort === 'per_unit' ? 'per dosage unit'
      : state.sort === 'growth' ? `per unit, ${PREV}–${LATEST}` : `${LATEST} spending`;
    const li = el('li', { class: `item${d.id === state.selected ? ' is-selected' : ''}`, role: 'button', tabindex: '0', 'data-id': d.id }, [
      el('div', { class: 'item-name' }, [el('span', { text: d.b }), neg ? el('span', { class: `tag${neg.cohort === 2027 ? ' c2027' : ''}`, text: `Negotiated ${neg.cohort}` }) : null]),
      el('div', { class: 'item-sub', text: d.hcpcs ? `${d.hcpcs} · ${d.desc}` : d.g }),
      el('div', { class: 'item-val' }, [sortVal, el('small', { text: sortSub })]),
    ]);
    const go = () => select(d.id);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return li;
  }
  function renderList() {
    const rows = filtered();
    const list = $('#list');
    list.replaceChildren(...rows.slice(0, state.shown).map(listItem));
    const what = state.program === 'D' ? 'Part D brand' : 'Part B HCPCS';
    const q = state.q.trim();
    $('#listMeta').textContent = q
      ? `${rows.length.toLocaleString()} ${what} ${rows.length === 1 ? 'row matches' : 'rows match'} “${q}”`
      : `${rows.length.toLocaleString()} ${what} rows · sorted by ${SORT_LABEL[state.sort]}`;
    $('#more').hidden = rows.length <= state.shown;
    $('#more').textContent = `Show more (${Math.min(rows.length - state.shown, 100).toLocaleString()} of ${(rows.length - state.shown).toLocaleString()} remaining)`;
    if (!state.selected || !BY_ID.has(state.selected)) { if (rows[0]) select(rows[0].id, { keepList: true }); }
  }
  function select(id, { keepList = false } = {}) {
    state.selected = id;
    writeHash();
    $$('#list .item').forEach((li) => li.classList.toggle('is-selected', li.dataset.id === id));
    if (!keepList) { const li = $(`#list .item[data-id="${CSS.escape(id)}"]`); if (li) li.scrollIntoView({ block: 'nearest' }); }
    renderDetail();
  }

  // ---------- headline helpers ----------
  const PARTD_ENROLLEES = NEG.cohorts['2027']?.partd_enrollees_total || 53e6;
  const absPct = (v, d = 1) => `${Math.abs(v * 100).toFixed(d)}%`;
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const isPartD = (d) => d.id.startsWith('d:');
  function rankOf(d) { const rows = isPartD(d) ? PD.drugs : PB.drugs; return { rank: rows.indexOf(d) + 1, total: rows.length }; }
  function shareOf(d) {
    const t = META[isPartD(d) ? 'partd' : 'partb'].totals[LATEST]?.spend, v = latest(d, 'spend');
    return t && v != null ? v / t : null;
  }
  const fmtShare = (x) => (x == null ? '' : x >= 0.01 ? fmtPct(x, 1) : x >= 0.001 ? fmtPct(x, 2) : 'under 0.1%');
  const upDown = (g, from = PREV) => (g == null ? '' : `${g >= 0 ? 'Up' : 'Down'} ${absPct(g)} from ${from}.`);
  const hl = (label, value, why, cls) => el('div', { class: `hl${cls ? ' ' + cls : ''}` }, [
    el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value }), el('div', { class: 'why', text: why }),
  ]);

  function headline(d, neg) {
    const isD = isPartD(d);
    const spend = latest(d, 'spend'), benes = latest(d, 'benes'), perBene = latest(d, 'per_bene'), perUnit = latest(d, 'per_unit');
    const { rank, total } = rankOf(d), share = shareOf(d);
    const prog = isD ? 'Part D' : 'Part B';
    const tiles = [];
    tiles.push(hl(`Medicare spent, ${LATEST}`, fmtMoney(spend), [
      spend != null ? `${ordinal(rank)} of ${fmtInt(total)} ${prog} drugs${share != null ? `, ${fmtShare(share)} of all ${prog} drug spending` : ''}.` : 'No value published.',
      upDown(pctChange(spend, prev(d, 'spend'))),
      isD ? 'Gross, before rebates.' : 'Includes the patient’s 20% share.',
    ].filter(Boolean).join(' ')));
    let people;
    if (benes == null) people = 'No value published.';
    else if (isD) {
      const n = Math.round(PARTD_ENROLLEES / benes);
      people = n <= 2 ? `Most of the ~${fmtCount(PARTD_ENROLLEES)} people with Part D.` : n <= 2000 ? `About 1 in ${fmtInt(n)} of the ~${fmtCount(PARTD_ENROLLEES)} people with Part D.` : `A small group among the ~${fmtCount(PARTD_ENROLLEES)} with Part D.`;
    } else people = `Beneficiaries with at least one ${LATEST} claim.`;
    tiles.push(hl(isD ? 'People who filled it' : 'People treated', fmtCount(benes), `${people} ${upDown(pctChange(benes, prev(d, 'benes')))}`.trim()));
    tiles.push(hl('Cost per person, per year', fmtPrice(perBene), perBene != null
      ? `About ${fmtPrice(perBene / 12)} a month on average, all payers combined. ${upDown(pctChange(perBene, prev(d, 'per_bene')))}`.trim()
      : 'No value published.'));
    if (neg) {
      const cohort = NEG.cohorts[neg.cohort], ratio = neg.mfp_30day / neg.list_30day;
      tiles.push(hl(`Negotiated price, from ${neg.cohort}`, `${fmtPct(1 - ratio)} off list`, `${fmtPrice(neg.list_30day)} → ${fmtPrice(neg.mfp_30day)} for a 30-day supply, effective ${fmtDate(cohort.effective)}.`, 'accent'));
    } else {
      tiles.push(hl(`Price per dose unit vs ${PREV}`, fmtSigned(d.chg), [
        perUnit != null ? `${fmtPrice(perUnit)} per unit in ${LATEST}${d.cagr != null ? `, ${fmtSigned(d.cagr)} a year on average since ${YEARS[0]}` : ''}.` : '',
        isD ? 'Not among the 25 drugs with negotiated prices for 2026 or 2027.' : 'Part B drugs join negotiation from 2028.',
      ].filter(Boolean).join(' ')));
    }
    return el('div', { class: 'hl-grid' }, tiles);
  }

  function story(d, neg) {
    const isD = isPartD(d);
    const out = [];
    const spend = latest(d, 'spend');
    const gS = pctChange(spend, prev(d, 'spend')), gB = pctChange(latest(d, 'benes'), prev(d, 'benes')), gU = pctChange(latest(d, 'per_unit'), prev(d, 'per_unit'));
    if (gS != null && gB != null && gU != null) {
      let why;
      if (Math.abs(gU) < 0.02 && Math.abs(gB) >= 0.05) why = `the price per dose unit was flat (${fmtSigned(gU)}) while the number of people using it ${gB > 0 ? 'grew' : 'shrank'} ${absPct(gB)}, so this is a story about use, not price`;
      else if (Math.abs(gB) < 0.02 && Math.abs(gU) >= 0.05) why = `use was flat while the price per dose unit ${gU > 0 ? 'rose' : 'fell'} ${absPct(gU)}, so this is a story about price, not use`;
      else if (gB * gU > 0) why = `${gB > 0 ? 'more' : 'fewer'} people (${fmtSigned(gB)}) and a ${gU > 0 ? 'higher' : 'lower'} price per dose unit (${fmtSigned(gU)}) both pushed spending ${gS >= 0 ? 'up' : 'down'}`;
      else why = `${gB > 0 ? 'more' : 'fewer'} people used it (${fmtSigned(gB)}) while the price per dose unit ${gU > 0 ? 'rose' : 'fell'} (${fmtSigned(gU)}), pulling in opposite directions`;
      out.push(`Spending ${gS >= 0 ? 'rose' : 'fell'} ${absPct(gS)} in ${LATEST}: ${why}.`);
    } else if (spend != null && prev(d, 'spend') == null) {
      out.push(`${LATEST} is the first year with published spending for this row.`);
    }
    if (isD && d.nm > 1) out.push(`Sold under this brand name by ${d.nm} manufacturers in ${LATEST}.`);
    if (latest(d, 'outlier') === 1) out.push(`CMS flags the ${LATEST} per-unit figure as an outlier, so treat unit-price comparisons with care.`);
    if (neg) {
      const cohort = NEG.cohorts[neg.cohort], ratio = neg.mfp_30day / neg.list_30day;
      const agg = neg.partd_agg[LATEST] || { spend: 0 };
      const n = NEG.drugs.filter((x) => x.cohort === neg.cohort).length;
      const inEffect = new Date(cohort.effective + 'T00:00:00') <= new Date();
      const multi = neg.partd_ids.length > 1;
      out.push(`${neg.name} is one of ${n} drugs whose negotiated Medicare price ${inEffect ? 'took' : 'takes'} effect on ${fmtDate(cohort.effective)}: ${fmtPrice(neg.list_30day)} list → ${fmtPrice(neg.mfp_30day)} for a 30-day supply, ${fmtPct(1 - ratio)} lower.`);
      out.push(`Applied to ${LATEST} use, that ratio would cut gross spending${multi ? ` on all ${neg.partd_ids.length} ${neg.name} rows` : ''} from ${fmtMoney(agg.spend)} to about ${fmtMoney(agg.spend * ratio)}. The real saving is smaller, because Medicare already gets rebates on this drug; CMS estimates the whole ${cohort.label.toLowerCase()} saves about ${fmtPct(cohort.est_net_savings_pct)} of net spending. Open “Negotiated price and savings model” to try your own rebate assumption.`);
    } else if (!isD) {
      out.push(`Part B pays 106% of the manufacturer’s average sales price, so the per-unit figure moves with the manufacturer’s own price cuts or increases.`);
    }
    return el('div', { class: 'card story' }, out.map((t) => el('p', { text: t })));
  }

  /** A collapsible section. `build(body)` runs the first time it opens (charts need a real width). */
  const openSections = new Set();
  function section(key, title, hint, build) {
    const open = state.expandAll || openSections.has(key);
    const det = el('details', { class: 'card sect', open: open ? '' : null });
    det.append(el('summary', {}, [el('span', { class: 'sect-title', text: title }), hint ? el('span', { class: 'hint', text: hint }) : null]));
    const body = el('div', { class: 'sect-body' });
    det.append(body);
    let built = false;
    const ensure = () => { if (!built) { built = true; build(body); } };
    det.addEventListener('toggle', () => { if (det.open) { openSections.add(key); ensure(); } else openSections.delete(key); });
    if (open) requestAnimationFrame(ensure);
    return det;
  }
  function primer() {
    const det = el('details', { class: 'card primer', open: state.primerOpen ? '' : null });
    det.addEventListener('toggle', () => { state.primerOpen = det.open; localStorage.setItem('dpe.primer', det.open ? '1' : '0'); });
    det.append(el('summary', {}, [el('span', { class: 'sect-title', text: 'How to read this page' })]));
    det.append(el('ul', {}, [
      el('li', {}, [el('strong', { text: 'Spending is gross. ' }), 'It is what Medicare, the plan and the patient paid at the pharmacy, before the confidential rebates manufacturers pay back. Medicare’s real cost is lower, often much lower.']),
      el('li', {}, [el('strong', { text: 'List price is the sticker price. ' }), 'The wholesale acquisition cost for a 30-day supply. Almost nobody pays it, but rebates and the negotiated cut are both measured against it.']),
      el('li', {}, [el('strong', { text: 'Negotiated price is a ceiling. ' }), 'The “maximum fair price” Medicare plans pay from January 2026 for the first 10 drugs and January 2027 for the next 15.']),
      el('li', {}, [el('strong', { text: 'Percent off list overstates the saving. ' }), 'Rebates already filled part of the gap between list and what Medicare pays; the negotiated price cuts from there. That is why a 62% average cut becomes a 22% real saving in CMS’s own estimate.']),
      el('li', {}, [el('strong', { text: 'A dose unit ' }), 'is one tablet, capsule, millilitre or similar, as CMS counts it. A claim is one fill, often 30 or 90 days.']),
    ]));
    return det;
  }

  // ---------- detail ----------
  function renderDetail() {
    const box = $('#detail');
    box.replaceChildren();
    const d = BY_ID.get(state.selected);
    if (!d) { box.append(el('div', { class: 'empty', text: 'Pick a drug from the list to see its numbers.' })); return; }
    const isD = isPartD(d);
    const neg = d.neg ? NEG_BY_KEY[d.neg] : null;

    box.append(primer());

    // Header
    const tags = [el('span', { class: 'tag neutral', text: isD ? 'Medicare Part D' : 'Medicare Part B' })];
    if (neg) tags.push(el('span', { class: `tag${neg.cohort === 2027 ? ' c2027' : ''}`, text: `Negotiated price from Jan 1, ${neg.cohort}` }));
    const subParts = isD ? [d.g, d.nm === 1 && d.m[0] ? d.m[0].n : null] : [`HCPCS ${d.hcpcs}`, d.desc, d.g && d.g !== d.b ? d.g : null];
    const expandBtn = el('button', { class: 'linkbtn', text: state.expandAll ? 'Collapse details' : 'Expand all details', onclick: () => { state.expandAll = !state.expandAll; localStorage.setItem('dpe.expandAll', state.expandAll ? '1' : '0'); if (!state.expandAll) openSections.clear(); renderDetail(); } });
    box.append(el('div', { class: 'card d-head' }, [
      el('div', { class: 'card-head' }, [el('div', { class: 'd-title' }, [el('h2', { text: d.b }), ...tags]), expandBtn]),
      el('div', { class: 'd-sub' }, subParts.filter(Boolean).flatMap((p, i) => (i ? [el('span', { class: 'sep', text: '·' }), p] : [p]))),
      headline(d, neg),
    ]));

    // Plain-English summary
    box.append(story(d, neg));

    // Sections
    box.append(section('trend', `Five-year trend, ${YEARS[0]}–${LATEST}`, 'spending, people, claims and unit price by year', (body) => buildTrend(body, d)));
    if (neg) box.append(section('neg', 'Negotiated price and savings model', 'list vs negotiated price, and what it changes for Medicare', (body) => buildNegotiation(body, d, neg)));
    box.append(section('more', `All ${LATEST} figures`, isD ? 'every published metric, with manufacturers' : 'every published metric, with the ASP payment basis', (body) => buildMore(body, d)));
  }

  function buildTrend(body, d) {
    body.replaceChildren();
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Metric' });
    for (const mtr of METRICS) {
      seg.append(el('button', { class: `seg-btn${state.metric === mtr.k ? ' is-active' : ''}`, 'aria-pressed': String(state.metric === mtr.k), text: mtr.label, onclick: () => { state.metric = mtr.k; buildTrend(body, d); } }));
    }
    const tableBtn = el('button', { class: 'linkbtn', 'aria-pressed': String(state.trendTable), text: state.trendTable ? 'Hide table' : 'Show table', onclick: () => { state.trendTable = !state.trendTable; buildTrend(body, d); } });
    body.append(el('div', { class: 'controls' }, [seg, tableBtn]));
    const mtr = METRIC[state.metric];
    const values = YEARS.map((y) => val(d, y, mtr.k));
    const flags = YEARS.map((y) => (mtr.k === 'per_unit' ? val(d, y, 'outlier') === 1 : false));
    const chartDiv = el('div', { class: 'chart' });
    body.append(chartDiv);
    body.append(el('p', { class: 'hint', text: {
      spend: 'Gross drug cost by year. Rising bars with a flat unit price mean growth came from more people or more fills.',
      benes: 'People with at least one fill in the year.',
      claims: 'Fills. A 90-day fill counts once, so claims understate months of therapy.',
      per_claim: 'Average cost of one fill. Moves with both unit price and days per fill.',
      per_bene: 'Average annual cost per person who used the drug.',
      per_unit: 'Closest thing to a unit price. ⚑ marks a year CMS considers an outlier.',
    }[mtr.k] }));
    if (state.trendTable) {
      body.append(el('div', { class: 'tablewrap' }, table(
        [{ label: 'Year' }, ...METRICS.map((m2) => ({ label: m2.label, num: true }))],
        YEARS.map((y) => [y, ...METRICS.map((m2) => m2.fmt(val(d, y, m2.k)))])
      )));
    }
    requestAnimationFrame(() => columnChart(chartDiv, { labels: YEARS, values, flags, fmt: mtr.fmt, title: mtr.label }));
  }

  function buildMore(body, d) {
    const isD = isPartD(d);
    body.append(el('div', { class: 'tablewrap' }, table(
      [{ label: 'Metric' }, { label: LATEST, num: true }, { label: PREV, num: true }, { label: 'Change', num: true }, { label: 'What it means' }],
      METRICS.map((m) => [m.label, m.fmt(latest(d, m.k)), m.fmt(prev(d, m.k)), fmtSigned(pctChange(latest(d, m.k), prev(d, m.k))), {
        spend: isD ? 'Gross drug cost: Medicare + plan + patient, before rebates' : 'Medicare payment plus the patient’s share',
        benes: 'People with at least one claim', claims: 'Fills (a 90-day fill counts once)',
        per_claim: 'Total spending ÷ claims', per_bene: 'Total spending ÷ people', per_unit: isD ? 'Weighted average per tablet, capsule, mL or similar' : 'Average per HCPCS billing unit',
      }[m.k]])
    )));
    if (isD && d.m.length > 1) {
      const total = latest(d, 'spend') || 0;
      body.append(el('div', {}, [el('h4', { text: `Manufacturers, ${LATEST} spending` }), el('div', { class: 'tablewrap' }, table(
        [{ label: 'Manufacturer' }, { label: `${LATEST} spending`, num: true }, { label: 'Share', num: true }],
        d.m.map((m2) => [m2.n, fmtMoney(m2.s), total ? fmtPct((m2.s || 0) / total) : '—'])
      ))]));
    }
    if (!isD) {
      body.append(el('dl', { class: 'kv' }, [
        el('dt', { text: 'Payment basis' }), el('dd', { text: 'Medicare pays 106% of the manufacturer’s average sales price (ASP) for most separately paid Part B drugs; the beneficiary owes 20% coinsurance.' }),
        el('dt', { text: `Average ${LATEST} ASP-based price per unit` }), el('dd', { text: d.asp != null ? fmtPrice(d.asp) : 'not published' }),
        el('dt', { text: `Average spending per unit, ${LATEST}` }), el('dd', { text: fmtPrice(latest(d, 'per_unit')) }),
        el('dt', { text: 'Negotiation status' }), el('dd', { text: 'Part B drugs become eligible for negotiated prices starting with the 2028 price year; none apply yet.' }),
      ]));
    }
  }

  function impliedRebate(cohort) {
    const c = NEG.cohorts[String(cohort)];
    if (!c || !c.est_net_savings || !c.est_net_savings_pct) return null;
    const netBefore = c.est_net_savings / c.est_net_savings_pct;
    return 1 - netBefore / c.gross_spend_total;
  }

  function buildNegotiation(body, d, neg) {
    body.replaceChildren();
    const cohort = NEG.cohorts[String(neg.cohort)];
    const ratio = neg.mfp_30day / neg.list_30day;
    const agg = neg.partd_agg[LATEST] || { spend: 0, claims: 0, benes: 0 };
    const gross = agg.spend;
    const implied = impliedRebate(neg.cohort);
    if (state.rebate[neg.key] == null) state.rebate[neg.key] = 0;
    const r = state.rebate[neg.key];
    const netBefore = gross * (1 - r);
    const atMfp = gross * ratio;
    const savings = netBefore - atMfp;
    const perBeneGross = agg.benes ? gross / agg.benes : null;
    const multiBrand = neg.partd_ids.length > 1;
    const nDrugs = NEG.drugs.filter((x) => x.cohort === neg.cohort).length;

    body.append(el('p', { class: 'hint' }, [
      `${neg.name} was selected in the ${cohort.label.toLowerCase()} (${neg.company}). Prices are per 30-day supply: the ${cohort.list_price_year} wholesale acquisition cost versus the maximum fair price CMS published on ${fmtDate(cohort.announced)}. `,
      el('a', { href: cohort.source_url, rel: 'noopener', text: 'CMS fact sheet' }), '.',
    ]));

    // Price comparison
    const grid = el('div', { class: 'neg-grid' });
    const left = el('div', {});
    left.append(legend([{ color: cssVar('--shade-lo'), label: `List price (WAC), ${cohort.list_price_year}` }, { color: cssVar('--shade-hi'), label: `Negotiated price (MFP), ${neg.cohort}` }]));
    const priceChart = el('div', { class: 'chart' });
    left.append(priceChart);
    grid.append(left);
    grid.append(el('div', { class: 'tiles' }, [
      tile('A year of therapy at list price', fmtPrice(neg.list_30day * 12), '12 × 30-day supply'),
      tile('A year at the negotiated price', fmtPrice(neg.mfp_30day * 12), '12 × 30-day supply'),
      tile(`Medicare gross spending per person, ${LATEST}`, fmtPrice(perBeneGross), multiBrand ? `all ${neg.partd_ids.length} ${neg.name} rows combined` : 'lower than a full year at list because not everyone takes it all year'),
    ]));
    body.append(grid);
    requestAnimationFrame(() => hbarChart(priceChart, {
      fmt: fmtPrice, rowH: 34, labelWidth: 150,
      rows: [
        { label: `List, ${cohort.list_price_year}`, value: neg.list_30day, color: cssVar('--shade-lo'), tipRows: [{ value: fmtPrice(neg.list_30day), label: `list price per 30-day supply, ${cohort.list_price_year}`, color: cssVar('--shade-lo') }] },
        { label: `Negotiated, ${neg.cohort}`, value: neg.mfp_30day, color: cssVar('--shade-hi'), tipRows: [{ value: fmtPrice(neg.mfp_30day), label: `negotiated price per 30-day supply, effective ${neg.cohort}`, color: cssVar('--shade-hi') }, { value: fmtPct(1 - ratio), label: 'below list' }] },
      ],
    }));

    // Savings model
    body.append(el('h4', { text: `What it would change for Medicare, applied to ${LATEST} spending` }));
    body.append(el('p', { class: 'hint', text: 'Slide to the rebate you think Medicare already gets. At 0% the saving is an upper bound; the chip applies the average CMS’s own estimate implies for this cycle.' }));
    const slider = el('input', { type: 'range', min: '0', max: '80', step: '1', value: String(Math.round(r * 100)), 'aria-label': 'Assumed pre-negotiation rebate, percent' });
    const out = el('output', { text: fmtPct(r) });
    slider.addEventListener('input', () => { out.textContent = `${slider.value}%`; });
    slider.addEventListener('change', () => { state.rebate[neg.key] = Number(slider.value) / 100; buildNegotiation(body, d, neg); });
    const chips = el('div', { class: 'chips' }, [
      el('button', { class: `chip${r === 0 ? ' is-active' : ''}`, text: 'No rebates (gross terms)', onclick: () => { state.rebate[neg.key] = 0; buildNegotiation(body, d, neg); } }),
      implied != null ? el('button', { class: `chip${Math.abs(r - Math.round(implied * 100) / 100) < 0.005 ? ' is-active' : ''}`, text: `CMS-implied average for this cycle (${fmtPct(implied)})`, onclick: () => { state.rebate[neg.key] = Math.round(implied * 100) / 100; buildNegotiation(body, d, neg); } }) : null,
    ]);
    body.append(el('div', { class: 'slider-row' }, [el('span', { class: 'hint', text: 'Assumed rebate Medicare already gets' }), slider, out, chips]));
    body.append(el('div', { class: 'tiles' }, [
      tile(`1. Gross spending, ${LATEST}`, fmtMoney(gross), multiBrand ? `${neg.partd_ids.length} brand rows combined` : 'before rebates'),
      tile(`2. Net of a ${fmtPct(r)} rebate`, fmtMoney(netBefore), r === 0 ? 'same as gross' : 'roughly what Medicare and plans pay today'),
      tile('3. At the negotiated price', fmtMoney(atMfp), `gross × ${fmtPct(ratio)} (negotiated ÷ list)`),
      tile(savings >= 0 ? '4. Estimated saving' : '4. Estimated shortfall', fmtMoney(Math.abs(savings)), netBefore ? `${fmtPct(Math.abs(savings) / netBefore)} of step 2` : '', savings >= 0 ? 'accent' : null),
    ]));
    if (savings < 0) {
      body.append(el('div', { class: 'warn', text: `At a ${fmtPct(r)} rebate the price Medicare already pays would be below the negotiated price, so this simple model shows no saving. Rebates vary a lot across the cycle: high for drugs with in-class competition, low for many cancer drugs.` }));
    }
    body.append(el('p', { class: 'note' }, [
      el('strong', { text: 'How this is computed. ' }),
      `Gross spending is scaled by the negotiated-to-list ratio (${fmtPct(ratio)}) to estimate what the same use would cost at the negotiated price. The rebate slider removes an assumed share of gross spending to approximate today’s net cost. `,
      implied != null ? `CMS’s estimate for this cycle (${fmtMoney(cohort.est_net_savings)} saved, ${fmtPct(cohort.est_net_savings_pct)} of net spending in ${cohort.spend_year}) implies rebates averaging about ${fmtPct(implied)} across its ${nDrugs} drugs.` : '',
    ]));

    // CMS figures
    body.append(el('div', {}, [el('h4', { text: 'CMS’s published figures' }), el('dl', { class: 'kv' }, [
      el('dt', { text: `Part D gross spending, ${cohort.spend_year}` }), el('dd', { text: fmtMoney(neg.gross_spend) }),
      el('dt', { text: `Part D enrollees who used it, ${cohort.spend_year}` }), el('dd', { text: fmtCount(neg.enrollees) }),
      el('dt', { text: `Whole cycle: gross spending, ${cohort.spend_year}` }), el('dd', { text: `${fmtMoney(cohort.gross_spend_total)} across ${nDrugs} drugs, about ${fmtPct(cohort.share_of_partd_gross)} of Part D` }),
      el('dt', { text: 'Whole cycle: estimated net saving' }), el('dd', { text: `${fmtMoney(cohort.est_net_savings)} (${fmtPct(cohort.est_net_savings_pct)}) had the prices applied in ${cohort.spend_year}` }),
      el('dt', { text: `Whole cycle: patient out-of-pocket saving, ${cohort.projected_oop_savings_year}` }), el('dd', { text: `${fmtMoney(cohort.projected_oop_savings)} projected` }),
    ])]));
    if (neg.ndc_examples?.length) {
      body.append(el('div', {}, [
        el('h4', { text: 'Example negotiated prices per package' }),
        el('div', { class: 'tablewrap' }, table([{ label: 'NDC' }, { label: 'Package' }, { label: 'MFP per package', num: true }], neg.ndc_examples.map((n) => [n.ndc, n.package, fmtPrice(n.mfp)]))),
      ]));
    }
    if (multiBrand) {
      body.append(el('div', {}, [el('h4', { text: `Brand rows covered by this negotiated price (${LATEST} spending)` }), el('div', { class: 'chips' }, neg.partd_ids.map((id) => {
        const row = BY_ID.get(id);
        return el('button', { class: `chip${id === d.id ? ' is-active' : ''}`, text: `${row.b} · ${fmtMoney(latest(row, 'spend'))}`, onclick: () => { state.program = 'D'; syncProgramButtons(); renderList(); select(id); } });
      }))]));
    }
  }

  // ---------- overview ----------
  function renderOverview() {
    const box = $('#cohorts');
    box.replaceChildren();
    const totalLatest = META.partd.totals[LATEST]?.spend || 0;
    for (const [c, info] of Object.entries(NEG.cohorts)) {
      const drugs = NEG.drugs.filter((d) => String(d.cohort) === c);
      const wsum = drugs.reduce((a, d) => a + d.gross_spend, 0);
      const wavg = 1 - drugs.reduce((a, d) => a + d.gross_spend * (d.mfp_30day / d.list_30day), 0) / wsum;
      const latestSpend = drugs.reduce((a, d) => a + (d.partd_agg[LATEST]?.spend || 0), 0);
      const implied = impliedRebate(c);
      const inEffect = new Date(info.effective + 'T00:00:00') <= new Date();
      const discounts = drugs.map((d) => 1 - d.mfp_30day / d.list_30day);
      box.append(el('div', { class: 'card stack' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: `${c}: ${info.label}` }),
          el('span', { class: `tag${c === '2027' ? ' c2027' : ''}`, text: `${drugs.length} drugs · ${inEffect ? 'in effect since' : 'from'} ${fmtDate(info.effective)}` }),
        ]),
        el('div', { class: 'hl-grid two' }, [
          hl(`Medicare spent on them, ${info.spend_year}`, fmtMoney(info.gross_spend_total), `About ${fmtPct(info.share_of_partd_gross)} of all Part D gross spending that year, before rebates.`),
          hl('Average cut from list price', fmtPct(wavg), `Weighted by spending. Individual cuts range from ${fmtPct(Math.min(...discounts))} to ${fmtPct(Math.max(...discounts))}.`),
          hl('What CMS says it really saves', fmtMoney(info.est_net_savings), `${fmtPct(info.est_net_savings_pct)} of net spending had the prices applied in ${info.spend_year}. Smaller than the list-price cut because rebates averaging about ${fmtPct(implied)} already existed.`, 'accent'),
          hl(`Patients save, ${info.projected_oop_savings_year}`, fmtMoney(info.projected_oop_savings), 'CMS projection of lower out-of-pocket costs under the standard benefit.'),
        ]),
        el('p', { class: 'story-p', text: `${fmtCount(info.enrollees_used)} of the ~${fmtCount(info.partd_enrollees_total)} people with Part D used at least one of these drugs in ${info.spend_year} and paid ${fmtMoney(info.oop_on_selected)} out of pocket. In this dataset the same drugs were ${fmtPct(totalLatest ? latestSpend / totalLatest : null)} of ${LATEST} Part D gross spending (${fmtMoney(latestSpend)} of ${fmtMoney(totalLatest)}).` }),
        el('p', { class: 'note', text: info.est_net_savings_note }),
        el('p', { class: 'sources' }, [el('a', { href: info.source_url, rel: 'noopener', text: info.source_title })]),
      ]));
    }

    // Discount chart
    const s1 = cssVar('--s1'), s2 = cssVar('--s2');
    $('#discLegend').replaceChildren(legend([{ color: s1, label: '2026, first cycle' }, { color: s2, label: '2027, second cycle' }]));
    const sorted = NEG.drugs.slice().sort((a, b) => b.discount - a.discount);
    const disc = $('#discChart');
    requestAnimationFrame(() => hbarChart(disc, {
      fmt: (v) => fmtPct(v), rowH: 26,
      rows: sorted.map((d) => ({
        label: d.name, value: 1 - d.mfp_30day / d.list_30day, color: d.cohort === 2027 ? s2 : s1,
        tipRows: [
          { value: fmtPct(1 - d.mfp_30day / d.list_30day), label: `${d.name}, below list`, color: d.cohort === 2027 ? s2 : s1 },
          { value: fmtPrice(d.list_30day), label: `list price per 30 days, ${NEG.cohorts[d.cohort].list_price_year}` },
          { value: fmtPrice(d.mfp_30day), label: `negotiated price per 30 days, ${d.cohort}` },
        ],
      })),
    }));
    const dt = $('#discTable');
    dt.hidden = !state.discTable;
    $('#discTableBtn').textContent = state.discTable ? 'Hide table' : 'Show table';
    $('#discTableBtn').setAttribute('aria-pressed', String(state.discTable));
    dt.replaceChildren(table(
      [{ label: 'Drug' }, { label: 'Cycle' }, { label: 'List / 30 days', num: true }, { label: 'Negotiated / 30 days', num: true }, { label: 'Below list', num: true }],
      sorted.map((d) => [d.name, String(d.cohort), fmtPrice(d.list_30day), fmtPrice(d.mfp_30day), fmtPct(1 - d.mfp_30day / d.list_30day)])
    ));
    renderNegTable();
  }

  const NEG_COLS = [
    { key: 'name', label: 'Drug', get: (d) => d.name },
    { key: 'cohort', label: 'Cycle', get: (d) => d.cohort, fmt: String },
    { key: 'company', label: 'Company', get: (d) => d.company },
    { key: 'conditions', label: 'Commonly treated', get: (d) => d.conditions.join('; '), sortable: false },
    { key: 'list_30day', label: 'List / 30 days', num: true, get: (d) => d.list_30day, fmt: fmtPrice },
    { key: 'mfp_30day', label: 'Negotiated / 30 days', num: true, get: (d) => d.mfp_30day, fmt: fmtPrice },
    { key: 'discount', label: 'Below list', num: true, get: (d) => 1 - d.mfp_30day / d.list_30day, fmt: (v) => fmtPct(v) },
    { key: 'gross_spend', label: 'Part D gross spending (CMS year)', num: true, get: (d) => d.gross_spend, fmt: fmtMoney },
    { key: 'enrollees', label: 'Enrollees (CMS year)', num: true, get: (d) => d.enrollees, fmt: fmtCount },
    { key: 'latest', label: `${LATEST} gross spending (this dataset)`, num: true, get: (d) => d.partd_agg[LATEST]?.spend ?? null, fmt: fmtMoney },
  ];
  function renderNegTable() {
    const t = $('#negTable');
    t.replaceChildren();
    const { key, dir } = state.ovSort;
    const col = NEG_COLS.find((c) => c.key === key);
    const rows = NEG.drugs.slice().sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      if (typeof va === 'string') return dir * va.localeCompare(vb);
      return dir * ((va ?? -Infinity) - (vb ?? -Infinity));
    });
    t.append(el('thead', {}, el('tr', {}, NEG_COLS.map((c) => el('th', {
      class: `${c.num ? 'num' : ''}${c.key === key ? ' sorted' : ''}${c.key === key && dir === 1 ? ' asc' : ''}`,
      text: c.label, scope: 'col',
      onclick: c.sortable === false ? null : () => { state.ovSort = c.key === key ? { key, dir: -dir } : { key: c.key, dir: c.num ? -1 : 1 }; renderNegTable(); },
    })))));
    t.append(el('tbody', {}, rows.map((d) => {
      const tr = el('tr', { class: 'clickable', tabindex: '0' }, NEG_COLS.map((c) => el('td', { class: c.num ? 'num' : null, text: (c.fmt || String)(c.get(d)) })));
      const open = () => {
        const top = d.partd_ids.map((id) => BY_ID.get(id)).sort((a, b) => (latest(b, 'spend') || 0) - (latest(a, 'spend') || 0))[0];
        if (!top) return;
        state.program = 'D'; state.filter = 'all'; state.q = ''; $('#q').value = '';
        syncProgramButtons(); syncFilterButtons();
        setView('explore'); renderList(); select(top.id);
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      return tr;
    })));
  }

  // ---------- views + controls ----------
  function setView(v) {
    state.view = v;
    $$('.tab').forEach((t) => { const on = t.dataset.view === v; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
    $('#view-explore').hidden = v !== 'explore';
    $('#view-overview').hidden = v !== 'overview';
    writeHash();
    if (v === 'overview') renderOverview();
    else requestAnimationFrame(renderDetail); // re-measure chart widths after unhide
  }
  function syncProgramButtons() {
    $$('[data-program]').forEach((b) => { const on = b.dataset.program === state.program; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    $$('#negFilter .seg-btn').forEach((b) => { b.disabled = state.program === 'B' && b.dataset.filter !== 'all'; });
  }
  function syncFilterButtons() {
    $$('[data-filter]').forEach((b) => { const on = b.dataset.filter === state.filter; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
  }

  $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $$('[data-program]').forEach((b) => b.addEventListener('click', () => {
    state.program = b.dataset.program; state.shown = 60;
    if (state.program === 'B') { state.filter = 'all'; syncFilterButtons(); }
    const cur = BY_ID.get(state.selected);
    if (!cur || (state.program === 'B') !== cur.id.startsWith('b:')) state.selected = null;
    syncProgramButtons(); renderList();
  }));
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter; state.shown = 60; syncFilterButtons();
    const cur = BY_ID.get(state.selected);
    if (state.filter !== 'all' && !(cur && cur.neg && String(NEG_BY_KEY[cur.neg].cohort) === state.filter)) state.selected = null;
    renderList();
  }));
  let qTimer;
  $('#q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; state.shown = 60; renderList(); }, 120); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.shown = 60; renderList(); });
  $('#more').addEventListener('click', () => { state.shown += 100; renderList(); });
  $('#discTableBtn').addEventListener('click', () => { state.discTable = !state.discTable; renderOverview(); });
  let rTimer;
  window.addEventListener('resize', () => { clearTimeout(rTimer); rTimer = setTimeout(() => { if (state.view === 'overview') renderOverview(); else renderDetail(); }, 150); });
  window.addEventListener('hashchange', () => { readHash(); syncProgramButtons(); setView(state.view); renderList(); if (state.selected) select(state.selected); });

  // ---------- boot ----------
  readHash();
  syncProgramButtons();
  syncFilterButtons();
  renderList();
  if (state.selected) select(state.selected);
  setView(state.view);
})();
