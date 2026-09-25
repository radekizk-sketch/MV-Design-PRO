"""Jakość energii i harmoniczne (ekran E-40): wynik solvera niezwalidowanego nie jest werdyktem.

Audyt harmonicznych 2026-09-23 wykazał, że jedyny solver harmoniczny (analiza V12.6
`power_quality_harmonics`) nie ma przekładni transformatora, zastępuje sieć nadrzędną
admitancją 1e6 S na pierwszej szynie modelu, pomija kondensatory i odbiory, liczy 18 zaszytych
rzędów i nie ma żadnej niezależnej wyroczni — sieć demonstracyjna dawała THD_U = 3049 % na szynie
nN i ~64 % na szynach SN, a status kompatybilności „zgodny" dostawała także szyna bez danych.
Do czasu nowego solvera z wyroczniami: status `NIE_OCENIONO` z wyjaśnieniem, ŻADNA liczba E-40
(THD, TDD, K, U_h, skan Z, „rezonanse") poza sekcją audytową, etykieta wiarygodności
„w paśmie wiarygodności" zamiast „zweryfikowany", solver FROZEN nietknięty (odcisk biegu ten sam).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from api.v126_academic import _with_parameter_payloads, get_v126_report, get_v126_result
from application.analyses.v126_katalog import KATALOG_ANALIZ_V126
from application.solvers.solver_capability_registry import SOLVER_CAPABILITY_REGISTRY
from network_model.solvers.v126_academic import V126_SOLVER_VERSION, V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType

from tests.uczciwosc.pomocnicze import (
    bieg_sceny_akademickiej,
    braki_tekstem,
    eksport_fixtur,
    model_sceny_akademickiej,
    sprawdz_ocene_niewykonana,
)

_PQ = V126AnalysisType.POWER_QUALITY_HARMONICS
#: Klucze liczb E-40, które nie mogą wyjść poza sekcję audytową odpowiedzi.
_KLUCZE_LICZB_E40 = {
    "thd_u_percent",
    "tdd_percent",
    "k_factor",
    "u_h",
    "i_h",
    "z_scan",
    "resonance_peaks",
    "violated_limits",
}
_KLUCZ_AUDYTU = "wynik_audytowy"


def _klucze_poza_audytem(dane: Any) -> set[str]:
    if isinstance(dane, dict):
        znalezione: set[str] = set()
        for klucz, wartosc in dane.items():
            if klucz == _KLUCZ_AUDYTU:
                continue
            znalezione.add(klucz)
            znalezione |= _klucze_poza_audytem(wartosc)
        return znalezione
    if isinstance(dane, list):
        znalezione = set()
        for element in dane:
            znalezione |= _klucze_poza_audytem(element)
        return znalezione
    return set()


def _statusy_kompatybilnosci(dane: Any) -> list[Any]:
    if isinstance(dane, dict):
        wynik = [dane["compatibility_status"]] if "compatibility_status" in dane else []
        for wartosc in dane.values():
            wynik += _statusy_kompatybilnosci(wartosc)
        return wynik
    if isinstance(dane, list):
        return [s for element in dane for s in _statusy_kompatybilnosci(element)]
    return []


def test_wynik_e40_niesie_ocene_niewykonana_i_zero_liczb_poza_audytem() -> None:
    bieg, _ = bieg_sceny_akademickiej(_PQ)
    odpowiedz = get_v126_result(bieg.id, _PQ)
    ladunek = odpowiedz["result"]["result"]

    ocena = ladunek["ocena"]
    rekord = sprawdz_ocene_niewykonana(ocena)
    assert rekord.dowod.rodzaj_twierdzenia == "STATIC_CALCULATION"
    assert rekord.podstawa.dokument == "PN-EN 50160" and rekord.podstawa.status == "NIEUSTALONE"
    braki = braki_tekstem(ocena)
    assert "przekładnią transformatora" in braki and "1e6 S" in braki
    assert "wyroczni" in braki and "sekcji audytowej" in braki

    poza = _klucze_poza_audytem(odpowiedz)
    assert not poza & _KLUCZE_LICZB_E40, poza & _KLUCZE_LICZB_E40
    audyt = ladunek[_KLUCZ_AUDYTU]
    assert "niezwalidowan" in audyt["naglowek_pl"]
    assert "nie jest wynikiem inżynierskim" in audyt["naglowek_pl"]
    assert audyt["nodes"], "liczby solvera zostają dostępne w sekcji audytowej"


def test_zaden_wezel_nie_dostaje_statusu_zgodny_takze_bez_danych() -> None:
    bieg, model = bieg_sceny_akademickiej(_PQ)
    ladunek = get_v126_result(bieg.id, _PQ)["result"]["result"]
    statusy = _statusy_kompatybilnosci(ladunek)
    assert len(statusy) == len(model.buses)
    assert set(statusy) == {"NIE_OCENIONO"}, statusy
    # Szyna bez źródła harmonicznego (brak danych) też NIE jest „zgodna".
    szyny_ze_zrodlem = {zrodlo.bus_ref for zrodlo in model.harmonic_sources}
    assert any(szyna.ref not in szyny_ze_zrodlem for szyna in model.buses)


def test_raport_e40_nie_niesie_werdyktu_zgodnosci() -> None:
    bieg, _ = bieg_sceny_akademickiej(_PQ)
    raport = get_v126_report(bieg.id, _PQ)
    tekst = repr(raport["sections"])
    assert "'zgodny'" not in tekst and "'niezgodny'" not in tekst
    assert "zweryfikowany" not in tekst


def test_odcisk_biegu_e40_rowny_odciskowi_solvera_frozen() -> None:
    """Solver FROZEN nietknięty: odcisk biegu (`deterministic_hash`) jest odciskiem solvera —
    zdjęcie werdyktu dzieje się na granicy aplikacji, po wyliczeniu odcisku."""
    bieg, model = bieg_sceny_akademickiej(_PQ)
    surowy = V126AcademicSolver().run(_PQ, model)
    assert bieg.raw_result is not None
    assert bieg.raw_result["deterministic_hash"] == surowy["deterministic_hash"]
    assert bieg.raw_result["result"]["solver_version"] == V126_SOLVER_VERSION


@pytest.mark.parametrize(
    "rodzaj",
    [
        V126AnalysisType.EARTHING_SAFETY,
        V126AnalysisType.MOTOR_STARTING,
        V126AnalysisType.SSCI_IMPEDANCE,
    ],
)
def test_etykieta_wiarygodnosci_to_pasmo_nie_weryfikacja(rodzaj: V126AnalysisType) -> None:
    """„Zweryfikowany" twierdził weryfikację, której nie było — blok wiarygodności sprawdza
    tylko, czy liczby leżą w paśmie fizycznym. Dotyczy KAŻDEGO rodzaju V12.6 (jedna granica),
    a odcisk biegu rodzaju niezwiązanego z werdyktem E-40 zostaje odciskiem solvera."""
    bieg, model = bieg_sceny_akademickiej(rodzaj)
    ladunek = get_v126_result(bieg.id, rodzaj)["result"]["result"]
    assert "zweryfikowany" not in repr(ladunek)
    status = ladunek["sanity"]["status"]
    assert status in ("w paśmie wiarygodności", "poza zakresem wiarygodności", "dane niekompletne")
    surowy = V126AcademicSolver().run(rodzaj, model)
    assert bieg.raw_result is not None
    assert bieg.raw_result["deterministic_hash"] == surowy["deterministic_hash"]


def test_nadpisanie_zrodel_harmonicznych_z_parametrow_jest_skasowane() -> None:
    """Surowe `parameters.harmonic_sources` omijało katalog i dostawało fałszywą proweniencję
    `KATALOG` — widmo podaje się kartą katalogową albo formularzem `harmonic_spectra`."""
    model = model_sceny_akademickiej(_PQ)
    przed = [zrodlo.model_dump() for zrodlo in model.harmonic_sources]
    wstrzykniete = {
        "harmonic_sources": [
            {
                "bus_ref": model.buses[0].ref,
                "source_ref": "wstrzykniete",
                "base_current_a": 999.0,
                "spectrum_percent": {"5": 50.0},
            }
        ]
    }
    with pytest.raises(ValueError, match="harmonic_sources"):
        _with_parameter_payloads(model, wstrzykniete)
    assert [zrodlo.model_dump() for zrodlo in model.harmonic_sources] == przed


def test_karta_e40_mowi_prawde_o_metodzie() -> None:
    karta = next(k for k in KATALOG_ANALIZ_V126 if k.kod == _PQ.value)
    zakres = karta.zakres_pl
    assert "2–49" not in zakres
    assert "wykrywaniem rezonansów" not in zakres
    assert not any("Moc zwarciowa" in dana.nazwa_pl for dana in karta.dane_z_modelu)
    uwagi = " ".join(karta.uwagi_metody_pl)
    assert "przekładni" in uwagi and "1e6 S" in uwagi and "18 zaszytych rzędów" in uwagi


# ILOCZYN CECH: rodzaj analizy (E-40 vs rodzaj, który czyta moc zwarciową) × powierzchnia
# twierdzenia o danych (karta katalogu vs gotowość „dane z modelu"). Tor harmoniczny nie czyta
# mocy zwarciowej, więc ŻADNA powierzchnia E-40 nie może jej wymieniać jako danej analizy;
# rodzaj, który ją czyta, nadal ją wymienia (kontrola dodatnia — mechanizm nie zniknął).
@pytest.mark.parametrize(
    ("rodzaj", "wymienia_moc_zwarciowa"),
    [(_PQ, False), (V126AnalysisType.MOTOR_STARTING, True)],
)
def test_gotowosc_nie_twierdzi_ze_e40_czyta_moc_zwarciowa(
    rodzaj: V126AnalysisType, wymienia_moc_zwarciowa: bool
) -> None:
    from application.analyses.v126_gotowosc import (
        ocen_gotowosc_v126,
        uzupelnij_parametry_z_modelu,
    )

    from tests.uczciwosc.pomocnicze import enm_sceny_akademickiej, parametry_sceny

    enm = enm_sceny_akademickiej()
    parametry = uzupelnij_parametry_z_modelu(enm, rodzaj, parametry_sceny(rodzaj.value))
    gotowosc = ocen_gotowosc_v126(enm, rodzaj, parametry)
    nazwy = [dana.nazwa_pl for dana in gotowosc.dane_z_modelu]
    assert ("Szyny z mocą zwarciową źródła" in nazwy) is wymienia_moc_zwarciowa, nazwy


@pytest.mark.parametrize(
    "zdolnosc", ["POWER_QUALITY_HARMONICS", "SSCI_IMPEDANCE", "DYNAMIC_STABILITY"]
)
def test_rejestr_zdolnosci_nazywa_stan_niezwalidowany(zdolnosc: str) -> None:
    wpis = SOLVER_CAPABILITY_REGISTRY[zdolnosc]  # type: ignore[index]
    assert wpis.implementation_status == "UNVALIDATED"
    assert wpis.reportable is False


@pytest.mark.parametrize("zdolnosc", sorted(SOLVER_CAPABILITY_REGISTRY))
def test_test_odniesienia_kazdej_zdolnosci_istnieje(zdolnosc: str) -> None:
    """KLASA, nie instancja: 18 z 24 wpisów rejestru wskazywało nieistniejące pliki testów
    (`short-circuit-all-fault-types.test.py` itd.) — deklaracja bez testu."""
    wpis = SOLVER_CAPABILITY_REGISTRY[zdolnosc]  # type: ignore[index]
    plik, *czlony = wpis.reference_test.split("::")
    sciezka = Path(__file__).resolve().parents[1] / plik
    assert sciezka.exists(), wpis.reference_test
    tresc = sciezka.read_text(encoding="utf-8")
    *klasy, funkcja = czlony
    for klasa in klasy:
        assert f"class {klasa}" in tresc, wpis.reference_test
    assert f"def {funkcja}(" in tresc, wpis.reference_test


def test_wersja_solvera_w_rejestrze_zgodna_z_solverem_dla_calej_rodziny_v126() -> None:
    for wpis in SOLVER_CAPABILITY_REGISTRY.values():
        if wpis.solver_version.startswith("v126-academic"):
            assert wpis.solver_version == V126_SOLVER_VERSION, wpis.capability


def test_scena_harnessu_nie_przypina_liczb_e40() -> None:
    """Złota fikstura THD_U 3049 % skasowana razem z przypięciem — scena akademicka nie niesie
    biegu E-40 (ekran pokazuje dla niej uczciwą gotowość/stan biegu, nie liczby)."""
    eksport = eksport_fixtur()
    sciezka = eksport.FIXTURES_DIR / "akademickie_scena_biegi.json"
    tresc = sciezka.read_text(encoding="utf-8")
    assert "3049" not in tresc
    assert _PQ.value not in eksport.akademickie_scena_biegi()["biegi"]
    for plik in sorted(eksport.FIXTURES_DIR.glob("*.json")):
        assert "thd_u_percent" not in plik.read_text(encoding="utf-8"), plik.name
