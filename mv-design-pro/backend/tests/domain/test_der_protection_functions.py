"""Dobor funkcji zabezpieczeniowych pola wytworcy (karta E21-3, audyt E-21 P7/P8).

Testy pilnuja tego, czego brakowalo stalej liscie 13 kodow: ze zestaw funkcji WYNIKA
z faktow o obiekcie, ze rodziny N i G sie wykluczaja, ze brak danej daje NAZWANA kwestie
otwarta zamiast ciszy, i ze urzadzenie innej strefy nie przechodzi bez slowa.
"""

from __future__ import annotations

import pytest
from domain.der_protection_functions import (
    FaktyPolaWytworcy,
    dobierz_funkcje,
    ocen_urzadzenie,
)


def fakty(**nadpisania) -> FaktyPolaWytworcy:
    baza = {
        "der_id": "DER-1",
        "der_kind": "PV",
        "connection_side": "SN",
        "nominal_power_kw": 1000.0,
        "neutral_grounding_mode": "rezystor",
        "zero_sequence_current_source": "suma_ct",
        "zero_sequence_voltage_source": "otwarty_trojkat_vt",
    }
    baza.update(nadpisania)
    return FaktyPolaWytworcy(**baza)


def kody_otwartych(wynik) -> list[str]:
    return [k.kod for k in wynik.kwestie_otwarte]


class TestPodstawaPola:
    def test_zwarcia_miedzyfazowe_zawsze_wymagane(self) -> None:
        kody = dobierz_funkcje(fakty()).kody()
        assert "50" in kody and "51" in kody

    def test_kazda_funkcja_niesie_UZASADNIENIE_a_nie_sam_kod(self) -> None:
        # Sedno pkt P7: lista kodow bez podstawy, chronionego obiektu i zrodla pomiaru
        # nie jest projektem zabezpieczen.
        for funkcja in dobierz_funkcje(fakty()).wymagane:
            assert funkcja.nazwa_pl.strip()
            assert funkcja.podstawa_pl.strip()
            assert funkcja.chroniony_obiekt_pl.strip()
            assert funkcja.zrodlo_pomiaru_pl.strip()


class TestRodzinaZiemnozwarciowa:
    """50N/51N i 50G/51G to DWA ROZNE tory pomiarowe — nigdy oba naraz."""

    def test_suma_pradow_fazowych_daje_rodzine_N(self) -> None:
        kody = dobierz_funkcje(fakty(zero_sequence_current_source="suma_ct")).kody()
        assert "50N" in kody and "51N" in kody
        assert "50G" not in kody and "51G" not in kody

    def test_przekladnik_ziemnozwarciowy_daje_rodzine_G(self) -> None:
        kody = dobierz_funkcje(fakty(zero_sequence_current_source="przekladnik_ferrantiego")).kody()
        assert "50G" in kody and "51G" in kody
        assert "50N" not in kody and "51N" not in kody

    def test_brak_toru_pradowego_NIE_daje_zadnej_funkcji_ziemnozwarciowej_ale_NAZYWA_powod(
        self,
    ) -> None:
        wynik = dobierz_funkcje(fakty(zero_sequence_current_source="brak"))
        assert not [k for k in wynik.kody() if k.endswith(("N", "G")) and k != "67N"]
        assert "protection.earth_current_source_missing" in kody_otwartych(wynik)

    def test_zrodlo_zewnetrzne_jest_kwestia_otwarta_a_nie_domyslna_rodzina(self) -> None:
        wynik = dobierz_funkcje(fakty(zero_sequence_current_source="zewnetrzne"))
        assert "50N" not in wynik.kody() and "50G" not in wynik.kody()
        assert "protection.earth_current_source_external" in kody_otwartych(wynik)


class TestKierunkowoscZiemnozwarciowa:
    @pytest.mark.parametrize("tryb", ["izolowany", "cewka_petersena"])
    def test_siec_maloparadowa_z_torem_napieciowym_wymaga_67N(self, tryb: str) -> None:
        wynik = dobierz_funkcje(
            fakty(neutral_grounding_mode=tryb, zero_sequence_voltage_source="otwarty_trojkat_vt")
        )
        assert "67N" in wynik.kody()

    @pytest.mark.parametrize("tryb", ["izolowany", "cewka_petersena"])
    def test_bez_toru_napieciowego_67N_NIE_jest_wymagane_tylko_NAZWANE_jako_brak(
        self, tryb: str
    ) -> None:
        # Wymaganie funkcji, ktorej nie da sie zrealizowac, byloby wymaganiem na papierze.
        wynik = dobierz_funkcje(
            fakty(neutral_grounding_mode=tryb, zero_sequence_voltage_source="brak")
        )
        assert "67N" not in wynik.kody()
        assert "protection.zero_sequence_voltage_missing" in kody_otwartych(wynik)

    def test_siec_z_rezystorem_nie_wymusza_kierunkowosci(self) -> None:
        # Kontrola odwrotna: prad doziemny jest wtedy wymuszony i mierzalny nadpradowo.
        assert "67N" not in dobierz_funkcje(fakty(neutral_grounding_mode="rezystor")).kody()

    def test_nieznane_uziemienie_jest_kwestia_otwarta(self) -> None:
        wynik = dobierz_funkcje(fakty(neutral_grounding_mode="nieznany"))
        assert "protection.neutral_grounding_unknown" in kody_otwartych(wynik)


