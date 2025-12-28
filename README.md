# ⚡ CodeBulb - AI Pilot for VS Code

> **Slogan:** *Bhai Code Karle* (Brother, let's code!)

CodeBulb is a powerful VS Code extension that turns your editor into an AI-powered coding assistant. It features a **Dual Engine** architecture, allowing you to switch between **Google Gemini 2.5** and **DeepSeek V3** (via OpenRouter) seamlessly.


## 🚀 Features

### 1. 💬 Chat Assistant
Ask coding doubts directly in the sidebar. CodeBulb provides concise, code-focused answers.
* **Dual Mode:** Switch between Gemini (Free) and DeepSeek (No Rate Limits) instantly.
* **Context Aware:** Knows it's a coding assistant and refuses non-coding topics.

### 2. 🔨 Website Builder
Describe a website (e.g., *"Create a portfolio with a dark theme and contact form"*), and CodeBulb will:
* Create the project folder.
* Generate `index.html`, `style.css`, and `script.js`.
* Write professional, modern code automatically.

### 3. 🚑 Code Doctor
Have a bug? Point CodeBulb to a folder, and it will:
* Scan your files.
* Identify errors and security risks.
* **Fix the code automatically** in place.

---

## 🛠️ Installation

### Option 1: Install via VSIX (Manual)
1.  Download the latest `.vsix` file from the [Releases](https://github.com/KaranNxKP007/codebulb/releases) page.
2.  Open VS Code.
3.  Go to **Extensions** > **... (Menu)** > **Install from VSIX**.
4.  Select the downloaded file.

### Option 2: Run from Source
1.  Clone the repository:
    ```bash
    git clone [https://github.com/KaraNxKP007/codebulb.git](https://github.com/KaraNxKP007/codebulb.git)
    ```
2.  Install dependencies:
    ```bash
    cd codebulb
    npm install
    ```
3.  Press **F5** to launch the Extension Debugger.

---

## 🔑 Setup & Privacy

**Your API Keys are Safe.**
CodeBulb does **not** store your API keys in the cloud. They are saved locally on your machine using VS Code's secure `SecretStorage`.

1.  Click the **CodeBulb Icon** in the Activity Bar.
2.  Paste your **Gemini API Key** (Get it from [Google AI Studio](https://aistudio.google.com/)).
3.  (Optional) Paste your **DeepSeek/OpenRouter Key** (Get it from [OpenRouter](https://openrouter.ai/)).
4.  Click **Save Keys**.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](https://choosealicense.com/licenses/mit/)