// CodeMirror-backed editor wrapper for the Title and Description fields.
//
// Replaces the two plain <textarea>s with a CodeMirror 6 editor so we get:
//   - HTML-ish syntax highlighting for the Arena description DSL
//     (<imgkeyword>, <gold>, <silver>, <prismatic>, <br>, <color>…)
//   - Autocomplete that suggests every valid tag from imageKeywordMap,
//     inlineImageUrlMap, and the current colorTable, and auto-inserts the
//     closing tag for color-type tags.
//   - Color tag spans rendered in their actual hex color (live via a
//     ViewPlugin that reads colorTable at render time).
//
// The module exports a tiny API (createHighlightedEditor) that the rest of
// the app uses — callers never touch CodeMirror types directly.

// Bare-specifier imports — resolved via the <script type="importmap"> block
// in index.html. This is required so all @codemirror/* subpackages share a
// single @codemirror/state instance (otherwise extension instanceof checks
// fail with "Unrecognized extension value in extension set").
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
    EditorView, keymap, drawSelection, highlightSpecialChars,
    highlightActiveLine, rectangularSelection, crosshairCursor,
    tooltips, ViewPlugin, Decoration
} from '@codemirror/view';
import {
    defaultKeymap, history, historyKeymap, indentWithTab
} from '@codemirror/commands';
import {
    syntaxHighlighting, defaultHighlightStyle, bracketMatching,
    indentOnInput
} from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import {
    autocompletion, completionKeymap, closeBracketsKeymap, closeBrackets,
    startCompletion
} from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';

import { imageKeywordMap, inlineImageUrlMap } from './dataManager.js';
import { colorTable } from './canvasRenderer.js';

// Escape a string for use inside a RegExp character class or literal.
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Shared, layout-neutral parent for every CM tooltip host.
//
// `tooltips({ parent: document.body })` mounts a `position: relative` host
// div directly in <body> per EditorView. Those empty hosts participate in
// layout and add extra scrollable height at the bottom of the page (and, on
// at least one browser, seem to mess with where autocomplete popups land for
// the taller description editor).
//
// Instead we give CM a single 0×0 `position: fixed` layer in the corner.
// CM still creates its per-view host inside it, but since the layer takes no
// space and is out of flow, nothing contributes to page height. The actual
// tooltips inside use `position: fixed` themselves (see `baseExtensions`) so
// they anchor to the viewport regardless of this wrapper.
let sharedTooltipLayer = null;
function getTooltipLayer() {
    if (sharedTooltipLayer && sharedTooltipLayer.isConnected) return sharedTooltipLayer;
    const layer = document.createElement('div');
    layer.id = 'cm-tooltip-layer';
    // Inline styles so the layer works even if css/styles.css hasn't loaded
    // yet when the first editor is created.
    Object.assign(layer.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '0',
        height: '0',
        pointerEvents: 'none',
        zIndex: '10000'
    });
    document.body.appendChild(layer);
    sharedTooltipLayer = layer;
    return layer;
}

// Helper: build an `apply` function that replaces `[from, to)` with text
// and places the caret at `from + cursorOffset` (defaults to end).
function applyInsert(text, cursorOffset) {
    const offset = cursorOffset ?? text.length;
    return (view, _completion, from, to) => {
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + offset }
        });
    };
}

// Scaffold-aware apply for color tags. If the cursor sits inside a
// `<>...</>` scaffold placed by wrapSelectionWithTag, fill both halves with
// the tag name in a single transaction (single undo step). Otherwise behave
// like the legacy path: insert `<tag></tag>` and park the cursor between the
// two tags so the user can type content immediately.
function applyColorTag(tagName) {
    return (view, _completion, from, to) => {
        const rest = view.state.doc.sliceString(
            to,
            Math.min(to + 500, view.state.doc.length)
        );
        // Non-greedy up to the first `</>`. The scaffold contains no literal
        // `</>` by construction, so this only matches the scaffold we set up.
        const wrap = rest.match(/^>([\s\S]*?)<\/>/);
        if (wrap) {
            const content = wrap[1];
            const newText = `${tagName}>${content}</${tagName}>`;
            view.dispatch({
                changes: { from, to: to + wrap[0].length, insert: newText },
                selection: { anchor: from + newText.length }
            });
            return;
        }
        const insert = `${tagName}></${tagName}>`;
        view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + tagName.length + 1 }
        });
    };
}

