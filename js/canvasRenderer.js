// Canvas Renderer Module
import { settings } from "./state.js";
import {
  imageKeywordMap,
  getStatIconUrl,
  resolveImageKeyword,
  inlineImageUrlMap,
  levelStarBaseUrl,
} from "./dataManager.js";

// Callback for redrawing (set by app.js to avoid circular dependency)
let _redrawCallback = null;
export function setRedrawCallback(fn) {
  _redrawCallback = fn;
}

function createHiPPICanvas(width, height) {
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement("canvas");

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.getContext("2d").scale(ratio, ratio);

  return canvas;
}

// Modified from https://github.com/lukechilds/merge-images/blob/master/src/index.js
const defaultOptions = {
  format: "image/png",
  quality: 1,
  width: undefined,
  height: undefined,
  Canvas: undefined,
  crossOrigin: true,
};

export const mergeImages = (
  sources = [],
  options = {},
  offsets = {},
  title = "",
  description = "",
  iconSize = 256,
) =>
  new Promise((resolve) => {
    options = Object.assign({}, defaultOptions, options);

    const canvas = options.Canvas
      ? new options.Canvas()
      : createHiPPICanvas(600, 600);
    const Image = options.Image || window.Image;

    const images = sources.map(
      (source) =>
        new Promise((resolve, reject) => {
          if (source.constructor.name !== "Object") {
            source = { src: source };
          }

          const img = new Image();
          img.crossOrigin = options.crossOrigin;
          img.onerror = () => reject(new Error("Couldn't load image"));
          img.onload = () => resolve(Object.assign({}, source, { img }));
          img.src = source.src;
        }),
    );

    const ctx = canvas.getContext("2d");

    resolve(
      Promise.all(images).then(async (images) => {
        canvas.width = 512;
        canvas.height = 600;

        for (let index = 0; index < images.length; index++) {
          const image = images[index];
          ctx.globalAlpha = image.opacity ? image.opacity : 1;

          let xOffset = 0;
          let yOffset = 0;
          if (offsets[index]) {
            xOffset = offsets[index][0];
            yOffset = offsets[index][1];
          }

          yOffset += 44;

          const xPosition = xOffset > 0 ? xOffset : image.x || 0;
          const yPosition = yOffset > 0 ? yOffset : image.y || 0;

          // Draw level overlay after background but before frame
          if (index === 1) {
            ctx.globalAlpha = 1;
            await drawLevelOnCanvas(ctx);
            ctx.globalAlpha = image.opacity ? image.opacity : 1;
          }

          if (index === 2) {
            // Main icon - use custom size
            ctx.drawImage(image.img, xPosition, yPosition, iconSize, iconSize);
          } else if (index === 3) {
            // Modifier overlay - scale with icon size
            ctx.drawImage(image.img, xPosition, yPosition, iconSize, iconSize);
          } else {
            if (index === 1 && settings["shinyFrame"]) {
              ctx.drawImage(image.img, xPosition - 256, yPosition - 256);
            } else if (index === 1 && settings["customFrame"]) {
              // For custom frames, we need to center them properly
              // Check if the image is larger than standard frame size and adjust accordingly
              const standardWidth = 512;
              const standardHeight = 512;
              const imgWidth = image.img.naturalWidth || image.img.width;
              const imgHeight = image.img.naturalHeight || image.img.height;

              // Calculate offset to center the custom frame
              const xOffset = (imgWidth - standardWidth) / 2;
              const yOffset = (imgHeight - standardHeight) / 2;

              ctx.drawImage(
                image.img,
                xPosition - xOffset,
                yPosition - yOffset,
              );
            } else {
              ctx.drawImage(image.img, xPosition, yPosition);
            }
          }
        }

        if (title) {
          ctx.font = settings["titleFont"];
          ctx.fillStyle = "white";
          const titleMaxWidth = settings["titleMaxWidth"] || 220;
          return wrapText(
            ctx,
            title,
            256,
            settings["titleYOffset"],
            titleMaxWidth,
            settings["titleLineHeight"],
          )
            .then((numberOfTitleLines) => {
              ctx.font = settings["descriptionFont"];
              const descriptionMaxWidth =
                settings["descriptionMaxWidth"] || 220;
              return wrapText(
                ctx,
                description,
                settings["descriptionXOffset"] || 256,
                settings["descriptionYOffset"] +
                  (numberOfTitleLines - 1) * settings["titleLineHeight"],
                descriptionMaxWidth,
                settings["descriptionLineHeight"],
                true,
              );
            })
            .then(() => {
              return canvas.toDataURL(options.format, options.quality);
            });
        }

        return canvas.toDataURL(options.format, options.quality);
      }),
    );
  });

