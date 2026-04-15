// Render every Arena augment description through the live calculation
// engine so regressions in the placeholder pipeline are easy to eyeball.
//
// Usage:
//   node tests/render-descriptions.mjs                 # all augments, all star modes
//   node tests/render-descriptions.mjs --warnings      # only ones with warnings
//   node tests/render-descriptions.mjs --name=Homeguard
//
// Fetches en_us.json from CommunityDragon at run time so the check always
// reflects the current PBE data — same URL the app uses in dataManager.js.
//
// Warning heuristic: Riot never ships literal `[x]` brackets in raw descs
// (verified across all 221 augments in en_us.json), so any `[…]` in the
// rendered output means the engine fell back to a placeholder. Also flags
// unreplaced `@…@` and `{{…}}` tokens, plus `NaN` / `undefined`.
//
// NOT flagged: `<imgKeyword>`, `<gold>`, `<speed>`, `<br>`, etc. — those
// are the Arena description DSL and are rendered downstream by
// canvasRenderer.js. They're expected in the output of this stage.

import { populateDescriptionVariables, arenaJsonDataUrl } from '../js/dataManager.js';

const LANGUAGE = 'en_us';
const STAR_MODES = [
    { label: 'range',  starIndex: undefined },
    { label: '1★',     starIndex: 1 },
    { label: '2★',     starIndex: 2 },
    { label: '3★',     starIndex: 3 },
];

// populateDescriptionVariables is chatty with console.log — silence during
// renders so the report output stays readable. Restore after.
function silently(fn) {
    const log = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = log;
    }
}

// Detect warnings worth a human look. Order matters for reporting.
function findWarnings(rendered) {
    const warnings = [];

    // Unresolved @…@ placeholder (dataValue or calc name not found).
    const atMatches = rendered.match(/@[^@\s]+@/g);
    if (atMatches) warnings.push(`unreplaced @-tokens: ${atMatches.join(', ')}`);

    // Unresolved {{…}} summary placeholder.
    const braceMatches = rendered.match(/\{\{[^}]+\}\}/g);
    if (braceMatches) warnings.push(`unreplaced {{…}}: ${braceMatches.join(', ')}`);

    // [x] fallback. Extract them so the human can see which variable punted.
    const bracketMatches = rendered.match(/\[[^\]]+\]/g);
    if (bracketMatches) warnings.push(`bracket fallbacks: ${bracketMatches.join(', ')}`);

    if (/\bNaN\b/.test(rendered)) warnings.push('NaN in output');
    if (/\bundefined\b/.test(rendered)) warnings.push('undefined in output');
    if (rendered.trim() === '') warnings.push('empty output');

    return warnings;
}

function parseArgs(argv) {
    const args = { onlyWarnings: false, nameFilter: null };
    for (const a of argv.slice(2)) {
        if (a === '--warnings' || a === '-w') args.onlyWarnings = true;
        else if (a.startsWith('--name=')) args.nameFilter = a.slice('--name='.length).toLowerCase();
        else if (a === '--help' || a === '-h') {
            console.log('Usage: node tests/render-descriptions.mjs [--warnings] [--name=Substring]');
            process.exit(0);
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);

    const url = arenaJsonDataUrl + LANGUAGE + '.json';
    process.stderr.write(`Fetching ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`Fetch failed: ${res.status} ${res.statusText}`);
        process.exit(2);
    }
    const body = await res.json();
    const augments = body.augments || [];

    let totalRenders = 0;
    let warningRenders = 0;
    const seenNames = new Set();

    for (const augment of augments) {
        const name = augment.name || augment.apiName || '(unnamed)';
        if (args.nameFilter && !name.toLowerCase().includes(args.nameFilter)) continue;
        if (seenNames.has(name)) continue; // Some augments appear twice
        seenNames.add(name);

        const renders = STAR_MODES.map(mode => {
            const rendered = silently(() =>
                populateDescriptionVariables(augment, mode.starIndex)
            );
            return { mode, rendered, warnings: findWarnings(rendered) };
        });

        totalRenders += renders.length;
        const augmentHasWarning = renders.some(r => r.warnings.length > 0);
        if (augmentHasWarning) warningRenders += renders.filter(r => r.warnings.length).length;

        if (args.onlyWarnings && !augmentHasWarning) continue;

        console.log(`\n=== ${name} ===`);
        console.log(`raw: ${augment.desc || '(no desc)'}`);
        for (const { mode, rendered, warnings } of renders) {
            const tag = warnings.length ? ' ⚠' : '';
            console.log(`[${mode.label}]${tag} ${rendered}`);
            for (const w of warnings) console.log(`    ↳ ${w}`);
        }
    }

    const totalAugments = seenNames.size;
    console.log(
        `\n--- summary: ${totalAugments} augments, ${totalRenders} renders, ` +
        `${warningRenders} with warnings ---`
    );
    // Don't fail the exit code — this is a human-review script, not a test
    // gate. If that changes later, return `warningRenders > 0 ? 1 : 0`.
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
