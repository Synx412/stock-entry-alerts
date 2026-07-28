from __future__ import annotations

import argparse
import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import firebase_admin
import numpy as np
import pandas as pd
import yfinance as yf
from firebase_admin import credentials, firestore, messaging


@dataclass
class Analysis:
    ticker: str
    currency: str
    price: float
    daily_return: float
    score: float
    signal: str
    rsi: float
    distance50: float
    distance200: float
    drawdown52: float
    annual_volatility: float
    buy_zone_low: float
    buy_zone_high: float
    wait_for: str
    market_date: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "ticker": self.ticker,
            "currency": self.currency,
            "price": self.price,
            "dailyReturn": self.daily_return,
            "score": self.score,
            "signal": self.signal,
            "rsi": self.rsi,
            "distance50": self.distance50,
            "distance200": self.distance200,
            "drawdown52": self.drawdown52,
            "annualVolatility": self.annual_volatility,
            "buyZoneLow": self.buy_zone_low,
            "buyZoneHigh": self.buy_zone_high,
            "waitFor": self.wait_for,
            "marketDate": self.market_date,
            "scannedAt": firestore.SERVER_TIMESTAMP,
        }


def initialise_firebase() -> firestore.Client:
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

    if raw:
        info = json.loads(raw)
        cred = credentials.Certificate(info)
    elif path:
        cred = credentials.Certificate(path)
    else:
        raise RuntimeError(
            "Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."
        )

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


def normalise_history(frame: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if frame is None or frame.empty:
        raise ValueError("no price data returned")

    data = frame.copy()
    if isinstance(data.columns, pd.MultiIndex):
        level0 = data.columns.get_level_values(0)
        if "Close" in level0:
            data.columns = level0
        else:
            data.columns = data.columns.get_level_values(-1)

    required = ["Open", "High", "Low", "Close", "Volume"]
    missing = [column for column in required if column not in data.columns]
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")

    data = data[required].copy()
    for column in required:
        data[column] = pd.to_numeric(data[column], errors="coerce")

    data.index = pd.to_datetime(data.index, errors="coerce", utc=True)
    data = (
        data.replace([np.inf, -np.inf], np.nan)
        .dropna(subset=["Close"])
        .sort_index()
    )
    data = data[~data.index.duplicated(keep="last")]

    if len(data) < 220:
        raise ValueError(f"only {len(data)} valid daily rows")
    return data


def download_history(ticker: str, attempts: int = 3) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            frame = yf.download(
                ticker,
                period="2y",
                interval="1d",
                auto_adjust=True,
                actions=False,
                progress=False,
                threads=False,
                timeout=25,
            )
            return normalise_history(frame, ticker)
        except Exception as exc:
            last_error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{ticker}: {last_error}")


def rsi(close: pd.Series, window: int = 14) -> pd.Series:
    change = close.diff()
    gain = change.clip(lower=0)
    loss = -change.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()
    relative_strength = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + relative_strength))


def safe_return(close: pd.Series, sessions: int) -> float:
    if len(close) <= sessions or close.iloc[-sessions - 1] <= 0:
        return math.nan
    return float(close.iloc[-1] / close.iloc[-sessions - 1] - 1)


def currency_for(ticker: str, configured: str | None) -> str:
    if configured:
        return configured.upper()
    return "INR" if ticker.upper().endswith(".NS") else "USD"