async function wrapText(
  context,
  text,
  x,
  y,
  maxWidth,
  lineHeight = 16,
  isDescription = false,
) {
  // Preprocess text to convert HTML-style font tags to compact format
  const preprocessedText = preprocessFontTags(text);

  const linebreakLines = preprocessedText.split("\n");
  const finalLines = [];
  linebreakLines.forEach((line) =>
    finalLines.push(...getLines(context, line, maxWidth)),
  );

  let inRulesSection = false;
  for (let index = 0; index < finalLines.length; index++) {
    const line = finalLines[index];
    inRulesSection = await writeCharacters(
      context,
      line,
      x,
      y + index * lineHeight,
      inRulesSection,
      isDescription,
    );
  }
  return finalLines.length;
}

function preprocessFontTags(text) {
  // Convert <font color = '#hexcode'> to <fontcolor='#hexcode'> to prevent line splitting
  let processedText = text;

  // Handle opening font tags with various spacing patterns
  processedText = processedText.replace(
    /<font\s+color\s*=\s*['"]([^'"]+)['"]\s*>/gi,
    "<fontcolor='$1'>",
  );

  // Handle closing font tags
  processedText = processedText.replace(/<\/font>/gi, "</fontcolor>");

  return processedText;
}

// Parse the size modifier (+N or -N) from an img tag's inner content (between < and >).
// Returns the pixel size for that inline image given the current fontSize.
function getImgTagSize(imgTagContent, fontSize) {
  // imgTagContent is e.g. "imgprismatic_vamp+2" — strip the "img" prefix first
  const afterImg = imgTagContent.replace(/^img/i, "");
  const modifierMatch = afterImg.match(/([+-]\d+)$/);
  const sizeModifier = modifierMatch ? parseInt(modifierMatch[1]) : -2;
  return fontSize + sizeModifier;
}

// Sum the widths of all <img…> tags found in a string, respecting per-tag size modifiers.
function sumImgTagWidths(str, fontSize) {
  const imgMatches = str.match(/<img[^>]*>/gi) || [];
  let total = 0;
  for (const tag of imgMatches) {
    // tag looks like "<imgkeyword+2>" — extract inner content (without < >)
    const inner = tag.substring(1, tag.length - 1);
    total += getImgTagSize(inner, fontSize);
  }
  return total;
}

function getLines(ctx, text, maxWidth) {
  console.log("getLines input text:", text); // Debug log

  let words = text.split(" ");
  let lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    let word = words[i];

    // Handle image tags specially - they should be treated as having a width
    let wordWidth = 0;
    let currentLineWidth = 0;

    // Calculate width for current line (excluding tags but accounting for images)
    const currentLineNoTags = currentLine.replaceAll(/(<([^>]+)>)/gi, "");
    const fontSize = parseInt(ctx.font.match(/\d+/));
    currentLineWidth =
      ctx.measureText(currentLineNoTags).width +
      sumImgTagWidths(currentLine, fontSize);

    // Calculate width for the word being added
    const wordNoTags = word.replaceAll(/(<([^>]+)>)/gi, "");
    wordWidth =
      ctx.measureText(wordNoTags).width + sumImgTagWidths(word, fontSize);

    let totalWidth = currentLineWidth + ctx.measureText(" ").width + wordWidth;

    if (totalWidth < maxWidth) {
      currentLine += " " + word;
    } else {
      console.log("Line break - pushing line:", currentLine); // Debug log
      lines.push(currentLine);
      currentLine = word;
    }
  }
  console.log("Final line:", currentLine); // Debug log
  lines.push(currentLine);

  console.log("getLines output lines:", lines); // Debug log
  return lines;
}

