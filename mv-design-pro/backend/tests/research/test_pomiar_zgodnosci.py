"""§11.3/3 — czy da się zbudować „dowód" bez uruchomienia symulacji.

KOD BADAWCZY — patrz `backend/research/README.md`.

Każdy test opisuje JEDNĄ drogę, którą przed naprawą dało się dojść do kompletnego,
przechodzącego walidację dowodu bez policzenia czegokolwiek — albo sprawdza, że
zamknięcie tej drogi nie zabiło drogi uczciwej.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from dynamic_lab.dowod_walidacji import (
    DowodWalidacji,
    KonfiguracjaSolvera,
    MetrykiAkceptacji,
    PomiarNiepowiazanyError,
    PrzypadekWalidacji,
    PunktPracy,
    TozsamoscModelu,
    TozsamoscScenariusza,
    Wyrocznia,
    ZakresWalidacji,
)
from dynamic_lab.pomiar_zgodnosci import (
    PomiarSfabrykowanyError,
    PomiarZgodnosci,
    RodzajMetryki,
    odcisk_przebiegu,
    zmierz_zgodnosc,
)
from dynamic_lab.wzorzec_trajektoria import EkstrapolacjaZabronionaError, Przebieg

KONFIGURACJA = KonfiguracjaSolvera(
    integrator="trapez_niejawny",
    krok_s=0.005,
    tolerancja_sieci=1.0e-12,
    tolerancja_rownowagi=1.0e-6,
    maks_iteracji_sieci=40,
)


def _scenariusz(migawka: str = "migawka-a") -> TozsamoscScenariusza:
    return TozsamoscScenariusza(
        odcisk_migawki=migawka,
        punkt_pracy=PunktPracy(
            napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f"
        ),
        konfiguracja=KONFIGURACJA,
        czas_koncowy_s=2.0,
        parametry={},
    )


def _rampa(przesuniecie: float = 0.0, *, jednostka: str = "rad", n: int = 41) -> Przebieg:
    czas = np.linspace(0.0, 2.0, n, dtype=np.float64)
    return Przebieg(
        czas_s=czas,
        wartosci=czas / 2.0 + przesuniecie,
        jednostka=jednostka,
        zrodlo="test",
    )


def _zmierz(
    przesuniecie: float = 1.0e-3,
    *,
    rodzaj: RodzajMetryki = RodzajMetryki.MAKS_BLAD_WZGLEDNY,
    scenariusz: TozsamoscScenariusza | None = None,
) -> PomiarZgodnosci:
    return zmierz_zgodnosc(
        nazwa="maksymalne odchylenie kąta wirnika",
        rodzaj=rodzaj,
        badany=_rampa(przesuniecie),
        wzorzec=_rampa(),
        okno_s=(0.0, 2.0),
        scenariusz=scenariusz or _scenariusz(),
    )


# ---------------------------------------------------------------------------
# 1. LICZBY NIE DA SIĘ WPISAĆ
# ---------------------------------------------------------------------------


def test_konstruktor_pomiaru_odmawia_bez_zetonu() -> None:
    """Droga „wpiszę zero" przestaje istnieć — to jest sedno §11.3/3."""
    with pytest.raises(PomiarSfabrykowanyError, match="zmierz_zgodnosc"):
        PomiarZgodnosci(
            nazwa="cokolwiek",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            wartosc=0.0,
            okno_s=(0.0, 1.0),
            odcisk_scenariusza="a",
            odcisk_badanego="b",
            odcisk_wzorca="c",
            probki_badanego=(0.0, 1.0),
            probki_wzorca=(0.0, 1.0),
            siatka_s=(0.0, 1.0),
        )


def test_zeton_nie_da_sie_podac_z_zewnatrz_wartoscia() -> None:
    """Żeton jest TOŻSAMOŚCIĄ obiektu, nie wartością — `True`/`"ok"` nie przechodzą.

    Gdyby był flagą, obejście nie wymagałoby nawet sięgania po prywatną nazwę
    modułu: wystarczyłoby zgadnąć wartość.
    """
    for podstawiony in (True, 1, "ok", object()):
        with pytest.raises(PomiarSfabrykowanyError):
            PomiarZgodnosci(
                nazwa="cokolwiek",
                rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
                wartosc=0.0,
                okno_s=(0.0, 1.0),
                odcisk_scenariusza="a",
                odcisk_badanego="b",
                odcisk_wzorca="c",
                probki_badanego=(0.0, 1.0),
                probki_wzorca=(0.0, 1.0),
                siatka_s=(0.0, 1.0),
                zeton=podstawiony,
            )


def test_uczciwa_droga_dziala() -> None:
    """Kierunek przeciwny — zamknięcie fałszywej drogi nie może zamknąć prawdziwej."""
    pomiar = _zmierz(1.0e-3)
    assert pomiar.wartosc == pytest.approx(1.0e-3, rel=1e-12)
    assert pomiar.spojny()
    assert pomiar.liczba_probek == 201


