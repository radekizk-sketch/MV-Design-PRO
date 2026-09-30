"""Budowniczy REALNYCH skoroszytów XLSX w kontrakcie importera (W1) — JEDNO źródło
kształtu arkusza dla testów importera, końcówek HTTP, wyroczni pandapower i fikstury
e2e (`tests/utils/generuj_arkusz_e2e.py`). Kontrakt kolumn: docstring
`application/xlsx_import/importer.py`.
"""

from __future__ import annotations

import io
import re
import zipfile
from datetime import UTC, datetime
from typing import Any

import openpyxl

NAGLOWEK_SZYN = ["id", "nazwa", "napięcie_kV"]
NAGLOWEK_LINII_TABLICZKA = [
    "id",
    "szyna_pocz",
    "szyna_kon",
    "typ",
    "długość_km",
    "rodzaj",
    "R_ohm_km",
    "X_ohm_km",
    "B_uS_km",
    "C_nF_km",
    "Un_kV",
    "I_dop_A",
    "T_max_C",
    "przekroj_mm2",
    "zyly",
]
NAGLOWEK_LINII_KATALOG = ["id", "szyna_pocz", "szyna_kon", "typ", "długość_km", "typ_katalogowy"]
NAGLOWEK_TRAFO_TABLICZKA = [
    "id",
    "szyna_HV",
    "szyna_LV",
    "Sn_MVA",
    "uk_pct",
    "Pk_kW",
    "grupa",
    "zaczep_min",
    "zaczep_max",
    "zaczep_krok_pct",
]
NAGLOWEK_TRAFO_KATALOG = ["id", "szyna_HV", "szyna_LV", "typ_katalogowy"]
NAGLOWEK_ZRODEL = ["id", "szyna", "typ", "Sk_MVA", "RX_ratio"]
NAGLOWEK_ODBIOROW = ["id", "szyna", "P_MW", "Q_Mvar"]

#: Tabliczka linii napowietrznej AFL-6 120 mm² 15 kV (dane inżyniera, nie karta producenta).
TABLICZKA_AFL_120: dict[str, Any] = {
    "typ": "AFL-6 120",
    "rodzaj": "LINIA",
    "R_ohm_km": 0.253,
    "X_ohm_km": 0.081,
    "B_uS_km": 2.8,
    "C_nF_km": None,
    "Un_kV": 15.0,
    "I_dop_A": 315.0,
    "T_max_C": None,
    "przekroj_mm2": 120.0,
    "zyly": None,
}
#: Tabliczka kabla YAKXS 3×120 mm² 15 kV.
TABLICZKA_KABEL_120: dict[str, Any] = {
    "typ": "YAKXS 3x120",
    "rodzaj": "KABEL",
    "R_ohm_km": 0.253,
    "X_ohm_km": 0.105,
    "B_uS_km": None,
    "C_nF_km": 250.0,
    "Un_kV": 15.0,
    "I_dop_A": 260.0,
    "T_max_C": 90.0,
    "przekroj_mm2": 120.0,
    "zyly": 3.0,
}
#: Tabliczka transformatora 400 kVA 15/0,4 kV Dyn11 (uk 6 %, Pk 4,6 kW, zaczepy ±2 × 2,5 %).
TABLICZKA_TRAFO_400: dict[str, Any] = {
    "Sn_MVA": 0.4,
    "uk_pct": 6.0,
    "Pk_kW": 4.6,
    "grupa": "Dyn11",
    "zaczep_min": -2,
    "zaczep_max": 2,
    "zaczep_krok_pct": 2.5,
}


