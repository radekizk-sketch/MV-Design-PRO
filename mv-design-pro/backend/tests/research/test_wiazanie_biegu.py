"""§9 i §10 audytu — czy dowód da się związać z biegiem, którego nie widział.

KOD BADAWCZY — patrz `backend/research/README.md`.
"""

from __future__ import annotations

import dataclasses

import numpy as np
import pytest
from dynamic_lab.benchmarki import harmonogram_zwarcia, smib
from dynamic_lab.pomiar_zgodnosci import RodzajMetryki, zmierz_zgodnosc, zmierz_zgodnosc_zwiazana
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.tozsamosc import TozsamoscScenariusza
from dynamic_lab.wiazanie_biegu import (
    NiezgodnaProweniencjaError,
    PrzebiegZwiazany,
    TozsamoscBiegu,
    przebieg_z_biegu,
    zdarzenie_w_biegu,
)
from dynamic_lab.wynik import (
    NiespojnaTozsamoscScenariuszaError,
    PrzestrzenSygnalu,
    WynikDynamiczny,
)
from dynamic_lab.wzorzec_trajektoria import Przebieg


def _bieg(x_f_pu: float = 0.2, chwila_s: float = 0.3) -> WynikDynamiczny:
    model, moce = smib()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    return silnik.symuluj(
        silnik.inicjalizuj(moce),
        czas_koncowy_s=1.0,
        harmonogram=harmonogram_zwarcia(
            szyna="GEN", chwila_s=chwila_s, czas_trwania_s=0.1, x_f_pu=x_f_pu
        ),
    )


def _scenariusz(wynik: WynikDynamiczny) -> TozsamoscScenariusza:
    """Tożsamość scenariusza BIEGU — odczytana z wyniku, nie budowana obok niego.

    Budowanie tu własnego `TozsamoscScenariusza` nie mogłoby trafić w bieg:
    odcisk liczy się z CAŁEGO obiektu, a jego pole `parametry` to migawka
    `x0`/`v0`/modeli, niedostępna z zewnątrz. Właśnie dlatego wynik MUSI nieść
    obiekt — patrz `WynikDynamiczny.scenariusz`.
    """
    assert wynik.scenariusz is not None, "bieg z silnika ZAWSZE niesie tożsamość scenariusza"
    return wynik.scenariusz


def _wzorzec(przebieg: Przebieg, przesuniecie: float) -> Przebieg:
    return Przebieg(
        czas_s=przebieg.czas_s,
        wartosci=przebieg.wartosci + przesuniecie,
        jednostka=przebieg.jednostka,
        zrodlo="wzorzec-testowy",
    )


# ---------------------------------------------------------------------------
# 1. WIĄZANIE DA SIĘ ZBUDOWAĆ TYLKO Z BIEGU
# ---------------------------------------------------------------------------


def test_przebieg_zwiazany_niesie_TOZSAMOSC_biegu() -> None:
    wynik = _bieg()
    zwiazany = przebieg_z_biegu(wynik, klucz="u_pu", element_ref="GEN")
    assert zwiazany.bieg.odcisk_scenariusza == wynik.odcisk_scenariusza
    assert zwiazany.bieg.odcisk_topologii == wynik.odcisk_topologii
    assert zwiazany.bieg.odcisk_implementacji == wynik.odcisk_implementacji
    assert zwiazany.tozsamosc_kanalu == "output.u_pu@GEN"
    assert zwiazany.bieg.material_dowodowy is True


def test_wiazania_NIE_DA_SIE_zlozyc_recznie() -> None:
    """Gdyby dało się, „związanie" byłoby polem do wypełnienia, czyli deklaracją."""
    wynik = _bieg()
    prawdziwy = przebieg_z_biegu(wynik, klucz="u_pu", element_ref="GEN")
    with pytest.raises(NiezgodnaProweniencjaError, match="przebieg_z_biegu"):
        PrzebiegZwiazany(
            przebieg=prawdziwy.przebieg,
            bieg=TozsamoscBiegu(
                odcisk_scenariusza="wymyslony",
                odcisk_topologii="wymyslony",
                odcisk_implementacji="wymyslony",
                zbiegl=True,
                kompletnosc="pelny",
                kroki_na_podlodze_numerycznej=0,
            ),
            klucz="u_pu",
            element_ref="GEN",
            przestrzen=PrzestrzenSygnalu.WYJSCIE,
        )