export const colorTable = {
  // Damage types
  magicDamage: "#30bdd0",
  physicalDamage: "#FF8C00",
  trueDamage: "#FFFFFF",

  // Scaling types
  scaleBonus: "#c9aa71",
  scaleHealth: "#60b087",
  scaleAD: "#FF8C00",
  scaleAP: "#00B0F0",
  scaleMana: "#0099CC",
  scaleArmor: "#C89B3C",
  scaleMR: "#9966CC",
  scaleLethality: "#FF6B6B",
  scaleLevel: "#CDBE91",
  scaleAF: "#c9aa71", // Adaptive Force

  // Effects and utilities
  healing: "#60b087",
  shield: "#70b3b4",
  status: "#b29cc0",
  keywordMajor: "#F0E6D2",
  keywordStealth: "#966db0",

  // Speed and combat stats
  speed: "#00FF7F",
  attackSpeed: "#FF6347",
  crit: "#FFD700",
  lifeSteal: "#DC143C",
  energy: "#4169E1",

  // UI elements
  spellName: "#dad2b5",
  abilityName: "#dad2b5",
  recast: "rgb(255,143,97)",
  rules: "rgb(255, 255, 255, 0.4)",

  // Resistances (fallback colors)
  armor: "#C89B3C",
  magicresistance: "#9966CC",

  // Tier colors (for inline augment/item references)
  silver: "#B0B0B0",
  gold: "#C9AA71",
  prismatic: "#E4B4FF",

  // Tags added in the 2026 Arena text update — previously fell through to
  // white. Colors are best-effort matches to related existing entries; tweak
  // to taste.
  armorPen: "#C89B3C",        // physical-penetration, same family as armor
  magicPen: "#9966CC",        // magic-penetration, same family as magicresistance
  attention: "#F0E6D2",       // emphasis (e.g. "Ultimate"), matches keywordMajor
  keyword: "#F0E6D2",         // inline keyword emphasis
  lifesteal: "#DC143C",       // lowercase alias of lifeSteal
  scaleAbilityHaste: "#A1CFE4", // ability-haste cyan
  scaleTenacity: "#CDBE91",   // tenacity warm cream
  stealth: "#966db0",         // alias of keywordStealth
};

// Image cache for inline images
export const imageCache = new Map();

// Preload all stat icons for better performance
export function preloadStatIcons() {
  console.log("Preloading stat icons...");
  let loadedCount = 0;
  const totalIcons = Object.keys(imageKeywordMap).length;

  Object.entries(imageKeywordMap).forEach(([keyword, url]) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(url, img);
      loadedCount++;
      if (loadedCount === totalIcons) {
        console.log(`All ${totalIcons} stat icons preloaded successfully`);
      }
    };
    img.onerror = () => {
      console.warn(`Failed to preload stat icon: ${keyword} (${url})`);
      loadedCount++;
    };
    img.src = url;
  });
}

