import * as vscode from 'vscode';
import { ExtensionConfig, TimestampData } from './types';
import { GitHubService } from './github';
import { FileManager } from './fileManager';
import { ConfigManager } from './configManager';

// Get the output channel from the extension
let outputChannel: vscode.OutputChannel | undefined;

export function setSyncOutputChannel(channel: vscode.OutputChannel) {
	outputChannel = channel;
}

function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
	console.log(message);
}

export class SyncService {
	private config: ExtensionConfig;
	private githubService: GitHubService;
	private fileManager: FileManager;
	private configManager?: ConfigManager;

	constructor(config: ExtensionConfig, configManager?: ConfigManager) {
		this.config = config;
		log('SyncService constructor - Config has token: ' + !!this.config.github?.personalAccessToken);
		log('SyncService constructor - Token length: ' + (this.config.github?.personalAccessToken?.length || 0));
		log('SyncService constructor - About to create GitHubService with config token: ' + !!config.github?.personalAccessToken);
		this.githubService = new GitHubService(config);
		this.fileManager = new FileManager(config);
		this.configManager = configManager;
	}

	async pushConfiguration(files: string[], path: string, context: vscode.ExtensionContext): Promise<void> {
		try {
			if (!path) {
				vscode.window.showErrorMessage('Please enter a settings path first');
				return;
			}

			// Debug: Check what we have in the config
			log('pushConfiguration - Config has token: ' + !!this.config.github?.personalAccessToken);
			log('pushConfiguration - Token length: ' + (this.config.github?.personalAccessToken?.length || 0));
			log('pushConfiguration - Token starts with: ' + (this.config.github?.personalAccessToken?.substring(0, 4) || 'none'));

			// Check authentication first
			if (!this.config.github.personalAccessToken || !this.config.github.personalAccessToken.trim()) {
				vscode.window.showErrorMessage('No GitHub authentication token found. Please enter your Personal Access Token in the GitHub Authentication form above.');
				return;
			}
			
			vscode.window.showInformationMessage(`Push Config: Creating GitHub Gist... (${files.join(', ')})`);
			
			// Read files
			const settingsPath = this.config.settings.path || path;
			const fileContents = await this.fileManager.readFiles(files, settingsPath);
			
			// Create Gist
			const result = await this.githubService.createGist(files, fileContents);
			
			// Update config with new gist ID
			this.config.github.gistId = result.id;
			if (this.configManager) {
				await this.configManager.saveConfig(this.config);
			} else {
				context.globalState.update('extensionConfig', this.config);
			}
			
			vscode.window.showInformationMessage(`✅ Configuration pushed successfully to GitHub Gist! ID: ${result.id}`);
		} catch (error) {
			vscode.window.showErrorMessage(`❌ Failed to push configuration: ${error}`);
		}
	}

	async pullConfiguration(files: string[], path: string, context: vscode.ExtensionContext): Promise<void> {
		try {
			if (!path) {
				vscode.window.showErrorMessage('Please enter a settings path first');
				return;
			}

			const gistId = this.config.github.gistId;
			
			if (!gistId) {
				vscode.window.showErrorMessage('No Gist ID found. Please push your configuration first.');
				return;
			}
			
			vscode.window.showInformationMessage(`Pull Config: Fetching from GitHub Gist... (${files.join(', ')})`);
			
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Pulling configuration from GitHub Gist...",
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 10 });
				
				// Fetch gist
				const result = await this.githubService.getGist(gistId);
				
				progress.report({ increment: 30 });
				
				// Verify this is the right gist by checking extension name
				const timestampFile = result.files['timestamp.json'];
				if (!timestampFile) {
					throw new Error('No timestamp.json found in Gist');
				}
				
				const timestampData: TimestampData = JSON.parse(timestampFile.content);
				if (timestampData.extensionName !== this.config.extensionName) {
					throw new Error('Gist does not belong to this extension');
				}
				
				progress.report({ increment: 60 });
				
				// Update included directories from timestamp
				if (timestampData.includedDirectories) {
					this.config.includedDirectories = timestampData.includedDirectories;
					if (this.configManager) {
						await this.configManager.saveConfig(this.config);
					} else {
						context.globalState.update('extensionConfig', this.config);
					}
				}
				
				progress.report({ increment: 80 });
				
				// Write files to local system
				const settingsPath = this.config.settings.path || path;
				const fileContents: { [key: string]: string } = {};
				for (const [fileName, fileData] of Object.entries(result.files)) {
					fileContents[fileName] = fileData.content;
				}
				await this.fileManager.writeFiles(files, settingsPath, fileContents);
				
				progress.report({ increment: 100 });
			});
			
			vscode.window.showInformationMessage(`Configuration pulled successfully from GitHub Gist for: ${files.join(', ')}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to pull configuration: ${error}`);
		}
	}

	async testGitHubAuthentication(username: string, token: string): Promise<void> {
		await this.githubService.testAuthentication(username, token);
	}
}
