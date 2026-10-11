'use strict';

/* =====================================================================
   Schiri – Spielleitung
   Reine Browser-App ohne Abhängigkeiten. Daten liegen im localStorage.
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const KEY = 'schiri.v1';

const REASONS = [
  'Foulspiel', 'Grobes Foulspiel', 'Unsportlichkeit', 'Meckern', 'Zeitspiel',
  'Handspiel', 'Torchance verhindert', 'Notbremse', 'Abstand nicht eingehalten',
  'Tätlichkeit', 'Beleidigung', 'Sonstiges'
];
const CARD_LABEL = { yellow: 'Gelbe Karte', yellowred: 'Gelb-Rote Karte', red: 'Rote Karte' };

/* ---------------------------------------------------------------------
   Zustand
   --------------------------------------------------------------------- */
function newMatch() {
  return {
    period: 0,
    running: false,
    startedAt: 0,        // Zeitstempel, ab dem die Uhr läuft
    base: 0,             // bereits gelaufene ms im aktuellen Abschnitt
    kicked: -1,          // für welchen Abschnitt der Anpfiff protokolliert ist
    finished: false,
    stoppage: [0, 0, 0, 0],
    events: [],
    pens: { h: [], a: [] },
    date: Date.now()
  };
}
function fresh() {
  return {
    settings: {
      home: 'Heim', away: 'Gast', competition: '', referee: '',
      halfMin: 45, extra: false, maxSubs: 5,
      whistle: 'fox', volume: 0.8, vibrate: true, wake: true
    },
    match: newMatch()
  };
}
function load() {
  const d = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return { settings: { ...d.settings, ...o.settings }, match: { ...d.match, ...o.match } };
    }
  } catch (e) { /* ignorieren */ }
  return d;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignorieren */ }
}

let S = load();
const M = () => S.match;
const ui = { cardTeam: 0, cardType: 'yellow', reason: '', subTeam: 0 };

const teamName = t => (t === 0 ? S.settings.home : S.settings.away) || (t === 0 ? 'Heim' : 'Gast');
const score = () => {
  const s = [0, 0];
  M().events.forEach(e => { if (e.type === 'goal') s[e.team] += e.delta; });
  return [Math.max(0, s[0]), Math.max(0, s[1])];
};
const subsCount = t => M().events.filter(e => e.type === 'sub' && e.team === t).length;

/* ---------------------------------------------------------------------
   Spielabschnitte und Uhr
   --------------------------------------------------------------------- */
function periods() {
  const h = Math.max(1, Number(S.settings.halfMin) || 45);
  const p = [
    { name: '1. Halbzeit', start: 0, len: h },
    { name: '2. Halbzeit', start: h, len: h }
  ];
  if (S.settings.extra) {
    p.push({ name: 'Verlängerung 1', start: 2 * h, len: 15 });
    p.push({ name: 'Verlängerung 2', start: 2 * h + 15, len: 15 });
  }
  return p;
}
const curPeriod = () => periods()[Math.min(M().period, periods().length - 1)];
const elapsed = () => M().base + (M().running ? Date.now() - M().startedAt : 0);

function minuteLabel() {
  const p = curPeriod();
  const tot = Math.floor(elapsed() / 60000) + 1;
  if (M().kicked < 0 && elapsed() === 0) return "0'";
  if (tot > p.len) return `${p.start + p.len}+${tot - p.len}'`;
  return `${p.start + tot}'`;
}

function addEvent(ev) {
  M().events.push({ t: Date.now(), min: minuteLabel(), period: M().period, ...ev });
  save();
  renderAll();
}

function pauseClock() {
  const m = M();
  if (m.running) {
    m.base += Date.now() - m.startedAt;
    m.running = false;
    releaseWake();
  }
}

/* ---------------------------------------------------------------------
   Alarme (Ende der regulären Zeit / Ende der Nachspielzeit)
   --------------------------------------------------------------------- */
