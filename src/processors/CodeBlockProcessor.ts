import React from "react";
import type { MarkdownPostProcessorContext } from "obsidian";
import type ReactRendererPlugin from "../main";
import { transpileJSX } from "../transpiler/transpile";
import { evaluateComponent, evaluateInlineJSX } from "../scope/evaluate";
import { buildScope } from "../scope/ScopeBuilder";
import { ComponentWrapper } from "../renderer/ComponentWrapper";
import { ErrorBoundary } from "../renderer/ErrorBoundary";
import { isInsideCanvas } from "../utils/context";

/**
 * Registers processors for JSX code blocks in Reading Mode.
 *
 * Two registration strategies:
 * 1. registerMarkdownCodeBlockProcessor("jsx") — handles ```jsx blocks (render inline)
 * 2. registerMarkdownPostProcessor — catches ```jsx:component:Name blocks that
 *    Obsidian doesn't route to the "jsx" handler (Obsidian uses exact language matching,
 *    so "jsx:component:Name" is a different language than "jsx")
 */
export function registerCodeBlockProcessor(plugin: ReactRendererPlugin): void {
	// Handle ```jsx blocks — render as live components
	plugin.registerMarkdownCodeBlockProcessor(
		"jsx",
		async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			if (isInsideCanvas(el)) {
				el.createEl("pre", { text: source, cls: "react-renderer-canvas-fallback" });
				return;
			}
			await renderJSXBlock(source, el, ctx, plugin);
		}
	);

	// Handle ```jsx:component:Name blocks — register components
	// These are NOT matched by the "jsx" processor because Obsidian uses exact
	// language matching. We catch them via a post-processor that scans for
	// <code class="language-jsx:component:..."> elements.
	plugin.registerMarkdownPostProcessor(
		(el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			try {
				const codeBlocks = el.querySelectorAll('code[class*="language-jsx:component:"]');
				for (const codeEl of Array.from(codeBlocks)) {
					const className = codeEl.className;
					const match = className.match(/language-jsx:component:(\w+)/);
					if (!match) continue;

					const componentName = match[1];
					const source = codeEl.textContent || "";
					const preEl = codeEl.parentElement; // <pre> wrapper
					if (!preEl || preEl.tagName !== "PRE") continue;

					// Replace the <pre><code> with our registration indicator
					registerInlineComponent(componentName, source, preEl, plugin);
				}
			} catch (err) {
				console.error("[ReactRenderer] Component registration post-processor error:", err);
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

	try {
		const transpiled = transpileJSX(source);

		if (transpiled.error) {
			renderError(container, transpiled.error.message);
			return;
		}

		const scope = buildScope(plugin.registry, plugin.app);
		scope.Markdown = plugin.getMarkdownComponent();

		const component = evaluateComponent(transpiled.code!, scope);

		if (component) {
			plugin.renderer.mount(
				container,
				React.createElement(ComponentWrapper, { component })
			);
		} else {
			const element = evaluateInlineJSX(transpiled.code!, scope);
			if (element) {
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

	plugin.register(() => {
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
	try {
		const transpiled = transpileJSX(source);

		if (transpiled.error) {
			el.replaceWith(
				createErrorEl(`Error in component ${name}: ${transpiled.error.message}`)
			);
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

		// Replace the raw code block with a registration indicator
		const indicator = createEl("div", {
			cls: "react-renderer-registered",
			text: `Component "${name}" registered`,
		});
		el.replaceWith(indicator);
	} catch (err: any) {
		el.replaceWith(
			createErrorEl(`Error registering component ${name}: ${err.message || err}`)
		);
	}
}

function createErrorEl(message: string): HTMLElement {
	const div = createEl("div", { cls: "react-renderer-error" });
	div.createDiv({ cls: "react-renderer-error-title", text: "JSX Error" });
	div.createEl("pre", { cls: "react-renderer-error-message", text: message });
	return div;
}

function renderError(container: HTMLElement, message: string): void {
	container.empty();
	const errorEl = container.createDiv({ cls: "react-renderer-error" });
	errorEl.createDiv({ cls: "react-renderer-error-title", text: "JSX Error" });
	errorEl.createEl("pre", { cls: "react-renderer-error-message", text: message });
}
