"""Zweryfikowana str. 5-6 PTPiREE Procedura testowania v3.0, rozdział 4 tabela 1.

Tylko zakres PRÓB zgodności, nie wartości kryteriów i nie potwierdzenie testu.
JEDEN wykaz w data JSON; implementacja czyta ten wykaz (bez drugiej listy).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TypPgm = Literal["A", "B", "C", "D"]
RodzinaPgm = Literal["SYPGM", "PPM", "OFFSHORE_PPM"]
StanProby = Literal[
    "NONE", "TEST", "CERT_IF_AB", "TEST_OR_STATEMENT",
    "CONDITIONAL_WOS2018_P20", "CONDITIONAL_OPERATOR"
]
_ZRODLO = Path(__file__).parents[2] / "catalog" / "profiles" / "nc_rfg" / "ptpiree_v3_test_scope.json"
# __file__ = src/application/ncrfg_compliance/test_scope.py;
# parents[2] = backend/src (tak jak certificate_review.py).


class PozycjaZakresu(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    rodzina: str
    zdolnosc: str
    status: StanProby
    strona_pdf: int = Field(ge=5, le=6)
    opis_pl: str
    zrodlo_url: str
    dowod_certyfikatu_moze_zastapic_test: bool = False
    operator_decyduje: bool = False


class ZakresBadanPGM(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    typ: TypPgm
    rodzina: RodzinaPgm
    punkty: tuple[PozycjaZakresu, ...]
    status_formalny: Literal["ZAKRES_NIE_WYKONANIE"] = "ZAKRES_NIE_WYKONANIE"
    podstawa: str = "PTPiREE 3.0, rozdział 4, tabela 1, strony 5–6"
    opis_pl: str = (
        "Zakres oznacza rodzaj obowiązku przeprowadzenia testu zgodności, "
        "nie wynik badania ani spełnienie NC RfG. Wersja procedury zależy "
        "od daty oświadczenia gotowości. Program ramowy i WOS pozostają "
        "odrębnymi źródłami szczegółowych kryteriów."
    )


@lru_cache(maxsize=1)
def _tablica() -> dict[str, Any]:
    with _ZRODLO.open(encoding="utf-8") as f:
        data = json.load(f)
    if data.get("schema") != "ptpiree_v3_scope.v1":
        raise ValueError("Niepoprawny schemat źródłowej macierzy PTPiREE.")
    records = data.get("entries")
    if not isinstance(records, list) or len(records) < 20:
        raise ValueError("Źródłowa macierz testów PTPiREE jest niekompletna.")
    if len({(r["family"], r["ability"]) for r in records}) != len(records):
        raise ValueError("Powtórzona zdolność w źródłowej macierzy PTPiREE.")
    return data


def zakres_badan(typ: TypPgm, rodzina: RodzinaPgm) -> ZakresBadanPGM:
    """Przy 'NONE' brak zakresu TESTU wg tabeli, nie brak obowiązku normy."""
    if typ not in ("A", "B", "C", "D") or rodzina not in ("SYPGM", "PPM", "OFFSHORE_PPM"):
        raise ValueError("Nieznany typ/rodzina PGM.")
    source = _tablica()
    result: list[PozycjaZakresu] = []
    for item in source["entries"]:
        if item["family"] not in (rodzina, "ALL"):
            continue
        state: StanProby = item["statuses"][typ]
        result.append(PozycjaZakresu(
            rodzina=rodzina, zdolnosc=item["ability"], status=state,
            strona_pdf=item["pdf_page"],
            opis_pl=source["statuses_description"][state],
            zrodlo_url=source["source_url"],
            dowod_certyfikatu_moze_zastapic_test=state == "CERT_IF_AB",
            operator_decyduje=state in (
                "CONDITIONAL_OPERATOR", "CONDITIONAL_WOS2018_P20"
            ),
        ))
    return ZakresBadanPGM(typ=typ, rodzina=rodzina, punkty=tuple(result))
