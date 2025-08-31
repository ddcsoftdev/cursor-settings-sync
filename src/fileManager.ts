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
		
		// Write files to local system
		for (const file of files) {
			const content = fileContents[file];
			if (content) {
				const filePath = `${settingsPath}/${file}`;
				try {
					console.log(`Processing file: ${file} (content length: ${content.length})`);
					
					// Regular text/JSON file
					console.log(`Treating as regular file: ${file}`);
					fs.writeFileSync(filePath, content, 'utf8');
				} catch (error) {
					console.log(`Failed to write file: ${filePath}`, error);
				}
			}
		}
	}

	private isImageFile(fileName: string, content: string): boolean {
		// Check if the content is raw Base64 data (version 3.0)
		try {
			// First check if content is empty or whitespace
			if (!content || !content.trim()) {
				console.log(`isImageFile: ${fileName} - empty content`);
				return false;
			}
			
			// Check if filename suggests it's an image file
			const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];
			const hasImageExtension = imageExtensions.some(ext => fileName.toLowerCase().includes(ext));
			
			// Check if it's raw Base64 content
			const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
			const isValidBase64 = base64Regex.test(content.trim());
			
			const isImage = isValidBase64 && hasImageExtension;
			console.log(`isImageFile: ${fileName} - result: ${isImage}`);
			
			return isImage;
		} catch (error) {
			// Log the error for debugging but don't throw
			console.log(`isImageFile: ${fileName} - error: ${error}`);
			return false;
		}
	}

	private async restoreImageFile(fileName: string, content: string, targetPath: string): Promise<void> {
		try {
			// Validate content before processing
			if (!content || !content.trim()) {
				throw new Error('Empty or invalid content');
			}
			
			// Validate that content is valid Base64
			const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
			if (!base64Regex.test(content.trim())) {
				throw new Error('Invalid Base64 content');
			}
			
			// Convert Base64 back to binary
			const buffer = Buffer.from(content, 'base64');
			
			// Ensure the target directory exists
			const path = require('path');
			const dir = path.dirname(targetPath);
			const fs = require('fs');
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			
			// Write the binary data
			fs.writeFileSync(targetPath, buffer);
			
			console.log(`Restored image: ${fileName} (${buffer.length} bytes)`);
		} catch (error) {
			console.log(`Failed to restore image ${fileName}: ${error}`);
			throw error;
		}
	}

	private async restoreImagesDirectory(fileName: string, content: string, targetPath: string): Promise<void> {
		try {
			// Validate content before parsing
			if (!content || !content.trim()) {
				throw new Error('Empty or invalid content');
			}
			
			const directoryData = JSON.parse(content);
			
			// Check if this is a new version manifest (v3.0) or old version
			if (directoryData.version === '3.0') {
				// New version: images are stored as separate files with raw Base64 content
				await this.restoreImagesDirectoryV3(fileName, content, targetPath);
			} else {
				// Old version: images are embedded in the manifest
				await this.restoreImagesDirectoryV1(fileName, content, targetPath);
			}
		} catch (error) {
			console.log(`Failed to restore images directory ${fileName}: ${error}`);
			throw error;
		}
	}

	private async restoreImagesDirectoryV1(fileName: string, content: string, targetPath: string): Promise<void> {
		try {
			const directoryData = JSON.parse(content);
			
			// Validate the directory data structure
			if (!directoryData.directoryName || !directoryData.images) {
				throw new Error('Invalid images directory data structure');
			}
			
			// Create the images directory
			const fs = require('fs');
			const path = require('path');
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}
			
			// Restore each image in the directory
			for (const [imageFileName, imageData] of Object.entries(directoryData.images)) {
				const imagePath = path.join(targetPath, imageFileName);
				
				// Convert Base64 back to binary
				const buffer = Buffer.from((imageData as any).data, 'base64');
				
				// Write the binary data
				fs.writeFileSync(imagePath, buffer);
				
				console.log(`Restored image in directory: ${imageFileName} (${(imageData as any).mimeType}, ${buffer.length} bytes)`);
			}
			
			console.log(`Restored images directory (v1): ${fileName} (${Object.keys(directoryData.images).length} images)`);
		} catch (error) {
			console.log(`Failed to restore images directory v1 ${fileName}: ${error}`);
			throw error;
		}
	}

	private async restoreImagesDirectoryV2(fileName: string, content: string, targetPath: string): Promise<void> {
		try {
			const directoryData = JSON.parse(content);
			
			// Validate the directory data structure
			if (!directoryData.directoryName || !directoryData.images) {
				throw new Error('Invalid images directory data structure');
			}
			
			// Create the images directory
			const fs = require('fs');
			const path = require('path');
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}
			
			// For v2.0, the images are stored as separate files in the gist
			// The manifest just contains metadata about the images
			// The actual image files should be processed separately by the pull manager
			console.log(`Images directory manifest (v2.0) found: ${fileName} (${Object.keys(directoryData.images).length} images)`);
			console.log(`Individual image files will be restored separately`);
		} catch (error) {
			console.log(`Failed to restore images directory v2 ${fileName}: ${error}`);
			throw error;
		}
	}

	private async restoreImagesDirectoryV3(fileName: string, content: string, targetPath: string): Promise<void> {
		try {
			const directoryData = JSON.parse(content);
			
			// Validate the directory data structure
			if (!directoryData.directoryName || !directoryData.images) {
				throw new Error('Invalid images directory data structure');
			}
			
			// Create the images directory
			const fs = require('fs');
			const path = require('path');
			if (!fs.existsSync(targetPath)) {
				fs.mkdirSync(targetPath, { recursive: true });
			}
			
			// For v3.0, the images are stored as separate files with raw Base64 content
			// The manifest just contains metadata about the images
			// The actual image files should be processed separately by the pull manager
			console.log(`Images directory manifest (v3.0) found: ${fileName} (${Object.keys(directoryData.images).length} images)`);
			console.log(`Individual image files will be restored separately`);
		} catch (error) {
			console.log(`Failed to restore images directory v3 ${fileName}: ${error}`);
			throw error;
		}
	}

	private getCursorUserDirectory(homeDir: string): string {
		const platform = process.platform;
		
		if (platform === 'win32') {
			return `${homeDir}\\AppData\\Roaming\\Cursor\\User`;
		} else if (platform === 'darwin') {
			return `${homeDir}/Library/Application Support/Cursor/User`;
		} else {
			return `${homeDir}/.config/Cursor/User`;
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
				if (!homeDir) {
					throw new Error('Could not determine home directory');
				}
				const cursorUserDir = this.getCursorUserDirectory(homeDir);
				
				switch (fileType) {
					case 'settings.json': filePath = `${cursorUserDir}/settings.json`; break;
					case 'keybindings.json': filePath = `${cursorUserDir}/keybindings.json`; break;
					case 'snippets': filePath = `${cursorUserDir}/snippets`; break;
					case 'extensions.json': filePath = `${cursorUserDir}/extensions.json`; break;
					case 'profiles': filePath = `${cursorUserDir}/profiles`; break;
					case 'sync': filePath = `${cursorUserDir}/sync`; break;
					default: filePath = `${cursorUserDir}/${fileType}`;
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
			if (!homeDir) {
				throw new Error('Could not determine home directory');
			}
			const cursorUserDir = this.getCursorUserDirectory(homeDir);
			const settingsPath = `${cursorUserDir}/settings.json`;
			const fs = require('fs');
			
			if (fs.existsSync(settingsPath)) {
				const document = await vscode.workspace.openTextDocument(settingsPath);
				await vscode.window.showTextDocument(document);
				vscode.window.showInformationMessage('Opened Cursor settings file');
			} else {
				const defaultSettings = `{
    "editor.fontSize": 14,
    "editor.tabSize": 2,
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
