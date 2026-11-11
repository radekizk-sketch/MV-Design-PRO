"""Układy wejść zerowych sterownika pola (ADR-022) — jedna reguła zdejmowania i wiązania.

Scalenie karty ZU-JEDEN-NOSNIK z drzewem integracji (2026-11-11): pole z przekładnikiem prądowym
z szablonu dostało układ Holmgreena, a wymiana aparatów na sam przekładnik Ferrantiego zostawiała
układ Holmgreena bez przekładnika fazowego i dokładała przekładnik prądu zerowego — sterownik
łamał kontrakt (`ProtectionAssignment`: przekładnik prądu zerowego wyłącznie w układzie
Ferrantiego), a operacja `set_bay_equipment` kończyła się błędem pisarza.

Predykaty parami: układ zostaje dokładnie wtedy, gdy odczyt wejść (`wejscia_funkcji_w_aparacie`)
daje z niego wejście ``3I0``/``3U0`` (`zdejmij_uklady_bez_wejsc`, wołana przez pisarza z szablonu
i kaskadę usunięcia elementu). Iloczyn cech: układ {HOLMGREEN, FERRANTI, OTWARTY_TROJKAT,
Z_NAPIEC_FAZOWYCH} × wejście układu {obecne, brak}; pisarz z szablonu: układ zapisany
{brak, HOLMGREEN, FERRANTI} × aparaty pola {CT, CT + Ferranti, sam Ferranti}.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from enm.models import ProtectionAssignment
from enm.zabezpieczenie import (
    ustaw_funkcje_pola,
    wejscia_funkcji_w_aparacie,
    zdejmij_uklady_bez_wejsc,
)

#: Układ → (klucz układu, wejście odczytu, klucz przekładnika realizującego układ).
UKLADY: dict[str, tuple[str, str, str]] = {
    "HOLMGREEN": ("i0_uklad", "3I0", "ct_ref"),
    "FERRANTI": ("i0_uklad", "3I0", "i0_ct_ref"),
    "OTWARTY_TROJKAT": ("u0_uklad", "3U0", "u0_vt_ref"),
    "Z_NAPIEC_FAZOWYCH": ("u0_uklad", "3U0", "vt_ref"),
}


@pytest.mark.parametrize("uklad,obecne", list(itertools.product(sorted(UKLADY), [True, False])))
def test_uklad_zostaje_wtedy_i_tylko_wtedy_gdy_odczyt_daje_jego_wejscie(
    uklad: str, obecne: bool
) -> None:
    klucz, wejscie, przekladnik = UKLADY[uklad]
    wejscia: dict[str, Any] = {klucz: uklad}
    if obecne:
        wejscia[przekladnik] = "aparat/1"
    odczyt_przed = wejscia_funkcji_w_aparacie(wejscia)
    zdejmij_uklady_bez_wejsc(wejscia)
    assert (klucz in wejscia) is obecne
    assert (wejscie in odczyt_przed) is obecne
    # Zdjęcie układu nie zmienia odczytu — usuwa wyłącznie deklarację bez wejścia.
    assert wejscia_funkcji_w_aparacie(wejscia) == odczyt_przed


_CT = {"kind": "CT", "device_ref": "pole::dev::ct"}
_FERRANTI = {"kind": "CORE_BALANCE_CT", "device_ref": "pole::dev::fe"}
_CB = {"kind": "CB", "device_ref": "pole::dev::cb"}

#: Aparaty pola → (oczekiwany układ, oczekiwany przekładnik prądu zerowego) przy sterowniku
#: bez układu — wiązanie z jedynego aparatu danego rodzaju (`_wiazania_z_obwodow`).
APARATY: dict[str, list[dict[str, str]]] = {
    "ct": [_CB, _CT],
    "ct_i_ferranti": [_CB, _CT, _FERRANTI],
    "sam_ferranti": [_CB, _FERRANTI],
}
ZAPISANE: dict[str, dict[str, str]] = {
    "brak": {},
    "holmgreen": {"ct_ref": _CT["device_ref"], "i0_uklad": "HOLMGREEN"},
    "ferranti": {"i0_uklad": "FERRANTI", "i0_ct_ref": _FERRANTI["device_ref"]},
}


def _oczekiwany_uklad(zapisane: str, aparaty: str) -> tuple[str | None, str | None]:
    rodzaje = {a["kind"] for a in APARATY[aparaty]}
    zachowany = {
        "holmgreen": "CT" in rodzaje,
        "ferranti": "CORE_BALANCE_CT" in rodzaje,
        "brak": False,
    }[zapisane]
    if zachowany:
        uklad = ZAPISANE[zapisane]["i0_uklad"]
    elif "CORE_BALANCE_CT" in rodzaje:
        uklad = "FERRANTI"
    else:
        uklad = "HOLMGREEN"
    return uklad, (_FERRANTI["device_ref"] if uklad == "FERRANTI" else None)


@pytest.mark.parametrize("zapisane,aparaty", list(itertools.product(ZAPISANE, APARATY)))
def test_pisarz_wiaze_uklad_pradu_zerowego_w_calosci(zapisane: str, aparaty: str) -> None:
    """Układ zapisany wcześniej zostaje, dopóki pole ma jego przekładnik; inaczej znika i wzorzec
    wiąże swój układ RAZEM z przekładnikiem — sterownik zawsze przechodzi kontrakt (iniekcja:
    kopiowanie wejść wzorca klucz po kluczu daje Holmgreena z przekładnikiem prądu zerowego)."""
    enm: dict[str, Any] = {
        "bays": [{"ref_id": "pole", "primary_devices": APARATY[aparaty]}],
        "protection_assignments": [
            {
                "ref_id": "pole/sterownik",
                "name": "Sterownik pola",
                "bay_ref": "pole",
                "wejscia": dict(ZAPISANE[zapisane]),
                "funkcje": [{"ref": "51N", "kod": "51N", "wlaczona": True}],
                "grupy_nastaw": [],
                "aktywna_grupa": 1,
                "macierz_wyzwolen": [],
                "is_enabled": True,
            }
        ],
    }
    sterownik = ustaw_funkcje_pola(
        enm,
        bay_ref="pole",
        kody=["51", "51N"],
        aparaty=APARATY[aparaty],
        obwody=None,
        zrodlo_u0_ref=None,
        nazwa_domyslna="Sterownik pola",
    )
    assert sterownik is not None
    ProtectionAssignment.model_validate(sterownik)
    uklad, i0_ct_ref = _oczekiwany_uklad(zapisane, aparaty)
    assert sterownik["wejscia"].get("i0_uklad") == uklad
    assert sterownik["wejscia"].get("i0_ct_ref") == i0_ct_ref
    assert "3I0" in wejscia_funkcji_w_aparacie(sterownik["wejscia"])
