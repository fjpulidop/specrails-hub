# Workflows

Common tasks in specrails-hub.

---

## 1. Implement a feature or fix

**Prerequisites:** Hub running, project registered, specrails-core installed.

### From the dashboard

1. Select your project in the sidebar.
2. On Home, click **+ Add Spec** and describe the work.
3. Drag the spec into a Rail and click **Play**.
4. Watch logs stream in the **Jobs** page.

### From the CLI

```bash
cd ~/repos/my-app
specrails-hub implement "#42"
```

Or target a project by name from anywhere:

```bash
specrails-hub --project my-app implement "#42"
```

---

## 2. Add a project

**From the dashboard:**

1. Click **+** (add project) in the sidebar.
2. Enter the absolute path to the project directory.
3. Click **Add**.

If specrails-core is not installed, the setup wizard runs automatically (installs specrails-core and configures agents via `/setup`).

**From the CLI:**

```bash
specrails-hub add /path/to/your/project
specrails-hub list    # verify
```

---

## 3. Remove a project

```bash
specrails-hub list                     # get the project ID
specrails-hub remove <project-id>
```

Or hover over a project in the sidebar and click the **×** button (confirm prompt appears).

This unregisters the project from the hub. It does not delete the project directory or its specrails-core installation.

---

## 4. Implement with OpenSpec

Use when you have a well-defined change and want full artifact tracking.

```bash
cd ~/repos/my-app

# 1. Define the change
specrails-hub /opsx:new

# 2. Generate all artifacts at once
specrails-hub /opsx:ff

# 3. Implement
specrails-hub /opsx:apply

# 4. Verify and archive
specrails-hub /opsx:verify
specrails-hub /opsx:archive
```

See [OpenSpec Workflow](openspec-workflow.md) for the full command reference.

---

## 5. Monitor jobs

Open **Jobs** in the project top bar. Each job shows:
- Status (queued / running / completed / failed)
- Command and start time
- Real-time log stream (click to open)
- Duration, cost, exit code

---

## 6. Set a budget

Go to **Project Settings → Budget**.

- **Daily budget** — hub pauses the queue when the 24h rolling spend exceeds this.
- **Per-job alert** — sends a notification when a single job exceeds the threshold.

Leave blank to disable either limit.
