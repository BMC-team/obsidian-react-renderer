import React from "react";
import type { App } from "obsidian";
import { ComponentRegistry } from "../registry/ComponentRegistry";
import { processManager } from "./ProcessManager";

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
// Chart components — built on canvas
// ============================================================

function createChartComponents() {
	function LineChart(props: {
		data: number[];
		width?: number;
		height?: number;
		color?: string;
		fillColor?: string;
		showDots?: boolean;
		showGrid?: boolean;
		label?: string;
		min?: number;
		max?: number;
	}) {
		const {
			data, width = 400, height = 120, color = "#4a9eff",
			fillColor, showDots = false, showGrid = true, label,
			min: forceMin, max: forceMax,
		} = props;

		const canvasRef = React.useRef<HTMLCanvasElement>(null);

		React.useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas || !data.length) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const w = canvas.width;
			const h = canvas.height;
			const minVal = forceMin ?? Math.min(...data);
			const maxVal = forceMax ?? Math.max(...data);
			const range = maxVal - minVal || 1;
			const step = w / (data.length - 1);

			ctx.clearRect(0, 0, w, h);

			if (showGrid) {
				ctx.strokeStyle = "rgba(128,128,128,0.12)";
				ctx.lineWidth = 1;
				for (let i = 0; i <= 4; i++) {
					const y = (i / 4) * h;
					ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
				}
			}

			// Line
			ctx.strokeStyle = color;
			ctx.lineWidth = 2;
			ctx.lineJoin = "round";
			ctx.beginPath();
			data.forEach((v, i) => {
				const x = i * step;
				const y = h - ((v - minVal) / range) * h;
				if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
			});
			ctx.stroke();

			// Fill
			if (fillColor) {
				ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
				ctx.fillStyle = fillColor;
				ctx.fill();
			}

			// Dots
			if (showDots) {
				ctx.fillStyle = color;
				data.forEach((v, i) => {
					const x = i * step;
					const y = h - ((v - minVal) / range) * h;
					ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
				});
			}

			// Label
			if (label) {
				ctx.fillStyle = "rgba(128,128,128,0.5)";
				ctx.font = "11px var(--font-interface)";
				ctx.fillText(label, 4, 14);
			}
		}, [data, color, fillColor, showDots, showGrid, label, forceMin, forceMax]);

		return React.createElement("canvas", {
			ref: canvasRef, width, height,
			style: { width: "100%", height: height + "px", borderRadius: "4px" },
		});
	}

	function BarChart(props: {
		data: Array<{ label: string; value: number; color?: string }>;
		width?: number;
		height?: number;
		color?: string;
		showValues?: boolean;
	}) {
		const {
			data, width = 400, height = 150, color = "#4a9eff", showValues = true,
		} = props;

		const canvasRef = React.useRef<HTMLCanvasElement>(null);

		React.useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas || !data.length) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const w = canvas.width;
			const h = canvas.height;
			const maxVal = Math.max(...data.map(d => d.value)) || 1;
			const barWidth = (w / data.length) * 0.7;
			const gap = (w / data.length) * 0.3;
			const labelSpace = 20;

			ctx.clearRect(0, 0, w, h);

			data.forEach((d, i) => {
				const x = i * (w / data.length) + gap / 2;
				const barH = ((d.value / maxVal) * (h - labelSpace - 10));
				const y = h - labelSpace - barH;

				// Bar
				ctx.fillStyle = d.color || color;
				ctx.beginPath();
				ctx.roundRect(x, y, barWidth, barH, 3);
				ctx.fill();

				// Value
				if (showValues) {
					ctx.fillStyle = "rgba(128,128,128,0.7)";
					ctx.font = "10px var(--font-interface)";
					ctx.textAlign = "center";
					ctx.fillText(String(d.value), x + barWidth / 2, y - 4);
				}

				// Label
				ctx.fillStyle = "rgba(128,128,128,0.5)";
				ctx.font = "10px var(--font-interface)";
				ctx.textAlign = "center";
				ctx.fillText(d.label, x + barWidth / 2, h - 4);
			});
		}, [data, color, showValues]);

		return React.createElement("canvas", {
			ref: canvasRef, width, height,
			style: { width: "100%", height: height + "px", borderRadius: "4px" },
		});
	}

	function PieChart(props: {
		data: Array<{ label: string; value: number; color: string }>;
		width?: number;
		height?: number;
		showLabels?: boolean;
		donut?: boolean;
	}) {
		const {
			data, width = 200, height = 200, showLabels = true, donut = false,
		} = props;

		const canvasRef = React.useRef<HTMLCanvasElement>(null);

		React.useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas || !data.length) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const w = canvas.width;
			const h = canvas.height;
			const cx = w / 2;
			const cy = h / 2;
			const r = Math.min(cx, cy) - (showLabels ? 30 : 10);
			const total = data.reduce((s, d) => s + d.value, 0) || 1;

			ctx.clearRect(0, 0, w, h);

			let startAngle = -Math.PI / 2;
			data.forEach(d => {
				const sliceAngle = (d.value / total) * Math.PI * 2;
				const endAngle = startAngle + sliceAngle;

				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.arc(cx, cy, r, startAngle, endAngle);
				ctx.closePath();
				ctx.fillStyle = d.color;
				ctx.fill();

				// Label
				if (showLabels && sliceAngle > 0.3) {
					const midAngle = startAngle + sliceAngle / 2;
					const lx = cx + Math.cos(midAngle) * (r * 0.65);
					const ly = cy + Math.sin(midAngle) * (r * 0.65);
					ctx.fillStyle = "#fff";
					ctx.font = "bold 10px var(--font-interface)";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(d.label, lx, ly);
				}

				startAngle = endAngle;
			});

			// Donut hole
			if (donut) {
				ctx.beginPath();
				ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
				ctx.fillStyle = "var(--background-primary)";
				ctx.fill();
			}
		}, [data, showLabels, donut]);

		return React.createElement("canvas", {
			ref: canvasRef, width, height,
			style: { width: width + "px", height: height + "px" },
		});
	}

	function GaugeChart(props: {
		value: number;
		max?: number;
		width?: number;
		height?: number;
		label?: string;
		color?: string;
		thresholds?: { green: number; yellow: number };
	}) {
		const {
			value, max = 100, width = 200, height = 120, label = "",
			color, thresholds = { green: 80, yellow: 40 },
		} = props;

		const canvasRef = React.useRef<HTMLCanvasElement>(null);

		React.useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const w = canvas.width;
			const h = canvas.height;
			const cx = w / 2;
			const cy = h - 8;
			const r = Math.min(cx, cy) - 8;
			const pct = Math.min(100, Math.max(0, (value / max) * 100));
			const angle = Math.PI + (pct / 100) * Math.PI;

			ctx.clearRect(0, 0, w, h);

			// Background arc
			ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0);
			ctx.lineWidth = 14; ctx.strokeStyle = "rgba(128,128,128,0.12)"; ctx.stroke();

			// Value arc
			const arcColor = color || (pct >= thresholds.green ? "#4caf50" : pct >= thresholds.yellow ? "#ff9800" : "#f44336");
			ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, angle);
			ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.strokeStyle = arcColor; ctx.stroke();

			// Value text
			ctx.fillStyle = arcColor;
			ctx.font = "bold 22px var(--font-interface)";
			ctx.textAlign = "center";
			ctx.fillText(Math.round(value) + (max === 100 ? "%" : ""), cx, cy - 12);

			// Label
			if (label) {
				ctx.fillStyle = "rgba(128,128,128,0.5)";
				ctx.font = "11px var(--font-interface)";
				ctx.fillText(label, cx, cy + 6);
			}
		}, [value, max, color, label, thresholds]);

		return React.createElement("canvas", {
			ref: canvasRef, width, height,
			style: { display: "block", margin: "0 auto" },
		});
	}

	return { LineChart, BarChart, PieChart, GaugeChart };
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
// useInterval / useTimeout — auto-cleanup timer hooks
// ============================================================

