// @ts-nocheck
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const os = require("os");

async function buildWebsite(prompt, apiKey, workDir, provider, logger) {
    const systemInstruction = `You are CodeBulb Builder. OS: ${os.platform()}. RULES: 1. mkdir <name>, 2. cd <name>, 3. create files.`;
    
    const toolDef = {
        name: "executeCommand",
        description: "Executes a shell command.",
        parameters: {
            type: "OBJECT",
            properties: { command: { type: "STRING" } },
            required: ["command"]
        }
    };

    let history = []; // Context

    async function executeTool(command) {
        logger(`Executing: ${command}`);
        try {
            const { stdout, stderr } = await exec(command, { cwd: workDir });
            return stderr ? `Error: ${stderr}` : `Success: ${stdout}`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }

    let loops = 0;
    while (loops < 15) {
        let commandToRun = null;
        let toolResult = null;

        if (provider === 'deepseek') {
            // --- OPENROUTER (DEEPSEEK) ---
            const messages = [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt },
                ...history 
            ];

            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json", 
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": "https://codebulb.vscode",
                        "X-Title": "CodeBulb"
                    },
                    body: JSON.stringify({
                        model: "deepseek/deepseek-chat",
                        messages: messages,
                        tools: [{ type: "function", function: toolDef }]
                    })
                });

                const data = await response.json();
                
                if (data.error) throw new Error(data.error.message);
                if (!data.choices || data.choices.length === 0) throw new Error("No response from OpenRouter");

                const msg = data.choices[0].message;

                if (msg.tool_calls) {
                    const call = msg.tool_calls[0];
                    const args = JSON.parse(call.function.arguments);
                    commandToRun = args.command;
                    
                    history.push(msg); 
                    toolResult = await executeTool(commandToRun);
                    
                    history.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: toolResult
                    });
                } else {
                    logger(`DeepSeek: ${msg.content}`);
                    break;
                }
            } catch (err) {
                logger(`OpenRouter Error: ${err.message}`);
                break;
            }

        } else {
            // --- GEMINI LOGIC ---
            const { GoogleGenAI } = await import("@google/genai");
            const client = new GoogleGenAI({ apiKey });
            const geminiHistory = [{ role: "user", parts: [{ text: prompt }] }]; 

            const result = await client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: geminiHistory,
                config: { systemInstruction, tools: [{ functionDeclarations: [toolDef] }] }
            });

            const calls = result.response.functionCalls;
            if (calls && calls.length > 0) {
                const call = calls[0];
                commandToRun = call.args.command;
                toolResult = await executeTool(commandToRun);
                logger(`Gemini Output: ${toolResult.substring(0, 40)}...`);
            } else {
                logger(`Gemini: ${result.response.text()}`);
                break;
            }
        }
        loops++;
    }
    logger("✅ Process finished!");
}

module.exports = { buildWebsite };