import { Plugin, type TAbstractFile, TFile } from "obsidian";
import { ReactRendererSettingTab } from "./settings";
import {
	DEFAULT_SETTINGS,
	type ReactRendererSettings,
} from "./types";
import { ComponentRegistry } from "./registry/ComponentRegistry";
import { ComponentLoader } from "./registry/ComponentLoader";
import { ReactRenderer } from "./renderer/ReactRenderer";
import { Markdown, unloadMarkdownComponent } from "./renderer/MarkdownComponent";
import { registerCodeBlockProcessor } from "./processors/CodeBlockProcessor";
import { registerHeaderProcessor } from "./processors/HeaderProcessor";
import { createLivePreviewExtension } from "./editor/LivePreviewPlugin";
import { clearTranspileCache } from "./transpiler/transpile";
import { clearSharedState } from "./scope/ScopeBuilder";

export default class ReactRendererPlugin extends Plugin {
	settings: ReactRendererSettings = DEFAULT_SETTINGS;
	registry: ComponentRegistry = new ComponentRegistry();
	renderer: ReactRenderer = new ReactRenderer();
	private loader!: ComponentLoader;
	private cleanupInterval: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Component loader
		this.loader = new ComponentLoader(
			this.app,
			this.registry,
			() => this.settings.componentsFolder
		);

		// Register code block processors (Reading Mode)
		registerCodeBlockProcessor(this);

		// Register header processor
		registerHeaderProcessor(this);

		// Register Live Preview extension
		if (this.settings.enableLivePreview) {
			this.registerEditorExtension([
				createLivePreviewExtension(this),
			]);
		}

		// Load file-based components once layout is ready
		this.app.workspace.onLayoutReady(async () => {
			await this.loader.loadAll();
		});

		// Watch for file changes
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && this.settings.autoRefresh) {
					this.loader.handleFileChange(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				if (file instanceof TFile) {
					this.loader.handleFileChange(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.loader.handleFileDelete(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (file instanceof TFile) {
					this.loader.handleFileRename(oldPath, file);
				}
			})
		);

		// Periodic cleanup of detached roots
		this.cleanupInterval = window.setInterval(() => {
			this.renderer.cleanupDetached();
		}, 30000);

		// Commands
		this.addCommand({
			id: "refresh-components",
			name: "Refresh all components",
			callback: async () => {
				this.registry.clear();
				clearTranspileCache();
				await this.loader.loadAll();
			},
		});

		this.addCommand({
			id: "clear-cache",
			name: "Clear transpilation cache",
			callback: () => {
				clearTranspileCache();
			},
		});

		// Settings tab
		this.addSettingTab(new ReactRendererSettingTab(this.app, this));
	}

	onunload(): void {
		// Clean up periodic interval
		if (this.cleanupInterval !== null) {
			window.clearInterval(this.cleanupInterval);
		}

		// Unmount all React roots
		this.renderer.unmountAll();

		// Clean up Markdown component
		unloadMarkdownComponent();

		// Clear shared state
		clearSharedState();

		// Clear registry
		this.registry.clear();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Get the Markdown component for injection into user scope */
	getMarkdownComponent() {
		return Markdown;
	}
}