function writeCharacters(
  ctx,
  str,
  x,
  y,
  inRulesSection,
  isDescription = false,
) {
  return new Promise((resolve) => {
    const strNoTags = str.replaceAll(/(<([^>]+)>)/gi, "");

    // Letter spacing adjustment - use dynamic value from settings
    const letterSpacing = settings["letterSpacing"] || 0.5;

    // Manual centering adjustment - adjust these to fine-tune centering with letter spacing
    const titleCenterAdjustment = 2; // Adjust this for title centering (try -5, -10, +5, +10, etc.)
    const descriptionCenterAdjustment = 2; // Adjust this for description centering

    // Calculate the total width including letter spacing and images
    let totalWidth =
      ctx.measureText(strNoTags).width + (strNoTags.length - 1) * letterSpacing;

    // Add width for inline images (each may have its own size modifier)
    const fontSize = parseInt(ctx.font.match(/\d+/));
    const imgMatchesForWidth = str.match(/<img[^>]*>/gi) || [];
    for (const tag of imgMatchesForWidth) {
      const inner = tag.substring(1, tag.length - 1);
      totalWidth += getImgTagSize(inner, fontSize) + letterSpacing;
    }

    let xCenterAdjustment = totalWidth / 2;

    if (!isDescription) {
      xCenterAdjustment += titleCenterAdjustment;
    } else {
      xCenterAdjustment += descriptionCenterAdjustment;
    }

    let currentX;
    if (isDescription && settings["leftAlignDesc"]) {
      // Left align: start at x minus half the max description width
      const descMaxWidth = settings["descriptionMaxWidth"] || 220;
      currentX = x - descMaxWidth / 2;
    } else {
      currentX = x - xCenterAdjustment;
    }
    let pendingImages = [];

    for (let i = 0; i <= str.length; ++i) {
      let ch = str.charAt(i);

      if (ch === "<") {
        const endOfTag = str.indexOf(">", i);
        if (endOfTag !== -1) {
          const tagContent = str.substring(i + 1, endOfTag);

          console.log("Processing tag:", tagContent); // Debug log

          // Handle custom inline image tags - check for imgKeyword format
          if (tagContent.toLowerCase().startsWith("img")) {
            // Parse keyword and optional size modifier: imgKeyword or imgKeyword+N or imgKeyword-N
            let keyword;
            let sizeModifier = -2; // default
            const modifierMatch = tagContent
              .substring(3)
              .match(/^(.+?)([+-]\d+)$/);
            if (modifierMatch) {
              keyword = modifierMatch[1];
              sizeModifier = parseInt(modifierMatch[2]);
            } else {
              keyword = tagContent.substring(3);
            }

            let imageUrl;
            // Case-insensitive resolve so `<imgOnHit>` works the same as
            // `<imgonhit>` (Riot uses mixed casing; our map keys are lowercase).
            const canonicalKeyword = resolveImageKeyword(keyword);
            if (canonicalKeyword) {
              imageUrl = getStatIconUrl(canonicalKeyword);
              keyword = canonicalKeyword; // use canonical downstream
            } else if (inlineImageUrlMap[keyword]) {
              imageUrl = inlineImageUrlMap[keyword];
            }

            if (imageUrl) {
              const baseImageSize = fontSize + sizeModifier;
              const refMultiplier = inlineImageUrlMap[keyword]
                ? settings["refIconScale"] || 2
                : 1;
              const imageSize = Math.round(baseImageSize * refMultiplier);

              console.log(
                "Processing custom image tag:",
                tagContent,
                "keyword:",
                keyword,
                "url:",
                imageUrl,
              ); // Debug log

              // Check cache first
              if (imageCache.has(imageUrl)) {
                const cachedImg = imageCache.get(imageUrl);
                if (cachedImg.complete) {
                  // Center all icons vertically on text midpoint
                  const imageY = y - fontSize * 0.35 - imageSize / 2;
                  ctx.drawImage(
                    cachedImg,
                    currentX,
                    imageY,
                    imageSize,
                    imageSize,
                  );
                  currentX += imageSize + letterSpacing;
                  console.log("Drew cached image at", currentX, imageY); // Debug log
                }
              } else {
                // Load new image
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                  imageCache.set(imageUrl, img);
                  console.log("Image loaded, redrawing canvas"); // Debug log
                  // Redraw the entire canvas when image loads
                  setTimeout(() => {
                    if (_redrawCallback) _redrawCallback();
                  }, 10);
                };
                img.onerror = () => {
                  console.warn("Failed to load inline image:", imageUrl);
                };
                img.src = imageUrl;

                // Reserve space for the image
                currentX += imageSize + letterSpacing;
                console.log("Reserved space for loading image"); // Debug log
              }
            } else {
              console.warn("Unknown image keyword:", keyword); // Debug log
            }

            i = endOfTag; // Move past the closing >
            continue;
          }
          // Check for compact font color format: <fontcolor='#hexcode'>
          else if (tagContent.toLowerCase().startsWith("fontcolor=")) {
            // Extract hex color from fontcolor attribute
            const colorMatch = tagContent.match(
              /fontcolor\s*=\s*['"]([^'"]+)['"]/i,
            );
            if (colorMatch && colorMatch[1]) {
              ctx.fillStyle = colorMatch[1];
            }
          }
          // Check for closing fontcolor tag
          else if (tagContent.toLowerCase() === "/fontcolor") {
            // Reset to default color
            if (inRulesSection) {
              ctx.fillStyle = colorTable["rules"];
            } else {
              ctx.fillStyle = "white";
            }
          }
          // Check for HTML-style font color format: <font color = '#hexcode'> (fallback for non-preprocessed text)
          else if (tagContent.toLowerCase().startsWith("font color")) {
            // Extract hex color from font color attribute
            const colorMatch = tagContent.match(
              /color\s*=\s*['"]([^'"]+)['"]/i,
            );
            if (colorMatch && colorMatch[1]) {
              ctx.fillStyle = colorMatch[1];
            }
          }
          // Check for closing font tag (fallback)
          else if (tagContent.toLowerCase() === "/font") {
            // Reset to default color
            if (inRulesSection) {
              ctx.fillStyle = colorTable["rules"];
            } else {
              ctx.fillStyle = "white";
            }
          }
          // Handle existing color name format: <colorName>
          else {
            const colorValue = colorTable[tagContent];
            if (colorValue) {
              ctx.fillStyle = colorValue;
              if (tagContent === "rules") {
                ctx.font = "italic";
                inRulesSection = true;
              }
            } else {
              if (inRulesSection) {
                ctx.fillStyle = colorTable["rules"];
                ctx.font = "italic";
              } else {
                ctx.fillStyle = "white";
                inRulesSection = false;
              }
            }
          }

          i += endOfTag - i;
          continue;
        }
      }

      if (ch && ch !== "") {
        ctx.fillText(ch, currentX, y);
        currentX += Math.round(ctx.measureText(ch).width) + letterSpacing;
      }
    }

    resolve(inRulesSection);
  });
}

