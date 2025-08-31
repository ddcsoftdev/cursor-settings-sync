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
	metadata?: {
		originalPath?: string;
		fileSize?: number;
		mimeType?: string;
		encoding?: string;
	};
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

	private async processSingleFile(fileName: string, filePath: string): Promise<ProcessedFile> {
		try {
			const fileType = this.getFileType(fileName);
			
			switch (fileType) {
				case 'json':
					return this.processJsonFile(filePath);
				case 'text':
					return this.processTextFile(filePath);
				default:
					return this.processTextFile(filePath);
			}
		} catch (error) {
			log(`Error processing single file ${filePath}: ${error}`);
			return { content: '', type: 'text', valid: false };
		}
	}

	private getFileType(fileName: string): 'text' | 'json' | 'binary' | 'directory' {
		const extension = fileName.split('.').pop()?.toLowerCase();
		
		switch (extension) {
			case 'json':
				return 'json';
			case 'txt':
			case 'md':
			case 'log':
			case 'yml':
			case 'yaml':
			case 'xml':
			case 'html':
			case 'css':
			case 'js':
			case 'ts':
			case 'py':
			case 'sh':
			case 'bat':
			case 'ps1':
				return 'text';
			default:
				return 'text'; // Default to text for unknown extensions
		}
	}

	private processJsonFile(filePath: string): ProcessedFile {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			
			if (!content || !content.trim()) {
				return { content: '', type: 'json', valid: false };
			}
			
			// Try to parse as JSON to validate
			const parsed = JSON.parse(content);
			const formatted = JSON.stringify(parsed, null, 2);
			
			return {
				content: formatted,
				type: 'json',
				valid: true,
				metadata: {
					fileSize: formatted.length,
					mimeType: 'application/json',
					encoding: 'utf8'
				}
			};
		} catch (error) {
			log(`Error processing JSON file ${filePath}: ${error}`);
			return { content: '', type: 'json', valid: false };
		}
	}

	private processTextFile(filePath: string): ProcessedFile {
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
			valid: true,
			metadata: {
				fileSize: cleanedContent.length,
				mimeType: 'text/plain',
				encoding: 'utf8'
			}
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
}
