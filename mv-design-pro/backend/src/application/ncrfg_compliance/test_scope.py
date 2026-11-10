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



def zakres_badan_z_modelu(
    enm: "EnergyNetworkModel",
    *,
    operator_id: str,
) -> dict[str, Any]:
    """Wyłącznie dla PGM z proceduralnie ustaloną wersją 3.0.

    Jest to wspólny ENM/model_bridge i centralna klasyfikacja; żaden test
    własny w tej funkcji nie wydaje pozytywnego Werdyktu.
    """
    from catalog.profiles.nc_rfg import klasyfikacja_modulu
    from enm.models import EnergyNetworkModel
    from .bieg import wejscia_ncrfg_przypadku
    from .regulatory_effectivity import wybierz_procedure

    model = wejscia_ncrfg_przypadku(
        enm, operator_id=operator_id, case_id="zakres-badan-ptpiree"
    )
    generators = {g.ref_id: g for g in enm.generators}
    results: list[dict[str, Any]] = []
    for mod in model.modules:
        if mod.der_kind == "BESS":
            results.append({
                "der_ref": mod.der_ref,
                "status": "POZA_NC_RFG_MAGAZYN",
                "podstawa_pl": "Samodzielny BESS — wymogi krajowe i warunki przyłączenia.",
            })
            continue
        typ = klasyfikacja_modulu(mod.p_max_kw, mod.voltage_kv).modul
        if typ is None:
            results.append({
                "der_ref": mod.der_ref,
                "status": "PONIZEJ_PROGU_NC_RFG",
            })
            continue
        gen = generators[mod.der_ref]
        procedure = wybierz_procedure(typ, gen.wydarzenia_regulacyjne)
        if procedure.status != "USTALONO" or procedure.wydanie != "3.0":
            results.append({
                "der_ref": mod.der_ref, "typ": typ,
                "status": "NIEUSTALONA_PODSTAWA_PROGRAMU_BADAN",
                "przyczyna_pl": procedure.powod_pl,
                "brakujace": list(procedure.dane_brakujace),
            })
            continue
        # Tylko po stronie istniejącego model_bridge PPM — SyPGM w odrębnym
        # rejestrze z powodu braku synchronicznego generatora w tej ścieżce.
        if mod.module_family != "PPM":
            results.append({
                "der_ref": mod.der_ref, "typ": typ,
                "status": "RODZINA_NIEOBSLUGIWANA",
            })
            continue
        table = zakres_badan(typ, "PPM")
        results.append({
            "der_ref": mod.der_ref, "typ": typ,
            "status": "ZAKRES_TESTOW_NIE_ICH_WYKONANIE",
            "zrodlo": table.podstawa,
            "punkty": [x.model_dump(mode="json") for x in table.punkty],
            "ostrzegam": (
                "Brak zweryfikowanego programu ramowego i wyników wykonanych "
                "prób w tej odpowiedzi; wykluczone formalne SPEŁNIA."
            ),
        })
    return {
        "operator_id": operator_id,
        "wersja_procedury_tabeli": "3.0",
        "wyniki": results,
        "pominiete": [p.model_dump(mode="json") for p in model.pominiete],
        "wynik_formalny": "NIE_OCENIONO",
    }