let alarmReg = false, alarmStop = false;
function syncAlarms() {
  const p = curPeriod(), el = elapsed(), stop = M().stoppage[M().period] || 0;
  alarmReg = el >= p.len * 60000;
  alarmStop = el >= (p.len + stop) * 60000;
}
function checkAlarms() {
  if (!M().running) return;
  const p = curPeriod(), el = elapsed(), stop = M().stoppage[M().period] || 0;
  if (!alarmReg && el >= p.len * 60000) {
    alarmReg = true;
    if (stop === 0) {
      alarmStop = true;
      notify('Reguläre Spielzeit erreicht. Nachspielzeit festlegen.');
    } else {
      notify(`Reguläre Spielzeit erreicht. ${stop} Min. Nachspielzeit.`);
    }
  } else if (!alarmStop && stop > 0 && el >= (p.len + stop) * 60000) {
    alarmStop = true;
    notify('Nachspielzeit abgelaufen.');
  }
}
function notify(text) {
  toast(text, 4500);
  beep(2);
  vibrate([300, 120, 300, 120, 300]);
}

/* ---------------------------------------------------------------------
   Aktionen
   --------------------------------------------------------------------- */
const actions = {
  toggleClock() {
    const m = M();
    if (m.finished) return toast('Das Spiel ist beendet.');
    if (!m.running) {
      m.running = true;
      m.startedAt = Date.now();
      if (m.kicked < m.period) {
        m.kicked = m.period;
        addEvent({ type: 'info', text: `Anpfiff ${curPeriod().name}` });
      }
      syncAlarms();
      requestWake();
    } else {
      pauseClock();
    }
    save(); renderAll();
  },

  endPeriod() {
    const m = M();
    if (m.finished) return;
    const ps = periods();
    const last = m.period >= ps.length - 1;
    const name = ps[m.period].name;
    if (!confirm(last ? 'Spiel beenden?' : `${name} beenden?`)) return;
    pauseClock();
    addEvent({ type: 'info', text: last ? 'Spielende' : `Ende ${name}` });
    if (last) { m.finished = true; }
    else { m.period += 1; m.base = 0; }
    syncAlarms(); save(); renderAll();
  },

  finishMatch() {
    const m = M();
    if (!confirm('Spiel jetzt beenden?')) return;
    pauseClock();
    addEvent({ type: 'info', text: 'Spielende' });
    m.finished = true;
    save(); renderAll();
  },

  adjust(b) {
    const m = M();
    const v = Number(b.dataset.v);
    if (m.finished) return;
    const wasRunning = m.running;
    if (wasRunning) { m.base += Date.now() - m.startedAt; m.startedAt = Date.now(); }
    m.base = Math.max(0, m.base + v * 60000);
    syncAlarms(); save(); renderClock();
  },

  stop(b) {
    const m = M();
    const v = Number(b.dataset.v);
    m.stoppage[m.period] = Math.min(20, Math.max(0, (m.stoppage[m.period] || 0) + v));
    syncAlarms(); save(); renderClock();
  },

  goal(b) {
    const t = Number(b.dataset.team), v = Number(b.dataset.v);
    if (v < 0 && score()[t] === 0) return;
    addEvent({ type: 'goal', team: t, delta: v });
    if (v > 0) { vibrate(80); toast(`Tor ${teamName(t)}`, 1500); }
  },

  giveCard() {
    const num = $('#cardNum').value.trim();
    if (!num) return toast('Bitte Spielernummer eingeben.');
    const t = ui.cardTeam;
    let type = ui.cardType;
    const st = cardStatus()[`${t}-${num}`];
    if (st && st.out) {
      if (!confirm(`#${num} (${teamName(t)}) wurde schon des Feldes verwiesen. Trotzdem eintragen?`)) return;
    } else if (type === 'yellow' && st && st.y >= 1) {
      type = 'yellowred';
      toast(`#${num} hat schon Gelb: Gelb-Rot.`, 3000);
    }
    addEvent({ type: 'card', team: t, num, card: type, reason: ui.reason });
    flashCard(type, `${CARD_LABEL[type]} · ${teamName(t)} #${num}`);
    vibrate([200, 80, 200]);
    $('#cardNum').value = '';
    ui.reason = '';
    renderCards();
  },

  doSub() {
    const t = ui.subTeam;
    const out = $('#subOut').value.trim(), inn = $('#subIn').value.trim();
    if (!out || !inn) return toast('Bitte beide Nummern eingeben.');
    const max = Number(S.settings.maxSubs);
    if (max > 0 && subsCount(t) >= max) {
      if (!confirm(`${teamName(t)} hat schon ${max} Wechsel. Trotzdem eintragen?`)) return;
    }
    addEvent({ type: 'sub', team: t, out, in: inn });
    toast(`Wechsel ${teamName(t)}: #${out} raus, #${inn} rein`, 2500);
    $('#subOut').value = ''; $('#subIn').value = '';
  },

  undoLast() {
    const evs = M().events;
    for (let i = evs.length - 1; i >= 0; i--) {
      if (['goal', 'card', 'sub', 'note'].includes(evs[i].type)) {
        if (!confirm(`Löschen: ${describe(evs[i]).title}?`)) return;
        evs.splice(i, 1);
        save(); renderAll();
        return;
      }
    }
    toast('Kein Eintrag zum Löschen.');
  },

  addNote() {
    const text = prompt('Notiz fürs Protokoll');
    if (text && text.trim()) addEvent({ type: 'note', text: text.trim() });
  },

  copyLog() {
    copyText(buildReport()).then(ok => toast(ok ? 'Protokoll kopiert.' : 'Kopieren nicht möglich.'));
  },

  shareLog() {
    const text = buildReport();
    if (navigator.share) {
      navigator.share({ title: 'Spielbericht', text }).catch(() => {});
    } else {
      copyText(text).then(ok => toast(ok ? 'Teilen nicht verfügbar. Protokoll kopiert.' : 'Teilen nicht möglich.'));
    }
  },

  newMatch() {
    if (!confirm('Neues Spiel starten? Das aktuelle Protokoll wird gelöscht.')) return;
    S.match = newMatch();
    releaseWake(); syncAlarms(); save(); renderAll();
    showTab('spiel');
  },

  coin() {
    const coin = $('#coin'), face = $('#coinFace'), txt = $('#coinText');
    const heads = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
    coin.classList.remove('flip'); void coin.offsetWidth; coin.classList.add('flip');
    face.textContent = '…'; txt.classList.remove('result'); txt.textContent = 'Die Münze fliegt.';
    clink();
    setTimeout(() => {
      face.textContent = heads ? 'Kopf' : 'Zahl';
      txt.classList.add('result'); txt.textContent = heads ? 'Kopf' : 'Zahl';
      clink();
    }, 950);
  },

  penGoal() { penKick(true); },
  penMiss() { penKick(false); },
  penUndo() {
    const p = M().pens;
    const side = p.h.length > p.a.length ? p.h : p.a.length > 0 ? p.a : p.h;
    if (side.length) side.pop();
    save(); renderPens();
  },
  penSave() {
    const p = M().pens, h = p.h.filter(Boolean).length, a = p.a.filter(Boolean).length;
    if (!p.h.length && !p.a.length) return toast('Noch keine Elfmeter eingetragen.');
    addEvent({ type: 'info', text: `Elfmeterschießen: ${teamName(0)} ${h} : ${a} ${teamName(1)}` });
    toast('Ins Protokoll übernommen.');
  },

  testWhistle() { playSound('long'); }
};

