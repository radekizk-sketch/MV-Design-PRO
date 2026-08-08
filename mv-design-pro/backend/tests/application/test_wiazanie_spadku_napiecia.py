"""Wiązanie spadku napięcia: ZAPIS BIEGU → odcinki dowodu (karta PACK-BEZ-KONSUMENTA).

Testy sprawdzają JEDNĄ rzecz na dwa sposoby: że odcinek powstaje wtedy i tylko
wtedy, gdy bieg niesie KOMPLET danych — a brak czegokolwiek daje BRAK OFERTY albo
odmowę z powodem po polsku, nigdy podstawioną liczbę.

Pokrycie jako ILOCZYN CECH (nie jeden przykład):
rodzaj gałęzi {linia · kabel · aparat · transformator} × stan danych {komplet ·
brak przepływu w wyniku · wielkość nieliczbowa · długość zerowa · napięcie
znamionowe zerowe} × artefakt biegu {kompletny · bez wyniku · bez przepływów ·
bez napięć węzłowych · bez opisu sieci · innego rodzaju analizy}.

Oś dołożona przy odbiorze karty: PRZYPISANIE wielkości do gałęzi. Komplet danych
to za mało — liczby muszą pochodzić z TEJ gałęzi, a nie z sąsiedniej. Zestawy
wielogałęziowe muszą więc mieć wartości PARAMI RÓŻNE, inaczej permutacja jest
niewidoczna (zmierzone: iniekcja czytająca sąsiada przechodziła 24/24).
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from application.solvers.voltage_drop_binding import (
    RODZAJE_ODCINKA,
    BrakDanychSpadkuError,
    odcinki_spadku_napiecia,
)

_WEZLY = {
    "n-a": {"element_id": "bus-a", "name": "Szyna A", "voltage_level": 15.0},
    "n-b": {"element_id": "bus-b", "name": "Szyna B", "voltage_level": 15.0},
}


def _artefakt(
    *,
    galezie_grafu: dict[str, Any] | None = None,
    przeplywy: list[dict[str, Any]] | None = None,
    napiecia: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "analysis_type": "load_flow",
        "node_voltage_kv": {"n-a": 14.99, "n-b": 14.9} if napiecia is None else napiecia,
        "graph": {
            "nodes": _WEZLY,
            "branches": (
                {
                    "g-1": {
                        "element_id": "ln-1",
                        "name": "Linia SN",
                        "from_node_id": "n-a",
                        "to_node_id": "n-b",
                    }
                }
                if galezie_grafu is None
                else galezie_grafu
            ),
        },
        "result_v1": {
            "branch_results": (
                [
                    {
                        "branch_id": "g-1",
                        "p_from_mw": 1.5,
                        "q_from_mvar": 0.4,
                        "p_to_mw": -1.49,
                        "q_to_mvar": -0.39,
                        "losses_p_mw": 0.01,
                        "losses_q_mvar": 0.01,
                    }
                ]
                if przeplywy is None
                else przeplywy
            )
        },
    }


def _snapshot(**nadpisania: Any) -> dict[str, Any]:
    galaz: dict[str, Any] = {
        "ref_id": "ln-1",
        "type": "line_overhead",
        "r_ohm_per_km": 0.3,
        "x_ohm_per_km": 0.4,
        "length_km": 5.0,
    }
    galaz.update(nadpisania)
    return {"branches": [galaz]}


# ---------------------------------------------------------------------------
# Komplet danych: odcinek powstaje i niesie liczby Z BIEGU
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_ODCINKA))
def test_kazdy_rodzaj_odcinka_daje_oferte_z_liczbami_z_biegu(rodzaj: str) -> None:
    """Linia i kabel są odcinkami — obie drogi sprawdzone, nie jedna z nich."""
    odcinki = odcinki_spadku_napiecia(raw_result=_artefakt(), snapshot=_snapshot(type=rodzaj))

    assert len(odcinki) == 1
    odcinek = odcinki[0]
    assert odcinek.id_galezi == "g-1"
    assert odcinek.nazwa == "Linia SN"
    assert (odcinek.od_szyny, odcinek.do_szyny) == ("bus-a", "bus-b")
    assert (odcinek.r_ohm_per_km, odcinek.x_ohm_per_km, odcinek.length_km) == (0.3, 0.4, 5.0)
    # Przepływ POCZĄTKU odcinka i napięcie POCZĄTKU — obie wielkości z wyniku biegu,
    # nie z modelu: dowód opisuje przebieg, który się wydarzył.
    assert (odcinek.p_mw, odcinek.q_mvar) == (1.5, 0.4)
    assert odcinek.u_poczatku_kv == 14.99
    assert odcinek.u_n_kv == 15.0


def test_kazda_wielkosc_oferty_pochodzi_z_TEJ_galezi_a_nie_z_sasiedniej() -> None:
    """Przypisanie wielkości do gałęzi — pin postawiony przy odbiorze karty.

    Wszystkie dotychczasowe zestawy wielogałęziowe w tym pliku nadawały gałęziom
    IDENTYCZNE liczby, więc żaden nie mógł zobaczyć PERMUTACJI: iniekcja czytająca
    przepływ sąsiedniej gałęzi przechodziła tu na zielono (24/24), a łapał ją
    dopiero pin zgodności na poziomie bramy — i to wyłącznie na tej z dwóch sieci,
    która ma więcej niż jedną gałąź. Warstwa, której cały sens to „przeczytaj
    wielkości TEGO odcinka", nie miała własnego strażnika przypisania.

    Dlatego tu KAŻDA wielkość jest inna na każdej gałęzi (impedancja, długość,
    przepływ, napięcie znamionowe, napięcie początku), a wyrocznia bierze się z tej
    samej mapy, z której zbudowano zapis — żadna liczba nie jest przepisana ręcznie.
    Rozłączność par węzłów sprawia, że przestawienie gałęzi zmienia też napięcia.
    """
    dane = {
        "g-1": {"r": 0.11, "x": 0.21, "l": 1.5, "p": 1.10, "q": 0.31, "u_n": 15.0, "u_p": 14.91},
        "g-2": {"r": 0.12, "x": 0.22, "l": 2.5, "p": 2.20, "q": 0.32, "u_n": 20.0, "u_p": 19.92},
        "g-3": {"r": 0.13, "x": 0.23, "l": 3.5, "p": 3.30, "q": 0.33, "u_n": 30.0, "u_p": 29.93},
    }
    # Zapadka na zestaw zdegenerowany: gdyby ktoś zrównał wartości, pin przestałby
    # widzieć permutację, nie zmieniając ani jednej asercji poniżej.
    for pole in ("r", "x", "l", "p", "q", "u_n", "u_p"):
        wartosci = [rzad[pole] for rzad in dane.values()]
        assert len(set(wartosci)) == len(wartosci), f"wartości `{pole}` muszą być parami różne"

    wezly: dict[str, Any] = {}
    galezie: dict[str, Any] = {}
    napiecia: dict[str, float] = {}
    przeplywy: list[dict[str, Any]] = []
    snapshot_galezie: list[dict[str, Any]] = []
    for id_galezi, rzad in dane.items():
        od_wezla, do_wezla = f"n-{id_galezi}-od", f"n-{id_galezi}-do"
        wezly[od_wezla] = {"element_id": f"bus-{id_galezi}-od", "voltage_level": rzad["u_n"]}
        wezly[do_wezla] = {"element_id": f"bus-{id_galezi}-do", "voltage_level": rzad["u_n"]}
        napiecia[od_wezla] = rzad["u_p"]
        napiecia[do_wezla] = rzad["u_p"] - 0.05
        galezie[id_galezi] = {
            "element_id": f"ln-{id_galezi}",
            "name": f"Odcinek {id_galezi}",
            "from_node_id": od_wezla,
            "to_node_id": do_wezla,
        }
        przeplywy.append({"branch_id": id_galezi, "p_from_mw": rzad["p"], "q_from_mvar": rzad["q"]})
        snapshot_galezie.append(
            {
                "ref_id": f"ln-{id_galezi}",
                "type": "cable",
                "r_ohm_per_km": rzad["r"],
                "x_ohm_per_km": rzad["x"],
                "length_km": rzad["l"],
            }
        )

    artefakt = _artefakt(galezie_grafu=galezie, przeplywy=przeplywy, napiecia=napiecia)
    artefakt["graph"]["nodes"] = wezly

    odcinki = odcinki_spadku_napiecia(raw_result=artefakt, snapshot={"branches": snapshot_galezie})

    assert len(odcinki) == len(dane)
    for odcinek in odcinki:
        rzad = dane[odcinek.id_galezi]
        assert (odcinek.r_ohm_per_km, odcinek.x_ohm_per_km, odcinek.length_km) == (
            rzad["r"],
            rzad["x"],
            rzad["l"],
        ), odcinek.id_galezi
        assert (odcinek.p_mw, odcinek.q_mvar) == (rzad["p"], rzad["q"]), odcinek.id_galezi
        assert (odcinek.u_n_kv, odcinek.u_poczatku_kv) == (
            rzad["u_n"],
            rzad["u_p"],
        ), odcinek.id_galezi
        assert (odcinek.od_szyny, odcinek.do_szyny) == (
            f"bus-{odcinek.id_galezi}-od",
            f"bus-{odcinek.id_galezi}-do",
        ), odcinek.id_galezi


def test_kolejnosc_odcinkow_jest_deterministyczna() -> None:
    """Ten sam bieg → ta sama kolejność (pierwszy odcinek bywa domyślnym wyborem)."""
    galezie = {
        f"g-{i}": {
            "element_id": f"ln-{i}",
            "name": f"Odcinek {i}",
            "from_node_id": "n-a",
            "to_node_id": "n-b",
        }
        for i in (3, 1, 2)
    }
    przeplywy = [{"branch_id": f"g-{i}", "p_from_mw": 1.0, "q_from_mvar": 0.1} for i in (2, 3, 1)]
    snapshot = {
        "branches": [
            {
                "ref_id": f"ln-{i}",
                "type": "cable",
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
                "length_km": 1.0,
            }
            for i in (1, 2, 3)
        ]
    }
    artefakt = _artefakt(galezie_grafu=galezie, przeplywy=przeplywy)

    identyfikatory = [
        o.id_galezi for o in odcinki_spadku_napiecia(raw_result=artefakt, snapshot=snapshot)
    ]

    assert identyfikatory == ["g-1", "g-2", "g-3"]


# ---------------------------------------------------------------------------
# Brak danych = BRAK OFERTY (nigdy podstawiona liczba)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("opis", "snapshot"),
    [
        ("aparat lacznikowy nie ma dlugosci", _snapshot(type="breaker")),
        ("bezpiecznik nie jest odcinkiem", _snapshot(type="fuse")),
        ("dlugosc zerowa nie ma spadku wzdluznego", _snapshot(length_km=0.0)),
        ("brak rezystancji jednostkowej", _snapshot(r_ohm_per_km=None)),
        ("brak reaktancji jednostkowej", _snapshot(x_ohm_per_km=None)),
        ("dlugosc nieliczbowa", _snapshot(length_km="dwa kilometry")),
    ],
)
def test_galaz_bez_kompletu_danych_modelu_nie_jest_oferta(opis: str, snapshot: dict) -> None:
    """Gałąź, której model nie opisuje odcinkiem, NIE dostaje zera ani domyślnej."""
    assert odcinki_spadku_napiecia(raw_result=_artefakt(), snapshot=snapshot) == [], opis


@pytest.mark.parametrize(
    ("opis", "przeplywy", "napiecia", "wezly_nadpisanie"),
    [
        ("solver nie policzyl tej galezi", [], None, None),
        (
            "moc czynna nie jest liczba (serializacja NaN)",
            [{"branch_id": "g-1", "p_from_mw": None, "q_from_mvar": 0.4}],
            None,
            None,
        ),
        (
            "moc bierna nieskonczona",
            [{"branch_id": "g-1", "p_from_mw": 1.0, "q_from_mvar": math.inf}],
            None,
            None,
        ),
        ("brak napiecia poczatku odcinka", None, {"n-b": 14.9}, None),
        ("napiecie poczatku zerowe", None, {"n-a": 0.0, "n-b": 14.9}, None),
        ("napiecie znamionowe zerowe", None, None, {"voltage_level": 0.0}),
        ("napiecie znamionowe nieznane", None, None, {"voltage_level": None}),
    ],
)
def test_galaz_bez_kompletu_wielkosci_z_wyniku_nie_jest_oferta(
    opis: str,
    przeplywy: list | None,
    napiecia: dict | None,
    wezly_nadpisanie: dict | None,
) -> None:
    """Brak wielkości W WYNIKU też znaczy „brak oferty", nie „ΔU liczony od zera"."""
    artefakt = _artefakt(przeplywy=przeplywy, napiecia=napiecia)
    if wezly_nadpisanie is not None:
        artefakt["graph"]["nodes"] = {
            "n-a": {**_WEZLY["n-a"], **wezly_nadpisanie},
            "n-b": _WEZLY["n-b"],
        }

    assert odcinki_spadku_napiecia(raw_result=artefakt, snapshot=_snapshot()) == [], opis


def test_brak_odcinkow_to_pusta_lista_a_nie_wyjatek() -> None:
    """Sieć bez linii i kabli: pusta lista, bo to prawda o modelu, nie awaria."""
    assert odcinki_spadku_napiecia(raw_result=_artefakt(), snapshot={"branches": []}) == []


# ---------------------------------------------------------------------------
# Artefakt bez podstaw = ODMOWA Z POWODEM (a nie ciche „brak odcinków")
# ---------------------------------------------------------------------------


def test_bieg_innego_rodzaju_odmawia_z_powodem_po_polsku() -> None:
    artefakt = _artefakt()
    artefakt["analysis_type"] = "sc_3f"

    with pytest.raises(BrakDanychSpadkuError) as blad:
        odcinki_spadku_napiecia(raw_result=artefakt, snapshot=_snapshot())

    assert "nie jest rozpływem mocy" in str(blad.value)


@pytest.mark.parametrize(
    ("opis", "usun", "fragment_powodu"),
    [
        ("bez opisu sieci", "graph", "struktury: graph"),
        ("bez napiec wezlowych", "node_voltage_kv", "napięć węzłowych"),
        ("bez artefaktu wyniku", "result_v1", "artefaktu wyniku rozpływu"),
    ],
)
def test_artefakt_bez_struktury_odmawia_zamiast_udawac_brak_odcinkow(
    opis: str, usun: str, fragment_powodu: str
) -> None:
    """„Nie ma z czego czytać" to inny stan niż „nie ma odcinków" — i tak brzmi.

    Gdyby brak struktury dawał pustą listę, projektant zobaczyłby pakiet bez
    dowodu spadku i uznałby, że jego sieć nie ma odcinków.
    """
    artefakt = _artefakt()
    artefakt.pop(usun)

    with pytest.raises(BrakDanychSpadkuError) as blad:
        odcinki_spadku_napiecia(raw_result=artefakt, snapshot=_snapshot())

    assert fragment_powodu in str(blad.value), opis


def test_wynik_bez_przeplywow_galeziowych_odmawia_z_powodem() -> None:
    artefakt = _artefakt()
    artefakt["result_v1"] = {}

    with pytest.raises(BrakDanychSpadkuError) as blad:
        odcinki_spadku_napiecia(raw_result=artefakt, snapshot=_snapshot())

    assert "przepływów gałęziowych" in str(blad.value)


def test_brak_zapisu_biegu_odmawia_zamiast_zwracac_pusta_liste() -> None:
    with pytest.raises(BrakDanychSpadkuError):
        odcinki_spadku_napiecia(raw_result=None, snapshot=None)


# ---------------------------------------------------------------------------
# Deklaracja MUSI mieć strażnika (reguła KLASA §4)
# ---------------------------------------------------------------------------


def test_lista_rodzajow_odcinka_jest_zamknieta_wzgledem_modelu() -> None:
    """Pin deklaracji „lista ZAMKNIĘTA" z ``voltage_drop_binding``.

    Odcinkiem jest DOKŁADNIE ta gałąź modelu, która niesie impedancję jednostkową
    i długość — ani mniej (zdolność zniknęłaby po cichu), ani więcej (dowód
    liczyłby ΔU z pól, których gałąź nie ma). Zbiór wyprowadzamy z SAMEGO MODELU,
    a nie z drugiej ręcznej listy, która „dziś się zgadza".
    """
    from enm.models import Cable, FuseBranch, OverheadLine, SwitchBranch

    wymagane = {"r_ohm_per_km", "x_ohm_per_km", "length_km"}
    z_modelu = {
        klasa.model_fields["type"].default
        for klasa in (OverheadLine, Cable, SwitchBranch, FuseBranch)
        if wymagane <= set(klasa.model_fields)
    }

    assert z_modelu, "zapadka na pusty zbiór — pin bez gałęzi przechodziłby zawsze"
    assert RODZAJE_ODCINKA == z_modelu
