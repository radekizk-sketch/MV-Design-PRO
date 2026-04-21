# Historical Archive

This directory holds historical documentation and retained context only.

As of V12.5:
- `../spec/` is historical and not an active source of truth.
- current canonical documentation is indexed from `../INDEX.md` and `../INDEX_KANONICZNY.md`.

## Rules

- `docs/archive/` stores migration notes, historical names and preserved context only.
- Active documentation must not cite `docs/archive/` as canonical without an explicit `[historyczne]` marker.
- If a superseded filename still exists outside `docs/archive/`, treat it as historical context until it is physically removed from the active surface.

## V12.5 migration map

| Historical path | Active successor |
|---|---|
| `analysis/P26_AUTO_RECOMMENDATIONS_ETAP_PLUS.md` | `analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md` |
| `analysis/P27_SCENARIO_COMPARISON_ETAP_PLUS.md` | `analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md` |
| `analysis/P33_LF_SENSITIVITY_ETAP_KILLER.md` | `analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md` |
| `analysis/SENSITIVITY_ANALYSIS_ETAP_PLUS.md` | `analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md` |
| `architecture/STUDY_SCENARIO_WORKFLOW_ETAP_PLUS.md` | `architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md` |
| `audit/REPO_HYGIENE_PO_ETAPIE_KATALOG_FIRST.md` | `audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md` |
| `ui/UI_ETAP_POWERFACTORY_PARITY.md` | `ui/UI_CANONICAL_PARITY_MATRIX.md` |
| `ui/powerfactory_ui_parity.md` | `ui/ui_canonical_parity.md` |

## Notes

- `docs/spec/` remains historical reference material and is guarded as such.
- The canonical V12.5 surface lives in `docs/`, but only files reachable from `../INDEX.md` and `../INDEX_KANONICZNY.md` should be treated as active source of truth.
