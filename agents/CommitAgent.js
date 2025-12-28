// @ts-nocheck
const vscode = require('vscode');
const { exec } = require('child_process');
const util = require('util');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const execAsync = util.promisify(exec);

async function generateCommitMessage(apiKey, workDir, provider, customInstructions) {
    try {
        // 1. Get the Git Diff
        const { stdout } = await execAsync('git diff --staged', { cwd: workDir });
        
        if (!stdout || stdout.trim() === '') {
            return "Error: No staged changes found. Did you run 'git add'?";
        }

        const systemPrompt = `You are an expert Developer. 
        ${customInstructions || ""}
        Task: Generate a concise, professional git commit message based on the diff below.
        Format: <type>: <subject>`;

        const diffSnippet = stdout.substring(0, 3000); // Prevent token overflow

        if (provider === 'deepseek') {
            // DeepSeek Logic
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${apiKey}`,
                    "X-Title": "CodeBulb"
                },
                body: JSON.stringify({
                    model: "deepseek/deepseek-chat",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Git Diff:\n${diffSnippet}` }
                    ]
                })
            });
            const data = await response.json();
            return data.choices[0].message.content;
        } else {
            // Gemini Logic
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(`${systemPrompt}\n\nGit Diff:\n${diffSnippet}`);
            return result.response.text();
        }

    } catch (err) {
        return `Error generating commit: ${err.message}`;
    }
}

module.exports = { generateCommitMessage };