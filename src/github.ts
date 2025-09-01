import * as vscode from 'vscode';
import { ExtensionConfig, GistData, TimestampData, GitHubApiResponse, GitHubUserResponse } from './types';

// Get the output channel from the extension
let outputChannel: vscode.OutputChannel | undefined;

export function setGitHubOutputChannel(channel: vscode.OutputChannel) {
	outputChannel = channel;
}

function log(message: string) {
	if (outputChannel) {
		outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
	}
	console.log(message);
}

export class GitHubService {
	private config: ExtensionConfig;

	constructor(config: ExtensionConfig) {
		this.config = config;
		log('GitHubService constructor - Config has token: ' + !!this.config.github?.personalAccessToken);
		log('GitHubService constructor - Token length: ' + (this.config.github?.personalAccessToken?.length || 0));
	}

	private getAuthHeader(): string {
		// Debug: Log what we have in config
		log('getAuthHeader - Config object exists: ' + !!this.config);
		log('getAuthHeader - Config.github exists: ' + !!this.config.github);
		log('getAuthHeader - Config token exists: ' + !!this.config.github?.personalAccessToken);
		log('getAuthHeader - Config token length: ' + (this.config.github?.personalAccessToken?.length || 0));
		log('getAuthHeader - Config token starts with: ' + (this.config.github?.personalAccessToken?.substring(0, 4) || 'none'));
		log('getAuthHeader - Environment token exists: ' + !!process.env.GITHUB_TOKEN);
		
		// Also log to output channel
		if (this.config.github?.personalAccessToken) {
			log('GitHub Token Debug - Length: ' + this.config.github.personalAccessToken.length);
			log('GitHub Token Debug - Starts with: ' + this.config.github.personalAccessToken.substring(0, 4));
		} else {
			log('GitHub Token Debug - No token found in config');
		}
		
		if (this.config.github.personalAccessToken && this.config.github.personalAccessToken.trim()) {
			return `token ${this.config.github.personalAccessToken}`;
		} else if (process.env.GITHUB_TOKEN) {
			return `token ${process.env.GITHUB_TOKEN}`;
		}
		throw new Error('No GitHub authentication token found. Please enter your Personal Access Token in the GitHub Authentication form above.');
	}

