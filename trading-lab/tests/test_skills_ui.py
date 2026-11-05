"""Mobile skills dashboard: offline unit and HTTP contract tests."""
import json
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import skills_ui as ui


class TestCommands(unittest.TestCase):
    def test_all_eleven_skills_have_action(self):
        self.assertEqual(len(ui.SCRIPTS), 11)
        self.assertEqual(set(ui.SCRIPTS), {ui.ACTIONS[a][0] for a in ui.ACTIONS})
        self.assertEqual(ui.status()["broker_enabled"], False)

    def test_daily_scanner_restricts_symbols(self):
        cmd = ui.command("scan_daily", {"symbols": "AAPL, MSFT,AAPL"})
        self.assertEqual(cmd[-4:], ["--symbols", "AAPL,MSFT", "--show", "20"])

    def test_bad_symbol_cannot_inject_shell(self):
        with self.assertRaises(ui.InputError):
            ui.command("entry", {"symbol": "AAPL; rm -rf /"})
        with self.assertRaises(ui.InputError):
            ui.command("scan_daily", {"symbols": "TSLA,$HOME"})
        with self.assertRaises(ui.InputError):
            ui.command("other", {})
        with self.assertRaises(ui.InputError):
            ui.command("scan_daily", {"symbols": ",".join(["AAPL"] * 12)})

    def test_exit_plan_requires_user_supplied_stop(self):
        data = {"symbol": "TSLA", "entry": 200, "stop": 195}
        cmd = ui.command("exit", data)
        self.assertIn("price:195.0", cmd)
        self.assertEqual(cmd[-3:], ["--target", "2R", "--write"])
        data["stop"] = 201
        with self.assertRaises(ui.InputError):
            ui.command("exit", data)

    def test_broker_only_allows_show(self):
        with patch.object(ui.Path, "is_file", return_value=True):
            self.assertEqual(ui.command("broker", {})[-1], "show")
        self.assertNotIn("broker_approve", ui.ACTIONS)
        self.assertNotIn("broker_fill", ui.ACTIONS)

    def test_news_defaults_without_sec_identity(self):
        with patch.dict(ui.os.environ, {}, clear=True):
            self.assertIn("--no-sec", ui.command("news", {"symbol": "NVDA"}))
        with patch.dict(ui.os.environ, {"SEC_USER_AGENT": "Jane Doe jane@example.com"}):
            self.assertNotIn("--no-sec", ui.command("news", {"symbol": "NVDA"}))

    def test_analyst_requires_sec_agent(self):
        with patch.dict(ui.os.environ, {}, clear=True):
            with self.assertRaises(ui.InputError):
                ui.command("analyst", {"symbol": "AAPL"})

    def test_execute_uses_allowlisted_program_no_shell(self):
        done = SimpleNamespace(returncode=0, stdout="test result", stderr="")
        with patch.object(ui.subprocess, "run", return_value=done) as runner:
            result = ui.execute("news", {"symbol": "AAPL"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["output"], "test result")
        kwargs = runner.call_args.kwargs
        self.assertNotIn("shell", kwargs)
        self.assertTrue(kwargs["capture_output"])
        self.assertEqual(kwargs["timeout"], 120)
        self.assertTrue(runner.call_args.args[0][1].endswith("trader-news/news.py"))


class TestHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ui.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:" + str(cls.server.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def test_dashboard_loads(self):
        with urlopen(self.url + "/", timeout=5) as result:
            page = result.read().decode()
        self.assertIn("Day Trader", page)
        self.assertIn("Time Machine", page)
        self.assertIn("Broker ticket viewer", page)

    def test_status_json(self):
        with urlopen(self.url + "/api/status", timeout=5) as result:
            payload = json.load(result)
        self.assertEqual(payload["skills"], 11)
        self.assertFalse(payload["broker_enabled"])

    def test_rejects_unsupported_action(self):
        body = json.dumps({"action": "execute_live_trade"}).encode()
        req = Request(self.url + "/api/run", data=body,
                      headers={"Content-Type": "application/json"}, method="POST")
        with self.assertRaises(HTTPError) as exc:
            urlopen(req, timeout=5)
        self.assertEqual(exc.exception.code, 400)

    def test_rejects_cross_origin(self):
        body = json.dumps({"action": "alerts_list"}).encode()
        req = Request(self.url + "/api/run", data=body,
                      headers={"Content-Type": "application/json",
                               "Origin": "https://evil.example"}, method="POST")
        with self.assertRaises(HTTPError) as exc:
            urlopen(req, timeout=5)
        self.assertEqual(exc.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
