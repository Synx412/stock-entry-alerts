#!/usr/bin/env bash
set -euo pipefail
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$LAB_DIR/workspace"
PYTHON_BIN=python3

"$PYTHON_BIN" -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ required"'
command -v git >/dev/null || { echo "Git is required"; exit 1; }
mkdir -p "$WORK"

if [ ! -d "$WORK/Breaking_Money_Trading-Agent/.git" ]; then
  git clone --depth 1 https://github.com/akshaymshankar/Breaking_Money_Trading-Agent.git "$WORK/Breaking_Money_Trading-Agent"
fi
if [ ! -d "$WORK/day-trader-skill/.git" ]; then
  git clone --depth 1 https://github.com/Jakeschincariol/day-trader-skill.git "$WORK/day-trader-skill"
fi

if [ ! -f "$LAB_DIR/.venv/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$LAB_DIR/.venv"
fi
PY="$LAB_DIR/.venv/bin/python"
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$WORK/Breaking_Money_Trading-Agent/requirements.txt" 'openai>=1.50,<3'

ARENA="$WORK/Breaking_Money_Trading-Agent"
if [ ! -f "$ARENA/.env" ]; then cp "$ARENA/.env.example" "$ARENA/.env"; fi

DAY="$WORK/day-trader-skill"
mkdir -p "$DAY/trader"
if [ ! -f "$DAY/trader/config.json" ]; then
  cp "$DAY/trader-budget/config.example.json" "$DAY/trader/config.json"
fi

"$PY" "$LAB_DIR/enable_openai.py"
printf '\n--- Installed versions ---\n'
git -C "$ARENA" rev-parse --short HEAD
git -C "$DAY" rev-parse --short HEAD
printf '\nSetup complete. To run the free simulation:\n  bash trading-lab/launch.sh demo\n'
printf 'To test both projects:\n  bash trading-lab/test.sh\n'
