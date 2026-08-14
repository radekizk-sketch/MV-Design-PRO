"""Testy mostu katalog aparatury -> U_m/I_cu (KARTA UM-ICU-KATALOG).

Iloczyn cech wg karty: {wylacznik SN, rozlacznik SN, odlacznik SN, uziemnik
SN, reklozer SN, bezpiecznik SN, wylacznik nN, rozlacznik bezpiecznikowy nN}
x {pelne dane, brak danych} — testy pokrywaja WSZYSTKIE rodzaje aparatury w
katalogu, nie tylko przyklad z karty (regula KLASA-NIE-INSTANCJA).
"""

from __future__ import annotations

from application.equipment_proof.catalog_bridge import (
    RODZAJE_SN_BEZ_ZDOLNOSCI_WYLACZANIA,
    resolve_um_icu_from_catalog,
)
from network_model.catalog.mv_auxiliary_catalog import get_all_lv_apparatus_types
from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types
from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import LVApparatusType, SwitchEquipmentType


def _mini_repo(
    switch_equipment_types: dict[str, SwitchEquipmentType] | None = None,
    lv_apparatus_types: dict[str, LVApparatusType] | None = None,
) -> CatalogRepository:
    return CatalogRepository(
        line_types={},
        cable_types={},
        transformer_types={},
        switch_equipment_types=switch_equipment_types or {},
        converter_types={},
        inverter_types={},
        lv_apparatus_types=lv_apparatus_types or {},
    )


# ---------------------------------------------------------------------------
# Pelne dane — po jednym przedstawicielu kazdego rodzaju aparatury SN.
# ---------------------------------------------------------------------------


def test_wylacznik_sn_z_pelnymi_danymi_zwraca_um_i_icu() -> None:
    wynik = resolve_um_icu_from_catalog("sw-cb-abb-vd4-12kv-630a")
    assert wynik.found_in_catalog is True
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka == 20.0
    assert wynik.i_cu_not_applicable is False


def test_rozlacznik_sn_ma_um_liczone_a_icu_nie_dotyczy() -> None:
    """Karta 2a: rozlacznik (LOAD_SWITCH) MA U_m, ale I_cu jest NIE_DOTYCZY."""
    wynik = resolve_um_icu_from_catalog("sw-ls-abb-nal-12kv-400a")
    assert wynik.found_in_catalog is True
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka is None
    assert wynik.i_cu_not_applicable is True


def test_odlacznik_sn_ma_um_liczone_a_icu_nie_dotyczy() -> None:
    wynik = resolve_um_icu_from_catalog("sw-ds-abb-ojs-12kv-630a")
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka is None
    assert wynik.i_cu_not_applicable is True


def test_uziemnik_sn_ma_um_liczone_a_icu_nie_dotyczy() -> None:
    wynik = resolve_um_icu_from_catalog("sw-es-generic-12kv")
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka is None
    assert wynik.i_cu_not_applicable is True


def test_reklozer_sn_ma_icu_wypelnione_mimo_automatycznego_dzialania() -> None:
    """Reklozer NIE trafia na liste bez zdolnosci wylaczania — integruje wylacznik."""
    wynik = resolve_um_icu_from_catalog("sw-rec-abb-rec615-17kv-630a")
    assert wynik.u_m_kv == 17.5
    assert wynik.i_cu_ka == 12.5
    assert wynik.i_cu_not_applicable is False


def test_bezpiecznik_sn_ma_icu_wypelnione() -> None:
    # 63 kA ze stopki tabeli 6/12 kV katalogu ETI Polam (karta
    # K-E-FUSE-TCC-KATALOG). Intencja testu: bezpiecznik MA wypełnione I_cu
    # i nie trafia na listę „nie dotyczy" — nie sama wartość liczbowa.
    wynik = resolve_um_icu_from_catalog("sw-fuse-eti-vv-12kv-16a")
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka == 63.0
    assert wynik.i_cu_not_applicable is False


def test_wylacznik_nn_glowny_z_pelnymi_danymi() -> None:
    wynik = resolve_um_icu_from_catalog("cb_nn_630a")
    assert wynik.u_m_kv == 0.69
    assert wynik.i_cu_ka == 50.0
    assert wynik.i_cu_not_applicable is False


def test_wylacznik_nn_odplywowy_z_pelnymi_danymi() -> None:
    wynik = resolve_um_icu_from_catalog("cb_nn_100a")
    assert wynik.u_m_kv == 0.69
    assert wynik.i_cu_ka == 25.0
    assert wynik.i_cu_not_applicable is False


