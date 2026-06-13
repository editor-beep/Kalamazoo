// DOM layer: cards, HUD, modals, toasts, the poem between worlds.

import { ERAS, STRATA, LINEAGES, SKIN_TONES } from './data.js';

const cache = {};
const el = id => (cache[id] ??= document.getElementById(id));
const show = id => el(id).classList.remove('hidden');
const hide = id => el(id).classList.add('hidden');

// tiny abstract skylines for the era cards
const SKYLINES = {
  founding: 'M0 30 V27 H8 L11 23 L14 27 H28 L34 14 L40 27 H52 V25 H58 V27 H68 L74 18 L80 27 H88 V26 H94 V27 H100 V30 Z',
  boiling: 'M0 30 V24 H8 L12 18 L16 24 H24 V30 H30 V16 H36 V30 H46 L52 12 L58 30 H70 L76 20 L82 30 H100 V30 Z',
  celery:  'M0 30 V22 H8 V10 H11 V22 H20 V14 H30 V22 H38 V6 H41 V22 H52 V18 H64 V22 H74 V12 H77 V22 H88 V20 H100 V30 Z',
  mall:    'M0 30 V20 H14 V14 H30 V20 H34 V8 H38 V20 H56 V16 H72 V20 H78 V12 H92 V20 H100 V30 Z',
  seventies:'M0 30 V20 H10 V12 H18 V20 H28 V9 H32 V20 H48 V14 H58 V20 H72 V10 H76 V20 H90 V18 H100 V30 Z',
  paper:   'M0 30 V20 H10 V8 H13 V20 L20 14 L27 20 L34 14 L41 20 H52 V12 H55 V20 H70 V18 H84 V20 H100 V30 Z',
  nineties:'M0 30 V19 H8 V15 H20 V19 H32 V11 H38 V19 H50 V13 H62 V19 H74 V9 H82 V19 H94 V16 H100 V30 Z',
  living:  'M0 30 V18 H12 V12 H26 V18 H34 Q42 26 50 18 Q58 26 66 18 H76 V10 H88 V18 H100 V30 Z',
  returns: 'M0 30 L8 22 L14 30 H22 L30 14 L38 30 H48 V20 Q54 12 60 20 V30 H70 L78 18 L86 30 H100 V30 Z',
};

export function renderEraCards(onEnter) {
  const grid = el('era-grid');
  grid.innerHTML = '';
  ERAS.forEach(era => {
    const card = document.createElement('div');
    card.className = 'era-card';
    card.style.setProperty('--card-accent', era.accent);
    card.style.setProperty('--card-accent-text', era.accentText);
    card.style.setProperty('--card-grad', era.grad);
    card.innerHTML = `
      <div class="swatch">
        <svg class="skyline" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${SKYLINES[era.key]}" fill="currentColor"/></svg>
      </div>
      <div class="key-hint">${era.id + 1}</div>
      <div class="era-card-body">
        <div class="year" style="color:${era.accentText}">${era.year}</div>
        <div class="name">${era.name}</div>
        <div class="blurb">${era.blurb}</div>
        <div class="meta">
          <div class="chips" style="color:${era.accentText}">${era.tagline}</div>
          <div class="go" style="color:${era.accentText}">Enter →</div>
        </div>
      </div>`;
    card.addEventListener('click', () => onEnter(era.id));
    grid.appendChild(card);
  });
}

export function showSelection() { el('selection-screen').style.display = 'flex'; requestAnimationFrame(() => { el('selection-screen').style.opacity = '1'; }); }
export function hideSelection() { el('selection-screen').style.opacity = '0'; setTimeout(() => { el('selection-screen').style.display = 'none'; }, 460); }

// ----------------------------------------------------------------- HUD

export function showHUD(era) {
  show('hud');
  el('hud-era-name').textContent = era.name;
  el('hud-era-year').textContent = era.year;
  el('hud-pulse').textContent = era.pulse;
  el('resident-count').textContent = `${era.people.length} residents`;
}
export function hideHUD() { hide('hud'); }
export function setHUDTime(str) {
  const t = el('hud-time');
  if (t.textContent !== str) t.textContent = str;   // called every frame; write only on change
}
export function getPulse() { return parseInt(el('hud-pulse').textContent) || 50; }
export function setPulse(v) { el('hud-pulse').textContent = Math.max(8, Math.min(99, Math.round(v))); }
export function setFlowActive(on) { el('btn-flow').classList.toggle('active', on); el('btn-flow').textContent = on ? '❚❚ Time is flowing' : '▸ Let time flow'; }

