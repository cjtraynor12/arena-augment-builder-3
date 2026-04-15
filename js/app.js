// Main Application Entry Point
import { settings, borderImages } from './state.js';
import { saveImageToDb, getImageFromDb, deleteImageFromDb, base64ToBlob, blobToBase64, saveToLocalStorage, loadFromLocalStorage } from './storage.js';
import { mergeImages, colorTable, imageCache, preloadStatIcons, setRedrawCallback } from './canvasRenderer.js';
import {
    communityDragonBaseUrl, baseSquarePortraitPath, augmentFrameBaseUrl,
    arenaJsonData, championJsonData, getAugmentData, getChampionData,
    imageKeywordMap, inlineImageUrlMap, getStatIconUrl, sanitizeKeyword, getTierKeyword,
    compareNames, populateDescriptionVariables
} from './dataManager.js';
import { itemsDataArray, arenaItemsDataArray, itemModifiersDataArray, itemIconsBaseUrl, arenaItemIconsBaseUrl, itemModifiersBaseUrl, aramMayhemAugmentsBaseUrl } from './data/items.js';
import { aram_mayhem_augments } from './data/aramAugments.js';
import { presetManager } from './presetManager.js';
import { initTimelineFetcher } from './timelineFetcher.js';
import { initMatchReference, refreshMatchReference } from './matchReference.js';

// ===== DRAG AND DROP MODULE =====
function initializeDragDrop() {
    const canvasContainer = document.getElementById('canvasContainer');
    const iconDropZone = document.getElementById('iconDropZone');
    const frameDropZone = document.getElementById('frameDropZone');

    // Prevent default drag behaviors on container and body
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        canvasContainer.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Handle drag events for both zones
    ['dragenter', 'dragover'].forEach(eventName => {
        canvasContainer.addEventListener(eventName, handleDragOver, false);
    });

    ['dragleave'].forEach(eventName => {
        canvasContainer.addEventListener(eventName, handleDragLeave, false);
    });

    canvasContainer.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragOver(e) {
    const canvasContainer = document.getElementById('canvasContainer');
    const iconDropZone = document.getElementById('iconDropZone');
    const frameDropZone = document.getElementById('frameDropZone');

    // Get mouse position relative to canvas container
    const rect = canvasContainer.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const containerHeight = rect.height;

    // Determine which zone we're in (top 50% = icon, bottom 50% = frame)
    const isInIconZone = y < containerHeight / 2;

    if (isInIconZone) {
        iconDropZone.style.display = 'flex';
        frameDropZone.style.display = 'none';
    } else {
        iconDropZone.style.display = 'none';
        frameDropZone.style.display = 'flex';
    }
}

function handleDragLeave(e) {
    // Only hide overlays if we're leaving the canvas container entirely
    const canvasContainer = document.getElementById('canvasContainer');
    const rect = canvasContainer.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    // Check if mouse is outside the container bounds
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        document.getElementById('iconDropZone').style.display = 'none';
        document.getElementById('frameDropZone').style.display = 'none';
    }
}

function handleDrop(e) {
    const canvasContainer = document.getElementById('canvasContainer');
    const rect = canvasContainer.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const containerHeight = rect.height;

    // Hide both overlays
    document.getElementById('iconDropZone').style.display = 'none';
    document.getElementById('frameDropZone').style.display = 'none';

    // Determine which zone the drop occurred in
    const isInIconZone = y < containerHeight / 2;

    const dt = e.dataTransfer;
    const files = dt.files;

    if (isInIconZone) {
        handleFiles(files, 'icon');
    } else {
        handleFiles(files, 'frame');
    }
}

function handleFiles(files, dropType) {
    ([...files]).forEach(file => handleFile(file, dropType));
}

function handleFile(file, dropType) {
    if (!file.type.startsWith('image/')) {
        alert('Please drop an image file (jpg, png, gif, webp)');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const imageDataUrl = e.target.result;
        if (dropType === 'icon') {
            setCustomImage(imageDataUrl);
        } else if (dropType === 'frame') {
            setCustomFrame(imageDataUrl);
        }
    };
    reader.readAsDataURL(file);
}

function setCustomImage(imageDataUrl) {
    settings['selectedAugment'] = null;
    settings['selectedChampion'] = null;
    settings['customImage'] = imageDataUrl;

    mergeAugmentImages();
}

function setCustomFrame(imageDataUrl) {
    settings['customFrame'] = imageDataUrl;
    settings['shinyFrame'] = false; // Custom frames are not shiny

    mergeAugmentImages();
}

// ===== TOAST NOTIFICATION SYSTEM =====
function showToast(message, isError = false) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);

    // Hide and remove toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== SCREEN MANAGEMENT =====
// Collapsible sections: lazy-init icons and colors on first open
function initCollapsibleListeners() {
    let iconsInitialized = false;
    let colorsInitialized = false;

    const iconsEl = document.getElementById('iconsCollapsible');
    if (iconsEl) {
        iconsEl.addEventListener('toggle', () => {
            if (iconsEl.open && !iconsInitialized) {
                populateIconGrid();
                iconsInitialized = true;
            }
        });
    }

    const colorsEl = document.getElementById('colorsCollapsible');
    if (colorsEl) {
        colorsEl.addEventListener('toggle', () => {
            if (colorsEl.open && !colorsInitialized) {
                populateColorTable();
                colorsInitialized = true;
            }
        });
    }
}

// ===== ICON GRID MANAGEMENT =====
function populateIconGrid() {
    const iconGrid = document.getElementById('iconGrid');
    iconGrid.innerHTML = '';

    // Create icon buttons for each stat icon
    Object.keys(imageKeywordMap).forEach(keyword => {
        const iconButton = createIconButton(keyword);
        iconGrid.appendChild(iconButton);
    });
}

