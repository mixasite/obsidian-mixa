import { App, debounce, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { getSiteData, syncData } from './sync';
import { MixaSettings } from 'types';

const DEFAULT_SETTINGS: MixaSettings = {
	secretToken: '',
	siteFolder: '',
	subdomain: '',
	publishExternal: false,
	siteUrl: '',
	siteEditUrl: '',
};

export default class MixaPlugin extends Plugin {
	settings: MixaSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('paper-plane', this.settings.siteUrl ? `Publish to ${this.settings.siteUrl.replace(/(^\w+:|^)\/\//, '')} with Mixa` : 'Publish with Mixa', async (evt: MouseEvent) => {
			if (!this.settings.subdomain) {
				new Notice('Please add a valid Secret Token. You can find it in your Mixa Dashboard');
				return;
			}

			new Notice('Publishing your site, hang tight...');
			try {
				await syncData(this.settings, this.app.vault, this.app.metadataCache);
				new Notice('Changes are published to your site successfully');
			} catch (error) {
				new Notice(error.message || 'Failed to publish your site. Please try again, or contact support@mixa.site');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MixaSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MixaSettingTab extends PluginSettingTab {
	plugin: MixaPlugin;
	infoDiv: HTMLDivElement;
	fileDiv: HTMLDivElement;

	constructor(app: App, plugin: MixaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async updateSiteSettings(site: any | null, msg?: string): Promise<void> {
		this.plugin.settings.subdomain = site?.subdomain || '';
		this.plugin.settings.siteUrl = site?.siteUrl || '';
		this.plugin.settings.siteEditUrl = site?.siteEditUrl || '';
		this.infoDiv.textContent = msg ? msg : '';
		this.fileDiv.innerHTML = ''
		await this.plugin.saveSettings();
	}

	renderFileInfo(files: { deletions: { id: string; }[]; uploads: { id: string; }[]; ignored: { id: string; }[] }) {
		this.infoDiv.textContent = '';

		if (!files.uploads.length && !files.deletions.length) {
			this.fileDiv.innerHTML = "Nothing to upload"
		} else {
			this.fileDiv.innerHTML = '<div style="height: 200px; overflow-y: auto;">' +
				files.uploads.map((file: { id: string }) => `<div style="color: green">${file.id}</div>`).join('') +
				files.deletions.map((file: { id: string }) => `<div style="color: red">${file.id} - deleted</div>`).join('') +
				files.ignored.map((file: { id: string }) => `<div style="color: orange">${file.id} - ignored</div>`).join('') +
				'</div>';
		}
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Mixa Settings' });
		containerEl.createEl("a", undefined, link => {
			link.href = 'https://mixa.site';
			link.innerText = `https://mixa.site`;
		});

		new Setting(containerEl)
			.setName('Secret Token')
			.setDesc('Generate it from your Mixa Dashboard for the site you want to publish')
			.addText(text => text
				.setPlaceholder('Enter your secret token')
				.setValue(this.plugin.settings.secretToken)
				.onChange(debounce(async (value) => {
					this.plugin.settings.secretToken = value;
					await this.plugin.saveSettings();

					try {
						this.infoDiv.textContent = 'Parsing your secret token';
						const site = await getSiteData(value);
						this.infoDiv.textContent = '';
						if (site) {
							await this.updateSiteSettings(site);
						} else {
							await this.updateSiteSettings(null, 'Please add a valid Secret Token. You can find it in your Mixa Dashboard');
						}
					} catch (error) {
						await this.updateSiteSettings(null, 'Please add a valid Secret Token. You can find it in your Mixa Dashboard');
						error.response.data.errorText && new Notice(error.response.data.errorText);
					}
					refreshSiteInfo(containerEl, this.plugin.settings);

				}, 1000, true)));

		new Setting(containerEl)
			.setName('Site Folder')
			.setDesc('Type the folder you want to publish. Leave it empty to publish all your documents.')
			.addText(text => text
				.setPlaceholder('e.g. /notes')
				.setValue(this.plugin.settings.siteFolder)
				.onChange(async (value) => {
					this.plugin.settings.siteFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Publish Referenced Files')
			.setDesc('If you specify a Site Folder and your notes are referencing notes and images outside of this folder, do you want to publish referenced notes and images too? (This has no effect when there is no "Site Folder" specified above)')
			.addToggle(text => text
				.setValue(this.plugin.settings.publishExternal)
				.onChange(async (value) => {
					this.plugin.settings.publishExternal = value;
					await this.plugin.saveSettings();
				}));

		createSiteInfo(containerEl, this.plugin.settings);
		refreshSiteInfo(containerEl, this.plugin.settings);

		new Setting(containerEl)
			.addButton((button) => {
				button.setButtonText("Show Changes").onClick(async (e) => {
					if (!this.plugin.settings.subdomain) {
						this.infoDiv.textContent = 'Please add a valid Secret Token. You can find it in your Mixa Dashboard'
						return;
					}
					try {
						this.fileDiv.innerHTML = '';
						this.infoDiv.textContent = 'We are checking the diff...';
						const files = await syncData(this.plugin.settings, this.app.vault, this.app.metadataCache, true);
						this.renderFileInfo(files)
					} catch (error) {
						this.infoDiv.textContent = error.message || 'Failed to get the diff for your site. Please try again, or contact support@mixa.site';
						this.fileDiv.innerHTML = '';
					}
				});
			})
			.addButton((button) => {
				button.setButtonText("Publish").onClick(async (e) => {
					if (!this.plugin.settings.subdomain) {
						this.infoDiv.textContent = 'Please add a valid Secret Token. You can find it in your Mixa Dashboard'
						return;
					}
					try {
						this.fileDiv.innerHTML = '';
						this.infoDiv.textContent = 'We are publishing your site, hang tight';
						const files = await syncData(this.plugin.settings, this.app.vault, this.app.metadataCache);
						this.infoDiv.textContent = 'Changes are published to your site successfully';
						this.renderFileInfo(files)
					} catch (error) {
						this.infoDiv.textContent = error.message || 'Failed to publish your site. Please try again, or contact support@mixa.site';
					}
				});
			});

		this.infoDiv = containerEl.createDiv();
		this.fileDiv = containerEl.createDiv();
	}
}

function createSiteInfo(containerEl: HTMLElement, settings: MixaSettings) {
	createSettingItemLink(containerEl, 'Site', 'Check out your live site here', 'mixa-site-url');
	createSettingItemLink(containerEl, 'Site Edit', 'You can edit your site with Mixa\'s live preview editor', 'mixa-site-edit-url');
}

function refreshSiteInfo(containerEl: HTMLElement, settings: MixaSettings) {
	if (settings.siteUrl) {
		(containerEl.find('#mixa-site-url') as HTMLAnchorElement).href = settings.siteUrl;
		containerEl.find('#mixa-site-url').innerText = settings.siteUrl;
		(containerEl.find('#mixa-site-edit-url') as HTMLAnchorElement).href = settings.siteEditUrl;
		containerEl.find('#mixa-site-edit-url').innerText = settings.siteEditUrl;
		containerEl.findAll('.mixa-setting-item').forEach(e => e.show());
	} else {
		containerEl.findAll('.mixa-setting-item').forEach(e => e.hide());
	}
}

function createSettingItemLink(containerEl: HTMLElement, name: string, description: string, linkId: string) {
	const settingItem = containerEl.createDiv({ cls: 'setting-item mixa-setting-item' });
	const info = settingItem.createDiv({ cls: 'setting-item-info' });
	const control = settingItem.createDiv({ cls: 'setting-item-control' });

	info.createDiv({ cls: 'setting-item-name', text: name });
	info.createDiv({ cls: 'setting-item-description', text: description });
	control.createEl("a", undefined, linkEl => {
		linkEl.id = linkId;
	});
}