# ---------------------------------------------------------------------------
# 2. LICZBA JEST PRZELICZALNA
# ---------------------------------------------------------------------------


def test_podmieniona_wartosc_jest_wykrywana_przez_przeliczenie() -> None:
    """Nawet obejście zamrożenia (`object.__setattr__`) nie daje spójnego pomiaru."""
    pomiar = _zmierz(1.0e-3)
    object.__setattr__(pomiar, "wartosc", 0.0)
    assert pomiar.spojny() is False
    assert pomiar.przelicz() == pytest.approx(1.0e-3, rel=1e-12)


def test_metryka_odrzuca_pomiar_niespojny_wewnetrznie() -> None:
    """Dowód nie przyjmuje pomiaru, którego liczba nie wynika z jego własnych danych."""
    pomiar = _zmierz(1.0e-3)
    object.__setattr__(pomiar, "wartosc", 0.0)
    with pytest.raises(ValueError, match="nie zgadza się z przeliczoną"):
        MetrykiAkceptacji(maks_blad_wzgledny=1.0e-4, pomiar=pomiar)


def test_podmiana_probek_tez_rozjezdza_przeliczenie() -> None:
    """Druga strona tej samej równości: dane też nie dadzą się podmienić po cichu."""
    pomiar = _zmierz(1.0e-3)
    object.__setattr__(pomiar, "probki_badanego", pomiar.probki_wzorca)
    assert pomiar.spojny() is False


@pytest.mark.parametrize(
    "rodzaj",
    [
        RodzajMetryki.MAKS_BLAD_WZGLEDNY,
        RodzajMetryki.RMS_BLAD_WZGLEDNY,
        RodzajMetryki.MAKS_BLAD_BEZWZGLEDNY,
    ],
)
def test_przeliczenie_zgadza_sie_dla_KAZDEGO_rodzaju(rodzaj: RodzajMetryki) -> None:
    """Iloczyn cech: spójność musi trzymać dla każdej definicji metryki, nie dla jednej."""
    pomiar = _zmierz(2.5e-3, rodzaj=rodzaj)
    assert pomiar.spojny()
    assert pomiar.przelicz() == pytest.approx(pomiar.wartosc, rel=1e-12)


def test_rodzaje_metryk_daja_ROZNE_liczby_na_tych_samych_danych() -> None:
    """Gdyby dawały tę samą liczbę, rodzaj byłby etykietą bez treści.

    Dla stałego przesunięcia maksimum i RMS są równe (różnica jest stała), więc
    rozróżnienie wymaga przebiegu o ZMIENNEJ różnicy — tutaj różnica rośnie
    liniowo, dla której RMS = maks/sqrt(3) w granicy gęstej siatki.
    """
    czas = np.linspace(0.0, 2.0, 401, dtype=np.float64)
    wzorzec = Przebieg(czas_s=czas, wartosci=czas / 2.0, jednostka="rad", zrodlo="w")
    badany = Przebieg(
        czas_s=czas, wartosci=czas / 2.0 + 1.0e-3 * czas / 2.0, jednostka="rad", zrodlo="b"
    )
    wspolne = {
        "badany": badany,
        "wzorzec": wzorzec,
        "okno_s": (0.0, 2.0),
        "scenariusz": _scenariusz(),
    }
    maks = zmierz_zgodnosc(nazwa="m", rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY, **wspolne)
    rms = zmierz_zgodnosc(nazwa="m", rodzaj=RodzajMetryki.RMS_BLAD_WZGLEDNY, **wspolne)
    assert maks.wartosc > rms.wartosc
    assert rms.wartosc == pytest.approx(maks.wartosc / math.sqrt(3.0), rel=2e-3)


# ---------------------------------------------------------------------------
# 3. LICZBA JEST ZWIĄZANA ZE SCENARIUSZEM
# ---------------------------------------------------------------------------


def _dowod(pomiar: PomiarZgodnosci, *, scenariusz: TozsamoscScenariusza) -> DowodWalidacji:
    return DowodWalidacji(
        model=TozsamoscModelu.prosta(
            klasa="MaszynaSynchroniczna4Rzedu",
            wersja="1",
            odcisk_kodu="kod",
            parametry={"h_s": 4.0},
        ),
        wyrocznia=Wyrocznia(nazwa="ANDES", wersja="2.0.0", metoda="trajektoria"),
        zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
        metryki=(MetrykiAkceptacji(maks_blad_wzgledny=1.0e-2, pomiar=pomiar),),
        przypadki=(PrzypadekWalidacji(nazwa="SMIB", scenariusz=scenariusz),),
    )


def test_pomiar_z_INNEGO_biegu_nie_wchodzi_do_dowodu() -> None:
    """„Zmierzone na biegu A, podstawione pod dowód o biegu B" — zamknięte."""
    obcy = _zmierz(1.0e-3, scenariusz=_scenariusz("migawka-B"))
    with pytest.raises(PomiarNiepowiazanyError, match="NIE MA wśród"):
        _dowod(obcy, scenariusz=_scenariusz("migawka-A"))


