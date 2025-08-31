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
		
		const options: any = {
			hostname: 'api.github.com',
			port: 443,
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
							resolve(JSON.parse(responseData));
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
				req.write(JSON.stringify(data));
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
			
			const options = {
				hostname: 'api.github.com',
				port: 443,
				path: '/user',
				method: 'GET',
				headers: {
					'User-Agent': 'Cursor-Settings-Sync-Extension',
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
		
		const gistData: GistData = {
			description: `Cursor Settings Sync - ${new Date().toISOString()}`,
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

	async findExistingGist(): Promise<string | null> {
		log('Searching for existing Gists from this extension...');
		
		try {
			// Get all Gists for the authenticated user
			const gists = await this.makeGitHubRequest('/gists');
			
			for (const gist of gists) {
				// Check if this Gist belongs to our extension
				if (gist.files['cursor-git-sync-storage.json']) {
					try {
						const configContent = gist.files['cursor-git-sync-storage.json'].content;
						const config = JSON.parse(configContent);
						
						if (config.extensionName === this.config.extensionName) {
							log(`Found existing Gist: ${gist.id}`);
							return gist.id;
						}
					} catch (error) {
						log(`Error parsing Gist config: ${error}`);
					}
				}
			}
			
			log('No existing Gist found for this extension');
			return null;
		} catch (error) {
			log(`Error searching for existing Gists: ${error}`);
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

		// First, get the existing Gist to merge with
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
				mergedFiles[fileName] = {
					content: fileData.content
				};
			}
		}
		
		// Add/update new files
		for (const [fileName, fileData] of Object.entries(fileContents)) {
			// Ensure correct structure: { content: string }
			mergedFiles[fileName] = {
				content: fileData.content
			};
		}
		
		// Get all unique files for timestamp
		const allFiles = [...new Set([...Object.keys(existingGist.files), ...files])].filter(
			file => file !== 'cursor-git-sync-storage.json' && file !== 'timestamp.json'
		);
		
		const gistData: GistData = {
			description: `Cursor Settings Sync - ${new Date().toISOString()}`,
			public: this.config.github.gistPublic,
			files: {
				'cursor-git-sync-storage.json': {
					content: JSON.stringify(gistConfig, null, 2)
				},
				'timestamp.json': {
					content: JSON.stringify({
						timestamp: new Date().toISOString(),
						extensionName: this.config.extensionName,
						files: allFiles
					} as TimestampData, null, 2)
				},
				...mergedFiles
			}
		};

		log('updateGist - Merged files: ' + Object.keys(mergedFiles).join(', '));
		
		// Debug: Log the structure being sent
		for (const [fileName, fileData] of Object.entries(mergedFiles)) {
			log(`updateGist - File ${fileName} structure: ${typeof fileData.content} - ${fileData.content.substring(0, 50)}...`);
		}
		
		return this.makeGitHubRequest(`/gists/${gistId}`, 'PATCH', gistData);
	}

	async deleteGist(gistId: string): Promise<void> {
		return this.makeGitHubRequest(`/gists/${gistId}`, 'DELETE');
	}
}
