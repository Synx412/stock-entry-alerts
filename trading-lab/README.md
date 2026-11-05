# Mobile Trading Labs — Breaking Money + Day Trader Skills

This branch adds a **separate, opt-in development workspace** for two open-source projects:

- [Breaking Money — AI Trading Arena](https://github.com/akshaymshankar/Breaking_Money_Trading-Agent): NSE cash-market PAPER trading with a dashboard.
- [Day Trader Skill](https://github.com/Jakeschincariol/day-trader-skill): 11 US-stock Python tools and Claude skill definitions; the Python tools do not require Claude.

It does **not** modify the existing stock-entry-alerts application or deploy anything to markets. These are two independent projects stored under ignored local workspace directories. Original authors retain credit and licences.

## Start from your Android phone

1. On GitHub, open branch **setup/mobile-trading-labs** of Synx412/stock-entry-alerts.
2. Tap **Code > Codespaces > Create codespace on setup/mobile-trading-labs** (desktop-site mode in Chrome may be easier).
3. Codespaces uses the devcontainer configuration with Python 3.11 and automatically runs the setup script.
4. Open the terminal in the Codespace and run the commands below.

Codespaces is a cloud Linux machine, not a native Android app. Its availability, included quota and usage charges depend on your GitHub account. Codespaces may stop when idle; this is **not** reliable unattended live monitoring.

## Quick commands

Run these commands from the repository root, one at a time:

    bash trading-lab/test.sh
    bash trading-lab/launch.sh demo
    bash trading-lab/launch.sh gui
    bash trading-lab/launch.sh skills-test
    bash trading-lab/launch.sh skill-universe

The first four require no paid AI API. The fifth uses internet access to download the stock universe.

To see the GUI: run the gui command, open **Ports** in Codespaces, and open forwarded **8787**. Keep port 8787 **private**; the upstream dashboard does not have user authentication. On the GUI click **Run demo** first.

## Where the projects live

- trading-lab/workspace/Breaking_Money_Trading-Agent/
- trading-lab/workspace/day-trader-skill/
- trading-lab/.venv/ is the shared Python virtual environment.

These paths are excluded by the lab gitignore. Re-run the setup command if interrupted:

    bash trading-lab/setup.sh

## Run without Claude and without an API key

The starter configuration sets brain = "rules" in Breaking Money. The upstream engine checks simulated fills, position sizing and transaction costs and explicitly blocks real broker orders.

The US day-trading skill repository can run its command-line tools without Claude. For example:

    cd trading-lab/workspace/day-trader-skill
    ../../.venv/bin/python trader-scanner/scan.py universe

Its Python trading ticket is **not** connected to any broker here, and paper mode is kept on. To use SEC filing tools, edit that project's trader/config.json and supply your own valid sec_user_agent identifier.

## Optional GPT decisions in Breaking Money

OpenAI is **not** required for installation or either project's offline tests.

1. Create an API key in the OpenAI developer platform (this is separate from ChatGPT Plus).
2. In GitHub, create a **Codespaces secret** named OPENAI_API_KEY, grant it access to this repository, then restart the Codespace. Do not paste secrets into source files, commits, chat messages or the public branch.
3. Optional: set OPENAI_MODEL as a Codespaces secret to a model your API account supports (default: gpt-4.1-mini).
4. For a paid synthetic demo, run:

    bash trading-lab/launch.sh gpt-demo

This demo can make multiple paid API calls. To use GPT for market-data paper simulations, select **OpenAI GPT (API key)** in the dashboard's settings. The UI never submits real orders.

The adapter is installed by enable_openai.py. It uses structured JSON and rejects malformed symbols, duplicates, excessive allocations, and unreasonable stops/targets. The upstream trading engine remains responsible for final risk checks and PAPER fills. If an AI request fails, the upstream runner logs it and falls back to the rules strategy for that cycle.

Do not confuse GPT simulated decisions with validated profitable returns. Evaluate both systems on separate training/test time windows and after transaction costs.

## Testing, updates and privacy

- The test script verifies Python syntax, both upstream offline tests, an offline simulated run and adapter contract tests.
- The download step clones original public repositories. Review upstream commits before updating: this executes third-party code and installs third-party Python packages.
- Never add brokerage execution credentials. Breaking Money blocks real-order endpoints, but the 11-skills source includes a separate broker integration which should remain disconnected.
- OpenAI keys belong in Codespaces secrets/environment variables. This branch contains no credentials.
- You can delete the feature branch without changing the existing stock-entry-alerts main branch.

## Remaining actions

GitHub code access alone cannot start your Codespace, grant compute quota, create or read your API key, or confirm a test run in a GitHub-hosted environment. The files are prepared, but actual installation is complete only after setup and tests succeed in the Codespace.