// Input handler: typing `<` while text is selected wraps the selection in a
// `<>selection</>` scaffold instead of replacing it, and opens autocomplete
// so the user can pick a color tag. The scaffold-aware apply in
// applyColorTag then fills both halves atomically (single undo step). If
// there's no selection, or the user has multiple cursors, the `<` falls
// through to default behavior.
const wrapOnAngleBracket = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '<') return false;
    if (from === to) return false;
    if (view.state.selection.ranges.length !== 1) return false;
    const content = view.state.doc.sliceString(from, to);
    view.dispatch({
        changes: { from, to, insert: `<>${content}</>` },
        selection: { anchor: from + 1 },
        userEvent: 'input.type'
    });
    startCompletion(view);
    return true;
});

// ---- Completion source for Arena-specific tags ----
// Triggered inside `<…` or `</…`. Reads the live maps so newly-inserted
// inline refs (inlineImageUrlMap) and newly-added color table entries
// show up in suggestions without needing an editor rebuild.
function arenaCompletions(context) {
    const before = context.matchBefore(/<\/?[\w]*/);
    if (!before) return null;
    if (before.from === before.to && !context.explicit) return null;

    const text = before.text;
    const isClose = text.startsWith('</');
    const prefixStart = isClose ? 2 : 1;

    const opts = [];

    if (!isClose) {
        // <imgKEYWORD> — self-closing. Insert tag + '>' and park cursor after.
        for (const k of Object.keys(imageKeywordMap)) {
            const insert = 'img' + k + '>';
            opts.push({
                label: 'img' + k,
                type: 'variable',
                detail: 'icon',
                boost: 2,
                apply: applyInsert(insert)
            });
        }
        for (const k of Object.keys(inlineImageUrlMap)) {
            const insert = 'img' + k + '>';
            opts.push({
                label: 'img' + k,
                type: 'variable',
                detail: 'inline ref',
                boost: 3,
                apply: applyInsert(insert)
            });
        }
        opts.push({
            label: 'br',
            type: 'keyword',
            detail: 'line break',
            apply: applyInsert('br>')
        });
        // Color tags — scaffold-aware apply: wraps the selection if invoked
        // from the Alt+W command, otherwise inserts a fresh `<color></color>`
        // pair with the cursor between.
        for (const k of Object.keys(colorTable)) {
            opts.push({
                label: k,
                type: 'type',
                detail: 'color',
                apply: applyColorTag(k)
            });
        }
    } else {
        // </…> — finish the close tag only.
        for (const k of Object.keys(colorTable)) {
            opts.push({
                label: k,
                type: 'type',
                detail: 'color',
                apply: applyInsert(k + '>')
            });
        }
    }

    return {
        from: before.from + prefixStart,
        options: opts,
        validFor: /^[\w]*$/
    };
}

