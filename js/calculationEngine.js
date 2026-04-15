// ===== CALCULATION ENGINE =====
//
// Turns Riot's Arena augment JSON placeholders into human-readable text.
//
// Data shape notes (from en_us.json):
// * `augment.dataValues[name]` is a **7-element array** representing the
//   augment's progression across levels/tiers. Older logic treated it as
//   a scalar which produced NaN. We now format:
//     - single value when all entries are identical (e.g. haste: 15 → "15")
//     - min-max range when entries vary (e.g. [15,25,...,75] → "15-75")
//     - single value at a specific star index when `starIndex` is supplied
//       (index 1 = 1★, index 2 = 2★, index 3 = 3★ — see getMaxLevel in app.js
//       for how we map the user's filled-star selection to an array index).
// * `augment.calculations[name]` can be keyed by a friendly name
//   (`APToHasteConversionCalc`) or a hashed name (`{2f9b7774}`). When the
//   description references a name not found as data value or friendly
//   calc, we fall back to the single hashed calc if present.
// * Calculation formula parts use `__type` to pick a kind. We handle the
//   common ones; unknown parts fall through to `[complex calculation]`
//   rather than crashing.

// When a dataValue `X` has a `XTooltip` sibling, Riot treats the sibling as
// the canonical display number (the raw one is what the runtime formula uses,
// the tooltip one is what the in-game UI shows). Use the tooltip variant so
// our rendered tooltip matches the game's.
function pickDisplayDataValue(name, dataValues) {
    if (!name) return name;
    if (name.endsWith('Tooltip')) return name;
    const ttName = name + 'Tooltip';
    return Object.prototype.hasOwnProperty.call(dataValues, ttName) ? ttName : name;
}

// Detect dataValues that are effectively placeholders — uniform tiny values
// (e.g. Augmented Power's APRatio=0.0001) that Riot leaves in the JSON so the
// calc shape stays valid but that shouldn't appear in the rendered tooltip.
// Threshold: max absolute value below 0.005 (i.e. 0.5% after the ×100 used
// by StatByNamedDataValueCalculationPart). Real scalings start around 10%.
function isPlaceholderSmall(rawValues) {
    if (rawValues == null) return false;
    const arr = Array.isArray(rawValues) ? rawValues : [rawValues];
    if (arr.length === 0) return false;
    let maxAbs = 0;
    for (const v of arr) {
        if (typeof v !== 'number' || !isFinite(v)) return false;
        const av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
    }
    return maxAbs < 0.005;
}

class CalculationEngine {
    constructor() {
        // Static mappings for known placeholders
        this.staticMappings = {
            '{{ Item_Keyword_OnHit }}': 'On-Hit',
            // Spell keybinds — runtime in-game, but the conventional mapping
            // is Q/W/E for slots 1/2/3. Better than "[spell1KeyBind]".
            '@spell1KeyBind@': 'Q',
            '@spell2KeyBind@': 'W',
            '@spell3KeyBind@': 'E',
            '@spell4KeyBind@': 'R'
        };

        // Common spell property mappings for better descriptions
        this.spellPropertyMappings = {
            'MSAmount': 'Move Speed',
            'MovementSpeed': 'Move Speed',
            'BuffDuration': 'duration',
            'DisableCooldown': 'disable duration',
            'DamageAmp': 'damage amplification',
            'Gold': 'gold'
        };

        // Stat IDs (from Riot data) → display name
        this.statNames = {
            0: 'Ability Power',
            1: 'Armor',
            2: 'AD',
            3: 'Attack Range',
            4: 'Attack Speed',
            5: 'AP',
            6: 'Health',
            7: 'Mana',
            8: 'Armor',
            9: 'bonus AD',
            10: 'Attack Speed',
            11: 'Move Speed',
            12: 'Magic Resist'
        };
    }

    processCalculations(description, augment, starIndex) {
        let processedDescription = description;

        // Handle static mappings first (keybinds, item keywords).
        for (const [placeholder, replacement] of Object.entries(this.staticMappings)) {
            processedDescription = processedDescription.replaceAll(placeholder, replacement);
        }

        // Summary placeholders (`{{ Cherry_Name_Summary }}`) run BEFORE calc
        // placeholders. Riot sometimes embeds an `@token@` inside the summary
        // name (e.g. `{{ Cherry_Vengeance@TeamSize@_Summary }}`) to pick
        // between variant strings at runtime. We don't have those variants,
        // and if we let the calc pass replace `@TeamSize@` first, the summary
        // collapses into `[Vengeance1 per stack effect]`. Handling summaries
        // first lets us strip the inner `@...@` and emit a clean
        // `[Vengeance effect]` fallback.
        processedDescription = this.processSummaryPlaceholders(processedDescription, augment);
        processedDescription = this.processCalculationPlaceholders(processedDescription, augment, starIndex);
        processedDescription = this.processSpellPlaceholders(processedDescription, augment);

        return processedDescription;
    }

