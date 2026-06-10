/* Дрібні UI-хелпери: створення елементів, тости, спарклайни, форматування */
window.App = window.App || {};

App.ui = (function () {

  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (let i = 2; i < arguments.length; i++) appendKid(el, arguments[i]);
    return el;
  }

  function appendKid(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { appendKid(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }

  function toast(msg, type) {
    const box = document.getElementById('toasts');
    const t = h('div', { class: 'toast' + (type === 'info' ? ' info' : '') }, msg);
    box.append(t);
    setTimeout(function () {
      t.style.transition = 'opacity 0.4s';
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 450);
    }, 2600);
  }

  /* мс -> "12.34 с" або "1:05.3" */
  function fmtMs(ms) {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(2) + ' с';
    const m = Math.floor(s / 60);
    return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0');
  }

  function fmtClock(totalSec) {
    totalSec = Math.max(0, Math.round(totalSec));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function fmtDate(dstr) {
    if (!dstr) return '';
    const p = dstr.split('-');
    return p[2] + '.' + p[1];
  }

  function sparkline(values, opts) {
    opts = opts || {};
    const w = opts.w || 220, hh = opts.h || 48, pad = 4;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', hh);
    svg.setAttribute('class', 'sparkline');
    if (!values || values.length < 2) {
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', 4); txt.setAttribute('y', hh / 2 + 4);
      txt.setAttribute('fill', '#b3a5d6'); txt.setAttribute('font-size', '11');
      txt.textContent = values && values.length === 1 ? 'Поки 1 результат: ' + values[0] : 'Ще немає даних';
      svg.append(txt);
      return svg;
    }
    let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (opts.goal !== undefined && opts.goal !== null) {
      min = Math.min(min, opts.goal); max = Math.max(max, opts.goal);
    }
    if (min === max) { min -= 1; max += 1; }
    const x = function (i) { return pad + i / (values.length - 1) * (w - pad * 2); };
    const y = function (v) { return hh - pad - (v - min) / (max - min) * (hh - pad * 2); };
    if (opts.goal !== undefined && opts.goal !== null) {
      const gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gl.setAttribute('x1', pad); gl.setAttribute('x2', w - pad);
      gl.setAttribute('y1', y(opts.goal)); gl.setAttribute('y2', y(opts.goal));
      gl.setAttribute('stroke', '#ffd24a'); gl.setAttribute('stroke-dasharray', '4 4'); gl.setAttribute('stroke-width', '1.5');
      svg.append(gl);
    }
    const pts = values.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', pts);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', opts.color || '#8bc34a');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    svg.append(line);
    const last = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    last.setAttribute('cx', x(values.length - 1)); last.setAttribute('cy', y(values[values.length - 1]));
    last.setAttribute('r', '3.5'); last.setAttribute('fill', opts.color || '#8bc34a');
    svg.append(last);
    return svg;
  }

  function progressBar(pct, thin) {
    const fill = h('div');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    return h('div', { class: 'progress' + (thin ? ' thin' : '') }, fill);
  }

  function statCard(value, label) {
    return h('div', { class: 'stat-card' },
      h('div', { class: 'val' }, value),
      h('div', { class: 'lbl' }, label));
  }

  /* Перемикач вкладок: tabs = [{id, label}], onSwitch(id) */
  function tabBar(tabs, activeId, onSwitch) {
    const bar = h('div', { class: 'tabs' });
    tabs.forEach(function (t) {
      bar.append(h('button', {
        class: 'tab' + (t.id === activeId ? ' active' : ''),
        onclick: function () { onSwitch(t.id); },
      }, t.label));
    });
    return bar;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function rndInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  /* короткий звуковий сигнал через WebAudio (без файлів) */
  let audioCtx = null;
  function beep(freq, durMs, vol) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq || 440;
      osc.type = 'sine';
      gain.gain.value = vol || 0.08;
      osc.connect(gain); gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(vol || 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (durMs || 150) / 1000);
      osc.start(now);
      osc.stop(now + (durMs || 150) / 1000 + 0.02);
    } catch (e) { /* звук не критичний */ }
  }

  return {
    h: h,
    toast: toast,
    fmtMs: fmtMs,
    fmtClock: fmtClock,
    fmtDate: fmtDate,
    sparkline: sparkline,
    progressBar: progressBar,
    statCard: statCard,
    tabBar: tabBar,
    shuffle: shuffle,
    rnd: rnd,
    rndInt: rndInt,
    beep: beep,
  };
})();
