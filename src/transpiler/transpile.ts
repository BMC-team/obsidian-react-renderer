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

/**
 * Transpile JSX/TSX source code to plain JavaScript.
 * Results are cached by source hash.
 */
export async function transpileJSX(source: string): Promise<TranspileResult> {
	const key = hashSource(source);
	const cached = transpileCache.get(key);
	if (cached) return cached;

	try {
		const Babel = await ensureBabel();
		const output = Babel.transform(source, {
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

		const result: TranspileResult = { code: output.code, error: null };

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
				line: err.loc?.line ?? null,
				column: err.loc?.column ?? null,
			},
		};
		return result;
	}
}

/** Clear the transpilation cache */
export function clearTranspileCache(): void {
	transpileCache.clear();
}
