import React from "react";
import type { App } from "obsidian";
import { ComponentRegistry } from "../registry/ComponentRegistry";

// ============================================================
// useSharedState — cross-component communication (in-memory)
// ============================================================

const sharedStateStore = new Map<
	string,
	{ value: any; subscribers: Set<() => void> }
>();

function useSharedState<T>(
	key: string,
	initialValue: T
): [T, (val: T | ((prev: T) => T)) => void] {
	if (!sharedStateStore.has(key)) {
		sharedStateStore.set(key, {
			value: initialValue,
			subscribers: new Set(),
		});
	}
	const store = sharedStateStore.get(key)!;

	const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

	React.useEffect(() => {
		store.subscribers.add(forceUpdate);
		return () => {
			store.subscribers.delete(forceUpdate);
		};
	}, [key]);

	const setValue = React.useCallback(
		(val: T | ((prev: T) => T)) => {
			const newVal =
				typeof val === "function"
					? (val as (prev: T) => T)(store.value)
					: val;
			store.value = newVal;
			for (const sub of store.subscribers) {
				sub();
			}
		},
		[key]
	);

	return [store.value, setValue];
}

// ============================================================
// usePersistentState — survives note switches and restarts
// ============================================================

let persistentData: Record<string, any> = {};
let persistentApp: App | null = null;
let persistentDirty = false;
let persistentSaveTimer: ReturnType<typeof setTimeout> | null = null;

function initPersistent(app: App): void {
	persistentApp = app;
}

async function loadPersistentData(app: App): Promise<void> {
	try {
		const pluginId = "obsidian-react-renderer";
		const raw = await (app as any).plugins?.plugins?.[pluginId]?.loadData();
		if (raw?.__persistentState) {
			persistentData = raw.__persistentState;
		}
	} catch {
		// Ignore — use empty store
	}
}

function savePersistentData(): void {
	if (!persistentApp || !persistentDirty) return;
	persistentDirty = false;

	try {
		const pluginId = "obsidian-react-renderer";
		const plugin = (persistentApp as any).plugins?.plugins?.[pluginId];
		if (plugin) {
			plugin.loadData().then((existing: any) => {
				plugin.saveData({ ...existing, __persistentState: persistentData });
			});
		}
	} catch {
		// Ignore save errors
	}
}

function usePersistentState<T>(
	key: string,
	initialValue: T
): [T, (val: T | ((prev: T) => T)) => void] {
	if (!(key in persistentData)) {
		persistentData[key] = initialValue;
	}

	const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

	// Also register in sharedStateStore for cross-block sync
	if (!sharedStateStore.has(`__persistent_${key}`)) {
		sharedStateStore.set(`__persistent_${key}`, {
			value: null,
			subscribers: new Set(),
		});
	}
	const store = sharedStateStore.get(`__persistent_${key}`)!;

	React.useEffect(() => {
		store.subscribers.add(forceUpdate);
		return () => {
			store.subscribers.delete(forceUpdate);
		};
	}, [key]);

	const setValue = React.useCallback(
		(val: T | ((prev: T) => T)) => {
			const newVal =
				typeof val === "function"
					? (val as (prev: T) => T)(persistentData[key])
					: val;
			persistentData[key] = newVal;
			persistentDirty = true;

			// Debounce save
			if (persistentSaveTimer) clearTimeout(persistentSaveTimer);
			persistentSaveTimer = setTimeout(savePersistentData, 1000);

			// Notify subscribers
			for (const sub of store.subscribers) {
				sub();
			}
		},
		[key]
	);

	return [persistentData[key], setValue];
}

// ============================================================
// useFrontmatter — returns current note's YAML frontmatter
// ============================================================

