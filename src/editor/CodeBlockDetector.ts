import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export interface DetectedCodeBlock {
	from: number;
	to: number;
	infoString: string;
	content: string;
}

/**
 * Find all fenced code blocks with a JSX info string
 * in the visible range of a CM6 editor state.
 *
 * Wrapped in try-catch to prevent ViewPlugin crashes.
 */
export function detectJSXCodeBlocks(
	state: EditorState,
	from: number,
	to: number
): DetectedCodeBlock[] {
	const blocks: DetectedCodeBlock[] = [];

	try {
		syntaxTree(state).iterate({
			from,
			to,
			enter(node) {
				if (node.name !== "FencedCode") return;

				let infoString = "";
				let contentStart = node.from;
				let contentEnd = node.to;

				// Walk children to find CodeInfo and CodeText
				try {
					const cursor = node.node.cursor();
					if (cursor.firstChild()) {
						do {
							if (cursor.name === "CodeInfo") {
								infoString = state.sliceDoc(
									cursor.from,
									cursor.to
								);
							} else if (cursor.name === "CodeText") {
								contentStart = cursor.from;
								contentEnd = cursor.to;
							}
						} while (cursor.nextSibling());
					}
				} catch {
					// Skip this block if cursor traversal fails
					return;
				}

				// Check if this is a jsx block
				const info = infoString.trim().toLowerCase();
				if (
					info === "jsx" ||
					info === "jsx:" ||
					info.startsWith("jsx:component:")
				) {
					blocks.push({
						from: node.from,
						to: node.to,
						infoString: infoString.trim(),
						content: state.sliceDoc(contentStart, contentEnd),
					});
				}
			},
		});
	} catch (err) {
		console.error("[ReactRenderer] Code block detection error:", err);
	}

	return blocks;
}