// ----------------------------------------------------------------- residents

let residentRows = [];
export function renderResidents(world, onPick) {
  const list = el('residents');
  list.innerHTML = '';
  residentRows = [];
  const agents = [...world.agents].sort((a, b) => b.person.roots - a.person.roots);
  agents.forEach(agent => {
    const p = agent.person;
    const row = document.createElement('div');
    row.className = 'person-row';
    const mark = p.thread ? `<span class="thread-mark" title="${LINEAGES[p.thread].label}">${LINEAGES[p.thread].mark}</span> ` : '';
    row.innerHTML = `
      <div class="person-dot" style="background:${p.look.body}"></div>
      <div class="person-info">
        <div class="person-name">${mark}${p.name}</div>
        <div class="person-doing">${agent.doing}</div>
      </div>
      <div class="person-roots">${p.roots}</div>`;
    row.addEventListener('click', () => onPick(agent));
    list.appendChild(row);
    residentRows.push({ row, agent });
  });
}
export function refreshResidentDoings() {
  residentRows.forEach(({ row, agent }) => {
    const d = row.querySelector('.person-doing');
    if (d && d.textContent !== agent.doing) d.textContent = agent.doing;
  });
}

// ----------------------------------------------------------------- person modal

let speech = { timer: null, lineIdx: 0, agent: null };

function portraitCSS(look) {
  const skin = SKIN_TONES[look.skin ?? 0];
  return `linear-gradient(160deg, ${skin} 0%, ${skin} 38%, ${look.body} 42%, ${look.body} 100%)`;
}

export function showPersonModal(agent, era) {
  const p = agent.person;
  speech = { timer: null, lineIdx: 0, agent };
  el('modal-name').textContent = p.name;
  el('modal-role').textContent = `${p.role} • ${era.name}, ${era.year}`;
  el('modal-portrait').style.background = portraitCSS(p.look);
  el('modal-now').textContent = agent.doing[0].toUpperCase() + agent.doing.slice(1) + '.';
  el('modal-mood').textContent = p.mood;
  el('modal-roots').textContent = p.roots;
  el('modal-memory').textContent = p.memory;
  const threadEl = el('modal-thread');
  if (p.thread) {
    threadEl.textContent = `${LINEAGES[p.thread].mark} ${LINEAGES[p.thread].label}`;
    threadEl.classList.remove('hidden');
  } else threadEl.classList.add('hidden');
  hide('modal-speech');
  el('speech-text').innerHTML = '';
  el('modal-ask').textContent = 'Ask about their Kalamazoo';
  el('modal-ask').disabled = false;
  el('modal-ask').style.opacity = '';
  show('person-modal');
}

export function hidePersonModal() {
  if (speech.timer) { clearInterval(speech.timer); speech.timer = null; }
  hide('person-modal');
}
export function personModalOpen() { return !el('person-modal').classList.contains('hidden'); }

export function askPerson(onSpoke) {
  const agent = speech.agent;
  if (!agent) return;
  const lines = agent.person.lines;
  if (speech.timer) { clearInterval(speech.timer); speech.timer = null; }

  if (speech.lineIdx >= lines.length) {
    el('speech-text').innerHTML = `<i>${agent.person.name.split(' ')[0]} smiles and looks at the street. The river keeps the rest.</i>`;
    el('speech-attrib').textContent = '';
    el('modal-ask').disabled = true;
    el('modal-ask').style.opacity = '0.45';
    return;
  }

  const line = lines[speech.lineIdx++];
  show('modal-speech');
  el('speech-attrib').textContent = `— ${agent.person.name}`;
  const target = el('speech-text');
  target.innerHTML = '<span class="caret">▍</span>';
  let i = 0;
  speech.timer = setInterval(() => {
    i += 2;
    if (i >= line.length) {
      target.textContent = line;
      clearInterval(speech.timer);
      speech.timer = null;
      if (speech.lineIdx >= lines.length) el('modal-ask').textContent = 'One more moment';
      else el('modal-ask').textContent = 'Ask more';
    } else {
      target.innerHTML = `${line.slice(0, i)}<span class="caret">▍</span>`;
    }
  }, 14);
  if (onSpoke) onSpoke();
}

