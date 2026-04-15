// Preset Management Module

export const DEFAULT_PRESET = {
    name: "Default",
    settings: {
        titleFont: "24px LolBeautfortBold",
        descriptionFont: "14px LolBeautfort",
        iconYOffset: 40,
        titleYOffset: 324,
        descriptionYOffset: 364,
        descriptionXOffset: 256,
        iconXOffset: 156,
        iconSize: 150,
        titleLineHeight: 26,
        descriptionLineHeight: 18,
        letterSpacing: 0.5,
        titleMaxWidth: 220,
        descriptionMaxWidth: 220
    }
};

export class PresetManager {
    constructor() {
        this.currentPresetName = 'Default';
    }

    getAllPresets() {
        const customPresets = this.getCustomPresets();
        return [DEFAULT_PRESET, ...customPresets];
    }

    getCustomPresets() {
        try {
            const stored = localStorage.getItem('augmentBuilder_presets');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to load presets:', e);
            return [];
        }
    }

    saveCustomPresets(presets) {
        try {
            localStorage.setItem('augmentBuilder_presets', JSON.stringify(presets));
            return true;
        } catch (e) {
            console.error('Failed to save presets:', e);
            return false;
        }
    }

    getCurrentPresetName() {
        try {
            const stored = localStorage.getItem('augmentBuilder_currentPreset');
            return stored || 'Default';
        } catch (e) {
            return 'Default';
        }
    }

    setCurrentPresetName(name) {
        try {
            localStorage.setItem('augmentBuilder_currentPreset', name);
            this.currentPresetName = name;
        } catch (e) {
            console.error('Failed to save current preset:', e);
        }
    }

    getPresetByName(name) {
        const allPresets = this.getAllPresets();
        return allPresets.find(preset => preset.name === name);
    }

    saveAsNewPreset(name, currentSettings) {
        if (!name || name.trim() === '') {
            return { success: false, error: 'Preset name cannot be empty' };
        }

        if (name === 'Default') {
            return { success: false, error: 'Cannot use "Default" as preset name' };
        }

        const customPresets = this.getCustomPresets();

        if (customPresets.some(preset => preset.name === name)) {
            return { success: false, error: 'Preset name already exists' };
        }

        const newPreset = {
            name: name,
            settings: {
                titleFont: currentSettings.titleFont,
                descriptionFont: currentSettings.descriptionFont,
                iconYOffset: currentSettings.iconYOffset,
                titleYOffset: currentSettings.titleYOffset,
                descriptionYOffset: currentSettings.descriptionYOffset,
                descriptionXOffset: currentSettings.descriptionXOffset || 256,
                iconXOffset: currentSettings.iconXOffset,
                iconSize: currentSettings.iconSize,
                titleLineHeight: currentSettings.titleLineHeight,
                descriptionLineHeight: currentSettings.descriptionLineHeight,
                letterSpacing: currentSettings.letterSpacing || 0.5,
                titleMaxWidth: currentSettings.titleMaxWidth || 220,
                descriptionMaxWidth: currentSettings.descriptionMaxWidth || 220
            }
        };

        customPresets.push(newPreset);

        if (this.saveCustomPresets(customPresets)) {
            this.setCurrentPresetName(name);
            return { success: true };
        } else {
            return { success: false, error: 'Failed to save preset' };
        }
    }

    updatePreset(name, currentSettings) {
        if (name === 'Default') {
            return { success: false, error: 'Cannot update Default preset' };
        }

        const customPresets = this.getCustomPresets();
        const presetIndex = customPresets.findIndex(preset => preset.name === name);

        if (presetIndex === -1) {
            return { success: false, error: 'Preset not found' };
        }

        customPresets[presetIndex].settings = {
            titleFont: currentSettings.titleFont,
            descriptionFont: currentSettings.descriptionFont,
            iconYOffset: currentSettings.iconYOffset,
            titleYOffset: currentSettings.titleYOffset,
            descriptionYOffset: currentSettings.descriptionYOffset,
            descriptionXOffset: currentSettings.descriptionXOffset || 256,
            iconXOffset: currentSettings.iconXOffset,
            iconSize: currentSettings.iconSize,
            titleLineHeight: currentSettings.titleLineHeight,
            descriptionLineHeight: currentSettings.descriptionLineHeight,
            letterSpacing: currentSettings.letterSpacing || 0.5,
            titleMaxWidth: currentSettings.titleMaxWidth || 220,
            descriptionMaxWidth: currentSettings.descriptionMaxWidth || 220
        };

        if (this.saveCustomPresets(customPresets)) {
            return { success: true };
        } else {
            return { success: false, error: 'Failed to update preset' };
        }
    }

    deletePreset(name) {
        if (name === 'Default') {
            return { success: false, error: 'Cannot delete Default preset' };
        }

        const customPresets = this.getCustomPresets();
        const filteredPresets = customPresets.filter(preset => preset.name !== name);

        if (filteredPresets.length === customPresets.length) {
            return { success: false, error: 'Preset not found' };
        }

        if (this.saveCustomPresets(filteredPresets)) {
            if (this.getCurrentPresetName() === name) {
                this.setCurrentPresetName('Default');
            }
            return { success: true };
        } else {
            return { success: false, error: 'Failed to delete preset' };
        }
    }

    applyPreset(presetName, settingsObject) {
        const preset = this.getPresetByName(presetName);
        if (!preset) {
            console.error('Preset not found:', presetName);
            return false;
        }

        Object.keys(preset.settings).forEach(key => {
            settingsObject[key] = preset.settings[key];
        });

        this.updateUIFromSettings(preset.settings);
        this.setCurrentPresetName(presetName);

        return true;
    }

    updateUIFromSettings(settings) {
        // Font UI is synced by syncFontUI() called from selectPreset in app.js

        const sliderMappings = {
            iconYOffset: 'iconYOffset',
            titleYOffset: 'titleYOffset',
            descriptionYOffset: 'descriptionYOffset',
            descriptionXOffset: 'descriptionXOffset',
            iconXOffset: 'iconXOffset',
            iconSize: 'iconSize',
            titleLineHeight: 'titleLineHeight',
            descriptionLineHeight: 'descriptionLineHeight'
        };

        Object.keys(sliderMappings).forEach(settingKey => {
            const slider = document.getElementById(sliderMappings[settingKey]);
            if (slider) {
                slider.value = settings[settingKey];

                const output = document.querySelector(`output[for="${sliderMappings[settingKey]}"]`);
                if (output) {
                    output.value = settings[settingKey];
                }
            }
        });
    }
}

export const presetManager = new PresetManager();