function createUseFrontmatter(app: App) {
	return function useFrontmatter(): Record<string, any> {
		const [fm, setFm] = React.useState<Record<string, any>>({});

		React.useEffect(() => {
			const activeFile = app.workspace.getActiveFile();
			if (!activeFile) return;

			const cache = app.metadataCache.getFileCache(activeFile);
			setFm(cache?.frontmatter ?? {});

			// Listen for metadata changes
			const ref = app.metadataCache.on("changed", (file) => {
				if (file.path === activeFile.path) {
					const updated = app.metadataCache.getFileCache(file);
					setFm(updated?.frontmatter ?? {});
				}
			});

			return () => {
				app.metadataCache.offref(ref);
			};
		}, []);

		return fm;
	};
}

// ============================================================
// useTheme — returns "light" or "dark", updates reactively
// ============================================================

function createUseTheme() {
	return function useTheme(): "light" | "dark" {
		const getTheme = (): "light" | "dark" =>
			document.body.classList.contains("theme-dark") ? "dark" : "light";

		const [theme, setTheme] = React.useState<"light" | "dark">(getTheme);

		React.useEffect(() => {
			const observer = new MutationObserver(() => {
				setTheme(getTheme());
			});
			observer.observe(document.body, {
				attributes: true,
				attributeFilter: ["class"],
			});
			return () => observer.disconnect();
		}, []);

		return theme;
	};
}

// ============================================================
// useNote — read another note's content and frontmatter
// ============================================================

function createUseNote(app: App) {
	return function useNote(path: string): {
		content: string;
		frontmatter: Record<string, any>;
		loading: boolean;
		error: string | null;
	} {
		const [state, setState] = React.useState<{
			content: string;
			frontmatter: Record<string, any>;
			loading: boolean;
			error: string | null;
		}>({ content: "", frontmatter: {}, loading: true, error: null });

		React.useEffect(() => {
			let cancelled = false;

			(async () => {
				try {
					// Resolve path — try with and without .md extension
					let file = app.vault.getAbstractFileByPath(path);
					if (!file) file = app.vault.getAbstractFileByPath(path + ".md");
					if (!file) {
						if (!cancelled) setState({ content: "", frontmatter: {}, loading: false, error: `Note not found: ${path}` });
						return;
					}

					const content = await app.vault.read(file as any);
					const cache = app.metadataCache.getFileCache(file as any);
					const frontmatter = cache?.frontmatter ?? {};

					if (!cancelled) setState({ content, frontmatter, loading: false, error: null });
				} catch (err: any) {
					if (!cancelled) setState({ content: "", frontmatter: {}, loading: false, error: err.message });
				}
			})();

			return () => { cancelled = true; };
		}, [path]);

		return state;
	};
}

// ============================================================
// useDataview — run a Dataview query, returns results
// ============================================================

function createUseDataview(app: App) {
	return function useDataview(query: string): {
		values: any[];
		headers: string[];
		loading: boolean;
		error: string | null;
	} {
		const [state, setState] = React.useState<{
			values: any[];
			headers: string[];
			loading: boolean;
			error: string | null;
		}>({ values: [], headers: [], loading: true, error: null });

		React.useEffect(() => {
			let cancelled = false;

			(async () => {
				try {
					// Get the Dataview API
					const dv = (app as any).plugins?.plugins?.dataview?.api;
					if (!dv) {
						if (!cancelled) setState({ values: [], headers: [], loading: false, error: "Dataview plugin not available" });
						return;
					}

					// Wait for Dataview index to be ready
					if (!dv.index?.initialized) {
						// Retry after a short delay
						await new Promise(r => setTimeout(r, 500));
					}

					// Determine query type and execute
					const trimmed = query.trim();
					let result: any;

					if (/^TABLE/i.test(trimmed)) {
						result = await dv.queryMarkdown(trimmed);
					} else if (/^LIST/i.test(trimmed)) {
						result = await dv.queryMarkdown(trimmed);
					} else if (/^TASK/i.test(trimmed)) {
						result = await dv.queryMarkdown(trimmed);
					} else {
						// Try as a generic query
						result = await dv.queryMarkdown(trimmed);
					}

					if (result?.successful === false) {
						if (!cancelled) setState({ values: [], headers: [], loading: false, error: result.error || "Query failed" });
						return;
					}

					// Try to get structured data via dv.query()
					try {
						const structured = await dv.query(trimmed);
						if (structured?.successful && structured.value) {
							const headers = structured.value.headers || [];
							const values = structured.value.values || [];
							if (!cancelled) setState({ values, headers, loading: false, error: null });
							return;
						}
					} catch {
						// Fall back to markdown result
					}

					// Return the markdown result as a single-value array
					if (!cancelled) setState({
						values: result?.value ? [[result.value]] : [],
						headers: ["result"],
						loading: false,
						error: null
					});
				} catch (err: any) {
					if (!cancelled) setState({ values: [], headers: [], loading: false, error: err.message });
				}
			})();

			return () => { cancelled = true; };
		}, [query]);

		return state;
	};
}

