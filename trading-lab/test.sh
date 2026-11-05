#!/usr/bin/env bash
set -euo pipefail
LAB_DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$LAB_DIR/.venv/bin/python"
WORK="$LAB_DIR/workspace"
"$PY" -m py_compile "$LAB_DIR/openai_brain.py" "$LAB_DIR/enable_openai.py" "$LAB_DIR/skills_ui.py"
(
  cd "$WORK/Breaking_Money_Trading-Agent"
  "$PY" -m unittest discover -s tests -v
  "$PY" -m unittest discover -s "$LAB_DIR/tests" -v
  "$PY" -m arena demo --days 1 --brain rules --no-open
)
(
  # Upstream has a repository-layout test that rejects the local trader/
  # settings folder. Test the pristine tracked tree without touching user data.
  CLEAN="$(mktemp -d)"
  trap 'rm -rf "$CLEAN"' EXIT
  git -C "$WORK/day-trader-skill" archive HEAD | tar -x -C "$CLEAN"
  cd "$CLEAN"
  "$PY" -m unittest discover -s tests -v
)
echo "Both offline test suites and paper-only demo completed."
