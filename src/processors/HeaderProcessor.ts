import React from "react";
import type { MarkdownPostProcessorContext } from "obsidian";
import type ReactRendererPlugin from "../main";
import { ComponentWrapper } from "../renderer/ComponentWrapper";
import { isInsideCanvas } from "../utils/context";

const mountedHeaders = new WeakSet<HTMLElement>();

/**
 * Registers a MarkdownPostProcessor that injects a header component
 * at the top of every note in reading mode.
 */
export function registerHeaderProcessor(plugin: ReactRendererPlugin): void {
	plugin.registerMarkdownPostProcessor(
		(el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			if (!plugin.settings.enableHeaderComponent) return;
			if (!plugin.settings.headerComponentName) return;
			if (isInsideCanvas(el)) return;

			// Only process the first section of the note
			const sectionInfo = ctx.getSectionInfo(el);
			if (!sectionInfo || sectionInfo.lineStart !== 0) return;

			// Prevent duplicate headers
			const parent = el.parentElement;
			if (!parent || mountedHeaders.has(parent)) return;
			mountedHeaders.add(parent);

			const entry = plugin.registry.get(
				plugin.settings.headerComponentName
			);
			if (!entry?.component) return;

			const container = createEl("div", {
				cls: "react-renderer-header",
			});
			el.parentElement?.insertBefore(container, el);

			plugin.renderer.mount(
				container,
				React.createElement(ComponentWrapper, {
					component: entry.component,
				})
			);

			plugin.register(() => {
				plugin.renderer.unmount(container);
			});
		},
		// Low priority — run after other processors
		100
	);
}
