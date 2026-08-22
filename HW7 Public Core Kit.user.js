// ==UserScript==
// @name         HW7 Core Kit
// @namespace    hw-7-tracking-panel-kit
// @version      2.22
// @description  Unified public access build for HoboWars
// @author       lvl11evelyn / sɛvɜn (2924238)
// @license      All Rights Reserved
// @match        *://www.hobowars.com/*
// @match        *://hobowars.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @updateURL    https://raw.githubusercontent.com/lvl11evelyn/hw7-pub-core-kit/main/HW7%20Public%20Core%20Kit.user.js
// @downloadURL  https://raw.githubusercontent.com/lvl11evelyn/hw7-pub-core-kit/main/HW7%20Public%20Core%20Kit.user.js
// ==/UserScript==

/* ===== HW Combat Roll Ranges 0.0.1 ===== */
(function () {
  'use strict';

  const root = window;

  const KEYS = Object.freeze({
    CURRENT_STATS: 'hw_crr_current_stats_bridge_v1',
    MINE_TRADE: 'mtt_topbar_last_trade_bridge_v1',
    JUNGLE_ENTRIES: 'jbgl_entries_v1',
    JUNGLE_LAST_YIELD: 'hw_crr_jungle_last_yield_bridge_v1',
    JUNGLE_DAILY: 'hw_crr_jungle_daily_bridge_v1'
  });

  const FORMULA = Object.freeze({
    effective: 'n <= 500 ? n : 500 + ((n - 500) * 0.8)',
    speed: {
      min: 'EffSpd / 4',
      max: 'EffSpd'
    },
    damage: {
      min: 'EffStr / 6 + EffPow / 2 + Wep',
      max: 'EffStr / 4 + 3 * EffPow / 4 + Wep'
    },
    defense: {
      min: 'EffStr / 3 + Arm',
      max: 'EffStr / 2 + Arm'
    }
  });

  function HW_CRR(stats, delta = {}, gear = {}) {
    const base = normalizeStats(stats);
    const change = normalizeStats(delta);

    const exact = {
      str: round4(base.str + change.str),
      pow: round4(base.pow + change.pow),
      spd: round4(base.spd + change.spd)
    };

    const hasAll = ['str', 'pow', 'spd'].every(key => Number.isFinite(base[key]));
    if (!hasAll) {
      return {
        schema: 1,
        version: HW_CRR.version,
        exact: null,
        effective: null,
        speed: null,
        damage: null,
        defense: null,
        ranges: { speed: null, damage: null, defense: null },
        ceilings: { speed: null, damage: null, defense: null },
        formula: FORMULA
      };
    }

    const wep = finiteOrZero(gear && gear.wep);
    const arm = finiteOrZero(gear && gear.arm);

    const effective = {
      str: effectiveStat(exact.str),
      pow: effectiveStat(exact.pow),
      spd: effectiveStat(exact.spd)
    };

    const speed = makeRange(effective.spd / 4, effective.spd);
    const damage = makeRange(
      effective.str / 6 + effective.pow / 2 + wep,
      effective.str / 4 + 3 * effective.pow / 4 + wep
    );
    const defense = makeRange(
      effective.str / 3 + arm,
      effective.str / 2 + arm
    );

    return {
      schema: 1,
      version: HW_CRR.version,
      exact,
      effective,
      gear: { wep, arm },
      speed,
      damage,
      defense,
      ranges: { speed, damage, defense },
      ceilings: {
        speed: speed ? speed.max : null,
        damage: damage ? damage.max : null,
        defense: defense ? defense.max : null
      },
      formula: FORMULA
    };
  }

  HW_CRR.version = '0.0.1';
  HW_CRR.KEYS = KEYS;
  HW_CRR.FORMULA = FORMULA;
  HW_CRR.effectiveStat = effectiveStat;
  HW_CRR.normalizeStats = normalizeStats;
  HW_CRR.rangeDelta = rangeDelta;
  HW_CRR.publishStats = publishStats;
  HW_CRR.readStats = readStats;
  HW_CRR.publishMineTrade = publishMineTrade;
  HW_CRR.readMineTrade = readMineTrade;
  HW_CRR.publishJungleYield = publishJungleYield;
  HW_CRR.publishJungleEntries = publishJungleEntries;
  HW_CRR.readJungleLastYield = readJungleLastYield;
  HW_CRR.readJungleDaily = readJungleDaily;

  root.HW_CRR = HW_CRR;
  root.HW_COMBAT_ROLL_RANGES = HW_CRR;

  function publishStats(stats, meta = {}) {
    const normalized = normalizeStats(stats);

    if (!['str', 'pow', 'spd'].every(key => Number.isFinite(normalized[key]))) {
      return false;
    }

    return setJson(KEYS.CURRENT_STATS, {
      schema: 1,
      version: HW_CRR.version,
      stats: normalized,
      source: String(meta.source || stats.source || ''),
      sourceAt: finiteOrNow(meta.sourceAt || stats.sourceAt),
      publishedAt: Date.now()
    });
  }

  function readStats(maxAgeMs = 0) {
    const payload = getJson(KEYS.CURRENT_STATS, null);
    if (!payload || Number(payload.schema) !== 1) return null;

    if (Number.isFinite(Number(maxAgeMs)) && Number(maxAgeMs) > 0) {
      const publishedAt = Number(payload.publishedAt || payload.sourceAt || 0);
      if (!Number.isFinite(publishedAt) || Date.now() - publishedAt > Number(maxAgeMs)) return null;
    }

    const stats = normalizeStats(payload.stats || {});
    if (!['str', 'pow', 'spd'].every(key => Number.isFinite(stats[key]))) return null;

    return {
      ...payload,
      stats
    };
  }

  function publishMineTrade(trade, meta = {}) {
    if (!trade || typeof trade !== 'object') return false;

    return setJson(KEYS.MINE_TRADE, {
      schema: 1,
      version: HW_CRR.version,
      ...trade,
      source: String(meta.source || trade.source || 'MTT'),
      parsedAt: finiteOrNow(trade.parsedAt || meta.parsedAt),
      publishedAt: Date.now()
    });
  }

  function readMineTrade() {
    const payload = getJson(KEYS.MINE_TRADE, null);
    return payload && Number(payload.schema) === 1 ? payload : null;
  }

  function publishJungleYield(row, meta = {}) {
    const yieldDelta = normalizeStats(row || {});
    const life = finiteOrZero(row && (row.mlg ?? row.life));
    const dayKey = String(meta.dayKey || row.dayKey || getDayFromTs(row.ts) || '');
    const fp = String(meta.fp || row.fp || buildJungleFingerprint(row));

    const payload = {
      schema: 1,
      version: HW_CRR.version,
      fp,
      dayKey,
      ts: String(row.ts || ''),
      timeFull: String(row.timeFull || ''),
      color: String(row.color || ''),
      str: Number.isFinite(yieldDelta.str) ? yieldDelta.str : 0,
      pow: Number.isFinite(yieldDelta.pow) ? yieldDelta.pow : 0,
      spd: Number.isFinite(yieldDelta.spd) ? yieldDelta.spd : 0,
      life,
      source: String(meta.source || 'Jungle'),
      parsedAt: finiteOrNow(meta.parsedAt),
      publishedAt: Date.now()
    };

    setJson(KEYS.JUNGLE_LAST_YIELD, payload);
    updateJungleDaily(payload);
    return true;
  }

  function publishJungleEntries(rows, meta = {}) {
    if (!Array.isArray(rows)) return false;

    try {
      localStorage.setItem(KEYS.JUNGLE_ENTRIES, JSON.stringify(rows));
    } catch {
      // localStorage can be unavailable in strict browser modes.
    }

    const daily = {};

    for (const row of rows) {
      const dayKey = String(row && (row.dayKey || getDayFromTs(row.ts)) || '');
      if (!dayKey) continue;

      if (!daily[dayKey]) {
        daily[dayKey] = {
          schema: 1,
          version: HW_CRR.version,
          dayKey,
          str: 0,
          pow: 0,
          spd: 0,
          life: 0,
          source: String(meta.source || 'Jungle'),
          publishedAt: Date.now()
        };
      }

      daily[dayKey].str += finiteOrZero(row && row.str);
      daily[dayKey].pow += finiteOrZero(row && row.pow);
      daily[dayKey].spd += finiteOrZero(row && row.spd);
      daily[dayKey].life += finiteOrZero(row && (row.mlg ?? row.life));
    }

    return setJson(KEYS.JUNGLE_DAILY, daily);
  }

  function readJungleLastYield() {
    const payload = getJson(KEYS.JUNGLE_LAST_YIELD, null);
    return payload && Number(payload.schema) === 1 ? payload : null;
  }

  function readJungleDaily(dayKey) {
    const map = getJson(KEYS.JUNGLE_DAILY, {});
    const key = String(dayKey || '');
    const entry = map && typeof map === 'object' ? map[key] : null;

    if (!entry) return null;

    return {
      schema: 1,
      version: String(entry.version || HW_CRR.version),
      dayKey: key,
      str: finiteOrZero(entry.str),
      pow: finiteOrZero(entry.pow),
      spd: finiteOrZero(entry.spd),
      life: finiteOrZero(entry.life),
      source: String(entry.source || 'Jungle'),
      publishedAt: Number(entry.publishedAt) || 0
    };
  }

  function updateJungleDaily(payload) {
    const key = String(payload && payload.dayKey || '');
    if (!key) return false;

    const map = getJson(KEYS.JUNGLE_DAILY, {});
    const prev = map[key] && typeof map[key] === 'object'
      ? map[key]
      : { schema: 1, version: HW_CRR.version, dayKey: key, str: 0, pow: 0, spd: 0, life: 0, source: 'Jungle' };

    prev.str = round4(finiteOrZero(prev.str) + finiteOrZero(payload.str));
    prev.pow = round4(finiteOrZero(prev.pow) + finiteOrZero(payload.pow));
    prev.spd = round4(finiteOrZero(prev.spd) + finiteOrZero(payload.spd));
    prev.life = Math.round(finiteOrZero(prev.life) + finiteOrZero(payload.life));
    prev.publishedAt = Date.now();

    map[key] = prev;
    return setJson(KEYS.JUNGLE_DAILY, map);
  }

  function rangeDelta(before, after) {
    const b = before && before.ranges ? before.ranges : before;
    const a = after && after.ranges ? after.ranges : after;

    return {
      speed: deltaRange(b && b.speed, a && a.speed),
      damage: deltaRange(b && b.damage, a && a.damage),
      defense: deltaRange(b && b.defense, a && a.defense),
      ceilings: {
        speed: deltaNumber(b && b.speed && b.speed.max, a && a.speed && a.speed.max),
        damage: deltaNumber(b && b.damage && b.damage.max, a && a.damage && a.damage.max),
        defense: deltaNumber(b && b.defense && b.defense.max, a && a.defense && a.defense.max)
      }
    };
  }

  function deltaRange(before, after) {
    if (!before || !after) return null;
    return {
      min: deltaNumber(before.min, after.min),
      max: deltaNumber(before.max, after.max),
      avg: deltaNumber(before.avg, after.avg)
    };
  }

  function deltaNumber(before, after) {
    const b = Number(before);
    const a = Number(after);
    return Number.isFinite(b) && Number.isFinite(a) ? a - b : null;
  }

  function normalizeStats(v) {
    const obj = v && typeof v === 'object' ? v : {};

    return {
      str: finiteOrNull(obj.str ?? obj.STR ?? obj.strength ?? obj.Strength),
      pow: finiteOrNull(obj.pow ?? obj.POW ?? obj.power ?? obj.Power),
      spd: finiteOrNull(obj.spd ?? obj.SPD ?? obj.speed ?? obj.Speed)
    };
  }

  function effectiveStat(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n <= 500 ? n : 500 + ((n - 500) * 0.8);
  }

  function makeRange(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return {
      min,
      max,
      avg: (min + max) / 2
    };
  }

  function finiteOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function finiteOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function finiteOrNow(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }

  function round4(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
  }

  function getJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function getDayFromTs(ts) {
    const m = String(ts || '').match(/^(\d{2}\s+[A-Z]{3})/i);
    return m ? m[1].toUpperCase() : '';
  }

  function buildJungleFingerprint(row) {
    if (!row || typeof row !== 'object') return '';
    return [
      row.ts || '',
      row.timeFull || '',
      row.color || '',
      row.str ?? '',
      row.pow ?? '',
      row.spd ?? '',
      row.mlg ?? row.life ?? '',
      row.t ?? ''
    ].join('|');
  }
})();

/* Execute the modules that were originally configured for document-end
   after the document has been parsed. */
function hw7RunDocumentEndModules() {

  /* ===== HW Jungle Berry Event Tracker.user.js ===== */
  (function () {
    'use strict';

    const K_ENTRIES = 'jbgl_entries_v1';
    const K_LAST_FP = 'jbgl_last_fp_v1';
    const K_T_STATE = 'jbgl_t_state_v1';
    const K_COLLAPSED_HOURS = 'jbgl_collapsed_hours_v1';
    const K_PANEL_MODE = 'jbgl_panel_mode_v1';
    const K_PANEL_ANCHOR = 'jbgl_panel_anchor_v1';

    const MAX_ROWS = 5000;
    const PANEL_WIDTH = 355;
    const JBET_ROW_GRID = '22% 13% 13% 13% 13% 10% 10% 6%';

    const JBET_PANEL_MODES = Object.freeze({
      FIXED: 'fixed',
      CONTENT_END: 'content-end'
    });

    const JBET_PANEL_ANCHORS = Object.freeze([
      'top-left',
      'top-right',
      'middle-left',
      'middle-right',
      'bottom-left',
      'bottom-right',
      'open-area'
    ]);

    const JBET_PANEL_GUTTER = Object.freeze({
      topChrome: 5,
      side: 15,
      bottom: 15
    });

    let jungleImportOpen = false;
    let jbetPlacementResizeBound = false;

    const href = String(location.href || '');
    const isJungle = /[?&]cmd=more_jungle(?:[&#]|$|&)/i.test(href);
    const isMoreJungle = /[?&]cmd=more_jungle(?:[&#]|$)/i.test(href);
    const isStepTarget =
      /[?&]cmd=more_jungle(?:[&#]|$|&)/i.test(href) &&
      /[?&](?:move=[^&#]*|goback=true)(?:[&#]|$)/i.test(href);


      if (isMoreJungle) {
        document.addEventListener('keydown', event => {
          if (event.code !== 'Space' || event.repeat) return;

          const target = event.target;

          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable
          ) {
            return;
          }

          const goBackLink = Array.from(document.querySelectorAll('a[href]'))
            .find(link =>
              /go back to beginning\s*\(1T\)/i.test(link.textContent.trim())
            );

          if (!goBackLink) return;

          event.preventDefault();
          event.stopPropagation();

          goBackLink.click();
        }, true);
      }


    if (!isJungle) return;

    let entries = loadEntries();
    let tState = loadTState();

    const html = document.documentElement.innerHTML || '';
    const text = document.body ? (document.body.textContent || '') : '';

    const clockEl = document.querySelector('#clock');
    const now = clockEl ? parseClock(clockEl.textContent || '') : null;
    const monthText = getMonthText(text);
    const dayText = String(getDayText(text)).padStart(2, '0');
    const hourKey = now ? `${dayText} ${monthText}-${pad(now.h)}` : currentHourKey(entries);

    render(entries, tState);

    if (!isStepTarget || !now) return;

    const timeText = `${pad(now.h)}:${pad(now.m)}`;
    const timeFullText = `${pad(now.h)}:${pad(now.m)}:${pad(now.s)}`;
    const ts = `${dayText} ${monthText}-${timeText}`;

    if (isFailedStepPage(html, text)) {
      render(entries, tState);
      return;
    }

    const parsed = parseBerryEvent(html, text);

    if (parsed) {
      const fp = buildFingerprint({
        hourKey,
        minute: now.m,
        second: now.s,
        ts,
        color: parsed.color,
        type: parsed.type,
        value: parsed.value
      });

      const prevFp = String(GM_getValue(K_LAST_FP, '') || '');
      if (prevFp === fp) {
        render(entries, tState);
        return;
      }

      GM_setValue(K_LAST_FP, fp);
    }

    incrementT(tState, hourKey);
    saveTState(tState);

    if (!parsed) {
      render(entries, tState);
      return;
    }

    const row = {
      ts,
      hourKey,
      color: parsed.color,
      str: null,
      pow: null,
      spd: null,
      mlg: null,
      mlgColor: null,
      t: tState.epochT,
      timeFull: timeFullText
    };

    switch (parsed.type) {
      case 'STR':
        row.str = parsed.value;
        break;
      case 'POW':
        row.pow = parsed.value;
        break;
      case 'SPD':
        row.spd = parsed.value;
        break;
      case 'MLG':
        row.mlg = parsed.value;
        row.mlgColor = parsed.color === 'purple' ? 'purple' : 'blue';
        break;
      default:
        return;
    }

    tState.epochT = 0;
    saveTState(tState);

    entries.unshift(row);
    if (entries.length > MAX_ROWS) entries.length = MAX_ROWS;
    saveEntries(entries);
    publishCrrJungleRow(row);
    publishCrrJungleEntries(entries);

    render(entries, tState);

    function loadEntries() {
      try {
        const v = JSON.parse(GM_getValue(K_ENTRIES, '[]'));
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }

    function saveEntries(rows) {
      GM_setValue(K_ENTRIES, JSON.stringify(rows));
    }

    function getCrr() {
      const root = window;
      const crr = root && (root.HW_CRR || root.HW_COMBAT_ROLL_RANGES);
      return typeof crr === 'function' ? crr : null;
    }

    function publishCrrJungleRow(row) {
      const crr = getCrr();
      if (!crr || typeof crr.publishJungleYield !== 'function' || !row) return;
      crr.publishJungleYield(row, { source: 'Jungle' });
    }

    function publishCrrJungleEntries(rows) {
      const crr = getCrr();
      if (!crr || typeof crr.publishJungleEntries !== 'function') return;
      crr.publishJungleEntries(rows, { source: 'Jungle' });
    }

    function loadTState() {
      try {
        const v = JSON.parse(GM_getValue(K_T_STATE, '{}'));
        return normalizeTState(v);
      } catch {
        return normalizeTState({});
      }
    }

    function saveTState(state) {
      GM_setValue(K_T_STATE, JSON.stringify(normalizeTState(state)));
    }

    function normalizeTState(v) {
      const state = v && typeof v === 'object' ? v : {};
      const hourT = state.hourT && typeof state.hourT === 'object' ? state.hourT : {};

      for (const k of Object.keys(hourT)) {
        const n = parseInt(hourT[k], 10);
        if (Number.isFinite(n) && n >= 0) hourT[k] = n;
        else delete hourT[k];
      }

      const totalT = parseInt(state.totalT, 10);
      const epochT = parseInt(state.epochT, 10);

      return {
        totalT: Number.isFinite(totalT) && totalT >= 0 ? totalT : 0,
        epochT: Number.isFinite(epochT) && epochT >= 0 ? epochT : 0,
        hourT
      };
    }

    function incrementT(state, hourKey) {
      state.totalT += 1;
      state.epochT += 1;
      state.hourT[hourKey] = (state.hourT[hourKey] || 0) + 1;
    }

    function loadCollapsedHours() {
      try {
        const v = JSON.parse(GM_getValue(K_COLLAPSED_HOURS, '{}'));
        return v && typeof v === 'object' ? v : {};
      } catch {
        return {};
      }
    }

    function saveCollapsedHours(v) {
      GM_setValue(
        K_COLLAPSED_HOURS,
        JSON.stringify(v && typeof v === 'object' ? v : {})
      );
    }

    function isHourCollapsed(hourKey, activeHourKey, collapsedMap) {
      if (Object.prototype.hasOwnProperty.call(collapsedMap, hourKey)) {
        return !!collapsedMap[hourKey];
      }
      return String(hourKey || '') !== String(activeHourKey || '');
    }

    function isFailedStepPage(html, text) {
      const raw = `${html}
  ${text}`;
      return (
        /You probably shouldn't wander around down here until you've sobered up a bit, what with all the fermented berries around\./i.test(raw) ||
        /You're way too tired to be wandering around down here\. Get some rest\./i.test(raw)
      );
    }

    function parseBerryEvent(html, text) {
      const raw = `${html}\n${text}`;
      const norm = normalizeSpace(text);

      if (/shriveled berries?/i.test(raw) && !/you gain/i.test(raw)) {
        return null;
      }

      const colorMatch =
        raw.match(/amazing\s+(orange|yellow|green|blue|purple)\s+berry/i) ||
        raw.match(/find\s+an?\s+(orange|yellow|green|blue|purple)\s+berry/i);

      const color = colorMatch ? colorMatch[1].toLowerCase() : null;

      let m = raw.match(/You gain\s*<font[^>]*>\s*<b>\s*(\d{1,4})\s*<\/b>\s*Max Life\s*<\/font>/i) ||
              raw.match(/You gain[\s\S]*?<b>\s*(\d{1,4})\s*<\/b>[\s\S]*?Max Life/i) ||
              norm.match(/You gain\s*(\d{1,4})\s*Max Life/i);
      if (m) {
        return {
          color: color || 'blue',
          type: 'MLG',
          value: parseInt(m[1], 10)
        };
      }

      m = raw.match(/You gain[\s\S]*?<b>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/b>[\s\S]*?Strength/i) ||
          norm.match(/You gain\s*([0-9]+(?:\.[0-9]+)?)\s*Strength/i);
      if (m) {
        return {
          color: color || 'green',
          type: 'STR',
          value: parseFloat(m[1])
        };
      }

      m = raw.match(/You gain[\s\S]*?<b>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/b>[\s\S]*?Power/i) ||
          norm.match(/You gain\s*([0-9]+(?:\.[0-9]+)?)\s*Power/i);
      if (m) {
        return {
          color: color || 'orange',
          type: 'POW',
          value: parseFloat(m[1])
        };
      }

      m = raw.match(/You gain[\s\S]*?<b>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/b>[\s\S]*?Speed/i) ||
          norm.match(/You gain\s*([0-9]+(?:\.[0-9]+)?)\s*Speed/i);
      if (m) {
        return {
          color: color || 'yellow',
          type: 'SPD',
          value: parseFloat(m[1])
        };
      }

      return null;
    }

    function buildFingerprint(o) {
      return [
        o.hourKey,
        pad(o.minute),
        pad(o.second),
        o.ts,
        o.color || '',
        o.type || '',
        String(o.value ?? '')
      ].join('|');
    }

    function parseClock(s) {
      const m = String(s).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)$/i);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const sec = parseInt(m[3], 10);
      const ap = m[4].toLowerCase();
      if (ap === 'am') {
        if (h === 12) h = 0;
      } else {
        if (h !== 12) h += 12;
      }
      return { h, m: min, s: sec };
    }

    function getMonthText(t) {
      const m = String(t).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
      return (m ? m[1] : 'UNK').toUpperCase();
    }

    function getDayText(t) {
      const m = String(t).match(/\b([1-9]|[12]\d|3[01])(st|nd|rd|th)\b/i);
      return m ? parseInt(m[1], 10) : 0;
    }

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    function normalizeSpace(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function sumRows(rows, filterFn) {
      const out = {
        str: 0,
        pow: 0,
        spd: 0,
        mlg: 0,
        t: 0
      };

      for (const r of rows) {
        if (!filterFn(r)) continue;
        out.str += toNum(r.str);
        out.pow += toNum(r.pow);
        out.spd += toNum(r.spd);
        out.mlg += toNum(r.mlg);
        out.t += toNum(r.t);
      }

      return out;
    }

    function makeHourTotals(rows, state, hourKey) {
      const t = sumRows(rows, r => r.hourKey === hourKey);
      const loggedT = Math.round(t.t || 0);
      const storedT = state.hourT && Number.isFinite(state.hourT[hourKey]) ? state.hourT[hourKey] : null;
      t.t = storedT != null ? storedT : loggedT;
      return t;
    }

    function makeTotalTotals(rows, state) {
      const t = sumRows(rows, () => true);
      const storedT = state && Number.isFinite(state.totalT) ? state.totalT : null;
      t.t = storedT != null ? storedT : Math.round(t.t || 0);
      t.berries = Array.isArray(rows) ? rows.length : 0;
      return t;
    }

    function toNum(v) {
      return Number.isFinite(v) ? v : 0;
    }

    function fmtEvent(v, isInt = false) {
      if (v == null) return ' '.repeat(isInt ? 4 : 5);
      if (isInt) return String(Math.round(v)).padStart(4, ' ');
      return v.toFixed(2).padStart(5, ' ');
    }

    function fmtTotal(v, isInt = false) {
      if (isInt) return String(Math.round(v || 0)).padStart(4, ' ');
      return (v || 0).toFixed(2).padStart(5, ' ');
    }

    function cellColor(col, row) {
      switch (col) {
        case 'str': return '#8cff8c';
        case 'pow': return '#ffae42';
        case 'spd': return '#f0e55a';
        case 'mlg': return row && row.mlgColor === 'purple' ? '#d98cff' : '#70a7ff';
        case 't': return '#e8e8e8';
        default: return '#d8d8d8';
      }
    }

      function injectJgLayoutStyle() {
          if (!isJungle) return;
          if (document.getElementById('jg-layout-style')) return;

          const style = document.createElement('style');
          style.id = 'jg-layout-style';
          style.textContent = `
              .content-wrap > div.content-area {
                  margin: 0 auto 0 15px;
                  min-width: 700px !important;
                  max-width: 700px !important;
                  }`;
          document.head.appendChild(style);
      }

      function reorderJungleTableCells() {
          if (!isJungle) return;

          const row = document.querySelector(
              '.content-area > table[width="100%"] > tbody > tr'
          );

          if (!row) return;

          const mapCell = row.querySelector('td[width="40%"]');
          const mainCell = row.querySelector('td[width="60%"]');

          if (!mapCell || !mainCell) return;

          if (row.firstElementChild !== mapCell) {
              row.insertBefore(mapCell, mainCell);
          }
      }

    function render(rows, state) {
      const oldWrap = document.getElementById('jbgl-inline-wrap');
      if (oldWrap) oldWrap.remove();

      const legacyIds = ['jbgl-box', 'jbgl-controls', 'jbgl-footer', 'jbgl-import-toggle'];
      for (const id of legacyIds) document.getElementById(id)?.remove();

      const host =
        document.querySelector('.content-area') ||
        document.getElementById('main') ||
        document.body;
      if (!host) return;

      const inlineWrap = document.createElement('div');
      inlineWrap.id = 'jbgl-inline-wrap';
      inlineWrap.style.boxSizing = 'border-box';
      inlineWrap.style.width = '100%';
      inlineWrap.style.maxWidth = '100%';
      inlineWrap.style.margin = '8px 0 0';
      inlineWrap.style.fontFamily = 'Consolas, monospace';

      const box = document.createElement('div');
      box.id = 'jbgl-box';
      box.style.boxSizing = 'border-box';
      box.style.width = '100%';
      box.style.padding = '2px';
      box.style.background = 'rgba(0,0,0,0.95)';
      box.style.border = '1px solid #2f2f2f';
      box.style.outline = '1px solid #afc';
      box.style.borderRadius = '3px 3px 0 0';
      box.style.display = 'flex';
      box.style.flexDirection = 'column';
      box.style.fontSize = '11px';
      box.style.lineHeight = '1.2';
      box.style.color = '#f4f4f4';

      const headerWrap = document.createElement('div');
      headerWrap.style.padding = '1px 4px 0px';
      headerWrap.style.borderBottom = '1px solid #1f1f1f';
      headerWrap.style.flex = '0 0 auto';
      headerWrap.style.backgroundColor = '#efefef';
      headerWrap.style.color = '#000000';
      headerWrap.style.fontWeight = 'bold';
      const headerRow = makeTextRow('Timestamp', null, true, 'Qty');

      const settingsCell = headerRow.children[7];
      if (settingsCell) {
        const settingsBtn = document.createElement('button');
        settingsBtn.type = 'button';
        settingsBtn.textContent = '⚙';
        settingsBtn.title = 'Jungle panel placement';
        settingsBtn.setAttribute('aria-label', 'Jungle panel placement');
        settingsBtn.style.cssText = [
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'width:16px',
          'height:16px',
          'margin:auto',
          'padding:0',
          'border:1px solid #888',
          'border-radius:3px',
          'background:#ddd',
          'color:#222',
          'font-size:11px',
          'line-height:14px',
          'cursor:pointer'
        ].join(';');

        settingsBtn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          openJbetPlacementDialog(inlineWrap);
        });

        settingsCell.appendChild(settingsBtn);
      }

      headerWrap.appendChild(headerRow);

      const body = document.createElement('div');
      body.className = 'jbgl-scroll-body';
      body.style.boxSizing = 'border-box';
      body.style.maxHeight = '240px';
      body.style.overflowY = 'auto';
      body.style.padding = '2px 3px 2px 5px';

      const hours = orderedHourKeys(rows, state);
      const collapsedMap = loadCollapsedHours();
      const activeHourKey = currentHourKey(rows);

      hours.forEach((hk, i) => {
        if (i > 0) body.appendChild(makeSeparator());
        const collapsed = isHourCollapsed(hk, activeHourKey, collapsedMap);
        body.appendChild(
          makeHourHeader(
            hk,
            makeHourTotals(rows, state, hk),
            countHourEvents(rows, hk),
            collapsed,
            rows,
            state
          )
        );
        if (!collapsed) {
          for (const row of rows) {
            if (row.hourKey === hk) body.appendChild(makeEventRow(row));
          }
        }
      });

      const footer = document.createElement('div');
      footer.id = 'jbgl-footer';
      footer.style.boxSizing = 'border-box';
      footer.style.width = '100%';
      footer.style.background = 'rgba(45,45,45,0.95)';
      footer.style.border = '1px solid #2f2f2f';
      footer.style.borderTop = '0';
      footer.style.padding = '4px 6px';
      footer.style.fontSize = '10.8px';
      footer.style.lineHeight = '1.35';
      footer.style.color = '#d8d8d8';
      if (jungleImportOpen) {
        footer.appendChild(makeJungleImportButton(rows, state));
      } else {
        footer.appendChild(makeFooterTotalsRow('TOTAL', makeTotalTotals(rows, state)));
      }

      const controls = document.createElement('div');
      controls.id = 'jbgl-controls';
      controls.style.boxSizing = 'border-box';
      controls.style.display = 'flex';
      controls.style.flexWrap = 'wrap';
      controls.style.justifyContent = 'center';
      controls.style.gap = '5px';
      controls.style.width = '100%';
      controls.style.padding = '5px';
      controls.style.background = 'rgba(20,20,20,.75)';
      controls.style.border = '1px solid #2f2f2f';
      controls.style.borderTop = '0';
      controls.style.borderRadius = '0 0 3px 3px';

      function makeBulkToggleBtn() {
        const hourKeys = orderedHourKeys(rows, state);
        const collapsedMap = loadCollapsedHours();
        const activeHourKey = currentHourKey(rows);

        const anyExpanded = hourKeys.some(hourKey =>
          !isHourCollapsed(hourKey, activeHourKey, collapsedMap)
        );

        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'btn light-blue hover-green';
        btn.textContent = anyExpanded ? '[-] All' : '[+] All';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.height = '22px';
        btn.style.whiteSpace = 'nowrap';
        btn.style.fontSize = '11px';
        btn.style.fontFamily = 'Consolas, monospace';
        btn.style.padding = '4px 8px';

        btn.addEventListener('click', event => {
          event.preventDefault();

          const next = loadCollapsedHours();

          for (const hourKey of hourKeys) {
            next[hourKey] = anyExpanded;
          }

          saveCollapsedHours(next);
          render(rows, state);
        });

        return btn;
      }

      function makeBtn(label) {
        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'btn light-blue hover-green';
        btn.textContent = label;
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.minWidth = '92px';
        btn.style.height = '22px';
        btn.style.whiteSpace = 'nowrap';
        btn.style.fontSize = '12px';
        btn.style.textTransform = 'uppercase';
        btn.style.padding = '4px 8px';
        return btn;
      }

      const exportBtn = makeBtn('Export');
      exportBtn.addEventListener('click', event => {
        event.preventDefault();
        exportRows(rows, state);
      });

      const clearBtn = makeBtn('Clear');
      clearBtn.addEventListener('click', event => {
        event.preventDefault();
        saveEntries([]);
        GM_setValue(K_LAST_FP, '');
        GM_setValue(K_COLLAPSED_HOURS, '{}');
        saveTState({ totalT: 0, epochT: 0, hourT: {} });
        render([], normalizeTState({}));
      });

      const importToggle = makeBtn(jungleImportOpen ? 'Totals' : 'Import');
      importToggle.id = 'jbgl-import-toggle';
      importToggle.title = jungleImportOpen ? 'Show totals' : 'Show import control';
      importToggle.addEventListener('click', event => {
        event.preventDefault();
        jungleImportOpen = !jungleImportOpen;
        render(rows, state);
      });

      const bulkToggleBtn = makeBulkToggleBtn();

      controls.append(exportBtn, clearBtn, importToggle, bulkToggleBtn);
      box.append(headerWrap, body);
      inlineWrap.append(box, footer, controls);

      applyJbetPanelPlacement(inlineWrap);
      updateJbetSeparators(body);
      bindJbetSeparatorResize(body);
      bindJbetPlacementResize();
    }

    function loadJbetPanelPlacement() {
      const rawMode = String(GM_getValue(K_PANEL_MODE, JBET_PANEL_MODES.CONTENT_END) || '');
      const rawAnchor = String(GM_getValue(K_PANEL_ANCHOR, 'top-left') || '');

      return {
        mode: rawMode === JBET_PANEL_MODES.FIXED
          ? JBET_PANEL_MODES.FIXED
          : JBET_PANEL_MODES.CONTENT_END,
        anchor: JBET_PANEL_ANCHORS.includes(rawAnchor)
          ? rawAnchor
          : 'top-left'
      };
    }

    function saveJbetPanelPlacement(next) {
      const current = loadJbetPanelPlacement();

      const mode = next && next.mode === JBET_PANEL_MODES.FIXED
        ? JBET_PANEL_MODES.FIXED
        : next && next.mode === JBET_PANEL_MODES.CONTENT_END
          ? JBET_PANEL_MODES.CONTENT_END
          : current.mode;

      const anchor = next && JBET_PANEL_ANCHORS.includes(next.anchor)
        ? next.anchor
        : current.anchor;

      GM_setValue(K_PANEL_MODE, mode);
      GM_setValue(K_PANEL_ANCHOR, anchor);

      return { mode, anchor };
    }

    function measureJbetPlacementBounds() {
      const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
      const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);

      const content =
        document.querySelector('.content-area') ||
        document.getElementById('main');

      const contentRect = content && typeof content.getBoundingClientRect === 'function'
        ? content.getBoundingClientRect()
        : null;

      const contentTop = contentRect
        ? Math.max(0, Math.round(contentRect.top))
        : 0;

      const contentRight = contentRect
        ? Math.round(contentRect.right)
        : 0;

      const top = contentTop + JBET_PANEL_GUTTER.topChrome;
      const left = Math.max(
        JBET_PANEL_GUTTER.side,
        Math.min(
          viewportWidth - JBET_PANEL_GUTTER.side,
          contentRight + JBET_PANEL_GUTTER.side
        )
      );
      const right = Math.max(left, viewportWidth - JBET_PANEL_GUTTER.side);
      const bottom = Math.max(top, viewportHeight - JBET_PANEL_GUTTER.bottom);

      return {
        viewportWidth,
        viewportHeight,
        contentTop,
        contentRight,
        top,
        left,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
      };
    }

    function resetJbetPlacementStyles(panel) {
      for (const prop of [
        'position', 'top', 'right', 'bottom', 'left',
        'width', 'maxWidth', 'height', 'maxHeight',
        'margin', 'zIndex', 'display', 'flexDirection', 'minHeight'
      ]) {
        panel.style[prop] = '';
      }
    }

    function placeJbetContentEnd(panel, host) {
      resetJbetPlacementStyles(panel);
      panel.style.position = 'static';
      panel.style.width = '100%';
      panel.style.maxWidth = '100%';
      panel.style.height = 'auto';
      panel.style.maxHeight = 'none';
      panel.style.margin = '8px 0 0';
      panel.style.zIndex = 'auto';

      const box = panel.querySelector('#jbgl-box');
      const scrollBody = panel.querySelector('.jbgl-scroll-body');

      if (box) {
        box.style.flex = '';
        box.style.minHeight = '';
      }

      if (scrollBody) {
        scrollBody.style.flex = '';
        scrollBody.style.minHeight = '';
        scrollBody.style.maxHeight = '240px';
      }

      const leaveJungleLink = Array.from(host.querySelectorAll('a')).find(link =>
        /leave technicolor jungle/i.test(link.textContent || '')
      );

      if (leaveJungleLink) {
        let jungleBlock = leaveJungleLink;

        while (jungleBlock.parentElement && jungleBlock.parentElement !== host) {
          jungleBlock = jungleBlock.parentElement;
        }

        if (jungleBlock.parentElement === host) {
          jungleBlock.insertAdjacentElement('afterend', panel);
          return;
        }
      }

      host.appendChild(panel);
    }

    function applyJbetPanelPlacement(panel, suppliedSettings = null) {
      if (!panel) return;

      const settings = suppliedSettings || loadJbetPanelPlacement();
      const bounds = measureJbetPlacementBounds();
      const host =
        document.querySelector('.content-area') ||
        document.getElementById('main') ||
        document.body;

      if (settings.mode === JBET_PANEL_MODES.CONTENT_END) {
        placeJbetContentEnd(panel, host);
        return bounds;
      }

      resetJbetPlacementStyles(panel);

      if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
      }

      panel.style.position = 'fixed';
      panel.style.zIndex = '99998';
      panel.style.margin = '0';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.minHeight = '0';

      const box = panel.querySelector('#jbgl-box');
      const scrollBody = panel.querySelector('.jbgl-scroll-body');

      if (box) {
        box.style.flex = '1 1 auto';
        box.style.minHeight = '0';
      }

      // The 118px scroll cap belongs only to Content End. A fixed JBET panel
      // uses the full vertical region promised by its selected anchor.
      if (scrollBody) {
        scrollBody.style.flex = '1 1 auto';
        scrollBody.style.minHeight = '0';
        scrollBody.style.maxHeight = 'none';
      }

      const availableWidth = Math.max(120, bounds.width);
      const fixedWidth = Math.min(PANEL_WIDTH, availableWidth);
      const sixtyPercent = Math.max(120, Math.floor(bounds.height * 0.60));

      const leftAligned = /-left$/.test(settings.anchor);
      const rightAligned = /-right$/.test(settings.anchor);

      if (settings.anchor === 'open-area') {
        panel.style.left = `${bounds.left}px`;
        panel.style.right = `${Math.max(0, bounds.viewportWidth - bounds.right)}px`;
        panel.style.top = `${bounds.top}px`;
        panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
        panel.style.width = 'auto';
        panel.style.maxWidth = 'none';
        panel.style.height = 'auto';
        panel.style.maxHeight = 'none';
        return bounds;
      }

      panel.style.width = `${fixedWidth}px`;
      panel.style.maxWidth = `${availableWidth}px`;

      if (leftAligned) {
        panel.style.left = `${bounds.left}px`;
      } else if (rightAligned) {
        panel.style.right = `${Math.max(0, bounds.viewportWidth - bounds.right)}px`;
      }

      if (settings.anchor.startsWith('top-')) {
        panel.style.top = `${bounds.top}px`;
        panel.style.height = `${sixtyPercent}px`;
        panel.style.maxHeight = 'none';
      } else if (settings.anchor.startsWith('bottom-')) {
        panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
        panel.style.height = `${sixtyPercent}px`;
        panel.style.maxHeight = 'none';
      } else {
        panel.style.top = `${bounds.top}px`;
        panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
        panel.style.height = 'auto';
        panel.style.maxHeight = 'none';
      }

      return bounds;
    }

    function bindJbetPlacementResize() {
      if (jbetPlacementResizeBound) return;
      jbetPlacementResizeBound = true;

      window.addEventListener('resize', () => {
        const panel = document.getElementById('jbgl-inline-wrap');
        if (!panel) return;
        applyJbetPanelPlacement(panel);

        const dialog = document.getElementById('jbet-placement-dialog');
        if (dialog) updateJbetPlacementDialogPreview(dialog);
      }, { passive: true });
    }

    function openJbetPlacementDialog(panel) {
      document.getElementById('jbet-placement-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'jbet-placement-overlay';
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483646',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(0,0,0,.48)',
        'font-family:Verdana,Arial,sans-serif'
      ].join(';');

      const dialog = document.createElement('div');
      dialog.id = 'jbet-placement-dialog';
      dialog.style.cssText = [
        'width:min(560px,calc(100vw - 30px))',
        'box-sizing:border-box',
        'padding:10px',
        'border:1px solid #666',
        'border-radius:5px',
        'background:#efefef',
        'color:#111',
        'box-shadow:0 3px 18px rgba(0,0,0,.55)'
      ].join(';');

      const heading = document.createElement('div');
      heading.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:bold;font-size:13px;';

      const title = document.createElement('span');
      title.textContent = 'Jungle Panel Placement';

      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.title = 'Close';
      close.style.cssText = 'width:24px;height:22px;padding:0;border:1px solid #888;border-radius:3px;background:#ddd;cursor:pointer;font-size:16px;line-height:18px;';
      close.addEventListener('click', () => overlay.remove());

      heading.append(title, close);

      const modeRow = document.createElement('div');
      modeRow.style.cssText = 'display:flex;gap:18px;align-items:center;justify-content:center;margin:4px 0 9px;font-size:11px;font-weight:bold;';

      const settings = loadJbetPanelPlacement();

      const contentLabel = document.createElement('label');
      const contentRadio = document.createElement('input');
      contentRadio.type = 'radio';
      contentRadio.name = 'jbet-panel-mode';
      contentRadio.value = JBET_PANEL_MODES.CONTENT_END;
      contentRadio.checked = settings.mode === JBET_PANEL_MODES.CONTENT_END;
      contentLabel.append(contentRadio, document.createTextNode(' Content End'));

      const fixedLabel = document.createElement('label');
      const fixedRadio = document.createElement('input');
      fixedRadio.type = 'radio';
      fixedRadio.name = 'jbet-panel-mode';
      fixedRadio.value = JBET_PANEL_MODES.FIXED;
      fixedRadio.checked = settings.mode === JBET_PANEL_MODES.FIXED;
      fixedLabel.append(fixedRadio, document.createTextNode(' Fixed Place'));

      modeRow.append(contentLabel, fixedLabel);

      const preview = document.createElement('div');
      preview.className = 'jbet-placement-preview';
      preview.style.cssText = [
        'position:relative',
        'height:245px',
        'overflow:hidden',
        'border:2px solid #222',
        'border-radius:3px',
        'background:#cfcfcf'
      ].join(';');

      const topbar = document.createElement('div');
      topbar.style.cssText = 'position:absolute;left:0;right:0;top:0;height:36px;background:#777;border-bottom:2px solid #333;text-align:center;font-size:10px;font-weight:bold;line-height:36px;';
      topbar.textContent = 'TOPBAR / TOPBAR MENU';

      const leftPanel = document.createElement('div');
      leftPanel.style.cssText = 'position:absolute;left:0;top:38px;bottom:0;width:18%;background:#e3e3e3;border-right:1px solid #888;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;writing-mode:vertical-rl;transform:rotate(180deg);';
      leftPanel.textContent = 'LEFT PANEL';

      const contentArea = document.createElement('div');
      contentArea.style.cssText = 'position:absolute;left:18%;top:38px;bottom:0;width:40%;background:#f7f7f7;border-right:2px solid #444;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;';
      contentArea.textContent = 'CONTENT AREA';

      const safeArea = document.createElement('div');
      safeArea.className = 'jbet-safe-area';
      safeArea.style.cssText = 'position:absolute;left:58%;right:0;top:38px;bottom:0;background:#ddd;';

      const shade = document.createElement('div');
      shade.className = 'jbet-placement-shade';
      shade.style.cssText = 'position:absolute;border:1px dashed #2f8fbc;background:rgba(47,143,188,.18);pointer-events:none;';

      const points = {
        'top-left': [8, 13],
        'top-right': [92, 13],
        'middle-left': [8, 50],
        'middle-right': [92, 50],
        'bottom-left': [8, 87],
        'bottom-right': [92, 87],
        'open-area': [50, 50]
      };

      for (const [anchorName, [x, y]] of Object.entries(points)) {
        const label = document.createElement('label');
        label.style.cssText = `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;`;

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'jbet-panel-anchor';
        radio.value = anchorName;
        radio.checked = settings.anchor === anchorName;
        radio.style.cursor = 'pointer';

        radio.addEventListener('change', () => {
          const next = saveJbetPanelPlacement({
            mode: JBET_PANEL_MODES.FIXED,
            anchor: anchorName
          });
          fixedRadio.checked = true;
          contentRadio.checked = false;
          applyJbetPanelPlacement(panel, next);
          updateJbetPlacementDialogPreview(dialog);
        });

        label.appendChild(radio);
        safeArea.appendChild(label);
      }

      safeArea.appendChild(shade);
      preview.append(topbar, leftPanel, contentArea, safeArea);

      const detail = document.createElement('div');
      detail.className = 'jbet-placement-detail';
      detail.style.cssText = 'margin-top:7px;padding:6px 7px;border:1px solid #bbb;border-radius:3px;background:#fff;font:10px/1.35 Consolas,monospace;white-space:normal;';

      const onModeChange = () => {
        const mode = contentRadio.checked
          ? JBET_PANEL_MODES.CONTENT_END
          : JBET_PANEL_MODES.FIXED;

        const next = saveJbetPanelPlacement({ mode });
        applyJbetPanelPlacement(panel, next);
        updateJbetPlacementDialogPreview(dialog);
      };

      contentRadio.addEventListener('change', onModeChange);
      fixedRadio.addEventListener('change', onModeChange);

      dialog.append(heading, modeRow, preview, detail);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', event => {
        if (event.target === overlay) overlay.remove();
      });

      updateJbetPlacementDialogPreview(dialog);
    }

    function updateJbetPlacementDialogPreview(dialog) {
      if (!dialog) return;

      const settings = loadJbetPanelPlacement();
      const preview = dialog.querySelector('.jbet-placement-preview');
      const safeArea = dialog.querySelector('.jbet-safe-area');
      const shade = dialog.querySelector('.jbet-placement-shade');
      const detail = dialog.querySelector('.jbet-placement-detail');
      const anchorInputs = Array.from(dialog.querySelectorAll('input[name="jbet-panel-anchor"]'));

      const enabled = settings.mode === JBET_PANEL_MODES.FIXED;

      for (const input of anchorInputs) {
        input.disabled = !enabled;
      }

      if (safeArea) safeArea.style.opacity = enabled ? '1' : '.45';
      if (shade) shade.style.display = enabled ? 'block' : 'none';

      if (shade && enabled) {
        const styles = {
          'top-left':     ['6%', '8%', '42%', '52%'],
          'top-right':    ['52%', '8%', '42%', '52%'],
          'middle-left':  ['6%', '5%', '42%', '90%'],
          'middle-right': ['52%', '5%', '42%', '90%'],
          'bottom-left':  ['6%', '40%', '42%', '52%'],
          'bottom-right': ['52%', '40%', '42%', '52%'],
          'open-area':    ['5%', '5%', '90%', '90%']
        };

        const [left, top, width, height] = styles[settings.anchor] || styles['top-left'];
        shade.style.left = left;
        shade.style.top = top;
        shade.style.width = width;
        shade.style.height = height;
      }

      if (!detail) return;

      if (!enabled) {
        detail.textContent =
          'Content End: Panel is placed after the last UI item in the Content Area.';
        return;
      }

      const descriptions = {
        'top-left': 'Top-Left: Close to the Content Area, fills 60% of the available height.',
        'top-right': 'Top-Right: Close to the right viewport edge, fills 60% of the available height.',
        'middle-left': 'Middle-Left: Close to the Content Area, fills the available height.',
        'middle-right': 'Middle-Right: Close to the right viewport edge, fills the available height.',
        'bottom-left': 'Bottom-Left: Close to the Content Area, fills 60% of the available height upward.',
        'bottom-right': 'Bottom-Right: Close to the right viewport edge, fills 60% of the available height upward.',
        'open-area': 'Open Area: Fills the available space between the Content Area and viewport bounds.'
      };

      detail.textContent = descriptions[settings.anchor] || '';
    }

    function makeJungleImportButton(rows, state) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.justifyContent = 'center';
      wrap.style.alignItems = 'center';
      wrap.style.height = '100%';

      const btn = document.createElement('a');
      btn.href = '#';
      btn.className = 'btn light-blue hover-green';
      btn.textContent = 'IMPORT FROM...';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.width = '90%';
      btn.style.height = '24px';
      btn.style.whiteSpace = 'nowrap';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = 'bold';
      btn.style.textTransform = 'uppercase';
      btn.style.paddingTop = '7px';
      btn.style.paddingBottom = '7px';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openJungleImportPicker(rows, state);
      });

      wrap.appendChild(btn);
      return wrap;
    }

    function openJungleImportPicker(rows, state) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,text/plain';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
          const imported = parseJungleExportText(String(reader.result || ''));
          if (!imported.length) {
            alert('No valid Jungle rows found in that file.');
            return;
          }

          const merged = mergeJungleRows(rows, imported);
          const rebuilt = rebuildTStateFromRows(merged);
          saveEntries(merged);
          publishCrrJungleEntries(merged);
          saveTState(rebuilt);
          jungleImportOpen = false;
          entries = merged;
          tState = rebuilt;
          render(merged, rebuilt);
          alert(`Imported ${merged.length - rows.length} new Jungle row(s) from ${imported.length} parsed row(s).`);
        };
        reader.readAsText(file);
      });

      document.body.appendChild(input);
      input.click();
    }

    function parseJungleExportText(src) {
      const rows = [];
      const lines = String(src || '').split(/\r?\n/);

      for (const line of lines) {
        // Preserve the fixed-width blank first column after "<". Do NOT use "<\s*" here:
        // that strips the STR blank cell and makes the first separator look like data.
        const m = line.match(/^(\d{2}\s+[A-Z]{3})-(\d{2}):(\d{2})\s*<([\s\S]*?)>\s*(?:#\d+)?\s*$/i);
        if (!m) continue;

        const dateKey = m[1].toUpperCase();
        const hour = pad(parseInt(m[2], 10));
        const minute = pad(parseInt(m[3], 10));
        const parts = m[4].split(' - ');
        if (parts.length !== 5) continue;

        const str = parseOptionalFloat(parts[0]);
        const pow = parseOptionalFloat(parts[1]);
        const spd = parseOptionalFloat(parts[2]);
        const mlg = parseOptionalInt(parts[3]);
        const t = parseOptionalInt(parts[4]);

        if (str == null && pow == null && spd == null && mlg == null) continue;

        rows.push({
          ts: `${dateKey}-${hour}:${minute}`,
          hourKey: `${dateKey}-${hour}`,
          color: null,
          str,
          pow,
          spd,
          mlg,
          mlgColor: mlg != null ? 'blue' : null,
          t: t == null ? 0 : t
        });
      }

      return rows;
    }

    function parseOptionalFloat(v) {
      const s = String(v || '').trim();
      if (!s) return null;
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }

    function parseOptionalInt(v) {
      const s = String(v || '').trim();
      if (!s) return null;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    }

    function mergeJungleRows(existing, imported) {
      const out = existing.slice();
      const existingCounts = new Map();

      for (const row of existing) {
        const key = jungleRowKey(row);
        existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
      }

      for (const row of imported) {
        const key = jungleRowKey(row);
        const count = existingCounts.get(key) || 0;
        if (count > 0) {
          existingCounts.set(key, count - 1);
          continue;
        }
        out.push(row);
      }

      return sortJungleRows(out);
    }

    function jungleRowKey(r) {
      return [
        r.ts || '',
        String(r.str ?? ''),
        String(r.pow ?? ''),
        String(r.spd ?? ''),
        String(r.mlg ?? ''),
        String(r.t ?? '')
      ].join('|');
    }

    function sortJungleRows(rows) {
      return rows.slice().sort((a, b) => jungleSortValue(b) - jungleSortValue(a));
    }

    function jungleSortValue(r) {
      const m = String(r.ts || '').match(/^(\d{2})\s+([A-Z]{3})-(\d{2}):(\d{2})$/i);
      if (!m) return 0;
      const monthMap = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
      const day = parseInt(m[1], 10) || 0;
      const month = monthMap[m[2].toUpperCase()] || 0;
      const hour = parseInt(m[3], 10) || 0;
      const minute = parseInt(m[4], 10) || 0;
      return (((month * 32 + day) * 24 + hour) * 60 + minute);
    }

    function rebuildTStateFromRows(rows) {
      const state = normalizeTState({});
      for (const r of rows) {
        const t = parseInt(r.t, 10);
        if (!Number.isFinite(t) || t < 0) continue;
        state.totalT += t;
        if (r.hourKey) state.hourT[r.hourKey] = (state.hourT[r.hourKey] || 0) + t;
      }
      state.epochT = 0;
      return state;
    }

    function orderedHourKeys(rows, state) {
      const out = [];
      const seen = new Set();

      for (const r of rows) {
        if (r.hourKey && !seen.has(r.hourKey)) {
          seen.add(r.hourKey);
          out.push(r.hourKey);
        }
      }

      const current = currentHourKey(rows);
      const hasCurrentT = state.hourT && state.hourT[current] > 0;
      if (hasCurrentT && !seen.has(current)) out.unshift(current);

      return out;
    }

    function currentHourKey(rows) {
      if (rows.length > 0 && rows[0].hourKey) return rows[0].hourKey;

      const clockEl = document.querySelector('#clock');
      const text = document.body ? (document.body.textContent || '') : '';
      const now = clockEl ? parseClock(clockEl.textContent || '') : null;
      const dayText = String(getDayText(text)).padStart(2, '0');
      const monthText = getMonthText(text);
      if (!now) return `${dayText} ${monthText}-00`;
      return `${dayText} ${monthText}-${pad(now.h)}`;
    }

    function makeSeparator() {
      const row = document.createElement('div');
      row.className = 'jbgl-hour-separator';
      row.style.whiteSpace = 'nowrap';
      row.style.overflow = 'hidden';
      row.style.color = '#a98';
      row.style.textAlign = 'center';
      row.style.lineHeight = '.6';
      row.style.textDecorationColor = '#d8c8b888';
      return row;
    }

    function updateJbetSeparators(body) {
      if (!body) return;

      const unit = '- - - - ';
      const repeatCount = Math.max(1, Math.floor(body.clientWidth / 48.5));
      const value = unit.repeat(repeatCount).trimEnd();

      for (const separator of body.querySelectorAll('.jbgl-hour-separator')) {
        separator.textContent = value;
      }
    }

    function bindJbetSeparatorResize(body) {
      if (!body || body.dataset.jbglSeparatorResizeBound === '1') return;
      body.dataset.jbglSeparatorResizeBound = '1';

      if (typeof ResizeObserver !== 'function') return;

      const observer = new ResizeObserver(() => updateJbetSeparators(body));
      observer.observe(body);
    }

    function styleJbetGridRow(row) {
      row.style.display = 'grid';
      row.style.gridTemplateColumns = JBET_ROW_GRID;
      row.style.alignItems = 'center';
      row.style.width = '100%';
      row.style.boxSizing = 'border-box';
      row.style.whiteSpace = 'nowrap';
      return row;
    }

    function makeJbetLabelCell(text, marker = '<') {
      const cell = document.createElement('span');
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'space-between';
      cell.style.minWidth = '0';
      cell.style.paddingRight = '4px';

      const value = document.createElement('span');
      value.style.overflow = 'hidden';
      value.style.textOverflow = 'ellipsis';
      value.textContent = String(text || '');
      cell.appendChild(value);

      if (marker) {
        const mark = document.createElement('span');
        mark.textContent = marker;
        cell.appendChild(mark);
      }

      return cell;
    }

    function makeJbetDataCell(text, color = '') {
      const cell = document.createElement('span');
      cell.style.display = 'grid';
      cell.style.gridTemplateColumns = 'auto 1fr';
      cell.style.alignItems = 'center';
      cell.style.minWidth = '0';

      const sep = document.createElement('span');
      sep.textContent = '|';
      sep.style.color = '#666';
      sep.style.opacity = '0.7';
      cell.appendChild(sep);

      const value = document.createElement('span');
      value.style.textAlign = 'center';
      value.style.minWidth = '0';
      value.style.overflow = 'hidden';
      value.style.textOverflow = 'ellipsis';
      value.textContent = String(text ?? '');
      if (color) value.style.color = color;
      cell.appendChild(value);

      return cell;
    }

    function makeJbetPlainCell(text, color = '') {
      const cell = document.createElement('span');
      cell.style.minWidth = '0';
      cell.style.textAlign = 'center';
      cell.style.overflow = 'hidden';
      cell.style.textOverflow = 'ellipsis';
      cell.textContent = String(text ?? '');
      if (color) cell.style.color = color;
      return cell;
    }

    function makeTextRow(leftText, totals, isLegend = false, qty = '') {
      const row = styleJbetGridRow(document.createElement('div'));
      row.appendChild(makeJbetLabelCell(leftText));

      const cols = ['str', 'pow', 'spd', 'mlg', 't'];
      cols.forEach(key => {
        let text;
        let color = '';

        if (isLegend || !totals) {
          text = panelHeaderText(key).trim();
        } else {
          text = key === 'mlg'
            ? fmtPanelInt(totals[key], 4, '----')
            : key === 't'
              ? fmtPanelInt(totals[key], 3, '---')
              : fmtPanelStat(totals[key]);
          color = cellColor(key, null);
        }

        row.appendChild(makeJbetDataCell(text, color));
      });

      row.appendChild(makeJbetPlainCell(qty, qty !== '' ? '#d860a8' : ''));
      row.appendChild(makeJbetPlainCell(''));
      return row;
    }

    function makeTotalsRow(label, totals) {
      return makeTextRow(label, totals, false);
    }

    function countHourEvents(rows, hourKey) {
      let count = 0;
      for (const row of rows) {
        if (row && row.hourKey === hourKey) count += 1;
      }
      return count;
    }

    function makeHourHeader(hourKey, totals, berryCount, collapsed, rows, state) {
      const row = makeTextRow(formatHourLabel(hourKey), totals, false, berryCount);
      const qtyCell = row.children[6];
      if (qtyCell) qtyCell.title = `${berryCount} berry event${berryCount === 1 ? '' : 's'}`;

      const actionCell = row.children[7];
      const collapseBtn = document.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.style.cursor = 'pointer';
      collapseBtn.style.borderRadius = '3px';
      collapseBtn.style.fontSize = '8px';
      collapseBtn.style.padding = '1px 2px';
      collapseBtn.style.lineHeight = '9px';
      collapseBtn.style.fontFamily = 'Consolas, monospace';
      collapseBtn.style.backgroundColor = collapsed ? '#dfd' : '#fdd';
      collapseBtn.title = collapsed ? 'Expand hour' : 'Collapse hour';
      collapseBtn.textContent = collapsed ? '[+]' : '[-]';
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

      collapseBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const map = loadCollapsedHours();
        map[hourKey] = !collapsed;
        saveCollapsedHours(map);
        render(rows, state);
      });

      if (actionCell) actionCell.appendChild(collapseBtn);
      return row;
    }

    function makeEventRow(rowData) {
      const row = styleJbetGridRow(document.createElement('div'));
      row.appendChild(makeJbetLabelCell(eventTimeLabel(rowData)));

      const cells = ['str', 'pow', 'spd', 'mlg', 't'];
      cells.forEach(key => {
        const text = key === 'mlg'
          ? fmtPanelInt(rowData[key], 4, '----')
          : key === 't'
            ? fmtPanelInt(rowData[key], 3, '---')
            : fmtPanelStat(rowData[key]);

        const color = rowData[key] != null
          ? cellColor(key, rowData)
          : '#44444488';

        row.appendChild(makeJbetDataCell(text, color));
      });

      row.appendChild(makeJbetPlainCell(''));
      row.appendChild(makeJbetPlainCell(''));
      return row;
    }

    function makeFooterTotalsRow(label, totals) {
      const row = styleJbetGridRow(document.createElement('div'));
      const labelCell = makeJbetLabelCell(label);
      const labelValue = labelCell.firstElementChild;
      if (labelValue) labelValue.style.margin = '0 15px 0 auto';
      row.appendChild(labelCell);

      const cols = ['str', 'pow', 'spd', 'mlg', 't'];
      cols.forEach(key => {
        const text = key === 'mlg' || key === 't'
          ? fmtTotal(totals[key], true)
          : fmtTotal(totals[key], false);
        row.appendChild(makeJbetDataCell(text, cellColor(key, null)));
      });

      const berryCount = Number(totals && totals.berries) || 0;
      const qtyCell = makeJbetPlainCell(berryCount, '#d860a8');
      qtyCell.title = 'Total berry events';
      row.appendChild(qtyCell);
      row.appendChild(makeJbetPlainCell(''));
      return row;
    }

    function panelHeaderText(key) {
      const labels = { str: 'STR', pow: 'POW', spd: 'SPD', mlg: 'MLG', t: 'T' };
      return String(labels[key] || '').padStart(panelColChars(key), ' ');
    }

    function panelColChars(key) {
      if (key === 'mlg') return 4;
      if (key === 't') return 3;
      return 6;
    }

    function fmtPanelStat(v) {
      if (v == null) return '---.--';
      return Number(v).toFixed(2).padStart(6, ' ');
    }

    function fmtPanelInt(v, width, empty) {
      if (v == null) return empty;
      return String(Math.round(Number(v) || 0)).padStart(width, ' ');
    }

    function formatHourLabel(hourKey) {
      const m = String(hourKey || '').match(/^(\d{2}\s+[A-Z]{3})-(\d{2})$/i);
      if (!m) return String(hourKey || 'HOUR');
      return `${m[1].toUpperCase()} ${m[2]}:00`;
    }

    function eventTimeLabel(rowData) {
      if (rowData && /^\d{2}:\d{2}:\d{2}$/.test(String(rowData.timeFull || ''))) {
        return String(rowData.timeFull);
      }

      const m = String(rowData && rowData.ts || '').match(/-(\d{2}):(\d{2})$/);
      if (m) return `${m[1]}:${m[2]}:--`;
      return '--:--:--';
    }

    function exportRows(rows, state) {
      const lines = [];
      lines.push('DD MMM-HH:mm <  STR  -  POW  -  SPD  -  MLG -    T >');

      const hours = orderedHourKeys(rows, state);
      hours.forEach((hk, i) => {
        if (i > 0) lines.push('='.repeat(52));
        lines.push(formatExportTotals('HOUR', makeHourTotals(rows, state, hk)));
        for (const r of rows) {
          if (r.hourKey === hk) lines.push(formatExportEvent(r));
        }
      });

      lines.push('-'.repeat(52));
      lines.push(formatExportTotals('TOTAL', makeTotalTotals(rows, state)));

      const clockEl = document.querySelector('#clock');
      if (!clockEl) return;

      const clockText = clockEl.innerText.replace(/\s+/g, ' ').trim();
      const clockMatch = clockText.match(/(\d{1,2}):(\d{2}):\d{2}\s*([ap]m)/i);
      if (!clockMatch) return;

      let hour = parseInt(clockMatch[1], 10);
      const minute = String(clockMatch[2]).padStart(2, '0');
      const ap = clockMatch[3].toLowerCase();

      if (ap === 'am') {
        if (hour === 12) hour = 0;
      } else {
        if (hour !== 12) hour += 12;
      }

      hour = String(hour).padStart(2, '0');

      const pageText = document.body.innerText.replace(/\s+/g, ' ');
      const monthMatch = pageText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
      const dayMatch = pageText.match(/\b([1-9]|[12]\d|3[01])(st|nd|rd|th)\b/i);

      const monthMap = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };

      const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : '00';
      const day = dayMatch ? String(dayMatch[1]).padStart(2, '0') : '00';

      const filename = `Jungle - ${month}-${day} ${hour}:${minute}.txt`;

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    }

    function formatExportEvent(r) {
      return [
        r.ts.padEnd(13, ' '),
        '< ',
        fmtEvent(r.str, false), ' - ',
        fmtEvent(r.pow, false), ' - ',
        fmtEvent(r.spd, false), ' - ',
        fmtEvent(r.mlg, true), ' - ',
        fmtEvent(r.t, true),
        ' >'
      ].join('');
    }

    function formatExportTotals(label, t) {
      return [
        label.padEnd(13, ' '),
        '< ',
        fmtTotal(t.str, false), ' - ',
        fmtTotal(t.pow, false), ' - ',
        fmtTotal(t.spd, false), ' - ',
        fmtTotal(t.mlg, true), ' - ',
        fmtTotal(t.t, true),
        ' >'
      ].join('');
    }

  })();

  /* ===== HW Mines Telemetry Tracker.user.js ===== */
  (function () {
      'use strict';

      const href = String(location.href || '');
      const isMines = /[?&]cmd=mines(?:[&#]|$)/i.test(href);
      if (!isMines) return;

      const isTradePage =
        /[?&]do=trade(?:[&#]|$)/i.test(href);

      const isBlastPage =
        /[?&]blast=(?:north|south|east|west)(?:[&#]|$)/i.test(href);

      const isMineInterior =
        !isTradePage &&
        !isBlastPage;

      const SCRIPT_VERSION =
            (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version)
      ? GM_info.script.version
      : '?.?.?';

      const STORAGE_SCHEMA = '2';

      const K_STATE = `mtt_state_schema_${STORAGE_SCHEMA}`;
      const K_ROWS = `mtt_rows_schema_${STORAGE_SCHEMA}`;
      const K_LAST_FP = `mtt_last_fp_schema_${STORAGE_SCHEMA}`;
      const K_SUMMARY = `mtt_summary_schema_${STORAGE_SCHEMA}`;
      const K_STOCK = `mtt_stock_schema_${STORAGE_SCHEMA}`;
      const K_TRADE_TABLE = `mtt_trade_table_schema_${STORAGE_SCHEMA}`;
      const K_TRADE_LEDGER = `mtt_trade_ledger_schema_${STORAGE_SCHEMA}`;
      const K_TRADE_RECON = `mtt_trade_recon_schema_${STORAGE_SCHEMA}`;
      const K_SWIM_DAILY = `mtt_swim_daily_schema_${STORAGE_SCHEMA}`;
      const K_COLLAPSED_DAYS = `mtt_collapsed_days_schema_${STORAGE_SCHEMA}`;
      const K_HOBALT_COLLAPSED = `mtt_hobalt_collapsed_schema_${STORAGE_SCHEMA}`;
      const K_BL_COLLAPSED = `mtt_collapsed_bl_schema_${STORAGE_SCHEMA}`;
      const K_MINE_DAY_LOG = `mtt_mine_day_log_schema_${STORAGE_SCHEMA}`;
      const K_MINING_LOG = 'hw_mining_log_test_v1';
      const K_TOPBAR_LAST_TRADE = `mtt_topbar_last_trade_bridge_v1`;
      const K_PANEL_MODE = 'mtt_panel_mode_v1';
      const K_PANEL_ANCHOR = 'mtt_panel_anchor_v1';
      const K_MINE_INTERIOR_LAYOUT = 'mtt_mine_interior_layout_v1';
      const K_CURRENT_PLAYER_ID = 'mtt_current_player_id_v1';

      const MAX_ROWS = 4650;
      const PANEL_WIDTH = 410;

      const MTT_PANEL_MODES = Object.freeze({
          FIXED: 'fixed',
          CONTENT_END: 'content-end'
      });

      const MTT_MINE_INTERIOR_LAYOUTS = Object.freeze({
          NATIVE: 'native',
          THREE_COLUMN: 'three-column'
      });

      const MTT_PANEL_ANCHORS = Object.freeze([
          'top-left',
          'top-right',
          'middle-left',
          'middle-right',
          'bottom-left',
          'bottom-right',
          'open-area'
      ]);

      const MTT_PANEL_GUTTER = Object.freeze({
          topChrome: 5,
          side: 15,
          bottom: 15,
          legendOverhang: 8
      });

      let mttPlacementResizeBound = false;

      const ORE_IDS = {
          228: 'Ch',
          232: 'Sh',
          240: 'Gr',
          241: 'Wh',
          242: 'Ye',
          243: 'Or',
          244: 'Re',
          245: 'Pu',
          251: 'Bl'
      };

      const ORE_NAMES = {
          'Hobalt Chunk': 'Ch',
          'Hobalt Shard': 'Sh',
          'Green Ore': 'Gr',
          'White Ore': 'Wh',
          'Yellow Ore': 'Ye',
          'Orange Ore': 'Or',
          'Red Ore': 'Re',
          'Purple Ore': 'Pu',
          'Black Ore': 'Bl'
      };

      const STOCK_ORDER = ['Sh', 'Ch', 'Gr', 'Wh', 'Ye', 'Or', 'Re', 'Pu', 'Bl'];
      const MINE_STOCK_ORDER = ['Ch', 'Sh', 'Gr', 'Wh', 'Ye', 'Or', 'Re', 'Pu', 'Bl'];
      const TRADE_ORES = ['Gr', 'Wh', 'Ye', 'Or', 'Re', 'Pu', 'Bl'];

      const COLORS = {
          panelBg: '#000000',
          border: '#2f8fbc',
          title: '#e7e7e7',
          text: '#DDDDDD',
          dim: '#777777',
          net: '#e6e6e6',

          Gr: '#37d45a',
          Wh: '#fafafa',
          Ye: '#ffd94a',
          Or: '#ff9a2f',
          Re: '#ff4b4b',
          Pu: '#b86cff',
          Bl: '#9a9a9a',
          Sh: '#66d9ff',
          Ch: '#c8c8ff',

          str: '#88ff88',
          spd: '#eeee00',
          pow: '#ff8800',
          tbs: '#fafafa',
          mine: '#e6e6e6'
      };

      const SOURCE_COLORS = {
          str: COLORS.str,
          spd: COLORS.spd,
          pow: COLORS.pow,
          tbs: COLORS.tbs,
          life: COLORS.life,
          traded: '#848484'
      };

      const ORE_ICON_COLORS = {
          Gr: ['#70f080', '#249a3d', 'rgba(255,255,255,0.38)'],
          Wh: ['#f4f4f4', '#888888', 'rgba(255,255,255,0.65)'],
          Ye: ['#ffd84a', '#b88b00', 'rgba(255,255,255,0.42)'],
          Or: ['#ff9a32', '#b85800', 'rgba(255,255,255,0.36)'],
          Re: ['#ff4545', '#9a1111', 'rgba(255,255,255,0.32)'],
          Pu: ['#c58cff', '#7630a8', 'rgba(255,255,255,0.34)'],
          Bl: ['#666666', '#181818', 'rgba(255,255,255,0.22)'],
          Xx: ['#cccccc', '#666666', 'rgba(255,255,255,0.30)']
      };

      const text = document.body ? (document.body.textContent || '') : '';
      const visibleText = document.body ? (document.body.innerText || text) : text;
      const clock = parseClock(document.querySelector('#clock')?.textContent || '');
      const dayKey = getDayKey(text);
      const level = parseLevel();

      let state = loadState();
      let rows = loadRows();

      const rawSummary = parseMineSummary(text);
      updatePersistedSummary(rawSummary);
      const summary = mergeWithPersistedSummary(rawSummary);

      const stock = parseOreStock();
      const rawTradePost = parseTradePost();
      const persistedTradePost = mergeWithPersistedTradeTable(rawTradePost);
      const tradePost = applyMineInteriorPreviewCounts(
          persistedTradePost,
          stock
      );
      const depotNetStatGain = isTradePage
          ? parseNativeNetStatGain()
          : null;
      persistMiningLogTradeStatGain(depotNetStatGain);
      const completedTrade = parseCompletedTradeResult();
      publishTopbarLastTrade(completedTrade, summary);
      const tradeLedger = updateAndLoadTradeLedger(completedTrade, tradePost);
      const currentDayTrades = getCurrentDayTrades(tradeLedger.trades);
      const tradeRecon = buildTradeReconciliationState(tradeLedger, tradePost, completedTrade, currentDayTrades);
      const dailyTotals = calcTradeTotals(currentDayTrades);
      const tradeGroups = groupTradeRuns(currentDayTrades);
      const tradeDays = groupTradeDays(tradeLedger.trades);
      const swimDaily = updateAndLoadSwimDaily();
      const dailyBalance = calcDailyTbsBalance(swimDaily, dailyTotals);
      const mineDayLog = updateAndLoadMineDayLog(summary, currentDayTrades);

      const snapshot = {
          dayKey,
          level,
          mining: summary.mining,
          found: summary.found,
          foundShards: summary.foundShards,
          traded: summary.traded,
          tradedShards: summary.tradedShards,
          tUsed: summary.tUsed,
          actualOreT: calcOreT(summary.found, summary.tUsed),
          impliedOreT: calcOreT(
              Number.isFinite(summary.found) && Number.isFinite(summary.foundShards)
              ? summary.found + summary.foundShards * 2
              : null,
              summary.tUsed
          ),
          stock,
          tradePost,
          depotNetStatGain,
          completedTrade,
          tradeLedger,
          tradeRecon,
          currentDayTrades,
          dailyTotals,
          tradeGroups,
          tradeDays,
          swimDaily,
          dailyBalance,
          mineDayLog,
          time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : ''
      };

      maybeRecordSnapshot(snapshot);
      applyMttMineInteriorLayout();
      render(snapshot, rows, state);
      renderTradingPostBalance(snapshot);
      renderDepotTradeCards(snapshot);

      if (isBlastPage) {
          document.addEventListener('keydown', event => {
              if (event.code !== 'Space' || event.repeat) return;

              const target = event.target;

              if (
                  target instanceof HTMLInputElement ||
                  target instanceof HTMLTextAreaElement ||
                  target instanceof HTMLSelectElement ||
                  target?.isContentEditable
              ) {
                  return;
              }

              event.preventDefault();
              event.stopPropagation();

              const url = new URL(location.href);
              url.searchParams.delete('blast');

              location.assign(url.href);

          }, true);
      }

      function applyMttMineInteriorLayout() {
          if (!isMineInterior) return;
          if (
              loadMttMineInteriorLayout() !==
              MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN
          ) {
              return;
          }

          const content = document.querySelector('.content-area');
          if (!content || document.getElementById('mtt-mine-interior-grid')) {
              return;
          }

          const outerTable = Array.from(
              content.querySelectorAll(':scope > table[width="100%"]')
          ).find(table => {
              const row = table.rows && table.rows[0];
              if (!row || row.cells.length < 2) return false;

              return !!row.cells[0].querySelector(
                  'table[align="center"][width="250"]'
              );
          });

          if (!outerTable) return;

          const outerRow = outerTable.rows && outerTable.rows[0];
          if (!outerRow || outerRow.cells.length < 2) return;

          const nativeLeft = outerRow.cells[0];
          const nativeRight = outerRow.cells[1];

          const traversalTable = nativeLeft.querySelector(
              'table[align="center"][width="250"]'
          );
          if (!traversalTable) return;

          const mapTable = Array.from(nativeRight.querySelectorAll('table'))
              .find(table => {
                  const cell = table.querySelector(
                      'td[title][width="6"][height="6"], td[title="You!"]'
                  );
                  return !!cell;
              });

          if (!mapTable) return;

          const nativeStatsCenter = Array.from(
              nativeRight.querySelectorAll('center')
          ).find(center =>
              /\bMining\s*:/i.test(center.textContent || '') &&
              /\bOre found\s*:/i.test(center.textContent || '') &&
              /\bT used\s*:/i.test(center.textContent || '')
          );

          if (!nativeStatsCenter) return;

          const viewActiveLink = Array.from(
              nativeStatsCenter.querySelectorAll('a[href]')
          ).find(link =>
              /\bView Active\b/i.test(link.textContent || '')
          );

          if (!viewActiveLink) return;

          const viewActiveHref = viewActiveLink.href;
          const currentCoords = getMttTraversalCoords(traversalTable);
          const currentPlayerId = resolveMttCurrentPlayerId(content);

          const grid = document.createElement('div');
          grid.id = 'mtt-mine-interior-grid';
          grid.className = 'mtt-mine-interior-grid';
          grid.style.cssText = [
              'display:grid',
              'grid-template-columns:164px 250px minmax(0,1fr)',
              'align-items:stretch',
              'column-gap:6px',
              'width:100%',
              'box-sizing:border-box',
              'margin:0 0 8px'
          ].join(';');

          const mapColumn = document.createElement('div');
          mapColumn.className = 'mtt-mine-map-column';
          mapColumn.style.cssText = [
              'width:164px',
              'min-width:164px',
              'max-width:164px',
              'display:flex',
              'align-items:flex-start',
              'justify-content:flex-start',
              'margin-top:12px'
          ].join(';');

          const traversalColumn = document.createElement('div');
          traversalColumn.className = 'mtt-mine-traversal-column';
          traversalColumn.style.cssText = [
              'width:250px',
              'min-width:250px',
              'max-width:250px',
              'display:flex',
              'flex-direction:column',
              'align-items:center'
          ].join(';');

          const infoColumn = document.createElement('div');
          infoColumn.className = 'mtt-mine-info-column';
          infoColumn.style.cssText = [
              'min-width:0',
              'display:flex',
              'flex-direction:column',
              'align-items:center',
              'align-self:stretch',
              'margin-top:12px'
          ].join(';');

          // Move the native objects rather than recreating them.
          // Their internal traversal/map behavior remains entirely native.
          normalizeMttMineMapGeometry(mapTable);
          mapColumn.appendChild(mapTable);

          const navForm = nativeLeft.querySelector('#nav_form');
          if (navForm) {
              traversalColumn.appendChild(navForm);
          }

          traversalColumn.appendChild(traversalTable);

          const activeTable = buildMttActiveMinersTable(viewActiveLink);
          infoColumn.appendChild(activeTable);

          const statsBlock = buildMttNativeMiningStats(nativeStatsCenter);
          statsBlock.style.marginTop = 'auto';
          statsBlock.style.padding = '18px 0 22px';
          infoColumn.appendChild(statsBlock);

          grid.append(mapColumn, traversalColumn, infoColumn);
          outerTable.insertAdjacentElement('beforebegin', grid);
          outerTable.remove();

          populateMttActiveMiners(
              activeTable,
              viewActiveHref,
              currentPlayerId,
              currentCoords
          );
      }

      function normalizeMttMineMapGeometry(mapTable) {
          if (!mapTable) return;

          mapTable.setAttribute('cellspacing', '0');
          mapTable.setAttribute('cellpadding', '0');

          mapTable.style.setProperty('width', '164px', 'important');
          mapTable.style.setProperty('height', '244px', 'important');
          mapTable.style.setProperty('min-width', '164px', 'important');
          mapTable.style.setProperty('max-width', '164px', 'important');
          mapTable.style.setProperty('min-height', '244px', 'important');
          mapTable.style.setProperty('max-height', '244px', 'important');
          mapTable.style.setProperty('box-sizing', 'border-box', 'important');
          mapTable.style.setProperty('table-layout', 'fixed', 'important');
          mapTable.style.setProperty('border-collapse', 'separate', 'important');
          mapTable.style.setProperty('border-spacing', '0', 'important');
          mapTable.style.setProperty('border', '2px solid #000', 'important');
          mapTable.style.setProperty('margin', '0', 'important');

          for (const cell of mapTable.querySelectorAll('td')) {
              cell.setAttribute('width', '8');
              cell.setAttribute('height', '8');
              cell.style.setProperty('width', '8px', 'important');
              cell.style.setProperty('height', '8px', 'important');
              cell.style.setProperty('min-width', '8px', 'important');
              cell.style.setProperty('max-width', '8px', 'important');
              cell.style.setProperty('min-height', '8px', 'important');
              cell.style.setProperty('max-height', '8px', 'important');
              cell.style.setProperty('box-sizing', 'border-box', 'important');
              cell.style.setProperty('padding', '0', 'important');
              cell.style.setProperty('line-height', '0', 'important');
          }
      }

      function getMttTraversalCoords(traversalTable) {
          const text = String(traversalTable?.textContent || '');
          const match = text.match(/\b(\d+)\s*,\s*(\d+)\b/);

          return match
              ? { x: Number(match[1]), y: Number(match[2]) }
              : null;
      }

      function resolveMttCurrentPlayerId(content) {
          const outsideContent = Array.from(
              document.querySelectorAll('a[href*="cmd=player"][href*="ID="]')
          ).find(link => !link.closest('.content-area'));

          const outsideId = getMttPlayerIdFromHref(
              outsideContent && outsideContent.href
          );

          if (outsideId) {
              GM_setValue(K_CURRENT_PLAYER_ID, outsideId);
              return outsideId;
          }

          const stored = String(GM_getValue(K_CURRENT_PLAYER_ID, '') || '');
          if (/^\d+$/.test(stored)) {
              return stored;
          }

          // Result prose can contain links to other hobos, so links inside the
          // Content Area are deliberately not used to establish self identity.
          return '';
      }

      function getMttPlayerIdFromHref(hrefValue) {
          if (!hrefValue) return '';

          try {
              const url = new URL(hrefValue, location.href);
              const id = String(url.searchParams.get('ID') || '');
              return /^\d+$/.test(id) ? id : '';
          } catch {
              const match = String(hrefValue).match(/[?&]ID=(\d+)/i);
              return match ? match[1] : '';
          }
      }

      function buildMttActiveMinersTable(viewActiveLink) {
          const table = document.createElement('table');
          table.className = 'mtt-active-miners-table';
          table.style.cssText = [
              'width:100%',
              'max-width:none',
              'min-width:0',
              'table-layout:fixed',
              'border-collapse:collapse',
              'border:1px solid #999',
              'font:11px/1.25 Arial,sans-serif',
              'background:#fff',
              'color:#111'
          ].join(';');

          const thead = document.createElement('thead');
          const headRow = document.createElement('tr');
          const headCell = document.createElement('th');
          headCell.colSpan = 2;
          headCell.style.cssText = [
              'padding:3px 5px',
              'border-bottom:1px solid #999',
              'background:#ccc',
              'text-align:left',
              'font-size:12px'
          ].join(';');

          const headWrap = document.createElement('div');
          headWrap.style.cssText = [
              'display:flex',
              'align-items:center',
              'justify-content:space-between',
              'gap:8px',
              'min-width:0'
          ].join(';');

          const title = document.createElement('span');
          title.textContent = 'Active Miners';

          // Keep the native command trigger itself.
          viewActiveLink.remove();
          viewActiveLink.style.whiteSpace = 'nowrap';

          headWrap.append(title, viewActiveLink);
          headCell.appendChild(headWrap);
          headRow.appendChild(headCell);
          thead.appendChild(headRow);

          const tbody = document.createElement('tbody');
          tbody.className = 'mtt-active-miners-body';

          table.append(thead, tbody);
          return table;
      }

      function buildMttNativeMiningStats(nativeStatsCenter) {
          const block = document.createElement('div');
          block.className = 'mtt-native-mining-stats';
          block.style.cssText = [
              'font:12px/1.35 Arial,sans-serif',
              'text-align:center',
              'white-space:nowrap'
          ].join(';');

          const lines = splitMttNativeCenterLines(nativeStatsCenter);
          const wanted = lines.filter(nodes => {
              const text = normalizeMttSpace(
                  nodes.map(node => node.textContent || '').join(' ')
              );

              return /^(?:Mining|Ore found|Ore traded|T used)\s*:/i.test(text);
          });

          wanted.forEach((nodes, index) => {
              for (const node of nodes) {
                  block.appendChild(node.cloneNode(true));
              }

              if (index < wanted.length - 1) {
                  block.appendChild(document.createElement('br'));
              }
          });

          return block;
      }

      function splitMttNativeCenterLines(center) {
          const lines = [];
          let current = [];

          for (const node of Array.from(center.childNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
                  lines.push(current);
                  current = [];
                  continue;
              }

              current.push(node);
          }

          if (current.length) lines.push(current);
          return lines;
      }

      function normalizeMttSpace(value) {
          return String(value || '').replace(/\s+/g, ' ').trim();
      }

      async function populateMttActiveMiners(
          table,
          href,
          currentPlayerId,
          currentCoords
      ) {
          const tbody = table && table.querySelector('.mtt-active-miners-body');
          if (!tbody || !href) return;

          try {
              const response = await fetch(href, {
                  credentials: 'same-origin',
                  cache: 'no-store'
              });

              if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
              }

              const buffer = await response.arrayBuffer();
              const contentType = String(
                  response.headers.get('content-type') || ''
              );
              const charsetMatch = contentType.match(
                  /charset\s*=\s*["']?([^;"'\s]+)/i
              );

              let charset = charsetMatch
                  ? String(charsetMatch[1]).trim()
                  : 'windows-1252';

              if (/^(?:iso-8859-1|latin1|latin-1)$/i.test(charset)) {
                  charset = 'windows-1252';
              }

              let html;

              try {
                  html = new TextDecoder(charset).decode(buffer);
              } catch {
                  html = new TextDecoder('windows-1252').decode(buffer);
              }

              const doc = new DOMParser().parseFromString(html, 'text/html');
              const activeContent = doc.querySelector('.content-area');
              if (!activeContent) {
                  throw new Error('Active Mines content missing');
              }

              const sourceList = Array.from(activeContent.querySelectorAll('ul'))
                  .find(list =>
                      list.querySelector(
                          'a[href*="cmd=player"][href*="ID="]'
                      )
                  );

              if (!sourceList) {
                  renderMttActiveMinersEmpty(tbody);
                  return;
              }

              const parsed = Array.from(sourceList.children)
                  .filter(node => node.tagName === 'LI')
                  .map(parseMttActiveMinerLi)
                  .filter(Boolean);

              let fallbackSelfRemoved = false;

              const others = parsed.filter(entry => {
                  if (currentPlayerId && entry.id === currentPlayerId) {
                      return false;
                  }

                  if (
                      !currentPlayerId &&
                      !fallbackSelfRemoved &&
                      currentCoords &&
                      entry.x === currentCoords.x &&
                      entry.y === currentCoords.y
                  ) {
                      fallbackSelfRemoved = true;
                      return false;
                  }

                  return true;
              });

              if (!others.length) {
                  renderMttActiveMinersEmpty(tbody);
                  return;
              }

              const fragment = document.createDocumentFragment();

              for (const entry of others) {
                  fragment.appendChild(buildMttActiveMinerRow(entry));
              }

              tbody.replaceChildren(fragment);
          } catch {
              const row = document.createElement('tr');
              const cell = document.createElement('td');
              cell.colSpan = 2;
              cell.style.cssText = 'padding:4px 5px;text-align:center;';
              const italic = document.createElement('i');
              italic.textContent = 'Unable to load.';
              cell.appendChild(italic);
              row.appendChild(cell);
              tbody.replaceChildren(row);
          }
      }

      function parseMttActiveMinerLi(li) {
          const anchor = li.querySelector(
              'a[href*="cmd=player"][href*="ID="]'
          );
          if (!anchor) return null;

          const id = getMttPlayerIdFromHref(anchor.href);
          if (!id) return null;

          const text = normalizeMttSpace(li.textContent || '');
          const coords = text.match(/\bat\s+(\d+)\s*,\s*(\d+)\s*$/i);

          if (!coords) return null;

          return {
              id,
              x: Number(coords[1]),
              y: Number(coords[2]),
              anchor: anchor.cloneNode(true)
          };
      }

      function buildMttActiveMinerRow(entry) {
          const row = document.createElement('tr');

          const identity = document.createElement('td');
          identity.style.cssText = [
              'padding:2px 4px',
              'border-bottom:1px solid #bbb',
              'text-align:left',
              'white-space:nowrap',
              'overflow:hidden',
              'text-overflow:ellipsis'
          ].join(';');

          identity.appendChild(entry.anchor);
          identity.appendChild(document.createTextNode(` (${entry.id})`));

          const coords = document.createElement('td');
          coords.style.cssText = [
              'padding:2px 4px',
              'border-bottom:1px solid #bbb',
              'text-align:right',
              'white-space:nowrap'
          ].join(';');
          coords.textContent = `(${entry.x},${entry.y})`;

          row.append(identity, coords);
          return row;
      }

      function renderMttActiveMinersEmpty(tbody) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 2;
          cell.style.cssText = 'padding:4px 5px;text-align:center;';

          const italic = document.createElement('i');
          italic.textContent = 'No activity.';

          cell.appendChild(italic);
          row.appendChild(cell);
          tbody.replaceChildren(row);
      }

      function renderDepotTradeCards(s) {
          if (!isTradePage) return;

          const content = document.querySelector('.content-area');
          if (!content) return;

          if (
              document.getElementById('mtt-depot-trade') ||
              document.getElementById('mtt-trade-sh')
          ) {
              return;
          }

          const rows = Array.isArray(s && s.tradePost && s.tradePost.rows)
          ? s.tradePost.rows
          : [];

          const coreRows = ['Gr', 'Wh', 'Ye', 'Or', 'Re', 'Pu']
          .map(code => rows.find(row => row && row.code === code))
          .filter(Boolean);

          if (coreRows.length < 6) return;

          injectDepotTradeCardStyle();
          installMttTradeTooltip();

          const nativeHrefMap = getNativeTradeHrefMap();
          const helperTradeContainer = findHelperTradeCardsContainer(content);

          if (helperTradeContainer) {
              decorateHelperTradeCards(rows);

              const hobaltSection = buildMttTradeShardSection(s, nativeHrefMap);
              helperTradeContainer.insertAdjacentElement('afterend', hobaltSection);
              return;
          }

          const mttDepotTrade = document.createElement('div');
          mttDepotTrade.id = 'mtt-depot-trade';
          mttDepotTrade.className = 'mtt-depot-trade';

          const mttTradeCore = document.createElement('div');
          mttTradeCore.id = 'mtt-trade-core';
          mttTradeCore.className = 'mtt-trade-core';

          const ordered = ['Gr', 'Wh', 'Ye', 'Or', 'Re', 'Pu'];

          for (const code of ordered) {
              const row = rows.find(r => r && r.code === code);
              if (!row) continue;

              const card = buildMttTradeCoreCard(row, nativeHrefMap[code]);
              mttTradeCore.appendChild(card);
          }

          mttDepotTrade.appendChild(mttTradeCore);

          const mttTradeSide = document.createElement('div');
          mttTradeSide.id = 'mtt-trade-side';
          mttTradeSide.className = 'mtt-trade-side';

          mttTradeSide.appendChild(buildMttTradeMetaBox(s));

          const blackRow = rows.find(r => r && r.code === 'Bl');

          if (blackRow) {
              const mttTradeBl = buildMttTradeBlackCard(blackRow, nativeHrefMap.Bl);
              mttTradeSide.appendChild(mttTradeBl);
          }

          mttDepotTrade.appendChild(mttTradeSide);
          mttDepotTrade.appendChild(buildMttTradeShardSection(s, nativeHrefMap));

          const sourceTable = findNativeTradingPostTable();

          if (sourceTable && sourceTable.parentNode) {
              sourceTable.parentNode.insertBefore(mttDepotTrade, sourceTable);
          } else {
              content.appendChild(mttDepotTrade);
          }

          hideNativeCoreTradeRows();
          hideNativeBlackTradeRow();
          hideNativeHobaltTradeRows();
          hideNativeTradeMetaRow();
          polishNativeTradingPostChrome();
          hideNativeTradeHeaderRow();
      }

      function buildMttTradeCoreCard(row, href) {
          const code = String(row.code || '');
          const active = !!href && row.available !== false;

          const card = active
          ? document.createElement('a')
          : document.createElement('div');

          card.id = `mtt-trade-core-${code.toLowerCase()}`;
          card.className = [
              'mtt-trade-card',
              'mtt-trade-core-card',
              `mtt-trade-core-${code.toLowerCase()}`,
              active ? 'mtt-trade-active' : 'mtt-trade-disabled'
          ].join(' ');

          card.dataset.ore = code;
          card.dataset.kind = 'core';

          if (active) {
              card.href = href;
          }

          card.dataset.mttTip = buildMttTradeCardTip(row, active);
          card.removeAttribute('title');

          const iconWrap = document.createElement('div');
          iconWrap.className = 'mtt-trade-icon';
          iconWrap.innerHTML = buildOreHexIcon(code);

          const head = document.createElement('div');
          head.className = 'mtt-trade-card-head';

          const oreName = document.createElement('span');
          oreName.className = 'mtt-trade-ore-name';
          oreName.textContent = oreCodeToName(code);

          const oreCount = document.createElement('span');
          oreCount.className = 'mtt-trade-ore-count';
          oreCount.textContent = '(3)';

          head.appendChild(oreName);
          //head.appendChild(oreCount);

          const body = document.createElement('div');
          body.className = 'mtt-trade-card-body';

          const plus = document.createElement('div');
          plus.className = `mtt-trade-delta mtt-trade-plus mtt-stat-${statClass(row.plusStat)}`;
          plus.textContent = `+${fmtDepotTradeNumber(row.plus)} ${statLabel(row.plusStat)}`;

          const minus = document.createElement('div');
          minus.className = `mtt-trade-delta mtt-trade-minus mtt-stat-${statClass(row.minusStat)}`;
          minus.textContent = `-${fmtDepotTradeNumber(row.minus)} ${statLabel(row.minusStat)}`;

          body.appendChild(plus);
          body.appendChild(minus);

          const foot = document.createElement('div');
          foot.className = 'mtt-trade-card-foot';

          const remaining = document.createElement('span');
          remaining.className = 'mtt-trade-rem';

          if (Number.isFinite(row.remaining)) {
              remaining.textContent = `${fmtInt(row.remaining, 0)} rem`;
          } else {
              remaining.textContent = active ? 'ready' : 'locked';
          }

          foot.appendChild(remaining);

          card.appendChild(iconWrap);
          card.appendChild(head);
          card.appendChild(body);
          card.appendChild(foot);

          return card;
      }

      function buildMttTradeBlackCard(row, href) {
          const active = !!href && row.available !== false;

          const wrap = document.createElement('div');
          wrap.id = 'mtt-trade-bl';
          wrap.className = 'mtt-trade-bl mtt-trade-toggle-ready';

          const label = document.createElement('div');
          label.className = 'mtt-trade-section-label mtt-trade-bl-label';
          label.setAttribute('role', 'button');
          label.tabIndex = 0;

          const card = active
          ? document.createElement('a')
          : document.createElement('div');

          card.id = 'mtt-trade-bl-card';
          card.className = [
              'mtt-trade-card',
              'mtt-trade-bl-card',
              active ? 'mtt-trade-active' : 'mtt-trade-disabled'
          ].join(' ');

          card.dataset.ore = 'Bl';
          card.dataset.kind = 'black';

          if (active) {
              card.href = href;
          }

          card.dataset.mttTip = buildMttTradeCardTip(row, active);
          card.removeAttribute('title');

          const iconWrap = document.createElement('div');
          iconWrap.className = 'mtt-trade-icon';
          iconWrap.innerHTML = buildOreHexIcon('Bl');

          const head = document.createElement('div');
          head.className = 'mtt-trade-card-head';
          head.textContent = 'Black Ore';

          const body = document.createElement('div');
          body.className = 'mtt-trade-card-body';

          const plus = document.createElement('div');
          plus.className = 'mtt-trade-delta mtt-trade-plus mtt-stat-life';
          plus.textContent = `+${fmtDepotTradeNumber(row.plus)} ${statLabel(row.plusStat)}`;

          const minus = document.createElement('div');
          minus.className = 'mtt-trade-delta mtt-trade-minus mtt-stat-each';
          minus.textContent = `-${fmtDepotTradeNumber(row.minus)} each`;

          body.appendChild(plus);
          body.appendChild(minus);

          const foot = document.createElement('div');
          foot.className = 'mtt-trade-card-foot';

          const net = document.createElement('span');
          net.className = 'mtt-trade-net';
          net.textContent = `NET ${fmtSigned(row.tbsNet, 5)}`;

          const remaining = document.createElement('span');
          remaining.className = 'mtt-trade-rem';

          if (Number.isFinite(row.remaining)) {
              remaining.textContent = `${fmtInt(row.remaining, 0)} rem`;
          } else {
              remaining.textContent = active ? 'ready' : 'locked';
          }

          foot.appendChild(net);
          foot.appendChild(remaining);

          card.appendChild(iconWrap);
          card.appendChild(head);
          card.appendChild(body);
          card.appendChild(foot);

          wrap.appendChild(label);
          wrap.appendChild(card);
          bindBlCollapse(wrap, label);

          return wrap;
      }

      function bindBlCollapse(wrap, label) {
          let collapsed = !!GM_getValue(K_BL_COLLAPSED, false);

          const applyState = () => {
              wrap.classList.toggle('mtt-trade-collapsed', collapsed);
              label.textContent = collapsed ? 'Black Ore ▼' : 'Black Ore ▲';
              label.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          };

          const toggle = () => {
              collapsed = !collapsed;
              GM_setValue(K_BL_COLLAPSED, collapsed);
              applyState();
          };

          label.addEventListener('click', toggle);
          label.addEventListener('keydown', event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              toggle();
          });

          applyState();
      }

      function buildOreHexIcon(code) {
          const colors = ORE_ICON_COLORS[code] || ORE_ICON_COLORS.Xx;
          const [fill, stroke, shine] = colors;

          return `
      <svg class="mtt-ore-hex" viewBox="0 0 64 64" aria-hidden="true">
        <polygon
          points="32,5 56,18 56,46 32,59 8,46 8,18"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="4"
        />
        <polygon
          points="32,10 49,20 49,30 32,22 15,30 15,20"
          fill="${shine}"
        />
      </svg>
    `;
      }

      function buildMttTradeMetaBox(s) {
          const box = document.createElement('div');
          box.id = 'mtt-trade-meta';
          box.className = 'mtt-trade-meta';

          const net = Number.isFinite(s && s.depotNetStatGain)
          ? s.depotNetStatGain
          : null;
          const tradesToday = Number.isFinite(Number(s && s.tradePost && s.tradePost.tradesToday))
          ? Number(s.tradePost.tradesToday)
          : null;

          const netLine = document.createElement('div');
          netLine.className = 'mtt-trade-meta-line';
          netLine.textContent = `Net Stat Gain: ${Number.isFinite(net) ? fmtNum(net, 5) : '--'}`;

          const todayLine = document.createElement('div');
          todayLine.className = 'mtt-trade-meta-line';
          todayLine.textContent = `Stat Trades Today: ${Number.isFinite(tradesToday) ? fmtInt(tradesToday, 0) : '--'}`;

          box.appendChild(netLine);
          box.appendChild(todayLine);

          return box;
      }

      function parseNativeNetStatGain() {
          const content = document.querySelector('.content-area');
          const raw = content ? (content.textContent || '') : visibleText;
          const m = normalizeSpace(raw).match(/Net stat gain for trade\s*:\s*([+-]?[0-9]+(?:\.[0-9]+)?)/i);
          return m ? parseFloat(m[1]) : null;
      }

      function persistMiningLogTradeStatGain(value) {
          if (!isTradePage || !Number.isFinite(value)) return false;

          const date = getMiningLogDateKey();
          if (!date) return false;

          let log;

          try {
              const raw = localStorage.getItem(K_MINING_LOG);
              const parsed = raw ? JSON.parse(raw) : {};
              log = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? parsed
                  : {};
          } catch {
              log = {};
          }

          const existing = log[date] && typeof log[date] === 'object'
              ? log[date]
              : {};

          log[date] = {
              ...existing,
              tradeStatGain: value
          };

          try {
              localStorage.setItem(K_MINING_LOG, JSON.stringify(log));
              return true;
          } catch {
              return false;
          }
      }

      function getMiningLogDateKey() {
          const clockNode = document.getElementById('clock');
          const parentText = normalizeSpace(clockNode && clockNode.parentElement
              ? clockNode.parentElement.textContent
              : '');

          const dateMatch = parentText.match(
              /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
          );

          if (!dateMatch) return null;

          const monthIndex = [
              'jan','feb','mar','apr','may','jun',
              'jul','aug','sep','oct','nov','dec'
          ].indexOf(dateMatch[1].slice(0, 3).toLowerCase());

          if (monthIndex < 0) return null;

          const year = new Date().getFullYear();
          const month = String(monthIndex + 1).padStart(2, '0');
          const day = String(Number.parseInt(dateMatch[2], 10)).padStart(2, '0');

          return `${year}-${month}-${day}`;
      }

      function buildMttTradeShardSection(s, nativeHrefMap) {
          const stock = s && s.stock && typeof s.stock === 'object' ? s.stock : {};

          const section = document.createElement('div');
          section.id = 'mtt-trade-sh';
          section.className = 'mtt-trade-sh mtt-trade-toggle-ready';

          const label = document.createElement('div');
          label.className = 'mtt-trade-section-label mtt-trade-sh-label';
          label.setAttribute('role', 'button');
          label.tabIndex = 0;
          section.appendChild(label);

          const grid = document.createElement('div');
          grid.className = 'mtt-trade-sh-grid';
          grid.id = 'mtt-trade-sh-grid';
          label.setAttribute('aria-controls', grid.id);

          const specs = [
              {
                  key: 'ch-shard',
                  tradeNo: 1,
                  needCode: 'Ch',
                  need: 1,
                  line1: 'Trade 1 Hobalt Chunk',
                  line2: 'for Hobalt Shard x50',
                  hrefKey: 'ChShard',
                  left: { kind: 'chunk', count: 1 },
                  right: { kind: 'shard', count: 50 }
              },
              {
                  key: 'sh-exp',
                  tradeNo: 2,
                  needCode: 'Sh',
                  need: 25,
                  line1: 'Trade 25 Hobalt Shards',
                  line2: 'for +5% Exp to Next Level',
                  hrefKey: 'ShExp',
                  left: { kind: 'shard', count: 25 },
                  right: { kind: 'text', line1: '+5%', line2: 'EXP' }
              },
              {
                  key: 'sh-chunk',
                  tradeNo: 3,
                  needCode: 'Sh',
                  need: 50,
                  line1: 'Trade Hobalt Shard x50',
                  line2: 'for 1 Hobalt Chunk',
                  hrefKey: 'ShChunk',
                  left: { kind: 'shard', count: 50 },
                  right: { kind: 'chunk', count: 1 }
              },
              {
                  key: 'sh-piggy',
                  tradeNo: 12,
                  needCode: 'Sh',
                  need: 75,
                  title: '+10% cash (goes straight to bank), +1 begging level, +1% begging, lasts 500-1000 begs',
                  line1: 'Trade 75 Hobalt Shards',
                  line2: 'for a Begging Piggy',
                  hrefKey: 'ShPiggy',
                  left: { kind: 'shard', count: 75 },
                  right: { kind: 'piggy', count: 1 }
              }

          ];

          for (const spec of specs) {
              const owned = Number(stock[spec.needCode]);
              const available = Number.isFinite(owned) && owned >= spec.need;
              const fallbackHref = Number.isFinite(Number(spec.tradeNo)) ? buildMinesTradeHref(spec.tradeNo) : '';
              const href = nativeHrefMap[spec.hrefKey] || fallbackHref;
              const canTrade = available && !!href;
              grid.appendChild(buildMttTradeShardCard(spec, canTrade ? href : '', canTrade, available));
          }

          section.appendChild(grid);
          bindMttHobaltCollapse(section, label, grid);
          return section;
      }

      function bindMttHobaltCollapse(section, label, grid) {
          let collapsed = !!GM_getValue(K_HOBALT_COLLAPSED, false);

          const applyState = () => {
              section.classList.toggle('mtt-trade-collapsed', collapsed);
              grid.hidden = collapsed;
              label.textContent = collapsed ? 'Hobalt ⩖' : 'Hobalt ⩕';
              label.title = collapsed ? 'Click to expand Hobalt trades.' : 'Click to collapse Hobalt trades.';
              label.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          };

          const toggle = () => {
              collapsed = !collapsed;
              GM_setValue(K_HOBALT_COLLAPSED, collapsed);
              applyState();
          };

          label.addEventListener('click', toggle);
          label.addEventListener('keydown', event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              toggle();
          });

          applyState();
      }

      function buildMttTradeShardCard(spec, href, active, hasStock) {
          const card = active
          ? document.createElement('a')
          : document.createElement('div');

          card.id = `mtt-trade-${spec.key}`;
          card.className = [
              'mtt-trade-card',
              'mtt-trade-sh-card',
              `mtt-trade-${spec.key}`,
              active ? 'mtt-trade-active' : 'mtt-trade-disabled'
          ].join(' ');

          card.dataset.kind = 'hobalt';
          card.dataset.trade = spec.key;

          if (active) {
              card.href = href;

              if (spec.title) {
                  card.title = spec.title;
              }
          } else if (hasStock) {
              card.title = 'Native trade link unavailable.';
          } else {
              card.title = `Not enough ${oreCodeToName(spec.needCode)}.`;
          }

          const flow = document.createElement('div');
          flow.className = 'mtt-trade-sh-flow';
          flow.innerHTML =
              buildShardEndpoint(spec.left) +
              buildTradeArrowIcon() +
              buildShardEndpoint(spec.right);

          const text = document.createElement('div');
          text.className = 'mtt-trade-sh-text';
          text.innerHTML = `<span>${spec.line1}</span><span>${spec.line2}</span>`;

          card.appendChild(flow);
          card.appendChild(text);

          return card;
      }

      function buildShardEndpoint(part) {
          if (!part || !part.kind) return '';

          if (part.kind === 'shard') {
              return `
        <span class="mtt-sh-endpoint">
          ${buildHobaltShardIcon()}
          <span class="mtt-sh-count">x${fmtInt(part.count, 0)}</span>
        </span>
      `;
          }

          if (part.kind === 'chunk') {
              return `
        <span class="mtt-sh-endpoint">
          ${buildHobaltChunkIcon()}
          ${Number(part.count) > 1 ? `<span class="mtt-sh-count">x${fmtInt(part.count, 0)}</span>` : ''}
        </span>
      `;
      }

          if (part.kind === 'piggy') {
              return `
        <span class="mtt-sh-endpoint">
          ${buildBeggingPiggyIcon()}
        </span>
      `;
      }

          if (part.kind === 'text') {
              return `
        <span class="mtt-sh-endpoint mtt-sh-text-endpoint">
          <span>${part.line1 || ''}</span>
          <span>${part.line2 || ''}</span>
        </span>
      `;
      }

          return '';
      }

      function buildHobaltShardIcon() {
          return `
      <svg class="mtt-hobalt-shard" viewBox="0 0 32 64" aria-hidden="true">
        <rect x="6" y="8" width="20" height="48" rx="6" fill="#1f7cff" stroke="#2450d8" stroke-width="4"/>
        <path d="M10 18 L23 14 M9 28 L24 23 M9 38 L24 33 M10 48 L22 44" stroke="#47d7ff" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;
      }

      function buildHobaltChunkIcon() {
          return `
      <img
        class="mtt-hobalt-chunk-img"
        src="https://i.imgur.com/gDOSjBL.png"
        alt="Hobalt Chunk"
        aria-hidden="true"
      >
    `;
      }

      function buildBeggingPiggyIcon() {
          return `
      <svg class="mtt-begging-piggy" viewBox="0 0 96 62" aria-hidden="true">
        <path d="M24 44 L19 56 H27 L31 47 Z" fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>
        <path d="M48 48 L46 59 H55 L56 49 Z" fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>
        <path d="M72 43 L76 55 H84 L78 43 Z" fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>

        <path d="M36 12 L44 2 L50 15 Z" fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>
        <path d="M70 11 L83 5 L78 22 Z" fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>

        <path d="M19 27 C8 20 8 33 14 30 C18 28 18 22 13 23" fill="none" stroke="#bb6d84" stroke-width="3" stroke-linecap="round"/>

        <path d="M17 34
                 C17 17 34 8 55 10
                 C76 12 89 23 87 37
                 C85 51 67 57 44 55
                 C27 54 17 46 17 34 Z"
              fill="#f5a0c4" stroke="#bb6d84" stroke-width="2" stroke-linejoin="round"/>

        <ellipse cx="80" cy="36" rx="13" ry="8" fill="#f7b0cc" stroke="#bb6d84" stroke-width="1.5"/>
        <circle cx="76" cy="36" r="1.4" fill="#7a3f4b"/>
        <circle cx="84" cy="36" r="1.4" fill="#7a3f4b"/>

        <circle cx="62" cy="25" r="3.2" fill="#111111"/>
        <circle cx="78" cy="26" r="3.2" fill="#111111"/>
      </svg>
    `;
      }

      function buildTradeArrowIcon() {
          return `
      <svg class="mtt-trade-arrow" viewBox="0 0 64 32" aria-hidden="true">
        <path d="M4 12 H36 V5 L58 16 L36 27 V20 H4 Z" fill="#7c7cff" stroke="#000000" stroke-width="4" stroke-linejoin="round"/>
      </svg>
    `;
      }

      function buildMinesTradeHref(tradeNo) {
          const url = new URL(location.href);
          url.searchParams.set('cmd', 'mines');
          url.searchParams.set('do', 'trade');
          url.searchParams.set('trade', String(tradeNo));
          return url.href;
      }

      function getNativeTradeHrefMap() {
          const map = {};
          const content = document.querySelector('.content-area');
          if (!content) return map;

          const tradeByNumber = {
              5: 'Gr',
              6: 'Wh',
              7: 'Ye',
              8: 'Or',
              9: 'Re',
              10: 'Pu',
              11: 'Bl',
              12: 'ShPiggy',
              1: 'ChShard',
              2: 'ShExp',
              3: 'ShChunk',
          };

          for (const row of content.querySelectorAll('tr')) {
              const a = row.querySelector('a[href*="cmd=mines"][href*="do=trade"][href*="trade="]');
              if (!a) continue;

              const href = a.getAttribute('href') || '';
              const absoluteHref = a.href || href;
              const rowText = normalizeSpace(row.textContent || '');
              let code = null;

              const m = href.match(/[?&]trade=(\d+)/i);
              if (m) code = tradeByNumber[parseInt(m[1], 10)] || null;

              if (/\bHobalt Shard\s*\(25\)/i.test(rowText) && /\+?5%\s*exp/i.test(rowText)) {
                  code = 'ShExp';
              } else if (/\bHobalt Shard\s*\(50\)/i.test(rowText) && /\bHobalt Chunk\b/i.test(rowText)) {
                  code = 'ShChunk';
              } else if (/\bHobalt Shard\s*\(75\)/i.test(rowText) && /\bBegging Piggy\b/i.test(rowText)) {
                  code = 'ShPiggy';
              } else if (/\bHobalt Chunk\b/i.test(rowText) && /\bHobalt Shard\s*\(50\)/i.test(rowText)) {
                  code = 'ChShard';
              }

              if (code && !map[code]) {
                  map[code] = absoluteHref;
              }
          }

          return map;
      }

      function findNativeTradingPostTable() {
          const content = document.querySelector('.content-area');
          if (!content) return null;

          const tables = Array.from(content.querySelectorAll('table'));

          for (const table of tables) {
              const text = normalizeSpace(table.textContent || '');
              if (
                  /\bGive me\b/i.test(text) &&
                  /\bI'll give you\b/i.test(text) &&
                  /\bGreen Ore\b/i.test(text) &&
                  /\bPurple Ore\b/i.test(text)
              ) {
                  return table;
              }
          }

          return null;
      }

      function polishNativeTradingPostChrome() {
          if (!isTradePage) return;

          const content = document.querySelector('.content-area');
          if (!content) return;

          const titleWrap = Array.from(content.querySelectorAll('span'))
          .find(el => normalizeSpace(el.textContent || '') === 'Trading Post');

          if (titleWrap) {
              titleWrap.style.display = 'block';
              titleWrap.style.textAlign = 'center';
          }

          const subtitle = Array.from(content.querySelectorAll('i'))
          .find(el => /Trade the ore you've gathered for goods and services/i.test(el.textContent || ''));

          if (subtitle) {
              subtitle.style.display = 'block';
              subtitle.style.textAlign = 'center';
          }
      }

      function hideNativeCoreTradeRows() {
          const table = findNativeTradingPostTable();
          if (!table) return;

          const coreOreRe = /\b(Green Ore|White Ore|Yellow Ore|Orange Ore|Red Ore|Purple Ore)\s*\(3\)/i;

          for (const tr of table.querySelectorAll('tr')) {
              const rowText = normalizeSpace(tr.textContent || '');

              if (coreOreRe.test(rowText)) {
                  tr.style.display = 'none';
              }
          }
      }

      function hideNativeBlackTradeRow() {
          const table = findNativeTradingPostTable();
          if (!table) return;

          const blackOreRe = /\bBlack Ore\s*\(3\)/i;

          for (const tr of table.querySelectorAll('tr')) {
              const rowText = normalizeSpace(tr.textContent || '');

              if (blackOreRe.test(rowText)) {
                  tr.style.display = 'none';
                  return;
              }
          }
      }

      function hideNativeHobaltTradeRows() {
          const table = findNativeTradingPostTable();
          if (!table) return;

          const hobaltRe = /\b(Hobalt Shard\s*\((?:25|50|75)\)|Hobalt Chunk\b)/i;

          for (const tr of table.querySelectorAll('tr')) {
              const rowText = normalizeSpace(tr.textContent || '');

              if (hobaltRe.test(rowText)) {
                  tr.style.display = 'none';
              }
          }
      }

      function hideNativeTradeMetaRow() {
          const table = findNativeTradingPostTable();
          if (!table) return;

          for (const tr of table.querySelectorAll('tr')) {
              const rowText = normalizeSpace(tr.textContent || '');

              if (
                  /\bNet stat gain\b/i.test(rowText) ||
                  /\bStat Trades today\b/i.test(rowText) ||
                  /\bTrades today\b/i.test(rowText)
              ) {
                  tr.style.display = 'none';
              }
          }
      }

      function hideNativeTradeHeaderRow() {
          const table = findNativeTradingPostTable();
          if (!table) return;

          for (const tr of table.querySelectorAll('tr')) {
              const rowText = normalizeSpace(tr.textContent || '');

              if (/\bGive me\b/i.test(rowText) && /\bI'll give you\b/i.test(rowText)) {
                  tr.style.display = 'none';
                  return;
              }
          }
      }

      function oreCodeToName(code) {
          return {
              Gr: 'Green Ore',
              Wh: 'White Ore',
              Ye: 'Yellow Ore',
              Or: 'Orange Ore',
              Re: 'Red Ore',
              Pu: 'Purple Ore',
              Bl: 'Black Ore',
              Sh: 'Hobalt Shard',
              Ch: 'Hobalt Chunk'
          }[String(code || '')] || String(code || '');
      }

      function statClass(stat) {
          const s = normalizeStatName(stat);
          if (s === 'str') return 'str';
          if (s === 'pow') return 'pow';
          if (s === 'spd') return 'spd';
          if (s === 'max life') return 'life';
          return 'misc';
      }

      function fmtDepotTradeNumber(n) {
          if (!Number.isFinite(Number(n))) return '--';
          return fmtNum(Number(n), 3).replace(/\.?0+$/, '');
      }

      function parseMineSummary(rawText) {
          const norm = normalizeSpace(rawText);

          const miningM = norm.match(/Mining\s*:\s*([\d.,]+)/i);
          const foundM = norm.match(/Ore\s+found\s*:\s*([\d,]+)(?:\s*[\[\(]\s*([\d,]+)\s*[\]\)])?/i);
          const tradedM = norm.match(/Ore\s+traded\s*:\s*([\d,]+)(?:\s*[\[\(]\s*([\d,]+)\s*[\]\)])?/i);
          const tUsedM = norm.match(/T\s+used\s*:\s*([\d,]+)/i);

          return {
              hasMining: !!miningM,
              hasFound: !!foundM,
              hasTraded: !!tradedM,
              hasTUsed: !!tUsedM,

              mining: miningM ? parseFloat(miningM[1].replace(/,/g, '')) : null,

              found: foundM ? parseInt(foundM[1].replace(/,/g, ''), 10) : null,
              foundShards: foundM && foundM[2] ? parseInt(foundM[2].replace(/,/g, ''), 10) : foundM ? 0 : null,

              traded: tradedM ? parseInt(tradedM[1].replace(/,/g, ''), 10) : null,
              tradedShards: tradedM && tradedM[2] ? parseInt(tradedM[2].replace(/,/g, ''), 10) : tradedM ? 0 : null,

              tUsed: tUsedM ? parseInt(tUsedM[1].replace(/,/g, ''), 10) : null
          };
      }

      function loadPersistedSummary() {
          try {
              const v = JSON.parse(GM_getValue(K_SUMMARY, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function savePersistedSummary(v) {
          GM_setValue(K_SUMMARY, JSON.stringify(v && typeof v === 'object' ? v : {}));
      }

      function updatePersistedSummary(raw) {
          const prev = loadPersistedSummary();
          const next = { ...prev };

          if (raw.hasMining && Number.isFinite(raw.mining)) next.mining = raw.mining;

          if (raw.hasFound) {
              next.found = Number.isFinite(raw.found) ? raw.found : 0;
              next.foundShards = Number.isFinite(raw.foundShards) ? raw.foundShards : 0;
          }

          if (raw.hasTraded) {
              next.traded = Number.isFinite(raw.traded) ? raw.traded : 0;
              next.tradedShards = Number.isFinite(raw.tradedShards) ? raw.tradedShards : 0;
          }

          if (raw.hasTUsed && Number.isFinite(raw.tUsed)) next.tUsed = raw.tUsed;

          if (raw.hasMining || raw.hasFound || raw.hasTraded || raw.hasTUsed) {
              next.dayKey = dayKey;
              next.time = clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : '';
              savePersistedSummary(next);
          }
      }

      function mergeWithPersistedSummary(raw) {
          const persisted = loadPersistedSummary();

          return {
              mining: raw.hasMining ? raw.mining : toFiniteOrNull(persisted.mining),

              found: raw.hasFound ? raw.found : toFiniteOrNull(persisted.found),
              foundShards: raw.hasFound ? raw.foundShards : toFiniteOrNull(persisted.foundShards),

              traded: raw.hasTraded ? raw.traded : toFiniteOrNull(persisted.traded),
              tradedShards: raw.hasTraded ? raw.tradedShards : toFiniteOrNull(persisted.tradedShards),

              tUsed: raw.hasTUsed ? raw.tUsed : toFiniteOrNull(persisted.tUsed)
          };
      }

      function loadMineDayLog() {
          try {
              const v = JSON.parse(GM_getValue(K_MINE_DAY_LOG, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function saveMineDayLog(v) {
          GM_setValue(K_MINE_DAY_LOG, JSON.stringify(v && typeof v === 'object' ? v : {}));
      }

      function updateAndLoadMineDayLog(summary, currentDayTrades) {
          const log = loadMineDayLog();

          const hasAuthoritativeMineValues =
                Number.isFinite(summary && summary.tUsed) &&
                Number.isFinite(summary && summary.found) &&
                Number.isFinite(summary && summary.foundShards);

          if (hasAuthoritativeMineValues) {
              log[dayKey] = {
                  dayKey,
                  tUsed: summary.tUsed,
                  oreFound: summary.found,
                  shardsFound: summary.foundShards,
                  trades: Array.isArray(currentDayTrades) ? currentDayTrades.length : 0,
                  time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : ''
              };

              saveMineDayLog(log);
          }

          return log;
      }

      function normalizeMineDayRow(row, fallbackDayKey) {
          const obj = row && typeof row === 'object' ? row : {};

          return {
              dayKey: String(obj.dayKey || fallbackDayKey || ''),
              tUsed: toFiniteOrNull(obj.tUsed),
              oreFound: toFiniteOrNull(obj.oreFound),
              shardsFound: toFiniteOrNull(obj.shardsFound),
              trades: toFiniteOrNull(obj.trades),
              time: String(obj.time || '')
          };
      }

      function formatMineDayYieldRow(dayKey, row, fallbackTradeCount) {
          const normalized = normalizeMineDayRow(row, dayKey);

          const trades = Number.isFinite(normalized.trades)
          ? normalized.trades
          : fallbackTradeCount;

          return `${dayKey} < T ${fmtInt(normalized.tUsed, 3)} | Ore Found ${fmtInt(normalized.oreFound, 3)}[${fmtInt(normalized.shardsFound, 2)}] | TRADES ${fmtInt(trades, 2)} >`;
      }

      function loadPersistedTradeTable() {
          try {
              const v = JSON.parse(GM_getValue(K_TRADE_TABLE, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function savePersistedTradeTable(v) {
          GM_setValue(K_TRADE_TABLE, JSON.stringify(v && typeof v === 'object' ? v : {}));
      }

      function mergeWithPersistedTradeTable(raw) {
          const persisted = loadPersistedTradeTable();

          const hasLiveRows = raw && Array.isArray(raw.rows) && raw.rows.length > 0;
          const sameDay = persisted && persisted.dayKey === dayKey;

          if (hasLiveRows) {
              const next = {
                  dayKey,
                  tradesToday: toFiniteOrNull(raw.tradesToday),
                  rows: raw.rows
              };

              savePersistedTradeTable(next);
              return next;
          }

          if (sameDay && Array.isArray(persisted.rows) && persisted.rows.length > 0) {
              return {
                  tradesToday: Number.isFinite(toFiniteOrNull(raw && raw.tradesToday))
                  ? toFiniteOrNull(raw.tradesToday)
                  : toFiniteOrNull(persisted.tradesToday),
                  rows: persisted.rows
              };
          }

          return raw;
      }

      function parseOreStock() {
          const empty = makeEmptyStock();

          const spanStock = parseStockFromExchangeSpans();
          if (spanStock) {
              savePersistedStock(spanStock);
              return spanStock;
          }

          if (isMineInterior) {
              const mineStock = parseStockFromMineInteriorRow();
              if (mineStock) {
                  savePersistedStock(mineStock);
                  return mineStock;
              }
          }

          const persisted = loadPersistedStock();
          if (persisted) return persisted;

          return empty;
      }

      function parseStockFromExchangeSpans() {
          const stock = makeEmptyStock();
          let hits = 0;

          for (const [id, code] of Object.entries(ORE_IDS)) {
              const span = document.getElementById(`exc_ore_stock_${id}`);
              if (!span) continue;

              const n = parseInt(String(span.textContent || '').replace(/[^\d]/g, ''), 10);

              if (Number.isFinite(n)) {
                  stock[code] = n;
                  hits++;
              }
          }

          return hits > 0 ? stock : null;
      }

 function parseStockFromMineInteriorRow() {
    const area = document.querySelector('.content-area');
    if (!area) return null;

    /*
     * Hobo Helper layout:
     *
     * Each ore is wrapped in its own card:
     *   <div>
     *     <img title="Green Ore" alt="Green Ore">
     *     <span>Green Ore</span>
     *     <div>(21)</div>
     *   </div>
     *
     * Identify the ore by its preserved title/alt attribute and read the
     * dedicated count element from the same card.
     */
    const helperStock = makeEmptyStock();
    const helperCodes = new Set();

    const oreImages = Array.from(
        area.querySelectorAll('img[title], img[alt]')
    );

    for (const img of oreImages) {
        const oreName = String(
            img.getAttribute('title') ||
            img.getAttribute('alt') ||
            ''
        ).trim();

        const code = ORE_NAMES[oreName];
        if (!code || helperCodes.has(code)) continue;

        const card = img.parentElement;
        if (!card) continue;

        const countElement = Array.from(card.children).find(element => {
            if (element === img) return false;

            return /^\(\s*[\d,]*\s*\)$/.test(
                String(element.textContent || '').trim()
            );
        });

        if (!countElement) continue;

        const countMatch = String(countElement.textContent || '')
            .trim()
            .match(/^\(\s*([\d,]*)\s*\)$/);

        if (!countMatch) continue;

        const count = countMatch[1] === ''
            ? 0
            : parseInt(countMatch[1].replace(/,/g, ''), 10);

        if (!Number.isFinite(count) || count < 0) continue;

        helperStock[code] = count;
        helperCodes.add(code);
    }

    if (helperCodes.size === MINE_STOCK_ORDER.length) {
        return helperStock;
    }

    /*
     * Native Mines layout fallback:
     *
     * The original page places nine direct IMG nodes inside a CENTER,
     * followed by text containing each count.
     */
    const centers = Array.from(area.querySelectorAll('center'));

    for (const center of centers) {
        const children = Array.from(center.childNodes || []);

        const directImgs = children.filter(node =>
            node &&
            node.nodeType === Node.ELEMENT_NODE &&
            String(node.tagName || '').toUpperCase() === 'IMG'
        );

        if (directImgs.length !== MINE_STOCK_ORDER.length) continue;

        const nativeStock = makeEmptyStock();
        let valid = true;

        for (let i = 0; i < directImgs.length; i++) {
            const img = directImgs[i];
            let countText = '';
            let node = img.nextSibling;

            while (
                node &&
                !(
                    node.nodeType === Node.ELEMENT_NODE &&
                    String(node.tagName || '').toUpperCase() === 'IMG'
                )
            ) {
                countText += node.textContent || '';
                node = node.nextSibling;
            }

            const countMatch = countText.match(/\(\s*([\d,]*)\s*\)/);

            if (!countMatch) {
                valid = false;
                break;
            }

            const count = countMatch[1] === ''
                ? 0
                : parseInt(countMatch[1].replace(/,/g, ''), 10);

            if (!Number.isFinite(count) || count < 0) {
                valid = false;
                break;
            }

            nativeStock[MINE_STOCK_ORDER[i]] = count;
        }

        if (valid) return nativeStock;
    }

    return null;
}

      function makeEmptyStock() {
          return {
              Sh: 0,
              Ch: 0,
              Gr: 0,
              Wh: 0,
              Ye: 0,
              Or: 0,
              Re: 0,
              Pu: 0,
              Bl: 0
          };
      }

      function loadPersistedStock() {
          try {
              const v = JSON.parse(GM_getValue(K_STOCK, '{}'));
              if (!v || typeof v !== 'object') return null;

              const out = makeEmptyStock();

              for (const code of STOCK_ORDER) {
                  out[code] = Number.isFinite(Number(v[code])) ? Number(v[code]) : 0;
              }

              return out;
          } catch {
              return null;
          }
      }

      function savePersistedStock(stock) {
          GM_setValue(K_STOCK, JSON.stringify(stock && typeof stock === 'object' ? stock : makeEmptyStock()));
      }

      function parseCompletedTradeResult() {
          const html = document.documentElement ? String(document.documentElement.innerHTML || '') : '';
          const rawText = visibleText || text || '';
          const norm = normalizeSpace(rawText);

          const oreNames = 'Green Ore|White Ore|Yellow Ore|Orange Ore|Red Ore|Purple Ore|Black Ore';

          const resultStart = html.search(/You hand over\s*:/i);

          if (resultStart >= 0) {
              const resultChunk = html.slice(resultStart, resultStart + 5000);

              const oreM = resultChunk.match(
                  new RegExp(
                      `<img\\b[^>]*(?:title|alt)=["'](${oreNames})["'][^>]*>[\\s\\S]*?\\((\\d+)\\)(?:\\s*\\((\\d+)\\s+remaining\\))?`,
                      'i'
                  )
              );

              const gainM =
                    resultChunk.match(/You gained[\s\S]*?<b>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/b>[\s\S]*?(strength|speed|power|max life)/i) ||
                    resultChunk.match(/You gained[\s\S]*?<font[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/font>[\s\S]*?(strength|speed|power|max life)/i);

              const lossM =
                    resultChunk.match(/You lost[\s\S]*?<b>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/b>[\s\S]*?(speed,\s*power,\s*strength|spd,\s*pow,\s*str|strength|speed|power|str|spd|pow|each)/i) ||
                    resultChunk.match(/You lost[\s\S]*?<font[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/font>[\s\S]*?(speed,\s*power,\s*strength|spd,\s*pow,\s*str|strength|speed|power|str|spd|pow|each)/i);

              const miningM =
                    resultChunk.match(/You gained[\s\S]*?<font[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/font>\s*mining/i) ||
                    resultChunk.match(/You gained\s*([0-9]+(?:\.[0-9]+)?)\s*mining/i);

              if (oreM && gainM && lossM) {
                  const oreName = oreM[1];
                  const code = ORE_NAMES[oreName];

                  if (code) {
                      return normalizeCompletedTrade({
                          code,
                          cost: parseInt(oreM[2], 10),
                          remaining: oreM[3] ? parseInt(oreM[3], 10) : null,

                          plus: parseFloat(gainM[1]),
                          plusStat: normalizeStatName(gainM[2]),

                          minus: parseFloat(lossM[1]),
                          minusStat: normalizeStatName(lossM[2]),

                          miningGain: miningM ? parseFloat(miningM[1]) : null
                      });
                  }
              }
          }

          if (!/You hand over\s*:/i.test(norm)) return null;
          if (!/You gained\s+[0-9]+(?:\.[0-9]+)?\s+(strength|speed|power|max life)/i.test(norm)) return null;
          if (!/You lost\s+[0-9]+(?:\.[0-9]+)?\s+(speed,\s*power,\s*strength|spd,\s*pow,\s*str|strength|speed|power|str|spd|pow|each)/i.test(norm)) return null;

          const oreRe = new RegExp(
              `You hand over\\s*:\\s*(${oreNames})(?:\\s+(?:${oreNames}))?\\s*\\((\\d+)\\)(?:\\s*\\((\\d+)\\s+remaining\\))?`,
              'i'
          );

          const oreM = norm.match(oreRe);
          const gainM = norm.match(/You gained\s+([0-9]+(?:\.[0-9]+)?)\s+(strength|speed|power|max life)/i);
          const lossM = norm.match(/You lost\s+([0-9]+(?:\.[0-9]+)?)\s+(speed,\s*power,\s*strength|spd,\s*pow,\s*str|strength|speed|power|str|spd|pow|each)/i);
          const miningM = norm.match(/You gained\s+([0-9]+(?:\.[0-9]+)?)\s+mining/i);

          if (!oreM || !gainM || !lossM) return null;

          const oreName = oreM[1];
          const code = ORE_NAMES[oreName];

          if (!code) return null;

          return normalizeCompletedTrade({
              code,
              cost: parseInt(oreM[2], 10),
              remaining: oreM[3] ? parseInt(oreM[3], 10) : null,

              plus: parseFloat(gainM[1]),
              plusStat: normalizeStatName(gainM[2]),

              minus: parseFloat(lossM[1]),
              minusStat: normalizeStatName(lossM[2]),

              miningGain: miningM ? parseFloat(miningM[1]) : null
          });
      }

      function normalizeCompletedTrade(t) {
          if (!t) return null;

          const base = { ...t };

          if (base.code === 'Bl') {
              base.plusStat = 'max life';
              base.minusStat = 'spd, pow, str';
          }

          const deltas = calcTradeDelta(base);

          return {
              ...base,
              strDelta: deltas.str,
              spdDelta: deltas.spd,
              powDelta: deltas.pow,
              lifeDelta: deltas.life,
              tbsNet: deltas.tbs
          };
      }

      function parseTradePostFromNativeTable() {
          const out = {
              tradesToday: null,
              rows: []
          };

          const area = document.querySelector('.content-area');
          if (!area) return out;

          const pageText = normalizeSpace(area.textContent || '');
          out.tradesToday = matchInt(pageText, /Stat\s+Trades\s+today\s*:\s*([\d,]+)/i);

          const table = findNativeTradingPostTable();
          if (!table) return out;

          const oreToCode = {
              'Green Ore': 'Gr',
              'White Ore': 'Wh',
              'Yellow Ore': 'Ye',
              'Orange Ore': 'Or',
              'Red Ore': 'Re',
              'Purple Ore': 'Pu',
              'Black Ore': 'Bl'
          };

          const trs = Array.from(table.querySelectorAll('tr'));

          for (const tr of trs) {
              const rowText = normalizeSpace(tr.textContent || '');
              const oreM = rowText.match(/\b(Green Ore|White Ore|Yellow Ore|Orange Ore|Red Ore|Purple Ore|Black Ore)\s*\(3\)/i);
              if (!oreM) continue;

              const oreName = Object.keys(oreToCode).find(name => name.toLowerCase() === String(oreM[1] || '').toLowerCase());
              const code = oreName ? oreToCode[oreName] : '';
              if (!code || !TRADE_ORES.includes(code)) continue;

              let plusM;
              let minusM;

              if (code === 'Bl') {
                  plusM = rowText.match(/\+([0-9]+(?:\.[0-9]+)?)\s*(max life)/i);
                  minusM = rowText.match(/-([0-9]+(?:\.[0-9]+)?)\s*(spd,\s*pow,\s*str|speed,\s*power,\s*strength|str|spd|pow|strength|speed|power)/i);
              } else {
                  plusM = rowText.match(/\+([0-9]+(?:\.[0-9]+)?)\s*(str|spd|pow|strength|speed|power)/i);
                  minusM = rowText.match(/-([0-9]+(?:\.[0-9]+)?)\s*(str|spd|pow|strength|speed|power)/i);
              }

              if (!plusM || !minusM) continue;

              const remaining = Number.isFinite(Number(stock && stock[code]))
              ? Math.floor(Number(stock[code]) / 3)
              : null;

              const normalized = normalizeCompletedTrade({
                  code,
                  plus: parseFloat(plusM[1]),
                  plusStat: normalizeStatName(plusM[2]),
                  minus: parseFloat(minusM[1]),
                  minusStat: normalizeStatName(minusM[2]),
                  remaining
              });

              out.rows.push({
                  ...normalized,
                  available: Number.isFinite(normalized.remaining) ? normalized.remaining > 0 : true
              });
          }

          out.rows.sort((a, b) => {
              const order = { Gr: 1, Wh: 2, Ye: 3, Or: 4, Re: 5, Pu: 6, Bl: 7 };
              return (order[a.code] || 99) - (order[b.code] || 99);
          });

          return out;
      }

      function parseTradePost() {
          const out = {
              tradesToday: null,
              rows: []
          };

          const domParsed = parseTradePostFromNativeTable();

          if (domParsed.rows.length) {
              return domParsed;
          }

          const norm = normalizeSpace(visibleText);

          out.tradesToday = matchInt(norm, /Stat\s+Trades\s+today\s*:\s*([\d,]+)/i);

          const start = norm.indexOf('Trading Post');
          const end = norm.indexOf('Ore Exchange');
          const section = start >= 0
          ? norm.slice(start, end > start ? end : undefined)
          : norm;

          const oreToCode = {
              'Green Ore': 'Gr',
              'White Ore': 'Wh',
              'Yellow Ore': 'Ye',
              'Orange Ore': 'Or',
              'Red Ore': 'Re',
              'Purple Ore': 'Pu',
              'Black Ore': 'Bl'
          };

          const seen = new Set();

          function addRow(oreName, plus, plusStat, minus, minusStat, remaining) {
              const code = oreToCode[oreName];
              if (!code || !TRADE_ORES.includes(code)) return;

              const normalized = normalizeCompletedTrade({
                  code,
                  plus: Number.isFinite(plus) ? plus : null,
                  plusStat: normalizeStatName(plusStat),
                  minus: Number.isFinite(minus) ? minus : null,
                  minusStat: normalizeStatName(minusStat),
                  remaining: Number.isFinite(remaining) ? remaining : null
              });

              const key = [
                  normalized.code,
                  normalized.plus,
                  normalized.plusStat,
                  normalized.minus,
                  normalized.minusStat
              ].join('|');

              if (seen.has(key)) return;
              seen.add(key);

              out.rows.push({
                  ...normalized,
                  available: Number.isFinite(normalized.remaining) ? normalized.remaining > 0 : true
              });
          }

          const coloredRe =
                /(Green Ore|White Ore|Yellow Ore|Orange Ore|Red Ore|Purple Ore)\s*\(3\)\s*\+([0-9]+(?:\.[0-9]+)?)\s*(str|spd|pow|strength|speed|power|max life)\s*-([0-9]+(?:\.[0-9]+)?)\s*(str|spd|pow|strength|speed|power|max life)(?:\s+(\d+))?/gi;

          let m;
          while ((m = coloredRe.exec(section)) !== null) {
              addRow(
                  m[1],
                  parseFloat(m[2]),
                  m[3],
                  parseFloat(m[4]),
                  m[5],
                  m[6] ? parseInt(m[6], 10) : null
              );
          }

          const blackRe =
                /Black Ore\s*\(3\)\s*\+([0-9]+(?:\.[0-9]+)?)\s*(max life)\s*-([0-9]+(?:\.[0-9]+)?)\s*(spd,\s*pow,\s*str|speed,\s*power,\s*strength|pow,\s*str|power,\s*strength|all|str|spd|pow|strength|speed|power)(?:\s+(\d+))?/i;

          const b = section.match(blackRe);
          if (b) {
              addRow(
                  'Black Ore',
                  parseFloat(b[1]),
                  b[2],
                  parseFloat(b[3]),
                  b[4],
                  b[5] ? parseInt(b[5], 10) : null
              );
          }

          out.rows.sort((a, b) => {
              const order = { Gr: 1, Wh: 2, Ye: 3, Or: 4, Re: 5, Pu: 6, Bl: 7 };
              return (order[a.code] || 99) - (order[b.code] || 99);
          });

          return out;
      }

      function applyMineInteriorPreviewCounts(tradePost, stock) {
          if (!isMineInterior && !isBlastPage) return tradePost;
          if (!tradePost || typeof tradePost !== 'object') return tradePost;
          if (!stock || typeof stock !== 'object') return tradePost;

          const rows = Array.isArray(tradePost.rows) ? tradePost.rows : [];

          return {
              ...tradePost,
              rows: rows.map(row => {
                  if (!row || !TRADE_ORES.includes(row.code)) return row;

                  const oreOwned = Number(stock[row.code]);
                  if (!Number.isFinite(oreOwned) || oreOwned < 0) return row;

                  const remaining = Math.floor(oreOwned / 3);
                  return {
                      ...row,
                      remaining,
                      available: remaining > 0
                  };
              })
          };
      }

      function loadPersistedTradeLedger() {
          try {
              const v = JSON.parse(GM_getValue(K_TRADE_LEDGER, '{}'));
              if (!v || typeof v !== 'object') return { dayKey, trades: [] };

              return {
                  dayKey: v.dayKey || dayKey,
                  trades: Array.isArray(v.trades) ? v.trades.map(normalizeLedgerTrade).filter(Boolean).slice(-MAX_ROWS) : []
              };
          } catch {
              return { dayKey, trades: [] };
          }
      }

      function savePersistedTradeLedger(ledger) {
          GM_setValue(K_TRADE_LEDGER, JSON.stringify(ledger && typeof ledger === 'object'
                                                     ? ledger
                                                     : { dayKey, trades: [] }
                                                    ));
      }

      function updateAndLoadTradeLedger(completedTrade, tradePost) {
          const ledger = loadPersistedTradeLedger();

          if (!completedTrade) {
              return ledger;
          }

          let n = toFiniteOrNull(tradePost && tradePost.tradesToday);
          if (!Number.isFinite(n) || n <= 0) {
              n = ledger.trades.reduce((max, t) => Math.max(max, Number(t.n) || 0), 0) + 1;
          }

          n = Math.round(n);

          const trade = normalizeLedgerTrade({
              ...completedTrade,
              dayKey,
              n,
              time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : ''
          });

          if (!trade) return ledger;

          const existingIndex = ledger.trades.findIndex(t =>
                                                        String(t.dayKey || '') === String(trade.dayKey || '') &&
                                                        Number(t.n) === Number(trade.n)
                                                       );

          if (existingIndex >= 0) {
              ledger.trades[existingIndex] = trade;
          } else {
              ledger.trades.push(trade);
          }

          ledger.trades.sort((a, b) => {
              const dayCmp = String(a.dayKey || '').localeCompare(String(b.dayKey || ''));
              return dayCmp || (Number(a.n) - Number(b.n));
          });

          if (ledger.trades.length > MAX_ROWS) {
              ledger.trades.splice(0, ledger.trades.length - MAX_ROWS);
          }

          savePersistedTradeLedger(ledger);

          return ledger;
      }

      function buildTradeReconciliationState(tradeLedger, tradePost, completedTrade, currentDayTrades) {
          const nativeToday = toFiniteOrNull(tradePost && tradePost.tradesToday);
          const dayTrades = Array.isArray(currentDayTrades) ? currentDayTrades : [];
          const loggedNumbers = new Set(dayTrades.map(t => Math.round(Number(t.n))).filter(Number.isFinite));
          const missing = [];

          if (Number.isFinite(nativeToday) && nativeToday > 0) {
              const nativeN = Math.round(nativeToday);
              for (let n = 1; n <= nativeN; n++) {
                  if (!loggedNumbers.has(n)) missing.push(n);
              }
          }

          const audits = loadTradeReconAudit()
              .filter(a => String(a.dayKey || '') === String(dayKey))
              .slice(-6);

          const pending = missing.length > 0 && missing.length <= 3;
          const firstMissing = pending ? missing[0] : null;
          const reference = pending ? findReconciliationReference(firstMissing, dayTrades, completedTrade, tradePost) : null;
          const suggestedCode = getReconciliationSuggestedCode(firstMissing, reference, completedTrade, tradePost);

          return {
              nativeToday: Number.isFinite(nativeToday) ? Math.round(nativeToday) : null,
              ledgerToday: dayTrades.length,
              missing,
              pending,
              firstMissing,
              reference,
              suggestedCode,
              audits
          };
      }

      function loadTradeReconAudit() {
          try {
              const v = JSON.parse(GM_getValue(K_TRADE_RECON, '[]'));
              return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
          } catch {
              return [];
          }
      }

      function saveTradeReconAudit(rows) {
          GM_setValue(K_TRADE_RECON, JSON.stringify(Array.isArray(rows) ? rows.slice(-200) : []));
      }

      function appendTradeReconAudit(entry) {
          const rows = loadTradeReconAudit();
          rows.push({
              dayKey,
              time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : '',
              ...entry
          });
          saveTradeReconAudit(rows);
      }

      function findReconciliationReference(n, dayTrades, completedTrade, tradePost) {
          const target = Math.round(Number(n));
          const band = Math.floor((target - 1) / 10);
          const rows = [...(dayTrades || [])]
              .filter(t => t && Number.isFinite(Number(t.n)))
              .sort((a, b) => Math.abs(Number(a.n) - target) - Math.abs(Number(b.n) - target));

          const sameBandCore = rows.find(t => Math.floor((Number(t.n) - 1) / 10) === band && t.code !== 'Bl');
          if (sameBandCore) return sameBandCore;

          const sameBandAny = rows.find(t => Math.floor((Number(t.n) - 1) / 10) === band);
          if (sameBandAny) return sameBandAny;

          if (completedTrade) return { ...completedTrade, n: toFiniteOrNull(tradePost && tradePost.tradesToday) };

          const previewCore = (tradePost && Array.isArray(tradePost.rows) ? tradePost.rows : []).find(r => r && r.code !== 'Bl' && TRADE_ORES.includes(r.code));
          if (previewCore) return previewCore;

          return null;
      }

      function getReconciliationSuggestedCode(n, reference, completedTrade, tradePost) {
          if (reference && reference.code && TRADE_ORES.includes(reference.code)) return reference.code;
          if (completedTrade && completedTrade.code && TRADE_ORES.includes(completedTrade.code)) return completedTrade.code;
          const rows = tradePost && Array.isArray(tradePost.rows) ? tradePost.rows : [];
          const first = rows.find(r => r && TRADE_ORES.includes(r.code));
          return first ? first.code : '';
      }

      function commitManualTradeReconciliation(code, n, lifeGain) {
          code = String(code || '');
          if (!TRADE_ORES.includes(code)) return { ok: false, message: 'Unknown ore code.' };

          const ledger = loadPersistedTradeLedger();
          const current = getCurrentDayTrades(ledger.trades);
          const tradePostNow = mergeWithPersistedTradeTable(parseTradePost());
          const completedNow = parseCompletedTradeResult();
          const reference = findReconciliationReference(n, current, completedNow, tradePostNow);
          const built = buildManualReconciliationTrade(code, n, reference, tradePostNow, lifeGain);

          if (!built) return { ok: false, message: 'No same-run value source was available.' };

          const trade = normalizeLedgerTrade({
              ...built,
              dayKey,
              n: Math.round(Number(n)),
              time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : ''
          });

          if (!trade) return { ok: false, message: 'Resolved row did not normalize.' };

          const existingIndex = ledger.trades.findIndex(t =>
              String(t.dayKey || '') === String(dayKey) &&
              Number(t.n) === Number(trade.n)
          );

          if (existingIndex >= 0) {
              ledger.trades[existingIndex] = trade;
          } else {
              ledger.trades.push(trade);
          }

          ledger.trades.sort((a, b) => {
              const dayCmp = String(a.dayKey || '').localeCompare(String(b.dayKey || ''));
              return dayCmp || (Number(a.n) - Number(b.n));
          });

          if (ledger.trades.length > MAX_ROWS) {
              ledger.trades.splice(0, ledger.trades.length - MAX_ROWS);
          }

          savePersistedTradeLedger(ledger);

          const sourceN = Number.isFinite(Number(reference && reference.n)) ? Math.round(Number(reference.n)) : null;
          appendTradeReconAudit({
              n: trade.n,
              code: trade.code,
              sourceN,
              lifeManual: code === 'Bl' ? toFiniteOrNull(lifeGain) : null,
              note: code === 'Bl' ? 'penalty cloned /3; Life manual' : 'values cloned from run'
          });

          return { ok: true, trade };
      }

      function buildManualReconciliationTrade(code, n, reference, tradePost, lifeGain) {
          const magnitudes = getReconciliationMagnitudes(code, reference, tradePost);
          if (!magnitudes) return null;

          const miningGain = Number.isFinite(toFiniteOrNull(reference && reference.miningGain))
              ? toFiniteOrNull(reference.miningGain)
              : null;

          const remaining = calcReconciledRemaining(code, n, reference);

          if (code === 'Bl') {
              const life = toFiniteOrNull(lifeGain);
              if (!Number.isFinite(life) || life <= 0) return null;

              const perStatPenalty = magnitudes.blackEach;
              if (!Number.isFinite(perStatPenalty) || perStatPenalty <= 0) return null;

              return {
                  code,
                  plus: life,
                  plusStat: 'max life',
                  minus: perStatPenalty,
                  minusStat: 'spd, pow, str',
                  miningGain,
                  remaining
              };
          }

          const map = getCoreTradeStatMap(code);
          if (!map) return null;

          if (!Number.isFinite(magnitudes.plus) || !Number.isFinite(magnitudes.minus)) return null;

          return {
              code,
              plus: magnitudes.plus,
              plusStat: map.plusStat,
              minus: magnitudes.minus,
              minusStat: map.minusStat,
              miningGain,
              remaining
          };
      }

      function getCoreTradeStatMap(code) {
          return {
              Gr: { plusStat: 'str', minusStat: 'spd' },
              Wh: { plusStat: 'str', minusStat: 'pow' },
              Ye: { plusStat: 'spd', minusStat: 'pow' },
              Or: { plusStat: 'spd', minusStat: 'str' },
              Re: { plusStat: 'pow', minusStat: 'str' },
              Pu: { plusStat: 'pow', minusStat: 'spd' }
          }[code] || null;
      }

      function getReconciliationMagnitudes(code, reference, tradePost) {
          const previewRows = tradePost && Array.isArray(tradePost.rows) ? tradePost.rows : [];
          const selectedPreview = previewRows.find(r => r && r.code === code);
          const anyCorePreview = previewRows.find(r => r && r.code !== 'Bl' && TRADE_ORES.includes(r.code));
          const blackPreview = previewRows.find(r => r && r.code === 'Bl');

          const refCode = String(reference && reference.code || '');
          const refPlus = Math.abs(toFiniteOrNull(reference && reference.plus) || 0);
          const refMinus = Math.abs(toFiniteOrNull(reference && reference.minus) || 0);

          if (code === 'Bl') {
              let corePenalty = null;

              if (reference && refCode !== 'Bl' && refMinus > 0) {
                  corePenalty = refMinus;
              } else if (blackPreview && Math.abs(toFiniteOrNull(blackPreview.minus) || 0) > 0) {
                  corePenalty = Math.abs(toFiniteOrNull(blackPreview.minus)) * 3;
              } else if (anyCorePreview && Math.abs(toFiniteOrNull(anyCorePreview.minus) || 0) > 0) {
                  corePenalty = Math.abs(toFiniteOrNull(anyCorePreview.minus));
              } else if (reference && refCode === 'Bl' && refMinus > 0) {
                  corePenalty = refMinus * 3;
              }

              if (!Number.isFinite(corePenalty) || corePenalty <= 0) return null;
              return { blackEach: corePenalty / 3 };
          }

          if (reference && refCode !== 'Bl' && refPlus > 0 && refMinus > 0) {
              return { plus: refPlus, minus: refMinus };
          }

          if (selectedPreview && Math.abs(toFiniteOrNull(selectedPreview.plus) || 0) > 0 && Math.abs(toFiniteOrNull(selectedPreview.minus) || 0) > 0) {
              return {
                  plus: Math.abs(toFiniteOrNull(selectedPreview.plus)),
                  minus: Math.abs(toFiniteOrNull(selectedPreview.minus))
              };
          }

          if (anyCorePreview && Math.abs(toFiniteOrNull(anyCorePreview.plus) || 0) > 0 && Math.abs(toFiniteOrNull(anyCorePreview.minus) || 0) > 0) {
              return {
                  plus: Math.abs(toFiniteOrNull(anyCorePreview.plus)),
                  minus: Math.abs(toFiniteOrNull(anyCorePreview.minus))
              };
          }

          return null;
      }

      function calcReconciledRemaining(code, n, reference) {
          if (!reference || String(reference.code || '') !== String(code || '')) return null;
          const refN = toFiniteOrNull(reference.n);
          const refRemaining = toFiniteOrNull(reference.remaining);
          const targetN = toFiniteOrNull(n);
          if (!Number.isFinite(refN) || !Number.isFinite(refRemaining) || !Number.isFinite(targetN)) return null;
          const delta = Math.max(0, Math.round(refN - targetN));
          return Math.round(refRemaining + delta);
      }

      function normalizeLedgerTrade(t) {
          if (!t || typeof t !== 'object') return null;

          const normalized = normalizeCompletedTrade({
              ...t,
              code: String(t.code || ''),
              plus: toFiniteOrNull(t.plus),
              plusStat: normalizeStatName(t.plusStat),
              minus: toFiniteOrNull(t.minus),
              minusStat: normalizeStatName(t.minusStat),
              miningGain: toFiniteOrNull(t.miningGain),
              remaining: toFiniteOrNull(t.remaining)
          });

          if (!normalized || !TRADE_ORES.includes(normalized.code)) return null;

          return {
              ...normalized,
              dayKey: t.dayKey || dayKey,
              n: Number.isFinite(Number(t.n)) ? Math.round(Number(t.n)) : null,
              time: String(t.time || '')
          };
      }

      function calcTradeDelta(t) {
          const out = { spd: 0, pow: 0, str: 0, life: 0, tbs: 0 };

          applyStatDelta(out, t.plusStat, toFiniteOrNull(t.plus), 1);
          applyStatDelta(out, t.minusStat, toFiniteOrNull(t.minus), -1);

          out.tbs = out.str + out.spd + out.pow;
          return out;
      }

      function applyStatDelta(out, statText, amount, sign) {
          if (!Number.isFinite(amount)) return;

          const stats = String(statText || '')
          .toLowerCase()
          .split(',')
          .map(s => normalizeStatName(s.trim()))
          .filter(Boolean);

          for (const stat of stats) {
              if (stat === 'spd, pow, str') {
                  out.spd += sign * amount;
                  out.pow += sign * amount;
                  out.str += sign * amount;
                  continue;
              }
              if (stat === 'pow, str') {
                  out.pow += sign * amount;
                  out.str += sign * amount;
                  continue;
              }
              if (stat === 'str') out.str += sign * amount;
              if (stat === 'spd') out.spd += sign * amount;
              if (stat === 'pow') out.pow += sign * amount;
              if (stat === 'max life') out.life += sign * amount;
          }
      }

      function calcTradeTotals(trades) {
          const totals = { spd: 0, pow: 0, str: 0, life: 0, tbs: 0, mining: 0 };

          for (const t of trades || []) {
              totals.str += Number(t.strDelta) || 0;
              totals.spd += Number(t.spdDelta) || 0;
              totals.pow += Number(t.powDelta) || 0;
              totals.life += Number(t.lifeDelta) || 0;
              totals.tbs += Number(t.tbsNet) || 0;
              totals.mining += Number(t.miningGain) || 0;
          }

          return totals;
      }

      function getCurrentDayTrades(trades) {
          return (trades || []).filter(t => String(t.dayKey || '') === String(dayKey));
      }

      function calcDailyTbsBalance(swim, tradeTotals) {
          const swimStr = Number(swim && swim.str) || 0;
          const swimPow = Number(swim && swim.pow) || 0;
          const swimSpd = Number(swim && swim.spd) || 0;
          const swimLife = Number(swim && swim.life) || 0;

          const tradeSpd = Number(tradeTotals && tradeTotals.spd) || 0;
          const tradePow = Number(tradeTotals && tradeTotals.pow) || 0;
          const tradeStr = Number(tradeTotals && tradeTotals.str) || 0;
          const tradeLife = Number(tradeTotals && tradeTotals.life) || 0;
          const tradeNet = tradeSpd + tradePow + tradeStr;

          const swimNet = swimStr + swimPow + swimSpd;

          const net = {
              str: swimStr + tradeStr,
              pow: swimPow + tradePow,
              spd: swimSpd + tradeSpd,
              life: swimLife + tradeLife
          };

          net.tbs = net.str + net.pow + net.spd;

          return {
              net,
              swim: {
                  str: swimStr,
                  pow: swimPow,
                  spd: swimSpd,
                  life: swimLife,
                  tbs: swimNet
              },
              trade: {
                  spd: tradeSpd,
                  pow: tradePow,
                  str: tradeStr,
                  life: tradeLife,
                  tbs: tradeNet
              }
          };
      }

      function getSwimDailyForDay(swimMap, tradeDayKey) {
          const key = String(tradeDayKey || dayKey);
          const obj = swimMap && typeof swimMap === 'object' ? swimMap[key] : null;

          return {
              dayKey: key,
              str: Number.isFinite(Number(obj && obj.str)) ? Number(obj.str) : 0,
              pow: Number.isFinite(Number(obj && obj.pow)) ? Number(obj.pow) : 0,
              spd: Number.isFinite(Number(obj && obj.spd)) ? Number(obj.spd) : 0,
              life: Number.isFinite(Number(obj && obj.life)) ? Number(obj.life) : 0,
              source: String(obj && obj.source || ''),
              time: String(obj && obj.time || '')
          };
      }

      function loadSwimDailyMap() {
          try {
              const v = JSON.parse(GM_getValue(K_SWIM_DAILY, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function saveSwimDailyMap(v) {
          GM_setValue(K_SWIM_DAILY, JSON.stringify(v && typeof v === 'object' ? v : {}));
      }

      function updateAndLoadSwimDaily() {
          const map = loadSwimDailyMap();
          const bridged = readJungleEntriesFromSharedStorage();

          if (bridged) {
              map[dayKey] = bridged;
              saveSwimDailyMap(map);
          }

          return normalizeSwimDaily(map[dayKey]);
      }

      function normalizeSwimDaily(v) {
          const obj = v && typeof v === 'object' ? v : {};

          return {
              dayKey,
              str: Number.isFinite(Number(obj.str)) ? Number(obj.str) : 0,
              pow: Number.isFinite(Number(obj.pow)) ? Number(obj.pow) : 0,
              spd: Number.isFinite(Number(obj.spd)) ? Number(obj.spd) : 0,
              life: Number.isFinite(Number(obj.life)) ? Number(obj.life) : 0,
              source: String(obj.source || ''),
              time: String(obj.time || '')
          };
      }

      function readJungleEntriesFromSharedStorage() {
          const rawCandidates = [];

          try {
              rawCandidates.push(GM_getValue('jbgl_entries_v1', ''));
          } catch {
              // Cross-script GM storage is isolated in many userscript managers.
          }

          try {
              rawCandidates.push(window.localStorage ? window.localStorage.getItem('jbgl_entries_v1') : '');
          } catch {
              // localStorage may be unavailable.
          }

          for (const raw of rawCandidates) {
              const rows = parseJungleEntriesJson(raw);
              if (!rows.length) continue;

              const total = sumSwimRowsForDay(rows, dayKey);
              if (
                  Math.abs(total.str) > 0.000001 ||
                  Math.abs(total.pow) > 0.000001 ||
                  Math.abs(total.spd) > 0.000001 ||
                  Math.abs(total.life) > 0.000001
              ) {
                  return { ...total, source: 'jungle-storage', time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : '' };
              }
          }

          return null;
      }

      function parseJungleEntriesJson(raw) {
          try {
              const v = JSON.parse(String(raw || '[]'));
              return Array.isArray(v) ? v : [];
          } catch {
              return [];
          }
      }

      function sumSwimRowsForDay(rows, targetDayKey) {
          const total = {
              str: 0,
              pow: 0,
              spd: 0,
              life: 0
          };

          for (const r of rows || []) {
              const rowDay = getJungleRowDayKey(r);
              if (rowDay !== targetDayKey) continue;

              const str = Number(r && r.str);
              const pow = Number(r && r.pow);
              const spd = Number(r && r.spd);
              const life = Number(r && (r.mlg ?? r.life));

              if (Number.isFinite(str)) total.str += str;
              if (Number.isFinite(pow)) total.pow += pow;
              if (Number.isFinite(spd)) total.spd += spd;
              if (Number.isFinite(life)) total.life += life;
          }

          return total;
      }

      function getJungleRowDayKey(row) {
          const explicit = String(row && row.dayKey || '').trim();
          if (/^\d{2}\s+[A-Z]{3}$/i.test(explicit)) return explicit.toUpperCase();

          const ts = String(row && row.ts || row && row.hourKey || '').trim();
          const m = ts.match(/^(\d{1,2})\s+([A-Z]{3})/i);
          if (!m) return '';

          return `${String(parseInt(m[1], 10)).padStart(2, '0')} ${m[2].toUpperCase()}`;
      }

      function importSwimExportText(raw) {
          const map = loadSwimDailyMap();
          const parsed = parseSwimExport(raw);

          for (const [k, v] of Object.entries(parsed)) {
              map[k] = {
                  dayKey: k,
                  str: v.str,
                  pow: v.pow,
                  spd: v.spd,
                  life: v.life,
                  source: 'jungle-export',
                  time: clock ? `${pad(clock.h)}:${pad(clock.m)}:${pad(clock.s)}` : ''
              };
          }

          saveSwimDailyMap(map);
          return parsed;
      }

      function parseSwimExport(raw) {
          const out = {};
          const lines = String(raw || '').split(/\r?\n/);

          for (const line of lines) {
              const m = line.match(/^(\d{1,2})\s+([A-Z]{3})-\d{2}:\d{2}\s*<([^>]+)>/i);
              if (!m) continue;

              const key = `${String(parseInt(m[1], 10)).padStart(2, '0')} ${m[2].toUpperCase()}`;
              const parts = String(m[3]).split('-');
              if (parts.length < 4) continue;

              const str = parseMaybeFloat(parts[0]);
              const pow = parseMaybeFloat(parts[1]);
              const spd = parseMaybeFloat(parts[2]);
              const life = parseMaybeFloat(parts[3]);

              if (![str, pow, spd, life].some(Number.isFinite)) continue;

              if (!out[key]) out[key] = { str: 0, pow: 0, spd: 0, life: 0 };
              if (Number.isFinite(str) && Math.abs(str) > 0.000001) out[key].str += str;
              if (Number.isFinite(pow) && Math.abs(pow) > 0.000001) out[key].pow += pow;
              if (Number.isFinite(spd) && Math.abs(spd) > 0.000001) out[key].spd += spd;
              if (Number.isFinite(life) && Math.abs(life) > 0.000001) out[key].life += life;
          }

          return out;
      }

      function groupTradeRuns(trades) {
          const sorted = [...(trades || [])].sort((a, b) => Number(a.n) - Number(b.n));
          const groups = [];

          for (const trade of sorted) {
              const last = groups[groups.length - 1];

              const band = Math.floor((Number(trade.n) - 1) / 10);

              const canJoin =
                    last &&
                    last.band === band &&
                    Number(last.to) + 1 === Number(trade.n) &&
                    last.code === trade.code &&
                    last.plusStat === trade.plusStat &&
                    last.minusStat === trade.minusStat &&
                    sameNumber(last.plus, trade.plus) &&
                    sameNumber(last.minus, trade.minus);

              if (canJoin) {
                  last.to = trade.n;
                  last.trades.push(trade);
              } else {
                  groups.push({
                      from: trade.n,
                      to: trade.n,
                      band,
                      code: trade.code,
                      plus: trade.plus,
                      plusStat: trade.plusStat,
                      minus: trade.minus,
                      minusStat: trade.minusStat,
                      trades: [trade]
                  });
              }
          }

          for (const group of groups) {
              group.totals = calcTradeTotals(group.trades);
              group.count = group.trades.length;
          }

          return groups;
      }

      function groupTradeDays(trades) {
          const byDay = new Map();

          for (const trade of trades || []) {
              const key = String(trade.dayKey || dayKey);
              if (!byDay.has(key)) byDay.set(key, []);
              byDay.get(key).push(trade);
          }

          const days = Array.from(byDay.entries()).map(([key, dayTrades]) => {
              const sorted = [...dayTrades].sort((a, b) => Number(a.n) - Number(b.n));
              return {
                  dayKey: key,
                  trades: sorted,
                  count: sorted.length,
                  totals: calcTradeTotals(sorted),
                  groups: groupTradeRuns(sorted)
              };
          });

          days.sort((a, b) => dayKeySortValue(b.dayKey) - dayKeySortValue(a.dayKey));
          return days;
      }

      function dayKeySortValue(key) {
          const m = String(key || '').match(/^(\d{1,2})\s+([A-Z]{3})$/i);
          if (!m) return -1;

          const monthOrder = {
              jan: 1,
              feb: 2,
              mar: 3,
              apr: 4,
              may: 5,
              jun: 6,
              jul: 7,
              aug: 8,
              sep: 9,
              oct: 10,
              nov: 11,
              dec: 12
          };

          const month = monthOrder[m[2].toLowerCase()] || 0;
          const day = parseInt(m[1], 10) || 0;
          return month * 100 + day;
      }

      function loadCollapsedDays() {
          try {
              const v = JSON.parse(GM_getValue(K_COLLAPSED_DAYS, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function saveCollapsedDays(v) {
          GM_setValue(K_COLLAPSED_DAYS, JSON.stringify(v && typeof v === 'object' ? v : {}));
      }

      function isTradeDayCollapsed(tradeDayKey, currentDayKey, collapsedMap) {
          if (Object.prototype.hasOwnProperty.call(collapsedMap, tradeDayKey)) {
              return !!collapsedMap[tradeDayKey];
          }

          return String(tradeDayKey || '') !== String(currentDayKey || '');
      }

      function maybeRecordSnapshot(s) {
          if (!Number.isFinite(s.tUsed) && !Number.isFinite(s.mining)) return;

          const lastTradeKey = s.completedTrade
          ? [
              s.completedTrade.code,
              s.completedTrade.plus,
              s.completedTrade.plusStat,
              s.completedTrade.minus,
              s.completedTrade.minusStat,
              s.completedTrade.miningGain,
              s.completedTrade.remaining
          ].join(':')
          : '';

          const fp = [
              s.dayKey,
              s.level,
              s.mining,
              s.found,
              s.foundShards,
              s.traded,
              s.tradedShards,
              s.tUsed,
              s.tradePost.tradesToday,
              s.tradeLedger.trades.length,
              s.currentDayTrades.length,
              s.swimDaily.str,
              s.swimDaily.pow,
              s.swimDaily.spd,
              s.swimDaily.life,
              s.dailyBalance.net.life,
              s.dailyBalance.net.tbs,
              s.dailyTotals.str,
              s.dailyTotals.spd,
              s.dailyTotals.pow,
              s.dailyTotals.tbs,
              lastTradeKey,
              Object.entries(s.stock).map(([k, v]) => `${k}${v}`).join(',')
          ].join('|');

          const prev = String(GM_getValue(K_LAST_FP, '') || '');
          if (fp === prev) return;

          GM_setValue(K_LAST_FP, fp);

          rows.unshift({
              ts: `${s.dayKey} ${s.time}`.trim(),
              level: s.level,
              mining: s.mining,
              found: s.found,
              foundShards: s.foundShards,
              traded: s.traded,
              tradedShards: s.tradedShards,
              tUsed: s.tUsed,
              actualOreT: s.actualOreT,
              impliedOreT: s.impliedOreT,
              stock: s.stock,
              tradesToday: s.tradePost.tradesToday,
              tradeCount: s.tradeLedger.trades.length,
              currentDayTradeCount: s.currentDayTrades.length,
              swimDaily: s.swimDaily,
              dailyBalance: s.dailyBalance,
              dailyTotals: s.dailyTotals,
              completedTrade: s.completedTrade
          });

          if (rows.length > MAX_ROWS) rows.length = MAX_ROWS;
          saveRows(rows);
      }

      function injectMttLayoutStyle() {
          if (document.getElementById('mtt-layout-style')) return;

          const style = document.createElement('style');
          style.id = 'mtt-layout-style';
          style.textContent = `
body div.content-wrap div.content-area {
  margin: 0 auto 0 15px;
  min-width: 745px !important;
  max-width: 745px !important;
}

/*
 * Content-End and Open-Area placements can be dramatically wider than the
 * original 410px fixed HUD.  Keep the compact fixed-panel typography, but
 * let ledger data consume the horizontal room instead of remaining packed
 * against the left edge.
 */
#mtt-panel.mtt-wide-layout .mtt-trade-day-header,
#mtt-panel.mtt-wide-layout .mtt-trade-group,
#mtt-panel.mtt-wide-layout .mtt-trade-source-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
}

#mtt-panel.mtt-wide-layout .mtt-trade-day-header {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

#mtt-panel.mtt-wide-layout .mtt-trade-group {
  padding: 0 18px;
  min-height: 18px;
}

#mtt-panel.mtt-wide-layout .mtt-trade-source-line {
  padding-right: 18px;
}

#mtt-panel.mtt-wide-layout .mtt-trade-group > span,
#mtt-panel.mtt-wide-layout .mtt-trade-source-line > span,
#mtt-panel.mtt-wide-layout .mtt-trade-day-header > span {
  flex: 0 1 auto;
  min-width: 0;
}

/* Preserve the original dense left-packed presentation in compact fixed modes. */
#mtt-panel:not(.mtt-wide-layout) .mtt-trade-day-header,
#mtt-panel:not(.mtt-wide-layout) .mtt-trade-group,
#mtt-panel:not(.mtt-wide-layout) .mtt-trade-source-line {
  display: block;
}`;
          document.head.appendChild(style);
      }

      function renderTradingPostBalance(s) {
          const existing = document.getElementById('mtt-trading-post-balance');
          const anchor = findTradingPostBannerAnchor();

          if (!anchor) {
              if (existing) existing.remove();
              return;
          }

          const box = existing || document.createElement('div');
          box.id = 'mtt-trading-post-balance';
          box.style.cssText = [
              'text-align:center',
              'margin:2px 0 0',
              'padding:5px 0',
              'width:calc(100% - 2px)',
              `border:1px inset ${COLORS.border}`,
              'border-top-width: 2px',
              'border-bottom-width: 2px',
              'border-radius:4px',
              'background:#000000',
              `color:${COLORS.text}`,
              'font-family:Consolas, monospace',
              'box-shadow:1px 1px 1px #00000088'
          ].join(';');

          box.replaceChildren(
              renderBalancePrimaryLine(s.dailyBalance),
              renderBalanceSourceLine(s.dailyBalance)
          );

          if (!existing || box.parentNode !== anchor.parentNode) {
              anchor.insertAdjacentElement('afterend', box);
          }
      }

      function findTradingPostBannerAnchor() {
          const area = document.querySelector('.content-area');
          if (!area) return null;

          const href = String(location.href || '');
          const isTradePage =
                /[?&]cmd=mines(?:[&#]|$|&)/i.test(href) &&
                /[?&]do=trade(?:[&#]|$|&)/i.test(href);

          if (!isTradePage) return null;

          const centers = Array.from(area.querySelectorAll('center'));
          const depot = centers.find(el => {
              const t = normalizeSpace(el.textContent || '');
              return /Miner's Depot/i.test(t) && /Mining\s*:/i.test(t);
          });

          if (depot) return depot;

          return area.firstElementChild || null;
      }

      function renderBalancePrimaryLine(balance) {
          const div = document.createElement('div');
          div.style.fontSize = '16px';
          div.style.lineHeight = '1.25';
          div.appendChild(textNode('TBS Δ < '));
          appendBalancePart(div, balance.net.spd, 'SPD', COLORS.spd, 2);
          div.appendChild(textNode(' | '));
          appendBalancePart(div, balance.net.pow, 'POW', COLORS.pow, 2);
          div.appendChild(textNode(' | '));
          appendBalancePart(div, balance.net.str, 'STR', COLORS.str, 2);
          div.appendChild(textNode(' | '));
          appendBalancePart(div, balance.net.tbs, 'NET', COLORS.tbs, 2);
          div.appendChild(textNode(' > Life Δ <'));
          appendBalancePart(div, balance.net.life, '', COLORS.text, 0);
          div.appendChild(textNode('>'));
          return div;
      }

      function renderBalanceSourceLine(balance) {
          const div = document.createElement('div');
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'space-between';
          div.style.gap = '12px';
          div.style.fontSize = '12px';
          div.style.lineHeight = '1.25';
          div.style.margin = '3px auto 0';
          div.style.maxWidth = 'calc(100% - 12px)';

          const swim = document.createElement('span');
          const trade = document.createElement('span');

          const swimParts = [
              ['SPD', balance.swim.spd, SOURCE_COLORS.spd, 2],
              ['POW', balance.swim.pow, SOURCE_COLORS.pow, 2],
              ['STR', balance.swim.str, SOURCE_COLORS.str, 2],
              ['Life', balance.swim.life, SOURCE_COLORS.life, 0]
          ].filter(([, value]) => (Number(value) || 0) > 0.000001);

          if (swimParts.length > 0) {
              swim.appendChild(textNode('Swim < '));

              swimParts.forEach(([label, value, color, decimals], index) => {
                  if (index > 0) {
                      swim.appendChild(textNode(' | '));
                  }

                  appendBalancePart(
                      swim,
                      value,
                      label,
                      color,
                      decimals
                  );
              });

              swim.appendChild(textNode(' >'));
          }

          trade.appendChild(textNode('Trade < '));
          appendBalancePart(trade, balance.trade.spd, 'SPD', SOURCE_COLORS.spd, 2);
          trade.appendChild(textNode(' | '));
          appendBalancePart(trade, balance.trade.pow, 'POW', SOURCE_COLORS.pow, 2);
          trade.appendChild(textNode(' | '));
          appendBalancePart(trade, balance.trade.str, 'STR', SOURCE_COLORS.str, 2);
          if (Math.abs(Number(balance.trade.life) || 0) > 0.000001) {
              trade.appendChild(textNode(' | '));
              appendBalancePart(trade, balance.trade.life, 'Life', SOURCE_COLORS.life, 0);
          }
          trade.appendChild(textNode(' >'));

          if (swimParts.length > 0) {
              div.appendChild(swim);
          }
          div.appendChild(trade);

          return div;
      }

      function appendBalancePart(parent, value, label, color, decimals) {
          const span = document.createElement('span');
          span.style.color = color;
          const shown = label === 'Life' || label === '' && decimals === 0
          ? fmtSignedWhole(value)
          : fmtSigned(value, decimals);
          span.textContent = label ? `${label} ${shown}` : shown;
          parent.appendChild(span);
      }

      function render(s, rows, state) {
          injectMttLayoutStyle();

          let panel = document.getElementById('mtt-panel');

          if (!panel) {
              panel = document.createElement('fieldset');
              panel.id = 'mtt-panel';

              panel.style.cssText = [
                  'box-sizing:border-box',
                  `background:${COLORS.panelBg}`,
                  `border:1px solid ${COLORS.border}`,
                  'border-radius:3px',
                  'box-shadow:1px 1px 1px 2px #00000088',
                  `color:${COLORS.text}`,
                  'font-family:Consolas, monospace',
                  'font-size:13px',
                  'line-height:1.05',
                  'padding:0 4px',
                  'white-space:pre',
                  'overflow:auto',
                  'z-index:99998',
                  'scrollbar-width:thin!important'
              ].join(';');

              const legend = document.createElement('legend');
              legend.style.color = '#ebebeb';
              legend.style.padding = '0 5px';
              legend.style.margin = 'auto';
              legend.style.fontSize = '14px';
              legend.style.position = 'relative';
              legend.style.bottom = '8px';
              legend.style.backgroundColor = '#000000';
              legend.style.borderRadius = '6px 6px 0 0';
              legend.style.border = '1px solid #2f8fbc';
              legend.style.borderBottom = '0';
              legend.style.display = 'inline-flex';
              legend.style.alignItems = 'center';
              legend.style.gap = '5px';

              const title = document.createElement('span');
              title.textContent = `Mines Telemetry v${SCRIPT_VERSION}`;

              const settingsBtn = document.createElement('button');
              settingsBtn.type = 'button';
              settingsBtn.textContent = '⚙';
              settingsBtn.title = 'Mines settings';
              settingsBtn.setAttribute('aria-label', 'Mines settings');
              settingsBtn.style.cssText = [
                  'display:inline-flex',
                  'align-items:center',
                  'justify-content:center',
                  'width:16px',
                  'height:16px',
                  'padding:0',
                  'border:1px solid #555',
                  'border-radius:3px',
                  'background:#1d1d1d',
                  'color:#ddd',
                  'font-size:11px',
                  'line-height:14px',
                  'cursor:pointer'
              ].join(';');

              settingsBtn.addEventListener('click', event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMttPlacementDialog(panel);
              });

              legend.append(title, settingsBtn);
              panel.appendChild(legend);
              document.body.appendChild(panel);
          }

          applyMttPanelPlacement(panel);
          bindMttPlacementResize();

          const legend = panel.querySelector('legend');
          const body = document.createElement('div');
          body.className = 'mtt-panel-body';

          body.style.display = 'flex';
          body.style.flexDirection = 'column';
          body.style.minHeight = '100%';

          //body.appendChild(renderDailyHeading(s.dayKey, s.dailyTotals));
          body.appendChild(renderTradeStatus(s));

          //if (s.completedTrade) {
          //    body.appendChild(renderCompletedTrade(s.completedTrade));
          //}

          body.appendChild(renderTradeReconciliation(s));
          body.appendChild(renderTradeReconAuditFootnotes(s));

          body.appendChild(line(''));
          body.appendChild(renderTradeDays(s, rows, state));

          body.appendChild(line(''));
          body.appendChild(renderButtons(s, rows));
          body.appendChild(renderStockBlock(s.stock));

          panel.replaceChildren(legend, body);
          updateMttLedgerGeometry(panel, loadMttPanelPlacement(), measureMttPlacementBounds());
      }

      function loadMttMineInteriorLayout() {
          const raw = String(
              GM_getValue(
                  K_MINE_INTERIOR_LAYOUT,
                  MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN
              ) || ''
          );

          return raw === MTT_MINE_INTERIOR_LAYOUTS.NATIVE
              ? MTT_MINE_INTERIOR_LAYOUTS.NATIVE
              : MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN;
      }

      function saveMttMineInteriorLayout(value) {
          const next = value === MTT_MINE_INTERIOR_LAYOUTS.NATIVE
              ? MTT_MINE_INTERIOR_LAYOUTS.NATIVE
              : MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN;

          GM_setValue(K_MINE_INTERIOR_LAYOUT, next);
          return next;
      }

      function loadMttPanelPlacement() {
          const rawMode = String(GM_getValue(K_PANEL_MODE, MTT_PANEL_MODES.FIXED) || '');
          const rawAnchor = String(GM_getValue(K_PANEL_ANCHOR, 'top-left') || '');

          return {
              mode: rawMode === MTT_PANEL_MODES.CONTENT_END
                  ? MTT_PANEL_MODES.CONTENT_END
                  : MTT_PANEL_MODES.FIXED,
              anchor: MTT_PANEL_ANCHORS.includes(rawAnchor)
                  ? rawAnchor
                  : 'top-left'
          };
      }

      function saveMttPanelPlacement(next) {
          const current = loadMttPanelPlacement();

          const mode = next && next.mode === MTT_PANEL_MODES.CONTENT_END
              ? MTT_PANEL_MODES.CONTENT_END
              : next && next.mode === MTT_PANEL_MODES.FIXED
                  ? MTT_PANEL_MODES.FIXED
                  : current.mode;

          const anchor = next && MTT_PANEL_ANCHORS.includes(next.anchor)
              ? next.anchor
              : current.anchor;

          GM_setValue(K_PANEL_MODE, mode);
          GM_setValue(K_PANEL_ANCHOR, anchor);

          return { mode, anchor };
      }

      function measureMttPlacementBounds() {
          const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
          const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);

          const content =
              document.querySelector('.content-area') ||
              document.getElementById('main');

          const contentRect = content && typeof content.getBoundingClientRect === 'function'
              ? content.getBoundingClientRect()
              : null;

          const chromeSelectors = [
              '.topbar',
              '#topbar',
              '.top-menu',
              '#top-menu',
              '.topmenu',
              '#topmenu',
              '[class*="topbar-menu"]',
              '[class*="topmenu"]',
              '[id*="topbar-menu"]',
              '[id*="topmenu"]'
          ];

          const chromeNodes = new Set();

          for (const selector of chromeSelectors) {
              try {
                  for (const node of document.querySelectorAll(selector)) {
                      chromeNodes.add(node);
                  }
              } catch {
                  // Ignore unsupported selector variants in older browsers.
              }
          }

          let chromeBottom = 0;

          for (const node of chromeNodes) {
              if (!(node instanceof Element)) continue;

              const style = getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden') continue;

              const rect = node.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) continue;
              if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;

              // Only treat geometry living at the top of the viewport/page as
              // native top chrome. This prevents unrelated "topmenu"-named
              // descendants lower in content from expanding the bound.
              if (rect.top <= Math.max(12, rect.height * 0.35)) {
                  chromeBottom = Math.max(chromeBottom, rect.bottom);
              }
          }

          // The content area's top edge is the most reliable live boundary for
          // the native top chrome because it already reflects whether the optional
          // top menu is present, the active legacy/Future layout, and browser zoom.
          // Keep selector-based chrome detection as a fallback/cross-check, but never
          // allow it to place the panel above the content area's rendered top edge.
          const contentTop = contentRect
              ? Math.max(0, Math.round(contentRect.top))
              : 0;

          const nativeTopBottom = Math.max(
              0,
              Math.round(chromeBottom),
              contentTop
          );

          // The fieldset legend is intentionally raised 8px above the fieldset border.
          // Offset the fieldset itself by that amount so the *visible legend* still
          // begins at the requested 5px gutter below native top geometry.
          const top = nativeTopBottom +
              MTT_PANEL_GUTTER.topChrome +
              MTT_PANEL_GUTTER.legendOverhang;

          const contentRight = contentRect
              ? Math.round(contentRect.right)
              : 0;

          const contentHeight = contentRect
              ? Math.max(0, Math.round(contentRect.height))
              : 0;

          const left = Math.max(
              MTT_PANEL_GUTTER.side,
              Math.min(
                  viewportWidth - MTT_PANEL_GUTTER.side,
                  contentRight + MTT_PANEL_GUTTER.side
              )
          );

          const right = Math.max(
              left,
              viewportWidth - MTT_PANEL_GUTTER.side
          );

          const bottom = Math.max(
              top,
              viewportHeight - MTT_PANEL_GUTTER.bottom
          );

          return {
              viewportWidth,
              viewportHeight,
              chromeBottom: nativeTopBottom,
              contentTop,
              contentRight,
              contentHeight,
              top,
              left,
              right,
              bottom,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top)
          };
      }

      function resetMttPanelPlacementStyles(panel) {
          const props = [
              'position', 'top', 'right', 'bottom', 'left',
              'width', 'maxWidth', 'height', 'maxHeight',
              'margin', 'zIndex'
          ];

          for (const prop of props) {
              panel.style[prop] = '';
          }
      }

      function applyMttPanelPlacement(panel, suppliedSettings = null) {
          if (!panel) return;

          const settings = suppliedSettings || loadMttPanelPlacement();
          const bounds = measureMttPlacementBounds();

          panel.classList.toggle(
              'mtt-wide-layout',
              settings.mode === MTT_PANEL_MODES.CONTENT_END ||
              settings.anchor === 'open-area'
          );
          panel.classList.toggle(
              'mtt-content-end',
              settings.mode === MTT_PANEL_MODES.CONTENT_END
          );
          panel.classList.toggle(
              'mtt-fixed-layout',
              settings.mode === MTT_PANEL_MODES.FIXED
          );

          resetMttPanelPlacementStyles(panel);

          const legend = panel.querySelector(':scope > legend');

          if (legend) {
              legend.style.margin = 'auto';
              legend.style.bottom = '8px';
              legend.style.display = 'inline-flex';
          }

          if (settings.mode === MTT_PANEL_MODES.CONTENT_END) {
              if (legend) {
                  legend.style.margin = '0 5px 0 auto';
                  legend.style.bottom = '9px';
                  legend.style.display = 'flex';
              }
              panel.style.position = 'static';
              panel.style.width = '100%';
              panel.style.maxWidth = '100%';
              panel.style.height = 'auto';
              panel.style.maxHeight = 'none';
              panel.style.margin = '8px 0 0';
              panel.style.zIndex = 'auto';

              const host =
                  document.querySelector('.content-area') ||
                  document.getElementById('main') ||
                  document.body;

              if (host && panel.parentElement !== host) {
                  host.appendChild(panel);
              } else if (host && panel !== host.lastElementChild) {
                  host.appendChild(panel);
              }

              updateMttLedgerGeometry(panel, settings, bounds);
              return bounds;
          }

          if (panel.parentElement !== document.body) {
              document.body.appendChild(panel);
          }

          panel.style.position = 'fixed';
          panel.style.margin = '0';
          panel.style.zIndex = '99998';
          panel.style.display = 'flex';
          panel.style.flexDirection = 'column';
          panel.style.minHeight = '0';

          const availableWidth = Math.max(120, bounds.width);
          const fixedWidth = Math.min(PANEL_WIDTH, availableWidth);
          const sixtyPercent = Math.max(120, Math.floor(bounds.height * 0.60));

          const leftAligned = /-left$/.test(settings.anchor);
          const rightAligned = /-right$/.test(settings.anchor);

          if (settings.anchor === 'open-area') {
              panel.style.left = `${bounds.left}px`;
              panel.style.right = `${Math.max(0, bounds.viewportWidth - bounds.right)}px`;
              panel.style.top = `${bounds.top}px`;
              panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
              panel.style.width = 'auto';
              panel.style.maxWidth = 'none';
              panel.style.height = 'auto';
              panel.style.maxHeight = 'none';
              updateMttLedgerGeometry(panel, settings, bounds);
              return bounds;
          }

          panel.style.width = `${fixedWidth}px`;
          panel.style.maxWidth = `${availableWidth}px`;

          if (leftAligned) {
              panel.style.left = `${bounds.left}px`;
          } else if (rightAligned) {
              panel.style.right = `${Math.max(0, bounds.viewportWidth - bounds.right)}px`;
          }

          if (settings.anchor.startsWith('top-')) {
              panel.style.top = `${bounds.top}px`;
              panel.style.height = `${sixtyPercent}px`;
              panel.style.maxHeight = 'none';
          } else if (settings.anchor.startsWith('bottom-')) {
              panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
              panel.style.height = `${sixtyPercent}px`;
              panel.style.maxHeight = 'none';
          } else {
              panel.style.top = `${bounds.top}px`;
              panel.style.bottom = `${Math.max(0, bounds.viewportHeight - bounds.bottom)}px`;
              panel.style.height = 'auto';
              panel.style.maxHeight = 'none';
          }

          updateMttLedgerGeometry(panel, settings, bounds);
          return bounds;
      }

      function updateMttLedgerGeometry(panel, suppliedSettings = null, suppliedBounds = null) {
          if (!panel) return;

          const settings = suppliedSettings || loadMttPanelPlacement();
          const bounds = suppliedBounds || measureMttPlacementBounds();
          const panelBody = panel.querySelector('.mtt-panel-body');
          const ledger = panel.querySelector('.mtt-ledger-scroll-body');

          if (panelBody) {
              panelBody.style.minHeight = '0';
          }

          if (!ledger) return;

          ledger.style.boxSizing = 'border-box';
          ledger.style.overflowY = 'auto';
          ledger.style.overflowX = 'hidden';
          ledger.style.scrollbarWidth = 'thin';
          ledger.style.paddingRight = '12px';
          ledger.style.minHeight = '0';

          if (settings.mode === MTT_PANEL_MODES.CONTENT_END) {
              // Keep the in-flow ledger useful without letting a long month of
              // trade history dominate the native Mines page. Scale against
              // the live Content Area, with conservative floor/ceiling bounds.
              const referenceHeight = bounds.contentHeight > 0
                  ? bounds.contentHeight
                  : bounds.height;

              const inlineMax = Math.max(
                  180,
                  Math.min(320, Math.floor(referenceHeight * 0.42))
              );

              ledger.style.flex = '0 1 auto';
              ledger.style.maxHeight = `${inlineMax}px`;
              return;
          }

          // Fixed layouts already have an explicit vertical region. Let the
          // ledger consume whatever remains after the status/header controls
          // and sticky footer instead of imposing a second arbitrary cap.
          if (panelBody) {
              panelBody.style.flex = '1 1 auto';
          }

          ledger.style.flex = '1 1 auto';
          ledger.style.maxHeight = 'none';
      }

      function bindMttPlacementResize() {
          if (mttPlacementResizeBound) return;
          mttPlacementResizeBound = true;

          window.addEventListener('resize', () => {
              const panel = document.getElementById('mtt-panel');
              if (!panel) return;
              applyMttPanelPlacement(panel);

              const dialog = document.getElementById('mtt-placement-dialog');
              if (dialog) updateMttPlacementDialogPreview(dialog);
          }, { passive: true });
      }

      function openMttPlacementDialog(panel) {
          document.getElementById('mtt-placement-overlay')?.remove();

          const overlay = document.createElement('div');
          overlay.id = 'mtt-placement-overlay';
          overlay.style.cssText = [
              'position:fixed',
              'inset:0',
              'z-index:2147483646',
              'display:flex',
              'align-items:center',
              'justify-content:center',
              'background:rgba(0,0,0,.48)',
              'font-family:Verdana,Arial,sans-serif'
          ].join(';');

          const dialog = document.createElement('div');
          dialog.id = 'mtt-placement-dialog';
          dialog.style.cssText = [
              'width:min(560px,calc(100vw - 30px))',
              'box-sizing:border-box',
              'padding:10px',
              'border:1px solid #666',
              'border-radius:5px',
              'background:#efefef',
              'color:#111',
              'box-shadow:0 3px 18px rgba(0,0,0,.55)'
          ].join(';');

          const heading = document.createElement('div');
          heading.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:bold;font-size:13px;';

          const title = document.createElement('span');
          title.textContent = 'Mines Settings';

          const close = document.createElement('button');
          close.type = 'button';
          close.textContent = '×';
          close.title = 'Close';
          close.style.cssText = 'width:24px;height:22px;padding:0;border:1px solid #888;border-radius:3px;background:#ddd;cursor:pointer;font-size:16px;line-height:18px;';
          close.addEventListener('click', () => overlay.remove());

          heading.append(title, close);

          const modeRow = document.createElement('div');
          modeRow.style.cssText = 'display:flex;gap:18px;align-items:center;justify-content:center;margin:4px 0 9px;font-size:11px;font-weight:bold;';

          const settings = loadMttPanelPlacement();

          const contentLabel = document.createElement('label');
          const contentRadio = document.createElement('input');
          contentRadio.type = 'radio';
          contentRadio.name = 'mtt-panel-mode';
          contentRadio.value = MTT_PANEL_MODES.CONTENT_END;
          contentRadio.checked = settings.mode === MTT_PANEL_MODES.CONTENT_END;
          contentLabel.append(contentRadio, document.createTextNode(' Content End'));

          const fixedLabel = document.createElement('label');
          const fixedRadio = document.createElement('input');
          fixedRadio.type = 'radio';
          fixedRadio.name = 'mtt-panel-mode';
          fixedRadio.value = MTT_PANEL_MODES.FIXED;
          fixedRadio.checked = settings.mode === MTT_PANEL_MODES.FIXED;
          fixedLabel.append(fixedRadio, document.createTextNode(' Fixed Place'));

          modeRow.append(contentLabel, fixedLabel);

          const mineLayoutRow = document.createElement('div');
          mineLayoutRow.style.cssText = [
              'display:flex',
              'gap:18px',
              'align-items:center',
              'justify-content:center',
              'margin:3px 0 10px',
              'font-size:11px'
          ].join(';');
          mineLayoutRow.title = 'Applies on the next Mines page load.';

          const mineLayoutLabel = document.createElement('strong');
          mineLayoutLabel.textContent = 'Mines Interior Layout:';

          const mineLayout = loadMttMineInteriorLayout();

          const nativeLayoutLabel = document.createElement('label');
          const nativeLayoutRadio = document.createElement('input');
          nativeLayoutRadio.type = 'radio';
          nativeLayoutRadio.name = 'mtt-mine-interior-layout';
          nativeLayoutRadio.value = MTT_MINE_INTERIOR_LAYOUTS.NATIVE;
          nativeLayoutRadio.checked =
              mineLayout === MTT_MINE_INTERIOR_LAYOUTS.NATIVE;
          nativeLayoutLabel.append(
              nativeLayoutRadio,
              document.createTextNode(' Native 2-column')
          );

          const threeLayoutLabel = document.createElement('label');
          const threeLayoutRadio = document.createElement('input');
          threeLayoutRadio.type = 'radio';
          threeLayoutRadio.name = 'mtt-mine-interior-layout';
          threeLayoutRadio.value = MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN;
          threeLayoutRadio.checked =
              mineLayout === MTT_MINE_INTERIOR_LAYOUTS.THREE_COLUMN;
          threeLayoutLabel.append(
              threeLayoutRadio,
              document.createTextNode(' 3-column')
          );

          const onMineLayoutChange = event => {
              if (!event.target.checked) return;
              saveMttMineInteriorLayout(event.target.value);
          };

          nativeLayoutRadio.addEventListener('change', onMineLayoutChange);
          threeLayoutRadio.addEventListener('change', onMineLayoutChange);

          mineLayoutRow.append(
              mineLayoutLabel,
              nativeLayoutLabel,
              threeLayoutLabel
          );

          const preview = document.createElement('div');
          preview.className = 'mtt-placement-preview';
          preview.style.cssText = [
              'position:relative',
              'height:245px',
              'overflow:hidden',
              'border:2px solid #222',
              'border-radius:3px',
              'background:#cfcfcf'
          ].join(';');

          const topbar = document.createElement('div');
          topbar.style.cssText = 'position:absolute;left:0;right:0;top:0;height:36px;background:#777;border-bottom:2px solid #333;text-align:center;font-size:10px;font-weight:bold;line-height:36px;';
          topbar.textContent = 'TOPBAR / TOPBAR MENU';

          const leftPanel = document.createElement('div');
          leftPanel.style.cssText = 'position:absolute;left:0;top:38px;bottom:0;width:18%;background:#e3e3e3;border-right:1px solid #888;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;writing-mode:vertical-rl;transform:rotate(180deg);';
          leftPanel.textContent = 'LEFT PANEL';

          const contentArea = document.createElement('div');
          contentArea.style.cssText = 'position:absolute;left:18%;top:38px;bottom:0;width:40%;background:#f7f7f7;border-right:2px solid #444;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;';
          contentArea.textContent = 'CONTENT AREA';

          const safeArea = document.createElement('div');
          safeArea.style.cssText = 'position:absolute;left:58%;right:0;top:38px;bottom:0;background:#ddd;';

          const shade = document.createElement('div');
          shade.className = 'mtt-placement-shade';
          shade.style.cssText = 'position:absolute;border:1px dashed #2f8fbc;background:rgba(47,143,188,.18);pointer-events:none;';

          const points = {
              'top-left': [8, 13],
              'top-right': [92, 13],
              'middle-left': [8, 50],
              'middle-right': [92, 50],
              'bottom-left': [8, 87],
              'bottom-right': [92, 87],
              'open-area': [50, 50]
          };

          for (const [anchorName, [x, y]] of Object.entries(points)) {
              const label = document.createElement('label');
              label.style.cssText = `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;`;

              const radio = document.createElement('input');
              radio.type = 'radio';
              radio.name = 'mtt-panel-anchor';
              radio.value = anchorName;
              radio.checked = settings.anchor === anchorName;
              radio.style.cursor = 'pointer';

              radio.addEventListener('change', () => {
                  const next = saveMttPanelPlacement({
                      mode: MTT_PANEL_MODES.FIXED,
                      anchor: anchorName
                  });
                  fixedRadio.checked = true;
                  contentRadio.checked = false;
                  applyMttPanelPlacement(panel, next);
                  updateMttPlacementDialogPreview(dialog);
              });

              label.appendChild(radio);
              safeArea.appendChild(label);
          }

          safeArea.appendChild(shade);
          preview.append(topbar, leftPanel, contentArea, safeArea);

          const detail = document.createElement('div');
          detail.className = 'mtt-placement-detail';
          detail.style.cssText = 'margin-top:7px;padding:6px 7px;border:1px solid #bbb;border-radius:3px;background:#fff;font:10px/1.35 Consolas,monospace;white-space:normal;';


          const onModeChange = () => {
              const mode = contentRadio.checked
                  ? MTT_PANEL_MODES.CONTENT_END
                  : MTT_PANEL_MODES.FIXED;

              const next = saveMttPanelPlacement({ mode });
              applyMttPanelPlacement(panel, next);
              updateMttPlacementDialogPreview(dialog);
          };

          contentRadio.addEventListener('change', onModeChange);
          fixedRadio.addEventListener('change', onModeChange);

          dialog.append(heading, modeRow, mineLayoutRow, preview, detail);
          overlay.appendChild(dialog);
          document.body.appendChild(overlay);

          overlay.addEventListener('click', event => {
              if (event.target === overlay) overlay.remove();
          });

          updateMttPlacementDialogPreview(dialog);
      }

      function updateMttPlacementDialogPreview(dialog) {
          if (!dialog) return;

          const settings = loadMttPanelPlacement();
          const bounds = measureMttPlacementBounds();
          const preview = dialog.querySelector('.mtt-placement-preview');
          const safeArea = preview && preview.querySelector('div:nth-child(4)');
          const shade = dialog.querySelector('.mtt-placement-shade');
          const detail = dialog.querySelector('.mtt-placement-detail');
          const anchorInputs = Array.from(dialog.querySelectorAll('input[name="mtt-panel-anchor"]'));

          const enabled = settings.mode === MTT_PANEL_MODES.FIXED;

          for (const input of anchorInputs) {
              input.disabled = !enabled;
          }

          if (safeArea) safeArea.style.opacity = enabled ? '1' : '.45';
          if (shade) shade.style.display = enabled ? 'block' : 'none';

          if (shade && enabled) {
              const styles = {
                  'top-left':     ['6%', '8%', '42%', '52%'],
                  'top-right':    ['52%', '8%', '42%', '52%'],
                  'middle-left':  ['6%', '5%', '42%', '90%'],
                  'middle-right': ['52%', '5%', '42%', '90%'],
                  'bottom-left':  ['6%', '40%', '42%', '52%'],
                  'bottom-right': ['52%', '40%', '42%', '52%'],
                  'open-area':    ['5%', '5%', '90%', '90%']
              };

              const [left, top, width, height] = styles[settings.anchor] || styles['top-left'];
              shade.style.left = left;
              shade.style.top = top;
              shade.style.width = width;
              shade.style.height = height;
          }

          if (!detail) return;

          if (!enabled) {
              detail.textContent =
                  'Content End: Panel is placed after the last UI item in the Content Area.';
              return;
          }

          const descriptions = {
              'top-left': 'Top-Left: Close to the Content Area, fills 60% of the available height.',
              'top-right': 'Top-Right: Close to the right viewport edge, fills 60% of the available height.',
              'middle-left': 'Middle-Left: Close to the Content Area, fills the available height.',
              'middle-right': 'Middle-Right: Close to the right viewport edge, fills the available height.',
              'bottom-left': 'Bottom-Left: Close to the Content Area, fills 60% of the available height upward.',
              'bottom-right': 'Bottom-Right: Close to the right viewport edge, fills 60% of the available height upward.',
              'open-area': 'Open Area: Fills the available space between the Content Area and viewport bounds.'
          };

          detail.textContent = descriptions[settings.anchor] || '';
      }

      function renderDailyHeading(day, totals) {
          const wrap = document.createElement('div');
          wrap.appendChild(textNode(`${day} < `));

          appendStatSpan(wrap, totals.spd, 'SPD', COLORS.str, 8, 2);
          wrap.appendChild(textNode('∥ '));
          appendStatSpan(wrap, totals.pow, 'POW', COLORS.spd, 8, 2);
          wrap.appendChild(textNode('∥ '));
          appendStatSpan(wrap, totals.str, 'STR', COLORS.pow, 8, 2);
          wrap.appendChild(textNode('∥ '));
          appendStatSpan(wrap, totals.tbs, 'TBS', COLORS.tbs, 8, 2);

          wrap.appendChild(textNode(' >'));
          return wrap;
      }

      function appendStatSpan(parent, value, label, color, width, decimals) {
          const span = document.createElement('span');
          span.style.color = color;
          span.textContent = formatLabeledDelta(value, label, width, decimals);
          parent.appendChild(span);
      }

      function formatLabeledDelta(value, label, width, decimals) {
          const text = label === 'Life' ? fmtSignedWhole(value) : fmtSigned(value, decimals);
          return formatLabeledText(text, label, width);
      }

      function formatLabeledText(text, label, width) {
          const extra = Math.max(0, String(label || '').length - 3);
          const adjustedWidth = Math.max(1, Number(width || 1) - extra);
          return `${String(text).padStart(adjustedWidth, ' ')} ${label}`;
      }

      function renderTradeStatus(s) {
          const wrap = document.createElement('div');
          wrap.style.color = COLORS.net;
          wrap.style.display = 'flex';
          wrap.style.justifyContent = 'space-evenly';
          wrap.style.gap = '6px';
          wrap.style.alignItems = 'center';
          wrap.style.width = 'auto';
          wrap.style.lineHeight = '1.5';
          wrap.style.fontSize = '16px';
          wrap.style.border = '2px solid #777777';
          wrap.style.marginBottom = '2px';
          wrap.style.backgroundColor = '#777777';

          const today = document.createElement('div');
          today.style.background = '#e6e6e6';
          today.style.color = '#000000';
          today.style.flex = '1 1 50%';
          today.style.textAlign = 'center';
          today.textContent = `TODAY: ${fmtInt(s.currentDayTrades.length, 3)}`;

          const ledger = document.createElement('div');
          ledger.style.background = '#e6e6e6';
          ledger.style.color = '#000000';
          ledger.style.flex = '1 1 50%';
          ledger.style.textAlign = 'center';
          ledger.textContent = `LEDGER: ${fmtInt(s.tradeLedger.trades.length, 3)}`;

          wrap.append(today, ledger);
          return wrap;
      }

      function renderTradeReconciliation(s) {
          const recon = s && s.tradeRecon;
          const wrap = document.createElement('div');
          if (!recon || !recon.pending) return wrap;

          wrap.style.border = `1px solid ${COLORS.border}`;
          wrap.style.margin = '3px 0';
          wrap.style.padding = '3px';
          wrap.style.background = '#111111';
          wrap.style.whiteSpace = 'normal';

          const missing = Array.isArray(recon.missing) ? recon.missing : [];
          const first = recon.firstMissing;
          const last = missing[missing.length - 1];
          const spanText = missing.length === 1 ? `day trade ${first}` : `day trades ${first}-${last}`;

          const head = document.createElement('div');
          head.style.color = COLORS.title;
          head.style.fontSize = '12px';
          head.textContent = `RECON NEEDED < native ${fmtInt(recon.nativeToday, 2)} | ledger ${fmtInt(recon.ledgerToday, 2)} | gap ${fmtInt(missing.length, 1)} | ${spanText} >`;
          wrap.appendChild(head);

          const hint = document.createElement('div');
          hint.style.color = COLORS.dim;
          hint.style.fontSize = '11px';
          hint.style.margin = '1px 0 3px';
          hint.textContent = `Resolve ${fmtInt(first, 2)}: native count proves the gap; click the missed ore color to commit one row.`;
          wrap.appendChild(hint);

          const btns = document.createElement('div');
          btns.style.display = 'flex';
          btns.style.gap = '3px';
          btns.style.justifyContent = 'center';
          btns.style.flexWrap = 'wrap';

          for (const code of TRADE_ORES) {
              const btn = document.createElement('button');
              btn.textContent = code === recon.suggestedCode ? `${code}*` : code;
              btn.title = code === 'Bl'
                  ? 'Resolve as Black Ore; requires manual Life gain input.'
                  : 'Resolve one missing trade row as this ore.';
              btn.style.color = '#000000';
              btn.style.background = COLORS[code] || '#cccccc';
              btn.style.border = `1px solid ${COLORS[code] || COLORS.text}`;
              btn.style.fontWeight = 'bold';
              btn.style.minWidth = '38px';
              btn.style.cursor = 'pointer';
              btn.addEventListener('click', () => {
                  let life = null;
                  if (code === 'Bl') {
                      const raw = prompt('Black Ore Life gained for the missing trade row?');
                      if (raw === null) return;
                      life = parseMaybeFloat(raw);
                      if (!Number.isFinite(life) || life <= 0) {
                          alert('Black Ore reconciliation requires a positive numeric Life gain.');
                          return;
                      }
                  }

                  const ok = confirm(`Commit missing day trade ${first} as ${code}${code === 'Bl' ? ` with +${life} Life` : ''}?`);
                  if (!ok) return;

                  const result = commitManualTradeReconciliation(code, first, life);
                  if (!result || !result.ok) {
                      alert(result && result.message ? result.message : 'Reconciliation failed.');
                      return;
                  }

                  location.reload();
              });
              btns.appendChild(btn);
          }

          wrap.appendChild(btns);
          return wrap;
      }

      function renderTradeReconAuditFootnotes(s) {
          const recon = s && s.tradeRecon;
          const audits = recon && Array.isArray(recon.audits) ? recon.audits : [];
          const wrap = document.createElement('div');
          if (!audits.length) return wrap;

          wrap.style.margin = '2px 0 3px';
          wrap.style.color = COLORS.dim;
          wrap.style.fontSize = '11px';
          wrap.style.fontStyle = 'italic';

          for (const a of audits.slice(-3)) {
              const lineWrap = document.createElement('div');
              const n = Number.isFinite(Number(a.n)) ? Math.round(Number(a.n)) : '?';
              const source = Number.isFinite(Number(a.sourceN)) ? ` from trade ${Math.round(Number(a.sourceN))}` : ' from run';
              const life = a.code === 'Bl' && Number.isFinite(Number(a.lifeManual)) ? ` | Life +${fmtInt(a.lifeManual, 0)} manual` : '';
              const note = a.code === 'Bl' ? `penalty cloned /3${source}` : `values cloned${source}`;
              lineWrap.textContent = `RECON < ${a.time || '--:--:--'} | day trade ${n} | ${a.code} manually resolved | ${note}${life} >`;
              wrap.appendChild(lineWrap);
          }

          return wrap;
      }

      function renderStock(stock) {
          const wrap = document.createElement('div');
          wrap.appendChild(textNode('('));

          STOCK_ORDER.forEach((code, idx) => {
              const stockPill = document.createElement('span');
              stockPill.style.color = COLORS[code] || COLORS.text;
              stockPill.style.backgroundColor = COLORS[code] || COLORS.text;
              stockPill.style.fontSize = '15px';
              stockPill.style.fontFamily = 'Tahoma, sans-serif';
              stockPill.style.textAlign = 'center';
              stockPill.style.backgroundImage = 'radial-gradient(#000000 35%, #00000066, #00000000)';
              stockPill.style.border = '2px inset #AAAAAA';
              stockPill.style.borderColor = COLORS[code] || COLORS.text;
              stockPill.style.borderRadius = '45%';
              stockPill.style.padding = '3px 0';
              stockPill.style.minWidth = '8%';
              stockPill.style.display = 'inline-block';
              stockPill.style.cursor = 'default';
              stockPill.textContent = fmtStock(stock[code] || 0);
              wrap.appendChild(stockPill);

              if (idx < STOCK_ORDER.length - 1) wrap.appendChild(textNode(' '));
          });

          wrap.appendChild(textNode(')'));
          return wrap;
      }

      function renderCompletedTrade(t) {
          const wrap = document.createElement('div');
          wrap.style.width = '100%';
          wrap.style.boxSizing = 'border-box';
          wrap.style.borderBottom = `1px solid ${COLORS.border}`;
          wrap.style.paddingBottom = '3px';
          wrap.style.marginBottom = '2px';

          const color = COLORS[t.code] || COLORS.text;

          wrap.appendChild(textNode('LAST  < '));

          const code = document.createElement('span');
          code.style.color = color;
          code.textContent = `${t.code}`;
          wrap.appendChild(code);

          wrap.appendChild(textNode(' | '));

          const plus = document.createElement('span');
          plus.style.color = color;
          plus.textContent = `+${fmtNum(t.plus, t.plusStat === 'max life' ? 0 : 3)} ${statLabel(t.plusStat)}`;
          wrap.appendChild(plus);

          wrap.appendChild(textNode(' | '));

          const minus = document.createElement('span');
          minus.style.color = color;
          minus.textContent = `-${fmtNum(t.minus, 5)} ${statLabel(t.minusStat)}`;
          wrap.appendChild(minus);

          wrap.appendChild(textNode(' | '));
          const tbs = document.createElement('span');
          tbs.style.color = COLORS.tbs;
          tbs.textContent = `${fmtSigned(t.tbsNet, 5)} TBS`;
          wrap.appendChild(tbs);

          wrap.appendChild(textNode(' >'));
          return wrap;
      }

      function renderTradeDays(s, rows, state) {
          const wrap = document.createElement('div');
          wrap.className = 'mtt-ledger-scroll-body';
          wrap.appendChild(line('TRADE DAYS', COLORS.title));

          const days = Array.isArray(s.tradeDays) ? s.tradeDays : groupTradeDays(s.tradeLedger && s.tradeLedger.trades);

          if (!days.length) {
              wrap.appendChild(line('No realized trades logged.', COLORS.dim));
              return wrap;
          }

          const collapsedMap = loadCollapsedDays();
          const swimMap = loadSwimDailyMap();

          for (const day of days) {
              const collapsed = isTradeDayCollapsed(day.dayKey, s.dayKey, collapsedMap);
              const swim = getSwimDailyForDay(swimMap, day.dayKey);
              const balance = calcDailyTbsBalance(swim, day.totals);

              wrap.appendChild(renderTradeDayHeader(day, collapsed, s, rows, state, balance));

              if (!collapsed) {
                  wrap.appendChild(renderTradeDaySources(balance));

                  if (day.groups.length) {
                      for (const group of day.groups) {
                          wrap.appendChild(renderTradeGroup(group));
                      }
                  } else {
                      wrap.appendChild(line('  No grouped runs.', COLORS.dim));
                  }
              }
          }

          return wrap;
      }

      function renderTradeDayHeader(day, collapsed, s, rows, state, balance) {
          const dayWrap = document.createElement('div');
          dayWrap.className = 'mtt-trade-day-header';
          dayWrap.style.margin = '2px 0 0';
          dayWrap.style.padding = '0 1px';
          dayWrap.style.lineHeight = '20px';
          dayWrap.style.borderTop = '1px solid rgba(255,255,255,.28)';
          dayWrap.style.borderBottom = '1px solid rgba(255,255,255,.14)';
          dayWrap.style.cursor = 'default';
          dayWrap.style.fontSize = '12px';

          const totals = balance && balance.net ? balance.net : day.totals;
          const sep = text => {
              const span = document.createElement('span');
              span.textContent = text;
              span.style.color = 'rgba(221,221,221,.38)';
              return span;
          };

          dayWrap.appendChild(textNode(`${String(Number.parseInt(day.dayKey, 10)).padStart(2, ' ')}: `));
          appendStatSpan(dayWrap, totals.spd, '', COLORS.spd, 5, 0);
          dayWrap.appendChild(sep('| '));
          appendStatSpan(dayWrap, totals.pow, '', COLORS.pow, 5, 0);
          dayWrap.appendChild(sep('| '));
          appendStatSpan(dayWrap, totals.str, '', COLORS.str, 5, 0);
          dayWrap.appendChild(sep('<'));
          appendStatSpan(dayWrap, totals.tbs, '', COLORS.tbs, 5, 0);
          dayWrap.appendChild(textNode(' TBS'));
          dayWrap.appendChild(sep('>'));
          appendStatSpan(dayWrap, totals.life, '❤️', COLORS.life, 6, 0);
          dayWrap.appendChild(textNode(' '));

          const tradeCount = document.createElement('span');
          tradeCount.style.color = '#b8b8b8';
          tradeCount.style.fontSize = '11px';
          tradeCount.textContent = `Trades ${fmtInt(day.count, 3)}`;
          dayWrap.appendChild(tradeCount);

          const collapseBtn = document.createElement('button');
          collapseBtn.type = 'button';
          collapseBtn.style.cursor = 'pointer';
          collapseBtn.style.borderRadius = '3px';
          collapseBtn.style.fontSize = '8px';
          collapseBtn.style.padding = '1px';
          collapseBtn.style.marginLeft = '10px';
          collapseBtn.style.lineHeight = '9px';
          collapseBtn.style.fontFamily = 'Consolas, monospace';
          collapseBtn.style.backgroundColor = collapsed ? '#dfd' : '#fdd';
          collapseBtn.title = collapsed ? 'Click to expand.' : 'Click to collapse.';
          collapseBtn.textContent = collapsed ? '[+]' : '[-]';
          collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          dayWrap.appendChild(collapseBtn);

          dayWrap.addEventListener('click', event => {
              if (event.target === collapseBtn) return;
              const map = loadCollapsedDays();
              map[day.dayKey] = !collapsed;
              saveCollapsedDays(map);
              render(s, rows, state);
          });
          collapseBtn.addEventListener('click', event => {
              event.preventDefault();
              event.stopPropagation();
              const map = loadCollapsedDays();
              map[day.dayKey] = !collapsed;
              saveCollapsedDays(map);
              render(s, rows, state);
          });

          return dayWrap;
      }

      function renderTradeDaySources(balance) {
          const wrap = document.createElement('div');
          wrap.style.marginLeft = '10px';
          wrap.style.paddingLeft = '6px';
          wrap.style.color = COLORS.dim;

          const swimParts = [
              ['', balance.swim.spd, SOURCE_COLORS.spd, 3],
              ['', balance.swim.pow, SOURCE_COLORS.pow, 3],
              ['', balance.swim.str, SOURCE_COLORS.str, 3],
              ['Life', balance.swim.life, SOURCE_COLORS.life, 0]
          ].filter(([, value]) => (Number(value) || 0) > 0.000001);

          if (swimParts.length > 0) {
              const swimLine = document.createElement('div');
              swimLine.className = 'mtt-trade-source-line';
              swimLine.style.fontSize = '11px';
              //swimLine.style.fontStyle = 'italic';
              swimLine.appendChild(textNode('Jungle Δ '));

              swimParts.forEach(([label, value, color, decimals], index) => {
                  if (index > 0) {
                      swimLine.appendChild(textNode(' '));
                  }

                  appendStatSpan(
                      swimLine,
                      value,
                      label,
                      color,
                     8,
                      decimals
                  );
              });

              wrap.appendChild(swimLine);
          }

          const tradeLine = document.createElement('div');
          tradeLine.className = 'mtt-trade-source-line';
          tradeLine.style.fontSize = '11px';
          //tradeLine.style.fontStyle = 'italic';
          tradeLine.appendChild(textNode('Trades Δ '));
          appendStatSpan(tradeLine, balance.trade.spd, '', SOURCE_COLORS.spd, 8, 2);
          tradeLine.appendChild(textNode(' '));
          appendStatSpan(tradeLine, balance.trade.pow, '', SOURCE_COLORS.pow, 8, 2);
          tradeLine.appendChild(textNode(' '));
          appendStatSpan(tradeLine, balance.trade.str, '', SOURCE_COLORS.str, 8, 2);
          if (Math.abs(Number(balance.trade.life) || 0) > 0.000001) {
              tradeLine.appendChild(textNode(' '));
              appendStatSpan(tradeLine, balance.trade.life, 'Life', SOURCE_COLORS.life, 6, 0);
          }
          tradeLine.appendChild(textNode(' '));
          appendStatSpan(tradeLine, balance.trade.tbs, 'TBS', SOURCE_COLORS.tbs, 6, 2);
          wrap.appendChild(tradeLine);

          return wrap;
      }

      function renderTradeGroup(group) {
          const wrap = document.createElement('div');
          wrap.className = 'mtt-trade-group';
          const color = COLORS[group.code] || COLORS.text;

          wrap.appendChild(textNode(` ${fmtInt(group.from, 3)}↠${fmtInt(group.to, 3)} `));

          const code = document.createElement('span');
          code.style.color = color;
          code.textContent = group.code;
          wrap.appendChild(code);

          //wrap.appendChild(textNode(' <'));

          const parts = statPartsForGroup(group);

                  parts.forEach((part, idx) => {
              //if (idx) wrap.appendChild(textNode(' '));

              const span = document.createElement('span');
              span.style.color = part.color;

              const shown = part.label === 'Life'
                  ? fmtSignedWhole(part.value)
                  : fmtSigned(
                      part.value,
                      part.label === 'TBS' ? 3 : part.decimals
                  );

              const fieldWidth = part.label === 'TBS' ? 8 : 10;

              span.textContent = formatLabeledText(shown, part.label, fieldWidth);
              wrap.appendChild(span);
          });

          //wrap.appendChild(textNode(' >'));
          return wrap;
      }

      function renderStockBlock(stock) {
          const box = document.createElement('div');

          box.style.cssText = [
              'position:sticky',
              'bottom:0',
              'right:0',
              'left:0',
              'box-sizing:border-box',
              'z-index:1',
              'background-color:#333333',
              'border-top:3px solid #111111',
              'padding:4px 0',
              'margin:auto 0 0',
              'min-height:34px',
              'text-align:center',
              'white-space:pre'
          ].join(';');

          box.appendChild(renderStock(stock));
          return box;
      }

      function renderTradePreviewHeading(previewRows) {
          const wrap = document.createElement('div');
          wrap.style.color = COLORS.title;
          wrap.style.textAlign = 'center';
          wrap.style.width = '100%';
          wrap.style.marginTop = '3px';

          wrap.appendChild(textNode('TRADE PREVIEW'));

          const net = getPreviewNet(previewRows);

          if (Number.isFinite(net)) {
              wrap.appendChild(textNode(' (NET '));

              const span = document.createElement('span');
              span.style.color = COLORS.tbs;
              span.textContent = fmtSigned(net, 5);

              wrap.appendChild(span);
              wrap.appendChild(textNode(')'));
          }

          return wrap;
      }

      function renderTradePreview(r) {
          const wrap = document.createElement('div');
          const color = COLORS[r.code] || COLORS.text;

          wrap.appendChild(textNode('    ? < '));

          const code = document.createElement('span');
          code.style.color = color;
          code.textContent = r.code;
          wrap.appendChild(code);

          wrap.appendChild(textNode(' | '));

          const plus = document.createElement('span');
          plus.style.color = color;
          const plusLabel = statLabel(r.plusStat);
          const plusDec = plusLabel === 'Life' ? 0 : 3;
          plus.textContent = formatLabeledText(`+${fmtNum(r.plus, plusDec)}`, plusLabel, 7);
          wrap.appendChild(plus);

          wrap.appendChild(textNode(' | '));

          const minus = document.createElement('span');
          minus.style.color = color;
          const minusLabel = statLabel(r.minusStat);
          minus.textContent = formatLabeledText(`-${fmtNum(r.minus, 5)}`, minusLabel, 9);
          wrap.appendChild(minus);

          if (Number.isFinite(r.remaining)) {
              wrap.appendChild(textNode(` | ×${fmtInt(r.remaining, 2)}`));
          }

          wrap.appendChild(textNode(' >'));
          return wrap;
      }

      function statPartsForGroup(group) {
          const totals = group && group.totals ? group.totals : {};
          const parts = [];
          const used = new Set();

          if (group && group.code === 'Bl') {
              const life = Number(totals.life) || 0;
              const each = Math.abs(Number(group.minus) || 0) * Math.max(1, Number(group.count) || 1);

              if (Math.abs(life) > 0.000001) {
                  parts.push({ label: 'Life', value: life, color: COLORS.text, decimals: 0 });
              }

              if (each > 0.000001) {
                  parts.push({ label: 'each', value: -each, color: COLORS.Bl, decimals: 3 });
              }

              parts.push({ label: 'TBS', value: Number(totals.tbs) || 0, color: COLORS.tbs, decimals: 5 });
              return parts;
          }

          function addStat(stat) {
              const key = normalizeStatName(stat);
              if (!['str', 'spd', 'pow'].includes(key)) return;
              if (used.has(key)) return;

              const value = Number(totals[key]) || 0;
              if (Math.abs(value) <= 0.000001) return;

              used.add(key);
              parts.push({ label: statLabel(key), value, color: statColor(key), decimals: 3 });
          }

          addStat(group && group.plusStat);
          addStat(group && group.minusStat);

          ['str', 'spd', 'pow'].forEach(addStat);

          parts.push({ label: 'TBS', value: Number(totals.tbs) || 0, color: COLORS.tbs, decimals: 5 });

          return parts;
      }

      function statColor(stat) {
          const key = normalizeStatName(stat);
          if (key === 'str') return COLORS.str;
          if (key === 'spd') return COLORS.spd;
          if (key === 'pow') return COLORS.pow;
          return COLORS.text;
      }

      function statPartsForTotals(totals) {
          const parts = [];

          if (Math.abs(totals.str) > 0.000001) {
              parts.push({ label: 'STR', value: totals.str, color: COLORS.str, decimals: 3 });
          }

          if (Math.abs(totals.spd) > 0.000001) {
              parts.push({ label: 'SPD', value: totals.spd, color: COLORS.spd, decimals: 3 });
          }

          if (Math.abs(totals.pow) > 0.000001) {
              parts.push({ label: 'POW', value: totals.pow, color: COLORS.pow, decimals: 3 });
          }

          parts.push({ label: 'TBS', value: totals.tbs, color: COLORS.tbs, decimals: 5 });

          return parts;
      }

      function renderButtons(s, rows) {
          const wrap = document.createElement('div');
          wrap.id = 'mtt-button-panel';
          wrap.style.cssText = [
              'position:sticky',
              'bottom:34px',
              'top:calc(100% - 59px)',
              'box-sizing:border-box',
              'z-index:2',
              'background-color:#111111',
              'border-top:2px solid #111111',
              'display:flex',
              'justify-content:space-between',
              'gap:6px'
              ].join(';');
          wrap.style.whiteSpace = 'normal';

          const days = Array.isArray(s.tradeDays)
              ? s.tradeDays
              : groupTradeDays(s.tradeLedger && s.tradeLedger.trades);

          const collapsedMap = loadCollapsedDays();

          const allCollapsed =
              days.length > 0 &&
              days.every(day =>
                  isTradeDayCollapsed(day.dayKey, s.dayKey, collapsedMap)
              );

          const leftBtns = document.createElement('div');
              leftBtns.style.display = 'flex';
              leftBtns.style.flex = '1 1 auto';

          const exportBtn = document.createElement('button');
          exportBtn.textContent = 'EXPORT';
          exportBtn.style.margin = '3px 2% 0';
          exportBtn.style.padding = '1px 2px';
          exportBtn.addEventListener('click', () => {
              exportMines(s, rows);
          });

          const importBtn = document.createElement('button');
          importBtn.textContent = 'IMPORT';
          importBtn.style.margin = '3px 2% 0 0';
          importBtn.style.padding = '1px 2px';
          importBtn.addEventListener('click', () => {
              openImportBox(s, rows);
          });

          const swimBtn = document.createElement('button');
          swimBtn.textContent = 'SWIM⇢▤';
          swimBtn.title = 'Import a Jungle export for the Trading Post.';
          swimBtn.style.margin = '3px 2% 0 0';
          swimBtn.style.padding = '0 2px';
          swimBtn.addEventListener('click', () => {
              openSwimImportBox(s, rows);
          });

          const clearBtn = document.createElement('button');
          clearBtn.textContent = 'CLEAR';
          clearBtn.style.color = '#e80000';
          clearBtn.style.fontWeight = 'bold';
          clearBtn.style.margin = '3px 2% 0 6%';
          clearBtn.style.padding = '1px 2px';
          clearBtn.style.cursor = 'not-allowed';
          clearBtn.addEventListener('click', () => {
              if (!confirm('Clear the trade ledger?')) return;

              rows.length = 0;
              saveRows(rows);

              GM_setValue(K_LAST_FP, '');
              GM_setValue(K_TRADE_TABLE, '{}');
              GM_setValue(
                  K_TRADE_LEDGER,
                  JSON.stringify({ dayKey, trades: [] })
              );
              GM_setValue(K_TRADE_RECON, '[]');
              GM_setValue(K_COLLAPSED_DAYS, '{}');

              const emptyTotals = calcTradeTotals([]);
              const emptyBalance =
                  calcDailyTbsBalance(s.swimDaily, emptyTotals);

              const clearedSnapshot = {
                  ...s,
                  tradeLedger: { dayKey, trades: [] },
                  currentDayTrades: [],
                  tradeGroups: [],
                  tradeDays: [],
                  dailyTotals: emptyTotals,
                  dailyBalance: emptyBalance
              };

              renderTradingPostBalance(clearedSnapshot);
              render(clearedSnapshot, rows, state);
          });

          const collapseAllBtn = document.createElement('button');
          collapseAllBtn.type = 'button';
          collapseAllBtn.textContent = allCollapsed ? '[+] ALL' : '[-] ALL';
          collapseAllBtn.title = allCollapsed
              ? 'Expand all trade days.'
              : 'Collapse all trade days.';
          collapseAllBtn.style.margin = '3px 2% 0 auto';
          collapseAllBtn.style.padding = '1px';
          collapseAllBtn.style.fontSize = '9px';
          collapseAllBtn.style.lineHeight = '15px';
          collapseAllBtn.style.fontFamily = 'Consolas, monospace';
          collapseAllBtn.style.borderRadius = '3px';
          collapseAllBtn.style.cursor =
              days.length ? 'pointer' : 'not-allowed';
          collapseAllBtn.style.backgroundColor =
              allCollapsed ? '#dfd' : '#fdd';
          collapseAllBtn.disabled = !days.length;

          collapseAllBtn.addEventListener('click', () => {
              const map = loadCollapsedDays();
              const collapseEverything = !allCollapsed;

              for (const day of days) {
                  map[day.dayKey] = collapseEverything;
              }

              saveCollapsedDays(map);
              render(s, rows, state);
          });

          leftBtns.appendChild(exportBtn);
          leftBtns.appendChild(importBtn);
          leftBtns.appendChild(swimBtn);
          leftBtns.appendChild(clearBtn);

          wrap.appendChild(leftBtns);
          wrap.appendChild(collapseAllBtn);

          return wrap;
      }

      function openSwimImportBox(s, rows) {
          const input = document.createElement('input');

          input.type = 'file';
          input.accept = '.txt,text/plain';
          input.style.display = 'none';

          input.addEventListener('change', () => {
              const file = input.files && input.files[0];

              input.remove();

              if (!file) return;

              const reader = new FileReader();

              reader.onload = () => {
                  const parsed = importSwimExportText(String(reader.result || ''));
                  const importedDays = Object.keys(parsed);

                  if (!importedDays.length) {
                      alert('No Jungle swim SPD rows found in that export.');
                      return;
                  }

                  const refreshedSwim = updateAndLoadSwimDaily();
                  const refreshedBalance = calcDailyTbsBalance(refreshedSwim, s.dailyTotals);
                  const refreshedSnapshot = {
                      ...s,
                      swimDaily: refreshedSwim,
                      dailyBalance: refreshedBalance,
                      mineDayLog: loadMineDayLog()
                  };

                  renderTradingPostBalance(refreshedSnapshot);
                  render(refreshedSnapshot, rows, state);

                  alert(`Imported swim data for ${importedDays.length} day(s) from ${file.name}. Current day SPD: ${fmtSigned(refreshedSwim.spd, 2)} | Life: ${fmtSignedWhole(refreshedSwim.life)}.`);
              };

              reader.onerror = () => {
                  alert(`Could not read ${file.name}.`);
              };

              reader.readAsText(file);
          });

          document.body.appendChild(input);
          input.click();

          setTimeout(() => {
              if (input.parentNode && (!input.files || !input.files.length)) {
                  input.remove();
              }
          }, 30000);
      }

      function openImportBox(s, rows) {
          const input = document.createElement('input');

          input.type = 'file';
          input.accept = '.txt,text/plain';
          input.style.display = 'none';

          input.addEventListener('change', () => {
              const file = input.files && input.files[0];

              input.remove();

              if (!file) return;

              const reader = new FileReader();

              reader.onload = () => {
                  const result = importMinesExport(String(reader.result || ''));

                  if (!result.ok) {
                      alert(result.message || 'Import failed.');
                      return;
                  }

                  rows.length = 0;
                  rows.push(...result.rows);
                  saveRows(rows);

                  if (result.summary) savePersistedSummary(result.summary);
                  if (result.stock) savePersistedStock(result.stock);
                  if (result.ledger) savePersistedTradeLedger(result.ledger);
                  if (result.mineDayLog) {
                      saveMineDayLog({
                          ...loadMineDayLog(),
                          ...result.mineDayLog
                      });
                  }

                  GM_setValue(K_LAST_FP, '');

                  const refreshedSummary = mergeWithPersistedSummary(parseMineSummary(text));
                  const refreshedLedger = result.ledger || loadPersistedTradeLedger();
                  const refreshedCurrentDayTrades = getCurrentDayTrades(refreshedLedger.trades);
                  const refreshedTotals = calcTradeTotals(refreshedCurrentDayTrades);
                  const refreshedGroups = groupTradeRuns(refreshedCurrentDayTrades);
                  const refreshedTradeDays = groupTradeDays(refreshedLedger.trades);
                  const refreshedSwim = updateAndLoadSwimDaily();
                  const refreshedBalance = calcDailyTbsBalance(refreshedSwim, refreshedTotals);

                  const refreshedSnapshot = {
                      ...s,
                      mining: refreshedSummary.mining,
                      found: refreshedSummary.found,
                      foundShards: refreshedSummary.foundShards,
                      traded: refreshedSummary.traded,
                      tradedShards: refreshedSummary.tradedShards,
                      tUsed: refreshedSummary.tUsed,
                      actualOreT: calcOreT(refreshedSummary.found, refreshedSummary.tUsed),
                      impliedOreT: calcOreT(
                          Number.isFinite(refreshedSummary.found) && Number.isFinite(refreshedSummary.foundShards)
                          ? refreshedSummary.found + refreshedSummary.foundShards * 2
                          : null,
                          refreshedSummary.tUsed
                      ),
                      stock: result.stock || s.stock,
                      tradeLedger: refreshedLedger,
                      currentDayTrades: refreshedCurrentDayTrades,
                      dailyTotals: refreshedTotals,
                      tradeGroups: refreshedGroups,
                      tradeDays: refreshedTradeDays,
                      swimDaily: refreshedSwim,
                      dailyBalance: refreshedBalance,
                      mineDayLog: loadMineDayLog()
                  };

                  renderTradingPostBalance(refreshedSnapshot);
                  render(refreshedSnapshot, rows, state);
                  alert(`Imported ${rows.length} snapshot row(s) and ${refreshedLedger.trades.length} trade row(s) from ${file.name}.`);
              };

              reader.onerror = () => {
                  alert(`Could not read ${file.name}.`);
              };

              reader.readAsText(file);
          });

          document.body.appendChild(input);
          input.click();

          setTimeout(() => {
              if (input.parentNode && (!input.files || !input.files.length)) {
                  input.remove();
              }
          }, 30000);
      }

      function importMinesExport(raw) {
          const src = String(raw || '').trim();

          if (!src) {
              return { ok: false, message: 'No import text provided.' };
          }

          if (!/^Mines Telemetry Export v/i.test(src)) {
              return { ok: false, message: 'This is not a Mines export.' };
          }

          const lines = src.split(/\r?\n/);
          const importedRows = [];
          let importedSummary = null;
          let importedStock = null;
          let importedLedger = { dayKey, trades: [] };
          let importedMineDayLog = {};

          for (const line of lines) {
              const trimmed = line.trim();

              const dayM = trimmed.match(/^([0-9]{2}\s+[A-Z]{3})\s*<Mine Stat\s+([-\d.]+)/i);
              if (dayM) {
                  importedSummary = importedSummary || {};
                  importedSummary.dayKey = dayM[1];
                  importedSummary.mining = parseMaybeFloat(dayM[2]);
                  importedLedger.dayKey = dayM[1];
                  continue;
              }

              const summaryM = trimmed.match(
                  /^SUMMARY\s*<\s*T\s*([-\d]+)\s*\|\s*Found\s*([-\d]+)\s*\[\s*([-\d]+)\s*\]\s*\|\s*Traded\s*([-\d]+)\s*\[\s*([-\d]+)\s*\]\s*\|\s*Ore\/T\s*([-\d.]+)\s*\|\s*Imp\s*([-\d.]+)\s*>/i
              );

              if (summaryM) {
                  importedSummary = importedSummary || {};
                  importedSummary.tUsed = parseMaybeInt(summaryM[1]);
                  importedSummary.found = parseMaybeInt(summaryM[2]);
                  importedSummary.foundShards = parseMaybeInt(summaryM[3]);
                  importedSummary.traded = parseMaybeInt(summaryM[4]);
                  importedSummary.tradedShards = parseMaybeInt(summaryM[5]);
                  continue;
              }

              const mineDayM = trimmed.match(
                  /^([0-9]{2}\s+[A-Z]{3})\s*<\s*T\s*([-\d]+)\s*\|\s*Ore\s+Found\s*([-\d]+)\s*\[\s*([-\d]+)\s*\]\s*\|\s*TRADES\s*([-\d]+)\s*>/i
              );

              if (mineDayM) {
                  const k = mineDayM[1].toUpperCase();

                  importedMineDayLog[k] = {
                      dayKey: k,
                      tUsed: parseMaybeInt(mineDayM[2]),
                      oreFound: parseMaybeInt(mineDayM[3]),
                      shardsFound: parseMaybeInt(mineDayM[4]),
                      trades: parseMaybeInt(mineDayM[5]),
                      time: ''
                  };

                  continue;
              }

              const stockM = trimmed.match(/^STOCK\s*<\s*([^>]+)\s*>/i);
              if (stockM) {
                  importedStock = parseStockExportLine(stockM[1]);
                  continue;
              }

              const tradeM = parseTradedLogLine(trimmed, importedLedger.dayKey || dayKey);
              if (tradeM) {
                  importedLedger.trades.push(tradeM);
                  continue;
              }

              const snapM = trimmed.match(
                  /^(.+?)\s*<\s*Mine Stat\s+([-\d.]+)\s*\|\s*T\s*([-\d]+)\s*\|\s*O\s*([-\d]+)\s*\[\s*([-\d]+)\s*\]\s*\|\s*A\s*([-\d.]+)\s*\|\s*I\s*([-\d.]+)/
              );

              if (snapM) {
                  importedRows.push({
                      ts: snapM[1].trim(),
                      level: 0,
                      mining: parseMaybeFloat(snapM[2]),
                      tUsed: parseMaybeInt(snapM[3]),
                      found: parseMaybeInt(snapM[4]),
                      foundShards: parseMaybeInt(snapM[5]),
                      traded: null,
                      tradedShards: null,
                      actualOreT: parseMaybeFloat(snapM[6]),
                      impliedOreT: parseMaybeFloat(snapM[7]),
                      stock: importedStock || makeEmptyStock(),
                      tradesToday: null,
                      tradeCount: null,
                      dailyTotals: null,
                      completedTrade: parseSnapshotLastTrade(trimmed)
                  });
              }
          }

          importedLedger.trades = importedLedger.trades
              .map(normalizeLedgerTrade)
              .filter(Boolean)
              .sort((a, b) => Number(a.n) - Number(b.n));

          if (
              !importedRows.length &&
              !importedSummary &&
              !importedStock &&
              !importedLedger.trades.length &&
              !Object.keys(importedMineDayLog).length
          ) {
              return { ok: false, message: 'No recognizable Mines telemetry data found.' };
          }

          return {
              ok: true,
              rows: importedRows.slice(0, MAX_ROWS),
              summary: importedSummary,
              stock: importedStock,
              ledger: importedLedger.trades.length ? importedLedger : null,
              mineDayLog: Object.keys(importedMineDayLog).length ? importedMineDayLog : null
          };
      }

      function parseTradedLogLine(line, fallbackDayKey) {
          fallbackDayKey = fallbackDayKey || dayKey;

          const m = String(line || '').match(
              /^(?:(\d{2}\s+[A-Z]{3})\s+)?(\d{1,3})\s*<\s*(Gr|Wh|Ye|Or|Re|Pu|Bl)\s*\|\s*\+([-\d.]+)\s+([^|]+?)\s*\|\s*-([-\d.]+)\s+([^|]+?)\s*\|\s*([+-]?[-\d.]+)\s+TBS(?:\s*\|\s*\+([-\d.]+)\s+Mine)?(?:\s*\|\s*(\d+)\s+remaining)?\s*>/i
          );

          if (!m) return null;

          return normalizeLedgerTrade({
              dayKey: m[1] || fallbackDayKey,
              n: parseInt(m[2], 10),
              code: m[3],
              plus: parseMaybeFloat(m[4]),
              plusStat: normalizeStatName(m[5]),
              minus: parseMaybeFloat(m[6]),
              minusStat: normalizeStatName(m[7]),
              tbsNet: parseMaybeFloat(m[8]),
              miningGain: parseMaybeFloat(m[9]),
              remaining: parseMaybeInt(m[10]),
              time: ''
          });
      }

      function parseStockExportLine(s) {
          const stock = makeEmptyStock();

          String(s || '').split(/\s+/).forEach(part => {
              const m = part.match(/^([A-Za-z]{2})(-?\d+)$/);
              if (!m) return;

              const code = m[1];
              const n = parseInt(m[2], 10);

              if (Object.prototype.hasOwnProperty.call(stock, code) && Number.isFinite(n)) {
                  stock[code] = n;
              }
          });

          return stock;
      }

      function parseSnapshotLastTrade(line) {
          const m = String(line || '').match(/\|\s*L(Gr|Wh|Ye|Or|Re|Pu|Bl)\+([-\d.]+)-([-\d.]+)/);

          if (!m) return null;

          return normalizeCompletedTrade({
              code: m[1],
              plus: parseMaybeFloat(m[2]),
              plusStat: '',
              minus: parseMaybeFloat(m[3]),
              minusStat: '',
              miningGain: null,
              remaining: null
          });
      }

      function publishTopbarLastTrade(completedTrade, summary) {
          if (!completedTrade) return;

          const mining = toFiniteOrNull(summary && summary.mining);
          if (!Number.isFinite(mining)) return;

          const payload = {
              schema: 1,
              dayKey,
              mining,
              code: String(completedTrade.code || ''),
              spd: toFiniteOrNull(completedTrade.spdDelta) || 0,
              pow: toFiniteOrNull(completedTrade.powDelta) || 0,
              str: toFiniteOrNull(completedTrade.strDelta) || 0,
              life: toFiniteOrNull(completedTrade.lifeDelta) || 0,
              tbs: toFiniteOrNull(completedTrade.tbsNet) || 0,
              plus: toFiniteOrNull(completedTrade.plus),
              plusStat: String(completedTrade.plusStat || ''),
              minus: toFiniteOrNull(completedTrade.minus),
              minusStat: String(completedTrade.minusStat || ''),
              miningGain: toFiniteOrNull(completedTrade.miningGain),
              remaining: toFiniteOrNull(completedTrade.remaining),
              parsedAt: Date.now()
          };

          localStorage.setItem(K_TOPBAR_LAST_TRADE, JSON.stringify(payload));

          const crr = getCrr();
          if (crr && typeof crr.publishMineTrade === 'function') {
              crr.publishMineTrade(payload, { source: 'MTT' });
          }
      }

      function buildExport(s, rows) {
          const lines = [];

          lines.push(`Mines Telemetry Export v${SCRIPT_VERSION}`);
          lines.push(`${s.dayKey} <Mine Stat ${fmtNum(s.mining, 2)} | ${fmtInt(s.tradePost.tradesToday, 3)} trades | Ledger ${fmtInt(s.tradeLedger.trades.length, 3)} >`);
          lines.push(`DAILY TRADE < ${fmtSigned(s.dailyTotals.str, 2)} STR | ${fmtSigned(s.dailyTotals.spd, 2)} SPD | ${fmtSigned(s.dailyTotals.pow, 2)} POW | ${fmtSigned(s.dailyTotals.tbs, 2)} TBS >`);
          lines.push('DAILY TBS BALANCE');
          lines.push(`TBS Δ < STR ${fmtSigned(s.dailyBalance.net.str, 2)} | POW ${fmtSigned(s.dailyBalance.net.pow, 2)} | SPD ${fmtSigned(s.dailyBalance.net.spd, 2)} | NET ${fmtSigned(s.dailyBalance.net.tbs, 2)} > Life Δ <${fmtSignedWhole(s.dailyBalance.net.life)}>`);
          const swimExportParts = [
              ['SPD', s.dailyBalance.swim.spd, 2],
              ['POW', s.dailyBalance.swim.pow, 2],
              ['STR', s.dailyBalance.swim.str, 2],
              ['Life', s.dailyBalance.swim.life, 0]
          ]
              .filter(([, value]) => (Number(value) || 0) > 0.000001)
              .map(([label, value, decimals]) =>
                  label === 'Life'
                      ? `${label} ${fmtSignedWhole(value)}`
                      : `${label} ${fmtSigned(value, decimals)}`
              );

          const exportParts = [];

          if (swimExportParts.length > 0) {
              exportParts.push(`Swim Δ < ${swimExportParts.join(' | ')} >`);
          }

          exportParts.push(
              `Trade Δ < ` +
              `SPD ${fmtSigned(s.dailyBalance.trade.spd, 2)} | ` +
              `POW ${fmtSigned(s.dailyBalance.trade.pow, 2)} | ` +
              `STR ${fmtSigned(s.dailyBalance.trade.str, 2)}` +
              `${Math.abs(Number(s.dailyBalance.trade.life) || 0) > 0.000001
                  ? ` | Life ${fmtSignedWhole(s.dailyBalance.trade.life)}`
                  : ''}` +
              ` | NET ${fmtSigned(s.dailyBalance.trade.tbs, 2)} >`
          );

          lines.push(exportParts.join(' | '));
          lines.push(`SUMMARY < T ${fmtInt(s.tUsed, 0)} | Found ${fmtInt(s.found, 0)} [${fmtInt(s.foundShards, 0)}] | Traded ${fmtInt(s.traded, 0)} [${fmtInt(s.tradedShards, 0)}] | Ore/T ${fmtNum(s.actualOreT, 3)} | Imp ${fmtNum(s.impliedOreT, 3)} >`);
          lines.push(`STOCK < ${stockExport(s.stock)} >`);

          if (s.completedTrade) {
              lines.push(`LAST TRADE < ${s.completedTrade.code} | +${fmtNum(s.completedTrade.plus, s.completedTrade.plusStat === 'max life' ? 0 : 3)} ${statLabel(s.completedTrade.plusStat)} | -${fmtNum(s.completedTrade.minus, 5)} ${statLabel(s.completedTrade.minusStat)} | ${fmtSigned(s.completedTrade.tbsNet, 5)} TBS | +${fmtNum(s.completedTrade.miningGain, 2)} Mine${Number.isFinite(s.completedTrade.remaining) ? ` | ${s.completedTrade.remaining} remaining` : ''} >`);
          }

          lines.push('');
          lines.push('TRADE GROUPS');
          for (const group of s.tradeGroups) {
              lines.push(`${fmtInt(group.from, 3)}-${fmtInt(group.to, 3)} < ${group.code} | ${formatGroupExport(group)} >`);
          }

          lines.push('');
          lines.push('TRADE LOG');

          const tradeDaysForExport = groupTradeDays(s.tradeLedger.trades);
          const mineDayLog = s.mineDayLog && typeof s.mineDayLog === 'object'
          ? s.mineDayLog
          : loadMineDayLog();

          const exportedMineDays = new Set();

          for (const day of tradeDaysForExport) {
              for (const t of day.trades) {
                  lines.push(`${t.dayKey || s.dayKey} ${fmtInt(t.n, 3)} < ${t.code} | +${fmtNum(t.plus, t.plusStat === 'max life' ? 0 : 3)} ${statLabel(t.plusStat)} | -${fmtNum(t.minus, 5)} ${statLabel(t.minusStat)} | ${fmtSigned(t.tbsNet, 5)} TBS${Number.isFinite(t.miningGain) ? ` | +${fmtNum(t.miningGain, 2)} Mine` : ''}${Number.isFinite(t.remaining) ? ` | ${t.remaining} remaining` : ''} >`);
              }

              const mineRow = mineDayLog[day.dayKey];
              if (mineRow) {
                  lines.push(formatMineDayYieldRow(day.dayKey, mineRow, day.count));
                  exportedMineDays.add(day.dayKey);
              }

              lines.push('');
          }

          const mineOnlyDays = Object.keys(mineDayLog)
          .filter(k => !exportedMineDays.has(k))
          .sort((a, b) => dayKeySortValue(b) - dayKeySortValue(a));

          for (const k of mineOnlyDays) {
              lines.push(formatMineDayYieldRow(k, mineDayLog[k], 0));
              lines.push('');
          }

          const previewNet = getPreviewNet(s.tradePost.rows);

          lines.push('');
          lines.push(`TRADE PREVIEW${Number.isFinite(previewNet) ? ` (NET ${fmtSigned(previewNet, 5)})` : ''}`);
          for (const r of s.tradePost.rows.filter(r => TRADE_ORES.includes(r.code))) {
              lines.push(`???-??? < ${r.code} | +${fmtNum(r.plus, r.plusStat === 'max life' ? 0 : 3)} ${statLabel(r.plusStat)} | -${fmtNum(r.minus, 5)} ${statLabel(r.minusStat)}${Number.isFinite(r.remaining) ? ` | ${r.remaining} rem` : ''} >`);
          }

          lines.push('');
          lines.push('SNAPSHOTS');
          for (const r of rows.slice(0, 40)) {
              const totals = r.dailyTotals
              ? ` | D${fmtSigned(r.dailyTotals.tbs, 2)}`
          : '';

              const last = r.completedTrade
              ? ` | L${r.completedTrade.code}+${fmtNum(r.completedTrade.plus, r.completedTrade.plusStat === 'max life' ? 0 : 3)}-${fmtNum(r.completedTrade.minus, 5)}`
          : '';

              lines.push(`${r.ts} < Mine Stat ${fmtNum(r.mining, 2)} | T${fmtInt(r.tUsed, 0)} | O${fmtInt(r.found, 0)}[${fmtInt(r.foundShards, 0)}] | A${fmtNum(r.actualOreT, 3)} | I${fmtNum(r.impliedOreT, 3)}${totals}${last} >`);
          }

          return lines.join('\n');
      }

      function formatGroupExport(group) {
          return statPartsForGroup(group)
              .map(part => `${part.label === 'Life' ? fmtSignedWhole(part.value) : fmtSigned(part.value, part.decimals)} ${part.label}`)
              .join(' | ');
      }

      function formatTotalsExport(totals) {
          return [
              `${fmtSigned(totals.str, 3)} STR`,
              `${fmtSigned(totals.spd, 3)} SPD`,
              `${fmtSigned(totals.pow, 3)} POW`,
              `${fmtSigned(totals.tbs, 5)} TBS`
      ].join(' | ');
      }

      function exportMines(s, rows) {
          const txt = buildExport(s, rows);
          const filename = makeExportFilename('Mines');

          const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.href = url;
          link.download = filename;

          document.body.appendChild(link);
          link.click();
          link.remove();

          URL.revokeObjectURL(url);
      }

      function makeExportFilename(prefix) {
          const clockEl = document.querySelector('#clock');

          let hour = '00';
          let minute = '00';

          if (clockEl) {
              const clockText = clockEl.innerText.replace(/\s+/g, ' ').trim();
              const clockMatch = clockText.match(/(\d{1,2}):(\d{2}):\d{2}\s*([ap]m)/i);

              if (clockMatch) {
                  let h = parseInt(clockMatch[1], 10);
                  minute = String(clockMatch[2]).padStart(2, '0');
                  const ap = clockMatch[3].toLowerCase();

                  if (ap === 'am') {
                      if (h === 12) h = 0;
                  } else if (h !== 12) {
                      h += 12;
                  }

                  hour = String(h).padStart(2, '0');
              }
          }

          const pageText = document.body ? document.body.innerText.replace(/\s+/g, ' ') : '';
          const monthMatch = pageText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
          const dayMatch = pageText.match(/\b([1-9]|[12]\d|3[01])(st|nd|rd|th)\b/i);

          const monthMap = {
              jan: '01',
              feb: '02',
              mar: '03',
              apr: '04',
              may: '05',
              jun: '06',
              jul: '07',
              aug: '08',
              sep: '09',
              oct: '10',
              nov: '11',
              dec: '12'
          };

          const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : '00';
          const day = dayMatch ? String(dayMatch[1]).padStart(2, '0') : '00';

          return `${prefix} - ${month}-${day} ${hour}:${minute}.txt`;
      }

      function stockExport(stock) {
          return STOCK_ORDER
              .map(code => `${code}${stock[code] || 0}`)
              .join(' | ');
      }

      function getPreviewNet(previewRows) {
          const firstRow = Array.isArray(previewRows)
          ? previewRows.find(r => Number.isFinite(Number(r.tbsNet)))
          : null;

          return firstRow ? Number(firstRow.tbsNet) : null;
      }

      function line(s, color) {
          const div = document.createElement('div');
          div.style.color = color || COLORS.text;
          div.textContent = s;
          return div;
      }

      function textNode(s) {
          return document.createTextNode(s);
      }

      function loadRows() {
          try {
              const v = JSON.parse(GM_getValue(K_ROWS, '[]'));
              return Array.isArray(v) ? v : [];
          } catch {
              return [];
          }
      }

      function saveRows(v) {
          GM_setValue(K_ROWS, JSON.stringify(v));
      }

      function loadState() {
          try {
              const v = JSON.parse(GM_getValue(K_STATE, '{}'));
              return v && typeof v === 'object' ? v : {};
          } catch {
              return {};
          }
      }

      function parseClock(s) {
          const m = String(s).trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)$/i);
          if (!m) return null;

          let h = parseInt(m[1], 10);
          const min = parseInt(m[2], 10);
          const sec = parseInt(m[3], 10);
          const ap = m[4].toLowerCase();

          if (ap === 'am') {
              if (h === 12) h = 0;
          } else if (h !== 12) {
              h += 12;
          }

          return { h, m: min, s: sec };
      }

      function getDayKey(rawText) {
          const m = String(rawText).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([1-9]|[12]\d|3[01])(st|nd|rd|th)?\b/i);
          if (!m) return 'UNK';

          return `${String(parseInt(m[2], 10)).padStart(2, '0')} ${m[1].toUpperCase()}`;
      }

      function parseLevel() {
          const el = document.querySelector('#statValueLvl');
          const n = el ? parseInt(String(el.textContent || '').replace(/[^\d]/g, ''), 10) : NaN;
          return Number.isFinite(n) ? n : 0;
      }

      function matchFloat(s, re) {
          const m = String(s || '').match(re);
          if (!m) return null;

          const n = parseFloat(String(m[1]).replace(/,/g, ''));
          return Number.isFinite(n) ? n : null;
      }

      function matchInt(s, re) {
          const m = String(s || '').match(re);
          if (!m) return null;

          const n = parseInt(String(m[1]).replace(/,/g, ''), 10);
          return Number.isFinite(n) ? n : null;
      }

      function calcOreT(n, t) {
          if (!Number.isFinite(n) || !Number.isFinite(t) || t <= 0) return null;
          return n / t;
      }

      function fmtNum(v, decimals) {
          if (!Number.isFinite(v)) return '-'.repeat(decimals > 3 ? 7 : 4);
          return Number(v).toFixed(decimals);
      }

      function fmtSigned(v, decimals) {
          if (!Number.isFinite(v)) return '-'.repeat(decimals > 3 ? 7 : 4);
          const n = Number(v);
          return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}`;
      }

      function fmtSignedWhole(v) {
          if (!Number.isFinite(v)) return '----';
          const n = Math.round(Number(v));
          return `${n >= 0 ? '+' : '-'}${Math.abs(n).toLocaleString()}`;
      }

      function fmtInt(v, width) {
          if (!Number.isFinite(v)) return '-'.repeat(width || 1);
          return String(Math.round(v)).padStart(width || 1, ' ');
      }

      function pad2(v) {
          if (!Number.isFinite(v)) return '--';
          return String(Math.round(v)).padStart(2, '0');
      }

      function fmtStock(v) {
          if (!Number.isFinite(v)) return '---';
          return String(Math.round(v)).padStart(3, ' ');
      }

      function statLabel(s) {
          const v = String(s || '').toLowerCase();

          if (v === 'str') return 'STR';
          if (v === 'spd') return 'SPD';
          if (v === 'pow') return 'POW';
          if (v === 'max life') return 'Life';
          if (v === 'life') return 'Life';
          if (v === 'each') return 'each';
          if (v === 'spd, pow, str') return 'each';
          if (v === 'pow, str') return 'POW, STR';

          return v;
      }

      function normalizeStatName(s) {
          const v = String(s || '').toLowerCase().trim();

          if (v === 'strength') return 'str';
          if (v === 'speed') return 'spd';
          if (v === 'power') return 'pow';
          if (v === 'life') return 'max life';
          if (v === 'max life') return 'max life';
          if (v === 'each') return 'spd, pow, str';
          if (v === 'all') return 'spd, pow, str';
          if (v === 'speed, power, strength') return 'spd, pow, str';
          if (v === 'power, strength') return 'pow, str';
          if (v === 'spd, pow, str') return 'spd, pow, str';

          return v;
      }

      function parseMaybeInt(s) {
          if (s == null || String(s).trim() === '') return null;
          if (String(s).includes('-')) return null;
          const n = parseInt(String(s).replace(/,/g, ''), 10);
          return Number.isFinite(n) ? n : null;
      }

      function parseMaybeFloat(s) {
          if (s == null || String(s).trim() === '') return null;
          if (String(s).includes('-') && !/^-?\d/.test(String(s))) return null;
          const n = parseFloat(String(s).replace(/,/g, ''));
          return Number.isFinite(n) ? n : null;
      }

      function toFiniteOrNull(v) {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
      }

      function sameNumber(a, b) {
          const x = Number(a);
          const y = Number(b);
          return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.0000001;
      }

      function pad(n) {
          return String(n).padStart(2, '0');
      }

      function normalizeSpace(s) {
          return String(s || '').replace(/\s+/g, ' ').trim();
      }

      function findHelperTradeCardsContainer(content) {
          if (!content) return null;

          const requiredOres = new Set([
              'Green Ore',
              'White Ore',
              'Yellow Ore',
              'Orange Ore',
              'Red Ore',
              'Purple Ore',
              'Black Ore'
          ]);

          for (const child of Array.from(content.children)) {
              if (!(child instanceof HTMLElement)) continue;
              if (child.id === 'mtt-depot-trade') continue;

              const cards = Array.from(
                  child.querySelectorAll('[data-ore-name]')
              );

              if (!cards.length) continue;

              const foundOres = new Set(
                  cards
                      .map(card => String(card.dataset.oreName || '').trim())
                      .filter(Boolean)
              );

              const hasAllTradeOres = Array.from(requiredOres)
                  .every(name => foundOres.has(name));

              if (hasAllTradeOres) return child;
          }

          return null;
      }

      function decorateHelperTradeCards(rows) {
          const rowMap = new Map(
              (Array.isArray(rows) ? rows : [])
                  .filter(row => row && row.code)
                  .map(row => [String(row.code), row])
          );

          const nameToCode = {
              'Green Ore': 'Gr',
              'White Ore': 'Wh',
              'Yellow Ore': 'Ye',
              'Orange Ore': 'Or',
              'Red Ore': 'Re',
              'Purple Ore': 'Pu',
              'Black Ore': 'Bl'
          };

          const cards = document.querySelectorAll(
              '.content-area [data-ore-name]'
          );

          for (const card of cards) {
              const oreName = String(card.dataset.oreName || '').trim();
              const code = nameToCode[oreName];

              if (!code) continue;

              const row = rowMap.get(code);
              if (!row) continue;

              const active = card.matches(
                  'a[href*="cmd=mines"][href*="do=trade"][href*="trade="]'
              );

              card.dataset.ore = code;
              card.dataset.kind = code === 'Bl' ? 'black' : 'core';
              card.dataset.mttTip = buildMttTradeCardTip(row, active);
              card.removeAttribute('title');
          }
      }

      function installMttTradeTooltip() {
          const disclosure = getMttTradeDisclosure();
          const panel = getMttTradeInfoPanel();
          const close = panel.querySelector('#mtt-trade-info-close');

          if (document.body.dataset.mttTradeTooltipBound === '1') return;
          document.body.dataset.mttTradeTooltipBound = '1';

          let fadeTimer = null;
          let removeTimer = null;
          let activeCard = null;

          document.addEventListener('mouseover', function (e) {
              const target = e.target && e.target.closest
                  ? e.target.closest('[data-mtt-tip]')
                  : null;

              if (!target) return;

              const cameFromInside =
                  e.relatedTarget &&
                  target.contains(e.relatedTarget);

              if (cameFromInside) return;

              const disclosureAlreadyVisible =
                  disclosure.style.display !== 'none' &&
                  activeCard === target;

              if (disclosureAlreadyVisible) return;

              activeCard = target;
              showMttTradeDisclosure(target, e);
          }, true);

          document.addEventListener('mouseout', function (e) {
              const target = e.target && e.target.closest ? e.target.closest('[data-mtt-tip]') : null;
              if (!target) return;

              const next = e.relatedTarget;
              if (next && target.contains(next)) return;
              if (next && disclosure.contains(next)) return;

              scheduleMttTradeDisclosureFade();
          }, true);

          disclosure.addEventListener('mouseover', function () {
              cancelMttTradeDisclosureFade();
          });

          disclosure.addEventListener('mouseout', function (e) {
              const next = e.relatedTarget;
              if (next && disclosure.contains(next)) return;
              if (activeCard && next && activeCard.contains(next)) return;

              scheduleMttTradeDisclosureFade();
          });

          disclosure.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();

              if (!activeCard) return;
              openMttTradeInfoPanel(activeCard);
          });

          if (close) {
              close.addEventListener('click', function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeMttTradeInfoPanel();
              });
          }

          function showMttTradeDisclosure(card, pointerEvent) {
              cancelMttTradeDisclosureFade();

              disclosure.textContent = '?';
              disclosure.style.cursor = 'help';
              disclosure.style.display = 'block';
              disclosure.style.opacity = '1';
              disclosure.dataset.activeOre = card.dataset.ore || '';

              positionMttTradeDisclosure(card, disclosure, pointerEvent);
          }

          function scheduleMttTradeDisclosureFade() {
              cancelMttTradeDisclosureFade();

              fadeTimer = setTimeout(function () {
                  disclosure.style.opacity = '0';
              }, 400);

              removeTimer = setTimeout(function () {
                  if (disclosure.matches(':hover')) return;
                  if (activeCard && activeCard.matches(':hover')) return;

                  disclosure.style.display = 'none';
                  activeCard = null;
              }, 600);
          }

          function cancelMttTradeDisclosureFade() {
              if (fadeTimer) {
                  clearTimeout(fadeTimer);
                  fadeTimer = null;
              }

              if (removeTimer) {
                  clearTimeout(removeTimer);
                  removeTimer = null;
              }

              disclosure.style.opacity = '1';
          }

          function openMttTradeInfoPanel(card) {
              const heading = panel.querySelector('#mtt-trade-info-heading');
              const body = panel.querySelector('#mtt-trade-info-body');
              if (!heading || !body) return;

              const text = card.dataset.mttTip || '';
              if (!text) return;

              const lines = String(text).split(/\r?\n/);
              const title = lines.shift() || oreCodeToName(card.dataset.ore || '');
              if (lines[0] === '') lines.shift();

              heading.textContent = title;
              body.textContent = lines.join('\n');

              applyMttTradeInfoOreTheme(panel, heading, card.dataset.ore || '');

              panel.style.display = 'block';
              positionMttTradeInfoPanel(card, panel);

              disclosure.style.opacity = '0';
              disclosure.style.display = 'none';
          }

          function closeMttTradeInfoPanel() {
              panel.style.display = 'none';
          }
      }

      function applyMttTradeInfoOreTheme(panel, heading, code) {
          const color = getMttTradeOreThemeColor(code);

          panel.style.borderColor = color;
          panel.style.outlineColor = color;
          panel.dataset.ore = String(code || '');

          heading.style.color = color;
          heading.style.borderBottom = `1px solid ${color}`;
      }

      function getMttTradeOreThemeColor(code) {
          const key = String(code || '').trim();
          return COLORS[key] || '#2f8fbc';
      }

      function getMttTradeDisclosure() {
          let disclosure = document.getElementById('mtt-trade-disclosure');

          if (!disclosure) {
              disclosure = document.createElement('div');
              disclosure.id = 'mtt-trade-disclosure';
              disclosure.textContent = 'More Info';
              document.body.appendChild(disclosure);
          }

          return disclosure;
      }

      function getMttTradeInfoPanel() {
          let panel = document.getElementById('mtt-trade-info-panel');

          if (!panel) {
              panel = document.createElement('div');
              panel.id = 'mtt-trade-info-panel';

              const close = document.createElement('button');
              close.id = 'mtt-trade-info-close';
              close.type = 'button';
              close.textContent = '×';
              close.title = 'Close';
              panel.appendChild(close);

              const heading = document.createElement('div');
              heading.id = 'mtt-trade-info-heading';
              panel.appendChild(heading);

              const body = document.createElement('pre');
              body.id = 'mtt-trade-info-body';
              panel.appendChild(body);

              document.body.appendChild(panel);
          }

          return panel;
      }

      function positionMttTradeDisclosure(card, disclosure, pointerEvent) {
          if (!card || !disclosure || disclosure.style.display === 'none') return;

          const gap = 6;
          const cardRect = card.getBoundingClientRect();
          const rect = disclosure.getBoundingClientRect();
          const isBlackOre = card.dataset.ore === 'Bl';

          let left;
          let top;

          if (isBlackOre && pointerEvent) {
              const contentArea = card.closest('.content-area') || document.querySelector('.content-area');
              const contentRect = contentArea
                  ? contentArea.getBoundingClientRect()
                  : { left: gap, right: window.innerWidth - gap, top: gap, bottom: window.innerHeight - gap };

              const preferredLeft = pointerEvent.clientX + gap;
              const minLeft = contentRect.left + gap;
              const maxLeft = contentRect.right - rect.width - gap;

              left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

              const preferredTop = pointerEvent.clientY + 8;
              const minTop = contentRect.top + gap;
              const maxTop = Math.min(
                  contentRect.bottom - rect.height - gap,
                  window.innerHeight - rect.height - gap
              );

              top = Math.max(minTop, Math.min(preferredTop, maxTop));
          } else {
              left = cardRect.right + gap;
              top = cardRect.top + Math.max(0, Math.round((cardRect.height - disclosure.offsetHeight) / 2));

              if (left + rect.width > window.innerWidth - gap) {
                  left = cardRect.left - rect.width - gap;
              }

              if (top + rect.height > window.innerHeight - gap) {
                  top = window.innerHeight - rect.height - gap;
              }
          }

          disclosure.style.left = `${Math.max(gap, Math.round(left))}px`;
          disclosure.style.top = `${Math.max(gap, Math.round(top))}px`;
      }

      function positionMttTradeInfoPanel(card, panel) {
          if (!card || !panel || panel.style.display === 'none') return;

          const gap = 8;
          const cardRect = card.getBoundingClientRect();
          const rect = panel.getBoundingClientRect();
          const isBlackOre = card.dataset.ore === 'Bl';

          let left = isBlackOre
              ? cardRect.left - rect.width - gap
              : cardRect.right + gap;

          let top = cardRect.top;

          if (!isBlackOre && left + rect.width > window.innerWidth - gap) {
              left = cardRect.left - rect.width - gap;
          }

          if (top + rect.height > window.innerHeight - gap) {
              top = window.innerHeight - rect.height - gap;
          }

          panel.style.left = `${Math.max(gap, Math.round(left))}px`;
          panel.style.top = `${Math.max(gap, Math.round(top))}px`;
      }

      function buildMttTradeCardTip(row, active) {
          const code = String(row && row.code || '');
          const name = oreCodeToName(code);
          const runCount = getCurrentTradeBandRemaining();
          const stockTrades = Number.isFinite(Number(row && row.remaining)) ? Math.max(0, Math.floor(Number(row.remaining))) : null;
          const possibleRun = Number.isFinite(stockTrades) ? Math.min(runCount, stockTrades) : runCount;

          const oneDelta = getTradeStatDelta(row, 1);
          const runDelta = getTradeStatDelta(row, possibleRun);

          const lines = [];
          lines.push(`${name}${active ? '' : ' [LOCKED]'}`);
          lines.push('');

          if (!active) {
              lines.push(`Unavailable: not enough ${name}.`);
              if (Number.isFinite(stockTrades)) lines.push(`Stock supports ${stockTrades} trade${stockTrades === 1 ? '' : 's'}.`);
              return lines.join('\n');
          }

          lines.push('1 trade:');
          appendStatDeltaLines(lines, oneDelta);
          lines.push(`${fmtSigned(oneDelta.tbs, 5)} TBS`);

          lines.push('');
          lines.push(`Current 10-run: ${possibleRun} remaining`);
          appendStatDeltaLines(lines, runDelta);
          lines.push(`${fmtSigned(runDelta.tbs, 5)} TBS`);

          if (Number.isFinite(stockTrades)) {
              lines.push('');
              lines.push(`Stock: ${stockTrades} trade${stockTrades === 1 ? '' : 's'} available`);
          }

          appendRollProjection(lines, oneDelta, runDelta);
          return lines.join('\n');
      }

      function getCurrentTradeBandRemaining() {
          const fromPost = tradePost && Number.isFinite(Number(tradePost.tradesToday))
          ? Number(tradePost.tradesToday)
          : null;

          const fromLedger = Array.isArray(currentDayTrades) ? currentDayTrades.length : null;
          const count = Number.isFinite(fromPost) ? fromPost : (Number.isFinite(fromLedger) ? fromLedger : 0);
          const usedInBand = count % 10;
          return usedInBand === 0 ? 10 : 10 - usedInBand;
      }

      function getTradeStatDelta(row, count) {
          const n = Number.isFinite(Number(count)) ? Number(count) : 1;
          return {
              count: n,
              str: (toFiniteOrNull(row && row.strDelta) || 0) * n,
              pow: (toFiniteOrNull(row && row.powDelta) || 0) * n,
              spd: (toFiniteOrNull(row && row.spdDelta) || 0) * n,
              life: (toFiniteOrNull(row && row.lifeDelta) || 0) * n,
              tbs: (toFiniteOrNull(row && row.tbsNet) || 0) * n
          };
      }

      function appendStatDeltaLines(lines, delta) {
          if (Math.abs(delta.str || 0) > 0.000001) lines.push(`${fmtSigned(delta.str, 3)} STR`);
          if (Math.abs(delta.pow || 0) > 0.000001) lines.push(`${fmtSigned(delta.pow, 3)} POW`);
          if (Math.abs(delta.spd || 0) > 0.000001) lines.push(`${fmtSigned(delta.spd, 3)} SPD`);
          if (Math.abs(delta.life || 0) > 0.000001) lines.push(`${fmtSignedWhole(delta.life)} Life`);
      }

      function appendRollProjection(lines, oneDelta, runDelta) {
          const crr = getCrr();
          if (!crr || typeof crr !== 'function' || typeof crr.readStats !== 'function') return;

          const current = crr.readStats();
          if (!current || !current.stats) return;

          const baseStats = getMttProjectionBaseStats(current.stats);
          const before = crr(baseStats);
          const afterOne = crr(baseStats, oneDelta);
          const afterRun = crr(baseStats, runDelta);

          if (!before || !afterOne || !afterRun || typeof crr.rangeDelta !== 'function') return;

          const one = crr.rangeDelta(before, afterOne);
          const run = crr.rangeDelta(before, afterRun);
          const runCount = Number.isFinite(Number(runDelta && runDelta.count))
              ? Math.max(0, Math.floor(Number(runDelta.count)))
              : null;
          const runLabel = runCount === null ? '?x' : `${runCount}x`;

          lines.push('');
          lines.push('Roll ceiling impact:');
          lines.push(`1x  SPD ${fmtSignedWhole(one.ceilings.speed)} | DMG ${fmtSignedWhole(one.ceilings.damage)} | DEF ${fmtSignedWhole(one.ceilings.defense)}`);
          lines.push(`${runLabel} SPD ${fmtSignedWhole(run.ceilings.speed)} | DMG ${fmtSignedWhole(run.ceilings.damage)} | DEF ${fmtSignedWhole(run.ceilings.defense)}`);
      }

      function getMttProjectionBaseStats(stats) {
          const base = {
              str: Number(stats && stats.str),
              pow: Number(stats && stats.pow),
              spd: Number(stats && stats.spd)
          };

          if (!['str', 'pow', 'spd'].every(key => Number.isFinite(base[key]))) return stats;
          if (!completedTrade) return base;

          return {
              str: base.str + (toFiniteOrNull(completedTrade.strDelta) || 0),
              pow: base.pow + (toFiniteOrNull(completedTrade.powDelta) || 0),
              spd: base.spd + (toFiniteOrNull(completedTrade.spdDelta) || 0)
          };
      }

      function getCrr() {
          const root = window;
          const crr = root && (root.HW_CRR || root.HW_COMBAT_ROLL_RANGES);
          return typeof crr === 'function' ? crr : null;
      }

      function injectDepotTradeCardStyle() {
          if (document.getElementById('mtt-depot-trade-style')) return;

          const style = document.createElement('style');
          style.id = 'mtt-depot-trade-style';
          style.textContent = `
                  #mtt-depot-trade {
                    margin: 8px auto 10px;
                    padding: 7px;
                    width: 100%;
                    box-sizing: border-box;
                    color: #111111;
                    font-family: Consolas, monospace;
                    font-size: 11px;
                    line-height: 1.15;
                    overflow: auto;
                  }

                  #mtt-trade-core {
                    float: left;
                    width: 75%;
                    box-sizing: border-box;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(112px, 132px));
                    justify-content: end;
                    gap: 6px 12px;
                    padding-right: 12px;
                  }

                  #mtt-trade-side {
                    float: left;
                    width: 25%;
                    box-sizing: border-box;
                    margin: 0;
                    padding-top: 8px;
                    text-align: center;
                  }

                  #mtt-trade-meta {
                    display: inline-block;
                    width: calc(100% - 8px);
                    max-width: 150px;
                    margin: 0 auto 12px;
                    padding: 4px 5px;
                    box-sizing: border-box;
                    border: 1px solid #37d45a;
                    outline: 1px solid #008800;
                    background: #f7fff7;
                    color: #111111;
                    font-size: 11px;
                    line-height: 1.15;
                    text-align: center;
                    white-space: nowrap;
                  }

                  #mtt-trade-bl {
                    width: 100%;
                    box-sizing: border-box;
                    margin: 0;
                    padding-top: 0;
                    text-align: center;
                  }

                  #mtt-depot-trade .mtt-trade-card {
                    position: relative;
                    display: block;
                    min-height: 64px;
                    padding: 5px 6px;
                    box-sizing: border-box;
                    border: 1px solid #888888;
                    border-radius: 5px;
                    background: #333333;
                    color: #dddddd;
                    text-decoration: none;
                    text-align: center;
                    overflow: hidden;
                  }

                  #mtt-depot-trade .mtt-trade-active:hover {
                    border-color: #333333;
                    background: #f4f4f4;
                    color: #111111;
                  }

                  #mtt-depot-trade .mtt-trade-disabled {
                    opacity: 0.5;
                    cursor: default;
                  }

                  #mtt-depot-trade .mtt-trade-disabled:hover {
                  background: #333333;
                  }

                  #mtt-depot-trade .mtt-trade-card-head {
                    display: flex;
                    justify-content: center;
                    gap: 3px;
                    margin-bottom: 3px;
                    font-weight: bold;
                    white-space: nowrap;
                  }

                  #mtt-depot-trade .mtt-trade-card-body {
                    margin: 2px 0 4px;
                  }

                  #mtt-depot-trade .mtt-trade-delta {
                    white-space: nowrap;
                  }

                  #mtt-depot-trade .mtt-trade-plus {
                    color: #00e800;
                  }

                  #mtt-depot-trade .mtt-trade-active:hover .mtt-trade-plus {
                    Color: #009900;
                  }

                  #mtt-depot-trade .mtt-trade-minus {
                    color: #ff4444;
                  }

                  #mtt-depot-trade .mtt-trade-active:hover .mtt-trade-minus {
                    color: #dd6666;
                  }

                  #mtt-depot-trade .mtt-trade-card-foot {
                    display: flex;
                    justify-content: space-between;
                    gap: 4px;
                    color: #333333;
                    font-size: 10px;
                    white-space: nowrap;
                  }

                  #mtt-depot-trade .mtt-trade-core-card .mtt-trade-card-foot {
                    justify-content: flex-end;
                  }

                  #mtt-depot-trade .mtt-trade-net {
                    color: #cccccc;
                  }

                  #mtt-depot-trade .mtt-trade-active:hover .mtt-trade-net {
                    color: #333333;
                  }

                  #mtt-depot-trade .mtt-trade-rem {
                    color: #999999;
                  }

                  #mtt-depot-trade .mtt-trade-active:hover .mtt-trade-rem {
                    color: #555555;
                  }

                  #mtt-depot-trade .mtt-trade-icon {
                    display: flex;
                    justify-content: center;
                    margin: 0 0 3px;
                  }

                  #mtt-depot-trade .mtt-ore-hex {
                    display: block;
                    width: 24px;
                    height: 24px;
                  }

                  #mtt-trade-bl .mtt-trade-section-label {
                    display: inline-block;
                    margin: 0 auto 5px;
                    padding: 1px 12px;
                    border: 1px solid #f0aaaa;
                    border-radius: 8px;
                    background: #fff8bb;
                    color: #111111;
                    font-weight: bold;
                    line-height: 1.2;
                    white-space: nowrap;
                    text-align: center;
                    cursor: pointer;
                    user-select: none;
                  }

                  #mtt-trade-bl.mtt-trade-collapsed .mtt-trade-section-label {
                    margin-bottom: 0;
                  }

                  #mtt-trade-bl.mtt-trade-collapsed .mtt-trade-bl-card {
                    display: none !important;
                  }

                  #mtt-trade-bl .mtt-trade-bl-card {
                    width: calc(100% - 8px);
                    max-width: 132px;
                    min-height: 64px;
                    margin: 0 auto;
                    border-top-color: #333333 !important;
                    border-bottom-color: #333333 !important;
                    border-top-width: 2px !important;
                    border-bottom-width: 2px !important;
                  }

                  #mtt-trade-sh {
                    clear: both;
                    width: 100%;
                    box-sizing: border-box;
                    padding-top: 9px;
                    text-align: center;
                  }

                  #mtt-trade-sh .mtt-trade-sh-label {
                    display: inline-block;
                    margin: 0 auto 5px;
                    padding: 1px 12px;
                    border: 1px solid #f0aaaa;
                    border-radius: 8px;
                    background: #fff8bb;
                    color: #111111;
                    font-weight: bold;
                    line-height: 1.2;
                    cursor: pointer;
                    user-select: none;
                  }

                  #mtt-trade-sh.mtt-trade-collapsed .mtt-trade-sh-label {
                    margin-bottom: 0;
                  }

                  #mtt-trade-sh.mtt-trade-collapsed .mtt-trade-sh-grid {
                    display: none !important;
                  }

                  #mtt-trade-sh .mtt-trade-sh-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(160px, 1fr));
                    justify-content: center;
                    gap: 7px;
                    width: 100%;
                    max-width: 650px;
                    margin: 0 auto;
                  }

                  #mtt-trade-sh .mtt-trade-sh-card {
                    min-height: 70px;
                    padding: 5px 6px 4px;
                    border: 2px solid #4848d8;
                    border-radius: 5px;
                    background: #d8d8ff;
                  }

                  #mtt-trade-sh .mtt-trade-sh-card:hover {
                    border-color: #2020a8;
                    background: #eeeeff;
                  }

                  #mtt-trade-sh .mtt-trade-disabled:hover {
                    background: #d8d8ff;
                  }

                  #mtt-trade-sh .mtt-trade-sh-flow {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    min-height: 34px;
                    white-space: nowrap;
                  }

                  #mtt-trade-sh .mtt-sh-endpoint {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 30px;
                    min-height: 30px;
                    font-size: 10px;
                    line-height: 1.05;
                  }

                  #mtt-trade-sh .mtt-sh-count {
                    margin-left: 1px;
                    color: #111111;
                    font-size: 10px;
                  }

                  #mtt-trade-sh .mtt-sh-text-endpoint {
                    flex-direction: column;
                    min-width: 48px;
                    font-size: 10px;
                    font-weight: bold;
                    color: #111111;
                  }

                  #mtt-trade-sh .mtt-hobalt-shard {
                    width: 16px;
                    height: 32px;
                  }

                  #mtt-trade-sh .mtt-hobalt-chunk-img {
                    display: block;
                    width: 38px;
                    height: 30px;
                    object-fit: contain;
                  }

                  #mtt-trade-sh .mtt-begging-piggy {
                    width: 42px;
                    height: 28px;
                  }

                  #mtt-trade-sh .mtt-trade-arrow {
                    width: 30px;
                    height: 16px;
                    flex: 0 0 auto;
                  }

                  #mtt-trade-sh .mtt-trade-sh-text {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    color: #111111;
                    font-weight: bold;
                    font-size: 10px;
                    line-height: 1.05;
                    white-space: nowrap;
                  }
                  #mtt-depot-trade .mtt-hobalt-chunk-img {
                    display: block;
                    width: 30px;
                    height: 30px;
                    object-fit: contain;
                  }
                  #mtt-trade-disclosure {
                    position: fixed;
                    z-index: 999999;
                    display: none;
                    opacity: 0;

                    padding: 2px 6px;
                    box-sizing: border-box;

                    border: 1px solid #2f8fbc;
                    outline: 1px solid #000;
                    border-radius: 2px;

                    background: #252525;
                    color: #f7f7f7;

                    font-family: Consolas, monospace;
                    font-size: 10px;
                    line-height: 1.2;
                    text-align: center;
                    white-space: nowrap;

                    cursor: pointer;
                    user-select: none;
                    box-shadow: 1px 1px 3px 1px rgba(0,0,0,.5);
                    transition: opacity .2s linear;
                  }
                  #mtt-trade-disclosure:hover {
                    background: #555555;
                    color: f0fff7;
                  }

                  #mtt-trade-info-panel {
                    --mtt-info-close-width: 18px;
                    --mtt-info-close-offset: 24px;

                    position: fixed;
                    z-index: 999999;
                    display: none;

                    max-width: 360px;
                    padding: 5px 6px 6px;
                    box-sizing: border-box;

                    border: 1px solid #2f8fbc;
                    outline: 1px solid #000;
                    border-radius: 2px;

                    background: #252525;
                    color: #f7f7f7;

                    font-family: Consolas, monospace;
                    font-size: 11px;
                    line-height: 1.25;
                    text-align: left;

                    box-shadow: 1px 1px 3px 1px rgba(0,0,0,.5);
                  }

                  #mtt-trade-info-close {
                    float: right;
                    width: var(--mtt-info-close-width);
                    margin: -2px -2px 3px 6px;
                    padding: 0;
                    box-sizing: border-box;
                    border: 1px solid #555;
                    border-radius: 2px;
                    background: #111;
                    color: #fff;
                    font-family: Consolas, monospace;
                    font-size: 11px;
                    line-height: 1.2;
                    text-align: center;
                    cursor: pointer;
                  }

                  #mtt-trade-info-close:hover {
                    background: #500;
                    border-color: #b44;
                  }

                  #mtt-trade-info-heading {
                    display: block;
                    width: 100%;
                    margin: 0 calc(-1 * var(--mtt-info-close-offset)) 5px 0;
                    padding: 0 var(--mtt-info-close-offset) 3px var(--mtt-info-close-offset);
                    box-sizing: border-box;
                    font: inherit;
                    font-weight: bold;
                    text-align: center;
                    line-height: 1.25;
                    user-select: text;
                    cursor: text;
                  }

                  #mtt-trade-info-body {
                    margin: 0;
                    padding: 0;
                    white-space: pre;
                    user-select: text;
                    cursor: text;
                    font: inherit;
                    color: inherit;
                    background: transparent;
                    border: 0;
                  }

                  #mtt-trade-core-gr { border-top-color: #37d45a !important; border-top-width: 2px !important; border-bottom-color: #37d45a !important; border-bottom-width: 2px !important; }
                  #mtt-trade-core-wh { border-top-color: #fafafa !important; border-top-width: 2px !important; border-bottom-color: #fafafa !important; border-bottom-width: 2px !important; }
                  #mtt-trade-core-ye { border-top-color: #ffd94a !important; border-top-width: 2px !important; border-bottom-color: #ffd94a !important; border-bottom-width: 2px !important; }
                  #mtt-trade-core-or { border-top-color: #ff9a2f !important; border-top-width: 2px !important; border-bottom-color: #ff9a2f !important; border-bottom-width: 2px !important; }
                  #mtt-trade-core-re { border-top-color: #ff4b4b !important; border-top-width: 2px !important; border-bottom-color: #ff4b4b !important; border-bottom-width: 2px !important; }
                  #mtt-trade-core-pu { border-top-color: #b86cff !important; border-top-width: 2px !important; border-bottom-color: #b86cff !important; border-bottom-width: 2px !important; }
              `;
          document.head.appendChild(style);
      }
  })();
 
  /* ===== HW Topbar Total Battle Stats.user.js ===== */
  (function () {
    'use strict';

    const STORAGE_SCHEMA = '1';
    const K_STATS = `hwtbs_authoritative_stats_schema_${STORAGE_SCHEMA}`;
    const K_LAST_MINES_STAT = `hwtbs_last_applied_mining_schema_${STORAGE_SCHEMA}`;
    const K_MTT_LAST_TRADE = `mtt_topbar_last_trade_bridge_v1`;
    const K_LAST_JUNGLE_YIELD = `hwtbs_last_jungle_yield_schema_${STORAGE_SCHEMA}`;

    const href = String(location.href || '');
    const isLivingArea = isLivingAreaUrl(href);
    const isUniversity = /[?&]cmd=uni(?:[&#]|$|&)/i.test(href);
    const isMinesTrade = /[?&]cmd=mines(?:[&#]|$|&)/i.test(href) && /[?&]do=trade(?:[&#]|$|&)/i.test(href);

    const bodyText = document.body
      ? (document.body.innerText || document.body.textContent || '')
      : '';

    let stats = loadStats();

    if (isLivingArea) {
      const parsed = parseLivingAreaStats();
      if (parsed) {
        stats = {
          ...stats,
          ...parsed,
          source: 'Home',
          sourceAt: Date.now()
        };
        saveStats(stats);
      }
    }

    if (isUniversity) {
      const parsed = parseUniversityPostTrain(bodyText);
      if (parsed) {
        stats = {
          ...stats,
          [parsed.key]: parsed.value,
          source: 'University',
          sourceAt: Date.now()
        };
        saveStats(stats);
      }
    }

    if (isMinesTrade) {
      const telemetryTrade = loadMinesTelemetryTrade();

      if (telemetryTrade && hasAllStats(stats)) {
        const lastAppliedMining = Number(GM_getValue(K_LAST_MINES_STAT, ''));

        if (!Number.isFinite(lastAppliedMining) || telemetryTrade.mining > lastAppliedMining) {
          stats = applyDelta(stats, {
            spd: telemetryTrade.spd,
            pow: telemetryTrade.pow,
            str: telemetryTrade.str
          });

          stats.source = 'Depot';
          stats.sourceAt = Date.now();

          GM_setValue(K_LAST_MINES_STAT, String(telemetryTrade.mining));
          saveStats(stats);
        }
      }
    }

    const jungleYield = loadCrrJungleYield();

    if (jungleYield && hasAllStats(stats)) {
      const prevFp = String(GM_getValue(K_LAST_JUNGLE_YIELD, '') || '');

      if (jungleYield.fp && jungleYield.fp !== prevFp) {
        stats = applyDelta(stats, {
          spd: jungleYield.spd,
          pow: jungleYield.pow,
          str: jungleYield.str
        });

        stats.source = 'Jungle';
        stats.sourceAt = Date.now();

        GM_setValue(K_LAST_JUNGLE_YIELD, String(jungleYield.fp));
        saveStats(stats);
      }
    }

    publishCrrStats(stats);
    renderTopbar(stats);

      function removeOnlineTooltip() {
        const onlineLink = document.querySelector(
          '.top-center a[href*="cmd=active"]'
        );

        if (!onlineLink) return;

        onlineLink.removeAttribute('title');

        const img = onlineLink.querySelector('img');

        if (img && img.dataset.hwtbsTooltipCleaned !== '1') {
          const cleanImg = img.cloneNode(true);

          cleanImg.removeAttribute('title');
          cleanImg.dataset.hwtbsTooltipCleaned = '1';

          img.replaceWith(cleanImg);
        }

        document.querySelector('#tiptip_holder')?.remove();
      }

      removeOnlineTooltip();
      setTimeout(removeOnlineTooltip, 500);

    function isLivingAreaUrl(url) {
      const u = String(url || '');

      if (!/\/game\/game\.php/i.test(u)) return false;
      if (!/[?&]sr=\d+/i.test(u)) return false;

      // Living Area is normally no cmd, or an empty cmd.
      if (!/[?&]cmd=/i.test(u)) return true;
      return /[?&]cmd=(?:[&#]|$)/i.test(u);
    }

    function parseLivingAreaStats() {
      const out = {};
      const block = document.querySelector('#combatStats');

      if (block) {
        const rows = Array.from(block.querySelectorAll('.line, div, tr, li'));

        for (const row of rows) {
          const parsed = parseStatLine(row.textContent || '');
          if (parsed) out[parsed.key] = parsed.value;
        }
      }

      if (hasAllStats(out)) return out;

      const content = document.querySelector('.content-area');
      const text = normalizeSpace(content ? content.textContent : bodyText);

      for (const label of ['Speed', 'Power', 'Strength']) {
        const key = statKey(label);
        if (Number.isFinite(out[key])) continue;

        const re = new RegExp(`\\b${label}\\s*:\\s*([\\d,]+(?:\\.\\d+)?)`, 'i');
        const m = text.match(re);
        if (m) out[key] = parseNum(m[1]);
      }

      return hasAnyStat(out) ? out : null;
    }

    function parseStatLine(text) {
      const m = String(text || '').match(/\b(Speed|Power|Strength)\s*:\s*([\d,]+(?:\.\d+)?)/i);
      if (!m) return null;

      const key = statKey(m[1]);
      const value = parseNum(m[2]);

      if (!key || !Number.isFinite(value)) return null;
      return { key, value };
    }

    function parseUniversityPostTrain(text) {
      const norm = normalizeSpace(text);

      const m = norm.match(/\bYou now have\s+([\d,]+(?:\.\d+)?)\s+(speed|power|strength)\s*!?/i);
      if (!m) return null;

      const value = parseNum(m[1]);
      const key = statKey(m[2]);

      if (!key || !Number.isFinite(value)) return null;
      return { key, value };
    }

    function loadMinesTelemetryTrade() {
      try {
        const v = JSON.parse(localStorage.getItem(K_MTT_LAST_TRADE) || '{}');

        if (!v || typeof v !== 'object') return null;
        if (Number(v.schema) !== 1) return null;

        const mining = Number(v.mining);
        const spd = Number(v.spd || 0);
        const pow = Number(v.pow || 0);
        const str = Number(v.str || 0);

          if (!Number.isFinite(mining)) return null;
          if (![spd, pow, str].every(Number.isFinite)) return null;

          if (
            Math.abs(spd) < 0.000001 &&
            Math.abs(pow) < 0.000001 &&
            Math.abs(str) < 0.000001
         ) {
          return null;
         }

          return { mining, spd, pow, str };
       } catch {
          return null;
       }
    }

    function parseCompletedMinesTrade(text) {
      const norm = normalizeSpace(text);

      // Avoid parsing the general trade table. We only want confirmed trade-result pages.
      // Most completed trade pages include "You trade..." or similar result phrasing.
      // If that wording differs on your live page, this guard can be loosened.
      const looksCompleted =
        /\bYou trade\b/i.test(norm) ||
        /\bYou traded\b/i.test(norm) ||
        /\btraded your\b/i.test(norm) ||
        /\bremaining\b/i.test(norm);

      if (!looksCompleted) return null;

      const delta = { spd: 0, pow: 0, str: 0 };
      let found = false;

      const re = /([+-]\s*[\d,]+(?:\.\d+)?)\s*(str|strength|pow|power|spd|speed)\b/gi;
      let m;

      while ((m = re.exec(norm)) !== null) {
        const n = parseNum(m[1].replace(/\s+/g, ''));
        const key = statKey(m[2]);

        if (!key || !Number.isFinite(n)) continue;

        delta[key] += n;
        found = true;
      }

      if (!found) return null;

      // Keep only actual non-zero deltas.
      return {
        spd: round4(delta.spd),
        pow: round4(delta.pow),
        str: round4(delta.str)
      };
    }

    function applyDelta(stats, delta) {
      const next = { ...stats };

      for (const key of ['spd', 'pow', 'str']) {
        const base = finiteOrNull(next[key]);

        if (Number.isFinite(base) && Number.isFinite(delta[key]) && delta[key] !== 0) {
          next[key] = round4(base + delta[key]);
        }
      }

      return next;
    }

    function buildMinesFingerprint(delta) {
      const content = document.querySelector('.content-area');
      const text = normalizeSpace(content ? content.textContent : bodyText).slice(0, 1200);
      const clock = normalizeSpace(document.querySelector('#clock')?.textContent || '');

      return [
        location.pathname,
        location.search,
        clock,
        delta.str,
        delta.pow,
        delta.spd,
        text
      ].join('|');
    }

    function renderTopbar(stats) {
      // Match CSMP's layout-aware placement:
      // The Future: insert as another topbar section after native stats.
      // Legacy/standard layouts: insert after #playerStats and stack internally.
      const futureStatsAnchor = document.querySelector('.topbar .top-center .section.stats');
      const standardAnchor = document.querySelector('#playerStats');
      const anchor = futureStatsAnchor || standardAnchor;
      if (!anchor) return;

      const layoutClass = futureStatsAnchor
        ? 'hwtbs-layout-future'
        : 'hwtbs-layout-standard';

      injectStyle();
      installTooltip();

      let suite = document.querySelector('#hwtbs-suite-panel');

      // If the user changes layout without clearing the DOM, rebuild against
      // the correct anchor rather than retaining geometry from the old layout.
      if (suite && !suite.classList.contains(layoutClass)) {
        suite.remove();
        suite = null;
      }

      if (!suite) {
        suite = document.createElement('div');
        suite.id = 'hwtbs-suite-panel';
        suite.className = futureStatsAnchor
          ? 'section battleStats hwtbs-layout-future'
          : 'hwtbs-layout-standard';

        const inner = document.createElement('div');
        inner.className = 'hwtbs-suite-inner';

        const panel = document.createElement('div');
        panel.id = 'hwtbs-topbar-panel';

        const rollPanel = document.createElement('div');
        rollPanel.id = 'hwtbs-roll-panel';

        inner.append(panel, rollPanel);
        suite.appendChild(inner);
        anchor.insertAdjacentElement('afterend', suite);
      }

      const panel = suite.querySelector('#hwtbs-topbar-panel');
      const rollPanel = suite.querySelector('#hwtbs-roll-panel');
      if (!panel || !rollPanel) return;

      const spd = finiteOrNull(stats.spd);
      const pow = finiteOrNull(stats.pow);
      const str = finiteOrNull(stats.str);

      const total =
        Number.isFinite(spd) && Number.isFinite(pow) && Number.isFinite(str)
          ? round4(spd + pow + str)
          : null;

      const source = stats.source ? String(stats.source) : 'Unset';
      const age = formatAge(stats.sourceAt);

      panel.removeAttribute('title');
      panel.dataset.hwtbsTip = `TBS ${fmt(total)}\n(${source}${age ? `, ${age}` : ''})`;

      panel.innerHTML =
        renderStatLine('SPD', spd, total) +
        renderStatLine('POW', pow, total) +
        renderStatLine('STR', str, total);

      const rolls = calcBaselineRollRanges({ spd, pow, str });

      rollPanel.removeAttribute('title');
      rollPanel.dataset.hwtbsTip = `Unequipped\n(${source}${age ? `, ${age}` : ''})`;
      rollPanel.innerHTML =
        renderRollLine('', rolls.speed, 'hwtbs-roll-speed') +
        renderRollLine('', rolls.damage, 'hwtbs-roll-damage') +
        renderRollLine('', rolls.defense, 'hwtbs-roll-defense');
    }

    function renderStatLine(label, value, total) {
      const pct =
        Number.isFinite(value) && Number.isFinite(total) && total > 0
          ? `${((value / total) * 100).toFixed(1)}%`
          : '---';

      return (
        `<div class="hwtbs-line">` +
        `<span class="hwtbs-stat-value">${label}: ${fmt(value)}</span>` +
        `<span class="hwtbs-stat-percent">(${pct})</span>` +
        `</div>`
      );
    }

    function renderRollLine(label, range, className) {
      if (!range) {
        return `<div class="hwtbs-roll-line ${className}">${label}: --- ~ ---</div>`;
      }

      return (
        `<div class="hwtbs-roll-line ${className}" data-hwtbs-tip="Average: ${fmtWhole(range.avg)}">` +
        `${fmtWhole(range.min)} ~ ${fmtWhole(range.max)}` +
        `</div>`
      );
    }

    function calcBaselineRollRanges(stats) {
      const crr = getCrr();
      const rolls = crr ? crr(stats || {}) : null;

      return rolls && rolls.ranges
        ? rolls.ranges
        : { speed: null, damage: null, defense: null };
    }

    function getCrr() {
      const root = window;
      const crr = root && (root.HW_CRR || root.HW_COMBAT_ROLL_RANGES);
      return typeof crr === 'function' ? crr : null;
    }

    function publishCrrStats(stats) {
      const crr = getCrr();
      if (!crr || typeof crr.publishStats !== 'function' || !hasAllStats(stats)) return;

      crr.publishStats(
        { str: stats.str, pow: stats.pow, spd: stats.spd },
        { source: stats.source || 'TBTBS', sourceAt: stats.sourceAt || Date.now() }
      );
    }

    function loadCrrJungleYield() {
      const crr = getCrr();
      if (!crr || typeof crr.readJungleLastYield !== 'function') return null;

      const payload = crr.readJungleLastYield();
      if (!payload || !payload.fp) return null;

      const out = {
        fp: String(payload.fp),
        spd: finiteOrNull(payload.spd) || 0,
        pow: finiteOrNull(payload.pow) || 0,
        str: finiteOrNull(payload.str) || 0
      };

      if (
        Math.abs(out.spd) < 0.000001 &&
        Math.abs(out.pow) < 0.000001 &&
        Math.abs(out.str) < 0.000001
      ) {
        return null;
      }

      return out;
    }

      function installTooltip() {
        if (document.documentElement.dataset.hwtbsTooltipInstalled === '1') return;
        document.documentElement.dataset.hwtbsTooltipInstalled = '1';

        const tooltip = document.createElement('div');
        tooltip.id = 'hwtbs-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);

          let showTimer = 0;
          let hideTimer = 0;
          let activeTarget = null;

          const hide = () => {
            window.clearTimeout(showTimer);
            window.clearTimeout(hideTimer);

            showTimer = 0;
            activeTarget = null;

            hideTimer = window.setTimeout(() => {
              tooltip.hidden = true;
              tooltip.textContent = '';
              tooltip.classList.remove(
                'hwtbs-tip-above',
                'hwtbs-tip-below',
                'hwtbs-tip-left',
                'hwtbs-tip-right'
              );

              hideTimer = 0;
            }, 600);
          };

        document.addEventListener('mouseover', event => {
          const target = event.target instanceof Element
            ? event.target.closest('[data-hwtbs-tip]')
            : null;

          if (!target || !document.documentElement.contains(target)) return;

          if (
            event.relatedTarget instanceof Node &&
            target.contains(event.relatedTarget)
          ) {
            return;
          }

          window.clearTimeout(showTimer);
          window.clearTimeout(hideTimer);
          hideTimer = 0;
          activeTarget = target;

          const originX = event.clientX;
          const originY = event.clientY;

          showTimer = window.setTimeout(() => {
            if (activeTarget !== target || !target.matches(':hover')) return;

            tooltip.textContent = String(target.dataset.hwtbsTip || '');
            tooltip.hidden = false;

            positionTooltip(
              tooltip,
              originX,
              originY
            );
          }, 450);
        }, true);

        document.addEventListener('mouseout', event => {
          const target = event.target instanceof Element
            ? event.target.closest('[data-hwtbs-tip]')
            : null;

          if (!target) return;

          if (
            event.relatedTarget instanceof Node &&
            target.contains(event.relatedTarget)
          ) {
            return;
          }

          hide();
        }, true);

        window.addEventListener('blur', hide);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
      }

      function positionTooltip(tooltip, originX, originY) {
        const gap = 10;
        const margin = 6;

        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.classList.remove(
          'hwtbs-tip-above',
          'hwtbs-tip-below',
          'hwtbs-tip-left',
          'hwtbs-tip-right'
        );

        const rect = tooltip.getBoundingClientRect();

        let left = originX - rect.width / 6;
        const top = originY + gap;

        left = Math.max(
          margin,
          Math.min(left, window.innerWidth - rect.width - margin)
        );

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.classList.add('hwtbs-tip-below');

        const arrowX = Math.max(
          12,
          Math.min(originX - left, rect.width - 12)
        );

        tooltip.style.setProperty(
          '--hwtbs-arrow-x',
          `${Math.round(arrowX)}px`
        );
      }
    function injectStyle() {
      if (document.querySelector('#hwtbs-topbar-style')) return;

      const style = document.createElement('style');
      style.id = 'hwtbs-topbar-style';
      style.textContent = `
#hwtbs-suite-panel,
#hwtbs-suite-panel * {
  box-sizing: border-box;
}

#hwtbs-suite-panel {
  min-width: 0;
  color: #111;
  font-family: Consolas, "Courier New", monospace;
  font-size: 10px;
  line-height: 16px;
}

/* The Future: participate in the native topbar flow, just as CSMP does. */
#hwtbs-suite-panel.hwtbs-layout-future {
  position: static;
  margin: 0 0 0 5px;
  padding: 0;
  vertical-align: top;
}

/* Legacy/standard layouts: live beneath #playerStats without fixed viewport coordinates. */
#hwtbs-suite-panel.hwtbs-layout-standard {
  width: 100%;
  max-width: 100%;
  margin: 3px 0;
  border: 1px solid #181818;
  overflow: hidden;
}

.hwtbs-suite-inner {
  display: grid;
  min-width: 0;
  border: 1px solid #181818;
  overflow: hidden;
}

/* Future has horizontal topbar room: stats + rolls side by side. */
#hwtbs-suite-panel.hwtbs-layout-future .hwtbs-suite-inner {
  width: max-content;
  grid-template-columns: max-content max-content;
}

/* Legacy layouts get the same information stacked in the available player-stats width. */
#hwtbs-suite-panel.hwtbs-layout-standard .hwtbs-suite-inner {
  width: 100%;
  border: 0;
  grid-template-columns: minmax(0, 1fr);
}

#hwtbs-topbar-panel,
#hwtbs-roll-panel {
  min-width: 0;
  width: auto;
  max-width: none;
  position: static;
  overflow: hidden;
  background: #fafafa;
}

#hwtbs-suite-panel.hwtbs-layout-future #hwtbs-topbar-panel {
  border-right: 1px solid #181818;
}

#hwtbs-suite-panel.hwtbs-layout-standard #hwtbs-topbar-panel {
  border-bottom: 1px solid #181818;
}

.hwtbs-line,
#hwtbs-roll-panel .hwtbs-roll-line {
  height: 21px;
  min-width: 0;
  padding: 0 3px;
  border-bottom: 1px solid rgba(0,0,0,.2);
  background: #fafafa;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
}

.hwtbs-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
}

.hwtbs-stat-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
}

.hwtbs-stat-percent {
  flex: 0 0 auto;
  font-size: 8px;
}

.hwtbs-line:nth-child(1),
#hwtbs-roll-panel .hwtbs-roll-speed {
  background: rgba(230,208,90,.55);
}

.hwtbs-line:nth-child(2),
#hwtbs-roll-panel .hwtbs-roll-damage {
  background: rgba(245,166,66,.55);
}

.hwtbs-line:nth-child(3),
#hwtbs-roll-panel .hwtbs-roll-defense {
  background: rgba(130,245,130,.55);
}

#hwtbs-roll-panel .hwtbs-roll-line {
  line-height: 21px;
  padding: 0 8px;
}

.hwtbs-roll-min,
.hwtbs-roll-max {
  text-align: center;
}

.hwtbs-roll-separator {
  padding: 0 .45em;
  color: #888;
  text-align: center;
}

#hwtbs-tooltip {
  position: fixed;
  z-index: 2147483647;
  padding: 3px 7px;
  box-sizing: border-box;
  border: 1px solid #2f8fbc;
  outline: 1px solid #000;
  border-radius: 2px;
  background: #252525;
  color: #f7f7f7;
  font-family: Consolas, monospace;
  font-size: 10px;
  line-height: 1.25;
  text-align: center;
  white-space: pre-line;
  pointer-events: none;
  box-shadow: 1px 1px 3px 1px rgba(0,0,0,.5);
  transition: opacity .4s linear;
}

#hwtbs-tooltip::before,
#hwtbs-tooltip::after {
  content: '';
  position: absolute;
  left: var(--hwtbs-arrow-x);
  transform: translateX(-50%);
  width: 0;
  height: 0;
  pointer-events: none;
}

#hwtbs-tooltip.hwtbs-tip-below::before {
  top: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid #000;
}

#hwtbs-tooltip.hwtbs-tip-below::after {
  top: -5px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid #252525;
}`;
      document.head.appendChild(style);
    }

    function loadStats() {
      try {
        const v = JSON.parse(GM_getValue(K_STATS, '{}'));
        return v && typeof v === 'object' ? v : {};
      } catch {
        return {};
      }
    }

    function saveStats(stats) {
      GM_setValue(K_STATS, JSON.stringify(stats && typeof stats === 'object' ? stats : {}));
    }

    function statKey(label) {
      const v = String(label || '').toLowerCase().trim();

      if (v === 'speed' || v === 'spd') return 'spd';
      if (v === 'power' || v === 'pow') return 'pow';
      if (v === 'strength' || v === 'str') return 'str';

      return '';
    }

    function parseNum(s) {
      const n = parseFloat(String(s || '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }

    function finiteOrNull(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    function hasAnyStat(o) {
      return (
        Number.isFinite(Number(o.spd)) ||
        Number.isFinite(Number(o.pow)) ||
        Number.isFinite(Number(o.str))
      );
    }

    function hasAllStats(o) {
      return (
        Number.isFinite(Number(o.spd)) &&
        Number.isFinite(Number(o.pow)) &&
        Number.isFinite(Number(o.str))
      );
    }

    function round4(n) {
      return Math.round(Number(n) * 10000) / 10000;
    }

    function fmt(v) {
      if (!Number.isFinite(v)) return '---';

      return Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
      });
    }

    function fmtWhole(v) {
      if (!Number.isFinite(v)) return '---';
      return Math.round(Number(v)).toLocaleString();
    }

    function formatAge(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return '';

      const mins = Math.floor((Date.now() - n) / 60000);

      if (mins < 1) return 'now';
      if (mins < 60) return `${mins}m`;

      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h`;

      return `${Math.floor(hrs / 24)}d`;
    }

    function normalizeSpace(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }
  })();

  /* ===== HW Mining Log ===== */
  (() => {
      'use strict';

      const params = new URLSearchParams(location.search);
      if (params.get('cmd') !== 'mines') return;

      const isBlastPage =
          /[?&]blast=(?:north|south|east|west)(?:[&#]|$)/i.test(location.href);

      const STORAGE = Object.freeze({
          log: 'hw_mining_log_test_v1',
          settings: 'hw_mining_log_test_settings_v1',
          lastFingerprint: 'hw_mining_log_test_last_fp_v1',
          helperImported: 'hw_mining_log_test_helper_imported_v1'
      });

      const DEFAULT_SETTINGS = Object.freeze({
          showOreFound: true,
          showImpliedOre: true,
          showTradesToday: false,
          showBlackOreTrades: false,
          showMiningGain: false,
          showMiningGainPerT: false,
          showAwakeUsed: false,
          showNetStatGain: false,
          fractionLength: 'auto'
      });

      const YIELD_ORDER = Object.freeze([
          'Green Ore',
          'White Ore',
          'Yellow Ore',
          'Orange Ore',
          'Red Ore',
          'Purple Ore',
          'Black Ore',
          'Hobalt Shard',
          'Crystal Skull'
      ]);

      const YIELD_LABELS = Object.freeze({
          'Green Ore': 'Gr Ore',
          'White Ore': 'Wh Ore',
          'Yellow Ore': 'Ye Ore',
          'Orange Ore': 'Or Ore',
          'Red Ore': 'Re Ore',
          'Purple Ore': 'Pu Ore',
          'Black Ore': 'Bl Ore',
          'Hobalt Shard': 'Hob Sh',
          'Crystal Skull': 'Cr Sku'
      });

      const DESTRUCTIBLE_MINING_GEAR = new Set([
          'Pickaxe',
          "Miner's Cap",
          'Pockets',
          'Spelunking Satchel',
          'Dynamite Pouch',
          'Blast Jacket'
      ]);

      const contentArea = document.querySelector('.content-area');
      if (!contentArea) return;

      // The redesigned panel owns this reserved lower region.
      contentArea.style.setProperty('padding-bottom', '370px', 'important');

      const importedHelperData = importHelperHistoryOnce();

      // Helper may already have rendered its entire historical Mining Log into
      // .content-area by the time this test module runs. Remove that donor UI
      // before serializing or scanning the native Mines page.
      removeHelperMiningLog();

      const nativeYieldImageCache = buildNativeYieldImageCache();

      // If Helper supplied the initial snapshot on this very page, do not parse
      // the same visible result again during the first test-module load.
      if (!importedHelperData) {
          recordCurrentPage();
      }

      render();

      function loadLog() {
          return readObject(STORAGE.log, {});
      }

      function saveLog(log) {
          localStorage.setItem(STORAGE.log, JSON.stringify(log));
      }

      function loadSettings() {
          const stored = readObject(STORAGE.settings, {});

          return {
              ...DEFAULT_SETTINGS,
              ...stored,
              showOreFound: stored.showOreFound ?? stored.showOreActual ?? DEFAULT_SETTINGS.showOreFound,
              showImpliedOre: stored.showImpliedOre ?? stored.showOreImplied ?? DEFAULT_SETTINGS.showImpliedOre,
              showTradesToday: stored.showTradesToday ?? stored.showOresTraded ?? DEFAULT_SETTINGS.showTradesToday,
              showAwakeUsed: stored.showAwakeUsed ?? stored.showTSpent ?? DEFAULT_SETTINGS.showAwakeUsed,
              showNetStatGain: stored.showNetStatGain ?? stored.showTradeStatGain ?? DEFAULT_SETTINGS.showNetStatGain,
              fractionLength: ['auto', '1', '2', '3', '4', '5'].includes(String(stored.fractionLength))
                  ? String(stored.fractionLength)
                  : DEFAULT_SETTINGS.fractionLength
          };
      }

      function saveSettings(settings) {
          localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
      }

      function readObject(key, fallback) {
          try {
              const raw = localStorage.getItem(key);
              if (!raw) return fallback;
              const parsed = JSON.parse(raw);
              return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? parsed
                  : fallback;
          } catch {
              return fallback;
          }
      }

      function importHelperHistoryOnce() {
          if (localStorage.getItem(STORAGE.helperImported) === '1') return false;

          localStorage.setItem(STORAGE.helperImported, '1');

          let helper;
          try {
              helper = JSON.parse(localStorage.getItem('hw_mines_log_data') || '{}');
          } catch {
              return false;
          }

          if (!helper || typeof helper !== 'object' || Array.isArray(helper)) {
              return false;
          }

          const dates = Object.keys(helper);
          if (!dates.length) return false;

          const target = loadLog();

          for (const date of dates) {
              const sourceDay = helper[date];
              if (!sourceDay || typeof sourceDay !== 'object') continue;

              const day = normalizeDay(target[date]);

              for (const [rawName, rawCount] of Object.entries(sourceDay.ores || {})) {
                  const name = canonicalYieldName(rawName);
                  const count = Math.max(0, Number.parseInt(rawCount, 10) || 0);

                  if (!name || name === 'Hobalt Chunk' || count <= 0) continue;
                  day.ores[name] = Math.max(day.ores[name] || 0, count);
              }

              if (Array.isArray(sourceDay.saves) && sourceDay.saves.length) {
                  // Helper preserves individual rescue occurrences. Copy them
                  // verbatim so repeated rescues remain countable.
                  if (!day.rescues.length) {
                      day.rescues = sourceDay.saves
                          .map(s => ({
                              id: String(s && s.id || '').trim(),
                              name: String(s && s.name || '').trim()
                          }))
                          .filter(s => /^\d+$/.test(s.id) && s.name);
                  }
              }

              const helperMiningGain = Number.parseFloat(sourceDay.exp);
              const helperTUsed = Number.parseInt(sourceDay.tUsed, 10);
              const helperTraded = Number.parseInt(sourceDay.traded, 10);

              if (Number.isFinite(helperMiningGain)) {
                  day.miningGain = Math.max(day.miningGain, helperMiningGain);
              }
              if (Number.isFinite(helperTUsed)) {
                  day.tUsed = Math.max(day.tUsed, helperTUsed);
              }
              if (Number.isFinite(helperTraded)) {
                  day.oresTraded = Math.max(day.oresTraded, helperTraded);
              }

              target[date] = day;
          }

          saveLog(target);
          return true;
      }

      function normalizeDay(value) {
          const day = value && typeof value === 'object' ? value : {};

          return {
              ores: day.ores && typeof day.ores === 'object' ? day.ores : {},
              images: day.images && typeof day.images === 'object' ? day.images : {},
              rescues: Array.isArray(day.rescues) ? day.rescues : [],
              destroyed: Array.isArray(day.destroyed) ? day.destroyed : [],
              miningGain: finiteOrZero(day.miningGain),
              tUsed: Math.max(0, Number.parseInt(day.tUsed, 10) || 0),
              oreFound: finiteOrNull(day.oreFound),
              shardsFound: finiteOrNull(day.shardsFound),
              oresTraded: Math.max(0, Number.parseInt(day.oresTraded, 10) || 0),
              blackOreTrades: Math.max(0, Number.parseInt(day.blackOreTrades, 10) || 0),
              tradeStatGain: finiteOrNull(day.tradeStatGain)
          };
      }

      function recordCurrentPage() {
          const html = contentArea.innerHTML || '';
          const text = normalizeSpace(contentArea.textContent || '');

          const result = parseActionResult(html, text);
          const counters = parseMineCounters(text);

          if (!result.hasEvent) {
              updateDailyCountersOnly(counters);
              return;
          }

          const date = getHoboDateKey();
          if (!date) return;

          const fingerprint = makeFingerprint(date, counters, result);
          if (fingerprint && fingerprint === localStorage.getItem(STORAGE.lastFingerprint)) {
              updateDailyCountersOnly(counters);
              return;
          }

          if (fingerprint) {
              localStorage.setItem(STORAGE.lastFingerprint, fingerprint);
          }

          const log = loadLog();
          const day = normalizeDay(log[date]);

          for (const found of result.ores) {
              day.ores[found.name] = (Number.parseInt(day.ores[found.name], 10) || 0) + found.count;
              if (found.src && !day.images[found.name]) {
                  day.images[found.name] = found.src;
              }
          }

          if (result.rescues.length) {
              day.rescues.push(...result.rescues);
          }

          for (const item of result.destroyed) {
              if (!day.destroyed.includes(item)) {
                  day.destroyed.push(item);
              }
          }

          if (
              Number.isFinite(result.miningGain) &&
              result.miningGain > 0 &&
              !Number.isFinite(counters.miningGainDaily)
          ) {
              day.miningGain += result.miningGain;
          }

          applyAuthoritativeCounters(day, counters);

          log[date] = day;
          saveLog(log);
      }

      function updateDailyCountersOnly(suppliedCounters = null) {
          const counters = suppliedCounters || parseMineCounters(
              normalizeSpace(contentArea.textContent || '')
          );

          if (!hasAnyAuthoritativeCounter(counters)) return;

          const date = getHoboDateKey();
          if (!date) return;

          const log = loadLog();
          const day = normalizeDay(log[date]);

          applyAuthoritativeCounters(day, counters);

          log[date] = day;
          saveLog(log);
      }

      function hasAnyAuthoritativeCounter(counters) {
          return [
              counters && counters.tUsed,
              counters && counters.oreFound,
              counters && counters.shardsFound,
              counters && counters.oresTraded,
              counters && counters.miningGainDaily
          ].some(Number.isFinite);
      }

      function applyAuthoritativeCounters(day, counters) {
          if (!day || !counters) return;

          // These are cumulative native Mines counters. Max protects the daily
          // record against browser-back navigation to an older result page.
          if (Number.isFinite(counters.tUsed)) {
              day.tUsed = Math.max(day.tUsed, counters.tUsed);
          }

          if (Number.isFinite(counters.oreFound)) {
              day.oreFound = Number.isFinite(day.oreFound)
                  ? Math.max(day.oreFound, counters.oreFound)
                  : counters.oreFound;
          }

          if (Number.isFinite(counters.shardsFound)) {
              day.shardsFound = Number.isFinite(day.shardsFound)
                  ? Math.max(day.shardsFound, counters.shardsFound)
                  : counters.shardsFound;
          }

          if (Number.isFinite(counters.oresTraded)) {
              day.oresTraded = Math.max(day.oresTraded, counters.oresTraded);
          }

          // Only the Blast UI's "Mine stat:" field means today's cumulative
          // Mining-stat gain. When present, it supersedes observed event sums.
          if (Number.isFinite(counters.miningGainDaily)) {
              day.miningGain = Math.max(day.miningGain, counters.miningGainDaily);
          }
      }

      function parseActionResult(html, text) {
          const ores = [];
          const rescues = [];
          const destroyed = [];

          const oreRegex = /You get (?:the )?(?:<b>)?(?:\(?(?:<b>)?(\d+)(?:<\/b>)?\)?\s+)?(?:<b>)?([A-Za-z]+(?:\s+[A-Za-z]+)*?)(?:<\/b>)?(?=\s*(?:<a|<br>|<\/span>|<img)|$)/gi;
          let match;

          while ((match = oreRegex.exec(html)) !== null) {
              const count = Math.max(1, Number.parseInt(match[1], 10) || 1);
              const name = canonicalYieldName(match[2]);

              if (!name || name === 'Hobalt Chunk') continue;

              ores.push({
                  name,
                  count,
                  src: findYieldImageSrc(name, html)
              });
          }

          const saveRegex = /pull\s+<a[^>]+ID=(\d+)[^>]*>([^<]+)<\/a>\s+out to safety/gi;
          let saveMatch;

          while ((saveMatch = saveRegex.exec(html)) !== null) {
              rescues.push({
                  id: saveMatch[1],
                  name: decodeEntities(saveMatch[2]).trim()
              });
          }

          const miningMatch =
              text.match(/You gain(?:ed)?\s+([0-9]+(?:\.[0-9]+)?)\s+mining!/i);

          const destructionText = normalizeSpace(
              contentArea.innerText || contentArea.textContent || ''
          );

          // Durability warnings such as
          // "Your Dynamite Pouch is looking pretty rough around the edges..."
          // are intentionally ignored. Only the terminal destruction sentence
          // is a Mining Log event.
          const destructionRegex =
              /A falling rock rips open your (.+?)\. It's completely ruined 🙁/g;

          let destructionMatch;

          while ((destructionMatch = destructionRegex.exec(destructionText)) !== null) {
              const item = normalizeSpace(destructionMatch[1]);

              if (
                  DESTRUCTIBLE_MINING_GEAR.has(item) &&
                  !destroyed.includes(item)
              ) {
                  destroyed.push(item);
              }
          }

          return {
              ores,
              rescues,
              destroyed,
              miningGain: miningMatch ? Number.parseFloat(miningMatch[1]) : null,
              hasEvent:
                  ores.length > 0 ||
                  rescues.length > 0 ||
                  destroyed.length > 0 ||
                  !!miningMatch
          };
      }

      function parseMineCounters(text) {
          const tMatch = text.match(/\bT used:\s*([\d,]+)/i);
          const oreFoundMatch = text.match(/\bOre found:\s*([\d,]+)/i);
          const tradedMatch = text.match(/\bOre traded:\s*([\d,]+)/i);

          let shardsFound = null;

          const shardNode = contentArea.querySelector(
              'span[title="shards found today"]'
          );

          if (shardNode) {
              const shardValue = Number.parseInt(
                  String(shardNode.textContent || '').replace(/,/g, ''),
                  10
              );
              if (Number.isFinite(shardValue)) shardsFound = shardValue;
          }

          if (!Number.isFinite(shardsFound)) {
              const shardMatch = text.match(
                  /\bOre found:\s*[\d,]+\s*\[\s*([\d,]+)\s*\]/i
              );
              if (shardMatch) {
                  const shardValue = Number.parseInt(
                      shardMatch[1].replace(/,/g, ''),
                      10
                  );
                  if (Number.isFinite(shardValue)) shardsFound = shardValue;
              }
          }

          let miningGainDaily = null;

          if (isBlastPage) {
              const miningMatch = text.match(
                  /\bMine stat:\s*([0-9]+(?:\.[0-9]+)?)/i
              );

              if (miningMatch) {
                  const value = Number.parseFloat(miningMatch[1]);
                  if (Number.isFinite(value)) miningGainDaily = value;
              }
          }

          return {
              tUsed: tMatch
                  ? Number.parseInt(tMatch[1].replace(/,/g, ''), 10)
                  : null,
              oreFound: oreFoundMatch
                  ? Number.parseInt(oreFoundMatch[1].replace(/,/g, ''), 10)
                  : null,
              shardsFound,
              oresTraded: tradedMatch
                  ? Number.parseInt(tradedMatch[1].replace(/,/g, ''), 10)
                  : null,
              miningGainDaily
          };
      }

      function canonicalYieldName(raw) {
          const text = normalizeSpace(raw)
              .replace(/\bOres\b/i, 'Ore')
              .replace(/\bShards\b/i, 'Shard');

          return YIELD_ORDER.find(name => name.toLowerCase() === text.toLowerCase()) || null;
      }

      function buildNativeYieldImageCache() {
          const cache = Object.create(null);

          // Prefer HoboWars/Helper's canonical ore-image registry when exposed.
          const registry =
              (typeof window.OresData === 'object' && window.OresData) ||
              null;

          if (registry) {
              for (const name of YIELD_ORDER) {
                  const src = registry[name];
                  if (typeof src === 'string' && src) {
                      cache[name] = src;
                  }
              }
          }

          // One DOM scan, once per page load. Never scan the entire Content Area
          // again while constructing historical day cards.
          for (const img of contentArea.querySelectorAll('img')) {
              const title = normalizeSpace(img.getAttribute('title') || '');
              const alt = normalizeSpace(img.getAttribute('alt') || '');

              for (const name of YIELD_ORDER) {
                  if (cache[name]) continue;

                  if (
                      title.toLowerCase() === name.toLowerCase() ||
                      alt.toLowerCase() === name.toLowerCase()
                  ) {
                      cache[name] = img.currentSrc || img.src || '';
                  }
              }
          }

          return cache;
      }

      function findYieldImageSrc(name, html = '') {
          if (nativeYieldImageCache && nativeYieldImageCache[name]) {
              return nativeYieldImageCache[name];
          }

          // Current-result fallback only; never perform another DOM-wide image
          // search. This is retained for a native result whose image identity
          // exists only in the result HTML.
          if (html) {
              const escaped = escapeRegExp(name);
              const m = String(html).match(
                  new RegExp(
                      `<img[^>]+(?:title|alt)=["']${escaped}["'][^>]*src=["']([^"']+)["']`,
                      'i'
                  )
              );

              if (m && m[1]) {
                  nativeYieldImageCache[name] = m[1];
                  return m[1];
              }
          }

          return '';
      }

      function render() {
          document.getElementById('hw-mining-log-test')?.remove();

          const settings = loadSettings();
          const log = loadLog();

          const panel = create('section', 'hw-mining-log-test');
          panel.id = 'hw-mining-log-test';

          assign(panel, {
              maxWidth: 'calc(100% - 20px)',
              boxSizing: 'border-box',
              padding: '0',
              margin: '0',
              position: 'absolute',
              maxHeight: '350px',
              borderRadius: '2px',
              top: 'calc(100% - 360px)',
              boxShadow: '1px 1px 0.5px 2px #444a',
              background: '#d4d4d4',
              border: '2px solid rgb(2, 2, 2)',
              overflowY: 'auto',
              overflowX: 'hidden'
          });

          const header = create('header', 'hw-mining-log-header');
          assign(header, {
              position: 'sticky',
              top: '0',
              zIndex: '10',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '22px',
              boxSizing: 'border-box',
              padding: '2px 5px',
              backgroundColor: '#d4d4d4',
              borderBottom: '1px solid #999'
          });

          const title = create('strong', 'hw-mining-log-title', 'Mining Log');
          title.style.flex = '1 1 auto';
          title.style.textAlign = 'center';

          const settingsButton = create('button', 'hw-mining-log-settings-button');
          settingsButton.type = 'button';
          settingsButton.title = 'Mining Log display settings';
          assign(settingsButton, {
              flex: '0 0 auto',
              width: '18px',
              height: '18px',
              padding: '0',
              border: '1px solid #777',
              borderRadius: '2px',
              background: '#eee',
              cursor: 'pointer',
              lineHeight: '16px'
          });
          const settingsIcon = create('span', 'hw-mining-log-settings-icon', '⚙');
          assign(settingsIcon, {
              display: 'inline-block',
              transform: 'scale(1.35)',
              transformOrigin: 'center'
          });
          settingsButton.replaceChildren(settingsIcon);

          settingsButton.addEventListener('click', openSettings);

          header.append(title, settingsButton);

          const days = create('div', 'hw-mining-log-days');

          const dates = Object.keys(log)
              .filter(date => dayHasContent(normalizeDay(log[date])))
              .sort((a, b) => String(b).localeCompare(String(a)));

          if (!dates.length) {
              const empty = create('div', 'hw-mining-log-empty', 'No mining history recorded yet.');
              assign(empty, {
                  padding: '12px',
                  textAlign: 'center',
                  color: '#666'
              });
              days.append(empty);
          } else {
              const RENDER_CHUNK = 6;
              let renderedCount = 0;

              const appendChunk = () => {
                  const fragment = document.createDocumentFragment();
                  const limit = Math.min(dates.length, renderedCount + RENDER_CHUNK);

                  while (renderedCount < limit) {
                      const date = dates[renderedCount++];
                      fragment.append(
                          buildDay(date, normalizeDay(log[date]), settings)
                      );
                  }

                  days.append(fragment);
              };

              appendChunk();

              panel.addEventListener('scroll', () => {
                  if (renderedCount >= dates.length) return;

                  const remaining =
                      panel.scrollHeight - panel.scrollTop - panel.clientHeight;

                  if (remaining <= 160) {
                      appendChunk();
                  }
              }, { passive: true });
          }

          panel.append(header, days);
          contentArea.append(panel);
      }

      function buildDay(date, day, settings) {
          const card = create('article', 'hw-mining-log-day');
          assign(card, {
              marginBottom: '10px',
              border: '1px solid #999',
              background: '#fff',
              padding: '8px',
              boxSizing: 'border-box'
          });

          const dayHeader = create('div', 'hw-mining-log-day-header');
          assign(dayHeader, {
              fontWeight: 'bold',
              background: '#f0f0f0',
              padding: '4px',
              margin: '-8px -8px 8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
          });

          const dateLabel = create('span', 'hw-mining-log-day-date', date);

          const clear = create('button', 'hw-mining-log-day-clear', 'Clear');
          clear.type = 'button';
          assign(clear, {
              color: '#d9534f',
              fontSize: '11px',
              fontWeight: 'normal',
              padding: '2px 6px',
              border: '1px solid #d9534f',
              borderRadius: '3px',
              background: '#fff',
              cursor: 'pointer'
          });

          clear.addEventListener('click', () => {
              if (!confirm(`Are you sure you want to clear the mining log for ${date}?`)) return;
              const log = loadLog();
              delete log[date];
              saveLog(log);
              render();
          });

          dayHeader.append(dateLabel, clear);

          const metrics = buildMetrics(day, settings);
          const yields = buildYieldCards(day);
          const events = buildEvents(day);

          card.append(dayHeader);
          if (metrics.childElementCount) card.append(metrics);
          card.append(yields);
          if (events.childElementCount) card.append(events);

          return card;
      }

      function buildMetrics(day, settings) {
          const wrap = create('div', 'hw-mining-log-metrics');
          assign(wrap, {
              display: 'flex',
              flexWrap: 'nowrap',
              justifyContent: 'space-evenly',
              alignItems: 'flex-start',
              width: '100%',
              gap: '6px 0',
              fontSize: '12px',
              marginBottom: '5px'
          });

          const actualQty = calcActualQty(day);
          const impliedQty = calcImpliedQty(day);

          const pairs = [
              {
                  pair: 1,
                  items: [
                      settings.showOreFound
                          ? metricDescriptor(
                              'Found',
                              formatInt(actualQty),
                              buildEfficiency(actualQty, day.tUsed, settings),
                              'hw-mining-log-metric-ore-found',
                              'Ore found today'
                          )
                          : null,
                      settings.showImpliedOre
                          ? metricDescriptor(
                              'Implied',
                              formatInt(impliedQty),
                              buildEfficiency(impliedQty, day.tUsed, settings),
                              'hw-mining-log-metric-implied-ore',
                              'Shards count as 3 ore'
                          )
                          : null
                  ].filter(Boolean)
              },
              {
                  pair: 2,
                  items: [
                      settings.showTradesToday
                          ? metricDescriptor('Trades', formatInt(day.oresTraded), '', 'hw-mining-log-metric-trades-today', 'Stat trades today')
                          : null,
                      settings.showBlackOreTrades
                          ? metricDescriptor('Life Trades', formatInt(day.blackOreTrades), '', 'hw-mining-log-metric-black-trades', 'Black ore trades today')
                          : null
                  ].filter(Boolean)
              },
              {
                  pair: 3,
                  items: [
                      settings.showAwakeUsed
                          ? metricDescriptor('Awake', `${formatInt(day.tUsed)}T`, '', 'hw-mining-log-metric-awake-used', 'Amount of Awake spent mining today')
                          : null,
                      settings.showNetStatGain
                          ? metricDescriptor(
                              'Net Gain',
                              Number.isFinite(day.tradeStatGain)
                                  ? formatFractionValue(day.tradeStatGain, settings)
                                  : '--.-----',
                              '',
                              'hw-mining-log-metric-net-stat',
                              'Net stat gain from the current 10-trade band'
                          )
                          : null
                  ].filter(Boolean)
              },
              {
                  pair: 4,
                  items: [
                      settings.showMiningGain
                          ? metricDescriptor('Mining', formatFractionValue(day.miningGain, settings), '', 'hw-mining-log-metric-mining-gain', 'Mining stat gained today')
                          : null,
                      settings.showMiningGainPerT
                          ? metricDescriptor(
                              'Mine Stat/T',
                              day.tUsed > 0 ? formatFractionValue(day.miningGain / day.tUsed, settings, true) : '---',
                              '',
                              'hw-mining-log-metric-mining-per-t',
                              'Your Mining stat gain per Awake used'
                          )
                          : null
                  ].filter(Boolean)
              }
          ];

          const resolvedGroups = resolveMetricGroups(pairs);
          const groupCount = Math.max(1, resolvedGroups.length);
          const groupBasis =
              groupCount >= 4 ? '25%' :
              groupCount === 3 ? '33.3333%' :
              groupCount === 2 ? '50%' :
              '100%';

          for (const groupItems of resolvedGroups) {
              const group = create('div', 'hw-mining-log-metric-group');
              assign(group, {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  flex: `0 1 ${groupBasis}`,
                  width: groupBasis,
                  maxWidth: groupBasis,
                  minWidth: '0',
                  boxSizing: 'border-box',
                  padding: '0 6px'
              });

              for (const descriptor of groupItems) {
                  group.append(buildMetric(descriptor));
              }

              wrap.append(group);
          }

          return wrap;
      }

      function metricDescriptor(label, value, suffix, className, titleText = '') {
          return { label, value, suffix, className, titleText };
      }

      function resolveMetricGroups(pairs) {
          const groups = [];
          const orphans = [];

          for (const pair of pairs) {
              if (pair.items.length >= 2) {
                  groups.push({
                      order: pair.pair,
                      items: pair.items
                  });
              } else if (pair.items.length === 1) {
                  orphans.push({
                      order: pair.pair,
                      item: pair.items[0]
                  });
              }
          }

          orphans.sort((a, b) => a.order - b.order);

          for (let i = 0; i < orphans.length; i += 2) {
              const first = orphans[i];
              const second = orphans[i + 1];

              groups.push({
                  order: first.order,
                  items: second
                      ? [first.item, second.item]
                      : [first.item]
              });
          }

          groups.sort((a, b) => a.order - b.order);
          return groups.map(group => group.items);
      }

      function buildMetric(descriptor) {
          const item = create('div', `hw-mining-log-metric ${descriptor.className || ''}`.trim());

          assign(item, {
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'flex-start',
              width: '100%',
              minWidth: '0',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              textAlign: 'left'
          });

          const label = create('b', 'hw-mining-log-metric-label', `${descriptor.label}:\u00A0`);
          const value = create('span', 'hw-mining-log-metric-value', descriptor.value);

          if (descriptor.titleText) {
              item.title = descriptor.titleText;
              label.title = descriptor.titleText;
              value.title = descriptor.titleText;
          }

          assign(value, {
              minWidth: '0',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
          });

          item.append(label, value);

          if (descriptor.suffix) {
              const suffix = create('span', 'hw-mining-log-metric-efficiency', ` (${descriptor.suffix})`);
              assign(suffix, {
                  color: 'rgb(95, 95, 95)',
                  fontSize: '0.9em',
                  marginLeft: '2px',
                  minWidth: '0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
              });
              item.append(suffix);
          }

          return item;
      }

      function buildEfficiency(quantity, tUsed, settings) {
          if (!Number.isFinite(Number(quantity)) || !Number.isFinite(Number(tUsed)) || Number(tUsed) <= 0) {
              return '---';
          }

          return `${formatFractionValue(Number(quantity) / Number(tUsed), settings, true)} Ore/T`;
      }

      function buildYieldCards(day) {
          const wrap = create('div', 'hw-mining-log-yields');
          assign(wrap, {
              display: 'flex',
              flexWrap: 'nowrap',
              gap: '8px',
              justifyContent: 'flex-start',
              alignItems: 'stretch'
          });

          for (const name of YIELD_ORDER) {
              const qty = Math.max(0, Number.parseInt(day.ores[name], 10) || 0);
              if (qty <= 0) continue;

              const card = create('div', 'hw-mining-log-yield-card');
              card.dataset.yield = name;

              assign(card, {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '70px',
                  minHeight: '75px',
                  padding: '3px 4px',
                  border: '1px solid #c0c0c0',
                  borderRadius: '4px',
                  color: '#000',
                  position: 'relative',
                  boxSizing: 'border-box',
                  fontFamily: 'Arial, sans-serif',
                  backgroundColor: '#fff'
              });

              const src = day.images[name] || nativeYieldImageCache[name] || '';

              if (src) {
                  const img = create('img', 'hw-mining-log-yield-image');
                  img.src = src;
                  img.alt = name;
                  img.title = name;
                  assign(img, {
                      width: '26px',
                      height: '26px',
                      maxWidth: '26px',
                      maxHeight: '26px',
                      objectFit: 'contain',
                      flex: '0 0 auto'
                  });
                  card.append(img);
              }

              const label = create('span', 'hw-mining-log-yield-label', name);
              label.title = name;
              assign(label, {
                  fontSize: '10px',
                  textAlign: 'center',
                  lineHeight: '1.05',
                  flex: '0 0 auto'
              });

              const count = create('div', 'hw-mining-log-yield-quantity', formatInt(qty));
              assign(count, {
                  textAlign: 'center',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  lineHeight: '1.05',
                  flex: '0 0 auto'
              });

              card.append(label, count);
              wrap.append(card);
          }

          if (!wrap.childElementCount) {
              const none = create('div', 'hw-mining-log-yields-empty', 'No ore finds recorded.');
              assign(none, {
                  fontSize: '11px',
                  color: '#999',
                  padding: '4px'
              });
              wrap.append(none);
          }

          return wrap;
      }

      function buildEvents(day) {
          const wrap = create('div', 'hw-mining-log-events');

          const rescueMap = new Map();

          for (const rescue of day.rescues) {
              const id = String(rescue && rescue.id || '').trim();
              const name = String(rescue && rescue.name || '').trim();
              if (!/^\d+$/.test(id) || !name) continue;

              const existing = rescueMap.get(id);
              if (existing) {
                  existing.count += 1;
              } else {
                  rescueMap.set(id, { id, name, count: 1 });
              }
          }

          if (rescueMap.size) {
              const line = create('div', 'hw-mining-log-rescues');
              assign(line, {
                  marginTop: '8px',
                  paddingTop: '5px',
                  borderTop: '1px solid #f0f0f0',
                  fontSize: '12px'
              });

              line.append(create('b', 'hw-mining-log-event-label', 'Hobos Rescued: '));

              let index = 0;
              for (const rescue of rescueMap.values()) {
                  if (index++) line.append(document.createTextNode(', '));

                  const link = create('a', 'hw-mining-log-rescue-link', rescue.name);
                  link.href = buildPlayerHref(rescue.id);
                  link.classList.add('black_dark_link');
                  link.style.textDecoration = 'underline';
                  line.append(link);

                  if (rescue.count > 1) {
                      line.append(document.createTextNode(` ×${rescue.count}`));
                  }
              }

              wrap.append(line);
          }

          if (day.destroyed.length) {
              const line = create('div', 'hw-mining-log-destroyed');
              assign(line, {
                  marginTop: rescueMap.size ? '3px' : '8px',
                  paddingTop: rescueMap.size ? '0' : '5px',
                  borderTop: rescueMap.size ? '0' : '1px solid #f0f0f0',
                  fontSize: '12px'
              });

              line.append(
                  create('b', 'hw-mining-log-event-label', 'Equipment Destroyed: '),
                  document.createTextNode(day.destroyed.join(', '))
              );

              wrap.append(line);
          }

          return wrap;
      }

      function openSettings() {
          document.getElementById('hw-mining-log-settings-overlay')?.remove();

          const overlay = create('div', 'hw-mining-log-settings-overlay');
          overlay.id = 'hw-mining-log-settings-overlay';
          assign(overlay, {
              position: 'fixed',
              inset: '0',
              zIndex: '2147483646',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,.45)'
          });

          const dialog = create('div', 'hw-mining-log-settings-dialog');
          assign(dialog, {
              width: 'min(420px, calc(100vw - 30px))',
              boxSizing: 'border-box',
              padding: '10px',
              border: '1px solid #666',
              borderRadius: '4px',
              background: '#efefef',
              color: '#111',
              boxShadow: '0 3px 16px rgba(0,0,0,.5)',
              fontFamily: 'Arial, sans-serif',
              fontSize: '12px'
          });

          const head = create('div', 'hw-mining-log-settings-header');
          assign(head, {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              fontWeight: 'bold'
          });

          const settingsTitle = create('span', 'hw-mining-log-settings-title', 'Log Settings');
          settingsTitle.title = 'Changes apply on the next page load.';
          head.append(settingsTitle);

          const close = create('button', 'hw-mining-log-settings-close', 'X');
          close.type = 'button';
          close.style.backgroundImage = 'radial-gradient(#a33b)';
          close.addEventListener('click', () => overlay.remove());
          head.append(close);

          const body = create('div', 'hw-mining-log-settings-body');
          assign(body, {
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '5px'
          });

          const labels = [
              ['showOreFound', 'Found', 'Ore found today'],
              ['showImpliedOre', 'Implied', 'Shards count as 3 ore'],
              ['showTradesToday', 'Trades', 'Stat trades today'],
              ['showBlackOreTrades', 'Life Trades', 'Black ore trades today'],
              ['showMiningGain', 'Mining', 'Mining stat gained today'],
              ['showMiningGainPerT', 'Mine Stat/T', 'Your Mining stat gain per Awake used'],
              ['showAwakeUsed', 'Awake', 'Amount of Awake spent mining today'],
              ['showNetStatGain', 'Net Gain', 'Net stat gain from the current 10-trade band']
          ];

          const settings = loadSettings();

          for (const [key, labelText, titleText] of labels) {
              const label = create('label', 'hw-mining-log-settings-option');
              assign(label, {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
              });
              label.title = titleText;

              const input = document.createElement('input');
              input.type = 'checkbox';
              input.checked = !!settings[key];
              input.title = titleText;

              input.addEventListener('change', () => {
                  const next = loadSettings();
                  next[key] = input.checked;
                  saveSettings(next);
              });

              label.append(input, document.createTextNode(labelText));
              body.append(label);
          }

          const fractionBlock = create('div', 'hw-mining-log-settings-fraction-block');
          assign(fractionBlock, {
              marginTop: '4px'
          });

          const fractionLabel = create('div', 'hw-mining-log-settings-fraction-label', 'Fraction Length:');
          assign(fractionLabel, {
              marginBottom: '3px'
          });

          const fractionChoices = create('div', 'hw-mining-log-settings-fraction-choices');
          assign(fractionChoices, {
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px 10px',
              paddingLeft: '18px'
          });

          for (const [value, labelText] of [
              ['auto', 'Auto'],
              ['1', '1'],
              ['2', '2'],
              ['3', '3'],
              ['4', '4'],
              ['5', '5']
          ]) {
              const choiceLabel = create('label', 'hw-mining-log-settings-fraction-choice');
              assign(choiceLabel, {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  cursor: 'pointer'
              });

              const radio = document.createElement('input');
              radio.type = 'radio';
              radio.name = 'hw-mining-log-fraction-length';
              radio.value = value;
              radio.checked = String(settings.fractionLength || 'auto') === value;

              radio.addEventListener('change', () => {
                  if (!radio.checked) return;
                  const next = loadSettings();
                  next.fractionLength = value;
                  saveSettings(next);
              });

              choiceLabel.append(document.createTextNode(labelText), radio);
              fractionChoices.append(choiceLabel);
          }

          fractionBlock.append(fractionLabel, fractionChoices);
          body.append(fractionBlock);

          dialog.append(head, body);
          overlay.append(dialog);
          document.body.append(overlay);

          overlay.addEventListener('click', event => {
              if (event.target === overlay) overlay.remove();
          });
      }

      function removeHelperMiningLog() {
          const headings = Array.from(contentArea.querySelectorAll('h3'));

          for (const heading of headings) {
              if (normalizeSpace(heading.textContent) !== 'Mining Log') continue;

              const parent = heading.parentElement;
              if (!parent) continue;

              const style = String(parent.getAttribute('style') || '');

              if (
                  /max-width:\s*800px/i.test(style) &&
                  /overflow-y:\s*auto/i.test(style)
              ) {
                  parent.remove();
              }
          }
      }

      function dayHasContent(day) {
          return (
              calcActualQty(day) > 0 ||
              Number.isFinite(day.oreFound) ||
              day.rescues.length > 0 ||
              day.destroyed.length > 0 ||
              day.miningGain > 0 ||
              day.tUsed > 0 ||
              day.oresTraded > 0 ||
              day.blackOreTrades > 0
          );
      }

      function calcActualQty(day) {
          if (Number.isFinite(day && day.oreFound)) {
              return day.oreFound;
          }

          // Historical/imported fallback when no native cumulative counter has
          // yet been observed for that day.
          return YIELD_ORDER.reduce(
              (sum, name) => sum + Math.max(0, Number.parseInt(day.ores[name], 10) || 0),
              0
          );
      }

      function calcImpliedQty(day) {
          const actual = calcActualQty(day);

          if (Number.isFinite(day && day.shardsFound)) {
              // Native Ore Found already counts each shard as one find.
              // Implied quantity values each Hobalt Shard as three ore, so add
              // two additional ore-equivalents per authoritative shard.
              return actual + (day.shardsFound * 2);
          }

          // Historical/imported fallback based on observed composition.
          const observedShards = Math.max(
              0,
              Number.parseInt(day && day.ores && day.ores['Hobalt Shard'], 10) || 0
          );

          return actual + (observedShards * 2);
      }

      function getHoboDateKey() {
          const clock = document.getElementById('clock');
          const parentText = normalizeSpace(clock && clock.parentElement
              ? clock.parentElement.textContent
              : '');

          const dateMatch = parentText.match(
              /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
          );

          if (!dateMatch) return null;

          const monthIndex = [
              'jan','feb','mar','apr','may','jun',
              'jul','aug','sep','oct','nov','dec'
          ].indexOf(dateMatch[1].slice(0, 3).toLowerCase());

          if (monthIndex < 0) return null;

          const year = new Date().getFullYear();
          const month = String(monthIndex + 1).padStart(2, '0');
          const day = String(Number.parseInt(dateMatch[2], 10)).padStart(2, '0');

          return `${year}-${month}-${day}`;
      }

      function makeFingerprint(date, counters, result) {
          return [
              date,
              Number.isFinite(counters.tUsed) ? counters.tUsed : '',
              Number.isFinite(counters.oresTraded) ? counters.oresTraded : '',
              result.ores.map(o => `${o.name}:${o.count}`).join(','),
              result.rescues.map(r => `${r.id}:${r.name}`).join(','),
              result.destroyed.join(','),
              Number.isFinite(result.miningGain) ? result.miningGain : ''
          ].join('|');
      }

      function buildPlayerHref(id) {
          const sr = new URLSearchParams(location.search).get('sr');
          const prefix = sr && /^\d{1,3}$/.test(sr)
              ? `/game/game.php?sr=${encodeURIComponent(sr)}`
              : '/game/game.php?';

          return sr && /^\d{1,3}$/.test(sr)
              ? `${prefix}&cmd=player&ID=${encodeURIComponent(id)}`
              : `${prefix}cmd=player&ID=${encodeURIComponent(id)}`;
      }

      function decodeEntities(value) {
          const textarea = document.createElement('textarea');
          textarea.innerHTML = String(value || '');
          return textarea.value;
      }

      function normalizeSpace(value) {
          return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function escapeRegExp(value) {
          return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      function finiteOrZero(value) {
          const n = Number(value);
          return Number.isFinite(n) ? n : 0;
      }

      function finiteOrNull(value) {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
      }

      function formatInt(value) {
          return Math.round(Number(value) || 0).toLocaleString();
      }

      function formatFractionValue(value, settings, calculated = false) {
          const n = Number(value);
          if (!Number.isFinite(n)) return '---';

          const mode = String(settings && settings.fractionLength || 'auto');

          if (/^[1-5]$/.test(mode)) {
              return n.toFixed(Number(mode));
          }

          const presentationValue = calculated
              ? roundFraction(n, 6)
              : n;

          return stripTrailingZeros(String(presentationValue));
      }

      function roundFraction(value, places) {
          const factor = 10 ** places;
          return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
      }

      function stripTrailingZeros(value) {
          const raw = String(value);
          if (!raw.includes('.')) return raw;

          return raw
              .replace(/(\.\d*?[1-9])0+$/, '$1')
              .replace(/\.0+$/, '');
      }

      function create(tag, className, text) {
          const node = document.createElement(tag);
          if (className) node.className = className;
          if (text !== undefined) node.textContent = text;
          return node;
      }

      function assign(node, styles) {
          Object.assign(node.style, styles);
          return node;
      }
  })();

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hw7RunDocumentEndModules, { once: true });
} else {
  hw7RunDocumentEndModules();
}