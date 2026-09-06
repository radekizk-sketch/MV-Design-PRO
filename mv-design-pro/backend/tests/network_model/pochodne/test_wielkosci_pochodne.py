"""Testy tożsamości wielkości pochodnych (CV-4.3 K4, karta CV-4.3-A3).

Każda funkcja w ``wielkosci_pochodne.py`` jest kopią JEDNEGO zmierzonego,
oryginalnego wyrażenia z konkretnego pliku konsumenckiego (patrz docstring
funkcji i inwentarz klasy w meldunku karty). Test tożsamości odtwarza TĘ
SAMĄ kolejność działań zmiennoprzecinkowych inline i sprawdza ``==`` (bit w
bit, NIE tolerancja) wobec wyniku funkcji — na wejściach z rejestru sieci
(``tests/golden/registry.py`` przez harness ``sieci_enm_rejestru``) i na
wartościach brzegowych.

Wejścia z rejestru: napięcia znamionowe szyn (``Bus.voltage_kv``) i moce
zwarciowe źródeł (``Source.sk3_mva``) — te dwie wielkości mają bezpośredni
odpowiednik w ENM. Pozostałe parametry formuł (cosφ, α, θ, R/X, prąd) nie są
polami rejestru (są danymi katalogowymi/normowymi przekazywanymi przez
wołającego), więc dla nich testy używają jawnie dobranych wartości
inżynierskich brzegowych (bardzo małe, bardzo duże, typowe SN/nN) — zgodnie
z inwentarzem karty (sekcja „Inwentarz klasy PRZED naprawą").
"""

from __future__ import annotations

import math

import pytest
from network_model.pochodne import wielkosci_pochodne as wp

from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru

# ---------------------------------------------------------------------------
# Wejścia z rejestru sieci
# ---------------------------------------------------------------------------


def _napiecia_z_rejestru() -> list[float]:
    napiecia: set[float] = set()
    for _, enm in sieci_enm_rejestru():
        for bus in enm.buses:
            if bus.voltage_kv and bus.voltage_kv > 0:
                napiecia.add(round(float(bus.voltage_kv), 6))
    return sorted(napiecia)


def _moce_zwarciowe_z_rejestru() -> list[float]:
    moce: set[float] = set()
    for _, enm in sieci_enm_rejestru():
        for source in enm.sources:
            if source.sk3_mva and source.sk3_mva > 0:
                moce.add(round(float(source.sk3_mva), 6))
    return sorted(moce)


NAPIECIA_REJESTRU_KV = _napiecia_z_rejestru()
MOCE_ZWARCIOWE_REJESTRU_MVA = _moce_zwarciowe_z_rejestru()

assert len(NAPIECIA_REJESTRU_KV) >= 2, "Rejestr sieci musi dostarczyć realne napięcia"
assert len(MOCE_ZWARCIOWE_REJESTRU_MVA) >= 1, "Rejestr sieci musi dostarczyć realną moc zwarciową"

# ---------------------------------------------------------------------------
# Wartości brzegowe (bardzo małe / bardzo duże / typowe SN-nN)
# ---------------------------------------------------------------------------

NAPIECIA_BRZEGOWE_KV = [1e-6, 0.001, 0.23, 0.4, 6.0, 15.0, 20.0, 30.0, 110.0, 220.0, 400.0, 1.0e6]
MOCE_BRZEGOWE_MVA = [1e-6, 0.001, 0.05, 1.0, 10.0, 100.0, 250.0, 1000.0, 1.0e6]
PRADY_BRZEGOWE_A = [1e-6, 0.1, 1.0, 100.0, 1000.0, 50000.0, 1.0e6]
COS_PHI_BRZEGOWE = [0.001, 0.1, 0.5, 0.8, 0.85, 0.9, 0.95, 0.999, 1.0]
TEMPERATURY_BRZEGOWE_C = [-40.0, -20.0, 0.0, 20.0, 40.0, 60.0, 80.0, 105.0, 250.0]
RX_BRZEGOWE = [0.0, 0.01, 0.05, 0.1, 0.15, 0.3, 1.0, 5.0, 20.0]
CZASY_BRZEGOWE_S = [1e-6, 0.01, 0.1, 0.5, 1.0, 3.0, 10.0]


def _napiecia() -> list[float]:
    return sorted(set(NAPIECIA_REJESTRU_KV) | set(NAPIECIA_BRZEGOWE_KV))


def _moce() -> list[float]:
    return sorted(set(MOCE_ZWARCIOWE_REJESTRU_MVA) | set(MOCE_BRZEGOWE_MVA))


# ---------------------------------------------------------------------------
# Stałe
# ---------------------------------------------------------------------------


