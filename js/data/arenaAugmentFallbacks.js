// Hard-coded fallbacks for Arena augments that CommunityDragon has no
// definition for.
//
// Background: Arena (map30 / "cherry") borrows augments from
// `Maps/ModeSpecificData/Augments/*`. The list of borrowed paths lives in
// rcp-be-lol-game-data's augment-lists.json (modeName "CHERRY"), and most of
// them resolve to AugmentData entries in game/maps/modespecificdata/kiwi.bin.json.
// The ones below do NOT resolve anywhere in the exported bins (as of 16.20),
// so their spell dataValues (the numbers) are unavailable.
//
// modeAugments.js only reaches this file after every dynamic source has
// failed for an augment, and even then it prefers live data per field:
//   - id / name / rarity / small icon come from cherry-augments.json when present
//   - text comes from the stringtable (`descKeys`, in order) when every
//     @placeholder@ in it can be filled from `dataValues` / `textValues`
//   - `desc` / `name` / `rarity` / `id` / `iconLarge` here are last resorts
// As soon as CommunityDragon exports a real AugmentData for one of these, the
// dynamic path wins automatically and the entry here is ignored.
//
// Sources: League wiki Module:ArenaAugmentData/data (level1/level2/level3),
// official patch notes (26.19: Scavenger 500 → 1000 gold), and the 26.19
// patch-note augment text for Death Dealer / Got That Dog In Em.

// Expand per-level values into Riot's 7-slot dataValues layout, where index
// 1/2/3 = 1★/2★/3★ (see formatArrayValue in calculationEngine.js).
function lv(l1, l2 = l1, l3 = l2) {
    return [l1, l1, l2, l3, l3, l3, l3];
}

// Snapshot of the CHERRY list from augment-lists.json (16.20). Only used if
// that file can't be fetched, so the Arena tab still includes borrowed augments.
export const cherryAugmentListSnapshot = [
    'ARAM_GetExcited', 'ARAM_ProteinShake', 'ARAM_Upgrade_Collector', 'VeilOfWarding',
    'Adamant', 'WindBeneathBlade', 'OminousPact', 'CriticalRhythm', 'EscapePlan',
    'GlassCannon', 'FinalForm', 'Quest_VoidImmolation', 'PinballSnowball', 'ShrinkEngine',
    'YouSpinMeRightRound', 'GrowthSpurt', 'ARAM_StuckInHereWithMe', 'ARAM_SpeedDemon',
    'HextechSoul', 'ARAM_CrackOpenThatEgg', 'ARAM_WeightedPopoffs', 'KillSecured',
    'ARAM_LittleDevil', 'ARAM_Zealot', 'ARAM_Purist_Caster', 'Upgrade_SwordOfBlossom',
    'ARAM_DoubleTap', 'RiceAndChicken', 'RiceAndFish', 'RiceAndPork', 'CombinationFriedRice',
    'TransmuteSilver', 'WildFire', 'Mercy', 'Scavenger', 'DemonicClasp', 'Spellcraft',
    'BigDragonEnergy', 'ChromaFlux', 'TrashToTreasure', 'UnstableTransmutation', 'ARAM_Juiced',
    'RagsToRiches', 'DustToDiamonds', 'DeathDealer', 'GotThatDogInEm', 'WarlockJuicebox',
    'NatureIsHealing', 'ARAM_WeeWooWeeWoo', 'FishBait', 'ARAM_Archmage', 'SurgeField',
    'Sonata', 'ARAM_Hellbent', 'ARAM_DivineDomain', 'CritNCast', 'ARAM_ImTheJuggernaut'
].map(name => 'Maps/ModeSpecificData/Augments/' + name);

const RICE = (spellKey, hasteKey) => ({
    rarity: 1,
    descKeys: [`cherry_${spellKey}_tooltip`],
    dataValues: { DamageAmp: lv(0.5, 0.75), HealShieldAmp: lv(0.3, 0.5), [hasteKey]: lv(50), MaxLevel: lv(2) }
});

