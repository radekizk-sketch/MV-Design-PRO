# Claude Design Review Process

Before implementing UI/UX, SLD, LOD, CAD, navigation, or workflow changes, run:

```powershell
.\scripts\run_claude_design_review.ps1 -Feature engineering_flow
```

Use a feature name that describes the reviewed surface, for example:

- `sld_scada_cad_visual_quality`
- `network_designer_end_to_end_flow`
- `station_endpoint_append_and_der_flow`
- `lod_cad_layout_interactions`

The script writes four audit artifacts under `docs/audits/`:

- `*.prompt.md` — exact prompt sent to Claude.
- `*.md` — Claude review output.
- `*.meta.json` — command metadata, Claude path, timestamps, and exit code.
- `*.decision.md` — decision log with `Accepted`, `Rejected`, and `Deferred`.

Implementation may start only after the decision log is filled. Accepted items must preserve ENM/domain correctness, respect frozen solver/result APIs, and have tests or an explicit verification plan. Claude review is a flow and readability checkpoint, not a source of domain truth.