def test_sqrt3_sqrt2_stale() -> None:
    assert wp.SQRT3 == math.sqrt(3.0)
    assert wp.SQRT2 == math.sqrt(2.0)
    # Warianty literałów zmierzone w inwentarzu (D.2) — wszystkie bit-identyczne.
    assert wp.SQRT3 == 3.0**0.5
    assert wp.SQRT3 == 3**0.5
    assert wp.SQRT3 == 1.7320508075688772


# ---------------------------------------------------------------------------
# Rodzina A — napięcie fazowe i prąd z mocy pozornej/zwarciowej
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("u_ll", _napiecia())
def test_napiecie_fazowe_v_tozsamosc(u_ll: float) -> None:
    """domain/dobor_przekladnika.py, enm/canonical_analysis.py i 6 kopii
    ``u_phase_v = trafo.ulv_kv*1000.0/math.sqrt(3.0)`` (D.9)."""
    oczekiwane = u_ll / math.sqrt(3.0)
    assert wp.napiecie_fazowe_v(u_ll) == oczekiwane


@pytest.mark.parametrize("u_ll_kv", NAPIECIA_BRZEGOWE_KV)
def test_napiecie_fazowe_v_ze_skalowaniem_kv_do_v_tozsamosc(u_ll_kv: float) -> None:
    """Wariant sześciu kopii: ``trafo.ulv_kv*1000.0/math.sqrt(3.0)`` — mnożenie
    PRZED wywołaniem (argument), nie wewnątrz funkcji — zachowuje kolejność."""
    oczekiwane = u_ll_kv * 1000.0 / math.sqrt(3.0)
    assert wp.napiecie_fazowe_v(u_ll_kv * 1000.0) == oczekiwane


@pytest.mark.parametrize("c", [0.95, 1.0, 1.05, 1.1])
@pytest.mark.parametrize("u_lv_kv", NAPIECIA_BRZEGOWE_KV)
def test_napiecie_fazowe_v_z_c_factor_tozsamosc(u_lv_kv: float, c: float) -> None:
    """network_model/core/branch.py::get_ikss_lv_ka — ``c*(voltage_lv_kv*1e3)/sqrt(3)``."""
    oczekiwane = c * (u_lv_kv * 1e3) / math.sqrt(3)
    assert wp.napiecie_fazowe_v(c * (u_lv_kv * 1e3)) == oczekiwane


@pytest.mark.parametrize("u", _napiecia())
@pytest.mark.parametrize("s", _moce())
def test_prad_z_mocy_pozornej_ka_tozsamosc(s: float, u: float) -> None:
    """proof_generator.py (×2), lv_circuit_verification.py, domain/units.py::i_base_ka,
    mv_source_catalog.py/enm/validator.py (Ik z Sk, sama formuła)."""
    oczekiwane = s / (math.sqrt(3.0) * u)
    assert wp.prad_z_mocy_pozornej_ka(s, u) == oczekiwane


@pytest.mark.parametrize("u", NAPIECIA_BRZEGOWE_KV)
@pytest.mark.parametrize("s", MOCE_BRZEGOWE_MVA)
def test_prad_roboczy_a_tozsamosc(s: float, u: float) -> None:
    """nn_circuit_sheet.py::_ib_z_tabliczki, protection/base_values/resolver.py."""
    oczekiwane = s * 1000.0 / (math.sqrt(3.0) * u)
    assert wp.prad_roboczy_a(s, u) == oczekiwane
    # Grupowanie odwrotne (protection/base_values/resolver.py: ``(sn*1000.0)/(sqrt(3)*u)``).
    oczekiwane_odwrotne = (s * 1000.0) / (math.sqrt(3) * u)
    assert wp.prad_roboczy_a(s, u) == oczekiwane_odwrotne


@pytest.mark.parametrize("u", _napiecia())
@pytest.mark.parametrize("s", _moce())
def test_prad_znamionowy_a_tozsamosc(s: float, u: float) -> None:
    """machine.py::ir_a (sync + async), der_sn_validation.py::rated_current_a,
    mapping.py (in_rated_a), cgmes_exporter.py::_ik_from_sk (3.0**0.5 — bit-identyczne)."""
    oczekiwane = s * 1.0e6 / (math.sqrt(3.0) * u * 1.0e3)
    assert wp.prad_znamionowy_a(s, u) == oczekiwane
    oczekiwane_1e6_literal = s * 1_000_000.0 / (math.sqrt(3.0) * u * 1_000.0)
    assert wp.prad_znamionowy_a(s, u) == oczekiwane_1e6_literal
    oczekiwane_pow05 = (s * 1.0e6) / (3.0**0.5 * u * 1.0e3)
    assert wp.prad_znamionowy_a(s, u) == oczekiwane_pow05


