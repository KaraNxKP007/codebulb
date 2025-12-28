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

    // 1. LOAD KEYS
    const geminiKey = vscode.workspace.getConfiguration('codebulb').get('apiKey');
    const deepSeekKey = vscode.workspace.getConfiguration('codebulb').get('deepSeekApiKey');
    const hasKeys = !!(geminiKey || deepSeekKey);

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, hasKeys);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        // --- KEY MANAGEMENT ---
        case 'saveKeys': {
          const { gemini, deepseek } = data.value;
          if (gemini) await vscode.workspace.getConfiguration('codebulb').update('apiKey', gemini, vscode.ConfigurationTarget.Global);
          if (deepseek) await vscode.workspace.getConfiguration('codebulb').update('deepSeekApiKey', deepseek, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage('CodeBulb: Keys saved successfully! 🚀');
          this._view.webview.html = this._getHtmlForWebview(this._view.webview, true);
          break;
        }

        // --- AGENT RUNNER ---
        case 'onRunAgent': {
          const { prompt, mode, provider, instructions, history } = data.value;
          
          const geminiKey = vscode.workspace.getConfiguration('codebulb').get('apiKey');
          const deepSeekKey = vscode.workspace.getConfiguration('codebulb').get('deepSeekApiKey');
          const activeKey = provider === 'deepseek' ? deepSeekKey : geminiKey;

          if (!activeKey) {
             vscode.window.showErrorMessage(`Missing ${provider} API Key. Check Settings.`); 
             this._view.webview.postMessage({ type: 'addLog', value: '❌ Error: API Key missing.' });
             return;
          }

          // Execute Command based on Mode
          if (mode === 'chat') vscode.commands.executeCommand('codebulb.startChat', prompt, activeKey, provider, instructions, history);
          else if (mode === 'build') vscode.commands.executeCommand('codebulb.startBuilder', prompt, activeKey, provider, instructions);
          else if (mode === 'fix') vscode.commands.executeCommand('codebulb.startFixer', prompt, activeKey, provider, instructions);
          else if (mode === 'review') vscode.commands.executeCommand('codebulb.reviewCode', activeKey, provider, instructions);
          else if (mode === 'commit') vscode.commands.executeCommand('codebulb.generateCommit', activeKey, provider, instructions);
          break;
        }

        // --- EDITOR ACTIONS ---
        case 'insertCode': {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, data.value);
                });
                vscode.window.showInformationMessage('Code inserted! 📝');
            } else {
                vscode.window.showWarningMessage('Open a file to insert code.');
            }
            break;
        }
        case 'copyCode': {
            vscode.env.clipboard.writeText(data.value);
            vscode.window.showInformationMessage('Copied to clipboard! 📋');
            break;
        }

        case 'onError': {
            vscode.window.showErrorMessage(data.value);
            break;
        }
      }
    });
  }

  addLog(log) {
    if (this._view) this._view.webview.postMessage({ type: 'addLog', value: log });
  }

  _getHtmlForWebview(webview, hasKeys) {
    const setupDisplay = hasKeys ? 'none' : 'flex';
    const appDisplay = hasKeys ? 'flex' : 'none';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
      
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        :root { 
          --primary: #6366f1; 
          --bg: #0f172a;
          --bg-card: #1e293b;
          --bg-input: #334155;
          --fg: #f1f5f9;
          --border: #334155;
          --code-bg: #111827;
          --code-header: #374151;
          
          /* Tool Colors */
          --accent-chat: #3b82f6;
          --accent-review: #8b5cf6;
          --accent-commit: #f59e0b;
          --accent-fix: #ef4444;
          --accent-build: #10b981;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
          font-family: 'Inter', sans-serif; 
          background: var(--bg); color: var(--fg); height: 100vh; 
          display: flex; flex-direction: column; overflow: hidden; 
        }

        /* --- SETUP SCREEN --- */
        .setup-screen { display: ${setupDisplay}; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); text-align: center; }
        .setup-card { background: rgba(30, 41, 59, 0.95); padding: 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); width: 100%; max-width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .setup-icon { font-size: 3rem; color: #fbbf24; margin-bottom: 15px; }
        .styled-input { width: 100%; padding: 12px; background: var(--bg); border: 1px solid var(--border); color: white; border-radius: 8px; margin-bottom: 15px; font-family: inherit; }
        .setup-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .setup-btn:hover { filter: brightness(1.1); }

        /* --- HEADER --- */
        .header { padding: 12px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .logo { font-weight: 700; display: flex; align-items: center; gap: 8px; color: white; font-size: 1rem; }
        .logo i { color: #fbbf24; }
        .clear-btn { background: transparent; border: 1px solid var(--border); color: #94a3b8; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.8rem; transition: 0.2s; }
        .clear-btn:hover { background: #ef4444; border-color: #ef4444; color: white; }

        /* --- MODEL BAR --- */
        .model-bar { padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; gap: 10px; }
        .model-btn { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); color: #cbd5e1; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; font-weight: 600; transition: all 0.2s; }
        .model-btn.gemini.active { background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; color: #3b82f6; }
        .model-btn.deepseek.active { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; }

        /* --- TABS --- */
        .tabs { display: flex; background: var(--bg-card); border-bottom: 1px solid var(--border); }
        .tab-btn { flex: 1; padding: 10px; background: transparent; border: none; color: #94a3b8; cursor: pointer; border-bottom: 2px solid transparent; font-weight: 600; font-size: 0.85rem; }
        .tab-btn.active { color: white; border-bottom: 2px solid var(--primary); }

        /* --- ACTION BAR (CHIPS) --- */
        .action-bar { display: flex; gap: 8px; padding: 12px 16px; background: var(--bg); overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
        .action-bar::-webkit-scrollbar { display: none; }
        
        .chip-btn { 
          background: var(--bg-card); border: 1px solid var(--border); color: var(--fg); 
          padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; 
          cursor: pointer; display: flex; align-items: center; gap: 6px; 
          transition: 0.2s; flex-shrink: 0; 
        }

        /* ACTIVE CHIP STYLES */
        .chip-btn:hover { filter: brightness(1.2); }
        .chip-btn.active-chat { background: var(--accent-chat); border-color: var(--accent-chat); color: white; }
        .chip-btn.active-review { background: var(--accent-review); border-color: var(--accent-review); color: white; }
        .chip-btn.active-commit { background: var(--accent-commit); border-color: var(--accent-commit); color: white; }
        .chip-btn.active-fix { background: var(--accent-fix); border-color: var(--accent-fix); color: white; }
        .chip-btn.active-build { background: var(--accent-build); border-color: var(--accent-build); color: white; }

        /* --- CHAT AREA (FIXED OVERFLOW) --- */
        .content { display: none; flex: 1; flex-direction: column; overflow: hidden; }
        .content.active { display: flex; }
        .chat-area { 
            flex: 1; 
            overflow-y: auto; 
            overflow-x: hidden; /* FIX: Prevents horizontal scrolling */
            padding: 16px; 
            display: flex; 
            flex-direction: column; 
            gap: 16px; 
            scroll-behavior: smooth; 
        }
        
        .msg { 
            max-width: 85%; /* FIX: Reduced from 90% for safety */
            padding: 12px 16px; 
            border-radius: 12px; 
            font-size: 0.9rem; 
            line-height: 1.6; 
            word-wrap: break-word; 
            overflow-wrap: anywhere; /* FIX: Breaks long strings/URLs */
        }
        .msg-user { align-self: flex-end; background: var(--primary); color: white; }
        .msg-ai { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border); width: fit-content; }

        /* --- CODE BLOCKS --- */
        .code-block-wrapper { margin: 10px 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--code-bg); max-width: 100%; }
        .code-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: var(--code-header); border-bottom: 1px solid var(--border); }
        .lang-label { font-size: 0.75rem; color: #cbd5e1; font-weight: 600; text-transform: uppercase; }
        .code-actions { display: flex; gap: 8px; }
        .code-btn { background: transparent; border: none; color: #cbd5e1; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 4px; transition: 0.2s; }
        .code-btn:hover { background: rgba(255,255,255,0.1); color: white; }
        pre { margin: 0; padding: 12px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
        code { font-family: 'Consolas', 'Monaco', monospace; font-size: 0.85rem; }

        /* --- INPUT AREA --- */
        .input-area { padding: 16px; background: var(--bg-card); border-top: 1px solid var(--border); }
        .input-wrapper { display: flex; gap: 8px; align-items: flex-end; }
        textarea { flex: 1; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; resize: none; min-height: 45px; font-family: inherit; max-height: 150px; }
        textarea:focus { outline: none; border-color: var(--primary); }
        
        .send-btn { width: 45px; height: 45px; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; flex-shrink: 0; background: var(--primary); color: white; }
        .send-btn:hover { filter: brightness(1.1); }

        /* LOADER */
        .loader { display: none; padding: 10px; align-items: center; gap: 8px; color: #94a3b8; font-size: 0.8rem; }
        .loader.active { display: flex; }
        .spinner { width: 12px; height: 12px; border: 2px solid #94a3b8; border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        /* SETTINGS */
        .settings-container { padding: 20px; }
        .settings-section { margin-bottom: 20px; background: var(--bg-card); padding: 15px; border-radius: 12px; border: 1px solid var(--border); }
      </style>
    </head>
    <body>

      <div class="setup-screen">
        <div class="setup-card">
          <div class="setup-icon"><i class="fas fa-lightbulb"></i></div>
          <h2>Welcome to CodeBulb</h2>
          <p style="color:#cbd5e1; margin-bottom:20px;">Your AI Pilot is ready.</p>
          <input type="password" id="initGemini" class="styled-input" placeholder="Gemini API Key">
          <input type="password" id="initDeepSeek" class="styled-input" placeholder="DeepSeek API Key (Optional)">
          <button class="setup-btn" id="initSaveBtn">Activate <i class="fas fa-rocket"></i></button>
        </div>
      </div>

      <div class="app-screen" style="display:${appDisplay}; flex-direction:column; height:100%;">
        
        <div class="header">
          <div class="logo"><i class="fas fa-lightbulb"></i> CodeBulb</div>
          <button class="clear-btn" id="clearBtn"><i class="fas fa-trash-alt"></i></button>
        </div>

        <div class="model-bar">
          <button class="model-btn gemini active" id="btn-gemini" onclick="selectModel('gemini')"><i class="fas fa-bolt"></i> Gemini</button>
          <button class="model-btn deepseek" id="btn-deepseek" onclick="selectModel('deepseek')"><i class="fas fa-brain"></i> DeepSeek</button>
        </div>

        <div class="tabs">
          <button class="tab-btn active" onclick="switchTab(event, 'chat')">Assistant</button>
          <button class="tab-btn" onclick="switchTab(event, 'settings')">Settings</button>
        </div>

        <div id="chat" class="content active">
          <div class="action-bar">
            <div class="chip-btn" id="chip-chat" onclick="setMode('chat')"><i class="fas fa-comment-dots"></i> Chat</div>
            <div class="chip-btn" id="chip-review" onclick="triggerAction('review')"><i class="fas fa-search"></i> Review</div>
            <div class="chip-btn" id="chip-commit" onclick="triggerAction('commit')"><i class="fas fa-code-branch"></i> Commit</div>
            <div class="chip-btn" id="chip-fix" onclick="setMode('fix')"><i class="fas fa-wrench"></i> Fix</div>
            <div class="chip-btn" id="chip-build" onclick="setMode('build')"><i class="fas fa-hammer"></i> Build</div>
          </div>

          <div class="chat-area" id="logs"></div>
          
          <div class="loader" id="loader">
            <div class="spinner"></div>
            <span id="loader-text">Thinking...</span>
          </div>

          <div class="input-area">
             <div class="input-wrapper">
                <textarea id="prompt" placeholder="Ask a question..." rows="1"></textarea>
                <button class="send-btn" id="runBtn"><i class="fas fa-paper-plane"></i></button>
             </div>
          </div>
        </div>

        <div id="settings" class="content">
           <div class="settings-container">
              <div class="settings-section">
                <h3>API Keys</h3>
                <input type="password" id="geminiKey" class="styled-input" placeholder="Update Gemini Key">
                <input type="password" id="deepSeekKey" class="styled-input" placeholder="Update DeepSeek Key">
              </div>
              <div class="settings-section">
                <h3>Persona</h3>
                <textarea id="customInstructions" class="styled-input" style="height:80px;" placeholder="E.g. Be concise, Use Python"></textarea>
              </div>
              <button class="setup-btn" id="saveSettingsBtn">Save Settings</button>
           </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        
        // --- CUSTOM RENDERER FOR CODE BLOCKS ---
        const renderer = new marked.Renderer();
        renderer.code = (code, language) => {
            const safeCode = encodeURIComponent(code); 
            return \`<div class="code-block-wrapper">
                      <div class="code-header">
                          <span class="lang-label">\${language || 'code'}</span>
                          <div class="code-actions">
                              <button class="code-btn" onclick="copyCode(this, '\${safeCode}')"><i class="fas fa-copy"></i> Copy</button>
                              <button class="code-btn" onclick="insertCode('\${safeCode}')"><i class="fas fa-download"></i> Insert</button>
                          </div>
                      </div>
                      <pre><code class="language-\${language}">\${code}</code></pre>
                  </div>\`;
        };
        marked.use({ renderer });

        // --- STATE & HISTORY ---
        const state = vscode.getState() || { history: [], model: 'gemini', mode: 'chat', instructions: '' };
        let promptHistory = [];
        let historyIndex = -1;

        window.onload = () => {
           selectModel(state.model || 'gemini', false);
           if(state.instructions) document.getElementById('customInstructions').value = state.instructions;
           // Restore Mode and History
           setMode(state.mode || 'chat', false);
           if (state.history) state.history.forEach(msg => addMessageToDOM(msg.text, msg.type, msg.isHtml, false));
        };

        function saveState() { vscode.setState(state); }
        function clearChat() { state.history = []; saveState(); document.getElementById('logs').innerHTML = ''; addMessageToDOM("🗑️ Chat cleared.", 'ai', false, false); }
        document.getElementById('clearBtn').addEventListener('click', clearChat);

        // --- MODEL & MODE ---
        function selectModel(provider, save = true) {
           document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
           document.getElementById('btn-' + provider).classList.add('active');
           if(save) { state.model = provider; saveState(); }
        }

        function setMode(mode, save = true) {
           // Reset All Chips
           document.querySelectorAll('.chip-btn').forEach(b => b.className = 'chip-btn');
           
           // Activate Selected Chip
           const chip = document.getElementById('chip-' + mode);
           if(chip) chip.classList.add('active-' + mode);
           
           const placeholders = { 'chat': 'Ask...', 'fix': 'Paste bug...', 'build': 'Describe website...' };
           document.getElementById('prompt').placeholder = placeholders[mode] || 'Ask...';
           document.getElementById('prompt').focus();
           if(save) { state.mode = mode; saveState(); }
        }

        // --- RUNNER ---
        document.getElementById('runBtn').addEventListener('click', runAgent);
        
        function runAgent() {
           const prompt = document.getElementById('prompt').value;
           if(!prompt.trim()) return;
           
           // Add to prompt history
           promptHistory.push(prompt);
           historyIndex = promptHistory.length;
           
           executeRun(prompt, state.mode);
        }

        function triggerAction(action) {
           setMode(action); // Visually select the tool
           executeRun('', action); // Run immediately (no prompt needed for review/commit)
        }

        function executeRun(prompt, mode) {
           const instructions = document.getElementById('customInstructions').value;
           state.instructions = instructions; saveState();

           if(prompt) addMessageToDOM(prompt, 'user', false, true);
           else if(mode === 'review') addMessageToDOM('🔍 Reviewing code...', 'user', false, true);
           else if(mode === 'commit') addMessageToDOM('📝 Generating commit...', 'user', false, true);

           const status = mode === 'build' ? 'Building...' : mode === 'fix' ? 'Fixing...' : 'Thinking...';
           document.getElementById('loader-text').innerText = status;
           document.getElementById('loader').classList.add('active');
           document.getElementById('prompt').value = '';

           vscode.postMessage({ type: 'onRunAgent', value: { prompt, mode, provider: state.model, instructions, history: state.history } });
        }

        // --- ADVANCED CODE ACTIONS ---
        window.copyCode = (btn, encodedCode) => {
            vscode.postMessage({ type: 'copyCode', value: decodeURIComponent(encodedCode) });
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied';
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        };

        window.insertCode = (encodedCode) => {
            vscode.postMessage({ type: 'insertCode', value: decodeURIComponent(encodedCode) });
        };

        // --- INPUT AUTO RESIZE & ENTER KEY ---
        const tx = document.getElementById('prompt');
        tx.addEventListener("input", function(){ this.style.height = 'auto'; this.style.height = (this.scrollHeight) + "px"; });
        tx.addEventListener('keydown', (e) => {
            if(e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                runAgent(); 
            }
            if(e.key === 'ArrowUp' && historyIndex > 0) { 
                historyIndex--; tx.value = promptHistory[historyIndex]; 
            }
            if(e.key === 'ArrowDown' && historyIndex < promptHistory.length - 1) { 
                historyIndex++; tx.value = promptHistory[historyIndex]; 
            }
        });

        // --- TABS & MESSAGING ---
        function switchTab(event, tab) {
           document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
           document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
           document.getElementById(tab).classList.add('active');
           event.target.classList.add('active');
        }

        window.addEventListener('message', event => {
          const message = event.data;
          document.getElementById('loader').classList.remove('active');
          if (message.type === 'addChat') { const html = marked.parse(message.value); addMessageToDOM(html, 'ai', true, true); } 
          else if (message.type === 'addLog') { addMessageToDOM(message.value, 'ai', false, false); }
        });

        function addMessageToDOM(text, type, isHtml = false, save = true) {
          const logs = document.getElementById('logs');
          const div = document.createElement('div');
          div.className = 'msg msg-' + type;
          if(isHtml) {
            div.innerHTML = text;
            div.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
          } else { div.textContent = text; }
          logs.appendChild(div);
          logs.scrollTop = logs.scrollHeight;
          if(save) { state.history.push({ text, type, isHtml }); saveState(); }
        }

        document.getElementById('initSaveBtn')?.addEventListener('click', () => saveKeys('init'));
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => saveKeys('update'));
        function saveKeys(prefix) {
            const gemini = document.getElementById(prefix === 'init' ? 'initGemini' : 'geminiKey').value;
            const deepseek = document.getElementById(prefix === 'init' ? 'initDeepSeek' : 'deepSeekKey').value;
            vscode.postMessage({ type: 'saveKeys', value: { gemini, deepseek } });
        }
      </script>
    </body>
    </html>`;
  }
}
module.exports = SidebarProvider;