#!/usr/bin/env python3
"""
LV Domain Projection Guard — slice E (KASACJA MARTWEGO LEGACY nN + GUARDY).

Chroni DWIE rzeczy naraz, wzorcem `grep_zero_guard.py` (import zakazany =
tekstowy wzorzec zakazany) i `import_graph_guard.py` (kontrakt jednego pliku
wejściowego sprawdzany przez regex na jego treści):

  (A) że martwy legacy skasowany w slice E (dwuklik-w-stację `StationInternalView`
      i panel wyników odpływu nN `NnCircuitResultsPanel`/`nnCircuitResults`/
      `nnSwzApi`/`useSwzOverlay`) NIE WRACA — ani jako nowy import produkcyjny,
      ani jako nowa nazwa pliku łudząco podobna (`nn-studio`, `nnStudioTreeAdapter`
      to nazwy ZAREZERWOWANE naprzód, gdyby ktoś odtworzył ten sam mechanizm pod
      inną etykietą);
  (B) że jedyny NASTĘPCA tego mechanizmu — projekcja domeny nN
      (`ui/sld/v3/lv-domain/**`, kontrakt `LvDomainProjectionV1`) — zostaje przy
      SWOICH trzech niezmiennikach architektonicznych, których złamanie
      odtworzyłoby dokładnie ten sam dług, który slice E skasował:
        - jeden kontrakt danych (`projection: LvDomainProjectionV1`), nie
          rozproszone propsy częściowe (R2);
        - jeden klient sieciowy (`projectionApi.ts`, JEDNO wywołanie `fetch`),
          nie N-ty równoległy fetch w komponencie widoku (R3);
        - ZERO rekonstrukcji topologii z ENM w warstwie domeny nN — topologia
          przychodzi GOTOWA w projekcji, UI jej nie odtwarza z `snapshot.buses`/
          `snapshot.branches` (R4);
        - kanwa v3 (`SldCanvasV3Workspace.tsx`) woła domenę WYŁĄCZNIE przez
          `LvDomainPortal`, nie przez własny import legacy ani własny fetch (R5).

REGUŁY (każda z komunikatem `plik:linia`):
  R1. frontend/src/** (poza __tests__/testami): zero importów modułów
      `StationInternalView`, `stationInternalViewData`, `useSwzOverlay`,
      `nnSwzApi`, `nnCircuitResults`, `NnCircuitResultsPanel`, `nn-studio`,
      `nnStudioTreeAdapter`. Te moduły zostały skasowane w slice E (zero
      konsumentów produkcyjnych, zmierzone przed kasacją) — ich ponowny import
      jest albo reimportem martwego kodu z historii gita, albo odtworzeniem
      dokładnie tego samego mechanizmu pod istniejącą nazwą.
  R2. `ui/sld/v3/lv-domain/LvDomainView.tsx`: interfejs `LvDomainViewProps`
      niesie DOKŁADNIE jeden prop danych `projection: LvDomainProjectionV1`;
      zakaz propów `view`/`upstreamEquivalents`/`swzByFeederRef`/
      `resultOverlayPayload`/`voltageProfileByBusRef` (to były pola ŚRODKA
      komponentu wyprowadzone z `projection` przez `useMemo` — gdyby wróciły
      jako propsy, wołający znów musiałby składać je sam, czyli dokładnie ten
      układ, który projekcja miała zastąpić).
  R3. `ui/sld/v3/lv-domain/**` (poza __tests__/fixtures/testami): zero
      `fetch(` poza `projectionApi.ts`; `projectionApi.ts` ma DOKŁADNIE jedno
      wywołanie `fetch(` — jeden klient, jedno żądanie, jeden punkt audytu
      sieciowego dla całej domeny nN.
  R4. `ui/sld/v3/lv-domain/**` (poza testami): zero rekonstrukcji topologii z
      ENM — zakaz importu modelu sieci `types/enm` (`EnergyNetworkModel`) i
      zakaz wzorca `snapshot.branches`/`snapshot.buses` (BFS po surowym ENM).
      Layout po `projection.graph` jest DOZWOLONY — to gotowa geometria z
      projekcji backendu, nie odtwarzanie topologii przez UI.
  R5. `ui/sld/v3/canvas/SldCanvasV3Workspace.tsx`: zero importów
      `useSwzOverlay`/`nnCircuitResults`/`StationInternalView`; zero `fetch(`
      pod końcówki `/swz` lub `/lv-domain` — jedyna droga do domeny nN to
      komponent `LvDomainPortal` (właściciel jedynego fetchu, R3).

EXIT CODES:
  0 = czysto (brak naruszeń)
  1 = naruszenie reguły LUB zapadka pustego skanu / brakującej ścieżki
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
LV_DOMAIN_DIR = FRONTEND_SRC / "ui" / "sld" / "v3" / "lv-domain"
LV_DOMAIN_VIEW_FILE = LV_DOMAIN_DIR / "LvDomainView.tsx"
PROJECTION_API_FILE = LV_DOMAIN_DIR / "projectionApi.ts"
WORKSPACE_FILE = FRONTEND_SRC / "ui" / "sld" / "v3" / "canvas" / "SldCanvasV3Workspace.tsx"

TS_SUFFIXES = {".ts", ".tsx"}

# R1 — martwe moduły skasowane w slice E (+ dwie nazwy zarezerwowane naprzód,
# gdyby ten sam mechanizm miał wrócić pod inną etykietą).
R1_BANNED_MODULE_TOKENS: tuple[str, ...] = (
    "StationInternalView",
    "stationInternalViewData",
    "useSwzOverlay",
    "nnSwzApi",
    "nnCircuitResults",
    "NnCircuitResultsPanel",
    "nn-studio",
    "nnStudioTreeAdapter",
)

# R2 — propsy zakazane (to były wewnętrzne useMemo, nie kontrakt wejścia).
R2_BANNED_PROPS: tuple[str, ...] = (
    "view",
    "upstreamEquivalents",
    "swzByFeederRef",
    "resultOverlayPayload",
    "voltageProfileByBusRef",
)

# Import/eksport/`import()`/`require()` niosące ścieżkę modułu w cudzysłowie —
# jedyny kontekst, w którym token modułu liczy się jako REALNY import (nie
# wzmianka w komentarzu/prozie dokumentacyjnej).
_IMPORT_SPEC_RE = re.compile(r"""(?:from\s+|import\(\s*|require\(\s*)(['"])([^'"]+)\1""")
_FETCH_CALL_RE = re.compile(r"fetch\(")
_SNAPSHOT_TOPOLOGY_RE = re.compile(r"snapshot\.(branches|buses)")
_TYPES_ENM_IMPORT_RE = re.compile(r"types/enm\b")


def _is_excluded_test_path(rel_posix: str, *, exclude_fixtures: bool = False) -> bool:
    parts = rel_posix.split("/")
    if "__tests__" in parts:
        return True
    if exclude_fixtures and "fixtures" in parts:
        return True
    name = parts[-1]
    if ".test." in name or ".spec." in name:
        return True
    return False


def _iter_ts_files(root: Path, *, exclude_fixtures: bool = False) -> list[Path]:
    files: list[Path] = []
    for candidate in sorted(root.rglob("*")):
        if not candidate.is_file() or candidate.suffix not in TS_SUFFIXES:
            continue
        rel_posix = candidate.relative_to(root).as_posix()
        if _is_excluded_test_path(rel_posix, exclude_fixtures=exclude_fixtures):
            continue
        files.append(candidate)
    return files


def _rel(path: Path) -> str:
    """Sciezka wzgledem REPO_ROOT do komunikatu — spada na sciezke absolutna,
    gdy `path` lezy POZA repo (metatest woła `check_*` na drzewie w tmp_path)."""
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _line_no(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _snippet(text: str, line_no: int) -> str:
    lines = text.splitlines()
    if 1 <= line_no <= len(lines):
        return lines[line_no - 1].strip()
    return ""


def check_r1(frontend_src: Path = FRONTEND_SRC) -> list[str]:
    """Zero importów martwych modułów slice E w całym frontend/src/** (poza testami)."""
    if not frontend_src.exists():
        return [f"[R1][brak-katalogu] {frontend_src} nie istnieje"]

    files = _iter_ts_files(frontend_src)
    if not files:
        return [f"[R1][pusty-skan] zero plikow .ts/.tsx pod {frontend_src} — sciezka skanu padla"]

    violations: list[str] = []
    for file_path in files:
        rel = _rel(file_path)
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        for match in _IMPORT_SPEC_RE.finditer(text):
            spec = match.group(2)
            for token in R1_BANNED_MODULE_TOKENS:
                if token in spec:
                    line_no = _line_no(text, match.start())
                    violations.append(
                        f"[R1] {rel}:{line_no}: import martwego modulu slice E "
                        f"({token!r} w '{spec}') — {_snippet(text, line_no)}"
                    )
                    break
    return violations


def check_r2(view_file: Path = LV_DOMAIN_VIEW_FILE) -> list[str]:
    """LvDomainViewProps: dokladnie jeden prop danych `projection: LvDomainProjectionV1`."""
    if not view_file.exists():
        return [f"[R2][brak-pliku] {view_file} nie istnieje"]

    rel = _rel(view_file)
    text = view_file.read_text(encoding="utf-8", errors="ignore")

    interface_match = re.search(
        r"export\s+interface\s+LvDomainViewProps\s*\{(.*?)\n\}", text, re.DOTALL
    )
    if interface_match is None:
        return [
            f"[R2] {rel}: interfejs LvDomainViewProps nie znaleziony (regex na blok interfejsu padl)"
        ]

    block = interface_match.group(1)
    block_start_line = _line_no(text, interface_match.start())

    prop_names = re.findall(r"readonly\s+([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:", block)

    violations: list[str] = []

    if not re.search(r"readonly\s+projection\s*:\s*LvDomainProjectionV1\b", block):
        violations.append(
            f"[R2] {rel}:{block_start_line}: brak `readonly projection: LvDomainProjectionV1` "
            f"w interfejsie LvDomainViewProps"
        )

    for banned in R2_BANNED_PROPS:
        if banned in prop_names:
            prop_match = re.search(rf"readonly\s+{re.escape(banned)}\s*\??\s*:", block)
            offset = interface_match.start(1) + (prop_match.start() if prop_match else 0)
            line_no = _line_no(text, offset)
            violations.append(
                f"[R2] {rel}:{line_no}: zakazany prop `{banned}` w LvDomainViewProps "
                f"(kontrakt = wylacznie `projection`, reszta liczy sie WEWNATRZ komponentu)"
            )

    return violations


def check_r3(
    lv_domain_dir: Path = LV_DOMAIN_DIR, projection_api_file: Path = PROJECTION_API_FILE
) -> list[str]:
    """Zero fetch( poza projectionApi.ts; projectionApi.ts ma DOKLADNIE jeden fetch(."""
    if not lv_domain_dir.exists():
        return [f"[R3][brak-katalogu] {lv_domain_dir} nie istnieje"]
    if not projection_api_file.exists():
        return [f"[R3][brak-pliku] {projection_api_file} nie istnieje"]

    files = _iter_ts_files(lv_domain_dir, exclude_fixtures=True)
    if not files:
        return [f"[R3][pusty-skan] zero plikow .ts/.tsx pod {lv_domain_dir} — sciezka skanu padla"]

    violations: list[str] = []
    api_rel = _rel(projection_api_file)

    for file_path in files:
        rel = _rel(file_path)
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        matches = list(_FETCH_CALL_RE.finditer(text))
        if file_path == projection_api_file:
            if len(matches) != 1:
                violations.append(
                    f"[R3] {api_rel}: oczekiwano DOKLADNIE 1 wywolania fetch(, znaleziono {len(matches)} "
                    f"— jedyny klient sieciowy domeny nN ma miec jedno zadanie"
                )
            continue
        for match in matches:
            line_no = _line_no(text, match.start())
            violations.append(
                f"[R3] {rel}:{line_no}: fetch( poza projectionApi.ts "
                f"— {_snippet(text, line_no)}"
            )

    return violations


def check_r4(lv_domain_dir: Path = LV_DOMAIN_DIR) -> list[str]:
    """Zero rekonstrukcji topologii z ENM w warstwie domeny nN (poza testami)."""
    if not lv_domain_dir.exists():
        return [f"[R4][brak-katalogu] {lv_domain_dir} nie istnieje"]

    files = _iter_ts_files(lv_domain_dir)
    if not files:
        return [f"[R4][pusty-skan] zero plikow .ts/.tsx pod {lv_domain_dir} — sciezka skanu padla"]

    violations: list[str] = []
    for file_path in files:
        rel = _rel(file_path)
        text = file_path.read_text(encoding="utf-8", errors="ignore")

        for match in _IMPORT_SPEC_RE.finditer(text):
            if _TYPES_ENM_IMPORT_RE.search(match.group(2)):
                line_no = _line_no(text, match.start())
                violations.append(
                    f"[R4] {rel}:{line_no}: import modelu sieci ENM (`types/enm`) w warstwie domeny nN "
                    f"— topologia ma przyjsc GOTOWA w projekcji, nie byc odtwarzana z ENM w UI "
                    f"— {_snippet(text, line_no)}"
                )

        for match in _SNAPSHOT_TOPOLOGY_RE.finditer(text):
            line_no = _line_no(text, match.start())
            violations.append(
                f"[R4] {rel}:{line_no}: wzorzec rekonstrukcji topologii z ENM (`{match.group(0)}`) "
                f"— {_snippet(text, line_no)}"
            )

    return violations


def check_r5(workspace_file: Path = WORKSPACE_FILE) -> list[str]:
    """SldCanvasV3Workspace.tsx: zero importow legacy; zero fetch bezposredniego do /swz lub /lv-domain."""
    if not workspace_file.exists():
        return [f"[R5][brak-pliku] {workspace_file} nie istnieje"]

    rel = _rel(workspace_file)
    text = workspace_file.read_text(encoding="utf-8", errors="ignore")

    violations: list[str] = []

    r5_tokens = ("useSwzOverlay", "nnCircuitResults", "StationInternalView")
    for match in _IMPORT_SPEC_RE.finditer(text):
        spec = match.group(2)
        for token in r5_tokens:
            if token in spec:
                line_no = _line_no(text, match.start())
                violations.append(
                    f"[R5] {rel}:{line_no}: import martwego modulu slice E ({token!r} w '{spec}') "
                    f"— droga do domeny nN jest WYLACZNIE przez LvDomainPortal "
                    f"— {_snippet(text, line_no)}"
                )
                break

    for match in _FETCH_CALL_RE.finditer(text):
        window = text[match.start() : match.start() + 400]
        endpoint_match = re.search(r"""[`'"][^`'"]*/(swz|lv-domain)[^`'"]*[`'"]""", window)
        if endpoint_match is not None:
            line_no = _line_no(text, match.start())
            violations.append(
                f"[R5] {rel}:{line_no}: fetch( bezposrednio do '/{endpoint_match.group(1)}' "
                f"z pominieciem LvDomainPortal — {_snippet(text, line_no)}"
            )

    return violations


RULES: tuple[tuple[str, object], ...] = (
    ("R1", check_r1),
    ("R2", check_r2),
    ("R3", check_r3),
    ("R4", check_r4),
    ("R5", check_r5),
)


def main() -> int:
    violations: list[str] = []
    for _label, check_fn in RULES:
        violations.extend(check_fn())  # type: ignore[operator]

    if violations:
        print("LV Domain Projection Guard — naruszenia:")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("LV Domain Projection Guard — czysto (R1-R5).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
