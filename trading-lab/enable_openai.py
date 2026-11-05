"""Install optional OpenAI backend into a fresh upstream Breaking Money clone.

Patch deliberately touches only brain selection, CLI choices, and GUI labels.
The original paper-only trading engine and broker-network blocks are untouched.
Re-running is idempotent. New upstream versions fail loudly on changed anchors.
"""
from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ARENA = ROOT / "workspace" / "Breaking_Money_Trading-Agent"


def replace_once(path: Path, before: str, after: str) -> None:
    src = path.read_text(encoding="utf-8")
    if after in src:
        return
    if before not in src:
        raise RuntimeError(f"Upstream changed; expected text missing in {path}. Review the patch.")
    path.write_text(src.replace(before, after), encoding="utf-8")


def main() -> None:
    if not (ARENA / "arena" / "brain.py").exists():
        raise SystemExit("Breaking Money not cloned. Run setup.sh first.")

    shutil.copyfile(ROOT / "openai_brain.py", ARENA / "arena" / "openai_brain.py")

    brain = ARENA / "arena" / "brain.py"
    old = '    return {"claude-api": ClaudeAPIBrain, "claude-cli": ClaudeCLIBrain, "rules": RulesBrain}[name](cfg)'
    new = ('    if name == "openai-api":\n'
           '        from .openai_brain import OpenAIBrain\n'
           '        return OpenAIBrain(cfg)\n' + old)
    replace_once(brain, old, new)

    cli = ARENA / "arena" / "__main__.py"
    replace_once(cli,
        'choices=["auto", "claude-api", "claude-cli", "rules"]',
        'choices=["auto", "claude-api", "claude-cli", "openai-api", "rules"]')
    replace_once(cli,
        'choices=["claude-api", "claude-cli"]',
        'choices=["claude-api", "claude-cli", "openai-api"]')

    gui = ARENA / "arena" / "gui.py"
    replace_once(gui,
        '("auto", "claude-cli", "claude-api", "rules")',
        '("auto", "claude-cli", "claude-api", "openai-api", "rules")')
    replace_once(gui,
        '<option value="claude-api">Claude (API key)</option>',
        '<option value="claude-api">Claude (API key)</option><option value="openai-api">OpenAI GPT (API key)</option>')
    replace_once(gui,
        '"claude-api":"Claude (API key)","rules":"Rules strategy (no AI)"',
        '"claude-api":"Claude (API key)","openai-api":"OpenAI GPT (API key)","rules":"Rules strategy (no AI)"')
    replace_once(gui, 'Strategy notes for Claude', 'Strategy notes for AI')

    cfg = ARENA / "config.toml"
    if 'brain = "auto"' in cfg.read_text(encoding="utf-8"):
        replace_once(cfg, 'brain = "auto"', 'brain = "rules"')
    else:
        print("Preserved existing trading brain setting.")

    print("OpenAI backend installed. Default remains rules (free, no model API calls).")


if __name__ == "__main__":
    main()
