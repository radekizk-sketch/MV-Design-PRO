"""Niezmienniki FIZYCZNE i NORMOWE katalogu (§25) — jedna reguła, cała rodzina.

CO TE TESTY SĄ, A CZYM NIE SĄ. Sprawdzają SPÓJNOŚĆ WEWNĘTRZNĄ rekordu: czy
wartości, które katalog niesie, nie przeczą sobie nawzajem ani fizyce
(``Ics ≤ Icu``, ``U_HV > U_LV``, ``θk > θb``, ``Q_max ≤ S_n``). NIE dowodzą, że
liczby zgadzają się z kartą producenta — do tego trzeba dokumentu, a nie testu.
Kanon mówi to wprost: spójność wewnętrzna NIE JEST niezależnym oracle.

Pomiar przy wprowadzeniu (2026-09-11): WSZYSTKIE reguły spełnione na żywym
katalogu — 0 naruszeń. Test nie naprawia więc niczego; pilnuje, żeby następny
import albo ręczna poprawka nie wprowadziły rekordu, który przeczy sam sobie.
Bez niego taki rekord byłby niewidoczny do chwili, w której ktoś zobaczyłby
dziwny wynik zwarciowy i musiał go tropić wstecz.

DLACZEGO REGUŁY SĄ DZIELONE PER RODZINA, A NIE UNIWERSALNE. Kanon zakazuje
dokładania reguł „uniwersalnych" tam, gdzie norma dopuszcza wyjątki. Dlatego
np. ``I_n > 0`` NIE obejmuje uziemnika (nie ma prądu ciągłego z definicji), a
``Icu`` sprawdzamy WYŁĄCZNIE tam, gdzie rodzaj aparatu ma zdolność wyłączania
zwarć — rozłącznik i odłącznik jej nie mają i brak wartości nie jest tam luką.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

import pytest
from network_model.catalog.repository import get_default_mv_catalog

#: Zapas na zaokrąglenia przy porównaniach „nie większe niż" — dane katalogowe
#: bywają podane z inną precyzją niż wielkość, z którą je zestawiamy.
LUZ = 1.0001


def _naruszenia(pozycje: Iterable[Any], warunek: Callable[[Any], bool]) -> list[str]:
    return [p.id for p in pozycje if not warunek(p)]


def _sprawdz(pozycje: Iterable[Any], warunek: Callable[[Any], bool], regula: str) -> None:
    pozycje = list(pozycje)
    zle = _naruszenia(pozycje, warunek)
    assert not zle, f"Naruszenie '{regula}' w {len(zle)} pozycjach: {zle[:8]}"


# ---------------------------------------------------------------------------
# Aparatura nN — IEC 60947-2
# ---------------------------------------------------------------------------


def test_aparatura_nn_spelnia_relacje_zdolnosci_zwarciowych() -> None:
    """``Ics ≤ Icu`` i ``Icw ≤ Icu`` — inaczej rekord opisuje aparat niemożliwy.

    ``Ics`` (zdolność eksploatacyjna) i ``Icw`` (wytrzymałość krótkotrwała) są z
    definicji normy ograniczone przez ``Icu``. Rekord, który to łamie, przeszedłby
    dobór i dałby zawyżoną ocenę wytrzymałości rozdzielnicy.
    """
    lv = get_default_mv_catalog().list_lv_apparatus_types()
    _sprawdz(
        [a for a in lv if a.ics_ka is not None and a.i_cu_ka is not None],
        lambda a: a.ics_ka <= a.i_cu_ka * LUZ,
        "Ics <= Icu",
    )
    _sprawdz(
        [a for a in lv if a.icw_ka is not None and a.i_cu_ka is not None],
        lambda a: a.icw_ka <= a.i_cu_ka * LUZ,
        "Icw <= Icu",
    )


def test_aparatura_nn_ma_dodatni_prad_i_spojna_klase_napieciowa() -> None:
    """``I_n > 0`` oraz ``U_e ≥ U_n`` — napięcie łączeniowe nie schodzi poniżej sieci."""
    lv = get_default_mv_catalog().list_lv_apparatus_types()
    _sprawdz(lv, lambda a: (a.i_n_a or 0) > 0, "I_n > 0")
    _sprawdz(
        [a for a in lv if a.u_m_kv is not None],
        lambda a: a.u_m_kv >= a.u_n_kv,
        "U_e >= U_n",
    )


@pytest.mark.parametrize("pole", ["ir_range", "isd_range", "ii_range", "tr_range", "tsd_range"])
def test_zakresy_nastaw_maja_poprawna_kolejnosc(pole: str) -> None:
    """Dolny kraniec zakresu regulacji nie może przekraczać górnego.

    Odwrócony zakres nie wywala się przy wczytaniu — dopiero resolver nastaw
    zwróciłby wartość spoza możliwości aparatu.
    """
    lv = get_default_mv_catalog().list_lv_apparatus_types()
    _sprawdz(
        [a for a in lv if getattr(a, pole, None)],
        lambda a: getattr(a, pole)[0] <= getattr(a, pole)[1],
        f"{pole}: min <= max",
    )


def test_prad_nastawy_czlonu_zwloczneho_nie_przekracza_pradu_ramy() -> None:
    """``Ir_max ≤ 1,0 × In`` — człon zwłoczny nie nastawia się ponad prąd ramy."""
    lv = get_default_mv_catalog().list_lv_apparatus_types()
    _sprawdz(
        [a for a in lv if a.ir_range],
        lambda a: a.ir_range[1] <= 1.0,
        "Ir_max <= 1.0 x In (IEC 60947-2)",
    )


# ---------------------------------------------------------------------------
# Aparatura SN — IEC 62271
# ---------------------------------------------------------------------------


def test_aparatura_sn_ma_dodatnie_napiecie_i_prad() -> None:
    """``U_n > 0`` zawsze; ``I_n > 0`` poza uziemnikiem.

    GRANICA REGUŁY, NIE CICHY WYJĄTEK: uziemnik z definicji normy nie prowadzi
    prądu ciągłego, więc ``I_n = 0`` jest tam stanem poprawnym, a nie brakiem.
    """
    mv = get_default_mv_catalog().list_mv_apparatus_types()
    _sprawdz(mv, lambda a: (a.u_n_kv or 0) > 0, "U_n > 0")
    _sprawdz(
        [a for a in mv if a.device_kind != "UZIEMNIK"],
        lambda a: (a.i_n_a or 0) > 0,
        "I_n > 0 (poza uziemnikiem)",
    )


def test_wytrzymalosc_krotkotrwala_sn_nie_przekracza_zdolnosci_wylaczalnej() -> None:
    """``Icw ≤ Icu`` dla aparatów, które zdolność wyłączalną w ogóle mają."""
    mv = get_default_mv_catalog().list_mv_apparatus_types()
    _sprawdz(
        [a for a in mv if a.i_th_ka is not None and a.breaking_capacity_ka],
        lambda a: a.i_th_ka <= a.breaking_capacity_ka * LUZ,
        "Icw <= Icu",
    )


# ---------------------------------------------------------------------------
# Transformatory
# ---------------------------------------------------------------------------


def test_transformatory_maja_spojna_tabliczke() -> None:
    """Napięcie zwarcia, moc, strony i zaczep — relacje, które MUSZĄ zachodzić.

    ``uk% < 30`` jest kontrolą zdrowego rozsądku, nie normą: wyższa wartość
    oznacza błąd jednostki (np. wartość w promilach albo w omach).
    """
    tr = get_default_mv_catalog().list_transformer_types()
    _sprawdz(tr, lambda t: t.uk_percent > 0, "uk% > 0")
    _sprawdz(tr, lambda t: t.uk_percent < 30, "uk% < 30 (kontrola jednostki)")
    _sprawdz(tr, lambda t: t.rated_power_mva > 0, "Sn > 0")
    _sprawdz(tr, lambda t: t.voltage_hv_kv > t.voltage_lv_kv, "U_HV > U_LV")
    _sprawdz(tr, lambda t: t.tap_min <= t.tap_max, "tap_min <= tap_max")


def test_straty_transformatora_zachowuja_relacje_fizyczna() -> None:
    """``P0 < Pk`` — straty jałowe są rzędy wielkości niższe od obciążeniowych.

    Odwrócenie tej pary zwykle oznacza zamienione kolumny przy imporcie i daje
    zawyżone straty sieci w każdym rozpływie.
    """
    tr = get_default_mv_catalog().list_transformer_types()
    _sprawdz([t for t in tr if t.pk_kw], lambda t: t.pk_kw > 0, "Pk > 0")
    _sprawdz([t for t in tr if t.p0_kw and t.pk_kw], lambda t: t.p0_kw < t.pk_kw, "P0 < Pk")
    _sprawdz(
        [t for t in tr if t.i0_percent],
        lambda t: 0 < t.i0_percent < 10,
        "0 < i0% < 10 (kontrola jednostki)",
    )


# ---------------------------------------------------------------------------
# Przekładniki
# ---------------------------------------------------------------------------


def test_przekladniki_pradowe_maja_sensowna_przekladnie_i_wytrzymalosc() -> None:
    """``I1 > I2 > 0`` oraz ``Idyn > Ith`` — prąd szczytowy przewyższa cieplny."""
    ct = get_default_mv_catalog().list_ct_types()
    _sprawdz(ct, lambda t: t.ratio_primary_a > 0 and t.ratio_secondary_a > 0, "przekładnia > 0")
    _sprawdz(ct, lambda t: t.ratio_primary_a > t.ratio_secondary_a, "I1 > I2")
    _sprawdz(
        [t for t in ct if t.ith_ka_1s and t.idyn_ka_peak],
        lambda t: t.idyn_ka_peak > t.ith_ka_1s,
        "Idyn > Ith",
    )
    _sprawdz([t for t in ct if t.burden_va], lambda t: t.burden_va > 0, "moc obciążenia > 0")


def test_przekladniki_napieciowe_maja_sensowna_przekladnie() -> None:
    """``U1 > U2 > 0`` i współczynnik napięciowy ``F_v ≥ 1,0``."""
    vt = get_default_mv_catalog().list_vt_types()
    _sprawdz(vt, lambda t: t.ratio_primary_v > t.ratio_secondary_v > 0, "U1 > U2 > 0")
    _sprawdz(
        [t for t in vt if t.rated_voltage_factor],
        lambda t: t.rated_voltage_factor >= 1.0,
        "F_v >= 1.0",
    )


# ---------------------------------------------------------------------------
# Przewody
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("akcesor", ["list_cable_types", "list_line_types", "list_lv_cable_types"])
def test_przewody_maja_dodatnie_parametry_i_spojne_temperatury(akcesor: str) -> None:
    """``R > 0``, ``X > 0``, ``S > 0``, ``R0 ≥ R1``, ``θk > θb``.

    ``R0 ≥ R1`` wynika z drogi powrotu prądu zerowego (ziemia/żyła powrotna ma
    wyższą rezystancję niż żyła fazowa) — odwrócenie oznacza zamienione kolumny.
    ``θk > θb`` jest przesłanką rachunku adiabatycznego: bez zapasu cieplnego
    wzór IEC 60949 nie ma sensu fizycznego.
    """
    przewody = list(getattr(get_default_mv_catalog(), akcesor)())
    _sprawdz(przewody, lambda t: (t.r_ohm_per_km or 0) > 0, "R > 0")
    _sprawdz(przewody, lambda t: (t.x_ohm_per_km or 0) > 0, "X > 0")
    _sprawdz(przewody, lambda t: (t.cross_section_mm2 or 0) > 0, "S > 0")
    _sprawdz(
        [t for t in przewody if t.r0_ohm_per_km],
        lambda t: t.r0_ohm_per_km >= t.r_ohm_per_km,
        "R0 >= R1",
    )
    _sprawdz(
        [
            t
            for t in przewody
            if getattr(t, "short_circuit_temperature_c", None)
            and getattr(t, "max_temperature_c", None)
        ],
        lambda t: t.short_circuit_temperature_c > t.max_temperature_c,
        "theta_k > theta_b",
    )


# ---------------------------------------------------------------------------
# Źródła, zabezpieczenia nN, ograniczniki, kompensatory, przekształtniki
# ---------------------------------------------------------------------------


def test_zrodla_systemowe_maja_sensowna_moc_zwarciowa() -> None:
    """``Sk3 > 0`` i ``0 < R/X < 1`` — sieć SN jest zdecydowanie indukcyjna."""
    src = get_default_mv_catalog().list_source_system_types()
    _sprawdz(src, lambda s: s.sk3_mva > 0, "Sk3 > 0")
    _sprawdz(src, lambda s: 0 < s.rx_ratio < 1, "0 < R/X < 1")
    _sprawdz([s for s in src if s.ik3_ka], lambda s: s.ik3_ka > 0, "Ik3 > 0")


def test_zabezpieczenia_nn_maja_dodatnie_prady_i_zdolnosci() -> None:
    """MCB i wkładki: prąd znamionowy i zdolność wyłączalna muszą być dodatnie."""
    katalog = get_default_mv_catalog()
    _sprawdz(katalog.list_lv_breaker_mcb_types(), lambda t: t.in_a > 0, "In > 0")
    _sprawdz(katalog.list_lv_breaker_mcb_types(), lambda t: t.icn_ka > 0, "Icn > 0")
    _sprawdz(katalog.list_lv_fuse_link_types(), lambda t: t.in_a > 0, "In > 0")
    _sprawdz(
        [t for t in katalog.list_lv_fuse_link_types() if t.breaking_capacity_ka],
        lambda t: t.breaking_capacity_ka > 0,
        "Ic > 0",
    )


def test_ograniczniki_zachowuja_hierarchie_napiec() -> None:
    """``U_res > U_r > U_c`` — napięcia ogranicznika układają się w tej kolejności.

    Odwrócenie którejkolwiek pary daje ochronę pozorną: dobór przepuściłby
    ogranicznik, który albo przewodzi w pracy normalnej, albo nie ogranicza.
    """
    oga = get_default_mv_catalog().list_surge_arrester_types()
    _sprawdz(oga, lambda t: t.mcov_kv > 0 and t.u_rated_kv > 0, "Uc > 0, Ur > 0")
    _sprawdz(oga, lambda t: t.u_rated_kv > t.mcov_kv, "Ur > Uc")
    _sprawdz(
        [t for t in oga if t.u_residual_at_10ka_kv],
        lambda t: t.u_residual_at_10ka_kv > t.u_rated_kv,
        "Ures > Ur",
    )


def test_kompensatory_maja_dodatnia_moc_i_napiecie() -> None:
    kom = get_default_mv_catalog().list_shunt_capacitor_types()
    _sprawdz(kom, lambda t: t.rated_mvar > 0, "Q > 0")
    _sprawdz(kom, lambda t: t.rated_kv > 0, "U > 0")


def test_przeksztaltniki_nie_deklaruja_mocy_ponad_moc_pozorna() -> None:
    """``P_max ≤ S_n``, ``Q_max ≤ S_n``, ``Q_min ≤ Q_max`` — trójkąt mocy się domyka.

    Deklaracja ``P_max > S_n`` albo ``Q_max > S_n`` opisuje jednostkę, która nie
    istnieje, a rozpływ przyjąłby ją bez mrugnięcia i rozdzielił moc, której nie
    ma skąd wziąć.
    """
    conv = get_default_mv_catalog().list_converter_types()
    _sprawdz(conv, lambda t: (t.sn_mva or 0) > 0, "Sn > 0")
    _sprawdz(conv, lambda t: (t.un_kv or 0) > 0, "Un > 0")
    _sprawdz(
        [t for t in conv if t.pmax_mw and t.sn_mva],
        lambda t: t.pmax_mw <= t.sn_mva * LUZ,
        "Pmax <= Sn",
    )
    _sprawdz(
        [t for t in conv if t.qmin_mvar is not None and t.qmax_mvar is not None],
        lambda t: t.qmin_mvar <= t.qmax_mvar,
        "Qmin <= Qmax",
    )
    _sprawdz(
        [t for t in conv if t.qmax_mvar and t.sn_mva],
        lambda t: t.qmax_mvar <= t.sn_mva * LUZ,
        "Qmax <= Sn",
    )