# ---------------------------------------------------------------------------
# 2. TEST NEGATYWNY Z AUDYTU: trajektoria A + scenariusz B
# ---------------------------------------------------------------------------


def test_trajektoria_z_biegu_A_pod_scenariusz_B_jest_ODRZUCANA() -> None:
    """SEDNO §9 — scenariusz wprost z treści audytu.

    Wykonaj bieg A, wykonaj bieg B o INNYM scenariuszu, spróbuj przypisać
    trajektorię A do scenariusza B. System ma odmówić.
    """
    wynik_a = _bieg(x_f_pu=0.2)
    wynik_b = _bieg(x_f_pu=0.05)
    assert wynik_a.odcisk_scenariusza != wynik_b.odcisk_scenariusza, (
        "biegi muszą mieć RÓŻNE scenariusze, inaczej test nie bada niczego"
    )
    trajektoria_a = przebieg_z_biegu(wynik_a, klucz="u_pu", element_ref="GEN")
    with pytest.raises(NiezgodnaProweniencjaError, match="pochodzi z biegu o scenariuszu"):
        zmierz_zgodnosc_zwiazana(
            nazwa="napięcie",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=trajektoria_a,
            wzorzec=_wzorzec(trajektoria_a.przebieg, 1.0e-3),
            okno_s=(0.0, 1.0),
            scenariusz=_scenariusz(wynik_b),
        )


def test_trajektoria_pod_WLASNY_scenariusz_przechodzi() -> None:
    """Kierunek przeciwny — inaczej naprawa mogłaby odrzucać wszystko."""
    wynik = _bieg()
    trajektoria = przebieg_z_biegu(wynik, klucz="u_pu", element_ref="GEN")
    pomiar = zmierz_zgodnosc_zwiazana(
        nazwa="napięcie",
        rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
        badany=trajektoria,
        wzorzec=_wzorzec(trajektoria.przebieg, 1.0e-3),
        okno_s=(0.0, 1.0),
        scenariusz=_scenariusz(wynik),
    )
    assert pomiar.spojny()
    assert pomiar.odcisk_scenariusza == wynik.odcisk_scenariusza


def test_luzna_droga_NIE_sprawdza_pochodzenia_i_to_jest_UDOKUMENTOWANE() -> None:
    """Pin granicy: `zmierz_zgodnosc` bez wiązania nadal przyjmuje dowolną parę.

    To nie jest defekt do naprawy w tym miejscu — to droga dla przebiegów, które
    NIE pochodzą z biegu laboratorium (import, wzorzec zewnętrzny, przypadek
    ręczny). Test istnieje po to, żeby różnica między dwiema drogami była
    ŚWIADOMA, a nie odkrywana przez pomyłkę.
    """
    wynik_a = _bieg(x_f_pu=0.2)
    wynik_b = _bieg(x_f_pu=0.05)
    trajektoria_a = przebieg_z_biegu(wynik_a, klucz="u_pu", element_ref="GEN")
    pomiar = zmierz_zgodnosc(
        nazwa="napięcie",
        rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
        badany=trajektoria_a.przebieg,
        wzorzec=_wzorzec(trajektoria_a.przebieg, 1.0e-3),
        okno_s=(0.0, 1.0),
        scenariusz=_scenariusz(wynik_b),
    )
    assert pomiar.odcisk_scenariusza == wynik_b.odcisk_scenariusza


# ---------------------------------------------------------------------------
# 3. BIEG, KTÓRY NIE JEST MATERIAŁEM DOWODOWYM
# ---------------------------------------------------------------------------


def test_bieg_z_krokami_PONIZEJ_TOLERANCJI_nie_jest_materialem() -> None:
    """`zbiegl=True` nie wystarcza — bieg z zastojem kończy się bez wyjątku."""
    wynik = _bieg()
    diag = wynik.diagnostyka
    z_zastojem = dataclasses.replace(
        wynik,
        diagnostyka=dataclasses.replace(
            diag,
            kroki_scisle_zbiezne=diag.liczba_krokow - 2,
            kroki_na_podlodze_numerycznej=2,
            najgorsze_rho=1249.0,
        ),
    )
    trajektoria = przebieg_z_biegu(z_zastojem, klucz="u_pu", element_ref="GEN")
    assert trajektoria.bieg.material_dowodowy is False
    with pytest.raises(NiezgodnaProweniencjaError, match="materiałem dowodowym"):
        zmierz_zgodnosc_zwiazana(
            nazwa="napięcie",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=trajektoria,
            wzorzec=_wzorzec(trajektoria.przebieg, 1.0e-3),
            okno_s=(0.0, 1.0),
            scenariusz=_scenariusz(z_zastojem),
        )


