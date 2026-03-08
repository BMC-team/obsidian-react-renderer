import React, { useRef, useEffect } from "react";
import { MarkdownRenderer, Component } from "obsidian";

interface MarkdownProps {
	src: string;
	sourcePath?: string;
	className?: string;
}

// Persistent Obsidian Component for lifecycle management
let markdownComponent: Component | null = null;

function getMarkdownComponent(): Component {
	if (!markdownComponent) {
		markdownComponent = new Component();
		markdownComponent.load();
	}
	return markdownComponent;
}

/**
 * React component that renders Obsidian markdown content.
 * Bridges React's virtual DOM with Obsidian's imperative MarkdownRenderer.
 */
export function Markdown({ src, sourcePath = "", className }: MarkdownProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || !src) return;

		el.empty();
		MarkdownRenderer.render(
			(window as any).app,
			src,
			el,
			sourcePath,
			getMarkdownComponent()
		);

		return () => {
			el.empty();
		};
	}, [src, sourcePath]);

	return (
		<div
			ref={containerRef}
			className={`react-renderer-markdown ${className || ""}`.trim()}
		/>
	);
}

/** Cleanup (called on plugin unload) */
export function unloadMarkdownComponent(): void {
	if (markdownComponent) {
		markdownComponent.unload();
		markdownComponent = null;
	}
}
