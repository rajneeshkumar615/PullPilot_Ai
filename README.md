# PullPilot AI

**AI Pull Request Engineer** — an autonomous agent that understands a repository, plans a change, generates a patch, validates it, and opens a pull request automatically.

PullPilot AI connects to a GitHub repository and walks through a structured pipeline instead of a single black-box call, so every change is traceable from context to code.

---

## How it works

```
Repository Understanding → Planning → Patch Generation → Validation → Pull Request Automation
```

1. **Repository Understanding** — Clones/reads the target repo and builds context around its structure, dependencies, and relevant files.
2. **Planning** — Breaks the requested change into a concrete plan of what needs to be modified and why.
3. **Patch Generation** — Uses the Gemini API with structured prompts to generate the actual code changes.
4. **Validation** — Runs checks (linting, structural/AST validation, basic tests where available) on the generated patch before it goes any further.
5. **Pull Request Automation** — Opens a pull request on GitHub with the generated patch, a summary of the change, and the reasoning behind it.

---

## Tech Stack

- **Frontend:** React.js, TypeScript
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **AI:** Gemini API
- **Integrations:** GitHub API

---

## Prerequisites

- Node.js (v18 or later)
- npm or yarn
- MongoDB (local instance or a connection URI, e.g. MongoDB Atlas)
- A GitHub Personal Access Token (repo scope) for the account/repo you want PullPilot to act on
- A Gemini API key

---

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rajneeshkumar615/PullPilot_Ai.git
   cd PullPilot_Ai
   ```

2. **Install dependencies**

   Backend:
   ```bash
   cd server
   npm install
   ```

   Frontend:
   ```bash
   cd ../client
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file inside `server/`:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   GITHUB_TOKEN=your_github_personal_access_token
   JWT_SECRET=your_jwt_secret
   ```

   Create a `.env` file inside `client/` (if the frontend needs its own API base URL):
   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```

4. **Run the backend**
   ```bash
   cd server
   npm run dev
   ```

5. **Run the frontend**
   ```bash
   cd client
   npm run dev
   ```

6. Open the app in your browser at `http://localhost:5173` (or whichever port Vite/React assigns).

---

## Usage

1. Connect a GitHub repository by providing its URL and (if private) an access token.
2. Describe the change you want, or point PullPilot at an existing issue.
3. PullPilot walks through **Understanding → Planning → Patch Generation → Validation**, showing progress at each stage.
4. Review the generated patch and diff in the dashboard.
5. Approve to let PullPilot open the pull request automatically, or export the patch manually.

---

## Project Structure (rough)

```
PullPilot_Ai/
├── client/          # React + TypeScript frontend
├── server/          # Node.js + Express backend
│   ├── routes/
│   ├── controllers/
│   ├── services/    # GitHub API + Gemini API orchestration
│   └── models/      # MongoDB schemas
└── README.md
```

---

## Roadmap

- [ ] Multi-file patch generation across larger diffs
- [ ] Configurable validation rules per repository
- [ ] Support for GitLab/Bitbucket in addition to GitHub
- [ ] CI integration for automated test runs before PR creation

---

## License

MIT
