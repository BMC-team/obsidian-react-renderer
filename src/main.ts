import { Plugin, type TAbstractFile, TFile, type Editor, Notice } from "obsidian";
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
import { clearSharedState, loadPersistent } from "./scope/ScopeBuilder";

export default class ReactRendererPlugin extends Plugin {
	settings: ReactRendererSettings = DEFAULT_SETTINGS;
	registry: ComponentRegistry = new ComponentRegistry();
	renderer: ReactRenderer = new ReactRenderer();
	private loader!: ComponentLoader;
	private cleanupInterval: number | null = null;
	private hotReloadInterval: number | null = null;
	private lastHotReloadTs: string | null = null;

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

		// Load persistent state and file-based components once layout is ready
		this.app.workspace.onLayoutReady(async () => {
			await loadPersistent(this.app);
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

		// Dev hot-reload: poll for .hotreload file changes in plugin dir
		this.startHotReloadWatcher();

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
				new Notice("Transpilation cache cleared");
			},
		});

		this.addCommand({
			id: "insert-jsx-block",
			name: "Insert JSX block",
			editorCallback: (editor: Editor) => {
				const template = '```jsx\nconst [value, setValue] = useState("");\nreturn (\n  <div>\n    \n  </div>\n);\n```\n';
				editor.replaceSelection(template);
			},
		});

		this.addCommand({
			id: "insert-jsx-component",
			name: "Insert JSX component definition",
			editorCallback: (editor: Editor) => {
				const template = '```jsx:component:MyComponent\nconst { label = "Default" } = props;\nreturn (\n  <div>\n    {label}\n  </div>\n);\n```\n';
				editor.replaceSelection(template);
			},
		});

		this.addCommand({
			id: "insert-jsx-stateful",
			name: "Insert JSX block with useState + useEffect",
			editorCallback: (editor: Editor) => {
				const template = '```jsx\nconst [data, setData] = useState([]);\nconst [loading, setLoading] = useState(true);\n\nuseEffect(() => {\n  // Load data\n  setLoading(false);\n}, []);\n\nif (loading) return <div>Loading...</div>;\n\nreturn (\n  <div>\n    {data.length} items\n  </div>\n);\n```\n';
				editor.replaceSelection(template);
			},
		});

		// Settings tab
		this.addSettingTab(new ReactRendererSettingTab(this.app, this));
	}

	onunload(): void {
		// Clean up intervals
		if (this.cleanupInterval !== null) {
			window.clearInterval(this.cleanupInterval);
		}
		if (this.hotReloadInterval !== null) {
			window.clearInterval(this.hotReloadInterval);
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

	/** Poll for .hotreload file in plugin dir — shows notice when dev build is deployed */
	private startHotReloadWatcher(): void {
		const pluginDir = this.manifest.dir;
		if (!pluginDir) return;

		const hotReloadPath = `${pluginDir}/.hotreload`;

		this.hotReloadInterval = window.setInterval(async () => {
			try {
				const adapter = this.app.vault.adapter;
				if (await adapter.exists(hotReloadPath)) {
					const content = await adapter.read(hotReloadPath);
					if (this.lastHotReloadTs === null) {
						// First read — just record the timestamp
						this.lastHotReloadTs = content;
					} else if (content !== this.lastHotReloadTs) {
						this.lastHotReloadTs = content;
						new Notice("React Renderer rebuilt — reload plugin or restart Obsidian to apply", 5000);
					}
				}
			} catch {
				// File doesn't exist or can't be read — ignore
			}
		}, 2000);
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
