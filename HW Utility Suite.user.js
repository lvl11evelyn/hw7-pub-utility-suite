// ==UserScript==
// @name         HW Utility Suite
// @namespace    https://www.hobowars.com/
// @version      4.33
// @description  Configurable HW1 Utility Suite: 14 independently toggleable modules for fighting, tracking, navigation, UI, and quality-of-life improvements.
// @author       lvl11evelyn HW1(2924238)
// @homepageURL  https://github.com/lvl11evelyn/hw7-pub-utility-suite
// @supportURL   https://github.com/lvl11evelyn/hw7-pub-utility-suite/issues
// @updateURL    https://github.com/lvl11evelyn/hw7-pub-utility-suite/raw/refs/heads/main/HW%20Utility%20Suite.user.js
// @downloadURL  https://github.com/lvl11evelyn/hw7-pub-utility-suite/raw/refs/heads/main/HW%20Utility%20Suite.user.js
// @match        *://hobowars.com/game/game.php*
// @match        *://www.hobowars.com/game/game.php*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// ==/UserScript==

function HWUS_officialBuild() {
// ============================================================================
// SUITE SETTINGS INFRASTRUCTURE
// Public-build module controls and current-player identity cache.
// ============================================================================
const HWUS_SETTINGS_KEY = 'hwUtilitySuite.moduleStates.v1';
const HWUS_PLAYER_ID_KEY = 'hwUtilitySuite.currentPlayerId.v1';
const HWUS_CONTENT_AREA_KEY = 'hwUtilitySuite.contentArea.v1';

const HWUS_CONTENT_AREA_DEFAULTS = Object.freeze({
    enabled: false,
    width: 660

});

const HWUS_MODULES = Object.freeze([
    [1, 'UFC Penalty Info Toggle'],
    [2, 'Feed the Seal'],
    [3, 'Collapsible Thread Replies'],
    [4, 'Player Stats Tracker'],
    [5, 'Cart Racing'],
    [6, 'Wellness Aid'],
    [7, 'Equipment Redux'],
    [8, 'Personal Hitlist Keybinds'],
    [9, 'Awake & BAC Bar Painter'],
    [10, 'Dynamic Game Clock'],
    [11, 'Recycling Bin Quick-Add'],
    [12, 'Fight Skill Recap'],
    [13, 'Fight Record Tracker'],
    [14, 'Top Bar Swim Times']
]);

function HWUS_loadModuleStates() {
    try {
        const raw = GM_getValue(HWUS_SETTINGS_KEY, '{}');
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function HWUS_saveModuleStates(states) {
    GM_setValue(HWUS_SETTINGS_KEY, JSON.stringify(states || {}));
}

function HWUS_isModuleEnabled(moduleId) {
    const states = HWUS_loadModuleStates();
    const key = String(moduleId);
    return !Object.prototype.hasOwnProperty.call(states, key) || states[key] !== false;
}

function HWUS_setModuleEnabled(moduleId, enabled) {
    const states = HWUS_loadModuleStates();
    states[String(moduleId)] = !!enabled;
    HWUS_saveModuleStates(states);
}

function HWUS_normalizeContentAreaSettings(value) {
    const source = value && typeof value === 'object' ? value : {};

    const numeric = Math.round(Number(source.width));

    const width = Number.isFinite(numeric)
        ? Math.min(1200, Math.max(400, numeric))
        : HWUS_CONTENT_AREA_DEFAULTS.width;

    return {
        enabled: source.enabled === true,
        width
    };
}

function HWUS_loadContentAreaSettings() {
    try {
        const raw = GM_getValue(HWUS_CONTENT_AREA_KEY, '{}');
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return HWUS_normalizeContentAreaSettings(parsed);
    } catch {
        return { ...HWUS_CONTENT_AREA_DEFAULTS };
    }
}

function HWUS_saveContentAreaSettings(settings) {
    const normalized = HWUS_normalizeContentAreaSettings(settings);
    GM_setValue(HWUS_CONTENT_AREA_KEY, JSON.stringify(normalized));
    return normalized;
}

function HWUS_applyContentAreaSettings() {
    document.getElementById('hwus-content-area-layout')?.remove();

    const settings = HWUS_loadContentAreaSettings();
    const effectiveWidth = settings.enabled
        ? settings.width
        : HWUS_CONTENT_AREA_DEFAULTS.width;

    const style = document.createElement('style');
    style.id = 'hwus-content-area-layout';

    const contentAreaRule = settings.enabled
        ? `
        .content-area {
            margin: 0 auto 0 15px !important;
            min-width: ${effectiveWidth}px !important;
            max-width: ${effectiveWidth}px !important;
        }`
        : '';

    style.textContent = `
        :root {
            --hwus-content-width: ${effectiveWidth}px;
        }

        /*
         * MTT fixed placement shares the Utility Suite's authoritative
         * content-width setting instead of retaining geometry measured before
         * the content-area rule is applied.
         *
         * 15px left gutter + 200px native left panel + content width
         * + 15px mirrored right gutter = content width + 230px.
         */
        #mtt-panel {
            left: calc(var(--hwus-content-width, 660px) + 230px) !important;
        }

        ${contentAreaRule}
    `;

    document.head.appendChild(style);
}

HWUS_applyContentAreaSettings();

function HWUS_extractPlayerId(anchor) {
    if (!anchor) return null;
    const href = anchor.getAttribute('href') || '';
    return href.match(/[?&]ID=(\d+)/i)?.[1] || null;
}

function HWUS_cacheCurrentPlayerId(id) {
    if (!/^\d+$/.test(String(id || ''))) return null;
    const value = String(id);
    GM_setValue(HWUS_PLAYER_ID_KEY, value);
    return value;
}

function HWUS_getCurrentPlayerId() {
    // The Future layout: the logged-in player's profile link is always exposed
    // in the left-panel pname block. Treat this native selector as authoritative.
    const selfLink = document.querySelector(
        '.left-panel .pname a[href*="cmd=player"][href*="ID="]'
    );
    const selfId = HWUS_extractPlayerId(selfLink);
    if (selfId) return HWUS_cacheCurrentPlayerId(selfId);

    // Cache is only a fallback for abnormal/partial page states where the
    // native left panel is temporarily unavailable.
    const cached = String(GM_getValue(HWUS_PLAYER_ID_KEY, '') || '');
    return /^\d+$/.test(cached) ? cached : null;
}

(function renderHWUSPreferences() {
    'use strict';

    const url = new URL(location.href);
    if (!url.pathname.endsWith('/game/game.php')) return;
    if (url.searchParams.get('cmd') !== 'preferences') return;

    const allowedKeys = new Set(['sr', 'cmd']);
    if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key))) return;

    const content = document.querySelector('.content-area');
    if (!content || document.getElementById('hwus-preferences-panel')) return;

    const style = document.createElement('style');
    style.id = 'hwus-preferences-styles';
    style.textContent = `
        #hwus-preferences-panel {
            float: right;
            width: min(440px, 48%);
            margin: 0 0 18px 12px;
            padding: 10px 12px 12px;
            box-sizing: border-box;
            border: 1px solid #c7c7c7;
            border-radius: 5px;
            background: #f3f3f3;
            color: #111;
            font-family: Arial, sans-serif;
            font-size: 13px;
        }
        #hwus-preferences-panel .hwus-title-row {
            display: flex;
            align-items: baseline;
            gap: 3px;
            width: fit-content;
            max-width: 100%;
            margin: 0 auto 3px;
        }
        #hwus-preferences-panel .hwus-title-side,
        #hwus-preferences-panel .hwus-version {
            flex: 0 1 20%;
            min-width: 0;
        }
        #hwus-preferences-panel .hwus-title-side {
            visibility: hidden;
        }
        #hwus-preferences-panel .hwus-title {
            flex: 1 0 auto;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            letter-spacing: .5px;
        }
        #hwus-preferences-panel .hwus-version {
            color: #888;
            font-size: 10px;
            font-weight: normal;
            letter-spacing: 0;
            text-align: left;
            white-space: nowrap;
        }
        #hwus-preferences-panel .hwus-subtitle {
            margin-bottom: 9px;
            text-align: center;
            color: #666;
            font-size: 11px;
        }
        #hwus-preferences-panel .hwus-module-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 5px 12px;
        }
        #hwus-preferences-panel.hwus-single-column .hwus-module-grid {
            grid-template-columns: 1fr;
        }
        #hwus-preferences-panel .hwus-module-option {
            display: flex;
            align-items: center;
            gap: 4px;
            min-width: 0;
            overflow: visible;
            padding: 2px 4px;
            border-radius: 3px;
            white-space: nowrap;
            line-height: 1;
        }
        #hwus-preferences-panel .hwus-module-option:hover {
            background: #e7e7e7;
        }
        #hwus-preferences-panel .hwus-module-option input[type="checkbox"] {
            appearance: auto;
            width: 10px;
            height: 10px;
            min-width: 10px;
            margin: 0;
            flex: 0 0 10px;
        }
        #hwus-preferences-panel .hwus-module-number {
            flex: 0 0 auto;
            font-size: 10px;
            line-height: 1;
            color: #555;
        }
        #hwus-preferences-panel .hwus-module-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px;
            line-height: normal;
        }
        #hwus-preferences-clear {
            clear: both;
            height: 0;
            margin: 0;
            padding: 0;
            border: 0;
        }
        #hwus-preferences-panel .hwus-actions {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-top: 10px;
            padding-top: 9px;
            border-top: 1px solid #ccc;
        }
        #hwus-preferences-panel .hwus-actions button {
            min-width: 95px;
            cursor: pointer;
        }
        #hwus-preferences-panel .hwus-content-area-settings {
            margin-top: 9px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            color: #555;
            font-size: 10px;
        }
        #hwus-preferences-panel .hwus-content-area-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        #hwus-preferences-panel .hwus-content-area-toggle input {
            margin: 0;
        }
        #hwus-preferences-panel .hwus-content-area-widths {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            margin-top: 5px;
        }
        #hwus-preferences-panel .hwus-content-area-widths input {
            width: 58px;
            box-sizing: border-box;
            padding: 1px 3px;
            font: inherit;
            text-align: right;
        }
        #hwus-preferences-panel .hwus-content-area-widths.hwus-disabled {
            opacity: .45;
        }
        #hwus-preferences-panel .hwus-content-area-help {
            margin-top: 4px;
            text-align: center;
            color: #888;
            font-size: 10px;
        }
        #hwus-preferences-panel .hwus-note {
            margin-top: 7px;
            text-align: center;
            color: #777;
            font-size: 10px;
        }
        #hwus-preferences-panel.hwus-stacked {
            float: none;
            width: auto;
            margin: 0 0 16px;
        }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = 'hwus-preferences-panel';

    const titleRow = document.createElement('div');
    titleRow.className = 'hwus-title-row';

    const titleSide = document.createElement('div');
    titleSide.className = 'hwus-title-side';
    titleSide.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.className = 'hwus-title';
    title.textContent = 'HW Utility Suite';

    const version = document.createElement('div');
    version.className = 'hwus-version';
    version.textContent = `v${(typeof GM_info === 'object' && GM_info?.script?.version) || '?'}`;

    titleRow.append(titleSide, title, version);

    const subtitle = document.createElement('div');
    subtitle.className = 'hwus-subtitle';
    subtitle.textContent = 'Module Controls';

    const grid = document.createElement('div');
    grid.className = 'hwus-module-grid';

    const checkboxMap = new Map();

    for (const [id, label] of HWUS_MODULES) {
        const option = document.createElement('label');
        option.className = 'hwus-module-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = HWUS_isModuleEnabled(id);
        checkbox.addEventListener('change', () => {
            HWUS_setModuleEnabled(id, checkbox.checked);
        });

        const number = document.createElement('span');
        number.className = 'hwus-module-number';
        number.textContent = `${id}.`;

        const name = document.createElement('span');
        name.className = 'hwus-module-name';
        name.textContent = label;
        name.title = label;

        option.append(checkbox, number, name);
        grid.appendChild(option);
        checkboxMap.set(id, checkbox);
    }

    const actions = document.createElement('div');
    actions.className = 'hwus-actions';

    const enableAll = document.createElement('button');
    enableAll.type = 'button';
    enableAll.textContent = 'Enable All';

    const disableAll = document.createElement('button');
    disableAll.type = 'button';
    disableAll.textContent = 'Disable All';

    function setAll(enabled) {
        for (const [id, checkbox] of checkboxMap) {
            checkbox.checked = enabled;
            HWUS_setModuleEnabled(id, enabled);
        }
    }

    enableAll.addEventListener('click', () => setAll(true));
    disableAll.addEventListener('click', () => setAll(false));
    actions.append(enableAll, disableAll);

    const contentAreaSettings = HWUS_loadContentAreaSettings();

    const contentAreaSection = document.createElement('div');
    contentAreaSection.className = 'hwus-content-area-settings';

    const contentAreaToggle = document.createElement('label');
    contentAreaToggle.className = 'hwus-content-area-toggle';

    const contentAreaCheckbox = document.createElement('input');
    contentAreaCheckbox.type = 'checkbox';
    contentAreaCheckbox.checked = contentAreaSettings.enabled;

    const contentAreaToggleText = document.createElement('span');
    contentAreaToggleText.textContent = 'Custom Content Area Width';

    contentAreaToggle.append(contentAreaCheckbox, contentAreaToggleText);

    const contentAreaWidths = document.createElement('div');
    contentAreaWidths.className = 'hwus-content-area-widths';

    const widthLabel = document.createElement('span');
    widthLabel.textContent = 'Width';

    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.min = '400';
    widthInput.max = '1200';
    widthInput.step = '10';
    widthInput.value = String(contentAreaSettings.width);

    const pxLabel = document.createElement('span');
    pxLabel.textContent = 'px';

    contentAreaWidths.append(
        widthLabel,
        widthInput,
        pxLabel
    );

    const contentAreaHelp = document.createElement('div');
    contentAreaHelp.className = 'hwus-content-area-help';
    contentAreaHelp.style.whiteSpace = 'pre-line';
    contentAreaHelp.textContent = 'Enabling Custom Content Area Width\nrepositions Content Area adjacent to the Left Panel.';

    const syncContentAreaControls = () => {
        const disabled = !contentAreaCheckbox.checked;

        widthInput.disabled = disabled;
        contentAreaWidths.classList.toggle('hwus-disabled', disabled);
    };

    const saveContentAreaControls = () => {
        const saved = HWUS_saveContentAreaSettings({
            enabled: contentAreaCheckbox.checked,
            width: widthInput.value
        });

        widthInput.value = String(saved.width);
        syncContentAreaControls();
    };


    contentAreaCheckbox.addEventListener('change', saveContentAreaControls);
    widthInput.addEventListener('change', saveContentAreaControls);

    syncContentAreaControls();
    contentAreaSection.append(
        contentAreaToggle,
        contentAreaWidths,
        contentAreaHelp
    );

    const note = document.createElement('div');
    note.className = 'hwus-note';
    note.textContent = 'Changes apply on the next page load.';

    panel.append(titleRow, subtitle, grid, actions, contentAreaSection, note);

    // The native top-level Preferences menu is a sequence of links and <br>
    // nodes rather than a semantic list. Prepend the panel directly so its
    // float occupies the otherwise-unused right side without depending on
    // other userscripts (such as Hobo Helper) adding their own <ul> elements.
    content.insertBefore(panel, content.firstChild);

    // End the native Preferences section with a clear so later injected UI
    // cannot wrap up underneath the floated Utility Suite panel. The native
    // Preferences links themselves remain free to occupy the space to its left.
    const nativeExitLink = [...content.querySelectorAll('a[href]')].find(anchor => {
        const text = (anchor.textContent || '').trim().toLowerCase();
        if (text !== "that's all that needs changing...") return false;

        try {
            const href = new URL(anchor.href, location.href);
            return href.searchParams.get('cmd') === 'city';
        } catch {
            return false;
        }
    });

    if (nativeExitLink) {
        const clear = document.createElement('div');
        clear.id = 'hwus-preferences-clear';

        const exitContainer = nativeExitLink.closest('i') || nativeExitLink;
        exitContainer.insertAdjacentElement('afterend', clear);
    }

    // Preferences geometry follows the actual content container rather than
    // viewport width, because .content-area can be independently customized.
    // Module columns remain governed by the panel's own rendered width.
    const syncPreferencesGeometry = () => {
        const contentWidth = content.getBoundingClientRect().width;
        panel.classList.toggle('hwus-stacked', contentWidth < 700);

        const panelWidth = panel.getBoundingClientRect().width;
        panel.classList.toggle('hwus-single-column', panelWidth < 370);
    };

    syncPreferencesGeometry();

    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(syncPreferencesGeometry);
        observer.observe(content);
        observer.observe(panel);
    } else {
        window.addEventListener('resize', syncPreferencesGeometry, { passive: true });
    }
})();

// Prime the player-ID cache anywhere the native chrome exposes a self-profile link.
HWUS_getCurrentPlayerId();

// Keep the native topbar usable at narrow viewport widths. The Future layout's
// top-left logo block duplicates Home navigation and consumes enough horizontal
// space to push the native stat bars off-screen. Remove that block from flow
// only when the stat-bar geometry proves the viewport no longer accommodates it.
(function installHWUSTopbarResponsiveTrim() {
    'use strict';

    const topbar = document.querySelector('.topbar');
    const topLeft = topbar?.querySelector(':scope > .top-left');
    const topCenter = topbar?.querySelector(':scope > .top-center');

    if (!topbar || !topLeft || !topCenter) return;

    const style = document.createElement('style');
    style.id = 'hwus-topbar-responsive-styles';
    style.textContent = `
        .topbar.hwus-hide-top-left > .top-left {
            display: none !important;
        }
    `;
    document.head.appendChild(style);

    let frame = 0;

    const syncTopbarGeometry = () => {
        frame = 0;

        // Measure .top-center with .top-left participating in layout.
        // Removing and restoring the class synchronously keeps the test exact
        // without making the hidden state self-reversing.
        topbar.classList.remove('hwus-hide-top-left');

        const viewportRight = document.documentElement.clientWidth;
        const topCenterOverflow =
            topCenter.getBoundingClientRect().right > viewportRight + 0.5;

        topbar.classList.toggle('hwus-hide-top-left', topCenterOverflow);
    };

    const scheduleTopbarSync = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(syncTopbarGeometry);
    };

    scheduleTopbarSync();
    window.addEventListener('resize', scheduleTopbarSync, { passive: true });

    // Text and injected topbar controls can change the required horizontal
    // footprint without a viewport resize, so re-evaluate those mutations too.
    if (typeof MutationObserver === 'function') {
        const observer = new MutationObserver(scheduleTopbarSync);
        observer.observe(topCenter, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
})();

// ============================================================================
// MODULE 1: UFC PENALTY INFO TOGGLE
// Adds dual-functionality to the UFC penalty info toggle so users may hide it.
// ============================================================================
(function () {
    'use strict';

    if (!HWUS_isModuleEnabled(1)) return;

    const toggle = document.getElementById('show_pwin2');
    const info = document.getElementById('pwin_text');

    if (!toggle || !info) return;

    function syncUfcToggle() {
        const visible = getComputedStyle(info).display !== 'none';
        toggle.style.fontFamily = 'Consolas, monospace';
        toggle.textContent = visible ? '[▲]' : '[?]';
        toggle.setAttribute('aria-expanded', String(visible));
    }

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const visible = getComputedStyle(info).display !== 'none';

        info.style.display = visible
            ? 'none'
            : 'block';

        syncUfcToggle();
    }, true);

    syncUfcToggle();
})();

// ============================================================================
// MODULE 2: HW1 FEED THE SEAL
// Delete a MB Reply, feed the baby elephant seal. Purely for fun!
// ============================================================================
(function () {
    'use strict';

    if (!HWUS_isModuleEnabled(2)) return;

    const MAX_PENDING_AGE = 15_000;
    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pendingDeletes = new Map();

    injectStyles();
    installDeleteCapture();
    installDeletionObserver();

    function installDeleteCapture() {
        document.addEventListener('click', event => {
            const deleteLink = event.target.closest(
                'a[title="Delete"][onclick*="delJ("], a[href*="do=del"][href*="post="]'
            );

            if (!deleteLink) return;

            const row = deleteLink.closest('tr.post-row[id^="tr_post_"]');
            if (!row) return;

            const postId = getPostId(row, deleteLink);
            if (!postId) return;

            const rect = row.getBoundingClientRect();
            const rowClone = row.cloneNode(true);
            freezeRenderedStyles(row, rowClone);

            const sourceTable = row.closest('table');
            const tableClone = sourceTable
            ? sourceTable.cloneNode(false)
            : document.createElement('table');

            if (sourceTable) freezeRenderedStyles(sourceTable, tableClone);
            tableClone.removeAttribute('id');
            tableClone.classList.add('hw-seal-message-table');

            const capture = {
                postId,
                capturedAt: Date.now(),
                rowClone,
                tableClone,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };

            const previous = pendingDeletes.get(postId);
            if (previous?.expiryTimer) clearTimeout(previous.expiryTimer);

            capture.expiryTimer = window.setTimeout(() => {
                pendingDeletes.delete(postId);
            }, MAX_PENDING_AGE);

            pendingDeletes.set(postId, capture);
        }, true);
    }

    function installDeletionObserver() {
        const observer = new MutationObserver(mutations => {
            if (pendingDeletes.size === 0) return;

            const candidateRows = new Set();

            for (const mutation of mutations) {
                const targetRow = mutation.target.nodeType === Node.ELEMENT_NODE
                ? mutation.target.closest?.('tr.post-row[id^="tr_post_"]')
                : mutation.target.parentElement?.closest('tr.post-row[id^="tr_post_"]');

                if (targetRow) candidateRows.add(targetRow);

                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    if (node.matches?.('tr.post-row[id^="tr_post_"]')) {
                        candidateRows.add(node);
                    }

                    node.querySelectorAll?.('tr.post-row[id^="tr_post_"]').forEach(row => {
                        candidateRows.add(row);
                    });
                }
            }

            for (const row of candidateRows) {
                if (!isRemovedPostRow(row)) continue;

                const postId = row.id.replace(/^tr_post_/, '');
                const capture = pendingDeletes.get(postId);
                if (!capture) continue;

                pendingDeletes.delete(postId);
                clearTimeout(capture.expiryTimer);

                if (Date.now() - capture.capturedAt > MAX_PENDING_AGE) continue;

                if (REDUCED_MOTION) {
                    brieflyAcknowledgeDeletion(row);
                } else {
                    animateDeletion(row, capture);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function isRemovedPostRow(row) {
        const cells = row.children;
        if (cells.length !== 1) return false;

        const cell = cells[0];
        return (
            cell.tagName === 'TD' &&
            cell.colSpan === 2 &&
            cell.textContent.trim() === 'The post has been removed'
        );
    }

    function animateDeletion(removedRow, capture) {
        const rect = {
            left: capture.left,
            top: capture.top,
            width: capture.width,
            height: capture.height,
            right: capture.left + capture.width,
            bottom: capture.top + capture.height
        };
        const pageWidth = document.documentElement.clientWidth;
        const pageHeight = document.documentElement.clientHeight;

        const overlay = document.createElement('div');
        overlay.className = 'hw-seal-overlay';

        const messageShell = document.createElement('div');
        messageShell.className = 'hw-seal-message-shell';
        messageShell.style.left = `${Math.max(0, rect.left)}px`;
        messageShell.style.top = `${Math.max(0, rect.top)}px`;
        messageShell.style.width = `${capture.width}px`;
        messageShell.style.height = `${capture.height}px`;

        const table = capture.tableClone;
        table.style.width = `${capture.width}px`;
        table.style.maxWidth = 'none';
        table.style.margin = '0';

        const tbody = document.createElement('tbody');
        tbody.appendChild(capture.rowClone);
        table.appendChild(tbody);
        messageShell.appendChild(table);

        const seal = document.createElement('div');
        seal.className = 'hw-seal-animal';
        seal.innerHTML = buildSealSvg();

        const sealWidth = 290;
        const sealLeft = Math.max(
            pageWidth * 0.55,
            Math.min(pageWidth - sealWidth + 55, rect.right - 70)
        );
        const sealTop = Math.max(
            10,
            Math.min(pageHeight - 210, rect.top + Math.max(rect.height, 70) / 2 - 92)
        );

        seal.style.left = `${sealLeft}px`;
        seal.style.top = `${sealTop}px`;

        overlay.append(messageShell, seal);
        document.body.appendChild(overlay);

        removedRow.style.visibility = 'hidden';

        const mouthX = sealLeft + 35;
        const messageRight = Math.max(0, rect.left) + capture.width;
        const travelX = mouthX - messageRight + 35;
        const targetY = sealTop + 92 - Math.max(0, rect.top) - Math.min(rect.height, 160) / 2;

        requestAnimationFrame(() => {
            seal.classList.add('hw-seal-enter');

            window.setTimeout(() => {
                seal.classList.add('hw-seal-open-mouth');
                messageShell.classList.add('hw-seal-message-ready');
            }, 430);

            window.setTimeout(() => {
                messageShell.style.setProperty('--hw-seal-travel-x', `${travelX}px`);
                messageShell.style.setProperty('--hw-seal-travel-y', `${targetY}px`);
                messageShell.classList.add('hw-seal-message-eaten');
                seal.classList.add('hw-seal-bite');
            }, 720);

            window.setTimeout(() => {
                seal.classList.remove('hw-seal-open-mouth');
                seal.classList.add('hw-seal-gulp');
            }, 1470);

            window.setTimeout(() => {
                seal.classList.add('hw-seal-exit');
            }, 2050);

            window.setTimeout(() => {
                removedRow.style.visibility = '';
                overlay.remove();
            }, 2820);
        });
    }

    function brieflyAcknowledgeDeletion(row) {
        row.classList.add('hw-seal-reduced-motion');
        window.setTimeout(() => row.classList.remove('hw-seal-reduced-motion'), 450);
    }

    function getPostId(row, link) {
        const fromRow = row.id.match(/^tr_post_(\d+)$/)?.[1];
        if (fromRow) return fromRow;

        try {
            return new URL(link.href, location.href).searchParams.get('post');
        } catch {
            return null;
        }
    }

    function freezeRenderedStyles(sourceRoot, cloneRoot) {
        copyComputedStyle(sourceRoot, cloneRoot);

        const sourceElements = sourceRoot.querySelectorAll('*');
        const cloneElements = cloneRoot.querySelectorAll('*');
        const count = Math.min(sourceElements.length, cloneElements.length);

        for (let index = 0; index < count; index += 1) {
            copyComputedStyle(sourceElements[index], cloneElements[index]);
        }
    }

    function copyComputedStyle(source, clone) {
        const computed = getComputedStyle(source);

        for (const property of computed) {
            clone.style.setProperty(
                property,
                computed.getPropertyValue(property),
                computed.getPropertyPriority(property)
            );
        }

        clone.removeAttribute('id');
        clone.querySelectorAll?.('[id]').forEach(element => element.removeAttribute('id'));
    }

    function buildSealSvg() {
        return `
            <svg class="hw-seal-svg" viewBox="0 0 320 210" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                    <radialGradient id="hw-seal-body-gradient" cx="35%" cy="28%" r="72%">
                        <stop offset="0%" stop-color="#8f99a2"/>
                        <stop offset="68%" stop-color="#59636d"/>
                        <stop offset="100%" stop-color="#424b54"/>
                    </radialGradient>
                    <linearGradient id="hw-seal-muzzle-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#c6ccd0"/>
                        <stop offset="100%" stop-color="#9da5ab"/>
                    </linearGradient>
                    <filter id="hw-seal-shadow" x="-30%" y="-30%" width="160%" height="170%">
                        <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#000" flood-opacity="0.34"/>
                    </filter>
                </defs>

                <g class="hw-seal-whole" filter="url(#hw-seal-shadow)">
                    <ellipse class="hw-seal-shadow" cx="177" cy="178" rx="112" ry="18" fill="#000" opacity="0.18"/>

                    <path class="hw-seal-rear-flipper" d="M260 145 C302 135 316 151 290 172 C311 178 306 194 276 184 C257 177 247 165 245 153 Z" fill="#46515a"/>
                    <path class="hw-seal-body" d="M88 72 C137 38 236 53 274 106 C307 152 269 182 198 184 C134 186 77 169 61 128 C52 105 61 88 88 72 Z" fill="url(#hw-seal-body-gradient)"/>
                    <path class="hw-seal-belly" d="M90 127 C137 151 225 160 270 136 C255 174 203 184 150 176 C111 171 79 153 69 132 Z" fill="#a7afb5" opacity="0.28"/>

                    <path class="hw-seal-front-flipper" d="M154 139 C142 170 113 191 94 180 C79 172 101 151 133 130 Z" fill="#4b5660"/>

                    <g class="hw-seal-head">
                        <path d="M55 77 C69 48 105 37 134 51 C157 62 166 88 156 111 C148 130 126 141 97 136 C65 132 43 110 46 91 C47 85 50 81 55 77 Z" fill="#707b84"/>
                        <ellipse cx="91" cy="105" rx="34" ry="27" fill="url(#hw-seal-muzzle-gradient)"/>
                        <ellipse cx="124" cy="105" rx="34" ry="27" fill="url(#hw-seal-muzzle-gradient)"/>

                        <ellipse cx="83" cy="79" rx="7" ry="8" fill="#11161a"/>
                        <ellipse cx="126" cy="79" rx="7" ry="8" fill="#11161a"/>
                        <circle cx="81" cy="76" r="2" fill="#fff"/>
                        <circle cx="124" cy="76" r="2" fill="#fff"/>

                        <path d="M96 96 Q107 87 118 96 Q108 108 96 96 Z" fill="#272c31"/>

                        <g class="hw-seal-jaw">
                            <path d="M89 107 Q107 129 127 107 Q124 143 107 149 Q90 143 89 107 Z" fill="#252b30"/>
                            <path d="M96 128 Q107 137 119 128 Q116 143 107 145 Q98 143 96 128 Z" fill="#ba6b72"/>
                            <path d="M91 109 L98 116 L103 109 M113 109 L118 116 L124 109" fill="#f3eee5"/>
                        </g>

                        <g class="hw-seal-whiskers" fill="none" stroke="#d5d9dc" stroke-width="2" stroke-linecap="round" opacity="0.9">
                            <path d="M88 106 L34 94 M88 112 L29 111 M90 118 L39 132"/>
                            <path d="M127 106 L179 91 M127 112 L184 108 M125 118 L176 133"/>
                        </g>
                    </g>
                </g>
            </svg>`;
    }

    function injectStyles() {
        if (document.getElementById('hw-seal-post-eater-styles')) return;

        const style = document.createElement('style');
        style.id = 'hw-seal-post-eater-styles';
        style.textContent = `
            .hw-seal-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483646;
                overflow: hidden;
                pointer-events: none;
            }

            .hw-seal-message-shell {
                --hw-seal-travel-x: 0px;
                --hw-seal-travel-y: 0px;
                position: absolute;
                z-index: 2;
                max-height: 70vh;
                overflow: hidden;
                opacity: 1;
                transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
                transform-origin: right center;
                filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.26));
            }

            .hw-seal-message-table {
                display: table;
                max-width: none;
                margin: 0;
            }

            .hw-seal-message-table > tbody > tr {
                display: table-row;
            }

            .hw-seal-message-ready {
                animation: hw-seal-message-tremble 180ms ease-in-out 2;
            }

            .hw-seal-message-eaten {
                animation: hw-seal-message-eaten 780ms cubic-bezier(0.55, 0.02, 0.82, 0.48) forwards;
            }

            .hw-seal-animal {
                position: absolute;
                z-index: 3;
                width: 290px;
                height: 190px;
                opacity: 0;
                transform: translate3d(250px, 14px, 0) rotate(4deg);
            }

            .hw-seal-svg {
                display: block;
                width: 100%;
                height: 100%;
                overflow: visible;
            }

            .hw-seal-jaw {
                transform-box: fill-box;
                transform-origin: 50% 0%;
                transform: scaleY(0.18);
                transition: transform 150ms ease-out;
            }

            .hw-seal-enter {
                animation: hw-seal-enter 520ms cubic-bezier(0.18, 0.72, 0.25, 1) forwards;
            }

            .hw-seal-open-mouth .hw-seal-jaw {
                transform: scaleY(1.35);
            }

            .hw-seal-bite .hw-seal-head {
                animation: hw-seal-bite 520ms ease-in-out;
            }

            .hw-seal-bite .hw-seal-front-flipper {
                animation: hw-seal-flipper 520ms ease-in-out;
            }

            .hw-seal-gulp .hw-seal-body {
                animation: hw-seal-gulp 480ms ease-in-out;
            }

            .hw-seal-gulp .hw-seal-whole {
                animation: hw-seal-satisfied-bob 560ms ease-in-out;
            }

            .hw-seal-exit {
                animation: hw-seal-exit 720ms cubic-bezier(0.52, 0, 0.82, 0.38) forwards;
            }

            .hw-seal-reduced-motion {
                animation: hw-seal-reduced-flash 420ms ease-out;
            }

            @keyframes hw-seal-enter {
                0%   { opacity: 0; transform: translate3d(250px, 14px, 0) rotate(4deg); }
                60%  { opacity: 1; transform: translate3d(-13px, -3px, 0) rotate(-1deg); }
                100% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
            }

            @keyframes hw-seal-message-tremble {
                0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
                50%      { transform: translate3d(-3px, 0, 0) rotate(-0.2deg); }
            }

            @keyframes hw-seal-message-eaten {
                0% {
                    opacity: 1;
                    transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
                    clip-path: inset(0 0 0 0 round 0);
                }
                45% {
                    opacity: 1;
                    transform: translate3d(calc(var(--hw-seal-travel-x) * 0.55), calc(var(--hw-seal-travel-y) * 0.55), 0) rotate(2deg) scale(0.58, 0.72);
                    clip-path: inset(2% 0 2% 10% round 10px);
                }
                82% {
                    opacity: 1;
                    transform: translate3d(calc(var(--hw-seal-travel-x) * 0.92), calc(var(--hw-seal-travel-y) * 0.92), 0) rotate(5deg) scale(0.12, 0.32);
                    clip-path: inset(7% 0 7% 60% round 16px);
                }
                100% {
                    opacity: 0;
                    transform: translate3d(var(--hw-seal-travel-x), var(--hw-seal-travel-y), 0) rotate(7deg) scale(0.01, 0.08);
                    clip-path: inset(45% 0 45% 98% round 20px);
                }
            }

            @keyframes hw-seal-bite {
                0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
                45%      { transform: translate3d(-14px, 3px, 0) rotate(-4deg); }
                70%      { transform: translate3d(5px, -1px, 0) rotate(2deg); }
            }

            @keyframes hw-seal-flipper {
                0%, 100% { transform: rotate(0deg); transform-origin: 140px 140px; }
                50%      { transform: rotate(-18deg); transform-origin: 140px 140px; }
            }

            @keyframes hw-seal-gulp {
                0%, 100% { transform: scale(1); transform-origin: 58% 55%; }
                45%      { transform: scale(1.07, 1.12); transform-origin: 58% 55%; }
                72%      { transform: scale(0.99, 0.97); transform-origin: 58% 55%; }
            }

            @keyframes hw-seal-satisfied-bob {
                0%, 100% { transform: translateY(0) rotate(0deg); }
                45%      { transform: translateY(-8px) rotate(-2deg); }
                72%      { transform: translateY(3px) rotate(1deg); }
            }

            @keyframes hw-seal-exit {
                0%   { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
                35%  { opacity: 1; transform: translate3d(28px, 4px, 0) rotate(2deg); }
                100% { opacity: 0; transform: translate3d(340px, 38px, 0) rotate(8deg); }
            }

            @keyframes hw-seal-reduced-flash {
                0%   { background-color: transparent; }
                40%  { background-color: rgba(90, 104, 116, 0.15); }
                100% { background-color: transparent; }
            }
        `;

        document.head.appendChild(style);
    }
})();

// ============================================================================
// MODULE 3: COLLAPSIBLE THREAD REPLIES
// Changes MB Reply separator into a clickable Collapse / Expand toggle switch.
// ============================================================================
(function () {
    'use strict';

    if (!HWUS_isModuleEnabled(3)) return;

    const STORAGE_KEY = 'hw-collapsed-thread-replies-v2';

    if (!isThreadPage()) return;

    const threadId = getThreadId();
    const pageNumber = getPageNumber();

    if (!threadId || !pageNumber) return;

    const collapsedReplies = loadCollapsedReplies();

    normalizePagination();
    injectStyles();
    initializeReplies();
    rebuildCollapsedTabs();
    initializeBulkControls();

    function normalizePagination() {
        const links = document.querySelectorAll(
            'a[href*="cmd=gathering"][href*="do=vpost"][href*="post="][href*="board="][href*="limit1="][href*="limit2="]'
        );

        for (const link of links) {
            let node = link;

            while (
                node.parentElement &&
                /^(B|FONT)$/i.test(node.parentElement.tagName)
            ) {
                node = node.parentElement;
            }

            const separator = node.nextSibling;

            if (
                separator?.nodeType === Node.TEXT_NODE &&
                /^,\s*/.test(separator.nodeValue)
            ) {
                separator.nodeValue = separator.nodeValue.replace(/^,\s*/, ' ');
            }
        }
    }

    function isThreadPage() {
        const params = new URLSearchParams(window.location.search);

        return (
            params.get('cmd') === 'gathering' &&
            params.get('do') === 'vpost' &&
            /^\d+$/.test(params.get('post') || '')
        );
    }

    function getThreadId() {
        const linkId = document.querySelector('#linkid');
        const linkIdValue = linkId?.textContent.trim();

        if (/^\d+$/.test(linkIdValue || '')) {
            return linkIdValue;
        }

        const params = new URLSearchParams(window.location.search);
        const post = params.get('post');

        return /^\d+$/.test(post || '')
            ? post
            : null;
    }

    function getPageNumber() {
        const pageLinks = Array.from(
            document.querySelectorAll(
                'a[href*="cmd=gathering"][href*="do=vpost"]'
            )
        );

        for (const link of pageLinks) {
            if (
                link.closest('b') &&
                /^\d+$/.test(link.textContent.trim())
            ) {
                return link.textContent.trim();
            }
        }

        const params = new URLSearchParams(window.location.search);
        const limit1 = Number(params.get('limit1') || 0);
        const limit2 = Number(params.get('limit2') || 30);
        const pageSize = limit2 - limit1;

        if (
            Number.isFinite(limit1) &&
            Number.isFinite(limit2) &&
            pageSize > 0
        ) {
            return String(
                Math.floor(limit1 / pageSize) + 1
            );
        }

        return '1';
    }

    function initializeReplies() {
        const spacers = document.querySelectorAll(
            'tr[id^="tr_spacer_"]'
        );

        for (const spacer of spacers) {
            const postId =
                spacer.id.match(/^tr_spacer_(\d+)$/)?.[1];

            const postRow = postId
                ? document.querySelector(
                    `#tr_post_${CSS.escape(postId)}`
                )
                : null;

            const cell = spacer.cells?.[0];

            if (!postId || !postRow || !cell) continue;

            const storageId = postId;

            const playerName =
                postRow
                    .querySelector('.player-name')
                    ?.textContent
                    .trim() ||
                `Reply ${postId}`;

            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'hwctr-spacer-button';

            spacer.classList.add('hwctr-spacer');

            spacer.dataset.hwctrStorageId = storageId;
            spacer.dataset.hwctrPostId = postId;
            spacer.dataset.hwctrPlayerName = playerName;

            cell.replaceChildren(button);

            button.addEventListener('click', () => {
                const shouldCollapse = !postRow.hidden;

                setCollapsedState(
                    postRow,
                    spacer,
                    button,
                    storageId,
                    shouldCollapse
                );

                saveCollapsedReplies();
                rebuildCollapsedTabs();
                syncBulkControls();
            });

            setCollapsedState(
                postRow,
                spacer,
                button,
                storageId,
                collapsedReplies.has(storageId)
            );
        }
    }

    function initializeBulkControls() {
        const links = Array.from(
            document.querySelectorAll('a[href]')
        );

        const topAnchor = links.find(link =>
            link.getAttribute('href') === '#bottom' &&
            link.textContent.trim() === 'Jump to Bottom'
        );

        const bottomAnchor = links.find(link =>
            link.getAttribute('href') === '#' &&
            link.textContent.trim() === 'Jump to Top'
        );

        if (topAnchor) {
            addBulkControl(
                topAnchor,
                'hwctr-bulk-top'
            );
        }

        if (bottomAnchor) {
            addBulkControl(
                bottomAnchor,
                'hwctr-bulk-bottom'
            );
        }

        syncBulkControls();
    }

    function addBulkControl(anchor, id) {
        if (document.getElementById(id)) return;

        const wrapper = document.createElement('span');
        const toggle = document.createElement('a');

        wrapper.className = 'hwctr-bulk-wrapper';

        toggle.id = id;
        toggle.href = '#';
        toggle.className = 'hwctr-bulk-toggle';

        toggle.addEventListener('click', event => {
            event.preventDefault();

            const replies = getReplyControls();

            if (!replies.length) return;

            const allCollapsed = replies.every(
                ({ postRow }) => postRow.hidden
            );

            const shouldCollapse = !allCollapsed;

            for (const reply of replies) {
                setCollapsedState(
                    reply.postRow,
                    reply.spacer,
                    reply.button,
                    reply.storageId,
                    shouldCollapse
                );
            }

            saveCollapsedReplies();
            rebuildCollapsedTabs();
            syncBulkControls();
        });

        /*
         * Native markup already looks like:
         *
         * [Jump to Top]
         *
         * We inject immediately after the anchor itself,
         * before HoboWars' native closing bracket.
         *
         * Result:
         *
         * [Jump to Top] [Collapse All]
         */
        wrapper.append(
            document.createTextNode('] ['),
            toggle
        );

        anchor.insertAdjacentElement(
            'afterend',
            wrapper
        );
    }

    function getReplyControls() {
        const replies = [];

        const spacers = document.querySelectorAll(
            'tr.hwctr-spacer[data-hwctr-storage-id]'
        );

        for (const spacer of spacers) {
            const postId = spacer.dataset.hwctrPostId;
            const storageId =
                spacer.dataset.hwctrStorageId;

            const postRow = postId
                ? document.querySelector(
                    `#tr_post_${CSS.escape(postId)}`
                )
                : null;

            const button = spacer.querySelector(
                '.hwctr-spacer-button'
            );

            if (
                !postRow ||
                !button ||
                !storageId
            ) {
                continue;
            }

            replies.push({
                postId,
                storageId,
                postRow,
                spacer,
                button,
                playerName:
                    spacer.dataset.hwctrPlayerName ||
                    `Reply ${postId}`
            });
        }

        return replies;
    }

    function setCollapsedState(
        postRow,
        spacer,
        button,
        storageId,
        isCollapsed
    ) {
        postRow.hidden = isCollapsed;

        spacer.classList.toggle(
            'hwctr-collapsed',
            isCollapsed
        );

        button.textContent = isCollapsed
            ? 'Collapsed Reply — Click to Expand'
            : 'Click to Collapse';

        if (isCollapsed) {
            collapsedReplies.add(storageId);
        } else {
            collapsedReplies.delete(storageId);
        }
    }

    function rebuildCollapsedTabs() {
        /*
         * Remove all previously generated tab strips.
         */
        document.querySelectorAll(
            'tr.hwctr-tab-strip-row'
        ).forEach(row => row.remove());

        const replies = getReplyControls();

        /*
         * Restore normal separator visibility first.
         * A collapsed reply's own spacer disappears because
         * the generated tab takes its place.
         */
        for (const reply of replies) {
            reply.spacer.hidden = reply.postRow.hidden;
        }

        if (!replies.length) return;

        /*
         * A run of collapsed replies attaches to:
         *
         * - the topic separator if the run begins at the
         *   first reply, or
         *
         * - the separator belonging to the most recent
         *   expanded reply.
         */
        let anchorRow = getTopicSeparator(replies);
        let strip = null;

        for (const reply of replies) {
            if (!reply.postRow.hidden) {
                anchorRow = reply.spacer;
                strip = null;
                continue;
            }

            if (!anchorRow) continue;

            if (!strip) {
                strip = createTabStrip(anchorRow);
            }

            strip.appendChild(
                createCollapsedTab(reply)
            );
        }
    }

    function getTopicSeparator(replies) {
        const firstReply = replies[0]?.postRow;

        if (!firstReply) return null;

        /*
         * On a thread page the topic post's separator row
         * sits directly before the first reply row.
         */
        let row = firstReply.previousElementSibling;

        while (row) {
            if (
                row.tagName === 'TR' &&
                !row.classList.contains(
                    'hwctr-tab-strip-row'
                )
            ) {
                return row;
            }

            row = row.previousElementSibling;
        }

        return null;
    }

    function createTabStrip(anchorRow) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        const strip = document.createElement('div');

        row.className = 'hwctr-tab-strip-row';

        cell.colSpan = 2;
        cell.className = 'hwctr-tab-strip-cell';

        strip.className = 'hwctr-tab-strip';

        cell.appendChild(strip);
        row.appendChild(cell);

        anchorRow.insertAdjacentElement(
            'afterend',
            row
        );

        return strip;
    }

    function createCollapsedTab(reply) {
        const tab = document.createElement('button');
        const label = document.createElement('span');

        tab.type = 'button';
        tab.className = 'hwctr-reply-tab';

        label.className = 'hwctr-reply-tab-label';
        label.textContent = reply.playerName;

        tab.appendChild(label);

        tab.title =
            `Expand reply by ${reply.playerName}`;

        tab.setAttribute(
            'aria-label',
            `Expand reply by ${reply.playerName}`
        );

        tab.addEventListener('click', () => {
            setCollapsedState(
                reply.postRow,
                reply.spacer,
                reply.button,
                reply.storageId,
                false
            );

            saveCollapsedReplies();
            rebuildCollapsedTabs();
            syncBulkControls();
        });

        return tab;
    }

    function syncBulkControls() {
        const replies = getReplyControls();

        const allCollapsed =
            replies.length > 0 &&
            replies.every(
                ({ postRow }) => postRow.hidden
            );

        const label = allCollapsed
            ? 'Expand All'
            : 'Collapse All';

        document.querySelectorAll(
            '.hwctr-bulk-toggle'
        ).forEach(toggle => {
            toggle.textContent = label;
        });
    }

    function loadCollapsedReplies() {
        try {
            const stored = JSON.parse(
                localStorage.getItem(STORAGE_KEY) ||
                '{}'
            );

            const pageReplies =
                stored?.[threadId]?.[pageNumber];

            return new Set(
                Array.isArray(pageReplies)
                    ? pageReplies.filter(
                        value =>
                            typeof value === 'string'
                    )
                    : []
            );
        } catch (error) {
            console.warn(
                '[HW Collapsible Thread Replies] Could not read saved replies:',
                error
            );

            return new Set();
        }
    }

    function saveCollapsedReplies() {
        try {
            const parsed = JSON.parse(
                localStorage.getItem(STORAGE_KEY) ||
                '{}'
            );

            const state =
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
                    ? parsed
                    : {};

            if (!state[threadId]) {
                state[threadId] = {};
            }

            const values =
                Array.from(collapsedReplies);

            if (values.length) {
                state[threadId][pageNumber] =
                    values;
            } else {
                delete state[threadId][pageNumber];

                if (
                    Object.keys(
                        state[threadId]
                    ).length === 0
                ) {
                    delete state[threadId];
                }
            }

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(state)
            );
        } catch (error) {
            console.warn(
                '[HW Collapsible Thread Replies] Could not save replies:',
                error
            );
        }
    }

    function injectStyles() {
        const style = document.createElement('style');

        style.textContent = `
            tr.hwctr-spacer td {
                padding: 0;
                border-top: 1px solid #333333;
                border-bottom: 1px solid #333333;
            }

            .hwctr-spacer-button {
                display: block;
                width: 100%;
                min-height: 22px;
                padding: 2px 0;
                border: 0;
                font: inherit;
                color: #555555;
                font-size: 10px;
                font-weight: bold;
                text-align: center;
                cursor: pointer;
            }

            /*
             * This state is normally hidden because collapsed
             * replies are represented by tabs. Keeping the
             * styling here makes the underlying state obvious
             * during DOM inspection and provides a fallback.
             */
            tr.hwctr-collapsed .hwctr-spacer-button {
                background-color: #DDBDBD;
            }

            tr.hwctr-collapsed .hwctr-spacer-button:hover {
                background-color: #DD8D8D;
            }

            .hwctr-bulk-wrapper {
                display: inline;
            }

            .hwctr-bulk-toggle {
                cursor: pointer;
            }

            /*
             * One synthetic table row represents an entire
             * consecutive run of collapsed replies.
             *
             * The cell itself has no whitespace, preventing
             * the old full-height separator effect.
             */
            tr.hwctr-tab-strip-row td.hwctr-tab-strip-cell {
                padding: 0;
                border: 0;
            }

            /*
             * Shared binder rail.
             *
             * The background belongs to the entire strip,
             * rather than to any individual tab. If tabs wrap,
             * every row therefore remains visually attached to
             * the same collapsed-reply block.
             */
            .hwctr-tab-strip {
                display: flex;
                flex-wrap: wrap;
                align-items: flex-start;
                align-content: flex-start;
                justify-content: space-between;
                row-gap: 2px;
                padding: 4px 4px 4px;
                border-top: 1px solid #333333;
                border-bottom: 1px solid #777777;
                background-color: #CDCDCD;
                background-image: linear-gradient(#000, #777);
                background-position: center 6px;
                background-size: 100% 25px;
            }

            /*
             * Binder-tab shape.
             *
             * The tab has a continuous flat top against the
             * shared rail and angled outer edges. The inner
             * label supplies the inset face so the tab keeps
             * its geometry without depending on a top border.
             */
            .hwctr-reply-tab {
                position: relative;

                flex:
                    0
                    0
                    auto;

                min-height:
                    21px;

                margin:
                    0;

                padding:
                    1px;

                border:
                    0;

                background:
                    #777777;

            clip-path:
                polygon(
                    0 0,
                    100% 0,
                    calc(100% - 7px) 100%,
                    7px 100%
                );

                font:
                    inherit;

                font-size:
                    10px;

                font-weight:
                    bold;

                color:
                    #555555;

                cursor:
                    pointer;

                white-space:
                    nowrap;
            }

            .hwctr-reply-tab-label {
                display:
                    block;

                min-height:
                    17px;

                padding:
                    2px
                    10px
                    2px;

                box-sizing:
                    border-box;

                background:
                    #DDBDBD;

            clip-path:
                polygon(
                    0 0,
                    100% 0,
                    calc(100% - 6px) 100%,
                    6px 100%
                );
            }

            .hwctr-reply-tab:hover
            .hwctr-reply-tab-label {
                background:
                    #DD8D8D;
            }

            .hwctr-reply-tab:focus-visible {
                outline:
                    2px solid #333333;

                outline-offset:
                    1px;
            }
        `;

        document.head.appendChild(style);
    }
})();
// ============================================================================
// MODULE 4: PLAYER STATS TRACKER
// Adds a small panel that records a player's various record stats per profile.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(4)) return;

    const MODULE = 'hw-player-stat-delta-logger';
    const MAX_RECORDINGS = 200;

    const FIELD_ORDER = ['Respect', 'Level', 'Money', 'Life', 'Record'];

    const FIELD_COLORS = {
        Respect: '#d60b10',
        Level: '#f600f6',
        Money: '#3aba00',
        Life: '#0000dd',
        Record: '#c58d06'
    };

    const RECORD_METRICS = [
        { label: 'Record (Wins)', index: 1, percent: false },
        { label: 'Record (Losses)', index: 2, percent: false },
        { label: 'Record (W/R%)', index: 3, percent: true }
    ];

    const url = new URL(location.href);
    const playerId = url.searchParams.get('ID');

    if (
        !url.pathname.endsWith('/game/game.php') ||
        url.searchParams.get('cmd') !== 'player' ||
        !/^\d+$/.test(playerId || '')
    ) {
        return;
    }

    const STORAGE = {
        snapshot: `${MODULE}:snapshot:${playerId}`,
        history: `${MODULE}:history:${playerId}`
    };

    const citizenInfo = locateCitizenInformation();
    if (!citizenInfo) return;

    const playerName = readPlayerName(citizenInfo);

    const currentSnapshot = readSnapshot(citizenInfo);
    if (!currentSnapshot) return;

    const previousSnapshot = readJSON(STORAGE.snapshot, null);
    const history = readJSON(STORAGE.history, []);

    if (!previousSnapshot) {
        history.unshift(makeRecording(currentSnapshot, null, FIELD_ORDER, true));
        saveHistory(history);
    } else {
        const changedFields = FIELD_ORDER.filter(field =>
            numericValuesChanged(
                previousSnapshot[field]?.numbers,
                currentSnapshot[field]?.numbers
            )
        );

        if (changedFields.length) {
            history.unshift(
                makeRecording(
                    currentSnapshot,
                    previousSnapshot,
                    changedFields,
                    false
                )
            );

            saveHistory(history);
        }
    }

    localStorage.setItem(STORAGE.snapshot, JSON.stringify(currentSnapshot));
    injectPanel(history);

    function locateCitizenInformation() {
        return [...document.querySelectorAll('.content-area div')].find(div => {
            const text = div.textContent || '';
            return text.includes('Citizen Information:') &&
                text.includes('Respect:') &&
                text.includes('Level:') &&
                text.includes('Money:') &&
                text.includes('Life:') &&
                text.includes('Record:');
        }) || null;
    }

    function readPlayerName(root) {
        const heading =
              root.querySelector('b')?.textContent.trim() ||
              document.querySelector('.content-area b')?.textContent.trim() ||
              `Player ${playerId}`;

        return heading
            .replace(/^Citizen Information:\s*/i, '')
            .trim() || `Player ${playerId}`;
    }

    function readSnapshot(root) {
        const result = {};

        for (const field of FIELD_ORDER) {
            const rawText = readFieldText(root, `${field}:`);
            if (!rawText) return null;

            const text = cleanFieldText(field, rawText);

            result[field] = {
                text,
                numbers: parseNumbers(text)
            };
        }

        return result;
    }

    function cleanFieldText(field, rawText) {
        if (field === 'Respect') {
            return rawText.match(/\[([+-]?\d[\d,]*(?:\.\d+)?)\]/)?.[1] || rawText;
        }

        if (field === 'Life') {
            return rawText.match(/\/\s*([\d,]+)$/)?.[1] || rawText;
        }

        if (field === 'Record') {
            const match = rawText.match(
                /^([\d,]+)\s+fights\s+\[Win\/Loss:\s*([\d,]+)\/([\d,]+)\]\s+\(([\d.]+%)\)$/
            );

            return match
                ? `${match[1]} [${match[2]}/${match[3]}] (${match[4]})`
                : rawText;
        }

        return rawText;
    }

    function readFieldText(root, labelText) {
        const label = [...root.querySelectorAll('b')].find(node =>
            node.textContent.trim() === labelText
        );

        if (!label) return '';

        const parts = [];
        let cursor = label.nextSibling;

        while (cursor) {
            if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === 'BR') {
                break;
            }

            parts.push(cursor.textContent || '');
            cursor = cursor.nextSibling;
        }

        return normalizeSpace(parts.join(''));
    }

    function parseNumbers(text) {
        const matches = text.match(/[+-]?(?:\d[\d,]*)(?:\.\d+)?/g) || [];

        return matches.map(token => {
            const value = Number(token.replace(/,/g, ''));
            return Number.isFinite(value) ? value : null;
        }).filter(value => value !== null);
    }

    function numericValuesChanged(previousNumbers, currentNumbers) {
        if (!Array.isArray(previousNumbers) || !Array.isArray(currentNumbers)) {
            return true;
        }

        if (previousNumbers.length !== currentNumbers.length) return true;

        return currentNumbers.some((value, index) =>
            value !== previousNumbers[index]
        );
    }

    function makeRecording(current, previous, changedFields, initial) {
        const fields = {};

        for (const field of changedFields) {
            const currentNumbers = current[field]?.numbers || [];
            const previousNumbers = previous?.[field]?.numbers || [];

            fields[field] = {
                currentText: current[field]?.text || '',
                currentNumbers,
                previousText: previous?.[field]?.text || '',
                previousNumbers,
                deltas: initial
                ? currentNumbers.map(() => null)
                : currentNumbers.map((value, index) => {
                    const oldValue = previousNumbers[index];
                    return Number.isFinite(oldValue) ? value - oldValue : null;
                })
            };
        }

        return {
            timestamp: Date.now(),
            initial,
            fields
        };
    }

    function saveHistory(history) {
        const trimmed = Array.isArray(history)
        ? history.slice(0, MAX_RECORDINGS)
        : [];

        localStorage.setItem(STORAGE.history, JSON.stringify(trimmed));
    }

    function injectPanel(history) {
        document.getElementById(`${MODULE}-panel`)?.remove();

        const panel = document.createElement('aside');
        panel.id = `${MODULE}-panel`;

        const heading = document.createElement('div');
        heading.className = `${MODULE}-heading`;
        heading.textContent = `${playerName} History`;

        const body = document.createElement('div');
        body.className = `${MODULE}-body`;

        if (!history.length) {
            const empty = document.createElement('div');
            empty.className = `${MODULE}-empty`;
            empty.textContent = 'No recordings.';
            body.append(empty);
        } else {
            for (const recording of history) {
                body.append(buildRecording(recording));
            }
        }

        panel.append(heading, body);
        injectStyles();

        const nativeTable = document.querySelector('.content-area table[width="550"]:first-of-type');
        if (!nativeTable || !nativeTable.parentNode) return;

        let layout = document.getElementById(`${MODULE}-layout`);
        if (!layout) {
            layout = document.createElement('div');
            layout.id = `${MODULE}-layout`;
            nativeTable.parentNode.insertBefore(layout, nativeTable);
            layout.appendChild(nativeTable);
        }

        layout.insertBefore(panel, nativeTable);
        installResponsiveValueRows(panel);
    }

    function buildRecording(recording) {
        const group = document.createElement('section');
        group.className = `${MODULE}-recording`;

        const timestamp = document.createElement('div');
        timestamp.className = `${MODULE}-timestamp`;
        timestamp.textContent = formatTimestamp(recording.timestamp);
        group.append(timestamp);

        for (const field of FIELD_ORDER) {
            const entry = recording.fields?.[field];
            if (!entry) continue;

            if (field === 'Record' && entry.currentNumbers?.length >= 4) {
                for (const metric of RECORD_METRICS) {
                    const deltaValue = entry.deltas?.[metric.index];

                    if (
                        !recording.initial &&
                        Number.isFinite(deltaValue) &&
                        deltaValue === 0
                    ) {
                        continue;
                    }

                    group.append(buildRecordMetricRow(entry, metric, recording.initial));
                }
                continue;
            }

            group.append(buildFieldRow(field, entry, recording.initial));
        }

        return group;
    }

    function buildFieldRow(field, entry, initial) {
        return buildMetricRow({
            labelText: field,
            color: FIELD_COLORS[field],
            latestText: entry.currentText,
            previousText: !initial ? entry.previousText : '',
            deltaText: initial ? 'Δ' : formatDelta(entry.deltas)
        });
    }

    function buildRecordMetricRow(entry, metric, initial) {
        const currentValue = entry.currentNumbers?.[metric.index];
        const previousValue = entry.previousNumbers?.[metric.index];
        const deltaValue = entry.deltas?.[metric.index];

        return buildMetricRow({
            labelText: metric.label,
            color: FIELD_COLORS.Record,
            latestText: formatRecordMetricValue(currentValue, metric.percent),
            previousText: !initial && Number.isFinite(previousValue)
            ? formatRecordMetricValue(previousValue, metric.percent)
            : '',
            deltaText: initial
            ? 'Δ'
            : formatSingleDelta(deltaValue, metric.percent ? '%' : '')
        });
    }

    function buildMetricRow({ labelText, color, latestText, previousText, deltaText }) {
        const row = document.createElement('div');
        row.className = `${MODULE}-field-row`;
        row.style.setProperty('--hw-player-stat-field-color', color || '#000');

        const label = document.createElement('div');
        label.className = `${MODULE}-label`;
        label.textContent = labelText;

        const values = document.createElement('div');
        values.className = `${MODULE}-values`;

        const latest = document.createElement('div');
        latest.className = `${MODULE}-latest`;
        latest.textContent = latestText || '—';
        values.append(latest);

        if (previousText) {
            values.classList.add(`${MODULE}-values-paired`);

            const previous = document.createElement('div');
            previous.className = `${MODULE}-previous`;
            previous.textContent = previousText;
            values.append(previous);
        }

        const delta = document.createElement('div');
        delta.className = `${MODULE}-delta`;
        delta.textContent = deltaText || 'Δ';

        row.append(label, values, delta);
        return row;
    }

    function installResponsiveValueRows(panel) {
        const sync = () => {
            const valueRows = panel.querySelectorAll(
                `.${MODULE}-values.${MODULE}-values-paired`
            );

            for (const values of valueRows) {
                values.classList.remove(`${MODULE}-values-stacked`);

                const cells = [...values.children];
                const cramped = cells.some(cell =>
                    cell.scrollWidth > cell.clientWidth + 0.5
                );

                values.classList.toggle(`${MODULE}-values-stacked`, cramped);
            }
        };

        requestAnimationFrame(sync);

        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(sync);
            observer.observe(panel);
        } else {
            window.addEventListener('resize', sync, { passive: true });
        }
    }

    function formatRecordMetricValue(value, percent) {
        if (!Number.isFinite(value)) return '—';

        if (percent) {
            return `${value.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}%`;
        }

        return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function formatDelta(deltas) {
        if (!Array.isArray(deltas) || !deltas.length) return 'Δ n/a';

        return `Δ ${deltas.map(value => {
            if (!Number.isFinite(value)) return 'n/a';
            return formatSignedNumber(value);
        }).join(' / ')}`;
    }

    function formatSingleDelta(value, suffix = '') {
        if (!Number.isFinite(value)) return 'Δ n/a';
        return `Δ ${formatSignedNumber(value)}${suffix}`;
    }

    function formatSignedNumber(value) {
        const sign = value > 0 ? '+' : '';
        const options = Number.isInteger(value)
        ? { maximumFractionDigits: 0 }
        : { maximumFractionDigits: 4 };

        return `${sign}${value.toLocaleString('en-US', options)}`;
    }

    function formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString('en-US', {
            timeZone: 'Etc/GMT-10',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: false
        });
    }

    function normalizeSpace(value) {
        return String(value).replace(/\s+/g, ' ').trim();
    }

    function readJSON(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key));
            return parsed ?? fallback;
        } catch {
            return fallback;
        }
    }

    function injectStyles() {
        if (document.getElementById(`${MODULE}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${MODULE}-styles`;
        style.textContent = `
            #${MODULE}-layout {
                display: flex;
                align-items: flex-start;
                width: 100%;
                box-sizing: border-box;
            }

            #${MODULE}-layout > table[width="550"]:first-of-type {
                width: auto !important;
                margin: 0;
                flex: 1 0 60%;
                min-width: 420px;
            }

            #${MODULE}-panel {
                position: relative;
                flex: 1 1 40%;
                height: auto;
                max-height: 265px;
                overflow-y: scroll;
                background-color: #E4ECF1;
                border: 1px solid #fcc;
                border-radius: 4px;
                box-sizing: border-box;
                padding: 0 3px 3px;
                color: #000;
                font-size: 10px;
                line-height: 11px;
                z-index: 9;
                scrollbar-width: none !important;
            }

            .${MODULE}-heading {
                position: sticky;
                top: 0;
                z-index: 1;
                margin: 0 0 3px;
                padding: 5px 5px;
                background-color: #E4ECF1;
                border-bottom: 2px solid #fcc;
                font-weight: bold;
            }

            .${MODULE}-recording {
                padding: 3px 2px 5px;
                border-bottom: 1px solid rgba(255, 204, 204, 0.28);
            }

            .${MODULE}-recording:last-child {
                border-bottom: 0;
            }

            .${MODULE}-timestamp {
                margin: 4px 5px 0 auto;
                width: auto;
                border-top: 2px solid #888;
                text-align: right;
                color: #444;
                font-size: 11px;
                font-weight: bold;
                white-space: nowrap;
                padding: 2px 15px 0 0;
            }

            .${MODULE}-recording:first-of-type .${MODULE}-timestamp {
                border-top: 0;
            }

            .${MODULE}-field-row {
                margin-bottom: 4px;
                min-width: 0;
            }

            .${MODULE}-label {
                color: var(--hw-player-stat-field-color);
                font-weight: bold;
            }

            .${MODULE}-values {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                min-width: 0;
                column-gap: 4px;
                align-items: baseline;
            }

            .${MODULE}-values.${MODULE}-values-paired {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .${MODULE}-values.${MODULE}-values-stacked {
                grid-template-columns: minmax(0, 1fr);
            }

            .${MODULE}-latest,
            .${MODULE}-previous {
                min-width: 0;
                white-space: nowrap;
            }

            .${MODULE}-latest {
                color: #000;
            }

            .${MODULE}-previous {
                color: #666;
                font-size: calc(1em - 1px);
            }

            .${MODULE}-delta {
                display: block;
                width: 100%;
                box-sizing: border-box;
                margin-top: 1px;
                padding: 0 1px 1px 0;
                border-bottom: 1px solid #777;
                color: var(--hw-player-stat-field-color);
                font-weight: bold;
                text-align: right;
                white-space: nowrap;
            }

            .${MODULE}-field-row:last-of-type > .${MODULE}-delta {
                border-bottom: 0;
            }

            .${MODULE}-empty {
                color: #bfbfbf;
            }
        `;

        document.head.append(style);
    }
})();


