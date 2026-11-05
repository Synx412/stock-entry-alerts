"""Optional OpenAI trading brain for Breaking Money (simulation only).

This adapter never submits orders. It produces proposed decisions that the
upstream paper engine validates and simulates. API use incurs separate charges.
"""
from __future__ import annotations

import json
import math
import os

from .brain import DECISION_SCHEMA, build_prompt


class OpenAIBrain:
    name = "openai-api"

    def __init__(self, cfg: dict):
        from openai import OpenAI

        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("OPENAI_API_KEY is missing. Use paper rules or add a Codespaces secret.")
        self.client = OpenAI(api_key=key, timeout=60, max_retries=1)
        self.cfg = cfg
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
        self.usage = {"input_tokens": 0, "output_tokens": 0}

    def _call(self, system: str, user: str, schema: dict | None = None) -> str:
        args = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if schema is not None:
            args["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "paper_trade_decisions", "strict": True, "schema": schema},
            }
        response = self.client.chat.completions.create(**args)
        if getattr(response, "usage", None):
            self.usage["input_tokens"] += response.usage.prompt_tokens or 0
            self.usage["output_tokens"] += response.usage.completion_tokens or 0
        message = response.choices[0].message
        if getattr(message, "refusal", None):
            raise RuntimeError("OpenAI declined to produce a trading decision.")
        if not message.content:
            raise RuntimeError("OpenAI produced an empty response.")
        return message.content

    def decide(self, ctx: dict) -> dict:
        system, user = build_prompt(ctx, self.cfg)
        output = json.loads(self._call(system, user, DECISION_SCHEMA))
        decisions = output.get("decisions")
        if not isinstance(output.get("market_view"), str) or not isinstance(decisions, list):
            raise ValueError("Invalid response structure")
        symbols = list(ctx["market"])
        names = [d.get("symbol") for d in decisions if isinstance(d, dict)]
        if len(names) != len(decisions) or len(names) != len(set(names)) or set(names) != set(symbols):
            raise ValueError("AI response must include each available symbol exactly once")
        limit = float(self.cfg["strategy"]["max_position_pct"])
        for d in decisions:
            if d["action"] not in ("BUY", "SELL", "HOLD"):
                raise ValueError("Unsupported action")
            for field in ("allocation_pct", "confidence", "stop_loss_pct", "target_pct"):
                v = d[field]
                if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                    raise ValueError("Invalid decision number: " + field)
            if not 0 <= d["confidence"] <= 1:
                raise ValueError("Confidence outside 0..1")
            if d["action"] == "BUY":
                if not (0 < d["allocation_pct"] <= limit and 0 < d["stop_loss_pct"] <= 10
                        and 0 < d["target_pct"] <= 20):
                    raise ValueError("BUY fails position or stop/target guard")
            elif d["allocation_pct"] != 0:
                raise ValueError("SELL/HOLD allocation must be zero")
        return output

    def write(self, system: str, user: str) -> str:
        return self._call(system, user)
