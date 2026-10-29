"""Obciążalność zwarciowa cieplna rezystora punktu neutralnego SN w projekcie uziemienia V12.6
(karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, pozycja D31; rdzeń B-01 ``v126_academic``).

KRYTERIUM: prąd NAJWIĘKSZY rezystora wg IEC 60909-0 (c_max z tab. 1 — jedyny nośnik
``network_model.core.voltage_factor``; droga zerowa gałęzi uziemiającej Z_0,TU/3 + R_k),
prąd cieplny zastępczy I_th = I_R·√(m + n) (IEC 60909-0 §12, jedyne źródło
``compute_post_fault_quantities``), znamionowanie czasowe rezystora I_n, t_n (IEEE Std
C57.32): E_k = I_th²·R·t_wył ≤ E_n = I_n²·R·t_n; czas dopuszczalny t_dop: I_th(t)²·t = I_n²·t_n.

ILOCZYN CECH: impedancja zerowa w szeregu z rezystorem {Z_0,TU — zespół uziemiający,
Z_T0 — transformator, gdy rezystor jest w punkcie neutralnym uzwojenia TR (IEC 60909-0 §6:
Z_0 = Z_T0 + 3·R_N)} × czas wyłączenia {podany, brak} × liczba rezystorów {1, 2 równolegle na jedną
sieć} × c_max {z nośnika, brak — odmowa nazwana}. Wyrocznia ręczna:
``test_skladowa_zerowa_zu.wyrocznia_cieplna_rezystora``.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

from tests.enm.test_skladowa_zerowa_zu import (
    R_N,
    U_F_V,
    Z0_TU,
    _siec,
    _z_magistrala,
    _z_t_ohm,
    wyrocznia_cieplna_rezystora,
)

RODZAJ = V126AnalysisType.NEUTRAL_EARTHING_DESIGN


def _wejscie(wariant: str, zu: str, t_wyl_s: float | None) -> Any:
    enm = EnergyNetworkModel.model_validate(_z_magistrala(_siec(wariant, zu=zu), (2000,)))
    parametry = {} if t_wyl_s is None else {"ner_clearing_time_s": t_wyl_s}
    wejscie = build_v126_input_from_enm(enm, parameters=parametry, analysis_type=RODZAJ)
    return wejscie.model_copy(update={"parameters": parametry})


def _bieg(wejscie: Any) -> dict[str, Any]:
    return V126AcademicSolver().run(RODZAJ, wejscie)


def _i_th_kwadrat_razy_t(i_k: float, z: complex, t: float) -> float:
    """I_th(t)²·t z wyroczni ręcznej (IEC 60909-0 wz. 55 i 102)."""
    kappa = 1.02 + 0.98 * math.exp(-3.0 * z.real / z.imag) if z.imag > 0 else 1.02
    ln = math.log(kappa - 1.0)
    m = (math.exp(4.0 * 50.0 * t * ln) - 1.0) / (2.0 * 50.0 * t * ln)
    return i_k**2 * (m + 1.0) * t


@pytest.mark.parametrize("wariant", ["rezystor", "uzwojenie_tr"])
@pytest.mark.parametrize("t_wyl_s", [None, 0.5, 3.0])
def test_cieplo_rezystora_z_wyroczni(wariant: str, t_wyl_s: float | None) -> None:
    zu = "jedna"
    wejscie = _wejscie(wariant, zu, t_wyl_s)
    (siec,) = wejscie.uziemienie_sn.sieci
    assert siec.c_max == pytest.approx(1.1)
    assert "IEC 60909-0" in (siec.c_max_zrodlo_pl or "")
    (rez,) = siec.rezystory
    z0_tu = Z0_TU if wariant == "rezystor" else _z_t_ohm(_siec(wariant, zu=zu))
    assert complex(rez.z0_tu_r_ohm, rez.z0_tu_x_ohm) == pytest.approx(z0_tu, rel=1e-9)
    wynik = _bieg(wejscie)
    cieplo = wynik["result"]["thermal_check"]
    oczekiwane = wyrocznia_cieplna_rezystora(R_N, z0_tu, t_wyl_s)
    (wiersz,) = cieplo["resistors"]
    assert wiersz["i_resistor_a"] == pytest.approx(oczekiwane["i_k"], rel=1e-6)
    # Prąd największy (c_max, Z_0,TU) ≠ prąd nominalny U_f/R doboru — sonda różnicy.
    assert cieplo["i_resistor_a"] != pytest.approx(U_F_V / R_N, rel=1e-3)
    e_n = rez.i_n_a**2 * R_N * rez.t_n_s
    assert wiersz["energy_rating_j"] == pytest.approx(e_n, rel=1e-9)
    # Tożsamość czasu dopuszczalnego z wyroczni (nie z bisekcji solvera): t_dop zaokrąglony
    # do 4 miejsc, więc I_n²·t_n leży między I_th²·t w t_dop ∓ 1e-4 s.
    z = complex(R_N, 0.0) + z0_tu / 3.0
    t_dop = wiersz["permissible_time_s"]
    cel = rez.i_n_a**2 * rez.t_n_s
    assert _i_th_kwadrat_razy_t(oczekiwane["i_k"], z, t_dop - 1e-4) < cel
    assert _i_th_kwadrat_razy_t(oczekiwane["i_k"], z, t_dop + 1e-4) > cel
    kroki = {k["key"] for k in wynik["white_box_trace"]}
    if t_wyl_s is None:
        assert cieplo["status"] == "dane niekompletne"
        assert cieplo["missing_fields"] == ["ner_clearing_time_s"]
        assert "energy_dissipated_j" not in cieplo and "thermal_ok" not in cieplo
    else:
        assert wiersz["i_thermal_a"] == pytest.approx(oczekiwane["i_th"], rel=1e-6)
        assert wiersz["energy_dissipated_j"] == pytest.approx(oczekiwane["e_k"], rel=1e-6)
        # Kryterium energetyczne i czasowe są równoważne (I_th(t)²·t rośnie z t).
        assert wiersz["thermal_ok"] is (t_wyl_s <= t_dop)
        assert cieplo["thermal_ok"] is wiersz["thermal_ok"]
        assert cieplo["status"] == ("zgodny" if wiersz["thermal_ok"] else "niezgodny")
        assert cieplo["clearing_time_s"] == t_wyl_s
    # Ślad WHITE BOX: czas dopuszczalny zawsze; krok energii wyłącznie z czasem wyłączenia,
    # bez niego krok braku danych nazwanych.
    assert "ner_thermal_permissible_time" in kroki
    assert ("ner_thermal_withstand" in kroki) is (t_wyl_s is not None)
    assert ("ner_thermal_incomplete" in kroki) is (t_wyl_s is None)


def test_dwa_rezystory_jednej_sieci_rozstrzyga_najkrotszy_czas() -> None:
    """Dwa zespoły rezystorowe pracują równolegle na jedną sieć: wiersz na rezystor, wielkości
    główne z rezystora o najkrótszym czasie dopuszczalnym, werdykt — wszystkie rezystory."""
    wejscie = _wejscie("rezystor", "obie", 1.0)
    (siec,) = wejscie.uziemienie_sn.sieci
    assert len(siec.rezystory) == 2
    cieplo = _bieg(wejscie)["result"]["thermal_check"]
    assert len(cieplo["resistors"]) == 2
    assert [w["ref"] for w in cieplo["resistors"]] == [r.ref for r in siec.rezystory]
    rozstrzygajacy = min(cieplo["resistors"], key=lambda w: (w["permissible_time_s"], w["ref"]))
    assert cieplo["permissible_time_s"] == rozstrzygajacy["permissible_time_s"]
    assert cieplo["i_resistor_a"] == rozstrzygajacy["i_resistor_a"]
    assert cieplo["energy_dissipated_j"] == rozstrzygajacy["energy_dissipated_j"]
    assert cieplo["thermal_ok"] is all(w["thermal_ok"] for w in cieplo["resistors"])


def test_brak_c_max_to_odmowa_nazwana_bez_liczby() -> None:
    """Wejście bez c_max (iniekcja): odmowa nazwana polem nośnika, żadnej liczby cieplnej."""
    wejscie = _wejscie("rezystor", "jedna", 1.0)
    (siec,) = wejscie.uziemienie_sn.sieci
    bez_c = wejscie.model_copy(
        update={
            "uziemienie_sn": wejscie.uziemienie_sn.model_copy(
                update={"sieci": [siec.model_copy(update={"c_max": None})]}
            )
        }
    )
    cieplo = _bieg(bez_c)["result"]["thermal_check"]
    assert cieplo == {
        "status": "dane niekompletne",
        "missing_fields": ["uziemienie_sn.sieci.c_max"],
    }


def test_determinizm_sprawdzenia_cieplnego() -> None:
    a = _bieg(_wejscie("rezystor", "obie", 1.0))
    b = _bieg(_wejscie("rezystor", "obie", 1.0))
    assert a["result"]["thermal_check"] == b["result"]["thermal_check"]
    assert a.get("input_hash") == b.get("input_hash")