function createUseInterval() {
	return function useInterval(callback: () => void, delayMs: number | null): void {
		const savedCallback = React.useRef(callback);

		React.useEffect(() => {
			savedCallback.current = callback;
		}, [callback]);

		React.useEffect(() => {
			if (delayMs === null) return;
			const id = setInterval(() => savedCallback.current(), delayMs);
			return () => clearInterval(id);
		}, [delayMs]);
	};
}

function createUseTimeout() {
	return function useTimeout(callback: () => void, delayMs: number | null): void {
		const savedCallback = React.useRef(callback);

		React.useEffect(() => {
			savedCallback.current = callback;
		}, [callback]);

		React.useEffect(() => {
			if (delayMs === null) return;
			const id = setTimeout(() => savedCallback.current(), delayMs);
			return () => clearTimeout(id);
		}, [delayMs]);
	};
}

// ============================================================
// Table — built-in sortable/searchable data table
// ============================================================

function createTableComponent() {
	return function Table(props: {
		columns: Array<{ key: string; label: string; align?: string; width?: string; render?: (value: any, row: any) => any }>;
		data: any[];
		sortable?: boolean;
		searchable?: boolean;
		selectable?: boolean;
		onSelect?: (selected: any[]) => void;
		pageSize?: number;
	}) {
		const {
			columns, data, sortable = true, searchable = false,
			selectable = false, onSelect, pageSize = 0,
		} = props;

		const [sortCol, setSortCol] = React.useState("");
		const [sortAsc, setSortAsc] = React.useState(true);
		const [search, setSearch] = React.useState("");
		const [selected, setSelected] = React.useState<Set<number>>(new Set());
		const [page, setPage] = React.useState(0);

		const toggleSort = (key: string) => {
			if (sortCol === key) setSortAsc(!sortAsc);
			else { setSortCol(key); setSortAsc(true); }
		};

		const toggleSelect = (idx: number) => {
			setSelected(prev => {
				const next = new Set(prev);
				if (next.has(idx)) next.delete(idx); else next.add(idx);
				if (onSelect) onSelect(Array.from(next).map(i => data[i]));
				return next;
			});
		};

		let filtered = data;
		if (search) {
			const q = search.toLowerCase();
			filtered = data.filter(row =>
				columns.some(col => String(row[col.key] ?? "").toLowerCase().includes(q))
			);
		}

		if (sortCol) {
			filtered = [...filtered].sort((a, b) => {
				const av = a[sortCol], bv = b[sortCol];
				const cmp = typeof av === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
				return sortAsc ? cmp : -cmp;
			});
		}

		const totalPages = pageSize > 0 ? Math.ceil(filtered.length / pageSize) : 1;
		const paged = pageSize > 0 ? filtered.slice(page * pageSize, (page + 1) * pageSize) : filtered;

		const thStyle = (col: any): any => ({
			padding: "6px 10px", cursor: sortable ? "pointer" : "default",
			fontSize: "11px", fontWeight: "bold", textAlign: col.align || "left",
			width: col.width || "auto",
			color: sortCol === col.key ? "var(--interactive-accent)" : "var(--text-muted)",
			borderBottom: "2px solid var(--background-modifier-border)",
			userSelect: "none" as const,
		});

		const tdStyle = (align?: string): any => ({
			padding: "5px 10px", fontSize: "12px", textAlign: align || "left",
			borderBottom: "1px solid var(--background-modifier-border)",
		});

		return React.createElement("div", null,
			searchable && React.createElement("input", {
				value: search, onChange: (e: any) => { setSearch(e.target.value); setPage(0); },
				placeholder: "Search...",
				style: { width: "100%", padding: "5px 10px", borderRadius: "4px", border: "1px solid var(--background-modifier-border)", fontSize: "12px", marginBottom: "8px" },
			}),
			React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
				React.createElement("thead", null,
					React.createElement("tr", null,
						selectable && React.createElement("th", { style: { ...tdStyle(), width: "30px" } }),
						columns.map(col =>
							React.createElement("th", {
								key: col.key,
								style: thStyle(col),
								onClick: sortable ? () => toggleSort(col.key) : undefined,
							}, col.label, sortCol === col.key ? (sortAsc ? " ▲" : " ▼") : "")
						)
					)
				),
				React.createElement("tbody", null,
					paged.map((row, i) => {
						const dataIdx = pageSize > 0 ? page * pageSize + i : i;
						return React.createElement("tr", {
							key: dataIdx,
							style: { backgroundColor: selected.has(dataIdx) ? "var(--background-modifier-hover)" : "transparent" },
						},
							selectable && React.createElement("td", { style: tdStyle() },
								React.createElement("input", {
									type: "checkbox", checked: selected.has(dataIdx),
									onChange: () => toggleSelect(dataIdx),
									style: { cursor: "pointer" },
								})
							),
							columns.map(col =>
								React.createElement("td", { key: col.key, style: tdStyle(col.align) },
									col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")
								)
							)
						);
					})
				)
			),
			React.createElement("div", {
				style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-muted)", padding: "6px 0" },
			},
				React.createElement("span", null, `${filtered.length} rows${selected.size > 0 ? ` · ${selected.size} selected` : ""}`),
				totalPages > 1 && React.createElement("div", { style: { display: "flex", gap: "4px" } },
					React.createElement("button", { onClick: () => setPage(p => Math.max(0, p - 1)), disabled: page === 0, style: { padding: "2px 8px", cursor: "pointer", fontSize: "11px" } }, "Prev"),
					React.createElement("span", null, `${page + 1}/${totalPages}`),
					React.createElement("button", { onClick: () => setPage(p => Math.min(totalPages - 1, p + 1)), disabled: page >= totalPages - 1, style: { padding: "2px 8px", cursor: "pointer", fontSize: "11px" } }, "Next"),
				)
			)
		);
	};
}