def calculate_analysis(
    ticker: str,
    history: pd.DataFrame,
    mode: str,
    currency: str,
    min_score: float,
) -> Analysis:
    close = history["Close"].dropna()
    price = float(close.iloc[-1])
    previous = float(close.iloc[-2])
    daily_return = price / previous - 1

    ma20 = float(close.rolling(20).mean().iloc[-1])
    ma50 = float(close.rolling(50).mean().iloc[-1])
    ma200 = float(close.rolling(200).mean().iloc[-1])
    current_rsi = float(rsi(close, 14).iloc[-1])

    return_3m = safe_return(close, 63)
    return_6m = safe_return(close, 126)
    return_1y = safe_return(close, 252)

    annual_volatility = float(close.pct_change().dropna().tail(252).std(ddof=0) * np.sqrt(252))
    high52 = float(close.tail(252).max())
    drawdown52 = price / high52 - 1
    distance50 = price / ma50 - 1
    distance200 = price / ma200 - 1

    score = 0.0
    trend_scale = 1.0 if mode == "long-term" else 0.8

    score += (14 if price > ma200 else 0) * trend_scale
    score += (11 if ma50 > ma200 else 0) * trend_scale
    score += (8 if price > ma50 else 0) * trend_scale
    score += (7 if price > ma20 else 0) * trend_scale

    if 42 <= current_rsi <= 58:
        score += 15 if mode == "long-term" else 20
    elif 35 <= current_rsi < 42:
        score += 10 if mode == "long-term" else 14
    elif 58 < current_rsi <= 68:
        score += 8
    elif current_rsi > 72:
        score += 1
    elif current_rsi < 30:
        score += 2
    else:
        score += 5

    if -0.04 <= distance50 <= 0.05:
        score += 10 if mode == "long-term" else 14
    elif 0.05 < distance50 <= 0.12:
        score += 5

    if not math.isnan(return_3m):
        if 0.02 <= return_3m <= 0.20:
            score += 10
        elif return_3m > 0.20:
            score += 6
        elif 0 <= return_3m < 0.02:
            score += 5

    if not math.isnan(return_6m) and return_6m > 0:
        score += 5
    if not math.isnan(return_1y) and return_1y > 0:
        score += 5

    if annual_volatility < 0.22:
        score += 8
    elif annual_volatility < 0.35:
        score += 5
    elif annual_volatility < 0.50:
        score += 2

    if -0.20 <= drawdown52 <= -0.05:
        score += 8
    elif -0.05 < drawdown52 <= 0:
        score += 4
    elif -0.35 <= drawdown52 < -0.20:
        score += 4
    else:
        score += 1

    score += 4 if abs(daily_return) < 0.04 else 1
    score = float(np.clip(score, 0, 100))

    if score >= 78:
        signal = "Strong setup"
    elif score >= 68:
        signal = "Staggered-buy zone"
    elif score >= 58:
        signal = "Watch closely"
    elif score >= 45:
        signal = "Neutral"
    else:
        signal = "Weak setup"

    # The range is a technical reference area, not an intrinsic-value estimate.
    zone_centre = 0.60 * ma50 + 0.40 * ma20
    buy_zone_low = zone_centre * 0.97
    buy_zone_high = zone_centre * 1.03

    conditions: list[str] = []
    if score >= min_score:
        wait_for = (
            "Your score condition is met. Consider staggered entries rather than "
            "investing the full amount on one day."
        )
    else:
        if price < ma200:
            conditions.append(f"a daily close above the 200-day average near {ma200:.2f}")
        if current_rsi > 68:
            conditions.append("RSI to cool into roughly 45–60")
        elif current_rsi < 35:
            conditions.append("RSI to recover above roughly 40")
        if distance50 > 0.08:
            conditions.append(f"a pullback toward the 50-day average near {ma50:.2f}")
        elif distance50 < -0.08:
            conditions.append(f"price to recover toward the 50-day average near {ma50:.2f}")
        if not math.isnan(return_3m) and return_3m < 0:
            conditions.append("three-month momentum to turn positive")
        remaining = max(0.0, min_score - score)
        prefix = f"Score needs about {remaining:.0f} more points. "
        wait_for = prefix + (
            "Wait for " + "; or ".join(conditions[:3]) + "."
            if conditions
            else f"Watch the technical range {buy_zone_low:.2f}–{buy_zone_high:.2f}."
        )

    return Analysis(
        ticker=ticker,
        currency=currency,
        price=price,
        daily_return=daily_return,
        score=round(score, 1),
        signal=signal,
        rsi=round(current_rsi, 2),
        distance50=distance50,
        distance200=distance200,
        drawdown52=drawdown52,
        annual_volatility=annual_volatility,
        buy_zone_low=round(buy_zone_low, 2),
        buy_zone_high=round(buy_zone_high, 2),
        wait_for=wait_for,
        market_date=str(history.index[-1].date()),
    )


