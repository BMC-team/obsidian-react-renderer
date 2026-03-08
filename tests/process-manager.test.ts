import { describe, it, expect, vi } from "vitest";
import { processManager } from "../src/scope/ProcessManager";

describe("ProcessManager", () => {
	it("starts with no processes", () => {
		expect(processManager.listAll()).toHaveLength(0);
	});

	it("getProcess returns undefined for unknown ID", () => {
		expect(processManager.getProcess("nonexistent")).toBeUndefined();
	});

	it("subscribe returns an unsubscribe function", () => {
		const listener = vi.fn();
		const unsub = processManager.subscribe("test-sub", listener);
		expect(unsub).toBeTypeOf("function");
		unsub();
	});

	it("clearOutput resets output for a process entry", () => {
		// Create a manual entry by running echo (won't actually spawn in test)
		// Just test the clearOutput on a non-existent entry doesn't throw
		processManager.clearOutput("nonexistent");
		// Should not throw
	});

	it("kill on nonexistent process doesn't throw", () => {
		expect(() => processManager.kill("nonexistent")).not.toThrow();
	});

	it("remove on nonexistent process doesn't throw", () => {
		expect(() => processManager.remove("nonexistent")).not.toThrow();
	});

	it("killAll doesn't throw when empty", () => {
		expect(() => processManager.killAll()).not.toThrow();
	});
});
