"""V12K-239: rodzaj rdzenia i ALF przekładnika wyprowadzone W KATALOGU, nie na froncie.

DLACZEGO. Reguła normowa IEC 61869-2 („klasa z literą P ⇒ rdzeń zabezpieczeniowy") żyła
wyłącznie w warstwie prezentacji (`frontend/.../ctZKatalogu.ts`, V12K-233), a katalog
referencyjny tej danej NIE WYSTAWIAŁ — mimo że jest ona własnością TYPU, nie ekranu.
Skutek: norma w warstwie prezentacji plus brak pola w kontrakcie katalogu, czyli dokładnie
ten rodzaj równoległej ścieżki, którą zamknęło V12K-232 dla samej klasy.

Wartości sprawdzane NIEZALEŻNYM RACHUNKIEM z oznaczenia: dla klasy ⟨błąd⟩P⟨ALF⟩ liczba po
literze P jest znamionową graniczną liczbą dokładności (IEC 61869-2 § 3.4.201), więc
5P10 ⇒ 10, 5P20 ⇒ 20, 10P10 ⇒ 10 — bez odwołania do implementacji.
"""

from __future__ import annotations

import pytest
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.types import CTType, alf_ct_z_klasy, rdzen_ct_z_klasy


class TestRdzenZKlasy:
    @pytest.mark.parametrize("klasa", ["5P10", "5P20", "10P10", "10P20", "5p20"])
    def test_klasa_z_litera_P_to_rdzen_zabezpieczeniowy(self, klasa: str) -> None:
        assert rdzen_ct_z_klasy(klasa) == "protection"

    @pytest.mark.parametrize("klasa", ["0.2", "0.5", "1.0", "3", "5", " 0,5 "])
    def test_klasa_liczbowa_to_rdzen_pomiarowy(self, klasa: str) -> None:
        assert rdzen_ct_z_klasy(klasa) == "metering"

    def test_zapis_zlozony_NIE_daje_rdzenia_podwojnego_ani_zadnego(self) -> None:
        # Kontrola granicy: „5P10/0,5" opisuje DWA rdzenie, czyli konstrukcję. Bez danej
        # producenta o rdzeniach nie wolno tego rozstrzygnąć w żadną stronę — ani na
        # „dual" (fabrykacja konstrukcji), ani na „protection" (zgubienie drugiego rdzenia).
        assert rdzen_ct_z_klasy("5P10/0.5") is None
        assert rdzen_ct_z_klasy("5P10/0,5") is None

    @pytest.mark.parametrize("klasa", [None, "", "   ", "klasa-nieznana", "PS"])
    def test_brak_albo_nierozpoznana_klasa_daje_None(self, klasa: str | None) -> None:
        # „PS" ma literę P, ale nie jest klasą ⟨błąd⟩P⟨ALF⟩ — rdzeń rozpoznany
        # (zabezpieczeniowy), natomiast ALF nierozstrzygalny; patrz test niżej.
        wynik = rdzen_ct_z_klasy(klasa)
        assert wynik in (None, "protection")
        if klasa in (None, "", "   ", "klasa-nieznana"):
            assert wynik is None

    def test_nigdy_nie_zwraca_dual_dla_zadnej_klasy_kanonu(self) -> None:
        for klasa in ["0.2", "0.5", "1.0", "5P10", "5P20", "10P10", "10P20"]:
            assert rdzen_ct_z_klasy(klasa) != "dual"


class TestAlfZKlasy:
    @pytest.mark.parametrize(
        ("klasa", "alf"),
        [("5P10", 10.0), ("5P20", 20.0), ("10P10", 10.0), ("10P20", 20.0), ("5P30", 30.0)],
    )
    def test_alf_to_liczba_po_literze_P(self, klasa: str, alf: float) -> None:
        # Rachunek niezależny: odczyt oznaczenia wg IEC 61869-2 § 3.4.201.
        assert alf_ct_z_klasy(klasa) == alf

    @pytest.mark.parametrize("klasa", ["0.2", "0.5", "1.0"])
    def test_rdzen_pomiarowy_nie_ma_ALF(self, klasa: str) -> None:
        # Rdzeń pomiarowy ma współczynnik bezpieczeństwa przyrządowego F_s — osobną daną
        # znamionową producenta, która NIE wynika z klasy. Nie wolno jej udawać ALF-em.
        assert alf_ct_z_klasy(klasa) is None

    def test_klasa_z_P_bez_liczby_daje_None(self) -> None:
        assert alf_ct_z_klasy("PS") is None
        assert alf_ct_z_klasy("5P") is None


class TestKatalogReferencyjny:
    def test_kazdy_typ_wystawia_rodzaj_rdzenia(self) -> None:
        typy = get_default_mv_catalog().list_ct_types()
        assert len(typy) == 12  # pełny inwentarz katalogu referencyjnego (pomiar)

        for typ in typy:
            d = typ.to_dict()
            assert "application" in d
            assert "accuracy_limit_factor" in d
            assert d["application"] in ("protection", "metering")

    def test_rozklad_rdzeni_w_katalogu_referencyjnym(self) -> None:
        # POMIAR: 9 rdzeni zabezpieczeniowych (2× 5P10, 6× 5P20, 1× 10P10) i 3 pomiarowe
        # (3× 0.5). Liczba ma znaczenie inżynierskie: to WSZYSTKIE typy, na których może
        # dziś stanąć oś zabezpieczeń.
        typy = [t.to_dict() for t in get_default_mv_catalog().list_ct_types()]
        zabezpieczeniowe = [t for t in typy if t["application"] == "protection"]
        pomiarowe = [t for t in typy if t["application"] == "metering"]

        assert len(zabezpieczeniowe) == 9
        assert len(pomiarowe) == 3
        assert all(t["accuracy_limit_factor"] is not None for t in zabezpieczeniowe)
        assert all(t["accuracy_limit_factor"] is None for t in pomiarowe)

    def test_ZADEN_typ_katalogu_nie_jest_dwurdzeniowy(self) -> None:
        # Warunek 87T (IEC 60255-13, transformator dedykowany ≥ 1,6 MVA) wymaga
        # przekładnika DWURDZENIOWEGO. Katalog referencyjny takiego typu NIE MA i nie
        # wolno go dopisać z domysłu — to dana konstrukcyjna producenta. Ten test pilnuje
        # granicy: dopóki jest zielony, warunek 87T pozostaje nierozstrzygalny UCZCIWIE,
        # a nie dlatego, że ktoś zapomniał wypełnić pole.
        typy = [t.to_dict() for t in get_default_mv_catalog().list_ct_types()]
        assert all(t["application"] != "dual" for t in typy)

    def test_dana_wystawiona_dla_typu_uzywanego_w_regule_gotowosci(self) -> None:
        # Ten konkretny typ jest w testach osi zabezpieczeń (V12K-233) — łańcuch
        # katalog → dana → werdykt musi być zamknięty właśnie dla niego.
        typ = get_default_mv_catalog().get_ct_type("ct_200_5_5p10_10va_abb")
        assert typ is not None
        d = typ.to_dict()
        assert d["accuracy_class"] == "5P10"
        assert d["application"] == "protection"
        assert d["accuracy_limit_factor"] == 10.0


class TestKontraktTypu:
    def test_typ_bez_klasy_nie_dostaje_rdzenia_z_powietrza(self) -> None:
        typ = CTType(id="ct_bez_klasy", name="CT bez klasy", ratio_primary_a=300.0)
        d = typ.to_dict()

        assert d["accuracy_class"] is None
        assert d["application"] is None
        assert d["accuracy_limit_factor"] is None