function penKick(hit) {
  const p = M().pens;
  const side = p.h.length <= p.a.length ? p.h : p.a;
  side.push(hit);
  save(); renderPens();
  if (hit) vibrate(60);
}

function cardStatus() {
  const map = {};
  M().events.filter(e => e.type === 'card').forEach(e => {
    const k = `${e.team}-${e.num}`;
    const o = map[k] || (map[k] = { team: e.team, num: e.num, y: 0, out: false });
    if (e.card === 'yellow') o.y += 1; else o.out = true;
  });
  return map;
}

/* ---------------------------------------------------------------------
   Beschreibung und Bericht
   --------------------------------------------------------------------- */
function describe(e) {
  switch (e.type) {
    case 'goal':
      return { title: e.delta > 0 ? `Tor ${teamName(e.team)}` : `Tor aberkannt (${teamName(e.team)})`, icon: 'goal' };
    case 'card':
      return { title: `${CARD_LABEL[e.card]} · ${teamName(e.team)} #${e.num}`, sub: e.reason, icon: e.card };
    case 'sub':
      return { title: `Wechsel ${teamName(e.team)}`, sub: `#${e.out} raus, #${e.in} rein`, icon: 'sub' };
    case 'note':
      return { title: e.text, icon: 'info' };
    default:
      return { title: e.text, icon: 'info' };
  }
}

