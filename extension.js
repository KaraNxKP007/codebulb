// @ts-nocheck
const vscode = require('vscode');
const path = require('path');
const SidebarProvider = require('./SidebarProvider');

// Import the FIXED agents (from the previous steps)
const { buildWebsite } = require('./agents/WebsiteBuilder');
const { fixCode } = require('./agents/CodeFixer');
const { chatWithAI } = require('./agents/ChatAgent');
const { generateCommitMessage } = require('./agents/CommitAgent');
const { reviewCode } = require('./agents/ReviewAgent');

function activate(context) {
    // 1. Setup the Sidebar (Chat UI)
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("codebulb.chatView", sidebarProvider)
    );

    // 2. Register Builder Command (Called by Sidebar)
    let buildCommand = vscode.commands.registerCommand('codebulb.startBuilder', async (prompt, apiKey, provider) => {
        // Validation: Ensure API Key exists
        if (!apiKey) {
            vscode.window.showErrorMessage("Please enter an API Key in the CodeBulb sidebar.");
            return;
        }

        // Ask user where to build the website
        const folder = await vscode.window.showOpenDialog({ 
            canSelectFiles: false, 
            canSelectFolders: true, 
            openLabel: 'Select Build Location' 
        });
        
        if (!folder) return; // User cancelled
        
        const workDir = folder[0].fsPath;

        // Run the Agent with Progress Bar
        vscode.window.withProgress({ 
            location: vscode.ProgressLocation.Notification, 
            title: `CodeBulb (${provider}): Building Website...` 
        }, async () => {
            try {
                // Call the ROBUST WebsiteBuilder
                await buildWebsite(prompt, apiKey, workDir, provider, (log) => {
                    // Send logs back to Sidebar UI
                    if (sidebarProvider._view) {
                        sidebarProvider._view.webview.postMessage({ type: 'addLog', value: log });
                    }
                });
                vscode.window.showInformationMessage("Website created successfully!");
            } catch (e) { 
                vscode.window.showErrorMessage(`Build Error: ${e.message}`); 
            }
        });
    });

    // 3. Register Fixer Command (Called by Sidebar)
    let fixCommand = vscode.commands.registerCommand('codebulb.startFixer', async (prompt, apiKey, provider) => {
        if (!apiKey) {
            vscode.window.showErrorMessage("API Key required.");
            return;
        }

        const folder = await vscode.window.showOpenDialog({ 
            canSelectFiles: false, 
            canSelectFolders: true, 
            openLabel: 'Select Project to Fix' 
        });
        
        if (!folder) return;

        vscode.window.withProgress({ 
            location: vscode.ProgressLocation.Notification, 
            title: `CodeBulb (${provider}): Fixing Code...` 
        }, async () => {
            try {
                // Call the ROBUST CodeFixer
                await fixCode(prompt, apiKey, folder[0].fsPath, provider, (log) => {
                    if (sidebarProvider._view) {
                        sidebarProvider._view.webview.postMessage({ type: 'addLog', value: log });
                    }
                });
                vscode.window.showInformationMessage("Fixer session completed.");
            } catch (e) { 
                vscode.window.showErrorMessage(`Fixer Error: ${e.message}`); 
            }
        });
    });

    // 4. Register Chat Command (Called by Sidebar)
    let chatCommand = vscode.commands.registerCommand('codebulb.startChat', async (prompt, apiKey, provider) => {
        if (!apiKey) {
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addChat', value: "Please enter an API Key first." });
            }
            return;
        }

        try {
            await chatWithAI(prompt, apiKey, provider, (response) => {
                // Send AI reply back to Chat UI
                if (sidebarProvider._view) {
                    sidebarProvider._view.webview.postMessage({ type: 'addChat', value: response });
                }
            });
        } catch (e) {
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addChat', value: `Error: ${e.message}` });
            }
        }
    });

    // 5. Register Commit Generator (Fixed Context)
    let commitCommand = vscode.commands.registerCommand('codebulb.generateCommit', async (apiKey, provider, instructions) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage("❌ No workspace open. Open a folder with Git initialized.");
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addLog', value: '❌ Error: No workspace found.' });
            }
            return;
        }
        
        if (sidebarProvider._view) {
            sidebarProvider._view.webview.postMessage({ type: 'showLoading' });
        }

        try {
            const message = await generateCommitMessage(apiKey, workspaceFolders[0].uri.fsPath, provider, instructions);
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ 
                    type: 'addChat', 
                    value: `**📝 Suggested Commit Message:**\n\n\`\`\`text\n${message}\n\`\`\`` 
                });
            }
        } catch (e) {
            vscode.window.showErrorMessage(e.message);
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addChat', value: `❌ Error: ${e.message}` });
            }
        }
    });

    // 6. Register Code Reviewer (Fixed Focus Issue)
    let reviewCommand = vscode.commands.registerCommand('codebulb.reviewCode', async (apiKey, provider, instructions) => {
        // FIX: If sidebar is focused, 'activeTextEditor' might be null. Check visible editors.
        let editor = vscode.window.activeTextEditor;
        if (!editor && vscode.window.visibleTextEditors.length > 0) {
            editor = vscode.window.visibleTextEditors[0]; // Grab the first visible code file
        }

        if (!editor) {
            vscode.window.showWarningMessage("⚠️ Please open a code file to review first.");
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addLog', value: '⚠️ Open a file to review.' });
            }
            return;
        }

        const document = editor.document;
        const text = document.getText();

        if (sidebarProvider._view) {
            sidebarProvider._view.webview.postMessage({ type: 'showLoading' });
        }

        try {
            const review = await reviewCode(text, apiKey, provider, instructions);
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ 
                    type: 'addChat', 
                    value: `**🧐 Code Review for ${path.basename(document.fileName)}:**\n\n${review}` 
                });
            }
        } catch (e) {
            vscode.window.showErrorMessage(e.message);
            if (sidebarProvider._view) {
                sidebarProvider._view.webview.postMessage({ type: 'addChat', value: `❌ Error: ${e.message}` });
            }
        }
    });

    context.subscriptions.push(buildCommand);
    context.subscriptions.push(fixCommand);
    context.subscriptions.push(chatCommand);
    context.subscriptions.push(commitCommand);
    context.subscriptions.push(reviewCommand);
}

function deactivate() {}

module.exports = { activate, deactivate };