// ============================================================
// Tabs — tab switcher component
// ============================================================

function createTabsComponent() {
	return function Tabs(props: {
		tabs: string[];
		active: string;
		onChange: (tab: string) => void;
		variant?: "pills" | "underline";
	}) {
		const { tabs, active, onChange, variant = "underline" } = props;

		const isPills = variant === "pills";

		return React.createElement("div", {
			style: {
				display: "flex", gap: isPills ? "6px" : "0",
				borderBottom: isPills ? "none" : "2px solid var(--background-modifier-border)",
				marginBottom: "12px",
			},
		},
			tabs.map(tab =>
				React.createElement("div", {
					key: tab,
					onClick: () => onChange(tab),
					style: {
						padding: isPills ? "4px 14px" : "8px 16px",
						cursor: "pointer", fontSize: "13px",
						fontWeight: active === tab ? "bold" : "normal",
						color: active === tab ? (isPills ? "#fff" : "var(--interactive-accent)") : "var(--text-muted)",
						backgroundColor: isPills && active === tab ? "var(--interactive-accent)" : "transparent",
						borderRadius: isPills ? "16px" : "0",
						borderBottom: !isPills && active === tab ? "2px solid var(--interactive-accent)" : "2px solid transparent",
						marginBottom: isPills ? "0" : "-2px",
						transition: "all 0.15s ease",
					},
				}, tab)
			)
		);
	};
}

