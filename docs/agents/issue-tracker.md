# Issue Tracker

## Source of truth

Issues live as local markdown files under `.scratch/<feature>/` in this repo.

## File structure

```
.scratch/
  <feature-name>/
    ISSUE.md          # The issue
    PROGRESS.md       # Implementation notes (optional)
    DECISIONS.md      # Design decisions (optional)
```

## ISSUE.md format

```markdown
# <Title>

## Status
needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix

## Summary
One-paragraph description of what needs to happen.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Context
Links to relevant files, ADRs, or prior work.
```

## Workflow

1. **Create**: Write an `ISSUE.md` under `.scratch/<feature>/`
2. **Triage**: Apply status label (see `triage-labels.md`)
3. **Pick up**: Agent reads issue, implements, updates `PROGRESS.md`
4. **Done**: Mark status as done or archive the folder

## Rules

- No external PRs as triage surface
- Issues are self-contained: an agent should be able to pick one up with no human context
- One feature per folder
- Delete `.scratch/<feature>/` when work is complete and verified