// ---- Color-tag span decoration ----
// Paints `<color>…</color>` spans in the actual hex color from colorTable.
// Re-runs on every doc/viewport change so the preview stays live as you type.
const colorTagDecorator = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.build(update.view);
        }
    }
    build(view) {
        const builder = new RangeSetBuilder();
        const colorKeys = Object.keys(colorTable);
        if (colorKeys.length === 0) return builder.finish();
        // Non-greedy content match so `<gold>x</gold><silver>y</silver>`
        // picks up as two separate spans rather than one giant one.
        const pattern = new RegExp(
            `<(${colorKeys.map(escapeRegExp).join('|')})>([\\s\\S]*?)<\\/\\1>`,
            'g'
        );
        for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            let m;
            while ((m = pattern.exec(text)) !== null) {
                const color = colorTable[m[1]];
                if (!color) continue;
                const start = from + m.index;
                const end = start + m[0].length;
                builder.add(start, end, Decoration.mark({
                    attributes: { style: `color: ${color}; font-weight: 600` }
                }));
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

// Theme tweaks — match the dark UI chrome and keep the editor flush inside
// the .text-input-wrapper that used to hold the textarea. Scope every `&`
// rule to `&.cm-editor` so the styles don't leak onto CM's tooltip container
// (which shares the theme class when a `parent` is passed to `tooltips()`).
const editorTheme = EditorView.theme({
    '&.cm-editor': {
        fontSize: '13px',
        borderRadius: '4px',
        border: '2px solid transparent',
        backgroundColor: '#1e1e2e'
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
        fontFamily: 'Consolas, "Courier New", monospace',
        lineHeight: '1.45'
    },
    '.cm-content': { padding: '6px 8px', caretColor: '#66b5ff' },
    '.cm-gutters': { display: 'none' },
    // Keep the editor's non-focus cursor visible so users can see where an
    // inserted icon/reference will land when they click a sidebar button.
    '.cm-cursor': { borderLeftWidth: '2px' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#264f78' }
});

function baseExtensions({ singleLine, onChange }) {
    const exts = [
        history(),
        drawSelection(),
        highlightSpecialChars(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        html({ matchClosingTags: true, autoCloseTags: true }),
        autocompletion({
            override: [arenaCompletions],
            activateOnTyping: true
        }),
        // Mount tooltips in a shared 0×0 `position: fixed` layer (see
        // getTooltipLayer) so CM's per-view host container doesn't add any
        // trailing empty-div height to the page. The tooltips themselves use
        // `position: fixed` so they escape the wrapper's `overflow: hidden`
        // and the host container's own overflow.
        tooltips({ position: 'fixed', parent: getTooltipLayer() }),
        colorTagDecorator,
        highlightActiveLine(),
        rectangularSelection(),
        crosshairCursor(),
        wrapOnAngleBracket,
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab
        ]),
        oneDark,
        editorTheme,
        EditorView.updateListener.of((update) => {
            if (update.docChanged && typeof onChange === 'function') {
                onChange(update.state.doc.toString());
            }
        })
    ];
    if (singleLine) {
        // Reject any transaction that would add a newline — keeps the
        // title field single-line on Enter or multi-line paste.
        exts.push(EditorState.transactionFilter.of(tr =>
            tr.docChanged && tr.newDoc.lines > 1 ? [] : tr
        ));
        // Scope `&` rules to `&.cm-editor` so they don't leak onto CM's
        // per-view tooltip container (also gets the theme class when a
        // `parent` is passed to `tooltips()`), which clips the autocomplete
        // popup.
        exts.push(EditorView.theme({
            '&.cm-editor': { minHeight: '30px' },
            '.cm-content': { minHeight: '30px' }
        }));
    } else {
        exts.push(EditorView.lineWrapping);
        // See note above — `&.cm-editor` instead of `&` keeps `overflow: auto`
        // off the tooltip container so the description's autocomplete popup
        // isn't clipped to 0×0.
        exts.push(EditorView.theme({
            '&.cm-editor': { minHeight: '150px', resize: 'vertical', overflow: 'auto' },
            '.cm-scroller': { overflow: 'auto' }
        }));
    }
    return exts;
}

export function createHighlightedEditor(mountEl, { value = '', onChange, singleLine = false } = {}) {
    const state = EditorState.create({
        doc: value,
        extensions: baseExtensions({ singleLine, onChange })
    });
    const view = new EditorView({ state, parent: mountEl });

    return {
        view,
        getValue() { return view.state.doc.toString(); },
        setValue(next) {
            const current = view.state.doc.toString();
            if (current === next) return;
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: next ?? '' }
            });
        },
        insertAtCursor(text) {
            const { from, to } = view.state.selection.main;
            view.dispatch({
                changes: { from, to, insert: text },
                selection: { anchor: from + text.length }
            });
            view.focus();
        },
        focus() { view.focus(); },
        isFocused() { return view.hasFocus; },
        // Subscribe to focus changes so the outer app can track which editor
        // the user touched last (for insert-at-cursor routing).
        onFocus(cb) {
            view.dom.addEventListener('focusin', cb);
            return () => view.dom.removeEventListener('focusin', cb);
        }
    };
}
