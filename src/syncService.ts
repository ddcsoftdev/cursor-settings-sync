import * as vscode from 'vscode';
import { ExtensionConfig, TimestampData } from './types';
import { GitHubService } from './github';
import { FileManager } from './fileManager';
import { ConfigManager } from './configManager';
import { FileProcessor } from './fileProcessor';

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
	private fileProcessor: FileProcessor;
	private configManager?: ConfigManager;

	constructor(config: ExtensionConfig, configManager?: ConfigManager) {
		this.config = config;
		log('SyncService constructor - Config has token: ' + !!this.config.github?.personalAccessToken);
		log('SyncService constructor - Token length: ' + (this.config.github?.personalAccessToken?.length || 0));
		log('SyncService constructor - About to create GitHubService with config token: ' + !!config.github?.personalAccessToken);
		this.githubService = new GitHubService(config);
		this.fileManager = new FileManager(config);
		this.fileProcessor = new FileProcessor(config);
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
			
			// Process files using the new FileProcessor
			let settingsPath = this.config.settings.path || path;
			
			// Fix path issues
			if (settingsPath.startsWith('home/') && !settingsPath.startsWith('/')) {
				settingsPath = '/' + settingsPath;
			}
			if (settingsPath.startsWith('~')) {
				settingsPath = settingsPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
			}
			
			log('pushConfiguration - Processing files: ' + files.join(', '));
			log('pushConfiguration - Settings path: ' + settingsPath);
			
			// Use FileProcessor to handle different file types properly
			const processedFiles = await this.fileProcessor.processFiles(files, settingsPath);
			const fileContents = this.fileProcessor.convertToGistFormat(processedFiles);
			
			log('pushConfiguration - Processed files: ' + Object.keys(fileContents).join(', '));
			
			// Check if we have an existing Gist ID
			const existingGistId = this.config.github.gistId;
			log('pushConfiguration - Existing Gist ID: ' + (existingGistId || 'none'));
			let result;
			
			// First, try to find an existing Gist from this extension
			let gistId = existingGistId;
			if (!gistId) {
				log('pushConfiguration - No stored Gist ID, searching for existing Gist...');
				gistId = await this.githubService.findExistingGist();
				if (gistId) {
					log('pushConfiguration - Found existing Gist: ' + gistId);
					// Update config with found Gist ID
					this.config.github.gistId = gistId;
				}
			}
			
			if (gistId) {
				log('pushConfiguration - Replacing existing Gist: ' + gistId);
				try {
					// Always use the replacement strategy: pull, delete, merge, push
					log('pushConfiguration - Calling replaceGistWithMerge...');
					await this.replaceGistWithMerge(files, path, context);
					log('pushConfiguration - replaceGistWithMerge completed successfully');
					return; // replaceGistWithMerge handles its own success message
				} catch (error) {
					log('pushConfiguration - Failed to replace Gist: ' + error);
					
					// Check if this is a 404 error (gist not found)
					if (error instanceof Error && error.message.includes('no longer exists')) {
						log('pushConfiguration - Gist no longer exists, creating new gist instead');
						// Create new gist since the old one doesn't exist
						result = await this.githubService.createGist(files, fileContents);
						// Update config with new gist ID
						this.config.github.gistId = result.id;
						log('pushConfiguration - Created new Gist with ID: ' + result.id);
						
						// Clean up any old Gists after creating new one
						await this.githubService.cleanupOldGists(result.id);
					} else {
						log('pushConfiguration - Creating new Gist instead');
						// If replacement fails for other reasons, create a new one
						result = await this.githubService.createGist(files, fileContents);
						// Update config with new gist ID
						this.config.github.gistId = result.id;
						log('pushConfiguration - Created new Gist with ID: ' + result.id);
						
						// Clean up any old Gists after creating new one
						await this.githubService.cleanupOldGists(result.id);
					}
				}
			} else {
				log('pushConfiguration - Creating new Gist (no existing ID found)');
				// Create new Gist
				result = await this.githubService.createGist(files, fileContents);
				// Update config with new gist ID
				this.config.github.gistId = result.id;
				log('pushConfiguration - Created new Gist with ID: ' + result.id);
				
				// Clean up any old Gists after creating new one
				await this.githubService.cleanupOldGists(result.id);
			}
			if (this.configManager) {
				await this.configManager.saveConfig(this.config);
			} else {
				context.globalState.update('extensionConfig', this.config);
			}
			
			const action = existingGistId ? 'updated' : 'created';
			vscode.window.showInformationMessage(`✅ Configuration ${action} successfully in GitHub Gist! ID: ${result.id}`);
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
				
				progress.report({ increment: 20 });
				
				// Extract file contents from gist
				const fileContents: { [key: string]: string } = {};
				for (const file of files) {
					const gistFile = result.files[file];
					if (gistFile) {
						fileContents[file] = gistFile.content;
					}
				}
				
				progress.report({ increment: 20 });
				
				// Write files to local system
				await this.fileManager.writeFiles(files, path, fileContents);
				
				progress.report({ increment: 20 });
			});
			
			vscode.window.showInformationMessage(`✅ Configuration pulled successfully from GitHub Gist!`);
		} catch (error) {
			vscode.window.showErrorMessage(`❌ Failed to pull configuration: ${error}`);
		}
	}

	async replaceGistWithMerge(files: string[], path: string, context: vscode.ExtensionContext): Promise<void> {
		log('replaceGistWithMerge - Starting replacement strategy');
		try {
			if (!path) {
				vscode.window.showErrorMessage('Please enter a settings path first');
				return;
			}

			// Check authentication first
			if (!this.config.github.personalAccessToken || !this.config.github.personalAccessToken.trim()) {
				vscode.window.showErrorMessage('No GitHub authentication token found. Please enter your Personal Access Token in the GitHub Authentication form above.');
				return;
			}

			const gistId = this.config.github.gistId;
			if (!gistId) {
				vscode.window.showErrorMessage('No Gist ID found. Please push your configuration first.');
				return;
			}

			log(`replaceGistWithMerge - Using gist ID: ${gistId}`);

			vscode.window.showInformationMessage(`Update Gist: Merging and pushing to existing gist... (${files.join(', ')})`);
			
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Updating Gist with merge...",
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 10, message: "Pulling existing Gist..." });
				
				// Step 1: Pull existing gist
				log('replaceGistWithMerge - Step 1: Pulling existing gist');
				let existingGist;
				try {
					existingGist = await this.githubService.getGist(gistId);
					log(`replaceGistWithMerge - Successfully pulled gist with ${Object.keys(existingGist.files).length} files`);
				} catch (error) {
					if (error instanceof Error && error.message.includes('404')) {
						log(`replaceGistWithMerge - Gist ${gistId} not found (404), clearing stored gist ID`);
						// Clear the stored gist ID since it no longer exists
						this.config.github.gistId = null;
						if (this.configManager) {
							await this.configManager.saveConfig(this.config);
						} else {
							context.globalState.update('extensionConfig', this.config);
						}
						// Throw the error to be caught by the calling function
						throw new Error(`Stored gist ID ${gistId} no longer exists. Please try pushing again to create a new gist.`);
					}
					throw error;
				}
				
				// Verify this is the right gist
				const timestampFile = existingGist.files['timestamp.json'];
				if (!timestampFile) {
					throw new Error('No timestamp.json found in Gist');
				}
				
				const timestampData: TimestampData = JSON.parse(timestampFile.content);
				if (timestampData.extensionName !== this.config.extensionName) {
					throw new Error('Gist does not belong to this extension');
				}
				
				progress.report({ increment: 20, message: "Merging files locally..." });
				
				// Step 2: Merge files locally in temp directory
				const fs = require('fs');
				const path = require('path');
				const os = require('os');
				
				// Create temporary directory for merging
				const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-sync-merge-'));
				log(`replaceGistWithMerge - Created merge temp directory: ${tempDir}`);
				
				try {
					// Extract existing files from gist to temp directory
					const existingFiles: { [key: string]: string } = {};
					for (const [fileName, fileData] of Object.entries(existingGist.files)) {
						// Skip our special files
						if (fileName !== 'cursor-git-sync-storage.json' && fileName !== 'timestamp.json') {
							existingFiles[fileName] = fileData.content;
							const tempFilePath = path.join(tempDir, fileName);
							fs.writeFileSync(tempFilePath, fileData.content, 'utf8');
							log(`replaceGistWithMerge - Extracted to temp: ${fileName}`);
						}
					}
					
					log(`replaceGistWithMerge - Found ${Object.keys(existingFiles).length} existing files: ${Object.keys(existingFiles).join(', ')}`);
					
					// Process current local files
					let settingsPath = this.config.settings.path || path;
					
					// Fix path issues
					if (settingsPath.startsWith('home/') && !settingsPath.startsWith('/')) {
						settingsPath = '/' + settingsPath;
					}
					if (settingsPath.startsWith('~')) {
						settingsPath = settingsPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
					}
					
					// Use FileProcessor to handle different file types properly
					const processedFiles = await this.fileProcessor.processFiles(files, settingsPath);
					const newFileContents = this.fileProcessor.convertToGistFormat(processedFiles);
					
					log(`replaceGistWithMerge - Processed ${Object.keys(newFileContents).length} new files: ${Object.keys(newFileContents).join(', ')}`);
					
					// Merge: new files take precedence over existing ones
					const mergedFiles: { [key: string]: { content: string } } = {};
					
					// Start with existing files
					for (const [fileName, content] of Object.entries(existingFiles)) {
						mergedFiles[fileName] = { content };
					}
					
					// Add/override with new files
					for (const [fileName, fileData] of Object.entries(newFileContents)) {
						mergedFiles[fileName] = fileData;
					}
					
					log(`replaceGistWithMerge - Merged ${Object.keys(mergedFiles).length} total files: ${Object.keys(mergedFiles).join(', ')}`);
					
					progress.report({ increment: 20, message: "Updating Gist..." });
					
					// Step 3: Update existing gist with merged content (creates revision)
					log('replaceGistWithMerge - Step 3: Updating existing gist with merged content');
					const result = await this.githubService.updateGist(gistId, files, mergedFiles);
					
					log(`replaceGistWithMerge - Successfully updated gist: ${gistId} (revision created)`);
					
					// Save updated config (gist ID stays the same)
					if (this.configManager) {
						await this.configManager.saveConfig(this.config);
					} else {
						context.globalState.update('extensionConfig', this.config);
					}
					
					progress.report({ increment: 10, message: "Cleanup..." });
					
					// Clean up any other old gists (but not this one)
					await this.githubService.cleanupOldGists(gistId);
					
				} finally {
					// Clean up temp directory
					if (fs.existsSync(tempDir)) {
						try {
							const files = fs.readdirSync(tempDir);
							for (const file of files) {
								const filePath = path.join(tempDir, file);
								fs.unlinkSync(filePath);
							}
							fs.rmdirSync(tempDir);
							log(`replaceGistWithMerge - Cleaned up merge temp directory: ${tempDir}`);
						} catch (error) {
							log(`replaceGistWithMerge - Error cleaning up merge temp directory: ${error}`);
						}
					}
				}
			});
			
			vscode.window.showInformationMessage(`✅ Gist updated successfully with merged content! Revision created for: ${this.config.github.gistId}`);
		} catch (error) {
			log(`replaceGistWithMerge - Error: ${error}`);
			vscode.window.showErrorMessage(`❌ Failed to replace Gist: ${error}`);
		}
	}

	async testGitHubAuthentication(username: string, token: string): Promise<void> {
		await this.githubService.testAuthentication(username, token);
	}
}
