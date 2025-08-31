export interface ExtensionConfig {
	extensionName: string;
	settings: {
		path: string;
		includeHidden: boolean;
	};
	github: {
		personalAccessToken: string;
		username: string;
		gistId: string | null;
		gistDescription: string;
		gistPublic: boolean;
		apiBaseUrl: string;
		userAgent: string;
	};
	sync: {
		autoSync: boolean;
		backupBeforeSync: boolean;
		includeHidden: boolean;
	};
	includedDirectories: string[];
}

export interface GistData {
	description: string;
	public: boolean;
	files: {
		[key: string]: {
			content: string;
		};
	};
}

export interface TimestampData {
	timestamp: string;
	extensionName: string;
	files: string[];
	username?: string;
	includedDirectories?: string[];
}

export interface GitHubApiResponse {
	id: string;
	html_url: string;
	files: {
		[key: string]: {
			content: string;
		};
	};
}

export interface GitHubUserResponse {
	login: string;
	id: number;
	avatar_url: string;
}
