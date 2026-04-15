// Shared application state
export const settings = {
    selectedAugment: null,
    selectedFrame: "augmentcard_frame_prismatic.png",
    shinyFrame: false,
    augmentTitle: "",
    augmentDescription: "",
    iconXOffset: 156,
    iconYOffset: 40,
    iconSize: 150,
    titleFont: "bold 24px LolBeautfortBold",
    descriptionFont: "14px LolBeautfort",
    selectedChampion: null,
    selectedItem: null,
    selectedModifier: 0,
    titleYOffset: 324,
    descriptionYOffset: 364,
    descriptionXOffset: 256,
    titleLineHeight: 26,
    descriptionLineHeight: 18,
    language: 'en_us',
    customImage: null,
    customFrame: null,
    selectedBackground: "augmentcard_bg.png",
    // Augment Levels
    levelMode: 'off',       // 'off', '2', '3'
    levelTier: 'gold',      // 'silver', 'gold', 'prismatic'
    levelCurrent: 1,        // 1, 2, or 3 (filled stars)
    levelBackplateX: 257,   // center X of backplate
    levelBackplateY: 50,    // Y position of backplate
    levelBackplateScale: 0.9, // scale multiplier for backplate
    levelStarScale: 0.7,    // scale multiplier for stars
    levelStarSpacing: 21,   // horizontal spacing between star centers
    levelStarOffsetY: -3    // Y offset of stars relative to backplate center
};

export const borderImages = {
    augmentcard_bg: "augmentcard_bg.png",
    augmentcard_frame_silver: "augmentcard_frame_silver.png",
    augmentcard_frame_gold: "augmentcard_frame_gold.png",
    augmentcard_frame_prismatic: "augmentcard_frame_prismatic.png",
    augmentcard_sheenglow_silver: "augmentcard_sheenglow_silver.png",
    augmentcard_sheenglow_gold: "augmentcard_sheenglow_gold.png",
    augmentcard_sheenglow_prismatic: "augmentcard_sheenglow_prismatic.png",
    augmentcard_frame_goh_arena_2026_s2: "augmentcard_frame_goh.arena_2026_s2.png",
    augmentcard_frame_goh_gold_arena_2026_s2: "augmentcard_frame_goh_gold.arena_2026_s2.png",
    augmentcard_frame_goh_prismatic_arena_2026_s2: "augmentcard_frame_goh_prismatic.arena_2026_s2.png",
    augmentcard_frame_goh_silver_arena_2026_s2: "augmentcard_frame_goh_silver.arena_2026_s2.png",
    augmentcard_frame_remove_gold_arena_2026_s2: "augmentcard_frame_remove_gold.arena_2026_s2.png",
    augmentcard_frame_remove_prismatic_arena_2026_s2: "augmentcard_frame_remove_prismatic.arena_2026_s2.png",
    augmentcard_frame_remove_silver_arena_2026_s2: "augmentcard_frame_remove_silver.arena_2026_s2.png",
    augmentcard_bg_goh_arena_2026_s2: "augmentcard_bg_goh.arena_2026_s2.png",
};
