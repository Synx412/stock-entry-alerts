"""Export historical Alpaca IEX bars as a local Eleven Desk replay file."""

import argparse
import csv
import json
import os
import re
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
ENDPOINT = "https://data.alpaca.markets/v2/stocks/bars"


def close_time(value, minutes):
    opened = datetime.fromisoformat(value.replace("Z", "+00:00"))
    local = opened.astimezone(EASTERN)
    closed = local + timedelta(minutes=minutes)
    if local.weekday() >= 5 or local.time() < time(9, 30) or closed.time() > time(16):
        return None
    return closed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def collect(symbols, start, end, minutes, headers):
    opening = datetime.combine(start, time(9, 30), EASTERN)
    closing = datetime.combine(end, time(16), EASTERN)
    params = dict(symbols=",".join(symbols), timeframe=f"{minutes}Min",
                  start=opening.isoformat(), end=closing.isoformat(),
                  adjustment="raw", feed="iex", sort="asc", limit=10000)
    bars = {symbol: {} for symbol in symbols}
    seen_tokens = set()
    while True:
        request = Request(ENDPOINT + "?" + urlencode(params), headers=headers)
        with urlopen(request, timeout=30) as response:
            page = json.load(response)
        for symbol, entries in page["bars"].items():
            for item in entries:
                timestamp = close_time(item["t"], minutes)
                if timestamp:
                    bars[symbol][timestamp] = [item[k] for k in ("o", "h", "l", "c", "v")]
        token = page.get("next_page_token")
        if not token:
            break
        if token in seen_tokens:
            raise ValueError("The market data provider repeated a page token.")
        seen_tokens.add(token)
        params["page_token"] = token
    common = sorted(set.intersection(*(set(values) for values in bars.values())))
    if len(common) < 2:
        raise ValueError("Fewer than two shared bars. Try a liquid single ticker or a different date.")
    if len(common) * len(symbols) > 20000:
        raise ValueError("Over 20,000 data rows. Request fewer days or instruments.")
    for timestamp in common:
        for symbol in symbols:
            yield [timestamp, symbol, *bars[symbol][timestamp]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", required=True, help="Comma-separated US equity symbols")
    parser.add_argument("--start", type=date.fromisoformat, required=True, metavar="YYYY-MM-DD")
    parser.add_argument("--end", type=date.fromisoformat, required=True, metavar="YYYY-MM-DD")
    parser.add_argument("--minutes", type=int, choices=(1, 5, 15, 30), default=5)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    symbols = list(dict.fromkeys(s.strip().upper() for s in args.symbols.split(",")))
    if not 1 <= len(symbols) <= 20 or any(not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,9}", s) for s in symbols):
        parser.error("Supply 1–20 US ticker symbols.")
    if args.start > args.end or args.end - args.start > timedelta(days=31):
        parser.error("Select a range of up to 32 calendar days.")
    key = os.getenv("APCA_API_KEY_ID")
    secret = os.getenv("APCA_API_SECRET_KEY")
    if not key or not secret:
        parser.error("Set APCA_API_KEY_ID and APCA_API_SECRET_KEY for historical market data.")
    temp = None
    try:
        headers = {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, "Accept": "application/json"}
        rows = list(collect(symbols, args.start, args.end, args.minutes, headers))
        with NamedTemporaryFile(mode="w", newline="", dir=args.out.parent, delete=False) as output:
            temp = Path(output.name)
            writer = csv.writer(output)
            writer.writerow(["timestamp", "symbol", "open", "high", "low", "close", "volume"])
            writer.writerows(rows)
        temp.replace(args.out)
        print(f"Wrote {len(rows)} rows to {args.out}")
    except HTTPError as exc:
        sys.exit(f"Market data returned HTTP {exc.code}. Check your IEX data access and date range.")
    except (URLError, OSError, ValueError, KeyError) as exc:
        sys.exit(f"Could not export the replay: {exc}")
    finally:
        if temp:
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
