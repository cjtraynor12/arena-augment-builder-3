// Data Manager Module - URLs, data fetching, image keyword maps
import { calculationEngine } from './calculationEngine.js';

export const arenaJsonDataUrl = "https://raw.communitydragon.org/pbe/cdragon/arena/";
export const championJsonDataUrl = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";
export const communityDragonBaseUrl = "https://raw.communitydragon.org/pbe/game/";
export const baseSquarePortraitPath = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/";

export const augmentFrameBaseUrl = communityDragonBaseUrl + "assets/ux/cherry/augments/augmentselection/";
export const levelStarBaseUrl = communityDragonBaseUrl + "assets/ux/cherry/augments/levelup/";

export let arenaJsonData = null;
export let championJsonData = null;

export function compareNames(a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
}

export async function getAugmentData(language = 'en_us') {
    const response = await fetch(arenaJsonDataUrl + language + '.json');
    arenaJsonData = (await response.json())['augments'].sort(compareNames);
    return arenaJsonData;
}

function getChampionIcon(champion, type) {
    return communityDragonBaseUrl + "assets/characters/" + champion + "/hud/" + champion + "_" + type + ".png";
}

export async function getChampionData() {
    const response = await fetch(championJsonDataUrl);
    championJsonData = await response.json();

    championJsonData = championJsonData.filter((champion) => champion.id !== -1).sort(compareNames);
    championJsonData = championJsonData.map((champion) => {
        champion['circleIcon'] = getChampionIcon(champion['alias'].toLowerCase(), "circle");
        champion['squareIcon'] = getChampionIcon(champion['alias'].toLowerCase(), "square");
        return champion;
    });

    return championJsonData;
}

// Base URLs for different icon sets
export const STAT_ICONS_BASE_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/statsicon/';
export const TIER_ICONS_BASE_URL = 'https://raw.communitydragon.org/pbe/game/assets/ux/cherry/augments/statanvil/';
export const GAMEPLAY_ICONS_BASE_URL = 'https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/gameplay/';

// Stat icons (scaling indicators, on-hit, etc.)
const statIconFiles = {
    'onhit': 'onhit.png',
    'scaleAD': 'scalead.png',
    'scaleAdaptiveForce': 'scaleadaptiveforce.png',
    'scaleAH': 'scaleah.png',
    'scaleAP': 'scaleap.png',
    'scaleAPen': 'scaleapen.png',
    'scaleArmor': 'scalearmor.png',
    'scaleAS': 'scaleas.png',
    'scaleCooldown': 'scalecooldown.png',
    'scaleCrit': 'scalecrit.png',
    'scaleCritMult': 'scalecritmult.png',
    'scaleDA': 'scaleda.png',
    'scaleDR': 'scaledr.png',
    'scaleHealShield': 'scalehealshield.png',
    'scaleHealth': 'scalehealth.png',
    'scaleHPRegen': 'scalehpregen.png',
    'scaleLevel': 'scalelevel.png',
    'scaleLS': 'scalels.png',
    'scaleMana': 'scalemana.png',
    'scaleManaRegen': 'scalemanaregen.png',
    'scaleMPen': 'scalempen.png',
    'scaleMR': 'scalemr.png',
    'scaleMS': 'scalems.png',
    'scaleRange': 'scalerange.png',
    'scaleSV': 'scalesv.png',
    'scaleTenacity': 'scaletenacity.png'
};

// Tier icons (gold/silver/prismatic stat anvil icons)
const tierIconFiles = {
    'gold_ad': 'gold_ad.png',
    'gold_ah': 'gold_ah.png',
    'gold_ap': 'gold_ap.png',
    'gold_apen': 'gold_apen.png',
    'gold_ar': 'gold_ar.png',
    'gold_as': 'gold_as.png',
    'gold_critchance': 'gold_critchance.png',
    'gold_faith': 'gold_faith.png',
    'gold_hp': 'gold_hp.png',
    'gold_hybrid1': 'gold_hybrid1.png',
    'gold_hybrid2': 'gold_hybrid2.png',
    'gold_mpen': 'gold_mpen.png',
    'gold_mr': 'gold_mr.png',
    'prismatic_apen': 'prismatic_apen.png',
    'prismatic_hp': 'prismatic_hp.png',
    'prismatic_hs': 'prismatic_hs.png',
    'prismatic_mpen': 'prismatic_mpen.png',
    'prismatic_ms': 'prismatic_ms.png',
    'prismatic_tenacity': 'prismatic_tenacity.png',
    'prismatic_vamp': 'prismatic_vamp.png',
    'silver_ad': 'silver_ad.png',
    'silver_ah': 'silver_ah.png',
    'silver_ap': 'silver_ap.png',
    'silver_apen': 'silver_apen.png',
    'silver_ar': 'silver_ar.png',
    'silver_as': 'silver_as.png',
    'silver_critchance': 'silver_critchance.png',
    'silver_faith': 'silver_faith.png',
    'silver_hp': 'silver_hp.png',
    'silver_hybrid1': 'silver_hybrid1.png',
    'silver_hybrid2': 'silver_hybrid2.png',
    'silver_mpen': 'silver_mpen.png',
    'silver_mr': 'silver_mr.png',
    'silver_pristine': 'silver_pristine.png'
};

