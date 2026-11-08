#!/usr/bin/env python3
"""PreToolUse guard: block any tool call that references a .env file.

Allowed: .env.example (placeholder values only).
Blocked: .env, .env.local, .env.production, .env.* in paths, globs or commands.
Exit 2 blocks the tool call; the stderr message is shown to the agent.
"""
import json
import re
import sys

# `.env` as a file name (not `process.env`, `.envrc`, `.environment`),
# optionally with suffixes like `.local`, but never exactly `.env.example`.
ENV_FILE = re.compile(r"(?<![\w.])\.env(?!\.example(?![\w.-]))(?:\.[\w-]+)*(?![\w-])")


def tool_input(payload: object) -> object:
    """Return only the tool call arguments, so unrelated context can't trigger a block."""
    if isinstance(payload, dict):
        for key in ("tool_input", "toolInput", "input", "arguments", "parameters"):
            if key in payload:
                return payload[key]
    return payload


def main() -> int:
    raw = sys.stdin.read()
    try:
        text = json.dumps(tool_input(json.loads(raw)))
    except ValueError:
        text = raw

    match = ENV_FILE.search(text)
    if match:
        print(
            f"Blocked: this tool call references '{match.group(0)}'. "
            "Agents must not read or modify .env files because they hold secrets. "
            "Use .env.example for key names and ask the user if a real value is needed.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
