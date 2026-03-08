import { describe, it, expect } from "vitest";
import React from "react";
import { transpileJSX } from "../src/transpiler/transpile";
import { evaluateComponent } from "../src/scope/evaluate";

const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
	useCallback: React.useCallback,
	useRef: React.useRef,
	useReducer: React.useReducer,
	useMemo: React.useMemo,
	useQuery: (key: string, fn: any, opts?: any) => ({ data: null, loading: true, error: null, refetch: () => {} }),
	useImport: (url: string) => ({ module: null, loading: true, error: null }),
	useCanvas: (fn: any, deps?: any[]) => React.createRef(),
	useSearch: (query: string) => ({ results: [], loading: false }),
	useTags: (tag?: string) => ({ tags: [], files: [] }),
	Style: (props: any) => React.createElement("style", null, props.children),
};

describe("useQuery hook", () => {
	it("transpiles and evaluates useQuery usage", () => {
		const source = `
			const { data, loading, error, refetch } = useQuery("files", async () => {
				return ["a", "b", "c"];
			}, { cacheMs: 5000 });

			if (loading) return <div>Loading...</div>;
			if (error) return <div>Error: {error}</div>;

			return (
				<div>
					<div>{data.length} items</div>
					<button onClick={refetch}>Refresh</button>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("Style component (CSS scoping)", () => {
	it("transpiles and evaluates Style usage", () => {
		const source = `
			return (
				<div>
					<Style>{".btn { padding: 8px 16px; border-radius: 4px; } .title { font-size: 18px; }"}</Style>
					<h1 className="title">Styled Title</h1>
					<button className="btn">Click me</button>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("works with template literals", () => {
		const source = `
			const accent = "var(--interactive-accent)";
			return (
				<div>
					<Style>{\`.card { border: 1px solid \${accent}; padding: 12px; }\`}</Style>
					<div className="card">Content</div>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useImport hook (URL imports)", () => {
	it("transpiles and evaluates useImport usage", () => {
		const source = `
			const { module: lib, loading, error } = useImport("https://esm.sh/lodash-es");
			if (loading) return <div>Loading library...</div>;
			if (error) return <div>Import error: {error}</div>;
			return <div>Library loaded: {typeof lib}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useCanvas hook", () => {
	it("transpiles and evaluates useCanvas usage", () => {
		const source = `
			const canvasRef = useCanvas((ctx, canvas) => {
				ctx.fillStyle = "#4caf50";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
			}, []);
			return <canvas ref={canvasRef} width={200} height={100} />;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useSearch hook", () => {
	it("transpiles and evaluates useSearch usage", () => {
		const source = `
			const { results, loading } = useSearch("fermenter");
			if (loading) return <div>Searching...</div>;
			return <div>{results.length} results found</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useTags hook", () => {
	it("transpiles and evaluates useTags usage", () => {
		const source = `
			const { tags, files } = useTags("#spec");
			return (
				<div>
					<div>{tags.length} unique tags</div>
					<div>{files.length} files with #spec</div>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