// ============================================================
// Input / Select — styled form controls
// ============================================================

function createFormComponents() {
	const inputStyle: any = {
		width: "100%", padding: "6px 10px", borderRadius: "4px",
		border: "1px solid var(--background-modifier-border)",
		backgroundColor: "var(--background-primary)",
		color: "var(--text-normal)", fontSize: "13px",
	};

	function Input(props: {
		value: string;
		onChange: (value: string) => void;
		placeholder?: string;
		type?: string;
		label?: string;
		style?: any;
	}) {
		const { value, onChange, placeholder, type = "text", label, style } = props;
		return React.createElement("div", { style: { marginBottom: "8px" } },
			label && React.createElement("label", {
				style: { display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" },
			}, label),
			React.createElement("input", {
				value, type, placeholder,
				onChange: (e: any) => onChange(e.target.value),
				style: { ...inputStyle, ...style },
			})
		);
	}

	function Select(props: {
		value: string;
		onChange: (value: string) => void;
		options: Array<string | { label: string; value: string }>;
		label?: string;
		style?: any;
	}) {
		const { value, onChange, options, label, style } = props;
		return React.createElement("div", { style: { marginBottom: "8px" } },
			label && React.createElement("label", {
				style: { display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" },
			}, label),
			React.createElement("select", {
				value,
				onChange: (e: any) => onChange(e.target.value),
				style: { ...inputStyle, ...style },
			},
				options.map(opt => {
					const val = typeof opt === "string" ? opt : opt.value;
					const lbl = typeof opt === "string" ? opt : opt.label;
					return React.createElement("option", { key: val, value: val }, lbl);
				})
			)
		);
	}

	return { Input, Select };
}

// ============================================================
// useBacklinks — notes that link to the current note
// ============================================================

function createUseBacklinks(app: App) {
	return function useBacklinks(): Array<{ path: string; name: string }> {
		const [backlinks, setBacklinks] = React.useState<Array<{ path: string; name: string }>>([]);

		React.useEffect(() => {
			const activeFile = app.workspace.getActiveFile();
			if (!activeFile) return;

			const result: Array<{ path: string; name: string }> = [];
			const resolvedLinks = (app.metadataCache as any).resolvedLinks || {};

			for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
				if (links && typeof links === "object" && activeFile.path in (links as any)) {
					const file = app.vault.getAbstractFileByPath(sourcePath);
					if (file) {
						result.push({ path: sourcePath, name: (file as any).basename || sourcePath });
					}
				}
			}

			setBacklinks(result.sort((a, b) => a.name.localeCompare(b.name)));
		}, []);

		return backlinks;
	};
}

// ============================================================
// useFileContent — read a file with live updates on change
// ============================================================

function createUseFileContent(app: App) {
	return function useFileContent(path: string): {
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

			const readFile = async () => {
				try {
					let file = app.vault.getAbstractFileByPath(path);
					if (!file) file = app.vault.getAbstractFileByPath(path + ".md");
					if (!file) {
						if (!cancelled) setState({ content: "", frontmatter: {}, loading: false, error: `Not found: ${path}` });
						return;
					}
					const content = await app.vault.read(file as any);
					const cache = app.metadataCache.getFileCache(file as any);
					if (!cancelled) setState({ content, frontmatter: cache?.frontmatter ?? {}, loading: false, error: null });
				} catch (err: any) {
					if (!cancelled) setState({ content: "", frontmatter: {}, loading: false, error: err.message });
				}
			};

			readFile();

			// Watch for changes to this file
			const ref = app.vault.on("modify", (modified) => {
				if (modified.path === path || modified.path === path + ".md") {
					readFile();
				}
			});

			return () => {
				cancelled = true;
				app.vault.offref(ref);
			};
		}, [path]);

		return state;
	};
}

