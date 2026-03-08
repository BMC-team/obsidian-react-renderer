import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { existsSync, readFileSync, copyFileSync } from "fs";
import { join } from "path";

const isProduction = process.argv[2] === "production";

// Read vault plugin dir from .vault_plugin_dir file (if exists)
let vaultPluginDir = null;
const vaultDirFile = ".vault_plugin_dir";
if (existsSync(vaultDirFile)) {
	vaultPluginDir = readFileSync(vaultDirFile, "utf-8").trim();
}

const deployFiles = ["main.js", "manifest.json", "styles.css"];

function deployToVault() {
	if (!vaultPluginDir) return;
	for (const file of deployFiles) {
		try {
			copyFileSync(file, join(vaultPluginDir, file));
		} catch {
			// Ignore copy errors (file locked, etc.)
		}
	}
	console.log(`  → Deployed to ${vaultPluginDir}`);
}

/** @type {import('esbuild').Plugin} */
const deployPlugin = {
	name: "deploy",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				deployToVault();
			}
		});
	},
};

const ctx = await esbuild.context({
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
	plugins: [deployPlugin],
});

if (isProduction) {
	await ctx.rebuild();
	await ctx.dispose();
} else {
	// Watch mode — rebuild + auto-deploy on file changes
	await ctx.watch();
	console.log("  Watching for changes...");
}
