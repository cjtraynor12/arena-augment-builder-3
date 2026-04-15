        // ===== CALCULATION ENGINE =====
        class CalculationEngine {
            constructor() {
                // Static mappings for known placeholders
                this.staticMappings = {
                    '{{ Item_Keyword_OnHit }}': 'On-Hit'
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

                // Common calculation type descriptions
                this.calculationDescriptions = {
                    // Level-based scaling patterns
                    'level_scaling': (startValue, endValue) => `${startValue}-${endValue} (scales with level)`,

                    // Stat scaling patterns
                    'stat_scaling': (coefficient, statType) => {
                        const statNames = {
                            2: 'AD', // Attack Damage
                            5: 'AP', // Ability Power
                            6: 'Health',
                            7: 'Mana',
                            8: 'Armor',
                            9: 'Magic Resist',
                            10: 'Attack Speed',
                            11: 'Move Speed'
                        };

                        const statName = statNames[statType] || 'stat';
                        const percentage = Math.round(coefficient * 100);
                        return `${percentage}% ${statName}`;
                    },

                    // Conditional calculations
                    'conditional': (condition, trueValue, falseValue) => {
                        if (condition === 'IsRangedCastRequirement') {
                            return `${trueValue} (ranged) / ${falseValue} (melee)`;
                        }
                        return `varies by condition`;
                    },

                    // Percentage display
                    'percentage': (value) => `${Math.round(value * 100)}%`,

                    // Flat value with context
                    'flat_value': (value, context = '') => `${value}${context}`
                };
            }

            processCalculations(description, augment) {
                let processedDescription = description;

                // Handle static mappings first
                for (const [placeholder, replacement] of Object.entries(this.staticMappings)) {
                    processedDescription = processedDescription.replaceAll(placeholder, replacement);
                }

                // Handle @calculation@ placeholders
                processedDescription = this.processCalculationPlaceholders(processedDescription, augment);

                // Handle @spell.SpellName:Property@ placeholders
                processedDescription = this.processSpellPlaceholders(processedDescription, augment);

                // Handle {{ Cherry_AugmentName_Summary }} placeholders
                processedDescription = this.processSummaryPlaceholders(processedDescription, augment);

                return processedDescription;
            }

            processCalculationPlaceholders(description, augment) {
                const calculations = augment.calculations || {};

                // Find all @word@ patterns that aren't already handled by dataValues
                // Use strict pattern to only match valid variable names (alphanumeric + underscore)
                const calculationMatches = description.match(/@([A-Za-z0-9_]+)@/g);
                if (!calculationMatches) return description;

                let processedDescription = description;

                for (const match of calculationMatches) {
                    const calcName = match.slice(1, -1); // Remove @ symbols

                    // Skip if this is a dataValue (already handled elsewhere)
                    if (augment.dataValues && augment.dataValues.hasOwnProperty(calcName)) {
                        continue;
                    }

                    // Look for calculation
                    if (calculations[calcName]) {
                        const calculationResult = this.interpretCalculation(calculations[calcName]);
                        processedDescription = processedDescription.replaceAll(match, calculationResult);
                    } else {
                        // Fallback for unknown calculations
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
                    // Parse the spell reference
                    const content = match.slice(7, -1); // Remove @spell. and @
                    const parts = content.split(':');
                    const spellName = parts[0];
                    const propertyWithMultiplier = parts[1];

                    // Check for multiplier in the property
                    let property = propertyWithMultiplier;
                    let multiplier = '';
                    if (propertyWithMultiplier.includes('*')) {
                        const multiplierIndex = propertyWithMultiplier.indexOf('*');
                        property = propertyWithMultiplier.substring(0, multiplierIndex);
                        multiplier = propertyWithMultiplier.substring(multiplierIndex);
                    }

                    // Create a more descriptive replacement
                    const propertyDescription = this.spellPropertyMappings[property] || property;
                    let replacement = `[${propertyDescription}]`;

                    // Handle multipliers for better display
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
                    const content = match.slice(2, -2).trim(); // Remove {{ }}

                    // Handle known summary types
                    if (content.includes('Cherry_') && content.includes('_Summary')) {
                        const augmentName = content.replace('Cherry_', '').replace('_Summary', '');
                        processedDescription = processedDescription.replaceAll(match, `[${augmentName} effect]`);
                    } else {
                        // Keep as is for unknown patterns
                        processedDescription = processedDescription.replaceAll(match, `[${content}]`);
                    }
                }

                return processedDescription;
            }

            interpretCalculation(calculation) {
                if (!calculation || !calculation.mFormulaParts) {
                    return '[calculation]';
                }

                const parts = calculation.mFormulaParts;
                const descriptions = [];

                for (const part of parts) {
                    const partType = part.__type;

                    switch (partType) {
                        case 'ByCharLevelInterpolationCalculationPart':
                            const startValue = Math.round(part.mStartValue || 0);
                            const endValue = Math.round(part.mEndValue || 0);
                            descriptions.push(this.calculationDescriptions.level_scaling(startValue, endValue));
                            break;

                        case 'StatByCoefficientCalculationPart':
                            const coefficient = part.mCoefficient || 0;
                            const statType = part.mStat || 0;
                            descriptions.push(this.calculationDescriptions.stat_scaling(coefficient, statType));
                            break;

                        case 'EffectValueCalculationPart':
                            const value = Math.round(part.mEffectValue || 0);
                            descriptions.push(this.calculationDescriptions.flat_value(value));
                            break;

                        case 'GameCalculationConditional':
                            // Handle conditional calculations
                            const condition = part.mConditionalCalculationRequirements?.__type;
                            const trueCalc = this.interpretCalculation(part.mConditionalGameCalculation);
                            const falseCalc = this.interpretCalculation(part.mDefaultGameCalculation);
                            descriptions.push(this.calculationDescriptions.conditional(condition, trueCalc, falseCalc));
                            break;

                        default:
                            descriptions.push('[complex calculation]');
                    }
                }

                // Handle display formatting
                if (calculation.mDisplayAsPercent) {
                    return descriptions.map(desc => `${desc}%`).join(' + ');
                }

                return descriptions.join(' + ') || '[calculation]';
            }

            processDataValue(varName, multiplier, dataValues) {
                let varValue = dataValues[varName];

                if (varValue === undefined) {
                    return `[${varName}]`;
                }

                if (multiplier) {
                    // Use safer evaluation than eval
                    if (multiplier === '*100') {
                        varValue = varValue * 100;
                    } else if (multiplier === '*-100') {
                        varValue = varValue * -100;
                    } else {
                        // Try to parse the multiplier as a number
                        const multiplierValue = parseFloat(multiplier.substring(1)); // Remove the '*'
                        if (!isNaN(multiplierValue)) {
                            varValue = varValue * multiplierValue;
                        } else {
                            // Unknown multiplier format - return as-is with placeholder
                            console.warn(`Unknown multiplier format: ${multiplier} for variable ${varName}`);
                            return `[${varName}${multiplier}]`;
                        }
                    }
                }

                // Format the value nicely
                varValue = Math.fround(varValue);
                varValue = Math.floor(varValue * 100) / 100;

                return varValue.toString();
            }
        }

        // Initialize calculation engine
        const calculationEngine = new CalculationEngine();

        export { CalculationEngine, calculationEngine };
