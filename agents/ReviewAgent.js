// @ts-nocheck
const vscode = require('vscode');
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function reviewCode(fileContent, apiKey, provider, customInstructions) {
    const systemPrompt = `You are a Senior Code Reviewer.
    ${customInstructions || ""}
    Task: Review the code below.
    Output: A markdown list of issues (Security, Performance, Style) and a fixed code block if necessary.`;

    try {
        if (provider === 'deepseek') {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "deepseek/deepseek-chat",
                    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: fileContent }]
                })
            });
            const data = await response.json();
            return data.choices[0].message.content;
        } else {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(`${systemPrompt}\n\nCode:\n${fileContent}`);
            return result.response.text();
        }
    } catch (error) {
        return `Review Failed: ${error.message}`;
    }
}

module.exports = { reviewCode };