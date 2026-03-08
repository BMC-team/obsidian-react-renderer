import { WidgetType, type EditorView } from "@codemirror/view";
import React from "react";
import type ReactRendererPlugin from "../main";
import { transpileJSX } from "../transpiler/transpile";
import { evaluateComponent, evaluateInlineJSX } from "../scope/evaluate";
import { buildScope } from "../scope/ScopeBuilder";
import { ComponentWrapper } from "../renderer/ComponentWrapper";
import { ErrorBoundary } from "../renderer/ErrorBoundary";

/**
 * CM6 WidgetType that renders a JSX code block as a live React component
 * in Live Preview mode.
 */
export class JsxWidget extends WidgetType {
	private container: HTMLElement | null = null;

	constructor(
		private source: string,
		private plugin: ReactRendererPlugin
	) {
		super();
	}

	eq(other: JsxWidget): boolean {
		return this.source === other.source;
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("div");
		container.className = "react-renderer-container react-renderer-live-preview";
		container.textContent = "Loading...";
		this.container = container;

		// Render asynchronously to avoid blocking the editor
		this.renderAsync(container);

		return container;
	}

	destroy(dom: HTMLElement): void {
		if (this.container) {
			this.plugin.renderer.unmount(this.container);
			this.container = null;
		}
	}

	private async renderAsync(container: HTMLElement): Promise<void> {
		try {
			const transpiled = transpileJSX(this.source);

			if (transpiled.error) {
				container.textContent = "";
				container.className = "react-renderer-error";
				const title = container.createDiv({
					cls: "react-renderer-error-title",
					text: "JSX Error",
				});
				container.createEl("pre", {
					cls: "react-renderer-error-message",
					text: transpiled.error.message,
				});
				return;
			}

			const scope = buildScope(this.plugin.registry, this.plugin.app);
			scope.Markdown = this.plugin.getMarkdownComponent();

			const component = evaluateComponent(transpiled.code!, scope);

			if (component) {
				container.textContent = "";
				this.plugin.renderer.mount(
					container,
					React.createElement(ComponentWrapper, { component })
				);
			} else {
				const element = evaluateInlineJSX(transpiled.code!, scope);
				if (element) {
					container.textContent = "";
					this.plugin.renderer.mount(
						container,
						React.createElement(ErrorBoundary, null, element)
					);
				} else {
					container.textContent = "Component returned null";
				}
			}
		} catch (err: any) {
			container.textContent = err.message || "Render error";
			container.className = "react-renderer-error";
		}
	}
}
