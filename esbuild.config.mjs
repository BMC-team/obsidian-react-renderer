import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const isProduction = process.argv[2] === "production";

esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	format: "cjs",
	target: "es2020",
	platform: "node",
	outfile: "main.js",
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	jsx: "automatic",
	jsxImportSource: "react",
	sourcemap: isProduction ? false : "inline",
	minify: isProduction,
	treeShaking: true,
	define: {
		"process.env.NODE_ENV": isProduction
			? '"production"'
			: '"development"',
	},
	logLevel: "info",
}).catch(() => process.exit(1));
