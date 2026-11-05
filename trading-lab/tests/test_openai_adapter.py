"""Offline contract tests for the optional OpenAI adapter (no API calls)."""
import json
import os
import unittest
from unittest.mock import patch

from arena.config import load_config
from arena.openai_brain import OpenAIBrain


class AdapterContractTests(unittest.TestCase):
    def setUp(self):
        self.cfg = load_config()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "fake-unit-test-key"}):
            with patch("openai.OpenAI"):
                self.brain = OpenAIBrain(self.cfg)
        self.ctx = {"market": {"RELIANCE": {}}, "positions": [], "entries_allowed": True}
        self.valid = {
            "market_view": "Test only",
            "decisions": [{
                "symbol": "RELIANCE", "action": "BUY", "allocation_pct": 10,
                "confidence": 0.6, "stop_loss_pct": 1.5, "target_pct": 3,
                "reason": "Unit test only.",
            }],
        }

    def check(self, data):
        self.brain._call = lambda *args: json.dumps(data)
        return self.brain.decide(self.ctx)

    def test_good_buy(self):
        self.assertEqual(self.check(self.valid)["decisions"][0]["action"], "BUY")

    def test_unknown_ticker_rejected(self):
        invalid = json.loads(json.dumps(self.valid))
        invalid["decisions"][0]["symbol"] = "UNEXPECTED"
        with self.assertRaises(ValueError):
            self.check(invalid)

    def test_position_limit_rejected(self):
        invalid = json.loads(json.dumps(self.valid))
        invalid["decisions"][0]["allocation_pct"] = 100
        with self.assertRaises(ValueError):
            self.check(invalid)

    def test_invalid_stop_rejected(self):
        invalid = json.loads(json.dumps(self.valid))
        invalid["decisions"][0]["stop_loss_pct"] = 99
        with self.assertRaises(ValueError):
            self.check(invalid)


if __name__ == "__main__":
    unittest.main()
