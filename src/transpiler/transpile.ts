import { ensureBabel } from "./BabelManager";
import type { TranspileResult } from "../types";

const transpileCache = new Map<string, TranspileResult>();
const MAX_CACHE_SIZE = 500;

/** Simple hash for cache keys */
function hashSource(source: string): string {
	let hash = 0;
	for (let i = 0; i < source.length; i++) {
		const ch = source.charCodeAt(i);
		hash = ((hash << 5) - hash + ch) | 0;
	}
	return hash.toString(36);
}

// Wrapper markers to extract function body from transpiled output
const WRAPPER_PREFIX = "function __REACT_RENDERER_WRAPPER__() {\n";
const WRAPPER_SUFFIX = "\n}";

/**
 * Transpile JSX/TSX source code to plain JavaScript.
 * Results are cached by source hash.
 *
 * User code is wrapped in a function before transpilation so that
 * Babel accepts `return` statements (which are invalid at module top-level).
 * The wrapper is stripped from the output.
 */
export async function transpileJSX(source: string): Promise<TranspileResult> {
	const key = hashSource(source);
	const cached = transpileCache.get(key);
	if (cached) return cached;

	try {
		const Babel = await ensureBabel();

		// Wrap in a function so `return` statements are valid
		const wrapped = WRAPPER_PREFIX + source + WRAPPER_SUFFIX;

		const output = Babel.transform(wrapped, {
			presets: [
				["react", { runtime: "classic" }],
				[
					"typescript",
					{
						isTSX: true,
						allExtensions: true,
						onlyRemoveTypeImports: true,
					},
				],
			],
			filename: "component.tsx",
		});

		// Strip the wrapper function from the output
		let code = output.code as string;
		code = unwrapTranspiledCode(code);

		const result: TranspileResult = { code, error: null };

		// LRU eviction
		if (transpileCache.size >= MAX_CACHE_SIZE) {
			const firstKey = transpileCache.keys().next().value;
			if (firstKey !== undefined) transpileCache.delete(firstKey);
		}
		transpileCache.set(key, result);

		return result;
	} catch (err: any) {
		const result: TranspileResult = {
			code: null,
			error: {
				message: err.message || String(err),
				line: err.loc?.line ? err.loc.line - 1 : null, // Adjust for wrapper line
				column: err.loc?.column ?? null,
			},
		};
		return result;
	}
}

/**
 * Strip the wrapper function from Babel's transpiled output.
 * Babel outputs: `function __REACT_RENDERER_WRAPPER__() { ...code... }`
 * We extract just the body.
 */
function unwrapTranspiledCode(code: string): string {
	// Find the opening brace of the wrapper function
	const openIdx = code.indexOf("{");
	if (openIdx === -1) return code;

	// Find the matching closing brace (last one in the string)
	const closeIdx = code.lastIndexOf("}");
	if (closeIdx === -1 || closeIdx <= openIdx) return code;

	// Extract the body between the braces
	return code.slice(openIdx + 1, closeIdx).trim();
}

/** Clear the transpilation cache */
export function clearTranspileCache(): void {
	transpileCache.clear();
}
