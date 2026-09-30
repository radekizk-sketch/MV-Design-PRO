#!/usr/bin/env python3
"""CI guard: zapadka na "suite weryfikacyjne wskazujace pliki, ktorych nie ma".

GENEZA (karta SUITA-BEZ-WYWOLANIA, 2026-08-12). `frontend/package.json` mial
skrypty `test:golden`/`test:golden:update` wolajace SZESC plikow testowych,
z ktorych ZADEN nie istnial (usuniete/przeniesione bez aktualizacji
wywolania). Wolal je `scripts/verify_v12_5.py` (655 linii) — agregator, ktory
sam NIGDY nie stal w zadnym workflow CI, wiec nikt nigdy nie zobaczyl
czerwieni. Ten sam agregator dodatkowo wskazywal `ui/protection-results/
__tests__/ProtectionResultsInspectorPage.test.tsx`, ktorego rowniez nie bylo
(11 z 23 sciezek w jego trybie `--quick` bylo widmowych). Siostrzany
`scripts/verify_v12_6.py` mial identyczny defekt: wskazywal PIEC guardow SLD
(`cable_leaves_from_head_guard.py`, `label_overlap_guard.py`,
`lod_hysteresis_guard.py`, `layout_readability_guard.py`,
`enm_adapter_consistency_guard.py`), ktore nigdy nie zostaly napisane, oraz
plik UI `V126AcademicSurface.tsx`, ktory nigdy nie istnial. Oba agregatory
zostaly skasowane tym samym commitem, ktory dopisal ten guard.

CO SPRAWDZA (cztery zakresy — D dopisany 2026-09-02 (M0-1), kazdy dowiedziony 0 falszywych trafien na drzewie
repo w chwili napisania):

  A. `frontend/package.json` `scripts.*` — kazdy token wygladajacy jak
     sciezka testu frontowego (`src/...` albo `e2e/...` z rozszerzeniem
     .py/.ts/.tsx/.js/.jsx/.mjs) musi istniec pod `frontend/`.

  B. `scripts/*.py` (bez `test_*.py`) — kazdy cudzyslowiony literal
     `scripts/....py` musi istniec pod korzeniem repo. Zakres CELOWO waski:
     tylko literal zaczynajacy sie od `scripts/` i konczacy na `.py` w
     cudzyslowie — to dokladnie ksztalt, w jakim `verify_v12_6.py` wskazywal
     nieistniejace guardy krokow. Literale `src/...`/`tests/...` sprawdzane
     SA TYLKO w plikach, ktore w tym samym pliku zawieraja tez literal
     `"poetry"` (wtedy baza = `backend/`) albo `"npm"` (wtedy baza =
     `frontend/`) — bez tego markera taki fragment czesto jest wzgledna
     sciezka z INNEJ bazy (np. `BACKEND_SRC / "api/enm.py"` w wielu guardach
     delta-owych), a proba jednej uniwersalnej bazy dawala >140 falszywych
     trafien na tym repo (zmierzone przy projektowaniu tego guarda).

  C. Pliki `scripts/*_contract_text_guard.py` (konwencja nazewnicza guardow
     "czytaj plik kontraktowy, sprawdz tresc" — dzis jeden: `v126_contract_
     text_guard.py`) — KAZDY cudzyslowiony literal wygladajacy na sciezke
     repo (dowolny prefiks: `backend/`, `frontend/`, `docs/`, `scripts/`,
     rozszerzenie .py/.ts/.tsx/.js/.jsx/.mjs/.md/.json) musi istniec pod
     korzeniem repo. Ten zakres jest SZERSZY niz B celowo: guardy tej
     konwencji CZYTAJA kazdy wymieniony plik (`Path.read_text`), wiec
     widmowy wpis = `FileNotFoundError` przy pierwszym uruchomieniu, a nie
     cichy brak pokrycia — to dokladnie ksztalt defektu tej karty. Generyczne
     guardy delta-owe (np. `solver_boundary_guard.py`) NIE sa w tym zakresie:
     uzywaja sciezek jako list DOPASOWANIA do `git diff`, gdzie widmowy wpis
     jest bezpiecznie inertny (nigdy nie dopasuje), a nie zrodlem
     `FileNotFoundError` — inna klasa, poza ta karta (nazwana w jej meldunku
     jako dlug znaleziony przy okazji, nie naprawiony tutaj).

CZEGO NIE SPRAWDZA (nazwane wprost, zeby ta zielen nie znaczyla wiecej niz
znaczy — regula KLASA-NIE-INSTANCJA §4): generycznych guardow delta-owych
(allowlisty plikow do `git diff`), globow (`**`, `*`), sciezek z interpolacja
(`${...}`), URL-i, i JAKICHKOLWIEK wzmianek o sciezkach w dokumentacji Markdown
poza zakresem C.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
PACKAGE_JSON = ROOT / "frontend" / "package.json"

_SELF_NAME = Path(__file__).name

_FRONT_EXT = r"(?:py|ts|tsx|js|jsx|mjs)"
_ANY_EXT = r"(?:py|ts|tsx|js|jsx|mjs|md|json)"

_NPM_TOKEN = re.compile(r"^(?:src|e2e)/[\w\-./]+\." + _FRONT_EXT + r"$")
_SRC_TESTS_LITERAL = re.compile(r"[\"']((?:src|tests)/[\w\-./]+\." + _FRONT_EXT + r")[\"']")
_ANY_REPO_LITERAL = re.compile(
    r"[\"']((?:scripts|backend|frontend|docs)/[\w\-./]+\." + _ANY_EXT + r")[\"']"
)


def check_npm_scripts(package_json: Path, frontend_dir: Path) -> list[str]:
    """Zakres A: literalne sciezki testow w `scripts.*` z package.json."""
    if not package_json.exists():
        return [f"{package_json}: brak pliku package.json"]

    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return [f"{package_json}: niepoprawny JSON ({error})"]

    violations: list[str] = []
    for name, command in sorted(data.get("scripts", {}).items()):
        if not isinstance(command, str):
            continue
        for raw_token in command.split():
            token = raw_token.strip("\"'")
            if _NPM_TOKEN.match(token) and not (frontend_dir / token).exists():
                violations.append(f'package.json scripts["{name}"]: brak pliku {token}')
    return violations


def check_verification_scripts(scripts_dir: Path, root: Path) -> list[str]:
    """Zakresy B i C: literalne sciezki plikow w agregatorach `scripts/*.py`."""
    violations: list[str] = []
    if not scripts_dir.exists():
        return [f"{scripts_dir}: katalog scripts nie istnieje"]

    for path in sorted(scripts_dir.glob("*.py")):
        if path.name.startswith("test_") or path.name == _SELF_NAME:
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        # Karta ALLOWLIST-WIDMA (2026-08-12): skan literalow repo-relatywnych
        # ROZSZERZONY z konwencji *_contract_text_guard.py na WSZYSTKIE pliki
        # (pomiar przed rozszerzeniem: 5 widm w 4 guardach delta/allowlist,
        # ZERO falszywych trafien na calym korpusie scripts/). Wpis allowlisty
        # wskazujacy nieistniejacy plik to cicha utrata ochrony: delta-guard
        # nie pilnuje pliku, ktorego sciezka nie moze sie pojawic w diffie.
        for match in _ANY_REPO_LITERAL.finditer(text):
            candidate = match.group(1)
            if not (root / candidate).exists():
                violations.append(f"{path.name}: brak pliku {candidate}")

        has_poetry = '"poetry"' in text or "'poetry'" in text
        has_npm = '"npm"' in text or "'npm'" in text
        for match in _SRC_TESTS_LITERAL.finditer(text):
            candidate = match.group(1)
            if candidate.startswith(("src/", "tests/")) and has_poetry:
                base = root / "backend"
            elif candidate.startswith("src/") and has_npm:
                base = root / "frontend"
            else:
                continue
            if not (base / candidate).exists():
                violations.append(f"{path.name}: brak pliku {candidate} (baza {base.name}/)")

    return violations


WORKFLOWS_DIR = ROOT.parent / ".github" / "workflows"

_WF_FRONT_TEST = re.compile(r"^(?:src|e2e)/[\w\-./]+\.(?:ts|tsx|js|mjs)$")
_WF_SCRIPT = re.compile(r"^(?:\.\./)?scripts/[\w\-./]+\.py$")
_WF_REPO_PATH = re.compile(r"^mv-design-pro/[\w\-./]+\.(?:py|ts|tsx|js|mjs|sh)$")
_WF_BACKEND_TESTS = re.compile(r"^tests/[\w\-./]+\.py$")


def check_workflows(workflows_dir: Path, root: Path) -> list[str]:
    """Zakres D (M0-1, 2026-09-02): literalne sciezki plikow w krokach `run:`
    workflowow CI. Precedens: `sld-determinism.yml` przez 3 tygodnie wolal
    `src/ui/sld/v2/__tests__/StationInternalView.test.tsx` usuniety w `08ccf7c9`
    — vitest konczyl sie "No test files found, exiting with code 1", a CI na
    `main` bylo czerwone bez zadnego guarda, ktory by to nazwal. Sprawdzane sa
    WYLACZNIE tokeny wygladajace jak sciezka pliku: testy frontendu (`src/…`,
    `e2e/…` — baza `frontend/`), guardy (`scripts/…py` i `../scripts/…py` —
    baza `mv-design-pro/`), sciezki od korzenia repo (`mv-design-pro/…`) oraz
    testy backendu (`tests/…py` — baza `backend/`)."""
    if not workflows_dir.exists():
        return [f"{workflows_dir}: katalog workflowow nie istnieje"]
    violations: list[str] = []
    for path in sorted(workflows_dir.glob("*.yml")):
        for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if line.startswith("#") or "run:" not in line:
                continue
            for raw_token in line.split():
                token = raw_token.strip("\"'")
                if _WF_FRONT_TEST.match(token):
                    base = root / "frontend"
                elif _WF_SCRIPT.match(token):
                    base, token = root, token.removeprefix("../")
                elif _WF_REPO_PATH.match(token):
                    base = root.parent
                elif _WF_BACKEND_TESTS.match(token):
                    base = root / "backend"
                else:
                    continue
                if not (base / token).exists():
                    violations.append(f"{path.name}: brak pliku {token} (baza {base.name}/)")
    return violations


def run() -> int:
    violations = [
        *check_npm_scripts(PACKAGE_JSON, ROOT / "frontend"),
        *check_verification_scripts(SCRIPTS_DIR, ROOT),
        *check_workflows(WORKFLOWS_DIR, ROOT),
    ]

    if violations:
        print(
            "verification_phantom_paths_guard: suita weryfikacyjna wskazuje pliki, "
            "ktorych nie ma:",
            file=sys.stderr,
        )
        for violation in sorted(set(violations)):
            print(f"  - {violation}", file=sys.stderr)
        return 1

    print("verification_phantom_paths_guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(run())
