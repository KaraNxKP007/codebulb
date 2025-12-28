// @ts-nocheck
const vscode = require('vscode');
const SidebarProvider = require('./SidebarProvider');
const { buildWebsite } = require('./agents/WebsiteBuilder');
const { fixCode } = require('./agents/CodeFixer');
const { chatWithAI } = require('./agents/ChatAgent');

function activate(context) {
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("codebulb.chatView", sidebarProvider));

    // 1. Builder
    let buildCommand = vscode.commands.registerCommand('codebulb.startBuilder', async (prompt, apiKey, provider) => {
        const folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, openLabel: 'Select Build Location' });
        if (!folder) return;
        
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `CodeBulb (${provider}): Building...` }, async () => {
            try {
                await buildWebsite(prompt, apiKey, folder[0].fsPath, provider, (log) => sidebarProvider.addLog(log));
            } catch (e) { vscode.window.showErrorMessage(`Error: ${e.message}`); }
        });
    });

    // 2. Fixer
    let fixCommand = vscode.commands.registerCommand('codebulb.startFixer', async (prompt, apiKey, provider) => {
        const folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, openLabel: 'Select Project' });
        if (!folder) return;

        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `CodeBulb (${provider}): Fixing...` }, async () => {
            try {
                await fixCode(prompt, apiKey, folder[0].fsPath, provider, (log) => sidebarProvider.addLog(log));
            } catch (e) { vscode.window.showErrorMessage(`Error: ${e.message}`); }
        });
    });

    // 3. Chat
    let chatCommand = vscode.commands.registerCommand('codebulb.startChat', async (prompt, apiKey, provider) => {
        await chatWithAI(prompt, apiKey, provider, (response) => {
            sidebarProvider._view.webview.postMessage({ type: 'addChat', value: response });
        });
    });

    context.subscriptions.push(buildCommand);
    context.subscriptions.push(fixCommand);
    context.subscriptions.push(chatCommand);
}

function deactivate() {}
module.exports = { activate, deactivate };