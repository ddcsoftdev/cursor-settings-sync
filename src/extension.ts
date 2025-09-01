import * as vscode from 'vscode';
import { ExtensionConfig } from './types';
import { getDefaultConfig, migrateOldConfig } from './config';
import { SyncService } from './syncService';
import { FileManager } from './fileManager';
import { getDashboardHTML } from './ui';
import { ConfigManager, setOutputChannel } from './configManager';
import { setGitHubOutputChannel } from './github';
import { setSyncOutputChannel } from './syncService';
import { setFileProcessorOutputChannel } from './fileProcessor';
import { setPullOutputChannel } from './pullManager';
import { GitHubService } from './github';

function getDefaultSettingsPath(): string {
	const homeDir = require('os').homedir();
	const platform = require('os').platform();
	const path = require('path');
	
	if (platform === 'win32') {
		return path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User');
	} else if (platform === 'darwin') {
		return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User');
	} else {
		return path.join(homeDir, '.config', 'Cursor', 'User');
	}
}

// Create a dedicated output channel for logging
const outputChannel = vscode.window.createOutputChannel('Cursor Git Settings Sync');

export function activate(context: vscode.ExtensionContext) {
	// Set up logging
	setOutputChannel(outputChannel);
	setGitHubOutputChannel(outputChannel);
	setSyncOutputChannel(outputChannel);
	setFileProcessorOutputChannel(outputChannel);
	setPullOutputChannel(outputChannel);
	outputChannel.appendLine('Congratulations, your extension "cursor-git-settings-sync" is now active!');

	// Register the dashboard command
	let showDashboard = vscode.commands.registerCommand('cursor-git-settings-sync.showDashboard', () => {
		showSettingsSyncDashboard(context);
	});

	// Register pull config command
	let pullConfig = vscode.commands.registerCommand('cursor-git-settings-sync.pullConfig', () => {
		vscode.window.showInformationMessage('Please use the dashboard to pull configuration');
	});

	// Register push config command
	let pushConfig = vscode.commands.registerCommand('cursor-git-settings-sync.pushConfig', () => {
		vscode.window.showInformationMessage('Please use the dashboard to push configuration');
	});

	// Register open settings command
	let openSettings = vscode.commands.registerCommand('cursor-git-settings-sync.openSettings', () => {
		openCursorSettings(context);
	});

	context.subscriptions.push(showDashboard, pullConfig, pushConfig, openSettings);
}

