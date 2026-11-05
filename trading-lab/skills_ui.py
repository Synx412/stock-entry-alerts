"""Mobile control panel for the 11 independent Day Trader Python skills.

No Claude, broker connector, AI API or real-order path is used by this app.
The broker skill is exposed ONLY as a read-only ticket display.
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

LAB = Path(__file__).resolve().parent
WORK = LAB / "workspace" / "day-trader-skill"
PYTHON = LAB / ".venv" / "bin" / "python"
HTML = LAB / "skills_ui.html"
TIMEOUT = 120
MAX_BODY = 8192
MAX_OUTPUT = 60000

SCRIPTS = {
    "scanner": "trader-scanner/scan.py",
    "news": "trader-news/news.py",
    "entry": "trader-entry/entry.py",
    "exit": "trader-exit/exit.py",
    "time": "trader-timemachine/timemachine.py",
    "budget": "trader-budget/size.py",
    "risk": "trader-risk/check.py",
    "broker": "trader-broker/ticket.py",
    "alerts": "trader-alerts/alerts.py",
    "analyst": "trader-analyst/facts.py",
    "pelosi": "trader-pelosi/ptr.py",
}

ACTIONS = {
    "scan_daily": ("scanner", "Scan daily setups"),
    "scan_orb": ("scanner", "Scan opening-range breakouts"),
    "scan_universe": ("scanner", "Download US ticker universe"),
    "news": ("news", "Check headlines"),
    "entry": ("entry", "Check entry timing"),
    "exit": ("exit", "Create stop and target plan"),
    "time": ("time", "Simulate planned trade"),
    "budget": ("budget", "Size proposed trade"),
    "risk": ("risk", "Check proposed order risk"),
    "broker": ("broker", "View order tickets only"),
    "alerts_quote": ("alerts", "Check stock quote"),
    "alerts_add": ("alerts", "Add above-price alert"),
    "alerts_list": ("alerts", "List price alerts"),
    "alerts_check": ("alerts", "Check alerts now"),
    "analyst": ("analyst", "Read SEC financial facts"),
    "pelosi": ("pelosi", "Read congressional disclosure index"),
}
TICKER = re.compile(r"[A-Z][A-Z0-9.^-]{0,12}")


class InputError(ValueError):
    pass


def ticker(value: object) -> str:
    s = str(value or "").strip().upper()
    if not TICKER.fullmatch(s):
        raise InputError("Provide a valid US ticker such as AAPL, TSLA or BRK.B.")
    return s


def tickers(value: object) -> list[str]:
    raw = str(value or "AAPL,MSFT,TSLA")
    entries = raw.replace(" ", "").split(",")
    if not 1 <= len(entries) <= 10 or any(not item for item in entries):
        raise InputError("Provide 1–10 comma-separated stock tickers.")
    return list(dict.fromkeys(ticker(s) for s in entries))


def positive(value: object, label: str) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise InputError(label + " must be a positive number.") from None
    if not math.isfinite(f) or f <= 0 or f > 10000000:
        raise InputError(label + " must be between 0 and 10,000,000.")
    return f


def command(action: str, payload: dict) -> list[str]:
    """Return a fixed allow-listed argv vector. Never invoke through a shell."""
    if action not in ACTIONS:
        raise InputError("Unsupported action.")
    if not isinstance(payload, dict):
        raise InputError("Expected JSON object.")
    script = str(WORK / SCRIPTS[ACTIONS[action][0]])
    argv = [str(PYTHON), script]
    symbol = ticker(payload.get("symbol", "AAPL")) if action in {
        "news", "entry", "exit", "alerts_quote", "alerts_add", "analyst"
    } else None

    if action == "scan_universe":
        return argv + ["universe"]
    if action in ("scan_daily", "scan_orb"):
        symbols = ",".join(tickers(payload.get("symbols")))
        return argv + [("daily" if action == "scan_daily" else "orb"),
                       "--symbols", symbols, "--show", "20"]
    if action == "news":
        args = argv + ["--tickers", symbol, "--hours", "24", "--dry-run"]
        if not os.environ.get("SEC_USER_AGENT"):
            args += ["--no-sec"]
        return args
    if action == "entry":
        return argv + ["check", symbol, "--setup", "orb", "--write"]
    if action == "exit":
        entry = positive(payload.get("entry"), "Entry")
        stop = positive(payload.get("stop"), "Stop")
        if stop >= entry:
            raise InputError("For a long trade, stop must be below entry.")
        return argv + ["plan", "--symbol", symbol, "--entry", str(entry),
                       "--stop", "price:" + str(stop), "--target", "2R",
                       "--write"]
    if action == "time":
        if not (WORK / "trader" / "plan.json").is_file():
            raise InputError("Create an exit plan first (Step 4).")
        return argv + ["run", "--replays", "10000", "--write"]
    if action == "budget":
        if not (WORK / "trader" / "plan.json").is_file():
            raise InputError("Create an exit plan first (Step 4).")
        return argv + ["--write"]
    if action == "risk":
        if not (WORK / "trader" / "orders.json").is_file():
            raise InputError("Size a proposed trade first (Step 6).")
        return argv
    if action == "broker":
        if not (WORK / "trader" / "orders.json").is_file():
            raise InputError("Size a proposed trade first (Step 6).")
        return argv + ["show"]
    if action == "alerts_quote":
        return argv + ["quote", symbol, "--write"]
    if action == "alerts_add":
        threshold = positive(payload.get("threshold"), "Alert price")
        return argv + ["add", "--symbol", symbol, "--above", str(threshold)]
    if action == "alerts_list":
        return argv + ["list"]
    if action == "alerts_check":
        return argv + ["check"]
    if action == "analyst":
        if not os.environ.get("SEC_USER_AGENT"):
            raise InputError(
                "Set SEC_USER_AGENT in a Codespaces secret to your name and contact email "
                "to request SEC EDGAR data; then restart Codespaces."
            )
        return argv + [symbol, "--quarters", "6"]
    if action == "pelosi":
        return argv + ["index", "--member", "pelosi", "--limit", "12"]
    raise InputError("Unsupported action.")


def execute(action: str, payload: dict) -> dict:
    if not WORK.is_dir() or not PYTHON.is_file():
        raise InputError("Projects not installed. Run bash trading-lab/setup.sh in the terminal.")
    args = command(action, payload)
    # Never enable an order connector from this interface.
    if action == "broker":
        assert args[-1] == "show"
    try:
        p = subprocess.run(
            args, cwd=str(WORK), stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=TIMEOUT, check=False,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "exit_code": None, "output":
                "Tool exceeded 120 seconds and was stopped. Try fewer tickers or run directly in the terminal."}
    text = ((p.stdout or "") + ("\n" if p.stdout and p.stderr else "") + (p.stderr or ""))
    if not text.strip():
        text = "(No output. See exit code.)"
    return {
        "ok": p.returncode == 0,
        "exit_code": p.returncode,
        "output": text[:MAX_OUTPUT] + ("\n[Output truncated]" if len(text) > MAX_OUTPUT else ""),
    }


def status() -> dict:
    return {
        "installed": WORK.is_dir() and PYTHON.is_file(),
        "sec_configured": bool(os.environ.get("SEC_USER_AGENT")),
        "plan_ready": (WORK / "trader" / "plan.json").is_file(),
        "orders_ready": (WORK / "trader" / "orders.json").is_file(),
        "skills": len(SCRIPTS),
        "broker_enabled": False,
        "actions": list(ACTIONS),
    }


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, data: dict) -> None:
        self._reply(code, json.dumps(data).encode("utf-8"),
                    "application/json; charset=utf-8")

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._reply(200, HTML.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/api/status":
            self._json(200, status())
        else:
            self._json(404, {"error": "Not found."})

    def do_POST(self) -> None:
        if self.path != "/api/run":
            self._json(404, {"error": "Not found."})
            return
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if origin and urlsplit(origin).netloc.lower() != host.lower():
            self._json(403, {"error": "Cross-origin request rejected."})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            self._json(415, {"error": "JSON content required."})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= MAX_BODY:
                raise InputError("Request too large or empty.")
            payload = json.loads(self.rfile.read(n))
            if not isinstance(payload, dict):
                raise InputError("Expected JSON object.")
            action = payload.get("action")
            if not isinstance(action, str):
                raise InputError("Select a trading tool.")
            result = execute(action, payload)
            self._json(200, result)
        except (InputError, ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})
        except Exception:
            self._json(500, {"error": "Tool failed unexpectedly; inspect the local terminal."})


def main(argv=None) -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Mobile GUI for 11 Python day-trading research skills; no broker orders")
    ap.add_argument("--port", type=int, default=8788)
    args = ap.parse_args(argv)
    if not HTML.exists():
        raise SystemExit("Dashboard HTML missing.")
    if not WORK.is_dir():
        raise SystemExit("Run bash trading-lab/setup.sh first.")
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("11-skills dashboard listening on port %d (localhost only)." % args.port, flush=True)
    print("Open the private forwarded port from GitHub Codespaces; do not make it public.", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
