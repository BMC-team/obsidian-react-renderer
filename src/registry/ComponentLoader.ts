import {
	type App,
	type TFile,
	type CachedMetadata,
	TFolder,
} from "obsidian";
import { ComponentRegistry } from "./ComponentRegistry";
import { transpileJSX } from "../transpiler/transpile";
import { evaluateComponent } from "../scope/evaluate";
import { buildScope } from "../scope/ScopeBuilder";
import type { ComponentEntry } from "../types";
import { debounce } from "../utils/debounce";

/**
 * Scans a configured vault folder for component definitions.
 * Watches for file changes and keeps the registry in sync.
 */
export class ComponentLoader {
	private debouncedReload: () => void;

	constructor(
		private app: App,
		private registry: ComponentRegistry,
		private getComponentsFolder: () => string
	) {
		this.debouncedReload = debounce(() => this.loadAll(), 500);
	}

	/** Initial scan of the components folder */
	async loadAll(): Promise<void> {
		const folderPath = this.getComponentsFolder();
		if (!folderPath) return;

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder || !(folder instanceof TFolder)) return;

		const files = this.getComponentFiles(folder);

		for (const file of files) {
			await this.loadComponentFile(file);
		}
	}

	/** Load/reload a single component file */
	async loadComponentFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);

		const { code: rawSource, name, namespace, isHeader } =
			this.parseComponentFile(file, content, cache);

		if (!rawSource || !name) return;

		const transpiled = transpileJSX(rawSource);
		if (transpiled.error) {
			console.warn(
				`[ReactRenderer] Transpile error in ${file.path}:`,
				transpiled.error.message
			);
			return;
		}

		const scope = buildScope(this.registry, this.app);
		const component = evaluateComponent(transpiled.code!, scope);

		const entry: ComponentEntry = {
			name,
			rawSource,
			transpiledCode: transpiled.code!,
			component,
			sourceFilePath: file.path,
			namespace,
			isHeader,
			lastUpdated: Date.now(),
		};

		this.registry.register(entry);
	}

	/** Handle vault file changes */
	handleFileChange(file: TFile): void {
		const folderPath = this.getComponentsFolder();
		if (!folderPath) return;

		if (file.path.startsWith(folderPath + "/")) {
			this.debouncedReload();
		}
	}

	/** Handle vault file deletion */
	handleFileDelete(filePath: string): void {
		// Find and remove any component registered from this file
		const entries = this.registry.getAll();
		for (const entry of entries) {
			if (entry.sourceFilePath === filePath) {
				this.registry.unregister(entry.name);
			}
		}
	}

	/** Handle file rename */
	handleFileRename(oldPath: string, newFile: TFile): void {
		this.handleFileDelete(oldPath);
		this.handleFileChange(newFile);
	}

	/** Parse a file to extract component info */
	private parseComponentFile(
		file: TFile,
		content: string,
		cache: CachedMetadata | null
	): {
		code: string | null;
		name: string | null;
		namespace: string;
		isHeader: boolean;
	} {
		// Try metadata cache first, fall back to manual parsing
		let frontmatter: Record<string, any> | null =
			cache?.frontmatter ?? null;
		let code = content;

		if (cache?.frontmatterPosition) {
			code = content
				.slice(cache.frontmatterPosition.end.offset)
				.trimStart();
		} else {
			// Manual frontmatter parsing (metadata cache not ready)
			const parsed = this.parseFrontmatterManual(content);
			frontmatter = parsed.frontmatter;
			code = parsed.body;
		}

		const namespace =
			(frontmatter?.["react-components-namespace"] as string) || "global";
		const isHeader = frontmatter?.["use-as-note-header"] === true;
		const name = file.basename;

		if (!code.trim()) return { code: null, name: null, namespace, isHeader };

		return { code, name, namespace, isHeader };
	}

	/** Parse YAML frontmatter without relying on metadata cache */
	private parseFrontmatterManual(content: string): {
		frontmatter: Record<string, any> | null;
		body: string;
	} {
		const trimmed = content.trimStart();
		if (!trimmed.startsWith("---")) {
			return { frontmatter: null, body: content };
		}

		const endIdx = trimmed.indexOf("\n---", 3);
		if (endIdx === -1) {
			return { frontmatter: null, body: content };
		}

		const yamlBlock = trimmed.slice(4, endIdx);
		const body = trimmed.slice(endIdx + 4).trimStart();

		// Simple key: value parser (handles strings, booleans)
		const fm: Record<string, any> = {};
		for (const line of yamlBlock.split("\n")) {
			const match = line.match(/^(\S+):\s*(.*)$/);
			if (match) {
				let val: any = match[2].trim();
				if (val === "true") val = true;
				else if (val === "false") val = false;
				else if (/^\d+$/.test(val)) val = parseInt(val);
				fm[match[1]] = val;
			}
		}

		return { frontmatter: fm, body };
	}

	/** Recursively get component files from folder */
	private getComponentFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				files.push(...this.getComponentFiles(child));
			} else if (
				child instanceof TFolder === false &&
				(child as TFile).extension &&
				["md", "jsx", "tsx"].includes((child as TFile).extension)
			) {
				files.push(child as TFile);
			}
		}
		return files;
	}
}