async function showSettingsSyncDashboard(context: vscode.ExtensionContext) {
	const panel = vscode.window.createWebviewPanel(
		'settingsSyncDashboard',
		'Cursor Git Settings Sync',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	// Initialize config manager
	const configManager = new ConfigManager(context);
	
	// Get saved configuration
	const savedConfig = await configManager.loadConfig();
			const savedPath = savedConfig.settings?.path || getDefaultSettingsPath();
	const savedFiles = savedConfig.includedDirectories || [];

	panel.webview.html = getDashboardHTML(savedPath, savedFiles, savedConfig, configManager.getConfigPath());

	panel.webview.onDidReceiveMessage(
		async message => {
			outputChannel.appendLine(`Received message: ${message.command}`);
			switch (message.command) {
				case 'pullConfig':
					outputChannel.appendLine('Handling pullConfig');
					pullConfiguration(message.files, message.path, context);
					break;
				case 'pushConfig':
					outputChannel.appendLine(`Handling pushConfig with files: ${message.files.join(', ')}`);
					pushConfiguration(message.files, message.path, context);
					break;
				case 'getFileContent':
					getFileContent(panel.webview, message.fileType, message.path);
					break;
				case 'savePath':
					await configManager.savePath(message.path);
					vscode.window.showInformationMessage('Settings path saved successfully!');
					break;
				case 'saveSelections':
					await configManager.saveSelectedFiles(message.files);
					vscode.window.showInformationMessage('File selections saved successfully!');
					break;
				case 'saveConfig':
					const migratedConfig = migrateOldConfig(message.config);
					await configManager.saveConfig(migratedConfig);
					vscode.window.showInformationMessage('Extension configuration saved successfully!');
					break;
				case 'testGitHubAuth':
					testGitHubAuthentication(message.username, message.token, context);
					break;
				case 'openConfigFile':
					openConfigFile(context);
					break;
			}
		},
		undefined,
		context.subscriptions
	);
}

async function pullConfiguration(files: string[], path: string, context: vscode.ExtensionContext) {
	const configManager = new ConfigManager(context);
	const config = await configManager.loadConfig();
	const syncService = new SyncService(config, configManager);
	await syncService.pullConfiguration(files, path, context);
}

async function pushConfiguration(files: string[], path: string, context: vscode.ExtensionContext) {
	outputChannel.appendLine(`pushConfiguration function called with files: ${files.join(', ')} path: ${path}`);
	const configManager = new ConfigManager(context);
	const config = await configManager.loadConfig();
	outputChannel.appendLine(`extension pushConfiguration - Config has token: ${!!config.github?.personalAccessToken}`);
	outputChannel.appendLine(`extension pushConfiguration - Token length: ${config.github?.personalAccessToken?.length || 0}`);
	outputChannel.appendLine(`extension pushConfiguration - Token starts with: ${config.github?.personalAccessToken?.substring(0, 4) || 'none'}`);
	const syncService = new SyncService(config, configManager);
	await syncService.pushConfiguration(files, path, context);
}

async function getFileContent(webview: vscode.Webview, fileType: string, path?: string) {
	// For file content, we don't need the full config, just use default
	const config = getDefaultConfig();
	const fileManager = new FileManager(config);
	const content = await fileManager.getFileContent(fileType, path);
	
	webview.postMessage({
		command: 'updateFileContent',
		content: content
	});
}

async function openCursorSettings(context: vscode.ExtensionContext) {
	const configManager = new ConfigManager(context);
	const config = await configManager.loadConfig();
	const fileManager = new FileManager(config);
	await fileManager.openCursorSettings();
}

async function testGitHubAuthentication(username: string, token: string, context: vscode.ExtensionContext) {
	const configManager = new ConfigManager(context);
	const config = await configManager.loadConfig();
	const syncService = new SyncService(config, configManager);
	await syncService.testGitHubAuthentication(username, token);
}

async function openConfigFile(context: vscode.ExtensionContext) {
	try {
		const configManager = new ConfigManager(context);
		const configPath = configManager.getConfigPath();
		
		// Check if config file exists
		const fs = require('fs');
		if (fs.existsSync(configPath)) {
			// Open the config file in a new tab
			const document = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(document, { preview: false });
			vscode.window.showInformationMessage(`Opened config file: ${configPath}`);
		} else {
			// Create the config file if it doesn't exist
			const config = await configManager.loadConfig();
			const configData = JSON.stringify(config, null, 2);
			fs.writeFileSync(configPath, configData, 'utf8');
			
			const document = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(document, { preview: false });
			vscode.window.showInformationMessage(`Created and opened config file: ${configPath}`);
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to open config file: ${error}`);
	}
}

async function listAllGists(context: vscode.ExtensionContext) {
	outputChannel.appendLine('🔍 Starting local gist analysis...');
	
	try {
		// Initialize config manager and GitHub service
		const configManager = new ConfigManager(context);
		const config = await configManager.loadConfig();
		const githubService = new GitHubService(config);
		
		// Create temp directory for local analysis
		const fs = require('fs');
		const path = require('path');
		const os = require('os');
		
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-gist-analysis-'));
		outputChannel.appendLine(`📁 Created temp directory: ${tempDir}`);
		
		try {
			// Download all gists to temp directory
			outputChannel.appendLine('📥 Downloading all gists for local analysis...');
			const gists = await githubService.listAllGists();
			
			outputChannel.appendLine(`📊 Found ${gists.length} total gists`);
			
			// Analyze each gist locally
			for (const gist of gists) {
				const gistDir = path.join(tempDir, gist.id);
				fs.mkdirSync(gistDir, { recursive: true });
				
				outputChannel.appendLine(`\n🔍 Analyzing Gist: ${gist.id}`);
				outputChannel.appendLine(`   Description: ${gist.description}`);
				outputChannel.appendLine(`   Created: ${gist.created_at}`);
				outputChannel.appendLine(`   Updated: ${gist.updated_at}`);
				outputChannel.appendLine(`   Files: ${Object.keys(gist.files).join(', ')}`);
				
				// Check for identification files
				const hasStorageFile = gist.files['cursor-git-sync-storage.json'];
				const hasTimestampFile = gist.files['timestamp.json'];
				
				outputChannel.appendLine(`   Storage file: ${hasStorageFile ? '✅' : '❌'}`);
				outputChannel.appendLine(`   Timestamp file: ${hasTimestampFile ? '✅' : '❌'}`);
				
				// Download and analyze storage file if it exists
				if (hasStorageFile && hasStorageFile.content) {
					try {
						const storageFilePath = path.join(gistDir, 'cursor-git-sync-storage.json');
						fs.writeFileSync(storageFilePath, hasStorageFile.content, 'utf8');
						
						const config = JSON.parse(hasStorageFile.content);
						outputChannel.appendLine(`   Extension name: ${config.extensionName || 'undefined'}`);
						outputChannel.appendLine(`   Username: ${config.github?.username || 'undefined'}`);
						outputChannel.appendLine(`   Gist ID in config: ${config.github?.gistId || 'undefined'}`);
						
						// Check if this matches our current extension
						const isMatch = config.extensionName === 'cursor-settings-sync';
						outputChannel.appendLine(`   Extension match: ${isMatch ? '✅' : '❌'}`);
						
						if (isMatch) {
							outputChannel.appendLine(`   🎯 POTENTIAL MATCH FOUND!`);
						}
						
					} catch (error) {
						outputChannel.appendLine(`   ❌ Error parsing storage file: ${error}`);
					}
				}
				
				// Download and analyze timestamp file if it exists
				if (hasTimestampFile && hasTimestampFile.content) {
					try {
						const timestampFilePath = path.join(gistDir, 'timestamp.json');
						fs.writeFileSync(timestampFilePath, hasTimestampFile.content, 'utf8');
						
						const timestamp = JSON.parse(hasTimestampFile.content);
						outputChannel.appendLine(`   Timestamp: ${timestamp.timestamp || 'undefined'}`);
						outputChannel.appendLine(`   Files in timestamp: ${timestamp.files?.join(', ') || 'none'}`);
						
					} catch (error) {
						outputChannel.appendLine(`   ❌ Error parsing timestamp file: ${error}`);
					}
				}
				
				// Download all files for inspection
				for (const [fileName, fileData] of Object.entries(gist.files)) {
					if ((fileData as any).content) {
						const filePath = path.join(gistDir, fileName);
						fs.writeFileSync(filePath, (fileData as any).content, 'utf8');
					}
				}
			}
			
			// Run the findExistingGist logic locally
			outputChannel.appendLine('\n🔍 Running findExistingGist logic locally...');
			const foundGistId = await githubService.findExistingGist();
			
			if (foundGistId) {
				outputChannel.appendLine(`✅ findExistingGist found: ${foundGistId}`);
			} else {
				outputChannel.appendLine(`❌ findExistingGist found nothing`);
			}
			
			outputChannel.appendLine('\n📁 All gist files downloaded to temp directory for inspection');
			outputChannel.appendLine(`   Temp directory: ${tempDir}`);
			outputChannel.appendLine('   You can manually inspect the files there');
			
		} finally {
			// Clean up temp directory after 30 seconds (give user time to inspect)
			setTimeout(() => {
				try {
					if (fs.existsSync(tempDir)) {
						const files = fs.readdirSync(tempDir);
						for (const file of files) {
							const filePath = path.join(tempDir, file);
							if (fs.statSync(filePath).isDirectory()) {
								const subFiles = fs.readdirSync(filePath);
								for (const subFile of subFiles) {
									fs.unlinkSync(path.join(filePath, subFile));
								}
								fs.rmdirSync(filePath);
							} else {
								fs.unlinkSync(filePath);
							}
						}
						fs.rmdirSync(tempDir);
						outputChannel.appendLine(`🧹 Cleaned up temp directory: ${tempDir}`);
					}
				} catch (error) {
					outputChannel.appendLine(`❌ Error cleaning up temp directory: ${error}`);
				}
			}, 30000); // 30 seconds
		}
		
	} catch (error) {
		outputChannel.appendLine(`❌ Error in listAllGists: ${error}`);
		vscode.window.showErrorMessage(`Error listing gists: ${error}`);
	}
}

export function deactivate() {}