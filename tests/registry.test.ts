import { describe, it, expect, vi } from "vitest";
import { ComponentRegistry } from "../src/registry/ComponentRegistry";
import type { ComponentEntry } from "../src/types";

function makeEntry(name: string, overrides?: Partial<ComponentEntry>): ComponentEntry {
	return {
		name,
		rawSource: `return <div>${name}</div>`,
		transpiledCode: `React.createElement("div", null, "${name}")`,
		component: () => null,
		sourceFilePath: null,
		namespace: "global",
		isHeader: false,
		lastUpdated: Date.now(),
		...overrides,
	};
}

describe("ComponentRegistry", () => {
	it("registers and retrieves a component", () => {
		const reg = new ComponentRegistry();
		const entry = makeEntry("Counter");
		reg.register(entry);

		expect(reg.has("Counter")).toBe(true);
		expect(reg.get("Counter")?.name).toBe("Counter");
	});

	it("returns undefined for missing components", () => {
		const reg = new ComponentRegistry();
		expect(reg.get("Missing")).toBeUndefined();
		expect(reg.has("Missing")).toBe(false);
	});

	it("unregisters a component", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("Widget"));
		reg.unregister("Widget");
		expect(reg.has("Widget")).toBe(false);
	});

	it("lists all component names", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("A"));
		reg.register(makeEntry("B"));
		reg.register(makeEntry("C"));
		expect(reg.getNames().sort()).toEqual(["A", "B", "C"]);
	});

	it("filters by namespace", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("Foo", { namespace: "charts" }));
		reg.register(makeEntry("Bar", { namespace: "charts" }));
		reg.register(makeEntry("Baz", { namespace: "global" }));

		const charts = reg.getByNamespace("charts");
		expect(charts).toHaveLength(2);
		expect(charts.map((c) => c.name).sort()).toEqual(["Bar", "Foo"]);
	});

	it("emits 'component-registered' on first register", () => {
		const reg = new ComponentRegistry();
		const listener = vi.fn();
		reg.on(listener);

		reg.register(makeEntry("New"));

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "component-registered",
				name: "New",
			})
		);
	});

	it("emits 'component-updated' on re-register", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("Existing"));

		const listener = vi.fn();
		reg.on(listener);

		reg.register(makeEntry("Existing"));

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "component-updated",
				name: "Existing",
			})
		);
	});

	it("emits 'component-removed' on unregister", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("ToRemove"));

		const listener = vi.fn();
		reg.on(listener);

		reg.unregister("ToRemove");

		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "component-removed",
				name: "ToRemove",
			})
		);
	});

	it("unsubscribes listener", () => {
		const reg = new ComponentRegistry();
		const listener = vi.fn();
		const unsub = reg.on(listener);

		unsub();
		reg.register(makeEntry("Ignored"));

		expect(listener).not.toHaveBeenCalled();
	});

	it("clears all components", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("A"));
		reg.register(makeEntry("B"));

		reg.clear();

		expect(reg.getNames()).toHaveLength(0);
		expect(reg.has("A")).toBe(false);
	});

	it("finds header component", () => {
		const reg = new ComponentRegistry();
		reg.register(makeEntry("Normal"));
		reg.register(makeEntry("Header", { isHeader: true }));

		const header = reg.getHeaderComponent();
		expect(header?.name).toBe("Header");
	});

	it("updates lastUpdated on register", () => {
		const reg = new ComponentRegistry();
		const before = Date.now();
		reg.register(makeEntry("Timed"));
		const entry = reg.get("Timed");
		expect(entry!.lastUpdated).toBeGreaterThanOrEqual(before);
	});
});
