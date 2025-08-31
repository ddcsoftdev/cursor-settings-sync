import { ExtensionConfig } from './types';

export function getDefaultConfig(): ExtensionConfig {
	return {
		extensionName: "cursor-settings-sync",
		settings: {
			path: "",
			includeHidden: false
		},
		github: {
			personalAccessToken: "",
			username: "",
			gistId: null,
			gistDescription: "Cursor Settings Sync Backup",
			gistPublic: false,
			apiBaseUrl: "https://api.github.com",
			userAgent: "Cursor-Settings-Sync-Extension"
		},
		sync: {
			autoSync: false,
			backupBeforeSync: true,
			includeHidden: false
		},
		includedDirectories: []
	};
}

export function migrateOldConfig(oldConfig: any): ExtensionConfig {
	// If it's already the new format, return as is
	if (oldConfig.extensionName) {
		return oldConfig;
	}
	
	// Migrate old config to new format
	const newConfig = getDefaultConfig();
	
	// Preserve existing settings
	if (oldConfig.settings) {
		newConfig.settings = { ...newConfig.settings, ...oldConfig.settings };
	}
	
	// Preserve included directories
	if (oldConfig.includedDirectories) {
		newConfig.includedDirectories = oldConfig.includedDirectories;
	}
	
	// Preserve sync settings
	if (oldConfig.sync) {
		newConfig.sync = { ...newConfig.sync, ...oldConfig.sync };
	}
	
	// Clear old GitHub settings and use new structure
	newConfig.github = {
		personalAccessToken: "",
		username: "",
		gistId: null,
		gistDescription: "Cursor Settings Sync Backup",
		gistPublic: false,
		apiBaseUrl: "https://api.github.com",
		userAgent: "Cursor-Settings-Sync-Extension"
	};
	
	return newConfig;
}
