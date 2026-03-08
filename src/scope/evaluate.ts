import React from "react";

/**
 * Evaluate transpiled component code within a scope.
 * Returns a React component function, or null on failure.
 *
 * The transpiled code is already unwrapped (just the function body).
 * We wrap it in `function UserComponent(props) { ...code }` and
 * inject scope variables via new Function() constructor arguments.
 */
export function evaluateComponent(
	transpiledCode: string,
	scope: Record<string, any>
): React.ComponentType<any> | null {
	try {
		const scopeKeys = Object.keys(scope);
		const scopeValues = scopeKeys.map((k) => scope[k]);

		const code = transpiledCode.trim();
		if (!code) return null;

		// The transpiled code is a function body (may have return statements).
		// Wrap it in a component function.
		// If code has no return statement, wrap the entire thing as a return expression.
		const body = hasReturnStatement(code)
			? code
			: `return (${stripTrailingSemicolon(code)})`;

		const factory = new Function(
			...scopeKeys,
			`return function UserComponent(props) {\n${body}\n}`
		);

		const component = factory(...scopeValues);
		return component;
	} catch (err) {
		console.error("[ReactRenderer] Component evaluation error:", err);
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
		const scopeKeys = Object.keys(scope);
		const scopeValues = scopeKeys.map((k) => scope[k]);

		const code = transpiledCode.trim();
		if (!code) return null;

		const body = hasReturnStatement(code)
			? code
			: `return (${stripTrailingSemicolon(code)})`;

		const fn = new Function(...scopeKeys, body);
		return fn(...scopeValues);
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