# ---------------------------------------------------------------------------
# 4. ŁAŃCUCH DOWODOWY Z PRAWDZIWEGO BIEGU
# ---------------------------------------------------------------------------


def test_bieg_niesie_OBIEKT_tozsamosci_scenariusza_a_nie_tylko_jej_skrot() -> None:
    wynik = _bieg()
    assert wynik.scenariusz is not None
    assert wynik.scenariusz.odcisk == wynik.odcisk_scenariusza


def test_skrot_i_OBIEKT_scenariusza_nie_moga_sie_rozjechac() -> None:
    """PREDYKATY PARAMI: jedno źródło prawdy, nie dwa pola, które „dziś się zgadzają"."""
    wynik_a = _bieg(x_f_pu=0.2)
    wynik_b = _bieg(x_f_pu=0.05)
    with pytest.raises(NiespojnaTozsamoscScenariuszaError, match="jednego scenariusza"):
        dataclasses.replace(wynik_a, scenariusz=wynik_b.scenariusz)


def test_tozsamosc_scenariusza_OBEJMUJE_zagadnienie_poczatkowe() -> None:
    """Scenariusza NIE DA SIĘ odtworzyć z zewnątrz — i to jest jego sens.

    Odcisk obejmuje pełne zagadnienie początkowe (``x0``, ``v0``, parametry
    modeli), więc rekonstrukcja z samych nastaw solvera i harmonogramu w niego
    nie trafia. Gdyby trafiała, tożsamość scenariusza znaczyłaby „ten sam
    integrator i ten sam harmonogram" — czyli pozwalałaby podstawić bieg
    policzony z INNEGO punktu startowego.

    Test pilnuje kierunku: zawężenie tożsamości z powrotem do nastaw solvera
    (regresja) uczyniłoby ten odcisk odgadywalnym i tę asercję czerwoną.
    """
    wynik = _bieg()
    assert wynik.scenariusz is not None
    z_zewnatrz = TozsamoscScenariusza(
        odcisk_migawki=wynik.odcisk_topologii,
        punkt_pracy=wynik.scenariusz.punkt_pracy,
        konfiguracja=wynik.scenariusz.konfiguracja,
        czas_koncowy_s=wynik.scenariusz.czas_koncowy_s,
        harmonogram=wynik.scenariusz.harmonogram,
        parametry={},  # BRAK migawki x0/v0/modeli — jedyne, czego z zewnątrz nie ma
    )
    assert z_zewnatrz.odcisk != wynik.odcisk_scenariusza
    assert wynik.scenariusz.parametry, "zagadnienie początkowe MUSI być w tożsamości"


def test_DOWOD_WALIDACJI_da_sie_zlozyc_z_prawdziwego_biegu() -> None:
    """REGRESJA STRUKTURALNA: przed naprawą łańcuch był NIEZAMYKALNY.

    `DowodWalidacji.__post_init__` żąda, by `pomiar.odcisk_scenariusza` był wśród
    `{p.scenariusz.odcisk}` przypadków, a `PrzypadekWalidacji` wymaga OBIEKTU
    tożsamości. Skoro wynik niósł wyłącznie skrót, obiektu nie dawało się zdobyć
    i ŻADEN dowód z biegu laboratorium nie powstawał — wszystkie sześć miejsc
    budujących `PrzypadekWalidacji` w repozytorium używało przebiegów
    syntetycznych. Ten test przechodzi łańcuch END-TO-END: bieg → przebieg
    związany → pomiar → przypadek → dowód.
    """
    from dynamic_lab.dowod_walidacji import (
        DowodWalidacji,
        MetrykiAkceptacji,
        PrzypadekWalidacji,
        TozsamoscModelu,
        Wyrocznia,
        ZakresWalidacji,
    )

    wynik = _bieg()
    trajektoria = przebieg_z_biegu(wynik, klucz="u_pu", element_ref="GEN")
    pomiar = zmierz_zgodnosc_zwiazana(
        nazwa="maksymalne odchylenie napięcia",
        rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
        badany=trajektoria,
        wzorzec=_wzorzec(trajektoria.przebieg, 1.0e-3),
        okno_s=(0.0, 1.0),
        scenariusz=_scenariusz(wynik),
    )
    dowod = DowodWalidacji(
        model=TozsamoscModelu.prosta(
            klasa="MaszynaSynchroniczna4Rzedu",
            wersja="1",
            odcisk_kodu=wynik.odcisk_implementacji,
            parametry={"h_s": 4.0},
        ),
        wyrocznia=Wyrocznia(nazwa="laboratorium", wersja="0", metoda="trajektoria"),
        zakres=ZakresWalidacji(napiecie_pu=(0.0, 1.2)),
        metryki=(MetrykiAkceptacji(maks_blad_wzgledny=1.0e-2, pomiar=pomiar),),
        przypadki=(PrzypadekWalidacji(nazwa="SMIB zwarcie 3f", scenariusz=_scenariusz(wynik)),),
    )
    assert dowod.przypadki[0].scenariusz.odcisk == wynik.odcisk_scenariusza
    assert dowod.wszystkie_metryki_spelnione is True


