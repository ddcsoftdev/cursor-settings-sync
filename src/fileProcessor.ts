import * as vscode from 'vscode';
import { ExtensionConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Get the output channel from the extension
let outputChannel: vscode.OutputChannel | undefined;

export function setFileProcessorOutputChannel(channel: vscode.OutputChannel) {
	outputChannel = channel;
}

function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
	console.log(message);
}

export interface ProcessedFile {
	content: string;
	type: 'text' | 'json' | 'binary' | 'directory';
	valid: boolean;
}

export class FileProcessor {
	private config: ExtensionConfig;
	private tempDir: string | null = null;

	constructor(config: ExtensionConfig) {
		this.config = config;
	}

	async processFiles(files: string[], settingsPath: string): Promise<{ [key: string]: ProcessedFile }> {
		const processedFiles: { [key: string]: ProcessedFile } = {};
		
		try {
			// Create temporary directory
			this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-sync-'));
			log(`Created temporary directory: ${this.tempDir}`);
			
			log(`FileProcessor: Starting to process ${files.length} files`);
			log(`FileProcessor: Settings path: ${settingsPath}`);
			
			for (const file of files) {
				const originalPath = path.join(settingsPath, file);
				const tempPath = path.join(this.tempDir, file);
				
				log(`Processing file: ${originalPath}`);
				
				if (fs.existsSync(originalPath)) {
					try {
						const stats = fs.statSync(originalPath);
						
						if (stats.isDirectory()) {
							log(`Skipping directory: ${originalPath}`);
							continue;
						}
						
						// Copy file to temp directory
						fs.copyFileSync(originalPath, tempPath);
						log(`Copied to temp: ${tempPath}`);
						
						log(`File exists and is not a directory: ${originalPath}`);
						const processedFile = await this.processSingleFile(file, tempPath);
						log(`Processed file result for ${file}: valid=${processedFile.valid}, type=${processedFile.type}, contentLength=${processedFile.content.length}`);
						
						if (processedFile.valid) {
							processedFiles[file] = processedFile;
							log(`Successfully processed: ${file} (${processedFile.type})`);
						} else {
							log(`Skipping invalid file: ${file}`);
						}
					} catch (error) {
						log(`Error processing file ${originalPath}: ${error}`);
					}
				} else {
					log(`File not found: ${originalPath}`);
				}
			}
			
			log(`FileProcessor: Finished processing. Valid files: ${Object.keys(processedFiles).join(', ')}`);
			return processedFiles;
		} finally {
			// Always clean up temporary directory
			this.cleanupTempDir();
		}
	}

	private cleanupTempDir(): void {
		if (this.tempDir && fs.existsSync(this.tempDir)) {
			try {
				// Remove all files in temp directory
				const files = fs.readdirSync(this.tempDir);
				for (const file of files) {
					const filePath = path.join(this.tempDir, file);
					fs.unlinkSync(filePath);
				}
				// Remove temp directory
				fs.rmdirSync(this.tempDir);
				log(`Cleaned up temporary directory: ${this.tempDir}`);
			} catch (error) {
				log(`Error cleaning up temp directory: ${error}`);
			}
			this.tempDir = null;
		}
	}

	private async processSingleFile(fileName: string, filePath: string): Promise<ProcessedFile> {
		// Determine file type based on extension
		const fileType = this.getFileType(fileName);
		
		try {
			if (fileType === 'json') {
				return this.processJsonFile(filePath);
			} else if (fileType === 'text') {
				return this.processTextFile(filePath);
			} else {
				log(`Unsupported file type for ${fileName}, skipping`);
				return { content: '', type: 'binary', valid: false };
			}
		} catch (error) {
			log(`Error processing ${fileName}: ${error}`);
			return { content: '', type: 'binary', valid: false };
		}
	}

	private getFileType(fileName: string): 'json' | 'text' | 'binary' {
		const extension = fileName.split('.').pop()?.toLowerCase();
		
		switch (extension) {
			case 'json':
				return 'json';
			case 'txt':
			case 'md':
			case 'log':
			case 'conf':
			case 'config':
				return 'text';
			default:
				return 'binary';
		}
	}

	private async processJsonFile(filePath: string): Promise<ProcessedFile> {
		const content = fs.readFileSync(filePath, 'utf8');
		
		if (!content || !content.trim()) {
			return { content: '', type: 'json', valid: false };
		}
		
		log(`Processing JSON file: ${filePath}`);
		log(`Content length: ${content.length}`);
		
		// Just return the content as-is, no JSON fixing
		let finalContent = content;
		if (!finalContent.endsWith('\n')) {
			finalContent += '\n';
		}
		
		return {
			content: finalContent,
			type: 'json',
			valid: true
		};
	}