class TestAntiIslanding:
    @pytest.mark.parametrize("strona", ["nN", "at_zksn", "at_branch_pole", "at_cable_joint"])
    def test_pv_po_stronie_nn_i_przylaczen_liniowych(self, strona: str) -> None:
        kody = dobierz_funkcje(fakty(connection_side=strona)).kody()
        assert {"27", "59", "81U", "81O"}.issubset(set(kody))

    def test_magazyn_energii_nie_dostaje_tego_zestawu_automatycznie(self) -> None:
        kody = dobierz_funkcje(fakty(der_kind="BESS", connection_side="nN")).kody()
        assert "81U" not in kody

    def test_wytworca_po_stronie_sn_nie_dostaje_zestawu_anty_wyspowego(self) -> None:
        assert "27" not in dobierz_funkcje(fakty(connection_side="SN")).kody()


class TestRoznicoweTransformatora:
    def test_transformator_dedykowany_powyzej_progu_wymaga_87T(self) -> None:
        kody = dobierz_funkcje(
            fakty(connection_side="dedicated_transformer", nominal_power_kw=2500.0)
        ).kody()
        assert "87T" in kody

    def test_ponizej_progu_87T_nie_jest_wymagane(self) -> None:
        kody = dobierz_funkcje(
            fakty(connection_side="dedicated_transformer", nominal_power_kw=1000.0)
        ).kody()
        assert "87T" not in kody


class TestGranicaWiedzy:
    def test_wymagania_operatora_sa_NAZWANE_jako_niemodelowane(self) -> None:
        # Profile NC RfG nie niosa kodow ANSI, wiec funkcje wymagane decyzja OSD (78)
        # nie moga byc stad wyprowadzone — cisza wygladalaby jak „niewymagane".
        wynik = dobierz_funkcje(fakty())
        assert "78" not in wynik.kody()
        assert "protection.osd_requirements_not_modelled" in kody_otwartych(wynik)


class TestOcenaUrzadzenia:
    def test_urzadzenie_bez_wymaganej_funkcji_ma_JAWNA_liste_brakow(self) -> None:
        ocena = ocen_urzadzenie(["50", "51", "50N", "51N"], ("50", "51"))
        assert ocena.brakujace_funkcje == ["50N", "51N"]
        assert ocena.pokrywa_wymagania is False

    def test_zabezpieczenie_szyn_jako_pole_wytworcy_daje_OSTRZEZENIE_o_przeznaczeniu(
        self,
    ) -> None:
        # Dokladnie przypadek ABB REB670: katalog niesie `87BB`, a walidacja wiazan
        # sprawdzala wylacznie istnienie referencji.
        ocena = ocen_urzadzenie(
            ["50", "51"], ("87BB", "50BF", "50", "51"), nazwa_urzadzenia="ABB Relion REB670"
        )
        assert ocena.pokrywa_wymagania is True  # funkcje ma…
        assert ocena.ostrzezenia_przeznaczenia  # …ale przeznaczenie wymaga potwierdzenia
        assert "87BB" in ocena.ostrzezenia_przeznaczenia[0]
        assert "różnicowe szyn" in ocena.ostrzezenia_przeznaczenia[0]

    def test_brak_funkcji_i_niezgodnosc_przeznaczenia_to_DWA_ROZNE_werdykty(self) -> None:
        ocena = ocen_urzadzenie(["50", "51", "67N"], ("87BB", "50", "51"))
        assert ocena.brakujace_funkcje == ["67N"]
        assert ocena.ostrzezenia_przeznaczenia
        assert ocena.pokrywa_wymagania is False

    def test_aparat_polowy_bez_funkcji_innej_strefy_przechodzi_bez_ostrzezenia(self) -> None:
        ocena = ocen_urzadzenie(["50", "51"], ("50", "51", "51N", "67"))
        assert ocena.ostrzezenia_przeznaczenia == []
        assert ocena.pokrywa_wymagania is True

    def test_brak_wybranego_urzadzenia_to_komplet_brakow_a_nie_zgodnosc(self) -> None:
        ocena = ocen_urzadzenie(["50", "51"], None)
        assert ocena.brakujace_funkcje == ["50", "51"]
        assert ocena.pokrywa_wymagania is False


class TestTrybUziemieniaZModelu:
    """V12K-246: brak danych o punkcie neutralnym to „nieznany", nie domysl."""

    def test_brak_danych_o_neutralnym_daje_nieznany_a_nie_bezposrednie_uziemienie(self) -> None:
        # POMIAR PRZED NAPRAWA: `_resolve_neutral_grounding_mode` zwracalo
        # „bezposrednio_uziemiony", gdy na szynie bylo jakiekolwiek zrodlo, a zaden
        # transformator nie niosl danych o punkcie neutralnym. Obecnosc zrodla NIE MOWI
        # NIC o sposobie uziemienia, a skutek byl najmniej ostrozny z mozliwych: dobor
        # zabezpieczen nie zglaszal potrzeby kryterium kierunkowego, bo w sieci
        # bezposrednio uziemionej prad doziemny jest duzy i mierzalny nadpradowo.
        from application.field_read_model import _resolve_neutral_grounding_mode
        from enm.models import Source

        zrodlo = Source(
            ref_id="src-1",
            name="Zasilanie SN",
            bus_ref="bus-1",
            sk_mva=250.0,
            voltage_kv=15.0,
            model="thevenin",
        )
        assert _resolve_neutral_grounding_mode(sources=[zrodlo], transformers=[]) == "nieznany"
        assert _resolve_neutral_grounding_mode(sources=[], transformers=[]) == "nieznany"

    def test_nieznany_tryb_przechodzi_w_kwestie_otwarta_doboru(self) -> None:
        # Lancuch: model nie wie -> regula NAZYWA brak zamiast wybrac za projektanta.
        wynik = dobierz_funkcje(fakty(neutral_grounding_mode="nieznany"))
        assert "protection.neutral_grounding_unknown" in kody_otwartych(wynik)
        assert "67N" not in wynik.kody()
