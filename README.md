# Eleven Desk

A mobile-friendly US-equity paper trading platform. A fresh account starts with $100,000 in simulated cash. Advance market time yourself, review orders before submitting them, and inspect fills and portfolio performance after each bar.

## Start the desk

From the repository root, run the following with Python 3.

    python3 -m http.server 8788 --directory dist

Open http://localhost:8788 in a modern browser. In GitHub Codespaces, run the same command and open forwarded port 8788. The browser application has no install or build step.

Select a ticker on **Trade desk**, enter a whole-share quantity, choose **Review paper order**, and confirm. Choose **Next bar** to see the fill, then open **Portfolio**. The history can be exported as CSV.

## Market data and fills

- **Synthetic replay** contains five simulated sessions for AAPL, NVDA, MSFT, AMZN, GOOGL and TSLA. Each bar spans five minutes. The opening screen includes 36 observed bars.
- **Market data → Import** accepts historical USD OHLCV in CSV. Each row contains a bar-close timestamp with a UTC offset. The app aligns tickers on matching timestamps and rejects duplicates and inconsistent prices. A new import starts a separate, fresh account after confirmation. Use **Download CSV example** to inspect the format.
- **Paper execution** uses the next bar’s open, 5 basis points of adverse slippage and a $1 fee per filled order. Orders are filled in submission order. Pending buys reserve estimated cash and pending sells reserve shares. An unaffordable opening gap rejects the order. The broker supports long positions and cash, with immediate simulated settlement.
- **Portfolio** uses weighted-average cost including purchase fees, and marks positions at the visible closing price. Open positions stay open at the end of a replay.
- The account and current replay are saved in IndexedDB on the device and browser used. Concurrent tabs serialize account changes. Clearing site data removes the local account. Alerts are checked as the replay advances.

CSV example with prices in dollars and volume in shares:

    timestamp,symbol,open,high,low,close,volume
    2025-09-22T13:35:00Z,AAPL,100.00,101.00,99.00,100.50,10000
    2025-09-22T13:40:00Z,AAPL,100.55,101.50,100.25,101.00,12000

An import supports up to 20 tickers, 20,000 data rows and 2 MiB. Imported files are processed on the device. Multi-symbol imports require a common clock.

### Download historical IEX bars

The optional Python 3.9+ helper reads historical US stock prices from Alpaca’s market-data API. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in your shell or Codespaces secrets. Keep downloaded data outside the source tree. The browser itself uses no credentials.

    python3 tools/download_bars.py --symbols AAPL,MSFT --start 2025-09-22 --end 2025-09-26 --out /tmp/replay.csv

Import the resulting CSV under **Market data**. The helper requests raw IEX bars, converts provider opening timestamps to bar-close timestamps, and keeps shared weekday bars within 09:30–16:00 Eastern. The time filter does not model early exchange closes. Data access depends on the provider account. [Alpaca historical bars](https://docs.alpaca.markets/us/reference/stockbars)

## The eleven tools

| Tool | What it does |
| --- | --- |
| Chart scanner | Ranks replay tickers by performance since the visible session open. |
| News monitor | Filters a dated archive of publisher announcements and links to the originals. |
| Entry timer | Checks a breakout against the prior three bars, a five-bar average and session VWAP estimated from typical bar prices. |
| Exit planner | Computes a long-position target from entry, stop and a reward-to-risk multiple. |
| Time machine | Bootstraps 10,000 price paths from up to 252 visible intraday returns and reports ending-price percentiles. |
| Risk manager | Shows exposure, largest position, equity weights and cash available. |
| Budget manager | Calculates whole-share size from a risk budget, stop distance, trading costs and buying power. |
| Paper broker | Reviews, reserves, fills and cancels simulated orders. |
| Price alerts | Tracks one-time close-price thresholds on the replay clock. |
| Earnings analyst | Compares historical revenue, growth and diluted EPS with links to the issuer releases. |
| Pelosi tracker | Filters a selection of disclosed spouse transactions by ticker and links to the original House filing. |

News, earnings and disclosures are a curated historical archive. Dated records become visible on the following calendar day so an unknown publication time cannot reveal future information. Imported market prices and archived disclosures have independent sources.

## Verify

    node --test tests/desk.test.mjs
    python3 -m unittest discover -s tests -p 'test_*.py'

The engine tests use Node.js 22+ and the provider tests use recorded response shapes. All tests run offline. The platform uses rule-based analytics and a local simulated broker.
