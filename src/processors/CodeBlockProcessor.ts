import React from "react";
import type { MarkdownPostProcessorContext } from "obsidian";
import type ReactRendererPlugin from "../main";
import { transpileJSX } from "../transpiler/transpile";
import { evaluateComponent, evaluateInlineJSX } from "../scope/evaluate";
import { buildScope } from "../scope/ScopeBuilder";
import { ComponentWrapper } from "../renderer/ComponentWrapper";
import { ErrorBoundary } from "../renderer/ErrorBoundary";
import { isInsideCanvas } from "../utils/context";
import { waitForDomAttachment } from "../utils/dom";

/**
 * Registers the `jsx` code block processor for Reading Mode.
 *
 * Handles three variants:
 * - ```jsx          — renders inline JSX
 * - ```jsx:component:Name  — registers a named component (no render)
 * - ```jsx:         — same as jsx (backwards compat)
 */
export function registerCodeBlockProcessor(plugin: ReactRendererPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(
		"jsx",
		async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			// Skip Canvas contexts to prevent crashes
			if (isInsideCanvas(el)) {
				el.createEl("pre", { text: source, cls: "react-renderer-canvas-fallback" });
				return;
			}

			await renderJSXBlock(source, el, ctx, plugin);
		}
	);

	// Handle jsx:component:Name variant
	plugin.registerMarkdownCodeBlockProcessor(
		"jsx:component",
		async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			// This handles ```jsx:component:Name blocks
			// The ":Name" part comes through in the section info
			const sectionInfo = ctx.getSectionInfo(el);
			let componentName: string | null = null;

			if (sectionInfo) {
				const lines = sectionInfo.text.split("\n");
				const openingLine = lines[sectionInfo.lineStart];
				const match = openingLine?.match(
					/```jsx:component:(\w+)/
				);
				if (match) {
					componentName = match[1];
				}
			}

			if (componentName) {
				await registerInlineComponent(
					componentName,
					source,
					el,
					plugin
				);
			}
		}
	);
}

/** Render a JSX code block into a DOM element */
async function renderJSXBlock(
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	plugin: ReactRendererPlugin
): Promise<void> {
	const container = el.createDiv({ cls: "react-renderer-container" });

	// Show loading indicator
	container.createSpan({
		text: "Loading...",
		cls: "react-renderer-loading",
	});

	const cleanup = waitForDomAttachment(container, async () => {
		try {
			const transpiled = await transpileJSX(source);

			if (transpiled.error) {
				renderError(container, transpiled.error.message);
				return;
			}

			const scope = buildScope(plugin.registry, plugin.app);
			scope.Markdown = plugin.getMarkdownComponent();

			// Try evaluating as a component first (if it defines a function)
			const component = evaluateComponent(transpiled.code!, scope);

			if (component) {
				container.empty();
				plugin.renderer.mount(
					container,
					React.createElement(ComponentWrapper, { component })
				);
			} else {
				// Fall back to inline JSX evaluation
				const element = evaluateInlineJSX(transpiled.code!, scope);
				if (element) {
					container.empty();
					plugin.renderer.mount(
						container,
						React.createElement(ErrorBoundary, null, element)
					);
				} else {
					renderError(container, "Component returned null");
				}
			}
		} catch (err: any) {
			renderError(container, err.message || String(err));
		}
	});

	// Register cleanup for when Obsidian removes this element
	plugin.register(() => {
		cleanup();
		plugin.renderer.unmount(container);
	});
}

/** Register an inline component definition */
async function registerInlineComponent(
	name: string,
	source: string,
	el: HTMLElement,
	plugin: ReactRendererPlugin
): Promise<void> {
	const transpiled = await transpileJSX(source);

	if (transpiled.error) {
		el.createDiv({
			cls: "react-renderer-error",
			text: `Error in component ${name}: ${transpiled.error.message}`,
		});
		return;
	}

	const scope = buildScope(plugin.registry, plugin.app);
	scope.Markdown = plugin.getMarkdownComponent();
	const component = evaluateComponent(transpiled.code!, scope);

	plugin.registry.register({
		name,
		rawSource: source,
		transpiledCode: transpiled.code!,
		component,
		sourceFilePath: null,
		namespace: "global",
		isHeader: false,
		lastUpdated: Date.now(),
	});

	// Show a subtle indicator that the component was registered
	el.createDiv({
		cls: "react-renderer-registered",
		text: `Component "${name}" registered`,
	});
}

function renderError(container: HTMLElement, message: string): void {
	container.empty();
	const errorEl = container.createDiv({ cls: "react-renderer-error" });
	errorEl.createDiv({
		cls: "react-renderer-error-title",
		text: "JSX Error",
	});
	errorEl.createEl("pre", {
		cls: "react-renderer-error-message",
		text: message,
	});
}