// Gameplay icons (augment UI, bounty, reroll, etc.)
const gameplayIconFiles = {
    'activeeffect': 'activeeffect.png',
    'augment': 'augment.png',
    'augmentlevel': 'augmentlevel.png',
    'bigbounty': 'bigbounty.png',
    'bounty': 'bounty.png',
    'chevronright': 'chevronright.png',
    'cooldown': 'cooldown.png',
    'gainteamhealth': 'gainteamhealth.png',
    'goldcoins': 'goldcoins.png',
    'heartgold': 'heartgold.png',
    'honorchatally3': 'honorchatally3.png',
    'honorchatenemy3': 'honorchatenemy3.png',
    'itemadvicekda': 'itemadvicekda.png',
    'leftarrow': 'leftarrow.png',
    'losegold': 'losegold.png',
    'losereroll': 'losereroll.png',
    'loseteamhealth': 'loseteamhealth.png',
    'meleeactive': 'meleeactive.png',
    'meleeinactive': 'meleeinactive.png',
    'ornnicon': 'ornnicon.png',
    'rangedactive': 'rangedactive.png',
    'rangedinactive': 'rangedinactive.png',
    'reroll': 'reroll.png',
    'rightarrow': 'rightarrow.png',
    'silvercoins': 'silvercoins.png',
    'spellcraftblueshard': 'spellcraftblueshard.png',
    'spellcraftgreenshard': 'spellcraftgreenshard.png',
    'spellcraftredshard': 'spellcraftredshard.png',
    'star': 'star.png',
    'statanvil': 'statanvil.png',
    'statanvilweaken': 'statanvilweaken.png',
    'strawberryduration': 'strawberryduration.png',
    'stun': 'stun.png'
};

// Combined map storing full URLs for each icon keyword
export const imageKeywordMap = {};
Object.entries(statIconFiles).forEach(([k, v]) => { imageKeywordMap[k] = STAT_ICONS_BASE_URL + v; });
Object.entries(tierIconFiles).forEach(([k, v]) => { imageKeywordMap[k] = TIER_ICONS_BASE_URL + v; });
Object.entries(gameplayIconFiles).forEach(([k, v]) => { imageKeywordMap[k] = GAMEPLAY_ICONS_BASE_URL + v; });

// Map for inline augment/item images inserted via the "+" button
export const inlineImageUrlMap = {};

export function sanitizeKeyword(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '');
}

export function getTierKeyword(rarity, preferredFrame) {
    if (rarity !== undefined && rarity !== null) {
        switch (rarity) {
            case 0: return 'silver';
            case 1: return 'gold';
            case 2: return 'prismatic';
            default: return 'gold';
        }
    }
    if (preferredFrame) {
        if (preferredFrame.includes('prismatic')) return 'prismatic';
        if (preferredFrame.includes('silver')) return 'silver';
    }
    return 'gold';
}

// Helper function to get full URL for a stat icon
export function getStatIconUrl(keyword) {
    return imageKeywordMap[keyword];
}

export function populateDescriptionVariables(augment) {
    let description = augment['desc'];
    const dataValues = augment['dataValues'] || {};

    console.log('Original description:', description); // Debug log

    // FIRST: Handle %i:keyword% patterns for inline images BEFORE other processing
    description = description.replaceAll(/%i:([^%]+)%/gi, (match, keyword) => {
        console.log('Converting image pattern:', match, 'keyword:', keyword); // Debug log
        if (imageKeywordMap[keyword]) {
            const imgTag = `<img${keyword}>`;
            console.log('Created custom img tag:', imgTag); // Debug log
            return imgTag;
        }
        console.log('Unknown keyword:', keyword); // Debug log
        return `[${keyword}]`; // Fallback for unknown keywords
    });

    console.log('After image conversion:', description); // Debug log

    // Then handle complex calculations and special placeholders using the calculation engine
    description = calculationEngine.processCalculations(description, augment);

    // Then handle simple @DataValue@ and @DataValue*multiplier@ placeholders
    // Use regex to properly match placeholders: @VariableName@ or @VariableName*multiplier@
    while (description.includes("@")) {
        // Match @VariableName@ or @VariableName*number@ (including negative numbers)
        const match = description.match(/@[A-Za-z0-9_]+(\*-?\d+)?@/);

        if (!match) break; // No valid placeholder found, break to avoid infinite loop

        const varName = match[0]; // The full matched placeholder like "@HealthReduction*100@"
        let multiplier = null;

        // Extract the variable name and multiplier
        // Remove the @ symbols first
        const innerContent = varName.substring(1, varName.length - 1); // e.g., "HealthReduction*100"

        let isolatedVarName;
        if (innerContent.includes("*")) {
            const asteriskIndex = innerContent.indexOf("*");
            isolatedVarName = innerContent.substring(0, asteriskIndex); // e.g., "HealthReduction"
            multiplier = innerContent.substring(asteriskIndex); // e.g., "*100"
        } else {
            isolatedVarName = innerContent; // e.g., "RoundCountCap"
        }

        // Check if this is a dataValue
        if (dataValues.hasOwnProperty(isolatedVarName)) {
            const processedValue = calculationEngine.processDataValue(isolatedVarName, multiplier, dataValues);
            console.log(`Replacing "${varName}" with "${processedValue}"`); // Debug log
            description = description.replace(varName, processedValue);
        } else {
            // If not found in dataValues, leave a descriptive placeholder
            console.log(`Placeholder not found in dataValues: "${varName}"`); // Debug log
            description = description.replace(varName, `[${isolatedVarName}]`);
        }
    }

    // Clean up the description
    let modifiedDescription = description.replaceAll("<br>", "\n");

    // Handle any remaining runtime placeholders (@f1@, @f2@, etc.)
    modifiedDescription = modifiedDescription.replaceAll(/@f(\d+)@/g, '[runtime value]');

    console.log('Final processed description:', modifiedDescription); // Debug log
    return modifiedDescription;
}