def test_rozlacznik_bezpiecznikowy_nn_ma_icu_wypelnione_nie_nie_dotyczy() -> None:
    """Karta 2c: w odroznieniu od rozlacznika SN, rozlacznik bezpiecznikowy nN
    MA zdolnosc wylaczania (dzieki wkladce NH) — I_cu jest wypelnione, nie
    NIE_DOTYCZY. To rozroznienie klasy pomiedzy katalogiem SN i nN dla tej
    samej nazwy "rozlacznik" jest kluczowym testem KLASA-NIE-INSTANCJA.
    """
    wynik = resolve_um_icu_from_catalog("rb_nn_100a")
    assert wynik.u_m_kv == 0.69
    assert wynik.i_cu_ka == 50.0
    assert wynik.i_cu_not_applicable is False


# ---------------------------------------------------------------------------
# Brak danych.
# ---------------------------------------------------------------------------


def test_skorygowany_3ah5_ma_pelne_dane_z_realnego_wariantu() -> None:
    """Dawne widmo „3AH5 12 kV 630 A" (prad nieistniejacy w linii HG 11.05)
    skorygowano dyrektywa wlasciciela 2026-08-13 na realny wariant 800 A
    z zachowana zdolnoscia 25 kA (tabela doboru str. 13) — dlug None zamkniety.
    Intencja pierwotnego testu (zero fabrykacji przy braku danych) zyje dalej
    w test_wpis_nieznany_w_zadnym_katalogu_daje_uczciwy_brak_podstawy.
    """
    wynik = resolve_um_icu_from_catalog("sw-cb-siemens-3ah5-12kv-800a")
    assert wynik.found_in_catalog is True
    assert wynik.u_m_kv == 12.0
    assert wynik.i_cu_ka == 25.0
    assert wynik.i_cu_not_applicable is False


def test_wpis_nieznany_w_zadnym_katalogu_daje_uczciwy_brak_podstawy() -> None:
    wynik = resolve_um_icu_from_catalog("nie-istnieje-w-zadnym-katalogu")
    assert wynik.found_in_catalog is False
    assert wynik.u_m_kv is None
    assert wynik.i_cu_ka is None
    assert wynik.i_cu_not_applicable is False


def test_brak_type_ref_zwraca_pusty_wynik_bez_przeszukiwania() -> None:
    assert resolve_um_icu_from_catalog(None).found_in_catalog is False
    assert resolve_um_icu_from_catalog("").found_in_catalog is False


# ---------------------------------------------------------------------------
# Predykaty parami (regula KLASA-NIE-INSTANCJA §4.3): decyzja "nie dotyczy"
# i wyzerowanie i_cu_ka pochodza z JEDNEGO zrodla prawdy (equipment_kind), nie
# z dwoch niezaleznych pol, ktore moglyby sie rozjechac. Test buduje rekord z
# CELOWO SPRZECZNA danych katalogu (LOAD_SWITCH z wypelnionym i_cu_ka — stan,
# ktorego katalog produkcyjny nie powinien nigdy miec, ale most MUSI byc
# odporny, gdyby sie pojawil) i sprawdza, ze most i tak wymusza NIE_DOTYCZY.
# ---------------------------------------------------------------------------


def test_bridge_wymusza_nie_dotyczy_nawet_gdy_katalog_ma_sprzeczne_dane() -> None:
    uszkodzony_typ = SwitchEquipmentType(
        id="sw-test-corrupted",
        name="Testowy rozlacznik z blednym I_cu",
        equipment_kind="LOAD_SWITCH",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=0.0,
        icw_ka=20.0,
        u_m_kv=12.0,
        i_cu_ka=99.0,  # DANE SPRZECZNE: rozlacznik nie powinien miec i_cu_ka.
    )
    repo = _mini_repo(switch_equipment_types={"sw-test-corrupted": uszkodzony_typ})

    wynik = resolve_um_icu_from_catalog("sw-test-corrupted", repo=repo)

    assert wynik.i_cu_not_applicable is True
    assert wynik.i_cu_ka is None
    assert wynik.u_m_kv == 12.0


# ---------------------------------------------------------------------------
# Inwentarz klasy: KAZDY wpis SN/nN, nie tylko przyklady wybrane wyzej.
# ---------------------------------------------------------------------------


