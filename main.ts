import { App, debounce, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { getSiteData, syncData } from 'src/sync';
import { MixaSettings } from 'types';

const DEFAULT_SETTINGS: MixaSettings = {
	secretToken: '',
	siteFolder: '',
	subdomain: '',
	siteUrl: '',
	siteEditUrl: '',
}

export default class MixaPlugin extends Plugin {
	settings: MixaSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('paper-plane', 'Publish with Mixa', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await syncData(this.settings)
			new Notice('Your site is live');
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

	constructor(app: App, plugin: MixaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Mixa Settings' });
		containerEl.createEl("a", undefined, link => {
			link.href = 'https://mixa.site'
			link.innerText = `https://mixa.site`;
		})

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
						infoDiv.textContent = 'Parsing your secret token'
						const site = await getSiteData(value)
						infoDiv.textContent = ''
						if (site) {
							this.plugin.settings.subdomain = site.subdomain
							this.plugin.settings.siteUrl = site.siteUrl;
							this.plugin.settings.siteEditUrl = site.siteEditUrl;
							infoDiv.textContent = ''
							await this.plugin.saveSettings();
						} else {
							this.plugin.settings.subdomain = ''
							this.plugin.settings.siteUrl = '';
							this.plugin.settings.siteEditUrl = '';
							infoDiv.textContent = 'Please add a valid Secret Token. You can find it in your Mixa Dashboard'
							await this.plugin.saveSettings();
						}
					} catch (error) {
						infoDiv.textContent = ''
						this.plugin.settings.subdomain = ''
						this.plugin.settings.siteUrl = '';
						this.plugin.settings.siteEditUrl = '';
						infoDiv.textContent = 'Please add a valid Secret Token. You can find it in your Mixa Dashboard'
						await this.plugin.saveSettings();
						error.response.data.errorText && new Notice(error.response.data.errorText)
					}
					refreshSiteInfo(containerEl, this.plugin.settings)

				}, 1000, true)));

		new Setting(containerEl)
			.setName('Site Folder')
			.setDesc('Type the folder you want to publish. Leave it empty to publish all your documents')
			.addText(text => text
				.setPlaceholder('e.g. /notes')
				.setValue(this.plugin.settings.siteFolder)
				.onChange(async (value) => {
					this.plugin.settings.siteFolder = value;
					await this.plugin.saveSettings();
				}));


		createSiteInfo(containerEl, this.plugin.settings)
		refreshSiteInfo(containerEl, this.plugin.settings)

		new Setting(containerEl)
			.addButton((button) => {
				button.setButtonText("Publish").onClick(async (e) => {
					if (!this.plugin.settings.subdomain) {
						// infoDiv.textContent = 'Please add a valid Secret Token. You can find it in your Mixa Dashboard'
						return
					}
					try {
						infoDiv.textContent = 'We are publishing your site, hang tight'
						await syncData(this.plugin.settings)
						infoDiv.textContent = 'Your site is ready'
					} catch (error) {
						infoDiv.textContent = error.message || 'Failed to publish your site. Please try again, or contact support@mixa.site'
					}
				});
			})

		const infoDiv = containerEl.createDiv()
	}
}

function createSiteInfo(containerEl: HTMLElement, settings: MixaSettings) {
	createSettingItemLink(containerEl, 'Site', 'Check out your live site here', 'mixa-site-url')
	createSettingItemLink(containerEl, 'Site Edit', 'You can edit your site with our live preview editor', 'mixa-site-edit-url')
}

function refreshSiteInfo(containerEl: HTMLElement, settings: MixaSettings) {
	if (settings.siteUrl) {
		containerEl.find('#mixa-site-url').href = settings.siteUrl
		containerEl.find('#mixa-site-url').innerText = settings.siteUrl
		containerEl.find('#mixa-site-edit-url').href = settings.siteEditUrl
		containerEl.find('#mixa-site-edit-url').innerText =  settings.siteEditUrl
		containerEl.findAll('.mixa-setting-item').forEach(e => e.show())
	} else {
		containerEl.findAll('.mixa-setting-item').forEach(e => e.hide())
	}
}

function createSettingItemLink(containerEl: HTMLElement, name: string, description: string, linkId: string) {
	const settingItem = containerEl.createDiv({ cls: 'setting-item mixa-setting-item' })
	const info = settingItem.createDiv({ cls: 'setting-item-info' })
	const control = settingItem.createDiv({ cls: 'setting-item-control' })

	info.createDiv({ cls: 'setting-item-name', text: name })
	info.createDiv({ cls: 'setting-item-description', text: description })
	control.createEl("a", undefined, linkEl => {
		linkEl.id = linkId
	})
}