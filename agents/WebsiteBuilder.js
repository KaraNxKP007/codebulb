// @ts-nocheck
const fs = require('fs');
const path = require('path');
const util = require('util');
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// Promisify FS functions for cleaner async/await usage
const writeFileAsync = util.promisify(fs.writeFile);
const mkdirAsync = util.promisify(fs.mkdir);

async function buildWebsite(prompt, apiKey, workDir, provider, logger) {
    const systemInstruction = `You are CodeBulb Builder. 
    YOUR GOAL: Build a website by creating files and folders.
    
    CRITICAL RULES:
    1. To create a FOLDER, use the tool with 'command' = 'mkdir foldername'.
    2. To create a FILE, use the tool with 'filePath' and 'content'.
    3. Do NOT use shell commands to write files (like 'echo'). Use the 'content' parameter.
    4. Ensure all code is complete and working.`;

    // --- TOOL DEFINITION (Cross-Platform) ---
    // We combine command execution and file writing into one robust tool
    const toolDef = {
        name: "executeAction",
        description: "Create folders or write files.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                command: { type: SchemaType.STRING, description: "Use ONLY for 'mkdir foldername'" },
                content: { type: SchemaType.STRING, description: "The full code/text to write to the file" },
                filePath: { type: SchemaType.STRING, description: "Relative path (e.g., 'public/index.html')" }
            },
            required: []
        }
    };

    // --- EXECUTION LOGIC ---
    async function executeTool(args) {
        try {
            if (args.content && args.filePath) {
                // === SAFE FILE WRITING (Works on Windows & Mac) ===
                const fullPath = path.join(workDir, args.filePath);
                const dir = path.dirname(fullPath);

                // Ensure folder exists first
                if (!fs.existsSync(dir)) {
                    await mkdirAsync(dir, { recursive: true });
                }

                await writeFileAsync(fullPath, args.content);
                return `Success: File created at ${args.filePath}`;

            } else if (args.command) {
                // === SAFE FOLDER CREATION ===
                // We handle mkdir manually to avoid Windows shell syntax issues
                if (args.command.startsWith("mkdir")) {
                    const folderName = args.command.replace("mkdir", "").trim();
                    const fullPath = path.join(workDir, folderName);
                    await mkdirAsync(fullPath, { recursive: true });
                    return `Success: Folder '${folderName}' created.`;
                }
                return "Error: Only 'mkdir' commands are allowed.";
            }
            return "Error: Invalid tool usage.";
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }

    // --- AGENT LOOP ---
    let loops = 0;
    let history = []; 

    while (loops < 15) {
        if (provider === 'deepseek') {
            // --- DEEPSEEK (OPENROUTER) LOGIC ---
            // (Standard fetch logic adapted for the new tool structure)
            const deepSeekToolDef = {
                name: "executeAction",
                description: "Create folders or write files.",
                parameters: {
                    type: "object",
                    properties: {
                        command: { type: "string" },
                        content: { type: "string" },
                        filePath: { type: "string" }
                    }
                }
            };

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
                        messages: [{ role: "system", content: systemInstruction }, { role: "user", content: prompt }, ...history],
                        tools: [{ type: "function", function: deepSeekToolDef }]
                    })
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                
                const msg = data.choices[0].message;
                if (msg.tool_calls) {
                    history.push(msg);
                    for (const call of msg.tool_calls) {
                        const args = JSON.parse(call.function.arguments);
                        
                        // LOGGING
                        if (args.filePath) logger(`Creating file: ${args.filePath}`);
                        else if (args.command) logger(`Action: ${args.command}`);

                        const result = await executeTool(args);
                        history.push({ role: "tool", tool_call_id: call.id, content: result });
                    }
                } else {
                    logger(`DeepSeek: ${msg.content}`);
                    break;
                }
            } catch (err) {
                logger(`DeepSeek Error: ${err.message}`);
                break;
            }

        } else {
            // --- GEMINI LOGIC (STABLE SDK) ---
            try {
                const client = new GoogleGenerativeAI(apiKey);
                const model = client.getGenerativeModel({ 
                    model: "gemini-2.5-flash",
                    tools: [{ functionDeclarations: [toolDef] }]
                });

                // Initialize chat if first loop
                if (loops === 0) {
                     history = model.startChat({
                        history: [{ role: "user", parts: [{ text: systemInstruction + "\n\nREQ: " + prompt }] }]
                    });
                }

                const result = await history.sendMessage("Proceed.");
                const response = result.response;
                const calls = response.functionCalls();

                if (calls && calls.length > 0) {
                    for (const call of calls) {
                        const args = /** @type {any} */ (call.args);
                        
                        // LOGGING
                        if (args.filePath) logger(`Gemini Creating: ${args.filePath}`);
                        else if (args.command) logger(`Gemini Action: ${args.command}`);

                        const toolResult = await executeTool(args);
                        
                        // Send result back
                        await history.sendMessage([{
                            functionResponse: {
                                name: call.name,
                                response: { result: toolResult }
                            }
                        }]);
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
    logger("✅ Website build finished!");
}

module.exports = { buildWebsite };