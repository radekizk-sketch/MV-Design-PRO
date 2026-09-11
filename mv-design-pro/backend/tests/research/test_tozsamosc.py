"""Tożsamość parametrów, scenariusza i topologii — mechanizm, nie lista klas.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy pilnują trzech twierdzeń, na których stoi cała warstwa dowodowa:

1. **Odcisk parametrów jest REKURENCYJNY.** Zmiana stałej w regulatorze, w pętli
   synchronizacji albo w strategii ogranicznika zmienia tożsamość modelu — mimo
   że żadne z tych pól nie jest skalarem najwyższego poziomu.
2. **Pominięcie pola wymaga DEKLARACJI.** Wartość, której mechanizm nie umie
   zserializować, podnosi wyjątek; pola pominięte są wyliczalne i mają powód.
3. **Odcisk topologii rozróżnia wszystko, co zmienia Ybus.** Dwie topologie o
   różnych macierzach nie mogą mieć tego samego odcisku.
"""

from __future__ import annotations

import dataclasses
import itertools

import numpy as np
import pytest
from dynamic_lab.dowod_walidacji import PunktPracy
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Bocznik, Galaz, TopologiaSieci
from dynamic_lab.tozsamosc import (
    CyklicznaStrukturaError,
    KonfiguracjaSolvera,
    NieserializowalnyParametrError,
    RolaPola,
    TozsamoscScenariusza,
    odcisk,
    odcisk_topologii,
    pole_artefakt,
    postac_kanoniczna,
    spis_pominietych,
)
from dynamic_lab.urzadzenia import (
    FalownikGFM,
    KandydatOgraniczeniaImpedancjaWirtualna,
    KandydatOgraniczeniaNasycenieZadania,
    MaszynaSynchroniczna4Rzedu,
    ZespolSynchroniczny,
)
from dynamic_lab.urzadzenia_oze import (
    MagazynEnergiiBESS,
    MaszynaDwustronnieZasilana3Rzedu,
    PetlaSynchronizacjiPLL,
)

# ---------------------------------------------------------------------------
# A4 — macierz metamorficzna: co MUSI zmienić odcisk, a co NIE MOŻE
# ---------------------------------------------------------------------------


def _zespol(*, k_a: float = 200.0, r_statyzm: float = 0.05) -> ZespolSynchroniczny:
    return ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="B1", h_s=4.0),
        avr=RegulatorNapiecia(k_a=k_a),
        governor=RegulatorTurbiny(r_statyzm=r_statyzm),
    )


def _magazyn(*, pasmo_hz: float = 10.0, priorytet_biernej: bool = False) -> MagazynEnergiiBESS:
    return MagazynEnergiiBESS(
        ref="BESS1",
        szyna="B2",
        e_pojemnosc_mwh=10.0,
        s_bazowa_mva=100.0,
        pll=PetlaSynchronizacjiPLL(pasmo_hz=pasmo_hz),
        priorytet_biernej=priorytet_biernej,
    )


def _gfm(*, k_impedancji_pu: float = 1.0) -> FalownikGFM:
    return FalownikGFM(
        ref="GFM1",
        szyna="B3",
        ogranicznik=KandydatOgraniczeniaImpedancjaWirtualna(
            i_max_pu=1.2, k_impedancji_pu=k_impedancji_pu
        ),
    )


def test_zmiana_stalej_AVR_zmienia_odcisk() -> None:
    """``k_a`` siedzi w zagnieżdżonej dataklasie regulatora, nie w polu skalarnym.

    To jest przypadek, którego płaski odcisk (`SilnikRMS._tozsamosci`: pola
    skalarne + ręczny `getattr(u, "maszyna")`) NIE ŁAPIE: dwa zespoły o różnym
    wzmocnieniu wzbudnicy mają identyczny zestaw skalarów najwyższego poziomu.
    """
    assert odcisk(_zespol(k_a=200.0)) != odcisk(_zespol(k_a=400.0))


def test_zmiana_statyzmu_governora_zmienia_odcisk() -> None:
    """Druga zagnieżdżona dataklasa tego samego zespołu — reguła, nie wyjątek."""
    assert odcisk(_zespol(r_statyzm=0.05)) != odcisk(_zespol(r_statyzm=0.04))


