# Secrets

- Never read, open, search, print, copy or edit `.env` or any `.env.*` file (`.env.local`, `.env.production`, etc.). They hold real secrets.
- The only exception is `.env.example`, which has placeholder values. Read it to learn which keys exist, and add new keys there.
- This covers every tool: file reads, code search, globs, and shell commands such as `cat`, `grep`, `source`, `env` dumps or `printenv`.
- Never echo secret values into chat, logs, code or commits. Refer to keys by name only.
- If a task needs a real secret value, ask the user to set it.
- A PreToolUse hook (`.kiro/hooks/block-env-access.json`) enforces this and blocks tool calls that reference `.env` files.
