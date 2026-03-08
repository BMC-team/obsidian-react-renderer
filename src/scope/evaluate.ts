import React from "react";

/**
 * Evaluate transpiled component code within a scope.
 * Returns a React component function, or null on failure.
 *
 * The user code is expected to be a function body that returns JSX.
 * We wrap it in a function component that receives the scope.
 */
export function evaluateComponent(
	transpiledCode: string,
	scope: Record<string, any>
): React.ComponentType<any> | null {
	try {
		// Build scope keys and values for Function constructor
		const scopeKeys = Object.keys(scope);
		const scopeValues = scopeKeys.map((k) => scope[k]);

		// Wrap the user code as a component function body.
		// User code should contain either:
		//   - A return statement with JSX: `return <div>Hello</div>`
		//   - A function/class definition that we'll detect and use
		//   - Direct JSX expression (we wrap with return)
		const wrappedCode = wrapUserCode(transpiledCode);

		// Create a factory function that takes scope values and returns a component
		const factory = new Function(
			...scopeKeys,
			`return function UserComponent(props) {
				${wrappedCode}
			}`
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

		const wrappedCode = wrapUserCode(transpiledCode);

		const fn = new Function(...scopeKeys, wrappedCode);
		return fn(...scopeValues);
	} catch (err) {
		console.error("[ReactRenderer] Inline JSX evaluation error:", err);
		return null;
	}
}

/**
 * Wrap user code to ensure it returns a value.
 * If code doesn't have a return statement at the top level,
 * wrap the last expression with return.
 */
function wrapUserCode(code: string): string {
	const trimmed = code.trim();

	// If it already has a top-level return, use as-is
	if (/^return\s/m.test(trimmed)) {
		return trimmed;
	}

	// If it starts with a function/class declaration, return it
	if (
		/^(function|class)\s/.test(trimmed) ||
		/^const\s+\w+\s*=/.test(trimmed)
	) {
		return trimmed;
	}

	// Otherwise wrap with return (handles bare JSX expressions)
	return `return (${trimmed})`;
}