    processCalculationPlaceholders(description, augment, starIndex) {
        const calculations = augment.calculations || {};
        const dataValues = augment.dataValues || {};

        // If the desc references a name that isn't in dataValues or
        // calculations by friendly name, but there's exactly one hashed
        // calculation (e.g. `{2f9b7774}`), use it as the fallback.
        const hashedCalcKeys = Object.keys(calculations).filter(k => k.startsWith('{') && k.endsWith('}'));
        const fallbackHashedCalc = hashedCalcKeys.length === 1 ? calculations[hashedCalcKeys[0]] : null;

        // Support `@calcName*multiplier@` too (some calcs are referenced with a multiplier).
        const calculationMatches = description.match(/@([A-Za-z0-9_]+)(\*-?\d+(?:\.\d+)?)?@/g);
        if (!calculationMatches) return description;

        let processedDescription = description;

        for (const match of calculationMatches) {
            const inner = match.slice(1, -1); // strip @ @
            const astIdx = inner.indexOf('*');
            const calcName = astIdx >= 0 ? inner.substring(0, astIdx) : inner;
            const multStr = astIdx >= 0 ? inner.substring(astIdx) : null;

            // dataValues is handled elsewhere — skip.
            if (dataValues.hasOwnProperty(calcName)) continue;

            let calcDef = calculations[calcName];
            if (!calcDef && fallbackHashedCalc) {
                calcDef = fallbackHashedCalc;
            }

            if (calcDef) {
                const calculationResult = this.interpretCalculation(calcDef, dataValues, multStr, starIndex);
                processedDescription = processedDescription.replaceAll(match, calculationResult);
            } else {
                // Unknown reference — leave a readable placeholder.
                processedDescription = processedDescription.replaceAll(match, `[${calcName}]`);
            }
        }

        return processedDescription;
    }

    processSpellPlaceholders(description, augment) {
        const spellMatches = description.match(/@spell\.([^:]+):([^@*]+)(\*[^@]*)?@/g);
        if (!spellMatches) return description;

        let processedDescription = description;

        for (const match of spellMatches) {
            const content = match.slice(7, -1); // Remove @spell. and @
            const parts = content.split(':');
            const propertyWithMultiplier = parts[1];

            let property = propertyWithMultiplier;
            let multiplier = '';
            if (propertyWithMultiplier.includes('*')) {
                const multiplierIndex = propertyWithMultiplier.indexOf('*');
                property = propertyWithMultiplier.substring(0, multiplierIndex);
                multiplier = propertyWithMultiplier.substring(multiplierIndex);
            }

            const propertyDescription = this.spellPropertyMappings[property] || property;
            let replacement = `[${propertyDescription}]`;

            if (multiplier === '*100') {
                replacement = `[${propertyDescription}%]`;
            } else if (multiplier) {
                replacement = `[${propertyDescription} ${multiplier}]`;
            }

            processedDescription = processedDescription.replaceAll(match, replacement);
        }

        return processedDescription;
    }

    processSummaryPlaceholders(description, augment) {
        const summaryMatches = description.match(/\{\{\s*([^}]+)\s*\}\}/g);
        if (!summaryMatches) return description;

        let processedDescription = description;

        for (const match of summaryMatches) {
            const content = match.slice(2, -2).trim();

            if (content.includes('Cherry_') && content.includes('_Summary')) {
                // Strip any leftover `@token@` runtime selectors Riot uses to
                // pick a summary-string variant (e.g. `Vengeance@TeamSize@`),
                // so the fallback reads `[Vengeance effect]` rather than
                // `[Vengeance@TeamSize@ effect]`.
                const augmentName = content
                    .replace('Cherry_', '')
                    .replace('_Summary', '')
                    .replace(/@[^@]+@/g, '');
                processedDescription = processedDescription.replaceAll(match, `[${augmentName} effect]`);
            } else {
                processedDescription = processedDescription.replaceAll(match, `[${content}]`);
            }
        }

