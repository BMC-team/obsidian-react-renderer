import { describe, it, expect } from "vitest";
import React from "react";
import { transpileJSX } from "../src/transpiler/transpile";
import { evaluateComponent } from "../src/scope/evaluate";

// Mock hooks as simple functions for evaluation testing
const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
	useCallback: React.useCallback,
	useRef: React.useRef,
	useReducer: React.useReducer,
	app: {
		vault: { getMarkdownFiles: () => [], getAbstractFileByPath: () => null, read: async () => "" },
		workspace: { getActiveFile: () => null },
		metadataCache: { getFileCache: () => null, on: () => ({ id: 0 }), offref: () => {} },
		plugins: { plugins: { dataview: null } },
	},
	useSharedState: (key: string, init: any) => [init, () => {}],
	usePersistentState: (key: string, init: any) => [init, () => {}],
	useLocalState: (key: string, init: any) => [init, () => {}],
	useFrontmatter: () => ({}),
	useTheme: () => "dark",
	useNote: (path: string) => ({ content: "", frontmatter: {}, loading: false, error: null }),
	useDataview: (query: string) => ({ values: [], headers: [], loading: false, error: null }),
};

describe("vault-aware hooks — transpile + evaluate", () => {
	it("useFrontmatter in component", () => {
		const source = `
			const fm = useFrontmatter();
			return <div>Status: {fm.status || "unknown"}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("useTheme in component", () => {
		const source = `
			const theme = useTheme();
			const bg = theme === "dark" ? "#1e1e1e" : "#ffffff";
			return <div style={{backgroundColor: bg}}>Theme: {theme}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("usePersistentState in component", () => {
		const source = `
			const [filter, setFilter] = usePersistentState("dashboard-filter", "all");
			return (
				<div>
					<span>Filter: {filter}</span>
					<button onClick={() => setFilter("active")}>Active</button>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("useNote in component", () => {
		const source = `
			const { content, frontmatter, loading, error } = useNote("modules/EquipmentManager");
			if (loading) return <div>Loading...</div>;
			if (error) return <div>Error: {error}</div>;
			return <div>Module: {frontmatter.module || "unknown"}, Length: {content.length}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("useDataview in component", () => {
		const source = `
			const { values, headers, loading, error } = useDataview("TABLE status FROM #spec");
			if (loading) return <div>Loading query...</div>;
			if (error) return <div>Error: {error}</div>;
			return (
				<div>
					<div>Columns: {headers.join(", ")}</div>
					<div>Rows: {values.length}</div>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("useLocalState in component", () => {
		const source = `
			const [pref, setPref] = useLocalState("machine-pref", "default");
			return (
				<div>
					<span>Preference: {pref}</span>
					<button onClick={() => setPref("custom")}>Set Custom</button>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("multiple hooks combined", () => {
		const source = `
			const fm = useFrontmatter();
			const theme = useTheme();
			const [lastView, setLastView] = usePersistentState("last-module", "");
			const { frontmatter: moduleFm } = useNote(fm.module || "");
			return (
				<div style={{color: theme === "dark" ? "#fff" : "#000"}}>
					<div>Current: {fm.module || "none"}</div>
					<div>Last viewed: {lastView || "none"}</div>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
