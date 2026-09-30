"""Parytet assemblera (CV-4.1): wynik każdego biegu kanonicznego PF/SC sieci rejestru.

Złoty plik (``regeneruj.py``): per wpis odmowa (tekst), hash SZKIELETU wyniku
(struktura kontraktu bez liczb i bez poddrzew śladu — dokładnie), mapa skrótów
poddrzew szkieletu (diagnostyka: KTÓRA ścieżka) i LICZBY kontraktu (z tolerancją
między maszynami; lokalnie determinizm dokładny, także śladu). Czerwony test =
refaktor zmienił wynik albo odmowę — naprawia się kod, nie złoty plik (wyjątek:
świadoma korekta fizyki z dowodem per sieć w commicie).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.parytet_assemblera.harness import (
    ATOL_PARYTETU,
    BRAK_PODDRZEWA,
    GLEBOKOSC_SKROTOW,
    POLA_TYLKO_W_PAMIECI,
    RTOL_PARYTETU,
    ZNACZNIK_LICZBY,
    ZNACZNIK_SKROTU,
    ZNACZNIK_SLADU,
    poddrzewo,
    porownaj_wpis,
    sciezki_rozbieznosci_szkieletu,
    sieci_enm_rejestru,
    skroty_szkieletu,
    streszczenie_wierszy,
    widok_parytetu,
    wpis_do_zapisu,
    wpis_z_wyniku,
    zapis_liczby,
    zbierz_hashe,
)

_PLIK = Path(__file__).parent / "zlote_hashe.json"
_LIMIT_MELDUNKU_PODDRZEWA = 16_000


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
    meldunek = "\n".join(f"  {k}: " + "; ".join(v) for k, v in sorted(zle.items()))
    # Diagnostyka z logu CI: szkielet pierwszego rozbieżnego poddrzewa pierwszego
    # wpisu — na tej maszynie nie ma złotego szkieletu, więc to jedyny sposób,
    # żeby z logu odczytać, CO (nie tylko GDZIE) się różni.
    for klucz in sorted(zle):
        sciezki = sciezki_rozbieznosci_szkieletu(zlote[klucz], zebrane[klucz])
        if sciezki and zebrane[klucz].get("szkielet") is not None:
            fragment = json.dumps(
                poddrzewo(zebrane[klucz]["szkielet"], sciezki[0]),
                ensure_ascii=False,
                sort_keys=True,
            )
            meldunek += (
                f"\n  szkielet {klucz} {sciezki[0]} (teraz): "
                f"{fragment[:_LIMIT_MELDUNKU_PODDRZEWA]}"
                f"\n  wiersze {klucz} (teraz):\n{streszczenie_wierszy(zebrane[klucz]['szkielet'])}"
            )
            break
    assert not zle, "Parytet assemblera złamany:\n" + meldunek


def test_harness_jest_deterministyczny(zebrane: dict[str, dict]) -> None:
    """Ta sama maszyna, dwa biegi: równość DOKŁADNA (szkielet, skróty, liczby, ścieżki, ślad)."""
    assert zbierz_hashe(sieci_enm_rejestru()) == zebrane


def test_widok_parytetu_rozdziela_szkielet_od_liczb_kontraktu() -> None:
    """Iloczyn cech: {liczba kontraktu, ślad, ślad None, int, bool, str, None} × {dict, lista}."""
    szkielet, liczby, slady = widok_parytetu(
        {
            "results": [
                {
                    "ikss_a": 1234.5678,
                    "kappa": 1.6,
                    "branch_contributions": [{"i_contrib_a": 9e-14, "branch_id": "b1"}],
                    "branch_flow_trace": None,
                    "white_box_trace": [
                        {
                            "krok": "Zk",
                            "wartosc": 0.123,
                            "substitution_latex": "0.6 \\cdot 0.0483606",
                        }
                    ],
                    "fault_node_id": "n1",
                    "proof_ref": "proof:short-circuit:" + "a" * 64,
                    "proof_binding": {
                        "proof_ref": "proof:short-circuit:" + "b" * 64,
                        "kind": "wbt",
                    },
                    "iteracje": 3,
                    "requires_z0": False,
                    "z0_source": None,
                }
            ],
            "graph": {"nodes": [{"id": "n1", "voltage_kv": 15.0}]},
        }
    )
    wynik = szkielet["results"][0]
    assert wynik["ikss_a"] == ZNACZNIK_LICZBY
    assert wynik["branch_contributions"] == ZNACZNIK_SLADU
    assert wynik["white_box_trace"] == ZNACZNIK_SLADU
    assert wynik["branch_flow_trace"] is None
    assert wynik["proof_ref"] == "proof:short-circuit:" + ZNACZNIK_SKROTU
    assert wynik["proof_binding"]["proof_ref"] == "proof:short-circuit:" + ZNACZNIK_SKROTU
    assert wynik["proof_binding"]["kind"] == "wbt"
    assert wynik["iteracje"] == 3
    assert wynik["requires_z0"] is False
    assert wynik["z0_source"] is None
    assert wynik["fault_node_id"] == "n1"
    assert list(wynik) == sorted(wynik)
    assert liczby == [
        ("$.graph.nodes[0].voltage_kv", 15.0),
        ("$.results[0].ikss_a", 1234.5678),
        ("$.results[0].kappa", 1.6),
    ]
    assert slady == [
        [{"i_contrib_a": 9e-14, "branch_id": "b1"}],
        [{"krok": "Zk", "wartosc": 0.123, "substitution_latex": "0.6 \\cdot 0.0483606"}],
    ]
    skroty = skroty_szkieletu(szkielet)
    assert set(skroty) == {"$.results", "$.results[0]", "$.graph", "$.graph.nodes"}
    assert all(len(v) == 16 for v in skroty.values())
    assert max(p.count(".") + p.count("[") for p in skroty) == GLEBOKOSC_SKROTOW
    assert poddrzewo(szkielet, "$.results[0].proof_binding") == wynik["proof_binding"]
    assert poddrzewo(szkielet, "$") is szkielet
    assert poddrzewo(szkielet, "$.non_reportable_fault_node_ids[0]") == BRAK_PODDRZEWA
    assert poddrzewo(szkielet, "$.results[7]") == BRAK_PODDRZEWA
    assert streszczenie_wierszy(szkielet) == "[0] n1 None - pola=0"
    assert streszczenie_wierszy({"graph": {}}) == "(brak listy results)"


def _baza_wyniku() -> dict:
    return {
        "results": [
            {
                "ikss_a": 1234.5678,
                "kappa": 1.6,
                "un_v": 15000.0,
                "reszta": 0.0,
                "dopuszczalnosc_raportowa": True,
                "contributions": [{"source_id": "THEVENIN_GRID", "i_contrib_a": 1234.5678}],
                "branch_contributions": [
                    {"branch_id": "b1", "i_contrib_a": 900.0},
                    {"branch_id": "b2", "i_contrib_a": 334.5678},
                ],
                "branch_flow_trace": [
                    {"step": "b1", "notes": None, "result": {"fraction": 0.7}},
                    {"step": "kcl", "result": {"fraction_sum": 1.0}},
                ],
                "white_box_trace": [{"krok": "Zk", "wartosc": 0.123}],
            }
        ],
        "graph": {"nodes": [{"id": "n1", "voltage_kv": 15.0}]},
    }


def test_szkielet_nie_zalezy_od_czlonkostwa_sladu_a_wykrywa_zmiane_kontraktu() -> None:
    """Iloczyn cech: {długość listy, notatka None/napis, kolejność wpisu KCL} × {ślad, kontrakt}.

    Klasa z CI run 4876: solver (FROZEN) buduje ślad progiem zerowym na liczbie —
    gałąź o prądzie dokładnie 0 na jednej maszynie i 10⁻¹⁷ na drugiej wchodzi do
    listy albo nie. Między maszynami ślad nie jest porównywany; lokalnie
    (``slad_sha256``) nadal dokładnie.
    """
    zloty = wpis_z_wyniku(_baza_wyniku())
    assert set(wpis_do_zapisu(zloty)) == {"odmowa", "szkielet_sha256", "szkielet_skroty", "liczby"}
    assert set(zloty) - set(wpis_do_zapisu(zloty)) == set(POLA_TYLKO_W_PAMIECI)

    inny_slad = _baza_wyniku()
    wynik = inny_slad["results"][0]
    wynik["branch_contributions"].append({"branch_id": "b3", "i_contrib_a": 1e-17})
    wynik["branch_flow_trace"][0]["notes"] = "gałąź o zerowym wkładzie"
    wynik["branch_flow_trace"].insert(1, {"step": "b3", "notes": None, "result": {"fraction": 0.0}})
    wynik["white_box_trace"].append({"krok": "dodatkowy", "wartosc": 0.0})
    teraz = wpis_z_wyniku(inny_slad)
    assert porownaj_wpis(wpis_do_zapisu(zloty), teraz) == []
    assert teraz["szkielet_sha256"] == zloty["szkielet_sha256"]
    assert teraz["szkielet_skroty"] == zloty["szkielet_skroty"]
    assert teraz["liczby"] == zloty["liczby"]
    assert teraz["slad_sha256"] != zloty["slad_sha256"]

    for zmiana_kontraktu in (
        lambda w: w["contributions"].append({"source_id": "PV-1", "i_contrib_a": 0.0}),
        lambda w: w.__setitem__("dopuszczalnosc_raportowa", False),
        lambda w: w.__setitem__("branch_contributions", None),
    ):
        inny_kontrakt = _baza_wyniku()
        zmiana_kontraktu(inny_kontrakt["results"][0])
        teraz = wpis_z_wyniku(inny_kontrakt)
        (komunikat,) = porownaj_wpis(wpis_do_zapisu(zloty), teraz)
        assert komunikat.startswith("szkielet:") and "ścieżki (1): $.results[0]" in komunikat
        assert sciezki_rozbieznosci_szkieletu(zloty, teraz) == ["$.results[0]"]
        assert poddrzewo(teraz["szkielet"], "$.results[0]") == teraz["szkielet"]["results"][0]

    bez_mapy = {k: v for k, v in wpis_do_zapisu(zloty).items() if k != "szkielet_skroty"}
    bez_mapy["szkielet_sha256"] = "0" * 64
    (komunikat,) = porownaj_wpis(bez_mapy, teraz)
    assert komunikat.endswith("ścieżki (0): brak mapy skrótów")


def test_porownanie_wykrywa_zmiane_fizyczna_a_toleruje_szum_platformy() -> None:
    """Iloczyn cech: {szum 1e-8 wzgl., zero→1e-17, zmiana 1e-4 wzgl., inna odmowa, inna struktura}."""
    baza_raw = {
        "results": [{"ikss_a": 1234.5678, "kappa": 1.6, "un_v": 15000.0, "reszta": 0.0}],
        "graph": {"nodes": [{"id": "n1", "voltage_kv": 15.0}]},
    }

    zloty = wpis_do_zapisu(wpis_z_wyniku(baza_raw))
    assert "sciezki" not in zloty and zloty["liczby"] == [15.0, 1234.568, 1.6, 0.0, 15000.0]

    szum = json.loads(json.dumps(baza_raw))
    szum["results"][0]["ikss_a"] *= 1 + 1e-8
    szum["results"][0]["reszta"] = 3e-14  # przeplyw galezi nieobciazonej: szum 1e-14 vs 0
    szum["graph"]["nodes"][0]["voltage_kv"] *= 1 - 1e-8
    assert porownaj_wpis(zloty, wpis_z_wyniku(szum)) == []

    zmiana = json.loads(json.dumps(baza_raw))
    zmiana["results"][0]["ikss_a"] *= 1 + 1e-4
    (komunikat,) = porownaj_wpis(zloty, wpis_z_wyniku(zmiana))
    assert "$.results[0].ikss_a" in komunikat and "1 rozbieżności" in komunikat

    inna_struktura = json.loads(json.dumps(baza_raw))
    inna_struktura["results"][0]["reporting_status"] = "not_reportable"
    (komunikat,) = porownaj_wpis(zloty, wpis_z_wyniku(inna_struktura))
    assert komunikat.startswith("szkielet:") and "ścieżki (1): $.results[0]" in komunikat

    odmowa = {"odmowa": "ValueError: osobliwa Y", "szkielet_sha256": None, "liczby": None}
    assert porownaj_wpis(odmowa, dict(odmowa)) == []
    assert porownaj_wpis(odmowa, wpis_z_wyniku(baza_raw))[0].startswith("odmowa:")

    # Granica tolerancji jest jawna: ATOL + RTOL·|a| — 99 % marginesu przechodzi,
    # 101 % nie (dokładna granica jest źle uwarunkowana numerycznie: |a − b| z
    # kasowaniem cyfr, więc test nie stoi na jednym ulp).
    a = 1234.568
    margines = ATOL_PARYTETU + RTOL_PARYTETU * a
    for mnoznik, oczekiwane in ((0.99, []), (1.01, ["liczby"])):
        granica = {
            "odmowa": None,
            "szkielet_sha256": zloty["szkielet_sha256"],
            "liczby": [15.0, a + mnoznik * margines, 1.6, 0.0, 15000.0],
        }
        wynik = porownaj_wpis(zloty, granica)
        assert [w.split(":")[0] for w in wynik] == oczekiwane, (mnoznik, wynik)
    assert zapis_liczby(0.0) == 0.0 and zapis_liczby(-0.0) == 0.0
