import {
	ViewPlugin,
	type ViewUpdate,
	Decoration,
	type DecorationSet,
	type EditorView,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type ReactRendererPlugin from "../main";
import { detectJSXCodeBlocks } from "./CodeBlockDetector";
import { JsxWidget } from "./JsxWidget";

/**
 * CM6 ViewPlugin that replaces JSX code blocks with rendered React components
 * in Live Preview mode.
 *
 * Key behavior:
 * - When cursor is OUTSIDE a JSX block: shows rendered component (hides source)
 * - When cursor is INSIDE a JSX block: shows source code (hides component)
 */
class LivePreviewPluginValue {
	decorations: DecorationSet;

	constructor(
		private view: EditorView,
		private plugin: ReactRendererPlugin
	) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.selectionSet
		) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy(): void {
		// Widgets handle their own cleanup via JsxWidget.destroy()
	}

	private buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const { from: viewFrom, to: viewTo } = view.viewport;
		const cursorPos = view.state.selection.main.head;

		const blocks = detectJSXCodeBlocks(view.state, viewFrom, viewTo);

		for (const block of blocks) {
			// If cursor is inside the block, show raw source (no decoration)
			if (cursorPos >= block.from && cursorPos <= block.to) {
				continue;
			}

			// Skip component definition blocks — they register, don't render
			if (
				block.infoString.toLowerCase().startsWith("jsx:component:")
			) {
				continue;
			}

			// Replace the entire code block with a widget
			builder.add(
				block.from,
				block.to,
				Decoration.replace({
					widget: new JsxWidget(block.content, this.plugin),
				})
			);
		}

		return builder.finish();
	}
}

/**
 * Create the CM6 ViewPlugin for Live Preview.
 * Call this from main.ts and register via registerEditorExtension.
 */
export function createLivePreviewExtension(plugin: ReactRendererPlugin) {
	return ViewPlugin.fromClass(
		class extends LivePreviewPluginValue {
			constructor(view: EditorView) {
				super(view, plugin);
			}
		},
		{
			decorations: (value) => value.decorations,
		}
	);
}
