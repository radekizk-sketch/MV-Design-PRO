"""Testy prototypów OZE: magazyn z energią, regulator elektrowni, maszyna DFIG.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy są pisane jako WŁASNOŚCI i jako ILOCZYNY CECH, nie jako pojedyncze
przykłady. Powód jest wprost z audytu: model bez stanu energii przechodzi każdy
test wsparcia częstotliwości, bo wspiera w nieskończoność; model bez fizyki
przechodzi każdy test kształtu, bo kształt ma. Dlatego dla magazynu badany jest
iloczyn (pojemność) × (głębokość zapadu), dla regulatora elektrowni
(limit eksportu) × (liczba modułów) × (strategia alokacji), a dla maszyny
dwustronnie zasilanej — porównanie z falownikiem pełnomocowym NA TEJ SAMEJ sieci
i tym samym zwarciu.

Każdy scenariusz kosztowny obliczeniowo jest liczony RAZ (`functools.cache`) i czytany
przez kilka testów — inaczej macierz cech kosztowałaby kilka minut.
"""

from __future__ import annotations

import math
from functools import cache

import numpy as np
import pytest
from dynamic_lab.benchmarki import siec_sn_z_der
from dynamic_lab.konwencje import ogranicz_do_przedzialu, ogranicz_okregiem, ogranicz_prad
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.urzadzenia_oze import (
    JednostkaSterowanaPQ,
    MagazynEnergiiBESS,
    MaszynaDwustronnieZasilana3Rzedu,
    PetlaSynchronizacjiPLL,
    PozaZakresemWaznosciModeluError,
    RegulatorElektrowniPPC,
    SkokObciazeniaBocznikowego,
)
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny
from dynamic_lab.zdarzenia import (
    HarmonogramZdarzen,
    WylaczenieGalezi,
    ZdjecieZwarcia,
    ZwarcieTrojfazowe,
)

TOL_ROWNOWAGI = 1.0e-8
S_BAZOWA_MVA = 100.0


# ---------------------------------------------------------------------------
# Pomocnicze budowniczowie scenariuszy
# ---------------------------------------------------------------------------


def _model_na_sieci_benchmarkowej(urzadzenie, moc: complex):
    """Wstaw urządzenie na szynę ``DER1`` sieci SN z DER (`benchmarki.siec_sn_z_der`).

    Sieć pochodzi z benchmarku, a nie z fikstury pisanej pod test — dzięki temu
    równowaga jest sprawdzana na tym samym układzie, na którym mierzone są
    pozostałe urządzenia laboratorium.
    """
    baza, moce = siec_sn_z_der()
    inne = [u for u in baza.urzadzenia if u.ref != "DER1"]
    moce_inne = {k: v for k, v in moce.items() if k != "DER1"}
    model = ModelDynamiczny(topologia=baza.topologia, urzadzenia=[*inne, urzadzenie])
    return model, {**moce_inne, urzadzenie.ref: moc}


def _magazyn(**kwargs) -> MagazynEnergiiBESS:
    parametry = {
        "ref": "BAT",
        "szyna": "DER1",
        "e_pojemnosc_mwh": 1.0,
        "s_bazowa_mva": S_BAZOWA_MVA,
    }
    parametry.update(kwargs)
    return MagazynEnergiiBESS(**parametry)


def _moduly(liczba: int) -> list[JednostkaSterowanaPQ]:
    """Moduły o RÓŻNYCH mocach — równe moce ukryłyby błąd alokacji proporcjonalnej."""
    moce = (0.6, 0.3, 0.1)
    return [JednostkaSterowanaPQ(ref=f"M{i + 1}", s_zn_pu=moce[i]) for i in range(liczba)]