// Keyed by AugmentNameId (the last segment of the CHERRY list path).
export const arenaAugmentFallbacks = {
    WindBeneathBlade: {
        id: 1316, name: 'Wind Beneath Blade', rarity: 0,
        iconLarge: 'assets/ux/kiwi/augments/icons/windbeneathblade_large.png',
        descKeys: ['kiwi_windbeneathblade_summary', 'kiwi_windbeneathblade_tooltip'],
        dataValues: { MSFromBasePen: lv(1.5), PercentPenConversion: lv(5) },
        desc: 'The higher your <armorPen>Armor Penetration</armorPen> and <magicPen>Magic Penetration</magicPen> are, the faster you are.'
    },
    Quest_VoidImmolation: {
        id: 393, name: "Icathia's Fall", rarity: 2,
        iconLarge: 'assets/ux/kiwi/augments/icons/quest_voidimmolation_large.png',
        descKeys: ['kiwi_aram_quest_voidimmolation_summary', 'kiwi_aram_quest_voidimmolation_tooltip'],
        desc: "Immediately: Gain a Bami's Cinder.<br><br>QUEST: Possess <keywordMajor>Sunfire Aegis</keywordMajor> and <keywordMajor>Hollow Radiance</keywordMajor>.<br><br>REWARD: These Items combine into <keywordMajor>Void Immolation</keywordMajor>."
    },
    ARAM_SpeedDemon: {
        id: 1405, name: 'Speed Demon', rarity: 0,
        iconLarge: 'assets/ux/kiwi/augments/icons/speeddemon_large.png',
        descKeys: ['kiwi_aram_speeddemon_description', 'kiwi_aram_speeddemon_tooltip'],
        dataValues: { SpeedPerHit: lv(150, 300), SpeedDuration: lv(0.75), MaxLevel: lv(2) },
        desc: 'Gain <speed>150 / 300 Movement Speed</speed> when damaging an enemy champion with an Ability, decaying over 0.75 seconds.'
    },
    ARAM_CrackOpenThatEgg: {
        id: 1418, name: 'Crack Open That Egg', rarity: 0,
        iconLarge: 'assets/ux/kiwi/augments/icons/crackopenthategg_large.png',
        descKeys: ['kiwi_crackopenthategg_summary', 'kiwi_crackopenthategg_tooltip'],
        dataValues: { DamageMultiplier: lv(1, 1.5), MaxLevel: lv(2) },
        desc: 'Your shields will detonate on expiration.'
    },
    ARAM_WeightedPopoffs: {
        id: 2008, name: 'Weighted Popoffs', rarity: 0,
        iconLarge: 'assets/ux/kiwi/augments/icons/weightedpopoffs_large.png',
        descKeys: ['kiwi_augment_weightedpopoffs_summary', 'kiwi_augment_weightedpopoffs_tooltip'],
        dataValues: { Stacks_Max: lv(6), Stack_Duration: lv(6), MaxLevel: lv(2) },
        desc: 'Striking enemies with Abilities grants you stacks of <keyword>Popoff</keyword>, reducing your non-Ultimate Ability Cooldowns.'
    },
    RiceAndChicken: {
        ...RICE('riceandchicken', 'QAbilityHaste'), id: 374, name: 'Rice and Chicken',
        iconLarge: 'assets/ux/cherry/augments/icons/rice_and_chicken.png',
        desc: 'Your Q gains 50% / 75% increased damage, and <healing>30% / 50% increased Healing and Shielding</healing>.<br><br>Your Q loses 50 Ability Haste.'
    },
    RiceAndFish: {
        ...RICE('riceandfish', 'AbilityHaste'), id: 375, name: 'Rice and Fish',
        iconLarge: 'assets/ux/cherry/augments/icons/rice_and_fish.png',
        desc: 'Your W gains 50% / 75% increased damage, and <healing>30% / 50% increased Healing and Shielding</healing>.<br><br>Your W loses 50 Ability Haste.'
    },
    RiceAndPork: {
        ...RICE('riceandpork', 'AbilityHaste'), id: 376, name: 'Rice and Pork',
        iconLarge: 'assets/ux/cherry/augments/icons/rice_and_pork.png',
        desc: 'Your E gains 50% / 75% increased damage, and <healing>30% / 50% increased Healing and Shielding</healing>.<br><br>Your E loses 50 Ability Haste.'
    },
    CombinationFriedRice: {
        id: 377, name: 'Combination Fried Rice', rarity: 2,
        iconLarge: 'assets/ux/cherry/augments/icons/combination_fried_rice.png',
        descKeys: ['cherry_combinationfriedrice_tooltip'],
        dataValues: {
            DamageAmp: lv(1, 1.25, 1.5), HealShieldAmp: lv(0.75, 1, 1.25), AbilityHaste: lv(50),
            MoveSpeedAmp: lv(0.4), MSDuration: lv(2), MaxLevel: lv(3)
        },
        desc: 'Your abilities gain 100% / 125% / 150% increased damage, and <healing>75% / 100% / 125% increased Healing and Shielding</healing>.<br><br>Lose 50 Ability Haste.<br><br>Casting an ability grants <speed>40% Movement Speed for 2 seconds</speed>.'
    },
    TransmuteSilver: {
        id: 378, name: 'Transmute: Silver', rarity: 2,
        iconLarge: 'assets/ux/cherry/augments/icons/transmute_silver.png',
        descKeys: ['cherry_transmutesilver_summary', 'cherry_transmutesilver_tooltip'],
        desc: 'Fill your remaining augment slots with <keywordMajor>%i:Augment% Silver Augments</keywordMajor>.'
    },
    WildFire: {
        id: 379, name: 'Wild Fire', rarity: 2,
        iconLarge: 'assets/ux/cherry/augments/icons/wild_fire.png',
        descKeys: ['cherry_wildfire_summary', 'cherry_wildfire_tooltip'],
        dataValues: { baseCooldown: lv(12), MaxBounceCount: lv(3, 4), MaxLevel: lv(2) },
        desc: '<keywordMajor>Autocast</keywordMajor> fling a bouncing fireball, dealing <magicDamage>magic damage</magicDamage>, at a nearby enemy every 12s.'
    },
    Mercy: {
        id: 380, name: 'Mercy', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/mercy.png',
        descKeys: ['cherry_mercy_summary', 'cherry_mercy_tooltip'],
        // Damage is a %-of-max-health calc we can't express as a dataValue.
        textValues: { Damage: '30% / 45% of your max Health' },
        desc: 'After your team triggers <keywordMajor>Combo Breaker</keywordMajor> you become enraged causing your <status>immobilizing</status> effects to deal <magicDamage>30% / 45% of your max Health magic damage</magicDamage>.'
    },
    Scavenger: {
        id: 381, name: 'Scavenger', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/scavenger.png',
        descKeys: ['cherry_scavenger_summary', 'cherry_scavenger_tooltip'],
        dataValues: { GoldAmount: lv(1000) },
        desc: 'Increase your augment count to 6. When you defeat a team, gain one of their <keywordMajor>%i:Augment% Augments</keywordMajor>, selected at random.<br><br><keywordMajor>Augment Selections</keywordMajor> only grant <keywordMajor>%i:AugmentLevel% Augment Level Ups</keywordMajor>.'
    },
    DemonicClasp: {
        id: 383, name: 'Demonic Clasp', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/demonic_clasp.png',
        descKeys: ['cherry_demonicclasp_summary', 'cherry_demonicclasp_tooltip'],
        dataValues: { ClawCount: lv(1, 3), MaxLevel: lv(2) },
        desc: '<spellActive>Active:</spellActive> Call forth claws, pulling in enemies, dealing <magicDamage>(%i:scaleAP%) magic damage</magicDamage>.'
    },
    Spellcraft: {
        id: 384, name: 'Spellcraft', rarity: 2,
        iconLarge: 'assets/ux/cherry/augments/icons/spell_craft.png',
        descKeys: ['cherry_spellcraft_summary', 'chrry_spellcraft_tooltip', 'cherry_spellcraft_tooltip'],
        desc: '<spellActive>Active:</spellActive> Wind up and release a burst of energy, dealing <magicDamage>magic damage</magicDamage> in a cone.<br><br>This spell grows more powerful as you select additional augments.'
    },
    BigDragonEnergy: {
        id: 387, name: 'Big Dragon Energy', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/frombeginningtoend_large.png',
        descKeys: ['cherry_bigdragonenergy_summary', 'cherry_bigdragonenergy_tooltip'],
        dataValues: { DragonFormMulti: lv(1.5) },
        desc: "Start combat with full <keywordMajor>Dragon Fury</keywordMajor> and it no longer decays while in <keywordMajor>Dragon Form</keywordMajor>.<br><br>While in <keywordMajor>Dragon Form</keywordMajor> Emberstrike's final strike does <trueDamage>150% damage</trueDamage>."
    },
    ChromaFlux: {
        id: 388, name: 'Chroma Flux', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/chroma_flux.png',
        descKeys: ['cherry_chromaflux_summary', 'cherry_chromaflux_tooltip'],
        dataValues: { baseCooldown: lv(10), DetonationTimeout: lv(4), MarkDuration: lv(3) },
        desc: 'Every 10 seconds <keywordMajor>Autocast</keywordMajor> fire an orb that sticks to the first champion hit. Hitting an enemy with the orb, detonates it and deals <magicDamage>magic damage</magicDamage>.'
    },
    TrashToTreasure: {
        id: 389, name: 'Trash To Treasure', rarity: 0,
        iconLarge: 'assets/ux/cherry/augments/icons/trash_treasure.png',
        descKeys: ['cherry_trashtotreasure_summary', 'cherry_trashtotreasure_tooltip'],
        desc: 'When <keywordMajor>Trash To Treasure</keywordMajor> is removed or replaced gain a <keywordMajor>%i:Augment% Prismatic Augment</keywordMajor> selection.'
    },
    UnstableTransmutation: {
        id: 390, name: 'Unstable Transmutation', rarity: 1,
        iconLarge: 'assets/ux/cherry/augments/icons/unstabletransmutation_large.png',
        descKeys: ['cherry_unstabletransmutation_summary', 'cherry_unstabletransmutation_tooltip'],
        desc: 'At the start of each round, this transforms into random augment at its max level.'
    },
    RagsToRiches: {
        id: 391, name: 'Rags to Riches', rarity: 0,
        iconLarge: 'assets/ux/cherry/augments/icons/rags_to_riches.png',
        descKeys: ['cherry_ragstoriches_summary', 'cherry_ragstoriches_tooltip'],
        dataValues: { GoldToGrant: lv(2500) },
        desc: 'When <keywordMajor>Rags to Riches</keywordMajor> is removed or replaced gain <gold>+%i:goldCoins% 2500 gold</gold>.'
    },
    DustToDiamonds: {
        id: 394, name: 'Dust To Diamonds', rarity: 0,
        iconLarge: 'assets/ux/cherry/augments/icons/dust_to_diamonds.png',
        descKeys: ['kiwi_dusttodiamonds_description', 'kiwi_dusttodiamonds_tooltip'],
        dataValues: { AnvilsGranted: lv(2) },
        desc: 'When <keywordMajor>Dust To Diamonds</keywordMajor> is removed or replaced gain <keywordMajor>2 %i:StatAnvil% Prismatic Stat Anvils</keywordMajor>.'
    },
    DeathDealer: {
        id: 396, name: 'Death Dealer', rarity: 2,
        // No _large variant ships for this icon.
        iconLarge: 'assets/ux/kiwi/augments/icons/death_dealer_small.png',
        descKeys: ['augment_deathdealer_description', 'augment_deathdealer_tooltip'],
        dataValues: { DeathRealmDuration: lv(4, 8), InvisDuration: lv(2), MaxLevel: lv(2) },
        desc: 'Replace <spellName>Flee</spellName> with <spellName>Death Dealer</spellName>.<br><br>Activate: You and target champion enter the <keywordMajor>Death Realm</keywordMajor> for 4 / 8 seconds.<br><br>Entering the <keywordMajor>Death Realm</keywordMajor> causes you to become <keywordStealth>invisible</keywordStealth> for up to 2 seconds.'
    },
    GotThatDogInEm: {
        id: 397, name: 'Got That Dog In Em', rarity: 2,
        // No _large variant ships for this icon.
        iconLarge: 'assets/ux/kiwi/augments/icons/got_that_dog_small.png',
        descKeys: ['gotthatdoginem_description', 'gotthatdoginem_tooltip'],
        // Explosion / fire-breath damage numbers aren't published anywhere,
        // so the stringtable text can't be filled and `desc` is used instead.
        dataValues: { SpawnInterval: lv(3) },
        desc: 'Every 3 seconds spawn a nearby hot dog, this can be picked up by anyone, causing them to breathe fire.<br><br>If you die while breathing fire, you explode, dealing <magicDamage>magic damage</magicDamage> per stack.<br><br><rules>Enemies who pick this up can damage their allies.</rules>'
    }
};
