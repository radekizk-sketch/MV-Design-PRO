"""Testy tożsamości `network_model/pochodne/skladowe_symetryczne.py` i formuł
dodanych do `wielkosci_pochodne.py` kartą W5-D (Z_s/Z_m z Z₀/Z₁, Ω z p.u.,
impedancja odniesiona do napięcia, prąd fazy).

Wejścia: impedancje zgodne i zerowe gałęzi z rejestru sieci (`r/x_ohm_per_km`,
`r0/x0_ohm_per_km` × długość) + wartości brzegowe. Tożsamości sprawdzane `==`
(bit w bit) wobec wyrażeń inline o tej samej kolejności działań, w tym wobec
`_ohm_to_pu` solvera FROZEN (tor pu → Ω → pu).
"""

from __future__ import annotations

import cmath

import pytest
from enm.models import Cable, OverheadLine
from network_model.pochodne import (
    impedancja_odniesiona_do_napiecia_ohm,
    impedancja_wlasna_ohm,
    impedancja_wzajemna_ohm,
    impedancja_z_jednostek_wzglednych_ohm,
    impedancja_zerowa_ohm,
    impedancja_zgodna_ohm,
    prad_fazy_z_mocy_i_napiecia_a,
)
from network_model.solvers.power_flow_unbalanced import _ohm_to_pu

from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru


def _pary_z0_z1_z_rejestru() -> list[tuple[complex, complex]]:
    pary: set[tuple[complex, complex]] = set()
    for _, enm in sieci_enm_rejestru():
        for galaz in enm.branches:
            if not isinstance(galaz, Cable | OverheadLine):
                continue
            if galaz.r0_ohm_per_km is None or galaz.x0_ohm_per_km is None:
                continue
            z1 = complex(galaz.r_ohm_per_km, galaz.x_ohm_per_km) * galaz.length_km
            z0 = complex(galaz.r0_ohm_per_km, galaz.x0_ohm_per_km) * galaz.length_km
            pary.add((z0, z1))
    return sorted(pary, key=lambda p: (p[0].real, p[0].imag, p[1].real, p[1].imag))


PARY_BRZEGOWE: list[tuple[complex, complex]] = [
    (0j, 0j),
    (complex(1e-9, 1e-9), complex(1e-9, 1e-9)),
    (complex(0.759, 0.3), complex(0.253, 0.1)),  # kabel YAKXS 120 (katalog: Z0 = 3·Z1)
    (complex(1.0873, 1.4737), complex(0.6960, 0.5178)),  # Kersting IEEE 34 cfg 300 [Ω/km]
    (complex(0.3, 1.2), complex(0.306, 0.34)),  # linia AFL 70
    (complex(5000.0, 9000.0), complex(1000.0, 2000.0)),
    (complex(0.1, 0.05), complex(0.4, 0.3)),  # Z0 < Z1 (Z_m ujemne — dozwolone algebraicznie)
]


def _pary() -> list[tuple[complex, complex]]:
    return _pary_z0_z1_z_rejestru() + PARY_BRZEGOWE


def test_rejestr_dostarcza_realne_pary_z0_z1() -> None:
    assert len(_pary_z0_z1_z_rejestru()) >= 5


@pytest.mark.parametrize(("z0", "z1"), _pary())
def test_tozsamosc_wzoru_zs_zm(z0: complex, z1: complex) -> None:
    assert impedancja_wlasna_ohm(z0, z1) == (z0 + 2.0 * z1) / 3.0
    assert impedancja_wzajemna_ohm(z0, z1) == (z0 - z1) / 3.0


@pytest.mark.parametrize(("z0", "z1"), _pary())
def test_zlozenie_zs_zm_i_odwrotnosci_odtwarza_z1_z0(z0: complex, z1: complex) -> None:
    z_s = impedancja_wlasna_ohm(z0, z1)
    z_m = impedancja_wzajemna_ohm(z0, z1)
    # Z₁ = Z_s − Z_m i Z₀ = Z_s + 2·Z_m — z dokładnością arytmetyki zmiennoprzecinkowej
    # (dzielenie przez 3 nie jest dokładne w IEEE 754; pomiar na parach rejestru i
    # brzegowych: największy błąd względny 5·10⁻¹⁶ przy Z₀ < Z₁ — kasowanie cyfr w
    # Z_s + 2·Z_m; tolerancja 1·10⁻¹³ = trzy rzędy zapasu nad pomiarem, nie ==).
    assert cmath.isclose(impedancja_zgodna_ohm(z_s, z_m), z1, rel_tol=1e-13, abs_tol=1e-300)
    assert cmath.isclose(impedancja_zerowa_ohm(z_s, z_m), z0, rel_tol=1e-13, abs_tol=1e-300)


@pytest.mark.parametrize(("z0", "z1"), _pary())
def test_z0_rowne_z1_daje_zerowa_impedancje_wzajemna(z0: complex, z1: complex) -> None:
    assert impedancja_wzajemna_ohm(z1, z1) == 0j
    assert impedancja_wlasna_ohm(z1, z1) == (z1 + 2.0 * z1) / 3.0


@pytest.mark.parametrize("base_kv", [0.4, 0.69, 6.0, 15.0, 20.0, 24.9, 30.0, 110.0])
@pytest.mark.parametrize("base_mva", [1.0, 10.0, 100.0])
@pytest.mark.parametrize("z_pu", [0j, complex(0.01, 0.05), complex(1.2, 3.4), complex(1e-7, 2e-7)])
def test_omy_z_pu_sa_odwrotnoscia_konwersji_solvera(
    base_kv: float, base_mva: float, z_pu: complex
) -> None:
    z_ohm = impedancja_z_jednostek_wzglednych_ohm(z_pu, base_kv, base_mva)
    assert z_ohm == z_pu * (base_kv**2 / base_mva)
    # Tor pu → Ω → pu przez `_ohm_to_pu` solvera FROZEN: mnożenie i dzielenie przez
    # tę samą bazę różni się do 1 ULP (pomiar na tej siatce: błąd względny
    # ≤ 2,3·10⁻¹⁶ = 1 ULP dla double), więc tolerancja 1 ULP·2 — nie ==.
    assert cmath.isclose(_ohm_to_pu(z_ohm, base_mva, base_kv), z_pu, rel_tol=4.5e-16, abs_tol=0.0)


@pytest.mark.parametrize(
    ("z_ohm", "u_wl", "u_odn"),
    [
        (complex(0.253, 0.1), 0.4, 15.0),
        (complex(0.253, 0.1), 15.0, 15.0),
        (complex(0.2, 0.4), 15.0, 0.4),
        (complex(3.0, 1.0), 20.0, 110.0),
    ],
)
def test_tozsamosc_impedancji_odniesionej(z_ohm: complex, u_wl: float, u_odn: float) -> None:
    assert impedancja_odniesiona_do_napiecia_ohm(z_ohm, u_wl, u_odn) == z_ohm * (u_odn / u_wl) ** 2
    if u_wl == u_odn:
        assert impedancja_odniesiona_do_napiecia_ohm(z_ohm, u_wl, u_odn) == z_ohm


@pytest.mark.parametrize("s_mva", [1e-6, 0.005, 0.21, 1.0, 33.3])
@pytest.mark.parametrize("u_f_kv", [0.23, 0.2309, 8.66, 14.43, 63.5])
def test_tozsamosc_pradu_fazy(s_mva: float, u_f_kv: float) -> None:
    assert prad_fazy_z_mocy_i_napiecia_a(s_mva, u_f_kv) == s_mva * 1000.0 / u_f_kv
