import io
import json
import unittest
from datetime import date
from unittest.mock import patch

from tools.download_bars import close_time, collect


class HistoricalReplayTests(unittest.TestCase):
    def test_converts_bar_open_to_close_and_filters_session(self):
        self.assertEqual(close_time("2025-09-22T13:30:00Z", 5), "2025-09-22T13:35:00Z")
        self.assertEqual(close_time("2025-12-01T14:30:00Z", 5), "2025-12-01T14:35:00Z")
        self.assertIsNone(close_time("2025-09-22T13:25:00Z", 5))
        self.assertIsNone(close_time("2025-09-22T20:00:00Z", 5))

    def test_pagination_retains_only_shared_bars_in_time_order(self):
        def bar(at):
            return dict(t="2025-09-22T" + at + ":00Z", o=10, h=12, l=9, c=11, v=400)

        pages = [
            {"bars": {"AAPL": [bar("13:30"), bar("13:35"), bar("13:40")]}, "next_page_token": "next"},
            {"bars": {"MSFT": [bar("13:30"), bar("13:40")]}, "next_page_token": None},
        ]
        with patch("tools.download_bars.urlopen", side_effect=[io.BytesIO(json.dumps(p).encode()) for p in pages]) as fetch:
            rows = list(collect(["AAPL", "MSFT"], date(2025, 9, 22), date(2025, 9, 22), 5, {}))
        self.assertEqual([r[:2] for r in rows], [
            ["2025-09-22T13:35:00Z", "AAPL"], ["2025-09-22T13:35:00Z", "MSFT"],
            ["2025-09-22T13:45:00Z", "AAPL"], ["2025-09-22T13:45:00Z", "MSFT"],
        ])
        self.assertIn("page_token=next", fetch.call_args.args[0].full_url)
