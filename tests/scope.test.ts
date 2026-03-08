import { describe, it, expect } from "vitest";
import { buildScope, clearSharedState } from "../src/scope/ScopeBuilder";
import { ComponentRegistry } from "../src/registry/ComponentRegistry";

// Minimal mock app
const mockApp = {
	vault: {},
	workspace: {},
	metadataCache: {},
} as any;

describe("buildScope", () => {
	it("includes React and all hooks", () => {
		const reg = new ComponentRegistry();
		const scope = buildScope(reg, mockApp);

		expect(scope.React).toBeDefined();
		expect(scope.useState).toBeTypeOf("function");
		expect(scope.useEffect).toBeTypeOf("function");
		expect(scope.useCallback).toBeTypeOf("function");
		expect(scope.useMemo).toBeTypeOf("function");
		expect(scope.useReducer).toBeTypeOf("function");
		expect(scope.useRef).toBeTypeOf("function");
		expect(scope.useContext).toBeTypeOf("function");
		expect(scope.useId).toBeTypeOf("function");
		expect(scope.useSyncExternalStore).toBeTypeOf("function");
		expect(scope.useTransition).toBeTypeOf("function");
		expect(scope.useDeferredValue).toBeTypeOf("function");
	});

	it("includes app reference", () => {
		const reg = new ComponentRegistry();
		const scope = buildScope(reg, mockApp);
		expect(scope.app).toBe(mockApp);
	});

	it("includes useSharedState", () => {
		const reg = new ComponentRegistry();
		const scope = buildScope(reg, mockApp);
		expect(scope.useSharedState).toBeTypeOf("function");
	});

	it("includes obsidian as a lazy getter", () => {
		const reg = new ComponentRegistry();
		const scope = buildScope(reg, mockApp);

		// The property should be defined
		const descriptor = Object.getOwnPropertyDescriptor(scope, "obsidian");
		expect(descriptor?.get).toBeTypeOf("function");
	});

	it("includes registered components as dynamic getters", () => {
		const reg = new ComponentRegistry();
		const dummyComponent = () => null;

		reg.register({
			name: "MyWidget",
			rawSource: "",
			transpiledCode: "",
			component: dummyComponent,
			sourceFilePath: null,
			namespace: "global",
			isHeader: false,
			lastUpdated: Date.now(),
		});

		const scope = buildScope(reg, mockApp);

		// Should have a getter for MyWidget
		const descriptor = Object.getOwnPropertyDescriptor(scope, "MyWidget");
		expect(descriptor?.get).toBeTypeOf("function");

		// Getter should return the component
		expect(scope.MyWidget).toBe(dummyComponent);
	});

	it("dynamic getters reflect registry updates", () => {
		const reg = new ComponentRegistry();
		const component1 = () => "v1";
		const component2 = () => "v2";

		reg.register({
			name: "Updatable",
			rawSource: "",
			transpiledCode: "",
			component: component1 as any,
			sourceFilePath: null,
			namespace: "global",
			isHeader: false,
			lastUpdated: Date.now(),
		});

		const scope = buildScope(reg, mockApp);
		expect(scope.Updatable).toBe(component1);

		// Update the component in the registry
		reg.register({
			name: "Updatable",
			rawSource: "",
			transpiledCode: "",
			component: component2 as any,
			sourceFilePath: null,
			namespace: "global",
			isHeader: false,
			lastUpdated: Date.now(),
		});

		// Getter should return the new component
		expect(scope.Updatable).toBe(component2);
	});
});

describe("clearSharedState", () => {
	it("clears without error", () => {
		expect(() => clearSharedState()).not.toThrow();
	});
});
