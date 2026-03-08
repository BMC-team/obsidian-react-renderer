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
	Table: (props: any) => React.createElement("table"),
	Tabs: (props: any) => React.createElement("div"),
	Input: (props: any) => React.createElement("input"),
	Select: (props: any) => React.createElement("select"),
	Card: (props: any) => React.createElement("div", null, props.children),
	StatusBadge: (props: any) => React.createElement("span", null, props.label),
	useInterval: (cb: any, ms: any) => {},
	useTimeout: (cb: any, ms: any) => {},
	useBacklinks: () => [],
	useFileContent: (path: string) => ({ content: "", frontmatter: {}, loading: false, error: null }),
	usePlugin: (id: string) => null,
};

describe("Table component", () => {
	it("renders with columns and data", () => {
		const source = `
			const data = [
				{ name: "Temp", value: 37.2, unit: "°C" },
				{ name: "pH", value: 7.04, unit: "" },
			];
			return (
				<Table
					columns={[
						{ key: "name", label: "Parameter" },
						{ key: "value", label: "Value", align: "right" },
						{ key: "unit", label: "Unit" },
					]}
					data={data}
					sortable={true}
					searchable={true}
				/>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("Tabs component", () => {
	it("renders tab switcher", () => {
		const source = `
			const [tab, setTab] = useState("overview");
			return (
				<div>
					<Tabs tabs={["overview", "details", "settings"]} active={tab} onChange={setTab} variant="pills" />
					<div>{tab} content</div>
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("Input/Select form components", () => {
	it("renders form with Input and Select", () => {
		const source = `
			const [name, setName] = useState("");
			const [type, setType] = useState("batch");
			return (
				<div>
					<Input value={name} onChange={setName} label="Name" placeholder="Enter name..." />
					<Select value={type} onChange={setType} label="Type" options={["batch", "continuous", "fed-batch"]} />
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useInterval hook", () => {
	it("transpiles polling pattern", () => {
		const source = `
			const [count, setCount] = useState(0);
			useInterval(() => setCount(c => c + 1), 1000);
			return <div>Count: {count}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useBacklinks hook", () => {
	it("transpiles backlinks usage", () => {
		const source = `
			const backlinks = useBacklinks();
			return (
				<div>
					<div>{backlinks.length} backlinks</div>
					{backlinks.map(b => <div key={b.path}>{b.name}</div>)}
				</div>
			);
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("useFileContent hook", () => {
	it("transpiles live file reading", () => {
		const source = `
			const { content, frontmatter, loading } = useFileContent("modules/EquipmentManager");
			if (loading) return <div>Loading...</div>;
			return <div>{frontmatter.module}: {content.length} chars</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});

describe("usePlugin hook", () => {
	it("transpiles plugin access", () => {
		const source = `
			const dv = usePlugin("dataview");
			if (!dv) return <div>Dataview not available</div>;
			return <div>Dataview API loaded</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