	private showJsonErrorContext(content: string, error: any): void {
		// Removed - no longer needed
	}

	private cleanJsonContent(content: string): string {
		return content
			.replace(/\r\n/g, '\n')  // Normalize line endings
			.replace(/\r/g, '\n')   // Convert CR to LF
			.trim();                 // Remove leading/trailing whitespace
	}

	private fixJsonContent(content: string): string {
		log(`Original content length: ${content.length}`);
		log(`Original content preview: ${content.substring(0, 200)}...`);
		
		// Step 1: Remove comments (be more careful)
		content = content.replace(/\/\/.*$/gm, '');  // Single line comments
		content = content.replace(/\/\*[\s\S]*?\*\//g, '');  // Multi-line comments
		
		// Step 2: Remove trailing commas more carefully
		// Only remove trailing commas that are followed by closing brackets/braces
		content = content.replace(/,(\s*[}\]])/g, '$1');
		
		// Step 3: Fix unquoted property names (be more specific)
		// Only fix property names that are not already quoted
		content = content.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '"$1":');
		
		// Step 4: Clean up any control characters
		content = content.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
		
		// Step 5: Ensure proper spacing
		content = content.replace(/\s+/g, ' ');  // Normalize whitespace
		
		log(`Fixed content length: ${content.length}`);
		log(`Fixed content preview: ${content.substring(0, 200)}...`);
		
		return content.trim();
	}

	private tryJsonFixApproach1(content: string): ProcessedFile | null {
		// Approach 1: Remove comments and trailing commas
		let fixed = content
			.replace(/\/\/.*$/gm, '')  // Remove single line comments
			.replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
			.replace(/,(\s*[}\]])/g, '$1');  // Remove trailing commas
		
		try {
			const parsed = JSON.parse(fixed);
			let formatted = JSON.stringify(parsed, null, 2);
			if (!formatted.endsWith('\n')) formatted += '\n';
			return { content: formatted, type: 'json', valid: true };
		} catch {
			return null;
		}
	}

	private tryJsonFixApproach2(content: string): ProcessedFile | null {
		// Approach 2: Try to fix common VS Code settings issues
		let fixed = content
			.replace(/\/\/.*$/gm, '')  // Remove comments
			.replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
			.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '"$1":')  // Quote property names
			.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');  // Remove control chars
		
		try {
			const parsed = JSON.parse(fixed);
			let formatted = JSON.stringify(parsed, null, 2);
			if (!formatted.endsWith('\n')) formatted += '\n';
			return { content: formatted, type: 'json', valid: true };
		} catch {
			return null;
		}
	}

	private tryJsonFixApproach3(content: string): ProcessedFile | null {
		// Approach 3: Minimal fixes - just remove comments
		let fixed = content
			.replace(/\/\/.*$/gm, '')  // Remove single line comments
			.replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
		
		try {
			const parsed = JSON.parse(fixed);
			let formatted = JSON.stringify(parsed, null, 2);
			if (!formatted.endsWith('\n')) formatted += '\n';
			return { content: formatted, type: 'json', valid: true };
		} catch {
			return null;
		}
	}

	private async processTextFile(filePath: string): Promise<ProcessedFile> {
		const content = fs.readFileSync(filePath, 'utf8');
		
		if (!content || !content.trim()) {
			return { content: '', type: 'text', valid: false };
		}
		
		// Clean up the content - remove any problematic characters
		let cleanedContent = content
			.replace(/\r\n/g, '\n')  // Normalize line endings
			.replace(/\r/g, '\n')   // Convert CR to LF
			.trim();                 // Remove leading/trailing whitespace
		
		// Ensure text files end with a newline
		if (!cleanedContent.endsWith('\n')) {
			cleanedContent += '\n';
		}
		
		return {
			content: cleanedContent,
			type: 'text',
			valid: true
		};
	}

	// Convert processed files to GitHub Gist format
	convertToGistFormat(processedFiles: { [key: string]: ProcessedFile }): { [key: string]: { content: string } } {
		const gistFiles: { [key: string]: { content: string } } = {};
		
		for (const [fileName, processedFile] of Object.entries(processedFiles)) {
			if (processedFile.valid) {
				gistFiles[fileName] = {
					content: processedFile.content
				};
			}
		}
		
		return gistFiles;
	}
}
