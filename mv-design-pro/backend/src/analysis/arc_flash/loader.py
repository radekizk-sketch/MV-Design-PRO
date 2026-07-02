"""Ładowanie współczynników IEEE 1584-2018 z PLIKU DANYCH (proweniencja audytowalna).

Współczynniki są ładowane WYŁĄCZNIE z trwałego pliku danych w repozytorium
(``backend/data/norm_coefficients/norm_coefficients_ieee1584_iec60853.json``,
klucz ``ieee_1584_2018``). ŻADNA liczba nie jest rozsypana w kodzie — każdy
współczynnik ma jawne źródło, więc proweniencję można zaudytować.

PROWENIENCJA (UCZCIWA, bez zawyżania): wartości pochodzą z OPEN-SOURCE'OWEJ
implementacji MIT ``rwl/arcflash`` (GitHub), odwołującej się do kalkulatorów
IEEE DataPort — NIE z licencjonowanej kopii IEEE Std 1584-2018. Dlatego
proweniencja tablicy = :data:`TableProvenance.OPEN_SOURCE_IEEE_1584`. Gdy
właściciel dostarczy plik zweryfikowany z licencjonowaną normą, wystarczy
zmienić proweniencję na ``NORMA_IEEE_1584`` (przez ``override_provenance``) — kod
przepływu i ładowania NIE zmienia się.

Struktura pliku (klucz ``ieee_1584_2018``):
  - ``table1_intermediate_arcing_current_coefficients``: wiersze
    ``[config, V_oc, k1..k10]`` (15 = 5 konfiguracji × 3 kotwy 600/2700/14300 V).
  - ``table2_arcing_current_variation_coefficients``: ``[config, k1..k7]``.
  - ``table3/4/5_incident_energy_afb_{600,2700,14300}V``: ``[config, k1..k13]``.
  - ``table7_enclosure_size_correction``: ``[enclosure_type, config, b1,b2,b3]``.
  - ``sources``: wiersze z URL-ami do cytowania.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from analysis.arc_flash.models import (
    ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
    ArcCurrentCoeffs,
    ArcCurrentVariationCoeffs,
    ArcFlashCoefficientTable,
    ElectrodeConfig,
    EnclosureCorrectionCoeffs,
    EnclosureType,
    IncidentEnergyCoeffs,
    TableProvenance,
    VoltageAnchor,
)

# Ścieżka do trwałego pliku danych w repo: arc_flash → analysis → src → backend.
DATA_FILE = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "norm_coefficients"
    / "norm_coefficients_ieee1584_iec60853.json"
)

# Klucze tablic energii/AFB per kotwa (plik danych).
_ENERGY_TABLE_KEYS: dict[VoltageAnchor, str] = {
    VoltageAnchor.V600: "table3_incident_energy_afb_600V",
    VoltageAnchor.V2700: "table4_incident_energy_afb_2700V",
    VoltageAnchor.V14300: "table5_incident_energy_afb_14300V",
}


def _read_raw(path: Path | None = None) -> dict[str, Any]:
    p = path or DATA_FILE
    payload = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or "ieee_1584_2018" not in payload:
        raise ValueError(f"Plik danych IEEE 1584 nie zawiera klucza 'ieee_1584_2018': {p}")
    return payload


def _rows(table: dict[str, Any]) -> list[list[Any]]:
    rows = table.get("rows", [])
    return [row for row in rows if isinstance(row, list)]


def _source_urls(payload: dict[str, Any]) -> tuple[str, ...]:
    """Wyciąga URL-e ze ``sources`` (kolumna 'url') do cytowania na wyniku."""
    sources = payload.get("sources")
    if not isinstance(sources, dict):
        return ()
    headers = sources.get("headers", [])
    if "url" not in headers:
        return ()
    url_idx = headers.index("url")
    urls: list[str] = []
    for row in _rows(sources):
        if len(row) > url_idx and isinstance(row[url_idx], str):
            urls.append(row[url_idx])
    return tuple(urls)


def build_table_from_payload(
    payload: dict[str, Any],
    *,
    provenance: TableProvenance = TableProvenance.OPEN_SOURCE_IEEE_1584,
) -> ArcFlashCoefficientTable:
    """Buduje typowaną :class:`ArcFlashCoefficientTable` z surowego payloadu.

    KAŻDY współczynnik pochodzi z pliku danych — bez magicznych liczb w kodzie.
    Nierozpoznane konfiguracje/typy obudowy są pomijane (defensywnie), ale brak
    kompletu i tak wykryje ``is_complete_for`` w builderze (status incomplete).
    """
    ieee = payload["ieee_1584_2018"]

    arc_current: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs] = {}
    arc_variation: dict[ElectrodeConfig, ArcCurrentVariationCoeffs] = {}
    incident_energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs] = {}
    enclosure_correction: dict[tuple[EnclosureType, ElectrodeConfig], EnclosureCorrectionCoeffs] = (
        {}
    )

    # Tab. 1 — prąd łuku pośredni: [config, V_oc, k1..k10].
    voc_to_anchor = {anchor.voc_v: anchor for anchor in VoltageAnchor}
    for row in _rows(ieee["table1_intermediate_arcing_current_coefficients"]):
        cfg = _to_config(row[0])
        anchor = voc_to_anchor.get(int(row[1]))
        if cfg is None or anchor is None:
            continue
        k = tuple(float(v) for v in row[2:12])  # k1..k10 (10 wartości)
        arc_current[(cfg, anchor)] = ArcCurrentCoeffs(k=k)

    # Tab. 2 — zmienność prądu łuku: [config, k1..k7].
    for row in _rows(ieee["table2_arcing_current_variation_coefficients"]):
        cfg = _to_config(row[0])
        if cfg is None:
            continue
        k = tuple(float(v) for v in row[1:8])  # k1..k7 (7 wartości)
        arc_variation[cfg] = ArcCurrentVariationCoeffs(k=k)

    # Tab. 3/4/5 — energia incydentu / AFB per kotwa: [config, k1..k13].
    for anchor, table_key in _ENERGY_TABLE_KEYS.items():
        for row in _rows(ieee[table_key]):
            cfg = _to_config(row[0])
            if cfg is None:
                continue
            k = tuple(float(v) for v in row[1:14])  # k1..k13 (13 wartości)
            incident_energy[(cfg, anchor)] = IncidentEnergyCoeffs(k=k)

    # Tab. 7 — korekcja rozmiaru obudowy: [enclosure_type, config, b1,b2,b3].
    for row in _rows(ieee["table7_enclosure_size_correction"]):
        enc = _to_enclosure_type(row[0])
        cfg = _to_config(row[1])
        if enc is None or cfg is None:
            continue
        b = tuple(float(v) for v in row[2:5])  # b1,b2,b3 (3 wartości)
        enclosure_correction[(enc, cfg)] = EnclosureCorrectionCoeffs(b=b)

    return ArcFlashCoefficientTable(
        provenance=provenance,
        arc_current=arc_current,
        arc_variation=arc_variation,
        incident_energy=incident_energy,
        enclosure_correction=enclosure_correction,
        source_urls=_source_urls(payload),
        source_note_pl=ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
    )


def load_ieee_1584_table(
    path: Path | None = None,
    *,
    provenance: TableProvenance = TableProvenance.OPEN_SOURCE_IEEE_1584,
) -> ArcFlashCoefficientTable:
    """Ładuje tablicę współczynników IEEE 1584-2018 z pliku danych (lub ``path``).

    Domyślna proweniencja = ``OPEN_SOURCE_IEEE_1584`` (wartości open-source MIT
    rwl/arcflash). ``provenance`` można nadpisać na ``NORMA_IEEE_1584`` PO
    weryfikacji pliku z licencjonowaną normą — bez zmiany kodu przepływu.
    """
    payload = _read_raw(path)
    return build_table_from_payload(payload, provenance=provenance)


@lru_cache(maxsize=1)
def load_production_ieee_1584_table() -> ArcFlashCoefficientTable:
    """Tablica PRODUKCYJNA — wypełniona z trwałego pliku danych (open-source).

    Buforowana (deterministyczna; plik danych jest niezmienny w repo). To jest
    tablica, której domyślnie używa :class:`ArcFlashBuilder`. Liczy realny wynik,
    ale z proweniencją open-source (audit-pending), więc bramka OSD nadal blokuje
    użycie certyfikowane bez świadomej akceptacji.
    """
    return load_ieee_1584_table()


def _to_config(value: Any) -> ElectrodeConfig | None:
    try:
        return ElectrodeConfig(str(value))
    except ValueError:
        return None


def _to_enclosure_type(value: Any) -> EnclosureType | None:
    try:
        return EnclosureType(str(value))
    except ValueError:
        return None


# Tablica PRODUKCYJNA współczynników IEEE 1584-2018 — wypełniona z pliku danych
# (open-source MIT rwl/arcflash, audit-pending). Konsumenci importują tę
# instancję; liczy realny wynik z UCZCIWĄ proweniencją open-source.
PRODUCTION_IEEE_1584_TABLE: ArcFlashCoefficientTable = load_production_ieee_1584_table()


__all__ = [
    "DATA_FILE",
    "PRODUCTION_IEEE_1584_TABLE",
    "build_table_from_payload",
    "load_ieee_1584_table",
    "load_production_ieee_1584_table",
]
