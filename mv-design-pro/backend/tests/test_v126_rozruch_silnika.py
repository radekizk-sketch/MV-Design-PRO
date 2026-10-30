"""Rozruch bezpośredni silnika V12.6 — wyrocznie i iloczyn cech (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3, wersja solvera v126-academic-whitebox-1.4).

Dawny rozruch: prąd znamionowy z zaszytego iloczynu 0,9, impedancja źródła z podziału mocy
zwarciowej albo z „pierwszej gałęzi zasilającej”, a bez niej z 0,1 + j0,4 Ω, wskaźnik cieplny
k_LR²·t_r/t_utyku (prąd zablokowanego wirnika policzony drugi raz) i werdykt „zgodny/
niezgodny” bez podstawy. Wyrocznie poniżej liczą wielkości jawnymi wzorami:

- I_n = P_n/(√3·U_n·cos φ_n·η_n), I_r = k_LR·I_n;
- ΔU = |Z_th|·I_r/U_f·100 %, Z_th — impedancja zastępcza sieci w węźle silnika (szyna
  źródłowa: Z_th = Z_Q; szyna za kablem: Z_th = Z_Q + Z_kabla);
- t_r/t_utyku; M_r = 2·M_max/(1/s_k + s_k).

Iloczyn: tabliczka {cos φ_n i η_n podane, brak — wartości robocze rejestru maszyn}
× źródło {Z_Q modelu, podział mocy zwarciowej (dana przyjęta), brak źródła w obszarze,
źródło za transformatorem} × szyna {źródłowa, za kablem} × czas {t_r < t_utyku, =, >}
× moment {M_r ≥ M_obc, <} → wiersz solvera i rekordy kryteriów Z-9, Z-10, Z-11.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from application.analyses.v126_oceny import oceny_wyniku_v126
from network_model.catalog.wartosci_robocze import (
    PARAMETR_COS_PHI_MASZYNY,
    PARAMETR_SPRAWNOSC,
    PROPOZYCJE_MASZYNY,
    RODZINA_MASZYNA_ASYNCHRONICZNA,
)
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126MotorInput,
    V126TransformerInput,
)

U_KV = 6.0
Z_Q = complex(0.05, 0.6)
Z_KABEL_NA_KM = complex(0.2, 0.1)
DLUGOSC_KM = 1.5
_PROPOZYCJE = PROPOZYCJE_MASZYNY[RODZINA_MASZYNA_ASYNCHRONICZNA]
COS_ROBOCZY = float(_PROPOZYCJE[PARAMETR_COS_PHI_MASZYNY].wartosc or 0.0)
ETA_ROBOCZE = float(_PROPOZYCJE[PARAMETR_SPRAWNOSC].wartosc or 0.0)


def _silnik(bus_ref: str, **zmiany: Any) -> V126MotorInput:
    dane: dict[str, Any] = {
        "ref": "M1",
        "bus_ref": bus_ref,
        "rated_kw": 800.0,
        "rated_voltage_kv": U_KV,
        "locked_rotor_multiplier": 6.0,
        "start_power_factor": 0.2,
        "start_time_s": 8.0,
        "allowable_locked_rotor_time_s": 20.0,
        "max_torque_pu": 2.2,
        "critical_slip": 0.15,
        "load_start_torque_pu": 0.5,
    }
    dane.update(zmiany)
    return V126MotorInput(**dane)


def _model(zrodlo: str, szyna_silnika: str, **zmiany_silnika: Any) -> V126AcademicInput:
    """Sieć: szyna A (źródło) — kabel — szyna B; wariant ``za_transformatorem`` dokłada
    szynę C 20 kV ze źródłem, połączoną z A transformatorem."""
    szyna_a: dict[str, Any] = {"ref": "A", "name": "Szyna A", "nominal_kv": U_KV}
    szyny: list[V126BusInput] = []
    transformatory: list[V126TransformerInput] = []
    if zrodlo == "z_q":
        szyna_a.update(source_r_ohm=Z_Q.real, source_x_ohm=Z_Q.imag)
    elif zrodlo == "moc_zwarciowa":
        szyna_a.update(fault_level_mva=60.0)
    elif zrodlo == "za_transformatorem":
        szyny.append(
            V126BusInput(
                ref="C", name="Szyna C", nominal_kv=20.0, source_r_ohm=0.1, source_x_ohm=2.0
            )
        )
        transformatory.append(
            V126TransformerInput(
                ref="T1",
                hv_bus_ref="C",
                lv_bus_ref="A",
                sn_mva=10.0,
                uhv_kv=20.0,
                ulv_kv=U_KV,
                uk_percent=8.0,
                pk_kw=60.0,
            )
        )
    szyny.insert(0, V126BusInput(**szyna_a))
    szyny.insert(1, V126BusInput(ref="B", name="Szyna B", nominal_kv=U_KV))
    return V126AcademicInput(
        buses=szyny,
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="A",
                to_bus_ref="B",
                kind="cable",
                length_km=DLUGOSC_KM,
                r_ohm_per_km=Z_KABEL_NA_KM.real,
                x_ohm_per_km=Z_KABEL_NA_KM.imag,
            )
        ],
        transformers=transformatory,
        motors=[_silnik(szyna_silnika, **zmiany_silnika)],
    )


def _bieg(model: V126AcademicInput) -> tuple[dict[str, Any], dict[str, Any]]:
    wynik = V126AcademicSolver().run(V126AnalysisType.MOTOR_STARTING, model)["result"]
    (wymaganie,) = oceny_wyniku_v126(
        "motor_starting", wynik, wersja_silnika=None, odcisk=None, nazwy={}
    )
    skladowe = {o["kryterium_id"].split(".")[2]: o for o in wymaganie["oceny_skladowe"]}
    return wynik["motors"][0], {"wymaganie": wymaganie, **skladowe}


@pytest.mark.parametrize("tabliczka", ["podana", "brak"])
@pytest.mark.parametrize("zrodlo", ["z_q", "moc_zwarciowa"])
@pytest.mark.parametrize("szyna", ["A", "B"])
def test_wiersz_rozruchu_z_wyroczni(tabliczka: str, zrodlo: str, szyna: str) -> None:
    zmiany = {"rated_power_factor": 0.88, "rated_efficiency": 0.96} if tabliczka == "podana" else {}
    wiersz, oceny = _bieg(_model(zrodlo, szyna, **zmiany))
    cos_phi, eta = (0.88, 0.96) if tabliczka == "podana" else (COS_ROBOCZY, ETA_ROBOCZE)
    i_n = 800.0 / (math.sqrt(3.0) * U_KV * cos_phi * eta)
    i_r = 6.0 * i_n
    if zrodlo == "z_q":
        z_zrodla = Z_Q
    else:
        z = U_KV**2 / 60.0
        z_zrodla = complex(0.15 * z, 0.99 * z)
    z_th = z_zrodla + (Z_KABEL_NA_KM * DLUGOSC_KM if szyna == "B" else 0j)
    du = abs(z_th) * i_r / (U_KV * 1000.0 / math.sqrt(3.0)) * 100.0
    assert wiersz["rated_current_a"] == pytest.approx(i_n, abs=5e-4)  # zaokr. 3 miejsca
    assert wiersz["i_start_a"] == pytest.approx(i_r, abs=5e-4)
    assert complex(
        wiersz["thevenin_impedance_ohm"]["r_ohm"], wiersz["thevenin_impedance_ohm"]["x_ohm"]
    ) == pytest.approx(z_th, abs=1e-6)
    assert wiersz["voltage_dip_percent"] == pytest.approx(du, abs=5e-5)
    assert wiersz["locked_rotor_time_ratio"] == pytest.approx(8.0 / 20.0)
    m_r = 2.0 * 2.2 / (1.0 / 0.15 + 0.15)
    assert wiersz["torque_start_pu"] == pytest.approx(m_r, rel=1e-4)
    # Dane przyjęte: wartości robocze tabliczki ⇔ brak tabliczki; podział mocy zwarciowej ⇔
    # brak Z_Q (predykaty parami — dana przyjęta wtedy i tylko wtedy, gdy wartość robocza).
    nazwy = [d["nazwa_pl"] for d in wiersz["dane_przyjete"]]
    assert any("cos φ_n" in n for n in nazwy) is (tabliczka == "brak")
    assert any("Sprawność" in n for n in nazwy) is (tabliczka == "brak")
    assert any("mocy zwarciowej" in n for n in nazwy) is (zrodlo == "moc_zwarciowa")
    assert oceny["zapad"]["status_maszynowy"] == ("SPELNIA" if du <= 15.0 else "NIE_SPELNIA")
    assert oceny["zapad"]["wynik"]["wartosc"]["wartosc"] == pytest.approx(du, abs=5e-5)
    assert oceny["zapad"]["limit"]["wartosc"]["wartosc"] == 15.0
    assert oceny["zapad"]["podstawa"]["jednostka_redakcyjna"] == "§ Z-9"
    assert oceny["wymaganie"]["kompletnosc_dowodu"] == "NIEPELNY"


@pytest.mark.parametrize("zrodlo", ["brak", "za_transformatorem"])
def test_brak_impedancji_zastepczej_to_brak_nazwany_bez_liczby(zrodlo: str) -> None:
    wiersz, oceny = _bieg(_model(zrodlo, "B"))
    assert wiersz["thevenin_impedance_ohm"] is None
    assert wiersz["voltage_dip_percent"] is None
    fragment = "nie ma źródła sieciowego" if zrodlo == "brak" else "przez transformator"
    assert fragment in wiersz["message_pl"]
    assert oceny["zapad"]["status_maszynowy"] == "NIE_OCENIONO"
    assert oceny["wymaganie"]["status_maszynowy"] != "SPELNIA"
    # Kryteria niezależne od sieci (czas, moment) ocenia się dalej.
    assert oceny["czas"]["status_maszynowy"] == "SPELNIA"
    assert oceny["moment"]["status_maszynowy"] == "SPELNIA"


@pytest.mark.parametrize(
    ("t_r", "oczekiwany"), [(19.0, "SPELNIA"), (20.0, "SPELNIA"), (21.0, "NIE_SPELNIA")]
)
def test_czas_rozruchu_wobec_czasu_utyku(t_r: float, oczekiwany: str) -> None:
    """Czas utyku jest dopuszczalny PRZY prądzie zablokowanego wirnika — iloraz czasów bez
    mnożnika k_LR² (dawny wskaźnik 6²·8/20 = 14,4 „niezgodny” dla silnika z zapasem)."""
    wiersz, oceny = _bieg(_model("z_q", "A", start_time_s=t_r))
    assert wiersz["locked_rotor_time_ratio"] == pytest.approx(t_r / 20.0)
    assert oceny["czas"]["status_maszynowy"] == oczekiwany
    assert oceny["czas"]["podstawa"]["jednostka_redakcyjna"] == "§ Z-10"


@pytest.mark.parametrize(("m_obc", "oczekiwany"), [(0.5, "SPELNIA"), (0.7, "NIE_SPELNIA")])
def test_moment_rozruchowy_wobec_momentu_obciazenia(m_obc: float, oczekiwany: str) -> None:
    _, oceny = _bieg(_model("z_q", "A", load_start_torque_pu=m_obc))
    # M_r = 2·2,2/(1/0,15 + 0,15) = 0,6455 p.u.
    assert oceny["moment"]["status_maszynowy"] == oczekiwany
    assert oceny["moment"]["podstawa"]["jednostka_redakcyjna"] == "§ Z-11"
    if oczekiwany == "NIE_SPELNIA":
        assert oceny["wymaganie"]["status_maszynowy"] == "NIE_SPELNIA"


def test_wymagane_dane_silnika_bez_wartosci_domyslnych() -> None:
    """Dawne wartości domyślne kontraktu liczyły silnik, którego nikt nie opisał."""
    with pytest.raises(ValueError):
        V126MotorInput(ref="M1", bus_ref="A", rated_kw=800.0, rated_voltage_kv=U_KV)


def test_determinizm_rozruchu() -> None:
    model = _model("z_q", "B")
    pierwszy = V126AcademicSolver().run(V126AnalysisType.MOTOR_STARTING, model)
    drugi = V126AcademicSolver().run(V126AnalysisType.MOTOR_STARTING, model)
    assert pierwszy["deterministic_hash"] == drugi["deterministic_hash"]
    assert pierwszy["result"] == drugi["result"]


REF_SZYNA_GPZ = "gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn"
REF_SZYNA_STACJI = "station/1f4c9a02b7d84e6690ab5cc31d772e18/bus_sn"


def _model_z_identyfikatorami_enm(zrodlo: str, szyna_silnika: str) -> V126AcademicInput:
    """Ta sama sieć co `_model`, ale z identyfikatorami szyn w postaci mostu ENM — dana
    przyjęta podziału mocy zwarciowej czytana na ekranie nie może ich nieść."""
    zrodlo_gpz: dict[str, Any] = (
        {"source_r_ohm": Z_Q.real, "source_x_ohm": Z_Q.imag}
        if zrodlo == "z_q"
        else {"fault_level_mva": 60.0}
    )
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref=REF_SZYNA_GPZ, name="GPZ Zachód — szyny SN", nominal_kv=U_KV, **zrodlo_gpz
            ),
            V126BusInput(
                ref=REF_SZYNA_STACJI, name="Stacja SN/nN Ogrodowa", nominal_kv=U_KV, load_mw=1.0
            ),
        ],
        branches=[
            V126BranchInput(
                ref="branch/0a1b2c3d4e5f60718293a4b5c6d7e8f9",
                from_bus_ref=REF_SZYNA_GPZ,
                to_bus_ref=REF_SZYNA_STACJI,
                kind="cable",
                length_km=DLUGOSC_KM,
                r_ohm_per_km=Z_KABEL_NA_KM.real,
                x_ohm_per_km=Z_KABEL_NA_KM.imag,
                ampacity_a=300.0,
            )
        ],
        motors=[_silnik(szyna_silnika)],
        parameters={"hosting_monte_carlo_n": 20},
    )


@pytest.mark.parametrize(
    "rodzaj", [V126AnalysisType.MOTOR_STARTING, V126AnalysisType.HOSTING_CAPACITY]
)
@pytest.mark.parametrize("zrodlo", ["z_q", "moc_zwarciowa"])
@pytest.mark.parametrize("szyna", [REF_SZYNA_GPZ, REF_SZYNA_STACJI])
def test_dana_przyjeta_podzialu_zrodla_nazwana_nazwa_szyny(
    rodzaj: V126AnalysisType, zrodlo: str, szyna: str
) -> None:
    """Iloczyn: konsument impedancji zastępczej {rozruch, przepustowość} × źródło {Z_Q
    modelu, podział mocy zwarciowej} × węzeł {szyna źródłowa, za kablem}. Dana przyjęta
    podziału istnieje wtedy i tylko wtedy, gdy impedancja stoi na podziale roboczym, i nazywa
    szynę nazwą z modelu — nigdy identyfikatorem (dawniej `gpz/8600…/section/001/bus_sn`
    na ekranie rozruchu; przepustowość gubiła daną przyjętą w ogóle)."""
    wynik = V126AcademicSolver().run(rodzaj, _model_z_identyfikatorami_enm(zrodlo, szyna))["result"]
    if rodzaj is V126AnalysisType.MOTOR_STARTING:
        dane = wynik["motors"][0]["dane_przyjete"]
    else:
        dane = wynik.get("dane_przyjete", [])
    podzial = [d for d in dane if "mocy zwarciowej" in d["nazwa_pl"]]
    assert bool(podzial) is (zrodlo == "moc_zwarciowa")
    for dana in podzial:
        assert "GPZ Zachód — szyny SN" in dana["powod_pl"]
        assert dana["jakosc"] == "ESTIMATED"
        assert "860003b4514aa388b39561d5005ce584" not in dana["powod_pl"]
        assert "/" not in dana["powod_pl"].split("—")[0]