def test_zmiana_pasma_PLL_zmienia_odcisk() -> None:
    """Pętla synchronizacji jest JEDYNYM pomiarem częstotliwości falownika."""
    assert odcisk(_magazyn(pasmo_hz=10.0)) != odcisk(_magazyn(pasmo_hz=20.0))


def test_zmiana_priorytetu_biernej_zmienia_odcisk() -> None:
    """Priorytet prądu przy nasyceniu zmienia zachowanie w zapadzie — to parametr."""
    assert odcisk(_magazyn(priorytet_biernej=False)) != odcisk(_magazyn(priorytet_biernej=True))


def test_zmiana_stalej_ogranicznika_GFM_zmienia_odcisk() -> None:
    """Strategia ogranicznika jest obiektem — i musi wchodzić do odcisku CAŁA."""
    assert odcisk(_gfm(k_impedancji_pu=1.0)) != odcisk(_gfm(k_impedancji_pu=2.0))


def test_podmiana_KLASY_strategii_ogranicznika_zmienia_odcisk() -> None:
    """Dwie różne strategie o tym samym ``i_max_pu`` to dwa różne modele."""
    przez_impedancje = FalownikGFM(
        ref="GFM1",
        szyna="B3",
        ogranicznik=KandydatOgraniczeniaImpedancjaWirtualna(i_max_pu=1.2, k_impedancji_pu=1.0),
    )
    przez_nasycenie = FalownikGFM(
        ref="GFM1",
        szyna="B3",
        ogranicznik=KandydatOgraniczeniaNasycenieZadania(i_max_pu=1.2),
    )
    assert odcisk(przez_impedancje) != odcisk(przez_nasycenie)


def test_wlaczenie_ogranicznika_zmienia_odcisk() -> None:
    """Model z granicą prądu i bez niej to dwa różne modele, nie dwa nastawienia."""
    bez = FalownikGFM(ref="GFM1", szyna="B3")
    z_granica = _gfm()
    assert odcisk(bez) != odcisk(z_granica)


def test_zmiana_samej_etykiety_NIE_zmienia_odcisku() -> None:
    """Kierunek przeciwny — inaczej mechanizm byłby tylko „wszystko zmienia wszystko”.

    ``nazwa`` strategii jest etykietą dla człowieka (zadeklarowane ``pole_opisowe``);
    tożsamość strategii niesie jej KLASA, która w postaci kanonicznej jest.
    """
    a = KandydatOgraniczeniaImpedancjaWirtualna(
        i_max_pu=1.2, k_impedancji_pu=1.0, nazwa="impedancja_wirtualna"
    )
    b = KandydatOgraniczeniaImpedancjaWirtualna(
        i_max_pu=1.2, k_impedancji_pu=1.0, nazwa="inna etykieta tej samej strategii"
    )
    assert odcisk(a) == odcisk(b)


