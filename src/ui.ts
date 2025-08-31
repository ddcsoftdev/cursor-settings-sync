import { ExtensionConfig } from './types';

export function getDashboardHTML(savedPath: string, savedFiles: string[], savedConfig: ExtensionConfig, configPath?: string): string {
	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Cursor Git Settings Sync</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
					padding: 0;
					margin: 0;
					background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-input-background) 100%);
					color: var(--vscode-editor-foreground);
					min-height: 100vh;
				}
				.container {
					max-width: 1200px;
					margin: 0 auto;
					padding: 16px;
				}
				.header {
					text-align: center;
					margin-bottom: 24px;
					padding: 20px 0;
					background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
					border-radius: 12px;
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
				}
				.title {
					font-size: 24px;
					font-weight: 600;
					margin: 0;
					color: var(--vscode-button-foreground);
					text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
				}
				.subtitle {
					font-size: 14px;
					margin-top: 6px;
					color: var(--vscode-button-foreground);
					opacity: 0.9;
				}
				.action-buttons {
					display: flex;
					gap: 16px;
					margin-bottom: 24px;
					justify-content: center;
				}
				.btn-primary {
					padding: 12px 24px;
					font-size: 14px;
					font-weight: 500;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					transition: all 0.2s ease;
					background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
					color: var(--vscode-button-foreground);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
					min-width: 120px;
				}
				.btn-primary:hover {
					transform: translateY(-1px);
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				}
				.btn-primary:active {
					transform: translateY(0);
				}
				.path-display {
					background: linear-gradient(135deg, var(--vscode-input-background) 0%, var(--vscode-editor-background) 100%);
					border: 1px solid var(--vscode-input-border);
					border-radius: 8px;
					padding: 12px 16px;
					margin-bottom: 20px;
					text-align: center;
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
				}
				.path-display h3 {
					margin: 0 0 8px 0;
					font-size: 14px;
					font-weight: 500;
					color: var(--vscode-editor-foreground);
				}
				.path-text {
					font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
					font-size: 12px;
					color: var(--vscode-input-foreground);
					background: var(--vscode-editor-background);
					padding: 8px 12px;
					border-radius: 6px;
					border: 1px solid var(--vscode-input-border);
					display: inline-block;
				}
				.main-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 20px;
					margin-bottom: 20px;
					align-items: start;
				}
				.left-panel {
					display: flex;
					flex-direction: column;
					gap: 20px;
					height: fit-content;
				}
				.panel {
					background: linear-gradient(135deg, var(--vscode-input-background) 0%, var(--vscode-editor-background) 100%);
					border: 1px solid var(--vscode-input-border);
					border-radius: 10px;
					padding: 16px;
					box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
					backdrop-filter: blur(8px);
				}
				.panel h3 {
					margin: 0 0 12px 0;
					font-size: 16px;
					font-weight: 500;
					color: var(--vscode-editor-foreground);
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding-bottom: 8px;
					border-bottom: 1px solid var(--vscode-input-border);
				}
				.file-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
					gap: 8px;
					max-height: 280px;
					overflow-y: auto;
					padding-right: 6px;
				}
				.file-card {
					background: linear-gradient(135deg, var(--vscode-button-secondaryBackground) 0%, var(--vscode-input-background) 100%);
					border: 1px solid var(--vscode-input-border);
					border-radius: 8px;
					padding: 10px 8px;
					cursor: pointer;
					transition: all 0.2s ease;
					position: relative;
					overflow: hidden;
				}
				.file-card:hover {
					transform: translateY(-2px);
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
					border-color: var(--vscode-button-background);
				}
				.file-card.selected {
					background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
					border-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				}
				.file-card.selected::before {
					content: "✓";
					position: absolute;
					top: 4px;
					right: 4px;
					background: var(--vscode-button-foreground);
					color: var(--vscode-button-background);
					width: 16px;
					height: 16px;
					border-radius: 50%;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 10px;
					font-weight: bold;
				}
				.file-icon {
					font-size: 18px;
					margin-bottom: 4px;
					display: block;
				}
				.file-name {
					font-size: 11px;
					font-weight: 500;
					margin: 0;
					text-align: center;
					line-height: 1.2;
				}
				.config-textarea {
					width: 100%;
					height: auto;
					min-height: 200px;
					padding: 12px;
					border: 1px solid var(--vscode-input-border);
					border-radius: 8px;
					background: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
					font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
					font-size: 11px;
					line-height: 1.4;
					resize: none;
					box-sizing: border-box;
					transition: border-color 0.2s ease;
					white-space: pre;
					overflow-wrap: normal;
					overflow-x: auto;
				}
				
				/* JSON Syntax Highlighting */
				.json-key {
					color: var(--vscode-editor-foreground);
					font-weight: bold;
				}
				
				.json-string {
					color: var(--vscode-stringForeground);
				}
				
				.json-number {
					color: var(--vscode-numberForeground);
				}
				
				.json-boolean {
					color: var(--vscode-keywordForeground);
				}
				
				.json-null {
					color: var(--vscode-keywordForeground);
				}
				.config-textarea:focus {
					outline: none;
					border-color: var(--vscode-button-background);
					box-shadow: 0 0 0 2px rgba(var(--vscode-button-background), 0.1);
				}
				.btn-secondary {
					padding: 6px 12px;
					font-size: 11px;
					font-weight: 500;
					border: none;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
				}
				.btn-secondary:hover {
					background: var(--vscode-button-secondaryHoverBackground);
					transform: translateY(-1px);
				}
				.scrollbar {
					scrollbar-width: thin;
					scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
				}
				.scrollbar::-webkit-scrollbar {
					width: 4px;
				}
				.scrollbar::-webkit-scrollbar-track {
					background: transparent;
				}
				.scrollbar::-webkit-scrollbar-thumb {
					background: var(--vscode-scrollbarSlider-background);
					border-radius: 2px;
				}
				.scrollbar::-webkit-scrollbar-thumb:hover {
					background: var(--vscode-scrollbarSlider-hoverBackground);
				}
				.github-form {
					background: linear-gradient(135deg, var(--vscode-input-background) 0%, var(--vscode-editor-background) 100%);
					border: 1px solid var(--vscode-input-border);
					border-radius: 10px;
					padding: 16px;
					box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
					backdrop-filter: blur(8px);
				}
				.github-form h3 {
					margin: 0 0 12px 0;
					font-size: 16px;
					font-weight: 500;
					color: var(--vscode-editor-foreground);
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding-bottom: 8px;
					border-bottom: 1px solid var(--vscode-input-border);
				}
				.form-group {
					margin-bottom: 12px;
				}
				.form-group label {
					display: block;
					font-size: 12px;
					font-weight: 500;
					color: var(--vscode-editor-foreground);
					margin-bottom: 4px;
				}
				.form-input {
					width: 100%;
					padding: 8px 12px;
					border: 1px solid var(--vscode-input-border);
					border-radius: 6px;
					background: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					font-size: 12px;
					font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
					box-sizing: border-box;
					transition: border-color 0.2s ease;
				}
				.form-input:focus {
					outline: none;
					border-color: var(--vscode-button-background);
					box-shadow: 0 0 0 2px rgba(var(--vscode-button-background), 0.1);
				}
				.form-input::placeholder {
					color: var(--vscode-input-placeholderForeground);
				}
				.form-row {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 8px;
				}
				.form-help {
					font-size: 10px;
					color: var(--vscode-descriptionForeground);
					margin-top: 4px;
					line-height: 1.3;
				}
				.form-actions {
					display: flex;
					gap: 8px;
					margin-top: 12px;
				}
				.btn-small {
					padding: 6px 10px;
					font-size: 11px;
					font-weight: 500;
					border: none;
					border-radius: 5px;
					cursor: pointer;
					transition: all 0.2s ease;
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
				}
				.btn-small:hover {
					background: var(--vscode-button-secondaryHoverBackground);
					transform: translateY(-1px);
				}
				.btn-small.primary {
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
				}
				.btn-small.primary:hover {
					background: var(--vscode-button-hoverBackground);
				}
			</style>
		</head>
		<body>
			<div class="container">
				<div class="header">
					<h1 class="title">Cursor Git Settings Sync</h1>
					<p class="subtitle">Sync your Cursor settings across devices</p>
				</div>
				
				<div class="action-buttons">
									<button class="btn-primary" onclick="pullConfig()">📥 Pull Settings</button>
				<button class="btn-primary" onclick="pushConfig()">📤 Push Settings</button>
				</div>
				
				<div class="path-display">
					<h3>Settings Directory</h3>
					<div class="path-text">/home/diego/.config/Cursor/User</div>
				</div>
				
				<div class="main-grid">
					<div class="left-panel">
						<div class="panel">
							<h3>
								<span>📁 Files to Sync</span>
								<button class="btn-secondary" onclick="saveSelections()">Save</button>
							</h3>
							<div class="file-grid scrollbar" id="fileList">
								<div class="file-card" onclick="toggleSelection('settings.json')">
									<span class="file-icon">⚙️</span>
									<p class="file-name">settings.json</p>
								</div>
								<div class="file-card" onclick="toggleSelection('keybindings.json')">
									<span class="file-icon">⌨️</span>
									<p class="file-name">keybindings.json</p>
								</div>
								<div class="file-card" onclick="toggleSelection('extensions.json')">
									<span class="file-icon">🔌</span>
									<p class="file-name">extensions.json</p>
								</div>
								<div class="file-card" onclick="toggleSelection('launch.json')">
									<span class="file-icon">🚀</span>
									<p class="file-name">launch.json</p>
								</div>
								<div class="file-card" onclick="toggleSelection('tasks.json')">
									<span class="file-icon">📋</span>
									<p class="file-name">tasks.json</p>
								</div>
								<div class="file-card" onclick="toggleSelection('snippets')">
									<span class="file-icon">✂️</span>
									<p class="file-name">snippets</p>
								</div>
								<div class="file-card" onclick="toggleSelection('globalStorage')">
									<span class="file-icon">💾</span>
									<p class="file-name">globalStorage</p>
								</div>
								<div class="file-card" onclick="toggleSelection('workspaceStorage')">
									<span class="file-icon">🏢</span>
									<p class="file-name">workspaceStorage</p>
								</div>
								<div class="file-card" onclick="toggleSelection('images')">
									<span class="file-icon">🖼️</span>
									<p class="file-name">images</p>
								</div>
							</div>
						</div>
						
						<div class="github-form">
							<h3>
								<span>🔐 GitHub Authentication</span>
								<button class="btn-small primary" onclick="saveGitHubAuth()">Save Auth</button>
							</h3>
							<div class="form-group">
								<label for="githubUsername">GitHub Username</label>
								<input type="text" class="form-input" id="githubUsername" placeholder="your-username" value="${savedConfig.github?.username || ''}">
								<div class="form-help">Your GitHub username (required for Gist creation)</div>
							</div>
							<div class="form-group">
								<label for="githubToken">Personal Access Token</label>
								<input type="password" class="form-input" id="githubToken" placeholder="ghp_..." value="${savedConfig.github?.personalAccessToken || ''}">
								<div class="form-help">Create at: GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic) with "gist" scope</div>
							</div>
							<div class="form-row">
								<div class="form-group">
									<label for="gistDescription">Gist Description</label>
									<input type="text" class="form-input" id="gistDescription" placeholder="Cursor Settings Sync Backup" value="${savedConfig.github?.gistDescription || 'Cursor Settings Sync Backup'}">
								</div>
								<div class="form-group">
									<label for="gistPublic">Public Gist</label>
									<select class="form-input" id="gistPublic">
										<option value="false" ${savedConfig.github?.gistPublic === false ? 'selected' : ''}>Private (Recommended)</option>
										<option value="true" ${savedConfig.github?.gistPublic === true ? 'selected' : ''}>Public</option>
									</select>
								</div>
							</div>
							<div class="form-actions">
								<button class="btn-small" onclick="testGitHubAuth()">Test Connection</button>
								<button class="btn-small" onclick="clearGitHubAuth()">Clear</button>
							</div>
						</div>
					</div>
					
					<div class="panel">
						<h3>
							<span>⚙️ Configuration</span>
							<div style="display: flex; gap: 8px;">
								<button class="btn-secondary" onclick="openConfig()">Open</button>
								<button class="btn-secondary" onclick="saveConfig()">Save</button>
							</div>
						</h3>
						<textarea class="config-textarea" id="configEditor" placeholder="Enter extension configuration in JSON format...">${JSON.stringify(savedConfig, null, 2)}</textarea>
						<div style="margin-top: 8px; font-size: 10px; color: var(--vscode-descriptionForeground);">
							💾 <strong>Config File:</strong> ${configPath || 'cursor-git-sync-config.json'} in VS Code's global storage
						</div>
					</div>
				</div>
			</div>
			<script>
				const vscode = acquireVsCodeApi();
				let selectedFiles = new Set(${JSON.stringify(savedFiles)});
				let currentPath = '${savedPath}';
				
				// Function to sync panel heights
				function syncPanelHeights() {
					const leftPanel = document.querySelector('.left-panel');
					const configPanel = document.querySelector('.panel:last-child');
					const configTextarea = document.getElementById('configEditor');
					
					if (leftPanel && configPanel && configTextarea) {
						const leftPanelHeight = leftPanel.offsetHeight;
						const configPanelPadding = 32; // 16px top + 16px bottom
						const configTextareaPadding = 24; // 12px top + 12px bottom
						const configTextareaHeight = leftPanelHeight - configPanelPadding - configTextareaPadding;
						
						configTextarea.style.height = configTextareaHeight + 'px';
					}
				}
				
				// Sync heights on load and window resize
				window.addEventListener('load', () => {
					setTimeout(syncPanelHeights, 100); // Small delay to ensure DOM is ready
				});
				window.addEventListener('resize', syncPanelHeights);
				
				// JSON Syntax Highlighting Function
				function highlightJSON() {
					const textarea = document.getElementById('configEditor');
					if (!textarea) return;
					
					try {
						const json = JSON.parse(textarea.value);
						const highlighted = JSON.stringify(json, null, 2)
							.replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
							.replace(/"([^"]*)"/g, '<span class="json-string">"$1"</span>')
							.replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
							.replace(/\b(null)\b/g, '<span class="json-null">$1</span>')
							.replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>');
						
						// Create a temporary div to hold the highlighted content
						const tempDiv = document.createElement('div');
						tempDiv.innerHTML = highlighted;
						tempDiv.style.cssText = textarea.style.cssText;
						tempDiv.style.position = 'absolute';
						tempDiv.style.top = textarea.offsetTop + 'px';
						tempDiv.style.left = textarea.offsetLeft + 'px';
						tempDiv.style.width = textarea.offsetWidth + 'px';
						tempDiv.style.height = textarea.offsetHeight + 'px';
						tempDiv.style.padding = '12px';
						tempDiv.style.border = '1px solid var(--vscode-input-border)';
						tempDiv.style.borderRadius = '8px';
						tempDiv.style.background = 'var(--vscode-editor-background)';
						tempDiv.style.fontFamily = 'Monaco, Menlo, Ubuntu Mono, monospace';
						tempDiv.style.fontSize = '11px';
						tempDiv.style.lineHeight = '1.4';
						tempDiv.style.whiteSpace = 'pre';
						tempDiv.style.overflowWrap = 'normal';
						tempDiv.style.overflowX = 'auto';
						tempDiv.style.pointerEvents = 'none';
						tempDiv.style.zIndex = '1';
						
						// Replace textarea with highlighted div
						textarea.style.background = 'transparent';
						textarea.style.color = 'transparent';
						textarea.style.caretColor = 'var(--vscode-editor-foreground)';
						textarea.parentNode.insertBefore(tempDiv, textarea);
						
						// Sync scroll and focus
						textarea.addEventListener('scroll', () => {
							tempDiv.scrollTop = textarea.scrollTop;
							tempDiv.scrollLeft = textarea.scrollLeft;
						});
						
						textarea.addEventListener('input', () => {
							highlightJSON();
						});
						
					} catch (error) {
						// If JSON is invalid, don't highlight
						console.log('Invalid JSON, skipping highlighting');
					}
				}
				
				// Initialize selected files based on saved state
				${savedFiles.map(file => `{
					const cards = document.querySelectorAll('.file-card');
					const card = Array.from(cards).find(c => c.querySelector('.file-name').textContent === '${file}');
					if (card) {
						card.classList.add('selected');
						selectedFiles.add('${file}');
					}
				}`).join('\n\t\t\t\t')}
				
				// Update configuration JSON to reflect current selections
				const configTextarea = document.getElementById('configEditor');
				try {
					const currentConfig = JSON.parse(configTextarea.value);
					currentConfig.includedDirectories = Array.from(selectedFiles);
					configTextarea.value = JSON.stringify(currentConfig, null, 2);
				} catch (error) {
					console.log('Error updating config on init:', error);
				}
				
				function pullConfig() {
					if (selectedFiles.size === 0) {
						alert('Please select at least one configuration file');
						return;
					}
					vscode.postMessage({
						command: 'pullConfig',
						files: Array.from(selectedFiles),
						path: currentPath
					});
				}
				
				function pushConfig() {
					console.log('pushConfig called with selectedFiles:', Array.from(selectedFiles));
					if (selectedFiles.size === 0) {
						alert('Please select at least one configuration file');
						return;
					}
					console.log('Sending pushConfig message to extension');
					vscode.postMessage({
						command: 'pushConfig',
						files: Array.from(selectedFiles),
						path: currentPath
					});
				}
				
				function toggleSelection(fileName) {
					// Find the card by looking for the file name in its content
					const cards = document.querySelectorAll('.file-card');
					const card = Array.from(cards).find(c => c.querySelector('.file-name').textContent === fileName);
					
					if (selectedFiles.has(fileName)) {
						selectedFiles.delete(fileName);
						card.classList.remove('selected');
					} else {
						selectedFiles.add(fileName);
						card.classList.add('selected');
					}
				}
				
				function saveSelections() {
					// Update the configuration JSON with selected files
					const configTextarea = document.getElementById('configEditor');
					try {
						const currentConfig = JSON.parse(configTextarea.value);
						currentConfig.includedDirectories = Array.from(selectedFiles);
						configTextarea.value = JSON.stringify(currentConfig, null, 2);
						
						vscode.postMessage({
							command: 'saveSelections',
							files: Array.from(selectedFiles)
						});
						alert('File selections saved successfully!');
					} catch (error) {
						alert('Error updating configuration: ' + error.message);
					}
				}
				
				function saveConfig() {
					try {
						const configText = document.getElementById('configEditor').value;
						const config = JSON.parse(configText);
						
						// Also save the current file selections
						vscode.postMessage({
							command: 'saveSelections',
							files: Array.from(selectedFiles)
						});
						
						vscode.postMessage({
							command: 'saveConfig',
							config: config
						});
						alert('Configuration and file selections saved successfully!');
					} catch (error) {
						alert('Invalid JSON configuration: ' + error.message);
					}
				}
				
				function saveGitHubAuth() {
					try {
						const username = document.getElementById('githubUsername').value.trim();
						const token = document.getElementById('githubToken').value.trim();
						const description = document.getElementById('gistDescription').value.trim();
						const isPublic = document.getElementById('gistPublic').value === 'true';
						
						if (!username) {
							alert('Please enter your GitHub username');
							return;
						}
						
						if (!token) {
							alert('Please enter your GitHub Personal Access Token');
							return;
						}
						
						// Update the configuration JSON
						const configTextarea = document.getElementById('configEditor');
						const currentConfig = JSON.parse(configTextarea.value);
						
						currentConfig.github.username = username;
						currentConfig.github.personalAccessToken = token;
						currentConfig.github.gistDescription = description;
						currentConfig.github.gistPublic = isPublic;
						
						configTextarea.value = JSON.stringify(currentConfig, null, 2);
						
						// Save to extension
						vscode.postMessage({
							command: 'saveConfig',
							config: currentConfig
						});
						
						alert('GitHub authentication saved successfully!');
					} catch (error) {
						alert('Error saving GitHub authentication: ' + error.message);
					}
				}
				
				function testGitHubAuth() {
					const username = document.getElementById('githubUsername').value.trim();
					const token = document.getElementById('githubToken').value.trim();
					
					if (!username || !token) {
						alert('Please enter both username and token before testing');
						return;
					}
					
					vscode.postMessage({
						command: 'testGitHubAuth',
						username: username,
						token: token
					});
				}
				
				function clearGitHubAuth() {
					document.getElementById('githubUsername').value = '';
					document.getElementById('githubToken').value = '';
					document.getElementById('gistDescription').value = 'Cursor Settings Sync Backup';
					document.getElementById('gistPublic').value = 'false';
					alert('GitHub authentication fields cleared');
				}
				
				function openConfig() {
					vscode.postMessage({
						command: 'openConfigFile'
					});
				}
				
				// Listen for messages from the extension
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.command) {
						case 'updateFileContent':
							updateFileContent(message.content);
							break;
					}
				});
			</script>
		</body>
		</html>
	`;
}
