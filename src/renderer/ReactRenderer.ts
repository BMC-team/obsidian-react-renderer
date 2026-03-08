import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

interface ManagedRoot {
	root: Root;
	element: HTMLElement;
}

/**
 * Manages React 18 createRoot lifecycle for all rendered components.
 * Tracks all active roots for cleanup on plugin unload.
 */
export class ReactRenderer {
	private roots = new Map<HTMLElement, ManagedRoot>();

	/** Mount a React element into a DOM container */
	mount(el: HTMLElement, node: ReactNode): void {
		// Unmount existing root at this element if any
		this.unmount(el);

		const root = createRoot(el);
		root.render(node);
		this.roots.set(el, { root, element: el });
	}

	/** Unmount the React root at a DOM element */
	unmount(el: HTMLElement): void {
		const managed = this.roots.get(el);
		if (managed) {
			try {
				managed.root.unmount();
			} catch {
				// Element may already be detached
			}
			this.roots.delete(el);
		}
	}

	/** Unmount all active roots (plugin unload) */
	unmountAll(): void {
		for (const [el, managed] of this.roots) {
			try {
				managed.root.unmount();
			} catch {
				// Ignore errors during cleanup
			}
		}
		this.roots.clear();
	}

	/** Clean up roots whose DOM elements are no longer connected */
	cleanupDetached(): void {
		for (const [el, managed] of this.roots) {
			if (!el.isConnected) {
				try {
					managed.root.unmount();
				} catch {
					// Already detached
				}
				this.roots.delete(el);
			}
		}
	}

	/** Number of active roots */
	get activeCount(): number {
		return this.roots.size;
	}
}
