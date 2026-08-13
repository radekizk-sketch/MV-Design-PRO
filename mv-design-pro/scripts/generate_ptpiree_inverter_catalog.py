"""Generate the PTPiREE inverter index from official PDF lists.

The PDFs are source-of-truth certificate lists, not equipment datasheets. The
generated data therefore stores certificate identity and source location only.
Electrical parameters must still come from catalog cards.

JEDNO ZRODLO, DWIE PROJEKCJE
----------------------------
Jeden przebieg emituje DWA artefakty z tego samego zbioru wierszy:

1. frontend TS  — `frontend/src/ui/network-build/station-der/
   ptpireeCertifiedInverters.generated.ts` (picker urzadzen kreatora DER),
2. backend JSON — `backend/src/network_model/catalog/
   ptpiree_wykaz_snapshot.json` (znormalizowany snapshot wykazu, z ktorego
   `mv_ptpiree_catalog` stempluje `ptpiree_status` na rekordach katalogu).

Wczesniej backend mial WLASNY, recznie przepisany mini-snapshot (6 rekordow),
wiec kazde urzadzenie spoza tej szostki dostawalo status NIEPOWIAZANY mimo
obecnosci w wykazie. Oba artefakty musza pochodzic z tego samego przebiegu —
parytet pilnuje `backend/tests/network_model/catalog/
test_ptpiree_wykaz_snapshot.py`.

PDF-ow NIE MA w repozytorium, wiec dopoki nie zostana pobrane ponownie,
backendowy snapshot wyprowadza sie deterministycznie z juz zatwierdzonego
artefaktu TS (tryb `--from-generated-ts`); JSON wykazu siedzi w nim wprost
w `String.raw`.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SOURCE_PAGE_URL = "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"
WIPWC_1_3_URL = "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf"
WIPWC_1_2_URL = "https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf"


@dataclass(frozen=True)
class SourceConfig:
    key: str
    source_id: str
    source_version: str
    source_url: str
    expected_rows: int


SOURCES: tuple[SourceConfig, ...] = (
    SourceConfig(
        key="wipwc_1_3",
        source_id="ptpiree-wipwc-1-3-2026-05-08",
        source_version="WiPWC 1.3",
        source_url=WIPWC_1_3_URL,
        expected_rows=727,
    ),
    SourceConfig(
        key="wipwc_1_2",
        source_id="ptpiree-wipwc-1-2-2026-05-06",
        source_version="WiPWC 1.2",
        source_url=WIPWC_1_2_URL,
        expected_rows=8350,
    ),
)

HEADER_PREFIXES = (
    "Data publikacji",
    "Wykaz urządzeń",
    "List of",
    "Lp.",
    "Nr dokumentu",
    "Document number",
    "Data akceptacji",
    "Document Acceptance",
    "Manufacturer",
    "Manufacturer's",
    "Adres producenta",
    "Rodzaj Urządzenia",
    "/ Type of device",
    "Typ model",
    "Type model",
    "Zakres wymagań",
    "PPM:",
    "Scope of",
    "requirements PPM",
    "(A,B,C,D)",
    "Wersja",
    "oprogramowania",
    "Firmware version",
    "Urządzenie / Device",
    "Certyfikat / Certificate",
)

INVERTER_TERMS = (
    "falownik",
    "falowniki",
    "inwerter",
    "inverter",
    "microinverter",
    "mikroinwerter",
    "konwerter energii elektrycznej",
    "przekształtnik",
    "przeksztaltnik",
)

DEVICE_KIND_PATTERNS = (
    "Dwukierunkowy konwerter energii elektrycznej",
    "Falownik fotowoltaiczny z opcją akumulatora",
    "Falownik fotowoltaiczny z opcja akumulatora",
    "Hybrydowy falownik fotowoltaiczny",
    "Falownik fotowoltaiczny",
    "Falownik hybrydowy",
    "Inwerter hybrydowy",
    "Mikroinwerter",
    "Microinverter",
    "Falownik",
    "Inwerter",
    "Przekształtnik",
    "Przeksztaltnik",
)

DATE_RE = re.compile(r"\b\d{2}\.\d{2}\.\d{4}\b")
ROW_START_RE = re.compile(r"^(\d{1,5})(?:\s+|$)(.*)")
WOS_RE = re.compile(r"\bWOS\s+(2018|2025)\b", re.IGNORECASE)
MODULE_SCOPE_RE = re.compile(
    r"\s+(A\s*(?:,?\s*B)?(?:,?\s*C)?(?:,?\s*D)?|B\s*(?:,?\s*C)?(?:,?\s*D)?|C\s*(?:,?\s*D)?|D)\s+(.+)$",
    re.IGNORECASE,
)
BUSINESS_SUFFIX_RE = re.compile(
    r"^(.{1,180}?\b(?:"
    r"sp\.\s*z\s*o\.o\.|s\.a\.|gmbh|ag|oy|inc\.?|ltd\.?|co\.,?\s*ltd\.?|"
    r"s\.p\.a\.|spa|srl|s\.r\.l\.|b\.v\.|bv|a/s|aps|llc|sas|kft\."
    r"))\b",
    re.IGNORECASE,
)
ADDRESS_MARKERS = (
    " ul.",
    " No.",
    " Road",
    " Street",
    " Str.",
    " Benzstr.",
    " Runsorintie",
    " 1st ",
    " Room ",
    " Building ",
    " Polska",
    " China",
    " Chiny",
    " Deutschland",
    " Niemcy",
)


def normalize_line(value: str) -> str:
    text = " ".join(value.replace("\u00a0", " ").split())
    text = re.sub(r"(?i)\bfotowoltaiczn\s+y\b", "fotowoltaiczny", text)
    text = re.sub(r"(?i)\bfalownik\s+a\b", "falownika", text)
    text = re.sub(r"(?<=\w)-\s+(?=\w)", "-", text)
    return text


def strip_accents(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value) if not unicodedata.combining(char)
    )


def slug(value: str) -> str:
    base = strip_accents(value).lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base[:80] or "wpis"


def is_header_or_footer(line: str) -> bool:
    return line.startswith(HEADER_PREFIXES)


def extract_rows(pdf_path: Path, expected_rows: int) -> list[dict[str, object]]:
    # pypdf is required only for the PDF path. Importing it lazily keeps the
    # emission/derivation helpers (and their tests) usable without the optional
    # dependency — the PDFs are not in the repository anyway.
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - local tooling guard
        raise SystemExit("Install pypdf to regenerate the PTPiREE inverter catalog.") from exc

    reader = PdfReader(str(pdf_path))
    rows: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    expected_row = 1

    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = normalize_line(raw_line)
            if not line or is_header_or_footer(line):
                continue

            row_match = ROW_START_RE.match(line)
            if row_match and int(row_match.group(1)) == expected_row:
                if current is not None:
                    rows.append(current)
                rest = row_match.group(2).strip()
                current = {
                    "row": expected_row,
                    "page": page_number,
                    "lines": [rest] if rest else [],
                }
                expected_row += 1
                continue

            if current is not None:
                current["lines"].append(line)  # type: ignore[index, union-attr]

    if current is not None:
        rows.append(current)

    if len(rows) != expected_rows:
        raise ValueError(f"{pdf_path.name}: parsed {len(rows)} rows, expected {expected_rows}")
    return rows


def find_device_start(text: str) -> tuple[int, str] | None:
    lowered = text.lower()
    candidates: list[tuple[int, str]] = []
    for pattern in DEVICE_KIND_PATTERNS:
        index = lowered.find(pattern.lower())
        if index >= 0:
            candidates.append((index, text[index : index + len(pattern)].strip()))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])


def is_inverter_row(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in INVERTER_TERMS)


def extract_manufacturer(prefix: str) -> str:
    prefix = normalize_line(prefix)
    suffix_match = BUSINESS_SUFFIX_RE.search(prefix)
    if suffix_match:
        return normalize_line(suffix_match.group(1).rstrip(" ,"))

    for marker in ADDRESS_MARKERS:
        marker_index = prefix.find(marker)
        if marker_index > 3:
            return normalize_line(prefix[:marker_index].rstrip(" ,"))

    parts = prefix.split()
    if len(parts) <= 5:
        return prefix
    return normalize_line(" ".join(parts[:5]).rstrip(" ,"))


def split_model_scope(model_with_tail: str) -> tuple[str, list[str], str | None]:
    model_with_tail = normalize_line(model_with_tail)
    scope_match = MODULE_SCOPE_RE.search(model_with_tail)
    if not scope_match:
        return model_with_tail, [], None

    model = normalize_line(model_with_tail[: scope_match.start()])
    scope_text = scope_match.group(1)
    modules = [module for module in ("A", "B", "C", "D") if re.search(rf"\b{module}\b", scope_text)]
    firmware = normalize_line(scope_match.group(2)).rstrip(" ,") or None
    return model, modules, firmware


def parse_row(source: SourceConfig, row: dict[str, object]) -> dict[str, object] | None:
    lines = [line for line in row["lines"] if isinstance(line, str)]
    raw_text = normalize_line(" ".join(lines))
    if not is_inverter_row(raw_text):
        return None

    date_match = DATE_RE.search(raw_text)
    if not date_match:
        return None

    document_number = normalize_line(raw_text[: date_match.start()]).rstrip(" ,")
    acceptance_date = date_match.group(0)
    after_date = normalize_line(raw_text[date_match.end() :])

    wos_version = None
    wos_match = WOS_RE.match(after_date)
    if wos_match:
        wos_version = f"WOS {wos_match.group(1)}"
        after_date = normalize_line(after_date[wos_match.end() :])

    device_start = find_device_start(after_date)
    if device_start is None:
        return None

    device_index, device_kind = device_start
    manufacturer = extract_manufacturer(after_date[:device_index])
    model_text = normalize_line(after_date[device_index + len(device_kind) :])
    model, module_types, firmware = split_model_scope(model_text)
    if not model:
        model = f"pozycja PTPiREE {row['row']}"

    source_row = int(row["row"])
    item_id = f"ptpiree-{source.key.replace('_', '-')}-row-{source_row}-{slug(manufacturer)}-{slug(model)}"
    item = {
        "id": item_id,
        "sourceId": source.source_id,
        "sourceVersion": source.source_version,
        "sourceUrl": source.source_url,
        "sourcePage": int(row["page"]),
        "sourceRow": source_row,
        "documentNumber": document_number,
        "acceptanceDate": acceptance_date,
        "manufacturer": manufacturer,
        "deviceKind": device_kind,
        "model": model,
        "moduleTypes": module_types,
        "firmware": firmware,
        "certificateStatus": "ptpiree_verified",
        "electricalDataStatus": "requires_datasheet",
    }
    if wos_version:
        item["wosVersion"] = wos_version
    return item


def generate_items(pdf_paths: dict[str, Path]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for source in SOURCES:
        rows = extract_rows(pdf_paths[source.key], source.expected_rows)
        items.extend(item for row in rows if (item := parse_row(source, row)) is not None)
    return items


TS_PAYLOAD_RE = re.compile(
    r"const GENERATED_PTPIREE_INVERTER_JSON = String\.raw`\n(?P<payload>.*?)\n`;",
    re.DOTALL,
)

SNAPSHOT_SCHEMA = "ptpiree_wykaz_snapshot/v1"
BACKEND_SNAPSHOT_DEFAULT = Path("backend/src/network_model/catalog/ptpiree_wykaz_snapshot.json")
FRONTEND_ARTIFACT_PATH = (
    "frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters.generated.ts"
)
BACKEND_ARTIFACT_PATH = "backend/src/network_model/catalog/ptpiree_wykaz_snapshot.json"

PUBLICATION_DATE_RE = re.compile(r"/(\d{4}-\d{2}-\d{2})-")

# Mapping frontend camelCase -> backend snake_case. The backend snapshot stores
# the RAW row fields only; every matching key (folded manufacturer/model, split
# certificate condition) is derived at load time in `mv_ptpiree_catalog`, so the
# normalization rule has exactly one home.
SNAPSHOT_FIELDS: tuple[tuple[str, str], ...] = (
    ("id", "id"),
    ("source_id", "sourceId"),
    ("source_version", "sourceVersion"),
    ("source_url", "sourceUrl"),
    ("source_page", "sourcePage"),
    ("source_row", "sourceRow"),
    ("document_number", "documentNumber"),
    ("acceptance_date", "acceptanceDate"),
    ("manufacturer", "manufacturer"),
    ("device_kind", "deviceKind"),
    ("model", "model"),
    ("module_types", "moduleTypes"),
    ("firmware", "firmware"),
    ("wos_version", "wosVersion"),
    ("certificate_status", "certificateStatus"),
    ("electrical_data_status", "electricalDataStatus"),
)


def publication_date_from_source_url(source_url: str) -> str:
    """Publication date of a PTPiREE list, taken from the published file name.

    No guessing: a source URL without a date in its file name is an error, not
    a reason to invent one.
    """

    match = PUBLICATION_DATE_RE.search(source_url)
    if not match:
        raise ValueError(f"source URL without a publication date: {source_url!r}")
    return match.group(1)


def items_from_generated_ts(text: str) -> list[dict[str, Any]]:
    """Read back the row set embedded in the generated frontend artifact.

    The artifact stores the rows verbatim in a `String.raw` template, so the
    backend snapshot can be derived from it deterministically while the source
    PDFs are unavailable.
    """

    match = TS_PAYLOAD_RE.search(text)
    if not match:
        raise ValueError("generated TS artifact does not contain the PTPiREE payload")
    payload = match.group("payload").replace("\\`", "`").replace("\\${", "${")
    items = json.loads(payload)
    if not isinstance(items, list):
        raise ValueError("PTPiREE payload is not a list of rows")
    return items


def build_snapshot(items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Backend projection of the same rows that feed the frontend artifact."""

    rows = list(items)
    records = [
        {backend_key: row.get(frontend_key) for backend_key, frontend_key in SNAPSHOT_FIELDS}
        for row in rows
    ]
    records.sort(key=lambda record: str(record["id"]))

    sources: dict[str, dict[str, Any]] = {}
    for record in records:
        source_id = str(record["source_id"])
        source = sources.setdefault(
            source_id,
            {
                "source_id": source_id,
                "source_version": record["source_version"],
                "source_url": record["source_url"],
                "publication_date": publication_date_from_source_url(str(record["source_url"])),
                "record_count": 0,
            },
        )
        source["record_count"] += 1

    return {
        "schema": SNAPSHOT_SCHEMA,
        "generated_by": "scripts/generate_ptpiree_inverter_catalog.py",
        "derived_from": FRONTEND_ARTIFACT_PATH,
        "source_page_url": SOURCE_PAGE_URL,
        "record_count": len(records),
        "sources": sorted(sources.values(), key=lambda source: str(source["source_id"])),
        "records": records,
    }