@pytest.mark.parametrize("cos_phi", COS_PHI_BRZEGOWE)
@pytest.mark.parametrize("u_v", [230.94, 400.0, 15000.0, 110000.0])
@pytest.mark.parametrize("p_w", [1.0, 1000.0, 1.0e6, 1.0e9])
def test_prad_znamionowy_z_mocy_czynnej_a_tozsamosc(p_w: float, u_v: float, cos_phi: float) -> None:
    """network_model/core/generator.py::GeneratorSN.get_rated_current_a."""
    oczekiwane = p_w / (math.sqrt(3) * u_v * cos_phi)
    assert wp.prad_znamionowy_z_mocy_czynnej_a(p_w, u_v, cos_phi) == oczekiwane


@pytest.mark.parametrize("i_a", PRADY_BRZEGOWE_A)
@pytest.mark.parametrize("u_v", [230.0, 400.0, 15000.0, 110000.0])
def test_moc_zwarciowa_z_pradu_mva_tozsamosc(u_v: float, i_a: float) -> None:
    """application/analyses/lv_domain/upstream_equivalent.py."""
    oczekiwane = (math.sqrt(3.0) * u_v * i_a) / 1_000_000.0
    assert wp.moc_zwarciowa_z_pradu_mva(u_v, i_a) == oczekiwane


@pytest.mark.parametrize("i_a", [x for x in PRADY_BRZEGOWE_A if x > 0])
@pytest.mark.parametrize("u_v", [230.0, 400.0, 15000.0, 110000.0])
def test_impedancja_z_napiecia_i_pradu_ohm_tozsamosc(u_v: float, i_a: float) -> None:
    """network_model/core/machine.py::AsynchronousMachineSource.z_abs_ohm (podwyrażenie)."""
    oczekiwane = u_v / (math.sqrt(3.0) * i_a)
    assert wp.impedancja_z_napiecia_i_pradu_ohm(u_v, i_a) == oczekiwane


# ---------------------------------------------------------------------------
# Rodzina B — narracja podstawienia κ (K4.2)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rx", RX_BRZEGOWE + [-x for x in RX_BRZEGOWE if x > 0])
def test_czlon_wykladniczy_kappa_tozsamosc(rx: float) -> None:
    """proof_generator.py — ``exp_term = math.exp(-3*rx_ratio)`` (×2, SC1+SC3F)."""
    oczekiwane = math.exp(-3 * rx)
    assert wp.czlon_wykladniczy_kappa(rx) == oczekiwane


@pytest.mark.parametrize("rx", RX_BRZEGOWE)
def test_wspolczynnik_kappa_wzor_iec60909(rx: float) -> None:
    oczekiwane = 1.02 + 0.98 * math.exp(-3 * rx)
    assert wp.wspolczynnik_kappa(rx) == oczekiwane
    # Pasmo normowe IEC 60909-0 §4.3.1.1: kappa w [1.02; 2.0].
    assert 1.02 <= wp.wspolczynnik_kappa(rx) <= 2.0


def test_wspolczynnik_kappa_graniczne_wartosci() -> None:
    # rx=0 -> kappa maksymalne (2.0); rx bardzo duże -> kappa -> 1.02.
    assert wp.wspolczynnik_kappa(0.0) == pytest.approx(2.0)
    assert wp.wspolczynnik_kappa(100.0) == pytest.approx(1.02, abs=1e-9)


# ---------------------------------------------------------------------------
# Rodzina C — całka Joule'a I²t
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("t", CZASY_BRZEGOWE_S)
@pytest.mark.parametrize("i", PRADY_BRZEGOWE_A)
def test_calka_joule_ka2s_tozsamosc(i: float, t: float) -> None:
    """equipment_proof/generator.py (×4), proof_generator.py (×3),
    enm/canonical_analysis.py::_sc_pelny_bilans, domain/sc_comparison.py."""
    oczekiwane = i**2 * t
    assert wp.calka_joule_ka2s(i, t) == oczekiwane


def test_calka_joule_ka2s_zero_pradu_daje_zero() -> None:
    assert wp.calka_joule_ka2s(0.0, 5.0) == 0.0


# ---------------------------------------------------------------------------
# Rodzina D — korekta temperaturowa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("theta", TEMPERATURY_BRZEGOWE_C)
@pytest.mark.parametrize("r20", [0.01, 0.1, 1.0, 100.0])
def test_rezystancja_w_temperaturze_tozsamosc(r20: float, theta: float) -> None:
    """application/solvers/lv_temperature_correction.py::r_theta_ohm_per_km —
    R_theta = R20*[1+0.004*(theta_k-20)]."""
    alpha = 0.004
    oczekiwane = r20 * (1.0 + alpha * (theta - 20.0))
    assert wp.rezystancja_w_temperaturze(r20, alpha, theta) == oczekiwane
    assert wp.rezystancja_w_temperaturze(r20, alpha, theta, 20.0) == oczekiwane