// ============================================================================
// MODULE 5: CART RACING
// Tracks Pikie race gains, Super Cart registration, and global Racing Skill.
// ============================================================================
(function () {
    'use strict';

    if (!HWUS_isModuleEnabled(5)) return;

    const K_PIKIE_ENTRIES = 'jbgl_pikie_entries_v1';
    const K_PIKIE_PENDING = 'jbgl_pikie_pending_v1';
    const K_PIKIE_LAST_FP = 'jbgl_pikie_last_fp_v1';

    const K_CART_MANIFEST = 'hwus_cart_skill_manifest_v1';
    const K_CART_META = 'hwus_cart_skill_meta_v1';
    const K_CART_ADVANCES = 'hwus_cart_class_advances_v1';
    const CART_ITEMS_PER_PAGE = 50;
    const CART_ACTIVE_WEEKLY_GAIN = 1;
    const CART_GLOBAL_UPDATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const CART_ADVANCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const CART_SKILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const CART_SKILL_HISTORY_RETENTION_MS = 9 * 24 * 60 * 60 * 1000;

    const PIKIE_PANEL_W = 160;

    const href = String(location.href || '');
    const isPikieSelector =
          /[?&]cmd=hill3(?:[&#]|$|&)/i.test(href) &&
          /[?&]do=npc(?:[&#]|$)/i.test(href);

    const isPikieResult =
          /[?&]cmd=hill3(?:[&#]|$|&)/i.test(href) &&
          /[?&]do=npc_race(?:[&#]|$)/i.test(href);

    const isCartRoad =
          /[?&]cmd=hill3(?:[&#]|$|&)/i.test(href) &&
          /[?&]do=road(?:[&#]|$)/i.test(href);

    const isCartHof =
          /[?&]cmd=hill3(?:[&#]|$|&)/i.test(href) &&
          /[?&]do=hof(?:[&#]|$)/i.test(href);

    if (!isPikieSelector && !isPikieResult && !isCartRoad && !isCartHof) return;

    if (isPikieSelector || isPikieResult) {
        ensureMetamorphousFont();
    }

    const html = document.documentElement.innerHTML || '';
    const text = document.body ? (document.body.textContent || '') : '';
    const clockEl = document.querySelector('#clock');
    const now = clockEl ? parseClock(clockEl.textContent || '') : null;
    const monthText = getMonthText(text);
    const dayText = String(getDayText(text)).padStart(2, '0');

    runCartMode({
        href,
        html,
        text,
        now,
        monthText,
        dayText
    });

    function runCartMode(ctx) {
        if (isCartRoad) {
            initRegisteredRacersInline();
            return;
        }

        if (isCartHof) {
            initGlobalRacingSkillTracker();
            return;
        }

        const pikieEntries = loadPikieEntries();

        if (isPikieSelector) {
            constrainPikieSelectorTable();
            bindPikieSelector(ctx);
            renderPikie(pikieEntries);
            return;
        }

        if (isPikieResult) {
            const result = parsePikieResult(ctx);
            if (result) {
                const fp = result.secondKey;
                const prevFp = String(GM_getValue(K_PIKIE_LAST_FP, '') || '');

                if (prevFp !== fp) {
                    GM_setValue(K_PIKIE_LAST_FP, fp);
                    pikieEntries.unshift(result);
                    savePikieEntries(pikieEntries);
                }

                GM_setValue(K_PIKIE_PENDING, '');
            }

            renderPikie(loadPikieEntries());
        }
    }

    function initRegisteredRacersInline() {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea || document.getElementById('hwus-cart-racers-layout')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'hwus-cart-racers-layout';
        wrapper.style.display = 'grid';
        wrapper.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        wrapper.style.columnGap = '20px';
        wrapper.style.alignItems = 'start';

        const leftCol = document.createElement('div');
        leftCol.style.minWidth = '0';

        while (contentArea.firstChild) {
            leftCol.appendChild(contentArea.firstChild);
        }

        const rightCol = document.createElement('div');
        rightCol.style.minWidth = '0';
        rightCol.style.textAlign = 'center';
        rightCol.style.display = 'none';

        let viewButton = null;
        let racersVisible = false;
        let racersLoading = false;

        const setButtonState = state => {
            if (!viewButton) return;

            const isWait = state === 'wait';
            viewButton.textContent = state === 'hide'
                ? 'Hide'
                : isWait
                ? 'Wait'
                : 'View';
            viewButton.disabled = isWait;
            viewButton.style.opacity = isWait ? '0.5' : '';
            viewButton.style.cursor = isWait ? 'default' : 'pointer';
        };

        const hideRacers = event => {
            if (event) event.preventDefault();
            if (racersLoading) return;

            rightCol.replaceChildren();
            rightCol.style.display = 'none';
            racersVisible = false;
            setButtonState('view');
        };

        const doFetchList = event => {
            if (event) event.preventDefault();
            if (racersLoading) return;

            racersLoading = true;
            racersVisible = false;
            setButtonState('wait');
            rightCol.replaceChildren();
            rightCol.style.display = 'none';

            const pageUrl = new URL(location.href);
            const sr = pageUrl.searchParams.get('sr') || '';
            const listUrl = `game.php?sr=${encodeURIComponent(sr)}&cmd=hill3&do=list`;

            fetch(listUrl)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    const decoder = new TextDecoder('iso-8859-1');
                    const fetchedHtml = decoder.decode(buffer);
                    const doc = new DOMParser().parseFromString(fetchedHtml, 'text/html');
                    const remoteContent = doc.querySelector('.content-area');

                    if (!remoteContent) {
                        throw new Error('Registered Racers content not found.');
                    }

                    const lines = remoteContent.innerHTML.split(/<br\s*\/?>/i);
                    const playerId = HWUS_getCurrentPlayerId();
                    const manifest = loadCartManifest();
                    let introText = '';
                    const racers = [];

                    for (let i = 0; i < lines.length; i += 1) {
                        const line = lines[i].trim();
                        if (!line) continue;

                        const match = line.match(
                            /^(\d+)\.\s*(<a.*?href=".*?ID=(\d+)".*?>.*?<\/a>)\s*using the\s*(<strong>.*?<\/strong>)/i
                        );

                        if (match) {
                            const racerId = match[3];
                            const manifestEntry = manifest[racerId];
                            const skillValue = Number(manifestEntry?.lastSkill);

                            racers.push({
                                origPos: match[1],
                                link: match[2],
                                id: racerId,
                                cart: match[4],
                                skillValue: Number.isFinite(skillValue) ? skillValue : -1
                            });
                        } else if (line.includes('These hobos are in the same class')) {
                            introText = line;
                        }
                    }

                    let currentSort = 'groupSkill';

                    const renderRacers = () => {
                        let displayRacers = [...racers];

                        if (currentSort === 'signup') {
                            displayRacers.sort(
                                (a, b) => parseInt(a.origPos, 10) - parseInt(b.origPos, 10)
                            );
                        } else {
                            displayRacers.sort(
                                (a, b) => parseInt(a.origPos, 10) - parseInt(b.origPos, 10)
                            );

                            const grouped = [];
                            for (let i = 0; i < displayRacers.length; i += 10) {
                                const group = displayRacers.slice(i, i + 10);
                                group.sort((a, b) => b.skillValue - a.skillValue);
                                grouped.push(...group);
                            }
                            displayRacers = grouped;
                        }

                        rightCol.replaceChildren();

                        if (displayRacers.length === 0) {
                            const empty = document.createElement('div');
                            empty.style.padding = '20px';
                            empty.textContent = 'No one in your class is signed up yet.';
                            rightCol.appendChild(empty);
                            return;
                        }

                        const intro = document.createElement('p');
                        intro.style.margin = '0 0 10px';
                        intro.textContent = normalizeSpace(
                            new DOMParser().parseFromString(introText || '', 'text/html').body.textContent || ''
                        );

                        const table = document.createElement('table');
                        table.align = 'center';
                        table.width = '100%';
                        table.cellSpacing = '1';
                        table.cellPadding = '2';

                        const tbody = document.createElement('tbody');
                        tbody.innerHTML = `
                            <tr>
                                <td bgcolor="#dddddd" colspan="4" align="center"><strong>Registered Racers</strong></td>
                            </tr>
                            <tr>
                                <td bgcolor="#eeeeee" align="center" width="30" style="cursor:pointer;user-select:none;" data-cart-sort="signup" title="Sort by Sign Up Order"><strong># ${currentSort === 'signup' ? '▼' : ''}</strong></td>
                                <td bgcolor="#eeeeee"><strong>Hobo</strong></td>
                                <td bgcolor="#eeeeee"><strong>Cart</strong></td>
                                <td bgcolor="#eeeeee" align="center" width="100" style="cursor:pointer;user-select:none;" data-cart-sort="skill" title="Sort by Skill (within Race Groups)"><strong>Skill ${currentSort === 'groupSkill' ? '▼' : ''}</strong></td>
                            </tr>
                        `;

                        displayRacers.forEach((racer, index) => {
                            const tr = document.createElement('tr');
                            if (racer.id === playerId) tr.style.fontWeight = 'bold';
                            const bgColor = racer.id === playerId ? '#fffec8' : '#f0f0f0';
                            const skill = racer.skillValue !== -1
                                ? racer.skillValue.toFixed(3)
                                : 'Unknown';

                            tr.innerHTML = `
                                <td bgcolor="${bgColor}" align="center">${racer.origPos}</td>
                                <td bgcolor="${bgColor}">${racer.link}</td>
                                <td bgcolor="${bgColor}">${racer.cart}</td>
                                <td bgcolor="${bgColor}" align="center">${skill}</td>
                            `;
                            tbody.appendChild(tr);

                            if (
                                currentSort === 'groupSkill' &&
                                index % 10 === 9 &&
                                index !== displayRacers.length - 1
                            ) {
                                const sep = document.createElement('tr');
                                sep.innerHTML = '<td colspan="4" style="height:4px;background:#ccc;border-radius:2px;"></td>';
                                tbody.appendChild(sep);
                            }
                        });

                        table.appendChild(tbody);
                        rightCol.append(intro, table);

                        tbody.querySelector('[data-cart-sort="signup"]')
                            ?.addEventListener('click', () => {
                                currentSort = 'signup';
                                renderRacers();
                            });

                        tbody.querySelector('[data-cart-sort="skill"]')
                            ?.addEventListener('click', () => {
                                currentSort = 'groupSkill';
                                renderRacers();
                            });
                    };

                    renderRacers();
                    rightCol.style.display = '';
                    racersVisible = true;
                    racersLoading = false;
                    setButtonState('hide');
                })
                .catch(() => {
                    racersLoading = false;
                    racersVisible = false;
                    rightCol.replaceChildren();
                    rightCol.style.display = 'none';
                    setButtonState('view');
                });
        };

        viewButton = replaceNativeRegisteredRacersView(leftCol, () => {
            if (racersVisible) hideRacers();
            else doFetchList();
        });

        wrapper.append(leftCol, rightCol);
        contentArea.appendChild(wrapper);
    }

    function replaceNativeRegisteredRacersView(root, handler) {
        const viewLink = [...root.querySelectorAll('a[href]')].find(anchor => {
            if (normalizeSpace(anchor.textContent).toLowerCase() !== 'view') return false;

            try {
                const target = new URL(anchor.href, location.href);
                return (
                    target.searchParams.get('cmd') === 'hill3' &&
                    target.searchParams.get('do') === 'list'
                );
            } catch {
                return false;
            }
        });

        if (!viewLink) return null;

        const previous = viewLink.previousSibling;
        const next = viewLink.nextSibling;

        if (previous?.nodeType === Node.TEXT_NODE) {
            previous.textContent = previous.textContent.replace(/\[\s*$/, '');
        }

        if (next?.nodeType === Node.TEXT_NODE) {
            next.textContent = next.textContent.replace(/^\s*\]/, '');
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        button.textContent = 'View';
        button.style.padding = '4px 8px';
        button.style.display = 'inline';
        button.style.fontFamily = 'Consolas, monospace';
        button.addEventListener('click', handler);

        viewLink.replaceWith(button);
        return button;
    }

    function initGlobalRacingSkillTracker() {
        const content = document.querySelector('.content-area');
        if (!content || document.getElementById('hwus-cart-global-tracker')) return;

        const nativeTable = findHofTable(document);
        if (!nativeTable) return;

        const currentPageNumber = getCurrentHofPageNumber();
        const totalPages = getTotalHofPages(content);
        const observedAt = Date.now();

        // Reconcile any newly-seen Class 1 racer from the most recent completed
        // sweep before the current page refreshes that racer's last-seen time.
        reconcileRecentCartNorthernFenceEntries();

        // A manually-viewed HOF page is also a valid authoritative observation.
        // Once every HoF page has been viewed within the same HBT reset window,
        // that manual traversal becomes the latest complete Racing Skill update.
        const currentRows = parseHofTable(nativeTable, currentPageNumber);
        if (currentRows.length) {
            persistCartPage(currentPageNumber, currentRows, observedAt);
            recordManualHofPageObservation(
                currentPageNumber,
                totalPages,
                observedAt
            );
            resolveFailedPage(currentPageNumber);
        }

        injectCartTrackerStyles();
        injectHofNavigation(nativeTable, currentPageNumber, totalPages);

        const tracker = document.createElement('section');
        tracker.id = 'hwus-cart-global-tracker';

        const headerGrid = document.createElement('div');
        headerGrid.className = 'hwus-cart-header-grid';

        const timestampLine = document.createElement('div');
        timestampLine.className = 'hwus-cart-global-time';

        const actionLine = document.createElement('div');
        actionLine.className = 'hwus-cart-update-action';
        actionLine.appendChild(document.createTextNode('Update now? '));

        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'btn';
        updateButton.textContent = 'Update All';
        actionLine.appendChild(updateButton);

        headerGrid.append(timestampLine);

        const failureBox = document.createElement('div');
        failureBox.className = 'hwus-cart-failures';

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'hwus-cart-summary-wrap';

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'hwus-cart-controls';

        const skillToggle = document.createElement('button');
        skillToggle.type = 'button';
        skillToggle.className = 'btn hwus-cart-section-toggle';

        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'hwus-cart-pagination';

        const dataTable = document.createElement('table');
        dataTable.align = 'center';
        dataTable.width = '80%';
        dataTable.cellSpacing = '2';
        dataTable.cellPadding = '4';
        dataTable.style.marginBottom = '12px';

        const advancesToggle = document.createElement('button');
        advancesToggle.type = 'button';
        advancesToggle.className = 'btn hwus-cart-section-toggle hwus-cart-advances-toggle';

        const advancesWrap = document.createElement('div');
        advancesWrap.className = 'hwus-cart-advances-wrap';

        tracker.append(
            headerGrid,
            failureBox,
            summaryDiv,
            controlsDiv,
            skillToggle,
            dataTable,
            paginationDiv,
            advancesToggle,
            advancesWrap
        );

        const backCenter = [...content.querySelectorAll('center')].find(center =>
            center.querySelector('a[href*="cmd=hill3"]')
        );

        if (backCenter) {
            backCenter.insertAdjacentElement('beforebegin', tracker);
        } else {
            content.appendChild(tracker);
        }

        let state = loadCartUiState();
        let updateCooldownTimer = null;

        const refreshUpdateState = () => {
            if (updateCooldownTimer !== null) {
                window.clearTimeout(updateCooldownTimer);
                updateCooldownTimer = null;
            }

            const meta = loadCartMeta();
            const remainingMs = renderGlobalUpdateState(
                timestampLine,
                updateButton,
                failureBox,
                meta
            );

            if (remainingMs > 0 && !meta.failedPages.length) {
                const delay = remainingMs >= 60 * 60 * 1000 ? 60 * 1000 : 1000;
                updateCooldownTimer = window.setTimeout(refreshUpdateState, delay);
            }
        };

        const renderAll = () => {
            const manifest = loadCartManifest();
            refreshUpdateState();
            renderCartSummary(summaryDiv, manifest);
            controlsDiv.style.display = state.skillGainsOpen ? 'block' : 'none';
            if (state.skillGainsOpen) {
                renderCartControls(controlsDiv, state, nextState => {
                    state = nextState;
                    saveCartUiState(state);
                    renderAll();
                });
            } else {
                controlsDiv.replaceChildren();
            }

            skillToggle.textContent = state.skillGainsOpen ? 'Hide Skill Gains' : 'Show Skill Gains';
            dataTable.style.display = state.skillGainsOpen ? 'table' : 'none';

            if (state.skillGainsOpen) {
                renderCartSkillTable(dataTable, paginationDiv, manifest, state, nextState => {
                    state = nextState;
                    saveCartUiState(state);
                    renderAll();
                });
            } else {
                paginationDiv.style.display = 'none';
                paginationDiv.replaceChildren();
                dataTable.replaceChildren();
            }

            advancesToggle.textContent = state.advancesOpen
                ? 'Hide Which Racers Advanced'
                : 'Show Which Racers Advanced';
            advancesWrap.style.display = state.advancesOpen ? 'block' : 'none';
            if (state.advancesOpen) renderCartClassAdvances(advancesWrap);
            else advancesWrap.replaceChildren();
        };

        skillToggle.addEventListener('click', () => {
            state = { ...state, skillGainsOpen: !state.skillGainsOpen };
            saveCartUiState(state);
            renderAll();
        });

        advancesToggle.addEventListener('click', () => {
            state = { ...state, advancesOpen: !state.advancesOpen };
            saveCartUiState(state);
            renderAll();
        });

        renderAll();

    }

    function findHofTable(root) {
        return [...root.querySelectorAll('table')].find(table => {
            const firstRow = table.rows?.[0];
            const header = normalizeSpace(firstRow?.textContent || '');
            return /Top Hobos \(for super-cart racing\)/i.test(header);
        }) || null;
    }

    function injectHofNavigation(nativeTable, currentPageNumber, totalPages) {
        if (document.getElementById('hwus-cart-hof-nav')) return;

        const manifest = loadCartManifest();
        const currentPlayerId = HWUS_getCurrentPlayerId();
        const playerPage = Number(manifest[currentPlayerId]?.page) || 0;
        const sr = new URL(location.href).searchParams.get('sr') || '';

        const nav = document.createElement('div');
        nav.id = 'hwus-cart-hof-nav';
        nav.className = 'hwus-cart-hof-nav';

        const makeButton = (label, targetPage, disabled) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn';
            button.textContent = label;
            button.disabled = Boolean(disabled);
            if (button.disabled) {
                button.style.opacity = '0.55';
                button.style.cursor = 'default';
                button.style.pointerEvents = 'none';
            } else {
                button.addEventListener('click', () => {
                    location.href = buildHofPageUrl(sr, targetPage);
                });
            }
            return button;
        };

        const previousButton = makeButton(
            '<< Previous',
            currentPageNumber - 1,
            currentPageNumber <= 1
        );

        const nextButton = makeButton(
            'Next >>',
            currentPageNumber + 1,
            currentPageNumber >= totalPages
        );

        const left = document.createElement('div');
        left.appendChild(previousButton);

        const center = document.createElement('div');
        center.appendChild(makeButton(
            '< Jump To Your Page >',
            playerPage,
            !playerPage || playerPage === currentPageNumber
        ));

        const right = document.createElement('div');
        right.appendChild(nextButton);

        document.addEventListener('keydown', event => {
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
            ) {
                return;
            }

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    target.closest('input, textarea, select, button, [contenteditable="true"]')
                )
            ) {
                return;
            }

            if (event.key === 'ArrowLeft' && !previousButton.disabled) {
                event.preventDefault();
                previousButton.click();
            } else if (event.key === 'ArrowRight' && !nextButton.disabled) {
                event.preventDefault();
                nextButton.click();
            }
        });

        nav.append(left, center, right);
        nativeTable.insertAdjacentElement('afterend', nav);
    }

    function parseHofTable(table, pageNumber) {
        const rows = [];

        for (const row of [...table.rows].slice(2)) {
            const cells = row.cells;
            if (!cells || cells.length !== 3) continue;

            const link = cells[0].querySelector('a[href*="ID="]');
            const id = HWUS_extractPlayerId(link);
            const name = normalizeSpace(link?.textContent || '');
            const skill = Number(normalizeSpace(cells[1].textContent).replace(/,/g, ''));
            const rallyLevel = normalizeSpace(cells[2].textContent);

            if (!id || !name || !Number.isFinite(skill) || !/^\d+$/.test(rallyLevel)) continue;

            rows.push({
                id,
                name,
                skill,
                rallyLevel,
                page: pageNumber
            });
        }

        return rows;
    }

    function getCurrentHofPageNumber() {
        const url = new URL(location.href);
        const pageParam = Number.parseInt(url.searchParams.get('page') || '0', 10);
        return Number.isFinite(pageParam) && pageParam >= 0 ? pageParam + 1 : 1;
    }

    function getTotalHofPages(content) {
        let maxPage = 1;

        for (const link of content.querySelectorAll('a[href*="cmd=hill3"][href*="do=hof"]')) {
            try {
                const url = new URL(link.href, location.href);
                const page = Number.parseInt(url.searchParams.get('page') || '0', 10) + 1;
                if (Number.isFinite(page)) maxPage = Math.max(maxPage, page);
            } catch {
                // Ignore malformed pagination links.
            }
        }

        return maxPage;
    }

    function buildHofPageUrl(sr, pageNumber) {
        const url = new URL(location.pathname, location.origin);
        if (sr) url.searchParams.set('sr', sr);
        url.searchParams.set('cmd', 'hill3');
        url.searchParams.set('do', 'hof');
        if (pageNumber > 1) url.searchParams.set('page', String(pageNumber - 1));
        return url.href;
    }

    function loadCartManifest() {
        try {
            const raw = GM_getValue(K_CART_MANIFEST, '{}');
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : {};
        } catch {
            return {};
        }
    }

    function saveCartManifest(manifest) {
        GM_setValue(K_CART_MANIFEST, JSON.stringify(manifest || {}));
    }

    function loadCartMeta() {
        try {
            const raw = GM_getValue(K_CART_META, '{}');
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const meta = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : {};

            return {
                lastGlobalUpdate: String(meta.lastGlobalUpdate || ''),
                lastGlobalUpdateAt: Number(meta.lastGlobalUpdateAt) || 0,
                lastSweepAttempt: Number(meta.lastSweepAttempt) || 0,
                totalPages: Number(meta.totalPages) || 0,
                failedPages: Array.isArray(meta.failedPages)
                    ? [...new Set(meta.failedPages.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
                    : [],
                manualResetKey: String(meta.manualResetKey || ''),
                manualPages: Array.isArray(meta.manualPages)
                    ? [...new Set(meta.manualPages.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
                    : [],
                manualComplete: meta.manualComplete === true
            };
        } catch {
            return {
                lastGlobalUpdate: '',
                lastGlobalUpdateAt: 0,
                lastSweepAttempt: 0,
                totalPages: 0,
                failedPages: [],
                manualResetKey: '',
                manualPages: [],
                manualComplete: false
            };
        }
    }

    function saveCartMeta(meta) {
        GM_setValue(K_CART_META, JSON.stringify(meta || {}));
    }

        function loadCartClassAdvances() {
        try {
            const raw = GM_getValue(K_CART_ADVANCES, '[]');
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCartClassAdvances(rows) {
        GM_setValue(K_CART_ADVANCES, JSON.stringify(Array.isArray(rows) ? rows : []));
    }

    function pruneCartClassAdvances(rows, now = Date.now()) {
        const cutoff = now - CART_ADVANCE_WINDOW_MS;
        return rows.filter(row => Number(row.detectedAt) >= cutoff);
    }

    function recordCartClassAdvance(prior, row, detectedAt) {
        const fromClass = Number(prior?.rallyLevel);
        const toClass = Number(row?.rallyLevel);
        if (!Number.isFinite(fromClass) || !Number.isFinite(toClass) || toClass <= fromClass) return;

        const advances = pruneCartClassAdvances(loadCartClassAdvances(), detectedAt);
        advances.push({
            type: 'class-advance',
            playerId: row.id,
            name: row.name,
            fromClass,
            toClass,
            detectedAt,
            detectedLabel: getGameDateTimeLabel()
        });
        saveCartClassAdvances(advances);
    }

    function recordCartNorthernFenceEntry(row, detectedAt, detectedLabel = '') {
        const toClass = Number(row?.rallyLevel);
        if (toClass !== 1) return;

        const advances = pruneCartClassAdvances(loadCartClassAdvances(), detectedAt);
        if (advances.some(entry =>
            entry?.type === 'nf-entry' && String(entry.playerId || '') === String(row.id || '')
        )) return;

        advances.push({
            type: 'nf-entry',
            playerId: row.id,
            name: row.name,
            fromLabel: 'Suicide Hill',
            toClass: 1,
            detectedAt,
            detectedLabel: detectedLabel || getGameDateTimeLabel()
        });
        saveCartClassAdvances(advances);
    }

    function reconcileRecentCartNorthernFenceEntries() {
        const meta = loadCartMeta();
        if (!(Number(meta.lastGlobalUpdateAt) > 0)) return;

        const now = Date.now();
        const cutoff = now - CART_ADVANCE_WINDOW_MS;
        const manifest = loadCartManifest();

        for (const [playerId, entry] of Object.entries(manifest)) {
            const firstSeenAt = Number(entry?.firstSeenAt) || 0;
            const lastSeenAt = Number(entry?.lastSeenAt) || 0;

            if (
                Number(entry?.rallyLevel) !== 1 ||
                firstSeenAt < cutoff ||
                firstSeenAt !== lastSeenAt
            ) {
                continue;
            }

            recordCartNorthernFenceEntry(
                {
                    id: playerId,
                    name: String(entry?.name || `Hobo ${playerId}`),
                    rallyLevel: '1'
                },
                firstSeenAt,
                formatCartAdvanceTimestamp(firstSeenAt)
            );
        }
    }

    function pruneCartSkillHistory(history, now = Date.now()) {
        const cutoff = now - CART_SKILL_HISTORY_RETENTION_MS;
        const seen = new Set();

        return (Array.isArray(history) ? history : [])
            .map(sample => {
                if (Array.isArray(sample)) {
                    return [Number(sample[0]), Number(sample[1])];
                }

                if (sample && typeof sample === 'object') {
                    return [
                        Number(sample.at ?? sample.timestamp),
                        Number(sample.skill)
                    ];
                }

                return null;
            })
            .filter(sample =>
                sample &&
                Number.isFinite(sample[0]) &&
                Number.isFinite(sample[1]) &&
                sample[0] >= cutoff &&
                sample[0] <= now
            )
            .sort((a, b) => a[0] - b[0])
            .filter(sample => {
                const key = `${sample[0]}|${sample[1]}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function normalizeCartSkillHistory(entry, now = Date.now()) {
        const history = Array.isArray(entry?.skillHistory)
            ? [...entry.skillHistory]
            : [];

        /*
         * One-time migration from the v4.30 manifest. These are real stored
         * observations, not fabricated history.
         */
        const legacySamples = [
            [Number(entry?.firstSeenAt), Number(entry?.firstSkill)],
            [Number(entry?.weekStartAt), Number(entry?.weekStartSkill)],
            [Number(entry?.lastSeenAt), Number(entry?.lastSkill)]
        ];

        for (const sample of legacySamples) {
            if (Number.isFinite(sample[0]) && Number.isFinite(sample[1])) {
                history.push(sample);
            }
        }

        return pruneCartSkillHistory(history, now);
    }

    function getCartRollingBaseline(history, now = Date.now()) {
        if (!Array.isArray(history) || !history.length) return null;

        const cutoff = now - CART_SKILL_WINDOW_MS;
        let best = null;
        let bestDistance = Infinity;

        for (const sample of history) {
            const at = Number(sample?.[0]);
            const skill = Number(sample?.[1]);
            if (!Number.isFinite(at) || !Number.isFinite(skill)) continue;

            const distance = Math.abs(at - cutoff);

            if (
                distance < bestDistance ||
                (
                    distance === bestDistance &&
                    best &&
                    at <= cutoff &&
                    best[0] > cutoff
                )
            ) {
                best = [at, skill];
                bestDistance = distance;
            }
        }

        return best;
    }

    function persistCartPage(pageNumber, rows, observedAt) {
        const manifest = loadCartManifest();
        const hasEstablishedBaseline = Number(loadCartMeta().lastGlobalUpdateAt) > 0;

        for (const row of rows) {
            const prior = manifest[row.id];

            if (!prior) {
                if (hasEstablishedBaseline) {
                    recordCartNorthernFenceEntry(row, observedAt);
                }

                manifest[row.id] = {
                    name: row.name,
                    rallyLevel: row.rallyLevel,
                    page: pageNumber,
                    firstSeenAt: observedAt,
                    firstSkill: row.skill,
                    lastSeenAt: observedAt,
                    lastSkill: row.skill,
                    skillHistory: [[observedAt, row.skill]]
                };
                continue;
            }

            recordCartClassAdvance(prior, row, observedAt);

            const skillHistory = normalizeCartSkillHistory(prior, observedAt);
            skillHistory.push([observedAt, row.skill]);

            manifest[row.id] = {
                ...prior,
                name: row.name,
                rallyLevel: row.rallyLevel,
                page: pageNumber,
                firstSeenAt: Number(prior.firstSeenAt) || observedAt,
                firstSkill: Number.isFinite(Number(prior.firstSkill))
                    ? Number(prior.firstSkill)
                    : row.skill,
                lastSeenAt: observedAt,
                lastSkill: row.skill,
                skillHistory: pruneCartSkillHistory(skillHistory, observedAt)
            };

            delete manifest[row.id].weekStartAt;
            delete manifest[row.id].weekStartSkill;
        }

        saveCartManifest(manifest);
        saveCartClassAdvances(pruneCartClassAdvances(loadCartClassAdvances(), observedAt));
    }

    function getCartResetKey() {
        const dateText = normalizeSpace(
            document.querySelector('.clock i')?.textContent || ''
        );
        const clockText = normalizeSpace(
            document.querySelector('#clock')?.textContent || ''
        );

        const dateMatch = dateText.match(
            /([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?/i
        );
        const timeMatch = clockText.match(
            /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)/i
        );

        if (dateMatch && timeMatch) {
            let hour = Number(timeMatch[1]) % 12;
            if (timeMatch[3].toLowerCase() === 'pm') hour += 12;

            const resetHalf = hour >= 12 ? '12' : '00';

            return [
                dateMatch[1].slice(0, 3).toUpperCase(),
                String(dateMatch[2]).padStart(2, '0'),
                resetHalf
            ].join('-');
        }

        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Australia/Brisbane',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date());

        const values = Object.fromEntries(
            parts.map(part => [part.type, part.value])
        );

        const hour = Number(values.hour) || 0;
        const resetHalf = hour >= 12 ? '12' : '00';

        return `${values.year}-${values.month}-${values.day}-${resetHalf}`;
    }

    function recordManualHofPageObservation(
        pageNumber,
        totalPages,
        observedAt
    ) {
        if (
            !Number.isFinite(pageNumber) ||
            !Number.isFinite(totalPages) ||
            pageNumber < 1 ||
            totalPages < 1
        ) {
            return;
        }

        const meta = loadCartMeta();
        const resetKey = getCartResetKey();

        if (meta.manualResetKey !== resetKey) {
            meta.manualResetKey = resetKey;
            meta.manualPages = [];
            meta.manualComplete = false;
        }

        meta.totalPages = totalPages;

        if (!meta.manualPages.includes(pageNumber)) {
            meta.manualPages.push(pageNumber);
            meta.manualPages.sort((a, b) => a - b);
        }

        if (!meta.manualComplete) {
            const complete = Array.from(
                { length: totalPages },
                (_, index) => index + 1
            ).every(page => meta.manualPages.includes(page));

            if (complete) {
                meta.manualComplete = true;
                meta.lastGlobalUpdate = getGameDateTimeLabel();
                meta.lastGlobalUpdateAt = observedAt;
                meta.failedPages = [];
            }
        }

        saveCartMeta(meta);
    }

    function resolveFailedPage(pageNumber) {
        const meta = loadCartMeta();
        if (!meta.failedPages.includes(pageNumber)) return;

        meta.failedPages = meta.failedPages.filter(page => page !== pageNumber);

        if (meta.failedPages.length === 0) {
            meta.lastGlobalUpdate = getGameDateTimeLabel();
            meta.lastGlobalUpdateAt = Date.now();
        }

        saveCartMeta(meta);
    }

    function getGameDateTimeLabel() {
        const dateText = normalizeSpace(document.querySelector('.clock i')?.textContent || '');
        const clockText = normalizeSpace(document.querySelector('#clock')?.textContent || '');
        const dateMatch = dateText.match(/([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?/i);
        const timeMatch = clockText.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)/i);

        if (dateMatch && timeMatch) {
            return `${String(dateMatch[2]).padStart(2, '0')} ${dateMatch[1].slice(0, 3).toUpperCase()} ${Number(timeMatch[1])}:${timeMatch[2]} ${timeMatch[3].toUpperCase()}`;
        }

        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Australia/Brisbane',
            day: '2-digit',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(new Date()).replace(',', '').toUpperCase();
    }

    function formatGlobalUpdateCooldown(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (totalSeconds >= 3600) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function renderGlobalUpdateState(timestampLine, button, failureBox, meta) {
        timestampLine.textContent = `Latest Complete Racing Skill Update: ${meta.lastGlobalUpdate || 'Never'}`;
        failureBox.replaceChildren();

        button.style.opacity = '';
        button.style.cursor = 'pointer';
        button.style.pointerEvents = '';

        if (meta.failedPages.length) {
            button.disabled = true;
            button.textContent = 'Complete';
            button.style.opacity = '0.55';
            button.style.cursor = 'default';
            button.style.pointerEvents = 'none';

            const cooldownNote = document.createElement('div');
            cooldownNote.textContent = 'Cooldown begins after failed pages are manually viewed.';

            const count = meta.failedPages.length;
            const first = document.createElement('div');
            first.textContent = `${count} Page(s) unsuccessfully updated.`;

            const second = document.createElement('div');
            second.appendChild(document.createTextNode('Failed page(s): '));

            meta.failedPages.forEach((pageNumber, index) => {
                if (index) second.appendChild(document.createTextNode(', '));
                const link = document.createElement('a');
                link.href = buildHofPageUrl(new URL(location.href).searchParams.get('sr') || '', pageNumber);
                link.textContent = String(pageNumber);
                second.appendChild(link);
            });
            second.appendChild(document.createTextNode('.'));

            const third = document.createElement('div');
            third.textContent = 'View failed pages to update manually.';

            failureBox.append(cooldownNote, first, second, third);
            return 0;
        }

        const lastGlobalUpdateAt = Number(meta.lastGlobalUpdateAt) || 0;
        const remainingMs = lastGlobalUpdateAt
            ? Math.max(0, CART_GLOBAL_UPDATE_COOLDOWN_MS - (Date.now() - lastGlobalUpdateAt))
            : 0;

        if (remainingMs > 0) {
            button.disabled = true;
            button.textContent = formatGlobalUpdateCooldown(remainingMs);
            button.style.opacity = '0.55';
            button.style.cursor = 'default';
            button.style.pointerEvents = 'none';
            return remainingMs;
        }

        button.disabled = false;
        button.textContent = 'Update All';
        return 0;
    }

    function renderCartSummary(container, manifest) {
        container.replaceChildren();

        const data = buildCartData(manifest);
        const totalCounts = {};
        const activeCounts = {};

        for (const row of data) {
            totalCounts[row.cls] = (totalCounts[row.cls] || 0) + 1;
            if (row.wgained >= CART_ACTIVE_WEEKLY_GAIN) {
                activeCounts[row.cls] = (activeCounts[row.cls] || 0) + 1;
            }
        }

        const table = document.createElement('table');
        table.align = 'center';
        table.width = '80%';
        table.cellSpacing = '2';
        table.cellPadding = '4';

        let totalActive = 0;
        const globalTotal = data.length;
        const classHeaders = [];
        const activeCells = [];
        const totalCells = [];

        for (let level = 1; level <= 10; level += 1) {
            const active = activeCounts[String(level)] || 0;
            const total = totalCounts[String(level)] || 0;
            totalActive += active;
            classHeaders.push(`<td bgcolor="#eeeeee" align="center"><strong>${level}</strong></td>`);
            activeCells.push(`<td bgcolor="#f0f0f0" align="center">${active}</td>`);
            totalCells.push(`<td bgcolor="#f0f0f0" align="center">${total}</td>`);
        }

        table.innerHTML = `
            <tbody>
                <tr>
                    <td bgcolor="#dddddd" colspan="12" align="center"><strong>Super-Cart Racing Skill Summary</strong></td>
                </tr>
                <tr>
                    <td bgcolor="#eeeeee" align="center"><strong>Class</strong></td>
                    ${classHeaders.join('')}
                    <td bgcolor="#eeeeee" align="center"><strong>Total</strong></td>
                </tr>
                <tr>
                    <td bgcolor="#eeeeee" align="center"><strong>Active</strong></td>
                    ${activeCells.join('')}
                    <td bgcolor="#e0e0e0" align="center"><strong>${totalActive}</strong></td>
                </tr>
                <tr>
                    <td bgcolor="#eeeeee" align="center"><strong>Racers</strong></td>
                    ${totalCells.join('')}
                    <td bgcolor="#e0e0e0" align="center"><strong>${globalTotal}</strong></td>
                </tr>
            </tbody>
        `;

        container.appendChild(table);
    }

    function renderCartControls(container, state, onChange) {
        container.replaceChildren();

        const filterLabel = document.createElement('label');
        filterLabel.style.fontWeight = 'bold';
        filterLabel.textContent = 'Filter by Class (Rally Level): ';

        const select = document.createElement('select');
        select.innerHTML = '<option value="All">All</option>';
        for (let level = 1; level <= 10; level += 1) {
            const option = document.createElement('option');
            option.value = String(level);
            option.textContent = String(level);
            select.appendChild(option);
        }
        select.value = state.filterClass;

        const weeklyLabel = document.createElement('label');
        weeklyLabel.style.marginLeft = '15px';
        weeklyLabel.style.fontSize = '12px';
        weeklyLabel.style.cursor = 'pointer';
        const weeklyBox = document.createElement('input');
        weeklyBox.type = 'checkbox';
        weeklyBox.checked = state.hideZeroWeekly;
        weeklyLabel.append(weeklyBox, document.createTextNode(' Hide 0 Weekly Gains'));

        const totalLabel = document.createElement('label');
        totalLabel.style.marginLeft = '15px';
        totalLabel.style.fontSize = '12px';
        totalLabel.style.cursor = 'pointer';
        const totalBox = document.createElement('input');
        totalBox.type = 'checkbox';
        totalBox.checked = state.hideZeroTotal;
        totalLabel.append(totalBox, document.createTextNode(' Hide 0 Total Gains'));

        select.addEventListener('change', () => onChange({
            ...state,
            filterClass: select.value,
            page: 1
        }));
        weeklyBox.addEventListener('change', () => onChange({
            ...state,
            hideZeroWeekly: weeklyBox.checked,
            page: 1
        }));
        totalBox.addEventListener('change', () => onChange({
            ...state,
            hideZeroTotal: totalBox.checked,
            page: 1
        }));

        container.append(filterLabel, select, weeklyLabel, totalLabel);
    }

    function renderCartSkillTable(table, pagination, manifest, state, onChange) {
        const data = sortCartData(buildCartData(manifest), state);
        const pageCount = Math.max(1, Math.ceil(data.length / CART_ITEMS_PER_PAGE));
        pagination.style.display = state.skillGainsOpen && pageCount > 1
            ? 'block'
            : 'none';
        const page = Math.min(Math.max(1, state.page), pageCount);
        const start = (page - 1) * CART_ITEMS_PER_PAGE;
        const pageRows = data.slice(start, start + CART_ITEMS_PER_PAGE);

        pagination.replaceChildren();

        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'btn';
        prev.textContent = '<< Previous';
        prev.disabled = page <= 1;

        const pageText = document.createElement('span');
        pageText.style.margin = '0 10px';
        pageText.style.fontWeight = 'bold';
        pageText.textContent = ` Page ${page} of ${pageCount} `;

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'btn';
        next.textContent = 'Next >>';
        next.disabled = page >= pageCount;

        prev.addEventListener('click', () => onChange({ ...state, page: page - 1 }));
        next.addEventListener('click', () => onChange({ ...state, page: page + 1 }));
        pagination.append(prev, pageText, next);

        const arrow = key => {
            if (state.sortBy !== key) return '<span style="color:#aaa;">▬</span>';
            return state.sortDir === 'asc' ? '▲' : '▼';
        };

        table.innerHTML = `
            <tbody>
                <tr>
                    <td bgcolor="#dddddd" colspan="7" align="center"><strong>Skill Gains</strong></td>
                </tr>
                <tr>
                    <td bgcolor="#eeeeee" align="center" width="20"><strong>#</strong></td>
                    <td bgcolor="#eeeeee"><strong>Hobo</strong></td>
                    <td bgcolor="#eeeeee" align="center"><strong>Class</strong></td>
                    <td bgcolor="#eeeeee" align="center" style="cursor:pointer;user-select:none;" data-cart-table-sort="CurrentSkill" title="Click to sort by Current Skill"><strong>Current Skill ${arrow('CurrentSkill')}</strong></td>
                    <td bgcolor="#eeeeee" align="center" style="cursor:pointer;user-select:none;" data-cart-table-sort="WeeklyGains" title="Click to sort by Weekly Gains"><strong>Weekly Gains ${arrow('WeeklyGains')}</strong></td>
                    <td bgcolor="#eeeeee" align="center" style="cursor:pointer;user-select:none;" data-cart-table-sort="TotalGains" title="Click to sort by Total Gains"><strong>Total Gains ${arrow('TotalGains')}</strong></td>
                    <td bgcolor="#eeeeee" align="center"><strong>Time Passed</strong></td>
                </tr>
            </tbody>
        `;

        const tbody = table.tBodies[0];

        pageRows.forEach((row, index) => {
            const tr = document.createElement('tr');
            const rank = start + index + 1;
            const weekly = formatCartGain(row.wgained);
            const total = formatCartGain(row.gained);

            tr.innerHTML = `
                <td bgcolor="#f0f0f0" align="center">${rank}</td>
                <td bgcolor="#f0f0f0"><a href="game.php?cmd=player&ID=${encodeURIComponent(row.id)}"></a></td>
                <td bgcolor="#f0f0f0" align="center">${row.cls}</td>
                <td bgcolor="#f0f0f0" align="center">${row.skill.toFixed(3)}</td>
                <td bgcolor="#f0f0f0" align="center" style="${row.wgained > 0 ? 'color:green;font-weight:bold;' : ''}">${weekly}</td>
                <td bgcolor="#f0f0f0" align="center" style="${row.gained > 0 ? 'color:green;font-weight:bold;' : ''}">${total}</td>
                <td bgcolor="#f0f0f0" align="center">${formatElapsed(row.firstSeenAt, row.lastSeenAt)}</td>
            `;
            tr.querySelector('a').textContent = row.name;
            tbody.appendChild(tr);
        });

        for (const header of table.querySelectorAll('[data-cart-table-sort]')) {
            header.addEventListener('click', () => {
                const sortBy = header.dataset.cartTableSort;
                const sortDir = state.sortBy === sortBy
                    ? (state.sortDir === 'desc' ? 'asc' : 'desc')
                    : 'desc';
                onChange({ ...state, sortBy, sortDir, page: 1 });
            });
        }
    }

    function renderCartClassAdvances(container) {
        container.replaceChildren();

        const now = Date.now();
        const realRows = pruneCartClassAdvances(loadCartClassAdvances(), now);
        saveCartClassAdvances(realRows);

        const rows = [...realRows].sort((a, b) =>
            (Number(b.toClass) - Number(a.toClass)) ||
            (Number(b.detectedAt) - Number(a.detectedAt))
        );

        const table = document.createElement('table');
        table.align = 'center';
        table.width = '80%';
        table.cellSpacing = '2';
        table.cellPadding = '4';
        table.style.margin = '8px auto 14px';

        table.innerHTML = `
            <tbody>
                <tr>
                    <td bgcolor="#dddddd" colspan="3" align="center"><strong>Which Racers Advanced</strong></td>
                </tr>
                <tr>
                    <td bgcolor="#eeeeee"><strong>Hobo</strong></td>
                    <td bgcolor="#eeeeee" align="center"><strong>Class Advance</strong></td>
                    <td bgcolor="#eeeeee" align="center"><strong>Detected Update</strong></td>
                </tr>
            </tbody>
        `;

        const tbody = table.tBodies[0];
        for (const row of rows) {
            const tr = document.createElement('tr');

            const hoboCell = document.createElement('td');
            hoboCell.bgColor = '#f0f0f0';
            if (row.playerId) {
                const link = document.createElement('a');
                link.href = `game.php?cmd=player&ID=${encodeURIComponent(row.playerId)}`;
                link.textContent = row.name;
                hoboCell.appendChild(link);
            } else {
                hoboCell.textContent = row.name;
            }

            const advanceCell = document.createElement('td');
            advanceCell.bgColor = '#f0f0f0';
            advanceCell.align = 'center';
            advanceCell.textContent = row.type === 'nf-entry'
                ? `${row.fromLabel || 'Suicide Hill'} → Class ${row.toClass}`
                : `${row.fromClass} → ${row.toClass}`;

            const detectedCell = document.createElement('td');
            detectedCell.bgColor = '#f0f0f0';
            detectedCell.align = 'center';
            detectedCell.textContent = row.detectedLabel || formatCartAdvanceTimestamp(row.detectedAt);

            tr.append(hoboCell, advanceCell, detectedCell);
            tbody.appendChild(tr);
        }

        if (!rows.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.bgColor = '#f0f0f0';
            td.align = 'center';
            td.textContent = 'No class advances detected within the past 7 days.';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        container.appendChild(table);
    }

    function formatCartAdvanceTimestamp(timestamp) {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Australia/Brisbane',
            day: '2-digit',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(new Date(timestamp)).replace(',', '').toUpperCase();
    }

    function buildCartData(manifest) {
        const now = Date.now();

        return Object.entries(manifest).map(([id, d]) => {
            const skill = Number(d.lastSkill);
            const firstSkill = Number(d.firstSkill);
            const history = normalizeCartSkillHistory(d, now);

            const lastSeenAt = Number(d.lastSeenAt) || 0;
            if (
                Number.isFinite(skill) &&
                lastSeenAt > 0 &&
                !history.some(sample =>
                    Number(sample?.[0]) === lastSeenAt &&
                    Number(sample?.[1]) === skill
                )
            ) {
                history.push([lastSeenAt, skill]);
            }

            const recentHistory = pruneCartSkillHistory(history, now);
            const baseline = getCartRollingBaseline(recentHistory, now);
            const rollingStartSkill = Number(baseline?.[1]);

            return {
                id,
                name: String(d.name || `Hobo ${id}`),
                cls: String(d.rallyLevel || ''),
                skill: Number.isFinite(skill) ? skill : 0,
                gained: Number.isFinite(skill) && Number.isFinite(firstSkill)
                    ? skill - firstSkill
                    : 0,
                wgained: Number.isFinite(skill) && Number.isFinite(rollingStartSkill)
                    ? skill - rollingStartSkill
                    : 0,
                firstSeenAt: Number(d.firstSeenAt) || 0,
                lastSeenAt
            };
        });
    }

    function sortCartData(data, state) {
        return data
            .filter(row => {
                if (state.filterClass !== 'All' && row.cls !== state.filterClass) return false;
                if (state.hideZeroWeekly && row.wgained <= 0) return false;
                if (state.hideZeroTotal && row.gained <= 0) return false;
                return true;
            })
            .sort((a, b) => {
                let diff;
                if (state.sortBy === 'WeeklyGains') diff = b.wgained - a.wgained;
                else if (state.sortBy === 'CurrentSkill') diff = b.skill - a.skill;
                else diff = b.gained - a.gained;

                if (diff === 0) diff = b.skill - a.skill;
                return state.sortDir === 'asc' ? -diff : diff;
            });
    }

    function formatCartGain(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '0.000';
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toFixed(3)}`;
    }

    function formatElapsed(firstSeenAt, lastSeenAt) {
        if (!firstSeenAt || !lastSeenAt || lastSeenAt < firstSeenAt) return '0h';
        const totalHours = Math.floor((lastSeenAt - firstSeenAt) / 3600000);
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    }

    function loadCartUiState() {
        return {
            filterClass: sessionStorage.getItem('hwus_cart_filter') || 'All',
            sortBy: sessionStorage.getItem('hwus_cart_sort') || 'TotalGains',
            sortDir: sessionStorage.getItem('hwus_cart_sort_dir') || 'desc',
            page: Number.parseInt(sessionStorage.getItem('hwus_cart_page') || '1', 10) || 1,
            hideZeroWeekly: sessionStorage.getItem('hwus_cart_hide_zw') === 'true',
            hideZeroTotal: sessionStorage.getItem('hwus_cart_hide_zt') === 'true',
            skillGainsOpen: sessionStorage.getItem('hwus_cart_skill_open') === 'true',
            advancesOpen: sessionStorage.getItem('hwus_cart_advances_open') === 'true'
        };
    }

    function saveCartUiState(state) {
        sessionStorage.setItem('hwus_cart_filter', state.filterClass);
        sessionStorage.setItem('hwus_cart_sort', state.sortBy);
        sessionStorage.setItem('hwus_cart_sort_dir', state.sortDir);
        sessionStorage.setItem('hwus_cart_page', String(state.page));
        sessionStorage.setItem('hwus_cart_hide_zw', String(state.hideZeroWeekly));
        sessionStorage.setItem('hwus_cart_hide_zt', String(state.hideZeroTotal));
        sessionStorage.setItem('hwus_cart_skill_open', String(state.skillGainsOpen));
        sessionStorage.setItem('hwus_cart_advances_open', String(state.advancesOpen));
    }

    function injectCartTrackerStyles() {
        if (document.getElementById('hwus-cart-tracker-styles')) return;

        const style = document.createElement('style');
        style.id = 'hwus-cart-tracker-styles';
        style.textContent = `
            #hwus-cart-global-tracker {
                margin: 14px 0 12px;
                text-align: center;
            }
            .hwus-cart-hof-nav {
                width: 80%;
                margin: 8px auto 0;
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                align-items: center;
            }
            .hwus-cart-hof-nav > div:first-child { text-align: left; }
            .hwus-cart-hof-nav > div:nth-child(2) { text-align: center; }
            .hwus-cart-hof-nav > div:last-child { text-align: right; }
            .hwus-cart-header-grid {
                margin: 8px auto 4px;
                display: block;
                font-weight: bold;
                font-size: 13px;
            }
            .hwus-cart-global-time {
                text-align: center;
                white-space: nowrap;
            }
            .hwus-cart-update-action {
                text-align: center;
            }
            .hwus-cart-header-grid .btn {
                font: inherit;
            }
            .hwus-cart-failures {
                width: 80%;
                margin: 4px auto 7px;
                color: #800;
                font-size: 11px;
                line-height: 1.35;
                font-weight: normal;
                text-align: center;
            }
            .hwus-cart-summary-wrap {
                margin: 6px 0 8px;
                font-size: 12px;
                text-align: center;
            }
            .hwus-cart-controls,
            .hwus-cart-pagination {
                margin-bottom: 8px;
                text-align: center;
            }
            .hwus-cart-section-toggle {
                margin: 0 auto 8px;
            }
            .hwus-cart-advances-toggle {
                margin-left: 20px;
            }
            .hwus-cart-advances-wrap {
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    function loadPikieEntries() {
        try {
            const v = JSON.parse(GM_getValue(K_PIKIE_ENTRIES, '[]'));
            return Array.isArray(v) ? v : [];
        } catch {
            return [];
        }
    }

    function savePikieEntries(rows) {
        GM_setValue(K_PIKIE_ENTRIES, JSON.stringify(rows));
    }

    function loadPikiePending() {
        try {
            const v = JSON.parse(GM_getValue(K_PIKIE_PENDING, '{}'));
            return v && typeof v === 'object' ? v : {};
        } catch {
            return {};
        }
    }

    function savePikiePending(v) {
        GM_setValue(K_PIKIE_PENDING, JSON.stringify(v || {}));
    }

    function constrainPikieSelectorTable() {
        const raceLink = document.querySelector('a[href*="do=npc_race&ID="]');
        const selectorTable = raceLink?.closest('table');
        if (!selectorTable) return;

        selectorTable.style.maxWidth = `calc(100% - ${PIKIE_PANEL_W + 12}px)`;
        selectorTable.style.margin = '0 auto 0 0';
    }

    function bindPikieSelector(ctx) {
        const ticketsLeft = parsePikieTicketsLeft(ctx.text);
        const raceLinks = Array.from(document.querySelectorAll('a[href*="do=npc_race&ID="]'));

        raceLinks.forEach((a, index) => {
            if (a.dataset.piklBound === '1') return;
            a.dataset.piklBound = '1';

            a.addEventListener('click', () => {
                const tr = a.closest('tr');
                if (!tr) return;

                const cells = tr.querySelectorAll('td');
                if (cells.length < 6) return;

                const pikieName = normalizeSpace(cells[0].textContent);
                const level = parseInt(normalizeSpace(cells[1].textContent), 10) || 0;
                const cost = parseMoney(cells[4].textContent);

                const idMatch = String(a.href).match(/[?&]ID=(\d+)(?:[&#]|$)/i);
                const npcId = idMatch ? parseInt(idMatch[1], 10) : 0;

                const clockEl = document.querySelector('#clock');
                const serverNow = clockEl ? parseClock(clockEl.textContent || '') : null;
                const pageText = document.body ? (document.body.textContent || '') : '';
                const monthText = getMonthText(pageText);
                const dayText = String(getDayText(pageText)).padStart(2, '0');

                savePikiePending({
                    pikieName,
                    npcId,
                    level,
                    cost,
                    rowIndex: index + 1,
                    ticketsLeftBefore: ticketsLeft,
                    dateKey: `${dayText} ${monthText}`,
                    clickTime: serverNow ? `${pad(serverNow.h)}:${pad(serverNow.m)}:${pad(serverNow.s)}` : '00:00:00'
                });
            });
        });
    }

    function parsePikieTicketsLeft(text) {
        const m = String(text || '').match(/You currently have\s+(\d+)\s+tickets?\s+left/i);
        return m ? parseInt(m[1], 10) : null;
    }

    function parsePikieResult(ctx) {
        const raw = `${ctx.html}\n${ctx.text}`;
        if (!/You won the race!/i.test(raw)) return null;

        const skillMatch = raw.match(/Skill gained:\s*([0-9]+(?:\.[0-9]+)?)/i);
        const cashMatch = raw.match(/Cash:\s*\$([0-9,]+)/i);
        const tokenMatch = raw.match(/Tokens:\s*\+([0-9,]+)/i);
        if (!skillMatch || !cashMatch || !tokenMatch || !ctx.now) return null;

        const pending = loadPikiePending();
        const idMatch = String(ctx.href).match(/[?&]ID=(\d+)(?:[&#]|$)/i);
        const npcId = idMatch ? parseInt(idMatch[1], 10) : (pending.npcId || 0);
        const pikieName = pending.pikieName || pikieNameFromId(npcId);

        const timeText = `${pad(ctx.now.h)}:${pad(ctx.now.m)}:${pad(ctx.now.s)}`;
        const dateKey = `${ctx.dayText} ${ctx.monthText}`;
        const secondKey = `${dateKey}-${timeText}`;

        return {
            dateKey,
            timeText,
            pikieName,
            npcId,
            skill: parseFloat(skillMatch[1]),
            cash: parseInt(String(cashMatch[1]).replace(/,/g, ''), 10),
            tokens: parseInt(String(tokenMatch[1]).replace(/,/g, ''), 10),
            secondKey,
            level: pending.level || null,
            cost: pending.cost || null,
            rowIndex: pending.rowIndex || null,
            ticketsLeftBefore: pending.ticketsLeftBefore ?? null
        };
    }

    function pikieNameFromId(id) {
        const map = {
            1: 'Old Creepy Pikie',
            2: 'Joe Smoe',
            3: 'Edge',
            4: 'Spike',
            5: 'Bruno',
            6: 'Rasta Man',
            7: 'Jack the Cart Racer',
            8: 'Old Thug'
        };
        return map[id] || `Pikie #${id || '?'}`;
    }

    function parseMoney(s) {
        const m = String(s || '').match(/\$([0-9,]+)/);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
    }

    function ensureMetamorphousFont() {
        if (document.getElementById('hwus-font-metamorphous')) return;

        const link = document.createElement('link');
        link.id = 'hwus-font-metamorphous';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Metamorphous&display=swap';
        document.head.appendChild(link);
    }

    function renderPikie(rows) {
        removeNode('pikl-panel');
        removeNode('pikl-box');
        removeNode('pikl-controls');
        removeNode('pikl-footer');

        const content = document.querySelector('.content-area');
        if (!content) return;

        const panel = document.createElement('aside');
        panel.id = 'pikl-panel';
        panel.style.cssText = [
            'float:right',
            `width:${PIKIE_PANEL_W}px`,
            'max-height:calc(100vh - 125px)',
            'max-height:-webkit-fill-available',
            'margin:0 0 10px 12px',
            'box-sizing:border-box',
            'display:flex',
            'flex-direction:column',
            'font-family:Consolas,monospace',
            'font-size:10px',
            'line-height:1.2',
            'color:#f4f4f4'
        ].join(';');

        const box = document.createElement('div');
        box.id = 'pikl-box';
        box.style.cssText = [
            'min-height:0',
            'flex:1 1 auto',
            'padding:2px',
            'background:rgba(0,0,0,0.95)',
            'border:1px solid #2f2f2f',
            'outline:1.5px solid #afc',
            'border-radius:3px',
            'display:flex',
            'flex-direction:column',
            'box-sizing:border-box'
        ].join(';');

        const headerWrap = document.createElement('div');
        headerWrap.style.padding = '1px 4px 0px';
        headerWrap.style.borderBottom = '1px solid #1f1f1f';
        headerWrap.style.textAlign = 'right';
        headerWrap.style.flex = '0 0 auto';
        headerWrap.style.backgroundColor = '#efefef';
        headerWrap.style.color = '#000000';
        headerWrap.style.fontWeight = 'bold';
        headerWrap.style.fontSize = '14px';
        headerWrap.textContent = '< Skill >';

        const body = document.createElement('div');
        body.style.flex = '1 1 auto';
        body.style.minHeight = '0';
        body.style.overflowY = 'auto';
        body.style.padding = '2px 3px 2px 5px';

        const groups = groupPikieRows(rows);
        groups.forEach((g, i) => {
            if (i > 0) body.appendChild(makeSeparator());
            body.appendChild(makePikieHeaderRow(g.dateKey, g.pikieName));
            g.rows.forEach(r => body.appendChild(makePikieEventRow(r)));
            body.appendChild(makePikieTotalRow(g.totals));
        });

        const footer = document.createElement('div');
        footer.id = 'pikl-footer';
        footer.style.cssText = [
            'flex:0 0 auto',
            'margin-top:4px',
            'background:rgba(0,0,0,0.95)',
            'border:1px solid #2f2f2f',
            'outline:2px outset #0bf',
            'border-radius:3px',
            'padding:5px 3px 3px',
            'box-sizing:border-box',
            'font-family:Metamorphous,monospace',
            'font-size:9.8px',
            'font-weight:bold',
            'line-height:1.3',
            'color:#d8d8d8'
        ].join(';');
        footer.appendChild(makePikieGrandTotalRow(makePikieTotals(rows)));

        const controls = document.createElement('div');
        controls.id = 'pikl-controls';
        controls.style.cssText = [
            'flex:0 0 auto',
            'display:flex',
            'justify-content:center',
            'margin-top:6px',
            'padding:3px 0',
            'background:rgba(20,20,20,.75)',
            'outline:2px inset #8bfb',
            'border-radius:3px'
        ].join(';');

        const clearBtn = makeBtn('Clear');
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            savePikieEntries([]);
            GM_setValue(K_PIKIE_PENDING, '');
            GM_setValue(K_PIKIE_LAST_FP, '');
            renderPikie([]);
        });

        controls.appendChild(clearBtn);
        box.append(headerWrap, body);
        panel.append(box, footer, controls);
        content.insertBefore(panel, content.firstChild);
    }

    function makeBtn(label) {
        const btn = document.createElement('a');
        btn.href = '#';
        btn.className = 'btn light-blue hover-green';
        btn.textContent = label;
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = 'auto';
        btn.style.height = 'auto';
        btn.style.whiteSpace = 'nowrap';
        btn.style.fontSize = '13px';
        btn.style.textTransform = 'uppercase';
        btn.style.padding = '5px 10px';
        return btn;
    }

    function groupPikieRows(rows) {
        const map = new Map();

        rows.forEach(r => {
            const key = `${r.dateKey}|${r.pikieName}`;
            if (!map.has(key)) {
                map.set(key, {
                    dateKey: r.dateKey,
                    pikieName: r.pikieName,
                    rows: [],
                    totals: { skill: 0, cash: 0, tokens: 0 }
                });
            }

            const g = map.get(key);
            g.rows.push(r);
            g.totals.skill += r.skill || 0;
            g.totals.cash += r.cash || 0;
            g.totals.tokens += r.tokens || 0;
        });

        return Array.from(map.values());
    }

    function makePikieHeaderRow(dateKey, pikieName) {
        const row = document.createElement('div');
        row.style.whiteSpace = 'nowrap';
        row.style.overflow = 'hidden';
        row.style.textOverflow = 'ellipsis';
        row.style.minWidth = '0';
        row.style.fontWeight = 'bold';
        row.style.fontSize = '12px';
        row.style.color = '#fda';
        row.style.textDecoration = 'underline solid #efefef';
        row.textContent = `${dateKey} < ${pikieName} >`;
        row.title = row.textContent;
        return row;
    }

    function makePikieEventRow(r) {
        const row = document.createElement('div');
        row.style.whiteSpace = 'pre';
        row.style.fontSize = '12px';
        row.style.textAlign = 'right';

        const skillText = Number(r.skill || 0).toFixed(3).padStart(5, ' ');
        const cashText = `$${Number(r.cash || 0).toLocaleString()}`.padStart(8, ' ');
        const tokenText = `+${Number(r.tokens || 0).toLocaleString()}`.padStart(5, ' ');

        row.textContent = `  ${r.timeText} < ${skillText} >`;
        return row;
    }

    function makePikieTotalRow(t) {
        const row = document.createElement('div');
        row.style.whiteSpace = 'pre';
        row.style.color = '#ffffff';
        row.style.textAlign = 'right';
        row.style.fontSize = '13px';

        const skillText = t.skill.toFixed(3).padStart(5, ' ');
        const cashText = `$${Number(t.cash || 0).toLocaleString()}`.padStart(8, ' ');
        const tokenText = `+${Number(t.tokens || 0).toLocaleString()}`.padStart(5, ' ');

        row.textContent = `< ${skillText} >`;
        return row;
    }

    function makePikieGrandTotalRow(t) {
        const row = document.createElement('div');
        row.style.whiteSpace = 'pre';
        row.style.fontSize = '13px';
        row.style.textAlign = 'center';

        const skillText = t.skill.toFixed(3).padStart(5, ' ');
        const cashText = `$${Number(t.cash || 0).toLocaleString()}`.padStart(8, ' ');
        const tokenText = `+${Number(t.tokens || 0).toLocaleString()}`.padStart(5, ' ');

        row.textContent = ` Total < ${skillText} >`;
        return row;
    }

    function makePikieTotals(rows) {
        return rows.reduce((a, r) => {
            a.skill += r.skill || 0;
            a.cash += r.cash || 0;
            a.tokens += r.tokens || 0;
            return a;
        }, { skill: 0, cash: 0, tokens: 0 });
    }

    function getFilenameDateTime() {
        const clockEl = document.querySelector('#clock');
        const clockText = clockEl ? clockEl.innerText.replace(/\s+/g, ' ').trim() : '';
        const clockMatch = clockText.match(/(\d{1,2}):(\d{2}):\d{2}\s*([ap]m)/i);

        let hour = 0;
        let minute = '00';

        if (clockMatch) {
            hour = parseInt(clockMatch[1], 10);
            minute = String(clockMatch[2]).padStart(2, '0');
            const ap = clockMatch[3].toLowerCase();

            if (ap === 'am') {
                if (hour === 12) hour = 0;
            } else if (hour !== 12) {
                hour += 12;
            }
        }

        hour = String(hour).padStart(2, '0');

        const pageText = document.body ? document.body.innerText.replace(/\s+/g, ' ') : '';
        const monthMatch = pageText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
        const dayMatch = pageText.match(/\b([1-9]|[12]\d|3[01])(st|nd|rd|th)\b/i);

        const monthMap = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };

        const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : '00';
        const day = dayMatch ? String(dayMatch[1]).padStart(2, '0') : '00';

        return `${month}-${day} ${hour}:${minute}`;
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function makeSeparator() {
        const sep = document.createElement('div');
        sep.style.whiteSpace = 'pre';
        sep.style.color = '#777';
        sep.textContent = '='.repeat(24);
        return sep;
    }

    function removeNode(id) {
        const node = document.getElementById(id);
        if (node) node.remove();
    }

    function normalizeSpace(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function parseClock(s) {
        const m = String(s || '').match(/(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)/i);
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

    function getMonthText(text) {
        const m = String(text || '').match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
        return m ? m[1].slice(0, 3).toUpperCase() : 'UNK';
    }

    function getDayText(text) {
        const m = String(text || '').match(/\b([1-9]|[12]\d|3[01])(st|nd|rd|th)\b/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    function pad(n) {
        return String(n).padStart(2, '0');
    }
})();

// ============================================================================
// MODULE 6: WELLNESS AID
// Adds a table that projects the next 5 Wellness Visit costs & logs daily use.
// ============================================================================
(function () {
    'use strict';

    if (!HWUS_isModuleEnabled(6)) return;

    const STORAGE_SCHEMA = '1';

    const K_PENDING = `hwa_pending_withdrawal_schema_${STORAGE_SCHEMA}`;
    const K_DAILY_LOG = `hwa_daily_log_schema_${STORAGE_SCHEMA}`;
    const K_COLLAPSED = `hwa_log_collapsed_schema_${STORAGE_SCHEMA}`;

    const MAX_DAILY_LOG_ROWS = 120;
    const PLAN_ROWS = 5;

    const href = String(location.href || '');
    const isWellness = /[?&]cmd=wellness_clinic(?:[&#]|$|&)/i.test(href);
    const isWellnessPay = isWellness && /[?&]do=pay(?:[&#]|$|&)/i.test(href);
    const isBank = /[?&]cmd=bank(?:[&#]|$|&)/i.test(href);

    if (!isWellness && !isBank) return;

    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    const contentArea = document.querySelector('.content-area');
    const dayKey = getWellnessDayKey();
    const clockText = getClockText();

    if (isWellness) {
        runWellnessMode();
        return;
    }

    if (isBank) {
        runBankMode();
    }

    function runWellnessMode() {
        const paidCost = parsePlopDownCost(bodyText);

        if (Number.isFinite(paidCost)) {
            updateDailyLogFromPaidCost(paidCost);
        }

        const nextCost = parseNextTreatmentCost(bodyText);
        const inferred = Number.isFinite(nextCost)
        ? inferFromCost(nextCost)
        : null;

        if (!Number.isFinite(paidCost) && inferred) {
            syncDailyLogFromObservedVisits(inferred.usedBefore);
        }

        const insufficientCash = isInsufficientCashPage(bodyText);

        renderWellnessPanel({
            nextCost,
            inferred,
            paidCost,
            insufficientCash
        });
    }

    function runBankMode() {
        const input = document.querySelector('#w_money');
        if (!input) return;

        const pending = loadPending();
        if (!pending || !Number.isFinite(pending.amount) || pending.amount <= 0) return;

        renderBankHelper(input, pending);
    }

    function renderWellnessPanel(ctx) {
        if (!contentArea) return;
        if (document.querySelector('#hwa-panel')) return;

        injectStyle();

        const log = loadDailyLog();

        if (ctx.insufficientCash) {
            renderInsufficientCashPanel(log);
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'hwa-panel';
        panel.className = 'hwa-panel';

        const title = document.createElement('div');
        title.className = 'hwa-title';

        if (ctx.inferred) {
            const usedToday = ctx.inferred.usedBefore;
            const nextVisit = usedToday + 1;
            const paidToday = totalSpentThroughVisit(usedToday);

            const summary = document.createElement('div');
            summary.className = 'hwa-summary';
            summary.textContent =
                `${formatMoney(paidToday)}`;
            const summaryText = document.createElement('span');
            summaryText.style.fontWeight = 'normal';
            summaryText.textContent = ' Paid Today.';
            summary.appendChild(summaryText);
            panel.appendChild(summary);

            panel.appendChild(renderPlanTable(nextVisit));
        } else if (!Number.isFinite(ctx.paidCost)) {
            const warn = document.createElement('div');
            warn.className = 'hwa-warn';
            warn.textContent = 'Wellness Clinic treatment refused.';
            panel.appendChild(warn);
        }

        if (Number.isFinite(ctx.paidCost)) {
            const paid = document.createElement('div');
            paid.className = 'hwa-paid-note';
            paid.textContent = `Confirmed: ${formatMoney(ctx.paidCost)}`;
            panel.appendChild(paid);
        }

        panel.appendChild(renderDailyLog(log));

        contentArea.appendChild(panel);
    }

    function renderInsufficientCashPanel(log) {
        if (!contentArea) return;
        if (document.querySelector('#hwa-panel')) return;

        injectStyle();

        const panel = document.createElement('div');
        panel.id = 'hwa-panel';
        panel.className = 'hwa-panel hwa-compact-panel';

        const title = document.createElement('div');
        title.className = 'hwa-title';
        title.textContent = '';
        panel.appendChild(title);

        const today = getTodayLogEntry(log);

        const line = document.createElement('pre');
        line.className = 'hwa-compact-log-line';
        line.textContent = today
            ? formatDailyLogLine(today)
        : `${dayKey} < Visits  0 | Paid $0 >`;

        panel.appendChild(line);
        contentArea.appendChild(panel);
    }

    function renderPlanTable(nextVisit) {
        const wrap = document.createElement('div');
        wrap.className = 'hwa-table-wrap';

        const table = document.createElement('table');
        table.className = 'hwa-table';

        const thead = document.createElement('thead');
        thead.innerHTML =
            '<tr>' +
            '<th>Plan</th>' +
            '<th>Treatment</th>' +
            '<th>Bank +</th>' +
            '</tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const pending = loadPending();

        for (let visits = 1; visits <= PLAN_ROWS; visits += 1) {
            const fromVisit = nextVisit;
            const throughVisit = nextVisit + visits - 1;
            const amount = cumulativeCostFromVisit(fromVisit, visits);
            const coverage = wellnessCostForVisit(throughVisit);

            const isPersisted =
                  pending &&
                  Number.isFinite(pending.amount) &&
                  pending.amount === amount &&
                  pending.fromVisit === fromVisit &&
                  pending.throughVisit === throughVisit;

            const tr = document.createElement('tr');
            tr.className = `hwa-click-row${isPersisted ? ' hwa-persisted' : ''}`;

            const covers = visits === 1
            ? `${fromVisit}`
                : `${fromVisit} to ${throughVisit}`;

            tr.innerHTML =
                `<td>${covers}</td>` +
                `<td>${formatMoney(coverage)}</td>` +
                `<td>${formatMoney(amount)}</td>`;

            tr.addEventListener('click', function () {
                const existing = loadPending();

                const alreadyPersisted =
                      existing &&
                      Number.isFinite(existing.amount) &&
                      existing.amount === amount &&
                      existing.fromVisit === fromVisit &&
                      existing.throughVisit === throughVisit;

                const note = document.querySelector('#hwa-pending-note');

                if (alreadyPersisted) {
                    clearPending();
                    markPersistedRow(tbody, null);

                    if (note) {
                        note.textContent = 'Click a row to store it.';
                    }

                    return;
                }

                const pending = {
                    dayKey,
                    visits,
                    fromVisit,
                    throughVisit,
                    amount,
                    selectedAt: Date.now()
                };

                savePending(pending);
                markPersistedRow(tbody, tr);

                if (note) {
                    note.textContent =
                        `Pending Bank +: ${formatMoney(amount)} for ${covers}`;
                }
            });

            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        wrap.appendChild(table);

        const note = document.createElement('div');
        note.id = 'hwa-pending-note';
        note.className = 'hwa-note';

        if (pending && Number.isFinite(pending.amount)) {
            note.textContent =
                `Pending Bank +: ${formatMoney(pending.amount)} for ${pending.fromVisit}` +
                `${pending.throughVisit && pending.throughVisit !== pending.fromVisit ? ` to ${pending.throughVisit}` : ''}`;
        } else {
            note.textContent = 'Click a row to store it.';
        }

        wrap.appendChild(note);
        return wrap;
    }

    function markPersistedRow(tbody, selectedRow) {
        for (const row of tbody.querySelectorAll('tr')) {
            row.classList.toggle('hwa-persisted', row === selectedRow);
        }
    }

    function renderDailyLog(log) {
        const outer = document.createElement('div');
        outer.className = 'hwa-log';

        const header = document.createElement('div');
        header.className = 'hwa-log-header';

        const left = document.createElement('span');
        left.textContent = 'Daily Expense Log';
        left.style.fontSize = '15px';

        const right = document.createElement('span');
        right.style.display = 'flex';
        right.style.flexDirection = 'row';
        right.style.gap = '5px';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'hwa-mini-btn';
        toggle.textContent = loadCollapsed() ? ' SHOW ' : ' HIDE ';

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'hwa-mini-btn';
        copy.textContent = ' COPY ';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'hwa-mini-btn';
        clear.textContent = ' CLEAR';

        right.appendChild(toggle);
        right.appendChild(copy);
        right.appendChild(clear);

        header.appendChild(left);
        header.appendChild(right);
        outer.appendChild(header);

        const pre = document.createElement('pre');
        pre.className = 'hwa-log-pre';
        pre.textContent = formatExportLog(log);

        if (loadCollapsed()) {
            pre.style.display = 'none';
        }

        toggle.addEventListener('click', function () {
            const collapsed = !loadCollapsed();
            saveCollapsed(collapsed);
            pre.style.display = collapsed ? 'none' : '';
            toggle.textContent = collapsed ? ' SHOW ' : ' HIDE ';
        });

        copy.addEventListener('click', function () {
            const text = formatExportLog(loadDailyLog());
            copyText(text);
            copy.textContent = 'COPIED';
            window.setTimeout(function () {
                copy.textContent = ' COPY ';
            }, 1000);
        });

        clear.addEventListener('click', function () {
            if (!confirm('Clear the Wellness Clinic expense log?')) return;

            saveDailyLog([]);
            pre.textContent = formatExportLog([]);

            clear.textContent = 'CLEARED';
            window.setTimeout(function () {
                clear.textContent = ' CLEAR ';
            }, 900);
        });

        outer.appendChild(pre);
        return outer;
    }

    function getTodayLogEntry(log) {
        return Array.isArray(log)
            ? log.find(row => row && row.dayKey === dayKey) || null
        : null;
    }

    function renderBankHelper(input, pending) {
        if (document.querySelector('#hwa-bank-helper')) return;

        injectStyle();

        const helper = document.createElement('div');
        helper.id = 'hwa-bank-helper';
        helper.className = 'hwa-bank-helper';

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'hwa-bank-btn';
        add.textContent = `+ Wellness (${formatMoney(pending.amount)})`;

        add.addEventListener('click', function () {
            const current = parseMoneyInt(input.value) || 0;
            input.value = String(current + pending.amount);

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            clearPending();

            helper.textContent = `Added ${formatMoney(pending.amount)}.`;
            helper.classList.add('hwa-bank-done');
        });

        helper.appendChild(add);

        const form = input.closest('form');
        const controls = form
            ? [...form.querySelectorAll('button, input[type="submit"], input[type="button"]')]
            : [];
        const withdraw = controls.find(control =>
            normalizeSpace(control.value || control.textContent).toLowerCase() === 'withdraw'
        );

        if (withdraw) {
            withdraw.insertAdjacentElement('afterend', helper);
        } else {
            input.insertAdjacentElement('afterend', helper);
        }
    }

    function updateDailyLogFromPaidCost(paidCost) {
        const inferred = inferFromCost(paidCost);

        if (!inferred) {
            renderParseWarning(`Paid cost ${formatMoney(paidCost)} is unexpected.`);
            return false;
        }

        const completedVisit = inferred.visit;
        const expectedCost = wellnessCostForVisit(completedVisit);

        if (expectedCost !== paidCost) {
            renderParseWarning(
                `Unexpected: Visit ${completedVisit} should have said ${formatMoney(expectedCost)}, said ${formatMoney(paidCost)}.`
      );
            return false;
        }

        const paidTotal = totalSpentThroughVisit(completedVisit);

        upsertDailyLogEntry({
            dayKey,
            visitsPaid: completedVisit,
            paidTotal,
            lastCost: paidCost,
            source: 'paid-confirmation',
            time: clockText
        });

        return true;
    }

    function syncDailyLogFromObservedVisits(visitsPaid) {
        const n = toInt(visitsPaid);

        if (n < 0) return false;

        const old = getTodayLogEntry(loadDailyLog());

        // Avoid creating a zero-visit row just because the Clinic page was opened.
        if (!old && n <= 0) return false;

        upsertDailyLogEntry({
            dayKey,
            visitsPaid: n,
            paidTotal: totalSpentThroughVisit(n),
            source: 'next-cost-observation',
            time: clockText
        });

        return true;
    }

    function upsertDailyLogEntry(entry) {
        const log = loadDailyLog();
        const idx = log.findIndex(row => row && row.dayKey === entry.dayKey);

        const visitsPaid = Math.max(0, toInt(entry.visitsPaid));
        const paidTotal = Number.isFinite(entry.paidTotal)
        ? entry.paidTotal
        : totalSpentThroughVisit(visitsPaid);

        if (idx >= 0) {
            const old = log[idx] || {};
            log.splice(idx, 1);

            log.unshift({
                ...old,
                ...entry,
                visitsPaid,
                paidTotal,
                lastCost: Number.isFinite(entry.lastCost) ? entry.lastCost : old.lastCost,
                time: entry.time || old.time || ''
            });
        } else {
            log.unshift({
                ...entry,
                visitsPaid,
                paidTotal
            });
        }

        if (log.length > MAX_DAILY_LOG_ROWS) log.length = MAX_DAILY_LOG_ROWS;
        saveDailyLog(log);
    }

    function parseNextTreatmentCost(text) {
        const norm = normalizeSpace(text);
        const m = norm.match(/next treatment will be\s+\$([\d,]+)/i);
        return m ? parseMoneyInt(m[1]) : null;
    }

    function parsePlopDownCost(text) {
        const norm = normalizeSpace(text);
        const m = norm.match(/plop down\s+\$([\d,]+)\s+on the counter/i);
        return m ? parseMoneyInt(m[1]) : null;
    }

    function isInsufficientCashPage(text) {
        return /You don't have enough cash\./i.test(normalizeSpace(text));
    }

    function inferFromCost(cost) {
        if (!Number.isFinite(cost)) return null;

        const x2 = (cost - 2500) / 10000;
        if (x2 < 0) return null;

        const root = Math.sqrt(x2);
        const usedBefore = Math.round(root);

        if (Math.abs(root - usedBefore) > 0.000001) return null;

        return {
            usedBefore,
            visit: usedBefore + 1
        };
    }

    function wellnessCostForVisit(visitNumber) {
        const usedBeforeVisit = visitNumber - 1;
        return 2500 + 10000 * usedBeforeVisit * usedBeforeVisit;
    }

    function cumulativeCostFromVisit(startVisit, count) {
        let total = 0;

        for (let i = 0; i < count; i += 1) {
            total += wellnessCostForVisit(startVisit + i);
        }

        return total;
    }

    function totalSpentThroughVisit(visitNumber) {
        if (!Number.isFinite(visitNumber) || visitNumber <= 0) return 0;
        return cumulativeCostFromVisit(1, visitNumber);
    }

    function loadPending() {
        try {
            const v = JSON.parse(GM_getValue(K_PENDING, '{}'));
            return v && typeof v === 'object' ? v : null;
        } catch {
            return null;
        }
    }

    function savePending(v) {
        GM_setValue(K_PENDING, JSON.stringify(v && typeof v === 'object' ? v : {}));
    }

    function clearPending() {
        GM_setValue(K_PENDING, '{}');
    }

    function loadDailyLog() {
        try {
            const v = JSON.parse(GM_getValue(K_DAILY_LOG, '[]'));
            return Array.isArray(v) ? v : [];
        } catch {
            return [];
        }
    }

    function saveDailyLog(log) {
        GM_setValue(K_DAILY_LOG, JSON.stringify(Array.isArray(log) ? log : []));
    }

    function loadCollapsed() {
        return GM_getValue(K_COLLAPSED, '0') === '1';
    }

    function saveCollapsed(v) {
        GM_setValue(K_COLLAPSED, v ? '1' : '0');
    }

    function formatExportLog(log) {
        const rows = Array.isArray(log) ? log : [];

        if (!rows.length) {
            return 'No daily expenses logged';
        }

        return rows.map(formatDailyLogLine).join('\n');
    }

    function formatDailyLogLine(row) {
        const visits = padInt(row.visitsPaid, 2);
        return `${row.dayKey} < Visits ${visits} | Paid ${formatMoney(row.paidTotal)} >`;
    }

    function formatMoney(n) {
        const num = Number.isFinite(n) ? Math.round(n) : 0;
        return `$${String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }

    function parseMoneyInt(s) {
        const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
        return Number.isFinite(n) ? n : null;
    }

    function toInt(v) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
    }

    function padInt(v, width) {
        const s = String(toInt(v));
        return s.length >= width ? s : ' '.repeat(width - s.length) + s;
    }

    function normalizeSpace(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function getClockText() {
        const el = document.querySelector('#clock');
        return el ? normalizeSpace(el.textContent || '') : '';
    }

    function getWellnessDayKey() {
        const display = getDisplayedGameDateParts();
        const clock = parseGameClock(getClockText());

        if (display) {
            // Wellness accounting days begin at noon HBT and persist until the following noon.
            // The key names the date on which that accounting window began.
            // Example: 08 JUL noon -> 09 JUL 11:59am is logged as 08 JUL.
            if (clock && clock.h < 12) {
                return addDaysToDayKey(display, -1);
            }

            return formatDayKey(display.day, display.monIndex);
        }

        const d = new Date();
        return formatDayKey(d.getDate(), d.getMonth());
    }

    function getDisplayedGameDateParts() {
        const dateEl = document.querySelector('.clock i');
        const s = dateEl ? normalizeSpace(dateEl.textContent || '') : '';

        const m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (!m) return null;

        const monIndex = monthIndex(m[1]);
        const day = parseInt(m[2], 10);

        if (!Number.isFinite(monIndex) || !Number.isFinite(day)) return null;
        return { day, monIndex };
    }

    function parseGameClock(text) {
        const m = normalizeSpace(text).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
        if (!m) return null;

        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const sec = m[3] ? parseInt(m[3], 10) : 0;
        const ap = m[4] ? m[4].toLowerCase() : '';

        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;

        if (![h, min, sec].every(Number.isFinite)) return null;
        return { h, min, sec };
    }

    function addDaysToDayKey(parts, days) {
        const d = new Date(new Date().getFullYear(), parts.monIndex, parts.day + days);
        return formatDayKey(d.getDate(), d.getMonth());
    }

    function formatDayKey(day, monIndex) {
        const d = new Date(new Date().getFullYear(), monIndex, day);
        const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        return `${String(d.getDate()).padStart(2, '0')} ${mon}`;
    }

    function monthIndex(monthText) {
        const key = String(monthText || '').slice(0, 3).toLowerCase();
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const idx = months.indexOf(key);
        return idx >= 0 ? idx : NaN;
    }

    function renderParseWarning(message) {
        if (!contentArea) return;

        const div = document.createElement('div');
        div.className = 'hwa-warn';
        div.textContent = message;
        contentArea.appendChild(div);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () {
                fallbackCopyText(text);
            });
            return;
        }

        fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();

        try {
            document.execCommand('copy');
        } catch {
            // no-op
        }

        ta.remove();
    }

    function injectStyle() {
        if (document.querySelector('#hwa-style')) return;

        const style = document.createElement('style');
        style.id = 'hwa-style';
        style.textContent = `
#hwa-panel {
	margin: 14px auto 8px;
	width: 95%;
	max-width: 520px;
	padding: 8px 8px 0;
	border: 2px solid #666;
	border-radius: 4px;
	background: rgba(255,255,255,0.72);
	color: #111;
	font-family: Verdana, Arial, sans-serif;
	font-size: 11px;
	text-align: left;
	overflow: clip;
	box-shadow: 1px 1px 2px 1px #3338;
}
#hwa-panel .hwa-title {
  font-weight: bold;
  text-align: center;
  font-size: 12px;
  margin-bottom: 4px;
}
#hwa-panel .hwa-summary {
  text-align: center;
  white-space: pre;
  font-weight: bold;
  margin: 4px 0 7px;
}
#hwa-panel .hwa-table-wrap {
  border: 1px solid #888;
  background: rgba(255,255,255,0.65);
}
#hwa-panel .hwa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
#hwa-panel .hwa-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 5px 4px;
  background: #eeeeee;
  border-bottom: 1px solid #999;
  border-right: 1px solid #bbb;
  text-align: center;
}
#hwa-panel .hwa-table td {
  color: #666666;
  text-align: center;
  padding: 4px;
  max-width: 202px;
  min-width: 202px;
  width: 202px;
  border-bottom: 1px solid #ddd;
  border-right: 1px solid #bbb;
}
#hwa-panel .hwa-table td:nth-child(1) {
  max-width: 90px;
  min-width: 90px;
  width: 90px;
}
#hwa-panel .hwa-persisted {
  background: rgba(255,255,153,0.45);
  font-weight: bold;
  color: #000000;
}
#hwa-panel .hwa-click-row {
  cursor: pointer;
}
#hwa-panel .hwa-click-row:hover {
  background: rgba(255,255,153,0.45);
}
#hwa-panel .hwa-selected {
  background: rgba(255,255,153,0.65);
}
#hwa-panel .hwa-note {
  padding: 3px 0 1px;
  text-align: center;
  font-style: italic;
  color: #555;
  background: #e6e6e6;
  text-decoration: underline .05em dotted;
}
#hwa-panel .hwa-paid-note {
  margin: 6px 0 4px;
  text-align: center;
  color: #800;
  font-weight: bold;
}
#hwa-panel .hwa-warn,
.hwa-warn {
  margin: 8px auto;
  width: 95%;
  text-align: center;
  max-width: 520px;
  padding: 6px;
  border: 1px solid #a66;
  background: #fff4f4;
  color: #800;
  font-size: 14px;
  font-weight: bold;
  font-family: Verdana, sans-serif;
}
#hwa-panel .hwa-log {
	margin: 8px -8px 0;
	border-top: 2px solid #999;
	padding: 2px 8px 2px 45px;
	background-color: #eee;
}
#hwa-panel .hwa-log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  margin-bottom: 3px;
}
#hwa-panel .hwa-log-pre {
  max-height: 115px;
  overflow-y: auto;
  margin: 0;
  padding: 5px;
  border: 1px solid #999;
  background: rgba(255,255,255,0.65);
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.25;
  white-space: pre;
}
#hwa-panel.hwa-compact-panel {
  max-width: 360px;
  padding: 6px 8px;
}
#hwa-panel .hwa-compact-log-line {
  margin: 4px 0 0;
  padding: 4px 6px;
  border: 1px solid #999;
  background: rgba(255,255,255,0.65);
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.25;
  white-space: pre;
  text-align: left;
}
.hwa-bank-btn {
  box-sizing: border-box;
  padding: 5px 12px;
  border: 0;
  border-radius: 3px;
  background: #ddd;
  color: #636363;
  font-family: Verdana, Arial, sans-serif;
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
}
.hwa-mini-btn {
  white-space: pre;
  padding: 3px 6px 2px;
  border: 1.5px ridge;
  border-radius: 3px;
  color: #008;
  font-family: Consolas, monospace;
  font-size: 13px;
  font-weight: bold;
  background: #dde;
  border-color: #55c;
  cursor: not-allowed;
  flex: 1 1 30%;
}
.hwa-bank-btn:hover {
  animation: hwaPulse 1.2s infinite;
  background: #1b9eff;
  color: #fff;
}
.hwa-mini-btn:hover {
  background: #fbb;
  border-color: #d88;
  border-style: outset;
  color: #800;
}
.hwa-mini-btn:active {
  border-style: inset;
}
.hwa-bank-helper {
  display: block;
  margin: 8px 1px 2px auto;
  border-radius: 4px;
  color: #111;
  font-size: 11px;
}
.hwa-bank-done {
  color: #060;
  font-weight: bold;
}
@keyframes hwaPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(30, 0, 45, 0.35);
  }
  80% {
    box-shadow: 0 0 0 4px rgba(30, 0, 45, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(30, 0, 45, 0);
  }
}
`;
        document.head.appendChild(style);
    }
})();

// ============================================================================
// MODULE 7: EQUIPMENT REDUX MODULE
// Rebuilds the Equipment page, adding collapsing function & Favorites.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(7)) return;

    const MODULE = 'erm-equipment-redux';
    const STORAGE = {
        imagery: `${MODULE}:imagery-enabled`,
        favorites: `${MODULE}:favorites`,
        collapsed: `${MODULE}:collapsed-sections`
    };

    const CATEGORY_NAMES = ['Weapons', 'Armor', 'Rings'];

    const COLORS = {
        equippedBg: 'rgb(255, 255, 245)', // eggshell-white
        equippedBorder: '#FFA400',
        equippedName: '#FFC90E',
        unequippedBg: '#F2F2F2',
        unequippedBorder: '#AFAFAF',
        unequippedName: '#000000',
        favorite: '#F00000',
        favoriteBorder: '#880015',
        branded: '#A349A4'
    };

    if (!isEquipmentPage()) return;

    const content = document.querySelector('.content-area');
    const info = content?.querySelector('#info');
    if (!content || !info) return;

    injectStyles();

    const nativeSections = locateNativeSections(content, info);
    const parsedItems = nativeSections.flatMap(section =>
                                               parseSection(section.name, section.table)
                                              );

    if (!parsedItems.length) return;

    const favorites = migrateFavoriteKeys(parsedItems);
    const collapsed = readObject(STORAGE.collapsed);
    const imageryEnabled = localStorage.getItem(STORAGE.imagery) !== 'false';
    const toggle = buildImageryToggle(imageryEnabled);

    const firstHeading = nativeSections[0]?.heading;
    if (!firstHeading) return;

    if (imageryEnabled) {
        const replacement = buildImageryInterface(
            parsedItems,
            favorites,
            collapsed
        );

        const fragment = document.createDocumentFragment();
        fragment.append(replacement, toggle);

        content.insertBefore(fragment, firstHeading);

        for (const section of nativeSections) {
            section.heading.remove();
            section.breakAfterHeading?.remove();
            section.table.remove();
            section.breakAfterTable?.remove();
        }
    } else {
        // Imagery-off mode IS the native HoboWars List view.
        // Leave the native category headings and tables exactly as rendered.
        const nativeDisplaySelector = [...content.querySelectorAll('table')]
            .find(table => /Switch Gear display\?/i.test(table.textContent));

        if (nativeDisplaySelector) {
            content.insertBefore(toggle, nativeDisplaySelector);
        } else {
            nativeSections.at(-1)?.table.insertAdjacentElement(
                'afterend',
                toggle
            );
        }
    }

    removeNativeDisplaySelector(content);

    function isEquipmentPage() {
        const url = new URL(location.href);
        return url.pathname.endsWith('/game/game.php') &&
            url.searchParams.get('cmd') === 'wep';
    }

    function locateNativeSections(root, infoNode) {
        const sections = [];
        let node = infoNode.nextSibling;

        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.matches('b')) {
                const name = node.textContent.trim();
                if (CATEGORY_NAMES.includes(name)) {
                    const breakAfterHeading = nextElementSiblingMatching(node, 'br');
                    const table = nextElementAfter(node, 'table');
                    if (table) {
                        sections.push({
                            name,
                            heading: node,
                            breakAfterHeading,
                            table,
                            breakAfterTable: nextElementSiblingMatching(table, 'br')
                        });
                    }
                }
            }
            node = node.nextSibling;
        }

        return sections;
    }

    function nextElementAfter(node, selector) {
        let cursor = node.nextSibling;
        while (cursor) {
            if (cursor.nodeType === Node.ELEMENT_NODE && cursor.matches(selector)) {
                return cursor;
            }
            if (cursor.nodeType === Node.ELEMENT_NODE && cursor.matches('b')) {
                return null;
            }
            cursor = cursor.nextSibling;
        }
        return null;
    }

    function nextElementSiblingMatching(node, selector) {
        let cursor = node.nextSibling;
        while (cursor?.nodeType === Node.TEXT_NODE && !cursor.textContent.trim()) {
            cursor = cursor.nextSibling;
        }
        return cursor?.nodeType === Node.ELEMENT_NODE && cursor.matches(selector)
            ? cursor
        : null;
    }

    function parseSection(category, table) {
        const cells = [...table.querySelectorAll(':scope > tbody > tr > td')];
        return cells.map((cell, index) => parseItemCell(category, cell, index));
    }

    function parseItemCell(category, cell, index) {
        const sourceCell = unwrapHelperCard(cell);
        const primaryAnchor = findPrimaryAction(sourceCell);
        const primaryHref = primaryAnchor?.href || '';
        const equipped = /[?&]unequip=\d+/i.test(primaryHref);

        const image = sourceCell.querySelector('img');
        const imageSrc = image?.getAttribute('src') || '';
        const name = readItemName(sourceCell) || `Unparsed ${category} item ${index + 1}`;
        const level = readLevel(sourceCell);
        const infoHTML = readInfoHTML(sourceCell, primaryAnchor);
        const actionLinks = readSecondaryActions(sourceCell);
        const id = buildFavoriteId(category, name);
        const legacyIds = readLegacyItemIds(sourceCell, primaryHref);
        const branded = /\[\s*Branded\s*\]/i.test(sourceCell.textContent);

        return {
            id,
            legacyIds,
            category,
            name,
            level,
            imageSrc,
            imageTitle: image?.getAttribute('title') || '',
            primaryHref,
            primaryLabel: equipped ? 'Unequip' : 'Equip',
            equipped,
            branded,
            infoHTML,
            actions: actionLinks,
            nativeClone: cell.cloneNode(true)
        };
    }

    function unwrapHelperCard(cell) {
        const directDiv = [...cell.children].find(child => child.tagName === 'DIV');
        return directDiv || cell;
    }

    function findPrimaryAction(root) {
        return [...root.querySelectorAll('a[href]')].find(anchor =>
                                                          /[?&](?:equip|unequip)=\d+/i.test(anchor.href)
                                                         ) || null;
    }

    function readItemName(root) {
        return root.querySelector(
            'font[color="black"] > b, font[color="orange"] > b'
        )?.textContent.trim() || '';
    }

    function readLevel(root) {
        const levelNode = [...root.querySelectorAll('font[color="blue"] b, b')]
        .find(node => /^Level\s+\d+/i.test(node.textContent.trim()));
        if (!levelNode) return null;

        return {
            text: levelNode.textContent.trim(),
            title: levelNode.closest('[title]')?.getAttribute('title') ||
            levelNode.parentElement?.getAttribute('title') || ''
        };
    }

    function readInfoHTML(root, primaryAnchor) {
        if (!primaryAnchor) return nativeFallbackInfo(root);

        const outerCell = root.matches('td') ? root : root.closest('td') || root;
        const largeRows = root.querySelectorAll(':scope > table > tbody > tr');

        let detailSource;
        if (largeRows.length >= 2) {
            const secondRowCells = largeRows[1].querySelectorAll(':scope > td');
            detailSource = secondRowCells[1] || secondRowCells[0];
        } else {
            detailSource = outerCell;
        }

        if (!detailSource) return nativeFallbackInfo(root);

        const clone = detailSource.cloneNode(true);

        if (detailSource === outerCell) {
            clone.querySelector(':scope > table')?.remove();
            for (const levelNode of clone.querySelectorAll('font[color="blue"]')) {
                const next = levelNode.nextSibling;
                levelNode.remove();
                if (next?.nodeType === Node.ELEMENT_NODE && next.tagName === 'BR') next.remove();
            }
        }

        removeActionRegion(clone);
        removeBrandedLabels(clone);
        stripEmptyEdges(clone);
        return clone.innerHTML.trim() || nativeFallbackInfo(root);
    }

    function removeActionRegion(clone) {
        const actionAnchor = [...clone.querySelectorAll('a[href]')].find(anchor =>
                                                                         /[?&](?:equip|unequip|do=idonate|do=sell)/i.test(anchor.href)
                                                                        );
        if (!actionAnchor) return;

        let start = actionAnchor;
        while (start.previousSibling) {
            start = start.previousSibling;
            if (start.nodeType === Node.ELEMENT_NODE && start.tagName === 'BR') break;
        }

        let cursor = start;
        while (cursor) {
            const next = cursor.nextSibling;
            cursor.remove();
            cursor = next;
        }
    }

    function removeBrandedLabels(root) {
        for (const node of [...root.querySelectorAll('b')]) {
            if (/^\[\s*Branded\s*\]$/i.test(node.textContent.trim())) node.remove();
        }
    }

    function stripEmptyEdges(node) {
        while (node.firstChild && isEmptyNode(node.firstChild)) node.firstChild.remove();
        while (node.lastChild && isEmptyNode(node.lastChild)) node.lastChild.remove();
    }

    function isEmptyNode(node) {
        return (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) ||
            (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR');
    }

    function nativeFallbackInfo(root) {
        const imageTitle = root.querySelector('img')?.getAttribute('title') || '';
        return imageTitle ? escapeHTML(imageTitle) : 'Item details unavailable.';
    }

    function readSecondaryActions(root) {
        return [...root.querySelectorAll('a[href]')]
            .filter(anchor => !/[?&](?:equip|unequip)=\d+/i.test(anchor.href))
            .filter(anchor => /[?&](?:do=idonate|do=sell)/i.test(anchor.href))
            .map(anchor => ({
            label: anchor.textContent.trim() || 'Action',
            href: anchor.href,
            onclick: anchor.getAttribute('onclick') || '',
            trailingHTML: readActionTrailingHTML(anchor)
        }));
    }

    function readActionTrailingHTML(anchor) {
        const holder = document.createElement('span');
        let cursor = anchor.nextSibling;

        while (cursor) {
            if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === 'BR') break;
            holder.append(cursor.cloneNode(true));
            cursor = cursor.nextSibling;
        }

        return holder.innerHTML.trimEnd() || ']';
    }

    function buildFavoriteId(category, name) {
        const normalizedCategory = category.trim().toLowerCase();
        const normalizedName = name.trim().replace(/\s+/g, ' ').toLowerCase();

        return `item:${normalizedCategory}:${normalizedName}`;
    }

    function readLegacyItemIds(root, primaryHref) {
        const allHrefs = [...root.querySelectorAll('a[href]')]
        .map(anchor => anchor.href);
        const values = {
            itid: new Set(),
            equip: new Set(),
            id: new Set()
        };

        for (const href of [primaryHref, ...allHrefs]) {
            for (const match of href.matchAll(/[?&]itid=(\d+)/ig)) values.itid.add(match[1]);
            for (const match of href.matchAll(/[?&]equip=(\d+)/ig)) values.equip.add(match[1]);
            for (const match of href.matchAll(/[?&]ID=(\d+)/g)) values.id.add(match[1]);
        }

        return {
            itid: [...values.itid],
            equip: [...values.equip],
            id: [...values.id]
        };
    }

    function migrateFavoriteKeys(items) {
        const stored = readSet(STORAGE.favorites);
        if (!stored.size) return stored;

        const migrated = new Set();
        let changed = false;

        for (const key of stored) {
            if (key.startsWith('item:')) {
                const matchingItems = items.filter(item =>
                                                   key === item.id || key.startsWith(`${item.id}:`)
                                                  );

                if (matchingItems.length === 1) {
                    migrated.add(matchingItems[0].id);
                    if (key !== matchingItems[0].id) changed = true;
                } else {
                    migrated.add(key);
                }
                continue;
            }

            // Older releases stored bare numbers. Prefer a unique itid match,
            // because equip= values can collide with unrelated inventory IDs.
            const itidMatches = items.filter(item => item.legacyIds.itid.includes(key));
            const equipMatches = items.filter(item => item.legacyIds.equip.includes(key));
            const idMatches = items.filter(item => item.legacyIds.id.includes(key));
            const preferred = itidMatches.length === 1
            ? itidMatches[0]
            : equipMatches.length === 1
            ? equipMatches[0]
            : idMatches.length === 1
            ? idMatches[0]
            : null;

            if (preferred) migrated.add(preferred.id);
            changed = true;
        }

        if (changed || migrated.size !== stored.size) {
            localStorage.setItem(STORAGE.favorites, JSON.stringify([...migrated]));
        }
        return migrated;
    }

    function buildImageryInterface(items, favoriteSet, collapsedState) {
        const shell = create('div', { id: `${MODULE}-root` });
        const favoriteItems = items.filter(item => favoriteSet.has(item.id));

        shell.append(
            buildSection('Favorites', favoriteItems, favoriteSet, collapsedState, true),
            ...CATEGORY_NAMES.map(category =>
                                  buildSection(
                category,
                items.filter(item => item.category === category),
                favoriteSet,
                collapsedState,
                false
            )
                                 )
        );

        return shell;
    }

    function buildSection(name, items, favoriteSet, collapsedState, favoritesSection) {
        const section = create('section', {
            className: `${MODULE}-section`,
            dataset: { section: name }
        });

        const isCollapsed = collapsedState[name] ?? (favoritesSection ? true : false);
        const header = create('button', {
            type: 'button',
            className: `${MODULE}-section-header`,
            ariaExpanded: String(!isCollapsed)
        });
        const icon = create('span', {
            className: `${MODULE}-collapse-icon`,
            textContent: isCollapsed ? '▸' : '▾',
            ariaHidden: 'true'
        });
        const label = create('span', {
            className: `${MODULE}-section-label`,
            textContent: name
        });
        const count = create('span', {
            className: `${MODULE}-section-count`,
            textContent: String(items.length)
        });
        header.append(icon, label, count);

        const body = create('div', {
            className: `${MODULE}-section-body`,
            hidden: isCollapsed
        });
        const grid = create('div', { className: `${MODULE}-grid` });

        if (items.length) {
            for (const item of items) {
                grid.append(buildCard(item, favoriteSet));
            }
        } else {
            grid.append(create('div', {
                className: `${MODULE}-empty`,
                textContent: favoritesSection
                ? 'No favorited equipment.'
                : `No ${name.toLowerCase()} found.`
            }));
        }

        body.append(grid);
        header.addEventListener('click', () => {
            const nextCollapsed = !body.hidden;
            body.hidden = nextCollapsed;
            header.setAttribute('aria-expanded', String(!nextCollapsed));
            icon.textContent = nextCollapsed ? '▸' : '▾';

            const state = readObject(STORAGE.collapsed);
            state[name] = nextCollapsed;
            localStorage.setItem(STORAGE.collapsed, JSON.stringify(state));
        });

        section.append(header, body);
        return section;
    }

    function buildCard(item, favoriteSet) {
        const card = create('article', {
            className: `${MODULE}-card ${item.equipped ? 'is-equipped' : 'is-unequipped'}`,
            tabIndex: item.primaryHref ? 0 : -1,
            role: item.primaryHref ? 'link' : null,
            title: item.primaryHref ? `${item.primaryLabel} ${item.name}` : item.name,
            dataset: { itemId: item.id }
        });

        const nameLine = create('div', { className: `${MODULE}-name-line` });
        const name = create('span', {
            className: `${MODULE}-name`,
            textContent: item.name
        });
        nameLine.append(name);

        if (favoriteSet.has(item.id)) {
            nameLine.append(buildFavoriteMarker());
        }

        if (item.branded) {
            nameLine.append(create('span', {
                className: `${MODULE}-branded-marker`,
                textContent: '(B)',
                title: 'Gang branded'
            }));
        }

        const imageWrap = create('div', { className: `${MODULE}-image-wrap` });
        if (item.imageSrc) {
            imageWrap.append(create('img', {
                className: `${MODULE}-image`,
                src: item.imageSrc,
                alt: item.name,
                title: item.imageTitle
            }));
        } else {
            imageWrap.append(create('div', {
                className: `${MODULE}-image-placeholder`,
                textContent: 'No image'
            }));
        }

        const details = create('div', { className: `${MODULE}-details` });
        if (item.level) {
            details.append(create('div', {
                className: `${MODULE}-level`,
                textContent: item.level.text,
                title: item.level.title
            }));
        }

        const infoBlock = create('div', { className: `${MODULE}-info` });
        infoBlock.innerHTML = item.infoHTML;
        details.append(infoBlock);

        const actions = create('div', { className: `${MODULE}-actions` });
        for (const action of item.actions) {
            actions.append(buildSecondaryActionLine(action));
        }

        const favoriteRow = create('div', { className: `${MODULE}-action-row` });
        const favoriteButton = create('button', {
            type: 'button',
            className: `${MODULE}-favorite-action`,
            textContent: favoriteSet.has(item.id) ? '[Remove Favorite]' : '[Favorite]'
        });
        favoriteButton.addEventListener('click', event => {
            event.stopPropagation();
            toggleFavorite(item.id);
        });
        favoriteRow.append(favoriteButton);
        actions.append(favoriteRow);

        card.append(nameLine, imageWrap, details, actions);

        for (const interactive of card.querySelectorAll('a, button')) {
            interactive.addEventListener('click', event => event.stopPropagation());
        }

        if (item.primaryHref) {
            card.addEventListener('click', event => {
                if (event.defaultPrevented || event.button !== 0) return;
                location.href = item.primaryHref;
            });
            card.addEventListener('keydown', event => {
                if (event.target !== card || event.key !== 'Enter') return;
                event.preventDefault();
                location.href = item.primaryHref;
            });
        }

        return card;
    }

    function buildSecondaryActionLine(action) {
        const row = create('div', { className: `${MODULE}-action-row` });
        const link = create('a', {
            href: action.href,
            textContent: action.label,
            className: `${MODULE}-secondary-action`
        });
        if (action.onclick) link.setAttribute('onclick', action.onclick);

        const trailing = create('span', { className: `${MODULE}-action-trailing` });
        trailing.innerHTML = action.trailingHTML || ']';
        row.append(document.createTextNode('['), link, trailing);
        return row;
    }

    function buildFavoriteMarker() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', `${MODULE}-favorite-marker`);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Favorite');
        svg.setAttribute('title', 'Favorite');

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M12 21s-7.2-4.35-9.55-8.35C.36 9.08 1.35 4.5 5.45 3.35 7.8 2.69 10.1 3.75 12 6c1.9-2.25 4.2-3.31 6.55-2.65 4.1 1.15 5.09 5.73 3 9.3C19.2 16.65 12 21 12 21Z');
        svg.append(path);
        return svg;
    }

    function toggleFavorite(itemId) {
        const set = readSet(STORAGE.favorites);
        if (set.has(itemId)) set.delete(itemId);
        else set.add(itemId);
        localStorage.setItem(STORAGE.favorites, JSON.stringify([...set]));
        location.reload();
    }

    function buildImageryToggle(enabled) {
        const wrap = create('div', {
            className: `${MODULE}-display-toggle`
        });

        const label = create('span', {
            textContent: ' Images'
        });
        label.style.whiteSpace = 'pre';

        const button = create('button', {
            type: 'button',
            textContent: enabled ? 'Disable' : 'Enable'
        });

        button.addEventListener('click', () => {
            const nextEnabled = !enabled;

            localStorage.setItem(
                STORAGE.imagery,
                String(nextEnabled)
            );

        const url = new URL(location.href);

        if (!nextEnabled) {
            // Imagery off = genuine native List mode.
            url.searchParams.set('display', '0');
        } else {
            // Imagery on = restore native Large source markup,
            // which supplies ERM with images and full item details.
            url.searchParams.set('display', '2');
        }

        location.href = url.href;
        });

        wrap.append(button, label);
        return wrap;
    }

    function removeNativeDisplaySelector(root) {
        for (const table of root.querySelectorAll('table')) {
            if (/Switch Gear display\?/i.test(table.textContent)) {
                table.remove();
                break;
            }
        }
    }

    function readSet(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return new Set(Array.isArray(value) ? value.map(String) : []);
        } catch {
            return new Set();
        }
    }

    function readObject(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    function create(tag, props = {}) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (value == null) continue;
            if (key === 'className') node.className = value;
            else if (key === 'textContent') node.textContent = value;
            else if (key === 'dataset') Object.assign(node.dataset, value);
            else if (key === 'ariaExpanded') node.setAttribute('aria-expanded', value);
            else if (key === 'ariaHidden') node.setAttribute('aria-hidden', value);
            else if (key in node) node[key] = value;
            else node.setAttribute(key, value);
        }
        return node;
    }

    function escapeHTML(value) {
        const node = document.createElement('div');
        node.textContent = value;
        return node.innerHTML;
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.id = `${MODULE}-styles`;
        style.textContent = `
            #${MODULE}-root {
                width: 100%;
                box-sizing: border-box;
                margin: 6px 0 8px;
            }

            .${MODULE}-section {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #c7c7c7;
                border-radius: 3px;
                margin: 0 0 10px;
                background: #fff;
                overflow: hidden;
            }

            .${MODULE}-section-header {
                width: 100%;
                min-height: 30px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 2px 6px;
                border: 0;
                border-bottom: 1px solid #c7c7c7;
                border-radius: 3px 3px 0 0;
                color: #000;
                font: inherit;
                font-weight: bold;
                text-align: left;
                cursor: pointer;
            }

            .${MODULE}-section-header[aria-expanded="false"] {
                border-bottom: 0;
            }

            .${MODULE}-collapse-icon {
                width: 16px;
                height: 16px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 16px;
                border: 1px solid #5e5e5e;
                border-radius: 50%;
                background: #f0a000;
                color: #000;
                font-size: 16px;
                line-height: 1;
            }

            .${MODULE}-section-label {
                flex: 1 1 auto;
                font-size: 18px;
            }

            .${MODULE}-section-count {
                flex: 0 0 auto;
                color: #666;
                font-weight: normal;
                font-size: 15px;
            }

            .${MODULE}-section-body {
                padding: 6px;
            }

            .${MODULE}-grid {
                display: grid;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                gap: 6px;
                align-items: stretch;
            }

            @media (max-width: 940px) {
                .${MODULE}-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
            }

            .${MODULE}-card {
                min-width: 0;
                height: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                padding: 5px;
                border: 1px solid;
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                outline: none;
            }

            .${MODULE}-card:focus-visible {
                box-shadow: 0 0 0 2px rgba(0, 70, 200, 0.35);
            }

            .${MODULE}-card.is-equipped {
                background: ${COLORS.equippedBg};
                border-color: ${COLORS.equippedBorder};
            }

            .${MODULE}-card.is-unequipped {
                background: ${COLORS.unequippedBg};
                border-color: ${COLORS.unequippedBorder};
            }

            .${MODULE}-name-line {
                min-width: 0;
                display: flex;
                align-items: baseline;
                justify-content: center;
                flex-wrap: wrap;
                gap: 3px;
                margin-bottom: 3px;
                text-align: center;
                font-weight: bold;
                overflow-wrap: anywhere;
            }

            .${MODULE}-card.is-equipped .${MODULE}-name {
                color: ${COLORS.equippedName};
            }

            .${MODULE}-card.is-unequipped .${MODULE}-name {
                color: ${COLORS.unequippedName};
            }

            .${MODULE}-favorite-marker {
                width: 14px;
                height: 14px;
                flex: 0 0 14px;
                overflow: visible;
                vertical-align: -2px;
            }

            .${MODULE}-favorite-marker path {
                fill: ${COLORS.favorite};
                stroke: ${COLORS.favoriteBorder};
                stroke-width: 1.5;
                stroke-linejoin: round;
            }

            .${MODULE}-branded-marker {
                color: ${COLORS.branded};
            }

            .${MODULE}-image-wrap {
                min-height: 62px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 1px 0 3px;
            }

            .${MODULE}-image {
                display: block;
                max-width: 60px;
                max-height: 60px;
                width: auto;
                height: auto;
            }

            .${MODULE}-image-placeholder {
                color: #777;
                font-size: 11px;
            }

            .${MODULE}-details {
                min-width: 0;
                flex: 1 1 auto;
                text-align: center;
                overflow-wrap: anywhere;
            }

            .${MODULE}-level {
                color: blue;
                font-weight: bold;
                margin-bottom: 2px;
                overflow-wrap: anywhere;
            }

            .${MODULE}-info {
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .${MODULE}-actions {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                margin-top: 5px;
                text-align: left;
            }

            .${MODULE}-action-row {
                display: block;
                margin: 2px 6px;
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .${MODULE}-favorite-action {
                margin: 0;
                padding: 1px 2px;
                border: 0;
                background: #ddfb;
                color: #0000ee;
                font: inherit;
                cursor: pointer;
            }

            .${MODULE}-favorite-action {
                white-space: nowrap;
            }

            .${MODULE}-favorite-action:hover {
                color: #cc5050;
                background: #fddb;
            }

            .${MODULE}-empty {
                grid-column: 1 / -1;
                padding: 6px;
                color: #666;
                text-align: center;
            }

            .${MODULE}-display-toggle {
                margin: 8px 0 10px;
            }

            .${MODULE}-display-toggle button {
                font: inherit;
                cursor: pointer;
            }
        `;
        document.head.append(style);
    }
})();

// ============================================================================
// MODULE 8: PERSONAL HITLIST KEYBINDS
// Enables player to activate native Fight! links using ~+[A-Z, 0-9] keybinds.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(8)) return;

    const MODULE = 'hw-hitlist-keybinds';
    const STORAGE_KEY = `${MODULE}:assignments:v1`;

    const url = new URL(location.href);
    if (
        !url.pathname.endsWith('/game/game.php') ||
        url.searchParams.get('cmd') !== 'battle' ||
        url.searchParams.get('do') !== 'phlist'
    ) {
        return;
    }

    const hitlist = document.querySelector('#hitlist');
    const table = hitlist?.querySelector('form > table');
    if (!hitlist || !table) return;

    const SECONDARY_KEYS = new Map([
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => [`Key${letter}`, letter]),
        ...'0123456789'.split('').map(digit => [`Digit${digit}`, digit])
    ]);

    let assignments = loadAssignments();
    const rowsById = new Map();
    let chordArmed = false;
    let chordConsumed = false;
    let openMenu = null;
    let openTooltip = null;
    let openDialog = null;

    injectStyles();
    initializeTable();
    pruneStaleAssignments();
    refreshCells();
    installGlobalKeybindListener();

    function initializeTable() {
        const rows = Array.from(table.rows || []);
        if (!rows.length) return;

        const headerRow = rows[0];
        if (!headerRow.querySelector(`.${MODULE}-header-cell`)) {
            const headerCell = document.createElement('td');
            headerCell.className = `${MODULE}-header-cell`;
            headerCell.textContent = '~⁺';
            headerCell.setAttribute('aria-label', 'Hitlist keybind prefix');
            headerCell.title = 'The ` / ~ key\nNo Shift Req.';
            headerRow.insertBefore(headerCell, headerRow.cells[2] || null);
        }

        for (const row of rows.slice(1)) {
            const playerLink = row.querySelector('a[href*="cmd=player"][href*="ID="]');
            if (!playerLink) continue;

            const playerId = getPlayerId(playerLink.href);
            if (!playerId) continue;

            const playerName = normalizeSpace(playerLink.textContent || '') || `Hobo ${playerId}`;
            row.dataset.hwHitlistPlayerId = playerId;
            rowsById.set(playerId, { row, playerName });

            if (assignments[playerId]) {
                assignments[playerId].name = playerName;
            }

            if (row.querySelector(`.${MODULE}-cell`)) continue;

            const cell = document.createElement('td');
            cell.className = `${MODULE}-cell`;
            cell.dataset.playerId = playerId;
            cell.tabIndex = 0;
            cell.setAttribute('role', 'button');
            cell.setAttribute('aria-label', `Assign keybind to ${playerName}`);

            cell.addEventListener('click', event => {
                if (event.button !== 0) return;
                openAssignmentDialog(playerId);
            });

            cell.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openAssignmentDialog(playerId);
            });

            cell.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                showContextMenu(playerId, event.clientX, event.clientY);
            });

            row.insertBefore(cell, row.cells[2] || null);
        }

        saveAssignments();
    }

    function refreshCells() {
        for (const [playerId, data] of rowsById) {
            const cell = data.row.querySelector(`.${MODULE}-cell`);
            if (!cell) continue;

            const assignment = assignments[playerId];
            const display = assignment && SECONDARY_KEYS.get(assignment.code);

            cell.textContent = display || '⚙️';
            cell.classList.toggle(`${MODULE}-assigned`, Boolean(display));
            cell.title = display
                ? `Keybind: \` + ${display}\nRight-click: options`
                : `Left-click: Bind Key\nRight-click: options`;
            cell.setAttribute(
                'aria-label',
                display
                    ? `${data.playerName}: backtick plus ${display}`
                    : `Assign keybind to ${data.playerName}`
            );
        }
    }

    function pruneStaleAssignments() {
        let changed = false;

        for (const playerId of Object.keys(assignments)) {
            if (rowsById.has(playerId)) continue;
            delete assignments[playerId];
            changed = true;
        }

        if (changed) saveAssignments();
    }

    function installGlobalKeybindListener() {
        document.addEventListener('keydown', event => {
            if (openDialog) return;
            if (isEditableTarget(event.target)) return;

            if (event.code === 'Backquote') {
                if (event.repeat) return;
                chordArmed = true;
                chordConsumed = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (!chordArmed || chordConsumed || event.repeat) return;
            if (!isCleanSecondaryEvent(event)) return;

            const playerId = findPlayerIdByCode(event.code);
            if (!playerId) return;

            event.preventDefault();
            event.stopPropagation();
            chordConsumed = true;

            const rowData = rowsById.get(playerId);
            if (!rowData) return;

            const attackLink = findAttackLink(rowData.row, playerId);
            if (!attackLink) return;

            attackLink.click();
        }, true);

        document.addEventListener('keyup', event => {
            if (event.code !== 'Backquote') return;
            chordArmed = false;
            chordConsumed = false;
        }, true);

        window.addEventListener('blur', () => {
            chordArmed = false;
            chordConsumed = false;
        });
    }

    function openAssignmentDialog(playerId) {
        closeContextMenu();
        closeDialog();

        const rowData = rowsById.get(playerId);
        if (!rowData) return;

        const existing = assignments[playerId] || null;
        let pendingCode = existing?.code || null;
        let backquoteHeld = false;

        const shell = makeDialogShell(`${MODULE}-assign-dialog`);
        const card = shell.card;

        const title = document.createElement('div');
        title.className = `${MODULE}-dialog-title`;
        title.textContent = 'Assign Keybind to Hobo?';

        const name = document.createElement('div');
        name.className = `${MODULE}-dialog-name`;
        name.textContent = rowData.playerName;

        const capture = document.createElement('input');
        capture.type = 'text';
        capture.readOnly = true;
        capture.className = `${MODULE}-capture`;
        capture.value = pendingCode
            ? formatChord(pendingCode)
            : 'Press ` + A-Z / 0-9';
        capture.setAttribute('aria-label', 'Keybind capture field');

        const status = document.createElement('div');
        status.className = `${MODULE}-dialog-status`;

        const actions = document.createElement('div');
        actions.className = `${MODULE}-dialog-actions`;

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = `${MODULE}-btn`;
        cancel.textContent = 'Cancel';

        function getCollisionId() {
            return pendingCode
                ? findPlayerIdByCode(pendingCode, playerId)
                : null;
        }

        function updateAssignmentState() {
            const collisionId = getCollisionId();

            if (!pendingCode) {
                status.textContent = 'Press ` together with an available A-Z or 0-9 key.';
                status.classList.remove(`${MODULE}-error`);
                return;
            }

            if (collisionId) {
                const collisionName = rowsById.get(collisionId)?.playerName || assignments[collisionId]?.name || `Hobo ${collisionId}`;
                status.textContent = `${formatChord(pendingCode)} is already assigned to ${collisionName}.`;
                status.classList.add(`${MODULE}-error`);
                return;
            }

            status.textContent = existing?.code === pendingCode
                ? 'This Hobo already uses this keybind. Press Enter to keep it.'
                : 'Ready — press Enter to assign.';
            status.classList.remove(`${MODULE}-error`);
        }

        function commitAssignment() {
            if (!pendingCode || getCollisionId()) return false;

            assignments[playerId] = {
                code: pendingCode,
                name: rowData.playerName
            };

            saveAssignments();
            refreshCells();
            closeDialog();
            return true;
        }

        capture.addEventListener('keydown', event => {
            if (event.code === 'Escape') {
                event.preventDefault();
                closeDialog();
                return;
            }

            if (event.code === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitAssignment();
                return;
            }

            if (event.code === 'Backquote') {
                backquoteHeld = true;
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (!backquoteHeld || event.repeat || !isCleanSecondaryEvent(event)) {
                event.preventDefault();
                return;
            }

            pendingCode = event.code;
            capture.value = formatChord(pendingCode);
            event.preventDefault();
            event.stopPropagation();
            updateAssignmentState();
        });

        capture.addEventListener('keyup', event => {
            if (event.code === 'Backquote') backquoteHeld = false;
        });

        capture.addEventListener('blur', () => {
            backquoteHeld = false;
        });

        cancel.addEventListener('click', closeDialog);
        actions.append(cancel);
        card.append(title, name, capture, status, actions);
        openDialog = shell.overlay;
        updateAssignmentState();

        requestAnimationFrame(() => capture.focus());
    }

    function showContextMenu(playerId, clientX, clientY) {
        closeContextMenu();
        closeTooltip();

        const assignment = assignments[playerId];
        const rowData = rowsById.get(playerId);
        if (!rowData) return;

        const hasAssignment = Boolean(assignment);
        const hasAnyAssignments = Object.keys(assignments).length > 0;

        const menu = document.createElement('div');
        menu.className = `${MODULE}-context-menu`;

        const infoItem = makeMenuItem('More Info');
        const clearItem = makeMenuItem('Clear Entry');
        const clearAllItem = makeMenuItem('Clear All Entries');

        clearItem.disabled = !hasAssignment;
        clearAllItem.disabled = !hasAnyAssignments;

        menu.append(infoItem, clearItem, clearAllItem);
        document.body.appendChild(menu);

        const firstHeight = infoItem.getBoundingClientRect().height || 24;
        const menuRect = menu.getBoundingClientRect();
        const desiredLeft = clientX + 5;
        const desiredTop = clientY - firstHeight / 2;

        menu.style.left = `${clamp(desiredLeft, 4, window.innerWidth - menuRect.width - 4)}px`;
        menu.style.top = `${clamp(desiredTop, 4, window.innerHeight - menuRect.height - 4)}px`;

        let idleTimer = window.setTimeout(() => fadeContextMenu(menu), 1800);
        let leaveTimer = null;

        const cancelTimers = () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            if (leaveTimer) {
                clearTimeout(leaveTimer);
                leaveTimer = null;
            }
            menu.classList.remove(`${MODULE}-fading`);
        };

        menu.addEventListener('mouseenter', cancelTimers);
        menu.addEventListener('mouseleave', () => {
            closeTooltip();
            if (leaveTimer) clearTimeout(leaveTimer);
            leaveTimer = window.setTimeout(() => fadeContextMenu(menu), 600);
        });

        infoItem.addEventListener('mouseenter', () => {
            cancelTimers();
            showInfoTooltip(infoItem);
        });
        infoItem.addEventListener('mouseleave', closeTooltip);

        clearItem.addEventListener('click', () => {
            closeContextMenu();
            openClearEntryDialog(playerId);
        });

        clearAllItem.addEventListener('click', () => {
            closeContextMenu();
            openClearAllDialog();
        });

        openMenu = { menu, idleTimer, leaveTimer };
    }

    function makeMenuItem(label) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `${MODULE}-context-item`;
        item.textContent = label;
        return item;
    }

    function fadeContextMenu(menu) {
        if (!menu?.isConnected) return;
        menu.classList.add(`${MODULE}-fading`);
        window.setTimeout(() => {
            if (menu.isConnected) menu.remove();
            if (openMenu?.menu === menu) openMenu = null;
        }, 180);
    }

    function closeContextMenu() {
        if (!openMenu) return;
        if (openMenu.idleTimer) clearTimeout(openMenu.idleTimer);
        if (openMenu.leaveTimer) clearTimeout(openMenu.leaveTimer);
        openMenu.menu?.remove();
        openMenu = null;
        closeTooltip();
    }

    function showInfoTooltip(anchor) {
        closeTooltip();

        const tip = document.createElement('div');
        tip.className = `${MODULE}-tooltip`;
        tip.innerHTML =
            '<div style="text-align: center;font-weight:bold;text-decoration:underline;font-size: 105%;">Personal Hitlist Keybinds</div>' +
            'Click a ⚙️ or assigned key to set a binding, then press the key pair and Enter.<br>' +
            'While viewing the Personal Hitlist, hold <b>~</b> and press the assigned key to activate that Hobo\'s native <b>Fight!</b> link.<br>' +
            'A keybind only acts when the native Fight! link is available.<br><br>' +
            '<div style="text-align:center;">' +
            '<span style="font-size: 85%;">~ refers to the ` / ~ key.</span><br>' +
            '<span style="font-size: 95%;font-weight: bold;">Do not use Shift + `</span>' +
            '</div>';

        document.body.appendChild(tip);

        const anchorRect = anchor.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        let left = anchorRect.right + 7;
        if (left + tipRect.width > window.innerWidth - 4) {
            left = anchorRect.left - tipRect.width - 7;
        }

        const top = clamp(
            anchorRect.top + anchorRect.height / 2 - tipRect.height / 2,
            4,
            window.innerHeight - tipRect.height - 4
        );

        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = `${top}px`;
        openTooltip = tip;
    }

    function closeTooltip() {
        openTooltip?.remove();
        openTooltip = null;
    }

    function openClearEntryDialog(playerId) {
        closeDialog();

        const assignment = assignments[playerId];
        const rowData = rowsById.get(playerId);
        if (!assignment || !rowData) return;

        const shell = makeDialogShell(`${MODULE}-clear-entry-dialog`);
        const card = shell.card;

        const title = document.createElement('div');
        title.className = `${MODULE}-dialog-title`;
        title.textContent = 'Clear Keybind?';

        const name = document.createElement('div');
        name.className = `${MODULE}-dialog-name`;
        name.textContent = rowData.playerName;

        const binding = document.createElement('div');
        binding.className = `${MODULE}-binding-display`;
        binding.textContent = formatChord(assignment.code);

        const actions = document.createElement('div');
        actions.className = `${MODULE}-dialog-actions`;

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = `${MODULE}-btn ${MODULE}-clear-btn`;
        clear.textContent = 'Clear';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = `${MODULE}-btn`;
        cancel.textContent = 'Cancel';

        clear.addEventListener('click', () => {
            delete assignments[playerId];
            saveAssignments();
            refreshCells();
            closeDialog();
        });

        cancel.addEventListener('click', closeDialog);
        actions.append(clear, cancel);
        card.append(title, name, binding, actions);
        openDialog = shell.overlay;
    }

    function openClearAllDialog() {
        closeDialog();

        const shell = makeDialogShell(`${MODULE}-clear-all-dialog`, true);
        const card = shell.card;
        card.classList.add(`${MODULE}-danger-card`);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = `${MODULE}-danger-x`;
        close.textContent = 'X';
        close.setAttribute('aria-label', 'Cancel');

        const question = document.createElement('div');
        question.className = `${MODULE}-danger-question`;
        question.textContent = 'Are you sure you want to remove ALL Keybind settings?';

        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = `${MODULE}-danger-confirm`;
        confirm.innerHTML = '<span>Confirm</span><strong>Delete Keybinds</strong>';

        close.addEventListener('click', closeDialog);
        confirm.addEventListener('click', () => {
            assignments = {};
            saveAssignments();
            refreshCells();
            closeDialog();
        });

        card.append(close, question, confirm);
        openDialog = shell.overlay;
        close.focus();
    }

    function makeDialogShell(id, dismissOnBackdrop = false) {
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = `${MODULE}-overlay`;

        const card = document.createElement('div');
        card.className = `${MODULE}-dialog`;
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        if (dismissOnBackdrop) {
            overlay.addEventListener('mousedown', event => {
                if (event.target === overlay) closeDialog();
            });
        }

        const escapeHandler = event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeDialog();
        };

        overlay._hwEscapeHandler = escapeHandler;
        document.addEventListener('keydown', escapeHandler, true);

        return { overlay, card };
    }

    function closeDialog() {
        if (!openDialog) return;
        const handler = openDialog._hwEscapeHandler;
        if (handler) document.removeEventListener('keydown', handler, true);
        openDialog.remove();
        openDialog = null;
    }

    function findAttackLink(row, playerId) {
        return Array.from(row.querySelectorAll('a[href]')).find(anchor => {
            try {
                const candidate = new URL(anchor.href, location.href);
                return (
                    candidate.searchParams.get('cmd') === 'fight' &&
                    candidate.searchParams.get('ID') === playerId
                );
            } catch {
                return false;
            }
        }) || null;
    }

    function findPlayerIdByCode(code, excludePlayerId = null) {
        for (const [playerId, assignment] of Object.entries(assignments)) {
            if (playerId === excludePlayerId) continue;
            if (assignment?.code === code) return playerId;
        }
        return null;
    }

    function isCleanSecondaryEvent(event) {
        return (
            SECONDARY_KEYS.has(event.code) &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey
        );
    }

    function isEditableTarget(target) {
        return (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable
        );
    }

    function getPlayerId(href) {
        try {
            const candidate = new URL(href, location.href);
            const id = candidate.searchParams.get('ID');
            return /^\d+$/.test(id || '') ? id : null;
        } catch {
            return null;
        }
    }

    function formatChord(code) {
        return '` + ' + (SECONDARY_KEYS.get(code) || '?');
    }

    function normalizeSpace(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function loadAssignments() {
        try {
            const raw = GM_getValue(STORAGE_KEY, '{}');
            const parsed = JSON.parse(raw || '{}');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

            const clean = {};
            for (const [playerId, assignment] of Object.entries(parsed)) {
                if (!/^\d+$/.test(playerId)) continue;
                if (!assignment || typeof assignment !== 'object') continue;
                if (!SECONDARY_KEYS.has(assignment.code)) continue;

                clean[playerId] = {
                    code: assignment.code,
                    name: String(assignment.name || '')
                };
            }
            return clean;
        } catch {
            return {};
        }
    }

    function saveAssignments() {
        GM_setValue(STORAGE_KEY, JSON.stringify(assignments));
    }

    function injectStyles() {
        if (document.getElementById(`${MODULE}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${MODULE}-styles`;
        style.textContent = `
            .${MODULE}-header-cell,
            .${MODULE}-cell {
                width: 34px;
                min-width: 34px;
                max-width: 34px;
                box-sizing: border-box;
                text-align: center;
                vertical-align: middle;
                white-space: nowrap;
            }

            .${MODULE}-header-cell {
                cursor: default;
                font-weight: bold;
                font-family: Tahoma, sans-serif;
            }

            .${MODULE}-cell {
                cursor: pointer;
                user-select: none;
                outline: none;
                font-weight: 300;
            }

            .${MODULE}-cell:hover,
            .${MODULE}-cell:focus-visible {
                background: rgba(255, 255, 180, 0.48);
            }

            .${MODULE}-assigned {
                font-size: 14px;
                color: #111;
            }

            .${MODULE}-context-menu {
                position: fixed;
                z-index: 2147483645;
                min-width: 132px;
                padding: 2px 0;
                border: 1px solid #777;
                background: #f4f4f4;
                box-shadow: 2px 2px 5px rgba(0,0,0,.3);
                opacity: 1;
                transition: opacity 180ms ease-out;
                font: 11px Verdana, Arial, sans-serif;
            }

            .${MODULE}-context-menu.${MODULE}-fading {
                opacity: 0;
                pointer-events: none;
            }

            .${MODULE}-context-item {
                display: block;
                width: 100%;
                height: 24px;
                padding: 3px 10px;
                border: 0;
                background: transparent;
                color: #111;
                font: inherit;
                text-align: left;
                white-space: nowrap;
                cursor: pointer;
            }

            .${MODULE}-context-item:first-of-type {
                cursor: help;
            }

            .${MODULE}-context-item:hover,
            .${MODULE}-context-item:focus-visible {
                background: #dce9f7;
                color: #000;
                outline: none;
            }

            .${MODULE}-context-item:disabled {
                color: #999;
                background: transparent;
                cursor: default;
            }

            .${MODULE}-context-item:disabled:hover,
            .${MODULE}-context-item:disabled:focus-visible {
                color: #999;
                background: transparent;
                outline: none;
            }

            .${MODULE}-tooltip {
                position: fixed;
                z-index: 2147483646;
                width: 260px;
                box-sizing: border-box;
                padding: 7px 8px;
                border: 1px solid #333;
                border-radius: 3px;
                background: rgba(20,20,20,.96);
                color: #f4f4f4;
                box-shadow: 2px 2px 5px rgba(0,0,0,.35);
                font: 11px/1.35 Verdana, Arial, sans-serif;
                pointer-events: none;
            }

            .${MODULE}-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,.22);
            }

            .${MODULE}-dialog {
                position: relative;
                min-width: 300px;
                max-width: 420px;
                box-sizing: border-box;
                padding: 12px;
                border: 1px solid #777;
                border-radius: 4px;
                background: #eeeeee;
                color: #111;
                box-shadow: 3px 3px 8px rgba(0,0,0,.4);
                font: 11px Verdana, Arial, sans-serif;
            }

            .${MODULE}-dialog-title {
                margin-bottom: 7px;
                text-align: center;
                font-size: 13px;
                font-weight: bold;
            }

            .${MODULE}-dialog-name {
                margin-bottom: 8px;
                text-align: center;
                font-weight: bold;
            }

            .${MODULE}-capture {
                display: block;
                width: 100%;
                box-sizing: border-box;
                margin: 0 auto 6px;
                padding: 6px;
                border: 1px solid #888;
                background: #fff;
                color: #111;
                text-align: center;
                font: bold 12px Consolas, monospace;
                cursor: text;
            }

            .${MODULE}-capture:focus {
                outline: 2px solid #7b9ec5;
                outline-offset: 1px;
            }

            .${MODULE}-dialog-status {
                min-height: 28px;
                margin: 3px 0 7px;
                color: #555;
                text-align: center;
                font-size: 10px;
            }

            .${MODULE}-dialog-status.${MODULE}-error {
                color: #900;
                font-weight: bold;
            }

            .${MODULE}-dialog-actions {
                display: flex;
                justify-content: center;
                gap: 8px;
            }

            .${MODULE}-btn {
                min-width: 78px;
                padding: 4px 9px;
                border: 1.5px outset #aaa;
                background: #ddd;
                color: #111;
                font: bold 11px Verdana, Arial, sans-serif;
                cursor: pointer;
            }

            .${MODULE}-btn:active {
                border-style: inset;
            }

            .${MODULE}-btn:disabled {
                color: #999;
                cursor: default;
            }

            .${MODULE}-clear-btn:hover,
            .${MODULE}-clear-btn:focus-visible {
                background: #7c1515;
                color: #fff;
                outline: none;
            }

            .${MODULE}-binding-display {
                margin: 2px 0 10px;
                text-align: center;
                font: bold 14px Consolas, monospace;
            }

            .${MODULE}-danger-card {
                min-width: 390px;
                padding: 34px 20px 22px;
                border: 2px solid #8b2222;
                background: #f2eeee;
            }

            .${MODULE}-danger-x {
                position: absolute;
                top: 5px;
                right: 6px;
                width: 23px;
                height: 23px;
                padding: 0;
                border: 1px solid #7e0000;
                border-radius: 2px;
                background: #b21e1e;
                color: #fff;
                font: bold 13px/21px Verdana, Arial, sans-serif;
                cursor: pointer;
            }

            .${MODULE}-danger-question {
                margin: 2px 10px 18px;
                text-align: center;
                font-size: 13px;
                font-weight: bold;
            }

            .${MODULE}-danger-confirm {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 220px;
                min-height: 64px;
                margin: 0 auto;
                border: 2px solid #aaa;
                border-radius: 3px;
                background: #c9c9c9;
                color: #777;
                cursor: pointer;
                transition: background-color 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
            }

            .${MODULE}-danger-confirm span {
                font: bold 13px Verdana, Arial, sans-serif;
            }

            .${MODULE}-danger-confirm strong {
                margin-top: 2px;
                font: bold 19px Verdana, Arial, sans-serif;
            }

            .${MODULE}-danger-confirm:hover,
            .${MODULE}-danger-confirm:focus-visible {
                border-color: #5b0000;
                background: #720d0d;
                color: #fff;
                outline: none;
            }
        `;

        document.head.appendChild(style);
    }
})();

// ============================================================================
// MODULE 9: AWAKE AND BAC BAR PAINTER
// Increments the Awake & BAC stat bars passively with Donator state awareness.
// ============================================================================
(function initAwakeRegen() {
    if (!HWUS_isModuleEnabled(9)) return;

    const awakeValue = document.querySelector('#awakeValue');
    const awakeBar = document.querySelector('#awakeBarFill');
    const clockEl = document.querySelector('#clock');
    const bacValue = document.querySelector('#bacValue');
    const bacBar = document.querySelector('#bacBarFill');

    if (!awakeValue || !awakeBar || !clockEl) return;

    const awakeMatch = String(awakeValue.textContent || '')
    .match(/(\d+)\s*\/\s*(\d+)/);

    if (!awakeMatch) return;

    const baseAwake = parseInt(awakeMatch[1], 10);
    const maxAwake = parseInt(awakeMatch[2], 10);
    const bacMatch = bacValue
        ? String(bacValue.textContent || '')
            .match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)%/)
        : null;

    const baseBac = bacMatch
        ? parseFloat(bacMatch[1])
        : null;

    const maxBac = bacMatch
        ? parseFloat(bacMatch[2])
        : null;

    const baseServerSeconds = parseGameClockSeconds(clockEl.textContent);

    if (
        !Number.isFinite(baseAwake) ||
        !Number.isFinite(maxAwake) ||
        !Number.isFinite(baseServerSeconds)
    ) {
        return;
    }

    const REGEN_AMOUNT = 5;
    const CRON_DELAY_SECONDS = 1;
    const CANDIDATE_STEP_SECONDS = 5 * 60;
    const SERVER_CLOCK_PHASE_MS = 1000;
    const MAJOR_RESET_COMPLETE_SECONDS = 4 * 60;
    const STORAGE_KEY = 'hw-awake-regen-state-v1';

    const CRON_MONITOR_LIMIT = 40;
    const cronMonitor = [];

    const pageObservedAt = Date.now() - SERVER_CLOCK_PHASE_MS;

    const awakeStatDiv = awakeValue.closest('.playerStatsDiv');
    if (!awakeStatDiv) return;

    awakeStatDiv.style.position = 'relative';

    const forfeitEl = document.createElement('div');
    forfeitEl.id = 'hw-awake-forfeit';
    forfeitEl.style.position = 'absolute';
    forfeitEl.style.right = '4px';
    forfeitEl.style.top = '50%';
    forfeitEl.style.transform = 'translateY(-50%)';
    forfeitEl.style.padding = '0 4px';
    forfeitEl.style.backgroundColor = '#ff0000';
    forfeitEl.style.color = '#000000';
    forfeitEl.style.outline = '1px solid #ffff00';
    forfeitEl.style.font = 'bold 14px/16px Verdana, sans-serif';
    forfeitEl.style.whiteSpace = 'nowrap';
    forfeitEl.style.pointerEvents = 'none';
    forfeitEl.style.zIndex = '2';
    forfeitEl.style.display = 'none';

    awakeStatDiv.appendChild(forfeitEl);

    let state = loadState();

    if (state) {
        advanceStoredStateTo(pageObservedAt);

        if (baseAwake < maxAwake) {
            state.forfeited = 0;
        }

        state.awake = baseAwake;
        state.observedAt = pageObservedAt;
        state.serverSeconds = baseServerSeconds;

        const freshDonatorDays = readDonatorDays();
        if (freshDonatorDays !== null) {
            state.donatorDays = freshDonatorDays;
        }

        saveState();
    } else {
        const freshDonatorDays = readDonatorDays();

        if (freshDonatorDays !== null) {
            state = {
                awake: baseAwake,
                observedAt: pageObservedAt,
                serverSeconds: baseServerSeconds,
                donatorDays: freshDonatorDays,
                forfeited: 0
            };

            saveState();
        }
    }

    function readDonatorDays() {
        const donatorBlock =
              document.querySelector('.becomedon');


        if (!donatorBlock) return null;

        const text =
              String(donatorBlock.textContent || '');


        const match = text.match(
            /(\d+)\s+days?\s+left\b/i
        );

        if (match) {
            const days =
                parseInt(match[1], 10);

            return Number.isFinite(days)
                ? Math.max(0, days)
                : null;
        }

        if (/Become\s+a\s+Donator!?/i.test(text)) {
            return 0;
        }

        return null;
    }

    function parseGameClockSeconds(text) {
        const match = String(text || '')
        .trim()
        .match(/^(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)$/i);

        if (!match) return NaN;

        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const second = parseInt(match[3], 10);
        const meridiem = match[4].toLowerCase();

        if (meridiem === 'am') {
            if (hour === 12) hour = 0;
        } else if (hour !== 12) {
            hour += 12;
        }

        return (hour * 3600) + (minute * 60) + second;
    }

    function formatBac(value) {
        return value
            .toFixed(2)
            .replace(/0+$/, '')
            .replace(/\.$/, '');
    }

    function loadState() {
        try {
            const raw = GM_getValue(STORAGE_KEY, '');
            if (!raw) return null;

            const parsed = JSON.parse(raw);

            if (
                !parsed ||
                !Number.isFinite(parsed.awake) ||
                !Number.isFinite(parsed.observedAt) ||
                !Number.isFinite(parsed.serverSeconds) ||
                !Number.isFinite(parsed.donatorDays) ||
                !Number.isFinite(parsed.forfeited)
            ) {
                return null;
            }

            return parsed;
        } catch {
            return null;
        }
    }

    function saveState() {
        if (!state) return;

        try {
            GM_setValue(
                STORAGE_KEY,
                JSON.stringify(state)
            );
        } catch {
            // Live projection remains functional without persistence.
        }
    }

    function mod(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function formatServerTime(serverAbs) {
        const seconds = mod(Math.floor(serverAbs), 86400);
        const hour = Math.floor(seconds / 3600);
        const minute = Math.floor((seconds % 3600) / 60);
        const second = seconds % 60;
        const meridiem = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;

        return (
            `${hour12}:` +
            `${String(minute).padStart(2, '0')}:` +
            `${String(second).padStart(2, '0')} ` +
            meridiem
        );
    }

    function recordCronJudgment(entry) {
        if (
            cronMonitor.some(
                row => row.candidate === entry.candidate
            )
        ) {
            return;
        }

        cronMonitor.push(entry);

        if (cronMonitor.length > CRON_MONITOR_LIMIT) {
            cronMonitor.shift();
        }

        console.table(cronMonitor);
    }

    function countMajorResets(startServerAbs, endServerAbs) {
        if (endServerAbs <= startServerAbs) return 0;

        return Math.max(
            0,
            Math.floor(
                (endServerAbs - MAJOR_RESET_COMPLETE_SECONDS) / 86400
            ) -
            Math.floor(
                (startServerAbs - MAJOR_RESET_COMPLETE_SECONDS) / 86400
            )
        );
    }

    function simulateAwake(
    startAwake,
     startObservedAt,
     startServerSeconds,
     startDonatorDays,
     endObservedAt,
     monitor = false
    ) {
        let awake = startAwake;
        let forfeited = 0;
        let refillCount = 0;

        const elapsedSeconds = Math.max(
            0,
            (endObservedAt - startObservedAt) / 1000
        );

        const startServerAbs = startServerSeconds;
        const endServerAbs = startServerAbs + elapsedSeconds;

        let candidate =
            Math.floor(
                (startServerAbs - CRON_DELAY_SECONDS) /
                CANDIDATE_STEP_SECONDS
            ) *
            CANDIDATE_STEP_SECONDS +
            CRON_DELAY_SECONDS;

        if (candidate <= startServerAbs) {
            candidate += CANDIDATE_STEP_SECONDS;
        }

        for (
            ;
            candidate <= endServerAbs;
            candidate += CANDIDATE_STEP_SECONDS
        ) {
            const nominalBoundary =
                  candidate - CRON_DELAY_SECONDS;

            const minute = Math.floor(
                mod(nominalBoundary, 3600) / 60
            );

            const resetsBeforeCandidate = countMajorResets(
                startServerAbs,
                candidate
            );

            const donorDaysAtCandidate = Math.max(
                0,
                startDonatorDays - resetsBeforeCandidate
            );

            const isDonator = donorDaysAtCandidate > 0;

            const refillApplies = isDonator
            ? minute % 10 === 0
            : minute % 15 === 0;

            if (monitor) {
                recordCronJudgment({
                    candidate,
                    threshold: formatServerTime(nominalBoundary),
                    appliedAt: formatServerTime(candidate),
                    minute,
                    donorDays: donorDaysAtCandidate,
                    status: isDonator ? 'DON' : 'NON-DON',
                    judgment: refillApplies ? 'REFILL +5' : 'SKIP',
                    awakeBefore: awake,
                    awakeAfter: refillApplies
                    ? Math.min(maxAwake, awake + REGEN_AMOUNT)
                    : awake
                });
            }

            if (!refillApplies) continue;

            const attemptedAwake =
                  awake + REGEN_AMOUNT;

            forfeited += Math.max(
                0,
                attemptedAwake - maxAwake
            );

            awake = Math.min(
                maxAwake,
                attemptedAwake
            );

            refillCount += 1;
        }

        const completedMajorResets = countMajorResets(
            startServerAbs,
            endServerAbs
        );

        return {
            awake,
            forfeited,
            refillCount,
            donatorDays: Math.max(
                0,
                startDonatorDays - completedMajorResets
            ),
            serverSeconds: mod(endServerAbs, 86400)
        };
    }

    function advanceStoredStateTo(targetObservedAt) {
        if (!state) return false;
        if (targetObservedAt <= state.observedAt) return false;

        const result = simulateAwake(
            state.awake,
            state.observedAt,
            state.serverSeconds,
            state.donatorDays,
            targetObservedAt,
            false
        );

        const changed =
              result.refillCount > 0 ||
              result.donatorDays !== state.donatorDays;

        if (!changed) return false;

        state.awake = result.awake;
        state.forfeited += result.forfeited;
        state.observedAt = targetObservedAt;
        state.serverSeconds = result.serverSeconds;
        state.donatorDays = result.donatorDays;

        saveState();

        return true;
    }

    function updateAwakeDisplay() {
        const now = Date.now();

        /*
     * Volatile Donator query:
     * no result is latched as current truth. Every repaint polls
     * .becomedon again. null means "unknown", not "non-Donator".
     */
        const liveDonatorDays = readDonatorDays();

        if (liveDonatorDays !== null) {
            const projection = simulateAwake(
                baseAwake,
                pageObservedAt,
                baseServerSeconds,
                liveDonatorDays,
                now,
                true
            );

            awakeValue.textContent =
                `${projection.awake}/${maxAwake}`;

            const percent = maxAwake > 0
            ? (projection.awake / maxAwake) * 100
            : 0;

            awakeBar.style.width = `${percent}%`;

            if (
                bacValue &&
                bacBar &&
                Number.isFinite(baseBac) &&
                Number.isFinite(maxBac)
            ) {
                const projectedBac = Math.max(
                    0,
                    baseBac -
                    projection.refillCount * 0.01
                );

                bacValue.textContent =
                    `${formatBac(projectedBac)}/${formatBac(maxBac)}%`;

                const bacPercent = maxBac > 0
                    ? (projectedBac / maxBac) * 100
                    : 0;

                bacBar.style.width =
                    `${bacPercent}%`;
            }

            if (!state) {
                state = {
                    awake: projection.awake,
                    observedAt: now,
                    serverSeconds: projection.serverSeconds,
                    donatorDays: projection.donatorDays,
                    forfeited: projection.forfeited
                };

                saveState();
            }
        }

        if (state) {
            advanceStoredStateTo(now);

            /*
         * A successful live poll becomes historical metadata only,
         * for reconstructing a future interval when HoboWars is closed.
         */
            if (liveDonatorDays !== null) {
                const elapsedSeconds = Math.max(
                    0,
                    (now - pageObservedAt) / 1000
                );

                const nowServerAbs =
                      baseServerSeconds + elapsedSeconds;

                state.donatorDays = Math.max(
                    0,
                    liveDonatorDays -
                    countMajorResets(
                        baseServerSeconds,
                        nowServerAbs
                    )
                );

                saveState();
            }
        }

        if (state && state.forfeited > 0) {
            forfeitEl.textContent =
                `-${state.forfeited}T`;

            forfeitEl.style.display = 'block';
        } else {
            forfeitEl.textContent = '';
            forfeitEl.style.display = 'none';
        }
    }

    updateAwakeDisplay();

    window.setInterval(
        updateAwakeDisplay,
        1000
    );

    document.addEventListener(
        'visibilitychange',
        function () {
            if (!document.hidden) {
                updateAwakeDisplay();
            }
        }
    );

    window.addEventListener(
        'focus',
        updateAwakeDisplay
    );

    window.addEventListener(
        'pageshow',
        updateAwakeDisplay
    );
})();

// ============================================================================
// MODULE 10: DYNAMIC GAME CLOCK
// Increments the native game clock while the window is idle of unfocused.
// ============================================================================
(function initDynamicGameClock() {
    if (!HWUS_isModuleEnabled(10)) return;

    const clockEl = document.querySelector('#clock');
    if (!clockEl) return;

    const match = String(clockEl.textContent || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2}):(\d{2})\s*([ap]m)$/i);

    if (!match) return;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const second = parseInt(match[3], 10);
    const meridiem = match[4].toLowerCase();

    if (meridiem === 'am') {
        if (hour === 12) hour = 0;
    } else if (hour !== 12) {
        hour += 12;
    }

    /*
     * Convert the native server-clock reading into elapsed seconds
     * since midnight. Date.now() is then used only to measure how much
     * real time has passed since that authoritative reading.
     */
    const baseSeconds =
          (hour * 3600) +
          (minute * 60) +
          second;

    const observedAt = Date.now() - 1000;

    function updateGameClock() {
        const elapsedSeconds = Math.floor(
            (Date.now() - observedAt) / 1000
        );

        let totalSeconds =
            (baseSeconds + elapsedSeconds) % 86400;

        if (totalSeconds < 0) {
            totalSeconds += 86400;
        }

        const h24 = Math.floor(totalSeconds / 3600);
        const min = Math.floor((totalSeconds % 3600) / 60);
        const sec = totalSeconds % 60;

        const ap = h24 >= 12 ? 'pm' : 'am';

        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;

        clockEl.textContent =
            `${h12}:${pad(min)}:${pad(sec)} ${ap}`;
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    updateGameClock();

    /*
     * The timer only repaints the clock. Actual elapsed time always
     * comes from Date.now(), so throttling or a sleeping tab cannot
     * accumulate clock drift.
     */
    window.setInterval(updateGameClock, 250);

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            updateGameClock();
        }
    });
})();

// ============================================================================
// MODULE 11: RECYCLING BIN QUICK-ADD
// Configurable quick-add buttons and displays yields for the Recycling Bin.
// ============================================================================
(function initRecyclingBinQuickAdd() {
    'use strict';

    if (!HWUS_isModuleEnabled(11)) return;

    const MODULE = 'hw-recycling-quick-add';
    const STORAGE_KEY = `${MODULE}:buttons`;
    const QUICK_ADD_MIN = 1;
    const QUICK_ADD_MAX = 9999;

    const url = new URL(location.href);
    if (
        !url.pathname.endsWith('/game/game.php') ||
        url.searchParams.get('cmd') !== 'recycling_bin'
    ) {
        return;
    }

    const form = document.forms.bin;
    const canInput = document.querySelector('#s_cans');
    const submitButton = form?.querySelector('input[type="submit"][name="Submit"]');

    if (!form || !canInput || !submitButton) return;

    const pageData = readPageData();
    if (!pageData) return;

    injectStyles();

    let quickAdds = loadQuickAdds();
    let settingsPopover = null;

    const controls = buildControls();
    const yieldDisplay = buildYieldDisplay();

    submitButton.insertAdjacentElement('beforebegin', controls.settingsButton);
    submitButton.insertAdjacentElement('afterend', controls.quickAddWrap);

    const priceNode = locatePerCanPriceNode();
    if (priceNode) {
        priceNode.insertAdjacentElement('afterend', yieldDisplay);
    } else {
        canInput.insertAdjacentElement('afterend', yieldDisplay);
    }

    renderQuickAddButtons();
    updateYieldDisplay();

    canInput.addEventListener('input', updateYieldDisplay);
    canInput.addEventListener('change', updateYieldDisplay);

    document.addEventListener('mousedown', event => {
        if (!settingsPopover) return;
        if (settingsPopover.contains(event.target)) return;
        if (controls.settingsButton.contains(event.target)) return;
        closeSettings();
    }, true);

    window.addEventListener('blur', closeSettings);

    function readPageData() {
        const content = document.querySelector('.content-area');
        if (!content) return null;

        const text = content.textContent || '';

        const recycledMatch = text.match(/Cans recycled so far today:\s*([\d,]+)/i);
        const priceMatch = text.match(/cans for\s*\$([\d,]+)\s*each/i);

        if (!recycledMatch || !priceMatch) return null;

        const recycledToday = parseInt(recycledMatch[1].replace(/,/g, ''), 10);
        const pricePerCan = parseInt(priceMatch[1].replace(/,/g, ''), 10);

        if (!Number.isFinite(recycledToday) || !Number.isFinite(pricePerCan)) {
            return null;
        }

        return { recycledToday, pricePerCan };
    }

    function locatePerCanPriceNode() {
        const bolds = Array.from(form.querySelectorAll('b'));
        return bolds.find(node => /^\$[\d,]+$/.test(node.textContent.trim())) || null;
    }

    function buildControls() {
        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.className = `${MODULE}-settings`;
        settingsButton.textContent = '⚙️';
        settingsButton.title = 'Configure Recycling quick-add buttons';
        settingsButton.setAttribute('aria-label', 'Configure Recycling quick-add buttons');

        const quickAddWrap = document.createElement('span');
        quickAddWrap.className = `${MODULE}-quick-wrap`;

        settingsButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            if (settingsPopover) {
                closeSettings();
            } else {
                openSettings();
            }
        });

        return { settingsButton, quickAddWrap };
    }

    function buildYieldDisplay() {
        const wrap = document.createElement('span');
        wrap.className = `${MODULE}-yield`;

        const cash = document.createElement('strong');
        cash.className = `${MODULE}-cash`;

        const points = document.createElement('span');
        points.className = `${MODULE}-points`;

        wrap.append(cash, points);
        wrap._cash = cash;
        wrap._points = points;

        return wrap;
    }

    function renderQuickAddButtons() {
        controls.quickAddWrap.replaceChildren();

        quickAdds
            .slice()
            .sort((a, b) => a - b)
            .forEach(amount => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `${MODULE}-quick-btn`;
                button.textContent = `+${amount}`;
                button.title = `Add ${amount.toLocaleString()} cans`;

                button.addEventListener('click', event => {
                    event.preventDefault();

                    const current = parseCanInput();
                    canInput.value = String(current + amount);

                    canInput.dispatchEvent(new Event('input', { bubbles: true }));
                    canInput.focus();
                });

                controls.quickAddWrap.appendChild(button);
            });
    }

    function parseCanInput() {
        const digits = String(canInput.value || '').replace(/[^\d]/g, '');
        const value = parseInt(digits, 10);
        return Number.isFinite(value) ? value : 0;
    }

    function updateYieldDisplay() {
        const quantity = parseCanInput();
        const cashYield = quantity * pageData.pricePerCan;
        const pointYield = calculatePointYield(pageData.recycledToday, quantity);

        yieldDisplay._cash.textContent = `$${cashYield.toLocaleString()}`;
        yieldDisplay._points.textContent = `+${formatPoints(pointYield)} pts`;

        yieldDisplay.classList.toggle(`${MODULE}-empty-yield`, quantity <= 0);
    }

    function calculatePointYield(alreadyRecycled, quantity) {
        let remaining = Math.max(0, quantity);
        let position = Math.max(0, alreadyRecycled);
        let total = 0;

        while (remaining > 0) {
            const bandIndex = Math.floor(position / 100);
            const rate = Math.max(0.01, 0.10 - (bandIndex * 0.01));

            const nextBoundary = bandIndex >= 9
                ? Infinity
                : (bandIndex + 1) * 100;

            const roomInBand = nextBoundary === Infinity
                ? remaining
                : Math.max(0, nextBoundary - position);

            const cansAtRate = Math.min(remaining, roomInBand || remaining);

            total += cansAtRate * rate;
            position += cansAtRate;
            remaining -= cansAtRate;
        }

        return total;
    }

    function formatPoints(value) {
        return Number(value || 0)
            .toFixed(2)
            .replace(/0+$/, '')
            .replace(/\.$/, '');
    }

    function openSettings() {
        closeSettings();

        const popover = document.createElement('div');
        popover.className = `${MODULE}-popover`;

        const title = document.createElement('div');
        title.className = `${MODULE}-popover-title`;
        title.textContent = 'Quick Add Buttons';

        const list = document.createElement('div');
        list.className = `${MODULE}-config-list`;

        const addRow = document.createElement('div');
        addRow.className = `${MODULE}-add-row`;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 4;
        input.placeholder = '1-9999';
        input.className = `${MODULE}-config-input`;
        input.setAttribute('aria-label', 'Quick add amount');

        const add = document.createElement('button');
        add.type = 'button';
        add.className = `${MODULE}-config-add`;
        add.textContent = 'Add';

        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 4);
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addConfiguredAmount();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeSettings();
            }
        });

        add.addEventListener('click', addConfiguredAmount);

        addRow.append(input, add);
        popover.append(title, list, addRow);
        document.body.appendChild(popover);

        settingsPopover = popover;

        function renderConfigList() {
            list.replaceChildren();

            if (!quickAdds.length) {
                const empty = document.createElement('div');
                empty.className = `${MODULE}-config-empty`;
                empty.textContent = 'No quick-add buttons configured.';
                list.appendChild(empty);
                return;
            }

            quickAdds
                .slice()
                .sort((a, b) => a - b)
                .forEach(amount => {
                    const row = document.createElement('div');
                    row.className = `${MODULE}-config-item`;

                    const label = document.createElement('span');
                    label.textContent = `+${amount}`;

                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = `${MODULE}-config-remove`;
                    remove.textContent = '×';
                    remove.title = `Remove +${amount}`;
                    remove.setAttribute('aria-label', `Remove +${amount}`);

                    remove.addEventListener('click', () => {
                        quickAdds = quickAdds.filter(value => value !== amount);
                        saveQuickAdds();
                        renderQuickAddButtons();
                        renderConfigList();
                    });

                    row.append(label, remove);
                    list.appendChild(row);
                });
        }

        function addConfiguredAmount() {
            const amount = parseInt(input.value, 10);

            if (
                !Number.isInteger(amount) ||
                amount < QUICK_ADD_MIN ||
                amount > QUICK_ADD_MAX
            ) {
                input.classList.add(`${MODULE}-invalid`);
                input.focus();
                return;
            }

            input.classList.remove(`${MODULE}-invalid`);

            if (!quickAdds.includes(amount)) {
                quickAdds.push(amount);
                quickAdds.sort((a, b) => a - b);
                saveQuickAdds();
                renderQuickAddButtons();
                renderConfigList();
            }

            input.value = '';
            input.focus();
        }

        renderConfigList();
        positionSettingsPopover(popover);
        input.focus();
    }

    function positionSettingsPopover(popover) {
        const rect = controls.settingsButton.getBoundingClientRect();
        const margin = 6;

        popover.style.left = `${Math.max(margin, rect.left)}px`;
        popover.style.top = `${rect.bottom + margin}px`;

        const popRect = popover.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        if (popRect.right > viewportWidth - margin) {
            popover.style.left = `${Math.max(margin, viewportWidth - popRect.width - margin)}px`;
        }

        if (popRect.bottom > viewportHeight - margin) {
            popover.style.top = `${Math.max(margin, rect.top - popRect.height - margin)}px`;
        }
    }

    function closeSettings() {
        if (!settingsPopover) return;
        settingsPopover.remove();
        settingsPopover = null;
    }

    function loadQuickAdds() {
        try {
            const parsed = JSON.parse(GM_getValue(STORAGE_KEY, '[]'));
            if (!Array.isArray(parsed)) return [];

            return [...new Set(
                parsed
                    .map(value => parseInt(value, 10))
                    .filter(value =>
                        Number.isInteger(value) &&
                        value >= QUICK_ADD_MIN &&
                        value <= QUICK_ADD_MAX
                    )
            )].sort((a, b) => a - b);
        } catch {
            return [];
        }
    }

    function saveQuickAdds() {
        GM_setValue(STORAGE_KEY, JSON.stringify(quickAdds));
    }

    function injectStyles() {
        if (document.getElementById(`${MODULE}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${MODULE}-styles`;
        style.textContent = `
            .${MODULE}-settings,
            .${MODULE}-quick-btn,
            .${MODULE}-config-add,
            .${MODULE}-config-remove {
                cursor: pointer;
            }

            .${MODULE}-settings {
                width: 15px;
                height: 16px;
                margin-right: 5px;
                padding: 0 2px 0 0;
                border: 1px solid #777;
                border-radius: 50%;
                background: #44aa66;
                line-height: 14px;
                font-size: 13px;
                vertical-align: middle;
            }

            .${MODULE}-settings:hover {
                background: #88ff88;
                animation: pulse 1.4s infinite;
            }
            .${MODULE}-quick-wrap {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                margin-left: 5px;
                vertical-align: middle;
            }

            .${MODULE}-quick-btn {
                min-width: 40px;
                padding: 2px 5px;
                border-radius: 3px;
                border: 1px solid #ccccee;
                background: #d3d3df;
                color: #666;
                font-weight: bold;
                font-size: 12px;
            }

            .${MODULE}-quick-btn:hover {
                color: #fff;
                background: #1b9eff;
                border-color: #8888ff;
                animation: pulse 1.5s linear infinite;
            }

            .${MODULE}-yield {
                display: inline-flex;
                min-width: 125px;
                margin-left: 10px;
                padding: 3px 8px;
                border: 1px solid #22bb22a8;
                background: #efffefb8;
                vertical-align: middle;
                align-items: center;
                justify-content: space-between;
                line-height: 1.1;
                border-radius: 4px;
                gap: 12px;
            }

            .${MODULE}-cash {
                color: #426842;
                font-size: 14px;
            }

            .${MODULE}-points {
                margin-top: 1px;
                color: #555;
                font-size: 10px;
                font-weight: bold;
            }

            .${MODULE}-empty-yield {
                opacity: 0.55;
            }

            .${MODULE}-popover {
                position: fixed;
                z-index: 2147483646;
                min-width: 190px;
                padding: 6px;
                border: 1px solid #777;
                border-radius: 3px;
                background: #f4f4f4;
                color: #111;
                box-shadow: 2px 3px 7px rgba(0, 0, 0, 0.35);
                font-family: Verdana, Arial, sans-serif;
                font-size: 11px;
            }

            .${MODULE}-popover-title {
                margin-bottom: 5px;
                padding-bottom: 3px;
                border-bottom: 1px solid #aaa;
                font-weight: bold;
                text-align: center;
            }

            .${MODULE}-config-list {
                display: flex;
                flex-direction: column;
                gap: 3px;
                margin-bottom: 6px;
            }

            .${MODULE}-config-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 22px;
                padding: 1px 3px 1px 7px;
                border: 1px solid #ccc;
                background: #fff;
                font-weight: bold;
            }

            .${MODULE}-config-remove {
                width: 22px;
                height: 20px;
                padding: 0;
                border: 0;
                background: transparent;
                color: #800;
                font-size: 15px;
                font-weight: bold;
                line-height: 18px;
            }

            .${MODULE}-config-remove:hover {
                background: #f3cccc;
            }

            .${MODULE}-config-empty {
                padding: 4px;
                color: #777;
                font-style: italic;
                text-align: center;
            }

            .${MODULE}-add-row {
                display: flex;
                gap: 4px;
            }

            .${MODULE}-config-input {
                width: 72px;
                min-width: 0;
                padding: 3px 5px;
                border: 1px solid #888;
                box-sizing: border-box;
                font: inherit;
                text-align: right;
            }

            .${MODULE}-config-input.${MODULE}-invalid {
                border-color: #b00000;
                background: #ffe5e5;
            }

            .${MODULE}-config-add {
                flex: 1 1 auto;
                padding: 3px 8px;
                border: 1px outset #aaa;
                background: #e6e6e6;
                font-weight: bold;
            }

            .${MODULE}-config-add:hover {
                background: #d8e8ff;
            }
        `;

        document.head.appendChild(style);
    }
})();

