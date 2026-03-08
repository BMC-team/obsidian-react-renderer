import { describe, it, expect } from "vitest";
import React from "react";
import { transpileJSX } from "../src/transpiler/transpile";
import { evaluateComponent } from "../src/scope/evaluate";

const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
};

describe("optional chaining support", () => {
	it("transpiles and evaluates code with ?. operator", () => {
		const source = `
const obj = { nested: { value: 42 } };
const result = obj?.nested?.value;
const missing = obj?.missing?.deep;
return <div>{result} / {String(missing)}</div>;
`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();
		// Should contain _optionalChain helper
		expect(transpiled.code).toContain("_optionalChain");

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");

		const el = component!({});
		expect(el).not.toBeNull();
	});

	it("handles ?. in map callbacks (vault-like pattern)", () => {
		const source = `
const files = [
  { name: "a", parent: { path: "folder1" } },
  { name: "b", parent: null },
];
const paths = files.map(f => f.parent?.path || "/");
return <div>{paths.join(", ")}</div>;
`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");

		const el = component!({});
		expect(el.props.children).toBe("folder1, /");
	});

	it("handles ?. with useEffect (full vault integration pattern)", () => {
		const source = `
const [data, setData] = useState([]);
useEffect(() => {
  const items = [
    { name: "test", parent: { path: "specs" } },
    { name: "root", parent: null }
  ].map(f => ({
    name: f.name,
    folder: f.parent?.path || "/"
  }));
  setData(items);
}, []);
return <div>{data.length} items</div>;
`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");
	});
});