function buildReport() {
  const s = score(), m = M(), st = S.settings;
  const lines = ['SPIELBERICHT'];
  if (st.competition) lines.push(st.competition);
  lines.push(`${teamName(0)} ${s[0]} : ${s[1]} ${teamName(1)}`);
  lines.push(new Date(m.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }));
  if (st.referee) lines.push(`Schiedsrichter: ${st.referee}`);
  lines.push('');
  m.events.forEach(e => {
    const d = describe(e);
    lines.push(`${e.min.padEnd(6)} ${d.title}${d.sub ? ' (' + d.sub + ')' : ''}`);
  });
  return lines.join('\n');
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  return new Promise(res => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignorieren */ }
    ta.remove(); res(ok);
  });
}

/* ---------------------------------------------------------------------
   Rendern
   --------------------------------------------------------------------- */
function renderClock() {
  const m = M(), ps = periods(), p = curPeriod();
  const el = elapsed();
  const tot = p.start * 60000 + el;
  const mm = Math.floor(tot / 60000), ss = Math.floor(tot / 1000) % 60;
  $('#clock').textContent = `${pad(mm)}:${pad(ss)}`;

  const over = el > p.len * 60000;
  $('#clockMain').classList.toggle('over', over);
  const pill = $('#overPill');
  pill.hidden = !over;
  if (over) {
    const o = el - p.len * 60000;
    pill.textContent = `+${pad(Math.floor(o / 60000))}:${pad(Math.floor(o / 1000) % 60)}`;
  }

  const stop = m.stoppage[m.period] || 0;
  const end = p.start + p.len;
  $('#clockInfo').textContent = stop > 0
    ? `Ende regulär ${end}:00 · Nachspielzeit bis ${end + stop}:00`
    : `Ende regulär ${end}:00`;
  $('#stopVal').textContent = `+${stop}`;
  $('#periodName').textContent = m.finished ? 'Spiel beendet' : p.name;
  document.body.dataset.running = m.running ? '1' : '0';

  const btn = $('#btnClock');
  if (m.finished) btn.textContent = 'Spiel beendet';
  else if (m.running) btn.textContent = 'Uhr anhalten';
  else if (m.kicked < m.period) btn.textContent = 'Anpfiff';
  else btn.textContent = 'Uhr starten';
  btn.disabled = m.finished;

  const last = m.period >= ps.length - 1;
  $('#btnEnd').textContent = last ? 'Spiel beenden' : `${p.name} beenden`;
  $('#btnEnd').disabled = m.finished;
  $('#btnFinish').hidden = m.finished || last || m.period < 1;
}

function renderScore() {
  const s = score();
  $('#score0').textContent = s[0];
  $('#score1').textContent = s[1];
}

function renderNames() {
  $$('[data-tn]').forEach(el => { el.textContent = teamName(Number(el.dataset.tn)); });
}

