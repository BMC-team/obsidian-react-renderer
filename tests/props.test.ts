import { describe, it, expect } from "vitest";
import React from "react";
import { evaluateComponent } from "../src/scope/evaluate";
import { transpileJSX } from "../src/transpiler/transpile";
import { ComponentRegistry } from "../src/registry/ComponentRegistry";
import { buildScope } from "../src/scope/ScopeBuilder";

const mockApp = { vault: {}, workspace: {}, metadataCache: {} } as any;

const baseScope: Record<string, any> = {
	React,
	useState: React.useState,
	useEffect: React.useEffect,
	useRef: React.useRef,
};

describe("props support", () => {
	it("component receives props parameter", async () => {
		const source = `
			return <div>{props.name}</div>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");

		// Simulate React calling the component with props
		const element = component!({ name: "World" });
		expect(element).not.toBeNull();
		// The element should contain "World" in its props
		expect(element.props.children).toBe("World");
	});

	it("component can destructure props", async () => {
		const source = `
			const { title, count } = props;
			return <span>{title}: {count}</span>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);
		expect(component).toBeTypeOf("function");

		const element = component!({ title: "Items", count: 42 });
		expect(element).not.toBeNull();
	});

	it("component can use default prop values", async () => {
		const source = `
			const { label = "Click me", variant = "primary" } = props;
			return <button className={variant}>{label}</button>;
		`;
		const transpiled = transpileJSX(source);
		expect(transpiled.error).toBeNull();

		const component = evaluateComponent(transpiled.code!, baseScope);

		// With props
		const el1 = component!({ label: "Save", variant: "success" });
		expect(el1.props.children).toBe("Save");
		expect(el1.props.className).toBe("success");

		// Without props (defaults)
		const el2 = component!({});
		expect(el2.props.children).toBe("Click me");
		expect(el2.props.className).toBe("primary");
	});

	it("registered component receives props when used in JSX", async () => {
		const registry = new ComponentRegistry();

		// Define a component using base scope (avoids obsidian require)
		const counterSource = `
			const { initial = 0, label = "Count" } = props;
			return React.createElement("div", null, label + ": " + initial);
		`;
		const counterTranspiled = transpileJSX(counterSource);
		expect(counterTranspiled.error).toBeNull();

		const counterComponent = evaluateComponent(counterTranspiled.code!, baseScope);
		expect(counterComponent).toBeTypeOf("function");

		// Verify it works directly with props
		const directEl = counterComponent!({ initial: 10, label: "Score" });
		expect(directEl.props.children).toBe("Score: 10");

		// Register it
		registry.register({
			name: "Counter",
			rawSource: counterSource,
			transpiledCode: counterTranspiled.code!,
			component: counterComponent,
			sourceFilePath: null,
			namespace: "global",
			isHeader: false,
			lastUpdated: Date.now(),
		});

		// Now use it from another JSX block — scope includes Counter as a getter
		const usageSource = `
			return <Counter initial={10} label="Score" />;
		`;
		const usageTranspiled = transpileJSX(usageSource);
		expect(usageTranspiled.error).toBeNull();

		// Build a scope that includes Counter from registry
		const usageScope = {
			...baseScope,
		};
		// Add Counter as a dynamic getter (same as buildScope does)
		Object.defineProperty(usageScope, "Counter", {
			get: () => registry.get("Counter")?.component ?? (() => null),
			enumerable: true,
			configurable: true,
		});

		const usageComponent = evaluateComponent(usageTranspiled.code!, usageScope);
		expect(usageComponent).toBeTypeOf("function");

		// The usage component renders Counter with props
		const element = usageComponent!({});
		expect(element).not.toBeNull();
		// element is React.createElement(Counter, {initial: 10, label: "Score"})
		expect(element.props.initial).toBe(10);
		expect(element.props.label).toBe("Score");

		// Verify React would pass those props through to Counter
		expect(element.type).toBe(counterComponent);
	});

	it("props.children works", async () => {
		const source = `
			return <div className="wrapper">{props.children}</div>;
		`;
		const transpiled = transpileJSX(source);
		const component = evaluateComponent(transpiled.code!, baseScope);

		const child = React.createElement("span", null, "inner");
		const element = component!({ children: child });
		expect(element.props.children).toBe(child);
	});
});
