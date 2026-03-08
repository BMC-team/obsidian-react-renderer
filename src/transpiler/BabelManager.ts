let babelInstance: any = null;
let babelPromise: Promise<any> | null = null;

/**
 * Lazy-loads @babel/standalone. First call triggers the load,
 * subsequent calls return the cached instance.
 */
export function ensureBabel(): Promise<any> {
	if (babelInstance) return Promise.resolve(babelInstance);
	if (babelPromise) return babelPromise;

	babelPromise = new Promise<any>((resolve, reject) => {
		// Yield to event loop before loading the heavy Babel module
		setTimeout(() => {
			try {
				const babel = require("@babel/standalone");
				babelInstance = babel;
				resolve(babel);
			} catch (err) {
				babelPromise = null;
				reject(err);
			}
		}, 0);
	});

	return babelPromise;
}

/** Pre-load Babel eagerly (used when lazyLoadBabel is false) */
export function preloadBabel(): void {
	ensureBabel();
}

/** Check if Babel is already loaded */
export function isBabelLoaded(): boolean {
	return babelInstance !== null;
}