def notification_reason(
    item: dict[str, Any],
    analysis: Analysis,
    previous: dict[str, Any] | None,
) -> str | None:
    min_score = float(item.get("minScore", 68))
    max_buy_price = float(item.get("maxBuyPrice", 0) or 0)

    previous_score = float(previous.get("score", -1)) if previous else -1
    previous_price = float(previous.get("price", float("inf"))) if previous else float("inf")

    if analysis.score >= min_score and previous_score < min_score:
        return f"Entry score reached {analysis.score:.0f}/100"

    if (
        max_buy_price > 0
        and analysis.price <= max_buy_price
        and previous_price > max_buy_price
    ):
        return f"Price reached your limit of {max_buy_price:.2f}"

    return None


def send_notification(
    tokens: list[str],
    name: str,
    analysis: Analysis,
    reason: str,
) -> tuple[int, int]:
    if not tokens:
        return 0, 0

    message = messaging.MulticastMessage(
        tokens=tokens[:500],
        notification=messaging.Notification(
            title=f"{name}: {reason}",
            body=(
                f"{analysis.signal}. Price {analysis.price:.2f}; "
                f"score {analysis.score:.0f}/100. Open the app for conditions."
            ),
        ),
        data={
            "ticker": analysis.ticker,
            "score": str(analysis.score),
            "price": str(analysis.price),
            "marketDate": analysis.market_date,
        },
        webpush=messaging.WebpushConfig(
            fcm_options=messaging.WebpushFCMOptions(link="./")
        ),
    )
    response = messaging.send_each_for_multicast(message)
    return response.success_count, response.failure_count


def scan_user(
    db: firestore.Client,
    user_reference: firestore.DocumentReference,
    dry_run: bool,
) -> dict[str, int]:
    watch_docs = list(user_reference.collection("watchlist").stream())
    device_docs = list(user_reference.collection("devices").stream())
    tokens = [document.to_dict().get("token") for document in device_docs]
    tokens = [token for token in tokens if token]

    stats = {"analysed": 0, "notified": 0, "errors": 0}

    for watch_document in watch_docs:
        item = watch_document.to_dict()
        if item.get("enabled", True) is False:
            continue

        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue

        try:
            history = download_history(ticker)
            analysis = calculate_analysis(
                ticker=ticker,
                history=history,
                mode=str(item.get("mode", "long-term")),
                currency=currency_for(ticker, item.get("currency")),
                min_score=float(item.get("minScore", 68)),
            )

            analysis_reference = user_reference.collection("analysis").document(watch_document.id)
            previous_snapshot = analysis_reference.get()
            previous = previous_snapshot.to_dict() if previous_snapshot.exists else None
            reason = notification_reason(item, analysis, previous)

            notification_key = f"{analysis.market_date}:{reason}" if reason else None
            already_sent = (
                previous
                and notification_key
                and previous.get("lastNotificationKey") == notification_key
            )

            payload = analysis.as_dict()
            if previous and previous.get("lastNotificationKey"):
                payload["lastNotificationKey"] = previous["lastNotificationKey"]

            if reason and not already_sent:
                if dry_run:
                    print(f"DRY RUN notification {ticker}: {reason}")
                else:
                    success, failure = send_notification(
                        tokens=tokens,
                        name=str(item.get("name", ticker)),
                        analysis=analysis,
                        reason=reason,
                    )
                    print(f"{ticker}: notification success={success} failure={failure}")
                    if success:
                        payload["lastNotificationKey"] = notification_key
                        stats["notified"] += 1

            if dry_run:
                print(json.dumps(analysis.as_dict(), default=str, indent=2))
            else:
                analysis_reference.set(payload, merge=True)

            stats["analysed"] += 1

        except Exception as exc:
            stats["errors"] += 1
            print(f"ERROR {ticker}: {exc}")

    return stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = initialise_firebase()
    total = {"users": 0, "analysed": 0, "notified": 0, "errors": 0}

    for user_snapshot in db.collection("users").stream():
        total["users"] += 1
        stats = scan_user(db, user_snapshot.reference, args.dry_run)
        for key in ("analysed", "notified", "errors"):
            total[key] += stats[key]

    print("SUMMARY", json.dumps(total))
    return 1 if total["errors"] and not total["analysed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