def test_pomiar_z_INNEGO_biegu_nie_wchodzi_do_dowodu_o_TYM_biegu() -> None:
    """Kierunek przeciwny — zamknięcie łańcucha nie może być zgodą na wszystko."""
    from dynamic_lab.dowod_walidacji import (
        DowodWalidacji,
        MetrykiAkceptacji,
        PomiarNiepowiazanyError,
        PrzypadekWalidacji,
        TozsamoscModelu,
        Wyrocznia,
        ZakresWalidacji,
    )

    wynik_a = _bieg(x_f_pu=0.2)
    wynik_b = _bieg(x_f_pu=0.05)
    trajektoria_a = przebieg_z_biegu(wynik_a, klucz="u_pu", element_ref="GEN")
    pomiar_a = zmierz_zgodnosc_zwiazana(
        nazwa="napięcie",
        rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
        badany=trajektoria_a,
        wzorzec=_wzorzec(trajektoria_a.przebieg, 1.0e-3),
        okno_s=(0.0, 1.0),
        scenariusz=_scenariusz(wynik_a),
    )
    with pytest.raises(PomiarNiepowiazanyError, match="NIE MA wśród"):
        DowodWalidacji(
            model=TozsamoscModelu.prosta(
                klasa="MaszynaSynchroniczna4Rzedu", wersja="1", odcisk_kodu="kod", parametry={}
            ),
            wyrocznia=Wyrocznia(nazwa="laboratorium", wersja="0", metoda="trajektoria"),
            zakres=ZakresWalidacji(napiecie_pu=(0.0, 1.2)),
            metryki=(MetrykiAkceptacji(maks_blad_wzgledny=1.0e-2, pomiar=pomiar_a),),
            przypadki=(PrzypadekWalidacji(nazwa="SMIB", scenariusz=_scenariusz(wynik_b)),),
        )


# ---------------------------------------------------------------------------
# 5. §10 — CHWILA ZAKŁÓCENIA MUSI ISTNIEĆ W ŚLADZIE
# ---------------------------------------------------------------------------


def test_zdarzenie_w_biegu_znajduje_faktycznie_zastosowana_chwile() -> None:
    wynik = _bieg(chwila_s=0.3)
    znalezione = zdarzenie_w_biegu(wynik, chwila_s=0.3, tolerancja_s=1.0e-6)
    assert znalezione is not None
    assert znalezione["typ"] == "ZwarcieTrojfazowe"
    assert zdarzenie_w_biegu(wynik, chwila_s=0.7, tolerancja_s=1.0e-6) is None


def test_odciski_biegu_NIE_sa_puste() -> None:
    """Kontrola bazowa wiązania: puste odciski uczyniłyby każdą kontrolę trywialną."""
    wynik = _bieg()
    zwiazany = przebieg_z_biegu(wynik, klucz="u_pu", element_ref="GEN")
    assert len(zwiazany.bieg.odcisk_scenariusza) == 64
    assert len(zwiazany.bieg.odcisk_topologii) == 64
    assert zwiazany.bieg.odcisk_implementacji, "bieg z silnika MUSI nieść odcisk kodu"
    assert not np.allclose(zwiazany.przebieg.wartosci, zwiazany.przebieg.wartosci[0]), (
        "przebieg stały nie odróżniłby żadnej pomyłki pochodzenia"
    )
