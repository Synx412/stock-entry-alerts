#!/usr/bin/env bash
set -euo pipefail
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$LAB_DIR/workspace"
PY="$LAB_DIR/.venv/bin/python"
ARENA="$WORK/Breaking_Money_Trading-Agent"
DAY="$WORK/day-trader-skill"
if [ ! -x "$PY" ] || [ ! -d "$ARENA" ] || [ ! -d "$DAY" ]; then
  echo "Run bash trading-lab/setup.sh first."
  exit 1
fi
if [ "$#" -lt 1 ]; then set -- help; fi
case "$1" in
  demo)
    cd "$ARENA"
    exec "$PY" -m arena demo --days 2 --brain rules --no-open
    ;;
  gui)
    cd "$ARENA"
    exec "$PY" -m arena gui --port 8787 --no-open
    ;;
  gpt-demo)
    if [ -z "$(printenv OPENAI_API_KEY 2>/dev/null || true)" ]; then
      echo "Set OPENAI_API_KEY as a Codespaces secret before calling GPT."
      exit 1
    fi
    cd "$ARENA"
    exec "$PY" -m arena demo --days 1 --brain openai-api --no-open
    ;;
  skills-test)
    cd "$DAY"
    exec "$PY" -m unittest discover -s tests -v
    ;;
  skill-universe)
    cd "$DAY"
    exec "$PY" trader-scanner/scan.py universe
    ;;
  *)
    echo "Usage: bash trading-lab/launch.sh {demo|gui|gpt-demo|skills-test|skill-universe}"
    exit 2
    ;;
esac
