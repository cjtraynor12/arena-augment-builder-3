// Match Reference accordion — renders the currently selected Arena match
// (picked via the Riot API overlay) as browsable teams → players → augments.
// Clicking an augment button wires into setSelectedAugment so the builder
// immediately switches to that augment, the same as clicking in the main list.

import {
    arenaJsonData,
    championJsonData,
    baseSquarePortraitPath,
    communityDragonBaseUrl,
} from './dataManager.js';
import { getCurrentMatch, onCurrentMatchChange, setCurrentMatch } from './timelineFetcher.js';

// Same subteam mapping used by the timeline overlay summary. The match-v5
// payload only exposes the numeric `playerSubteamId` (1-8) — the LoL client
// picks a jungle-camp mascot per team; these names/icons match the client.
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
const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

function findAugmentById(id) {
    if (!id || !Array.isArray(arenaJsonData)) return null;
    return arenaJsonData.find(a => a && a.id === id) || null;
}

function findChampionByAlias(alias) {
    if (!alias || !Array.isArray(championJsonData)) return null;
    return championJsonData.find(c => c && c.alias === alias) || null;
}

function championPortraitUrl(p) {
    // Prefer the numeric-id endpoint the sidebar uses — it's consistently
    // available, while the alias-based /assets/characters/{alias}/hud path
    // 404s for some champions on CommunityDragon.
    const champ = findChampionByAlias(p.championName);
    const id = p.championId ?? champ?.id;
    if (id) return baseSquarePortraitPath + id + '.png';
    if (champ?.squareIcon) return champ.squareIcon;
    return '';
}

function wireChampionClick(imgEl, p) {
    const champ = findChampionByAlias(p.championName);
    const id = champ?.id ?? p.championId;
    if (!id) return;
    imgEl.style.cursor = 'pointer';
    imgEl.title = `Click to set ${p.championName || 'this champion'} as the builder icon`;
    imgEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setSelectedChampion === 'function') {
            window.setSelectedChampion(id);
        }
    });
}

function getTierKeyword(rarity) {
    switch (rarity) {
        case 0: return 'silver';
        case 1: return 'gold';
        case 2: return 'prismatic';
        default: return 'gold';
    }
}

function renderAugmentButton(aug, rawId) {
    const container = document.createElement('div');
    container.className = 'augmentButton match-ref-aug';
    if (!aug) {
        // Unknown augment ID — still render something so the user can see a gap exists
        container.classList.add('match-ref-aug-unknown');
        const name = document.createElement('span');
        name.innerText = `Unknown (${rawId})`;
        container.appendChild(name);
        return container;
    }
    container.title = `Click to load "${aug.name}" into the builder`;
    container.addEventListener('click', () => {
        if (typeof window.setSelectedAugment === 'function') {
            window.setSelectedAugment(aug.id);
        }
    });

    const img = document.createElement('img');
    img.src = communityDragonBaseUrl + aug.iconLarge;
    img.alt = aug.name;
    container.appendChild(img);

    const name = document.createElement('span');
    name.innerText = aug.name;
    container.appendChild(name);

    // "+" insert-as-reference button, matching the main augment list behavior
    const insertBtn = document.createElement('button');
    insertBtn.innerText = '+';
    insertBtn.className = 'insert-reference-btn';
    insertBtn.title = 'Insert as inline reference';
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.insertAugmentReference === 'function') {
            window.insertAugmentReference(
                aug.name,
                communityDragonBaseUrl + aug.iconLarge,
                getTierKeyword(aug.rarity)
            );
        }
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    return container;
}

function renderPlayerRow(p) {
    const row = document.createElement('div');
    row.className = 'match-ref-player';

    const header = document.createElement('div');
    header.className = 'match-ref-player-header';

    const img = document.createElement('img');
    img.className = 'match-ref-champ match-ref-champ-medium';
    const src = championPortraitUrl(p);
    if (src) img.src = src;
    img.alt = p.championName || '';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    wireChampionClick(img, p);
    header.appendChild(img);

    const info = document.createElement('div');
    info.className = 'match-ref-player-info';
    const champLine = document.createElement('div');
    champLine.className = 'match-ref-player-champ';
    champLine.textContent = p.championName || '(unknown)';
    info.appendChild(champLine);
    const nameLine = document.createElement('div');
    nameLine.className = 'match-ref-player-name';
    const tag = p.riotIdTagline ? '#' + p.riotIdTagline : '';
    nameLine.textContent = (p.riotIdGameName || '(unknown)') + tag;
    info.appendChild(nameLine);
    const kdaLine = document.createElement('div');
    kdaLine.className = 'match-ref-player-kda';
    kdaLine.textContent = `${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}`;
    info.appendChild(kdaLine);
    header.appendChild(info);

    row.appendChild(header);

    const augRow = document.createElement('div');
    augRow.className = 'match-ref-augs';
    const augIds = [1, 2, 3, 4, 5, 6]
        .map(i => p[`playerAugment${i}`])
        .filter(id => id && id !== 0);
    if (augIds.length === 0) {
        const none = document.createElement('div');
        none.className = 'match-ref-no-augs';
        none.textContent = 'No augments';
        augRow.appendChild(none);
    } else {
        for (const id of augIds) {
            augRow.appendChild(renderAugmentButton(findAugmentById(id), id));
        }
    }
    row.appendChild(augRow);

    return row;
}