// ============================================================
// useQuery — generic async data hook with caching
// ============================================================

const queryCache = new Map<string, { data: any; timestamp: number }>();

function createUseQuery() {
	return function useQuery<T>(
		key: string,
		fetchFn: () => Promise<T>,
		options?: { cacheMs?: number }
	): {
		data: T | null;
		loading: boolean;
		error: string | null;
		refetch: () => void;
	} {
		const cacheMs = options?.cacheMs ?? 0;

		const [state, setState] = React.useState<{
			data: T | null;
			loading: boolean;
			error: string | null;
		}>(() => {
			// Check cache
			if (cacheMs > 0) {
				const cached = queryCache.get(key);
				if (cached && Date.now() - cached.timestamp < cacheMs) {
					return { data: cached.data, loading: false, error: null };
				}
			}
			return { data: null, loading: true, error: null };
		});

		const [fetchId, setFetchId] = React.useReducer((x: number) => x + 1, 0);

		React.useEffect(() => {
			let cancelled = false;

			// Check cache before fetching
			if (cacheMs > 0) {
				const cached = queryCache.get(key);
				if (cached && Date.now() - cached.timestamp < cacheMs) {
					setState({ data: cached.data, loading: false, error: null });
					return;
				}
			}

			setState(prev => ({ ...prev, loading: true, error: null }));

			fetchFn()
				.then(data => {
					if (!cancelled) {
						if (cacheMs > 0) {
							queryCache.set(key, { data, timestamp: Date.now() });
						}
						setState({ data, loading: false, error: null });
					}
				})
				.catch(err => {
					if (!cancelled) {
						setState({ data: null, loading: false, error: err.message || String(err) });
					}
				});

			return () => { cancelled = true; };
		}, [key, fetchId]);

		const refetch = React.useCallback(() => {
			queryCache.delete(key);
			setFetchId();
		}, [key]);

		return { ...state, refetch };
	};
}

// ============================================================
// Style — scoped CSS component
// ============================================================

let styleIdCounter = 0;

