"""Parytet reguły źródła napięcia zerowego 3U₀ (funkcja 67N) backend ↔ schemat SLD (karta
UX-04/POLE-LINIOWE-WZORZEC, decyzja właściciela 2026-10-29 pkt 4).

PO CO. Backend rozstrzyga warunek 67N pola (`enm.zrodlo_napiecia_zerowego.zrodlo_u0_pola` —
przypisanie funkcji przez szablon, odmowa operacji, ocena pola liniowego, walidator W064),
a schemat — z migawki modelu — to samo dla odniesienia „3U₀ ← przekładnik pola pomiaru
napięcia" przy przekaźniku i ostrzeżenia topologicznego 67N
(`frontend/src/ui/sld/v2/model/zrodloNapieciaZerowego.ts`). Dwie implementacje jednej reguły bez
wspólnego testu rozjadą się na pierwszym nowym przypadku. Ten plik generuje fiksturę przypadków
z WYNIKIEM BACKENDU (`potwierdzone`, `vt_ref`, `pole_zrodla_ref`, `kody_brakow`), a test frontu
(`ui/sld/v2/model/__tests__/zrodloNapieciaZerowego.parytet.test.ts`) liczy lustro na tych samych
polach modelu i porównuje. Strażnik niżej pilnuje, że fikstura równa się wynikowi backendu, że
słownik kodów braków i lista funkcji wymagających źródła są w obu językach te same.

ILOCZYN CECH: wykonanie pola {Z.10, Z.11.1} × pole pomiaru napięcia Z.17 w sekcji {obecne,
brak} × powiązanie {potwierdzone, brak} (sceny budowane operacjami domenowymi, jak fikstury
SLD) + iniekcje na modelu (model importowany albo przebudowany po powiązaniu): aparat
wskazany nie istnieje, wskazany aparat nie jest przekładnikiem napięciowym, przekładnik bez
uzwojenia otwartego trójkąta (własny przekładnik Z.11.1 w gwieździe), przekładnik z otwartym
trójkątem w polu, które nie mierzy napięcia szyn, przekładnik pola pomiaru napięcia innej
sekcji, pole bez przekładnika Ferrantiego, własny przekładnik pola z otwartym trójkątem.

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_zrodla_u0.py
"""

from __future__ import annotations

import copy
import json
import re
from functools import cache
from pathlib import Path
from typing import Any, get_args

from enm.zrodlo_napiecia_zerowego import KodBrakuZrodlaU0, zrodlo_u0_pola
from network_model.catalog.bay_templates import WARUNEK_ZRODLA_U0, WARUNKI_FUNKCJI_EAZ

from tests.reference_networks.scena_geometrii_stacji import (
    dodaj_pole_pomiaru_napiecia_z17,
    zbuduj_gpz_pola_liniowe,
)

BACKEND = Path(__file__).resolve().parents[2]
LUSTRO = BACKEND.parent / "frontend/src/ui/sld/v2/model/zrodloNapieciaZerowego.ts"
FIKSTURA = LUSTRO.parent / "__tests__/fixtures/parytet_zrodla_u0.json"

#: Pola rekordu pola czytane przez regułę (i jej lustro) — fikstura niesie tylko je.
_POLA_POLA = (
    "ref_id",
    "name",
    "bay_number",
    "bus_ref",
    "bay_role",
    "funkcja_pomiaru",
    "zrodlo_u0_ref",
    "protection_codes",
)
_POLA_APARATU = ("device_ref", "kind", "designation")


def _pole_fikstury(pole: dict[str, Any]) -> dict[str, Any]:
    return {
        **{klucz: pole.get(klucz) for klucz in _POLA_POLA},
        "primary_devices": [
            {
                **{klucz: aparat.get(klucz) for klucz in _POLA_APARATU},
                "uzwojenia": [
                    {"otwarty_trojkat": bool(u.get("otwarty_trojkat"))}
                    for u in aparat.get("uzwojenia") or []
                ],
            }
            for aparat in pole.get("primary_devices") or []
        ],
    }


def _sekcje(enm: dict[str, Any]) -> list[str]:
    return sorted({b["gpz_section_id"] for b in enm["bays"] if b.get("gpz_section_id")})


