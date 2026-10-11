<div align="center">

  <h1 style="font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 4px;">
    M Y _ T A S K S
  </h1>

  <p>
    <em>A privacy-first, zero-latency task manager that lives entirely in your browser.</em>
  </p>

  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
    <img src="https://img.shields.io/badge/Storage-Local_Only-lightgrey?style=for-the-badge&logo=database&logoColor=black" />
  </p>

  <br/>

  <a href="#-quick-start"><strong>⚡ Quick Start</strong></a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#-features"><strong>✨ Features</strong></a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#-under-the-hood"><strong>🔧 Under the Hood</strong></a>

</div>

<br/>


### ✨ Features

We stripped away the bloat. No servers. No cloud syncing lag. Just you and your productivity.

| Feature | Description |
| :--- | :--- |
| **🎨 Dual Views** | Switch instantly between a standard **List View** and a Kanban-style **Board View** (Todo / Doing / Done). |
| **🔐 Local Auth** | A simulated authentication system that keeps user data compartmentalized in `localStorage`. |
| **💾 Data Sovereignty** | Your data never leaves your device. Export your tasks to **CSV** for backup, or Import them back in seconds. |
| **⚡ Zero Latency** | Built with Vanilla JS. No frameworks, no loading spinners, no API wait times. |

---

### 🔧 Under the Hood

This project is a masterclass in **Vanilla JavaScript** state management.

#### 1. The "Serverless" Database
Instead of a backend database, we utilize the browser's `localStorage` as a persistent data store.
* **User Data:** Stored as JSON strings keyed by user email (e.g., `tasks_user@example.com`).
* **Session Management:** The app checks for a `currentUser` object on load. If missing, it guards the route and redirects to `auth_page.html`.

#### 2. CSV Import/Export Engine
The application includes a custom parser to handle data portability.
```javascript
// From script.js
escapeCSV(text) {
    return text.replace(/"/g, '""'); // Handles escaped quotes automatically
}
```
Quick Start
Since this is a client-side only application, deployment is instant.

Clone the Repo

Bash
git clone [https://github.com/yourusername/my-tasks.git]([https://github.com/yourusername/my-tasks.git](https://github.com/Soham-o/Task_Manager.git))
Launch
Simply double-click index.html to open it in your browser.

Note: The app will automatically redirect you to auth_page.html if you aren't logged in.

Create an Account

Use any email/password (Data is stored locally on your machine).

Start adding tasks!

📂 Project Structure

Plaintext
.
├── auth_page.html      # Login & Signup interface

├── index.html          # Main Task Dashboard (List & Board views)

├── script.js           # Core logic (Auth guard, CRUD operations, CSV handling)

└── styles.css          # Custom styling (Protest Guerrilla font, Responsive grid)

<div align="center">
<sub>Built with Vanilla JS • No Frameworks Required</sub>
</div>