function createStyleComponent() {
	return function Style(props: { children: string }) {
		const idRef = React.useRef(`rr-scope-${++styleIdCounter}`);
		const containerRef = React.useRef<HTMLDivElement>(null);

		React.useEffect(() => {
			// Find the closest react-renderer-container and add our scope class
			const el = containerRef.current;
			if (!el) return;
			const container = el.closest(".react-renderer-container");
			if (container) {
				container.classList.add(idRef.current);
			}
		}, []);

		// Scope all CSS rules by prepending the scope class
		const scopedCss = React.useMemo(() => {
			const scopeClass = `.${idRef.current}`;
			return props.children.replace(
				/([^{}]+)\{/g,
				(match, selectors: string) => {
					const scoped = selectors
						.split(",")
						.map((s: string) => `${scopeClass} ${s.trim()}`)
						.join(", ");
					return `${scoped} {`;
				}
			);
		}, [props.children]);

		return React.createElement(
			React.Fragment,
			null,
			React.createElement("div", { ref: containerRef, style: { display: "none" } }),
			React.createElement("style", null, scopedCss)
		);
	};
}

// ============================================================
// importFromUrl — load ES modules from CDN
// ============================================================

const urlImportCache = new Map<string, any>();

function createUseImport() {
	return function useImport(url: string): {
		module: any;
		loading: boolean;
		error: string | null;
	} {
		const [state, setState] = React.useState<{
			module: any;
			loading: boolean;
			error: string | null;
		}>(() => {
			const cached = urlImportCache.get(url);
			if (cached) return { module: cached, loading: false, error: null };
			return { module: null, loading: true, error: null };
		});

		React.useEffect(() => {
			if (urlImportCache.has(url)) {
				setState({ module: urlImportCache.get(url), loading: false, error: null });
				return;
			}

			let cancelled = false;

			// Dynamic import from URL
			(async () => {
				try {
					// Use eval to bypass bundler interception of import()
					const importFn = new Function("url", "return import(url)");
					const mod = await importFn(url);
					if (!cancelled) {
						urlImportCache.set(url, mod);
						setState({ module: mod, loading: false, error: null });
					}
				} catch (err: any) {
					if (!cancelled) {
						setState({ module: null, loading: false, error: err.message || String(err) });
					}
				}
			})();

			return () => { cancelled = true; };
		}, [url]);

		return state;
	};
}

// ============================================================
// useCanvas — draw on a canvas element
// ============================================================

function createUseCanvas() {
	return function useCanvas(
		drawFn: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
		deps: any[] = []
	): React.RefObject<HTMLCanvasElement | null> {
		const canvasRef = React.useRef<HTMLCanvasElement>(null);

		React.useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			// Clear and redraw
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			drawFn(ctx, canvas);
		}, deps);

		return canvasRef;
	};
}

// ============================================================
// useSearch — full-text search across vault
// ============================================================

function createUseSearch(app: App) {
	return function useSearch(query: string, maxResults = 20): {
		results: Array<{ path: string; name: string; matches: string[] }>;
		loading: boolean;
	} {
		const [state, setState] = React.useState<{
			results: Array<{ path: string; name: string; matches: string[] }>;
			loading: boolean;
		}>({ results: [], loading: true });

		React.useEffect(() => {
			if (!query.trim()) {
				setState({ results: [], loading: false });
				return;
			}

			let cancelled = false;
			const lowerQuery = query.toLowerCase();

			(async () => {
				const results: Array<{ path: string; name: string; matches: string[] }> = [];

				for (const file of app.vault.getMarkdownFiles()) {
					if (results.length >= maxResults) break;

					try {
						const content = await app.vault.cachedRead(file);
						const lines = content.split("\n");
						const matches: string[] = [];

						for (const line of lines) {
							if (line.toLowerCase().includes(lowerQuery)) {
								matches.push(line.trim().slice(0, 120));
								if (matches.length >= 3) break;
							}
						}

						if (matches.length > 0) {
							results.push({
								path: file.path,
								name: file.basename,
								matches,
							});
						}
					} catch {
						// Skip unreadable files
					}
				}

				if (!cancelled) setState({ results, loading: false });
			})();

			return () => { cancelled = true; };
		}, [query]);

		return state;
	};
}

// ============================================================
// useTags — get all tags or files with a specific tag
// ============================================================

