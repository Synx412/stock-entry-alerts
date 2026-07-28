import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd


MODULE_PATH = Path(__file__).with_name("scanner.py")
SPEC = importlib.util.spec_from_file_location("scanner_module", MODULE_PATH)

if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load scanner.py")

MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def synthetic_history(rows: int = 420) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2024-01-01", periods=rows, tz="UTC")
    returns = rng.normal(0.00045, 0.011, rows)
    close = 100 * np.exp(np.cumsum(returns))
    open_ = close * (1 + rng.normal(0, 0.002, rows))
    high = np.maximum(open_, close) * (1 + rng.uniform(0.001, 0.01, rows))
    low = np.minimum(open_, close) * (1 - rng.uniform(0.001, 0.01, rows))
    volume = rng.integers(100_000, 2_000_000, rows)
    return pd.DataFrame(
        {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume},
        index=dates,
    )


def test_score_range_and_conditions():
    analysis = MODULE.calculate_analysis(
        ticker="TEST.NS",
        history=synthetic_history(),
        mode="long-term",
        currency="INR",
        min_score=68,
    )
    assert 0 <= analysis.score <= 100
    assert analysis.buy_zone_low < analysis.buy_zone_high
    assert analysis.market_date
    assert analysis.wait_for


def test_notification_crossing():
    history = synthetic_history()
    analysis = MODULE.calculate_analysis(
        ticker="TEST.NS",
        history=history,
        mode="long-term",
        currency="INR",
        min_score=50,
    )
    reason = MODULE.notification_reason(
        {"minScore": 50, "maxBuyPrice": 0},
        analysis,
        {"score": 40, "price": analysis.price},
    )
    assert reason is not None