// ----------------------------------------------------------------- story panel

export function showStory(key, era) {
  const s = STRATA[key];
  if (!s) return;
  const body = s.body[era.key];
  if (!body) return; // landmark has no story in this era

  // this era's story only — the deeper layers wait behind the toggle
  el('story-kicker').textContent = `${s.kicker} • ${era.year}`;
  el('story-title').textContent = s.title;
  el('story-body').textContent = body;

  const strata = el('story-strata');
  strata.innerHTML = '';
  let otherLayers = 0;
  ERAS.forEach(e => {
    const layer = s.layers?.[e.key];
    if (!layer) return;
    if (e.key !== era.key) otherLayers++;
    const div = document.createElement('div');
    div.className = 'stratum' + (e.key === era.key ? ' now' : '');
    div.innerHTML = `<span class="y">${e.year}</span><span class="t">${layer}</span>`;
    strata.appendChild(div);
  });

  const btn = el('story-layers-btn');
  strata.classList.add('hidden');
  btn.classList.toggle('hidden', otherLayers === 0);
  btn.classList.remove('open');
  btn.textContent = `⌄  What stood here in other years (${otherLayers})`;
  btn.onclick = () => {
    const opened = strata.classList.toggle('hidden') === false;
    btn.classList.toggle('open', opened);
    btn.textContent = opened
      ? '⌃  Back to this era'
      : `⌄  What stood here in other years (${otherLayers})`;
  };

  show('story-panel');
}
export function hideStory() { hide('story-panel'); }

// ----------------------------------------------------------------- river voice

let riverTimer = null;
export function riverVoice(line) {
  const rv = el('river-voice');
  el('river-voice-text').textContent = `“${line}”`;
  rv.classList.remove('hidden', 'fade');
  if (riverTimer) clearTimeout(riverTimer);
  riverTimer = setTimeout(() => {
    rv.classList.add('fade');
    riverTimer = setTimeout(() => rv.classList.add('hidden'), 1300);
  }, 4600);
}

// ----------------------------------------------------------------- toasts

const TOAST_ICONS = { bright: '✦', ache: '·', wonder: '✧', info: '○', echo: '◌' };
export function toast(text, kind = 'info', ms = 4200) {
  const box = el('toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="ti">${TOAST_ICONS[kind] || '○'}</span><span>${text}</span>`;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    t.classList.add('gone');
    setTimeout(() => t.remove(), 450);
  }, ms);
}

// ----------------------------------------------------------------- era overlay

let overlayBusy = false;
export function showEpigraph(era, { onCovered, onDone, holdMs = 3400 } = {}) {
  if (overlayBusy) return;
  overlayBusy = true;
  const ov = el('era-overlay');
  el('overlay-year').textContent = era.year;
  el('overlay-name').textContent = era.name;
  el('overlay-poem').textContent = era.epigraph.lines;
  el('overlay-attrib').textContent = era.epigraph.attrib || '';
  // restart the line animations
  ov.querySelectorAll('.overlay-inner > *').forEach(n => {
    n.style.animation = 'none';
    void n.offsetWidth;
    n.style.animation = '';
  });
  ov.classList.remove('hidden');
  ov.classList.add('showing');
  ov.style.opacity = '0';
  requestAnimationFrame(() => { ov.style.opacity = '1'; });
  setTimeout(() => { onCovered && onCovered(); }, 1150);
  setTimeout(() => {
    ov.style.opacity = '0';
    setTimeout(() => {
      ov.classList.add('hidden');
      ov.classList.remove('showing');
      overlayBusy = false;
      onDone && onDone();
    }, 1150);
  }, 1150 + holdMs);
}

// ----------------------------------------------------------------- compare