function createUseTags(app: App) {
	return function useTags(filterTag?: string): {
		tags: Array<{ tag: string; count: number }>;
		files: Array<{ path: string; name: string }>;
	} {
		const [state, setState] = React.useState<{
			tags: Array<{ tag: string; count: number }>;
			files: Array<{ path: string; name: string }>;
		}>({ tags: [], files: [] });

		React.useEffect(() => {
			const tagMap = new Map<string, Set<string>>();

			for (const file of app.vault.getMarkdownFiles()) {
				const cache = app.metadataCache.getFileCache(file);
				if (!cache) continue;

				const fileTags = new Set<string>();

				// From frontmatter tags
				if (cache.frontmatter?.tags) {
					const fmTags = Array.isArray(cache.frontmatter.tags)
						? cache.frontmatter.tags
						: [cache.frontmatter.tags];
					for (const t of fmTags) {
						fileTags.add(String(t).startsWith("#") ? String(t) : `#${t}`);
					}
				}

				// From inline tags
				if (cache.tags) {
					for (const t of cache.tags) {
						fileTags.add(t.tag);
					}
				}

				for (const tag of fileTags) {
					if (!tagMap.has(tag)) tagMap.set(tag, new Set());
					tagMap.get(tag)!.add(file.path);
				}
			}

			const tags = Array.from(tagMap.entries())
				.map(([tag, paths]) => ({ tag, count: paths.size }))
				.sort((a, b) => b.count - a.count);

			let files: Array<{ path: string; name: string }> = [];
			if (filterTag) {
				const normalizedTag = filterTag.startsWith("#") ? filterTag : `#${filterTag}`;
				const matchingPaths = tagMap.get(normalizedTag);
				if (matchingPaths) {
					files = Array.from(matchingPaths).map(p => {
						const f = app.vault.getAbstractFileByPath(p);
						return { path: p, name: (f as any)?.basename || p };
					});
				}
			}

			setState({ tags, files });
		}, [filterTag]);

		return state;
	};
}

// ============================================================
// buildScope — assemble the full scope object
// ============================================================

/**
 * Build the scope object injected into user component code.
 * Components are exposed as dynamic getters so references stay fresh.
 */
export function buildScope(registry: ComponentRegistry, app: App): Record<string, any> {
	// Initialize persistent state
	initPersistent(app);

	const scope: Record<string, any> = {
		// React core
		React,
		// All hooks
		useState: React.useState,
		useEffect: React.useEffect,
		useCallback: React.useCallback,
		useMemo: React.useMemo,
		useReducer: React.useReducer,
		useRef: React.useRef,
		useContext: React.useContext,
		useId: React.useId,
		useSyncExternalStore: React.useSyncExternalStore,
		useTransition: React.useTransition,
		useDeferredValue: React.useDeferredValue,
		// Obsidian
		app,
		// Plugin helpers
		useSharedState,
		usePersistentState,
		useFrontmatter: createUseFrontmatter(app),
		useTheme: createUseTheme(),
		useNote: createUseNote(app),
		useDataview: createUseDataview(app),
		useQuery: createUseQuery(),
		useImport: createUseImport(),
		useCanvas: createUseCanvas(),
		useSearch: createUseSearch(app),
		useTags: createUseTags(app),
		Style: createStyleComponent(),
	};

	// Lazy-inject obsidian module (loaded on first access)
	let obsidianModule: any = null;
	Object.defineProperty(scope, "obsidian", {
		get: () => {
			if (!obsidianModule) {
				obsidianModule = require("obsidian");
			}
			return obsidianModule;
		},
		enumerable: true,
	});

	// Dynamic getters for all registered components
	for (const name of registry.getNames()) {
		Object.defineProperty(scope, name, {
			get: () => {
				const entry = registry.get(name);
				return entry?.component ?? (() => null);
			},
			enumerable: true,
			configurable: true,
		});
	}

	return scope;
}

/**
 * Generate scope destructuring code: `const {React, useState, ...} = scope;`
 */
export function getScopeExpression(
	registry: ComponentRegistry,
	app: App
): string {
	const scope = buildScope(registry, app);
	const keys = Object.keys(scope).filter((k) => /^[a-zA-Z_$][\w$]*$/.test(k));
	return `const {${keys.join(",")}} = scope;`;
}

/** Clear shared state (for plugin unload) */
export function clearSharedState(): void {
	sharedStateStore.clear();
	persistentData = {};
	persistentDirty = false;
	if (persistentSaveTimer) clearTimeout(persistentSaveTimer);
}

/** Load persistent state on plugin startup */
export async function loadPersistent(app: App): Promise<void> {
	await loadPersistentData(app);
}
