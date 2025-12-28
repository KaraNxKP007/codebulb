// @ts-nocheck
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function chatWithAI(prompt, apiKey, provider, logger) {
    const systemInstruction = "You are CodeBulb, a helpful coding assistant. Answer ONLY coding questions. Be concise.";

    if (provider === 'deepseek') {
        // --- OPENROUTER (DEEPSEEK) LOGIC ---
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": "https://codebulb.vscode",
                    "X-Title": "CodeBulb VS Code Extension"
                },
                body: JSON.stringify({
                    model: "deepseek/deepseek-chat",
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: prompt }
                    ],
                    stream: false
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
            const reply = data.choices[0].message.content;
            logger(reply);

        } catch (error) {
            logger(`OpenRouter Error: ${error.message}`);
        }

    } else {
        // --- GEMINI LOGIC (FIXED) ---
        try {
            const client = new GoogleGenerativeAI(apiKey);
            const model = client.getGenerativeModel({ 
                model: "gemini-2.5-flash",
                systemInstruction: systemInstruction 
            });
            
            const result = await model.generateContent(prompt);
            logger(result.response.text());
        } catch (error) {
            if (error.status === 429) {
                logger("⏳ Gemini is busy (429). Try switching to DeepSeek in the dropdown!");
            } else {
                logger(`Gemini Error: ${error.message}`);
            }
        }
    }
}

module.exports = { chatWithAI };