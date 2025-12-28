// @ts-nocheck
const fs = require('fs');
const path = require('path');

async function fixCode(prompt, apiKey, workDir, provider, logger) {
    logger(`Starting Code Doctor (${provider}) in: ${workDir}`);

    const listFilesRecursively = (dir) => {
        let results = [];
        try {
            const list = fs.readdirSync(dir);
            list.forEach(file => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (!fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('.vscode')) {
                        results = results.concat(listFilesRecursively(fullPath));
                    }
                } else {
                    if (file.match(/\.(js|ts|html|css|jsx|py|sql|json|md)$/)) results.push(fullPath);
                }
            });
        } catch (error) { return []; }
        return results;
    };

    const executeFsTool = (name, args) => {
        try {
            if (name === 'list_files') {
                const files = listFilesRecursively(workDir);
                return JSON.stringify(files.slice(0, 50)); 
            } 
            else if (name === 'read_file') {
                if (!fs.existsSync(args.file_path)) return "Error: File not found";
                return fs.readFileSync(args.file_path, 'utf-8');
            } 
            else if (name === 'write_file') {
                fs.writeFileSync(args.file_path, args.content, 'utf-8');
                return "Success: File written.";
            }
        } catch (e) { return `Error: ${e.message}`; }
    };

    const deepSeekTools = [
        { type: "function", function: { name: "list_files", description: "List files", parameters: { type: "object", properties: {} } } },
        { type: "function", function: { name: "read_file", description: "Read file", parameters: { type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"] } } },
        { type: "function", function: { name: "write_file", description: "Write file", parameters: { type: "object", properties: { file_path: { type: "string" }, content: { type: "string" } }, required: ["file_path", "content"] } } }
    ];

    const geminiTools = [{
        functionDeclarations: [
            { name: "list_files", description: "List files", parameters: { type: "OBJECT", properties: {} } },
            { name: "read_file", description: "Read file", parameters: { type: "OBJECT", properties: { file_path: { type: "STRING" } }, required: ["file_path"] } },
            { name: "write_file", description: "Write file", parameters: { type: "OBJECT", properties: { file_path: { type: "STRING" }, content: { type: "STRING" } }, required: ["file_path", "content"] } }
        ]
    }];

    const systemInstruction = `You are an Expert Code Fixer. List files, read suspicious ones, then fix bugs.`;
    let loops = 0;
    const history = []; 
    const geminiHistory = [{ role: "user", parts: [{ text: `Fix code in: ${workDir}. ${prompt}` }] }];

    while (loops < 15) {
        if (provider === 'deepseek') {
            // --- OPENROUTER (DEEPSEEK) ---
            const messages = [
                { role: "system", content: systemInstruction },
                { role: "user", content: `Fix code in: ${workDir}. ${prompt}` },
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
                        tools: deepSeekTools
                    })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);

                const msg = data.choices[0].message;
                
                if (msg.tool_calls) {
                    history.push(msg); 

                    for (const tool of msg.tool_calls) {
                        logger(`DeepSeek Action: ${tool.function.name}`);
                        const args = JSON.parse(tool.function.arguments);
                        const toolResult = executeFsTool(tool.function.name, args);
                        logger(`Result: ${toolResult.substring(0, 40)}...`);

                        history.push({ role: "tool", tool_call_id: tool.id, content: toolResult });
                    }
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
            try {
                const { GoogleGenAI } = await import("@google/genai");
                const client = new GoogleGenAI({ apiKey });

                const result = await client.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: geminiHistory,
                    config: { systemInstruction, tools: geminiTools }
                });

                const response = result.response;
                const calls = response.functionCalls;

                if (calls && calls.length > 0) {
                    for (const call of calls) {
                        logger(`Gemini Action: ${call.name}`);
                        const toolResult = executeFsTool(call.name, call.args);
                        geminiHistory.push({ role: "model", parts: [{ functionCall: call }] });
                        geminiHistory.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { result: toolResult } } }] });
                    }
                } else {
                    logger(`Gemini: ${response.text()}`);
                    break;
                }
            } catch (err) {
                logger(`Gemini Error: ${err.message}`);
                break;
            }
        }
        loops++;
    }
    logger("✅ Fixer session finished.");
}

module.exports = { fixCode };