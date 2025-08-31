import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from './types';
import { getDefaultConfig, migrateOldConfig } from './config';

// Get the output channel from the extension
let outputChannel: vscode.OutputChannel | undefined;

export function setOutputChannel(channel: vscode.OutputChannel) {
	outputChannel = channel;
}

function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
	console.log(message);
}

export class ConfigManager {
	private configPath: string;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.configPath = path.join(context.globalStorageUri.fsPath, 'cursor-git-sync-config.json');
	}

	async loadConfig(): Promise<ExtensionConfig> {
		try {
			// Ensure globalStorage directory exists
			const globalStorageDir = path.dirname(this.configPath);
			if (!fs.existsSync(globalStorageDir)) {
				fs.mkdirSync(globalStorageDir, { recursive: true });
			}

			// Try to load from JSON file first
			if (fs.existsSync(this.configPath)) {
				const configData = fs.readFileSync(this.configPath, 'utf8');
				const config = JSON.parse(configData);
				log(`Loaded config from JSON file: ${this.configPath}`);
				log(`Config has token: ${!!config.github?.personalAccessToken}`);
				return migrateOldConfig(config);
			}

			// Fallback to globalState for migration
			const oldConfig = this.context.globalState.get('extensionConfig', getDefaultConfig());
			const migratedConfig = migrateOldConfig(oldConfig);
			log(`Migrated from globalState, has token: ${!!migratedConfig.github?.personalAccessToken}`);
			
			// Save the migrated config to JSON file
			await this.saveConfig(migratedConfig);
			
			return migratedConfig;
		} catch (error) {
			console.error('Error loading config:', error);
			// Return default config if loading fails
			return getDefaultConfig();
		}
	}

	async saveConfig(config: ExtensionConfig): Promise<void> {
		try {
			// Ensure globalStorage directory exists
			const globalStorageDir = path.dirname(this.configPath);
			if (!fs.existsSync(globalStorageDir)) {
				fs.mkdirSync(globalStorageDir, { recursive: true });
			}

			// Save to JSON file
			const configData = JSON.stringify(config, null, 2);
			fs.writeFileSync(this.configPath, configData, 'utf8');
			log(`Saved config to JSON file: ${this.configPath}`);
			log(`Saved config has token: ${!!config.github?.personalAccessToken}`);

			// Also update globalState for backward compatibility
			this.context.globalState.update('extensionConfig', config);
		} catch (error) {
			console.error('Error saving config:', error);
			throw new Error(`Failed to save configuration: ${error}`);
		}
	}

	async savePath(path: string): Promise<void> {
		const config = await this.loadConfig();
		config.settings = config.settings || {};
		config.settings.path = path;
		await this.saveConfig(config);
	}

	async saveSelectedFiles(files: string[]): Promise<void> {
		const config = await this.loadConfig();
		config.includedDirectories = files;
		await this.saveConfig(config);
	}

	getConfigPath(): string {
		return this.configPath;
	}
}
