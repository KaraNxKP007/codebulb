const vscode = require('vscode');

class SidebarProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'saveKeys': {
          const { gemini, deepseek } = data.value;
          if (gemini) await vscode.workspace.getConfiguration('codebulb').update('apiKey', gemini, vscode.ConfigurationTarget.Global);
          if (deepseek) await vscode.workspace.getConfiguration('codebulb').update('deepSeekApiKey', deepseek, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('API Keys saved successfully!');
          this.addLog('✅ Keys saved.');
          break;
        }
        case 'onRunAgent': {
          const { prompt, mode, provider } = data.value;
          
          const geminiKey = vscode.workspace.getConfiguration('codebulb').get('apiKey');
          const deepSeekKey = vscode.workspace.getConfiguration('codebulb').get('deepSeekApiKey');

          // Validation
          if (provider === 'gemini' && !geminiKey) {
            vscode.window.showErrorMessage('Gemini API Key missing!');
            return;
          }
          if (provider === 'deepseek' && !deepSeekKey) {
            vscode.window.showErrorMessage('DeepSeek API Key missing!');
            return;
          }

          const activeKey = provider === 'deepseek' ? deepSeekKey : geminiKey;

          if (mode === 'chat') {
             this._view.webview.postMessage({ type: 'addUserMsg', value: prompt });
             vscode.commands.executeCommand('codebulb.startChat', prompt, activeKey, provider);
          } else if (mode === 'build') {
             vscode.commands.executeCommand('codebulb.startBuilder', prompt, activeKey, provider);
          } else if (mode === 'fix') {
             vscode.commands.executeCommand('codebulb.startFixer', prompt, activeKey, provider);
          }
          break;
        }
      }
    });
  }

  addLog(log) {
    if (this._view) this._view.webview.postMessage({ type: 'addLog', value: log });
  }

  _getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: var(--vscode-font-family); padding: 15px; color: var(--vscode-editor-foreground); }
        .box { background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-textBlockQuote-border); padding: 10px; margin-bottom: 10px; border-radius: 5px; }
        h2 { color: #f9ab00; margin-top: 0; }
        input, textarea, select { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; margin-top: 5px; margin-bottom: 10px; box-sizing: border-box; }
        textarea { height: 70px; resize: vertical; }
        button { width: 100%; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px; cursor: pointer; font-weight: bold; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        .secondary-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        
        .logs { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 10px; height: 300px; overflow-y: auto; font-family: sans-serif; font-size: 0.9em; margin-top: 15px; display: flex; flex-direction: column; gap: 8px; }
        .msg { padding: 8px 12px; border-radius: 6px; max-width: 90%; word-wrap: break-word; }
        .msg-user { align-self: flex-end; background: #007acc; color: white; }
        .msg-ai { align-self: flex-start; background: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-textBlockQuote-border); }
        .msg-log { align-self: flex-start; font-family: monospace; color: #888; font-size: 0.8em; border-bottom: 1px solid #333; width: 100%; }
      </style>
    </head>
    <body>
      <h2>⚡ CodeBulb</h2>

      <div class="box">
        <label>🤖 Model Provider</label>
        <select id="provider">
          <option value="gemini">Google Gemini 2.0</option>
          <option value="deepseek">DeepSeek V3 (No Rate Limits!)</option>
        </select>
      </div>

      <div class="box" id="keyBox">
        <label>🔑 API Keys</label>
        <input type="password" id="geminiKey" placeholder="Gemini Key">
        <input type="password" id="deepSeekKey" placeholder="DeepSeek Key">
        <button id="saveKeyBtn" class="secondary-btn">Save Keys</button>
      </div>
      
      <label>Mode:</label>
      <select id="mode">
        <option value="chat">💬 Chat (Ask Doubts)</option>
        <option value="build">🔨 Website Builder</option>
        <option value="fix">🚑 Code Doctor</option>
      </select>

      <textarea id="prompt" placeholder="Type instructions..."></textarea>
      <button id="runBtn">Run 🚀</button>

      <h4>Logs / Chat:</h4>
      <div class="logs" id="logs"></div>

      <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('saveKeyBtn').addEventListener('click', () => {
          const gemini = document.getElementById('geminiKey').value;
          const deepseek = document.getElementById('deepSeekKey').value;
          vscode.postMessage({ type: 'saveKeys', value: { gemini, deepseek } });
        });

        document.getElementById('runBtn').addEventListener('click', () => {
          const prompt = document.getElementById('prompt').value;
          const mode = document.getElementById('mode').value;
          const provider = document.getElementById('provider').value;
          
          if(prompt.trim() === "") return;
          if(mode === 'chat') document.getElementById('prompt').value = ""; // Clear for chat

          vscode.postMessage({ type: 'onRunAgent', value: { prompt, mode, provider } });
        });

        window.addEventListener('message', event => {
          const message = event.data;
          const logs = document.getElementById('logs');
          const entry = document.createElement('div');

          if (message.type === 'addLog') { entry.className = 'msg msg-log'; entry.textContent = '> ' + message.value; } 
          else if (message.type === 'addUserMsg') { entry.className = 'msg msg-user'; entry.textContent = message.value; }
          else if (message.type === 'addChat') { entry.className = 'msg msg-ai'; entry.innerText = message.value; }

          logs.appendChild(entry);
          logs.scrollTop = logs.scrollHeight;
        });
      </script>
    </body>
    </html>`;
  }
}
module.exports = SidebarProvider;