def _pole_liniowe(enm: dict[str, Any], sekcja: str, indeks: int = 0) -> dict[str, Any]:
    pola = sorted(
        (
            b
            for b in enm["bays"]
            if b.get("gpz_section_id") == sekcja and "gpz_line_field" in (b.get("tags") or [])
        ),
        key=lambda b: b["ref_id"],
    )
    return pola[indeks]


def _pole_z17(enm: dict[str, Any], sekcja_bus: str) -> dict[str, Any]:
    return next(
        b
        for b in enm["bays"]
        if b.get("funkcja_pomiaru") == "NAPIECIA_SZYN" and b.get("bus_ref") == sekcja_bus
    )


def _aparat(pole: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    return next(a for a in pole["primary_devices"] if a["kind"] == rodzaj)


@cache
def _scena(wykonanie: str) -> dict[str, Any]:
    """GPZ z dwiema sekcjami: sekcja 1 — pole Z.17 i powiązane pola liniowe wykonania
    ``wykonanie``; sekcja 2 — pola tego samego wykonania bez pola Z.17 w sekcji."""
    klasa = "MIESZANE" if wykonanie == "Z11_1" else None
    return zbuduj_gpz_pola_liniowe(
        {1: (wykonanie, "TROJPOLOZENIOWY", klasa), 2: (wykonanie, "TROJPOLOZENIOWY", klasa)},
        sekcje_pomiaru_napiecia=(1,),
    )


def _przypadek(nazwa: str, enm: dict[str, Any], pole_ref: str) -> dict[str, Any]:
    pole = next(b for b in enm["bays"] if b["ref_id"] == pole_ref)
    wynik = zrodlo_u0_pola(enm, pole)
    return {
        "nazwa": nazwa,
        "pole_ref": pole_ref,
        "bays": [_pole_fikstury(b) for b in enm["bays"]],
        "oczekiwane": {
            "potwierdzone": wynik.potwierdzone,
            "vt_ref": wynik.vt_ref,
            "pole_zrodla_ref": wynik.pole_zrodla_ref,
            "kody_brakow": list(wynik.kody_brakow),
        },
    }


def _z_powiazaniem(enm: dict[str, Any], pole_ref: str, zrodlo: str | None) -> dict[str, Any]:
    wynik = copy.deepcopy(enm)
    for pole in wynik["bays"]:
        if pole["ref_id"] == pole_ref:
            pole["zrodlo_u0_ref"] = zrodlo
    return wynik


def przypadki() -> list[dict[str, Any]]:
    wynik: list[dict[str, Any]] = []
    for wykonanie in ("Z10", "Z11_1"):
        enm = _scena(wykonanie)
        sekcja_1, sekcja_2 = _sekcje(enm)
        pole_1 = _pole_liniowe(enm, sekcja_1)
        pole_2 = _pole_liniowe(enm, sekcja_2)
        z17_1 = _pole_z17(enm, pole_1["bus_ref"])
        vt_z17_1 = _aparat(z17_1, "VT")["device_ref"]
        prefiks = wykonanie.lower()
        # Iloczyn: Z.17 obecne × potwierdzone (operacje domenowe).
        wynik.append(_przypadek(f"{prefiks}_z17_obecne_potwierdzone", enm, pole_1["ref_id"]))
        # Z.17 brak w sekcji × brak powiązania (sekcja 2 sceny).
        wynik.append(_przypadek(f"{prefiks}_z17_brak_bez_powiazania", enm, pole_2["ref_id"]))
        # Z.17 obecne × brak powiązania: pole Z.17 dodane do sekcji 2 operacją użytkownika.
        enm_z17_2, vt_z17_2 = dodaj_pole_pomiaru_napiecia_z17(copy.deepcopy(enm), sekcja_2)
        wynik.append(
            _przypadek(f"{prefiks}_z17_obecne_bez_powiazania", enm_z17_2, pole_2["ref_id"])
        )
        # Z.17 brak w sekcji × powiązanie (model importowany): przekładnik innej sekcji.
        wynik.append(
            _przypadek(
                f"{prefiks}_iniekcja_zrodlo_innej_sekcji",
                _z_powiazaniem(enm, pole_2["ref_id"], vt_z17_1),
                pole_2["ref_id"],
            )
        )
        # Powiązanie nieaktualne: pole Z.17 usunięte z modelu po powiązaniu.
        bez_z17 = copy.deepcopy(enm)
        bez_z17["bays"] = [b for b in bez_z17["bays"] if b["ref_id"] != z17_1["ref_id"]]
        wynik.append(_przypadek(f"{prefiks}_iniekcja_aparat_nieobecny", bez_z17, pole_1["ref_id"]))
        # Wskazany aparat pola Z.17 nie jest przekładnikiem napięciowym (łącznik Q1).
        wynik.append(
            _przypadek(
                f"{prefiks}_iniekcja_aparat_nie_jest_vt",
                _z_powiazaniem(
                    enm, pole_1["ref_id"], _aparat(z17_1, "THREE_POSITION_SWITCH")["device_ref"]
                ),
                pole_1["ref_id"],
            )
        )
        # Przekładnik pola Z.17 bez uzwojenia otwartego trójkąta (tabliczka przebudowana).
        bez_trojkata = copy.deepcopy(enm)
        for uzwojenie in _aparat(_pole_z17(bez_trojkata, pole_1["bus_ref"]), "VT")["uzwojenia"]:
            uzwojenie["otwarty_trojkat"] = False
        wynik.append(
            _przypadek(f"{prefiks}_iniekcja_bez_otwartego_trojkata", bez_trojkata, pole_1["ref_id"])
        )
        # Pole bez przekładnika Ferrantiego (kryterium prądowe I0).
        bez_ferrantiego = copy.deepcopy(enm)
        for pole in bez_ferrantiego["bays"]:
            if pole["ref_id"] == pole_1["ref_id"]:
                pole["primary_devices"] = [
                    a for a in pole["primary_devices"] if a["kind"] != "CORE_BALANCE_CT"
                ]
        wynik.append(
            _przypadek(f"{prefiks}_iniekcja_bez_ferrantiego", bez_ferrantiego, pole_1["ref_id"])
        )
        # Bez Ferrantiego i bez pola Z.17 — oba składniki braku naraz (kolejność kodów).
        oba = copy.deepcopy(bez_ferrantiego)
        for pole in oba["bays"]:
            if pole["ref_id"] == pole_1["ref_id"]:
                pole["zrodlo_u0_ref"] = None
        oba["bays"] = [b for b in oba["bays"] if b["ref_id"] != z17_1["ref_id"]]
        wynik.append(
            _przypadek(f"{prefiks}_iniekcja_bez_ferrantiego_i_bez_z17", oba, pole_1["ref_id"])
        )
        assert vt_z17_2 != vt_z17_1
    # Z.11.1: własny przekładnik pola (trzy uzwojenia w gwieździe 0,1/√3, decyzja właściciela
    # pkt 1) — wskazany jako źródło nie mierzy 3U₀.
    enm = _scena("Z11_1")
    sekcja_1, sekcja_2 = _sekcje(enm)
    pole_1 = _pole_liniowe(enm, sekcja_1)
    pole_drugie = _pole_liniowe(enm, sekcja_1, 1)
    vt_wlasny = _aparat(pole_1, "VT")["device_ref"]
    wynik.append(
        _przypadek(
            "z11_1_iniekcja_wlasny_vt_w_gwiezdzie",
            _z_powiazaniem(enm, pole_1["ref_id"], vt_wlasny),
            pole_1["ref_id"],
        )
    )
    # Przekładnik z otwartym trójkątem w INNYM polu liniowym (pole nie mierzy napięcia szyn).
    z_trojkatem = copy.deepcopy(enm)
    for pole in z_trojkatem["bays"]:
        if pole["ref_id"] == pole_drugie["ref_id"]:
            _aparat(pole, "VT")["uzwojenia"][-1]["otwarty_trojkat"] = True
    vt_drugi = _aparat(pole_drugie, "VT")["device_ref"]
    wynik.append(
        _przypadek(
            "z11_1_iniekcja_pole_nie_mierzy_szyn",
            _z_powiazaniem(z_trojkatem, pole_1["ref_id"], vt_drugi),
            pole_1["ref_id"],
        )
    )
    # Własny przekładnik pola z otwartym trójkątem — źródło w tym samym polu (potwierdzone).
    wlasny_trojkat = copy.deepcopy(enm)
    for pole in wlasny_trojkat["bays"]:
        if pole["ref_id"] == pole_1["ref_id"]:
            _aparat(pole, "VT")["uzwojenia"][-1]["otwarty_trojkat"] = True
    wynik.append(
        _przypadek(
            "z11_1_wlasny_vt_z_otwartym_trojkatem",
            _z_powiazaniem(wlasny_trojkat, pole_1["ref_id"], vt_wlasny),
            pole_1["ref_id"],
        )
    )
    return wynik


def _tresc() -> str:
    dane = {
        "funkcje_wymagajace_zrodla_u0": sorted(
            kod for kod, warunek in WARUNKI_FUNKCJI_EAZ.items() if warunek == WARUNEK_ZRODLA_U0
        ),
        "kody_brakow": list(get_args(KodBrakuZrodlaU0)),
        "przypadki": przypadki(),
    }
    return json.dumps(dane, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_parytetu_zrodla_u0_rowna_backendowi():
    assert FIKSTURA.exists(), f"brak fikstury {FIKSTURA} — regeneracja: patrz docstring"
    assert (
        FIKSTURA.read_text(encoding="utf-8") == _tresc()
    ), "fikstura parytetu źródła 3U₀ nieaktualna — regeneracja: patrz docstring modułu"


def test_lustro_frontu_ma_te_same_kody_brakow_i_funkcje():
    zrodlo = LUSTRO.read_text(encoding="utf-8")
    unia = re.search(r"export type KodBrakuZrodlaU0 =(.*?);", zrodlo, re.S)
    assert unia, "brak typu KodBrakuZrodlaU0 w lustrze frontu"
    assert re.findall(r"'([A-Z_]+)'", unia.group(1)) == list(get_args(KodBrakuZrodlaU0))
    funkcje = re.search(r"FUNKCJE_WYMAGAJACE_ZRODLA_U0: readonly string\[\] = \[(.*?)\]", zrodlo)
    assert funkcje, "brak listy FUNKCJE_WYMAGAJACE_ZRODLA_U0 w lustrze frontu"
    assert sorted(re.findall(r"'([^']+)'", funkcje.group(1))) == sorted(
        kod for kod, warunek in WARUNKI_FUNKCJI_EAZ.items() if warunek == WARUNEK_ZRODLA_U0
    )


def test_przypadki_pokrywaja_kazdy_kod_braku_i_oba_wyniki():
    wynik = przypadki()
    kody = {kod for p in wynik for kod in p["oczekiwane"]["kody_brakow"]}
    assert kody == set(get_args(KodBrakuZrodlaU0)), "każdy kod braku ma przypadek parytetu"
    assert {p["oczekiwane"]["potwierdzone"] for p in wynik} == {True, False}
    po_nazwie = {p["nazwa"]: p["oczekiwane"] for p in wynik}
    for wykonanie in ("z10", "z11_1"):
        assert po_nazwie[f"{wykonanie}_z17_obecne_potwierdzone"]["potwierdzone"] is True
        assert po_nazwie[f"{wykonanie}_z17_obecne_bez_powiazania"]["kody_brakow"] == [
            "BRAK_POWIAZANIA"
        ]
        assert po_nazwie[f"{wykonanie}_z17_brak_bez_powiazania"]["kody_brakow"] == [
            "BRAK_POLA_POMIARU_NAPIECIA"
        ]
        assert po_nazwie[f"{wykonanie}_iniekcja_bez_ferrantiego_i_bez_z17"]["kody_brakow"] == [
            "BRAK_FERRANTIEGO",
            "BRAK_POLA_POMIARU_NAPIECIA",
        ]
    assert po_nazwie["z11_1_wlasny_vt_z_otwartym_trojkatem"]["potwierdzone"] is True


if __name__ == "__main__":
    FIKSTURA.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {FIKSTURA}")