// ============================================================
// usePlugin — access any installed plugin's API
// ============================================================

function createUsePlugin(app: App) {
	return function usePlugin(pluginId: string): any {
		const [api, setApi] = React.useState<any>(null);

		React.useEffect(() => {
			const plugin = (app as any).plugins?.plugins?.[pluginId];
			if (plugin) {
				setApi(plugin.api || plugin);
			}
		}, [pluginId]);

		return api;
	};
}

// ============================================================
// useProcess — execute system commands with terminal output
// ============================================================

function createUseProcess(getSettings: () => any) {
	return function useProcess(processId?: string): {
		run: (cmd: string, options?: { cwd?: string; shell?: string }) => boolean;
		write: (input: string) => void;
		kill: () => void;
		output: string[];
		running: boolean;
		exitCode: number | null;
		clear: () => void;
		id: string;
		listAll: () => Array<{ id: string; cmd: string; running: boolean; exitCode: number | null }>;
	} {
		const id = React.useRef(processId || `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).current;
		const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

		// Subscribe to process updates — triggers re-render when output changes
		React.useEffect(() => {
			return processManager.subscribe(id, forceUpdate);
		}, [id]);

		const entry = processManager.getProcess(id);

		const run = React.useCallback((cmd: string, options?: { cwd?: string; shell?: string }) => {
			const settings = getSettings();
			if (!settings.enableScriptExecution) {
				processManager.run(id, "echo [ERROR] Script execution is disabled in settings.", {});
				return false;
			}
			if (settings.scriptConfirmBeforeRun) {
				if (!confirm(`Execute command?\n\n${cmd}\n\nCwd: ${options?.cwd || "(default)"}`)) {
					return false;
				}
			}
			processManager.run(id, cmd, options);
			return true;
		}, [id]);

		const write = React.useCallback((input: string) => {
			processManager.write(id, input);
		}, [id]);

		const kill = React.useCallback(() => {
			processManager.kill(id);
		}, [id]);

		const clear = React.useCallback(() => {
			processManager.clearOutput(id);
		}, [id]);

		const listAll = React.useCallback(() => {
			return processManager.listAll().map(p => ({
				id: p.id, cmd: p.cmd, running: p.running, exitCode: p.exitCode,
			}));
		}, []);

		// Do NOT kill on unmount — process persists across page navigations

		return {
			run, write, kill, clear, id, listAll,
			output: entry?.output || [],
			running: entry?.running || false,
			exitCode: entry?.exitCode ?? null,
		};
	};
}

// ============================================================
// Terminal — built-in terminal display component
// ============================================================

function createTerminalComponent() {
	return function Terminal(props: {
		output: string[];
		running?: boolean;
		exitCode?: number | null;
		onInput?: (input: string) => void;
		onKill?: () => void;
		onClear?: () => void;
		height?: string;
		title?: string;
	}) {
		const {
			output, running = false, exitCode = null,
			onInput, onKill, onClear, height = "300px", title = "Terminal",
		} = props;
		const [input, setInput] = React.useState("");
		const bottomRef = React.useRef<HTMLDivElement>(null);

		// Auto-scroll to bottom
		React.useEffect(() => {
			if (bottomRef.current) {
				bottomRef.current.scrollIntoView({ behavior: "smooth" });
			}
		}, [output.length]);

		const handleKeyDown = (e: any) => {
			if (e.key === "Enter" && onInput && input.trim()) {
				onInput(input);
				setInput("");
			}
		};

		const statusColor = running ? "#4caf50" : exitCode === 0 ? "#4caf50" : exitCode !== null ? "#f44336" : "var(--text-muted)";
		const statusText = running ? "Running" : exitCode !== null ? `Exit: ${exitCode}` : "Idle";

		return React.createElement("div", {
			style: {
				border: "1px solid var(--background-modifier-border)",
				borderRadius: "6px", overflow: "hidden",
				fontFamily: "var(--font-monospace)", fontSize: "12px",
			},
		},
			// Header
			React.createElement("div", {
				style: {
					display: "flex", alignItems: "center", gap: "8px",
					padding: "6px 10px", backgroundColor: "#1e1e1e", color: "#ccc",
				},
			},
				React.createElement("span", {
					style: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: statusColor },
				}),
				React.createElement("span", { style: { flex: 1, fontSize: "11px" } }, title),
				React.createElement("span", { style: { fontSize: "10px", color: "#888" } }, statusText),
				running && onKill && React.createElement("button", {
					onClick: onKill,
					style: {
						padding: "1px 8px", fontSize: "10px", borderRadius: "3px",
						border: "1px solid #f44336", background: "transparent",
						color: "#f44336", cursor: "pointer",
					},
				}, "Kill"),
				onClear && React.createElement("button", {
					onClick: onClear,
					style: {
						padding: "1px 8px", fontSize: "10px", borderRadius: "3px",
						border: "1px solid #666", background: "transparent",
						color: "#888", cursor: "pointer",
					},
				}, "Clear"),
			),
			// Output
			React.createElement("div", {
				style: {
					backgroundColor: "#1a1a1a", color: "#d4d4d4",
					padding: "8px 10px", height, overflowY: "auto",
					whiteSpace: "pre-wrap", wordBreak: "break-all",
					lineHeight: "1.5",
				},
			},
				output.map((line, i) =>
					React.createElement("div", {
						key: i,
						style: {
							color: line.startsWith("[stderr]") ? "#f44336" :
								line.startsWith("[ERROR]") ? "#f44336" :
								line.startsWith("[CANCELLED]") ? "#ff9800" :
								line.startsWith("[Process exited") ? "#888" :
								line.startsWith("[SIGTERM") ? "#ff9800" :
								line.startsWith("$") ? "#4ec9b0" :
								line.startsWith(">") ? "#569cd6" :
								"#d4d4d4",
						},
					}, line)
				),
				React.createElement("div", { ref: bottomRef }),
			),
			// Input
			onInput && React.createElement("div", {
				style: {
					display: "flex", backgroundColor: "#252526",
					borderTop: "1px solid #333",
				},
			},
				React.createElement("span", {
					style: { padding: "6px 8px", color: "#569cd6" },
				}, ">"),
				React.createElement("input", {
					value: input,
					onChange: (e: any) => setInput(e.target.value),
					onKeyDown: handleKeyDown,
					placeholder: running ? "Type input..." : "Process not running",
					disabled: !running,
					style: {
						flex: 1, padding: "6px 0", border: "none",
						backgroundColor: "transparent", color: "#d4d4d4",
						fontFamily: "var(--font-monospace)", fontSize: "12px",
						outline: "none",
					},
				}),
			),
		);
	};
}

// ============================================================
// useClaudeTask — write task files for Claude to pick up
// ============================================================

function createUseClaudeTask(app: App, getSettings: () => any) {
	return function useClaudeTask(): {
		createTask: (title: string, prompt: string, metadata?: Record<string, any>) => Promise<string | null>;
		listTasks: () => Promise<Array<{ name: string; path: string }>>;
	} {
		const createTask = React.useCallback(async (
			title: string,
			prompt: string,
			metadata?: Record<string, any>
		): Promise<string | null> => {
			const settings = getSettings();
			if (!settings.claudeTasksFolder) {
				console.error("[ReactRenderer] Claude tasks folder not configured");
				return null;
			}

			const folder = app.vault.getAbstractFileByPath(settings.claudeTasksFolder);
			if (!folder) {
				await app.vault.createFolder(settings.claudeTasksFolder);
			}

			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const safeName = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
			const fileName = `${settings.claudeTasksFolder}/${timestamp}-${safeName}.md`;

			const content = [
				"---",
				`title: "${title}"`,
				`status: pending`,
				`created: ${new Date().toISOString()}`,
				...(metadata ? Object.entries(metadata).map(([k, v]) => `${k}: ${JSON.stringify(v)}`) : []),
				"---",
				"",
				`# ${title}`,
				"",
				prompt,
			].join("\n");

			await app.vault.create(fileName, content);
			return fileName;
		}, []);

		const listTasks = React.useCallback(async (): Promise<Array<{ name: string; path: string }>> => {
			const settings = getSettings();
			if (!settings.claudeTasksFolder) return [];

			const folder = app.vault.getAbstractFileByPath(settings.claudeTasksFolder);
			if (!folder) return [];

			return app.vault.getMarkdownFiles()
				.filter(f => f.path.startsWith(settings.claudeTasksFolder + "/"))
				.map(f => ({ name: f.basename, path: f.path }));
		}, []);

		return { createTask, listTasks };
	};
}