def test_rezystancja_w_temperaturze_przy_20c_bez_korekty() -> None:
    assert wp.rezystancja_w_temperaturze(0.387, 0.004, 20.0) == 0.387


def test_rezystancja_w_temperaturze_inny_wspolczynnik_alpha() -> None:
    # α aluminium wg IEC 60909-0 bywa inne niż miedzi — formuła jest ogólna.
    r20, alpha, theta = 0.5, 0.00393, 60.0
    oczekiwane = r20 * (1.0 + alpha * (theta - 20.0))
    assert wp.rezystancja_w_temperaturze(r20, alpha, theta) == oczekiwane


# ---------------------------------------------------------------------------
# Rodzina E — moc pozorna/bierna z cosφ
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("cos_phi", COS_PHI_BRZEGOWE)
@pytest.mark.parametrize("p", [0.0, 1e-6, 0.1, 1.0, 10.0, 1000.0, 1.0e6])
def test_moc_pozorna_z_czynnej_mva_tozsamosc(p: float, cos_phi: float) -> None:
    """enm/domain_operations_v2.py::add_converter_source (sn_mva=p_mw/cos_phi),
    der_sn_validation.py::converter_apparent_power_mva, oze_validators.py."""
    oczekiwane = p / cos_phi
    assert wp.moc_pozorna_z_czynnej_mva(p, cos_phi) == oczekiwane


@pytest.mark.parametrize("cos_phi", COS_PHI_BRZEGOWE)
def test_tan_phi_z_cos_phi_tozsamosc(cos_phi: float) -> None:
    """application/analyses/odpowiedz_osd.py — nastawa cosφ polecenia OSD."""
    oczekiwane = math.tan(math.acos(cos_phi))
    assert wp.tan_phi_z_cos_phi(cos_phi) == oczekiwane


def test_tan_phi_z_cos_phi_jednostkowy() -> None:
    assert wp.tan_phi_z_cos_phi(1.0) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("cos_phi", COS_PHI_BRZEGOWE)
@pytest.mark.parametrize("p", [0.0, 1e-6, 0.1, 1.0, 10.0, 1000.0])
def test_moc_bierna_z_czynnej_i_cos_phi_tozsamosc(p: float, cos_phi: float) -> None:
    """enm/catalog_completion.py, enm/domain_operations_v2.py::add_nn_load,
    enm/domain_operations.py (potrzeby własne stacji — ta sama formuła V1)."""
    oczekiwane = p * math.tan(math.acos(cos_phi))
    assert wp.moc_bierna_z_czynnej_i_cos_phi(p, cos_phi) == oczekiwane


# ---------------------------------------------------------------------------
# Rodzina G — impedancja/moc bazowa Z = U²/S
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("s", _moce())
@pytest.mark.parametrize("u", _napiecia())
def test_impedancja_z_napiecia_i_mocy_ohm_tozsamosc(u: float, s: float) -> None:
    """network_model/core/ybus.py::get_zbase_ohm/_get_branch_admittances_pu,
    network_model/core/branch.py::get_short_circuit_impedance_ohm_lv,
    domain/units.py::z_base_ohm, enm/mapping.py, enm/zero_sequence_transformer.py."""
    oczekiwane = (u**2) / s
    assert wp.impedancja_z_napiecia_i_mocy_ohm(u, s) == oczekiwane
    assert wp.impedancja_z_napiecia_i_mocy_ohm(u, s) == u**2 / s


# ---------------------------------------------------------------------------
# Poprawność inżynierska (wartości podręcznikowe, sanity — nie tylko tożsamość)
# ---------------------------------------------------------------------------


def test_napiecie_fazowe_v_400_daje_230() -> None:
    assert wp.napiecie_fazowe_v(400.0) == pytest.approx(230.94, abs=0.01)


def test_prad_z_mocy_pozornej_ka_przyklad_podrecznikowy() -> None:
    # S=10 MVA, U=15 kV -> I ~ 385 A = 0.385 kA.
    assert wp.prad_z_mocy_pozornej_ka(10.0, 15.0) == pytest.approx(0.3849, abs=1e-4)


def test_impedancja_z_napiecia_i_mocy_ohm_przyklad_podrecznikowy() -> None:
    # Zbase = 15^2/100 = 2.25 ohm (baza 100 MVA typowa dla Y-bus solvera).
    assert wp.impedancja_z_napiecia_i_mocy_ohm(15.0, 100.0) == 2.25
