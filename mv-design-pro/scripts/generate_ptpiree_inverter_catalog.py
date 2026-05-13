"""Generate the frontend PTPiREE inverter index from official PDF lists.

The PDFs are source-of-truth certificate lists, not equipment datasheets. The
generated frontend data therefore stores certificate identity and source
location only. Electrical parameters must still come from catalog cards.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover - local tooling guard
    raise SystemExit("Install pypdf to regenerate the PTPiREE inverter catalog.") from exc


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
                current = {"row": expected_row, "page": page_number, "lines": [rest] if rest else []}
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


def render_ts(items: Iterable[dict[str, object]]) -> str:
    json_text = json.dumps(list(items), ensure_ascii=False, indent=2)
    escaped_json_text = json_text.replace("`", "\\`").replace("${", "\\${")
    return "\n".join(
        [
            "/*",
            " * Generated by scripts/generate_ptpiree_inverter_catalog.py from official PTPiREE PDFs.",
            " * Do not edit rows manually; update the source PDFs and regenerate this file.",
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--wipwc-1-3-pdf", required=True, type=Path)
    parser.add_argument("--wipwc-1-2-pdf", required=True, type=Path)
    parser.add_argument(
        "--output",
        default=Path("frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters.generated.ts"),
        type=Path,
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    items = generate_items(
        {
            "wipwc_1_3": args.wipwc_1_3_pdf,
            "wipwc_1_2": args.wipwc_1_2_pdf,
        }
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_ts(items), encoding="utf-8", newline="\n")
    print(f"Generated {len(items)} PTPiREE inverter/converter records into {args.output}")


if __name__ == "__main__":
    main()
