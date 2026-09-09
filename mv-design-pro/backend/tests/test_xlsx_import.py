"""Import sieci z arkusza XLSX — testy REALNEJ ścieżki (bajty pliku, nie skrót przez dict).

STAN PRZED (karta XLSX-IMPORT, 2026-08-07): cały ten plik testował `import_from_dict`
— metodę bez ani jednego wołającego produkcyjnego. Realna ścieżka (`import_from_bytes`,
czyli openpyxl) NIE była dotknięta żadnym testem, dzięki czemu przez cały czas nie
wychodziło na jaw, że `openpyxl` w ogóle nie jest zależnością projektu i końcówka
`POST /api/import/xlsx` zwraca 422 „Brak biblioteki openpyxl" dla KAŻDEGO wejścia.
Zgodnie z CLAUDE.md §5 (test maskujący defekt produktu = dwa defekty) testy budują
teraz prawdziwy skoroszyt i przechodzą tą samą drogą co użytkownik.
"""

from __future__ import annotations

import io

import pytest
from application.xlsx_import import XlsxImportService, XlsxNetworkImporter
from network_model.catalog.governance import wymaga_referencji_katalogowej

openpyxl = pytest.importorskip("openpyxl")


# ---------------------------------------------------------------------------
# Budowniczy realnych skoroszytów
# ---------------------------------------------------------------------------