function createIconButton(keyword) {
    const button = document.createElement('button');
    button.style.cssText = `
        width: 36px;
        height: 36px;
        border: 1px solid #555;
        border-radius: 4px;
        background: #3a3a3a;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;

    // Add hover effects
    button.onmouseenter = () => {
        button.style.borderColor = '#007bff';
        button.style.backgroundColor = '#4a4a4a';
        button.style.transform = 'scale(1.05)';
    };

    button.onmouseleave = () => {
        button.style.borderColor = '#555';
        button.style.backgroundColor = '#3a3a3a';
        button.style.transform = 'scale(1)';
    };

    // Use mousedown with preventDefault to avoid losing focus
    button.onmousedown = (e) => {
        e.preventDefault(); // Prevent focus loss from textarea
        insertIconAtCursor(keyword);
    };

    // Add tooltip and data attribute for search filtering
    button.title = `Insert ${keyword} icon`;
    button.dataset.keyword = keyword;

    // Create and add the icon image
    const img = document.createElement('img');
    img.src = getStatIconUrl(keyword);
    img.style.cssText = 'width: 28px; height: 28px; pointer-events: none;';
    img.alt = keyword;

    button.appendChild(img);

    return button;
}

function filterIcons(query) {
    const iconGrid = document.getElementById('iconGrid');
    const buttons = iconGrid.children;
    const lowerQuery = query.toLowerCase();

    for (const button of buttons) {
        const keyword = button.dataset.keyword || '';
        if (keyword.toLowerCase().includes(lowerQuery)) {
            button.style.display = 'flex';
        } else {
            button.style.display = 'none';
        }
    }
}

function clearIconSearch() {
    const searchInput = document.getElementById('iconSearch');
    searchInput.value = '';
    filterIcons('');
}

// ===== ACTIVE TEXT FIELD TRACKING + GHOST CURSOR =====
// Tracks which textarea (titleInput / descriptionInput) was last interacted with,
// so icon insertions land in the right place. Also paints a "ghost" caret marker
// on the active field even when focus has moved elsewhere (e.g. to the icon search).
const TEXT_FIELDS = {
    titleInput: 'augmentTitle',
    descriptionInput: 'augmentDescription'
};
let activeTextField = 'descriptionInput';

function setActiveTextField(textareaId) {
    if (!TEXT_FIELDS[textareaId]) return;
    activeTextField = textareaId;
    Object.keys(TEXT_FIELDS).forEach(id => {
        const ta = document.getElementById(id);
        if (!ta) return;
        const wrapper = ta.parentElement;
        if (wrapper && wrapper.classList.contains('text-input-wrapper')) {
            wrapper.classList.toggle('active-target', id === textareaId);
        }
    });
    updateGhostCursor(textareaId);
}

// Compute caret pixel coords by mirroring the textarea's wrapped text in a hidden div.
function updateGhostCursor(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const wrapper = textarea.parentElement;
    if (!wrapper) return;
    const mirror = wrapper.querySelector('.ghost-cursor-mirror');
    const marker = wrapper.querySelector('.ghost-cursor-marker');
    if (!mirror || !marker) return;

    const cs = window.getComputedStyle(textarea);
    const propsToCopy = [
        'boxSizing', 'width', 'height',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
        'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
        'letterSpacing', 'wordSpacing', 'tabSize'
    ];
    propsToCopy.forEach(p => { mirror.style[p] = cs[p]; });
    mirror.style.position = 'absolute';
    mirror.style.top = textarea.offsetTop + 'px';
    mirror.style.left = textarea.offsetLeft + 'px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.overflow = 'hidden';

    const pos = textarea.selectionStart;
    const value = textarea.value;
    // Use a non-breaking-space sentinel so the span has measurable bounds even at end-of-text.
    mirror.textContent = value.substring(0, pos);
    const span = document.createElement('span');
    span.textContent = value.substring(pos) || '\u200b';
    mirror.appendChild(span);

    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    marker.style.top = (textarea.offsetTop + span.offsetTop - textarea.scrollTop) + 'px';
    marker.style.left = (textarea.offsetLeft + span.offsetLeft - textarea.scrollLeft) + 'px';
    marker.style.height = lineHeight + 'px';
}

function initTextFieldTracking() {
    Object.keys(TEXT_FIELDS).forEach(id => {
        const ta = document.getElementById(id);
        if (!ta) return;
        const update = () => setActiveTextField(id);
        const refreshIfActive = () => {
            if (activeTextField === id) updateGhostCursor(id);
        };
        ta.addEventListener('focus', update);
        ta.addEventListener('click', update);
        ta.addEventListener('keyup', update);
        ta.addEventListener('select', update);
        ta.addEventListener('input', refreshIfActive);
        ta.addEventListener('scroll', refreshIfActive);
    });
    // Recalculate ghost on window resize (text wrapping may shift)
    window.addEventListener('resize', () => updateGhostCursor(activeTextField));
    setActiveTextField('descriptionInput');
}

function insertAtActiveCursor(insertText, opts = {}) {
    const textarea = document.getElementById(activeTextField);
    if (!textarea) return;
    const settingKey = TEXT_FIELDS[activeTextField];
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const newText = text.substring(0, start) + insertText + text.substring(end);
    textarea.value = newText;
    const newCursorPos = start + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    if (opts.focus !== false) textarea.focus();
    updateCanvasVariable(newText, settingKey);
    updateGhostCursor(activeTextField);
}

function insertIconAtCursor(keyword) {
    insertAtActiveCursor(`<img${keyword}>`);
}

function insertAugmentReference(name, iconUrl, tierKeyword) {
    // References get a trailing newline in the description but not in the title.
    const trailing = activeTextField === 'descriptionInput' ? '\n' : '';
    let insertText;
    if (iconUrl) {
        const keyword = sanitizeKeyword(name);
        inlineImageUrlMap[keyword] = iconUrl;
        insertText = `<img${keyword}><${tierKeyword}>${name}</${tierKeyword}>${trailing}`;
    } else {
        insertText = `<${tierKeyword}>${name}</${tierKeyword}>${trailing}`;
    }
    insertAtActiveCursor(insertText);
}

// ===== COLOR TABLE MANAGEMENT =====
let currentColorTable = { ...colorTable }; // Copy of the original color table

function loadColorTable() {
    try {
        const stored = localStorage.getItem('augmentBuilder_colorTable');
        if (stored) {
            currentColorTable = JSON.parse(stored);
            // Merge in any new default keys that don't exist in the stored table
            for (const key in colorTable) {
                if (!(key in currentColorTable)) {
                    currentColorTable[key] = colorTable[key];
                }
            }
            // Update the global colorTable reference
            Object.keys(colorTable).forEach(key => delete colorTable[key]);
            Object.assign(colorTable, currentColorTable);
        }
    } catch (e) {
        console.error('Failed to load color table:', e);
    }
}

function saveColorTable() {
    try {
        localStorage.setItem('augmentBuilder_colorTable', JSON.stringify(currentColorTable));
        // Update the global colorTable reference
        Object.keys(colorTable).forEach(key => delete colorTable[key]);
        Object.assign(colorTable, currentColorTable);
        showToast('Color table saved');
        mergeAugmentImages(); // Refresh the canvas
    } catch (e) {
        console.error('Failed to save color table:', e);
        showToast('Failed to save color table', true);
    }
}

function resetColorTable() {
    if (confirm('Reset color table to defaults? This cannot be undone.')) {
        // Reset to original color table
        currentColorTable = {
            // Damage types
            magicDamage: "#00B0F0",
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
            shield: '#70b3b4',
            status: '#b29cc0',
            keywordMajor: '#F0E6D2',
            keywordStealth: '#4B0082',

            // Speed and combat stats
            speed: '#00FF7F',
            attackSpeed: '#FF6347',
            crit: '#FFD700',
            lifeSteal: '#DC143C',
            energy: '#4169E1',

            // UI elements
            spellName: '#dad2b5',
            abilityName: '#dad2b5',
            recast: "rgb(255,143,97)",
            rules: "rgb(255, 255, 255, 0.4)",

            // Resistances (fallback colors)
            armor: "#C89B3C",
            magicresistance: "#9966CC",

            // Tier colors (for inline augment/item references)
            silver: "#B0B0B0",
            gold: "#C9AA71",
            prismatic: "#E4B4FF"
        };

        // Update global reference
        Object.keys(colorTable).forEach(key => delete colorTable[key]);
        Object.assign(colorTable, currentColorTable);

        populateColorTable();
        mergeAugmentImages();
        showToast('Color table reset to defaults');
    }
}

function populateColorTable() {
    const container = document.getElementById('colorTableEditor');
    container.innerHTML = '';

    Object.keys(currentColorTable).forEach(colorName => {
        addColorRowToDOM(colorName, currentColorTable[colorName]);
    });
}

function addColorRow() {
    const name = prompt('Enter color name:');
    if (name && name.trim()) {
        const cleanName = name.trim();
        if (currentColorTable.hasOwnProperty(cleanName)) {
            alert('Color name already exists!');
            return;
        }
        currentColorTable[cleanName] = '#FFFFFF';
        addColorRowToDOM(cleanName, '#FFFFFF');
    }
}

function addColorRowToDOM(colorName, colorValue) {
    const container = document.getElementById('colorTableEditor');
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 5px; margin-bottom: 5px; padding: 3px; border: 1px solid #ddd; border-radius: 3px;';

    row.innerHTML = `
        <input type="text" value="${colorName}" onchange="updateColorName('${colorName}', this.value)" style="flex: 1; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 11px;">
        <input type="color" value="${colorValue}" onchange="updateColorValue('${colorName}', this.value)" style="width: 30px; height: 20px; border: none; cursor: pointer;">
        <button onclick="deleteColorRow('${colorName}')" style="background: #dc3545; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">×</button>
    `;

    container.appendChild(row);
}

function updateColorName(oldName, newName) {
    if (newName && newName.trim() && newName !== oldName) {
        const cleanNewName = newName.trim();
        if (currentColorTable.hasOwnProperty(cleanNewName)) {
            alert('Color name already exists!');
            // Reset the input
            event.target.value = oldName;
            return;
        }
        currentColorTable[cleanNewName] = currentColorTable[oldName];
        delete currentColorTable[oldName];
        populateColorTable(); // Refresh the display
    }
}

function updateColorValue(colorName, newValue) {
    currentColorTable[colorName] = newValue;
}

function deleteColorRow(colorName) {
    if (confirm(`Delete color "${colorName}"?`)) {
        delete currentColorTable[colorName];
        populateColorTable(); // Refresh the display
    }
}

// ===== PRESET UI FUNCTIONS =====
function populatePresetDropdown() {
    const presetSelect = document.getElementById('presetSelect');
    const allPresets = presetManager.getAllPresets();

    presetSelect.innerHTML = '';
    allPresets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.name;
        option.textContent = preset.name;
        presetSelect.appendChild(option);
    });

    const currentPreset = presetManager.getCurrentPresetName();
    presetSelect.value = currentPreset;
}

function selectPreset(presetName) {
    if (presetManager.applyPreset(presetName, settings)) {
        syncFontUI();
        mergeAugmentImages();
    }
}

function saveNewPreset() {
    const name = prompt('Enter preset name:');
    if (name) {
        const result = presetManager.saveAsNewPreset(name, settings);
        if (result.success) {
            populatePresetDropdown();
            document.getElementById('presetSelect').value = name;
            showToast('Preset saved');
        } else {
            showToast('Error: ' + result.error, true);
        }
    }
}

function updateCurrentPreset() {
    const currentPreset = presetManager.getCurrentPresetName();
    if (currentPreset === 'Default') {
        showToast('Cannot update Default preset', true);
        return;
    }

    const result = presetManager.updatePreset(currentPreset, settings);
    if (result.success) {
        showToast('Preset updated');
    } else {
        showToast('Error: ' + result.error, true);
    }
}

function deleteCurrentPreset() {
    const currentPreset = presetManager.getCurrentPresetName();
    if (currentPreset === 'Default') {
        showToast('Cannot delete Default preset', true);
        return;
    }

    if (confirm(`Delete preset "${currentPreset}"? This cannot be undone.`)) {
        const result = presetManager.deletePreset(currentPreset);
        if (result.success) {
            populatePresetDropdown();
            selectPreset('Default');
            showToast('Preset deleted');
        } else {
            showToast('Error: ' + result.error, true);
        }
    }
}

// ===== ARAM AUGMENTS =====
let aramAugmentsData = null;

function createAramAugmentsData() {
    aramAugmentsData = Object.entries(aram_mayhem_augments).map(([filename, displayName], index) => {
        return {
            id: index + 1,
            name: displayName,
            filename: filename,
            element: null
        };
    }).sort(compareNames);
}

function createAramAugmentButton(augmentData) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", "setSelectedAramAugment('" + augmentData['filename'] + "')");

    const augmentName = document.createElement("span");
    augmentName.innerText = augmentData['name'];
    container.appendChild(augmentName);

    const image = document.createElement("img");
    image.setAttribute("src", aramMayhemAugmentsBaseUrl + augmentData['filename'] + "_large.png");
    container.appendChild(image);

    const insertBtn = document.createElement("button");
    insertBtn.innerText = "+";
    insertBtn.setAttribute("class", "insert-reference-btn");
    insertBtn.title = "Insert as inline reference";
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertAugmentReference(augmentData['name'], aramMayhemAugmentsBaseUrl + augmentData['filename'] + '_large.png', 'prismatic');
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    return container;
}

function displayAramAugments() {
    if (!aramAugmentsData) {
        createAramAugmentsData();
    }

    aramAugmentsData.map((augmentData) => {
        augmentData['element'] = createAramAugmentButton(augmentData);
        return augmentData;
    });
}

function setSelectedAramAugment(filename) {
    // Clear other selections
    settings['selectedAugment'] = null;
    settings['selectedChampion'] = null;
    settings['selectedArenaItem'] = null;
    settings['selectedItem'] = null;
    settings['customImage'] = null;

    // Set the ARAM augment image URL
    settings['selectedAramAugment'] = filename;

    // Only set the image, don't change title or description
    mergeAugmentImages();
}

// ===== MAIN APPLICATION =====
let augmentSearch = "";
let arenaAugmentSearch = "";
let aramAugmentSearch = "";
let championSearch = "";
let itemSearch = "";
let arenaItemSearch = "";
let customAugmentSearch = "";
let currentIconTab = "champions";
let currentAugmentTab = "arena";
let customAugmentsData = [];

function updateAugmentSearch(value) {
    augmentSearch = value;
    filterAugments();
}

function updateArenaAugmentSearch(value) {
    arenaAugmentSearch = value;
    filterArenaAugments();
}

function updateAramAugmentSearch(value) {
    aramAugmentSearch = value;
    filterAramAugments();
}

function updateCustomAugmentSearch(value) {
    customAugmentSearch = value;
    filterCustomAugments();
}

function updateChampionSearch(value) {
    championSearch = value;
    filterChampions();
}

function updateItemSearch(value) {
    itemSearch = value;
    filterItems();
}

function updateArenaItemSearch(value) {
    arenaItemSearch = value;
    filterArenaItems();
}

function switchAugmentTab(tab) {
    currentAugmentTab = tab;

    // Update tab button states
    document.querySelectorAll('.arena-tab').forEach(btn => btn.classList.toggle('active', tab === 'arena'));
    document.querySelectorAll('.aram-tab').forEach(btn => btn.classList.toggle('active', tab === 'aram'));
    document.querySelectorAll('.custom-tab').forEach(btn => btn.classList.toggle('active', tab === 'custom'));

    // Show/hide appropriate content
    document.getElementById('arenaAugmentsContent').style.display = tab === 'arena' ? 'block' : 'none';
    document.getElementById('aramAugmentsContent').style.display = tab === 'aram' ? 'block' : 'none';
    document.getElementById('customAugmentsContent').style.display = tab === 'custom' ? 'block' : 'none';

    // Clear search when switching tabs
    if (tab === 'arena') {
        document.getElementById('arenaAugmentSearchInput').value = '';
        updateArenaAugmentSearch('');
    } else if (tab === 'aram') {
        document.getElementById('aramAugmentSearchInput').value = '';
        updateAramAugmentSearch('');
    } else if (tab === 'custom') {
        document.getElementById('customAugmentSearchInput').value = '';
        updateCustomAugmentSearch('');
    }
}

function switchIconTab(tab) {
    currentIconTab = tab;

    // Update tab button states
    document.querySelectorAll('.champions-tab').forEach(btn => btn.classList.toggle('active', tab === 'champions'));
    document.querySelectorAll('.arena-items-tab').forEach(btn => btn.classList.toggle('active', tab === 'arenaItems'));
    document.querySelectorAll('.items-tab').forEach(btn => btn.classList.toggle('active', tab === 'items'));

    // Show/hide appropriate content
    document.getElementById('championsContent').style.display = tab === 'champions' ? 'block' : 'none';
    document.getElementById('arenaItemsContent').style.display = tab === 'arenaItems' ? 'block' : 'none';
    document.getElementById('itemsContent').style.display = tab === 'items' ? 'block' : 'none';

    // Clear search when switching tabs
    if (tab === 'champions') {
        document.getElementById('championSearchInput').value = '';
        updateChampionSearch('');
    } else if (tab === 'arenaItems') {
        document.getElementById('arenaItemSearchInput').value = '';
        updateArenaItemSearch('');
    } else {
        document.getElementById('itemSearchInput').value = '';
        updateItemSearch('');
    }
}

// ===== Font Parsing/Building =====
function parseFontString(fontStr) {
    const match = fontStr.match(/(\d+)px/);
    const size = match ? parseInt(match[1]) : 14;
    const rest = fontStr.replace(/\d+px\s*/, '').trim();
    return { size, rest };
}

function buildFontString(size, rest) {
    const keywords = ['normal', 'italic', 'oblique', 'bold', 'bolder', 'lighter', 'small-caps'];
    const words = rest.split(/\s+/);
    let prefixParts = [];
    let familyParts = [];
    let foundFamily = false;
    for (const word of words) {
        if (!foundFamily && (keywords.includes(word.toLowerCase()) || /^\d{3}$/.test(word))) {
            prefixParts.push(word);
        } else {
            foundFamily = true;
            familyParts.push(word);
        }
    }
    const prefix = prefixParts.join(' ');
    const family = familyParts.join(' ') || rest;
    return (prefix ? prefix + ' ' : '') + size + 'px ' + family;
}

function syncFontUI() {
    const titleParsed = parseFontString(settings.titleFont);
    const descParsed = parseFontString(settings.descriptionFont);

    const titleSizeSlider = document.getElementById('titleFontSize');
    const titleSizeOutput = document.querySelector('output[for="titleFontSize"]');
    const titleFamilyInput = document.getElementById('titleFontInput');

    const descSizeSlider = document.getElementById('descFontSize');
    const descSizeOutput = document.querySelector('output[for="descFontSize"]');
    const descFamilyInput = document.getElementById('descriptionFontInput');

    if (titleSizeSlider) titleSizeSlider.value = titleParsed.size;
    if (titleSizeOutput) titleSizeOutput.value = titleParsed.size;
    if (titleFamilyInput) titleFamilyInput.value = titleParsed.rest;

    if (descSizeSlider) descSizeSlider.value = descParsed.size;
    if (descSizeOutput) descSizeOutput.value = descParsed.size;
    if (descFamilyInput) descFamilyInput.value = descParsed.rest;
}

function updateTitleFontSize(newSize) {
    const parsed = parseFontString(settings.titleFont);
    settings.titleFont = buildFontString(newSize, parsed.rest);
    const output = document.querySelector('output[for="titleFontSize"]');
    if (output) output.value = newSize;
    mergeAugmentImages();
}

function updateDescFontSize(newSize) {
    const parsed = parseFontString(settings.descriptionFont);
    settings.descriptionFont = buildFontString(newSize, parsed.rest);
    const output = document.querySelector('output[for="descFontSize"]');
    if (output) output.value = newSize;
    mergeAugmentImages();
}

function updateTitleFontFamily(rest) {
    const parsed = parseFontString(settings.titleFont);
    settings.titleFont = buildFontString(parsed.size, rest);
    mergeAugmentImages();
}

function updateDescFontFamily(rest) {
    const parsed = parseFontString(settings.descriptionFont);
    settings.descriptionFont = buildFontString(parsed.size, rest);
    mergeAugmentImages();
}

function setDefaultTitleFont() {
    settings['titleFont'] = "bold 24px LolBeautfortBold";
    syncFontUI();
}

function setDefaultDescriptionFont() {
    settings['descriptionFont'] = "14px LolBeautfort";
    syncFontUI();
}

function createAugmentButton(augmentData) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", "setSelectedAugment(" + augmentData['id'] + ")");

    const augmentName = document.createElement("span");
    augmentName.innerText = augmentData['name'];
    container.appendChild(augmentName);

    const image = document.createElement("img");
    image.setAttribute("src", communityDragonBaseUrl + augmentData['iconLarge'])
    container.appendChild(image);

    const insertBtn = document.createElement("button");
    insertBtn.innerText = "+";
    insertBtn.setAttribute("class", "insert-reference-btn");
    insertBtn.title = "Insert as inline reference";
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertAugmentReference(augmentData['name'], communityDragonBaseUrl + augmentData['iconLarge'], getTierKeyword(augmentData['rarity']));
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    return container;
}

function displayAugments(data) {
    data.map((augmentData) => {
        augmentData['element'] = createAugmentButton(augmentData);
        return augmentData;
    });
}

function createChampionButton(champion) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", "setSelectedChampion(" + champion['id'] + ")");

    const championName = document.createElement("span");
    championName.innerText = champion['name'];
    container.appendChild(championName);

    const image = document.createElement("img");
    image.setAttribute("src", baseSquarePortraitPath + champion['id'] + ".png")
    container.appendChild(image);

    return container;
}

function displayChampions(data) {
    data.map((champion) => {
        champion['element'] = createChampionButton(champion);
        return champion;
    });
}

function filterAugments() {
    const augmentsList = document.getElementById("augmentsList");
    augmentsList.innerHTML = "";
    const currentArenaJsonData = arenaJsonData;
    if (currentArenaJsonData) {
        currentArenaJsonData.filter((e) => (e['name'].toLowerCase().includes(augmentSearch.toLowerCase()) > 0))
            .forEach((e) => augmentsList.appendChild(e.element));
    }
}

function filterArenaAugments() {
    const arenaAugmentsList = document.getElementById("arenaAugmentsList");
    arenaAugmentsList.innerHTML = "";
    const currentArenaJsonData = arenaJsonData;
    if (currentArenaJsonData) {
        currentArenaJsonData.filter((e) => (e['name'].toLowerCase().includes(arenaAugmentSearch.toLowerCase()) > 0))
            .forEach((e) => arenaAugmentsList.appendChild(e.element));
    }
}

function filterAramAugments() {
    const aramAugmentsList = document.getElementById("aramAugmentsList");
    aramAugmentsList.innerHTML = "";
    if (aramAugmentsData) {
        aramAugmentsData.filter((e) => (e['name'].toLowerCase().includes(aramAugmentSearch.toLowerCase()) > 0))
            .forEach((e) => aramAugmentsList.appendChild(e.element));
    }
}

function filterCustomAugments() {
    const customAugmentsList = document.getElementById("customAugmentsList");
    customAugmentsList.innerHTML = "";
    if (customAugmentsData) {
        customAugmentsData
            .filter((e) => e.augmentTitle.toLowerCase().includes(customAugmentSearch.toLowerCase()))
            .forEach((e) => {
                if (e.element) { // Ensure element exists before appending
                    customAugmentsList.appendChild(e.element);
                }
            });
    }
}

function filterChampions() {
    const championsList = document.getElementById("championsList");
    championsList.innerHTML = "";
    const currentChampionJsonData = championJsonData;
    if (currentChampionJsonData) {
        currentChampionJsonData.filter((e) => (e['name'].toLowerCase().includes(championSearch.toLowerCase()) > 0))
            .forEach((e) => championsList.appendChild(e.element));
    }
}

function setSelectedAugment(id) {
    const currentArenaJsonData = arenaJsonData;
    settings['selectedAugment'] = currentArenaJsonData.filter((e) => e['id'] === id)[0];
    settings['selectedChampion'] = null;
    settings['customImage'] = null;
    settings['customFrame'] = null;
    settings['selectedCustomAugment'] = null;

    const rarity = settings['selectedAugment']['rarity'];
    switch (rarity) {
        case 0:
            settings['selectedFrame'] = borderImages['augmentcard_frame_silver'];
            break;
        case 1:
            settings['selectedFrame'] = borderImages['augmentcard_frame_gold'];
            break;
        case 2:
            settings['selectedFrame'] = borderImages['augmentcard_frame_prismatic'];
            break;
        default:
            settings['selectedFrame'] = borderImages['augmentcard_bg'];
    }
    settings['shinyFrame'] = false;

    // Sync level tier to match the augment's rarity
    settings['levelTier'] = getTierKeyword(rarity);
    syncLevelButtonGroup('levelTier', settings['levelTier']);

    settings['augmentTitle'] = settings['selectedAugment']['name'];
    document.getElementById('titleInput').value = settings['augmentTitle'];
    settings['augmentDescription'] = populateDescriptionVariables(settings['selectedAugment']);
    document.getElementById('descriptionInput').value = settings['augmentDescription'];

    mergeAugmentImages();
}

function setSelectedChampion(id) {
    const currentChampionJsonData = championJsonData;
    settings['selectedChampion'] = currentChampionJsonData.filter((e) => e['id'] === id)[0];
    settings['selectedAugment'] = null;
    settings['selectedItem'] = null;
    settings['customImage'] = null;
    settings['selectedCustomAugment'] = null;
    mergeAugmentImages();
}

async function createCustomAugmentButton(augmentData, index) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", `setSelectedCustomAugment(${index})`);

    const augmentName = document.createElement("span");
    augmentName.innerText = augmentData.augmentTitle;
    container.appendChild(augmentName);

    const image = document.createElement("img");
    let iconImage;

    if (augmentData.imageId) {
        try {
            const imageBlob = await getImageFromDb(augmentData.imageId);
            if (imageBlob) {
                iconImage = await blobToBase64(imageBlob);
            }
        } catch (error) {
            console.error('Failed to load image from IndexedDB:', error);
        }
    } else if (augmentData.customImage) {
        // Fallback for older augments still using base64 in localStorage
        iconImage = augmentData.customImage;
    } else if (augmentData.selectedAugment) {
        iconImage = communityDragonBaseUrl + augmentData.selectedAugment.iconLarge;
    } else if (augmentData.selectedChampion) {
        iconImage = baseSquarePortraitPath + augmentData.selectedChampion.id + ".png";
    } else if (augmentData.selectedArenaItem) {
        iconImage = arenaItemIconsBaseUrl + augmentData.selectedArenaItem.filename;
    } else if (augmentData.selectedItem) {
        iconImage = itemIconsBaseUrl + augmentData.selectedItem.filename;
    } else if (augmentData.selectedAramAugment) {
        iconImage = aramMayhemAugmentsBaseUrl + augmentData.selectedAramAugment + "_large.png";
    }

    if (iconImage) {
        image.setAttribute("src", iconImage);
    }
    container.appendChild(image);

    const insertBtn = document.createElement("button");
    insertBtn.innerText = "+";
    insertBtn.setAttribute("class", "insert-reference-btn");
    insertBtn.title = "Insert as inline reference";
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        let refIconUrl = '';
        if (augmentData.selectedAugment) {
            refIconUrl = communityDragonBaseUrl + augmentData.selectedAugment.iconLarge;
        } else if (augmentData.selectedArenaItem) {
            refIconUrl = arenaItemIconsBaseUrl + augmentData.selectedArenaItem.filename;
        } else if (augmentData.selectedItem) {
            refIconUrl = itemIconsBaseUrl + augmentData.selectedItem.filename;
        } else if (augmentData.selectedAramAugment) {
            refIconUrl = aramMayhemAugmentsBaseUrl + augmentData.selectedAramAugment + '_large.png';
        }
        let tierColor = 'gold';
        const frame = augmentData.selectedFrame || '';
        if (frame.includes('prismatic')) tierColor = 'prismatic';
        else if (frame.includes('silver')) tierColor = 'silver';
        insertAugmentReference(augmentData.augmentTitle, refIconUrl, tierColor);
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    const deleteButton = document.createElement("button");
    deleteButton.innerText = "🗑️";
    deleteButton.setAttribute("class", "delete-custom-augment");
    deleteButton.setAttribute("onclick", `event.stopPropagation(); deleteCustomAugment(${index})`);
    container.appendChild(deleteButton);

    return container;
}

async function displayCustomAugments() {
    customAugmentsData = loadFromLocalStorage('customAugments', []);

    for (let i = 0; i < customAugmentsData.length; i++) {
        const augmentData = customAugmentsData[i];
        // Only create the element, don't append it here
        augmentData.element = await createCustomAugmentButton(augmentData, i);
    }
}

async function setSelectedCustomAugment(index) {
    const selected = customAugmentsData[index];

    // Reset settings before applying new ones
    settings['customImage'] = null;

    // Apply all settings from the selected augment
    Object.keys(selected).forEach(key => {
        settings[key] = selected[key];
    });

    // Handle loading image from IndexedDB
    if (selected.imageId) {
        try {
            const imageBlob = await getImageFromDb(selected.imageId);
            if (imageBlob) {
                settings.customImage = await blobToBase64(imageBlob);
            }
        } catch (error) {
            console.error('Failed to load image for selected augment:', error);
        }
    }

    // Update UI elements
    document.getElementById('titleInput').value = settings.augmentTitle;
    document.getElementById('descriptionInput').value = settings.augmentDescription;
    syncFontUI();
    document.getElementById('iconXOffset').value = settings.iconXOffset;
    document.getElementById('iconYOffset').value = settings.iconYOffset;
    document.getElementById('iconSize').value = settings.iconSize;
    document.getElementById('titleYOffset').value = settings.titleYOffset;
    document.getElementById('descriptionYOffset').value = settings.descriptionYOffset;
    document.getElementById('descriptionXOffset').value = settings.descriptionXOffset;
    document.getElementById('titleLineHeight').value = settings.titleLineHeight;
    document.getElementById('descriptionLineHeight').value = settings.descriptionLineHeight;
    document.getElementById('customFrame').value = settings.selectedFrame.replace('.png', '');
    document.getElementById('languageSelect').value = settings.language;
    document.getElementById('itemModifierSelect').value = settings.selectedModifier;

    // Update slider outputs
    document.querySelector('output[for="iconXOffset"]').value = settings.iconXOffset;
    document.querySelector('output[for="iconSize"]').value = settings.iconSize;
    document.querySelector('output[for="titleLineHeight"]').value = settings.titleLineHeight;
    document.querySelector('output[for="descriptionLineHeight"]').value = settings.descriptionLineHeight;
    document.querySelector('output[for="descriptionXOffset"]').value = settings.descriptionXOffset;

    mergeAugmentImages();
}

async function saveCustomAugment() {
    if (!settings.augmentTitle) {
        showToast("Title cannot be empty.", true);
        return;
    }

    let customAugments = loadFromLocalStorage('customAugments', []);
    const newAugment = { ...settings };

    // Handle custom image saving to IndexedDB
    if (newAugment.customImage && newAugment.customImage.startsWith('data:image')) {
        try {
            const imageId = `custom_augment_${Date.now()}`;
            const imageBlob = base64ToBlob(newAugment.customImage);
            await saveImageToDb(imageId, imageBlob);

            newAugment.imageId = imageId; // Store reference to the image
            delete newAugment.customImage; // Remove base64 from localStorage

        } catch (error) {
            console.error('Failed to save image to IndexedDB:', error);
            showToast('Error saving custom image.', true);
            return; // Stop if image saving fails
        }
    }

    // We don't want to save the element in the settings
    delete newAugment.element;

    customAugments.push(newAugment);
    saveToLocalStorage('customAugments', customAugments);

    // Refresh the display
    await displayCustomAugments();
    filterCustomAugments();

    showToast("Augment saved!");
}

async function deleteCustomAugment(index) {
    if (confirm("Are you sure you want to delete this augment?")) {
        let customAugments = loadFromLocalStorage('customAugments', []);
        const augmentToDelete = customAugments[index];

        // If the augment has an image in IndexedDB, delete it
        if (augmentToDelete && augmentToDelete.imageId) {
            try {
                await deleteImageFromDb(augmentToDelete.imageId);
            } catch (error) {
                console.error('Failed to delete image from IndexedDB:', error);
                // We can still proceed with deleting the augment from localStorage
            }
        }

        customAugments.splice(index, 1);
        saveToLocalStorage('customAugments', customAugments);

        await displayCustomAugments();
        filterCustomAugments();

        showToast("Augment deleted.");
    }
}

function createItemButton(item) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", "setSelectedItem(" + item['id'] + ")");

    const itemName = document.createElement("span");
    itemName.innerText = item['name'];
    container.appendChild(itemName);

    const image = document.createElement("img");
    image.setAttribute("src", itemIconsBaseUrl + item['filename']);
    container.appendChild(image);

    const insertBtn = document.createElement("button");
    insertBtn.innerText = "+";
    insertBtn.setAttribute("class", "insert-reference-btn");
    insertBtn.title = "Insert as inline reference";
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertAugmentReference(item['name'], itemIconsBaseUrl + item['filename'], 'gold');
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    return container;
}

function displayItems(data) {
    data.map((item) => {
        item['element'] = createItemButton(item);
        return item;
    });
}

function filterItems() {
    const itemsList = document.getElementById("itemsList");
    itemsList.innerHTML = "";
    const itemsData = itemsDataArray.sort(compareNames);
    if (itemsData) {
        itemsData.filter((e) => (e['name'].toLowerCase().includes(itemSearch.toLowerCase()) > 0))
            .forEach((e) => itemsList.appendChild(e.element));
    }
}

function setSelectedItem(id) {
    settings['selectedItem'] = itemsDataArray.filter((e) => e['id'] === id)[0];
    settings['selectedAugment'] = null;
    settings['selectedChampion'] = null;
    settings['selectedArenaItem'] = null;
    settings['customImage'] = null;
    settings['selectedCustomAugment'] = null;
    settings['augmentTitle'] = settings['selectedItem'].name;
    document.getElementById('titleInput').value = settings['augmentTitle'];

    mergeAugmentImages();
}

function createArenaItemButton(item) {
    const container = document.createElement("div");
    container.setAttribute("class", "augmentButton");
    container.setAttribute("onclick", "setSelectedArenaItem(" + item['id'] + ")");

    const itemName = document.createElement("span");
    itemName.innerText = item['name'];
    container.appendChild(itemName);

    const image = document.createElement("img");
    image.setAttribute("src", arenaItemIconsBaseUrl + item['filename']);
    container.appendChild(image);

    const insertBtn = document.createElement("button");
    insertBtn.innerText = "+";
    insertBtn.setAttribute("class", "insert-reference-btn");
    insertBtn.title = "Insert as inline reference";
    insertBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertAugmentReference(item['name'], arenaItemIconsBaseUrl + item['filename'], getTierKeyword(null, item['preferredFrame']));
    };
    insertBtn.onclick = (e) => e.stopPropagation();
    container.appendChild(insertBtn);

    return container;
}

function displayArenaItems(data) {
    data.map((item) => {
        item['element'] = createArenaItemButton(item);
        return item;
    });
}

function filterArenaItems() {
    const arenaItemsList = document.getElementById("arenaItemsList");
    arenaItemsList.innerHTML = "";
    const arenaItemsData = arenaItemsDataArray.sort(compareNames);
    if (arenaItemsData) {
        arenaItemsData.filter((e) => (e['name'].toLowerCase().includes(arenaItemSearch.toLowerCase()) > 0))
            .forEach((e) => arenaItemsList.appendChild(e.element));
    }
}

function setSelectedArenaItem(id) {
    settings['selectedArenaItem'] = arenaItemsDataArray.filter((e) => e['id'] === id)[0];
    settings['selectedAugment'] = null;
    settings['selectedChampion'] = null;
    settings['selectedItem'] = null;
    settings['customImage'] = null;
    settings['selectedCustomAugment'] = null;

    // Set the title
    settings['augmentTitle'] = settings['selectedArenaItem'].name;
    document.getElementById('titleInput').value = settings['augmentTitle'];

    // Set the description using fetched data
    let description = '';
    if (settings['selectedArenaItem'].description) {
        description = settings['selectedArenaItem'].description;
    } else if (settings['selectedArenaItem'].brief) {
        // Use brief as fallback if no main description
    }

    // Process the description to convert %i:keyword% patterns to <imgkeyword> tags
    const tempItem = { desc: description, dataValues: {} };
    const processedDescription = populateDescriptionVariables(tempItem);

    settings['augmentDescription'] = processedDescription;
    document.getElementById('descriptionInput').value = settings['augmentDescription'];

    // Apply preferred frame based on item code type
    if (settings['selectedArenaItem'].preferredFrame) {
        settings['selectedFrame'] = borderImages[settings['selectedArenaItem'].preferredFrame];
        settings['shinyFrame'] = false;
    }

    mergeAugmentImages();
}

function updateModifierVariable(value) {
    settings['selectedModifier'] = parseInt(value);
    mergeAugmentImages();
}

function populateModifierDropdown() {
    const modifierSelect = document.getElementById('itemModifierSelect');

    modifierSelect.innerHTML = '';
    itemModifiersDataArray.forEach(modifier => {
        const option = document.createElement('option');
        option.value = modifier.id;
        option.textContent = modifier.name;
        modifierSelect.appendChild(option);
    });
}

function mergeAugmentImages() {
    let iconImage;

    if (settings['customImage']) {
        iconImage = settings['customImage'];
    } else if (settings['selectedAugment'] !== null) {
        iconImage = communityDragonBaseUrl + settings['selectedAugment']['iconLarge'];
    } else if (settings['selectedChampion'] !== null) {
        iconImage = baseSquarePortraitPath + settings['selectedChampion']['id'] + ".png";
    } else if (settings['selectedArenaItem'] !== null) {
        iconImage = arenaItemIconsBaseUrl + settings['selectedArenaItem']['filename'];
    } else if (settings['selectedItem'] !== null) {
        iconImage = itemIconsBaseUrl + settings['selectedItem']['filename'];
    } else if (settings['selectedAramAugment'] !== null) {
        iconImage = aramMayhemAugmentsBaseUrl + settings['selectedAramAugment'] + "_large.png";
    } else {
        return;
    }

    // Calculate centered positioning based on icon size
    const defaultSize = 150;
    const currentSize = parseInt(settings['iconSize']);
    const sizeDifference = (currentSize - defaultSize) / 2;

    const modifiedXOffset = parseInt(settings['iconXOffset']) + 25 - sizeDifference;
    const modifiedYOffset = parseInt(settings['iconYOffset']) + 10 - sizeDifference;
    const imagePositionOffsets = {2:[modifiedXOffset, modifiedYOffset]};

    // Determine frame image to use (custom or preset)
    let frameImage;
    if (settings['customFrame']) {
        frameImage = settings['customFrame'];
    } else {
        frameImage = augmentFrameBaseUrl + settings['selectedFrame'];
    }

    const images = [
        augmentFrameBaseUrl + settings['selectedBackground'],
        frameImage,
        iconImage
    ];

    // Add modifier overlay if selected
    if (settings['selectedModifier'] && settings['selectedModifier'] !== 0) {
        const modifier = itemModifiersDataArray.find(m => m.id === settings['selectedModifier']);

        if (modifier.id === 9) {
            images.push('images/gold_item_modifier.png');
        } else if (modifier.id === 10) {
            images.push('images/prismatic_item_modifier.png');
        } else if (modifier && modifier.filename) {
            const modifierUrl = itemModifiersBaseUrl + modifier.filename;
            images.push(modifierUrl);
        }
        imagePositionOffsets[3] = [modifiedXOffset, modifiedYOffset];
    }

    mergeImages(images, {}, imagePositionOffsets, settings['augmentTitle'], settings['augmentDescription'], settings['iconSize'])
        .then(b64 => document.getElementById('imageOutput').src = b64);
}

function updateCanvasVariable(value, variable) {
    settings[variable] = value;
    const slider = document.getElementById(variable);
    if (slider) {
        const output = slider.nextElementSibling;
        if (output && output.tagName === 'OUTPUT') {
            output.value = value;
        }
    }
    mergeAugmentImages();
}

function updateFrameVariable(value) {
    settings['selectedFrame'] = borderImages[value];
    settings['shinyFrame'] = value.includes("sheenglow");
    settings['customFrame'] = null; // Clear custom frame when preset is selected
    mergeAugmentImages();
}

function changeBackground(value) {
    settings['selectedBackground'] = value;
    mergeAugmentImages();
}

function updateLevelSetting(key, value) {
    settings[key] = value;
    const el = document.getElementById(key);
    if (el) {
        const output = el.nextElementSibling;
        if (output && output.tagName === 'OUTPUT') {
            output.value = value;
        }
    }
    syncLevelButtonGroup(key, value);
    mergeAugmentImages();
}

function syncLevelButtonGroup(key, value) {
    const group = document.getElementById(key + 'Group');
    if (!group) return;
    group.querySelectorAll('.btn-toggle').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === String(value));
    });
}

function clearCustomFrame() {
    settings['customFrame'] = null;
    mergeAugmentImages();
}

async function setLanguage(value) {
    settings['language'] = value;
    await getAugmentData(value);
    if (settings['selectedAugment']) {
        setSelectedAugment(settings['selectedAugment']['id']);
    }

    const augmentsList = document.getElementById("augmentsList");
    augmentsList.innerHTML = "";
    const currentArenaJsonData = arenaJsonData;
    displayAugments(currentArenaJsonData);
    filterAugments();

    mergeAugmentImages();
}

async function getArenaJson() {
    await getAugmentData();
    setSelectedAugment(1);
    const currentArenaJsonData = arenaJsonData;
    displayAugments(currentArenaJsonData);
    filterArenaAugments();
}

async function getChampionJson() {
    await getChampionData();
    const currentChampionJsonData = championJsonData;
    displayChampions(currentChampionJsonData);
    filterChampions();
}

// Extract numeric code from item filename
function extractItemCode(filename) {
    const match = filename.match(/^(\d+)_/);
    if (!match) return null;
    return match[1];
}

// Fetch arena item descriptions from stringtable and enhance arena items data
async function fetchArenaItemDescriptions() {
    const stringtableUrl = "https://raw.communitydragon.org/pbe/game/en_us/data/menu/en_us/lol.stringtable.json";

    try {
        console.log("Fetching arena item descriptions from stringtable...");
        const response = await fetch(stringtableUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const entries = data.entries || {};

        // Step 1: Build name-to-codes mapping from stringtable
        console.log("Building name-to-codes mapping...");
        const nameToCodesMap = {};

        // Extract all item_ANYNUMBER_name entries
        Object.keys(entries).forEach(key => {
            const nameMatch = key.match(/^item_(\d+)_name$/);
            if (nameMatch) {
                const code = nameMatch[1];
                const itemName = entries[key];

                if (!nameToCodesMap[itemName]) {
                    nameToCodesMap[itemName] = [];
                }
                nameToCodesMap[itemName].push(code);
            }
        });

        console.log(entries["generatedtip_item_447109_externaldescription"]);

        console.log(`Found ${Object.keys(nameToCodesMap).length} unique item names in stringtable`);

        // Step 2: Process each arena item with smart code selection
        let foundDescriptions = 0;
        let foundBriefs = 0;
        let foundNames = 0;
        let notFoundItems = [];

        arenaItemsDataArray.forEach(item => {
            // Extract original code from filename for fallback
            const originalCode = extractItemCode(item.filename);
            item.originalCode = originalCode;

            // Try to find the item by name in stringtable
            const possibleCodes = nameToCodesMap[item.name] || [];

            let selectedCode = null;
            let selectedCodeType = 'none';

            if (possibleCodes.length > 0) {
                // Step 3: Smart code selection with priority
                const arena22Codes = possibleCodes.filter(code => code.startsWith('22'));
                const arena44Codes = possibleCodes.filter(code => code.startsWith('44'));
                const otherCodes = possibleCodes.filter(code => !code.startsWith('22') && !code.startsWith('44'));

                const selectBestCode = (codes, type) => {
                    if (codes.length === 0) return null;

                    const codesWithSummary = codes.filter(code => entries[`item_${code}_summary`]);
                    if (codesWithSummary.length > 0) {
                        selectedCodeType = type + '-with-summary';
                        return codesWithSummary[0];
                    }

                    selectedCodeType = type;
                    return codes[0];
                };

                selectedCode = selectBestCode(arena22Codes, '22xxx') ||
                             selectBestCode(arena44Codes, '44xxx') ||
                             selectBestCode(otherCodes, 'other');
            }

            // Fallback: try original code from filename if no name match found
            if (!selectedCode && originalCode) {
                const fallbackCodes = [`22${originalCode}`, `44${originalCode}`, originalCode];
                for (const code of fallbackCodes) {
                    if (entries[`item_${code}_name`]) {
                        selectedCode = code;
                        selectedCodeType = 'fallback-' + (code.startsWith('22') ? '22xxx' : code.startsWith('44') ? '44xxx' : 'original');
                        break;
                    }
                }
            }

            // Step 4: Populate item data if we found a valid code
            if (selectedCode) {
                item.code = selectedCode;
                item.selectedCodeType = selectedCodeType;

                if (selectedCode.startsWith('22')) {
                    item.preferredFrame = 'augmentcard_frame_gold';
                } else if (selectedCode.startsWith('44')) {
                    item.preferredFrame = 'augmentcard_frame_prismatic';
                } else {
                    item.preferredFrame = 'augmentcard_frame_gold';
                }

                const nameKey = `item_${selectedCode}_name`;
                if (entries[nameKey]) {
                    item.name = entries[nameKey];
                    foundNames++;
                }

                const externalDescKey = `generatedtip_item_${selectedCode}_externaldescription`;
                const summaryKey = `item_${selectedCode}_summary`;

                let finalDescription = '';

                if (entries[externalDescKey]) {
                    const externalDesc = entries[externalDescKey];
                    const statsMatch = externalDesc.match(/<stats>(.*?)<\/stats>/s);

                    if (statsMatch) {
                        let statsBlock = statsMatch[1];
                        statsBlock = statsBlock.replace(/<br\s*\/?>/gi, ' ');
                        statsBlock = statsBlock.replace(/\n/g, ' ');
                        statsBlock = statsBlock.replace(/\s+/g, ' ');
                        statsBlock = statsBlock.trim();

                        const summaryText = entries[summaryKey] || '';

                        if (summaryText) {
                            finalDescription = statsBlock + '\n\n' + summaryText;
                        } else {
                            finalDescription = statsBlock;
                        }
                    } else {
                        finalDescription = externalDesc;
                    }

                    item.description = finalDescription;
                    foundDescriptions++;
                } else {
                    if (entries[summaryKey]) {
                        item.description = entries[summaryKey];
                        foundDescriptions++;
                    }
                }

                const briefKey = `item_${selectedCode}_brief`;
                if (entries[briefKey]) {
                    item.brief = entries[briefKey];
                    foundBriefs++;
                }

            } else {
                notFoundItems.push(item.name);
                item.code = originalCode;
                item.selectedCodeType = 'not-found';
                item.preferredFrame = 'augmentcard_frame_gold';
            }
        });

        console.log(`Arena item descriptions loaded: ${foundNames} names, ${foundDescriptions} descriptions, ${foundBriefs} briefs found out of ${arenaItemsDataArray.length} arena items`);

        if (notFoundItems.length > 0) {
            console.warn(`Items not found in stringtable (${notFoundItems.length}):`, notFoundItems);
        }

        return {
            totalItems: arenaItemsDataArray.length,
            itemsWithCodes: arenaItemsDataArray.filter(item => item.code).length,
            namesFound: foundNames,
            descriptionsFound: foundDescriptions,
            briefsFound: foundBriefs,
            notFoundItems: notFoundItems
        };

    } catch (error) {
        console.error("Error fetching arena item descriptions:", error);

        arenaItemsDataArray.forEach(item => {
            const code = extractItemCode(item.filename);
            item.originalCode = code;
            item.code = code;
            item.selectedCodeType = 'error-fallback';
        });

        return {
            error: error.message,
            totalItems: arenaItemsDataArray.length,
            itemsWithCodes: arenaItemsDataArray.filter(item => item.code).length,
            namesFound: 0,
            descriptionsFound: 0,
            briefsFound: 0,
            notFoundItems: []
        };
    }
}

// ===== INITIALIZATION =====
async function init() {
    console.log("Starting index html")

    // Set the redraw callback for canvasRenderer
    setRedrawCallback(mergeAugmentImages);

    initializeDragDrop();
    initCollapsibleListeners();
    initTextFieldTracking();
    initTimelineFetcher();
    initMatchReference();

    // Initialize color table
    loadColorTable();

    // Initialize preset system
    populatePresetDropdown();

    // Initialize items and modifiers
    displayItems(itemsDataArray);
    filterItems();
    displayArenaItems(arenaItemsDataArray);
    filterArenaItems();
    populateModifierDropdown();

    // Await the creation of custom augment elements
    await displayCustomAugments();
    filterCustomAugments();

    // Initialize ARAM augments
    displayAramAugments();
    filterAramAugments();

    // Preload stat icons for inline images
    preloadStatIcons();

    // Load current preset instead of individual settings
    const currentPresetName = presetManager.getCurrentPresetName();
    presetManager.applyPreset(currentPresetName, settings);
    syncFontUI();

    let p1 = getArenaJson();
    let p2 = getChampionJson();

    // Fetch arena item descriptions
    let p3 = fetchArenaItemDescriptions();

    Promise.all([p1, p2, p3]).then(() => {
        console.log("All data loaded successfully");
        // Apply saved language setting after data is loaded
        const savedLanguage = loadFromLocalStorage('language', 'en_us');
        if (savedLanguage !== 'en_us') {
            setLanguage(savedLanguage);
        } else {
            mergeAugmentImages();
        }
        // Arena + champion data is what Match Reference needs to resolve
        // augment IDs and champion portraits; refresh once both are available.
        refreshMatchReference();
    });
}

// ===== EXPOSE FUNCTIONS TO WINDOW FOR INLINE HTML HANDLERS =====
// These are needed because <script type="module"> runs in its own scope,
// but HTML onclick/oninput/onchange attributes reference global functions.
window.updateArenaAugmentSearch = updateArenaAugmentSearch;
window.updateAramAugmentSearch = updateAramAugmentSearch;
window.updateCustomAugmentSearch = updateCustomAugmentSearch;
window.updateChampionSearch = updateChampionSearch;
window.updateItemSearch = updateItemSearch;
window.updateArenaItemSearch = updateArenaItemSearch;
window.switchAugmentTab = switchAugmentTab;
window.switchIconTab = switchIconTab;
window.filterIcons = filterIcons;
window.clearIconSearch = clearIconSearch;
window.updateCanvasVariable = updateCanvasVariable;
window.updateTitleFontSize = updateTitleFontSize;
window.updateDescFontSize = updateDescFontSize;
window.updateTitleFontFamily = updateTitleFontFamily;
window.updateDescFontFamily = updateDescFontFamily;
window.updateFrameVariable = updateFrameVariable;
window.updateModifierVariable = updateModifierVariable;
window.clearCustomFrame = clearCustomFrame;
window.changeBackground = changeBackground;
window.updateLevelSetting = updateLevelSetting;
window.setLanguage = setLanguage;
window.selectPreset = selectPreset;
window.saveNewPreset = saveNewPreset;
window.updateCurrentPreset = updateCurrentPreset;
window.deleteCurrentPreset = deleteCurrentPreset;
window.saveCustomAugment = saveCustomAugment;
window.addColorRow = addColorRow;
window.saveColorTable = saveColorTable;
window.resetColorTable = resetColorTable;
window.updateColorValue = updateColorValue;
window.updateColorName = updateColorName;
window.deleteColorRow = deleteColorRow;
// Functions used by dynamically created elements (setAttribute onclick)
window.insertAugmentReference = insertAugmentReference;
window.setSelectedAugment = setSelectedAugment;
window.setSelectedChampion = setSelectedChampion;
window.setSelectedItem = setSelectedItem;
window.setSelectedArenaItem = setSelectedArenaItem;
window.setSelectedAramAugment = setSelectedAramAugment;
window.setSelectedCustomAugment = setSelectedCustomAugment;
window.deleteCustomAugment = deleteCustomAugment;

// Start the application
init();
