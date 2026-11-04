"""Dane niezawodności elementów — wartość projektanta albo wartość robocza rejestru (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3; zasada nr 4).

Dawniej most ENM → V12.6 wpisywał λ i czas odnowy literałami (0,08/km·rok, 3,5 h linii;
0,015/km·rok, 12 h kabla; 0,015/rok, 4 h aparatu), kontrakt solvera miał własne domyślne
(0,015/rok, 12 h) dla wejścia spoza mostu, a katalog API „reliability-defaults” trzecią kopię
z wierszem transformatora, którego nikt nie czytał. Wynik nie mówił, że wskaźniki stoją na
założeniach. Teraz:

- jedno źródło wartości roboczych — `wartosci_robocze.PROPOZYCJE_NIEZAWODNOSCI` (most, katalog
  API, dane przyjęte);
- projektant zastępuje każdą wartość parametrem ``reliability_data`` (formularz analizy);
- dana przyjęta ESTIMATED powstaje wtedy i TYLKO wtedy, gdy podstawiono wartość roboczą
  (predykaty parami: ta sama klasa podstawia i zbiera — `_NiezawodnoscGalezi`);
- element bez danej (odcinek „na km” bez długości, wejście spoza mostu) nie wnosi zera —
  jest nazwany i nie wchodzi do wskaźników.

Iloczyn: rodzaj gałęzi {linia napowietrzna, kabel, aparat} × dane projektanta {brak, λ, czas
odnowy, oba} × długość {znana, brak} → wartości gałęzi i dane przyjęte; most ENM × parametr
biegu; solver × element {z danymi, bez danych}; walidacja parametru {nie-słownik, wartość
ujemna, wartość logiczna, tekst}.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.models import EnergyNetworkModel, ENMHeader
from network_model.catalog.wartosci_robocze import (
    PROPOZYCJE_NIEZAWODNOSCI,
    UDZIAL_MAIFI_DO_SAIFI,
    element_niezawodnosci,
)
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    KOD_DANE_NIEZAWODNOSCI_NIEPOPRAWNE,
    V126AcademicInput,
    V126AnalysisType,
    _NiezawodnoscGalezi,
    build_v126_input_from_enm,
    niezawodnosc_z_parametrow,
)

_RODZAJE = ("line_overhead", "cable", "breaker")
_DANE_PROJEKTANTA: dict[str, dict[str, float]] = {
    "brak": {},
    "lambda": {"failure_rate_per_year": 0.2},
    "mttr": {"mttr_h": 6.0},
    "oba": {"failure_rate_per_year": 0.2, "mttr_h": 6.0},
}


@pytest.mark.parametrize("dlugosc_km", [2.5, None])
@pytest.mark.parametrize("dane", sorted(_DANE_PROJEKTANTA))
@pytest.mark.parametrize("rodzaj", _RODZAJE)
def test_galaz_wartosc_projektanta_albo_robocza_z_dana_przyjeta(
    rodzaj: str, dane: str, dlugosc_km: float | None
) -> None:
    propozycja = PROPOZYCJE_NIEZAWODNOSCI[element_niezawodnosci(rodzaj)]
    most = _NiezawodnoscGalezi({"G1": _DANE_PROJEKTANTA[dane]})
    wynik = most.galaz("G1", "Kabel SN Leśna", rodzaj, dlugosc_km)
    lam_projektanta = "failure_rate_per_year" in _DANE_PROJEKTANTA[dane]
    mttr_projektanta = "mttr_h" in _DANE_PROJEKTANTA[dane]
    if lam_projektanta:
        assert wynik["failure_rate_per_year"] == 0.2
    elif propozycja.na_km and dlugosc_km is None:
        assert wynik["failure_rate_per_year"] is None
    else:
        krotnosc = dlugosc_km if propozycja.na_km else 1.0
        assert wynik["failure_rate_per_year"] == pytest.approx(
            propozycja.intensywnosc_uszkodzen * krotnosc
        )
    assert wynik["mttr_h"] == (6.0 if mttr_projektanta else propozycja.czas_odnowy_h)
    lam_robocza = not lam_projektanta and wynik["failure_rate_per_year"] is not None
    nazwy = [d.nazwa_pl for d in most.dane_przyjete()]
    assert (f"Intensywność uszkodzeń — {propozycja.nazwa_pl}" in nazwy) is lam_robocza
    assert (f"Czas odnowy zasilania — {propozycja.nazwa_pl}" in nazwy) is (not mttr_projektanta)
    assert all(d.jakosc.value == "ESTIMATED" for d in most.dane_przyjete())
    # Powód danej przyjętej wylicza elementy NAZWĄ z modelu — identyfikator nie jest
    # oznaczeniem dla projektanta (dawniej `corridor/6d2b…/segment/001` w podpowiedzi panelu).
    assert all("Kabel SN Leśna" in d.powod_pl for d in most.dane_przyjete())
    assert all("G1" not in d.powod_pl for d in most.dane_przyjete())


@pytest.mark.parametrize(
    "surowe",
    [
        {"G1": 0.1},
        {"G1": {"failure_rate_per_year": -0.1}},
        {"G1": {"mttr_h": True}},
        {"G1": {"mttr_h": "4"}},
    ],
)
@pytest.mark.parametrize("w_modelu", [True, False])
def test_parametr_niezawodnosci_niepoprawny_to_odmowa_nazwana(
    surowe: dict[str, Any], w_modelu: bool
) -> None:
    """Iloczyn: wpis niepoprawny {nie słownik, ujemny, logiczny, napis} × element {w modelu
    z nazwą, spoza modelu}. Zdanie odmowy nazywa element nazwą z modelu (strażnik
    `odmowa_bez_identyfikatora_guard`), identyfikator i pole są w strukturze odmowy."""
    nazwy = {"G1": "Linia SN Leśna"} if w_modelu else {}
    with pytest.raises(OdmowaNazwana) as blad:
        niezawodnosc_z_parametrow({"reliability_data": surowe}, nazwy)
    zdanie = str(blad.value)
    assert ("Linia SN Leśna" if w_modelu else "spoza modelu") in zdanie
    assert "G1" not in zdanie
    assert blad.value.kod == KOD_DANE_NIEZAWODNOSCI_NIEPOPRAWNE
    assert blad.value.dane["ref"] == "G1"
    assert isinstance(blad.value, OdmowaDanychError)


def test_parametr_niezawodnosci_nieobecny_daje_pusty_slownik() -> None:
    assert niezawodnosc_z_parametrow(None, {}) == {}
    assert niezawodnosc_z_parametrow({}, {}) == {}
    assert niezawodnosc_z_parametrow({"reliability_data": [1, 2]}, {}) == {}


def _enm() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="niezawodnosc").model_dump(),
            "buses": [
                {"ref_id": "A", "name": "Szyna A", "voltage_kv": 15.0},
                {"ref_id": "B", "name": "Szyna B", "voltage_kv": 15.0},
                {"ref_id": "C", "name": "Szyna C", "voltage_kv": 15.0},
            ],
            "branches": [
                {
                    "ref_id": "KABEL",
                    "name": "Kabel",
                    "type": "cable",
                    "from_bus_ref": "A",
                    "to_bus_ref": "B",
                    "length_km": 2.0,
                    "r_ohm_per_km": 0.206,
                    "x_ohm_per_km": 0.118,
                },
                {
                    "ref_id": "LINIA",
                    "name": "Linia",
                    "type": "line_overhead",
                    "from_bus_ref": "B",
                    "to_bus_ref": "C",
                    "length_km": 3.0,
                    "r_ohm_per_km": 0.3,
                    "x_ohm_per_km": 0.35,
                },
            ],
        }
    )


@pytest.mark.parametrize("parametr", ["brak", "kabel_projektanta"])
def test_most_enm_niesie_wartosci_i_dane_przyjete(parametr: str) -> None:
    parametry = (
        {}
        if parametr == "brak"
        else {"reliability_data": {"KABEL": {"failure_rate_per_year": 0.05, "mttr_h": 8.0}}}
    )
    wejscie = build_v126_input_from_enm(_enm(), parameters=parametry)
    kabel = next(b for b in wejscie.branches if b.ref == "KABEL")
    linia = next(b for b in wejscie.branches if b.ref == "LINIA")
    if parametr == "brak":
        assert kabel.failure_rate_per_year == pytest.approx(0.015 * 2.0)
        assert kabel.mttr_h == 12.0
    else:
        assert kabel.failure_rate_per_year == 0.05
        assert kabel.mttr_h == 8.0
    assert linia.failure_rate_per_year == pytest.approx(0.08 * 3.0)
    assert linia.mttr_h == 3.5
    nazwy = {d.nazwa_pl for d in wejscie.dane_przyjete_niezawodnosci}
    assert ("Intensywność uszkodzeń — linia kablowa SN" in nazwy) is (parametr == "brak")
    assert "Intensywność uszkodzeń — linia napowietrzna SN" in nazwy


def _wejscie_solvera(z_danymi_b: bool) -> V126AcademicInput:
    galaz_b: dict[str, Any] = {
        "ref": "G-B",
        "from_bus_ref": "A",
        "to_bus_ref": "B",
        "kind": "cable",
        "length_km": 1.0,
        "r_ohm_per_km": 0.2,
        "x_ohm_per_km": 0.1,
    }
    if z_danymi_b:
        galaz_b.update(failure_rate_per_year=0.3, mttr_h=5.0)
    return V126AcademicInput.model_validate(
        {
            "buses": [
                {"ref": "A", "name": "A", "nominal_kv": 15.0, "customer_count": 0},
                {"ref": "B", "name": "B", "nominal_kv": 15.0, "customer_count": 60},
                {"ref": "C", "name": "C", "nominal_kv": 15.0, "customer_count": 40},
            ],
            "branches": [
                galaz_b,
                {
                    "ref": "G-C",
                    "from_bus_ref": "B",
                    "to_bus_ref": "C",
                    "kind": "line_overhead",
                    "length_km": 2.0,
                    "r_ohm_per_km": 0.3,
                    "x_ohm_per_km": 0.35,
                    "failure_rate_per_year": 0.5,
                    "mttr_h": 4.0,
                },
            ],
        }
    )


@pytest.mark.parametrize("z_danymi_b", [True, False])
def test_wskazniki_z_wyroczni_i_element_bez_danych_nazwany(z_danymi_b: bool) -> None:
    wynik = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _wejscie_solvera(z_danymi_b)
    )["result"]
    # Wyrocznia IEEE Std 1366 (model solvera: odbiorcy szyny końcowej gałęzi):
    # SAIFI = Σ λ_i·N_i/N_T, SAIDI = Σ λ_i·r_i·60·N_i/N_T [min], MAIFI = 0,12·SAIFI.
    saifi = 0.5 * 40 / 100 + (0.3 * 60 / 100 if z_danymi_b else 0.0)
    saidi = 0.5 * 4.0 * 60 * 40 / 100 + (0.3 * 5.0 * 60 * 60 / 100 if z_danymi_b else 0.0)
    assert wynik["indices"]["saifi_per_year"] == pytest.approx(saifi, abs=1e-5)
    assert wynik["indices"]["saidi_min_per_year"] == pytest.approx(saidi, abs=1e-4)
    assert wynik["indices"]["maifi_per_year"] == pytest.approx(
        UDZIAL_MAIFI_DO_SAIFI * saifi, abs=1e-5
    )
    if z_danymi_b:
        assert "elementy_bez_danych_niezawodnosci" not in wynik
    else:
        assert wynik["elementy_bez_danych_niezawodnosci"] == ["G-B"]
        assert "1 z 2 elementów" in wynik["brak_danych_niezawodnosci"]
    assert any("MAIFI" in d["nazwa_pl"] for d in wynik["dane_przyjete"])


def test_katalog_api_wartosci_roboczych_to_rejestr() -> None:
    from api.v126_academic import get_v126_catalog

    wiersze = get_v126_catalog("reliability-defaults")["items"]
    assert [w["element"] for w in wiersze] == list(PROPOZYCJE_NIEZAWODNOSCI)
    for wiersz in wiersze:
        p = PROPOZYCJE_NIEZAWODNOSCI[wiersz["element"]]
        klucz = "lambda_per_km_year" if p.na_km else "lambda_per_year"
        assert wiersz[klucz] == p.intensywnosc_uszkodzen
        assert wiersz["mttr_h"] == p.czas_odnowy_h


@pytest.mark.parametrize("z_danymi_b", [True, False])
def test_ranking_zdarzen_bez_ciezkosci_za_zdarzeniami_z_ciezkoscia(z_danymi_b: bool) -> None:
    """Ciężkość nieobecna (zdarzenie z elementem bez danych niezawodności) nie jest
    zastępowana liczbą: ranking to zdarzenia z ciężkością malejąco, za nimi zdarzenia bez
    ciężkości w porządku nazw — tak samo przy każdym biegu (determinizm)."""
    ranking = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _wejscie_solvera(z_danymi_b)
    )["result"]["contingency_ranking"]
    ciezkosci = [z["severity"] for z in ranking]
    znane = [c for c in ciezkosci if c is not None]
    assert znane == sorted(znane, reverse=True)
    pierwsza_brak = next((i for i, c in enumerate(ciezkosci) if c is None), len(ciezkosci))
    assert all(c is None for c in ciezkosci[pierwsza_brak:])
    bez = [z["contingency"] for z in ranking if z["severity"] is None]
    assert bez == sorted(bez)
    assert (len(bez) > 0) is (not z_danymi_b)
    ponownie = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _wejscie_solvera(z_danymi_b)
    )["result"]["contingency_ranking"]
    assert ponownie == ranking