def zbuduj_skoroszyt(arkusze: list[tuple[str, list[list]]]) -> bytes:
    """Zbuduj prawdziwy plik XLSX (bajty) z listy arkuszy."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nazwa, wiersze in arkusze:
        ws = wb.create_sheet(nazwa)
        for wiersz in wiersze:
            ws.append(list(wiersz))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


NAGLOWEK_SZYN = ["id", "nazwa", "napięcie_kV"]
NAGLOWEK_LINII = [
    "id",
    "szyna_pocz",
    "szyna_kon",
    "typ",
    "długość_km",
    "R_ohm_km",
    "X_ohm_km",
]


def arkusz_poprawny(*, typ_katalogowy: str | None = None) -> bytes:
    naglowek_linii = list(NAGLOWEK_LINII)
    wiersz_linii = ["L1", "B1", "B2", "AFL-6 120", 5.0, 0.253, 0.081]
    if typ_katalogowy is not None:
        naglowek_linii.append("typ_katalogowy")
        wiersz_linii.append(typ_katalogowy)
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [
                    NAGLOWEK_SZYN,
                    ["B1", "GPZ 15 kV", 15.0],
                    ["B2", "Stacja 1", 15.0],
                    ["B3", "Stacja 1 nN", 0.4],
                ],
            ),
            ("Linie", [naglowek_linii, wiersz_linii]),
            (
                "Trafo",
                [
                    ["id", "szyna_HV", "szyna_LV", "Sn_MVA", "uk_pct", "Pk_kW", "grupa"],
                    ["T1", "B2", "B3", 0.4, 6.0, 4.6, "Dyn11"],
                ],
            ),
            (
                "Źródła",
                [
                    ["id", "szyna", "typ", "Sk_MVA", "RX_ratio"],
                    ["Z1", "B1", "system", 500.0, 0.1],
                ],
            ),
            (
                "Odbiory",
                [
                    ["id", "szyna", "P_MW", "Q_Mvar"],
                    ["O1", "B3", 0.25, 0.08],
                    ["O2", "B3", 0.15, 0.02],
                ],
            ),
        ]
    )


def arkusz_z_bledami_wierszy() -> bytes:
    """Trzy niezależne zastrzeżenia w trzech miejscach — sprawdza raport ZBIORCZY."""
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", -5.0]],
            ),
            (
                "Linie",
                [
                    NAGLOWEK_LINII,
                    ["L1", "B1", "BRAK", "AFL", 5.0, 0.25, 0.08],
                    ["L2", "B1", "B2", "AFL", "abc", 0.25, 0.08],
                ],
            ),
        ]
    )


def arkusz_pusty() -> bytes:
    """Arkusze z samymi nagłówkami — plik technicznie poprawny, danych zero."""
    return zbuduj_skoroszyt([("Szyny", [NAGLOWEK_SZYN]), ("Linie", [NAGLOWEK_LINII])])


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
            ("Linie", [NAGLOWEK_LINII, ["L1", "B1", "B2", "AFL-6 120", 5.0, 0.253, 0.081]]),
            ("Źródła", [naglowek_zrodel, *wiersze_zrodel]),
        ]
    )


def _pierwszy_typ_kabla() -> str:
    from network_model.catalog.repository import get_default_mv_catalog

    return sorted(get_default_mv_catalog().cable_types)[0]


# ---------------------------------------------------------------------------
# Odczyt arkusza (bez zapisu)
# ---------------------------------------------------------------------------


class TestOdczytArkusza:
    def test_poprawny_arkusz_daje_komplet_liczb(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny())
        assert wynik.success is True
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
        opisy = {(b.arkusz, b.wiersz, b.kolumna) for b in wynik.bledy}
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
                ("Linie", [NAGLOWEK_LINII, ["L1", "B1", "B1", "AFL", 1.0, 0.1, 0.1]]),
            ]
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        braki = [b for b in wynik.bledy if b.kolumna == "napięcie_kV" and b.wiersz is None]
        assert braki, "brak kolumny musi być zastrzeżeniem do arkusza"


# ---------------------------------------------------------------------------
# Katalog — wiązanie i bramka
# ---------------------------------------------------------------------------


class TestBramkaKatalogowa:
    def test_odcinek_bez_typu_katalogowego_zapala_bramke(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny())
        assert wynik.success is True
        assert wynik.mapowanie_katalogowe_wymagane is True
        assert wynik.elementy_bez_katalogu == ["L1"]

    def test_jawny_typ_katalogowy_wiaze_element_i_gasi_bramke(self):
        typ = _pierwszy_typ_kabla()
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny(typ_katalogowy=typ))
        assert wynik.success is True
        assert wynik.mapowanie_katalogowe_wymagane is False
        assert wynik.elementy_bez_katalogu == []
        assert wynik.siec is not None
        odcinek = next(g for g in wynik.siec.galezie if g["ref"] == "L1")
        assert odcinek["params"]["type_ref"] == typ
        # Obciążalność pochodzi WYŁĄCZNIE z katalogu — stan PRZED wpisywał tu
        # fikcyjne `rated_current_a=1.0` („placeholder"), czyli 1 A dla każdego odcinka.
        assert odcinek["params"]["rated_current_a"] > 0

    def test_odcinek_bez_katalogu_nie_dostaje_zmyslonej_obciazalnosci(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny())
        assert wynik.siec is not None
        odcinek = next(g for g in wynik.siec.galezie if g["ref"] == "L1")
        assert odcinek["params"]["rated_current_a"] == 0.0
        assert odcinek["params"]["type_ref"] is None

    def test_nieznany_typ_katalogowy_jest_bledem_wiersza(self):
        wynik = XlsxNetworkImporter().import_from_bytes(
            arkusz_poprawny(typ_katalogowy="NIE-MA-TAKIEGO-TYPU")
        )
        assert wynik.success is False
        assert any(blad.kolumna == "typ_katalogowy" for blad in wynik.bledy)

    def test_predykat_bramki_jest_wspolny_dla_obu_nazewnictw(self):
        """Bramka katalogowa importu ma JEDNO źródło prawdy (ZIP i XLSX)."""
        assert wymaga_referencji_katalogowej("cable") is True
        assert wymaga_referencji_katalogowej("line_overhead") is True
        assert wymaga_referencji_katalogowej("CABLE") is True
        assert wymaga_referencji_katalogowej("LINE") is True
        assert wymaga_referencji_katalogowej("TRANSFORMER") is False
        assert wymaga_referencji_katalogowej(None) is False


# ---------------------------------------------------------------------------
# Zero fizyki i zero fikcji w warstwie aplikacji
# ---------------------------------------------------------------------------


class TestZeroFizyki:
    def test_dane_zrodla_ida_do_modelu_jako_wejscie_nie_jako_impedancja(self):
        """Pin deklaracji „ZERO FIZYKI" z docstringu importera.

        Stan PRZED liczył Z = Un²/Sk'' oraz R/X w warstwie aplikacji i wpisywał
        wynik w dynamiczny atrybut węzła, którego nikt nie czytał.
        """
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny())
        assert wynik.siec is not None
        zrodlo = wynik.siec.zrodla[0]
        assert zrodlo["payload"]["model"] == "short_circuit_power"
        assert zrodlo["payload"]["sk3_mva"] == 500.0
        assert zrodlo["payload"]["rx_ratio"] == 0.1
        zakazane = {"z_ohm", "r_ohm", "x_ohm", "source_impedance", "z1_ohm"}
        assert not (zakazane & set(zrodlo["payload"])), "importer nie liczy impedancji"

    def test_zrodlo_wyznacza_szyne_bilansujaca(self):
        wynik = XlsxNetworkImporter().import_from_bytes(arkusz_poprawny())
        assert wynik.siec is not None
        slack = [w for w in wynik.siec.wezly if w["node_type"] == "SLACK"]
        assert [w["ref"] for w in slack] == ["B1"]


# ---------------------------------------------------------------------------
# Zapis do modelu — iloczyn cech: (plik) × (stan bazy przed importem)
# ---------------------------------------------------------------------------


@pytest.fixture()
def serwis(test_db_session):
    return XlsxImportService(test_db_session)


class TestZapisDoModelu:
    def test_import_tworzy_projekt_z_pelnym_modelem(self, serwis, test_db_session):
        from infrastructure.persistence.models import (
            NetworkBranchORM,
            NetworkLoadORM,
            NetworkNodeORM,
            NetworkSourceORM,
            ProjectORM,
        )

        wynik = serwis.importuj(arkusz_poprawny(), "Sieć z arkusza")
        test_db_session.flush()

        assert wynik.status == "WYMAGA_MAPOWANIA_KATALOGU"
        assert wynik.project_id is not None
        assert wynik.snapshot_id is not None

        from uuid import UUID

        pid = UUID(wynik.project_id)
        projekt = test_db_session.get(ProjectORM, pid)
        assert projekt is not None
        assert projekt.name == "Sieć z arkusza"
        assert projekt.active_network_snapshot_id == wynik.snapshot_id

        wezly = test_db_session.query(NetworkNodeORM).filter_by(project_id=pid).all()
        galezie = test_db_session.query(NetworkBranchORM).filter_by(project_id=pid).all()
        zrodla = test_db_session.query(NetworkSourceORM).filter_by(project_id=pid).all()
        odbiory = test_db_session.query(NetworkLoadORM).filter_by(project_id=pid).all()
        assert len(wezly) == 3
        assert len(galezie) == 2
        assert len(zrodla) == 1
        assert len(odbiory) == 2
        assert zrodla[0].source_type == "GRID"

    def test_import_zapisuje_migawke_zwiazana_z_projektem(self, serwis, test_db_session):
        """Migawka to ta sama dana, którą czyta tor uruchamiania analiz."""
        from infrastructure.persistence.repositories.snapshot_repository import SnapshotRepository

        wynik = serwis.importuj(arkusz_poprawny(), "Sieć z arkusza")
        test_db_session.flush()

        migawka = SnapshotRepository(test_db_session).get_snapshot(wynik.snapshot_id or "")
        assert migawka is not None
        assert migawka.meta.network_model_id == wynik.project_id
        assert migawka.fingerprint == wynik.odcisk_migawki
        assert len(migawka.graph.nodes) == 3
        assert len(migawka.graph.branches) == 2

    def test_odbiory_sumuja_sie_na_wezle_w_konwencji_generatorowej(self, serwis, test_db_session):
        from infrastructure.persistence.repositories.snapshot_repository import SnapshotRepository

        wynik = serwis.importuj(arkusz_poprawny(), "Sieć z arkusza")
        test_db_session.flush()
        migawka = SnapshotRepository(test_db_session).get_snapshot(wynik.snapshot_id or "")
        assert migawka is not None
        wezel_nn = next(n for n in migawka.graph.nodes.values() if n.name == "Stacja 1 nN")
        assert wezel_nn.active_power == pytest.approx(-0.40, rel=1e-6)
        assert wezel_nn.reactive_power == pytest.approx(-0.10, rel=1e-6)

    def test_arkusz_z_bledami_nie_zostawia_zadnego_sladu(self, serwis, test_db_session):
        """Operacja meldująca błąd nie zostawia projektu-kikuta."""
        from infrastructure.persistence.models import NetworkNodeORM, ProjectORM

        projektow_przed = test_db_session.query(ProjectORM).count()
        wezlow_przed = test_db_session.query(NetworkNodeORM).count()

        wynik = serwis.importuj(arkusz_z_bledami_wierszy(), "Nie powstanie")
        test_db_session.flush()

        assert wynik.status == "ODRZUCONO"
        assert wynik.project_id is None
        assert test_db_session.query(ProjectORM).count() == projektow_przed
        assert test_db_session.query(NetworkNodeORM).count() == wezlow_przed

    def test_import_do_bazy_z_zawartoscia_nie_rusza_wczesniejszego_projektu(
        self, serwis, test_db_session
    ):
        """Iloczyn cech: (plik poprawny) × (model z zawartością)."""
        from uuid import UUID

        from infrastructure.persistence.models import NetworkNodeORM

        pierwszy = serwis.importuj(arkusz_poprawny(), "Projekt A")
        test_db_session.flush()
        drugi = serwis.importuj(arkusz_poprawny(), "Projekt B")
        test_db_session.flush()

        assert pierwszy.project_id != drugi.project_id
        assert pierwszy.snapshot_id != drugi.snapshot_id
        for wynik in (pierwszy, drugi):
            liczba = (
                test_db_session.query(NetworkNodeORM)
                .filter_by(project_id=UUID(wynik.project_id or ""))
                .count()
            )
            assert liczba == 3, "import nie może mieszać modeli dwóch projektów"

    def test_podglad_nie_zapisuje_niczego(self, serwis, test_db_session):
        from infrastructure.persistence.models import ProjectORM

        przed = test_db_session.query(ProjectORM).count()
        podglad = serwis.podglad(arkusz_poprawny())
        test_db_session.flush()

        assert podglad.poprawny is True
        assert podglad.podsumowanie is not None
        assert podglad.podsumowanie.szyny == 3
        assert podglad.podsumowanie.odcinki == 1
        assert podglad.podsumowanie.transformatory == 1
        assert podglad.podsumowanie.zrodla == 1
        assert podglad.podsumowanie.odbiory == 2
        assert test_db_session.query(ProjectORM).count() == przed

    def test_podglad_zlego_pliku_zwraca_zastrzezenia_bez_wyjatku(self, serwis):
        podglad = serwis.podglad(arkusz_zly_format())
        assert podglad.poprawny is False
        assert podglad.bledy
        assert podglad.podsumowanie is None

    def test_ten_sam_arkusz_daje_ten_sam_odcisk_tresci(self, serwis, test_db_session):
        """Determinizm treści: identyczne wejście => identyczny odcisk grafu."""
        from infrastructure.persistence.repositories.snapshot_repository import SnapshotRepository

        dane = arkusz_poprawny()
        a = serwis.importuj(dane, "A")
        b = serwis.importuj(dane, "B")
        test_db_session.flush()

        repo = SnapshotRepository(test_db_session)
        graf_a = repo.get_snapshot(a.snapshot_id or "")
        graf_b = repo.get_snapshot(b.snapshot_id or "")
        assert graf_a is not None and graf_b is not None
        # Identyfikatory elementów są nowe dla każdego projektu (osobne modele),
        # więc porównujemy topologię i parametry, nie surowy odcisk.
        assert sorted(n.name for n in graf_a.graph.nodes.values()) == sorted(
            n.name for n in graf_b.graph.nodes.values()
        )
        assert sorted(br.name for br in graf_a.graph.branches.values()) == sorted(
            br.name for br in graf_b.graph.branches.values()
        )


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


class TestZrodloDaneMinITrybPradowy:
    def test_pelne_dane_min_trafiaja_do_payloadu_bez_zmian(self):
        dane = _arkusz_ze_zrodlami(
            _PELNY_NAGLOWEK_ZRODEL,
            [["Z1", "B1", "system", 0.1, 500.0, 19.2, 150.0, 6.0, 0.2]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        payload = wynik.siec.zrodla[0]["payload"]
        assert payload["sk3_mva"] == 500.0
        assert payload["ik3_ka"] == 19.2
        assert payload["sk3_min_mva"] == 150.0
        assert payload["ik3_min_ka"] == 6.0
        assert payload["rx_ratio_min"] == 0.2

    def test_kolumny_min_i_ik_nieobecne_w_arkuszu_nie_zostawiaja_kluczy(self):
        """Arkusz bez kolumn MIN/Ik_kA (jak przed K7) — zero nowych kluczy w payloadzie."""
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "Sk_MVA", "RX_ratio"],
            [["Z1", "B1", "system", 500.0, 0.1]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        payload = wynik.siec.zrodla[0]["payload"]
        assert payload["sk3_mva"] == 500.0
        zakazane = {"sk3_min_mva", "ik3_min_ka", "rx_ratio_min", "ik3_ka"}
        assert not (zakazane & set(payload)), "brak kolumn MIN/Ik_kA => zero kluczy MIN"

    def test_puste_komorki_min_pomijaja_klucz_mimo_obecnej_kolumny(self):
        """Kolumny MIN OBECNE w nagłówku, ale komórki puste — klucz pominięty, nie 0/None."""
        dane = _arkusz_ze_zrodlami(
            _PELNY_NAGLOWEK_ZRODEL,
            [["Z1", "B1", "system", 0.1, 500.0, None, None, None, None]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        payload = wynik.siec.zrodla[0]["payload"]
        assert payload["sk3_mva"] == 500.0
        for pole in ("ik3_ka", "sk3_min_mva", "ik3_min_ka", "rx_ratio_min"):
            assert pole not in payload

    def test_sam_prad_bez_mocy_zwarciowej_jest_trybem_pradowym_policzalnym(self):
        """CV-4.3 K7: samo Ik'' (bez Sk'') jest daną wystarczającą — import się udaje."""
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Ik_kA"],
            [["Z1", "B1", "system", 0.1, 9.6]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True
        assert wynik.siec is not None
        payload = wynik.siec.zrodla[0]["payload"]
        assert payload["ik3_ka"] == 9.6
        assert "sk3_mva" not in payload

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
        assert wynik.siec.zrodla[0]["payload"]["sk3_min_mva"] == 150.0
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
        assert wynik.siec.zrodla[0]["payload"]["rx_ratio_min"] == 0.2
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

    def test_u_pu_trafia_do_payloadu_jako_u_set_pu(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
            [["Z1", "B1", "system", 0.1, 500.0, 1.06]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True and wynik.siec is not None
        assert wynik.siec.zrodla[0]["payload"]["u_set_pu"] == 1.06

    def test_puste_u_pu_nie_zostawia_klucza(self):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
            [["Z1", "B1", "system", 0.1, 500.0, None]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is True and wynik.siec is not None
        assert "u_set_pu" not in wynik.siec.zrodla[0]["payload"]

    @pytest.mark.parametrize("wartosc", [0.0, 0.5, 1.5, -1.0])
    def test_u_pu_poza_pasmem_jest_bledem_wiersza(self, wartosc):
        dane = _arkusz_ze_zrodlami(
            ["id", "szyna", "typ", "RX_ratio", "Sk_MVA", "U_pu"],
            [["Z1", "B1", "system", 0.1, 500.0, wartosc]],
        )
        wynik = XlsxNetworkImporter().import_from_bytes(dane)
        assert wynik.success is False
        assert ("Źródła", "U_pu") in {(b.arkusz, b.kolumna) for b in wynik.bledy}
