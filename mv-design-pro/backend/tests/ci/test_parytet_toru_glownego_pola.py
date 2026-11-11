"""Parytet predykatu TORU GŁÓWNEGO pola backend ↔ schemat SLD (karta UX-04/POLE-LINIOWE-WZORZEC,
rozszerzenie 4: odgałęzienie przekładnika napięciowego od strony linii, ENEA Z.11.1/Z.11).

PO CO. Backend rozstrzyga, które aparaty pola leżą POZA torem głównym
(`rodzaje_aparatury.aparaty_poza_torem_glownym` — reguły blokad i zasilenia: łącznik
odgałęzienia nie przerywa toru pola), a schemat — które rysuje w kolumnie odgałęzienia
(`frontend/src/ui/sld/v3/compose/apparatusSequence.ts::torPolaZPortow`). Dwie implementacje
tej samej reguły „tor główny = jedyna droga aparatów dwuportowych od szyny do węzła końca
toru" bez wspólnego testu rozjadą się na pierwszym nowym szablonie. Ten plik generuje fiksturę
przypadków z WYNIKIEM BACKENDU, a test frontu (`torPolaOdgalezienia.test.ts`) sprawdza, że
`torPolaZPortow` daje dla każdego przypadku ten sam zbiór aparatów odgałęzień. Strażnik niżej
pilnuje, że fikstura jest równa temu, co liczy backend (snapshot bez strażnika dryfuje).

ILOCZYN CECH: wykonanie pola {Z.10, Z.11.1, Z.11} × wykonanie łączników {trójpołożeniowy,
stały z odłącznikiem, wysuwny} (9 szablonów rejestru) + iniekcje na polu Z.11.1 z odłącznikiem
{dwie drogi do końca toru (wyłącznik równoległy), brak drogi do końca toru, odgałęzienie od
węzła szyny} + pole baterii kondensatorów (scalenie z kartą UX-04/POLE-BKR-MODEL) z aparatami
pola BKR z JEDNEJ listy portów: dwa przekładniki napięciowe międzyfazowe (zaciski A i B — dwa
porty, a aparat POZA torem) w odgałęzieniu za odłącznikiem i przekładnik niezrównoważenia
(port ``obwod``) na końcu toru — liczba portów nie rozstrzyga o położeniu w torze.

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_toru_glownego_pola.py
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17,
    BAY_TEMPLATES_GPZ_LINE,
    template_primary_devices,
)
from network_model.catalog.rodzaje_aparatury import aparaty_poza_torem_glownym, porty_toru_pola

BACKEND = Path(__file__).resolve().parents[2]
FIKSTURA = (
    BACKEND.parent / "frontend/src/ui/sld/v3/compose/__tests__/fixtures/parytet_toru_glownego.json"
)


def _porty(aparat: dict[str, Any]) -> dict[str, str | None]:
    return {p["port_id"]: p["wezel"] for p in aparat.get("ports", [])}


def _przypadek(nazwa: str, aparaty: list[dict[str, Any]]) -> dict[str, Any]:
    poza = aparaty_poza_torem_glownym([(a["designation"], a["kind"], _porty(a)) for a in aparaty])
    return {
        "nazwa": nazwa,
        "aparaty": [
            {
                "designation": a["designation"],
                "kind": a["kind"],
                "placement": a["placement"],
                "render_variant": a.get("render_variant"),
                "ports": [{"port_id": p["port_id"], "wezel": p["wezel"]} for p in a["ports"]],
            }
            for a in aparaty
        ],
        "poza_torem_glownym": sorted(poza),
    }


def _ustaw_port(aparat: dict[str, Any], port_id: str, wezel: str) -> None:
    aparat["ports"] = [
        {**p, "wezel": wezel} if p["port_id"] == port_id else p for p in aparat["ports"]
    ]


def przypadki() -> list[dict[str, Any]]:
    wynik = [
        _przypadek(s.template_id, template_primary_devices(s.template_id, field_ref="pole-x"))
        for s in sorted(BAY_TEMPLATES_GPZ_LINE, key=lambda t: t.template_id)
    ]
    baza = template_primary_devices(
        "bay_template_gpz_line_enea_z11_1_staly_z_odlacznikiem", field_ref="pole-x"
    )
    # Iniekcja 1: wyłącznik równoległy do Q0 — dwie drogi do końca toru, tor niejednoznaczny.
    dwie = copy.deepcopy(baza)
    q0 = next(a for a in dwie if a["designation"] == "Q0")
    rownolegly = copy.deepcopy(q0)
    rownolegly["designation"] = "Q0B"
    dwie.insert(dwie.index(q0) + 1, rownolegly)
    wynik.append(_przypadek("iniekcja_dwie_drogi_do_konca_toru", dwie))
    # Iniekcja 2: ostatni aparat toru nie kończy się węzłem końca toru — zero dróg.
    bez_konca = copy.deepcopy(baza)
    for aparat in bez_konca:
        if _porty(aparat).get("wy") in ("kabel", "transformator", "odplyw"):
            _ustaw_port(aparat, "wy", "w99")
    wynik.append(_przypadek("iniekcja_brak_drogi_do_konca_toru", bez_konca))
    # Iniekcja 3: odgałęzienie przekładnika napięciowego od węzła szyny (przed wyłącznikiem).
    od_szyny = copy.deepcopy(baza)
    _ustaw_port(next(a for a in od_szyny if a["designation"] == "Q5"), "we", "szyna")
    wynik.append(_przypadek("iniekcja_odgalezienie_od_szyny", od_szyny))
    # Pole baterii kondensatorów: przekładniki międzyfazowe (A, B) w odgałęzieniu za odłącznikiem,
    # przekładnik niezrównoważenia (obwod) na końcu toru — porty z tej samej reguły sekwencji.
    sekwencja = [
        ("Q1", "DS", "UPSTREAM", None),
        ("Q0", "CB", "MIDSTREAM", None),
        ("Q5", "DS", "MIDSTREAM", "rozladowanie"),
        ("T5", "PHASE_TO_PHASE_VT", "MIDSTREAM", "rozladowanie"),
        ("T6", "PHASE_TO_PHASE_VT", "MIDSTREAM", "rozladowanie"),
        ("T1", "CT", "MIDSTREAM", None),
        ("GK", "CABLE_HEAD", "DOWNSTREAM", None),
        ("T7", "UNBALANCE_CT", "DOWNSTREAM", None),
    ]
    bkr = porty_toru_pola(
        [
            {"designation": d, "kind": k, "placement": p, "render_variant": None}
            | ({"odgalezienie": o} if o else {})
            for d, k, p, o in sekwencja
        ]
    )
    wynik.append(_przypadek("pole_bkr_przekladniki_miedzyfazowe_w_odgalezieniu", bkr))
    # Pole pomiaru napięcia ENEA Z.17: tor główny kończy się na węźle końca toru (``pn`` za
    # łącznikiem trójpołożeniowym), a wskaźnik napięcia, głowica i przekładnik napięciowy stoją
    # w odgałęzieniu od tego węzła — gałąź zaczyna się na węźle końca toru, nie przed nim.
    wynik.append(
        _przypadek(
            BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17.template_id,
            template_primary_devices(
                BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17.template_id, field_ref="pole-x"
            ),
        )
    )
    return wynik


def _tresc() -> str:
    return json.dumps(przypadki(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_parytetu_toru_glownego_rowna_backendowi():
    assert FIKSTURA.exists(), f"brak fikstury {FIKSTURA} — regeneracja: patrz docstring"
    assert (
        FIKSTURA.read_text(encoding="utf-8") == _tresc()
    ), "fikstura parytetu toru głównego nieaktualna — regeneracja: patrz docstring modułu"


def test_przypadki_pokrywaja_odgalezienia_i_iniekcje():
    wynik = {p["nazwa"]: p for p in przypadki()}
    z_odgalezieniem = [n for n, p in wynik.items() if p["poza_torem_glownym"]]
    # Sześć szablonów Z.11.1/Z.11, odgałęzienie od szyny, pole BKR i pole pomiaru napięcia Z.17
    # mają odgałęzienie; Z.10 — nie.
    assert len(z_odgalezieniem) == 9
    assert all("z10" not in n for n in z_odgalezieniem)
    # Tor niejednoznaczny (dwie drogi / zero dróg) — brak wniosku, pusty zbiór.
    assert wynik["iniekcja_dwie_drogi_do_konca_toru"]["poza_torem_glownym"] == []
    assert wynik["iniekcja_brak_drogi_do_konca_toru"]["poza_torem_glownym"] == []
    # Pole BKR: odgałęzienie (odłącznik + dwa przekładniki międzyfazowe) poza torem, przekładnik
    # niezrównoważenia na węźle końca toru — w torze (nie przerywa go, ale leży na jego węźle).
    bkr = wynik["pole_bkr_przekladniki_miedzyfazowe_w_odgalezieniu"]
    assert bkr["poza_torem_glownym"] == ["Q5", "T5", "T6"]
    porty_vt = {a["designation"]: a["ports"] for a in bkr["aparaty"]}
    assert porty_vt["T5"] == [
        {"port_id": "A", "wezel": "rozladowanie1"},
        {"port_id": "B", "wezel": "rozladowanie1"},
    ]
    assert porty_vt["T7"] == [{"port_id": "obwod", "wezel": "kabel"}]
    # Pole Z.17: głowica kablowa i przekładnik napięciowy leżą w odgałęzieniu od węzła końca
    # toru (reguła „gałąź może zaczynać się na węźle końca toru", parytet z `torPolaZPortow`);
    # wskaźnik napięcia (jeden port na węźle końca toru) leży na węźle toru — jak przekładnik
    # niezrównoważenia pola BKR.
    z17 = wynik[BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17.template_id]
    assert sorted(a["designation"] for a in z17["aparaty"]) == ["GK1", "PF1", "Q1", "T1"]
    assert z17["poza_torem_glownym"] == ["GK1", "T1"]


if __name__ == "__main__":
    FIKSTURA.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {FIKSTURA}")