def test_kazdy_wpis_sn_bez_zdolnosci_wylaczania_ma_i_cu_ka_none_w_katalogu() -> None:
    """Iloczyn cech na CALYM katalogu: LOAD_SWITCH/DISCONNECTOR/EARTH_SWITCH
    -> i_cu_ka MUSI byc None. Wykrywa iniekcje "nadaj rozlacznikowi i_cu_ka
    z liczba" w SAMYM zrodle danych (nie tylko w moscie).
    """
    zbadane_rodzaje: set[str] = set()
    for record in get_all_switch_equipment_types():
        params = record["params"]
        kind = str(params["equipment_kind"])
        zbadane_rodzaje.add(kind)
        if kind in RODZAJE_SN_BEZ_ZDOLNOSCI_WYLACZANIA:
            assert params.get("i_cu_ka") is None, (
                f"{record['id']} ({kind}): i_cu_ka powinno byc None (NIE_DOTYCZY),"
                f" jest {params.get('i_cu_ka')!r}"
            )
        else:
            assert kind in {"CIRCUIT_BREAKER", "RECLOSER", "FUSE"}
    # Miara pokrycia: wszystkie 6 rodzajow aparatury SN musialy wystapic w
    # probce, inaczej test niczego by nie sprawdzal dla brakujacego rodzaju.
    assert zbadane_rodzaje == {
        "CIRCUIT_BREAKER",
        "LOAD_SWITCH",
        "DISCONNECTOR",
        "RECLOSER",
        "FUSE",
        "EARTH_SWITCH",
    }


def test_kazdy_wpis_sn_ma_u_m_kv_ustawione() -> None:
    """Zapadka WZMOCNIONA po korekcie widm 3AH5 (2026-08-13): zbior znanego
    dlugu jest PUSTY — u_m_kv=None gdziekolwiek w katalogu SN to czerwien.
    Nowy wpis bez potwierdzenia w karcie producenta musi swiadomie wrocic
    do wzorca znanego dlugu, nie przejsc cicho.
    """
    for record in get_all_switch_equipment_types():
        params = record["params"]
        assert (
            params.get("u_m_kv") is not None
        ), f"{record['id']}: u_m_kv=None — niezamierzona dziura w katalogu"


def test_kazdy_wpis_nn_ma_pelne_u_m_kv_i_i_cu_ka() -> None:
    """Katalog nN (14 pozycji) nie ma zadnego znanego dlugu — wszystkie
    rodzaje aparatury (WYLACZNIK_GLOWNY/ODPLYWOWY/ROZLACZNIK_BEZPIECZNIKOWY)
    maja zdolnosc wylaczania i pelne dane po weryfikacji kart producentow.
    """
    zbadane_rodzaje: set[str] = set()
    for record in get_all_lv_apparatus_types():
        params = record["params"]
        zbadane_rodzaje.add(str(params["device_kind"]))
        assert params.get("u_m_kv") == 0.69, record["id"]
        assert params.get("i_cu_ka") is not None, record["id"]
    assert zbadane_rodzaje == {
        "WYLACZNIK_GLOWNY",
        "WYLACZNIK_ODPLYWOWY",
        "ROZLACZNIK_BEZPIECZNIKOWY",
    }


def test_lv_apparatus_type_roundtrip_zachowuje_um_icu() -> None:
    """Kontrakt odczytu (types.py): to_dict -> from_dict jest identycznosciowy."""
    typ = LVApparatusType(
        id="x",
        name="x",
        device_kind="WYLACZNIK_GLOWNY",
        u_n_kv=0.4,
        i_n_a=100.0,
        breaking_capacity_ka=25.0,
        u_m_kv=0.69,
        i_cu_ka=25.0,
    )
    odtworzony = LVApparatusType.from_dict(typ.to_dict())
    assert odtworzony.u_m_kv == 0.69
    assert odtworzony.i_cu_ka == 25.0


def test_switch_equipment_type_roundtrip_zachowuje_um_icu() -> None:
    typ = SwitchEquipmentType(
        id="x",
        name="x",
        equipment_kind="CIRCUIT_BREAKER",
        un_kv=12.0,
        in_a=630.0,
        ik_ka=20.0,
        icw_ka=20.0,
        u_m_kv=12.0,
        i_cu_ka=20.0,
    )
    odtworzony = SwitchEquipmentType.from_dict(typ.to_dict())
    assert odtworzony.u_m_kv == 12.0
    assert odtworzony.i_cu_ka == 20.0
