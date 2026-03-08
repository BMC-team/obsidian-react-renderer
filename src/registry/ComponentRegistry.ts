import type { ComponentEntry, RegistryEvent, RegistryEventType } from "../types";

type RegistryListener = (event: RegistryEvent) => void;

/**
 * Central store for all registered React components.
 * Emits events when components are added, updated, or removed.
 */
export class ComponentRegistry {
	private components = new Map<string, ComponentEntry>();
	private listeners = new Set<RegistryListener>();

	/** Register or update a component */
	register(entry: ComponentEntry): void {
		const existing = this.components.get(entry.name);
		const eventType: RegistryEventType = existing
			? "component-updated"
			: "component-registered";

		entry.lastUpdated = Date.now();
		this.components.set(entry.name, entry);
		this.emit({ type: eventType, name: entry.name, entry });
	}

	/** Remove a component by name */
	unregister(name: string): void {
		if (this.components.has(name)) {
			this.components.delete(name);
			this.emit({ type: "component-removed", name });
		}
	}

	/** Get a component by name */
	get(name: string): ComponentEntry | undefined {
		return this.components.get(name);
	}

	/** Get all registered components */
	getAll(): ComponentEntry[] {
		return Array.from(this.components.values());
	}

	/** Get components by namespace */
	getByNamespace(namespace: string): ComponentEntry[] {
		return this.getAll().filter((c) => c.namespace === namespace);
	}

	/** Get all component names */
	getNames(): string[] {
		return Array.from(this.components.keys());
	}

	/** Check if a component exists */
	has(name: string): boolean {
		return this.components.has(name);
	}

	/** Get the header component if one is registered */
	getHeaderComponent(): ComponentEntry | undefined {
		return this.getAll().find((c) => c.isHeader);
	}

	/** Subscribe to registry events */
	on(listener: RegistryListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Clear all components */
	clear(): void {
		const names = this.getNames();
		this.components.clear();
		for (const name of names) {
			this.emit({ type: "component-removed", name });
		}
	}

	private emit(event: RegistryEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (err) {
				console.error("[ReactRenderer] Registry listener error:", err);
			}
		}
	}
}