def zbuduj_skoroszyt(
    arkusze: list[tuple[str, list[list[Any]]]], *, znacznik_czasu: datetime | None = None
) -> bytes:
    """Prawdziwy plik XLSX (bajty) z listy arkuszy; `znacznik_czasu` przypina metadane
    dokumentu (created/modified), żeby ten sam skoroszyt był bajt w bajt powtarzalny."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    if znacznik_czasu is not None:
        wb.properties.created = znacznik_czasu
        wb.properties.modified = znacznik_czasu
    for nazwa, wiersze in arkusze:
        ws = wb.create_sheet(nazwa)
        for wiersz in wiersze:
            ws.append(list(wiersz))
    bufor = io.BytesIO()
    wb.save(bufor)
    if znacznik_czasu is None:
        return bufor.getvalue()
    return _przepisz_zip_z_ustalonym_czasem(bufor.getvalue(), znacznik_czasu)


def _przepisz_zip_z_ustalonym_czasem(dane: bytes, znacznik_czasu: datetime) -> bytes:
    """XLSX to archiwum ZIP, a `zipfile` stempluje każdy wpis czasem zapisu — bez tego
    dwa identyczne skoroszyty różnią się bajtami nagłówków wpisów. Wpisy są przepisywane
    BEZ kompresji (ZIP_STORED), żeby plik nie zależał od wersji zlib maszyny."""
    czas = znacznik_czasu.timetuple()[:6]
    # openpyxl nadpisuje `dcterms:modified` czasem zapisu niezależnie od
    # `wb.properties.modified` — jedyne zmienne bajty skoroszytu, przypinane tutaj.
    znacznik_iso = znacznik_czasu.strftime("%Y-%m-%dT%H:%M:%SZ")
    bufor = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(dane)) as zrodlo, zipfile.ZipFile(bufor, "w") as cel:
        for wpis in zrodlo.infolist():
            tresc = zrodlo.read(wpis.filename)
            if wpis.filename == "docProps/core.xml":
                tresc = re.sub(
                    rb"(<dcterms:modified[^>]*>)[^<]*(</dcterms:modified>)",
                    lambda m: m.group(1) + znacznik_iso.encode("ascii") + m.group(2),
                    tresc,
                )
            nowy = zipfile.ZipInfo(wpis.filename, date_time=czas)
            nowy.compress_type = zipfile.ZIP_STORED
            nowy.external_attr = wpis.external_attr
            cel.writestr(nowy, tresc)
    return bufor.getvalue()


def wiersz_linii_tabliczka(
    identyfikator: str,
    szyna_pocz: str,
    szyna_kon: str,
    dlugosc_km: float,
    tabliczka: dict[str, Any] = TABLICZKA_AFL_120,
    **nadpisania: Any,
) -> list[Any]:
    dane = {**tabliczka, **nadpisania}
    return [identyfikator, szyna_pocz, szyna_kon, dane["typ"], dlugosc_km] + [
        dane[kolumna] for kolumna in NAGLOWEK_LINII_TABLICZKA[5:]
    ]


def wiersz_trafo_tabliczka(
    identyfikator: str,
    szyna_hv: str,
    szyna_lv: str,
    tabliczka: dict[str, Any] = TABLICZKA_TRAFO_400,
    **nadpisania: Any,
) -> list[Any]:
    dane = {**tabliczka, **nadpisania}
    return [identyfikator, szyna_hv, szyna_lv] + [
        dane[kolumna] for kolumna in NAGLOWEK_TRAFO_TABLICZKA[3:]
    ]


def arkusz_siec_sn(
    *,
    typ_katalogowy_linii: str | None = None,
    typ_katalogowy_trafo: str | None = None,
    znacznik_czasu: datetime | None = None,
) -> bytes:
    """GPZ 15 kV (B1) → L1 5 km → Stacja 1 (B2) → T1 15/0,4 kV → Stacja 1 nN (B3)
    z dwoma odbiorami; źródło systemowe Sk'' = 500 MVA, R/X = 0,1 na B1.

    Bez argumentów odcinek i transformator niosą PEŁNE tabliczki (typy projektu);
    `typ_katalogowy_*` wiąże element z typem katalogu statycznego.
    """
    if typ_katalogowy_linii is None:
        linie = [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)]
    else:
        linie = [NAGLOWEK_LINII_KATALOG, ["L1", "B1", "B2", "AFL-6 120", 5.0, typ_katalogowy_linii]]
    if typ_katalogowy_trafo is None:
        trafo = [NAGLOWEK_TRAFO_TABLICZKA, wiersz_trafo_tabliczka("T1", "B2", "B3")]
    else:
        trafo = [NAGLOWEK_TRAFO_KATALOG, ["T1", "B2", "B3", typ_katalogowy_trafo]]
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [
                    NAGLOWEK_SZYN,
                    ["B1", "GPZ 15 kV", 15.0],
                    ["B2", "Stacja 1", 15.0],
                    ["B3", "Stacja 1 nN", 0.4],
                ],
            ),
            ("Linie", linie),
            ("Trafo", trafo),
            ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
            (
                "Odbiory",
                [NAGLOWEK_ODBIOROW, ["O1", "B3", 0.25, 0.08], ["O2", "B3", 0.15, 0.02]],
            ),
        ],
        znacznik_czasu=znacznik_czasu,
    )


#: Znacznik czasu fikstury e2e — stały, żeby plik w repo był powtarzalny bajt w bajt.
ZNACZNIK_FIKSTURY_E2E = datetime(2026, 9, 9, 12, 0, 0, tzinfo=UTC)


def arkusz_fikstury_e2e() -> bytes:
    """Skoroszyt fikstury e2e `frontend/e2e/fixtures/arkusz-siec-sn.xlsx` — ta sama sieć,
    którą testują importer, końcówki HTTP i wyrocznia pandapower."""
    return arkusz_siec_sn(znacznik_czasu=ZNACZNIK_FIKSTURY_E2E)
