from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INTERACTION_MATRIX_PATH = ROOT / "docs" / "v12xx" / "MACIERZ_INTERAKCJI.md"

REQUIRED_HEADERS = {
    "Obiekt",
    "Stan",
    "Klik",
    "2x klik",
    "Prawy klik",
    "Hover",
    "Skrot",
    "Efekt",
    "Okno docelowe",
    "ENM",
    "Wyniki",
    "Gotowosc",
}

REQUIRED_OBJECTS = {
    "Tlo SLD",
    "GPZ",
    "Sekcja szyn",
    "Pole SN",
    "Wylacznik",
    "Rozlacznik",
    "Odlacznik",
    "Uziemnik",
    "Bezpiecznik",
    "Przekladnik pradowy",
    "Przekladnik napieciowy",
    "Transformator",
    "Odcinek kablowy",
    "Odcinek napowietrzny",
    "ZKSN",
    "Slup rozgalezny",
    "Odgalezienie",
    "Punkt normalnie otwarty",
    "Stacja transformatorowa",
    "Strona nN",
    "Odplyw nN",
    "Obciazenie",
    "Zrodlo PV",
    "BESS",
    "Farma wiatrowa",
    "Transformator blokowy",
    "Etykieta wyniku",
    "Znacznik bledu",
    "Znacznik blokady",
    "Znacznik nieaktualnosci",
    "Znacznik uzasadnienia",
    "Znacznik jakosci danych",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def markdown_table_rows(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_headers: list[str] | None = None
    expecting_separator = False

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            current_headers = None
            expecting_separator = False
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if expecting_separator:
            if all(cell.replace("-", "").replace(":", "") == "" for cell in cells):
                expecting_separator = False
                continue
            current_headers = None
            expecting_separator = False

        if current_headers is None:
            current_headers = cells
            expecting_separator = True
            continue

        if len(cells) != len(current_headers):
            continue
        rows.append(dict(zip(current_headers, cells, strict=True)))

    return rows


def check_interaction_matrix() -> list[str]:
    if not INTERACTION_MATRIX_PATH.exists():
        return [
            f"[interaction-matrix-missing] {INTERACTION_MATRIX_PATH.relative_to(ROOT).as_posix()}"
        ]

    text = read_text(INTERACTION_MATRIX_PATH)
    rows = markdown_table_rows(text)
    if not rows:
        return ["[interaction-matrix-empty] MACIERZ_INTERAKCJI.md must contain a data table"]

    headers = set(rows[0].keys())
    violations: list[str] = []
    missing_headers = sorted(REQUIRED_HEADERS - headers)
    for header in missing_headers:
        violations.append(f"[interaction-matrix-header] missing column: {header}")

    object_names = {row.get("Obiekt", "").strip() for row in rows if row.get("Obiekt")}
    for object_name in sorted(REQUIRED_OBJECTS - object_names):
        violations.append(f"[interaction-matrix-object] missing object row: {object_name}")

    for row in rows:
        object_name = row.get("Obiekt", "").strip()
        if object_name not in REQUIRED_OBJECTS:
            continue
        for field in ("Klik", "2x klik", "Prawy klik", "Hover", "Okno docelowe"):
            value = row.get(field, "").strip()
            if not value:
                violations.append(
                    f"[interaction-matrix-field] {object_name} must define non-empty field: {field}"
                )

    return violations


def main() -> int:
    violations = check_interaction_matrix()
    if violations:
        print("interaction-matrix-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1

    print("interaction-matrix-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
