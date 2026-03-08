import { transform } from "sucrase";
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
 * Transpile JSX/TSX source code to plain JavaScript using Sucrase.
 * Results are cached by source hash.
 *
 * User code is wrapped in a function before transpilation so that
 * `return` statements are valid. The wrapper is stripped from the output.
 *
 * Sucrase is synchronous — no lazy loading needed (215 KB vs Babel's 2.5 MB).
 */
export function transpileJSX(source: string): TranspileResult {
	const key = hashSource(source);
	const cached = transpileCache.get(key);
	if (cached) return cached;

	try {
		// Wrap in a function so `return` statements are valid
		const wrapped = WRAPPER_PREFIX + source + WRAPPER_SUFFIX;

		const output = transform(wrapped, {
			transforms: ["jsx", "typescript"],
			jsxRuntime: "classic",
			production: true,
		});

		// Strip the wrapper function from the output
		let code = unwrapTranspiledCode(output.code);

		const result: TranspileResult = { code, error: null };

		// LRU eviction
		if (transpileCache.size >= MAX_CACHE_SIZE) {
			const firstKey = transpileCache.keys().next().value;
			if (firstKey !== undefined) transpileCache.delete(firstKey);
		}
		transpileCache.set(key, result);

		return result;
	} catch (err: any) {
		// Sucrase errors include line info in the message
		const lineMatch = err.message?.match(/\((\d+):(\d+)\)/);
		const result: TranspileResult = {
			code: null,
			error: {
				message: err.message || String(err),
				line: lineMatch ? parseInt(lineMatch[1]) - 1 : null, // Adjust for wrapper line
				column: lineMatch ? parseInt(lineMatch[2]) : null,
			},
		};
		return result;
	}
}

/**
 * Strip the wrapper function from transpiled output.
 * Output looks like: `function __REACT_RENDERER_WRAPPER__() { ...code... }`
 * We extract just the body.
 */
function unwrapTranspiledCode(code: string): string {
	const openIdx = code.indexOf("{");
	if (openIdx === -1) return code;

	const closeIdx = code.lastIndexOf("}");
	if (closeIdx === -1 || closeIdx <= openIdx) return code;

	return code.slice(openIdx + 1, closeIdx).trim();
}

/** Clear the transpilation cache */
export function clearTranspileCache(): void {
	transpileCache.clear();
}
