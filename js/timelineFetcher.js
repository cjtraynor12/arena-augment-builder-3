// Timeline Fetcher — Riot API helper for exploring Arena match timelines
// Flow: enter Riot ID -> list recent match IDs -> click one to fetch timeline JSON.

import { arenaJsonData, getAugmentData } from './dataManager.js';

const LS_KEY = 'timelineFetcher.v1';

const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

// Arena subteam names + icons — the match-v5 payload does NOT include these;
// Riot only exposes the numeric `playerSubteamId` (1-8). Labels + icon file names
// match the LoL client's jungle-camp-themed team branding. Icon files live at
// https://raw.communitydragon.org/pbe/game/assets/ux/cherry/teamicons/.
const TEAM_ICONS_BASE = 'https://raw.communitydragon.org/pbe/game/assets/ux/cherry/teamicons/';
const SUBTEAMS = {
    1: { name: 'Poros',    icon: 'teamporos.png' },
    2: { name: 'Minions',  icon: 'teamminions.png' },
    3: { name: 'Scuttles', icon: 'teamscuttles.png' },
    4: { name: 'Krugs',    icon: 'teamkrugs.png' },
    5: { name: 'Raptors',  icon: 'teamraptors.png' },
    6: { name: 'Sentinel', icon: 'teamsentinel.png' },
    7: { name: 'Wolves',   icon: 'teamwolves.png' },
    8: { name: 'Gromp',    icon: 'teamgromp.png' },
};

const QUEUE_LABELS = { 1700: 'Ranked Arena', 1710: 'Normal Arena' };

// Cache of fetched match data by matchId — avoids re-fetching when user clicks
// a row they've already previewed.
const matchCache = new Map();

// --- Current match state (the one the builder "Match Reference" accordion
// reads from). Persists across reloads so a picked match survives a refresh.
const CURRENT_MATCH_KEY = 'currentMatch.v1';
const matchSubscribers = new Set();