def render_backend_snapshot(items: Iterable[dict[str, Any]]) -> str:
    """Deterministic JSON text of the backend snapshot.

    One record per line (canonical key order, no whitespace padding) so the
    artifact stays reviewable in a diff despite thousands of rows.
    """

    snapshot = build_snapshot(items)
    records = snapshot.pop("records")
    head = json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True)
    assert head.endswith("\n}"), "unexpected JSON header rendering"
    lines = [head[:-2].rstrip() + ",", '  "records": [']
    rendered = [
        "    " + json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        for record in records
    ]
    lines.append(",\n".join(rendered))
    lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def render_ts(items: Iterable[dict[str, object]]) -> str:
    json_text = json.dumps(list(items), ensure_ascii=False, indent=2)
    escaped_json_text = json_text.replace("`", "\\`").replace("${", "\\${")
    return "\n".join(
        [
            "/*",
            " * Generated by scripts/generate_ptpiree_inverter_catalog.py from official PTPiREE PDFs.",
            " * Do not edit rows manually; update the source PDFs and regenerate this file.",
            " *",
            " * DRUGA PROJEKCJA TYCH SAMYCH WIERSZY: " + BACKEND_ARTIFACT_PATH,
            " * (backendowy snapshot wykazu). Oba artefakty powstaja w jednym",
            " * przebiegu generatora i sa porownywane testem parytetu.",
            " */",
            "",
            "import type { PtpireeCertifiedInverterItem } from './ptpireeCertifiedInverters';",
            "",
            "const GENERATED_PTPIREE_INVERTER_JSON = String.raw`",
            escaped_json_text,
            "`;",
            "",
            "export const PTPIREE_GENERATED_CERTIFIED_INVERTERS: readonly PtpireeCertifiedInverterItem[] = Object.freeze(",
            "  JSON.parse(GENERATED_PTPIREE_INVERTER_JSON) as PtpireeCertifiedInverterItem[],",
            ");",
            "",
        ]
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wipwc-1-3-pdf", type=Path)
    parser.add_argument("--wipwc-1-2-pdf", type=Path)
    parser.add_argument(
        "--from-generated-ts",
        type=Path,
        help=(
            "Wyprowadz wiersze z zatwierdzonego artefaktu TS zamiast z PDF-ow "
            "(uzywane dopoki zrodlowych PDF-ow nie ma w repozytorium)."
        ),
    )
    parser.add_argument("--output", default=Path(FRONTEND_ARTIFACT_PATH), type=Path)
    parser.add_argument("--backend-output", default=BACKEND_SNAPSHOT_DEFAULT, type=Path)
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Nie przepisuj artefaktu TS (tryb wyprowadzenia samego snapshotu backendu).",
    )
    args = parser.parse_args()
    if args.from_generated_ts is None and (
        args.wipwc_1_3_pdf is None or args.wipwc_1_2_pdf is None
    ):
        parser.error(
            "podaj --from-generated-ts albo oba pliki PDF (--wipwc-1-3-pdf, --wipwc-1-2-pdf)"
        )
    return args


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    args = parse_args()
    if args.from_generated_ts is not None:
        items = items_from_generated_ts(args.from_generated_ts.read_text(encoding="utf-8"))
        origin = str(args.from_generated_ts)
    else:
        items = generate_items(
            {
                "wipwc_1_3": args.wipwc_1_3_pdf,
                "wipwc_1_2": args.wipwc_1_2_pdf,
            }
        )
        origin = "PTPiREE PDFs"

    if not args.skip_frontend:
        _write(args.output, render_ts(items))
        print(f"Generated {len(items)} PTPiREE records into {args.output}")

    _write(args.backend_output, render_backend_snapshot(items))
    print(f"Generated {len(items)} PTPiREE records into {args.backend_output} (from {origin})")


if __name__ == "__main__":
    main()
