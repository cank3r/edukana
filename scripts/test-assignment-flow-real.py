"""Run real Next + PostgreSQL with a fresh, loopback-only synthetic database.

Requires Node 22, PostgreSQL binaries and Playwright Chromium (Chrome on Windows).
Set ASSIGNMENT_FLOW_NODE / ASSIGNMENT_FLOW_PG_BIN to installed executable locations,
ASSIGNMENT_FLOW_OUTPUT to a new evidence directory. --skip-build uses an existing build.
No deployed environments, dotenv files, storage services or email providers are loaded.
"""
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time

repo = Path(__file__).resolve().parents[1]
if any((repo / name).exists() for name in (".env", ".env.local", ".env.production", ".env.production.local")):
    raise RuntimeError("Refusing to start Next where dotenv files could load deployed credentials. Use a clean checkout.")
output = Path(os.environ["ASSIGNMENT_FLOW_OUTPUT"]).resolve()
output.mkdir(parents=True, exist_ok=False)
node = os.environ.get("ASSIGNMENT_FLOW_NODE", shutil.which("node"))
pg = Path(os.environ.get("ASSIGNMENT_FLOW_PG_BIN", "C:/Program Files/PostgreSQL/17/bin"))
suffix = ".exe" if os.name == "nt" else ""
flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
env = {k: v for k, v in os.environ.items() if k.upper() in {
    "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "COMSPEC",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
}}
env.update({"NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1", "AUTH_TRUST_HOST": "true",
            "AUTH_SECRET": "assignment-local-only-auth-secret", "ASSIGNMENT_FLOW_OUTPUT": str(output),
            "LOCAL_STORAGE_ROOT": str(output / "storage"), "LOCAL_STORAGE_SECRET": "assignment-local-only-storage-secret-2026"})
env["PATH"] = str(Path(node).parent) + os.pathsep + env.get("PATH", "")
test_password = "assignment-disposable-local-only"
pgproc = server = None
handles = []

def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def run(name, args, timeout=180, extra=None):
    result = subprocess.run([str(x) for x in args], cwd=repo, env=extra or env,
                            capture_output=True, text=True, encoding="utf8", errors="replace", timeout=timeout, **flags)
    log = re.sub(r"postgres(?:ql)?://[^\s\"']+", "[local database URL]", result.stdout + result.stderr)
    (output / (name + ".log")).write_text(log, encoding="utf8")
    print(name + ": " + str(result.returncode), flush=True)
    if result.returncode:
        print(log[-6000:], flush=True)
        raise RuntimeError(name + " failed; inspect local evidence")

def start(name, args):
    handle = open(output / (name + ".log"), "w", encoding="utf8")
    handles.append(handle)
    return subprocess.Popen([str(x) for x in args], cwd=repo, env=env, stdout=handle, stderr=subprocess.STDOUT, **flags)

def waitport(value, process):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError("Local process exited before readiness")
        try:
            with socket.create_connection(("127.0.0.1", value), .3):
                return
        except OSError:
            time.sleep(.2)
    raise RuntimeError("Local readiness timed out")

data = output / "pg-data"
pw = output / "synthetic-password.txt"
try:
    pw.write_text(test_password, encoding="utf8")
    run("initdb", [pg / ("initdb" + suffix), "-D", data, "-U", "assignment_test", "--auth=scram-sha-256", "--pwfile=" + str(pw), "--encoding=UTF8", "--no-locale"])
    pw.unlink()
    pgport, appport = port(), port()
    pgproc = start("postgres", [pg / ("postgres" + suffix), "-D", data, "-h", "127.0.0.1", "-p", pgport])
    waitport(pgport, pgproc)
    run("createdb", [pg / ("createdb" + suffix), "-h", "127.0.0.1", "-p", pgport, "-U", "assignment_test", "edukana_assignment_test"], extra={**env, "PGPASSWORD": test_password})
    url = f"postgresql://assignment_test:{test_password}@127.0.0.1:{pgport}/edukana_assignment_test"
    base = f"http://127.0.0.1:{appport}"
    env.update({"DATABASE_URL": url, "DIRECT_URL": url, "AUTH_URL": base, "APP_URL": base, "ASSIGNMENT_FLOW_BASE_URL": base})
    run("migrate-existing", [node, "node_modules/prisma/build/index.js", "migrate", "deploy"])
    if "--skip-build" not in sys.argv:
        run("build", [node, "node_modules/next/dist/bin/next", "build", "--webpack"], timeout=900)
    server = start("next", [node, "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", appport])
    waitport(appport, server)
    (output / "environment.json").write_text(json.dumps({
        "database": "fresh loopback-only PostgreSQL", "baseURL": base,
        "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "node": subprocess.check_output([node, "--version"], text=True).strip(),
        "existingBuild": "--skip-build" in sys.argv,
    }, indent=2), encoding="utf8")
    run("playwright", [node, "node_modules/@playwright/test/cli.js", "test", "--config", "playwright.assignment-flow-real.config.ts", *[arg for arg in sys.argv[1:] if arg != "--skip-build"]], timeout=900)
finally:
    if pw.exists():
        pw.unlink()
    if server:
        server.terminate()
        try:
            server.wait(10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
    if pgproc:
        subprocess.run([str(pg / ("pg_ctl" + suffix)), "-D", str(data), "-m", "fast", "stop"], env=env, capture_output=True, timeout=15, **flags)
        if pgproc.poll() is None:
            pgproc.terminate()
        pgproc.wait(10)
    for handle in handles:
        handle.close()
    print("Isolated application and database stopped.", flush=True)
