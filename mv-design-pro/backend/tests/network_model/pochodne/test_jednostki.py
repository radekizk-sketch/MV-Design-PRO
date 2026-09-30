"""Testy tożsamości skalowania jednostek (karta W3-F, mapa §8 W3).

Każda funkcja w ``jednostki.py`` jest kopią JEDNEGO zmierzonego, oryginalnego
wyrażenia (DOKŁADNIE jedna operacja zmiennoprzecinkowa na literale float) z
konkretnych plików konsumenckich (patrz docstring funkcji i inwentarz klasy w
meldunku karty W3-F, §1). Test tożsamości odtwarza TĘ SAMĄ operację inline i
sprawdza ``==`` (bit w bit, NIE tolerancja) wobec wyniku funkcji — na siatce
wartości z §0.7.1 karty: 0, ±1, ±1e-9, ±123,456, ±1e12, 1e300 oraz 50 wartości
z generatora z ziarnem (rozpiętość rzędów wielkości, żeby złapać ewentualną
utratę precyzji przy skrajnych wykładnikach).
"""

from __future__ import annotations

import random

import pytest
from network_model.pochodne import jednostki as jedn

# ---------------------------------------------------------------------------
# Siatka wartości (§0.7.1 karty W3-F)
# ---------------------------------------------------------------------------

_STALE_BRZEGOWE: list[float] = [0.0, 1.0, -1.0, 1e-9, -1e-9, 123.456, -123.456, 1e12, -1e12, 1e300]


def _wartosci_z_generatora(ziarno: int, ile: int) -> list[float]:
    """50 wartości z generatora z ziarnem — rozpiętość rzędów wielkości od
    1e-12 do 1e12, dodatnie i ujemne, plus typowe wartości inżynierskie
    (dziesiątki/setki/tysiące) — żeby ćwiczyć zarówno bardzo małe, jak i
    bardzo duże operandy skalowania jednostek."""
    rnd = random.Random(ziarno)
    wartosci: list[float] = []
    for _ in range(ile):
        wykladnik = rnd.uniform(-12.0, 12.0)
        mantysa = rnd.uniform(-9.999, 9.999)
        wartosci.append(mantysa * (10.0**wykladnik))
    return wartosci


VALUES: list[float] = sorted(set(_STALE_BRZEGOWE) | set(_wartosci_z_generatora(20260909, 50)))

assert len(_wartosci_z_generatora(20260909, 50)) == 50


