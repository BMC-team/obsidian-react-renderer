import React, { useState, useCallback, useRef } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface ComponentWrapperProps {
	component: React.ComponentType<any>;
	props?: Record<string, any>;
}

type ViewMode = "normal" | "wide" | "fullscreen";

/**
 * Wraps user components with error boundary and view mode toolbar.
 * Provides expand (break out of readable line width) and fullscreen buttons.
 */
export function ComponentWrapper({
	component: UserComponent,
	props = {},
}: ComponentWrapperProps) {
	const [mode, setMode] = useState<ViewMode>("normal");
	const containerRef = useRef<HTMLDivElement>(null);

	const toggleWide = useCallback(() => {
		setMode(m => (m === "wide" ? "normal" : "wide"));
	}, []);

	const toggleFullscreen = useCallback(() => {
		setMode(m => (m === "fullscreen" ? "normal" : "fullscreen"));
	}, []);

	const handleEscape = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Escape" && mode !== "normal") {
			setMode("normal");
		}
	}, [mode]);

	if (mode === "fullscreen") {
		return (
			<div
				className="react-renderer-fullscreen"
				onKeyDown={handleEscape}
				tabIndex={0}
			>
				<div className="react-renderer-fullscreen-toolbar">
					<span className="react-renderer-toolbar-label">Fullscreen</span>
					<button
						className="react-renderer-toolbar-btn"
						onClick={() => setMode("normal")}
						title="Exit fullscreen (Esc)"
					>
						✕ Close
					</button>
				</div>
				<div className="react-renderer-fullscreen-content">
					<ErrorBoundary>
						<UserComponent {...props} />
					</ErrorBoundary>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={mode === "wide" ? "react-renderer-wide" : ""}
		>
			<div className="react-renderer-toolbar">
				<button
					className={`react-renderer-toolbar-btn ${mode === "wide" ? "react-renderer-toolbar-btn-active" : ""}`}
					onClick={toggleWide}
					title="Expand to full width"
				>
					⬌ Wide
				</button>
				<button
					className="react-renderer-toolbar-btn"
					onClick={toggleFullscreen}
					title="Open fullscreen"
				>
					⛶ Fullscreen
				</button>
			</div>
			<ErrorBoundary>
				<UserComponent {...props} />
			</ErrorBoundary>
		</div>
	);
}
