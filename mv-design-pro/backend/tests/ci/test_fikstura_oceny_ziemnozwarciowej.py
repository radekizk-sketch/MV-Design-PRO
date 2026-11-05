"""Fikstura frontu z WYNIKU BACKENDU oceny zabezpieczeń ziemnozwarciowych i uziemień stacji
(karta EWALUATORY-ZIEMNOZWARCIOWE).

PO CO. Tabela ocen ziemnozwarciowych (`frontend/src/ui2/wyniki/koordynacja/
TabelaOcenyZiemnozwarciowej.tsx`) czyta rekordy pola ``ziemnozwarciowe`` wyniku biegu oceny
zabezpieczeń i koordynacji. Test frontu na rekordach pisanych ręcznie sprawdzałby kształt,
który ktoś przewidział; ta fikstura niesie rekordy z REALNEGO biegu ewaluatora (scena zwarć
doziemnych budowana operacjami domenowymi), rzutowane na pola, które ekran czyta. Strażnik niżej
pilnuje, że fikstura równa się wynikowi backendu — zmiana kształtu rekordu (nazwa pola,
słownik kryteriów) zaczerwieni test, zanim ekran zacznie pokazywać kreski.

ILOCZYN CECH: sposób pracy {izolowany bez danych uziomu, kompensowany z AWSC i uziomem GPZ
R_E = 0,5 Ω} × rodzaj rekordu {ocena funkcji, uziemienie stacji, odmowa}; z każdego wariantu
jeden rekord każdego rodzaju kryterium i każda odmowa.

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_fikstura_oceny_ziemnozwarciowej.py
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

from application.analyses.protection.ocena_ziemnozwarciowa import (
    KRYTERIA_ZIEMNOZWARCIOWE,
    ocen_zabezpieczenia_ziemnozwarciowe,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel

from tests.reference_networks.scena_doziemienia import scena_z_nastawami, ustaw_uziom_stacji

BACKEND = Path(__file__).resolve().parents[2]
FIKSTURA = (
    BACKEND.parent
    / "frontend/src/ui2/wyniki/koordynacja/__tests__/fixtures/oceny_ziemnozwarciowe.json"
)

#: Pola rekordu czytane przez ekran (reszta — punkty, ślad — to dane White Box biegu).
_POLA_REKORDU = (
    "urzadzenie_ref",
    "nazwa_urzadzenia_pl",
    "funkcja_ref",
    "kod",
    "etykieta_pl",
    "kryterium",
    "kryterium_pl",
    "status",
    "zdanie_pl",
    "braki",
    "czego_brakuje_pl",
)


def _rekord(r: dict[str, Any]) -> dict[str, Any]:
    ocena = r["ocena"]
    return {
        **{k: r[k] for k in _POLA_REKORDU if k in r},
        "ocena": {
            "status_maszynowy": ocena["status_maszynowy"],
            "etykieta": ocena["etykieta"],
            "wyjasnienie": {"zdanie_pl": ocena["wyjasnienie"]["zdanie_pl"]},
            "wynik": {"wartosc": ocena["wynik"]["wartosc"]} if ocena.get("wynik") else None,
            "limit": ({"wartosc": ocena["limit"]["wartosc"]} if ocena.get("limit") else None),
        },
    }


def _po_jednym_z_kryterium(rekordy: list[dict[str, Any]]) -> list[dict[str, Any]]:
    widziane: set[str] = set()
    wynik = []
    for r in rekordy:
        rodzaj = r["kryterium"].split(":", 1)[0]
        if rodzaj not in widziane:
            widziane.add(rodzaj)
            wynik.append(_rekord(r))
    return wynik


@cache
def _wariant(sposob: str, rezystancja_ohm: float | None) -> dict[str, Any]:
    enm = scena_z_nastawami(sposob)  # type: ignore[arg-type]
    if rezystancja_ohm is not None:
        enm = ustaw_uziom_stacji(enm, rezystancja_ohm=rezystancja_ohm, wspolczynnik_r=None)
    model = EnergyNetworkModel.model_validate(enm)
    wynik = ocen_zabezpieczenia_ziemnozwarciowe(
        model, map_enm_to_network_graph(model), odniesienie="fikstura frontu"
    ).to_dict()
    return {
        "oceny": _po_jednym_z_kryterium(wynik["oceny"]),
        "uziemienia": _po_jednym_z_kryterium(wynik["uziemienia"]),
        "odmowy": [_rekord(r) for r in wynik["odmowy"]],
        "doziemienie": {},
        "wyniki_uziemien": [],
        "funkcje": [],
    }


def _tresc() -> str:
    dane = {
        "IZOLOWANY_bez_uziomu": _wariant("IZOLOWANY", None),
        "KOMPENSOWANY_AWSC_z_uziomem": _wariant("KOMPENSOWANY_AWSC", 0.5),
    }
    return json.dumps(dane, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_oceny_ziemnozwarciowej_rowna_backendowi() -> None:
    assert FIKSTURA.exists(), f"brak fikstury {FIKSTURA} — regeneracja: patrz docstring"
    assert (
        FIKSTURA.read_text(encoding="utf-8") == _tresc()
    ), "fikstura ocen ziemnozwarciowych nieaktualna — regeneracja: patrz docstring modułu"


def test_fikstura_niesie_kazdy_rodzaj_kryterium() -> None:
    rodzaje = {
        r["kryterium"].split(":", 1)[0]
        for wariant in (_wariant("IZOLOWANY", None), _wariant("KOMPENSOWANY_AWSC", 0.5))
        for r in [*wariant["oceny"], *wariant["uziemienia"], *wariant["odmowy"]]
    }
    # ROZRUCH_U0 — funkcje admitancyjne z rozruchem napięciowym (scena ich nie nastawia;
    # rekord przypina test iloczynu `test_ocena_ziemnozwarciowa_iloczyn.py`).
    assert rodzaje == set(KRYTERIA_ZIEMNOZWARCIOWE) - {"ROZRUCH_U0"}


if __name__ == "__main__":
    FIKSTURA.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA.write_text(_tresc(), encoding="utf-8")
