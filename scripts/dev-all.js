const { spawn, spawnSync } = require("child_process");

const targets = [
  { name: "app", script: "dev" },
  { name: "gateway", script: "gateway" },
  { name: "worker", script: "worker:round" },
];

const children = [];
let stopping = false;
let hadFailure = false;

function runPrismaGeneratePreflight() {
  const command = "npx prisma generate";
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
      windowsHide: false,
      env: process.env,
    })
    : spawnSync("npx", ["prisma", "generate"], {
      stdio: "inherit",
      env: process.env,
    });

  if (result.status !== 0) {
    console.error(`[dev:all] Preflight failed: ${command}`);
    process.exit(result.status || 1);
  }
}

function parsePort(localAddress) {
  if (!localAddress) return null;
  const lastColon = localAddress.lastIndexOf(":");
  if (lastColon < 0) return null;
  const rawPort = localAddress.slice(lastColon + 1);
  const port = Number(rawPort);
  return Number.isFinite(port) ? port : null;
}

function findListeningPidsOnPortWin(port) {
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) return [];

  const pids = new Set();
  const lines = result.stdout.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("TCP")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const localAddress = parts[1];
    const state = parts[3];
    const pidRaw = parts[4];
    if (state !== "LISTENING") continue;

    const parsedPort = parsePort(localAddress);
    if (parsedPort !== port) continue;

    const pid = Number(pidRaw);
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
    pids.add(pid);
  }

  return [...pids];
}

function killPidTreeWin(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
  });
}

function preflightReleasePorts() {
  if (process.platform !== "win32") return;
  if (process.env.DEV_ALL_SKIP_PORT_CLEANUP === "1") {
    console.log("[dev:all] Port cleanup skipped (DEV_ALL_SKIP_PORT_CLEANUP=1)");
    return;
  }

  const appPort = Number(process.env.PORT ?? 3000);
  const gatewayPort = Number(process.env.GATEWAY_PORT ?? process.env.NEXT_PUBLIC_GATEWAY_PORT ?? 8081);
  const ports = [appPort, gatewayPort].filter((port) => Number.isFinite(port) && port > 0);

  const seenPids = new Set();
  for (const port of ports) {
    const pids = findListeningPidsOnPortWin(port).filter((pid) => !seenPids.has(pid));
    if (pids.length === 0) continue;

    console.log(`[dev:all] Port ${port} is busy, stopping PID(s): ${pids.join(", ")}`);
    for (const pid of pids) {
      seenPids.add(pid);
      killPidTreeWin(pid);
    }
  }
}

function spawnTarget(target) {
  const child = process.platform === "win32"
    ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm run ${target.script}`], {
      stdio: "inherit",
      windowsHide: false,
      env: process.env,
    })
    : spawn("npm", ["run", target.script], {
      stdio: "inherit",
      env: process.env,
    });
  children.push(child);

  child.on("exit", (code, signal) => {
    const normalStop = stopping && (code === 0 || signal !== null);
    if (!normalStop && code !== 0) {
      hadFailure = true;
      console.error(`[dev:all] ${target.name} exited with code ${code}`);
      stopAll();
    }
    maybeExit();
  });

  child.on("error", (error) => {
    hadFailure = true;
    console.error(`[dev:all] failed to start ${target.name}: ${error.message}`);
    stopAll();
    maybeExit();
  });
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (!child.pid) continue;

    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      continue;
    }

    if (!child.killed) child.kill("SIGTERM");
  }
}

function maybeExit() {
  const alive = children.some((child) => child.exitCode === null && child.signalCode === null);
  if (!alive) process.exit(hadFailure ? 1 : 0);
}

process.on("SIGINT", () => {
  stopAll();
});

process.on("SIGTERM", () => {
  stopAll();
});

preflightReleasePorts();
runPrismaGeneratePreflight();

for (const target of targets) {
  spawnTarget(target);
}
