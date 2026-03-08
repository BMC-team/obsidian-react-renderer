import React from "react";

/**
 * Evaluate transpiled component code within a scope.
 * Returns a React component function, or null on failure.
 *
 * The transpiled code is already unwrapped (just the function body).
 * We wrap it in `function UserComponent(props) { ... }` and inject
 * scope variables by destructuring the scope object at render time.
 * This ensures dynamic getters (registered components) resolve live.
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

		// Build destructuring statement for all scope keys
		const scopeKeys = Object.keys(scope).filter(
			(k) => /^[a-zA-Z_$][\w$]*$/.test(k)
		);
		const destructure = `const {${scopeKeys.join(",")}} = __scope__;`;

		// The scope is passed as a single argument. Destructuring happens
		// inside the component function body, so dynamic getters resolve
		// at render time, not at definition time.
		const fnBody = `return function UserComponent(props) {\n${destructure}\n${body}\n}`;
		const factory = new Function("__scope__", fnBody);

		const component = factory(scope);
		return component;
	} catch (err: any) {
		const msg = err.message || String(err);
		console.error("[ReactRenderer] Component evaluation error:", msg);
		console.error("[ReactRenderer] Scope keys:", Object.keys(scope));
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

		const scopeKeys = Object.keys(scope).filter(
			(k) => /^[a-zA-Z_$][\w$]*$/.test(k)
		);
		const destructure = `const {${scopeKeys.join(",")}} = __scope__;`;

		const fn = new Function("__scope__", `${destructure}\n${body}`);
		return fn(scope);
	} catch (err) {
		console.error("[ReactRenderer] Inline JSX evaluation error:", err);
		return null;
	}
}

/**
 * Check if code contains a top-level return statement.
 * Simple heuristic: looks for `return` at the start of a line.
 */
function hasReturnStatement(code: string): boolean {
	return /(?:^|\n)\s*return[\s(;]/.test(code);
}

/** Strip trailing semicolons so code can be wrapped in return(...) */
function stripTrailingSemicolon(code: string): string {
	return code.replace(/;\s*$/, "");
}
