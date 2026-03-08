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

		// Load file-based components eagerly so they're in scope
		// when code blocks render. Uses manual frontmatter parsing
		// since metadata cache may not be ready yet.
		await this.loader.loadAll();

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

		// Load persistent state and reload components with full metadata cache
		this.app.workspace.onLayoutReady(async () => {
			await loadPersistent(this.app);
			await this.loader.loadAll();
		});

		// Watch for file changes — hot reload components
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && this.settings.autoRefresh) {
					this.loader.handleFileChange(file);
					// If a component was updated, re-render all active jsx blocks
					if (this.isComponentFile(file)) {
						this.triggerRerender();
					}
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

		this.addCommand({
			id: "component-gallery",
			name: "Show component gallery",
			callback: async () => {
				const components = this.registry.getAll();
				if (components.length === 0) {
					new Notice("No components registered");
					return;
				}

				const lines = [
					"# Component Gallery",
					"",
					"> Auto-generated by React Renderer. " + components.length + " components registered.",
					"",
					"| Component | Source | Namespace | Props |",
					"|-----------|--------|-----------|-------|",
				];

				for (const c of components) {
					// Parse @prop comments from raw source
					const propDocs = this.parsePropsFromSource(c.rawSource);
					const propsStr = propDocs.length > 0
						? propDocs.map(p => `\`${p.name}\`${p.default ? `=${p.default}` : ""}`).join(", ")
						: "—";
					const source = c.sourceFilePath ? `\`${c.sourceFilePath}\`` : "inline";
					lines.push(`| \`${c.name}\` | ${source} | ${c.namespace} | ${propsStr} |`);
				}

				lines.push("");
				lines.push("## Prop Details");
				lines.push("");

				for (const c of components) {
					const propDocs = this.parsePropsFromSource(c.rawSource);
					if (propDocs.length === 0) continue;
					lines.push(`### ${c.name}`);
					lines.push("");
					lines.push("| Prop | Type | Default | Description |");
					lines.push("|------|------|---------|-------------|");
					for (const p of propDocs) {
						lines.push(`| \`${p.name}\` | ${p.type || "any"} | ${p.default || "—"} | ${p.description || ""} |`);
					}
					lines.push("");
				}

				const outputPath = "React Component Gallery.md";
				const existing = this.app.vault.getAbstractFileByPath(outputPath);
				if (existing) {
					await this.app.vault.modify(existing as TFile, lines.join("\n"));
				} else {
					await this.app.vault.create(outputPath, lines.join("\n"));
				}
				new Notice(`Component gallery updated: ${outputPath}`);

				// Open the file
				const file = this.app.vault.getAbstractFileByPath(outputPath);
				if (file) {
					await this.app.workspace.openLinkText(outputPath, "", false);
				}
			},
		});

		this.addCommand({
			id: "export-html",
			name: "Export current note JSX to static HTML",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active file");
					return;
				}
				const content = await this.app.vault.read(file);
				const htmlParts: string[] = [];
				let lastIdx = 0;

				// Find all ```jsx blocks and render them
				const regex = /```jsx\n([\s\S]*?)```/g;
				let match;
				while ((match = regex.exec(content)) !== null) {
					// Add markdown before this block
					htmlParts.push(content.slice(lastIdx, match.index));
					lastIdx = match.index + match[0].length;

					// Transpile and evaluate
					const { transpileJSX } = require("./transpiler/transpile");
					const { evaluateComponent } = require("./scope/evaluate");
					const { buildScope } = require("./scope/ScopeBuilder");

					const source = match[1];
					const transpiled = transpileJSX(source);
					if (transpiled.error) {
						htmlParts.push(`<div class="jsx-error">${transpiled.error.message}</div>`);
					} else {
						htmlParts.push(`<!-- JSX Block (source preserved) -->\n\`\`\`jsx\n${source}\`\`\``);
					}
				}
				htmlParts.push(content.slice(lastIdx));

				const outputPath = file.path.replace(/\.md$/, "-exported.md");
				await this.app.vault.create(outputPath, htmlParts.join(""));
				new Notice(`Exported to ${outputPath}`);
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

	/** Parse @prop comments and destructured props from component source */
	parsePropsFromSource(source: string): Array<{
		name: string;
		type: string;
		default: string;
		description: string;
	}> {
		const props: Array<{ name: string; type: string; default: string; description: string }> = [];
		const seen = new Set<string>();

		// Parse @prop comments: // @prop name: type = default — description
		const propRegex = /\/\/\s*@prop\s+(\w+)(?:\s*:\s*(\w+))?(?:\s*=\s*([^—\n]+))?(?:\s*[—-]\s*(.+))?/g;
		let match;
		while ((match = propRegex.exec(source)) !== null) {
			const name = match[1];
			if (!seen.has(name)) {
				seen.add(name);
				props.push({
					name,
					type: match[2]?.trim() || "",
					default: match[3]?.trim() || "",
					description: match[4]?.trim() || "",
				});
			}
		}

		// Also parse destructured props: const { x = "default", y } = props;
		const destructureRegex = /const\s*\{([^}]+)\}\s*=\s*props/;
		const dm = source.match(destructureRegex);
		if (dm) {
			const entries = dm[1].split(",");
			for (const entry of entries) {
				const trimmed = entry.trim();
				const pm = trimmed.match(/^(\w+)(?:\s*=\s*(.+))?$/);
				if (pm && !seen.has(pm[1])) {
					seen.add(pm[1]);
					props.push({
						name: pm[1],
						type: "",
						default: pm[2]?.trim() || "",
						description: "",
					});
				}
			}
		}

		return props;
	}

	/** Check if a file is in the components folder */
	private isComponentFile(file: TFile): boolean {
		const folder = this.settings.componentsFolder;
		if (!folder) return false;
		return file.path.startsWith(folder + "/");
	}

	/** Trigger re-render of all active JSX blocks by refreshing the active view */
	private triggerRerender(): void {
		const leaf = this.app.workspace.getActiveViewOfType(
			(require("obsidian") as any).MarkdownView
		);
		if (leaf) {
			// Force re-render by toggling the view mode
			const state = leaf.getState();
			leaf.setState({ ...state }, { history: false });
			new Notice("Component updated — re-rendering", 2000);
		}
	}
}
