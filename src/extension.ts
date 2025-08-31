import * as vscode from 'vscode';
import { ExtensionConfig } from './types';
import { getDefaultConfig, migrateOldConfig } from './config';
import { SyncService } from './syncService';
import { FileManager } from './fileManager';
import { getDashboardHTML } from './ui';
import { ConfigManager, setOutputChannel } from './configManager';
import { setGitHubOutputChannel } from './github';
import { setSyncOutputChannel } from './syncService';

// Create a dedicated output channel for logging
const outputChannel = vscode.window.createOutputChannel('Cursor Git Settings Sync');

export function activate(context: vscode.ExtensionContext) {
	// Set up logging
	setOutputChannel(outputChannel);
	setGitHubOutputChannel(outputChannel);
	setSyncOutputChannel(outputChannel);
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
	const savedPath = savedConfig.settings?.path || '~/.config/Cursor/User';
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

export function deactivate() {}