export function showCompareChooser(currentEra, onPick) {
  el('compare-current').textContent = `${currentEra.name} (${currentEra.year})`;
  const grid = el('compare-grid');
  grid.innerHTML = '';
  ERAS.forEach(era => {
    const opt = document.createElement('div');
    opt.className = 'compare-opt' + (era.id === currentEra.id ? ' off' : '');
    opt.style.setProperty('--co-accent', era.accentText);
    opt.innerHTML = `<div class="y">${era.year}</div><div class="n">${era.name}</div>`;
    if (era.id !== currentEra.id) opt.addEventListener('click', () => { hide('compare-chooser'); onPick(era.id); });
    grid.appendChild(opt);
  });
  show('compare-chooser');
}
export function hideCompareChooser() { hide('compare-chooser'); }

export function showCompareHUD(eraL, eraR, onSplit) {
  el('compare-label-left').innerHTML = `${eraL.name}<span class="y">${eraL.year}</span>`;
  el('compare-label-right').innerHTML = `${eraR.name}<span class="y">${eraR.year}</span>`;
  show('compare-hud');
  const divider = el('compare-divider');
  divider.style.left = '50%';
  let dragging = false;
  divider.onpointerdown = e => { dragging = true; divider.setPointerCapture(e.pointerId); };
  divider.onpointermove = e => {
    if (!dragging) return;
    const f = Math.max(0.15, Math.min(0.85, e.clientX / window.innerWidth));
    divider.style.left = `${f * 100}%`;
    onSplit(f);
  };
  divider.onpointerup = () => { dragging = false; };
}
export function hideCompareHUD() { hide('compare-hud'); }

// ----------------------------------------------------------------- nametag

export function nametag(x, y, name, doing) {
  const n = el('nametag');
  n.innerHTML = `${name} <span class="nt-doing">· ${doing}</span>`;
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  n.classList.remove('hidden');
}
export function hideNametag() { hide('nametag'); }

// ----------------------------------------------------------------- static wiring

export function initUI(h) {
  el('btn-exit').addEventListener('click', h.exitEra);
  el('btn-advance').addEventListener('click', h.advanceTime);
  el('btn-event').addEventListener('click', h.cityEvent);
  el('btn-compare').addEventListener('click', h.openCompare);
  el('btn-reset').addEventListener('click', h.resetCamera);
  el('btn-flow').addEventListener('click', h.toggleFlow);
  el('btn-compare-exit').addEventListener('click', h.exitCompare);
  el('compare-cancel').addEventListener('click', hideCompareChooser);
  document.querySelectorAll('[data-tod]').forEach(b =>
    b.addEventListener('click', () => h.setTimeOfDay(parseFloat(b.dataset.tod))));

  el('modal-close').addEventListener('click', hidePersonModal);
  el('modal-dismiss').addEventListener('click', hidePersonModal);
  el('modal-ask').addEventListener('click', () => askPerson(h.onSpoke));
  el('person-modal').addEventListener('click', e => { if (e.target === el('person-modal')) hidePersonModal(); });

  el('story-close').addEventListener('click', hideStory);

  el('btn-help').addEventListener('click', () => show('help-overlay'));
  el('help-close').addEventListener('click', () => hide('help-overlay'));
  el('help-overlay').addEventListener('click', e => { if (e.target === el('help-overlay')) hide('help-overlay'); });

  el('btn-about').addEventListener('click', () => show('about-overlay'));
  el('about-close').addEventListener('click', () => hide('about-overlay'));
  el('about-overlay').addEventListener('click', e => { if (e.target === el('about-overlay')) hide('about-overlay'); });
}

export function anyOverlayOpen() {
  return ['person-modal', 'help-overlay', 'about-overlay', 'compare-chooser']
    .some(id => !el(id).classList.contains('hidden'));
}
export function closeTopOverlay() {
  for (const id of ['person-modal', 'help-overlay', 'about-overlay', 'compare-chooser']) {
    if (!el(id).classList.contains('hidden')) {
      if (id === 'person-modal') hidePersonModal(); else hide(id);
      return true;
    }
  }
  if (!el('story-panel').classList.contains('hidden')) { hideStory(); return true; }
  return false;
}
