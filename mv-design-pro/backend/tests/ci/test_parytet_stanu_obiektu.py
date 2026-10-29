"""Parytet słownika stanu obiektu (istniejący / projektowany) między backendem a frontem.

Stan obiektu pola i aparatu pola (`network_model.catalog.gazy_fluorowane.StanObiektu`) ma
lustra we froncie: typ `StanObiektu` (`frontend/src/types/enm.ts`) i nazwy PL
(`frontend/src/ui/shared/stanObiektu.ts`). Rozjazd (nowy stan w backendzie, inna nazwa)
pokazałby projektantowi stan, którego operacja `set_object_state` nie przyjmie.

Reguła stanu gałęzi łączeniowej (`enm.gaz_fluorowany_pola.stan_obiektu_lacznika`) ma lustro
`stanObiektuLacznika` (`ui/shared/stanObiektu.ts`) — schemat i karta techniczna pokazują stan
łącznika bez zapytania do backendu. Fikstura niżej powstaje z WYNIKU backendu na iloczynie cech
{aparat pola wskazujący gałąź: brak, istniejący, projektowany, bez stanu} × {stan własny gałęzi:
brak, istniejący, projektowany} × {pole wymieniające gałąź w `equipment_refs`: brak, istniejące,
projektowane, bez stanu}; test frontu (`ui/shared/__tests__/stanObiektu.test.ts`) sprawdza
równość lustra na każdym przypadku. Strażnik pilnuje równości fikstury z backendem.

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_stanu_obiektu.py
"""

from __future__ import annotations

import itertools
import json
import re
from pathlib import Path
from typing import Any

from enm.gaz_fluorowany_pola import stan_obiektu_lacznika
from network_model.catalog.gazy_fluorowane import NAZWY_STANOW_OBIEKTU_PL, STANY_OBIEKTU

PROJEKT = Path(__file__).resolve().parents[3]
TYPY = PROJEKT / "frontend" / "src" / "types" / "enm.ts"
NAZWY = PROJEKT / "frontend" / "src" / "ui" / "shared" / "stanObiektu.ts"
FIKSTURA = (
    PROJEKT
    / "frontend"
    / "src"
    / "ui"
    / "shared"
    / "__tests__"
    / "fixtures"
    / "stan_obiektu_lacznika.json"
)

#: Wartość cechy: `"brak"` — źródła nie ma; `None` — źródło jest, stanu nie niesie.
_APARAT = ("brak", "ISTNIEJACY", "PROJEKTOWANY", None)
_WLASNY = ("brak", "ISTNIEJACY", "PROJEKTOWANY")
_POLE = ("brak", "ISTNIEJACY", "PROJEKTOWANY", None)


def test_typ_frontu_rowny_stanom_backendu() -> None:
    dopasowanie = re.search(r"export type StanObiektu = ([^;]+);", TYPY.read_text(encoding="utf-8"))
    assert dopasowanie is not None
    assert set(re.findall(r"'([A-Z_]+)'", dopasowanie.group(1))) == set(STANY_OBIEKTU)


def test_nazwy_frontu_rowne_nazwom_backendu() -> None:
    tekst = NAZWY.read_text(encoding="utf-8")
    dopasowanie = re.search(r"NAZWY_STANOW_OBIEKTU_PL[^=]*=\s*\{([^}]*)\}", tekst)
    assert dopasowanie is not None
    pary = dict(re.findall(r"([A-Z_]+):\s*'([^']*)'", dopasowanie.group(1)))
    assert pary == NAZWY_STANOW_OBIEKTU_PL


def _nazwa(wartosc: str | None) -> str:
    return "bez_stanu" if wartosc is None else wartosc.lower()


def przypadki() -> list[dict[str, Any]]:
    wynik = []
    for aparat, wlasny, pole in itertools.product(_APARAT, _WLASNY, _POLE):
        galaz: dict[str, Any] = {"ref_id": "sw-1", "type": "switch"}
        if wlasny != "brak":
            galaz["stan_obiektu"] = wlasny
        pola: list[dict[str, Any]] = []
        if pole != "brak":
            pola.append({"ref_id": "pole-a", "stan_obiektu": pole, "equipment_refs": ["sw-1"]})
        if aparat != "brak":
            pola.append(
                {
                    "ref_id": "pole-b",
                    "stan_obiektu": "PROJEKTOWANY",
                    "equipment_refs": [],
                    "primary_devices": [
                        {"device_ref": "q1", "linked_ref": "sw-1", "stan_obiektu": aparat}
                    ],
                }
            )
        enm = {"bays": pola, "branches": [galaz]}
        wynik.append(
            {
                "nazwa": f"aparat_{_nazwa(aparat)}__galaz_{_nazwa(wlasny)}__pole_{_nazwa(pole)}",
                "enm": enm,
                "stan": stan_obiektu_lacznika(enm, galaz),
            }
        )
    return wynik


def _tresc() -> str:
    return json.dumps(przypadki(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_stanu_lacznika_rowna_backendowi() -> None:
    assert FIKSTURA.exists(), f"brak fikstury {FIKSTURA} — regeneracja: patrz docstring"
    assert (
        FIKSTURA.read_text(encoding="utf-8") == _tresc()
    ), "fikstura stanu obiektu łącznika nieaktualna — regeneracja: patrz docstring modułu"


def test_fikstura_pokrywa_kazdy_wynik_reguly() -> None:
    assert {p["stan"] for p in przypadki()} == {"ISTNIEJACY", "PROJEKTOWANY", None}
    assert len(przypadki()) == len(_APARAT) * len(_WLASNY) * len(_POLE)


if __name__ == "__main__":
    FIKSTURA.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {FIKSTURA}")
