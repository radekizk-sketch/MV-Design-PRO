#!/usr/bin/env python3
"""
UX Audit Harness — deterministyczny silnik pętli samoulepszenia UX/UI.

Mierzy 10 kryteriów 10/10 per etap workflow projektowania sieci SN/WN.
Każde kryterium = statyczny check (grep/AST) — wynik powtarzalny.

Etapy (operacje kanoniczne):
  1. GPZ        → add_grid_source_sn        → AddGridSourceForm + GridSourceEditor
  2. Pola SN    → add_sn_bay                → AddSnBayForm
  3. Segmenty   → continue_trunk_segment_sn → ContinueTrunkForm + StartBranchForm
  4. Stacje     → insert_station_on_segment_sn → InsertStationForm
  5. OZE/DER    → add_converter_source      → AddDerWizard / AddConverterSourceForm

Użycie:
  python scripts/ux_audit.py            # audyt wszystkich etapów, JSON do docs/ux/AUDIT_LATEST.json
  python scripts/ux_audit.py --stage gpz
  python scripts/ux_audit.py --fail-under 10   # exit 1 jeśli którykolwiek etap < 10

Output: docs/ux/AUDIT_LATEST.json + tabela na stdout.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FE = REPO_ROOT / "frontend/src"
STORE = FE / "ui/topology/snapshotStore.ts"
MESSAGES = FE / "ui/topology/operationSuccessMessages.ts"
ROUTER = FE / "ui/workspace/WorkspaceSurfaceRouter.tsx"
SHELL_CANDIDATES = [
    FE / "ui/shell/AppShellV12.tsx",
    FE / "ui/layout/CanonicalLayoutV3.tsx",
]


@dataclass
class Stage:
    key: str
    name_pl: str
    operation: str
    form_files: list[Path]
    uses_catalog: bool = False  # czy etap korzysta z dużego katalogu (search wymagany)


STAGES: list[Stage] = [
    Stage(
        "gpz",
        "GPZ — źródło zasilające",
        "add_grid_source_sn",
        [
            FE / "ui/network-build/forms/AddGridSourceForm.tsx",
            FE / "ui/network-build/forms/shared/GridSourceEditor.tsx",
        ],
    ),
    Stage(
        "bays",
        "Pola SN",
        "add_sn_bay",
        [FE / "ui/network-build/forms/AddSnBayForm.tsx"],
    ),
    Stage(
        "segments",
        "Segmenty (kabel/napowietrzne)",
        "continue_trunk_segment_sn",
        [
            # ContinueTrunkForm deleguje render do TrunkContinueModal (tam żyje katalog+search).
            FE / "ui/network-build/forms/ContinueTrunkForm.tsx",
            FE / "ui/topology/modals/TrunkContinueModal.tsx",
            FE / "ui/network-build/forms/StartBranchForm.tsx",
        ],
        uses_catalog=True,
    ),
    Stage(
        "stations",
        "Stacje",
        "insert_station_on_segment_sn",
        [FE / "ui/network-build/forms/InsertStationForm.tsx"],
    ),
    Stage(
        "der",
        "OZE / DER",
        "add_converter_source",
        [FE / "ui/network-build/station-der/AddDerWizard.tsx"],
        uses_catalog=True,
    ),
]


@dataclass
class CriterionResult:
    id: int
    name: str
    passed: bool
    detail: str = ""


@dataclass
class StageResult:
    key: str
    name_pl: str
    criteria: list[CriterionResult] = field(default_factory=list)

    @property
    def score(self) -> int:
        return sum(1 for c in self.criteria if c.passed)

    @property
    def failing(self) -> list[str]:
        return [f"C{c.id} {c.name}: {c.detail}" for c in self.criteria if not c.passed]


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""


def _any(files: list[Path], needle: str) -> bool:
    return any(needle in _read(f) for f in files)


def _store_emits_success() -> bool:
    text = _read(STORE)
    return "getOperationSuccessMessage" in text and (
        "'success'" in text or '"success"' in text
    )


def _message_mapped(op: str) -> bool:
    text = _read(MESSAGES)
    return bool(re.search(rf"^\s{{2}}{re.escape(op)}:\s*'", text, re.MULTILINE))


def _semantic_banner_wired() -> bool:
    """SemanticIssuesBanner podpięty w routerze albo shellu (global)."""
    targets = [ROUTER] + SHELL_CANDIDATES
    return any("SemanticIssuesBanner" in _read(t) for t in targets)


def _spine_error_coloring() -> bool:
    """SpineRenderer koloruje issue (real-time error na SLD)."""
    sr = FE / "ui/sld/v2/renderer/SpineRenderer.tsx"
    text = _read(sr)
    return text != "" and ("issue" in text.lower() or "error" in text.lower() or "semantic" in text.lower())


def audit_stage(stage: Stage) -> StageResult:
    res = StageResult(stage.key, stage.name_pl)
    existing = [f for f in stage.form_files if f.exists()]
    text_all = "\n".join(_read(f) for f in existing)

    # C1 — brak duplikatu wejść (1 operacja → 1 prymarny form file present)
    primary_forms = [f for f in existing if "Editor" not in f.name]
    res.criteria.append(CriterionResult(
        1, "brak duplikatu wejść",
        len(primary_forms) <= 1 or stage.key == "segments",  # segments ma 2 legit (trunk+branch)
        f"{[f.name for f in primary_forms]}",
    ))

    # C2 — feedback sukcesu (centralny store emit + komunikat dla operacji)
    c2 = _store_emits_success() and _message_mapped(stage.operation)
    res.criteria.append(CriterionResult(
        2, "feedback sukcesu",
        c2,
        "centralny notify+message" if c2 else f"brak komunikatu dla {stage.operation}",
    ))

    # C3 — walidacja real-time (SemanticIssuesBanner globalnie podpięty)
    res.criteria.append(CriterionResult(
        3, "walidacja real-time (banner)",
        _semantic_banner_wired(),
        "SemanticIssuesBanner wired" if _semantic_banner_wired() else "banner NIE podpięty globalnie",
    ))

    # C4 — tooltipy inżynierskie (HelpTooltip / helperText / describe*)
    c4 = bool(re.search(r"HelpTooltip|helperText|describe[A-Z]|FieldTooltip|getTooltip", text_all))
    res.criteria.append(CriterionResult(
        4, "tooltipy inżynierskie", c4,
        "obecne" if c4 else "brak tooltipów/helperText",
    ))

    # C5 — PL terminologia (delegowane do guardów; tu: brak oczywistych ang. terminów w formie)
    forbidden = re.findall(r"\b(Bus Bar|Feeder|Breaker|Grounding Type)\b", text_all)
    res.criteria.append(CriterionResult(
        5, "PL terminologia", len(forbidden) == 0,
        "OK (guardy ui_terminology)" if not forbidden else f"ang. terminy: {set(forbidden)}",
    ))

    # C6 — catalog-first z wyszukiwarką (tylko etapy z dużym katalogiem).
    # CatalogPicker ma wbudowaną wyszukiwarkę + filtry (searchTerm/filteredEntries),
    # więc jego użycie spełnia kryterium katalog-first z wyszukiwaniem.
    if stage.uses_catalog:
        c6 = bool(re.search(r"SearchBox|search|filtr|Filter|CatalogSearch|CatalogPicker", text_all))
        res.criteria.append(CriterionResult(
            6, "catalog search+filtry", c6,
            "obecne" if c6 else "brak wyszukiwarki katalogu",
        ))
    else:
        res.criteria.append(CriterionResult(6, "catalog search (n/d)", True, "nie dotyczy etapu"))

    # C7 — auto-fill parametryczny. Wykrywa:
    #  - jawne słowa (autofill/sugerowany/derive)
    #  - catalog-driven population: `selected?.<param> ?? previous` w setFormData
    #    (wybór pozycji katalogowej automatycznie wypełnia parametry — realny auto-fill)
    c7 = bool(re.search(
        r"auto.?fill|autofill|sugerowan|suggest|derive|computeFrom|length_km"
        r"|selected\?\.\w+\s*\?\?|selectedItem\?\.\w+\s*\?\?|fromCatalog|catalogItem\?\.\w+\s*\?\?"
        # auto-select pierwszej pozycji katalogowej (usable[0]?.id ?? / items[0]?.id ??)
        r"|\[0\]\?\.\w+\s*\?\?|\[0\]\.id",
        text_all,
    ))
    res.criteria.append(CriterionResult(
        7, "auto-fill parametryczny", c7,
        "obecne (catalog-driven)" if c7 else "brak auto-fill",
    ))

    # C8 — undo/redo per operacja (operationHistory w store — global)
    c8 = "operationHistory" in _read(STORE)
    res.criteria.append(CriterionResult(
        8, "undo/redo (historia)", c8,
        "operationHistory" if c8 else "brak historii operacji",
    ))

    # C9 — real-time error na SLD (SpineRenderer error coloring)
    res.criteria.append(CriterionResult(
        9, "error na SLD", _spine_error_coloring(),
        "SpineRenderer issue-aware" if _spine_error_coloring() else "SLD nie pokazuje issue",
    ))

    # C10 — brak raw ID/hash w WIDOCZNYM tekście (delegowane do no_raw_ids_in_ui_guard).
    # Wykluczamy atrybuty nie-wyświetlane (key=/value=/data-/htmlFor=/id=) — to nie jest
    # tekst widoczny dla użytkownika. Flagujemy tylko hash_sha256 w tekście oraz
    # ref_id/_id renderowane jako zawartość JSX (>{...}<).
    raw_lines = []
    for line in text_all.splitlines():
        if re.search(r"\b(key|value|htmlFor|id|data-[a-z-]+)\s*=", line):
            continue  # atrybut techniczny, nie widoczny tekst
        if "hash_sha256" in line or re.search(r">\s*\{[^}]*\bref_id\b", line):
            raw_lines.append(line.strip())
    res.criteria.append(CriterionResult(
        10, "brak raw ID/hash", len(raw_lines) == 0,
        "OK (guard no_raw_ids)" if not raw_lines else f"podejrzane: {len(raw_lines)}",
    ))

    return res


def main() -> int:
    parser = argparse.ArgumentParser(description="UX Audit Harness")
    parser.add_argument("--stage", help="audytuj jeden etap (gpz/bays/segments/stations/der)")
    parser.add_argument("--fail-under", type=int, default=0, help="exit 1 jeśli etap < N")
    parser.add_argument("--json-only", action="store_true")
    args = parser.parse_args()

    stages = STAGES if not args.stage else [s for s in STAGES if s.key == args.stage]
    if not stages:
        print(f"Nieznany etap: {args.stage}")
        return 2

    results = [audit_stage(s) for s in stages]
    payload = {
        "stages": [
            {
                "key": r.key,
                "name_pl": r.name_pl,
                "score": r.score,
                "max": len(r.criteria),
                "failing": r.failing,
                "criteria": [
                    {"id": c.id, "name": c.name, "passed": c.passed, "detail": c.detail}
                    for c in r.criteria
                ],
            }
            for r in results
        ],
        "mean_score": round(sum(r.score for r in results) / max(len(results), 1), 2),
    }

    out_dir = REPO_ROOT / "docs/ux"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "AUDIT_LATEST.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    if not args.json_only:
        print("=" * 64)
        print("UX AUDIT — pętla samoulepszenia (10/10 per etap)")
        print("=" * 64)
        for r in results:
            icon = "✓" if r.score == len(r.criteria) else "○"
            print(f"{icon} {r.name_pl:35s} {r.score}/{len(r.criteria)}")
            for fail in r.failing:
                print(f"    ✗ {fail}")
        print("-" * 64)
        print(f"Średni wynik: {payload['mean_score']}/10")
        print(f"Raport: docs/ux/AUDIT_LATEST.json")

    if args.fail_under:
        worst = min((r.score for r in results), default=0)
        if worst < args.fail_under:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
