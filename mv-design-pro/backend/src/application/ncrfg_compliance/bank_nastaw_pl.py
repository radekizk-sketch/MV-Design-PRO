"""PTPiREE Bank Nastaw Polska 1.1: zatwierdzone wartości źródłowe A nn i B SN.

Źródło: Bank Nastaw dla Polski, wersja 1.1, 01.10.2024, od 01.11.2024,
załącznik WiPWC 1.3. Skan źródłowy zweryfikowano dla stron PDF 2 i 13.
Jest to REJESTR WARTOŚCI REFERENCYJNYCH — bez zmiany profilu ENEA, bez
uruchamiania automatycznego zabezpieczenia i bez potwierdzenia nastaw na PCC.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

TypUrzadzenia = Literal["A_NN", "B_SN"]
NastawaId = Literal["U_LT", "U_GT_1", "U_GT_2", "F_LT", "F_GT", "ROCOF"]
JednostkaNastawy = Literal["pu", "Hz", "Hz/s"]
_CATALOG = (
    Path(__file__).parents[2] / "catalog" / "profiles" / "nc_rfg" /
    "bank_nastaw_pl_2024_v1_1.json"
)


class NastawaReferencyjna(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    id: NastawaId
    wartosc: float = Field(gt=0)
    jednostka: JednostkaNastawy
    czas_s: float = Field(gt=0)
    tryb_czasu: Literal["ZWLOKA", "CZAS_MAKSYMALNY"]
    pdf_page: int = Field(ge=2, le=13)


class BankNastawReferencyjny(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    wariant: TypUrzadzenia
    wersja: str
    source_url: str
    data_obowiazywania: str
    nastawy: tuple[NastawaReferencyjna, ...]
    uwaga_normatywna: str
    zatwierdzenie_osd: Literal[False] = False


@lru_cache(maxsize=1)
def _source() -> dict[str, Any]:
    with _CATALOG.open(encoding="utf-8") as stream:
        data = json.load(stream)
    if data.get("schema") != "bank_nastaw_pl.v1" or len(data["profiles"]) != 2:
        raise ValueError("Niepełny katalog referencyjny Banku Nastaw PTPiREE.")
    return data


def bank_nastaw(wariant: TypUrzadzenia) -> BankNastawReferencyjny:
    src = _source()
    matching = [p for p in src["profiles"] if p["id"] == wariant]
    if len(matching) != 1:
        raise ValueError(f"Niezweryfikowany wariant Banku Nastaw: {wariant}.")
    profile = matching[0]
    return BankNastawReferencyjny(
        wariant=wariant,
        wersja=str(src["wersja"]),
        source_url=str(src["source_url"]),
        data_obowiazywania=str(src["obowiazuje_od"]),
        nastawy=tuple(NastawaReferencyjna.model_validate(x) for x in profile["ustawienia"]),
        uwaga_normatywna=(
            "Wartości referencyjne PTPiREE WiPWC 1.3, nie indywidualnie "
            "uzgodnione nastawy EAZ/PPC. Weryfikacja granic napięć i "
            "koordynacja FRT w punkcie przyłączenia są obowiązkowe; "
            "włączenie nastaw wymaga decyzji i testów projektu."
        ),
    )


def bank_nastaw_dla_przypadku(enm: "EnergyNetworkModel", *, operator_id: str) -> dict[str, Any]:
    """Jeden most ENM i klasyfikacja NC RfG, a nie katalog od urządzeń.
    
    B na SN i A na nn: źródłowy benchmark. Inne typy/napięcia NIEUSTALONE.
    """
    from .bieg import wejscia_ncrfg_przypadku
    from catalog.profiles.nc_rfg import klasyfikacja_modulu
    result = wejscia_ncrfg_przypadku(enm, operator_id=operator_id, case_id="bank-nastaw")
    entries: list[dict[str, Any]] = []
    for modul in result.modules:
        if modul.der_kind == "BESS":
            entries.append({"der_ref": modul.der_ref, "status": "POZA_NC_RFG_MAGAZYN"})
            continue
        typ = klasyfikacja_modulu(modul.p_max_kw, modul.voltage_kv).modul
        variant: TypUrzadzenia | None = None
        if typ == "A" and modul.voltage_kv < 1:
            variant = "A_NN"
        elif typ == "B" and 1 <= modul.voltage_kv < 110:
            variant = "B_SN"
        if variant is None:
            entries.append({
                "der_ref": modul.der_ref,
                "typ": typ, "status": "NIEZWERYFIKOWANY_WARIANT",
                "powod_pl": (
                    "Bank Nastaw dla tej klasy i tego napięcia nie został "
                    "jeszcze źródłowo zaimplementowany; brak domyślnych wartości."
                ),
            })
            continue
        entries.append({
            "der_ref": modul.der_ref,
            "typ": typ,
            "status": "WARTOSCI_REFERENCYJNE_BEZ_ZATWIERDZENIA_OSD",
            "bank": bank_nastaw(variant).model_dump(mode="json"),
        })
    return {
        "operator_id": operator_id,
        "wyniki": entries,
        "status_formalny": "NIE_ZATWIERDZONO_NASTAW",
    }
