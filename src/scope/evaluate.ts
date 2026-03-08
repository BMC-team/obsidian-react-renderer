import React from "react";

/**
 * Evaluate transpiled component code within a scope.
 * Returns a React component function, or null on failure.
 *
 * Uses `with(__scope__)` to make all scope properties available as
 * local variables. This includes dynamic getters for registered
 * components, which resolve at access time (not at definition time).
 *
 * `with` works because `new Function` creates sloppy-mode functions
 * (not strict mode), where `with` is allowed.
 */
export function evaluateComponent(
	transpiledCode: string,
	scope: Record<string, any>,
	onError?: (message: string) => void
): React.ComponentType<any> | null {
	try {
		const code = transpiledCode.trim();
		if (!code) return null;

		const body = hasReturnStatement(code)
			? code
			: `return (${stripTrailingSemicolon(code)})`;

		const factory = new Function(
			"__scope__",
			`with(__scope__) { return function UserComponent(props) {\n${body}\n} }`
		);

		const component = factory(scope);
		return component;
	} catch (err: any) {
		const msg = err.message || String(err);
		console.error("[ReactRenderer] Component evaluation error:", msg);
		if (onError) onError(msg);
		return null;
	}
}

/**
 * Evaluate inline JSX code (not a component definition).
 * Returns a React element, not a component.
 */
export function evaluateInlineJSX(
	transpiledCode: string,
	scope: Record<string, any>
): React.ReactNode | null {
	try {
		const code = transpiledCode.trim();
		if (!code) return null;

		const body = hasReturnStatement(code)
			? code
			: `return (${stripTrailingSemicolon(code)})`;

		const fn = new Function("__scope__", `with(__scope__) {\n${body}\n}`);
		return fn(scope);
	} catch (err) {
		console.error("[ReactRenderer] Inline JSX evaluation error:", err);
		return null;
	}
}

/**
 * Check if code contains a top-level return statement.
 */
function hasReturnStatement(code: string): boolean {
	return /(?:^|\n)\s*return[\s(;]/.test(code);
}

/** Strip trailing semicolons so code can be wrapped in return(...) */
function stripTrailingSemicolon(code: string): string {
	return code.replace(/;\s*$/, "");
}
