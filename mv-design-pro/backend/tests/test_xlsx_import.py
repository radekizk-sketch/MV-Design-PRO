"""Import sieci z arkusza XLSX — testy REALNEJ ścieżki (bajty pliku → kompilator → ENM).

W1 (mapa domknięcia §9, 2026-09-09): import przestał zapisywać do tabel `network_*`
i migawek rdzenia, których żaden tor użytkownika nie czytał (projekt „z importu”
otwierał się PUSTY). Arkusz przechodzi przez kompilator grafu (`enm/kompilator_grafu.py`)
do modelu ENM projektu — tego samego, który czytają kreatory, SLD, gotowość i biegi.

Iloczyn cech wiązania typów: {typ katalogowy, pełna tabliczka, brak obu, oba naraz z
rozjazdem} × {LINIA, KABEL, transformator} × {kolumna obecna/pusta}. Iloczyn cech zapisu:
{arkusz poprawny, z błędami wierszy, z wyspą bez zasilania} × {baza pusta, z projektem}.
Zgodnie z CLAUDE.md §5 testy budują prawdziwy skoroszyt i przechodzą drogą użytkownika.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from application.xlsx_import import XlsxImportService, XlsxNetworkImporter
from application.xlsx_import.service import (
    ARKUSZ_MODELU,
    NAZWA_PIERWSZEGO_PRZYPADKU,
    STATUS_ODRZUCONO,
    STATUS_ZAIMPORTOWANO,
    ZRODLO_IMPORTU,
)
from enm.dziennik_zmian import wszystkie_wpisy
from enm.klucz_twin import klucz_twin_projektu
from enm.kompilator_grafu import kontynuuj_z_szyny
from enm.severity import SEVERITY_BLOCKER
from enm.store import get_enm, has_enm
from enm.validator import ENMValidator
from network_model.catalog.repository import get_default_mv_catalog

from tests.utils.arkusz_xlsx import (
    NAGLOWEK_LINII_KATALOG,
    NAGLOWEK_LINII_TABLICZKA,
    NAGLOWEK_SZYN,
    NAGLOWEK_TRAFO_KATALOG,
    NAGLOWEK_TRAFO_TABLICZKA,
    NAGLOWEK_ZRODEL,
    TABLICZKA_KABEL_120,
    arkusz_fikstury_e2e,
    arkusz_siec_sn,
    wiersz_linii_tabliczka,
    wiersz_trafo_tabliczka,
    zbuduj_skoroszyt,
)
from tests.utils.generuj_arkusz_e2e import SCIEZKA_FIKSTURY

openpyxl = pytest.importorskip("openpyxl")

LINIA_PROJEKTU = "arkusz-linia-afl-6-120"
TRAFO_PROJEKTU = "arkusz-trafo-t1"


def arkusz_z_bledami_wierszy() -> bytes:
    """Trzy niezależne zastrzeżenia w trzech miejscach — sprawdza raport ZBIORCZY."""
    return zbuduj_skoroszyt(
        [
            ("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", -5.0]]),
            (
                "Linie",
                [
                    NAGLOWEK_LINII_TABLICZKA,
                    wiersz_linii_tabliczka("L1", "B1", "BRAK", 5.0),
                    wiersz_linii_tabliczka("L2", "B1", "B2", "abc"),
                ],
            ),
        ]
    )


def arkusz_pusty() -> bytes:
    """Arkusze z samymi nagłówkami — plik technicznie poprawny, danych zero."""
    return zbuduj_skoroszyt([("Szyny", [NAGLOWEK_SZYN]), ("Linie", [NAGLOWEK_LINII_TABLICZKA])])


def arkusz_zly_format() -> bytes:
    return b"to nie jest arkusz kalkulacyjny"


def _arkusz_ze_zrodlami(naglowek_zrodel: list[str], wiersze_zrodel: list[list]) -> bytes:
    """Skoroszyt z minimalnymi Szyny+Linie (arkusze wymagane) i podanym arkuszem Źródła.

    CV-4.3 K7: helper do testów kolumn scenariusza MIN (`Sk_min_MVA`/`Ik_min_kA`/
    `RX_min`) i trybu prądowego (`Ik_kA`) — nagłówek/wiersze podaje wołający, żeby
    testować dowolną kombinację {kolumna jest/brak} × {wartość/pusto}.
    """
    return zbuduj_skoroszyt(
        [
            ("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", 15.0]]),
            ("Linie", [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)]),
            ("Źródła", [naglowek_zrodel, *wiersze_zrodel]),
        ]
    )


def _arkusz_z_liniami(naglowek: list[str], wiersze: list[list]) -> bytes:
    return zbuduj_skoroszyt(
        [
            ("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", 15.0]]),
            ("Linie", [naglowek, *wiersze]),
            ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
        ]
    )


def _arkusz_z_trafo(naglowek: list[str], wiersze: list[list]) -> bytes:
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", 15.0], ["B3", "nN", 0.4]],
            ),
            ("Linie", [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)]),
            ("Trafo", [naglowek, *wiersze]),
            ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
        ]
    )


def _pierwszy_typ_kabla() -> str:
    return sorted(get_default_mv_catalog().cable_types)[0]


def _pierwszy_typ_linii() -> str:
    return sorted(get_default_mv_catalog().line_types)[0]


def _typ_trafo_15_04() -> str:
    katalog = get_default_mv_catalog()
    return sorted(
        identyfikator
        for identyfikator, typ in katalog.transformer_types.items()
        if typ.voltage_hv_kv == 15.0 and typ.voltage_lv_kv == 0.4
    )[0]


def _kolumny(bledy) -> set[tuple[str, int | None, str | None]]:
    return {(b.arkusz, b.wiersz, b.kolumna) for b in bledy}


# ---------------------------------------------------------------------------
# Odczyt arkusza (bez zapisu)
# ---------------------------------------------------------------------------


class TestOdczytArkusza:
    def test_poprawny_arkusz_daje_komplet_liczb(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn())
        assert wynik.success is True, wynik.errors
        assert wynik.bus_count == 3
        assert wynik.branch_count == 2  # 1 odcinek + 1 transformator
        assert wynik.trafo_count == 1
        assert wynik.source_count == 1
        assert wynik.load_count == 2
        assert wynik.siec is not None

    def test_bledy_wierszy_raportowane_zbiorczo(self):
        """Jedno wysłanie => wszystkie zastrzeżenia, bez ping-ponga z projektantem."""
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_z_bledami_wierszy())
        assert wynik.success is False
        opisy = _kolumny(wynik.bledy)
        assert ("Linie", 3, "długość_km") in opisy  # wartość nieliczbowa
        assert ("Linie", 2, "szyna_kon") in opisy  # odwołanie do nieistniejącej szyny
        assert ("Szyny", 3, "napięcie_kV") in opisy  # napięcie <= 0
        assert all(blad.komunikat for blad in wynik.bledy)

    def test_pusty_arkusz_jest_odrzucony_z_nazwanym_powodem(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_pusty())
        assert wynik.success is False
        assert any("wiersza danych" in blad.komunikat for blad in wynik.bledy)

    def test_zly_format_pliku_nie_wywraca_importera(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_zly_format())
        assert wynik.success is False
        assert any("XLSX" in blad.komunikat for blad in wynik.bledy)

    def test_brak_wymaganego_arkusza(self):
        dane = zbuduj_skoroszyt([("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0]])])
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(blad.arkusz == "Linie" for blad in wynik.bledy)

    def test_brak_kolumny_jest_zastrzezeniem_do_arkusza_nie_do_wiersza(self):
        dane = zbuduj_skoroszyt(
            [
                ("Szyny", [["id", "nazwa"], ["B1", "GPZ"]]),
                (
                    "Linie",
                    [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B1", 1.0)],
                ),
            ]
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        braki = [b for b in wynik.bledy if b.kolumna == "napięcie_kV" and b.wiersz is None]
        assert braki, "brak kolumny musi być zastrzeżeniem do arkusza"

    def test_odcinek_miedzy_ta_sama_szyna_jest_bledem_wiersza(self):
        dane = _arkusz_z_liniami(
            NAGLOWEK_LINII_TABLICZKA, [wiersz_linii_tabliczka("L1", "B1", "B1", 1.0)]
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert ("Linie", 2, "szyna_kon") in _kolumny(wynik.bledy)


# ---------------------------------------------------------------------------
# Wiązanie typów: katalog statyczny ALBO pełna tabliczka (typ projektu)
# ---------------------------------------------------------------------------


class TestWiazanieTypowOdcinkow:
    def test_pelna_tabliczka_linii_staje_sie_typem_projektu(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn(), "siec.xlsx")
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        assert "L1" in wynik.elementy_typow_projektu
        odcinek = next(g for g in wynik.siec.galezie if g["ref"] == "L1")
        assert odcinek["catalog_ref"] == LINIA_PROJEKTU
        assert odcinek["rodzaj"] == "LINIA"
        assert odcinek["dlugosc_m"] == 5000.0
        [typ] = wynik.siec.typy_projektu["line_types"]
        assert typ["id"] == LINIA_PROJEKTU
        assert typ["params"]["r_ohm_per_km"] == 0.253
        assert typ["params"]["x_ohm_per_km"] == 0.081
        assert typ["params"]["b_us_per_km"] == 2.8
        assert typ["params"]["rated_current_a"] == 315.0
        assert typ["params"]["voltage_rating_kv"] == 15.0
        assert typ["params"]["cross_section_mm2"] == 120.0
        assert typ["params"]["max_temperature_c"] is None  # puste w arkuszu = brak, nie 0
        assert typ["params"]["source_reference"] == "arkusz:siec.xlsx#Linie:2"
        assert typ["params"]["verification_status"] == "NIEWERYFIKOWANY"
        assert typ["params"]["catalog_status"] == "PROJEKTOWY_V1"
        assert wynik.siec.typy_projektu["cable_types"] == []

    def test_pelna_tabliczka_kabla_staje_sie_typem_kabla_projektu(self):
        dane = _arkusz_z_liniami(
            NAGLOWEK_LINII_TABLICZKA,
            [wiersz_linii_tabliczka("K1", "B1", "B2", 1.2, TABLICZKA_KABEL_120)],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane, "kable.xlsx")
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        odcinek = wynik.siec.galezie[0]
        assert odcinek["rodzaj"] == "KABEL"
        assert odcinek["catalog_ref"] == "arkusz-kabel-yakxs-3x120"
        [typ] = wynik.siec.typy_projektu["cable_types"]
        assert typ["params"]["c_nf_per_km"] == 250.0
        assert typ["params"]["max_temperature_c"] == 90.0
        assert typ["params"]["cross_section_mm2"] == 120.0
        assert typ["params"]["number_of_cores"] == 3
        assert wynik.siec.typy_projektu["line_types"] == []

    def test_jawny_typ_katalogowy_wiaze_element_bez_typu_projektu(self):
        typ = _pierwszy_typ_kabla()
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn(typ_katalogowy_linii=typ))
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        assert "L1" not in wynik.elementy_typow_projektu
        odcinek = next(g for g in wynik.siec.galezie if g["ref"] == "L1")
        assert odcinek["catalog_ref"] == typ
        assert odcinek["rodzaj"] == "KABEL"
        assert wynik.siec.typy_projektu["line_types"] == []
        assert wynik.siec.typy_projektu["cable_types"] == []

    def test_odcinek_bez_typu_i_bez_tabliczki_jest_bledem_wiersza(self):
        """Nie ma „bramki do domapowania później”: element bez typu nie ma parametrów."""
        dane = _arkusz_z_liniami(
            ["id", "szyna_pocz", "szyna_kon", "typ", "długość_km", "R_ohm_km", "X_ohm_km"],
            [["L1", "B1", "B2", "AFL-6 120", 5.0, 0.253, 0.081]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert ("Linie", 2, "rodzaj") in _kolumny(wynik.bledy)

    @pytest.mark.parametrize(
        "rodzaj,brakujaca",
        [
            ("LINIA", "I_dop_A"),
            ("LINIA", "B_uS_km"),
            ("LINIA", "Un_kV"),
            ("KABEL", "C_nF_km"),
            ("KABEL", "T_max_C"),
            ("KABEL", "przekroj_mm2"),
            ("KABEL", "zyly"),
        ],
    )
    def test_brak_kolumny_tabliczki_jest_bledem_z_nazwa_kolumny(self, rodzaj, brakujaca):
        """Zero wartości domyślnych: brak obciążalności nie staje się 0 A, brak
        susceptancji nie staje się 0."""
        tabliczka = TABLICZKA_KABEL_120 if rodzaj == "KABEL" else None
        wiersz = (
            wiersz_linii_tabliczka("L1", "B1", "B2", 1.0, tabliczka, **{brakujaca: None})
            if tabliczka
            else wiersz_linii_tabliczka("L1", "B1", "B2", 1.0, **{brakujaca: None})
        )
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(NAGLOWEK_LINII_TABLICZKA, [wiersz])
        )
        assert wynik.success is False
        [blad] = [b for b in wynik.bledy if b.arkusz == "Linie" and b.wiersz == 2]
        assert brakujaca in blad.komunikat
        assert "domyślnej" in blad.komunikat

    def test_linia_moze_miec_puste_t_max_i_przekroj(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [wiersz_linii_tabliczka("L1", "B1", "B2", 1.0, T_max_C=None, przekroj_mm2=None)],
            )
        )
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        [typ] = wynik.siec.typy_projektu["line_types"]
        assert typ["params"]["max_temperature_c"] is None
        assert typ["params"]["cross_section_mm2"] is None

    def test_wartosc_obok_typu_katalogowego_musi_sie_zgadzac(self):
        """Jedna prawda: arkusz podaje R obok typu katalogowego z innym R → błąd, nie
        ciche nadpisanie w żadną stronę."""
        typ = _pierwszy_typ_kabla()
        z_katalogu = get_default_mv_catalog().cable_types[typ]
        naglowek = NAGLOWEK_LINII_KATALOG + ["R_ohm_km", "I_dop_A"]
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                naglowek,
                [
                    [
                        "L1",
                        "B1",
                        "B2",
                        "kabel",
                        1.0,
                        typ,
                        z_katalogu.r_ohm_per_km * 2.0,
                        z_katalogu.rated_current_a,
                    ]
                ],
            )
        )
        assert wynik.success is False
        assert _kolumny(wynik.bledy) == {("Linie", 2, "R_ohm_km")}

    def test_wartosc_rowna_typowi_katalogowemu_przechodzi(self):
        typ = _pierwszy_typ_kabla()
        z_katalogu = get_default_mv_catalog().cable_types[typ]
        naglowek = NAGLOWEK_LINII_KATALOG + ["R_ohm_km", "X_ohm_km", "I_dop_A", "Un_kV"]
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                naglowek,
                [
                    [
                        "L1",
                        "B1",
                        "B2",
                        "kabel",
                        1.0,
                        typ,
                        z_katalogu.r_ohm_per_km,
                        z_katalogu.x_ohm_per_km,
                        z_katalogu.rated_current_a,
                        z_katalogu.voltage_rating_kv,
                    ]
                ],
            )
        )
        assert wynik.success is True, wynik.errors

    def test_rodzaj_sprzeczny_z_typem_katalogowym_jest_bledem(self):
        typ = _pierwszy_typ_kabla()
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_KATALOG + ["rodzaj"],
                [["L1", "B1", "B2", "kabel", 1.0, typ, "LINIA"]],
            )
        )
        assert wynik.success is False
        assert ("Linie", 2, "rodzaj") in _kolumny(wynik.bledy)

    def test_nieznany_typ_katalogowy_jest_bledem_wiersza(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            arkusz_siec_sn(typ_katalogowy_linii="NIE-MA-TAKIEGO-TYPU")
        )
        assert wynik.success is False
        assert any(blad.kolumna == "typ_katalogowy" for blad in wynik.bledy)

    def test_nieznany_rodzaj_jest_bledem_wiersza(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [wiersz_linii_tabliczka("L1", "B1", "B2", 1.0, rodzaj="SZYNOPRZEWÓD")],
            )
        )
        assert wynik.success is False
        assert ("Linie", 2, "rodzaj") in _kolumny(wynik.bledy)

    def test_ten_sam_typ_z_rozna_tabliczka_jest_bledem(self):
        """Ta sama nazwa typu musi znaczyć ten sam przewód."""
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [
                    wiersz_linii_tabliczka("L1", "B1", "B2", 1.0),
                    wiersz_linii_tabliczka("L2", "B1", "B2", 2.0, R_ohm_km=0.3),
                ],
            )
        )
        assert wynik.success is False
        assert ("Linie", 3, "typ") in _kolumny(wynik.bledy)

    def test_ten_sam_typ_z_ta_sama_tabliczka_daje_jedna_pozycje(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [
                    wiersz_linii_tabliczka("L1", "B1", "B2", 1.0),
                    wiersz_linii_tabliczka("L2", "B1", "B2", 2.0),
                ],
            )
        )
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        assert len(wynik.siec.typy_projektu["line_types"]) == 1
        assert wynik.elementy_typow_projektu == ["L1", "L2"]

    @pytest.mark.parametrize("kolumna", ["R_ohm_km", "X_ohm_km", "B_uS_km"])
    def test_ujemna_wartosc_jednostkowa_jest_bledem(self, kolumna):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [wiersz_linii_tabliczka("L1", "B1", "B2", 1.0, **{kolumna: -0.1})],
            )
        )
        assert wynik.success is False
        assert ("Linie", 2, kolumna) in _kolumny(wynik.bledy)

    def test_liczba_zyl_spoza_1_i_3_jest_bledem(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_liniami(
                NAGLOWEK_LINII_TABLICZKA,
                [wiersz_linii_tabliczka("K1", "B1", "B2", 1.0, TABLICZKA_KABEL_120, zyly=4.0)],
            )
        )
        assert wynik.success is False
        assert ("Linie", 2, "zyly") in _kolumny(wynik.bledy)


class TestWiazanieTypowTransformatorow:
    def test_pelna_tabliczka_staje_sie_typem_projektu_z_nazwanym_przyjeciem_napiec(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn(), "siec.xlsx")
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        assert "T1" in wynik.elementy_typow_projektu
        [trafo] = wynik.siec.transformatory
        assert trafo["catalog_ref"] == TRAFO_PROJEKTU
        assert trafo["name"] == "T1"
        [typ] = wynik.siec.typy_projektu["transformer_types"]
        assert typ["params"]["rated_power_mva"] == 0.4
        assert typ["params"]["voltage_hv_kv"] == 15.0
        assert typ["params"]["voltage_lv_kv"] == 0.4
        assert typ["params"]["uk_percent"] == 6.0
        assert typ["params"]["pk_kw"] == 4.6
        assert typ["params"]["vector_group"] == "Dyn11"
        assert (typ["params"]["tap_min"], typ["params"]["tap_max"]) == (-2, 2)
        assert typ["params"]["tap_step_percent"] == 2.5
        assert typ["params"]["source_reference"] == "arkusz:siec.xlsx#Trafo:2"
        # Przyjęcie napięć uzwojeń z napięć szyn jest NAZWANE — w ostrzeżeniu i w rekordzie.
        assert "U_HV = napięcie szyny B2" in typ["params"]["verification_note"]
        assert any("T1" in o and "U_HV_kV/U_LV_kV" in o for o in wynik.warnings)

    def test_jawne_napiecia_uzwojen_nie_daja_ostrzezenia(self):
        naglowek = NAGLOWEK_TRAFO_TABLICZKA + ["U_HV_kV", "U_LV_kV"]
        wiersz = wiersz_trafo_tabliczka("T1", "B2", "B3") + [15.75, 0.42]
        wynik = XlsxNetworkImporter().import_from_bytes(_arkusz_z_trafo(naglowek, [wiersz]))
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        [typ] = wynik.siec.typy_projektu["transformer_types"]
        assert typ["params"]["voltage_hv_kv"] == 15.75
        assert typ["params"]["voltage_lv_kv"] == 0.42
        assert "verification_note" not in typ["params"]
        assert wynik.warnings == []

    def test_typ_katalogowy_wiaze_transformator(self):
        typ = _typ_trafo_15_04()
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn(typ_katalogowy_trafo=typ))
        assert wynik.success is True, wynik.errors
        assert wynik.siec is not None
        assert wynik.siec.transformatory[0]["catalog_ref"] == typ
        assert "T1" not in wynik.elementy_typow_projektu
        assert wynik.siec.typy_projektu["transformer_types"] == []

    @pytest.mark.parametrize(
        "brakujaca", ["Sn_MVA", "uk_pct", "Pk_kW", "grupa", "zaczep_min", "zaczep_krok_pct"]
    )
    def test_brak_kolumny_tabliczki_jest_bledem_z_nazwa_kolumny(self, brakujaca):
        """Brak grupy połączeń nie staje się Dyn11, brak strat nie staje się 0."""
        wiersz = wiersz_trafo_tabliczka("T1", "B2", "B3", **{brakujaca: None})
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_trafo(NAGLOWEK_TRAFO_TABLICZKA, [wiersz])
        )
        assert wynik.success is False
        [blad] = [b for b in wynik.bledy if b.arkusz == "Trafo" and b.wiersz == 2]
        assert brakujaca in blad.komunikat

    def test_transformator_bez_typu_i_bez_tabliczki_jest_bledem(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_trafo(["id", "szyna_HV", "szyna_LV"], [["T1", "B2", "B3"]])
        )
        assert wynik.success is False
        assert any(b.arkusz == "Trafo" and b.wiersz == 2 for b in wynik.bledy)

    def test_wartosc_obok_typu_katalogowego_musi_sie_zgadzac(self):
        typ = _typ_trafo_15_04()
        z_katalogu = get_default_mv_catalog().transformer_types[typ]
        naglowek = NAGLOWEK_TRAFO_KATALOG + ["Sn_MVA"]
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_trafo(naglowek, [["T1", "B2", "B3", typ, z_katalogu.rated_power_mva * 2]])
        )
        assert wynik.success is False
        assert _kolumny(wynik.bledy) == {("Trafo", 2, "Sn_MVA")}

    def test_nieznany_typ_katalogowy_transformatora_jest_bledem(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            arkusz_siec_sn(typ_katalogowy_trafo="NIE-MA")
        )
        assert wynik.success is False
        assert ("Trafo", 2, "typ_katalogowy") in _kolumny(wynik.bledy)

    def test_zakres_zaczepow_musi_obejmowac_polozenie_znamionowe(self):
        wiersz = wiersz_trafo_tabliczka("T1", "B2", "B3", zaczep_min=1, zaczep_max=3)
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_trafo(NAGLOWEK_TRAFO_TABLICZKA, [wiersz])
        )
        assert wynik.success is False
        assert ("Trafo", 2, "zaczep_min") in _kolumny(wynik.bledy)

    def test_zaczep_ulamkowy_jest_bledem(self):
        wiersz = wiersz_trafo_tabliczka("T1", "B2", "B3", zaczep_max=2.5)
        wynik = XlsxNetworkImporter().import_from_bytes(
            _arkusz_z_trafo(NAGLOWEK_TRAFO_TABLICZKA, [wiersz])
        )
        assert wynik.success is False
        assert ("Trafo", 2, "zaczep_max") in _kolumny(wynik.bledy)


# ---------------------------------------------------------------------------
# Zero fizyki w warstwie aplikacji
# ---------------------------------------------------------------------------


class TestZeroFizyki:
    def test_dane_zrodla_ida_do_modelu_jako_wejscie_nie_jako_impedancja(self):
        """Pin deklaracji „ZERO FIZYKI” z docstringu importera."""
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_siec_sn())
        assert wynik.siec is not None
        [zrodlo] = wynik.siec.zrodla
        assert zrodlo["sk3_mva"] == 500.0
        assert zrodlo["rx_ratio"] == 0.1
        assert zrodlo["node_ref"] == "B1"
        zakazane = {"z_ohm", "r_ohm", "x_ohm", "source_impedance", "z1_ohm"}
        assert not (zakazane & set(zrodlo)), "importer nie liczy impedancji"


# ---------------------------------------------------------------------------
# Zapis do modelu — iloczyn cech: (plik) × (stan bazy przed importem)
# ---------------------------------------------------------------------------


@pytest.fixture()
def serwis(test_db_session):
    return XlsxImportService(test_db_session)


def _model_projektu(project_id: str):
    return get_enm(klucz_twin_projektu(UUID(project_id)))


class TestZapisDoModelu:
    def test_import_tworzy_projekt_przypadek_i_model_enm(self, serwis, test_db_session):
        from infrastructure.persistence.models import ProjectORM, StudyCaseORM

        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć z arkusza", "siec.xlsx")
        test_db_session.flush()

        assert wynik.status == STATUS_ZAIMPORTOWANO, wynik.bledy
        assert wynik.project_id and wynik.case_id and wynik.enm_hash
        pid = UUID(wynik.project_id)
        projekt = test_db_session.get(ProjectORM, pid)
        assert projekt is not None
        assert projekt.name == "Sieć z arkusza"
        assert projekt.voltage_level_kv == 15.0

        [przypadek] = test_db_session.query(StudyCaseORM).filter_by(project_id=pid).all()
        assert str(przypadek.id) == wynik.case_id
        assert przypadek.is_active is True
        assert przypadek.name == NAZWA_PIERWSZEGO_PRZYPADKU

        model = _model_projektu(wynik.project_id)
        assert model.header.hash_sha256 == wynik.enm_hash
        assert model.header.revision == 1
        assert [b.name for b in model.buses] == ["GPZ 15 kV", "Stacja 1", "Stacja 1 nN"]
        assert [b.name for b in model.branches] == ["L1"]
        assert [t.name for t in model.transformers] == ["T1"]
        assert [s.name for s in model.sources] == ["Z1"]
        assert [o.name for o in model.loads] == ["O1", "O2"]
        assert model.katalog_projektu is not None
        assert [t.id for t in model.katalog_projektu.line_types] == [LINIA_PROJEKTU]
        assert [t.id for t in model.katalog_projektu.transformer_types] == [TRAFO_PROJEKTU]
        assert wynik.podsumowanie is not None
        assert wynik.podsumowanie.to_dict() == {
            "szyny": 3,
            "odcinki": 1,
            "transformatory": 1,
            "zrodla": 1,
            "odbiory": 2,
        }
        assert wynik.elementy_typow_projektu == ["L1", "T1"]

    def test_elementy_modelu_wiaza_typy_z_arkusza_przez_catalog_ref(self, serwis, test_db_session):
        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć", "siec.xlsx")
        model = _model_projektu(wynik.project_id or "")
        [odcinek] = model.branches
        assert odcinek.catalog_ref == LINIA_PROJEKTU
        assert odcinek.length_km == pytest.approx(5.0)
        [trafo] = model.transformers
        assert trafo.catalog_ref == TRAFO_PROJEKTU

    def test_model_z_importu_nie_ma_blokad_walidatora(self, serwis, test_db_session):
        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć")
        model = _model_projektu(wynik.project_id or "")
        blokady = [
            i for i in ENMValidator().validate(model).issues if i.severity == SEVERITY_BLOCKER
        ]
        assert blokady == []

    def test_dziennik_zmian_nazywa_import_jako_przyczyne_rewizji(self, serwis, test_db_session):
        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć", "siec.xlsx")
        [wpis] = wszystkie_wpisy(klucz_twin_projektu(UUID(wynik.project_id or "")))
        # Import nie jest operacją domenową z kanonu: wpis bez operacji, z nazwanym opisem
        # i identyfikatorem źródła w ładunku (kontrakt `dziennik_zmian.przygotuj_dopisanie`).
        assert wpis.operacja is None
        assert wpis.opis_pl == "Import sieci z arkusza XLSX (siec.xlsx)"
        assert wpis.ladunek is not None and wpis.ladunek["zrodlo"] == ZRODLO_IMPORTU
        assert wpis.rewizja == 1
        model = _model_projektu(wynik.project_id or "")
        oczekiwane = sorted(
            [b.ref_id for b in model.buses]
            + [b.ref_id for b in model.branches]
            + [t.ref_id for t in model.transformers]
            + [s.ref_id for s in model.sources]
            + [o.ref_id for o in model.loads]
        )
        assert sorted(wpis.utworzone) == oczekiwane

    def test_typ_projektu_jest_widoczny_w_operacjach_domenowych_po_imporcie(
        self, serwis, test_db_session
    ):
        """Typ z arkusza rozstrzyga się WSZĘDZIE tam, gdzie typ producenta — projektant
        dobudowuje odcinek tym samym `catalog_ref` zwykłą operacją domenową."""
        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć")
        model = _model_projektu(wynik.project_id or "")
        stacja = next(b for b in model.buses if b.name == "Stacja 1")
        enm, nowa_szyna = kontynuuj_z_szyny(
            model.model_dump(mode="json"),
            from_bus_ref=stacja.ref_id,
            catalog_ref=LINIA_PROJEKTU,
            dlugosc_m=800.0,
            name="L2",
            bus_name="Stacja 2",
        )
        odcinek = next(b for b in enm["branches"] if b["name"] == "L2")
        assert odcinek["catalog_ref"] == LINIA_PROJEKTU
        assert odcinek["to_bus_ref"] == nowa_szyna

    def test_arkusz_z_bledami_nie_zostawia_zadnego_sladu(self, serwis, test_db_session):
        """Operacja meldująca błąd nie zostawia projektu-kikuta ani modelu w magazynie."""
        from infrastructure.persistence.models import ProjectORM, StudyCaseORM

        projektow_przed = test_db_session.query(ProjectORM).count()
        przypadkow_przed = test_db_session.query(StudyCaseORM).count()

        wynik = serwis.importuj(arkusz_z_bledami_wierszy(), "Nie powstanie")
        test_db_session.flush()

        assert wynik.status == STATUS_ODRZUCONO
        assert wynik.project_id is None and wynik.case_id is None and wynik.enm_hash is None
        assert wynik.bledy
        assert test_db_session.query(ProjectORM).count() == projektow_przed
        assert test_db_session.query(StudyCaseORM).count() == przypadkow_przed

    def test_wyspa_bez_zasilania_jest_nazwanym_zastrzezeniem_modelu(self, serwis, test_db_session):
        """Szyna nieosiągalna z żadnego źródła: kompilator odmawia, import niczego nie tworzy."""
        from infrastructure.persistence.models import ProjectORM

        dane = zbuduj_skoroszyt(
            [
                (
                    "Szyny",
                    [
                        NAGLOWEK_SZYN,
                        ["B1", "GPZ", 15.0],
                        ["B2", "Stacja", 15.0],
                        ["B9", "Wyspa", 15.0],
                    ],
                ),
                (
                    "Linie",
                    [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)],
                ),
                ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
            ]
        )
        przed = test_db_session.query(ProjectORM).count()
        podglad = serwis.podglad(dane)
        assert podglad.poprawny is False
        [blad] = podglad.bledy
        assert blad["arkusz"] == ARKUSZ_MODELU
        assert "B9" in blad["komunikat"]
        wynik = serwis.importuj(dane, "Wyspa")
        test_db_session.flush()
        assert wynik.status == STATUS_ODRZUCONO
        assert wynik.bledy == podglad.bledy
        assert test_db_session.query(ProjectORM).count() == przed

    def test_odcinek_miedzy_roznymi_napieciami_jest_zastrzezeniem_modelu(
        self, serwis, test_db_session
    ):
        dane = zbuduj_skoroszyt(
            [
                ("Szyny", [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "nN", 0.4]]),
                (
                    "Linie",
                    [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 1.0)],
                ),
                ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
            ]
        )
        podglad = serwis.podglad(dane)
        assert podglad.poprawny is False
        assert podglad.bledy[0]["arkusz"] == ARKUSZ_MODELU

    def test_import_do_bazy_z_zawartoscia_nie_rusza_wczesniejszego_projektu(
        self, serwis, test_db_session
    ):
        """Iloczyn cech: (plik poprawny) × (baza z projektem)."""
        pierwszy = serwis.importuj(arkusz_siec_sn(), "Projekt A")
        test_db_session.flush()
        drugi = serwis.importuj(arkusz_siec_sn(), "Projekt B")
        test_db_session.flush()

        assert pierwszy.project_id != drugi.project_id
        assert pierwszy.case_id != drugi.case_id
        for wynik in (pierwszy, drugi):
            model = _model_projektu(wynik.project_id or "")
            assert len(model.buses) == 3, "import nie może mieszać modeli dwóch projektów"
        assert _model_projektu(pierwszy.project_id or "").header.name == "Projekt A"

    def test_podglad_nie_zapisuje_niczego_i_daje_te_same_liczby_co_import(
        self, serwis, test_db_session
    ):
        from infrastructure.persistence.models import ProjectORM

        przed = test_db_session.query(ProjectORM).count()
        podglad = serwis.podglad(arkusz_siec_sn(), "siec.xlsx")
        test_db_session.flush()

        assert podglad.poprawny is True
        assert podglad.podsumowanie is not None
        assert podglad.elementy_typow_projektu == ["L1", "T1"]
        assert test_db_session.query(ProjectORM).count() == przed

        wynik = serwis.importuj(arkusz_siec_sn(), "Sieć", "siec.xlsx")
        assert wynik.podsumowanie == podglad.podsumowanie
        assert wynik.ostrzezenia == podglad.ostrzezenia
        assert wynik.elementy_typow_projektu == podglad.elementy_typow_projektu

    def test_podglad_zlego_pliku_zwraca_zastrzezenia_bez_wyjatku(self, serwis):
        podglad = serwis.podglad(arkusz_zly_format())
        assert podglad.poprawny is False
        assert podglad.bledy
        assert podglad.podsumowanie is None

    def test_ten_sam_arkusz_daje_ten_sam_odcisk_modelu(self, serwis, test_db_session):
        """Determinizm: identyczne wejście => identyczny `enm_hash` (nowe projekty, nowe
        identyfikatory — odcisk liczy treść, nie identyfikatory)."""
        dane = arkusz_siec_sn()
        a = serwis.importuj(dane, "Sieć", "siec.xlsx")
        b = serwis.importuj(dane, "Sieć", "siec.xlsx")
        assert a.enm_hash == b.enm_hash
        assert a.project_id != b.project_id

    def test_brak_modelu_w_magazynie_po_odrzuceniu(self, serwis, test_db_session):
        from infrastructure.persistence.models import ProjectORM

        identyfikatory_przed = {str(p.id) for p in test_db_session.query(ProjectORM).all()}
        serwis.importuj(arkusz_z_bledami_wierszy(), "Nie powstanie")
        identyfikatory_po = {str(p.id) for p in test_db_session.query(ProjectORM).all()}
        assert identyfikatory_po == identyfikatory_przed
        for identyfikator in identyfikatory_po:
            # Projekty zastane w bazie testowej nie dostają modelu „przy okazji".
            assert has_enm(klucz_twin_projektu(UUID(identyfikator))) is False


# ---------------------------------------------------------------------------
# Fikstura e2e — ten sam skoroszyt, którym front testuje import
# ---------------------------------------------------------------------------


class TestFiksturaE2E:
    def test_plik_fikstury_jest_generowany_z_tego_samego_budowniczego(self):
        assert (
            SCIEZKA_FIKSTURY.is_file()
        ), f"brak {SCIEZKA_FIKSTURY} — uruchom tests/utils/generuj_arkusz_e2e.py"
        assert (
            SCIEZKA_FIKSTURY.read_bytes() == arkusz_fikstury_e2e()
        ), "fikstura e2e rozjechała się z budowniczym — uruchom tests/utils/generuj_arkusz_e2e.py"

    def test_fikstura_e2e_przechodzi_import(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            arkusz_fikstury_e2e(), "arkusz-siec-sn.xlsx"
        )
        assert wynik.success is True, wynik.errors
        assert wynik.elementy_typow_projektu == ["L1", "T1"]


# ---------------------------------------------------------------------------
# CV-4.3 K7 — dane zwarciowe scenariusza MIN + tryb prądowy (samo Ik'')
# ---------------------------------------------------------------------------
#
# Iloczyn cech: {kolumna jest / brak} × {wartość / pusto} × {min ≤ max / min > max}
# × {tryb Sk'' / tryb Ik''} × {wartość dodatnia / zero / ujemna}.

_PELNY_NAGLOWEK_ZRODEL = [
    "id",
    "szyna",
    "typ",
    "RX_ratio",
    "Sk_MVA",
    "Ik_kA",
    "Sk_min_MVA",
    "Ik_min_kA",
    "RX_min",
]


def _zrodlo(dane: bytes) -> dict:
    wynik = XlsxNetworkImporter().import_from_bytes(dane)
    assert wynik.success is True, wynik.errors
    assert wynik.siec is not None
    [zrodlo] = wynik.siec.zrodla
    return zrodlo


class TestZrodloDaneMinITrybPradowy:
    def test_pelne_dane_min_trafiaja_do_rekordu_bez_zmian(self):
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                _PELNY_NAGLOWEK_ZRODEL,
                [["Z1", "B1", "system", 0.1, 500.0, 19.2, 150.0, 6.0, 0.2]],
            )
        )
        assert zrodlo["sk3_mva"] == 500.0
        assert zrodlo["ik3_ka"] == 19.2
        assert zrodlo["sk3_min_mva"] == 150.0
        assert zrodlo["ik3_min_ka"] == 6.0
        assert zrodlo["rx_ratio_min"] == 0.2

    def test_kolumny_min_i_ik_nieobecne_w_arkuszu_nie_zostawiaja_kluczy(self):
        """Arkusz bez kolumn MIN/Ik_kA (jak przed K7) — zero nowych kluczy w rekordzie."""
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                ["id", "szyna", "typ", "Sk_MVA", "RX_ratio"],
                [["Z1", "B1", "system", 500.0, 0.1]],
            )
        )
        assert zrodlo["sk3_mva"] == 500.0
        zakazane = {"sk3_min_mva", "ik3_min_ka", "rx_ratio_min", "ik3_ka"}
        assert not (zakazane & set(zrodlo)), "brak kolumn MIN/Ik_kA => zero kluczy MIN"

    def test_puste_komorki_min_pomijaja_klucz_mimo_obecnej_kolumny(self):
        """Kolumny MIN OBECNE w nagłówku, ale komórki puste — klucz pominięty, nie 0/None."""
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                _PELNY_NAGLOWEK_ZRODEL,
                [["Z1", "B1", "system", 0.1, 500.0, None, None, None, None]],
            )
        )
        assert zrodlo["sk3_mva"] == 500.0
        for pole in ("ik3_ka", "sk3_min_mva", "ik3_min_ka", "rx_ratio_min"):
            assert pole not in zrodlo

    def test_sam_prad_bez_mocy_zwarciowej_jest_trybem_pradowym_policzalnym(self):
        """CV-4.3 K7: samo Ik'' (bez Sk'') jest daną wystarczającą — import się udaje."""
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                ["id", "szyna", "typ", "RX_ratio", "Ik_kA"],
                [["Z1", "B1", "system", 0.1, 9.6]],
            )
        )
        assert zrodlo["ik3_ka"] == 9.6
        assert "sk3_mva" not in zrodlo

    def test_brak_sk_i_ik_jest_bledem_calego_wiersza(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio"],
            [["Z1", "B1", "system", 0.1]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(
            b.arkusz == "Źródła" and b.kolumna is None and b.wiersz == 2 for b in wynik.bledy
        )

    def test_sk_min_wieksze_od_sk_max_jest_ostrzezeniem_nie_blokuje_importu(self):
        """Sprzeczność MIN>MAX: importer POKAZUJE (ostrzeżenie), nie POŁYKA i nie blokuje —
        rozstrzygnięcie należy do warstwy domenowej, gdy dane tam trafią."""
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "Sk_min_MVA"],
            [["Z1", "B1", "system", 0.1, 100.0, 150.0]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        assert wynik.siec.zrodla[0]["sk3_min_mva"] == 150.0
        assert any("Sk_min_MVA" in o and "Z1" in o for o in wynik.warnings)

    def test_ik_min_wieksze_od_ik_max_jest_ostrzezeniem(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Ik_kA", "Ik_min_kA"],
            [["Z1", "B1", "system", 0.1, 5.0, 8.0]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert any("Ik_min_kA" in o and "Z1" in o for o in wynik.warnings)

    def test_rx_min_bez_wlasnej_mocy_zwarciowej_min_jest_ostrzezeniem(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "RX_min"],
            [["Z1", "B1", "system", 0.1, 500.0, 0.2]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        assert wynik.siec.zrodla[0]["rx_ratio_min"] == 0.2
        assert any("RX_min" in o and "Z1" in o for o in wynik.warnings)

    def test_sk_min_ujemne_lub_zero_jest_bledem_wiersza(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "Sk_min_MVA"],
            [["Z1", "B1", "system", 0.1, 500.0, 0.0]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(b.kolumna == "Sk_min_MVA" for b in wynik.bledy)

    def test_ik_min_ujemny_jest_bledem_wiersza(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Ik_kA", "Ik_min_kA"],
            [["Z1", "B1", "system", 0.1, 9.6, -1.0]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(b.kolumna == "Ik_min_kA" for b in wynik.bledy)

    def test_rx_min_ujemny_jest_bledem_wiersza(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "RX_min"],
            [["Z1", "B1", "system", 0.1, 500.0, -0.1]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(b.kolumna == "RX_min" for b in wynik.bledy)

    def test_ik_ujemny_jest_bledem_wiersza(self):
        """Ik_kA (kolumna opcjonalna scenariusza MAX) — ta sama reguła co Sk_MVA."""
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Ik_kA"],
            [["Z1", "B1", "system", 0.1, -5.0]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert any(b.kolumna == "Ik_kA" for b in wynik.bledy)


class TestKolumnaUPu:
    """Napięcie zadane szyny bilansującej (`U_pu`, p.u. Un szyny; puste = 1,0 znamionowe)."""

    def test_u_pu_trafia_do_rekordu_jako_u_set_pu(self):
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
                [["Z1", "B1", "system", 0.1, 500.0, 1.06]],
            )
        )
        assert zrodlo["u_set_pu"] == 1.06

    def test_puste_u_pu_nie_zostawia_klucza(self):
        zrodlo = _zrodlo(
            _arkusz_ze_zrodlami(
                ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
                [["Z1", "B1", "system", 0.1, 500.0, None]],
            )
        )
        assert "u_set_pu" not in zrodlo

    @pytest.mark.parametrize("wartosc", [0.0, 0.5, 1.5, -1.0])
    def test_u_pu_poza_pasmem_jest_bledem_wiersza(self, wartosc):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
            [["Z1", "B1", "system", 0.1, 500.0, wartosc]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert ("Źródła", "U_pu") in {(b.arkusz, b.kolumna) for b in wynik.bledy}

    def test_u_pu_z_arkusza_ustawia_napiecie_zadane_zrodla_w_modelu(self, serwis, test_db_session):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
            [["Z1", "B1", "system", 0.1, 500.0, 1.04]],
        )
        wynik = serwis.importuj(dane, "U zadane")
        assert wynik.status == STATUS_ZAIMPORTOWANO, wynik.bledy
        [zrodlo] = _model_projektu(wynik.project_id or "").sources
        assert zrodlo.u_set_pu == pytest.approx(1.04)
