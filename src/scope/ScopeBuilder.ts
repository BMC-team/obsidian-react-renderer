import React from "react";
import type { App } from "obsidian";
import { ComponentRegistry } from "../registry/ComponentRegistry";

/**
 * Shared state store for useSharedState hook.
 * Enables inter-component communication.
 */
const sharedStateStore = new Map<
	string,
	{ value: any; subscribers: Set<() => void> }
>();

function useSharedState<T>(
	key: string,
	initialValue: T
): [T, (val: T | ((prev: T) => T)) => void] {
	if (!sharedStateStore.has(key)) {
		sharedStateStore.set(key, {
			value: initialValue,
			subscribers: new Set(),
		});
	}
	const store = sharedStateStore.get(key)!;

	const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

	React.useEffect(() => {
		store.subscribers.add(forceUpdate);
		return () => {
			store.subscribers.delete(forceUpdate);
		};
	}, [key]);

	const setValue = React.useCallback(
		(val: T | ((prev: T) => T)) => {
			const newVal =
				typeof val === "function"
					? (val as (prev: T) => T)(store.value)
					: val;
			store.value = newVal;
			for (const sub of store.subscribers) {
				sub();
			}
		},
		[key]
	);

	return [store.value, setValue];
}

/**
 * Build the scope object injected into user component code.
 * Components are exposed as dynamic getters so references stay fresh.
 */
export function buildScope(registry: ComponentRegistry, app: App): Record<string, any> {
	const scope: Record<string, any> = {
		// React core
		React,
		// All hooks
		useState: React.useState,
		useEffect: React.useEffect,
		useCallback: React.useCallback,
		useMemo: React.useMemo,
		useReducer: React.useReducer,
		useRef: React.useRef,
		useContext: React.useContext,
		useId: React.useId,
		useSyncExternalStore: React.useSyncExternalStore,
		useTransition: React.useTransition,
		useDeferredValue: React.useDeferredValue,
		// Obsidian
		app,
		// Plugin helpers
		useSharedState,
	};

	// Lazy-inject obsidian module (loaded on first access)
	let obsidianModule: any = null;
	Object.defineProperty(scope, "obsidian", {
		get: () => {
			if (!obsidianModule) {
				obsidianModule = require("obsidian");
			}
			return obsidianModule;
		},
		enumerable: true,
	});

	// Dynamic getters for all registered components
	for (const name of registry.getNames()) {
		Object.defineProperty(scope, name, {
			get: () => {
				const entry = registry.get(name);
				return entry?.component ?? (() => null);
			},
			enumerable: true,
			configurable: true,
		});
	}

	return scope;
}

/**
 * Generate scope destructuring code: `const {React, useState, ...} = scope;`
 */
export function getScopeExpression(
	registry: ComponentRegistry,
	app: App
): string {
	const scope = buildScope(registry, app);
	const keys = Object.keys(scope).filter((k) => /^[a-zA-Z_$][\w$]*$/.test(k));
	return `const {${keys.join(",")}} = scope;`;
}

/** Clear shared state (for plugin unload) */
export function clearSharedState(): void {
	sharedStateStore.clear();
}