function renderCards() {
  // Auswahl
  $$('[data-pick="cardTeam"]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.v) === ui.cardTeam)));
  $$('[data-pick="cardType"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === ui.cardType)));
  $$('#reasonChips .chip').forEach(c => c.setAttribute('aria-pressed', String(c.textContent === ui.reason)));

  // Übersicht
  const st = Object.values(cardStatus());
  const box = $('#cardSummary');
  box.innerHTML = '';
  if (!st.length) {
    box.innerHTML = '<p class="empty">Noch keine Karten gezeigt.</p>';
    return;
  }
  [0, 1].forEach(t => {
    const list = st.filter(o => o.team === t);
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'sum-team'; h.textContent = teamName(t);
    const wrap = document.createElement('div');
    wrap.className = 'sum-list';
    list.sort((a, b) => String(a.num).localeCompare(String(b.num), 'de', { numeric: true })).forEach(o => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      const c = document.createElement('i');
      c.className = 'cs ' + (o.out ? 'r' : 'y');
      tag.append(c, document.createTextNode('#' + o.num + (o.y > 1 ? ' ×' + o.y : '')));
      wrap.append(tag);
    });
    box.append(h, wrap);
  });
}

function renderSubs() {
  $$('[data-pick="subTeam"]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.v) === ui.subTeam)));
  const max = Number(S.settings.maxSubs);
  const box = $('#subSummary');
  box.innerHTML = '';
  [0, 1].forEach(t => {
    const row = document.createElement('div');
    row.className = 'sum-team';
    row.textContent = `${teamName(t)}: ${subsCount(t)}${max > 0 ? ' von ' + max : ''} Wechsel`;
    box.append(row);
    const subs = M().events.filter(e => e.type === 'sub' && e.team === t);
    if (subs.length) {
      const wrap = document.createElement('div');
      wrap.className = 'sum-list';
      subs.forEach(e => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = `${e.min}  #${e.out} → #${e.in}`;
        wrap.append(tag);
      });
      box.append(wrap);
    }
  });
}

function renderLog() {
  const ol = $('#log');
  ol.innerHTML = '';
  const evs = M().events;
  if (!evs.length) {
    const li = document.createElement('li');
    li.className = 'empty-log';
    li.style.display = 'block';
    li.textContent = 'Noch keine Einträge. Anpfiff, Tore, Karten und Wechsel erscheinen hier.';
    ol.append(li);
    return;
  }
  [...evs].reverse().forEach(e => {
    const d = describe(e);
    const li = document.createElement('li');
    const min = document.createElement('span'); min.className = 'min'; min.textContent = e.min;
    const ico = document.createElement('i'); ico.className = 'ico ' + d.icon;
    const what = document.createElement('span'); what.className = 'what'; what.textContent = d.title;
    if (d.sub) { const s = document.createElement('small'); s.textContent = d.sub; what.append(s); }
    li.append(min, ico, what);
    ol.append(li);
  });
}

function renderPens() {
  const p = M().pens;
  const h = p.h.filter(Boolean).length, a = p.a.filter(Boolean).length;
  $('#penScore').textContent = `${h} : ${a}`;
  const rounds = Math.max(5, p.h.length, p.a.length);
  [['h', 0], ['a', 1]].forEach(([k, i]) => {
    const box = $('#penDots' + i);
    box.innerHTML = '';
    for (let r = 0; r < rounds; r++) {
      const d = document.createElement('span');
      const v = p[k][r];
      d.className = 'pdot ' + (v === true ? 'hit' : v === false ? 'miss' : 'pending');
      box.append(d);
    }
  });
  const turn = p.h.length <= p.a.length ? 0 : 1;
  $('#penTurn').textContent = `${teamName(turn)} schießt (Schütze ${p[turn === 0 ? 'h' : 'a'].length + 1}).`;
}

function renderAll() {
  renderNames();
  renderClock();
  renderScore();
  renderCards();
  renderSubs();
  renderLog();
  renderPens();
}

/* ---------------------------------------------------------------------
   Overlay, Toast
   --------------------------------------------------------------------- */
let flashTimer = 0;
function flashCard(type, label) {
  const el = $('#flash');
  el.className = 'flash ' + type;
  $('#flashLabel').textContent = label;
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
let toastTimer = 0;
function toast(text, ms = 2200) {
  const el = $('#toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function vibrate(p) {
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate(p);
}

/* ---------------------------------------------------------------------
   Bildschirm anlassen
   --------------------------------------------------------------------- */
let wakeLock = null;
async function requestWake() {
  if (!S.settings.wake || !('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (M().running) requestWake();
    renderClock();
  }
});

/* ---------------------------------------------------------------------
   Sound (Web Audio, kein Audiofile nötig)
   --------------------------------------------------------------------- */
let ctx = null, comp = null, noiseBuf = null;
const WHISTLES = {
  fox: { f: 3300, trill: 36 },
  acme: { f: 2700, trill: 27 },
  deep: { f: 2150, trill: 22 }
};

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function whistleTone(start, dur) {
  const c = audio();
  const w = WHISTLES[S.settings.whistle] || WHISTLES.fox;
  const vol = Math.max(0.05, Math.min(1, Number(S.settings.volume) || 0.8));
  const end = start + dur;

  const out = c.createGain();
  out.gain.setValueAtTime(0, start);
  out.gain.linearRampToValueAtTime(vol, start + 0.025);
  out.gain.setValueAtTime(vol, Math.max(start + 0.03, end - 0.06));
  out.gain.linearRampToValueAtTime(0, end);
  out.connect(comp);

  // Kügelchen-Triller: schnelle Amplitudenmodulation
  const tr = c.createGain();
  tr.gain.value = 0.65;
  tr.connect(out);
  const lfo = c.createOscillator();
  lfo.frequency.value = w.trill;
  const lg = c.createGain(); lg.gain.value = 0.35;
  lfo.connect(lg); lg.connect(tr.gain);

  // leichtes Schwanken der Tonhöhe
  const wob = c.createOscillator();
  wob.frequency.value = 5.5;
  const wg = c.createGain(); wg.gain.value = w.f * 0.008;
  wob.connect(wg);

  [[1, 'sine', 0.6], [1.012, 'sine', 0.5], [2, 'triangle', 0.12]].forEach(([mul, type, g]) => {
    const o = c.createOscillator();
    o.type = type; o.frequency.value = w.f * mul;
    wg.connect(o.frequency);
    const og = c.createGain(); og.gain.value = g;
    o.connect(og); og.connect(tr);
    o.start(start); o.stop(end + 0.05);
  });

  // Luftgeräusch
  const ns = c.createBufferSource();
  ns.buffer = noiseBuf; ns.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = w.f; bp.Q.value = 8;
  const ng = c.createGain(); ng.gain.value = 0.25;
  ns.connect(bp); bp.connect(ng); ng.connect(tr);
  ns.start(start); ns.stop(end + 0.05);

  lfo.start(start); lfo.stop(end + 0.05);
  wob.start(start); wob.stop(end + 0.05);
}

function hornTone(start, dur) {
  const c = audio();
  const vol = Math.max(0.05, Math.min(1, Number(S.settings.volume) || 0.8)) * 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.03);
  g.gain.setValueAtTime(vol, start + dur - 0.08);
  g.gain.linearRampToValueAtTime(0, start + dur);
  g.connect(comp);
  [220, 223.5, 440].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = i === 2 ? 'square' : 'sawtooth';
    o.frequency.value = f;
    const og = c.createGain(); og.gain.value = i === 2 ? 0.15 : 0.5;
    o.connect(og); og.connect(g);
    o.start(start); o.stop(start + dur + 0.05);
  });
}

