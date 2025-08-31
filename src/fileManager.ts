import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

export class FileManager {
	private config: ExtensionConfig;

	constructor(config: ExtensionConfig) {
		this.config = config;
	}

	async readFiles(files: string[], settingsPath: string): Promise<{ [key: string]: string }> {
		const fileContents: { [key: string]: string } = {};
		const fs = require('fs');
		
		// Read all selected files
		for (const file of files) {
			const filePath = `${settingsPath}/${file}`;
			if (fs.existsSync(filePath)) {
				try {
					// Check if it's a directory
					const stats = fs.statSync(filePath);
					if (stats.isDirectory()) {
						// Skip directories for now - they cause GitHub API issues
						console.log(`Skipping directory: ${filePath}`);
						continue;
					} else {
						// For files, read the content
						const content = fs.readFileSync(filePath, 'utf8');
						// Only include files with actual content
						if (content && content.trim()) {
							fileContents[file] = content;
						}
					}
				} catch (error) {
					console.log(`Failed to read file: ${filePath}`, error);
				}
			} else {
				console.log(`File not found: ${filePath}`);
			}
		}
		
		return fileContents;
	}

	async writeFiles(files: string[], settingsPath: string, fileContents: { [key: string]: string }): Promise<void> {
		const fs = require('fs');
		
		// Write JSON files to local system
		for (const file of files) {
			// Skip images directory for now
			if (file === 'images') {
				console.log('Skipping images directory - JSON files only');
				continue;
			}
			
			const content = fileContents[file];
			if (content) {
				const filePath = `${settingsPath}/${file}`;
				try {
					fs.writeFileSync(filePath, content, 'utf8');
				} catch (error) {
					console.log(`Failed to write file: ${filePath}`, error);
				}
			}
		}
	}

	async getFileContent(fileType: string, path?: string): Promise<string> {
		try {
			let filePath = '';
			if (path) {
				const pathParts = path.split('/');
				const fileName = fileType;
				if (pathParts[pathParts.length - 1].includes('.')) {
					pathParts[pathParts.length - 1] = fileName;
				} else {
					pathParts.push(fileName);
				}
				filePath = pathParts.join('/');
			} else {
				const homeDir = process.env.HOME || process.env.USERPROFILE;
				switch (fileType) {
					case 'settings.json': filePath = `${homeDir}/.config/Cursor/User/settings.json`; break;
					case 'keybindings.json': filePath = `${homeDir}/.config/Cursor/User/keybindings.json`; break;
					case 'extensions.json': filePath = `${homeDir}/.config/Cursor/User/extensions.json`; break;
					case 'launch.json': filePath = `${homeDir}/.config/Cursor/User/launch.json`; break;
					case 'tasks.json': filePath = `${homeDir}/.config/Cursor/User/tasks.json`; break;
					case 'snippets': filePath = `${homeDir}/.config/Cursor/User/snippets`; break;
					default: filePath = `${homeDir}/.config/Cursor/User/${fileType}`;
				}
			}
			
			const fs = require('fs');
			if (fs.existsSync(filePath)) {
				return fs.readFileSync(filePath, 'utf8');
			} else {
				return `File not found: ${filePath}\n\nThis file doesn't exist yet or the path is incorrect.`;
			}
		} catch (error) {
			return `Error reading file: ${error}`;
		}
	}

	async openCursorSettings(): Promise<void> {
		try {
			const homeDir = process.env.HOME || process.env.USERPROFILE;
			const settingsPath = `${homeDir}/.config/Cursor/User/settings.json`;
			const fs = require('fs');
			
			if (fs.existsSync(settingsPath)) {
				const document = await vscode.workspace.openTextDocument(settingsPath);
				await vscode.window.showTextDocument(document);
				vscode.window.showInformationMessage('Opened Cursor settings file');
			} else {
				const defaultSettings = `{
    "window.commandCenter": true,
    "window.zoomLevel": 1.2,
    "editor.fontSize": 12.5,
    "editor.cursorBlinking": "phase",
    "editor.cursorSmoothCaretAnimation": "on",
    "files.autoSave": "afterDelay"
}`;
				const path = require('path');
				const dir = path.dirname(settingsPath);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(settingsPath, defaultSettings, 'utf8');
				const document = await vscode.workspace.openTextDocument(settingsPath);
				await vscode.window.showTextDocument(document);
				vscode.window.showInformationMessage('Created and opened new Cursor settings file');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
		}
	}

	getAllFilesInDirectory(dirPath: string): string[] {
		const fs = require('fs');
		const path = require('path');
		const files: string[] = [];
		
		function scanDirectory(currentPath: string) {
			const items = fs.readdirSync(currentPath);
			
			for (const item of items) {
				const fullPath = path.join(currentPath, item);
				const stat = fs.statSync(fullPath);
				
				if (stat.isDirectory()) {
					scanDirectory(fullPath);
				} else {
					files.push(fullPath);
				}
			}
		}
		
		scanDirectory(dirPath);
		return files;
	}
}
