# Cursor Git Settings Sync

Sync your Cursor/VS Code settings across devices using GitHub Gists. This extension provides a simple and secure way to backup and restore your configuration files.

## Features

- 🔄 **Sync Settings**: Backup and restore `settings.json`, `keybindings.json`, `extensions.json`
- 📁 **Directory Sync**: Sync `snippets/`, `profiles/`, and `sync/` folders
- 🔐 **GitHub Integration**: Uses GitHub Gists for secure cloud storage
- 🎯 **Selective Sync**: Choose which files to sync
- 🔄 **Auto Backup**: Automatic backup before overwriting files
- 🌐 **Cross-Platform**: Works on Windows, macOS, and Linux

## Quick Start

1. **Install the extension** from the VS Code Marketplace
2. **Open the dashboard** with `Ctrl+Shift+P` → "Show Settings Sync Dashboard"
3. **Configure GitHub**:
   - Enter your GitHub username
   - Create a Personal Access Token with "gist" scope
   - Test the connection
4. **Select files** to sync (settings.json, keybindings.json, etc.)
5. **Push** your current settings to GitHub
6. **Pull** settings on other devices

## Supported Files

- `settings.json` - Editor and workspace settings
- `keybindings.json` - Keyboard shortcuts
- `extensions.json` - Extension recommendations
- `snippets/` - Code snippets
- `profiles/` - User profiles
- `sync/` - Sync folder

## GitHub Setup

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select "gist" scope
4. Copy the token and paste it in the extension

## Commands

- `cursor-git-settings-sync.showDashboard` - Open the sync dashboard
- `cursor-git-settings-sync.pullConfig` - Pull configuration from GitHub
- `cursor-git-settings-sync.pushConfig` - Push configuration to GitHub
- `cursor-git-settings-sync.openSettings` - Open Cursor settings

## Security

- All data is stored in private GitHub Gists (by default)
- Personal Access Tokens are stored locally
- No data is sent to any third-party servers

## Requirements

- VS Code 1.74.0 or higher
- GitHub account
- Personal Access Token with "gist" scope

## Support

- **Issues**: [GitHub Issues](https://github.com/ddcsoftdev/cursor-settings-sync/issues)
- **Documentation**: [GitHub Wiki](https://github.com/ddcsoftdev/cursor-settings-sync/wiki)

## License

MIT License - see [LICENSE](LICENSE) file for details.

---
