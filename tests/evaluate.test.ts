import { describe, it, expect } from "vitest";
import React from "react";
import { evaluateComponent, evaluateInlineJSX } from "../src/scope/evaluate";
import { transpileJSX } from "../src/transpiler/transpile";

// Basic scope with React available
const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
	useCallback: React.useCallback,
	useMemo: React.useMemo,
	useReducer: React.useReducer,
	useRef: React.useRef,
};

describe("evaluateComponent", () => {
	it("evaluates code with explicit return as a component", async () => {
		const transpiled = await transpileJSX(
			'return React.createElement("div", null, "Hello");'
		);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("evaluates bare JSX expression (auto-wrapped with return)", async () => {
		const transpiled = await transpileJSX("<div>Hello</div>");
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("returns null for empty code", () => {
		const component = evaluateComponent("", baseScope);
		expect(component).toBeNull();
	});

	it("returns null for completely invalid code", () => {
		const component = evaluateComponent("}{}{}{", baseScope);
		expect(component).toBeNull();
	});

	it("can access scope variables", async () => {
		const scope = { ...baseScope, myVar: "test-value" };
		const transpiled = await transpileJSX(
			'return React.createElement("span", null, myVar);'
		);
		expect(transpiled.error).toBeNull();
		const component = evaluateComponent(transpiled.code!, scope);
		expect(component).toBeTypeOf("function");
	});
});

describe("evaluateInlineJSX", () => {
	it("evaluates inline JSX and returns a ReactNode", async () => {
		const transpiled = await transpileJSX("<div>Inline</div>");
		expect(transpiled.error).toBeNull();
		const result = evaluateInlineJSX(transpiled.code!, baseScope);
		expect(result).not.toBeNull();
	});

	it("returns null for empty code", () => {
		const result = evaluateInlineJSX("", baseScope);
		expect(result).toBeNull();
	});
});

describe("end-to-end: transpile + evaluate", () => {
	it("handles a full component with useState", async () => {
		const source = `
			const [count, setCount] = useState(0);
			return React.createElement("div", null,
				React.createElement("span", null, "Count: ", count),
				React.createElement("button", { onClick: () => setCount(c => c + 1) }, "+1")
			);
		`;
		const transpiled = await transpileJSX(source);
		expect(transpiled.error).toBeNull();
		expect(transpiled.code).toContain("useState");

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
		expect(component!.name).toBe("UserComponent");
	});

	it("handles JSX syntax (not just createElement)", async () => {
		const source = `
			const name = "World";
			return <h1>Hello, {name}!</h1>;
		`;
		const transpiled = await transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("handles component with style objects", async () => {
		const source = `
			return <div style={{color: "red", padding: "10px"}}>Styled</div>;
		`;
		const transpiled = await transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("handles bare JSX without return", async () => {
		const source = "<span>Just JSX</span>";
		const transpiled = await transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});

	it("handles multi-line component with hooks and JSX", async () => {
		const source = `
			const [text, setText] = useState("hello");
			const upper = text.toUpperCase();
			return (
				<div>
					<input value={text} onChange={e => setText(e.target.value)} />
					<p>{upper}</p>
				</div>
			);
		`;
		const transpiled = await transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
