import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		globals: true,
		testTimeout: 30000, // Babel loading can be slow
	},
	resolve: {
		alias: {
			// Mock obsidian module for tests
			obsidian: "./tests/mocks/obsidian.ts",
		},
	},
});
