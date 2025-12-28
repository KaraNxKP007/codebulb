// @ts-nocheck
const fs = require('fs');
const path = require('path');
const util = require('util');
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

// Promisify FS functions
const writeFileAsync = util.promisify(fs.writeFile);
const mkdirAsync = util.promisify(fs.mkdir);

async function buildWebsite(prompt, apiKey, workDir, provider, logger) {
    // 1. ADVANCED SYSTEM PROMPT
    const systemInstruction = `You are CodeBulb Builder, an expert Full-Stack Architect.
    
    YOUR PROCESS:
    1. PLAN: First, think about the file structure needed for the user's request.
    2. EXECUTE: Create every single file required. Do not leave any file as "placeholder".
    3. COMPLETE: Ensure HTML links to CSS/JS correctly.

    CRITICAL RULES:
    - Use 'executeAction' tool to create files/folders.
    - To create a FOLDER, use command="mkdir foldername".
    - To create a FILE, use filePath="path/to/file.ext" and content="...".
    - ALWAYS create index.html, style.css, and script.js (if interactive).
    - WRITE FULL CODE. No comments like "// rest of code here".`;

    // 2. TOOL DEFINITION
    const toolDef = {
        name: "executeAction",
        description: "Create folders or write files.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                command: { type: SchemaType.STRING, description: "Use ONLY for 'mkdir foldername'" },
                content: { type: SchemaType.STRING, description: "The full code content" },
                filePath: { type: SchemaType.STRING, description: "Relative path (e.g., 'style.css')" }
            },
            required: []
        }
    };

    // 3. EXECUTION TOOL
    async function executeTool(args) {
        try {
            if (args.content && args.filePath) {
                // Prevent directory traversal attacks
                if (args.filePath.includes('..')) return "Error: Invalid path.";
                
                const fullPath = path.join(workDir, args.filePath);
                const dir = path.dirname(fullPath);

                if (!fs.existsSync(dir)) await mkdirAsync(dir, { recursive: true });
                
                await writeFileAsync(fullPath, args.content);
                return `Success: Created ${args.filePath}`;

            } else if (args.command && args.command.startsWith("mkdir")) {
                const folderName = args.command.replace("mkdir", "").trim();
                const fullPath = path.join(workDir, folderName);
                await mkdirAsync(fullPath, { recursive: true });
                return `Success: Folder '${folderName}' created.`;
            }
            return "Error: Invalid action.";
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }

    // 4. MAIN AGENT LOOP
    let loops = 0;
    let history = []; 

    while (loops < 20) { // Increased loop limit for complex sites
        try {
            if (provider === 'deepseek') {
                // --- DEEPSEEK LOGIC ---
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

                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json", 
                        "Authorization": `Bearer ${apiKey}`,
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
                        if (args.filePath) logger(`Creating: ${args.filePath}`);
                        else if (args.command) logger(`Action: ${args.command}`);
                        
                        const result = await executeTool(args);
                        history.push({ role: "tool", tool_call_id: call.id, content: result });
                    }
                } else {
                    logger(`💡 ${msg.content}`);
                    break;
                }

            } else {
                // --- GEMINI LOGIC ---
                const client = new GoogleGenerativeAI(apiKey);
                const model = client.getGenerativeModel({ 
                    model: "gemini-2.5-flash",
                    tools: [{ functionDeclarations: [toolDef] }]
                });

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
                        const args = call.args;
                        if (args.filePath) logger(`Creating: ${args.filePath}`);
                        else if (args.command) logger(`Action: ${args.command}`);

                        const toolResult = await executeTool(args);
                        
                        // Send Result back to Gemini
                        await history.sendMessage([{
                            functionResponse: {
                                name: call.name,
                                response: { result: toolResult }
                            }
                        }]);
                    }
                } else {
                    logger(`💡 ${response.text()}`);
                    break;
                }
            }
        } catch (err) {
            logger(`Error: ${err.message}`);
            break;
        }
        loops++;
    }
    logger("✅ Website build finished!");
}

module.exports = { buildWebsite };