// ============================================================================
// MODULE 12: FIGHT SKILL RECAP
// Toggles a table of round-numbered skills in order of use & Cabana Card and Socks failures.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(12)) return;

    const MODULE = 'hw-fight-skill-sequence';
    const SKILL_COLOR = '#AA00AA';

    const fightDisplay = document.querySelector('.content-area #fightDisplay');
    if (!fightDisplay) return;

    const fightToggle = document.querySelector('#fightDisplayButton');
    if (!fightToggle) return;

    if (document.getElementById(`${MODULE}-button`)) return;

    let openPanel = null;

    injectStyles();

    const skillSum = document.createElement('span');
    skillSum.appendChild(document.createTextNode('] ['));

    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${MODULE}-button`;
    button.textContent = 'Skills';

    skillSum.appendChild(button);

    fightToggle.insertAdjacentElement('afterend', skillSum);

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        if (openPanel) {
            closePanel();
            return;
        }

        const parsed = parseSkillSequence();
        openPanel = buildPanel(parsed);
        document.body.appendChild(openPanel);
        positionPanel(openPanel, parsed.actors.length);

        button.classList.add(`${MODULE}-active`);
        button.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !openPanel) return;
        closePanel();
    }, true);

    window.addEventListener('resize', () => {
        if (!openPanel) return;
        positionPanel(openPanel, Number(openPanel.dataset.actorCount || 0));
    });

    function parseSkillSequence() {
        const events = [];
        const actors = [];
        const actorSet = new Set();

        const candidates = Array.from(
            fightDisplay.querySelectorAll('i > font[color]')
        );

        for (const font of candidates) {
            if (normalizeColor(font.getAttribute('color')) !== SKILL_COLOR) continue;

            const bolds = Array.from(font.querySelectorAll(':scope > b'));
            if (bolds.length < 2) continue;

            const actor = normalizeSpace(bolds[0].textContent || '');
            const skill = normalizeSpace(bolds[1].textContent || '');
            if (!actor || !skill) continue;

            const invocationText = normalizeSpace(font.textContent || '');
            const expected = normalizeSpace(`${actor} uses ${skill}!`);
            if (invocationText !== expected) continue;

            const invocationItalic = font.parentElement;
            const round = readRoundNumber(invocationItalic);
            const effectText = readEffectText(invocationItalic);
            const outcome = classifyOutcome(effectText, skill);

            events.push({ actor, skill, round, outcome, effectText });

            if (!actorSet.has(actor)) {
                actorSet.add(actor);
                actors.push(actor);
            }
        }

        return { actors, events };
    }

    function readRoundNumber(invocationItalic) {
        if (!invocationItalic) return null;

        let cursor = invocationItalic.previousSibling;

        // Walk upward line-by-line until we reach the most recent numbered
        // combat round. Unnumbered rat/pet actions can appear between a round
        // and a skill invocation, so those lines must be skipped rather than
        // treated as a hard boundary.
        while (cursor) {
            while (
                cursor &&
                (
                    (cursor.nodeType === Node.TEXT_NODE && !cursor.textContent.trim()) ||
                    (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === 'BR')
                )
            ) {
                cursor = cursor.previousSibling;
            }

            if (!cursor) break;

            const parts = [];

            while (
                cursor &&
                !(
                    cursor.nodeType === Node.ELEMENT_NODE &&
                    cursor.tagName === 'BR'
                )
            ) {
                parts.unshift(cursor.textContent || '');
                cursor = cursor.previousSibling;
            }

            const line = normalizeSpace(parts.join(' '));
            const match = line.match(/^(\d+)\s*[.:)]/);

            if (match) {
                return Number.parseInt(match[1], 10);
            }
        }

        return null;
    }

    function readEffectText(invocationItalic) {
        if (!invocationItalic) return '';

        const parts = [];
        let cursor = invocationItalic.nextSibling;

        while (cursor) {
            if (
                cursor.nodeType === Node.ELEMENT_NODE &&
                cursor.tagName === 'BR'
            ) {
                break;
            }

            parts.push(cursor.textContent || '');
            cursor = cursor.nextSibling;
        }

        return normalizeSpace(parts.join(' '));
    }

	function classifyOutcome(effectText, skill) {
	    const text = normalizeSpace(effectText);

	    if (
	        /fizzles?\s+out\s+thanks\s+to\b/i.test(text) &&
	        /Cabana Club Card/i.test(text)
	    ) {
	        return 'fizzle';
	    }

	    if (
	        /Filthy Socks/i.test(text) &&
	        /screw(?:s|ed)?\s+up\s+the\s+skill/i.test(text)
	    ) {
	        return 'screw-up';
	    }

	    if (
	        /^(?:LOL\s+)?(?:Takedown|Cripple)$/i.test(normalizeSpace(skill)) &&
	        /^It\s+misses\.$/i.test(text)
	    ) {
	        return 'miss';
	    }

	    return 'success';
	}

    function buildPanel(parsed) {
        const panel = document.createElement('section');
        panel.id = `${MODULE}-panel`;
        panel.dataset.actorCount = String(parsed.actors.length);
        panel.setAttribute('aria-label', 'Fight skill sequence');

        if (!parsed.events.length) {
            const empty = document.createElement('div');
            empty.className = `${MODULE}-empty`;
            empty.textContent = 'No skill uses found in this fight.';
            panel.appendChild(empty);
            return panel;
        }

        const grid = document.createElement('div');
        grid.className = `${MODULE}-grid`;
        grid.style.setProperty('--skill-columns', String(parsed.actors.length));

        for (const actor of parsed.actors) {
            const head = document.createElement('div');
            head.className = `${MODULE}-head`;
            head.textContent = actor;
            head.title = actor;
            grid.appendChild(head);
        }

        for (const event of parsed.events) {
            for (const actor of parsed.actors) {
                const cell = document.createElement('div');
                cell.className = `${MODULE}-cell`;

                if (actor === event.actor) {
                    cell.classList.add(`${MODULE}-used`);
                    renderEvent(cell, event);
                }

                grid.appendChild(cell);
            }
        }

        panel.appendChild(grid);
        return panel;
    }

    function renderEvent(cell, event) {
        if (Number.isInteger(event.round)) {
            const round = document.createElement('span');
            round.className = `${MODULE}-round`;
            round.textContent = `${event.round}. `;
            cell.appendChild(round);
        }

        const skill = document.createElement('span');
        skill.className = `${MODULE}-skill`;
        skill.textContent = event.skill;

        if (event.outcome === 'success') {
            cell.appendChild(skill);
            return;
        }

        cell.classList.add(`${MODULE}-failed`);
        skill.classList.add(`${MODULE}-struck`);

        const annotation = document.createElement('span');
        annotation.className = `${MODULE}-annotation`;
        annotation.textContent =
		    event.outcome === 'fizzle'
		        ? ' (fizzle)'
		        : event.outcome === 'miss'
		            ? ' (miss)'
		            : ' (screw up)';

        cell.title = event.effectText;
        cell.append(skill, annotation);
    }

    function positionPanel(panel) {
        if (!panel?.isConnected) return;

        const buttonRect = button.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        const scrollLeft =
            window.scrollX || document.documentElement.scrollLeft || 0;

        const scrollTop =
            window.scrollY || document.documentElement.scrollTop || 0;

        const viewportWidth = document.documentElement.clientWidth;

        const minLeft = scrollLeft + 208;
        const maxLeft =
            scrollLeft + viewportWidth - panelRect.width - 8;

        let preferredLeft;

        if (panelRect.width <= 100) {
            preferredLeft =
                buttonRect.left +
                scrollLeft +
                ((buttonRect.width - panelRect.width) / 2);
        } else {
            const preferredRight =
                buttonRect.right +
                scrollLeft +
                50;

            preferredLeft =
                preferredRight - panelRect.width;
        }

        const left = Math.min(
            Math.max(preferredLeft, minLeft),
            Math.max(minLeft, maxLeft)
        );

        const top =
            buttonRect.bottom +
            scrollTop +
            5;

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function closePanel() {
        openPanel?.remove();
        openPanel = null;
        button.classList.remove(`${MODULE}-active`);
        button.setAttribute('aria-expanded', 'false');
    }

    function normalizeColor(value) {
        const color = String(value || '').trim().toUpperCase();
        return /^#[0-9A-F]{6}$/.test(color) ? color : '';
    }

    function normalizeSpace(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function injectStyles() {
        if (document.getElementById(`${MODULE}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${MODULE}-styles`;
        style.textContent = `
            #${MODULE}-button {
                margin: 0;
                padding: 0;
                border: 0;
                background: none;
                color: #0000ee;
                font: inherit;
                line-height: inherit;
                vertical-align: baseline;
                cursor: pointer;
            }

            #${MODULE}-button:hover {
                text-decoration: underline;
            }

            #${MODULE}-button:focus-visible {
                outline: 1px dotted currentColor;
                outline-offset: 1px;
            }

            #${MODULE}-panel {
                position: absolute;
                z-index: 9;
                box-sizing: border-box;
                padding: 2px;
                border: 1px solid #666;
                border-radius: 3px;
                background: rgba(245, 245, 245, 0.73);
                color: #111;
                box-shadow: 2px 3px 7px rgba(0, 0, 0, 0.32);
                font: 11px/1.25 Verdana, Arial, sans-serif;
                text-align: left;
                pointer-events: none;
            }

            .${MODULE}-grid {
                display: grid;
                grid-template-columns:
                    repeat(var(--skill-columns), fit-content(140px));
                width: max-content;
                border-left: 1px solid #777;
                border-top: 1px solid #777;
            }

            .${MODULE}-head,
            .${MODULE}-cell {
                box-sizing: border-box;
                line-height: 1.4;
                padding: 1px 2px;
                white-space: nowrap;
                min-width: 0;
                max-width: 140px;
                border-right: 1px solid #777;
                border-bottom: 1px solid #777;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .${MODULE}-head {
                background: #eee;
                text-align: center;
                font-weight: bold;
            }

            .${MODULE}-used {
                background: #fbe8ff;
                font-weight: bold;
            }

            .${MODULE}-failed {
                background: #ddcccc;
                color: #555;
                font-weight: normal;
            }

            .${MODULE}-struck {
                text-decoration: line-through;
                text-decoration-thickness: 1px;
            }

            .${MODULE}-annotation {
                color: #777;
                font-size: 9px;
                white-space: nowrap;
            }

            .${MODULE}-empty {
                color: #666;
                text-align: center;
                font-style: italic;
            }
        `;

        document.head.appendChild(style);
    }
})();

// ============================================================================
// MODULE 13: FIGHT RECORD TRACKER
// Tracks per-Hobo wins, losses, and stalemates with battle-log reconciliation.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(13)) return;

    const params = new URLSearchParams(location.search);
    const cmd = params.get('cmd');

    const isOutgoingFight = cmd === 'fight' && /^\d+$/.test(params.get('ID') || '');
    const battleLogID = params.get('id');
    const isBattleLog = cmd === 'battlel' && /^\d+$/.test(battleLogID || '');
    const profileID = cmd === 'player' && /^\d+$/.test(params.get('ID') || '')
        ? params.get('ID')
        : null;
    const isProfile = !!profileID;

    function findBattleLogOverviewTable() {
        return [...document.querySelectorAll('table')].find(table => {
            const headers = [...table.querySelectorAll('thead th')]
                .map(th => (th.textContent || '').trim().toLowerCase());

            return (
                headers.includes('time') &&
                headers.includes('attacker') &&
                headers.includes('defender') &&
                headers.includes('outcome') &&
                table.querySelector('a[href*="cmd=battlel"][href*="id="]')
            );
        }) || null;
    }

    const battleLogOverviewTable = findBattleLogOverviewTable();
    const isBattleLogOverview =
        cmd === 'battlel' &&
        !isBattleLog &&
        !!battleLogOverviewTable;

    if (!isOutgoingFight && !isBattleLog && !isBattleLogOverview && !isProfile) return;

    const MY_ID = HWUS_getCurrentPlayerId();
    if (!MY_ID) return;

    const LEGACY_STORAGE_KEY = 'hwFightRecordTracker.v0.1';
    const STORAGE_KEY = `${LEGACY_STORAGE_KEY}:${MY_ID}`;

    migrateLegacyState();

    const pageText = document.body.innerText || '';

    function migrateLegacyState() {
        try {
            if (localStorage.getItem(STORAGE_KEY)) return;
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
                localStorage.setItem(STORAGE_KEY, legacy);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
        } catch {
            // Storage failure is handled by the normal load/save fallbacks below.
        }
    }

    function loadState() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                opponents: parsed.opponents && typeof parsed.opponents === 'object'
                    ? parsed.opponents
                    : {}
            };
        } catch {
            return { opponents: {} };
        }
    }

    function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function ensureOpponent(state, id, name) {
        if (!state.opponents[id]) {
            state.opponents[id] = {
                name: name || `Hobo ${id}`,
                wins: 0,
                losses: 0,
                stalemates: 0,
                seen: {}
            };
        }

        const record = state.opponents[id];

        if (name) record.name = name;
        if (!record.seen || typeof record.seen !== 'object') record.seen = {};

        return record;
    }

    function hasSeen(record, key) {
        return Object.prototype.hasOwnProperty.call(record.seen, key);
    }

    function incrementOutcome(record, result, amount = 1) {
        if (result === 'win') record.wins = Math.max(0, record.wins + amount);
        else if (result === 'loss') record.losses = Math.max(0, record.losses + amount);
        else if (result === 'stalemate') {
            record.stalemates = Math.max(0, record.stalemates + amount);
        }
    }

    function makeSeenEntry(result, source, extra = {}) {
        return {
            recordedAt: Date.now(),
            result,
            source,
            provisional: false,
            ...extra
        };
    }

    const BATTLE_TIME_TOLERANCE_SECONDS = 1;
    const SYNTHETIC_YEAR_SECONDS = 366 * 24 * 60 * 60;

    function parseClockParts(text) {
        const match = String(text || '').trim().match(
            /^(\d{1,2}):(\d{2})[.:](\d{2})\s*(am|pm)$/i
        );
        if (!match) return null;

        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const second = Number(match[3]);
        const ap = match[4].toLowerCase();

        if (ap === 'pm' && hour < 12) hour += 12;
        if (ap === 'am' && hour === 12) hour = 0;

        if (hour > 23 || minute > 59 || second > 59) return null;
        return { hour, minute, second };
    }

    function monthNumber(name) {
        const months = {
            jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
            jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
        };
        return months[String(name || '').slice(0, 3).toLowerCase()] || 0;
    }

    function makeSyntheticMoment(month, day, clock) {
        if (!month || !day || !clock) return null;

        const ms = Date.UTC(2000, month - 1, day, clock.hour, clock.minute, clock.second);
        if (!Number.isFinite(ms)) return null;
        return Math.floor(ms / 1000);
    }

    function parseCurrentFightMoment() {
        // Only a freshly generated outgoing fight is useful here. A viewed
        // battle-log page carries the time it was opened, not the fight time.
        if (!isOutgoingFight) return null;

        const dateText = (document.querySelector('.clock i')?.textContent || '').trim();
        const dateMatch = dateText.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        if (!dateMatch) return null;

        const clock = parseClockParts(document.querySelector('#clock')?.textContent || '');
        return makeSyntheticMoment(
            monthNumber(dateMatch[1]),
            Number(dateMatch[2]),
            clock
        );
    }

    function parseOverviewMoment(text) {
        const match = String(text || '').trim().match(
            /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2}\.\d{2}\s*(?:am|pm))$/i
        );
        if (!match) return null;

        return makeSyntheticMoment(
            Number(match[1]),
            Number(match[2]),
            parseClockParts(match[3])
        );
    }

    function inferAbsoluteFightTime(month, day, clock) {
        if (!month || !day || !clock) return 0;

        const now = new Date();
        let value = new Date(
            now.getFullYear(),
            month - 1,
            day,
            clock.hour,
            clock.minute,
            clock.second,
            0
        ).getTime();

        if (!Number.isFinite(value)) return 0;

        // Around New Year, a December battle-log row viewed in January belongs
        // to the previous year rather than eleven months in the future.
        if (value > Date.now() + (2 * 24 * 60 * 60 * 1000)) {
            value = new Date(
                now.getFullYear() - 1,
                month - 1,
                day,
                clock.hour,
                clock.minute,
                clock.second,
                0
            ).getTime();
        }

        return Number.isFinite(value) ? value : 0;
    }

    function parseBattleLogTimestamp(text) {
        const raw = String(text || '').trim();
        const match = raw.match(
            /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2}\.\d{2}\s*(?:am|pm))$/i
        );
        if (!match) return null;

        const clock = parseClockParts(match[3]);
        const timestamp = inferAbsoluteFightTime(
            Number(match[1]),
            Number(match[2]),
            clock
        );
        if (!timestamp) return null;

        return {
            source: 'battle-log',
            timestamp,
            text: raw,
            result: null
        };
    }

    function parseOutgoingFightTimestamp() {
        if (!isOutgoingFight) return null;

        const dateText = (document.querySelector('.clock i')?.textContent || '').trim();
        const dateMatch = dateText.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        const clockText = (document.querySelector('#clock')?.textContent || '').trim();
        const clock = parseClockParts(clockText);
        if (!dateMatch || !clock) return null;

        const month = monthNumber(dateMatch[1]);
        const day = Number(dateMatch[2]);
        const timestamp = inferAbsoluteFightTime(month, day, clock);
        if (!timestamp) return null;

        return {
            source: 'game-clock',
            timestamp,
            text: `${dateMatch[1]} ${day}, ${clockText}`,
            result: null
        };
    }

    function setLatestFight(record, candidate) {
        if (!record || !candidate || !Number.isFinite(Number(candidate.timestamp))) return;
        if (!['win', 'loss', 'stalemate'].includes(candidate.result)) return;

        const current = record.latestFight && typeof record.latestFight === 'object'
            ? record.latestFight
            : null;
        const currentTime = Number(current?.timestamp) || 0;
        const candidateTime = Number(candidate.timestamp) || 0;

        const shouldReplace =
            candidateTime > currentTime ||
            (
                candidateTime === currentTime &&
                candidate.source === 'battle-log' &&
                current?.source !== 'battle-log'
            );

        if (!shouldReplace) return;

        record.latestFight = {
            source: candidate.source,
            timestamp: candidateTime,
            text: String(candidate.text || ''),
            result: candidate.result,
            attackerId: /^\d+$/.test(String(candidate.attackerId || ''))
                ? String(candidate.attackerId)
                : null,
            defenderId: /^\d+$/.test(String(candidate.defenderId || ''))
                ? String(candidate.defenderId)
                : null
        };
    }

    function momentDifferenceSeconds(a, b) {
        if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
        const raw = Math.abs(a - b);
        return Math.min(raw, Math.abs(SYNTHETIC_YEAR_SECONDS - raw));
    }

    function getFightOrientation(opponent) {
        if (!opponent) return null;

        if (isOutgoingFight) {
            return { attackerId: MY_ID, defenderId: opponent.id };
        }

        if (isBattleLog) {
            const participants = parseParticipants();
            if (participants.length >= 2) {
                return {
                    attackerId: participants[0].id,
                    defenderId: participants[1].id
                };
            }
        }

        return null;
    }

    function getDirectFightMetadata(opponent) {
        const orientation = getFightOrientation(opponent);
        const fightMoment = parseCurrentFightMoment();

        if (!orientation || !Number.isFinite(fightMoment)) return {};

        return {
            attackerId: orientation.attackerId,
            defenderId: orientation.defenderId,
            fightMoment
        };
    }

    function findTimestampBridge(record, attackerId, defenderId, result, overviewMoment) {
        if (!record || !Number.isFinite(overviewMoment)) return null;

        const candidates = Object.entries(record.seen || {}).filter(([key, entry]) => {
            if (key.startsWith('battlel:')) return false;
            if (!entry || typeof entry !== 'object') return false;
            if (entry.source !== 'outgoing') return false;
            if (entry.result !== result) return false;
            if (entry.attackerId !== attackerId || entry.defenderId !== defenderId) return false;

            return momentDifferenceSeconds(entry.fightMoment, overviewMoment)
                <= BATTLE_TIME_TOLERANCE_SECONDS;
        });

        return candidates.length === 1
            ? { key: candidates[0][0], entry: candidates[0][1] }
            : null;
    }

    function findFightHeader() {
        const candidates = [...document.querySelectorAll('body *')];

        return candidates.find(el => {
            const text = (el.textContent || '').trim();
            return text.startsWith('View Fight:') && /\(\d+\)/.test(text);
        }) || null;
    }

    function parseParticipants() {
        const content = document.querySelector('.content-area') || document.body;
        const participants = [];
        const seen = new Set();

        for (const anchor of content.querySelectorAll('a[href*="cmd=player"][href*="ID="]')) {
            const href = anchor.getAttribute('href') || '';
            const idMatch = href.match(/[?&]ID=(\d+)/i);
            if (!idMatch) continue;

            const id = idMatch[1];
            if (seen.has(id)) continue;

            const name = (anchor.textContent || '').trim();
            if (!name) continue;

            seen.add(id);
            participants.push({ name, id });

            if (participants.length === 2) break;
        }

        return participants;
    }

    function getOpponent() {
        if (isOutgoingFight) {
            const id = params.get('ID');
            const participants = parseParticipants();
            const participant = participants.find(p => p.id === id);

            return {
                id,
                name: participant?.name || `Hobo ${id}`
            };
        }

        const participants = parseParticipants();
        const opponent = participants.find(p => p.id !== MY_ID);

        return opponent || null;
    }

    function parseOutcome(opponent) {
        if (!opponent) return null;

        const defeatedLines = pageText
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => /\bis defeated\b/i.test(line));

        if (defeatedLines.some(line => line.includes(`(${opponent.id})`))) {
            return 'win';
        }

        // Fight-result defeat lines normally contain names rather than IDs.
        if (opponent.name && defeatedLines.some(line =>
            line.toLowerCase().includes(opponent.name.toLowerCase())
        )) {
            return 'win';
        }

        const myParticipant = parseParticipants().find(p => p.id === MY_ID);
        if (myParticipant?.name && defeatedLines.some(line =>
            line.toLowerCase().includes(myParticipant.name.toLowerCase())
        )) {
            return 'loss';
        }

        // First-pass stalemate recognition. If HoboWars uses different wording,
        // the fight is deliberately left unrecorded rather than guessed.
        if (
            /\bstalemate\b/i.test(pageText) ||
            /\bends? in a draw\b/i.test(pageText) ||
            /\bneither .* (?:is|was) defeated\b/i.test(pageText)
        ) {
            return 'stalemate';
        }

        return null;
    }

    function parseFirstLandedDamage() {
        const lines = pageText.split(/\n+/);

        for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!/^\d+\./.test(line)) continue;

            const damageMatch =
                line.match(/\btaking\s+([\d,]+)\s+life\b/i) ||
                line.match(/\bfor\s+([\d,]+)\s+life\b/i);

            if (damageMatch) {
                return Number(damageMatch[1].replace(/,/g, ''));
            }
        }

        return 0;
    }

    function parseFinalTurn() {
        let maxTurn = 0;

        for (const match of pageText.matchAll(/(?:^|\n)\s*(\d+)\./g)) {
            const turn = Number(match[1]);
            if (turn > maxTurn) maxTurn = turn;
        }

        return maxTurn;
    }

    function parseFirstRatDamage() {
        const lines = pageText.split(/\n+/);

        for (const rawLine of lines) {
            const line = rawLine.trim();
            const match = line.match(/\bbites\b.+?\bfor\s+([\d,]+)\s+damage\b/i);

            if (match) {
                return Number(match[1].replace(/,/g, ''));
            }
        }

        return 0;
    }

    function buildFightKey(opponentID) {
        return [
            opponentID,
            parseFirstLandedDamage(),
            parseFinalTurn(),
            parseFirstRatDamage()
        ].join('|');
    }

    function isCompletedFight(result) {
        if (!result) return false;

        const firstDamage = parseFirstLandedDamage();
        const finalTurn = parseFinalTurn();

        return firstDamage > 0 && finalTurn > 0;
    }

    function getBattleLogKey() {
        if (!isBattleLog) return null;

        return /^\d+$/.test(battleLogID || '')
            ? `battlel:${battleLogID}`
            : null;
    }

    function getFightKeys(opponentID) {
        const compactKey = buildFightKey(opponentID);
        const battleLogKey = getBattleLogKey();

        return battleLogKey
            ? [battleLogKey, compactKey]
            : [compactKey];
    }

    function reconcileViewedBattleLog(opponent, result) {
        const battleLogKey = getBattleLogKey();
        if (!battleLogKey || !opponent || !isCompletedFight(result)) return null;

        const compactKey = buildFightKey(opponent.id);
        const state = loadState();
        const record = ensureOpponent(state, opponent.id, opponent.name);

        const battleKnown = hasSeen(record, battleLogKey);
        const compactKnown = hasSeen(record, compactKey);

        if (!battleKnown && !compactKnown) return null;

        const battleEntry = battleKnown ? record.seen[battleLogKey] : null;
        const isProvisionalOverviewEntry =
            !!battleEntry &&
            typeof battleEntry === 'object' &&
            battleEntry.provisional === true &&
            battleEntry.source === 'overview';

        if (battleKnown && compactKnown && isProvisionalOverviewEntry) {
            const duplicateResult = battleEntry.result || result;

            incrementOutcome(record, duplicateResult, -1);
            record.seen[battleLogKey] = makeSeenEntry(
                duplicateResult,
                'alias',
                { aliasOf: compactKey, reconciledDuplicate: true }
            );

            saveState(state);

            return {
                revokedDuplicate: true,
                message: 'Duplicate overview entry revoked.'
            };
        }

        if (battleKnown && !compactKnown) {
            const linkedResult =
                battleEntry && typeof battleEntry === 'object'
                    ? (battleEntry.result || result)
                    : result;

            record.seen[compactKey] = makeSeenEntry(
                linkedResult,
                'alias',
                { aliasOf: battleLogKey }
            );

            if (isProvisionalOverviewEntry) {
                record.seen[battleLogKey] = {
                    ...battleEntry,
                    provisional: false,
                    reconciled: true
                };
            }

            saveState(state);

            return {
                linked: true,
                message: 'Battle-log entry linked to its compact fight key.'
            };
        }

        if (!battleKnown && compactKnown) {
            record.seen[battleLogKey] = makeSeenEntry(
                result,
                'alias',
                { aliasOf: compactKey }
            );

            saveState(state);

            return {
                linked: true,
                message: 'Battle ID linked to an existing fight record.'
            };
        }

        return null;
    }

    function recordFight(_state, opponent, result) {
        if (!opponent || !isCompletedFight(result)) {
            return { recorded: false, reason: 'No completed fight result was recognized.' };
        }

        // Always re-read storage at the moment of the increment. This makes
        // duplicate protection authoritative even across repeated clicks,
        // back/forward restores, or another open HoboWars tab.
        const state = loadState();
        const record = ensureOpponent(state, opponent.id, opponent.name);
        const fightKeys = getFightKeys(opponent.id);

        if (fightKeys.some(key => hasSeen(record, key))) {
            return {
                recorded: false,
                reason: 'This fight is already recorded.',
                fightKey: fightKeys[0]
            };
        }

        if (!['win', 'loss', 'stalemate'].includes(result)) {
            return { recorded: false, reason: 'Unknown result.', fightKey: fightKeys[0] };
        }

        incrementOutcome(record, result, 1);

        const source = isBattleLog ? 'manual-log' : 'outgoing';
        const fightMetadata = isOutgoingFight
            ? getDirectFightMetadata(opponent)
            : {};

        for (const key of fightKeys) {
            record.seen[key] = makeSeenEntry(result, source, fightMetadata);
        }

        if (isOutgoingFight) {
            const latestFight = parseOutgoingFightTimestamp();
            if (latestFight) {
                setLatestFight(record, {
                    ...latestFight,
                    result,
                    attackerId: fightMetadata.attackerId,
                    defenderId: fightMetadata.defenderId
                });
            }
        }

        saveState(state);

        return { recorded: true, fightKey: fightKeys[0] };
    }

    function parseProfileCell(cell) {
        if (!cell) return null;

        const anchor = cell.querySelector('a[href*="cmd=player"][href*="ID="]');
        if (!anchor) return null;

        const href = anchor.getAttribute('href') || '';
        const idMatch = href.match(/[?&]ID=(\d+)/i);
        if (!idMatch) return null;

        const nameNode = anchor.querySelector('.player-name');
        const name = ((nameNode || anchor).textContent || '').trim();

        return {
            id: idMatch[1],
            name: name || `Hobo ${idMatch[1]}`
        };
    }

    function parseOverviewOutcome(cell) {
        if (!cell) return null;

        const image = cell.querySelector('img[title], img[alt]');
        const raw = (
            image?.getAttribute('title') ||
            image?.getAttribute('alt') ||
            ''
        ).trim().toLowerCase();

        if (raw.includes('win')) return 'win';
        if (raw.includes('loss')) return 'loss';
        if (raw.includes('stalemate') || raw.includes('draw')) return 'stalemate';

        return null;
    }

    function importBattleLogOverview(table) {
        const state = loadState();
        let added = 0;
        let alreadyKnown = 0;
        let skipped = 0;

        for (const row of table.tBodies?.[0]?.rows || []) {
            const timeCell = row.querySelector('.ts_time');
            const attackerCell = row.querySelector('.ts_atk');
            const defenderCell = row.querySelector('.ts_def');
            const viewLink = row.querySelector('a[href*="cmd=battlel"][href*="id="]');

            const attacker = parseProfileCell(attackerCell);
            const defender = parseProfileCell(defenderCell);

            if (!timeCell || !attacker || !defender || !viewLink) {
                skipped += 1;
                continue;
            }

            const href = viewLink.getAttribute('href') || '';
            const battleIDMatch = href.match(/[?&]id=(\d+)/i);
            if (!battleIDMatch) {
                skipped += 1;
                continue;
            }

            const opponent =
                attacker.id === MY_ID ? defender :
                defender.id === MY_ID ? attacker :
                null;

            if (!opponent) {
                skipped += 1;
                continue;
            }

            const outcomeCell = viewLink.closest('td');
            const result = parseOverviewOutcome(outcomeCell);

            if (!result) {
                skipped += 1;
                continue;
            }

            const battleLogKey = `battlel:${battleIDMatch[1]}`;
            const record = ensureOpponent(state, opponent.id, opponent.name);

            // Battle Log time is authoritative for the latest-fight display,
            // independently of whether this row is already represented in the ledger.
            const battleTimestamp = parseBattleLogTimestamp(timeCell.textContent || '');
            if (battleTimestamp) {
                setLatestFight(record, {
                    ...battleTimestamp,
                    result,
                    attackerId: attacker.id,
                    defenderId: defender.id
                });
            }

            if (hasSeen(record, battleLogKey)) {
                alreadyKnown += 1;
                continue;
            }

            const overviewMoment = parseOverviewMoment(timeCell.textContent || '');
            const timestampBridge = findTimestampBridge(
                record,
                attacker.id,
                defender.id,
                result,
                overviewMoment
            );

            if (timestampBridge) {
                record.seen[battleLogKey] = makeSeenEntry(
                    result,
                    'alias',
                    {
                        aliasOf: timestampBridge.key,
                        timestampBridge: true,
                        attackerId: attacker.id,
                        defenderId: defender.id,
                        fightMoment: overviewMoment
                    }
                );
                alreadyKnown += 1;
                continue;
            }

            incrementOutcome(record, result, 1);
            record.seen[battleLogKey] = {
                ...makeSeenEntry(result, 'overview', {
                    attackerId: attacker.id,
                    defenderId: defender.id,
                    fightMoment: overviewMoment
                }),
                provisional: true
            };

            added += 1;
        }

        saveState(state);

        return { added, alreadyKnown, skipped };
    }

    function installBattleLogImportButton(table) {
        if (!table || document.getElementById('hw-fight-record-import-button')) return;

        const button = document.createElement('button');
        button.id = 'hw-fight-record-import-button';
        button.type = 'button';
        button.className = 'btn';
        button.textContent = 'Import Fight Records';
        button.style.cssText = 'display:block;margin:0 auto 10px;user-select:none';

        const status = document.createElement('div');
        status.id = 'hw-fight-record-import-status';
        status.style.cssText = [
            'margin:-5px auto 10px',
            'text-align:center',
            'font:11px Arial,sans-serif',
            'color:#555'
        ].join(';');

        button.addEventListener('click', () => {
            const result = importBattleLogOverview(table);
            status.textContent =
                `Added ${result.added}; ${result.alreadyKnown} already recorded; ${result.skipped} skipped.`;
        });

        table.parentNode.insertBefore(button, table);
        table.parentNode.insertBefore(status, table);
    }

    function findProfileJournalTable() {
        const profileLabel = [...document.querySelectorAll('td b u')].find(node =>
            (node.textContent || '').trim().toLowerCase() === 'profile:'
        );

        const profileCell = profileLabel?.closest('td');
        if (!profileCell) return null;

        return [...profileCell.querySelectorAll(':scope > table')].find(table => {
            const firstRowText = (table.rows?.[0]?.textContent || '').trim();
            return /\bPersonal Journal\b/i.test(firstRowText);
        }) || null;
    }

    function getCurrentDisplayedName(id, fallback = '') {
        const wanted = String(id || '');
        if (!/^\d+$/.test(wanted)) return String(fallback || '');

        if (wanted === MY_ID) {
            const selfLink = document.querySelector(
                '.left-panel .pname a[href*="cmd=player"][href*="ID="]'
            );
            if (HWUS_extractPlayerId(selfLink) === wanted) {
                const name = (selfLink.textContent || '').trim();
                if (name) return name;
            }
        }

        const links = [...document.querySelectorAll('a[href*="cmd=player"][href*="ID="]')];
        const match = links.find(link => HWUS_extractPlayerId(link) === wanted && (link.textContent || '').trim());
        return match ? (match.textContent || '').trim() : String(fallback || `Hobo ${wanted}`);
    }

    function syntheticMomentFromTimestamp(timestamp) {
        const date = new Date(Number(timestamp));
        if (!Number.isFinite(date.getTime())) return null;
        return makeSyntheticMoment(
            date.getMonth() + 1,
            date.getDate(),
            {
                hour: date.getHours(),
                minute: date.getMinutes(),
                second: date.getSeconds()
            }
        );
    }

    function getLatestFightOrientation(record) {
        const latest = record?.latestFight;
        if (!latest || typeof latest !== 'object') return null;

        if (
            /^\d+$/.test(String(latest.attackerId || '')) &&
            /^\d+$/.test(String(latest.defenderId || ''))
        ) {
            return {
                attackerId: String(latest.attackerId),
                defenderId: String(latest.defenderId)
            };
        }

        const targetMoment = syntheticMomentFromTimestamp(latest.timestamp);
        if (!Number.isFinite(targetMoment)) return null;

        const candidates = Object.values(record.seen || {})
            .filter(entry =>
                entry &&
                typeof entry === 'object' &&
                entry.result === latest.result &&
                /^\d+$/.test(String(entry.attackerId || '')) &&
                /^\d+$/.test(String(entry.defenderId || '')) &&
                Number.isFinite(Number(entry.fightMoment))
            )
            .map(entry => ({
                attackerId: String(entry.attackerId),
                defenderId: String(entry.defenderId),
                delta: momentDifferenceSeconds(Number(entry.fightMoment), targetMoment)
            }))
            .filter(entry => entry.delta <= BATTLE_TIME_TOLERANCE_SECONDS)
            .sort((a, b) => a.delta - b.delta);

        return candidates[0] || null;
    }

    function currentGameTimestamp() {
        const dateText = (document.querySelector('.clock i')?.textContent || '').trim();
        const dateMatch = dateText.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
        const clock = parseClockParts(document.querySelector('#clock')?.textContent || '');
        if (!dateMatch || !clock) return Date.now();

        return inferAbsoluteFightTime(
            monthNumber(dateMatch[1]),
            Number(dateMatch[2]),
            clock
        ) || Date.now();
    }

    function addCalendarMonthsClamped(date, count) {
        const result = new Date(date.getTime());
        const originalDay = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + count);
        const lastDay = new Date(
            result.getFullYear(),
            result.getMonth() + 1,
            0,
            result.getHours(),
            result.getMinutes(),
            result.getSeconds(),
            result.getMilliseconds()
        ).getDate();
        result.setDate(Math.min(originalDay, lastDay));
        return result;
    }

    function addCalendarYearsClamped(date, count) {
        const result = new Date(date.getTime());
        const month = result.getMonth();
        const day = result.getDate();
        result.setDate(1);
        result.setFullYear(result.getFullYear() + count);
        result.setMonth(month);
        const lastDay = new Date(
            result.getFullYear(),
            month + 1,
            0,
            result.getHours(),
            result.getMinutes(),
            result.getSeconds(),
            result.getMilliseconds()
        ).getDate();
        result.setDate(Math.min(day, lastDay));
        return result;
    }

    function formatFightElapsed(timestamp) {
        const start = new Date(Number(timestamp));
        const end = new Date(currentGameTimestamp());
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '—';
        if (end < start) return '0s';

        let years = 0;
        while (addCalendarYearsClamped(start, years + 1) <= end) years += 1;
        if (years > 0) return `${years}y`;

        let months = 0;
        while (months < 11 && addCalendarMonthsClamped(start, months + 1) <= end) months += 1;
        if (months > 0) {
            const monthAnchor = addCalendarMonthsClamped(start, months);
            const days = Math.floor((end - monthAnchor) / 86400000);
            return `${months}m ${Math.max(0, days)}d`;
        }

        const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
        const days = Math.floor(totalSeconds / 86400);
        if (days >= 7) {
            const weeks = Math.floor(days / 7);
            return `${weeks}w ${days % 7}d`;
        }

        if (days >= 1) {
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            return `${days}d ${hours}h`;
        }

        const hours = Math.floor(totalSeconds / 3600);
        if (hours >= 1) {
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }

        const minutes = Math.floor(totalSeconds / 60);
        if (minutes >= 1) {
            return `${minutes}m ${totalSeconds % 60}s`;
        }

        return `${totalSeconds}s`;
    }

    function buildProfileLatestFightLine(record) {
        const latest = record?.latestFight;
        if (!latest || typeof latest !== 'object' || !Number.isFinite(Number(latest.timestamp))) {
            return null;
        }

        const orientation = getLatestFightOrientation(record);
        const attackerId = orientation?.attackerId || MY_ID;
        const defenderId = orientation?.defenderId || profileID;

        const myFallback = attackerId === MY_ID || defenderId === MY_ID ? '' : `Hobo ${MY_ID}`;
        const opponentFallback = record.name || `Hobo ${profileID}`;

        const attackerName = getCurrentDisplayedName(
            attackerId,
            attackerId === MY_ID ? myFallback : opponentFallback
        );
        const defenderName = getCurrentDisplayedName(
            defenderId,
            defenderId === MY_ID ? myFallback : opponentFallback
        );

        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:0 6px 5px;color:#555;font-size:11px';
        wrap.appendChild(document.createTextNode(`Last: ${attackerName} ▸ ${defenderName} `));

        const resultMark = document.createElement('span');
        if (latest.result === 'win') {
            resultMark.textContent = '▲';
            resultMark.style.color = '#00aa00';
        } else if (latest.result === 'loss') {
            resultMark.textContent = '▼';
            resultMark.style.color = '#aa0000';
        } else {
            resultMark.textContent = '◆';
            resultMark.style.color = '#666666';
        }
        resultMark.style.fontWeight = 'bold';

        wrap.appendChild(resultMark);
        wrap.appendChild(document.createTextNode(`  (◴ ${formatFightElapsed(latest.timestamp)})`));
        return wrap;
    }

    function renderProfileFightRecord() {
        if (!isProfile || profileID === MY_ID) return false;

        const state = loadState();
        const record = state.opponents?.[profileID];
        if (!record || typeof record !== 'object') return false;

        const wins = Math.max(0, Number(record.wins) || 0);
        const losses = Math.max(0, Number(record.losses) || 0);
        const stalemates = Math.max(0, Number(record.stalemates) || 0);
        if (wins + losses + stalemates <= 0) return false;

        const journalTable = findProfileJournalTable();
        if (!journalTable || document.getElementById('hw-fight-record-profile')) return false;

        const profileCell = journalTable.parentElement;
        if (!profileCell?.matches('td[width="50%"]')) return false;

        const decisions = wins + losses;
        const winRate = decisions
            ? `${((wins / decisions) * 100).toFixed(2)}%`
            : '—';

        const box = document.createElement('div');
        box.id = 'hw-fight-record-profile';
        box.style.cssText = [
            'width:98%',
            'margin:0 auto',
            'box-sizing:border-box',
            'border:1px solid #aaa',
            'background:#f3f3f3',
            'color:#000',
            'font:12px Arial,sans-serif',
            'line-height:1.45',
            'flex:0 0 auto'
        ].join(';');

        const heading = document.createElement('div');
        heading.style.cssText = 'padding:3px 5px;background:#ccc;font-weight:bold';
        heading.textContent = 'Fight Record';

        const tally = document.createElement('div');
        tally.style.cssText = 'padding:5px 6px 2px';
        tally.textContent = `W ${wins}   L ${losses}   S ${stalemates}   Win ${winRate}`;

        box.append(heading, tally);
        const latestLine = buildProfileLatestFightLine(record);
        if (latestLine) box.appendChild(latestLine);

        /*
         * Preserve the right-hand profile cell's table-calculated dimensions,
         * then make that exact cell the two-item vertical flex container.
         */
        const rect = profileCell.getBoundingClientRect();
        const nativeBlock = document.createElement('div');
        nativeBlock.id = 'hwus-profile-native-block';
        nativeBlock.style.cssText = 'width:100%;box-sizing:border-box';

        while (profileCell.firstChild) {
            nativeBlock.appendChild(profileCell.firstChild);
        }

        profileCell.style.cssText += [
            'display:flex',
            'flex-direction:column',
            'justify-content:space-between',
            'align-items:stretch',
            'box-sizing:border-box',
            `width:${rect.width}px`,
            `min-width:${rect.width}px`,
            `max-width:${rect.width}px`,
            `height:${rect.height}px`,
            `min-height:${rect.height}px`
        ].join(';') + ';';

        profileCell.append(nativeBlock, box);
        return true;
    }

    function makePanel(state, opponent, result, reconciliation = null) {
        if (!opponent) return null;

        const record = ensureOpponent(state, opponent.id, opponent.name);
        const totalDecisions = record.wins + record.losses;
        const winRate = totalDecisions
            ? `${((record.wins / totalDecisions) * 100).toFixed(2)}%`
            : '—';

        const panel = document.createElement('div');
        panel.id = 'hw-fight-record-tracker';
        panel.style.cssText = [
            'float:right',
            'margin:0 0 10px 12px',
            'padding:5px 7px',
            'border:1px solid #777',
            'background:#f2f2f2',
            'color:#000',
            'font:12px Arial,sans-serif',
            'line-height:1.45',
            'box-sizing:border-box',
            'max-width:320px'
        ].join(';');

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.textContent = `vs. ${record.name} (${opponent.id})`;

        const tally = document.createElement('div');
        tally.textContent =
            `W ${record.wins}   L ${record.losses}   S ${record.stalemates}   Win ${winRate}`;

        panel.append(title, tally);

        if (reconciliation?.message) {
            const reconciliationNote = document.createElement('div');
            reconciliationNote.style.cssText = 'margin-top:3px;font-size:10px;color:#666';
            reconciliationNote.textContent = reconciliation.message;
            panel.appendChild(reconciliationNote);
        }

        if (isBattleLog) {
            const controls = document.createElement('div');
            controls.style.marginTop = '4px';

            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Record Defense';

            const currentRecord = ensureOpponent(loadState(), opponent.id, opponent.name);
            const alreadyRecorded = getFightKeys(opponent.id).some(key => hasSeen(currentRecord, key));

            button.disabled = !isCompletedFight(result) || alreadyRecorded;

            const status = document.createElement('span');
            status.style.marginLeft = '6px';
            if (alreadyRecorded) status.textContent = 'Already recorded.';

            button.addEventListener('click', () => {
                const outcome = parseOutcome(opponent);
                const response = recordFight(state, opponent, outcome);

                if (response.recorded) {
                    button.disabled = true;
                    status.textContent = `Recorded ${outcome}.`;
                    refreshTally();
                } else {
                    status.textContent = response.reason;
                }
            });

            controls.append(button, status);
            panel.appendChild(controls);
        }

        function refreshTally() {
            const fresh = loadState();
            const freshRecord = ensureOpponent(fresh, opponent.id, opponent.name);
            const freshDecisions = freshRecord.wins + freshRecord.losses;
            const freshRate = freshDecisions
                ? `${((freshRecord.wins / freshDecisions) * 100).toFixed(2)}%`
                : '—';

            tally.textContent =
                `W ${freshRecord.wins}   L ${freshRecord.losses}   S ${freshRecord.stalemates}   Win ${freshRate}`;
        }

        return { panel, refreshTally };
    }

    if (isProfile) {
        renderProfileFightRecord();
        return;
    }

    if (isBattleLogOverview) {
        installBattleLogImportButton(battleLogOverviewTable);
        return;
    }

    const opponent = getOpponent();
    if (!opponent) return;

    const result = parseOutcome(opponent);
    const reconciliation = isBattleLog
        ? reconcileViewedBattleLog(opponent, result)
        : null;

    const state = loadState();
    const ui = makePanel(state, opponent, result, reconciliation);

    if (!ui) return;

    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;
    contentArea.insertBefore(ui.panel, contentArea.firstChild);

    if (isOutgoingFight) {
        const response = recordFight(state, opponent, result);

        if (response.recorded) {
            ui.refreshTally();
        } else if (result && response.reason) {
            const note = document.createElement('div');
            note.style.cssText = 'font-size:10px;color:#666;margin-top:3px';
            note.textContent = response.reason;
            ui.panel.appendChild(note);
        }
    }
})();

// ============================================================================
// MODULE 14: TOP BAR SWIM TIMES
// Adds 3 days of upcoming Swim blocks in the topbar.
// ============================================================================
(() => {
    'use strict';

    if (!HWUS_isModuleEnabled(14)) return;

    function isLivingAreaPage() {
        return /^https:\/\/www\.hobowars\.com\/game\/game\.php\?sr=\d+(?:&cmd=)?(?:&w=(?:news_hide|mail_hide))?$/.test(
            location.href
        );
    }

    function removeInviteFriendsBlock() {
        if (!isLivingAreaPage()) return;

        const accountLink = document.querySelector(
            '.content-area #alie[href*="cmd=preferences"][href*="do=cchar"]'
        );

        const anchor = accountLink?.closest('div');
        if (!anchor) return;

        const referralLink = document.querySelector(
            '.content-area a[href*="cmd=rfriend"]'
        );

        if (!referralLink) return;

        const end = referralLink.nextSibling?.nodeName === 'BR'
            ? referralLink.nextSibling
            : referralLink;

        let node = anchor.nextSibling;

        while (node) {
            const next = node.nextSibling;
            node.remove();

            if (node === end) break;
            node = next;
        }
    }

    removeInviteFriendsBlock();



    const MODULE = 'hw-swim-times';

// ------------------------------------------------------------------------
// Known schedule shifts. The swim sequence is continuous within each segment,
// with the normal Monday skip, but HoboWars can shift the sequence at a
// calendar boundary. Preserve each confirmed shift as a dated anchor instead
// of forcing one anchor to project through every boundary.
// ------------------------------------------------------------------------
        const SWIM_ANCHORS = [
            { date: '2026-08-26', state: 2 }, // Aug 26: 10/1
            { date: '2026-09-01', state: 5 }  // Sep  1: 7
        ];

        const SWIM_STATES = [
            '12/3', //     = 0
            '11/2', //     = 1
            '10/1', //     = 2
            '9', //        = 3
            '8', //        = 4
            '7', //        = 5
            '6', //        = 6
            '5', //        = 7
            '4' //         = 8
        ];

        const MONTHS = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        const MS_PER_DAY = 86400000;

        if (document.getElementById(MODULE)) return;

        const topbar = document.querySelector('.top-center');
        if (!topbar) return;

        const block = document.createElement('div');
        block.id = MODULE;

        const pre = document.createElement('pre');
        pre.textContent = buildDisplay();

        Object.assign(block.style, {
            boxSizing: 'border-box',
            width: '110px',
            margin: '0',
            padding: '0 4px',
            background: 'black',
            outline: '2px inset #555',
            flex: '0 0 auto',
            display: 'inline-block'
        });

        Object.assign(pre.style, {
            margin: '0',
            padding: '0',
            border: '0',
            background: 'none',
            color: 'cyan',
            font: 'bold 14px/1.5 monospace',
            whiteSpace: 'pre',
            textAlign: 'left'
        });

        block.appendChild(pre);
        topbar.appendChild(block);

        function buildDisplay() {
            const today = getHoboDate();

            return [0, 1, 2]
                .map(offset => {
                    const date = addDays(today, offset);
                    const state = getSwimState(date);

                    return formatLine(date, SWIM_STATES[state]);
                })
                .join('\n');
        }

        function getHoboDate(now = new Date()) {
            // HoboWars clock is fixed AEST / UTC+10.
            const aest = new Date(now.getTime() + (10 * 60 * 60 * 1000));

            return new Date(Date.UTC(
                aest.getUTCFullYear(),
                aest.getUTCMonth(),
                aest.getUTCDate()
            ));
        }

        function getSwimState(targetDate) {
            const anchors = SWIM_ANCHORS
                .map(anchor => ({
                    date: parseDate(anchor.date),
                    state: anchor.state
                }))
                .sort((a, b) => a.date - b.date);

            // Use the most recent confirmed schedule anchor that is not later
            // than the target date. This prevents a newly confirmed monthly
            // shift from corrupting the final days of the preceding month.
            let anchor = anchors[0];

            for (const candidate of anchors) {
                if (candidate.date <= targetDate) {
                    anchor = candidate;
                } else {
                    break;
                }
            }

            let state = anchor.state;
            let cursor = new Date(anchor.date);

            if (targetDate > anchor.date) {
                while (cursor < targetDate) {
                    cursor = addDays(cursor, 1);

                    state = (state + 1) % SWIM_STATES.length;

                    if (cursor.getUTCDay() === 1) {
                        state = (state + 1) % SWIM_STATES.length;
                    }
                }

                return state;
            }

            while (cursor > targetDate) {
                // Undo the transition that produced the current date.
                if (cursor.getUTCDay() === 1) {
                    state =
                        (state - 1 + SWIM_STATES.length) %
                        SWIM_STATES.length;
                }

                state =
                    (state - 1 + SWIM_STATES.length) %
                    SWIM_STATES.length;

                cursor = addDays(cursor, -1);
            }

            return state;
        }

        function formatLine(date, state) {
            const month = MONTHS[date.getUTCMonth()];
            const day = String(date.getUTCDate()).padStart(2, ' ');

            const [first, second] = state.split('/');

            const hour =
                String(first).padStart(2, ' ') +
                (second ? `/${second}` : '');

            return `${month} ${day}: ${hour}`;
        }

        function parseDate(value) {
            const [year, month, day] = value
                .split('-')
                .map(Number);

            return new Date(Date.UTC(
                year,
                month - 1,
                day
            ));
        }

        function addDays(date, amount) {
            return new Date(date.getTime() + (amount * MS_PER_DAY));
        }
    })();
}

// ============================================================================
// OFFICIAL RELEASE INTEGRITY GATE
// Runs only while every canonical metadata identity field still identifies this
// exact official release. A fork that changes any such field is left alone.
// ============================================================================
const HWUS_RELEASE_IDENTITY = Object.freeze({
    author: 'lvl11evelyn HW1(2924238)',
    name: 'HW Utility Suite',
    namespace: 'https://www.hobowars.com/',
    version: '4.33',
    homepageURL: 'https://github.com/lvl11evelyn/hw7-pub-utility-suite',
    supportURL: 'https://github.com/lvl11evelyn/hw7-pub-utility-suite/issues',
    updateURL: 'https://github.com/lvl11evelyn/hw7-pub-utility-suite/raw/refs/heads/main/HW%20Utility%20Suite.user.js',
    downloadURL: 'https://github.com/lvl11evelyn/hw7-pub-utility-suite/raw/refs/heads/main/HW%20Utility%20Suite.user.js'
});

const HWUS_RELEASE_SHA256 = 'e84a16c1fbdd94597a0982a5eca7e9e6de026a1abeb631c17fd48f3cfaa392cb';

function HWUS_getMetadataValue(key) {
    if (typeof GM_info !== 'object' || !GM_info) return null;

    const metadata = String(GM_info.scriptMetaStr || '');
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = metadata.match(new RegExp(`^\\s*//\\s*@${escapedKey}\\s+(.+?)\\s*$`, 'm'));
    return match ? match[1] : null;
}

