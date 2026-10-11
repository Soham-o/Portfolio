<div align="center">
  
  <img src="https://via.placeholder.com/1200x300/0E1117/00FFFF?text=VoterOS:+The+Civic+Journey+Engine" alt="VoterOS Banner">

  <h1>🗳️ VoterOS</h1>
  <p><b>The Civic Journey Engine</b></p>
  <p><em>"Elections are not failing due to a lack of systems, but due to a lack of clarity."</em></p>

  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini"></a>
  <a href="https://cloud.google.com/run"><img src="https://img.shields.io/badge/Google_Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Google Cloud Run"></a>
  <a href="https://streamlit.io/"><img src="https://img.shields.io/badge/Streamlit-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white" alt="Streamlit"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python_3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a>

  <br>

  **[Live Demo on Cloud Run](#) • [Watch the Pitch Video](#) • [Read the Docs](#)**

</div>

---

## 🎯 The Vision
**VoterOS** is an interactive, AI-powered system designed to demystify the electoral process. It shifts civic engagement from reactive searching to **proactive orchestration**. By combining a predictive rules engine with **Google Gemini’s** natural language reasoning, VoterOS provides every citizen with a personalized, visual, and highly actionable voting roadmap.

> **Hackathon Alignment:** We built an assistant that doesn't just answer questions, but helps users *understand* the election process, timelines, and steps through an interactive, visual, and easy-to-follow dashboard.

---

## 🛑 Why VoterOS is NOT a Chatbot

Standard AI chatbots fail in civic tech because they rely on the user to know what to ask. VoterOS flips the script:

| Feature | Standard Chatbot | VoterOS 🚀 |
| :--- | :--- | :--- |
| **Interaction Flow** | Waits for the user to ask the right question | **Proactively guides** the user to ensure critical steps aren't missed |
| **Data Delivery** | Pastes links to heavy FAQ PDFs | Distills rules into **decision support** (e.g., "Submit Form 8") |
| **Learning Style** | Relies on walls of text | Uses **visual learning** (progress bars, traffic curves, checklists) |

---

## ✨ Core Features

### 🧪 1. The Scenario Simulator ("What if...?")
The standout feature. Users can test edge cases in a safe, visual environment:
* 📉 **"What if I miss the registration deadline?"** → Explains immediate disqualification.
* ⏰ **"What if I go at 10 AM?"** → Triggers peak-hour congestion warnings & suggests alternatives.
* 🪪 **"What if I lost my EPIC card?"** → Highlights alternative verification paths without resetting progress.

### 🧠 2. Hybrid AI Copilot (Gemini-Powered)
A conversational interface that feels human but acts systematically. It parses user intent, cross-references it with electoral rules, and guides the user forward.

### 🚇 3. Dynamic Voting Timeline
A visual flowchart (Subway Map) that maps the user's journey. It highlights the current step and visually branches when alternative paths (like Form 8 for relocation) are required.

### 📊 4. Voter Readiness & Confidence Engine
A real-time progress metric (0-100%). The system explicitly flags missing requirements (e.g., *Address Verification Pending*) and provides the immediate next action.

### 📑 5. Smart Form Recommender & ID Builder
Dynamically advises users on the exact documentation needed. Automatically detects if a user requires **Form 6** (New Voter), **Form 8** (Relocation), or **Form 6A** (Overseas Indian).

### 📈 6. Crowd Prediction Engine
A predictive bimodal curve highlighting anticipated peak wait times at the polling booth, recommending personalized "Green Zone" voting windows.

---

## 🏗️ System Architecture

VoterOS utilizes a **Hybrid Intelligence Architecture** to guarantee enterprise-grade stability during critical civic events.

```mermaid
graph TD;
    A[User Input] --> B[Streamlit UI];
    B --> C{Hybrid Engine};
    C -->|State & Routing| D[Rule-Based Python Engine];
    C -->|Natural Conversation| E[Google Gemini Pro API];
    D --> F[Visual Dashboard Update];
    E --> G[Chat Copilot Update];
```
Rule-Based Decision Engine (llm_logic.py): Acts as the "Safety Net." It strictly governs state updates (Progress, Milestones, Forms) to ensure the UI never hallucinates or crashes due to LLM unpredictability.

Google Vertex AI / Gemini Integration: Acts as the "Voice." It ingests the structured system context and generates natural, empathetic, and highly clear user-facing responses.

Streamlit Frontend: A highly modular, responsive dashboard utilizing custom HTML/CSS for premium visual components.

🔍 Sample Use Cases
📍 The Relocation Scenario

User: "I just moved to a new city."

VoterOS: Detects the constituency mismatch. Halts the standard timeline. Triggers an "Alternate Path Activated" alert. Instructs the user to submit Form 8 before attempting to vote.

🪪 The Missing Document Scenario

User: "I don't have my Voter ID."

VoterOS: Blocks the Readiness Score from reaching 100%. Generates a visual warning and lists approved alternative IDs (Aadhaar, Passport, PAN) required for the Presiding Officer.

🛠️ Quick Start (Run Locally)
Prerequisites: Python 3.9+ and a Google Gemini API Key.

1. Clone the repository:

Bash
git clone [https://github.com/yourusername/voter_os_project.git](https://github.com/yourusername/voter_os_project.git)
cd voter_os_project
2. Install dependencies:

Bash
pip install -r requirements.txt
3. Configure API Keys:
Create a .streamlit/secrets.toml file in the root directory and add your Gemini key:

Ini, TOML
GEMINI_API_KEY = "your_actual_api_key_here"
4. Run the application:

Bash
streamlit run main.py
☁️ Deployment
VoterOS is containerized and deployed via Google Cloud Run for high availability and scalable performance during high-traffic election cycles.

[(See Dockerfile for containerization specifics).](https://voteros-app-805910938723.asia-south1.run.app/)
