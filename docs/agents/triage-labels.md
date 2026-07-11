# Triage Labels

When the `triage` skill processes an incoming issue, it moves it through a state machine using these five canonical labels.

## Labels

| Label | Meaning | When to apply |
|-------|---------|---------------|
| `needs-triage` | Needs evaluation | New issue, not yet assessed |
| `needs-info` | Waiting on reporter | Issue is unclear or missing critical details |
| `ready-for-agent` | Agent-ready | Fully specified, AFK agent can pick up with no human context |
| `ready-for-human` | Needs human implementation | Requires human judgment, design decisions, or external access |
| `wontfix` | Will not be actioned | Out of scope, duplicate, or not worth pursuing |

## State machine

```
new → needs-triage → ready-for-agent → (agent picks up)
                    → ready-for-human → (human picks up)
                    → needs-info → (reporter clarifies) → needs-triage
                    → wontfix
```

## Usage

In local markdown, status is written in the `## Status` section of `ISSUE.md`:

```markdown
## Status
ready-for-agent
```

No actual label creation needed — the status field IS the label.