export function getCurrentMatch() {
    try {
        const raw = localStorage.getItem(CURRENT_MATCH_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function setCurrentMatch(match) {
    try {
        if (match) localStorage.setItem(CURRENT_MATCH_KEY, JSON.stringify(match));
        else localStorage.removeItem(CURRENT_MATCH_KEY);
    } catch (e) {
        // QuotaExceeded can happen — match data is ~50–100KB, usually fine.
        console.warn('setCurrentMatch: storage write failed', e);
    }
    for (const cb of matchSubscribers) {
        try { cb(match); } catch (e) { console.warn('match subscriber failed', e); }
    }
}

export function onCurrentMatchChange(cb) {
    matchSubscribers.add(cb);
    return () => matchSubscribers.delete(cb);
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString([], sameYear
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(sec) {
    if (!sec) return '';
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function placementClass(placement) {
    if (placement <= 2) return 'pl-top';
    if (placement <= 4) return 'pl-mid';
    return 'pl-bot';
}

function buildRowPreview(row, match, puuid) {
    // Find the queried player's participant entry
    const me = match?.info?.participants?.find(p => p.puuid === puuid);
    if (!me) {
        row.querySelector('.row-meta').textContent = 'preview unavailable';
        return;
    }
    const placement = me.subteamPlacement ?? 99;
    const champ = me.championName || '?';
    const kda = `${me.kills ?? 0}/${me.deaths ?? 0}/${me.assists ?? 0}`;
    const duration = formatDuration(match.info?.gameDuration);
    const date = formatDate(match.info?.gameStartTimestamp || match.info?.gameCreation);
    const queueLabel = QUEUE_LABELS[match.info?.queueId] || match.info?.gameMode || '';

    // Populate the pre-built row structure
    row.querySelector('.row-place').textContent = PLACEMENT_LABELS[placement - 1] || `#${placement}`;
    row.querySelector('.row-place').classList.add(placementClass(placement));
    row.querySelector('.row-champ').textContent = champ;
    row.querySelector('.row-kda').textContent = kda;
    row.querySelector('.row-meta').textContent = `${queueLabel} • ${duration} • ${date}`;
    row.classList.add('has-preview');
}

async function getAugmentLookup() {
    // arenaJsonData is a live-binding array of {id, name, ...}; build an id->name map.
    // If it's not loaded yet (overlay opened before data fetch finished), fetch it now.
    let data = arenaJsonData;
    if (!data || data.length === 0) {
        data = await getAugmentData('en_us');
    }
    const map = {};
    for (const a of data) {
        if (a && typeof a.id !== 'undefined') map[a.id] = a.name || a.apiName || `Augment ${a.id}`;
    }
    return map;
}

const REGIONS = [
    { value: 'americas', label: 'Americas (NA, BR, LAN)' },
    { value: 'europe',   label: 'Europe (EUW, EUNE)' },
    { value: 'asia',     label: 'Asia (KR, JP)' },
    { value: 'sea',      label: 'SEA' },
];

const QUEUES = [
    { value: '1700', label: 'Ranked Arena (1700)' },
    { value: '1710', label: 'Normal Arena (1710)' },
    { value: '',     label: 'All queues' },
];

// Platform prefix in a match ID → regional routing value for match-v5.
// Match IDs look like "NA1_5123456789" — the prefix is the platform. The
// match-v5 endpoint wants the regional cluster (americas/europe/asia/sea),
// so we map from platform to cluster here.
const PLATFORM_TO_REGION = {
    NA1: 'americas', BR1: 'americas', LA1: 'americas', LA2: 'americas',
    EUW1: 'europe',  EUN1: 'europe',  TR1: 'europe',   RU: 'europe', ME1: 'europe',
    KR: 'asia',      JP1: 'asia',
    OC1: 'sea',      PH2: 'sea',      SG2: 'sea',      TH2: 'sea',  TW2: 'sea', VN2: 'sea',
};

function regionForMatchId(matchId) {
    const m = String(matchId || '').match(/^([A-Z0-9]+)_/i);
    if (!m) return null;
    return PLATFORM_TO_REGION[m[1].toUpperCase()] || null;
}

function loadPrefs() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch { return {}; }
}

function savePrefs(prefs) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {}
}

function el(id) { return document.getElementById(id); }

function setStatus(msg, kind = 'info') {
    const s = el('timelineStatus');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'timeline-status ' + (kind || 'info');
}

function setOutput(obj) {
    const out = el('timelineOutput');
    if (!out) return;
    if (obj == null) {
        out.textContent = '';
        out.style.display = 'none';
        return;
    }
    out.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    out.style.display = 'block';
}

function clearSummary() {
    const s = el('timelineSummary');
    if (s) { s.innerHTML = ''; s.style.display = 'none'; }
}

async function renderMatchSummary(match) {
    const summary = el('timelineSummary');
    if (!summary) return;
    const participants = match?.info?.participants;
    if (!Array.isArray(participants) || participants.length === 0) {
        clearSummary();
        return;
    }

    const augLookup = await getAugmentLookup();

    // Group by playerSubteamId
    const teams = new Map();
    for (const p of participants) {
        const teamId = p.playerSubteamId ?? 0;
        if (!teams.has(teamId)) teams.set(teamId, { placement: p.subteamPlacement ?? 99, players: [] });
        const team = teams.get(teamId);
        if ((p.subteamPlacement ?? 99) < team.placement) team.placement = p.subteamPlacement;
        const augIds = [1, 2, 3, 4, 5, 6]
            .map(i => p[`playerAugment${i}`])
            .filter(id => id && id !== 0);
        const augs = augIds.map(id => augLookup[id] || `Unknown (${id})`);
        team.players.push({
            name: p.riotIdGameName || '(unknown)',
            tag:  p.riotIdTagline || '',
            champion: p.championName || '(unknown)',
            kda: `${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}`,
            augments: augs,
        });
    }

    // Sort teams by placement ascending (1st first)
    const sorted = [...teams.entries()].sort((a, b) => a[1].placement - b[1].placement);

    const header = document.createElement('div');
    header.className = 'timeline-summary-header';
    const duration = match.info?.gameDuration ?? 0;
    const mins = Math.floor(duration / 60), secs = duration % 60;
    header.textContent = `${match.metadata?.matchId ?? ''} — ${match.info?.gameMode ?? ''} — ${mins}m ${secs}s`;

    const teamsEl = document.createElement('div');
    teamsEl.className = 'timeline-teams';

    for (const [teamId, team] of sorted) {
        const teamEl = document.createElement('div');
        teamEl.className = 'timeline-team';

        const placementLabel = PLACEMENT_LABELS[team.placement - 1] || `#${team.placement}`;
        const h = document.createElement('div');
        h.className = 'timeline-team-header';
        const placeSpan = document.createElement('span');
        placeSpan.className = 'timeline-team-place place-' + (team.placement <= 4 ? 'top' : 'bot');
        placeSpan.textContent = placementLabel;
        h.appendChild(placeSpan);
        const meta = SUBTEAMS[teamId];
        if (meta?.icon) {
            const iconImg = document.createElement('img');
            iconImg.className = 'timeline-team-icon';
            iconImg.src = TEAM_ICONS_BASE + meta.icon;
            iconImg.alt = meta.name;
            iconImg.onerror = () => { iconImg.style.display = 'none'; };
            h.appendChild(iconImg);
        }
        const nameSpan = document.createElement('span');
        nameSpan.className = 'timeline-team-name';
        nameSpan.textContent = meta?.name || `Team ${teamId}`;
        h.appendChild(nameSpan);
        const idSpan = document.createElement('span');
        idSpan.className = 'timeline-team-id';
        idSpan.textContent = `#${teamId}`;
        h.appendChild(idSpan);
        teamEl.appendChild(h);

        for (const pl of team.players) {
            const row = document.createElement('div');
            row.className = 'timeline-player';

            const left = document.createElement('div');
            left.className = 'timeline-player-left';
            const champ = document.createElement('div');
            champ.className = 'timeline-player-champ';
            champ.textContent = pl.champion;
            const who = document.createElement('div');
            who.className = 'timeline-player-name';
            who.textContent = pl.tag ? `${pl.name}#${pl.tag}` : pl.name;
            const kda = document.createElement('div');
            kda.className = 'timeline-player-kda';
            kda.textContent = `KDA ${pl.kda}`;
            left.appendChild(champ);
            left.appendChild(who);
            left.appendChild(kda);

            const augs = document.createElement('div');
            augs.className = 'timeline-player-augs';
            if (pl.augments.length === 0) {
                const none = document.createElement('span');
                none.className = 'timeline-aug timeline-aug-none';
                none.textContent = 'no augments';
                augs.appendChild(none);
            } else {
                for (const name of pl.augments) {
                    const chip = document.createElement('span');
                    chip.className = 'timeline-aug';
                    chip.textContent = name;
                    augs.appendChild(chip);
                }
            }

            row.appendChild(left);
            row.appendChild(augs);
            teamEl.appendChild(row);
        }
        teamsEl.appendChild(teamEl);
    }

    summary.innerHTML = '';
    summary.appendChild(header);
    summary.appendChild(teamsEl);
    summary.style.display = 'block';
}

function getApiKey() {
    return (el('timelineApiKey')?.value || '').trim();
}

function getRegion() {
    return (el('timelineRegion')?.value || 'americas').trim();
}

async function riotGet(url) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Enter an API key first.');
    const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
    if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch {}
        const shortUrl = url.replace(/^https?:\/\/[^/]+/, '');
        throw new Error(`${res.status} ${res.statusText} at ${shortUrl}${body ? ' — ' + body : ''}`);
    }
    return res.json();
}

async function findMatches() {
    const apiKey = getApiKey();
    const region = getRegion();
    const gameName = (el('timelineGameName')?.value || '').trim();
    const tagLine = (el('timelineTagLine')?.value || '').trim().replace(/^#/, '');
    const queue = (el('timelineQueue')?.value || '').trim();
    const count = Math.max(1, Math.min(100, parseInt(el('timelineCount')?.value || '20', 10)));

    if (!apiKey) { setStatus('API key is required.', 'error'); return; }
    if (!gameName || !tagLine) { setStatus('Enter both game name and tag line.', 'error'); return; }

    savePrefs({ apiKey, region, gameName, tagLine, queue, count });

    const matchList = el('timelineMatchList');
    matchList.innerHTML = '';
    setOutput(null);
    clearSummary();
    setStatus('Looking up PUUID…', 'info');

    try {
        const accUrl = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
        const acc = await riotGet(accUrl);
        if (!acc?.puuid) throw new Error('No PUUID in account response.');

        setStatus(`Found PUUID. Fetching match IDs…`, 'info');

        const params = new URLSearchParams({ count: String(count), start: '0' });
        if (queue) params.set('queue', queue);
        const idsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?${params}`;
        const ids = await riotGet(idsUrl);

        if (!Array.isArray(ids) || ids.length === 0) {
            setStatus('No matches found for those filters.', 'warn');
            return;
        }

        setStatus(`Found ${ids.length} match${ids.length === 1 ? '' : 'es'}. Loading previews…`, 'info');
        matchList.innerHTML = '';
        const rows = ids.map(id => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'timeline-match-row preview-row';
            row.innerHTML = `
                <span class="row-place row-place-loading">…</span>
                <span class="row-champ row-loading">loading</span>
                <span class="row-kda"></span>
                <span class="row-meta"></span>
                <span class="row-id">${id}</span>
            `;
            row.onclick = () => fetchTimelineForMatch(id);
            matchList.appendChild(row);
            return row;
        });

        // Sequentially prefetch match data for each match, updating rows as we go.
        // Sequential + small gap keeps us well under the dev-key burst limit (20/s).
        let loaded = 0;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const row = rows[i];
            try {
                const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`;
                const match = await riotGet(url);
                matchCache.set(id, match);
                buildRowPreview(row, match, acc.puuid);
                loaded++;
                setStatus(`Loaded ${loaded}/${ids.length}…`, 'info');
            } catch (err) {
                row.querySelector('.row-meta').textContent = 'error: ' + err.message;
                row.classList.add('row-error');
                // If we hit a rate limit or auth failure, stop prefetching.
                if (/^(429|401|403)/.test(err.message)) {
                    setStatus(`Prefetch stopped at ${loaded}/${ids.length}: ${err.message}`, 'warn');
                    break;
                }
            }
            // Gentle pacing between matches
            if (i < ids.length - 1) await new Promise(r => setTimeout(r, 80));
        }
        setStatus(`Loaded ${loaded}/${ids.length} match previews. Click one to view details.`, 'ok');
    } catch (err) {
        setStatus('Error: ' + err.message, 'error');
    }
}

async function lookupMatchById() {
    const input = el('timelineMatchIdInput');
    const raw = (input?.value || '').trim();
    if (!raw) { setStatus('Enter a match ID (e.g. NA1_5123456789).', 'error'); return; }
    if (!getApiKey()) { setStatus('API key is required.', 'error'); return; }

    // Auto-align the region select to the match ID's platform prefix so the
    // fetch goes to the right cluster. User can still override afterward,
    // but a wrong region → 404, so match the prefix first.
    const detected = regionForMatchId(raw);
    const regionSel = el('timelineRegion');
    if (detected && regionSel && regionSel.value !== detected) {
        regionSel.value = detected;
    } else if (!detected) {
        setStatus(`Unknown platform prefix in "${raw}" — using region "${getRegion()}". Match IDs usually start with NA1_, EUW1_, KR_, etc.`, 'warn');
    }

    // Clear any existing match list UI so the summary takes center stage.
    const matchList = el('timelineMatchList');
    if (matchList) matchList.innerHTML = '';

    await fetchTimelineForMatch(raw);
}

async function fetchTimelineForMatch(matchId) {
    const region = getRegion();
    setOutput(null);
    clearSummary();

    let data;
    if (matchCache.has(matchId)) {
        data = matchCache.get(matchId);
        setStatus(`Loaded match ${matchId} (cached).`, 'ok');
    } else {
        setStatus(`Fetching match data for ${matchId}…`, 'info');
        try {
            const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
            data = await riotGet(url);
            matchCache.set(matchId, data);
            setStatus(`Match data loaded for ${matchId}.`, 'ok');
        } catch (err) {
            setStatus('Error: ' + err.message, 'error');
            return;
        }
    }

    setOutput(data);
    try { await renderMatchSummary(data); } catch (e) { console.warn('summary render failed', e); }

    // Promote this match to "current match" so the builder's Match Reference
    // accordion can show it. Leave the overlay open so the user can see the
    // summary they just loaded — they can click away to close.
    setCurrentMatch(data);
}

async function copyTimelineJson() {
    const out = el('timelineOutput');
    if (!out || !out.textContent) return;
    try {
        await navigator.clipboard.writeText(out.textContent);
        setStatus('Copied to clipboard.', 'ok');
    } catch (err) {
        setStatus('Copy failed: ' + err.message, 'error');
    }
}

function openTimelineOverlay() {
    const overlay = el('timelineOverlay');
    if (!overlay) return;
    overlay.classList.add('open');

    // Populate region / queue selects on first open if empty
    const regionSel = el('timelineRegion');
    if (regionSel && regionSel.options.length === 0) {
        REGIONS.forEach(r => {
            const o = document.createElement('option');
            o.value = r.value; o.textContent = r.label;
            regionSel.appendChild(o);
        });
    }
    const queueSel = el('timelineQueue');
    if (queueSel && queueSel.options.length === 0) {
        QUEUES.forEach(q => {
            const o = document.createElement('option');
            o.value = q.value; o.textContent = q.label;
            queueSel.appendChild(o);
        });
    }

    // Restore saved prefs
    const prefs = loadPrefs();
    if (prefs.apiKey) el('timelineApiKey').value = prefs.apiKey;
    if (prefs.region) el('timelineRegion').value = prefs.region;
    if (prefs.gameName) el('timelineGameName').value = prefs.gameName;
    if (prefs.tagLine) el('timelineTagLine').value = prefs.tagLine;
    if (prefs.queue !== undefined) el('timelineQueue').value = prefs.queue;
    if (prefs.count) el('timelineCount').value = prefs.count;

    setTimeout(() => el('timelineApiKey')?.focus(), 50);
}

function closeTimelineOverlay() {
    el('timelineOverlay')?.classList.remove('open');
}

// Submit on Enter inside the form fields
function handleKeydown(e) {
    if (e.key === 'Enter' && e.target.matches('#timelineApiKey, #timelineGameName, #timelineTagLine')) {
        e.preventDefault();
        findMatches();
    }
    if (e.key === 'Enter' && e.target.matches('#timelineMatchIdInput')) {
        e.preventDefault();
        lookupMatchById();
    }
}

export function initTimelineFetcher() {
    const overlay = el('timelineOverlay');
    if (!overlay) return;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeTimelineOverlay();
    });
    overlay.addEventListener('keydown', handleKeydown);
}

// Expose for inline handlers
window.openTimelineOverlay = openTimelineOverlay;
window.closeTimelineOverlay = closeTimelineOverlay;
window.findMatches = findMatches;
window.copyTimelineJson = copyTimelineJson;
window.lookupMatchById = lookupMatchById;
