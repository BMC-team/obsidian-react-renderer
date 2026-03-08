import type { App, MarkdownPostProcessorContext } from "obsidian";
import type React from "react";

/** Result of JSX transpilation */
export interface TranspileResult {
	code: string | null;
	error: TranspileError | null;
}

export interface TranspileError {
	message: string;
	line: number | null;
	column: number | null;
}

/** A registered component in the registry */
export interface ComponentEntry {
	name: string;
	rawSource: string;
	transpiledCode: string;
	component: React.ComponentType<any> | null;
	sourceFilePath: string | null;
	namespace: string;
	isHeader: boolean;
	lastUpdated: number;
}

/** Plugin settings */
export interface ReactRendererSettings {
	componentsFolder: string;
	autoRefresh: boolean;
	enableLivePreview: boolean;
	enableHeaderComponent: boolean;
	headerComponentName: string;
	enableScriptExecution: boolean;
	scriptConfirmBeforeRun: boolean;
	claudeTasksFolder: string;
	claudeCliPath: string;
}

export const DEFAULT_SETTINGS: ReactRendererSettings = {
	componentsFolder: "",
	autoRefresh: true,
	enableLivePreview: true,
	enableHeaderComponent: false,
	headerComponentName: "",
	enableScriptExecution: false,
	scriptConfirmBeforeRun: true,
	claudeTasksFolder: "",
	claudeCliPath: "claude",
};

/** Context provided to wrapped user components */
export interface ReactRendererContext {
	app: App;
	sourcePath: string;
	frontmatter: Record<string, any> | null;
}

/** Events emitted by ComponentRegistry */
export type RegistryEventType =
	| "component-registered"
	| "component-updated"
	| "component-removed";

export interface RegistryEvent {
	type: RegistryEventType;
	name: string;
	entry?: ComponentEntry;
}