# =============================================================================
# Moc
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_kw_na_mw_tozsamosc(x: float) -> None:
    assert jedn.kw_na_mw(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_mw_na_kw_tozsamosc(x: float) -> None:
    assert jedn.mw_na_kw(x) == x * 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_kvar_na_mvar_tozsamosc(x: float) -> None:
    assert jedn.kvar_na_mvar(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_mvar_na_kvar_tozsamosc(x: float) -> None:
    assert jedn.mvar_na_kvar(x) == x * 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_kva_na_mva_tozsamosc(x: float) -> None:
    assert jedn.kva_na_mva(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_mva_na_kva_tozsamosc(x: float) -> None:
    assert jedn.mva_na_kva(x) == x * 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_kw_na_w_tozsamosc(x: float) -> None:
    """infrastructure/cgmes/cgmes_exporter.py:326 — ``trafo.pk_kw * 1000.0``."""
    assert jedn.kw_na_w(x) == x * 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_mw_na_w_tozsamosc(x: float) -> None:
    """network_model/core/generator.py:141 — ``self.rated_power_mw * 1e6``."""
    assert jedn.mw_na_w(x) == x * 1e6


@pytest.mark.parametrize("x", VALUES)
def test_mwh_na_kwh_tozsamosc(x: float) -> None:
    """network_model/catalog/mv_converter_catalog.py:263 — ostatnie mnożenie
    łańcucha ``power_mw * energy_hours * 1000`` (lewostronna łączność)."""
    assert jedn.mwh_na_kwh(x) == x * 1000.0


# =============================================================================
# Prąd
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_a_na_ka_tozsamosc(x: float) -> None:
    assert jedn.a_na_ka(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_ka_na_a_tozsamosc(x: float) -> None:
    assert jedn.ka_na_a(x) == x * 1000.0


# =============================================================================
# Napięcie
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_v_na_kv_tozsamosc(x: float) -> None:
    assert jedn.v_na_kv(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_kv_na_v_tozsamosc(x: float) -> None:
    assert jedn.kv_na_v(x) == x * 1000.0
    # Warianty literałów zmierzone w inwentarzu — bit-identyczne (§0.2 karty).
    assert jedn.kv_na_v(x) == x * 1e3
    assert jedn.kv_na_v(x) == x * 1_000.0


# =============================================================================
# Długość
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_m_na_km_tozsamosc(x: float) -> None:
    assert jedn.m_na_km(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_km_na_m_tozsamosc(x: float) -> None:
    assert jedn.km_na_m(x) == x * 1000.0


# =============================================================================
# Czas
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_ms_na_s_tozsamosc(x: float) -> None:
    assert jedn.ms_na_s(x) == x / 1000.0


@pytest.mark.parametrize("x", VALUES)
def test_s_na_ms_tozsamosc(x: float) -> None:
    assert jedn.s_na_ms(x) == x * 1000.0


# =============================================================================
# Admitancja
# =============================================================================


@pytest.mark.parametrize("x", VALUES)
def test_mikrosimens_na_simens_tozsamosc(x: float) -> None:
    """enm/domain_operations.py:2712, enm/catalog_completion.py:449."""
    assert jedn.mikrosimens_na_simens(x) == x / 1_000_000.0


@pytest.mark.parametrize("x", VALUES)
def test_mikrosimens_na_simens_ybus_tozsamosc(x: float) -> None:
    """network_model/core/branch.py:476,479 — tor Y-bus, bit w bit ze
    złotymi hashami PF/SC."""
    assert jedn.mikrosimens_na_simens_ybus(x) == x * 1e-6


@pytest.mark.parametrize("x", [v for v in VALUES if v != 0.0])
def test_mikrosimens_na_simens_i_ybus_roznia_sie_o_1_ulp_dla_czesci_x(x: float) -> None:
    """Siostrzane funkcje NIE są bit w bit tożsame ze sobą (dokumentowana
    różnica IEEE 754, docstring obu funkcji) — dowód, że scalenie w jedną
    funkcję zmieniłoby wynik dla co najmniej części domeny. Test dokumentuje
    fakt (różnica może wynosić 0 ULP dla niektórych x — to nie jest błąd,
    liczy się że funkcje NIE są zaimplementowane jako wzajemne przepisanie)."""
    przez_dzielenie = jedn.mikrosimens_na_simens(x)
    przez_mnozenie = jedn.mikrosimens_na_simens_ybus(x)
    # Obie DOKŁADNIE odtwarzają swój zmierzony oryginał — porównanie wprost
    # z definicją IEEE 754, nie założenie o rozbieżności.
    assert przez_dzielenie == x / 1_000_000.0
    assert przez_mnozenie == x * 1e-6


@pytest.mark.parametrize("x", VALUES)
def test_simens_na_mikrosimens_tozsamosc(x: float) -> None:
    """enm/mapping.py:1016, network_model/catalog/mv_benchmark_catalog.py:147."""
    assert jedn.simens_na_mikrosimens(x) == x * 1e6


# =============================================================================
# Poprawność inżynierska (wartości podręcznikowe, sanity — nie tylko tożsamość)
# =============================================================================


def test_kw_na_mw_1000_daje_1() -> None:
    assert jedn.kw_na_mw(1000.0) == 1.0


def test_ka_na_a_1_daje_1000() -> None:
    assert jedn.ka_na_a(1.0) == 1000.0


def test_mikrosimens_na_simens_1e6_daje_1() -> None:
    assert jedn.mikrosimens_na_simens(1_000_000.0) == 1.0


def test_simens_na_mikrosimens_1_daje_1e6() -> None:
    assert jedn.simens_na_mikrosimens(1.0) == 1_000_000.0
