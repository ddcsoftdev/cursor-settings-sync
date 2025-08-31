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

	async createGist(files: string[], fileContents: { [key: string]: string }): Promise<GitHubApiResponse> {
		// Debug: Log token info (without showing the actual token)
		log('createGist - Token length: ' + this.config.github.personalAccessToken.length);
		log('createGist - Token starts with: ' + this.config.github.personalAccessToken.substring(0, 4));
		log('createGist - Token ends with: ' + this.config.github.personalAccessToken.substring(this.config.github.personalAccessToken.length - 4));

		// Prepare gist data - Create deep copy to avoid modifying original config
		const gistConfig = JSON.parse(JSON.stringify(this.config));
		gistConfig.github.personalAccessToken = undefined;
		
		const gistData: GistData = {
			description: `Cursor Settings Sync - ${new Date().toISOString()}`,
			public: this.config.github.gistPublic,
			files: {
				'config.json': {
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

	async deleteGist(gistId: string): Promise<void> {
		return this.makeGitHubRequest(`/gists/${gistId}`, 'DELETE');
	}
}
