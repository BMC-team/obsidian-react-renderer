// Minimal mock of obsidian module for testing
export class Plugin {
	app: any = {};
	manifest: any = {};
	register(_fn: () => void) {}
	registerEvent(_event: any) {}
	registerEditorExtension(_ext: any) {}
	registerMarkdownCodeBlockProcessor(_lang: string, _handler: any) {}
	registerMarkdownPostProcessor(_handler: any, _priority?: number) {}
	addCommand(_cmd: any) {}
	addSettingTab(_tab: any) {}
	loadData() { return Promise.resolve(null); }
	saveData(_data: any) { return Promise.resolve(); }
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any = { empty() {} };
	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}
	display() {}
}

export class Setting {
	constructor(_el: any) {}
	setName(_n: string) { return this; }
	setDesc(_d: string) { return this; }
	addText(_fn: any) { return this; }
	addToggle(_fn: any) { return this; }
}

export class Component {
	load() {}
	unload() {}
}

export class TFile {
	path = "";
	basename = "";
	extension = "";
}

export class TFolder {
	children: any[] = [];
}

export class MarkdownRenderer {
	static render(..._args: any[]) {}
}

export class Workspace {
	onLayoutReady(fn: () => void) { fn(); }
	iterateAllLeaves(_fn: any) {}
}
