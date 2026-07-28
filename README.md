# Stock Entry Alerts — permanent installable PWA

This package is the permanent version of the stock-entry scanner.

It provides:

- an Android-installable Progressive Web App;
- anonymous user accounts;
- a saved watchlist;
- famous Indian/global ticker presets;
- score alerts;
- user-defined maximum-buy-price alerts;
- latest daily score, RSI, moving averages, volatility and drawdown;
- a technical buy-zone value;
- a clear “wait for these conditions” explanation when the alert is not ready;
- scheduled scans after Indian and US market hours;
- Firebase Cloud Messaging push notifications.

## Important limitation

The app does not know the exact future date when a stock should be bought.
It reports measurable trigger conditions: score threshold, user price limit,
moving-average recovery, pullback level and RSI range.

The calculated buy zone is a technical reference range. It is not an intrinsic
valuation and does not include company accounts, management quality, news or
future earnings.

## Architecture

- `public/`: installable PWA.
- `scanner/scanner.py`: daily market-data scanner.
- Cloud Firestore: watchlists and latest analyses.
- Firebase Authentication: anonymous user identity.
- Firebase Cloud Messaging: Android/browser notifications.
- GitHub Pages: permanent HTTPS app hosting.
- GitHub Actions: twice-daily scans.

## Deployment checklist

### 1. Create a Firebase project

In Firebase Console:

1. Create a project.
2. Add a **Web app**.
3. Enable **Authentication → Sign-in method → Anonymous**.
4. Create a **Cloud Firestore** database.
5. Open **Cloud Messaging → Web Push certificates** and generate a key pair.
6. Open **Project settings → Service accounts** and generate a private key.

Firebase web configuration values are identifiers, but the service-account JSON
is secret. Never put the service-account JSON in the repository.

### 2. Configure the frontend

Edit both:

- `public/firebase-config.js`
- `public/firebase-messaging-sw.js`

Replace every `REPLACE_*` value with the web-app configuration shown by
Firebase. Put the public Web Push VAPID key into `firebase-config.js`.

### 3. Create a GitHub repository

Upload all files in this folder to the repository. Keep the default branch
named `main`.

In **Settings → Secrets and variables → Actions**:

- Add a repository secret named `FIREBASE_SERVICE_ACCOUNT_JSON`.
  Paste the entire service-account JSON as the value.
- Add a repository variable named `FIREBASE_PROJECT_ID`.
  Set it to the Firebase project ID.

### 4. Enable GitHub Pages

Open **Settings → Pages** and select **GitHub Actions** as the source.

Open the repository’s **Actions** tab and run:

- `Deploy Firestore rules`
- `Deploy installable app`
- `Daily market scanner`

The Pages workflow displays the permanent HTTPS address.

### 5. Install on Android

1. Open the permanent Pages address in Chrome.
2. Tap the app’s **Install app** button or Chrome menu → **Install app**.
3. Open the installed app.
4. Tap **Enable notifications**.
5. Add tickers and alert conditions.

The GitHub Actions scanner then checks the watchlist after Indian and US market
hours and sends a notification only when a condition crosses into the alert
state.

## Ticker examples

| Asset | Ticker |
|---|---|
| Nifty 50 index | `^NSEI` |
| Nifty 50 ETF | `NIFTYBEES.NS` |
| Nifty Next 50 ETF | `JUNIORBEES.NS` |
| Nifty Midcap 150 ETF | `MID150BEES.NS` |
| Reliance | `RELIANCE.NS` |
| TCS | `TCS.NS` |
| HDFC Bank | `HDFCBANK.NS` |
| Apple | `AAPL` |
| Microsoft | `MSFT` |
| Nvidia | `NVDA` |
| S&P 500 ETF | `SPY` |
| Total World ETF | `VT` |

## Testing

```bash
pip install -r scanner/requirements.txt
pip install pytest
pytest -q scanner/test_scanner.py
```

## Data warning

The default scanner uses yfinance because it covers many Indian and global
symbols. It is convenient research data, not an exchange-grade live feed.
Daily values can be delayed, missing or revised.

## Security

The included Firestore rules restrict each browser identity to its own
watchlist, device tokens and analyses. The scanner uses the Firebase Admin SDK,
which must run only in GitHub Actions with the service-account secret.
