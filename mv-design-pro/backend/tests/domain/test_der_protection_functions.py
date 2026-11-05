"""Dobor funkcji zabezpieczeniowych pola wytworcy (karta E21-3, audyt E-21 P7/P8).

Testy pilnuja tego, czego brakowalo stalej liscie 13 kodow: ze zestaw funkcji WYNIKA
z faktow o obiekcie, ze rodziny N i G sie wykluczaja, ze brak danej daje NAZWANA kwestie
otwarta zamiast ciszy, i ze urzadzenie innej strefy nie przechodzi bez slowa.
"""

from __future__ import annotations

import pytest
from domain.der_protection_functions import (
    BRAK_PODSTAWY_PROGU_87T_PL,
    PROG_WYMAGANIA_87T,
    FaktyPolaWytworcy,
    dobierz_funkcje,
    ocen_prog_87t,
    ocen_urzadzenie,
)
from werdykt.kontrakt import LimitKryterium, PodstawaWymagania, Wielkosc


def fakty(**nadpisania) -> FaktyPolaWytworcy:
    baza = {
        "der_id": "DER-1",
        "der_nazwa": "Farma PV Łąkowa",
        "der_kind": "PV",
        "connection_side": "SN",
        "nominal_power_kw": 1000.0,
        "neutral_grounding_mode": "resistor_grounded",
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
    @pytest.mark.parametrize("tryb", ["isolated", "petersen_coil"])
    def test_siec_maloparadowa_z_torem_napieciowym_wymaga_67N(self, tryb: str) -> None:
        wynik = dobierz_funkcje(
            fakty(neutral_grounding_mode=tryb, zero_sequence_voltage_source="otwarty_trojkat_vt")
        )
        assert "67N" in wynik.kody()

    @pytest.mark.parametrize("tryb", ["isolated", "petersen_coil"])
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
        assert (
            "67N" not in dobierz_funkcje(fakty(neutral_grounding_mode="resistor_grounded")).kody()
        )

    def test_nieznane_uziemienie_jest_kwestia_otwarta(self) -> None:
        wynik = dobierz_funkcje(fakty(neutral_grounding_mode=None))
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


#: Rekord limitu Z PODSTAWĄ — wyłącznie do ćwiczenia gałęzi „podstawa jest" predykatu. W repo
#: podstawy progu 87T nie ma (`PROG_WYMAGANIA_87T is None`), więc ta wartość NIE jest progiem
#: produktu; to dana testu (dokument i jednostka redakcyjna są jawnie testowe).
PROG_TESTOWY_KVA = 1600.0


def _prog_z_podstawa(wartosc_kva: float = PROG_TESTOWY_KVA) -> LimitKryterium:
    return LimitKryterium(
        wartosc=Wielkosc(wartosc=wartosc_kva, jednostka="kVA"),
        podstawa=PodstawaWymagania(
            rodzaj="OSD",
            dokument="Warunki przyłączenia — dokument testowy",
            wydanie="wydanie testowe",
            jednostka_redakcyjna="pkt 4.2 (test)",
            status="WSKAZANE",
        ),
    )


class TestRoznicoweTransformatora:
    """Iloczyn cech: S_n {poniżej, równe, powyżej progu} × podstawa {jest, brak} × moc
    źródła RÓŻNA od S_n (źródło po przeciwnej stronie progu niż transformator — gdyby
    predykat porównywał moc źródła, wynik by się odwrócił)."""

    @pytest.mark.parametrize(
        ("sn_kva", "moc_zrodla_kw", "oczekiwany"),
        [
            (PROG_TESTOWY_KVA - 1.0, 5000.0, "NIE_DOTYCZY"),
            (PROG_TESTOWY_KVA, 400.0, "SPELNIA"),
            (PROG_TESTOWY_KVA + 900.0, 400.0, "SPELNIA"),
        ],
    )
    def test_podstawa_jest_rozstrzyga_s_n_transformatora(
        self, sn_kva: float, moc_zrodla_kw: float, oczekiwany: str
    ) -> None:
        wynik = dobierz_funkcje(
            fakty(
                connection_side="dedicated_transformer",
                nominal_power_kw=moc_zrodla_kw,
                sn_transformatora_dedykowanego_kva=sn_kva,
            ),
            prog_87t=_prog_z_podstawa(),
        )
        (ocena,) = wynik.oceny_progow
        assert ocena.status_maszynowy == oczekiwany
        assert ocena.wartosc is not None and ocena.wartosc.wartosc == sn_kva
        assert ocena.wartosc.jednostka == "kVA"
        assert ocena.limit is not None
        assert ocena.limit.podstawa.jednostka_redakcyjna == "pkt 4.2 (test)"
        assert ocena.wyjasnienie_pl.strip()
        assert ("87T" in wynik.kody()) is (oczekiwany == "SPELNIA")
        if oczekiwany == "SPELNIA":
            funkcja = next(f for f in wynik.wymagane if f.kod == "87T")
            assert "Warunki przyłączenia — dokument testowy" in funkcja.podstawa_pl
        assert "protection.87t_threshold_no_basis" not in kody_otwartych(wynik)

    @pytest.mark.parametrize("sn_kva", [PROG_TESTOWY_KVA - 1.0, PROG_TESTOWY_KVA, 2500.0, None])
    @pytest.mark.parametrize("moc_zrodla_kw", [400.0, 5000.0])
    def test_podstawa_brak_daje_brak_podstawy_z_wyjasnieniem(
        self, sn_kva: float | None, moc_zrodla_kw: float
    ) -> None:
        wynik = dobierz_funkcje(
            fakty(
                connection_side="dedicated_transformer",
                nominal_power_kw=moc_zrodla_kw,
                sn_transformatora_dedykowanego_kva=sn_kva,
            )
        )
        (ocena,) = wynik.oceny_progow
        assert ocena.status_maszynowy == "BRAK_PODSTAWY"
        assert ocena.limit is None
        assert BRAK_PODSTAWY_PROGU_87T_PL.lower() in ocena.wyjasnienie_pl.lower()
        assert "87T" not in wynik.kody()
        kwestia = next(
            k for k in wynik.kwestie_otwarte if k.kod == "protection.87t_threshold_no_basis"
        )
        assert BRAK_PODSTAWY_PROGU_87T_PL.lower() in kwestia.opis_pl.lower()
        assert wynik.to_dict()["oceny_progow"][0]["status_maszynowy"] == "BRAK_PODSTAWY"

    def test_produkt_nie_ma_progu_87t_bez_podstawy(self) -> None:
        # Deklaracja modułu („podstawy nie ma") przypięta: liczba bez źródła nie wraca.
        assert PROG_WYMAGANIA_87T is None

    def test_podstawa_jest_bez_s_n_w_modelu_nie_oceniono(self) -> None:
        wynik = dobierz_funkcje(
            fakty(connection_side="dedicated_transformer", nominal_power_kw=5000.0),
            prog_87t=_prog_z_podstawa(),
        )
        (ocena,) = wynik.oceny_progow
        assert ocena.status_maszynowy == "NIE_OCENIONO"
        assert "protection.87t_transformer_rating_missing" in kody_otwartych(wynik)
        assert "87T" not in wynik.kody()

    @pytest.mark.parametrize("strona", ["SN", "nN", "at_zksn"])
    def test_bez_transformatora_dedykowanego_nie_ma_oceny_87t(self, strona: str) -> None:
        wynik = dobierz_funkcje(
            fakty(connection_side=strona, sn_transformatora_dedykowanego_kva=2500.0),
            prog_87t=_prog_z_podstawa(),
        )
        assert wynik.oceny_progow == []
        assert "87T" not in wynik.kody()

    def test_prog_w_innej_jednostce_jest_odrzucony(self) -> None:
        prog = LimitKryterium(
            wartosc=Wielkosc(wartosc=1.6, jednostka="MVA"),
            podstawa=_prog_z_podstawa().podstawa,
        )
        with pytest.raises(ValueError, match="kVA"):
            ocen_prog_87t(2500.0, prog)


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
    """V12K-246 / W5-A: brak danych o punkcie neutralnym to ``None`` (nie literał „nieznany"
    ani domysł) — jeden słownik `GroundingConfig.type`, brak nazwany wprost."""

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
        assert _resolve_neutral_grounding_mode(sources=[zrodlo], transformers=[]) is None
        assert _resolve_neutral_grounding_mode(sources=[], transformers=[]) is None

    def test_nieznany_tryb_przechodzi_w_kwestie_otwarta_doboru(self) -> None:
        # Lancuch: model nie wie -> regula NAZYWA brak zamiast wybrac za projektanta.
        wynik = dobierz_funkcje(fakty(neutral_grounding_mode=None))
        assert "protection.neutral_grounding_unknown" in kody_otwartych(wynik)
        assert "67N" not in wynik.kody()


class TestEtykietaChronionegoObiektu:
    """Chroniony obiekt opisany NAZWĄ wytwórcy, nie referencją modelu.

    Dyrektywa właściciela: metadane implementacyjne (identyfikatory, hashe) nie
    wychodzą na pierwszy plan ekranu projektanta. Referencje modelu budowanego
    operacjami domenowymi wyglądają jak `pv/cf52e8ef…/converter` — w opisie
    funkcji zabezpieczeniowej to szum, a nie informacja."""

    def test_etykieta_uzywa_nazwy_wytworcy(self) -> None:
        wynik = dobierz_funkcje(fakty(der_nazwa="Farma PV 1 MW"))
        assert wynik.wymagane
        for funkcja in wynik.wymagane:
            assert "Farma PV 1 MW" in funkcja.chroniony_obiekt_pl
            assert "DER-1" not in funkcja.chroniony_obiekt_pl

    def test_bez_nazwy_opis_rodzaju_nigdy_referencja(self) -> None:
        """Karta #144 (zmiana kanonu): dawniej wytwórca bez nazwy dawał etykietę
        z REFERENCJĄ („uczciwiej pokazać identyfikator"). Rozstrzygnięcie karty: brak
        nazwy to polski opis rodzaju od wołającego (`nazwa_elementu` — „Generator bez
        nazwy"), identyfikator nigdy nie trafia do opisu chronionego obiektu."""
        wynik = dobierz_funkcje(fakty(der_nazwa="Generator bez nazwy"))
        assert wynik.wymagane
        for funkcja in wynik.wymagane:
            assert funkcja.chroniony_obiekt_pl == "pole wytwórcy Generator bez nazwy"
            assert "DER-1" not in funkcja.chroniony_obiekt_pl