def test_wartosci_wyliczone_przez_inicjalizuj_nie_zmieniaja_tozsamosci_modelu() -> None:
    """Tożsamość modelu nie może zależeć od tego, czy ktoś już wywołał ``inicjalizuj``.

    ``_v_r0``, ``_i_r_zadane`` i ``_t_m`` maszyny dwustronnie zasilanej są
    WYLICZANE z punktu pracy. Gdyby wchodziły do odcisku modelu, ten sam model
    miałby dwie tożsamości — przed i po inicjalizacji — a punkt pracy jest osobną
    osią tożsamości (``TozsamoscScenariusza.punkt_pracy``).
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="DFIG1", szyna="B4")
    przed = odcisk(maszyna)
    maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.4, 0.0))
    assert odcisk(maszyna) == przed
    assert maszyna._v_r0 != 0j, "test nie ćwiczy niczego, jeśli inicjalizacja nic nie policzyła"


def test_zmiana_parametru_fizycznego_DFIG_zmienia_odcisk() -> None:
    """Kontrola dla testu wyżej: pominięcie artefaktów nie znieczuliło odcisku."""
    a = MaszynaDwustronnieZasilana3Rzedu(ref="DFIG1", szyna="B4", x_m_pu=3.0)
    b = MaszynaDwustronnieZasilana3Rzedu(ref="DFIG1", szyna="B4", x_m_pu=3.5)
    assert odcisk(a) != odcisk(b)


def test_odcisk_jest_powtarzalny_miedzy_obiektami() -> None:
    """Determinizm: dwa niezależnie zbudowane, identyczne modele mają ten sam odcisk."""
    assert odcisk(_zespol()) == odcisk(_zespol())
    assert odcisk(_magazyn()) == odcisk(_magazyn())


# ---------------------------------------------------------------------------
# A4 — mechanizm rozstrzygania „parametr czy artefakt”
# ---------------------------------------------------------------------------


def test_nieznany_typ_wartosci_podnosi_wyjatek_zamiast_zniknac() -> None:
    """Ciche pominięcie wartości nieznanego typu czyni odciski FAŁSZYWIE zgodnymi."""

    class WlasnyTyp:
        pass

    @dataclasses.dataclass
    class ModelZNiezadeklarowanymPolem:
        wazny_parametr: float = 1.0
        cos_dziwnego: object = dataclasses.field(default_factory=WlasnyTyp)

    with pytest.raises(NieserializowalnyParametrError, match="postaci kanonicznej"):
        odcisk(ModelZNiezadeklarowanymPolem())


def test_zadeklarowany_artefakt_wychodzi_z_odcisku_i_niesie_powod() -> None:
    """Deklaracja przy polu to jedyna droga wyjścia z tożsamości — z uzasadnieniem."""

    @dataclasses.dataclass
    class ModelZArtefaktem:
        wazny_parametr: float = 1.0
        stan: np.ndarray = pole_artefakt(
            default_factory=lambda: np.zeros(3), powod="stan chwilowy całkowania"
        )

    a = ModelZArtefaktem()
    b = ModelZArtefaktem(stan=np.ones(3))
    assert odcisk(a) == odcisk(b)
    assert odcisk(ModelZArtefaktem(wazny_parametr=2.0)) != odcisk(a)
    assert spis_pominietych(ModelZArtefaktem) == (
        ("stan", RolaPola.ARTEFAKT, "stan chwilowy całkowania"),
    )


def test_deklaracja_pominiecia_bez_powodu_jest_odrzucana() -> None:
    """Powód jest częścią deklaracji — inaczej pominięcie jest nieodróżnialne od przeoczenia."""
    with pytest.raises(ValueError, match="powód jest częścią deklaracji"):
        pole_artefakt(default=0.0, powod="   ")


def test_tablica_numpy_bez_deklaracji_podnosi_wyjatek() -> None:
    """Najczęstszy przypadek: ktoś dokłada wektor stanu i nic o tym nie mówi."""

    @dataclasses.dataclass
    class ModelZTablica:
        stan: np.ndarray = dataclasses.field(default_factory=lambda: np.zeros(2))

    with pytest.raises(NieserializowalnyParametrError):
        odcisk(ModelZTablica())


def test_cykl_w_strukturze_parametrow_jest_wykryty() -> None:
    """Odcisk struktury cyklicznej nie istnieje — lepiej wyjątek niż rekurencja bez dna."""

    @dataclasses.dataclass
    class Wezel:
        dziecko: object = None

    a = Wezel()
    a.dziecko = a
    with pytest.raises(CyklicznaStrukturaError):
        odcisk(a)


def test_ten_sam_obiekt_dwa_razy_w_strukturze_nie_jest_cyklem() -> None:
    """Współdzielona (niekopiowana) nastawa to nie cykl — inaczej wykrywacz byłby fałszywy."""
    wspolna = PetlaSynchronizacjiPLL(pasmo_hz=12.0)

    @dataclasses.dataclass
    class Dwa:
        lewa: PetlaSynchronizacjiPLL
        prawa: PetlaSynchronizacjiPLL

    assert odcisk(Dwa(wspolna, wspolna)) == odcisk(
        Dwa(PetlaSynchronizacjiPLL(pasmo_hz=12.0), PetlaSynchronizacjiPLL(pasmo_hz=12.0))
    )


def test_zbiory_i_mapy_maja_porzadek_deterministyczny() -> None:
    """Kolejność wstawiania nie może wpływać na odcisk zbioru ani mapy."""
    assert odcisk({"b": 1, "a": 2}) == odcisk({"a": 2, "b": 1})
    assert odcisk(frozenset({"x", "y", "z"})) == odcisk(frozenset({"z", "y", "x"}))
    assert odcisk(frozenset({"x", "y"})) != odcisk(frozenset({"x", "z"}))


def test_postac_kanoniczna_nie_gubi_pol_domyslnych() -> None:
    """Pole o wartości domyślnej jest w postaci kanonicznej tak samo jak podane jawnie."""
    postac = postac_kanoniczna(MaszynaSynchroniczna4Rzedu(ref="G", szyna="B", h_s=4.0))
    pola = postac["@pola"]
    nazwy_pol = {
        p.name
        for p in dataclasses.fields(MaszynaSynchroniczna4Rzedu)
        if p.name not in {n for n, _, _ in spis_pominietych(MaszynaSynchroniczna4Rzedu)}
    }
    assert set(pola) == nazwy_pol


def test_odcisk_niesie_KLASE_obiektu() -> None:
    """Dwie różne klasy o identycznych polach to dwa różne modele."""

    @dataclasses.dataclass
    class Pierwsza:
        x: float = 1.0

    @dataclasses.dataclass
    class Druga:
        x: float = 1.0

    assert odcisk(Pierwsza()) != odcisk(Druga())


def test_inwentarz_pominiec_w_laboratorium_jest_ZAMKNIETY() -> None:
    """Spis pól wyłączonych z tożsamości MODELU — lista ZAMKNIĘTA, pilnowana testem.

    Nowe wyłączenie musi być świadome: jeżeli ten test zaświeci, ktoś właśnie
    wyprowadził pole poza tożsamość modelu. Każde wyłączenie ma tu powód i musi
    dać się obronić — deklaracja bez przypiętego sprawdzenia byłaby obietnicą,
    nie mechanizmem.

    AKTUALIZACJA (§5 audytu rundy 3, 2026-09-11): doszła trzecia rola,
    ``NASTAWA_PUNKTU_PRACY``, i to jest zmiana KANONU, nie rozluźnienie listy.
    Nastawa (``V_ref`` wzbudnicy, ``P_zadane`` elektrowni, ``E_ref`` falownika)
    jest wyliczana przez ``inicjalizuj`` z rozpływu, więc wpisana do tożsamości
    MODELU sprawiała, że sama czynność uruchomienia zmieniała model — zmierzone
    przed naprawą: 5 z 6 klas urządzeń zmieniało swój odcisk po ``inicjalizuj``.

    Wyłączenie nastawy z modelu NIE jest jej zniknięciem: ta sama deklaracja
    przy polu wprowadza ją do tożsamości BIEGU (`silnik` czyta wartości
    OBOWIĄZUJĄCE w chwili startu). Rozróżnienie ról jest więc tu sprawdzane
    ŁĄCZNIE z rolą — pole przeniesione z ``NASTAWA_PUNKTU_PRACY`` na ``ARTEFAKT``
    zaświeci ten test, bo wypadłoby wtedy z OBU tożsamości.
    """
    oczekiwane = {
        # ARTEFAKT — stan chwilowy albo pole robocze: poza modelem i poza biegiem,
        # bo stan jest już opisany wektorem `x0`.
        ("FalownikGFM", "tozsamosc_ogranicznika", RolaPola.ARTEFAKT),
        ("OdbiorStalejMocy", "_stan", RolaPola.ARTEFAKT),
        # OPIS — etykieta dla człowieka, nie wchodzi do żadnego równania.
        ("KandydatOgraniczeniaImpedancjaWirtualna", "nazwa", RolaPola.OPIS),
        ("KandydatOgraniczeniaNasycenieZadania", "nazwa", RolaPola.OPIS),
        # NASTAWA_PUNKTU_PRACY — wyliczana z rozpływu: poza modelem, W BIEGU.
        ("ZespolSynchroniczny", "_efd_stale", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("ZespolSynchroniczny", "_pm_stale", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("RegulatorNapiecia", "v_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("RegulatorTurbiny", "p_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFL", "p_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFL", "q_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFL", "v_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFM", "p_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFM", "q_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("FalownikGFM", "e_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("MagazynEnergiiBESS", "p_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("MagazynEnergiiBESS", "q_ref_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("RegulatorElektrowniPPC", "p_zadane_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("RegulatorElektrowniPPC", "q_zadane_pu", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("MaszynaDwustronnieZasilana3Rzedu", "_v_r0", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("MaszynaDwustronnieZasilana3Rzedu", "_i_r_zadane", RolaPola.NASTAWA_PUNKTU_PRACY),
        ("MaszynaDwustronnieZasilana3Rzedu", "_t_m", RolaPola.NASTAWA_PUNKTU_PRACY),
    }
    import dynamic_lab.regulatory as modul_regulatory
    import dynamic_lab.siec as modul_siec
    import dynamic_lab.urzadzenia as modul_urzadzenia
    import dynamic_lab.urzadzenia_oze as modul_oze

    znalezione: set[tuple[str, str, RolaPola]] = set()
    for modul in (modul_urzadzenia, modul_oze, modul_regulatory, modul_siec):
        for nazwa_klasy, obiekt in vars(modul).items():
            if not dataclasses.is_dataclass(obiekt) or not isinstance(obiekt, type):
                continue
            if obiekt.__module__ != modul.__name__:
                continue
            for pole, rola, powod in spis_pominietych(obiekt):
                assert powod.strip(), f"{nazwa_klasy}.{pole}: pominięcie bez powodu"
                znalezione.add((nazwa_klasy, pole, rola))
    assert znalezione == oczekiwane


# ---------------------------------------------------------------------------
# A5 — tożsamość scenariusza
# ---------------------------------------------------------------------------

KONFIGURACJA = KonfiguracjaSolvera(
    integrator="trapez_niejawny",
    krok_s=0.005,
    tolerancja_sieci=1.0e-12,
    tolerancja_rownowagi=1.0e-6,
    maks_iteracji_sieci=40,
)
PUNKT = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")


def _scenariusz(**nadpisania: object) -> TozsamoscScenariusza:
    dane: dict[str, object] = {
        "odcisk_migawki": "migawka-a",
        "punkt_pracy": PUNKT,
        "konfiguracja": KONFIGURACJA,
        "czas_koncowy_s": 2.0,
        "harmonogram": (),
        "parametry": {"czas_trwania_zwarcia_s": 0.12},
    }
    dane.update(nadpisania)
    return TozsamoscScenariusza(**dane)  # type: ignore[arg-type]


def test_scenariusz_bez_odcisku_migawki_jest_odrzucany() -> None:
    """„Ten sam scenariusz” na innej sieci to inny scenariusz — migawka jest obowiązkowa."""
    with pytest.raises(ValueError, match="odcisku migawki"):
        _scenariusz(odcisk_migawki="  ")


@pytest.mark.parametrize(
    ("nadpisanie", "opis"),
    [
        ({"odcisk_migawki": "migawka-b"}, "inna migawka wejściowa"),
        ({"punkt_pracy": PunktPracy(napiecie_pu=0.95, moc_pu=0.5, scr=10.0)}, "inny punkt pracy"),
        (
            {"konfiguracja": dataclasses.replace(KONFIGURACJA, krok_s=0.001)},
            "inny krok całkowania",
        ),
        (
            {"konfiguracja": dataclasses.replace(KONFIGURACJA, integrator="rk4")},
            "inny integrator",
        ),
        (
            {"konfiguracja": dataclasses.replace(KONFIGURACJA, tolerancja_sieci=1.0e-9)},
            "inna tolerancja algebry sieci",
        ),
        ({"czas_koncowy_s": 5.0}, "inny czas końcowy"),
        ({"parametry": {"czas_trwania_zwarcia_s": 0.20}}, "inna wartość parametru scenariusza"),
    ],
)
def test_kazda_os_scenariusza_zmienia_odcisk(nadpisanie: dict[str, object], opis: str) -> None:
    """Odcisk „integrator + dt + zdarzenia” nie rozróżnia migawki ani punktu pracy."""
    assert _scenariusz().odcisk != _scenariusz(**nadpisanie).odcisk, opis


def test_harmonogram_wchodzi_do_odciska_scenariusza() -> None:
    """Zdarzenia są dataklasami — wchodzą do odcisku bez dopisywania gałęzi per typ."""
    from dynamic_lab.zdarzenia import ZwarcieTrojfazowe

    wczesne = _scenariusz(harmonogram=(ZwarcieTrojfazowe(czas_s=0.1, szyna="B1"),))
    pozne = _scenariusz(harmonogram=(ZwarcieTrojfazowe(czas_s=0.2, szyna="B1"),))
    gdzie_indziej = _scenariusz(harmonogram=(ZwarcieTrojfazowe(czas_s=0.1, szyna="B2"),))
    assert len({wczesne.odcisk, pozne.odcisk, gdzie_indziej.odcisk, _scenariusz().odcisk}) == 4


def test_odcisk_scenariusza_jest_powtarzalny() -> None:
    assert _scenariusz().odcisk == _scenariusz().odcisk


# ---------------------------------------------------------------------------
# A6 — odcisk topologii vs Ybus
# ---------------------------------------------------------------------------


def _baza() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("A", "B", "C"),
        galezie=[
            Galaz("A", "B", r_pu=0.01, x_pu=0.10),
            Galaz("B", "C", r_pu=0.02, x_pu=0.20, b_poprzeczna_pu=0.04),
        ],
        boczniki=[Bocznik("C", b_pu=0.05)],
        szyny_sztywne={"A": complex(1.0, 0.0)},
    )


def _warianty() -> list[tuple[str, TopologiaSieci, float]]:
    """Warianty topologii: każdy różni się JEDNĄ wielkością od bazy."""
    baza = _baza()
    warianty: list[tuple[str, TopologiaSieci, float]] = [("baza", baza, 100.0)]

    def z_galeziami(nazwa: str, galezie: list[Galaz]) -> None:
        warianty.append((nazwa, dataclasses.replace(baza, galezie=galezie), 100.0))

    z_galeziami(
        "inna_rezystancja",
        [dataclasses.replace(baza.galezie[0], r_pu=0.02), baza.galezie[1]],
    )
    z_galeziami(
        "inna_reaktancja",
        [dataclasses.replace(baza.galezie[0], x_pu=0.11), baza.galezie[1]],
    )
    z_galeziami(
        "inna_susceptancja_poprzeczna",
        [baza.galezie[0], dataclasses.replace(baza.galezie[1], b_poprzeczna_pu=0.08)],
    )
    z_galeziami(
        "galaz_wylaczona",
        [dataclasses.replace(baza.galezie[0], zalaczona=False), baza.galezie[1]],
    )
    z_galeziami("galaz_usunieta", [baza.galezie[1]])
    z_galeziami(
        "galaz_dodana",
        [*baza.galezie, Galaz("A", "C", r_pu=0.03, x_pu=0.30)],
    )
    warianty.append(
        (
            "bocznik_inna_susceptancja",
            dataclasses.replace(baza, boczniki=[Bocznik("C", b_pu=0.09)]),
            100.0,
        )
    )
    warianty.append(
        (
            "bocznik_konduktancja",
            dataclasses.replace(baza, boczniki=[Bocznik("C", g_pu=0.5, b_pu=0.05)]),
            100.0,
        )
    )
    warianty.append(("bocznik_usuniety", dataclasses.replace(baza, boczniki=[]), 100.0))
    warianty.append(
        (
            "bocznik_na_innej_szynie",
            dataclasses.replace(baza, boczniki=[Bocznik("B", b_pu=0.05)]),
            100.0,
        )
    )
    warianty.append(
        ("inna_kolejnosc_szyn", dataclasses.replace(baza, szyny=("B", "A", "C")), 100.0)
    )
    warianty.append(
        (
            "szyna_dodana",
            dataclasses.replace(baza, szyny=("A", "B", "C", "D")),
            100.0,
        )
    )
    warianty.append(
        (
            "inna_wartosc_szyny_sztywnej",
            dataclasses.replace(baza, szyny_sztywne={"A": complex(1.05, 0.0)}),
            100.0,
        )
    )
    warianty.append(
        (
            "inna_szyna_sztywna",
            dataclasses.replace(baza, szyny_sztywne={"B": complex(1.0, 0.0)}),
            100.0,
        )
    )
    warianty.append(("inna_baza_mocy", baza, 250.0))
    return warianty


def test_rozne_ybus_nie_moga_miec_tego_samego_odcisku() -> None:
    """INWARIANT A6: różna macierz sieci ⇒ różny odcisk topologii.

    Sprawdzane na WSZYSTKICH parach wariantów, nie na jednym przykładzie z karty:
    defekt tego rodzaju chowa się dokładnie w wymiarze, którego nikt nie wypisał
    (poprzedni odcisk w `silnik.py` brał szyny i gałęzie, a pomijał boczniki,
    szyny sztywne i bazę mocy).
    """
    warianty = _warianty()
    macierze = {nazwa: top.zbuduj_ybus() for nazwa, top, _ in warianty}
    odciski = {nazwa: odcisk_topologii(top, s_bazowa_mva=baza) for nazwa, top, baza in warianty}
    for (nazwa_a, _, _), (nazwa_b, _, _) in itertools.combinations(warianty, 2):
        ybus_a, ybus_b = macierze[nazwa_a], macierze[nazwa_b]
        rozne_ybus = ybus_a.shape != ybus_b.shape or not np.array_equal(ybus_a, ybus_b)
        if rozne_ybus:
            assert odciski[nazwa_a] != odciski[nazwa_b], (
                f"`{nazwa_a}` i `{nazwa_b}` dają RÓŻNE macierze Ybus, a ten sam odcisk "
                "topologii — odcisk nie rozróżnia wielkości, która zmienia fizykę"
            )


def test_warianty_naprawde_rozniaja_ybus() -> None:
    """Kontrola sensu testu wyżej: gdyby wszystkie Ybus były równe, nie sprawdzałby nic."""
    warianty = _warianty()
    macierze = [top.zbuduj_ybus() for _, top, _ in warianty]
    rozne = sum(
        1
        for a, b in itertools.combinations(macierze, 2)
        if a.shape != b.shape or not np.array_equal(a, b)
    )
    assert rozne >= 90, f"za mało par o różnych Ybus ({rozne}) — test A6 byłby pusty"


def test_wartosc_szyny_sztywnej_zmienia_odcisk_choc_nie_zmienia_ybus() -> None:
    """Kierunek odwrotny NIE obowiązuje — i tak ma być.

    Napięcie szyny sztywnej nie wchodzi do Ybus, ale rozstrzyga o rozwiązaniu.
    Odcisk, który go nie widzi, pozwoliłby podstawić wynik z innej sieci nadrzędnej.
    """
    baza = _baza()
    inna = dataclasses.replace(baza, szyny_sztywne={"A": complex(1.05, 0.0)})
    assert np.array_equal(baza.zbuduj_ybus(), inna.zbuduj_ybus())
    assert odcisk_topologii(baza, s_bazowa_mva=100.0) != odcisk_topologii(inna, s_bazowa_mva=100.0)


def test_baza_mocy_zmienia_odcisk_topologii() -> None:
    """p.u. bez bazy nie ma znaczenia fizycznego — baza jest częścią tożsamości."""
    baza = _baza()
    assert odcisk_topologii(baza, s_bazowa_mva=100.0) != odcisk_topologii(baza, s_bazowa_mva=250.0)


def test_odcisk_topologii_jest_powtarzalny() -> None:
    assert odcisk_topologii(_baza(), s_bazowa_mva=100.0) == odcisk_topologii(
        _baza(), s_bazowa_mva=100.0
    )


def test_odcisk_topologii_wymaga_dodatniej_bazy() -> None:
    with pytest.raises(ValueError, match="s_bazowa_mva"):
        odcisk_topologii(_baza(), s_bazowa_mva=0.0)
