# Workflows

Step-by-step guides for the most common tasks in specrails-hub.

---

## 1. Implement a new feature

Use this workflow when you want to implement a GitHub issue or a new feature from scratch.

**Prerequisites:** Hub running, project registered, project has specrails-core installed.

### Steps

1. **Open the dashboard** at `http://127.0.0.1:4200`
2. **Select your project** from the project switcher in the top navigation
3. **Start the implementation** — two options:
   - **From the UI:** Click **New Change** → `opsx:ff` to fast-forward through artifact creation → the hub automatically queues the implementation job
   - **From the CLI:** Run from inside your project directory:
     ```bash
     specrails-hub implement "#42"
     ```
4. **Monitor the pipeline** — the Dashboard tab shows the active phase in real-time:
   ```
   Architect → Developer → Reviewer → Ship
   ```
5. **Watch logs** — the log panel streams Claude's output as it runs. Each phase transition is highlighted.
6. **Review results** — when all phases complete, the job entry in the Jobs tab shows the final exit code, duration, and token cost.

---

## 2. Batch implementation (multiple issues)

Use this when you have several independent issues to implement in parallel.

### Steps

1. **From the CLI**, run:
   ```bash
   specrails-hub batch-implement "#40" "#41" "#43"
   ```
   Or use the shorthand verb:
   ```bash
   specrails-hub batch-implement #40 #41 #43
   ```
2. The hub creates one job per issue and runs them concurrently (subject to system resources).
3. **Monitor all jobs** in the Dashboard tab — each job shows its own phase indicator and log stream.
4. The Jobs tab lists each job individually with its own status and cost.

---

## 3. Review and approve a Change

Use this after a Developer phase completes, to verify the implementation matches the spec before archiving.

### Steps

1. Ensure you are inside the project directory in your terminal.
2. **Verify** the change:
   ```bash
   specrails-hub /opsx:verify
   ```
   The Reviewer agent checks that the implementation matches all change artifacts.
3. **Resolve any blockers** flagged by the Reviewer — these appear in the log stream and in the chat panel.
4. Once verification passes, **archive** the change:
   ```bash
   specrails-hub /opsx:archive
   ```
   This moves the change to the archived state and marks it complete.

---

## 4. Use the Chat panel

The Chat panel lets you talk to Claude in the context of the active project — useful for asking questions about the codebase, debugging, or planning.

### Steps

1. Click **Chat** in the project sidebar.
2. Type your message and press Enter.
3. Claude responds with the project directory as its working context.

**Available slash commands in chat:**

| Command | What it does |
|---------|--------------|
| `/sr:implement #42` | Start an implementation job for issue #42 |
| `/sr:why` | Explain what specrails is doing |
| `/sr:health-check` | Run a codebase health check |
| `/opsx:ff` | Fast-forward through artifact creation |
| `/opsx:verify` | Verify the current change |
| `/opsx:archive` | Archive the current change |

---

## 5. Add a new project

Use this when registering a new codebase with the hub.

### Steps

**Option A: From the dashboard**

1. Click **Add Project** in the top navigation bar.
2. Enter the absolute path to your project (e.g., `/Users/you/projects/my-app`).
3. Click **Add**.

If specrails-core is not yet installed in that project, the **Setup Wizard** launches automatically:
- Phase 1: Confirm the project path
- Phase 2: The hub proposes running `npx specrails-core`
- Phase 3: Installation runs with a live log stream
- Phase 4: A setup chat with Claude (`/setup`) configures the project
- Phase 5: Summary — the project is ready

**Option B: From the CLI**

```bash
specrails-hub add /path/to/your/project
```

Verify it was added:

```bash
specrails-hub list
```

---

## 6. Remove a project

1. Get the project ID:
   ```bash
   specrails-hub list
   ```
2. Remove it:
   ```bash
   specrails-hub remove <project-id>
   ```

This unregisters the project from the hub. It does **not** delete the project directory or its specrails-core installation.
