"""Ocena pola liniowego GPZ na karcie pola — lustro frontu i fikstura z wyniku backendu (karta
UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2).

PO CO. Model odczytu pól (`application.field_read_model` → `ocena_pola_liniowego`) niesie ocenę
pola wg klasy (`enm.pole_liniowe_gpz`), którą karta pola (`ui/field/OcenaPolaLiniowegoGpz.tsx`)
pokazuje bez własnej reguły. Typy frontu (`ui/field/useFieldReadModel.ts`) są lustrem dataclass
backendu — ten test przypina równość nazw pól i słownika wymogów (bez strażnika lustro dryfuje,
a pole dodane w backendzie znika z karty po cichu). Fikstura dla testu frontu
(`ui/field/__tests__/OcenaPolaLiniowegoGpz.test.tsx`) powstaje z `build_field_read_model` na
scenach budowanych operacjami domenowymi — front testuje kształt, który backend naprawdę wysyła.

ILOCZYN CECH fikstury: klasa {przyjęta z sieci, zadeklarowana} × pomiar AJEE {wymagany z rdzeniem
rozliczeniowym, wymagany bez rdzenia, niewymagany} × niezgodności {brak, jedna, dwie}
(sceny: Z.11 bez klasy z generacją 1 MW i odbiorem 5 MW — zestaw EAZ zapisany bez klasy niesie
SCO, a sieć za polem wskazuje klasę mieszaną; Z.11.1 dedykowane z generacją 1 MW i odbiorem 5 MW;
Z.10 odbiorcze z generacją 150 kW; Z.11 mieszane z generacją 1 MW i odbiorem 5 MW — zgodne).

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_oceny_pola_liniowego.py
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path
from typing import Any, get_args

from application.field_read_model import build_field_read_model
from enm.models import EnergyNetworkModel
from enm.pole_liniowe_gpz import (
    ModulZaPolem,
    NapiecieZwrotnePola,
    NiezgodnoscPolaLiniowego,
    ObwodFunkcjiPola,
    OcenaFunkcjiPola,
    OcenaPolaLiniowego,
)
from enm.zrodlo_napiecia_zerowego import KandydatZrodlaU0, ZrodloU0Pola
from network_model.catalog.bay_templates import (
    PozycjaProfiluEaz,
    WymogFunkcjiEaz,
    WymogFunkcjiWKlasie,
)
from network_model.catalog.obwody_wtorne_pola import (
    ObwodyWtornePola,
    StatusWeryfikacji,
    SygnalPola,
)

BACKEND = Path(__file__).resolve().parents[2]
FRONT = BACKEND.parent / "frontend" / "src" / "ui" / "field"
LUSTRO = FRONT / "useFieldReadModel.ts"
#: Lustro danych wzorca (profil EAZ, obwody wtórne) w API katalogu frontu.
LUSTRO_KATALOGU = FRONT.parent / "catalog" / "api.ts"
FIKSTURA = FRONT / "__tests__" / "fixtures" / "ocena_pola_liniowego.json"

SCENY = (
    ("z11_bez_klasy_generacja_i_odbior", "Z11", None, 1000, 5000),
    ("z11_1_dedykowane_z_odbiorem", "Z11_1", "DEDYKOWANE_WYTWORCY", 1000, 5000),
    ("z10_odbiorcze_z_generacja", "Z10", "ODBIORCZE", 150, 0),
    ("z11_mieszane_zgodne", "Z11", "MIESZANE", 1000, 5000),
)


def _pola_interfejsu(nazwa: str, plik: Path = LUSTRO) -> list[str]:
    zrodlo = plik.read_text(encoding="utf-8")
    m = re.search(rf"export interface {nazwa} \{{(.*?)\n\}}", zrodlo, re.S)
    assert m, f"brak interfejsu {nazwa} w {plik.name}"
    return re.findall(r"^  (?:readonly )?(\w+)\??:", m.group(1), re.M)


def test_lustro_frontu_ma_pola_dataclass_backendu():
    for interfejs, klasa in (
        ("OcenaPolaLiniowego", OcenaPolaLiniowego),
        ("OcenaFunkcjiPola", OcenaFunkcjiPola),
        ("ModulZaPolem", ModulZaPolem),
        ("NiezgodnoscPolaLiniowego", NiezgodnoscPolaLiniowego),
        ("ObwodFunkcjiPola", ObwodFunkcjiPola),
        ("NapiecieZwrotnePola", NapiecieZwrotnePola),
        # Decyzja właściciela 2026-10-29 pkt 4: źródło 3U₀ pola (kontrolka powiązania na karcie).
        ("ZrodloU0Pola", ZrodloU0Pola),
        ("KandydatZrodlaU0", KandydatZrodlaU0),
    ):
        assert _pola_interfejsu(interfejs) == [f.name for f in dataclasses.fields(klasa)], interfejs


#: Pola modelu wzorca, których karta pola NIE czyta z obwodów surowych: powiązania funkcji
#: przychodzą rozwiązane na aparatach pola (`ObwodFunkcjiPola`), a przypisania rdzeni poza EAZ
#: są w nich tłem walidatora szablonu, nie treścią karty.
_POMINIETE_W_LUSTRZE_OBWODOW = ("powiazania", "obwody_przekladnikow")


def test_lustro_frontu_danych_wzorca_rowne_modelom_backendu():
    for interfejs, model, pominiete in (
        ("SygnalPolaWzorca", SygnalPola, ()),
        ("WymogFunkcjiWKlasie", WymogFunkcjiWKlasie, ()),
        ("PozycjaProfiluEaz", PozycjaProfiluEaz, ()),
        ("ObwodyWtornePola", ObwodyWtornePola, _POMINIETE_W_LUSTRZE_OBWODOW),
    ):
        oczekiwane = [p for p in model.model_fields if p not in pominiete]
        assert _pola_interfejsu(interfejs, LUSTRO_KATALOGU) == oczekiwane, interfejs
    zrodlo = LUSTRO_KATALOGU.read_text(encoding="utf-8")
    m = re.search(r"export type StatusWeryfikacjiWzorca = ([^;]+);", zrodlo)
    assert m and re.findall(r"'([A-Z_]+)'", m.group(1)) == list(get_args(StatusWeryfikacji))


def test_slownik_wymogow_frontu_rowny_backendowi():
    zrodlo = LUSTRO.read_text(encoding="utf-8")
    m = re.search(r"  wymog: ([^;]+);", zrodlo)
    assert m, "brak pola wymog w OcenaFunkcjiPola"
    assert re.findall(r"'([A-Z_]+)'", m.group(1)) == list(get_args(WymogFunkcjiEaz))


def test_iniekcja_pole_spoza_backendu_czerwieni_porownanie():
    """Iniekcja: dodatkowe pole w interfejsie frontu daje rozjazd z dataclass."""
    zrodlo = LUSTRO.read_text(encoding="utf-8").replace(
        "  akcja_pl: string;\n", "  akcja_pl: string;\n  dodatkowe: string;\n", 1
    )
    m = re.search(r"export interface NiezgodnoscPolaLiniowego \{(.*?)\n\}", zrodlo, re.S)
    assert m
    pola = re.findall(r"^  (\w+)\??:", m.group(1), re.M)
    assert pola != [f.name for f in dataclasses.fields(NiezgodnoscPolaLiniowego)]


def przypadki() -> list[dict[str, Any]]:
    from tests.enm.test_pole_liniowe_gpz_ocena import _scena

    wynik = []
    for nazwa, wykonanie, klasa, generacja_kw, odbior_kw in SCENY:
        enm, pole = _scena(wykonanie, klasa, generacja_kw, odbior_kw, 0)
        odczyt = build_field_read_model("case-ocena", EnergyNetworkModel.model_validate(enm))
        rekord = next(f for f in odczyt["fields"] if f["bay_ref"] == pole["ref_id"])
        wynik.append({"nazwa": nazwa, "ocena": rekord["ocena_pola_liniowego"]})
    return wynik


def _tresc() -> str:
    return json.dumps(przypadki(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_oceny_rowna_backendowi():
    assert FIKSTURA.exists(), f"brak fikstury {FIKSTURA} — regeneracja: patrz docstring"
    assert (
        FIKSTURA.read_text(encoding="utf-8") == _tresc()
    ), "fikstura oceny pola liniowego nieaktualna — regeneracja: patrz docstring modułu"


def test_fikstura_pokrywa_iloczyn_cech():
    oceny = {p["nazwa"]: p["ocena"] for p in przypadki()}
    assert {o["klasa_przyjeta"] for o in oceny.values()} == {True, False}
    assert {(o["ajee_wymagany"], o["ajee_rdzen_obecny"]) for o in oceny.values()} == {
        (True, True),
        (True, False),
        (False, False),
    }
    assert {len(o["niezgodnosci"]) for o in oceny.values()} == {0, 1, 2}
    assert all(n["akcja_pl"] for o in oceny.values() for n in o["niezgodnosci"])
    statusy = {f["status"] for o in oceny.values() for f in o["oceny_funkcji"]}
    assert {"SPELNIA", "NIE_SPELNIA", "NIE_DOTYCZY"} <= statusy
    # 67N bez potwierdzonego źródła 3U₀ (sceny bez pola pomiaru napięcia Z.17) — nieoceniona.
    assert "NIE_OCENIONO" in statusy
    assert all(
        f["status"] == "NIE_OCENIONO" and f["wyjasnienie"]["czego_brakuje"]
        for o in oceny.values()
        for f in o["oceny_funkcji"]
        if f["kod"] == "67N"
    )
    assert statusy & {"BRAK_DOWODU", "NIEJEDNOZNACZNY"}


if __name__ == "__main__":
    FIKSTURA.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {FIKSTURA}")
