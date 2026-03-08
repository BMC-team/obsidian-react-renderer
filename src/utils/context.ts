import type { App, WorkspaceLeaf } from "obsidian";

/** Check if a workspace leaf is a Canvas view */
export function isCanvasView(leaf: WorkspaceLeaf): boolean {
	return leaf?.view?.getViewType() === "canvas";
}

/** Check if we're inside a Canvas context by walking up from a DOM element */
export function isInsideCanvas(el: HTMLElement): boolean {
	return !!el.closest(".canvas-node");
}

/** Get the workspace leaf containing a DOM element */
export function getLeafForElement(
	app: App,
	el: HTMLElement
): WorkspaceLeaf | null {
	let found: WorkspaceLeaf | null = null;
	app.workspace.iterateAllLeaves((leaf) => {
		if (found) return;
		if (
			(leaf.view as any).containerEl &&
			(leaf.view as any).containerEl.contains(el)
		) {
			found = leaf;
		}
	});
	return found;
}