// ============================================================
// useClaude — run Claude CLI
// ============================================================

function createUseClaude(getSettings: () => any) {
	return function useClaude(sessionId?: string): {
		ask: (prompt: string, options?: { cwd?: string }) => boolean;
		output: string[];
		running: boolean;
		kill: () => void;
		clear: () => void;
	} {
		const id = React.useRef(sessionId || `claude-${Date.now()}`).current;
		const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

		React.useEffect(() => {
			return processManager.subscribe(id, forceUpdate);
		}, [id]);

		const entry = processManager.getProcess(id);

		const ask = React.useCallback((prompt: string, options?: { cwd?: string }) => {
			const settings = getSettings();
			if (!settings.enableScriptExecution) {
				return false;
			}
			if (settings.scriptConfirmBeforeRun) {
				if (!confirm(`Run Claude CLI?\n\nPrompt: ${prompt.slice(0, 200)}${prompt.length > 200 ? "..." : ""}`)) {
					return false;
				}
			}

			const cliPath = settings.claudeCliPath || "claude";
			processManager.run(id, `${cliPath} --print "${prompt.replace(/"/g, '\\"')}"`, options);
			return true;
		}, [id]);

		return {
			ask,
			output: entry?.output || [],
			running: entry?.running || false,
			kill: () => processManager.kill(id),
			clear: () => processManager.clearOutput(id),
		};
	};
}