def _siec_pcc() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("PCC", "SYS"),
        galezie=[Galaz("PCC", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _uruchom(model, moce, **kw) -> tuple[SilnikRMS, np.ndarray]:
    silnik = SilnikRMS(model, **kw)
    return silnik, silnik.inicjalizuj(moce)


def _tablica(
    wynik: WynikDynamiczny,
    klucz: str,
    ref: str,
    przestrzen: PrzestrzenSygnalu | None = None,
) -> np.ndarray:
    """Przebieg jednego sygnału, z INWARIANTEM długości równej osi czasu.

    HISTORIA TEJ FUNKCJI. Do pakietu B audytu rozplatała ona przeplot: silnik
    zapisywał wielkości wyjściowe urządzenia (``p_pu``/``q_pu``/``i_pu``) i jego
    STANY pod jednym kluczem, więc `FalownikGFL` ze stanami nazwanymi ``p_pu``/
    ``q_pu`` dawał ciąg podwójnej długości, w którym na przemian leżały moc oddana
    i zmienna stanu. Funkcja brała wtedy próbki parzyste i mówiła wprost, że robi
    to z powodu defektu silnika.

    Defekt jest naprawiony u ŹRÓDŁA: tożsamością sygnału jest trójka
    ``(przestrzen, klucz, element_ref)``, a `ZbieraczPrzebiegow` podnosi
    `KolizjaSygnaluError`, gdy ten sam sygnał zostanie zapisany dwa razy w jednej
    chwili. Rozplatanie zniknęło razem z przeplotem, a zostało po nim ASERCJA:
    długość każdego przebiegu MUSI równać się długości osi czasu. Gdyby przeplot
    kiedykolwiek wrócił, ta asercja zapali się natychmiast, zamiast zostać
    po cichu skompensowana.
    """
    wartosci = np.array(wynik.sygnal(klucz, ref, przestrzen).wartosci, dtype=np.float64)
    oczekiwana = len(wynik.czas_s)
    assert wartosci.size == oczekiwana, (
        f"{klucz}@{ref}: {wartosci.size} próbek przy osi czasu o {oczekiwana} — "
        "przebieg nie odpowiada osi czasu (przeplot dwóch sygnałów?)."
    )
    return wartosci


# ---------------------------------------------------------------------------
# 1. RÓWNOWAGA — start musi być punktem pracy, nie rozruchem (defekt P0-04)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("soc", [0.1, 0.5, 0.9])
@pytest.mark.parametrize("q_pu", [-0.3, 0.0, 0.3])
def test_magazyn_startuje_w_rownowadze(soc: float, q_pu: float) -> None:
    """Iloczyn (SOC na granicy okna i w środku) × (znak mocy biernej).

    Magazyn na granicy okna SOC też musi być równowagą: przy ``P = 0`` energia nie
    płynie, więc żadne ograniczenie energetyczne nie może wytrącić punktu pracy.
    Moc bierna nie zużywa energii zmagazynowanej, więc nie rusza ``soc``.
    """
    model, moce = _model_na_sieci_benchmarkowej(
        _magazyn(soc_poczatkowy=soc, soc_min=0.1, soc_max=0.9), complex(0.0, q_pu)
    )
    silnik, x0 = _uruchom(model, moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI


@pytest.mark.parametrize("p_pu", [0.35, -0.35])
def test_magazyn_oddajacy_moc_startuje_z_dryfem_soc(p_pu: float) -> None:
    """Magazyn pod obciążeniem JEST poprawnym punktem startowym — SOC dryfuje.

    KOREKTA KANONU (pakiet D audytu) — poprzednia wersja tego testu wymagała, żeby
    silnik ODRZUCIŁ taki punkt, i nazywała to uczciwością modelu. Intencja była
    słuszna (magazyn nie może udawać źródła nieskończonego), ale wniosek błędny:
    praca z niezerową mocą jest NORMALNYM punktem pracy magazynu, a symulacja
    krótkookresowa musi móc od niego wystartować. Odrzucanie go czyniło model
    bezużytecznym dokładnie tam, gdzie jest potrzebny.

    Intencja jest zachowana, tylko sprawdzana wprost: zamiast żądać odmowy,
    sprawdzamy, że (a) stany SZYBKIE są w równowadze, (b) SOC faktycznie dryfuje,
    (c) dryf ma właściwy ZNAK i WARTOŚĆ z bilansu energii. Magazyn nadal nie może
    udawać źródła nieskończonego — ale dowodzi tego liczba, a nie wyjątek.
    """
    model, moce = _model_na_sieci_benchmarkowej(_magazyn(), complex(p_pu, 0.0))
    silnik = SilnikRMS(model)
    x0 = silnik.inicjalizuj(moce)

    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI, "tor P/Q i PLL muszą być w równowadze"
    dryf = silnik.norma_pochodnej_zasobowej(x0)
    assert dryf > 1.0e-5, "SOC magazynu pod obciążeniem MUSI się zmieniać"

    magazyn = next(u for u in model.urzadzenia if isinstance(u, MagazynEnergiiBESS))
    wycinek = silnik.uklad.wycinki[magazyn.ref]
    d_soc = float(silnik.pochodne(x0, 0.0)[wycinek][2])
    # Konwencja generatorowa: P > 0 to rozładowanie, więc SOC maleje.
    assert (d_soc < 0.0) if p_pu > 0 else (d_soc > 0.0)
    oczekiwany = -p_pu * magazyn.s_bazowa_mva / (3600.0 * magazyn.e_pojemnosc_mwh)
    assert d_soc == pytest.approx(oczekiwany, rel=0.05)


def test_bilans_energii_magazynu_zgadza_sie_po_symulacji() -> None:
    """ΔSOC·E vs −∫P dt — magazyn nie jest źródłem nieskończonym, i to MIERZYMY."""
    model, moce = _model_na_sieci_benchmarkowej(_magazyn(), complex(0.30, 0.0))
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.01)
    x0 = silnik.inicjalizuj(moce)
    wynik = silnik.symuluj(x0, czas_koncowy_s=10.0)

    magazyn = next(u for u in model.urzadzenia if isinstance(u, MagazynEnergiiBESS))
    czas = np.array(wynik.czas_s)
    soc = _tablica(wynik, "soc", magazyn.ref)
    moc = _tablica(wynik, "p_pu", magazyn.ref, PrzestrzenSygnalu.WYJSCIE)

    delta_mwh = float(soc[-1] - soc[0]) * magazyn.e_pojemnosc_mwh
    energia_mwh = -float(np.trapz(moc, czas)) * magazyn.s_bazowa_mva / 3600.0
    blad_wzgledny = abs(delta_mwh - energia_mwh) / abs(energia_mwh)
    assert blad_wzgledny < 0.01, (
        f"ΔSOC·E = {delta_mwh:.6e} MWh vs −∫P dt = {energia_mwh:.6e} MWh "
        f"(błąd {blad_wzgledny:.2%})"
    )


def test_magazyn_bez_energii_odrzuca_dyspozycje_rozladowania() -> None:
    """Rozładowany magazyn nie przyjmuje dyspozycji, której nie wykona — i mówi dlaczego.

    Ciche przycięcie zadania do zera dałoby punkt startowy, w którym rozpływ założył
    0,4 p.u., a urządzenie oddaje 0 — czyli napięcia z rozpływu opisywałyby inną sieć.
    Model z pętlą synchronizacji wykryłby to i tak (start z rozsynchronizowaną fazą
    daje ||f(x0)|| ~ 6, więc silnik odrzuca punkt), ale komunikat wskazywałby skutek,
    a nie przyczynę. Dlatego przyczyna zgłaszana jest tam, gdzie jest znana.
    """
    magazyn = _magazyn(soc_poczatkowy=0.1, soc_min=0.1)
    model, moce = _model_na_sieci_benchmarkowej(magazyn, complex(0.4, 0.0))
    silnik = SilnikRMS(model)
    with pytest.raises(ValueError, match="okno SOC"):
        silnik.inicjalizuj(moce)


def test_magazyn_odrzuca_dyspozycje_ponad_moc_falownika() -> None:
    """Ta sama klasa błędu po drugiej granicy: okrąg falownika, nie okno energii."""
    magazyn = _magazyn(s_falownika_pu=0.3)
    model, moce = _model_na_sieci_benchmarkowej(magazyn, complex(0.0, 0.5))
    silnik = SilnikRMS(model)
    with pytest.raises(ValueError, match="okrąg falownika"):
        silnik.inicjalizuj(moce)


@pytest.mark.parametrize("liczba_modulow", [1, 2, 3])
@pytest.mark.parametrize("limit", [None, 0.1])
def test_elektrownia_startuje_w_rownowadze(liczba_modulow: int, limit: float | None) -> None:
    """Iloczyn (liczba modułów) × (limit eksportu nieaktywny / wiążący).

    Przy limicie 0,1 p.u. elektrownia pracuje DOKŁADNIE na ograniczeniu i to też musi
    być równowagą — praca pod ograniczeniem eksportu jest dla farm stanem normalnym,
    a nie stanem przejściowym. Jeden moduł o mocy 0,6 p.u. też musi się rozdzielić
    poprawnie: strategia dla jednego elementu jest przypadkiem brzegowym alokacji.
    """
    dyspozycja = 0.1 if limit is not None else 0.5
    ppc = RegulatorElektrowniPPC(
        ref="EL", szyna="PCC", jednostki=_moduly(liczba_modulow), limit_eksportu_pu=limit
    )
    model = ModelDynamiczny(topologia=_siec_pcc(), urzadzenia=[ppc])
    silnik, x0 = _uruchom(model, {"EL": complex(dyspozycja, 0.05)})
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI
    assert x0[0] == pytest.approx(dyspozycja)


def test_elektrownia_odrzuca_dyspozycje_ponad_limit_eksportu() -> None:
    """Dyspozycja ponad limit to BŁĄD DANYCH, nie punkt pracy do przycięcia.

    Elektrownię ograniczoną zadaje się mocą, którą oddaje; badanie „limit zaczyna
    wiązać" robi się zmianą dyspozycji PO inicjalizacji — tak, jak dzieje się to w
    ruchu. Ciche przycięcie w inicjalizacji dałoby rozpływ policzony dla mocy, której
    elektrownia nie wystawi.
    """
    ppc = RegulatorElektrowniPPC(
        ref="EL", szyna="PCC", jednostki=_moduly(2), limit_eksportu_pu=0.25
    )
    model = ModelDynamiczny(topologia=_siec_pcc(), urzadzenia=[ppc])
    silnik = SilnikRMS(model)
    with pytest.raises(ValueError, match="limit eksportu"):
        silnik.inicjalizuj({"EL": complex(0.5, 0.05)})


@pytest.mark.parametrize("omega_wirnika", [0.90, 1.00, 1.15])
@pytest.mark.parametrize("q_pu", [-0.2, 0.0, 0.2])
def test_maszyna_dwustronnie_zasilana_startuje_w_rownowadze(
    omega_wirnika: float, q_pu: float
) -> None:
    """Iloczyn (poślizg dodatni / zerowy / ujemny) × (znak mocy biernej).

    Poślizg zerowy jest przypadkiem brzegowym: przy pracy synchronicznej człon
    ``-j·s·OMEGA_S·E'`` znika i całe wzbudzenie musi pochodzić z napięcia wirnika
    (napięcie stałe w wirniku). Punkt pracy nadal MUSI być równowagą.
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(
        ref="W1", szyna="DER1", omega_wirnika_zadana_pu=omega_wirnika
    )
    model, moce = _model_na_sieci_benchmarkowej(maszyna, complex(0.5, q_pu))
    silnik, x0 = _uruchom(model, moce)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI
    stan_maszyny = x0[silnik.uklad.wycinki["W1"]]
    assert float(stan_maszyny[2]) == pytest.approx(omega_wirnika)


def test_wszystkie_trzy_prototypy_na_jednej_sieci_startuja_w_rownowadze() -> None:
    """Trzy nowe urządzenia RAZEM — interakcja nie może zepsuć punktu pracy."""
    baza, _ = siec_sn_z_der()
    magazyn = _magazyn(szyna="DER1", s_falownika_pu=0.5)
    ppc = RegulatorElektrowniPPC(
        ref="EL", szyna="DER2", jednostki=_moduly(2), limit_eksportu_pu=0.5
    )
    wiatr = MaszynaDwustronnieZasilana3Rzedu(ref="W1", szyna="SN1")
    odbior = OdbiorStalejMocy(ref="ODB", szyna="SN2", p_pu=-0.5, q_pu=-0.15)
    model = ModelDynamiczny(topologia=baza.topologia, urzadzenia=[magazyn, ppc, wiatr, odbior])
    silnik, x0 = _uruchom(
        model,
        {
            "BAT": complex(0.0, 0.1),
            "EL": complex(0.45, 0.05),
            "W1": complex(0.4, 0.0),
            "ODB": complex(-0.5, -0.15),
        },
    )
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI


# ---------------------------------------------------------------------------
# 2. ENERGIA — SOC jako równanie, nie jako etykieta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("p_pu", [-0.4, 0.25, 0.7])
@pytest.mark.parametrize("e_mwh", [0.5, 10.0])
@pytest.mark.parametrize("s_bazowa", [50.0, 100.0])
def test_pochodna_soc_jest_dokladnie_wzorem_bilansu(
    p_pu: float, e_mwh: float, s_bazowa: float
) -> None:
    """WYROCZNIA ANALITYCZNA: ``d(soc)/dt = -P·S_bazowa/(3600·E)``, iloczyn trzech cech.

    Znak jest częścią wzoru: przy konwencji generatorowej ``P > 0`` to
    rozładowanie, więc pochodna jest ujemna. Test sprawdza WARTOŚĆ, nie kierunek —
    pomyłka o czynnik 3600 albo o bazę mocy daje wynik „wyglądający rozsądnie".
    """
    magazyn = _magazyn(e_pojemnosc_mwh=e_mwh, s_bazowa_mva=s_bazowa)
    napiecie = complex(1.0, 0.0)
    x = magazyn.inicjalizuj(napiecie, complex(p_pu, 0.0))
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert d_soc == pytest.approx(-p_pu * s_bazowa / (3600.0 * e_mwh), rel=1e-12)
    assert (d_soc < 0.0) == (p_pu > 0.0)


def test_soc_calkuje_moc_FAKTYCZNA_a_nie_zadana() -> None:
    """Przy nasyceniu prądowym magazyn nie może zużywać energii, której nie oddał.

    Zadanie 0,9 p.u. przy napięciu 0,3 p.u. wymaga prądu 3,0 p.u., a ogranicznik
    przepuszcza 1,2 p.u. → do sieci trafia 0,36 p.u. i tyle wolno odjąć od energii.
    Model liczący SOC z zadania „rozładowywałby" 2,5 raza szybciej niż fizyka.
    """
    magazyn = _magazyn(e_pojemnosc_mwh=1.0, krotnosc_pradu_max=1.2, s_falownika_pu=1.0)
    napiecie = complex(0.3, 0.0)
    x = np.array([0.9, 0.0, 0.5, 0.0, 1.0], dtype=np.float64)
    moc_faktyczna = magazyn.moc_rzeczywista(x, napiecie).real
    assert moc_faktyczna == pytest.approx(0.3 * 1.2, rel=1e-12)
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert d_soc == pytest.approx(-0.36 * S_BAZOWA_MVA / 3600.0, rel=1e-12)
    assert abs(d_soc) < abs(-0.9 * S_BAZOWA_MVA / 3600.0)


@pytest.mark.parametrize(
    ("soc", "p_zadane", "oczekiwany_znak"),
    [
        (0.10, 0.5, 0.0),  # pusty magazyn NIE rozładowuje
        (0.10, -0.5, -1.0),  # pusty magazyn WOLNO ładować
        (0.90, -0.5, 0.0),  # pełny magazyn NIE ładuje
        (0.90, 0.5, 1.0),  # pełny magazyn WOLNO rozładowywać
        (0.50, 0.5, 1.0),  # w środku okna bez ograniczeń
        (0.50, -0.5, -1.0),
    ],
)
def test_okno_soc_ogranicza_wlasciwy_kierunek(
    soc: float, p_zadane: float, oczekiwany_znak: float
) -> None:
    """Iloczyn (SOC na dolnej / górnej granicy / w środku) × (kierunek mocy).

    Ograniczenie MUSI działać kierunkowo: magazyn pusty nie oddaje, ale przyjmuje.
    Ogranicznik działający symetrycznie („na granicy nic nie wolno") uniemożliwiłby
    naładowanie rozładowanego magazynu — i przeszedłby test badający tylko jeden
    kierunek.

    KOREKTA (audyt niezależny, plan naprawy §1). Test pytał o ``cel_mocy``, czyli o
    NASTAWĘ regulatora. Bramka energii stała wtedy właśnie tam — i to był defekt:
    moc wystawiana jest STANEM z opóźnieniem ``T_p``, więc magazyn oddawał jeszcze
    ``P·T_p`` energii, której nie miał, a ten test tego NIE WIDZIAŁ. Pytamy teraz o
    MOC NA ZACISKACH, bo tylko ona rozstrzyga bilans energii. Intencja bez zmian:
    ograniczenie kierunkowe, oba kierunki, obie granice i środek okna.
    """
    magazyn = _magazyn(soc_poczatkowy=soc, soc_min=0.1, soc_max=0.9)
    napiecie = complex(1.0, 0.0)
    # Stan toru mocy USTAWIONY na żądaną wartość: tak wygląda przepływ po
    # zakończeniu przejścia toru P, czyli sytuacja, w której defekt żył.
    x = np.array([p_zadane, 0.0, soc, 0.0, 1.0], dtype=np.float64)
    p_zaciskow = magazyn.moc_rzeczywista(x, napiecie).real
    if oczekiwany_znak == 0.0:
        assert p_zaciskow == pytest.approx(0.0)
    else:
        assert math.copysign(1.0, p_zaciskow) == oczekiwany_znak
        assert abs(p_zaciskow) == pytest.approx(abs(p_zadane))


def test_pasmo_soc_czyni_moc_zaciskow_ciagla_a_zerowe_pasmo_jest_odrzucane() -> None:
    """Deklaracja z docstringa („pasmo czyni pochodną ciągłą") MUSI mieć test.

    Skok mocy na granicy okna wywraca metody niejawne — to jest zmierzony mechanizm
    z `FalownikGFL`. Sprawdzamy, że przejście jest ciągłe: maksymalny przyrost MOCY
    NA ZACISKACH na siatce SOC jest proporcjonalny do kroku siatki, a nie skokowy.

    KOREKTA (plan naprawy §1): bramka energii przeszła z celu regulatora na moc
    faktycznie wystawianą, więc ciągłość trzeba badać tam, gdzie bramka działa.
    Badanie ciągłości celu byłoby dziś badaniem funkcji, która bramki nie zawiera.
    """
    magazyn = _magazyn(soc_min=0.1, soc_max=0.9, pasmo_soc=0.02)
    napiecie = complex(1.0, 0.0)
    siatka = np.linspace(0.05, 0.25, 2001)
    moce = []
    for soc in siatka:
        x = np.array([0.8, 0.0, soc, 0.0, 1.0], dtype=np.float64)
        moce.append(magazyn.moc_rzeczywista(x, napiecie).real)
    skoki = np.abs(np.diff(np.array(moce)))
    krok_siatki = float(siatka[1] - siatka[0])
    assert float(skoki.max()) < 2.0 * 0.8 * krok_siatki / 0.02
    assert moce[0] == pytest.approx(0.0)
    assert moce[-1] == pytest.approx(0.8)

    with pytest.raises(ValueError, match="pasmo_soc"):
        _magazyn(pasmo_soc=0.0)


@pytest.mark.parametrize(
    ("f_hz", "oczekiwany"),
    [
        (50.0, 0.0),
        (50.15, 0.0),  # w strefie martwej
        (49.85, 0.0),
        (49.0, (1.0 - 0.2) / 50.0 / 0.05),  # LFSM-U: rozładowanie
        (51.0, -(1.0 - 0.2) / 50.0 / 0.05),  # LFSM-O: ładowanie
    ],
)
def test_charakterystyka_czestotliwosciowa_jest_wzorem_ze_strefa_martwa(
    f_hz: float, oczekiwany: float
) -> None:
    """WYROCZNIA ANALITYCZNA statyzmu: ``ΔP = -(Δf - martwa)/f_n/statyzm · S_falownika``.

    Strefa martwa liczy się OD PROGU, a nie od zera — inaczej charakterystyka miałaby
    skok na progu, a moc znamionowa byłaby wysterowana przy innej odchyłce, niż
    deklaruje statyzm.
    """
    magazyn = _magazyn(statyzm_f=0.05, strefa_martwa_f_hz=0.2, s_falownika_pu=1.0)
    assert magazyn.wklad_czestotliwosciowy_pu(f_hz) == pytest.approx(oczekiwany, rel=1e-12)


# ---------------------------------------------------------------------------
# 3. OGRANICZNIKI FALOWNIKA — okrąg, priorytet, prąd
# ---------------------------------------------------------------------------


def test_ogranicznik_falownika_jest_okregiem_a_nie_prostokatem() -> None:
    """Prostokąt dopuściłby ``|S| = √2·S_n`` — 41 % przeciążenia prądowego."""
    p, q = ogranicz_okregiem(1.0, 1.0, 1.0, priorytet_biernej=False)
    assert math.hypot(p, q) == pytest.approx(1.0, rel=1e-12)
    assert math.hypot(p, q) < math.sqrt(2.0) - 0.4


@pytest.mark.parametrize("priorytet_biernej", [True, False])
def test_priorytet_rozstrzyga_ktora_skladowa_ustepuje(priorytet_biernej: bool) -> None:
    p, q = ogranicz_okregiem(0.9, 0.8, 1.0, priorytet_biernej=priorytet_biernej)
    assert math.hypot(p, q) == pytest.approx(1.0, rel=1e-9)
    if priorytet_biernej:
        assert q == pytest.approx(0.8)
        assert p < 0.9
    else:
        assert p == pytest.approx(0.9)
        assert q < 0.8


@pytest.mark.parametrize("v_mod", [1.0, 0.5, 0.2])
@pytest.mark.parametrize(("p_pu", "q_pu"), [(0.9, 0.0), (0.0, 0.9), (0.6, 0.6)])
def test_ogranicznik_pradu_zgadza_sie_z_ogranicznikiem_falownika_gfl(
    v_mod: float, p_pu: float, q_pu: float
) -> None:
    """Falownik GFL i moduły OZE liczą prąd JEDNĄ funkcją — to jest dowód.

    HISTORIA TEGO TESTU. Do 2026-09 ta sama fizyka (rzut prądu na okrąg z
    priorytetem składowej) istniała w laboratorium w TRZECH kopiach: tutaj,
    w `urzadzenia.FalownikGFL.wstrzykniecie` i w
    `urzadzenia.KandydatOgraniczeniaNasycenieZadania`. Test pilnował, żeby kopie
    się nie rozjechały — i wykrył, że jedna JUŻ się rozjechała: gałąź
    ``priorytet_biernej=False`` w `FalownikGFL` skalowała cały wektor
    proporcjonalnie (czyli zachowywała współczynnik mocy) zamiast zachować
    składową czynną i poświęcić bierną, jak robiły pozostałe dwie. Flaga nazywała
    się „priorytet biernej", a jej zaprzeczenie nie dawało priorytetu czynnej.

    Dziś kopia jest JEDNA (`konwencje.ogranicz_prad`), więc ten test przestał być
    porównaniem dwóch implementacji, a stał się sprawdzeniem, że `FalownikGFL`
    faktycznie z niej korzysta — czyli że nikt nie wniósł czwartej kopii pod
    pozorem optymalizacji. Iloczyn cech bez zmian: głębokość zapadu × rozkład P/Q.
    """
    napiecie = v_mod * complex(math.cos(0.2), math.sin(0.2))
    i_max = 1.2
    gfl = FalownikGFL(ref="D", szyna="B", i_max_pu=i_max, priorytet_biernej=True)
    z_gfl = gfl.wstrzykniecie(np.array([p_pu, q_pu], dtype=np.float64), napiecie)
    zadany = complex(np.conj(complex(p_pu, q_pu) / napiecie))
    moj = ogranicz_prad(zadany, napiecie, i_max, priorytet_biernej=True)
    # Tolerancja 1e-7, nie 1e-12, i to jest wynik POMIARU, nie ostrożności:
    # `FalownikGFL` dzieli liczby zespolone numpy, ta funkcja — wbudowane liczby
    # Pythona, a oba używają innego algorytmu dzielenia. Różnica rzędu 1e-16 jest
    # wzmacniana przez pierwiastek zapasu `sqrt(i_max² - i_bierny²)`, który przy
    # głębokim nasyceniu jest bliski zeru (tu ~0,24) — to jest utrata cyfr
    # znaczących na odejmowaniu, a nie różnica fizyki.
    assert moj == pytest.approx(z_gfl, abs=1e-7)
    assert abs(moj) <= i_max + 1e-12


@pytest.mark.parametrize("v_mod", [1.0, 0.4, 0.1])
def test_prad_magazynu_nie_przekracza_ogranicznika(v_mod: float) -> None:
    magazyn = _magazyn(s_falownika_pu=1.0, krotnosc_pradu_max=1.2)
    x = np.array([1.0, 0.3, 0.5, 0.0, 1.0], dtype=np.float64)
    prad = magazyn.wstrzykniecie(x, complex(v_mod, 0.0))
    assert abs(prad) <= magazyn.i_max_pu + 1e-12


def test_ogranicznik_odrzuca_odwrocony_przedzial() -> None:
    """Odwrócony przedział cicho zwracałby granicę dolną — to byłby ogranicznik-atrapa."""
    with pytest.raises(ValueError, match="Pusty przedział"):
        ogranicz_do_przedzialu(0.5, 1.0, 0.0)


def test_ogranicznik_okregu_odrzuca_niedodatnia_moc() -> None:
    with pytest.raises(ValueError, match="s_max_pu"):
        ogranicz_okregiem(0.1, 0.1, 0.0, priorytet_biernej=True)


# ---------------------------------------------------------------------------
# 4. WSPARCIE CZĘSTOTLIWOŚCI W WYSPIE — tu deklaracja spotyka się z energią
# ---------------------------------------------------------------------------

POJEMNOSC_MALA_MWH = 0.02
POJEMNOSC_DUZA_MWH = 2.0
SKOK_PLYTKI = 0.20
SKOK_GLEBOKI = 0.40


@cache
def _wyspa_z_magazynem(e_pojemnosc_mwh: float, g_skok_pu: float) -> WynikDynamiczny:
    """Wydzielenie wyspy, a potem skok obciążenia — scenariusz liczony RAZ.

    DLACZEGO WYSPA. Przy szynie sztywnej częstotliwość jest przybita do 50 Hz, więc
    magazyn nie ma na co reagować; odchyłka trwała powstaje dopiero wtedy, gdy
    bilans mocy czynnej domyka lokalna turbina ze statyzmem. Wyspa jest tu więc
    warunkiem sprawdzalności LFSM, a nie ozdobnikiem scenariusza.

    DLACZEGO WYDZIELENIE, A NIE SIEĆ BEZ SYSTEMU OD POCZĄTKU. Rozpływ startowy
    silnika wymaga szyny odniesienia (sieć z samymi wstrzyknięciami mocy nie ma
    rozwiązania). Układ startuje więc z systemem, przez łącznik o przepływie
    bliskim zeru, i wydziela się w 0,2 s — co jest zarazem realnym scenariuszem
    pracy wyspowej z magazynem.

    DLACZEGO POJEMNOŚCI SĄ MAŁE. Magazyn 1 MW/1 MWh wyczerpuje się w godzinę;
    symulacja RMS z krokiem 10 ms tego okna nie obejmie. Skalujemy więc POJEMNOŚĆ,
    a nie równanie — wzór SOC jest sprawdzany osobno wyrocznią analityczną.
    """
    topologia = TopologiaSieci(
        szyny=("GEN", "SN", "BAT", "SYS"),
        galezie=[
            Galaz("GEN", "SN", 0.01, 0.08),
            Galaz("SN", "BAT", 0.02, 0.06),
            Galaz("SN", "SYS", 0.01, 0.05),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=4.0, d_tlumienie=1.0),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )
    odbior = OdbiorStalejMocy(ref="ODB", szyna="SN", p_pu=-0.6, q_pu=-0.15)
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=e_pojemnosc_mwh,
        s_bazowa_mva=S_BAZOWA_MVA,
        s_falownika_pu=1.0,
        soc_poczatkowy=0.5,
    )
    model = ModelDynamiczny(topologia=topologia, urzadzenia=[zespol, odbior, magazyn])
    silnik, x0 = _uruchom(
        model,
        {"G1": complex(0.604, 0.181), "ODB": complex(-0.6, -0.15), "BAT": 0j},
        integrator="rk4",
        krok_s=0.01,
    )
    harmonogram = HarmonogramZdarzen(
        [
            WylaczenieGalezi(0.2, "SN", "SYS"),
            SkokObciazeniaBocznikowego(0.5, "SN", g_skok_pu),
        ]
    )
    return silnik.symuluj(x0, czas_koncowy_s=8.0, harmonogram=harmonogram)


def _czas_ostatniego_wsparcia(wynik: WynikDynamiczny) -> float:
    """Ostatnia chwila, w której magazyn oddaje więcej niż połowę swojego szczytu."""
    czas = np.array(wynik.czas_s, dtype=np.float64)
    moc = _tablica(wynik, "p_pu", "BAT")
    return float(czas[moc > 0.5 * moc.max()][-1])


def test_pll_magazynu_mierzy_czestotliwosc_wyspy() -> None:
    """Falownik zna częstotliwość TYLKO z własnej pętli — i musi ją znać poprawnie.

    W stanie ustalonym pomiar PLL zgadza się z prędkością maszyny z dokładnością
    lepszą niż 0,01 Hz. W trakcie kołysania oba przebiegi się RÓŻNIĄ (do ~0,7 Hz) i
    tak ma być: PLL mierzy częstotliwość napięcia w SWOIM punkcie sieci, a nie
    prędkość wirnika — sklejenie tych wielkości byłoby wzięciem wielkości, której
    urządzenie nie ma.
    """
    wynik = _wyspa_z_magazynem(POJEMNOSC_DUZA_MWH, SKOK_GLEBOKI)
    czas = np.array(wynik.czas_s, dtype=np.float64)
    f_maszyny = _tablica(wynik, "f_hz", "G1")
    f_pll = 50.0 * _tablica(wynik, "omega_pll_pu", "BAT")
    ustalony = czas >= 7.0
    assert float(np.max(np.abs(f_pll[ustalony] - f_maszyny[ustalony]))) < 0.01
    przejsciowy = (czas > 0.5) & (czas < 2.0)
    assert float(np.max(np.abs(f_pll[przejsciowy] - f_maszyny[przejsciowy]))) > 0.05


def test_wyspa_przed_skokiem_nie_wywoluje_reakcji_magazynu() -> None:
    """Samo wydzielenie wyspy nie może uruchomić wsparcia — inaczej test mierzyłby je.

    Odchyłka po wydzieleniu mieści się w strefie martwej, więc magazyn stoi.
    Bez tego sprawdzenia nie dałoby się orzec, czy późniejsze rozładowanie jest
    odpowiedzią na skok obciążenia, czy artefaktem łączenia.
    """
    wynik = _wyspa_z_magazynem(POJEMNOSC_DUZA_MWH, SKOK_GLEBOKI)
    czas = np.array(wynik.czas_s, dtype=np.float64)
    przed = (czas > 0.3) & (czas < 0.5)
    assert float(np.max(np.abs(_tablica(wynik, "f_hz", "G1")[przed] - 50.0))) < 0.2
    assert float(np.max(np.abs(_tablica(wynik, "p_pu", "BAT")[przed]))) < 1.0e-3


@pytest.mark.parametrize("g_skok", [SKOK_PLYTKI, SKOK_GLEBOKI])
def test_mala_pojemnosc_przestaje_wspierac_czestotliwosc(g_skok: float) -> None:
    """DOWÓD C4/W1 dla pozycji decyzyjnej D-07 — iloczyn (pojemność) × (głębokość).

    Twierdzenie: wsparcie częstotliwości bez stanu energii jest DEKLARACJĄ.
    Dowód: przy identycznym zakłóceniu i identycznej nastawie statyzmu magazyn o
    małej pojemności oddaje TĘ SAMĄ moc początkową co duży, po czym — po wyczerpaniu
    okna SOC — schodzi do zera, a częstotliwość ustala się NIŻEJ. Model bez SOC nie
    umiałby odróżnić tych dwóch przypadków, bo w obu wystawiłby to samo.

    Iloczyn cech jest istotny: różnica musi być widoczna dla płytkiego i dla
    głębokiego zapadu, inaczej wynik mógłby zależeć od trafienia w jeden scenariusz.
    """
    maly = _wyspa_z_magazynem(POJEMNOSC_MALA_MWH, g_skok)
    duzy = _wyspa_z_magazynem(POJEMNOSC_DUZA_MWH, g_skok)

    p_maly = _tablica(maly, "p_pu", "BAT")
    p_duzy = _tablica(duzy, "p_pu", "BAT")
    # Ta sama nastawa statyzmu → ten sam szczyt mocy: różni je WYŁĄCZNIE energia.
    assert p_maly.max() == pytest.approx(p_duzy.max(), rel=0.02)

    assert _czas_ostatniego_wsparcia(maly) < _czas_ostatniego_wsparcia(duzy) - 1.0
    assert p_maly[-1] == pytest.approx(0.0, abs=1.0e-3)
    assert p_duzy[-1] > 0.03

    soc_maly = _tablica(maly, "soc", "BAT")
    soc_duzy = _tablica(duzy, "soc", "BAT")
    assert soc_maly[-1] < 0.11
    assert soc_duzy[-1] > 0.45
    # Przeregulowanie poniżej okna jest ograniczone iloczynem P·T_p (zjazd mocy do
    # zera ma stałą czasową falownika) — twardej ściany energetycznej model nie ma,
    # bo nie ma jej też system zarządzania baterią.
    assert soc_maly[-1] > 0.1 - 0.02

    f_maly = _tablica(maly, "f_hz", "G1")
    f_duzy = _tablica(duzy, "f_hz", "G1")
    assert f_maly[-1] < f_duzy[-1] - 0.05


@pytest.mark.parametrize("e_mwh", [POJEMNOSC_MALA_MWH, POJEMNOSC_DUZA_MWH])
def test_glebszy_skok_daje_glebszy_zapad_i_wiekszy_wklad(e_mwh: float) -> None:
    """Własność metamorficzna po drugiej osi iloczynu: głębokość zakłócenia."""
    plytki = _wyspa_z_magazynem(e_mwh, SKOK_PLYTKI)
    gleboki = _wyspa_z_magazynem(e_mwh, SKOK_GLEBOKI)
    assert _tablica(gleboki, "f_hz", "G1").min() < _tablica(plytki, "f_hz", "G1").min() - 0.1
    assert _tablica(gleboki, "p_pu", "BAT").max() > _tablica(plytki, "p_pu", "BAT").max() + 0.05


@pytest.mark.parametrize("e_mwh", [POJEMNOSC_MALA_MWH, POJEMNOSC_DUZA_MWH])
@pytest.mark.parametrize("g_skok", [SKOK_PLYTKI, SKOK_GLEBOKI])
def test_bilans_energii_zgadza_sie_z_calka_mocy(e_mwh: float, g_skok: float) -> None:
    """WYROCZNIA ANALITYCZNA na sprzężeniu SOC↔moc, na pełnym iloczynie cech.

    Ubytek energii odczytany ze stanu naładowania musi się zgadzać z całką mocy
    ODDANEJ do sieci: ``(soc0 - soc_k)·E = ∫P dt · S_bazowa/3600``. To jest jedyny
    test, który wykryłby pomyłkę o czynnik bazy mocy albo o sekundy/godziny —
    wielkości, które w przebiegu wyglądają zupełnie wiarygodnie.
    """
    wynik = _wyspa_z_magazynem(e_mwh, g_skok)
    czas = np.array(wynik.czas_s, dtype=np.float64)
    moc = _tablica(wynik, "p_pu", "BAT")
    soc = _tablica(wynik, "soc", "BAT")
    energia_z_calki_mwh = float(np.trapz(moc, czas)) * S_BAZOWA_MVA / 3600.0
    energia_z_soc_mwh = float(soc[0] - soc[-1]) * e_mwh
    assert energia_z_soc_mwh > 0.0
    assert energia_z_calki_mwh == pytest.approx(energia_z_soc_mwh, rel=0.005)


def test_przebiegi_urzadzen_maja_dlugosc_osi_czasu() -> None:
    """Każdy sygnał ma tyle próbek, ile jest chwil — inaczej przebieg jest zlepkiem.

    Zbieracz przebiegów silnika kluczuje próbki parą ``(klucz, element_ref)``, a
    zapisuje osobno wielkości wyjściowe (``p_pu``, ``q_pu``, ``i_pu``) i osobno
    KAŻDY stan pod jego nazwą. Urządzenie o stanie nazwanym ``p_pu`` dostaje więc
    dwie próbki na krok pod jednym kluczem — przebieg jest dwa razy dłuższy od osi
    czasu i miesza moc zadaną z oddaną. Ten test pilnuje, że modele z tego modułu
    nie wnoszą takiej kolizji.
    """
    wynik = _wyspa_z_magazynem(POJEMNOSC_DUZA_MWH, SKOK_PLYTKI)
    oczekiwana = len(wynik.czas_s)
    for sygnal in wynik.sygnaly:
        assert len(sygnal.wartosci) == oczekiwana, f"{sygnal.klucz}@{sygnal.element_ref}"


def test_skok_obciazenia_odrzuca_ujemna_konduktancje() -> None:
    """Ujemna konduktancja byłaby ŹRÓDŁEM mocy podanym jako odbiór."""
    with pytest.raises(ValueError, match="fabrykacja"):
        SkokObciazeniaBocznikowego(czas_s=1.0, szyna="SN", g_pu=-0.1)


# ---------------------------------------------------------------------------
# 5. REGULATOR ELEKTROWNI — ocena jest w PCC, nie na module
# ---------------------------------------------------------------------------


def _przebieg_elektrowni(
    *,
    liczba_modulow: int = 2,
    strategia: str = "proporcjonalna",
    limit: float | None = None,
    t_telemetrii_s: float = 0.3,
    p_start: float = 0.2,
    p_po_skoku: float = 0.9,
    q_zadane: float = 0.0,
    czas_koncowy_s: float = 4.0,
    jednostki: list | None = None,
) -> tuple[RegulatorElektrowniPPC, SilnikRMS, WynikDynamiczny]:
    """Elektrownia startuje z małego zadania, po czym dostaje SKOK dyspozycji.

    Zadanie zmienia się PO inicjalizacji, więc scenariusz bada tor: dyspozycja →
    telemetria → alokacja → moduły → moc w PCC. Bez skoku wszystkie stałe czasowe
    i limit byłyby nierozróżnialne od nastaw początkowych.
    """
    ppc = RegulatorElektrowniPPC(
        ref="EL",
        szyna="PCC",
        jednostki=jednostki if jednostki is not None else _moduly(liczba_modulow),
        strategia=strategia,
        limit_eksportu_pu=limit,
        t_telemetrii_s=t_telemetrii_s,
    )
    model = ModelDynamiczny(topologia=_siec_pcc(), urzadzenia=[ppc])
    silnik, x0 = _uruchom(model, {"EL": complex(p_start, q_zadane)}, integrator="rk4", krok_s=0.005)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI
    ppc.p_zadane_pu = p_po_skoku
    return ppc, silnik, silnik.symuluj(x0, czas_koncowy_s=czas_koncowy_s)


@pytest.mark.parametrize("strategia", ["proporcjonalna", "priorytetowa"])
@pytest.mark.parametrize("liczba_modulow", [2, 3])
def test_suma_alokacji_rowna_sie_zadaniu_gdy_limit_nieaktywny(
    strategia: str, liczba_modulow: int
) -> None:
    """Iloczyn (strategia) × (liczba modułów): bez limitu elektrownia oddaje zadanie.

    Zadanie 0,9 p.u. mieści się w mocy zainstalowanej (0,9 albo 1,0 p.u.), więc
    moc w PCC musi je osiągnąć — niezależnie od tego, JAK zostało rozdzielone.
    Strategia alokacji nie może zmieniać sumy; gdyby zmieniała, byłaby fizyką, a
    jest podziałem.
    """
    _, _, wynik = _przebieg_elektrowni(strategia=strategia, liczba_modulow=liczba_modulow)
    moc_pcc = _tablica(wynik, "p_pu", "EL")
    assert moc_pcc[-1] == pytest.approx(0.9, abs=2.0e-3)


@pytest.mark.parametrize("strategia", ["proporcjonalna", "priorytetowa"])
@pytest.mark.parametrize("liczba_modulow", [2, 3])
def test_limit_eksportu_jest_dotrzymany_w_pcc(strategia: str, liczba_modulow: int) -> None:
    """Iloczyn (strategia) × (liczba modułów) przy AKTYWNYM ograniczeniu eksportu.

    Zgodność ocenia się w PCC, więc limit sprawdzany jest na mocy zagregowanej,
    a nie na zadaniach modułów. Sprawdzane są dwie rzeczy naraz: limit jest
    dotrzymany w stanie ustalonym ORAZ nie jest przekroczony po drodze — elektrownia
    ograniczana narasta DO limitu, a nie przez limit z powrotem.
    """
    limit = 0.5
    _, _, wynik = _przebieg_elektrowni(
        strategia=strategia, liczba_modulow=liczba_modulow, limit=limit
    )
    moc_pcc = _tablica(wynik, "p_pu", "EL")
    assert float(moc_pcc.max()) <= limit + 1.0e-6
    assert moc_pcc[-1] == pytest.approx(limit, abs=1.0e-3)


@pytest.mark.parametrize("strategia", ["proporcjonalna", "priorytetowa"])
def test_ciasniejszy_limit_daje_mniejsza_moc_w_pcc(strategia: str) -> None:
    """Własność metamorficzna: limit jest wielkością CIĄGŁĄ, nie przełącznikiem."""
    koncowe = []
    for limit in (0.2, 0.4, 0.6, None):
        _, _, wynik = _przebieg_elektrowni(strategia=strategia, limit=limit)
        koncowe.append(float(_tablica(wynik, "p_pu", "EL")[-1]))
    assert koncowe == sorted(koncowe)
    assert koncowe[0] == pytest.approx(0.2, abs=1e-3)
    assert koncowe[-1] > koncowe[-2]


def test_alokacja_proporcjonalna_jest_wg_mocy_znamionowej() -> None:
    """Udziały modułów muszą być w stosunku ich mocy znamionowych (0,6 : 0,3 : 0,1)."""
    ppc, silnik, wynik = _przebieg_elektrowni(strategia="proporcjonalna", liczba_modulow=3)
    moce = [float(_tablica(wynik, f"M{i}.p_wyjscia_pu", "EL")[-1]) for i in (1, 2, 3)]
    suma = sum(moce)
    for moc, znamionowa in zip(moce, (0.6, 0.3, 0.1), strict=True):
        assert moc / suma == pytest.approx(znamionowa / 1.0, rel=1e-3)


def test_alokacja_priorytetowa_nasyca_moduly_po_kolei() -> None:
    """Strategia priorytetowa wypełnia moduły w kolejności DEKLARACJI, do ich mocy."""
    _, _, wynik = _przebieg_elektrowni(strategia="priorytetowa", liczba_modulow=3, limit=0.7)
    m1 = float(_tablica(wynik, "M1.p_wyjscia_pu", "EL")[-1])
    m2 = float(_tablica(wynik, "M2.p_wyjscia_pu", "EL")[-1])
    m3 = float(_tablica(wynik, "M3.p_wyjscia_pu", "EL")[-1])
    assert m1 == pytest.approx(0.6, abs=1e-3)
    assert m2 == pytest.approx(0.1, abs=1e-3)
    assert m3 == pytest.approx(0.0, abs=1e-6)


def test_limit_eksportu_nie_ogranicza_poboru() -> None:
    """Limit dotyczy EKSPORTU. Pobór (np. ładowanie magazynu) nie jest eksportem."""
    ppc, _, wynik = _przebieg_elektrowni(limit=0.3, p_po_skoku=-0.5)
    assert ppc.cel_plantu()[0] == pytest.approx(-0.5)
    assert float(_tablica(wynik, "p_pu", "EL")[-1]) == pytest.approx(-0.5, abs=2e-3)


def test_moc_w_pcc_jest_suma_modulow() -> None:
    """Tożsamość agregacji — bez sieci wewnętrznej suma modułów JEST mocą w PCC.

    Deklaracja z docstringa klasy („dlatego ograniczenie realizowane jest w przód")
    opiera się dokładnie na tej tożsamości; bez testu byłaby założeniem.
    """
    ppc, silnik, _ = _przebieg_elektrowni(liczba_modulow=3)
    x = silnik.inicjalizuj({"EL": complex(0.5, 0.05)})
    wycinek = silnik.uklad.wycinki["EL"]
    napiecie = complex(silnik.rozwiaz_siec(x)[silnik.model.topologia.indeks["PCC"]])
    suma = sum(ppc.moce_jednostek(x[wycinek], napiecie).values())
    assert ppc.moc_w_pcc(x[wycinek], napiecie) == pytest.approx(suma, abs=1e-12)


@pytest.mark.parametrize("t_telemetrii", [0.1, 0.3, 1.0])
def test_opoznienie_telemetrii_ma_konsekwencje(t_telemetrii: float) -> None:
    """Opóźnienie regulacji nadrzędnej MUSI być widoczne w przebiegu.

    Parametr, którego nie widać w wyniku, jest phantomem (defekt P2-01 audytu:
    pole ``integrator`` w kontrakcie, którego silnik nigdy nie czytał). Mierzymy
    czas dojścia do 90 % skoku i wymagamy monotoniczności względem stałej czasowej.
    """
    _, _, wynik = _przebieg_elektrowni(t_telemetrii_s=t_telemetrii, czas_koncowy_s=6.0)
    czas = np.array(wynik.czas_s, dtype=np.float64)
    moc = _tablica(wynik, "p_pu", "EL")
    prog = 0.2 + 0.9 * (0.9 - 0.2)
    czas_do_progu = float(czas[moc >= prog][0])
    oczekiwany = {0.1: (0.2, 0.45), 0.3: (0.7, 1.2), 1.0: (2.0, 3.0)}[t_telemetrii]
    assert oczekiwany[0] <= czas_do_progu <= oczekiwany[1]


def test_elektrownia_hybrydowa_dysponuje_magazyn() -> None:
    """Magazyn jako MODUŁ elektrowni: dyspozycja z PPC musi go realnie uruchomić.

    Kolejność priorytetowa (moduł źródłowy, potem magazyn) jest tu treścią, a nie
    dekoracją: przy zadaniu 0,5 p.u. magazyn dostaje zero i układ jest równowagą
    (SOC się nie zmienia), a dopiero zadanie ponad moc modułu źródłowego sięga po
    energię — i wtedy SOC MUSI maleć.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="PCC",
        e_pojemnosc_mwh=0.5,
        s_bazowa_mva=S_BAZOWA_MVA,
        s_falownika_pu=0.4,
        soc_poczatkowy=0.6,
    )
    jednostki = [JednostkaSterowanaPQ(ref="PV", s_zn_pu=0.6), magazyn]
    ppc, _, wynik = _przebieg_elektrowni(
        strategia="priorytetowa", jednostki=jednostki, p_start=0.5, p_po_skoku=0.9
    )
    pv = _tablica(wynik, "PV.p_wyjscia_pu", "EL")
    bat = _tablica(wynik, "BAT.p_wyjscia_pu", "EL")
    soc = _tablica(wynik, "BAT.soc", "EL")
    assert bat[0] == pytest.approx(0.0, abs=1e-9)
    assert soc[0] == pytest.approx(0.6)
    assert pv[-1] == pytest.approx(0.6, abs=1e-3)
    assert bat[-1] == pytest.approx(0.3, abs=1e-3)
    assert soc[-1] < soc[0]
    ubytek_mwh = float(soc[0] - soc[-1]) * 0.5
    assert ubytek_mwh == pytest.approx(
        float(np.trapz(bat, np.array(wynik.czas_s))) * S_BAZOWA_MVA / 3600.0, rel=0.05
    )


@pytest.mark.parametrize(
    ("kwargs", "wzorzec"),
    [
        ({"jednostki": []}, "bez modułów"),
        ({"t_telemetrii_s": 0.0}, "t_telemetrii_s"),
        ({"strategia": "losowa"}, "strategia"),
        ({"limit_eksportu_pu": -0.1}, "limit"),
    ],
)
def test_regulator_odrzuca_niespojna_konfiguracje(kwargs: dict, wzorzec: str) -> None:
    parametry = {"ref": "EL", "szyna": "PCC", "jednostki": _moduly(2)}
    parametry.update(kwargs)
    with pytest.raises(ValueError, match=wzorzec):
        RegulatorElektrowniPPC(**parametry)


def test_regulator_odrzuca_modul_na_innej_szynie() -> None:
    """Model nie ma sieci wewnętrznej, więc moduł spoza PCC byłby liczony źle.

    To nie jest ograniczenie do obejścia parametrem — to granica modelu, więc
    kończy się błędem, a nie cichym przyjęciem złego punktu.
    """
    obcy = MagazynEnergiiBESS(
        ref="BAT", szyna="INNA", e_pojemnosc_mwh=1.0, s_bazowa_mva=S_BAZOWA_MVA
    )
    with pytest.raises(ValueError, match="deklaruje szynę"):
        RegulatorElektrowniPPC(ref="EL", szyna="PCC", jednostki=[*_moduly(1), obcy])


# ---------------------------------------------------------------------------
# 6. MASZYNA DWUSTRONNIE ZASILANA — typ urządzenia MUSI mieć konsekwencję
# ---------------------------------------------------------------------------


def _siec_der() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("DER", "MID", "SYS"),
        galezie=[Galaz("DER", "MID", 0.02, 0.10), Galaz("MID", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


@cache
def _przebieg_der(
    rodzaj: str,
    *,
    r_r_pu: float = 0.01,
    k_rsc: float = 0.02,
    i_max_pu: float = 1.2,
    x_f_pu: float = 0.05,
    czas_trwania_s: float = 0.15,
    czas_koncowy_s: float = 3.0,
) -> WynikDynamiczny:
    """Zwarcie na szynie pośredniej — TA SAMA sieć i to samo zdarzenie dla obu typów."""
    if rodzaj == "dfig":
        urzadzenie = MaszynaDwustronnieZasilana3Rzedu(
            ref="D", szyna="DER", r_r_pu=r_r_pu, k_rsc=k_rsc
        )
    elif rodzaj == "gfl":
        urzadzenie = FalownikGFL(ref="D", szyna="DER", i_max_pu=i_max_pu)
    else:  # pragma: no cover - błąd w teście, nie w modelu
        raise ValueError(f"Nieznany rodzaj urządzenia: {rodzaj}")
    model = ModelDynamiczny(topologia=_siec_der(), urzadzenia=[urzadzenie])
    silnik, x0 = _uruchom(model, {"D": complex(0.6, 0.0)}, integrator="rk4", krok_s=0.002)
    assert silnik.norma_pochodnej(x0) < TOL_ROWNOWAGI
    harmonogram = HarmonogramZdarzen(
        [
            ZwarcieTrojfazowe(0.5, "MID", x_f_pu=x_f_pu),
            ZdjecieZwarcia(0.5 + czas_trwania_s, "MID"),
        ]
    )
    return silnik.symuluj(x0, czas_koncowy_s=czas_koncowy_s, harmonogram=harmonogram)


def test_maszyna_dwustronnie_zasilana_i_falownik_daja_rozne_prady_zwarciowe() -> None:
    """DOWÓD C4/W1 dla pozycji decyzyjnej D-12 — technologia MUSI zmieniać wynik.

    Ta sama sieć, to samo zwarcie, ta sama moc w punkcie pracy. Różni je wyłącznie
    MODEL URZĄDZENIA — i to musi wystarczyć, żeby przebiegi się rozeszły. W
    audytowanej produkcji wynik nie zależał od urządzenia (defekt P0-07), więc
    turbina typu 3 i falownik fotowoltaiczny dawały ten sam zapad i ten sam prąd.

    Mechanizm różnicy jest nazwany, a nie tylko zmierzony: stojan maszyny jest
    przyłączony do sieci BEZPOŚREDNIO, więc maszyna jest źródłem NAPIĘCIOWYM za
    reaktancją przejściową i przy zapadzie oddaje prąd wielokrotnie większy od
    znamionowego, podtrzymując napięcie w miejscu przyłączenia. Falownik
    pełnomocowy jest źródłem PRĄDOWYM z ogranicznikiem — jego prąd zwarciowy jest
    z definicji ograniczony nastawą regulatora.
    """
    dfig = _przebieg_der("dfig")
    gfl = _przebieg_der("gfl")

    i_dfig = _tablica(dfig, "i_pu", "D")
    i_gfl = _tablica(gfl, "i_pu", "D")
    assert i_gfl.max() <= 1.2 + 1e-9
    assert i_dfig.max() > 1.8 * i_gfl.max()

    u_dfig = _tablica(dfig, "u_pu", "DER")
    u_gfl = _tablica(gfl, "u_pu", "DER")
    assert u_dfig.min() > u_gfl.min() + 0.10

    # PRZESTRZEŃ JAWNIE: `FalownikGFL` ma stan nazwany `p_pu`, więc bez wskazania
    # przestrzeni pytanie „daj p_pu@D" jest niejednoznaczne. Porównujemy moc
    # ODDANĄ na zacisku (WYJŚCIE), spójnie z napięciem wyżej — nie zmienną stanu
    # regulatora, której DFIG w ogóle nie ma.
    p_dfig = _tablica(dfig, "p_pu", "D", PrzestrzenSygnalu.WYJSCIE)
    p_gfl = _tablica(gfl, "p_pu", "D", PrzestrzenSygnalu.WYJSCIE)
    assert p_dfig.min() < p_gfl.min() - 0.10
    assert float(np.max(np.abs(p_dfig - p_gfl))) > 0.2


def test_maszyna_zglasza_wyjscie_poza_zakres_waznosci_przy_zapadzie() -> None:
    """Model bez crowbaru MUSI powiedzieć, kiedy przestaje być ważny.

    Sprawdzane dwiema drogami, bo każda z osobna byłaby słabsza:
      1. bezpośrednio — w punkcie pracy model jest ważny, przy napięciu 0,15 p.u.
         już nie i zgłasza to wyjątkiem, a nie liczbą;
      2. z PRZEBIEGU — z zapisanego prądu stojana i SEM wynika dolne oszacowanie
         prądu wirnika ``|i_r| >= (X_m/X_rr)·|I| - |E'|/X_m``, które podczas zwarcia
         przekracza granicę przekształtnika. Czyli nie jest to własność
         wykonstruowana na potrzeby testu, tylko cecha policzonego przebiegu.
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER")
    x0 = maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))
    assert maszyna.czy_w_zakresie_waznosci(x0, complex(1.0, 0.0))
    maszyna.sprawdz_zakres_waznosci(x0, complex(1.0, 0.0))

    zapad = complex(0.15, 0.0)
    assert not maszyna.czy_w_zakresie_waznosci(x0, zapad)
    # Wiążące jest kryterium PRĄDOWE — i tak jest fizycznie: crowbar chroni
    # przekształtnik przed przetężeniem wirnika, a nie przed przepięciem. Napięcie
    # zadane pozostaje w granicy, bo regulator ma niewielkie wzmocnienie; gdyby
    # kryterium było tylko napięciowe, model milczałby przy prądzie 2,5-krotnie
    # przekraczającym możliwości przekształtnika.
    diagnostyka = maszyna.diagnostyka_wirnika(x0, zapad)
    assert diagnostyka["i_wirnika_pu"] > diagnostyka["i_wirnika_max_pu"]
    assert diagnostyka["u_wirnika_zadane_pu"] < diagnostyka["u_wirnika_max_pu"]
    with pytest.raises(PozaZakresemWaznosciModeluError, match="crowbar"):
        maszyna.sprawdz_zakres_waznosci(x0, zapad)

    wynik = _przebieg_der("dfig", x_f_pu=0.0, czas_trwania_s=0.3, czas_koncowy_s=1.2)
    czas = np.array(wynik.czas_s, dtype=np.float64)
    podczas_zwarcia = (czas > 0.51) & (czas < 0.79)
    prad = _tablica(wynik, "i_pu", "D")[podczas_zwarcia]
    sem = np.abs(
        _tablica(wynik, "e_prim_re_pu", "D")[podczas_zwarcia]
        + 1j * _tablica(wynik, "e_prim_im_pu", "D")[podczas_zwarcia]
    )
    dolne_oszacowanie = (maszyna.x_m_pu / maszyna.x_rr_pu) * prad - sem / maszyna.x_m_pu
    assert float(dolne_oszacowanie.max()) > maszyna.i_wirnika_max_pu


def _iloraz_zaniku_sem(wynik: WynikDynamiczny) -> float:
    """``|E'|`` na końcu zwarcia odniesione do ``|E'|`` na jego początku."""
    czas = np.array(wynik.czas_s, dtype=np.float64)
    sem = np.abs(_tablica(wynik, "e_prim_re_pu", "D") + 1j * _tablica(wynik, "e_prim_im_pu", "D"))
    return float(np.interp(0.79, czas, sem) / np.interp(0.51, czas, sem))


def _wspolczynnik_zaniku_z_modelu(
    maszyna: MaszynaDwustronnieZasilana3Rzedu, x: np.ndarray, napiecie: complex
) -> complex:
    """Współczynnik ``A`` linearyzacji ``dE'/dt = A·E' + B`` policzony Z MODELU.

    Przy zadanym (sztywnym) napięciu zacisków równanie strumienia jest ZESPOLENIE
    LINIOWE względem ``E'``, więc iloraz różnicowy po dowolnym kierunku daje ten sam
    ``A``. Test sprawdza to osobno — gdyby model zawierał ukrytą nieliniowość
    (np. nasycenie ogranicznika), ilorazy po osi rzeczywistej i urojonej by się
    rozjechały i wyrocznia analityczna przestałaby obowiązywać.
    """
    krok = 1.0e-6
    f0 = maszyna.pochodne(x, napiecie)
    x_re = x.copy()
    x_re[0] += krok
    f_re = maszyna.pochodne(x_re, napiecie)
    return (complex(f_re[0], f_re[1]) - complex(f0[0], f0[1])) / krok


def _wspolczynnik_zaniku_wyrocznia(
    maszyna: MaszynaDwustronnieZasilana3Rzedu, poslizg: float
) -> complex:
    """Wyprowadzenie NIEZALEŻNE od implementacji, wprost z równań maszyny.

    A = -(1/T0')·[1 + j(X - X')/(r_s + jX')]   (zanik strumienia + reakcja stojana)
        - j·s·OMEGA_S                          (obrót z częstotliwością poślizgu)
        - j·OMEGA_S·(X_m/X_rr)·k_rsc·di_r/dE'  (sterowanie prądem wirnika)
    """
    z_stojana = complex(maszyna.r_s_pu, maszyna.x_prim_pu)
    pochodna_i_wirnika = -1j / maszyna.x_m_pu + (maszyna.x_m_pu / maszyna.x_rr_pu) / z_stojana
    return (
        -(1.0 + 1j * (maszyna.x_ss_pu - maszyna.x_prim_pu) / z_stojana) / maszyna.t0_prim_s
        - 1j * poslizg * 2.0 * math.pi * 50.0
        - 1j
        * 2.0
        * math.pi
        * 50.0
        * (maszyna.x_m_pu / maszyna.x_rr_pu)
        * maszyna.k_rsc
        * pochodna_i_wirnika
    )


@pytest.mark.parametrize("r_r_pu", [0.004, 0.010, 0.025])
@pytest.mark.parametrize("k_rsc", [0.0, 0.02, 0.06])
def test_tempo_zaniku_strumienia_zgadza_sie_z_wyrocznia_analityczna(
    r_r_pu: float, k_rsc: float
) -> None:
    """WYROCZNIA ANALITYCZNA na całym równaniu strumienia — iloczyn (r_r) × (k_rsc).

    Zanik strumienia jest tą własnością, która odróżnia maszynę dwustronnie zasilaną
    od falownika, więc nie może być sprawdzana wyłącznie „na oko z przebiegu": w
    przebiegu zwarciowym miesza się z wymuszeniem od prądu zwarciowego, z obrotem
    poślizgowym i z napięciem wirnika, i każdy z tych członów potrafi ukryć błąd
    w pozostałych. Linearyzacja rozdziela je i pozwala porównać model z ZAMKNIĘTYM
    WZOREM wyprowadzonym niezależnie.
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER", r_r_pu=r_r_pu, k_rsc=k_rsc)
    napiecie = complex(1.0, 0.0)
    x = maszyna.inicjalizuj(napiecie, complex(0.6, 0.0))
    z_modelu = _wspolczynnik_zaniku_z_modelu(maszyna, x, napiecie)
    z_wyroczni = _wspolczynnik_zaniku_wyrocznia(maszyna, 1.0 - 1.15)
    assert z_modelu == pytest.approx(z_wyroczni, rel=1e-6)
    assert z_modelu.real < 0.0


def test_zwarciowa_stala_czasowa_wirnika_jest_krotsza_od_biegu_jalowego() -> None:
    """WYROCZNIA PODRĘCZNIKOWA: ``T' = T0'·X'/X`` — reakcja stojana skraca zanik.

    To jest niezależny od implementacji związek między stałą czasową przy otwartym
    i zwartym stojanie. Model, który by go nie spełniał, miałby błędny człon
    sprzężenia ``j(X - X')·I`` — czyli liczyłby maszynę o innej reaktancji wzajemnej,
    niż deklaruje. Dla ``r_s = 0`` związek jest ścisły.
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER", r_s_pu=0.0, k_rsc=0.0)
    napiecie = complex(1.0, 0.0)
    x = maszyna.inicjalizuj(napiecie, complex(0.6, 0.0))
    tempo = -_wspolczynnik_zaniku_z_modelu(maszyna, x, napiecie).real
    stala_zwarciowa = 1.0 / tempo
    assert stala_zwarciowa == pytest.approx(
        maszyna.t0_prim_s * maszyna.x_prim_pu / maszyna.x_ss_pu, rel=1e-9
    )
    assert stala_zwarciowa < 0.1 * maszyna.t0_prim_s


@pytest.mark.parametrize("k_rsc", [0.0, 0.02, 0.06])
def test_szybszy_zanik_przy_wiekszej_rezystancji_i_wiekszym_wzmocnieniu(k_rsc: float) -> None:
    """Własność metamorficzna po obu osiach naraz — kierunek, nie tylko wartość."""
    tempa = []
    for r_r_pu in (0.004, 0.010, 0.025):
        maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER", r_r_pu=r_r_pu, k_rsc=k_rsc)
        x = maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))
        tempa.append(-_wspolczynnik_zaniku_z_modelu(maszyna, x, complex(1.0, 0.0)).real)
    assert tempa == sorted(tempa)
    maszyna_bez = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER", k_rsc=0.0)
    x_bez = maszyna_bez.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))
    tempo_bez = -_wspolczynnik_zaniku_z_modelu(maszyna_bez, x_bez, complex(1.0, 0.0)).real
    assert tempa[1] >= tempo_bez - 1e-9


def test_sterowanie_odmagnesowujace_obniza_strumien_podczas_zwarcia() -> None:
    """Nastawa regulatora MUSI mieć konsekwencję w przebiegu, nie tylko w linearyzacji.

    Sterowanie odmagnesowujące istnieje po to, żeby ograniczyć prąd zwarciowy przez
    zbicie strumienia. Przy wyłączonym regulatorze (``k_rsc = 0``) napięcie wirnika
    jest stałe i podtrzymuje strumień mimo zwarcia — |E'| spada o kilka procent;
    przy ``k_rsc = 0,06`` spada o połowę. Parametr bez takiej konsekwencji byłby
    phantomem (defekt P2-01 audytu).
    """
    bez = _przebieg_der("dfig", k_rsc=0.0, x_f_pu=0.0, czas_trwania_s=0.3, czas_koncowy_s=1.2)
    z_regulatorem = _przebieg_der(
        "dfig", k_rsc=0.06, x_f_pu=0.0, czas_trwania_s=0.3, czas_koncowy_s=1.2
    )
    assert _iloraz_zaniku_sem(z_regulatorem) < _iloraz_zaniku_sem(bez) - 0.2


def test_zapad_przyspiesza_wirnik() -> None:
    """Moment elektryczny znika razem z napięciem, a moment mechaniczny zostaje.

    Wirnik MUSI przyspieszyć — to jest ta część zjawiska, dla której model ma
    równanie ruchu; brak przyspieszenia oznaczałby, że moment nie zależy od stanu
    sieci, czyli że sprzężenia nie ma.
    """
    wynik = _przebieg_der("dfig", x_f_pu=0.0, czas_trwania_s=0.3, czas_koncowy_s=1.2)
    omega = _tablica(wynik, "omega_wirnika_pu", "D")
    assert omega[0] == pytest.approx(1.15)
    assert omega.max() > omega[0] + 0.005


def test_punkt_pracy_ponad_granica_przeksztaltnika_jest_odrzucany() -> None:
    """Przekształtnik CZĘŚCIOWEJ mocy nie wystawi napięcia dowolnego poślizgu.

    Przy poślizgu 0,6 (prędkość 0,4 p.u.) wymagane napięcie wirnika przekracza
    granicę, więc punkt pracy jest odrzucany zamiast być cicho policzony —
    inaczej model liczyłby turbinę, której przekształtnik nie istnieje.
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER", omega_wirnika_zadana_pu=0.4)
    with pytest.raises(ValueError, match="napięcia wirnika"):
        maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))


def test_model_deklaruje_czego_nie_liczy() -> None:
    """Uczciwa wąska implementacja > szeroka atrapa: lista braków jest kontraktem.

    Lista trafia do komunikatu wyjątku o wyjściu poza zakres ważności, więc nie
    jest ozdobą docstringa — czyta ją ten, kto właśnie dostał liczbę spoza
    dziedziny modelu.
    """
    braki = MaszynaDwustronnieZasilana3Rzedu.ZJAWISKA_NIEOBJETE
    assert len(braki) >= 5
    polaczone = " ".join(braki).lower()
    for zjawisko in ("crowbar", "gsc", "strumienia stojana", "dwumasowy", "składowej zgodnej"):
        assert zjawisko in polaczone
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER")
    x0 = maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))
    with pytest.raises(PozaZakresemWaznosciModeluError) as blad:
        maszyna.sprawdz_zakres_waznosci(x0, complex(0.15, 0.0))
    for zjawisko in braki:
        assert zjawisko in str(blad.value)


def test_nazwa_modelu_odpowiada_liczbie_stanow() -> None:
    """Zawyżanie nazwą było defektem P0-03 — „3. rzędu" znaczy trzy stany."""
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER")
    assert len(maszyna.nazwy_stanow()) == 3
    assert "3Rzedu" in type(maszyna).__name__
    # Prędkość wirnika NIE może nazywać się `omega_pu`: silnik publikuje wtedy
    # sygnał „Częstotliwość [Hz]" z prędkości wirnika, co byłoby fałszem.
    assert "omega_pu" not in maszyna.nazwy_stanow()
    assert "omega_wirnika_pu" in maszyna.nazwy_stanow()


def test_maszyna_nie_udaje_ogranicznika_pradu() -> None:
    """Maszyna asynchroniczna nie ma ogranicznika prądu i model nie może go dorabiać.

    Prąd stojana przy zapadzie przekracza każdą sensowną nastawę falownika —
    dorobienie ogranicznika dałoby wynik ładniejszy i fałszywy (to crowbar
    ogranicza prąd DFIG, a jego w modelu NIE MA).
    """
    maszyna = MaszynaDwustronnieZasilana3Rzedu(ref="D", szyna="DER")
    x0 = maszyna.inicjalizuj(complex(1.0, 0.0), complex(0.6, 0.0))
    assert abs(maszyna.wstrzykniecie(x0, complex(1.0, 0.0))) == pytest.approx(0.6, rel=0.05)
    assert abs(maszyna.wstrzykniecie(x0, complex(0.1, 0.0))) > 4.0


@pytest.mark.parametrize(
    ("kwargs", "wzorzec"),
    [
        ({"r_r_pu": 0.0}, "r_r_pu"),
        ({"k_rsc": -0.01}, "k_rsc"),
        ({"h_s": 0.0}, "h_s"),
        ({"omega_wirnika_zadana_pu": 0.0}, "omega_wirnika_zadana_pu"),
    ],
)
def test_maszyna_odrzuca_niespojne_parametry(kwargs: dict, wzorzec: str) -> None:
    parametry = {"ref": "D", "szyna": "DER"}
    parametry.update(kwargs)
    with pytest.raises(ValueError, match=wzorzec):
        MaszynaDwustronnieZasilana3Rzedu(**parametry)


# ---------------------------------------------------------------------------
# 7. PĘTLA SYNCHRONIZACJI — pomiar, bez którego regulacja f jest zgadywaniem
# ---------------------------------------------------------------------------


def test_nastawy_pll_wynikaja_z_pasma_i_tlumienia() -> None:
    """Nastawy są WYPROWADZONE z ``s² + OMEGA_S·k_p·s + OMEGA_S·k_i``, nie zgadnięte."""
    pll = PetlaSynchronizacjiPLL(pasmo_hz=10.0, tlumienie=0.7)
    omega_n = 2.0 * math.pi * 10.0
    assert pll.k_p * 2.0 * math.pi * 50.0 == pytest.approx(2.0 * 0.7 * omega_n)
    assert pll.k_i * 2.0 * math.pi * 50.0 == pytest.approx(omega_n**2)


@pytest.mark.parametrize("theta_napiecia", [-1.0, 0.0, 0.7])
def test_pll_zsynchronizowany_ma_zerowy_blad_fazy(theta_napiecia: float) -> None:
    pll = PetlaSynchronizacjiPLL()
    napiecie = 0.98 * complex(math.cos(theta_napiecia), math.sin(theta_napiecia))
    theta0, omega0 = pll.stan_poczatkowy(napiecie)
    assert theta0 == pytest.approx(theta_napiecia)
    assert pll.blad_fazy(napiecie, theta0) == pytest.approx(0.0, abs=1e-15)
    assert pll.pochodne(theta0, omega0, napiecie) == pytest.approx((0.0, 0.0), abs=1e-12)


def test_pll_przy_zaniku_napiecia_nie_zgaduje_fazy() -> None:
    """Bez napięcia nie ma pomiaru fazy — model zamraża błąd zamiast go wymyślać."""
    pll = PetlaSynchronizacjiPLL()
    assert pll.blad_fazy(complex(0.0, 0.0), 0.3) == 0.0
