# Domain Docs

## Layout

**Single-context** — one `CONTEXT.md` at repo root + `docs/adr/` for architectural decisions.

## Files

| File | Purpose | Consumers |
|------|---------|-----------|
| `CONTEXT.md` (root) | Project domain language, key concepts, architecture overview | `improve-codebase-architecture`, `diagnosing-bugs`, `tdd`, `codebase-design` |
| `docs/adr/` | Architecture Decision Records — past decisions with rationale | `improve-codebase-architecture`, `grill-me`, `domain-modeling` |

## Rules for agents

1. **Read `CONTEXT.md` first** before any architecture, debugging, or design work
2. **Read relevant ADRs** before proposing changes that contradict past decisions
3. **Write new ADRs** when making significant architectural choices (new pattern, new dependency, new data flow)
4. **Update `CONTEXT.md`** when domain terminology changes

## ADR format

```markdown
# ADR-NNN: <Title>

## Status
Accepted | Superseded by ADR-XXX

## Context
What situation prompted this decision?

## Decision
What did we decide?

## Consequences
What are the tradeoffs?
```

## Creating CONTEXT.md

When creating `CONTEXT.md`, cover:
- What the project does (one paragraph)
- Key domain terms and their meanings
- Architecture overview (components, data flow)
- Constraints (runtime, cost, platform)
- Link to `AGENTS.md` for agent-specific rules