        return processedDescription;
    }

    // Interpret a calculation part. Returns { text, isStat }.
    // - text: the human-readable string for this part
    // - isStat: true when `text` is already of the form "X% stat" or
    //   "per stack"-style (so callers should NOT tack on another '%' when
    //   the parent calc has mDisplayAsPercent).
    // `percentScale` is 100 when the parent calc has mDisplayAsPercent,
    // 1 otherwise — applied to scalar values only.
    // `starIndex` (optional, 1–3) picks a single array index for
    // NamedDataValue-shaped parts instead of emitting a min-max range;
    // see formatArrayValue.
    interpretPart(part, dataValues, percentScale, starIndex) {
        if (!part || typeof part !== 'object') return { text: '[?]', isStat: false };
        const t = part.__type;
        const round = n => Math.round(Math.fround(n) * 100) / 100;

        switch (t) {
            case 'ByCharLevelInterpolationCalculationPart': {
                const s = round((part.mStartValue || 0) * percentScale);
                const e = round((part.mEndValue || 0) * percentScale);
                return { text: `${s}-${e} (scales with level)`, isStat: false };
            }

            case 'ByCharLevelBreakpointsCalculationPart': {
                const base = (part.mLevel1Value || 0) * percentScale;
                const breakpoints = part.mBreakpoints || [];
                let max = base;
                for (const bp of breakpoints) {
                    const v = (bp.mValue != null ? bp.mValue : bp.mLevelValue || 0) * percentScale;
                    if (v > max) max = v;
                }
                if (round(base) === round(max)) return { text: `${round(base)}`, isStat: false };
                return { text: `${round(base)}-${round(max)} (scales with level)`, isStat: false };
            }

            case 'StatByCoefficientCalculationPart': {
                const coefficient = part.mCoefficient || 0;
                const statType = part.mStat || 0;
                const statName = this.statNames[statType] || 'stat';
                const pct = Math.round(coefficient * 100);
                return { text: `${pct}% ${statName}`, isStat: true };
            }

            case 'StatByNamedDataValueCalculationPart': {
                const dvName = part.mDataValue;
                const statType = part.mStat;
                const statName = statType != null ? (this.statNames[statType] || 'stat') : '';
                // Prefer `<name>Tooltip` variant when it exists — Riot ships
                // a separate dataValue for display when the raw runtime value
                // doesn't read cleanly in a tooltip (e.g. Augmented Power's
                // BaseDamageAmp=[0.2,0.2,0.4,0.6…] vs its BaseDamageAmpTooltip
                // =[0.2,0.3,0.4,0.5,0.6,0.7,0.8]).
                const resolvedDv = pickDisplayDataValue(dvName, dataValues);
                const rawValues = dataValues[resolvedDv];
                // Suppress placeholder-level scalings (uniform ~0.0001) that
                // Riot sometimes leaves in the JSON to keep the calc shape
                // valid while the real effect is expressed elsewhere. Without
                // this filter, Augmented Power reads as
                // `20-80% + 0.01% + 0.01% AD`. Threshold 0.5% (raw < 0.005) is
                // well below any real scaling — smallest observed is 10%.
                if (isPlaceholderSmall(rawValues)) {
                    return { text: '', isStat: false };
                }
                const formatted = this.formatArrayValue(rawValues, 100, starIndex);
                if (formatted === null) {
                    return { text: `[${dvName}]`, isStat: !!statName };
                }
                if (statName) return { text: `${formatted}% ${statName}`, isStat: true };
                // No mStat — treat as plain scaling coefficient (%).
                return { text: `${formatted}%`, isStat: true };
            }

            case 'NamedDataValueCalculationPart': {
                const dvName = part.mDataValue;
                const resolvedDv = pickDisplayDataValue(dvName, dataValues);
                const formatted = this.formatArrayValue(dataValues[resolvedDv], percentScale, starIndex);
                if (formatted === null) return { text: `[${dvName}]`, isStat: false };
                return { text: formatted, isStat: false };
            }

            case 'EffectValueCalculationPart': {
                const value = round((part.mEffectValue || 0) * percentScale);
                return { text: `${value}`, isStat: false };
            }

            case 'NumberCalculationPart': {
                const value = round((part.mValue || 0) * percentScale);
                return { text: `${value}`, isStat: false };
            }

            case 'SumOfSubPartsCalculationPart': {
                const subparts = part.mSubparts || [];
                const interpreted = subparts.map(p => this.interpretPart(p, dataValues, percentScale, starIndex));
                // Mark as stat if any sub is a stat expression — avoids double %.
                const isStat = interpreted.some(x => x.isStat);
                return {
                    text: interpreted.map(x => x.text).filter(Boolean).join(' + '),
                    isStat
                };
            }

            case 'ProductOfSubPartsCalculationPart': {
                const subparts = part.mSubparts || [];
                const interpreted = subparts.map(p => this.interpretPart(p, dataValues, percentScale, starIndex));
                const isStat = interpreted.some(x => x.isStat);
                return {
                    text: interpreted.map(x => x.text).filter(Boolean).join(' × '),
                    isStat
                };
            }

            case 'BuffCounterByCoefficientCalculationPart': {
                // Runtime stack counter — static per-stack value only.
                const coef = part.mCoefficient || 1;
                const perStack = round(coef * percentScale);
                return { text: `${perStack} per stack`, isStat: true };
            }

            case 'AbilityResourceByCoefficientCalculationPart': {
                const coef = part.mCoefficient || 0;
                const pct = Math.round(coef * 100);
                return { text: `${pct}% max mana`, isStat: true };
            }

            case 'GameCalculationConditional': {
                const trueCalc = this.interpretCalculation(part.mConditionalGameCalculation, dataValues, null, starIndex);
                const falseCalc = this.interpretCalculation(part.mDefaultGameCalculation, dataValues, null, starIndex);
                const cond = part.mConditionalCalculationRequirements?.__type;
                if (cond === 'IsRangedCastRequirement') {
                    return { text: `${trueCalc} (ranged) / ${falseCalc} (melee)`, isStat: true };
                }
                return { text: `${trueCalc} / ${falseCalc}`, isStat: true };
            }

            default:
                // Hashed `__type` fallback. Riot sometimes obfuscates a
                // part type as `{xxxxxxxx}` (e.g. Hive Mind's BeeDamage
                // uses `{ee18a47b}` with two dv refs `BaseDamageMin` /
                // `BaseDamageMax`). Rather than hard-code a hash table
                // that goes stale on rotation, shape-match: when the
                // non-__type fields point at two dataValues, infer the
                // semantic from the dv names.
                if (typeof t === 'string' && t.startsWith('{') && t.endsWith('}')) {
                    const dvFields = Object.entries(part)
                        .filter(([k, v]) =>
                            k !== '__type' &&
                            typeof v === 'string' &&
                            Object.prototype.hasOwnProperty.call(dataValues, v));

                    if (dvFields.length === 2) {
                        const names = dvFields.map(([, v]) => v);
                        const lower = names.map(n => n.toLowerCase());
                        const minIdx = lower.findIndex(n => n.endsWith('min'));
                        const maxIdx = lower.findIndex(n => n.endsWith('max'));
                        const perIdx = lower.findIndex(n => /perlevel|bonusper/.test(n));

                        // Min/Max pair → simple range (e.g. 40-100 damage).
                        if (minIdx >= 0 && maxIdx >= 0 && minIdx !== maxIdx) {
                            const minFmt = this.formatArrayValue(dataValues[names[minIdx]], percentScale, starIndex);
                            const maxFmt = this.formatArrayValue(dataValues[names[maxIdx]], percentScale, starIndex);
                            if (minFmt !== null && maxFmt !== null) {
                                return { text: `${minFmt}-${maxFmt}`, isStat: false };
                            }
                        }

                        // Base + perLevel pair → scales-with-level range,
                        // matching how ByCharLevelInterpolationCalculationPart
                        // renders. Level 1 → base, level 18 → base + 17×per.
                        if (perIdx >= 0) {
                            const baseIdx = perIdx === 0 ? 1 : 0;
                            const pickScalar = (dvArr) => {
                                const arr = Array.isArray(dvArr) ? dvArr : [dvArr];
                                if (typeof starIndex === 'number' && Number.isInteger(starIndex)
                                    && starIndex >= 0 && starIndex < arr.length
                                    && typeof arr[starIndex] === 'number') {
                                    return arr[starIndex];
                                }
                                return typeof arr[0] === 'number' ? arr[0] : NaN;
                            };
                            const b = pickScalar(dataValues[names[baseIdx]]);
                            const p = pickScalar(dataValues[names[perIdx]]);
                            if (isFinite(b) && isFinite(p)) {
                                const maxLevel = 18;
                                const start = round(b * percentScale);
                                const end = round((b + p * (maxLevel - 1)) * percentScale);
                                if (start === end) {
                                    return { text: `${start}`, isStat: false };
                                }
                                return { text: `${start}-${end} (scales with level)`, isStat: false };
                            }
                        }
                    }
                }
                return { text: '[complex calculation]', isStat: false };
        }
    }

    interpretCalculation(calculation, dataValues = {}, _multStr = null, starIndex) {
        if (!calculation || !calculation.mFormulaParts) return '[calculation]';

        // mDisplayAsPercent scales each SCALAR part by 100 and suffixes '%'.
        // Stat-shaped parts ("X% AD", "N per stack") already contain their
        // own percent/unit and are passed through unchanged — this avoids
        // the "0.04-0.06% AP%%" double-percent bug.
        const asPct = !!calculation.mDisplayAsPercent;
        const percentScale = asPct ? 100 : 1;

        const interpreted = calculation.mFormulaParts.map(
            part => this.interpretPart(part, dataValues, percentScale, starIndex)
        );

        if (interpreted.length === 0) return '[calculation]';

        const hasStat = interpreted.some(x => x.isStat);
        const joined = interpreted.map(x => x.text).filter(Boolean).join(' + ');

        // When every part is a scalar and mDisplayAsPercent is set, wrap the
        // whole expression with one '%'. When a stat part is present the
        // percent sign is already inside and we don't add another.
        if (asPct && !hasStat) return `${joined}%`;
        return joined;
    }

    // Format a dataValue (array or scalar) as a single value or min-max range.
    // Returns null when the value is undefined/missing.
    //
    // `starIndex` (optional, 1–3) picks a single array index instead of
    // deduping across the whole array. This maps the user's filled-star
    // slider to the corresponding entry in Riot's 7-element dataValues
    // arrays (index 1 = 1★, 2 = 2★, 3 = 3★; see js/app.js getAugmentMaxLevel).
    // Falls back to the range behavior if the index is out of bounds or
    // the entry isn't a finite number.
    formatArrayValue(rawValue, multiplier, starIndex) {
        if (rawValue === undefined || rawValue === null) return null;

        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        if (values.length === 0) return null;

        const mult = (typeof multiplier === 'number' && isFinite(multiplier)) ? multiplier : 1;
        const round = n => Math.round(Math.fround(n) * 100) / 100;

        // Single-star path: pick the specific index if it exists and is a
        // valid number; otherwise fall through to the range formatter.
        if (typeof starIndex === 'number' && Number.isInteger(starIndex)
            && starIndex >= 0 && starIndex < values.length) {
            const v = values[starIndex];
            if (typeof v === 'number' && isFinite(v)) {
                return round(v * mult).toString();
            }
        }

        const formatted = values.map(v => {
            if (typeof v !== 'number' || !isFinite(v)) return NaN;
            // Round to 2 decimals (not floor — floor would turn
            // 0.0004 × 100 = 0.03999… into 0.03 instead of 0.04).
            return round(v * mult);
        }).filter(n => !isNaN(n));

        if (formatted.length === 0) return null;

        // Dedupe while preserving insertion order.
        const unique = [...new Set(formatted)];

        if (unique.length === 1) return unique[0].toString();

        const min = Math.min(...unique);
        const max = Math.max(...unique);
        if (min === max) return min.toString();
        return `${min}-${max}`;
    }

    processDataValue(varName, multiplier, dataValues, starIndex) {
        const rawValue = dataValues[varName];
        if (rawValue === undefined) return `[${varName}]`;

        // Parse multiplier once.
        let mult = 1;
        if (multiplier) {
            if (multiplier === '*100') mult = 100;
            else if (multiplier === '*-100') mult = -100;
            else {
                const parsed = parseFloat(multiplier.substring(1));
                if (!isNaN(parsed)) {
                    mult = parsed;
                } else {
                    console.warn(`Unknown multiplier format: ${multiplier} for variable ${varName}`);
                    return `[${varName}${multiplier}]`;
                }
            }
        }

        const formatted = this.formatArrayValue(rawValue, mult, starIndex);
        return formatted !== null ? formatted : `[${varName}]`;
    }
}

// Initialize calculation engine
const calculationEngine = new CalculationEngine();

export { CalculationEngine, calculationEngine };
