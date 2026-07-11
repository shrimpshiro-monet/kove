# Monet Grammar Extractor — Regression Eval

Evaluation harness for the editing grammar extractor. Ensures extraction quality stays consistent across code changes.

## Files

```
scripts/eval/
├── run_eval.py           # Regression eval — compares current vs baseline
├── loopback.py           # Loopback eval — grammar match scoring
├── README.md             # This file
├── baseline/             # Baseline DNA outputs (committed to repo)
│   ├── steph-curry-dna.json
│   ├── harvey-dna.json
│   ├── lewis-hamilton-dna.json
│   ├── tyler-the-creator-dna.json
│   └── new-york-dna.json
├── current/              # Current run outputs (gitignored)
└── loopback/             # Loopback render outputs (gitignored)
```

## Quick Start

### 1. Save Baseline (first time only)

```bash
cd /Users/hamza/Desktop/reserves/monet-ai-story
python3 scripts/eval/run_eval.py --save
```

This runs grammar extraction on all 5 reference videos and saves the DNA outputs to `baseline/`. Commit these files to track baseline.

### 2. Run Regression Eval

```bash
python3 scripts/eval/run_eval.py
```

Compares current extraction against baseline. Prints a table showing:
- Each field's baseline vs current value
- Percentage delta
- Status (OK/CHANGED)

**Example output:**
```
┌────────────────┬─────────────────────────────┬────────────┬────────────┬──────────┬────────┐
│ Reference      │ Field                       │ Baseline   │ Current    │ Delta    │ Status │
├────────────────┼─────────────────────────────┼────────────┼────────────┼──────────┼────────┤
│ steph-curry    │ totalShots                  │         14 │         14 │          │   OK   │
│ (sports)       │ avgShotDuration             │      1.335 │      1.335 │          │   OK   │
│                │ colorProfile.grade          │     normal │     normal │          │   OK   │
│                │ effects.totalEffects        │         30 │         32 │  +6.7%   │ CHANGE │
└────────────────┴─────────────────────────────┴────────────┴────────────┴──────────┴────────┘
```

### 3. Run Loopback Eval

```bash
python3 scripts/eval/loopback.py
```

Tests grammar preservation through the full pipeline:
1. Extract DNA from reference
2. Generate EDL from DNA
3. Render video from EDL
4. Re-extract DNA from render
5. Score match (0-100)

**Example output:**
```
┌────────────────┬─────────────┬───────┬──────────────┬────────┐
│ Reference      │ Genre       │ Score │ Fields Match │ Status │
├────────────────┼─────────────┼───────┼──────────────┼────────┤
│ steph-curry    │ sports      │  82.3 │      16/21   │  PASS  │
│ harvey         │ tv-edit     │  78.5 │      15/21   │  WARN  │
│ lewis-hamilton │ sports-f1   │  85.1 │      17/21   │  PASS  │
│ tyler-the-creator│ music-artist│  71.2 │      13/21   │  WARN  │
│ new-york       │ lifestyle   │  88.4 │      18/21   │  PASS  │
├────────────────┼─────────────┼───────┼──────────────┼────────┤
│ AVERAGE        │             │  81.1 │              │        │
└────────────────┴─────────────┴───────┴──────────────┴────────┘
```

### 4. Specific Reference

```bash
python3 scripts/eval/loopback.py --reference steph-curry --verbose
```

## Reference Videos

| Name | Genre | Path |
|------|-------|------|
| steph-curry | Sports | `reference-edits-2/steph curry.MP4` |
| harvey | TV Edit | `reference-edits-2/harvey.MP4` |
| lewis-hamilton | Sports/F1 | `reference-edits-2/lewis hamilton.MP4` |
| tyler-the-creator | Music/Artist | `reference-edits-2/tyler_the_creator.MP4` |
| new-york | Lifestyle | `reference-edits-2/new york living the moment.MP4` |

## Fields Compared

### Regression Eval (run_eval.py)

| Field | Tolerance | Type |
|-------|-----------|------|
| totalShots | 15% | int |
| avgShotDuration | 10% | float |
| cutRate | 15% | float |
| motionStats.avg_magnitude | 15% | float |
| colorProfile.grade | exact | string |
| shotTypes.dominantType | exact | string |
| effects.totalEffects | 25% | int |
| text.hasText | exact | bool |
| speed.avgSpeed | 15% | float |
| semanticEvents.dominantEventType | exact | string |

### Loopback Eval (loopback.py)

Same fields with tighter tolerances for same-source comparison. Each field has a weight reflecting its importance to the editing grammar.

## How to Update Baseline

When you make intentional changes to analyzers that affect output:

```bash
# 1. Run the new code
python3 scripts/eval/run_eval.py

# 2. Review changes — make sure they're intentional
# Check the diff table for any unexpected changes

# 3. Save new baseline
python3 scripts/eval/run_eval.py --save

# 4. Commit the new baseline
git add scripts/eval/baseline/
git commit -m "Update eval baseline after [describe change]"
```

## Interpreting Scores

### Loopback Score Guide

| Score | Meaning | Action |
|-------|---------|--------|
| 80-100 | Excellent | No action needed |
| 60-79 | Good | Review drifted fields, may be acceptable |
| 40-59 | Moderate | Investigate significant differences |
| 0-39 | Poor | Major regression, fix before merging |

### Common Drift Sources

- **totalShots**: Scene detection threshold changes
- **avgShotDuration**: Cut detection sensitivity
- **colorProfile.grade**: Color analysis algorithm changes
- **effects.totalEffects**: Effect detection threshold changes
- **semanticEvents**: Gemini API response variance

## CI Integration

Add to your CI pipeline:

```yaml
# .github/workflows/eval.yml
- name: Run regression eval
  run: python3 scripts/eval/run_eval.py

- name: Run loopback eval
  run: python3 scripts/eval/loopback.py --reference steph-curry
```

## Troubleshooting

**"No baseline found"**
Run `python3 scripts/eval/run_eval.py --save` first.

**"File not found"**
Check that reference videos exist in `reference-edits-2/`.

**Loopback score is low**
This is expected for the first run — the render pipeline applies effects that change the extracted features. The score measures how well the grammar survives the round-trip.

**Gemini API errors**
The semantic analyzer requires a valid `OPENROUTER_API_KEY`. Set it in your environment or `.env` file.