function beep(n = 1) {
  const c = audio(); if (!c) return;
  const vol = Math.max(0.05, Math.min(1, Number(S.settings.volume) || 0.8)) * 0.6;
  for (let i = 0; i < n; i++) {
    const t = c.currentTime + 0.02 + i * 0.28;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    o.connect(g); g.connect(comp);
    o.start(t); o.stop(t + 0.2);
  }
}

function clink() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  [2400, 3600].forEach(f => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(comp);
    o.start(t); o.stop(t + 0.3);
  });
}

const SEQUENCES = {
  short:  { notes: [[0.35, 0]], vib: [350] },
  double: { notes: [[0.3, 0.16], [0.3, 0]], vib: [300, 160, 300] },
  long:   { notes: [[1.4, 0]], vib: [1400] },
  triple: { notes: [[0.6, 0.2], [0.6, 0.2], [1.2, 0]], vib: [600, 200, 600, 200, 1200] }
};

function playSound(kind) {
  const c = audio();
  if (!c) return toast('Dieses Gerät kann keine Töne erzeugen.');
  if (kind === 'beep') { beep(2); vibrate([150, 100, 150]); return; }
  if (kind === 'horn') { hornTone(c.currentTime + 0.02, 1.3); vibrate(1300); return; }
  const seq = SEQUENCES[kind];
  if (!seq) return;
  let t = c.currentTime + 0.02;
  seq.notes.forEach(([dur, gap]) => { whistleTone(t, dur); t += dur + gap; });
  vibrate(seq.vib);
}

