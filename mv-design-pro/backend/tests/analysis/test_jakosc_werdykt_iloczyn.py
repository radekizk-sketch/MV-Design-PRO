"""Okno „Jakość wyników" jako werdykt wyjaśnialny — iloczyn cech (karta WERDYKT-MIGRACJA-190).

Cechy iloczynu:
* rodzaj oceny: wytrzymałość cieplna zwarciowa przewodu (W z trzema zapisami K i gałąź poza
  drogą zwarcia), warunki przyłączenia OSD (moc, cosφ, agregat W), walidacja energetyczna
  (pięć rodzajów kontroli, relacje NIE_WIECEJ i NIE_MNIEJ, próg ostrzeżenia), pasma
  wiarygodności (Ik'' per poziom napięcia, napięcie szyny, straty sieci, parametry linii 110 kV);
* stan: spełnia / nie spełnia / brak danych / wartość robocza (``ESTIMATED``) / wartość na
  granicy limitu;
* tekst rekordu: brak surowego kodu statusu, brak ``None``/``True``/``False``, liczby po polsku;
* para (kod zastany, status rekordu): kod jest PROJEKCJĄ rekordu — druga kopia warunku
  liczbowego (rozjazd kodu i rekordu) jest wykrywana dla każdej kombinacji.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

import pytest
from analysis.energy_validation.models import EnergyCheckType, EnergyValidationStatus
from analysis.energy_validation.oceny import ocena_pozycji, status_pozycji
from analysis.sanity_bounds.oceny import CREDIBLE, INCOMPLETE, OUT_OF_RANGE, kod_wiarygodnosci
from analysis.sanity_bounds.parametry_linii_bounds import ocen_parametry_linii_110kv
from analysis.sanity_bounds.power_flow_bounds import (
    evaluate_bus_voltage,
    evaluate_network_losses,
)
from analysis.sanity_bounds.short_circuit_bounds import evaluate_short_circuit_current
from application.analyses.warunki_przylaczenia import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    ocen_warunki_przylaczenia,
)
from network_model.catalog.wartosci_robocze import dana_przyjeta_tolerancji_nn
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
    ocena_galezi_poza_droga_zwarcia,
)

_ROZSTRZYGNIETE = ("SPELNIA", "NIE_SPELNIA")
_SUROWE = (
    "SPELNIA",
    "NIE_SPELNIA",
    "NIE_OCENIONO",
    "BRAK_DOWODU",
    "BRAK_PODSTAWY",
    "NIEPELNY",
    "ESTIMATED",
    "PASS",
    "FAIL",
    "WARNING",
    "UNAVAILABLE",
    "NOT_COMPUTED",
    "None",
    "True",
    "False",
)
_LICZBA_Z_KROPKA = re.compile(r"\d\.\d+\s?(A|kA|kV|MW|Mvar|MVA|%|mm²|A²·s|Ω/km|µS/km)(?!\w)")


def _teksty(rekord: dict[str, Any]) -> Iterator[str]:
    wyjasnienie = rekord["wyjasnienie"]
    yield wyjasnienie["zdanie_pl"]
    if wyjasnienie.get("przyczyna_pl"):
        yield wyjasnienie["przyczyna_pl"]
    yield from wyjasnienie.get("czego_brakuje", ())
    yield from wyjasnienie.get("zastrzezenia", ())
    yield rekord["etykieta"]["etykieta_pl"]
    for skladowa in rekord.get("oceny_skladowe", ()):
        yield from _teksty(skladowa)


def _sprawdz_tekst(rekord: dict[str, Any], *dodatkowe: str | None) -> None:
    teksty = [*_teksty(rekord), *(t for t in dodatkowe if t)]
    for tekst in teksty:
        for surowy in _SUROWE:
            assert not re.search(rf"\b{surowy}\b", tekst), (surowy, tekst)
        assert not _LICZBA_Z_KROPKA.search(tekst), tekst


def _ma_wartosc_robocza(rekord: dict[str, Any]) -> bool:
    return any(
        d["jakosc"] == "ESTIMATED" for d in rekord["dowod"]["status_danych"]["dane_przyjete"]
    )


# ---------------------------------------------------------------------------
# Wytrzymałość cieplna zwarciowa przewodu
# ---------------------------------------------------------------------------


def _cieplna(
    *,
    ith_a: float | None = 5_000.0,
    ith_1s_a: float | None = 14_000.0,
    jth: float | None = 94.0,
    material: str | None = "CU",
) -> ConductorThermalInput:
    return ConductorThermalInput(
        ith_a=ith_a,
        fault_duration_s=0.5,
        ith_1s_a=ith_1s_a,
        jth_1s_a_per_mm2=jth,
        cross_section_mm2=120.0,
        conductor_material=material,
        insulation="XLPE",
        temp_operating_c=90.0,
        temp_short_circuit_c=250.0,
        nazwa_pl="kabel L1",
    )


#: (opis, wejście, oczekiwany kod zastany, statusy K, czy wartość robocza)
_SCENY_CIEPLNE = [
    ("spelnia", _cieplna(), "PASS", ("SPELNIA",) * 3, False),
    ("nie_spelnia", _cieplna(ith_a=30_000.0), "FAIL", ("NIE_SPELNIA",) * 3, False),
    ("brak_pradu", _cieplna(ith_a=None), "UNAVAILABLE", ("NIE_OCENIONO",) * 2, False),
    (
        "brak_katalogu_i_materialu",
        _cieplna(ith_1s_a=None, jth=None, material=None),
        "UNAVAILABLE",
        ("NIE_OCENIONO",) * 2,
        False,
    ),
    ("wartosc_robocza_k", _cieplna(ith_1s_a=None, jth=None), "PASS", ("SPELNIA",) * 3, True),
    (
        "wartosc_robocza_k_nie_spelnia",
        _cieplna(ith_a=60_000.0, ith_1s_a=None, jth=None),
        "FAIL",
        ("NIE_SPELNIA",) * 3,
        True,
    ),
]


@pytest.mark.parametrize(
    ("opis", "wejscie", "kod", "statusy", "robocza"),
    _SCENY_CIEPLNE,
    ids=[s[0] for s in _SCENY_CIEPLNE],
)
def test_cieplna_kod_jest_projekcja_rekordu_iloczyn(
    opis: str,
    wejscie: ConductorThermalInput,
    kod: str,
    statusy: tuple[str, ...],
    robocza: bool,
) -> None:
    wynik = check_conductor_thermal_withstand(wejscie)
    rekord = wynik.ocena.model_dump(mode="json")
    assert tuple(o["status_maszynowy"] for o in rekord["oceny_skladowe"]) == statusy, opis
    assert wynik.status == kod, opis
    if kod == "UNAVAILABLE":
        # Brak danych nigdy nie jest spełnieniem (kontrakt §3) i nazywa brak.
        assert rekord["status_maszynowy"] not in _ROZSTRZYGNIETE, opis
        assert rekord["wyjasnienie"]["czego_brakuje"], opis
    # Kryteria cząstkowe: kod pozycji jest projekcją JEJ rekordu K.
    for pozycja in wynik.criteria:
        status_k = pozycja["ocena"]["status_maszynowy"]
        oczekiwany = {"SPELNIA": "PASS", "NIE_SPELNIA": "FAIL"}.get(status_k, "UNAVAILABLE")
        assert pozycja["status"] == oczekiwany, (opis, pozycja["kod"])
    # Wartość robocza k (IEC 60949) — ESTIMATED w danych przyjętych, dowód niepełny.
    for skladowa in rekord["oceny_skladowe"]:
        assert _ma_wartosc_robocza(skladowa) is robocza, opis
        if robocza:
            assert skladowa["kompletnosc_dowodu"] == "NIEPELNY", opis
    # Wrażliwość: zapas z backendu = dopełnienie wykorzystania (UI nie liczy progu).
    for punkt in wynik.sensitivity:
        assert punkt["zapas_procent"] == pytest.approx((1 - punkt["wykorzystanie"]) * 100, 1e-3)
    assert wynik.wyjasnienie == wynik.ocena.wyjasnienie
    _sprawdz_tekst(rekord, wynik.decision_reason_pl)


def test_cieplna_galaz_poza_droga_zwarcia_rekord_logiczny() -> None:
    ocena = ocena_galezi_poza_droga_zwarcia(
        nazwa_pl="kabel L2", stan_pl="każdy wkład źródła do gałęzi jest pomijalny"
    )
    rekord = ocena.model_dump(mode="json")
    (skladowa,) = rekord["oceny_skladowe"]
    assert skladowa["status_maszynowy"] == "SPELNIA"
    assert skladowa["kryterium"]["relacja"] == "LOGICZNE"
    assert skladowa["slad"], "kryterium logiczne musi wskazywać ślad wkładów"
    _sprawdz_tekst(rekord)


# ---------------------------------------------------------------------------
# Warunki przyłączenia OSD
# ---------------------------------------------------------------------------


def _rozplyw(p_mw: float, q_mvar: float) -> dict[str, Any]:
    return {
        "converged": True,
        "slack_bus_id": "BUS-PWP",
        "bus_results": [
            {
                "bus_id": "BUS-PWP",
                "v_pu": 1.0,
                "angle_deg": 0.0,
                "p_injected_mw": p_mw,
                "q_injected_mvar": q_mvar,
                "status": "solved",
            }
        ],
    }


_WARUNKI = {"moc_przylaczeniowa_mw": 5.0, "wymagany_cos_phi": 0.9}

#: (opis, warunki OSD, wynik rozpływu, status moc, status cosφ, kod ogólny)
_SCENY_WARUNKOW = [
    ("spelnia", _WARUNKI, _rozplyw(-4.0, 0.5), "SPELNIA", "SPELNIA", STATUS_PASS),
    ("nie_spelnia", _WARUNKI, _rozplyw(-6.2, 4.0), "NIE_SPELNIA", "NIE_SPELNIA", STATUS_FAIL),
    ("na_granicy_mocy", _WARUNKI, _rozplyw(-5.0, 0.0), "SPELNIA", "SPELNIA", STATUS_PASS),
    ("brak_warunkow", None, _rozplyw(-4.0, 0.5), "BRAK_PODSTAWY", "BRAK_PODSTAWY", "U"),
    ("brak_rozplywu", _WARUNKI, None, "NIE_OCENIONO", "NIE_OCENIONO", "U"),
    (
        "czesciowo_bez_cos_phi",
        {"moc_przylaczeniowa_mw": 5.0},
        _rozplyw(-4.0, 0.5),
        "SPELNIA",
        "BRAK_PODSTAWY",
        "U",
    ),
    (
        "naruszenie_mimo_braku",
        {"moc_przylaczeniowa_mw": 5.0},
        _rozplyw(-6.2, 0.5),
        "NIE_SPELNIA",
        "BRAK_PODSTAWY",
        STATUS_FAIL,
    ),
]


@pytest.mark.parametrize(
    ("opis", "warunki", "rozplyw", "st_moc", "st_cos", "kod"),
    _SCENY_WARUNKOW,
    ids=[s[0] for s in _SCENY_WARUNKOW],
)
def test_warunki_kod_jest_projekcja_rekordu_iloczyn(
    opis: str,
    warunki: dict[str, Any] | None,
    rozplyw: dict[str, Any] | None,
    st_moc: str,
    st_cos: str,
    kod: str,
) -> None:
    ocena = ocen_warunki_przylaczenia(connection_conditions=warunki, result_v1=rozplyw)
    moc, cos_phi = ocena.pozycje
    assert moc.ocena.status_maszynowy == st_moc, opis
    assert cos_phi.ocena.status_maszynowy == st_cos, opis
    for pozycja in ocena.pozycje:
        oczekiwany = {"SPELNIA": STATUS_PASS, "NIE_SPELNIA": STATUS_FAIL}.get(
            pozycja.ocena.status_maszynowy, STATUS_UNAVAILABLE
        )
        assert pozycja.status == oczekiwany, (opis, pozycja.kryterium)
        assert pozycja.wyjasnienie == pozycja.ocena.wyjasnienie
        _sprawdz_tekst(pozycja.ocena.model_dump(mode="json"), pozycja.opis_pl)
    assert ocena.status_ogolny == (STATUS_UNAVAILABLE if kod == "U" else kod), opis
    # Agregat: brak danych w którymkolwiek kryterium nie daje spełnienia (kontrakt §3).
    if kod == "U":
        assert ocena.ocena_wymagania.status_maszynowy not in _ROZSTRZYGNIETE, opis
    assert ocena.wyjasnienie == ocena.ocena_wymagania.wyjasnienie
    _sprawdz_tekst(ocena.ocena_wymagania.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Walidacja energetyczna
# ---------------------------------------------------------------------------

#: (rodzaj, wynik, limit, próg ostrzeżenia, status K, kod zastany)
_SCENY_WALIDACJI = [
    (EnergyCheckType.BRANCH_LOADING, 50.0, 100.0, 80.0, "SPELNIA", "PASS"),
    (EnergyCheckType.BRANCH_LOADING, 90.0, 100.0, 80.0, "SPELNIA", "WARNING"),
    (EnergyCheckType.BRANCH_LOADING, 100.0, 100.0, 80.0, "SPELNIA", "WARNING"),
    (EnergyCheckType.BRANCH_LOADING, 120.0, 100.0, 80.0, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.BRANCH_LOADING, None, 100.0, 80.0, "NIE_OCENIONO", "NOT_COMPUTED"),
    (EnergyCheckType.TRANSFORMER_LOADING, 70.0, 100.0, 80.0, "SPELNIA", "PASS"),
    (EnergyCheckType.TRANSFORMER_LOADING, 130.0, 100.0, 80.0, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.VOLTAGE_DEVIATION, 3.0, 10.0, 5.0, "SPELNIA", "PASS"),
    (EnergyCheckType.VOLTAGE_DEVIATION, 7.0, 10.0, 5.0, "SPELNIA", "WARNING"),
    (EnergyCheckType.VOLTAGE_DEVIATION, 12.0, 10.0, 5.0, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.VOLTAGE_DEVIATION, 12.0, 8.0, 5.0, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.LOSS_BUDGET, 3.0, 10.0, 5.0, "SPELNIA", "PASS"),
    (EnergyCheckType.LOSS_BUDGET, 11.0, 10.0, 5.0, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.REACTIVE_BALANCE, 0.95, 0.8, 0.9, "SPELNIA", "PASS"),
    (EnergyCheckType.REACTIVE_BALANCE, 0.85, 0.8, 0.9, "SPELNIA", "WARNING"),
    (EnergyCheckType.REACTIVE_BALANCE, 0.7, 0.8, 0.9, "NIE_SPELNIA", "FAIL"),
    (EnergyCheckType.REACTIVE_BALANCE, None, 0.8, 0.9, "NIE_OCENIONO", "NOT_COMPUTED"),
]


@pytest.mark.parametrize(
    ("rodzaj", "wynik", "limit", "ostrzezenie", "status_k", "kod"),
    _SCENY_WALIDACJI,
    ids=[f"{s[0].value}-{s[1]}-{s[2]}" for s in _SCENY_WALIDACJI],
)
def test_walidacja_kod_jest_projekcja_rekordu_iloczyn(
    rodzaj: EnergyCheckType,
    wynik: float | None,
    limit: float,
    ostrzezenie: float,
    status_k: str,
    kod: str,
) -> None:
    ocena = ocena_pozycji(
        check_type=rodzaj,
        nazwa_pl="element L1",
        wynik=wynik,
        limit=limit,
        braki=() if wynik is not None else ("Brak wielkości z wyniku rozpływu.",),
    )
    assert ocena.status_maszynowy == status_k
    status = status_pozycji(ocena, wynik=wynik, prog_ostrzezenia=ostrzezenie)
    assert status == EnergyValidationStatus(kod)
    # FAIL wyłącznie z rekordu naruszonego; brak danych nigdy PASS.
    assert (status is EnergyValidationStatus.FAIL) == (status_k == "NIE_SPELNIA")
    if wynik is None:
        assert ocena.wyjasnienie.czego_brakuje
    rekord = ocena.model_dump(mode="json")
    # Podstawa limitu nazwana: PN-EN 50160 tylko dla odchylenia napięcia przy ±10 %.
    podstawa = rekord["podstawa"]
    if rodzaj is EnergyCheckType.VOLTAGE_DEVIATION and limit == 10.0:
        assert podstawa["rodzaj"] == "NORMA"
    else:
        assert podstawa["rodzaj"] != "NORMA"
    _sprawdz_tekst(rekord)


# ---------------------------------------------------------------------------
# Pasma wiarygodności wyniku
# ---------------------------------------------------------------------------

_ROBOCZA_NN = dana_przyjeta_tolerancji_nn(miejsce_pl="punkt zwarcia: szyna nN stacji S1")

#: (opis, werdykt, status K, czy wartość robocza)
_SCENY_PASM = [
    ("ikss_sn_w_pasmie", evaluate_short_circuit_current(15.0, 10.0), "SPELNIA", False),
    ("ikss_sn_poza", evaluate_short_circuit_current(15.0, 80.0), "NIE_SPELNIA", False),
    ("ikss_sn_zero", evaluate_short_circuit_current(15.0, 0.0), "NIE_SPELNIA", False),
    ("ikss_brak_napiecia", evaluate_short_circuit_current(None, 10.0), "NIE_OCENIONO", False),
    ("ikss_brak_pradu", evaluate_short_circuit_current(15.0, None), "NIE_OCENIONO", False),
    (
        "ikss_nn_robocza",
        evaluate_short_circuit_current(0.4, 12.0, dane_przyjete=(_ROBOCZA_NN,)),
        "SPELNIA",
        True,
    ),
    ("napiecie_w_pasmie", evaluate_bus_voltage(15.0, 15.3), "SPELNIA", False),
    ("napiecie_na_granicy", evaluate_bus_voltage(15.0, 16.5), "SPELNIA", False),
    ("napiecie_poza", evaluate_bus_voltage(15.0, 17.5), "NIE_SPELNIA", False),
    ("napiecie_brak", evaluate_bus_voltage(15.0, None), "NIE_OCENIONO", False),
    ("straty_w_pasmie", evaluate_network_losses(0.2, 10.0), "SPELNIA", False),
    ("straty_poza", evaluate_network_losses(3.0, 10.0), "NIE_SPELNIA", False),
    ("straty_brak", evaluate_network_losses(None, 10.0), "NIE_OCENIONO", False),
]


@pytest.mark.parametrize(
    ("opis", "werdykt", "status_k", "robocza"), _SCENY_PASM, ids=[s[0] for s in _SCENY_PASM]
)
def test_pasma_kod_jest_projekcja_rekordu_iloczyn(
    opis: str, werdykt: Any, status_k: str, robocza: bool
) -> None:
    assert werdykt.ocena.status_maszynowy == status_k, opis
    assert werdykt.status == kod_wiarygodnosci(werdykt.ocena), opis
    assert werdykt.status == {"SPELNIA": CREDIBLE, "NIE_SPELNIA": OUT_OF_RANGE}.get(
        status_k, INCOMPLETE
    )
    assert werdykt.in_range is (werdykt.status == CREDIBLE), opis
    rekord = werdykt.ocena.model_dump(mode="json")
    assert _ma_wartosc_robocza(rekord) is robocza, opis
    if robocza:
        assert rekord["kompletnosc_dowodu"] == "NIEPELNY"
    if status_k == "NIE_OCENIONO":
        assert rekord["wyjasnienie"]["czego_brakuje"], opis
    assert werdykt.to_dict()["ocena"] == rekord
    _sprawdz_tekst(rekord, werdykt.why_pl)


def test_pasma_parametrow_linii_110kv_iloczyn() -> None:
    oceny = ocen_parametry_linii_110kv(
        r1_ohm_per_km=0.12,
        x1_ohm_per_km=0.39,
        b1_s_per_km=2.9e-6,
        r0_ohm_per_km=0.3,
        x0_ohm_per_km=0.1,  # X′0/X′1 ≈ 0,26 — poza pasmem
        b0_s_per_km=0.0,
    )
    statusy = {o.parametr: o.ocena.status_maszynowy for o in oceny}
    assert statusy["x1_ohm_per_km"] == "SPELNIA"
    assert statusy["x0_do_x1"] == "NIE_SPELNIA"
    for ocena in oceny:
        assert ocena.w_pasmie is (ocena.ocena.status_maszynowy == "SPELNIA")
        assert ocena.ocena_wiarygodnosci == kod_wiarygodnosci(ocena.ocena)
        _sprawdz_tekst(ocena.ocena.model_dump(mode="json"), ocena.wyjasnienie_pl)
    # X′1 = 0 → stosunek nie istnieje: ocena niewykonana, nigdy „w paśmie".
    bez_x1 = {
        o.parametr: o
        for o in ocen_parametry_linii_110kv(
            r1_ohm_per_km=0.12,
            x1_ohm_per_km=0.0,
            b1_s_per_km=2.9e-6,
            r0_ohm_per_km=0.3,
            x0_ohm_per_km=1.2,
            b0_s_per_km=1.8e-6,
        )
    }
    assert bez_x1["x0_do_x1"].ocena.status_maszynowy not in _ROZSTRZYGNIETE
    assert bez_x1["x0_do_x1"].w_pasmie is False


def test_rekordy_deterministyczne() -> None:
    """To samo wejście → identyczny rekord (determinizm)."""
    for _, wejscie, *_ in _SCENY_CIEPLNE:
        a = check_conductor_thermal_withstand(wejscie).ocena.model_dump(mode="json")
        b = check_conductor_thermal_withstand(wejscie).ocena.model_dump(mode="json")
        assert a == b
    for _, warunki, rozplyw, *_ in _SCENY_WARUNKOW:
        a = ocen_warunki_przylaczenia(connection_conditions=warunki, result_v1=rozplyw)
        b = ocen_warunki_przylaczenia(connection_conditions=warunki, result_v1=rozplyw)
        assert a.to_dict() == b.to_dict()