	private async makeGitHubRequest(path: string, method: string = 'GET', data?: any): Promise<any> {
		const https = require('https');
		
		// Parse the API base URL to get hostname and port
		const apiUrl = new URL(this.config.github.apiBaseUrl);
		
		const options: any = {
			hostname: apiUrl.hostname,
			port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
			path: path,
			method: method,
			headers: {
				'User-Agent': this.config.github.userAgent,
				'Authorization': this.getAuthHeader()
			}
		};

		if (data) {
			options.headers['Content-Type'] = 'application/json';
		}

		return new Promise<any>((resolve, reject) => {
			const req = https.request(options, (res: any) => {
				let responseData = '';
				res.on('data', (chunk: any) => responseData += chunk);
				res.on('end', () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						try {
							const parsed = JSON.parse(responseData);
							if (parsed.files) {
								log(`makeGitHubRequest - Response contains ${Object.keys(parsed.files).length} files`);
								for (const [fileName, fileData] of Object.entries(parsed.files)) {
									const content = (fileData as any).content;
									log(`makeGitHubRequest - Response file ${fileName}: ${content ? content.length : 0} characters`);
								}
							}
							resolve(parsed);
						} catch (e) {
							resolve(responseData);
						}
					} else {
						reject(new Error(`GitHub API error: ${res.statusCode} - ${responseData}`));
					}
				});
			});
			
			req.on('error', reject);
			if (data) {
				const jsonData = JSON.stringify(data);
				log(`makeGitHubRequest - Request body size: ${jsonData.length} characters`);
				req.write(jsonData);
			}
			req.end();
		});
	}

	async testAuthentication(username: string, token: string): Promise<void> {
		// Debug: Log token info (without showing the actual token)
		console.log('Test function - Token length:', token.length);
		console.log('Test function - Token starts with:', token.substring(0, 4));
		console.log('Test function - Token ends with:', token.substring(token.length - 4));

		try {
			const https = require('https');
			
			// Parse the API base URL to get hostname and port
			const apiUrl = new URL(this.config.github.apiBaseUrl);
			
			const options = {
				hostname: apiUrl.hostname,
				port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
				path: '/user',
				method: 'GET',
				headers: {
					'User-Agent': this.config.github.userAgent,
					'Authorization': `token ${token}`
				}
			};
			
			const result = await new Promise<GitHubUserResponse>((resolve, reject) => {
				const req = https.request(options, (res: any) => {
					let data = '';
					res.on('data', (chunk: any) => data += chunk);
					res.on('end', () => {
						if (res.statusCode >= 200 && res.statusCode < 300) {
							resolve(JSON.parse(data));
						} else {
							reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
						}
					});
				});
				
				req.on('error', reject);
				req.end();
			});
			
			if (result.login === username) {
				vscode.window.showInformationMessage(`✅ GitHub authentication successful! Connected as ${username}`);
			} else {
				vscode.window.showWarningMessage(`⚠️ Token belongs to ${result.login}, not ${username}`);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`❌ GitHub authentication failed: ${error}`);
		}
	}

	async createGist(files: string[], fileContents: { [key: string]: { content: string } }): Promise<GitHubApiResponse> {
		// Debug: Log token info (without showing the actual token)
		log('createGist - Token length: ' + this.config.github.personalAccessToken.length);
		log('createGist - Token starts with: ' + this.config.github.personalAccessToken.substring(0, 4));
		log('createGist - Token ends with: ' + this.config.github.personalAccessToken.substring(this.config.github.personalAccessToken.length - 4));

		// Prepare gist data - Create deep copy to avoid modifying original config
		const gistConfig = JSON.parse(JSON.stringify(this.config));
		gistConfig.github.personalAccessToken = undefined;
		// Remove includedDirectories to keep it local only
		delete gistConfig.includedDirectories;
		
		// Create single gist
		const gistData: GistData = {
			description: `ddcsoftdev - Cursor Git Settings Sync - ${this.config.extensionName}`,
			public: this.config.github.gistPublic,
			files: {
				'cursor-git-sync-storage.json': {
					content: JSON.stringify(gistConfig, null, 2)
				},
				'timestamp.json': {
					content: JSON.stringify({
						timestamp: new Date().toISOString(),
						extensionName: this.config.extensionName,
						files: files
					} as TimestampData, null, 2)
				},
				...fileContents
			}
		};
		
		return this.makeGitHubRequest('/gists', 'POST', gistData);
	}

	async getGist(gistId: string): Promise<GitHubApiResponse> {
		return this.makeGitHubRequest(`/gists/${gistId}`);
	}

	async listAllGists(): Promise<any[]> {
		log('Listing all available Gists for debugging...');
		
		try {
			const gists = await this.makeGitHubRequest('/gists');
			
			log(`Found ${gists.length} total gists:`);
			for (const gist of gists) {
				const hasStorageFile = gist.files['cursor-git-sync-storage.json'] ? '✅' : '❌';
				const hasTimestampFile = gist.files['timestamp.json'] ? '✅' : '❌';
				
				log(`  Gist ${gist.id}: ${gist.description}`);
				log(`    - Storage file: ${hasStorageFile}`);
				log(`    - Timestamp file: ${hasTimestampFile}`);
				log(`    - Files: ${Object.keys(gist.files).join(', ')}`);
				
				if (gist.files['cursor-git-sync-storage.json']) {
					try {
						const configContent = gist.files['cursor-git-sync-storage.json'].content;
						const config = JSON.parse(configContent);
						log(`    - Extension name: ${config.extensionName || 'undefined'}`);
					} catch (error) {
						log(`    - Config parse error: ${error}`);
					}
				}
			}
			
			return gists;
		} catch (error) {
			log(`Error listing gists: ${error}`);
			return [];
		}
	}

	async findExistingGist(): Promise<string | null> {
		log('Searching for existing Gists from this extension...');
		
		try {
			// Get all Gists for the authenticated user
			const gists = await this.makeGitHubRequest('/gists');
			
			log(`Found ${gists.length} total gists, searching for cursor-settings-sync compatible gists...`);
			
			// Priority 1: Look for gists with BOTH required identification files
			// This ensures cross-computer compatibility by finding gists with proper structure
			for (const gist of gists) {
				const hasStorageFile = gist.files['cursor-git-sync-storage.json'];
				const hasTimestampFile = gist.files['timestamp.json'];
				
				if (hasStorageFile && hasTimestampFile && hasStorageFile.content) {
					try {
						const configContent = hasStorageFile.content;
						log(`Parsing storage file for gist ${gist.id} - content length: ${configContent.length}`);
						
						const config = JSON.parse(configContent);
						
						// Check if this gist has the correct extension name
						if (config.extensionName === this.config.extensionName) {
							log(`✅ Found existing Gist with both identification files and matching extension name: ${gist.id}`);
							log(`   - Storage file: ✅`);
							log(`   - Timestamp file: ✅`);
							log(`   - Extension name: ${config.extensionName}`);
							log(`   - Description: ${gist.description}`);
							return gist.id;
						}
					} catch (error) {
						log(`Error parsing Gist config for ${gist.id}: ${error}`);
						log(`   - Content preview: ${hasStorageFile.content ? hasStorageFile.content.substring(0, 100) + '...' : 'undefined'}`);
					}
				}
			}
			
			// Priority 2: Look for gists with storage file and cursor-related extension name
			// This handles cases where timestamp.json might be missing but storage file exists
			for (const gist of gists) {
				if (gist.files['cursor-git-sync-storage.json'] && gist.files['cursor-git-sync-storage.json'].content) {
					try {
						const configContent = gist.files['cursor-git-sync-storage.json'].content;
						log(`Parsing storage file for gist ${gist.id} (Priority 2) - content length: ${configContent.length}`);
						
						const config = JSON.parse(configContent);
						
						if (config.extensionName === this.config.extensionName) {
							log(`✅ Found existing Gist with storage file and matching extension name: ${gist.id}`);
							log(`   - Storage file: ✅`);
							log(`   - Timestamp file: ${gist.files['timestamp.json'] ? '✅' : '❌'}`);
							log(`   - Extension name: ${config.extensionName}`);
							log(`   - Description: ${gist.description}`);
							return gist.id;
						}
					} catch (error) {
						log(`Error parsing Gist config for ${gist.id} (Priority 2): ${error}`);
					}
				}
			}
			
			// Priority 3: Look for gists by username and cursor-related extension name
			// This handles cross-computer scenarios where the same user has multiple cursor-related gists
			if (this.config.github.username) {
				for (const gist of gists) {
					if (gist.files['cursor-git-sync-storage.json']) {
						try {
							const configContent = gist.files['cursor-git-sync-storage.json'].content;
							const config = JSON.parse(configContent);
							
							// Check if this gist belongs to the same user and has cursor-related extension name
							if (config.github?.username === this.config.github.username && 
								config.extensionName && 
								(config.extensionName.includes('cursor') || 
								 config.extensionName.includes('git') || 
								 config.extensionName.includes('sync'))) {
								log(`✅ Found existing Gist by username and cursor-related extension: ${gist.id} (${config.extensionName})`);
								log(`   - Storage file: ✅`);
								log(`   - Timestamp file: ${gist.files['timestamp.json'] ? '✅' : '❌'}`);
								log(`   - Username match: ${config.github.username}`);
								log(`   - Extension name: ${config.extensionName}`);
								return gist.id;
							}
						} catch (error) {
							log(`Error parsing Gist config for ${gist.id}: ${error}`);
						}
					}
				}
			}
			
			// Priority 4: Look for any gist with cursor-git-sync-storage.json (fallback)
			// This is the most permissive fallback for maximum compatibility
			for (const gist of gists) {
				if (gist.files['cursor-git-sync-storage.json']) {
					log(`⚠️ Found Gist with storage file (fallback): ${gist.id}`);
					log(`   - Storage file: ✅`);
					log(`   - Timestamp file: ${gist.files['timestamp.json'] ? '✅' : '❌'}`);
					log(`   - Description: ${gist.description}`);
					log(`   - Warning: This may not be the intended gist for this extension`);
					return gist.id;
				}
			}
			
			log('❌ No existing Gist found for this extension');
			log('   - No gists with cursor-git-sync-storage.json found');
			log('   - Will create a new gist on next push operation');
			return null;
		} catch (error) {
			log(`❌ Error searching for existing Gists: ${error}`);
			return null;
		}
	}

	async cleanupOldGists(excludeGistId: string): Promise<void> {
		log('Cleaning up old Gists...');
		
		try {
			// Get all Gists for the authenticated user
			const gists = await this.makeGitHubRequest('/gists');
			
			for (const gist of gists) {
				// Skip the current Gist
				if (gist.id === excludeGistId) {
					continue;
				}
				
				// Check if this Gist belongs to our extension
				if (gist.files['cursor-git-sync-storage.json']) {
					try {
						const configContent = gist.files['cursor-git-sync-storage.json'].content;
						const config = JSON.parse(configContent);
						
						if (config.extensionName === this.config.extensionName) {
							log(`Deleting old Gist: ${gist.id}`);
							await this.deleteGist(gist.id);
						}
					} catch (error) {
						log(`Error parsing Gist config for cleanup: ${error}`);
					}
				}
			}
			
			log('Cleanup completed');
		} catch (error) {
			log(`Error during cleanup: ${error}`);
		}
	}

	async updateGist(gistId: string, files: string[], fileContents: { [key: string]: { content: string } }): Promise<GitHubApiResponse> {
		// Debug: Log token info (without showing the actual token)
		log('updateGist - Token length: ' + this.config.github.personalAccessToken.length);
		log('updateGist - Token starts with: ' + this.config.github.personalAccessToken.substring(0, 4));
		log('updateGist - Token ends with: ' + this.config.github.personalAccessToken.substring(this.config.github.personalAccessToken.length - 4));

		// Get the existing Gist
		log('updateGist - Fetching existing Gist for merge');
		const existingGist = await this.getGist(gistId);
		
		// Prepare gist data - Create deep copy to avoid modifying original config
		const gistConfig = JSON.parse(JSON.stringify(this.config));
		gistConfig.github.personalAccessToken = undefined;
		// Remove includedDirectories to keep it local only
		delete gistConfig.includedDirectories;
		
		// Merge existing files with new files
		const mergedFiles: { [key: string]: { content: string } } = {};
		
		// Start with existing files (excluding our special files)
		for (const [fileName, fileData] of Object.entries(existingGist.files)) {
			if (fileName !== 'cursor-git-sync-storage.json' && fileName !== 'timestamp.json') {
				// Ensure correct structure: { content: string }
				const content = (fileData as any).content;
				mergedFiles[fileName] = {
					content: content
				};
			}
		}
		
		// Add/update new files
		for (const [fileName, fileData] of Object.entries(fileContents)) {
			// Ensure correct structure: { content: string }
			const content = fileData.content;
			log(`updateGist - Adding new file ${fileName}: ${content.length} characters`);
			
			if (!content || content.length === 0) {
				log(`Warning: New file ${fileName} has empty content, skipping`);
				continue;
			}
			
			mergedFiles[fileName] = {
				content: content
			};
		}
		
		// Get all unique files for timestamp
		const allFiles = [...new Set([...Object.keys(existingGist.files), ...files])].filter(
			file => file !== 'cursor-git-sync-storage.json' && file !== 'timestamp.json'
		);
		
		// Validate and clean files
		this.validateAndCleanFiles(mergedFiles);
		
		const gistConfigContent = JSON.stringify(gistConfig, null, 2);
		const timestampContent = JSON.stringify({
			timestamp: new Date().toISOString(),
			extensionName: this.config.extensionName,
			files: allFiles
		} as TimestampData, null, 2);
		
		const gistData: GistData = {
			description: `Cursor Settings Sync - ${new Date().toISOString()}`,
			public: this.config.github.gistPublic,
			files: {
				'cursor-git-sync-storage.json': {
					content: gistConfigContent
				},
				'timestamp.json': {
					content: timestampContent
				},
				...mergedFiles
			}
		};

		log('updateGist - Merged files: ' + Object.keys(mergedFiles).join(', '));
		
		// Debug: Log the complete gist data structure
		log(`updateGist - Gist data structure: ${Object.keys(gistData.files).length} files`);
		log(`updateGist - Gist files: ${Object.keys(gistData.files).join(', ')}`);
		
		// Validate that all files have the correct structure and content
		for (const [fileName, fileData] of Object.entries(gistData.files)) {
			if (!fileData.content || typeof fileData.content !== 'string') {
				throw new Error(`Invalid file structure for ${fileName}: content must be a string`);
			}
			if (fileData.content.length === 0) {
				log(`Warning: File ${fileName} has empty content before sending to GitHub`);
			}
			log(`updateGist - Final validation ${fileName}: ${fileData.content.length} characters`);
		}
		
		// Log the actual data being sent to GitHub
		log(`updateGist - Sending gist data to GitHub API...`);
		const response = await this.makeGitHubRequest(`/gists/${gistId}`, 'PATCH', gistData);
		
		// Verify the response
		log(`updateGist - GitHub API response received`);
		if (response && response.files) {
			for (const [fileName, fileData] of Object.entries(response.files)) {
				const content = (fileData as any).content;
				log(`updateGist - Response file ${fileName}: ${content ? content.length : 0} characters`);
			}
		}
		
		return response;
	}

	private validateAndCleanFiles(files: { [key: string]: { content: string } }): void {
		const maxFileSize = 10 * 1024 * 1024; // 10MB per file
		const filesToRemove: string[] = [];
		
		for (const [fileName, fileData] of Object.entries(files)) {
			// Validate file name (GitHub has restrictions on file names)
			if (fileName.includes('..') || fileName.includes('\\') || fileName.includes('/') && fileName !== 'images.json') {
				log(`Warning: Potentially problematic file name: ${fileName}`);
			}
			
			// Ensure content is properly encoded as UTF-8 string
			let content = fileData.content;
			if (typeof content !== 'string') {
				log(`Warning: Converting non-string content for ${fileName} to string`);
				content = String(content);
			}
			
			// Validate that content is not empty
			if (!content || content.length === 0) {
				log(`Warning: Empty content detected for ${fileName}, removing from gist`);
				filesToRemove.push(fileName);
				continue;
			}
			
			const fileSize = Buffer.byteLength(content, 'utf8');
			
			if (fileSize > maxFileSize) {
				throw new Error(`File ${fileName} is too large (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maximum allowed is ${(maxFileSize / 1024 / 1024).toFixed(2)}MB.`);
			}
			
			// Update the content to ensure it's properly formatted
			files[fileName] = { content };
		}
		
		// Remove empty files
		for (const fileName of filesToRemove) {
			delete files[fileName];
			log(`Removed empty file: ${fileName}`);
		}
	}

	async deleteGist(gistId: string): Promise<void> {
		return this.makeGitHubRequest(`/gists/${gistId}`, 'DELETE');
	}
}