def test_pomiar_z_TEGO_biegu_wchodzi() -> None:
    scenariusz = _scenariusz("migawka-A")
    dowod = _dowod(_zmierz(1.0e-3, scenariusz=scenariusz), scenariusz=scenariusz)
    assert dowod.wszystkie_metryki_spelnione is True


def test_odcisk_pomiaru_rozni_sie_gdy_rozni_sie_scenariusz() -> None:
    a = _zmierz(1.0e-3, scenariusz=_scenariusz("migawka-A"))
    b = _zmierz(1.0e-3, scenariusz=_scenariusz("migawka-B"))
    assert a.wartosc == pytest.approx(b.wartosc)
    assert a.odcisk != b.odcisk


def test_odcisk_przebiegu_rozroznia_przebiegi_i_laczy_identyczne() -> None:
    assert odcisk_przebiegu(_rampa()) == odcisk_przebiegu(_rampa())
    assert odcisk_przebiegu(_rampa()) != odcisk_przebiegu(_rampa(1.0e-6))
    assert odcisk_przebiegu(_rampa()) != odcisk_przebiegu(_rampa(jednostka="p.u."))


def test_odcisk_przebiegu_jest_ODPORNY_na_szum_ostatniego_bitu() -> None:
    """Kwantyzacja ma znosić różnice ULP, a nie różnice fizyczne.

    Bez tego ten sam bieg policzony przy innej liczbie wątków BLAS nie pasowałby
    do własnego pomiaru — zmierzony efekt na `np.linalg.inv`, patrz nagłówek
    modułu pomiarowego.
    """
    czysty = _rampa()
    szum = Przebieg(
        czas_s=czysty.czas_s,
        wartosci=czysty.wartosci * (1.0 + 1.0e-15),
        jednostka=czysty.jednostka,
        zrodlo="test",
    )
    assert odcisk_przebiegu(czysty) == odcisk_przebiegu(szum)


# ---------------------------------------------------------------------------
# 4. GRANICE SAMEGO POMIARU
# ---------------------------------------------------------------------------


def test_okno_poza_danymi_jest_bledem_a_nie_doskonala_zgodnoscia() -> None:
    """Ekstrapolacja dałaby wartość brzegową udającą idealny wynik."""
    with pytest.raises(EkstrapolacjaZabronionaError):
        zmierz_zgodnosc(
            nazwa="m",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=_rampa(),
            wzorzec=_rampa(),
            okno_s=(0.0, 5.0),
            scenariusz=_scenariusz(),
        )


def test_rozne_jednostki_to_nie_jest_porownanie() -> None:
    with pytest.raises(ValueError, match="jednostka"):
        zmierz_zgodnosc(
            nazwa="m",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=_rampa(jednostka="p.u."),
            wzorzec=_rampa(jednostka="rad"),
            okno_s=(0.0, 2.0),
            scenariusz=_scenariusz(),
        )


def test_wzorzec_tozsamosciowo_zerowy_odmawia_bledu_WZGLEDNEGO() -> None:
    """Zero w mianowniku ma dać błąd, a nie `inf` albo cichą jedynkę."""
    czas = np.linspace(0.0, 2.0, 21, dtype=np.float64)
    zero = Przebieg(czas_s=czas, wartosci=np.zeros_like(czas), jednostka="rad", zrodlo="w")
    with pytest.raises(ValueError, match="mianownika"):
        zmierz_zgodnosc(
            nazwa="m",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=_rampa(),
            wzorzec=zero,
            okno_s=(0.0, 2.0),
            scenariusz=_scenariusz(),
        )


def test_wzorzec_zerowy_jest_dopuszczalny_dla_bledu_BEZWZGLEDNEGO() -> None:
    """Kierunek przeciwny: brak mianownika nie jest problemem, gdy go nie potrzeba."""
    czas = np.linspace(0.0, 2.0, 21, dtype=np.float64)
    zero = Przebieg(czas_s=czas, wartosci=np.zeros_like(czas), jednostka="rad", zrodlo="w")
    pomiar = zmierz_zgodnosc(
        nazwa="m",
        rodzaj=RodzajMetryki.MAKS_BLAD_BEZWZGLEDNY,
        badany=_rampa(),
        wzorzec=zero,
        okno_s=(0.0, 2.0),
        scenariusz=_scenariusz(),
    )
    assert pomiar.wartosc == pytest.approx(1.0)


def test_okno_puste_jest_odrzucane() -> None:
    with pytest.raises(ValueError, match="puste lub nieskończone"):
        zmierz_zgodnosc(
            nazwa="m",
            rodzaj=RodzajMetryki.MAKS_BLAD_WZGLEDNY,
            badany=_rampa(),
            wzorzec=_rampa(),
            okno_s=(1.0, 1.0),
            scenariusz=_scenariusz(),
        )