function HWUS_claimsOfficialReleaseIdentity() {
    return Object.entries(HWUS_RELEASE_IDENTITY).every(
        ([key, expected]) => HWUS_getMetadataValue(key) === expected
    );
}

async function HWUS_hashReleaseBody() {
    if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') return null;

    const source = Function.prototype.toString
        .call(HWUS_officialBuild)
        .replace(/\r\n?/g, '\n');

    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(source)
    );

    return Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0')
    ).join('');
}

function HWUS_renderIntegrityFailure() {
    if (document.getElementById('hwus-integrity-failure')) return;

    const overlay = document.createElement('div');
    overlay.id = 'hwus-integrity-failure';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:24px', 'box-sizing:border-box',
        'background:rgba(0,0,0,.72)', 'font-family:Arial,sans-serif'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
        'width:min(560px,100%)', 'box-sizing:border-box', 'padding:20px 22px',
        'border:1px solid #888', 'border-radius:6px', 'background:#f3f3f3',
        'color:#111', 'box-shadow:0 8px 32px rgba(0,0,0,.45)'
    ].join(';');

    const heading = document.createElement('div');
    heading.style.cssText = 'margin:0 0 12px;font-size:20px;font-weight:bold;text-align:center';
    heading.textContent = 'HW Utility Suite — Integrity Check Failed';

    const message = document.createElement('p');
    message.style.cssText = 'margin:0 0 10px;line-height:1.45';
    message.textContent =
        'This installation still identifies itself as an HW Utility Suite v4.30 release, ' +
        'but its executable logic no longer matches the published build. Suite execution has been halted.';

    const instruction = document.createElement('p');
    instruction.style.cssText = 'margin:0 0 16px;line-height:1.45';
    instruction.textContent =
        'Reinstall the current official build to continue using HW Utility Suite.';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:center;gap:10px;flex-wrap:wrap';

    const reinstall = document.createElement('a');
    reinstall.href = HWUS_RELEASE_IDENTITY.downloadURL;
    reinstall.textContent = 'Reinstall Official Build';
    reinstall.style.cssText = [
        'display:inline-block', 'padding:7px 12px', 'border:1px solid #777',
        'border-radius:4px', 'background:#ddd', 'color:#111',
        'font-weight:bold', 'text-decoration:none'
    ].join(';');

    const repository = document.createElement('a');
    repository.href = HWUS_RELEASE_IDENTITY.homepageURL;
    repository.target = '_blank';
    repository.rel = 'noopener noreferrer';
    repository.textContent = 'View Repository';
    repository.style.cssText = reinstall.style.cssText;

    actions.append(reinstall, repository);
    panel.append(heading, message, instruction, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

(async function HWUS_launchOfficialRelease() {
    if (!HWUS_claimsOfficialReleaseIdentity()) {
        HWUS_officialBuild();
        return;
    }

    try {
        const installedHash = await HWUS_hashReleaseBody();

        // Fail open only when the browser cannot perform the cryptographic check;
        // this avoids falsely accusing an otherwise official installation.
        if (!installedHash) {
            HWUS_officialBuild();
            return;
        }

        if (installedHash !== HWUS_RELEASE_SHA256) {
            HWUS_renderIntegrityFailure();
            return;
        }

        HWUS_officialBuild();
    } catch (error) {
        console.warn('[HW Utility Suite] Integrity verification unavailable:', error);
        HWUS_officialBuild();
    }
})();