function renderTeamChampsPreview(players) {
    const wrapper = document.createElement('span');
    wrapper.className = 'match-ref-team-champs';
    for (const p of players) {
        const img = document.createElement('img');
        img.className = 'match-ref-champ match-ref-champ-small';
        const src = championPortraitUrl(p);
        if (src) img.src = src;
        img.alt = p.championName || '';
        img.title = p.championName || '';
        img.onerror = () => { img.style.visibility = 'hidden'; };
        wireChampionClick(img, p);
        wrapper.appendChild(img);
    }
    return wrapper;
}

function renderMatchContent(container, match) {
    container.innerHTML = '';
    const participants = match?.info?.participants || [];
    if (participants.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'match-ref-empty';
        empty.textContent = 'This match has no participants.';
        container.appendChild(empty);
        return;
    }

    // Header — match id, duration, and actions
    const header = document.createElement('div');
    header.className = 'match-ref-header';
    const idSpan = document.createElement('span');
    idSpan.className = 'match-ref-id';
    idSpan.textContent = match.metadata?.matchId ?? '';
    header.appendChild(idSpan);
    const duration = match.info?.gameDuration ?? 0;
    const durSpan = document.createElement('span');
    durSpan.className = 'match-ref-dur';
    durSpan.textContent = `${Math.floor(duration / 60)}m ${duration % 60}s`;
    header.appendChild(durSpan);
    const changeBtn = document.createElement('button');
    changeBtn.className = 'match-ref-change btn btn-sm';
    changeBtn.textContent = 'Change';
    changeBtn.title = 'Pick a different match';
    changeBtn.onclick = (e) => {
        e.preventDefault();
        if (typeof window.openTimelineOverlay === 'function') window.openTimelineOverlay();
    };
    header.appendChild(changeBtn);
    const clearBtn = document.createElement('button');
    clearBtn.className = 'match-ref-clear btn btn-sm btn-danger';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear the currently selected match';
    clearBtn.onclick = (e) => {
        e.preventDefault();
        setCurrentMatch(null);
    };
    header.appendChild(clearBtn);
    container.appendChild(header);

    // Group by subteam
    const teams = new Map();
    for (const p of participants) {
        const teamId = p.playerSubteamId ?? 0;
        if (!teams.has(teamId)) {
            teams.set(teamId, { placement: p.subteamPlacement ?? 99, players: [] });
        }
        const t = teams.get(teamId);
        t.players.push(p);
        if ((p.subteamPlacement ?? 99) < t.placement) t.placement = p.subteamPlacement;
    }
    const sorted = [...teams.entries()].sort((a, b) => a[1].placement - b[1].placement);

    for (const [teamId, team] of sorted) {
        const teamEl = document.createElement('details');
        teamEl.className = 'match-ref-team';

        const summary = document.createElement('summary');
        summary.className = 'match-ref-team-summary';

        const meta = SUBTEAMS[teamId] || { name: `Team ${teamId}`, icon: null };
        const placement = team.placement;
        const placeClass = placement <= 4 ? 'place-top' : 'place-bot';

        const placeEl = document.createElement('span');
        placeEl.className = 'match-ref-place ' + placeClass;
        placeEl.textContent = PLACEMENT_LABELS[placement - 1] || `#${placement}`;
        summary.appendChild(placeEl);

        if (meta.icon) {
            const iconImg = document.createElement('img');
            iconImg.className = 'match-ref-team-icon';
            iconImg.src = TEAM_ICONS_BASE + meta.icon;
            iconImg.alt = meta.name;
            iconImg.onerror = () => { iconImg.style.display = 'none'; };
            summary.appendChild(iconImg);
        }
        const nameEl = document.createElement('span');
        nameEl.className = 'match-ref-team-name';
        nameEl.textContent = meta.name;
        summary.appendChild(nameEl);

        summary.appendChild(renderTeamChampsPreview(team.players));

        teamEl.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'match-ref-team-body';
        for (const p of team.players) {
            body.appendChild(renderPlayerRow(p));
        }
        teamEl.appendChild(body);

        container.appendChild(teamEl);
    }
}

function renderEmpty(container) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'match-ref-empty';

    const msg = document.createElement('p');
    msg.textContent = 'No match selected. Open the API browser to look up a game and pick one.';
    empty.appendChild(msg);

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Open API Browser';
    btn.onclick = () => {
        if (typeof window.openTimelineOverlay === 'function') window.openTimelineOverlay();
    };
    empty.appendChild(btn);

    container.appendChild(empty);
}

function render() {
    const container = document.getElementById('matchRefContent');
    if (!container) return;
    const match = getCurrentMatch();
    if (!match) renderEmpty(container);
    else renderMatchContent(container, match);
}

export function initMatchReference() {
    const details = document.getElementById('matchRef');
    if (!details) return;
    // Re-render when the current match changes (picked or cleared)
    onCurrentMatchChange(() => render());
    // First render once the accordion is opened — cheap enough to also do
    // immediately, but lazy avoids touching DOM that isn't visible.
    details.addEventListener('toggle', () => {
        if (details.open) render();
    });
    // Initial render so the summary reflects state (empty vs filled)
    render();
}

// Re-render on demand (e.g., when arena data finishes loading post-init)
export function refreshMatchReference() {
    render();
}
