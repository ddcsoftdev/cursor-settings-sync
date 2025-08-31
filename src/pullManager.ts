import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExtensionConfig, TimestampData } from './types';
import { GitHubService } from './github';
import { FileManager } from './fileManager';

// Get the output channel from the extension
let outputChannel: vscode.OutputChannel | undefined;

export function setPullOutputChannel(channel: vscode.OutputChannel) {
	outputChannel = channel;
}

function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
	console.log(message);
}

export class PullManager {
	private config: ExtensionConfig;
	private githubService: GitHubService;
	private fileManager: FileManager;
	private tempDir: string | null = null;
	private backupDir: string | null = null;

	constructor(config: ExtensionConfig) {
		this.config = config;
		this.githubService = new GitHubService(config);
		this.fileManager = new FileManager(config);
	}

	async pullConfiguration(files: string[], settingsPath: string, context: vscode.ExtensionContext): Promise<void> {
		try {
			if (!settingsPath) {
				vscode.window.showErrorMessage('Please enter a settings path first');
				return;
			}

			// Resolve the settings path if it contains ~ or is missing leading slash
			let resolvedSettingsPath = settingsPath;
			if (settingsPath.startsWith('~')) {
				resolvedSettingsPath = path.join(require('os').homedir(), settingsPath.substring(1));
			} else if (!settingsPath.startsWith('/') && !settingsPath.startsWith('C:\\')) {
				// If path doesn't start with / (Unix) or C:\ (Windows), assume it's relative to home
				// Check if it already contains the full home path structure
				const homeDir = require('os').homedir();
				if (settingsPath.startsWith('home/')) {
					// Path starts with 'home/', just prepend /
					resolvedSettingsPath = '/' + settingsPath;
				} else {
					// Path is truly relative, prepend home directory
					resolvedSettingsPath = path.join(homeDir, settingsPath);
				}
			}
			log(`PullManager - Original settings path: ${settingsPath}`);
			log(`PullManager - Resolved settings path: ${resolvedSettingsPath}`);

			const gistId = this.config.github.gistId;
			
			if (!gistId) {
				vscode.window.showErrorMessage('No Gist ID found. Please push your configuration first.');
				return;
			}

			// Check if user has selected any included directories
			if (!this.config.includedDirectories || this.config.includedDirectories.length === 0) {
				vscode.window.showErrorMessage('No files selected for pull. Please select files in the configuration.');
				return;
			}
			
			vscode.window.showInformationMessage(`Pull Config: Fetching from GitHub Gist... (${files.join(', ')})`);
			
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Pulling configuration from GitHub Gist...",
				cancellable: false
			}, async (progress) => {
				progress.report({ increment: 10, message: "Fetching gist..." });
				
				// Step 1: Fetch gist
				const result = await this.githubService.getGist(gistId);
				log(`Fetched gist with ${Object.keys(result.files).length} files: ${Object.keys(result.files).join(', ')}`);
				
				progress.report({ increment: 15, message: "Verifying gist..." });
				
				// Step 2: Verify this is the right gist
				const timestampFile = result.files['timestamp.json'];
				if (!timestampFile) {
					throw new Error('No timestamp.json found in Gist');
				}
				
				log(`Timestamp file exists in gist`);
				log(`Timestamp file content length: ${timestampFile.content.length}`);
				log(`Timestamp file content preview: ${timestampFile.content.substring(0, 100)}...`);
				log(`Full timestamp content: ${timestampFile.content}`);
				
				// Check if timestamp file is empty
				if (!timestampFile.content || !timestampFile.content.trim()) {
					log(`Warning: timestamp.json is empty, skipping verification`);
					// For empty timestamp files, we'll skip verification but continue with the pull
					// This allows pulling from gists that might have been created before timestamp.json was implemented
				} else {
					let timestampData: TimestampData;
					try {
						timestampData = JSON.parse(timestampFile.content);
					} catch (error) {
						log(`Error parsing timestamp.json: ${error}`);
						log(`Timestamp content: ${timestampFile.content}`);
						throw new Error(`Invalid timestamp.json format: ${error}`);
					}
					
					if (timestampData.extensionName !== this.config.extensionName) {
						throw new Error('Gist does not belong to this extension');
					}
				}
				
				progress.report({ increment: 15, message: "Creating temp directory..." });
				
				// Step 3: Create temporary directory
				this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-sync-pull-'));
				log(`Created temp directory for pull: ${this.tempDir}`);
				
				progress.report({ increment: 15, message: "Extracting files to temp..." });
				
				// Step 4: Extract all files from gist to temp directory
				const allFileContents: { [key: string]: string } = {};
				log(`Processing ${Object.keys(result.files).length} files from gist`);
				
				// Group files by type for better processing
				const imageFiles: { [key: string]: string } = {};
				const manifestFiles: { [key: string]: string } = {};
				const regularFiles: { [key: string]: string } = {};
				
				for (const [fileName, gistFile] of Object.entries(result.files)) {
					// Skip our special files
					if (fileName !== 'cursor-git-sync-storage.json' && fileName !== 'timestamp.json' && fileName !== 'cursor-git-sync-manifest.json') {
						log(`Processing gist file: ${fileName} (content length: ${gistFile.content.length})`);
						
						// Debug: Check if content is actually empty or just whitespace
						if (gistFile.content.length === 0) {
							log(`Warning: File ${fileName} has zero content length from GitHub`);
						} else if (!gistFile.content.trim()) {
							log(`Warning: File ${fileName} has only whitespace content from GitHub`);
						}
						
						// Categorize files based on their structure
						if (this.isManifestFile(fileName, gistFile.content)) {
							manifestFiles[fileName] = gistFile.content;
							log(`Categorized as manifest file: ${fileName}`);
						} else {
							regularFiles[fileName] = gistFile.content;
							log(`Categorized as regular file: ${fileName}`);
						}
					}
				}
				
				// Process manifest files first to understand image structure
				const imageManifests: { [key: string]: any } = {};
				for (const [fileName, content] of Object.entries(manifestFiles)) {
					try {
						const manifest = JSON.parse(content);
						if ((manifest.version === '2.0' || manifest.version === '3.0') && manifest.directoryName === 'images') {
							imageManifests[fileName] = manifest;
							log(`Found v${manifest.version} images manifest: ${fileName}`);
						}
					} catch (error) {
						log(`Error parsing manifest file ${fileName}: ${error}`);
					}
				}
				
				// Merge all files for processing
				Object.assign(allFileContents, regularFiles, imageFiles, manifestFiles);
				
				log(`Extracted ${Object.keys(allFileContents).length} files for processing (${Object.keys(regularFiles).length} regular, ${Object.keys(imageFiles).length} images, ${Object.keys(manifestFiles).length} manifests)`);
				
				// Debug: Check for empty files
				for (const [fileName, content] of Object.entries(allFileContents)) {
					if (content.length === 0) {
						log(`Warning: File ${fileName} has empty content after categorization`);
					}
				}
				
				// Write all files to temp directory
				log(`Writing ${Object.keys(allFileContents).length} files to temp directory: ${this.tempDir}`);
				try {
					// Process files in the correct order: manifests first, then images, then regular files
					
					// 1. Write manifest files first
					for (const [fileName, content] of Object.entries(manifestFiles)) {
						const tempFilePath = path.join(this.tempDir, fileName);
						const tempFileDir = path.dirname(tempFilePath);
						if (!fs.existsSync(tempFileDir)) {
							fs.mkdirSync(tempFileDir, { recursive: true });
						}
						fs.writeFileSync(tempFilePath, content, 'utf8');
						log(`Wrote manifest file to temp: ${fileName}`);
					}
					
					// 2. Write image files
					for (const [fileName, content] of Object.entries(imageFiles)) {
						const tempFilePath = path.join(this.tempDir, fileName);
						const tempFileDir = path.dirname(tempFilePath);
						if (!fs.existsSync(tempFileDir)) {
							fs.mkdirSync(tempFileDir, { recursive: true });
						}
						
						// Write raw Base64 content
						fs.writeFileSync(tempFilePath, content, 'utf8');
						log(`Wrote raw Base64 image file to temp: ${fileName}`);
					}
					
					// 3. Write regular files
					for (const [fileName, content] of Object.entries(regularFiles)) {
						const tempFilePath = path.join(this.tempDir, fileName);
						const tempFileDir = path.dirname(tempFilePath);
						if (!fs.existsSync(tempFileDir)) {
							fs.mkdirSync(tempFileDir, { recursive: true });
						}
						fs.writeFileSync(tempFilePath, content, 'utf8');
						log(`Wrote regular file to temp: ${fileName}`);
					}
					
					log(`Successfully wrote all files to temp directory`);
				} catch (error) {
					log(`Error writing files to temp directory: ${error}`);
					throw error;
				}
				
				progress.report({ increment: 15, message: "Filtering included files..." });
				
				// Step 5: Filter files based on user's selection (included directories)
				const filesToRestore = Object.keys(allFileContents).filter(fileName => {
					// Skip internal gist files
					if (fileName.startsWith('cursor-git-sync-') || fileName === 'timestamp.json') {
						return false;
					}
					
					// Check if this file matches any of the user's selected files
					for (const selectedFile of this.config.includedDirectories || []) {
						if (fileName === selectedFile || 
							fileName.startsWith(selectedFile + '/') || 
							fileName === selectedFile + '.json') {
							return true;
						}
					}
					return false;
				});
				
				log(`Files to restore from gist (based on user selection): ${filesToRestore.join(', ')}`);
				
				if (filesToRestore.length === 0) {
					throw new Error('No files match your current selection. Please select files in the configuration.');
				}
				
				progress.report({ increment: 15, message: "Managing backups..." });
				
				// Step 6: Manage backup directory
				await this.manageBackupDirectory(resolvedSettingsPath, filesToRestore);
				
				progress.report({ increment: 15, message: "Copying files to settings..." });
				
				// Step 7: Copy files from temp to settings directory
				await this.copyFilesToSettings(this.tempDir, resolvedSettingsPath, filesToRestore);
				
				// Verify files were actually written
				log(`Verifying files were written to settings directory...`);
				for (const fileName of filesToRestore) {
					const targetPath = path.join(resolvedSettingsPath, fileName);
					if (fs.existsSync(targetPath)) {
						const stats = fs.statSync(targetPath);
						log(`✅ Verified ${fileName} exists at ${targetPath} (${stats.size} bytes)`);
					} else {
						log(`❌ Warning: ${fileName} was not found at ${targetPath}`);
					}
				}
				
				progress.report({ increment: 15, message: "Cleanup..." });
				
				// Step 8: Cleanup temp directory
				this.cleanupTempDir();
				
				// Show success message with details
				vscode.window.showInformationMessage(`✅ Configuration pulled successfully! Restored ${filesToRestore.length} files: ${filesToRestore.join(', ')}`);
			});
		} catch (error) {
			log(`PullManager - Error: ${error}`);
			vscode.window.showErrorMessage(`❌ Failed to pull configuration: ${error}`);
			// Always cleanup on error
			this.cleanupTempDir();
		}
	}

	private filterFilesByIncludedDirectories(allFiles: string[]): string[] {
		const filteredFiles: string[] = [];
		
		for (const file of allFiles) {
			// Check if this file matches any of the included directories
			for (const includedDir of this.config.includedDirectories || []) {
				// Handle both old and new file naming patterns
				if (file === includedDir || 
					file.startsWith(includedDir + '/') || 
					file.startsWith(includedDir + '_') ||  // New flattened naming
					file === includedDir + '.json') {      // Manifest files
					filteredFiles.push(file);
					break; // File matches one included directory, no need to check others
				}
			}
		}
		
		log(`Filtered ${allFiles.length} total files down to ${filteredFiles.length} files based on included directories`);
		return filteredFiles;
	}

	private async manageBackupDirectory(settingsPath: string, targetFiles: string[]): Promise<void> {
		// Create backup directory path inside the settings directory
		this.backupDir = path.join(settingsPath, 'backup-cursor-git-sync');
		log(`Backup directory: ${this.backupDir}`);
		
		// Check if backup directory exists
		if (fs.existsSync(this.backupDir)) {
			log(`Backup directory exists, checking for conflicts...`);
			
			// Check for conflicts with target files
			const conflicts: string[] = [];
			for (const file of targetFiles) {
				const backupFilePath = path.join(this.backupDir, file);
				if (fs.existsSync(backupFilePath)) {
					conflicts.push(file);
				}
			}
			
			if (conflicts.length > 0) {
				log(`Found ${conflicts.length} conflicts in backup directory, removing them: ${conflicts.join(', ')}`);
				
				// Remove conflicting files from backup
				for (const file of conflicts) {
					const backupFilePath = path.join(this.backupDir, file);
					try {
						fs.unlinkSync(backupFilePath);
						log(`Removed conflicting backup file: ${file}`);
					} catch (error) {
						log(`Error removing backup file ${file}: ${error}`);
					}
				}
			}
		} else {
			// Create backup directory
			log(`Creating backup directory: ${this.backupDir}`);
			fs.mkdirSync(this.backupDir, { recursive: true });
		}
		
		// Create backup of current files before overwriting
		log(`Creating backups of current files...`);
		for (const file of targetFiles) {
			const currentFilePath = path.join(settingsPath, file);
			const backupFilePath = path.join(this.backupDir, file);
			
			if (fs.existsSync(currentFilePath)) {
				// Ensure backup directory structure exists
				const backupFileDir = path.dirname(backupFilePath);
				if (!fs.existsSync(backupFileDir)) {
					fs.mkdirSync(backupFileDir, { recursive: true });
				}
				
				// Copy current file to backup
				fs.copyFileSync(currentFilePath, backupFilePath);
				log(`Backed up: ${file}`);
			}
		}
	}

	private async copyFilesToSettings(tempDir: string, settingsPath: string, files: string[]): Promise<void> {
		log(`Copying ${files.length} files from temp to settings directory...`);
		
		// Group files by type for better processing
		const imageFiles: string[] = [];
		const manifestFiles: string[] = [];
		const regularFiles: string[] = [];
		
		for (const file of files) {
			const tempFilePath = path.join(tempDir, file);
			if (fs.existsSync(tempFilePath)) {
				const content = fs.readFileSync(tempFilePath, 'utf8');
				
				if (this.isManifestFile(file, content)) {
					manifestFiles.push(file);
				} else {
					regularFiles.push(file);
				}
			}
		}
		
		log(`File breakdown: ${regularFiles.length} regular, ${manifestFiles.length} manifests`);
		
		// Process files in order: manifests first, then regular files
		
		// 1. Process manifest files first (create directories)
		for (const file of manifestFiles) {
			const tempFilePath = path.join(tempDir, file);
			const settingsFilePath = path.join(settingsPath, file);
			
			// Ensure settings directory structure exists
			const settingsFileDir = path.dirname(settingsFilePath);
			if (!fs.existsSync(settingsFileDir)) {
				fs.mkdirSync(settingsFileDir, { recursive: true });
			}
			
			// Copy manifest file
			fs.copyFileSync(tempFilePath, settingsFilePath);
			log(`Copied manifest to settings: ${file}`);
		}
		
		// 2. Process regular files
		for (const file of regularFiles) {
			const tempFilePath = path.join(tempDir, file);
			const settingsFilePath = path.join(settingsPath, file);
			
			// Ensure settings directory structure exists
			const settingsFileDir = path.dirname(settingsFilePath);
			if (!fs.existsSync(settingsFileDir)) {
				fs.mkdirSync(settingsFileDir, { recursive: true });
			}
			
			// Copy file from temp to settings
			fs.copyFileSync(tempFilePath, settingsFilePath);
			log(`Copied to settings: ${file}`);
		}
	}

	private async reassembleTextChunkedImage(tempDir: string, settingsPath: string, chunkFile: string): Promise<void> {
		try {
			// Extract parent filename and chunk info
			const match = chunkFile.match(/^(.+)\.part(\d+)of(\d+)$/);
			if (!match) {
				log(`Warning: Invalid chunk file format: ${chunkFile}`);
				return;
			}
			
			const [, parentFileName, chunkNumber, totalChunks] = match;
			const parentFile = parentFileName;
			
			// Check if we have all chunks
			const allChunks: string[] = [];
			for (let i = 1; i <= parseInt(totalChunks); i++) {
				const chunkFileName = `${parentFileName}.part${i}of${totalChunks}`;
				const chunkPath = path.join(tempDir, chunkFileName);
				
				if (fs.existsSync(chunkPath)) {
					const chunkContent = fs.readFileSync(chunkPath, 'utf8');
					allChunks.push(chunkContent);
					log(`Found chunk ${i}/${totalChunks}: ${chunkContent.length} chars`);
				} else {
					log(`Warning: Missing chunk ${i}/${totalChunks}: ${chunkFileName}`);
					return; // Can't reassemble without all chunks
				}
			}
			
			// Reassemble the Base64 content
			const reassembledBase64 = allChunks.join('');
			log(`Reassembled Base64 content: ${reassembledBase64.length} chars`);
			
			// Validate Base64 content
			const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
			if (!base64Regex.test(reassembledBase64.trim())) {
				log(`Warning: Invalid reassembled Base64 content for ${parentFileName}`);
				return;
			}
			
			// Convert back to binary
			const buffer = Buffer.from(reassembledBase64, 'base64');
			
			// Extract original filename
			let originalFileName = path.basename(parentFileName, '.bin');
			if (originalFileName.startsWith('images_')) {
				originalFileName = originalFileName.substring(7); // Remove "images_" prefix
			}
			
			// Write the reassembled image
			const settingsFileDir = path.dirname(path.join(settingsPath, parentFileName));
			const originalFilePath = path.join(settingsFileDir, originalFileName);
			
			fs.writeFileSync(originalFilePath, buffer);
			log(`Reassembled and saved image: ${originalFileName} (${buffer.length} bytes)`);
			
		} catch (error) {
			log(`Error reassembling text-chunked image ${chunkFile}: ${error}`);
		}
	}

	private cleanupTempDir(): void {
		if (this.tempDir && fs.existsSync(this.tempDir)) {
			try {
				// Remove all files in temp directory
				const files = fs.readdirSync(this.tempDir);
				for (const file of files) {
					const filePath = path.join(this.tempDir, file);
					const stats = fs.statSync(filePath);
					
					if (stats.isDirectory()) {
						// Recursively remove directory contents
						this.removeDirectoryRecursive(filePath);
					} else {
						fs.unlinkSync(filePath);
					}
				}
				// Remove temp directory
				fs.rmdirSync(this.tempDir);
				log(`Cleaned up temp directory: ${this.tempDir}`);
			} catch (error) {
				log(`Error cleaning up temp directory: ${error}`);
			}
			this.tempDir = null;
		}
	}

	private removeDirectoryRecursive(dirPath: string): void {
		const files = fs.readdirSync(dirPath);
		for (const file of files) {
			const filePath = path.join(dirPath, file);
			const stats = fs.statSync(filePath);
			
			if (stats.isDirectory()) {
				this.removeDirectoryRecursive(filePath);
			} else {
				fs.unlinkSync(filePath);
			}
		}
		fs.rmdirSync(dirPath);
	}

	private isManifestFile(fileName: string, content: string): boolean {
		// Check if the content is a JSON structure with manifest data
		try {
			// First check if content is empty or whitespace
			if (!content || !content.trim()) {
				return false;
			}
			
			const parsed = JSON.parse(content);
			
			// Check if it's a manifest file (directory manifest)
			const isDirectoryManifest = parsed && 
				parsed.directoryName === 'images' && 
				parsed.images &&
				parsed.version; // Has version field
			
			return isDirectoryManifest;
		} catch (error) {
			return false;
		}
	}

}
