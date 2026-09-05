"""Parytet assemblera (CV-4.1): wynik każdego biegu kanonicznego PF/SC sieci rejestru.

Złoty plik (``regeneruj.py``): per wpis odmowa (tekst), hash SZKIELETU wyniku
(struktura bez liczb — dokładnie) i LICZBY kontraktu (z tolerancją między
maszynami; lokalnie determinizm dokładny). Czerwony test = refaktor zmienił
wynik albo odmowę — naprawia się kod, nie złoty plik (wyjątek: świadoma
korekta fizyki z dowodem per sieć w commicie).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.parytet_assemblera.harness import (
    ATOL_PARYTETU,
    RTOL_PARYTETU,
    ZNACZNIK_LICZBY,
    porownaj_wpis,
    sieci_enm_rejestru,
    widok_parytetu,
    wpis_do_zapisu,
    zapis_liczby,
    zbierz_hashe,
)

_PLIK = Path(__file__).parent / "zlote_hashe.json"


@pytest.fixture(scope="module")
def zebrane() -> dict[str, dict]:
    return zbierz_hashe(sieci_enm_rejestru())


def test_zlote_hashe_istnieja_i_pokrywaja_kazda_siec_enm_rejestru(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    assert set(zlote) == set(zebrane), (
        "Zbiór kluczy (sieć × analiza) rozjechał się ze złotym plikiem — nowa sieć w rejestrze "
        "albo nowy wariant: uzupełnij złote hashe świadomie (regeneruj.py) i uzasadnij w commicie."
    )


def test_parytet_struktury_dokladnie_i_liczb_w_tolerancji(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    rozbieznosci = {
        klucz: porownaj_wpis(zlote[klucz], wpis)
        for klucz, wpis in zebrane.items()
        if klucz in zlote
    }
    zle = {k: v for k, v in rozbieznosci.items() if v}
    assert not zle, "Parytet assemblera złamany:\n" + "\n".join(
        f"  {k}: " + "; ".join(v) for k, v in sorted(zle.items())
    )


def test_harness_jest_deterministyczny(zebrane: dict[str, dict]) -> None:
    """Ta sama maszyna, dwa biegi: równość DOKŁADNA (szkielet, liczby, ścieżki)."""
    assert zbierz_hashe(sieci_enm_rejestru()) == zebrane


def test_widok_parytetu_rozdziela_szkielet_od_liczb_kontraktu() -> None:
    """Iloczyn cech: {liczba kontraktu, liczba śladu, int, bool, str, None} × {dict, lista}."""
    szkielet, liczby = widok_parytetu(
        {
            "results": [
                {
                    "ikss_a": 1234.5678,
                    "kappa": 1.6,
                    "branch_contributions": [{"i_contrib_a": 9e-14, "branch_id": "b1"}],
                    "white_box_trace": [{"krok": "Zk", "wartosc": 0.123}],
                    "fault_node_id": "n1",
                    "iteracje": 3,
                    "requires_z0": False,
                    "z0_source": None,
                }
            ],
            "graph": {"nodes": [{"id": "n1", "voltage_kv": 15.0}]},
        }
    )
    assert szkielet["results"][0]["ikss_a"] == ZNACZNIK_LICZBY
    assert szkielet["results"][0]["branch_contributions"][0]["i_contrib_a"] == ZNACZNIK_LICZBY
    assert szkielet["results"][0]["white_box_trace"][0]["wartosc"] == ZNACZNIK_LICZBY
    assert szkielet["results"][0]["iteracje"] == 3
    assert szkielet["results"][0]["requires_z0"] is False
    assert szkielet["results"][0]["z0_source"] is None
    assert szkielet["results"][0]["fault_node_id"] == "n1"
    assert list(szkielet["results"][0]) == sorted(szkielet["results"][0])
    assert liczby == [
        ("$.graph.nodes[0].voltage_kv", 15.0),
        ("$.results[0].ikss_a", 1234.5678),
        ("$.results[0].kappa", 1.6),
    ]


def test_porownanie_wykrywa_zmiane_fizyczna_a_toleruje_szum_platformy() -> None:
    """Iloczyn cech: {szum 1e-8 wzgl., zero→1e-17, zmiana 1e-4 wzgl., inna odmowa, inna struktura}."""
    baza_raw = {
        "results": [{"ikss_a": 1234.5678, "kappa": 1.6, "un_v": 15000.0, "reszta": 0.0}],
        "graph": {"nodes": [{"id": "n1", "voltage_kv": 15.0}]},
    }

    def wpis(raw: dict) -> dict:
        from tests.golden.parytet_assemblera.harness import hash_widoku

        szkielet, liczby = widok_parytetu(raw)
        return {
            "odmowa": None,
            "szkielet_sha256": hash_widoku(szkielet),
            "liczby": [zapis_liczby(x) for _, x in liczby],
            "sciezki": [s for s, _ in liczby],
        }

    zloty = wpis_do_zapisu(wpis(baza_raw))
    assert "sciezki" not in zloty and zloty["liczby"] == [15.0, 1234.568, 1.6, 0.0, 15000.0]

    szum = json.loads(json.dumps(baza_raw))
    szum["results"][0]["ikss_a"] *= 1 + 1e-8
    szum["results"][0]["reszta"] = 1e-17
    szum["graph"]["nodes"][0]["voltage_kv"] *= 1 - 1e-8
    assert porownaj_wpis(zloty, wpis(szum)) == []

    zmiana = json.loads(json.dumps(baza_raw))
    zmiana["results"][0]["ikss_a"] *= 1 + 1e-4
    (komunikat,) = porownaj_wpis(zloty, wpis(zmiana))
    assert "$.results[0].ikss_a" in komunikat and "1 rozbieżności" in komunikat

    inna_struktura = json.loads(json.dumps(baza_raw))
    inna_struktura["results"][0]["reporting_status"] = "not_reportable"
    (komunikat,) = porownaj_wpis(zloty, wpis(inna_struktura))
    assert komunikat.startswith("szkielet:")

    odmowa = {"odmowa": "ValueError: osobliwa Y", "szkielet_sha256": None, "liczby": None}
    assert porownaj_wpis(odmowa, dict(odmowa)) == []
    assert porownaj_wpis(odmowa, wpis(baza_raw))[0].startswith("odmowa:")

    # Granica tolerancji jest jawna: ATOL + RTOL·|a| — dokładnie na granicy przechodzi.
    a = 1234.568
    granica = {
        "odmowa": None,
        "szkielet_sha256": zloty["szkielet_sha256"],
        "liczby": [15.0, a + ATOL_PARYTETU + RTOL_PARYTETU * a, 1.6, 0.0, 15000.0],
    }
    assert porownaj_wpis(zloty, granica) == []