// ============================================================
// buildScope — assemble the full scope object
// ============================================================

/**
 * Build the scope object injected into user component code.
 * Components are exposed as dynamic getters so references stay fresh.
 */
export function buildScope(registry: ComponentRegistry, app: App, getSettings?: () => any): Record<string, any> {
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
		...createChartComponents(),
		Table: createTableComponent(),
		Tabs: createTabsComponent(),
		...createFormComponents(),
		useInterval: createUseInterval(),
		useTimeout: createUseTimeout(),
		useBacklinks: createUseBacklinks(app),
		useFileContent: createUseFileContent(app),
		usePlugin: createUsePlugin(app),
		useProcess: createUseProcess(getSettings || (() => ({}))),
		useClaude: createUseClaude(getSettings || (() => ({}))),
		useClaudeTask: createUseClaudeTask(app, getSettings || (() => ({}))),
		Terminal: createTerminalComponent(),
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

	// Dynamic getters for all currently registered components
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

	// Wrap in Proxy to catch access to components registered AFTER
	// scope creation. with(__scope__) checks `has` trap first —
	// if a property isn't on scope but IS in the registry, the proxy
	// intercepts it. This permanently solves component timing issues.
	return new Proxy(scope, {
		has(target, prop) {
			if (prop in target) return true;
			if (typeof prop === "string" && registry.has(prop)) return true;
			return false;
		},
		get(target, prop) {
			if (prop in target) return target[prop as string];
			if (typeof prop === "string" && registry.has(prop)) {
				const entry = registry.get(prop);
				return entry?.component ?? (() => null);
			}
			return undefined;
		},
	});
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
