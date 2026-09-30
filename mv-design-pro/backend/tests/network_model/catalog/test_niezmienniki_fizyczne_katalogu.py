"""Niezmienniki FIZYCZNE zywego katalogu — per rodzina, na kontrakcie NASZYCH typow.

CZEGO TEN TEST PILNUJE. Bramki rekordu (`odmowa_twarda`) dzialaja na WEJSCIU —
sprawdzaja rekord w chwili konstrukcji. Ten test sprawdza co innego: czy zbior
pozycji, ktore katalog FAKTYCZNIE serwuje, spelnia niezmienniki, ktorych zadna
bramka nie pilnuje (bo nie kazde pole ma bramke). Rozroznienie jest istotne:
bramka chroni przed zlym zapisem, ten test przed zla zawartoscia.

NAZWY POL Z KONTRAKTU, NIE Z PAMIECI. Kazde pole w asercjach jest odczytane z
`network_model/catalog/types.py` (dataclassy), a nie z nazewnictwa innego
projektu. Test `test_kazda_rodzina_ma_pozycje` jest kontrola DODATNIA: rodzina
pusta dalaby zielony przebieg bez ani jednej sprawdzonej pozycji.

REGULY WIARYGODNOSCI NIE ODRZUCAJA. Wynik przegladu jest tu ASERCJA ISTNIENIA
(wynik maszynowy z lista sprawdzonych regul i pokryciem), a nie warunkiem
zieleni — odstepstwo wiarygodnosci to sygnal dla czlowieka, nie czerwien CI.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

import pytest
from network_model.catalog.mv_benchmark_catalog import jest_rekordem_benchmarku
from network_model.catalog.niezmienniki_katalogu import (
    RODZINY_PRZEGLADU,
    przeglad_wiarygodnosci,
)
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog


@pytest.fixture(scope="module")
def katalog() -> CatalogRepository:
    return get_default_mv_catalog()


def _dodatnie(pozycja: Any, pole: str) -> None:
    wartosc = getattr(pozycja, pole)
    assert isinstance(wartosc, int | float) and not isinstance(
        wartosc, bool
    ), f"{pozycja.id}.{pole} nie jest liczba: {wartosc!r}"
    assert wartosc > 0, f"{pozycja.id}.{pole} musi byc > 0, jest {wartosc}"


def _dodatnie_gdy_podane(pozycja: Any, pole: str) -> None:
    wartosc = getattr(pozycja, pole, None)
    if wartosc is None:
        return
    assert isinstance(wartosc, int | float) and not isinstance(
        wartosc, bool
    ), f"{pozycja.id}.{pole} nie jest liczba: {wartosc!r}"
    assert wartosc > 0, f"{pozycja.id}.{pole} podane, wiec musi byc > 0, jest {wartosc}"


def _dodatnie_lub_zero_w_benchmarku(pozycja: Any, pole: str) -> None:
    """Strata/rezystancja: dodatnia dla WYROBU, dopuszczalne zero dla benchmarku.

    ZAKRES REGULY, NIE WYJATEK DLA POZYCJI (pomiar 2026-09-17: trzy rekordy —
    `bench_ieee9bus_br0.r_ohm_per_km`, `bench_iec60909example_tr110_33.pk_kw`,
    `bench_ieee14bus_sh8.loss_kw`). Rekord benchmarku literaturowego nie opisuje
    WYROBU, tylko MODEL odniesienia z publikacji: galaz bezstratna, transformator
    zadany samym uk% i bocznik bezstratny sa w tych modelach celowe, a wpisanie
    im „typowej" straty zmieniloby wynik wzorcowy i zepsulo porownanie z
    wyrocznia. Dla pozycji producenckiej zero pozostaje twardym bledem danych.
    """
    wartosc = getattr(pozycja, pole, None)
    if wartosc is None:
        return
    if jest_rekordem_benchmarku(pozycja.id):
        assert wartosc >= 0, f"{pozycja.id}.{pole} nie moze byc ujemne, jest {wartosc}"
        return
    _dodatnie(pozycja, pole)


def _nieujemne_gdy_podane(pozycja: Any, pole: str) -> None:
    wartosc = getattr(pozycja, pole, None)
    if wartosc is None:
        return
    assert wartosc >= 0, f"{pozycja.id}.{pole} nie moze byc ujemne, jest {wartosc}"


# ---------------------------------------------------------------------------
# Niezmienniki per rodzina
# ---------------------------------------------------------------------------


def _linie(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie_lub_zero_w_benchmarku(p, "r_ohm_per_km")
        _dodatnie(p, "x_ohm_per_km")
        _dodatnie(p, "rated_current_a")
        _dodatnie(p, "voltage_rating_kv")
        _dodatnie_gdy_podane(p, "cross_section_mm2")
        _dodatnie_gdy_podane(p, "ith_1s_a")
        _dodatnie_gdy_podane(p, "jth_1s_a_per_mm2")
        _dodatnie_gdy_podane(p, "r0_ohm_per_km")
        _dodatnie_gdy_podane(p, "x0_ohm_per_km")
        _nieujemne_gdy_podane(p, "b_us_per_km")


def _kable_sn(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "r_ohm_per_km")
        _dodatnie(p, "x_ohm_per_km")
        _dodatnie(p, "rated_current_a")
        _dodatnie(p, "voltage_rating_kv")
        _dodatnie(p, "cross_section_mm2")
        _dodatnie(p, "max_temperature_c")
        assert p.number_of_cores >= 1, f"{p.id}: kabel musi miec co najmniej jedna zyle"
        _nieujemne_gdy_podane(p, "c_nf_per_km")
        _dodatnie_gdy_podane(p, "ith_1s_a")
        _dodatnie_gdy_podane(p, "jth_1s_a_per_mm2")
        if p.short_circuit_temperature_c is not None:
            assert p.short_circuit_temperature_c > p.max_temperature_c, (
                f"{p.id}: temperatura zwarciowa musi przewyzszac dlugotrwala "
                f"({p.short_circuit_temperature_c} <= {p.max_temperature_c})"
            )


def _kable_nn(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "u_n_kv")
        _dodatnie(p, "r_ohm_per_km")
        _dodatnie(p, "x_ohm_per_km")
        _dodatnie(p, "i_max_a")
        _dodatnie(p, "cross_section_mm2")
        assert p.number_of_cores >= 1, f"{p.id}: kabel nN musi miec co najmniej jedna zyle"
        if p.max_temperature_c is not None and p.short_circuit_temperature_c is not None:
            assert p.short_circuit_temperature_c > p.max_temperature_c, p.id


def _transformatory(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "rated_power_mva")
        _dodatnie(p, "voltage_hv_kv")
        _dodatnie(p, "voltage_lv_kv")
        _dodatnie_lub_zero_w_benchmarku(p, "pk_kw")
        # NIEROWNOSC NIEOSTRA, i to jest ZAKRES reguly, nie ustepstwo: transformator
        # REGULACYJNY (przesuwnik fazowy, regulator wzdluzny) pracuje miedzy dwoma
        # odcinkami TEGO SAMEGO poziomu napiecia — pomiar 2026-09-17:
        # `bench_ieee39bus_br35` ma 345/345 kV. Ostra nierownosc odrzucilaby poprawny
        # rekord takiej jednostki; odwrocenie napiec (gorne < dolne) pozostaje bledem.
        assert p.voltage_hv_kv >= p.voltage_lv_kv, (
            f"{p.id}: napiecie gorne nie moze byc nizsze od dolnego "
            f"({p.voltage_hv_kv} < {p.voltage_lv_kv})"
        )
        assert 0.0 < p.uk_percent < 100.0, f"{p.id}: uk% poza (0; 100), jest {p.uk_percent}"
        _dodatnie_lub_zero_w_benchmarku(p, "p0_kw")
        _dodatnie_lub_zero_w_benchmarku(p, "i0_percent")
        assert p.tap_min <= p.tap_max, f"{p.id}: zakres zaczepow odwrocony"


#: Aparat, ktory z definicji NIE PRZEWODZI pradu roboczego — uziemnik zwiera pole
#: do ziemi przy wylaczonym zasilaniu, wiec `i_n_a = 0` jest u niego DEKLARACJA
#: „nie dotyczy", a nie brakiem danej (IEC 62271-102 nie znamionuje uziemnika
#: pradem ciaglym). Zakres reguly, nie wyjatek dla jednej pozycji.
_RODZAJE_BEZ_PRADU_ROBOCZEGO: frozenset[str] = frozenset({"UZIEMNIK"})


def _aparaty_sn(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "u_n_kv")
        if p.device_kind in _RODZAJE_BEZ_PRADU_ROBOCZEGO:
            assert (
                p.i_n_a == 0.0
            ), f"{p.id}: uziemnik nie ma pradu roboczego — oczekiwane 0, jest {p.i_n_a}"
        else:
            _dodatnie(p, "i_n_a")
        _dodatnie_gdy_podane(p, "i_th_ka")
        _dodatnie_gdy_podane(p, "i_th_duration_s")
        _dodatnie_gdy_podane(p, "i_dyn_ka")
        _dodatnie_gdy_podane(p, "break_time_s")
        _nieujemne_gdy_podane(p, "breaking_capacity_ka")
        _nieujemne_gdy_podane(p, "making_capacity_ka")
        if p.i_th_ka is not None:
            assert (
                p.i_th_duration_s is not None
            ), f"{p.id}: prad krotkotrwaly bez czasu odniesienia jest nieinterpretowalny"


def _aparaty_nn(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "u_n_kv")
        _dodatnie(p, "i_n_a")
        _dodatnie_gdy_podane(p, "i_cu_ka")
        _dodatnie_gdy_podane(p, "ics_ka")
        _dodatnie_gdy_podane(p, "icw_ka")
        _dodatnie_gdy_podane(p, "u_m_kv")
        _dodatnie_gdy_podane(p, "conditional_sc_current_ka")
        if p.poles is not None:
            assert p.poles >= 1, f"{p.id}: aparat musi miec co najmniej jeden biegun"


def _wylaczniki_mcb(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "in_a")
        _dodatnie(p, "icn_ka")
        _dodatnie(p, "u_n_kv")
        assert p.curve_class in ("B", "C", "D"), f"{p.id}: klasa {p.curve_class} spoza IEC 60898-1"


def _wkladki(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "in_a")
        _dodatnie(p, "u_n_kv")
        _dodatnie(p, "breaking_capacity_ka")
        _dodatnie_gdy_podane(p, "i2t_prearc_a2s")


def _ct(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "ratio_primary_a")
        _dodatnie(p, "ratio_secondary_a")
        assert (
            p.ratio_primary_a > p.ratio_secondary_a
        ), f"{p.id}: przekladnia pradowa musi byc obnizajaca"
        _dodatnie_gdy_podane(p, "burden_va")
        _dodatnie_gdy_podane(p, "ith_ka_1s")
        _dodatnie_gdy_podane(p, "idyn_ka_peak")
        _dodatnie_gdy_podane(p, "fs_safety_factor")
        _dodatnie_gdy_podane(p, "rct_ohm")
        if p.ith_ka_1s is not None and p.idyn_ka_peak is not None:
            assert (
                p.idyn_ka_peak > p.ith_ka_1s
            ), f"{p.id}: prad szczytowy musi przewyzszac krotkotrwaly cieplny"


def _vt(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "ratio_primary_v")
        _dodatnie(p, "ratio_secondary_v")
        assert (
            p.ratio_primary_v > p.ratio_secondary_v
        ), f"{p.id}: przekladnia napieciowa musi byc obnizajaca"
        _dodatnie_gdy_podane(p, "burden_va")
        _dodatnie_gdy_podane(p, "voltage_factor_duration_s")
        if p.rated_voltage_factor is not None:
            assert (
                p.rated_voltage_factor >= 1.0
            ), f"{p.id}: wspolczynnik napieciowy ponizej jednosci nie ma sensu"


def _ograniczniki(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "u_m_kv")
        _dodatnie(p, "mcov_kv")
        _dodatnie(p, "u_rated_kv")
        _dodatnie(p, "u_residual_at_10ka_kv")
        _dodatnie(p, "tov_10s_kv")
        _dodatnie(p, "energy_absorption_kj_per_kv")
        _dodatnie(p, "bil_protected_kv")
        assert (
            p.u_rated_kv > p.mcov_kv
        ), f"{p.id}: Ur musi przewyzszac MCOV (IEC 60099-4: MCOV to trwale dopuszczalne)"
        assert (
            p.u_residual_at_10ka_kv > p.u_rated_kv
        ), f"{p.id}: napiecie obnizone przy 10 kA musi przewyzszac Ur"
        assert (
            p.bil_protected_kv > p.u_residual_at_10ka_kv
        ), f"{p.id}: chroniony poziom BIL musi przewyzszac napiecie obnizone"
        assert p.energy_class >= 1, f"{p.id}: klasa energetyczna musi byc dodatnia"


def _kompensatory(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "rated_mvar")
        _dodatnie(p, "rated_kv")
        _dodatnie_lub_zero_w_benchmarku(p, "loss_kw")


def _zrodla_systemowe(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "voltage_rating_kv")
        _dodatnie_gdy_podane(p, "sk3_mva")
        _dodatnie_gdy_podane(p, "ik3_ka")
        _dodatnie_gdy_podane(p, "rx_ratio")
        _dodatnie_gdy_podane(p, "sk3_min_mva")
        _dodatnie_gdy_podane(p, "ik3_min_ka")
        _dodatnie_gdy_podane(p, "rx_ratio_min")
        if p.sk3_mva is not None and p.sk3_min_mva is not None:
            assert (
                p.sk3_min_mva <= p.sk3_mva
            ), f"{p.id}: moc zwarciowa minimalna nie moze przewyzszac maksymalnej"
        if p.ik3_ka is not None and p.ik3_min_ka is not None:
            assert p.ik3_min_ka <= p.ik3_ka, f"{p.id}: Ik3 min nie moze przewyzszac Ik3 max"


def _przeksztaltniki(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "un_kv")
        _dodatnie(p, "sn_mva")
        _dodatnie(p, "pmax_mw")
        assert p.pmax_mw <= p.sn_mva * 1.0001, (
            f"{p.id}: moc czynna maksymalna nie moze przewyzszac mocy pozornej "
            f"({p.pmax_mw} > {p.sn_mva})"
        )
        _dodatnie_gdy_podane(p, "k_sc")
        _dodatnie_gdy_podane(p, "e_kwh")
        if p.qmin_mvar is not None and p.qmax_mvar is not None:
            assert p.qmin_mvar <= p.qmax_mvar, f"{p.id}: przedzial mocy biernej odwrocony"
        if p.cosphi_min is not None:
            assert 0.0 < p.cosphi_min <= 1.0, f"{p.id}: cosfi min poza (0; 1]"
        if p.cosphi_max is not None:
            assert 0.0 < p.cosphi_max <= 1.0, f"{p.id}: cosfi max poza (0; 1]"


def _generatory_sn(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "rated_mva")
        _dodatnie(p, "rated_kv")
        assert p.q_min_mvar <= p.q_max_mvar, f"{p.id}: przedzial mocy biernej odwrocony"


def _baterie_bess(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "capacity_kwh")
        _dodatnie(p, "nominal_voltage_dc_v")
        _dodatnie(p, "c_rate")


def _odbiory(pozycje: Sequence[Any]) -> None:
    for p in pozycje:
        _dodatnie(p, "p_kw")
        _dodatnie(p, "v0_pu")
        _dodatnie(p, "f0_hz")
        if p.cos_phi is not None:
            assert 0.0 < p.cos_phi <= 1.0, f"{p.id}: cosfi odbioru poza (0; 1]"
        for suma, etykieta in (
            (p.a_p + p.b_p + p.c_p, "P"),
            (p.a_q + p.b_q + p.c_q, "Q"),
        ):
            assert (
                abs(suma - 1.0) < 1e-9
            ), f"{p.id}: wspolczynniki ZIP toru {etykieta} musza sumowac sie do 1, jest {suma}"


#: rodzina -> (czytnik katalogu, asercje niezmiennikow). KOMPLET rodzin, dla
#: ktorych kontrakt typu niesie wielkosci fizyczne — rodzina dopisana do
#: katalogu bez wpisu tutaj nie ma sprawdzenia, wiec wpis jest czescia dodania.
#:
#: CZYTAMY REJESTRY SUROWE, nie listy `list_*`. Listy widoczne dla projektanta
#: pomijaja rekordy benchmarkow literaturowych (`_bez_benchmarkow`, K1.2) — to
#: sluszne dla PICKEROW, ale niezmiennik fizyczny obowiazuje KAZDY rekord, ktory
#: repozytorium niesie. Na liscie `list_synchronous_generator_types()` widac to
#: wprost: rodzina generatorow SN ma dzis WYLACZNIE rekordy benchmarkow, wiec
#: lista projektanta jest pusta, a rejestr — nie.
RODZINY_FIZYCZNE: dict[
    str, tuple[Callable[[Any], Sequence[Any]], Callable[[Sequence[Any]], None]]
] = {
    "linie SN": (lambda k: list(k.line_types.values()), _linie),
    "kable SN": (lambda k: list(k.cable_types.values()), _kable_sn),
    "kable nN": (lambda k: list(k.lv_cable_types.values()), _kable_nn),
    "transformatory": (lambda k: list(k.transformer_types.values()), _transformatory),
    "aparaty SN": (lambda k: list(k.mv_apparatus_types.values()), _aparaty_sn),
    "aparaty nN": (lambda k: list(k.lv_apparatus_types.values()), _aparaty_nn),
    "wylaczniki MCB nN": (lambda k: list(k.lv_breaker_mcb_types.values()), _wylaczniki_mcb),
    "wkladki topikowe nN": (lambda k: list(k.lv_fuse_link_types.values()), _wkladki),
    "przekladniki pradowe": (lambda k: list(k.ct_types.values()), _ct),
    "przekladniki napieciowe": (lambda k: list(k.vt_types.values()), _vt),
    "ograniczniki przepiec": (lambda k: list(k.surge_arrester_types.values()), _ograniczniki),
    "kompensatory": (lambda k: list(k.shunt_capacitor_types.values()), _kompensatory),
    "zrodla systemowe": (lambda k: list(k.source_system_types.values()), _zrodla_systemowe),
    "przeksztaltniki": (lambda k: list(k.converter_types.values()), _przeksztaltniki),
    "generatory SN": (lambda k: list(k.synchronous_generator_types.values()), _generatory_sn),
    "baterie BESS": (lambda k: list(k.bess_battery_types.values()), _baterie_bess),
    "odbiory": (lambda k: list(k.load_types.values()), _odbiory),
}


@pytest.mark.parametrize("rodzina", sorted(RODZINY_FIZYCZNE))
def test_niezmienniki_fizyczne_rodziny(katalog: CatalogRepository, rodzina: str) -> None:
    czytnik, asercje = RODZINY_FIZYCZNE[rodzina]
    asercje(czytnik(katalog))


@pytest.mark.parametrize("rodzina", sorted(RODZINY_FIZYCZNE))
def test_kazda_rodzina_ma_pozycje(katalog: CatalogRepository, rodzina: str) -> None:
    """Kontrola DODATNIA: rodzina pusta dalaby zielen bez ani jednej sprawdzonej pozycji."""
    czytnik, _ = RODZINY_FIZYCZNE[rodzina]
    assert len(czytnik(katalog)) > 0, rodzina


def test_identyfikatory_pozycji_sa_unikalne_w_calym_katalogu(katalog: CatalogRepository) -> None:
    """Dwie rozne pozycje o tym samym id = wiazanie katalogowe wskazujace na obie."""
    for rodzina, (czytnik, _) in sorted(RODZINY_FIZYCZNE.items()):
        pozycje = czytnik(katalog)
        identyfikatory = [str(p.id) for p in pozycje]
        duplikaty = {i for i in identyfikatory if identyfikatory.count(i) > 1}
        assert not duplikaty, f"{rodzina}: duplikaty identyfikatorow {sorted(duplikaty)}"


def test_przeglad_wiarygodnosci_zywego_katalogu_daje_wynik_maszynowy(
    katalog: CatalogRepository,
) -> None:
    """Regula wiarygodnosci RAPORTUJE — asercja dotyczy ISTNIENIA wyniku, nie zieleni."""
    rodziny = {
        "aparaty-nn": katalog.list_lv_apparatus_types(),
        "aparaty-sn": katalog.list_mv_apparatus_types(),
        "transformatory": katalog.list_transformer_types(),
        "linie-sn": katalog.list_line_types(),
        "kable-sn": katalog.list_cable_types(),
        "kable-nn": katalog.list_lv_cable_types(),
        "zrodla-systemowe": katalog.list_source_system_types(),
    }
    wyniki = przeglad_wiarygodnosci(rodziny)
    assert {w.rodzina for w in wyniki} == set(RODZINY_PRZEGLADU)
    for wynik in wyniki:
        assert wynik.sprawdzone_reguly, wynik.rodzina
        assert wynik.liczba_pozycji > 0, wynik.rodzina
        assert wynik.to_dict()["pokrycie"], wynik.rodzina
        for odstepstwo in wynik.odstepstwa:
            # Odstepstwo NIE czerwieni testu — ale musi byc opisane tak, zeby
            # czlowiek wiedzial, co obejrzec w karcie producenta.
            assert odstepstwo.pozycja_id and odstepstwo.opis_wartosci