// Level star image cache (separate from inline icon cache)
const levelImageCache = new Map();

function loadLevelImage(url) {
  return new Promise((resolve, reject) => {
    if (levelImageCache.has(url)) {
      resolve(levelImageCache.get(url));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      levelImageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn("Failed to load level image:", url);
      reject(new Error("Failed to load: " + url));
    };
    img.src = url;
  });
}

/**
 * Draws level backplate + stars onto an existing canvas context.
 * Called between background and frame rendering so it appears under the frame.
 */
function drawLevelOnCanvas(ctx) {
  const mode = settings.levelMode;
  if (mode === "off") return Promise.resolve();

  const tier = settings.levelTier || "gold";
  const totalStars = parseInt(mode); // 2 or 3
  const filledStars = Math.min(settings.levelCurrent || 1, totalStars);

  const backplateUrl =
    levelStarBaseUrl + `levelstar_${tier}_backplate.arena_2026_s2.png`;
  const currentUrl =
    levelStarBaseUrl + `levelstar_${tier}_current.arena_2026_s2.png`;
  const inactiveUrl =
    levelStarBaseUrl + `levelstar_${tier}_inactive.arena_2026_s2.png`;

  return Promise.all([
    loadLevelImage(backplateUrl),
    loadLevelImage(currentUrl),
    loadLevelImage(inactiveUrl),
  ])
    .then(([backplate, starCurrent, starInactive]) => {
      // Draw backplate centered at configured position
      const bpScale = settings.levelBackplateScale || 1;
      const bpW = backplate.naturalWidth * bpScale;
      const bpH = backplate.naturalHeight * bpScale;
      const bpX = (settings.levelBackplateX || 256) - bpW / 2;
      const bpY = settings.levelBackplateY || 50;
      ctx.drawImage(backplate, bpX, bpY, bpW, bpH);

      // Draw stars centered on backplate
      const starScale = settings.levelStarScale || 1;
      const starW = starCurrent.naturalWidth * starScale;
      const starH = starCurrent.naturalHeight * starScale;
      const spacing = settings.levelStarSpacing || 21;
      const starOffsetY = settings.levelStarOffsetY || 0;

      // Center the star group on backplate center
      const groupWidth = (totalStars - 1) * spacing;
      const startX = (settings.levelBackplateX || 256) - groupWidth / 2;
      const starY = bpY + bpH / 2 - starH / 2 + starOffsetY;

      for (let i = 0; i < totalStars; i++) {
        const star = i < filledStars ? starCurrent : starInactive;
        const isFilled = i < filledStars;
        const drawW = isFilled ? starW : starW * 0.8;
        const drawH = isFilled ? starH : starH * 0.8;
        const sx = startX + i * spacing - drawW / 2;
        const sy = starY + (starH - drawH) / 2;
        ctx.drawImage(star, sx, sy, drawW, drawH);
      }
    })
    .catch((err) => {
      console.warn("Failed to draw level overlay:", err);
    });
}