/* ---------------------------------------------------------------------
   Navigation und Events
   --------------------------------------------------------------------- */
function showTab(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tabbar button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { showTab(tab.dataset.tab); return; }

  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const key = pick.dataset.pick;
    ui[key] = (key === 'cardType') ? pick.dataset.v : Number(pick.dataset.v);
    renderCards(); renderSubs();
    return;
  }

  const chip = e.target.closest('.chip');
  if (chip) {
    ui.reason = ui.reason === chip.textContent ? '' : chip.textContent;
    renderCards();
    return;
  }

  const act = e.target.closest('[data-act]');
  if (act && actions[act.dataset.act]) actions[act.dataset.act](act);
});

// Pfeifen reagieren sofort beim Berühren
$$('[data-sound]').forEach(pad => {
  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    pad.classList.add('hit');
    playSound(pad.dataset.sound);
    setTimeout(() => pad.classList.remove('hit'), 160);
  });
  pad.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playSound(pad.dataset.sound); }
  });
});

$('#flash').addEventListener('click', () => { $('#flash').hidden = true; });

// Einstellungen
function fillSettings() {
  $$('[data-set]').forEach(el => {
    const v = S.settings[el.dataset.set];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
}
$$('[data-set]').forEach(el => {
  const handler = () => {
    const k = el.dataset.set;
    if (el.type === 'checkbox') S.settings[k] = el.checked;
    else if (el.type === 'number' || el.type === 'range') {
      const n = Number(el.value);
      if (el.type === 'number' && (!n || n < Number(el.min))) { if (!(k === 'maxSubs' && n === 0)) return; }
      S.settings[k] = n;
    } else S.settings[k] = el.value;
    if (k === 'extra' || k === 'halfMin') {
      if (!S.settings.extra && M().period >= 2) { M().period = 1; M().base = 0; }
      syncAlarms();
    }
    if (k === 'wake') { if (el.checked && M().running) requestWake(); else releaseWake(); }
    save(); renderAll();
  };
  el.addEventListener(el.type === 'text' || el.type === 'number' || el.type === 'range' ? 'input' : 'change', handler);
});

// Gründe als Chips
(function buildReasons() {
  const box = $('#reasonChips');
  REASONS.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = r;
    b.setAttribute('aria-pressed', 'false');
    box.append(b);
  });
})();

/* ---------------------------------------------------------------------
   Start
   --------------------------------------------------------------------- */
fillSettings();
syncAlarms();
renderAll();
if (M().running) requestWake();
setInterval(() => { renderClock(); checkAlarms(); }, 250);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
