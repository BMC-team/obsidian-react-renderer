import { App, PluginSettingTab, Setting } from "obsidian";
import type ReactRendererPlugin from "./main";
import { DEFAULT_SETTINGS, type ReactRendererSettings } from "./types";

export class ReactRendererSettingTab extends PluginSettingTab {
	plugin: ReactRendererPlugin;

	constructor(app: App, plugin: ReactRendererPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Components folder")
			.setDesc(
				"Vault-relative path to folder containing component definitions (e.g. 'components'). Leave empty to disable file-based components."
			)
			.addText((text) =>
				text
					.setPlaceholder("components")
					.setValue(this.plugin.settings.componentsFolder)
					.onChange(async (value) => {
						this.plugin.settings.componentsFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto refresh")
			.setDesc(
				"Automatically re-render components when their source files change."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoRefresh)
					.onChange(async (value) => {
						this.plugin.settings.autoRefresh = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Live Preview")
			.setDesc("Render JSX code blocks inline in Live Preview (editor) mode.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableLivePreview)
					.onChange(async (value) => {
						this.plugin.settings.enableLivePreview = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Header component")
			.setDesc("Enable injecting a React component at the top of every note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableHeaderComponent)
					.onChange(async (value) => {
						this.plugin.settings.enableHeaderComponent = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Header component name")
			.setDesc("Name of the registered component to use as the note header.")
			.addText((text) =>
				text
					.setPlaceholder("NoteHeader")
					.setValue(this.plugin.settings.headerComponentName)
					.onChange(async (value) => {
						this.plugin.settings.headerComponentName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Lazy load Babel")
			.setDesc(
				"Defer loading the JSX transpiler until the first code block is encountered. Reduces startup time."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lazyLoadBabel)
					.onChange(async (value) => {
						this.plugin.settings.lazyLoadBabel = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
