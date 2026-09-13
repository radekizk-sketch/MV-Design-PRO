"""§11.3/11 + §11.3/12 — układ WIELOURZĄDZENIOWY i WIELOZDARZENIOWY.

KOD BADAWCZY — patrz `backend/research/README.md`.

Benchmark: pięć szyn, GPZ jako szyna sztywna, TORY RÓWNOLEGŁE SN1↔SN2 (z jawną
tożsamością, bo bez niej zdarzenie topologiczne wyłączyłoby nie ten tor),
maszyna synchroniczna z AVR i governorem, falownik podążający z trybem FRT oraz
odbiór stałej mocy. Trzy RÓŻNE rodzaje źródeł dynamiki na jednej sieci —
elektromechaniczne (wirnik), przekształtnikowe (pętle P/Q) i algebraiczne
(odbiór) — bo dopiero wtedy „interakcja" znaczy coś więcej niż „dwie kopie tego
samego modelu".

DWA PYTANIA, NA KTÓRE TEN PLIK ODPOWIADA POMIAREM:

§11  Czy urządzenia NAPRAWDĘ na siebie oddziałują przez sieć, czy tylko stoją
     obok siebie w liście? Sprawdzane perturbacją JEDNEGO parametru JEDNEGO
     urządzenia i obserwacją przebiegów POZOSTAŁYCH.

§12  Czy wynik zależy od KOLEJNOŚCI, w jakiej podano zdarzenia? Specyfikacja
     fizyczna nie zna kolejności listy — dwa harmonogramy o tym samym zbiorze
     zdarzeń opisują ten sam scenariusz i MUSZĄ dać ten sam przebieg.
"""

from __future__ import annotations

import hashlib
import itertools
import json

import numpy as np
import pytest
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny
from dynamic_lab.zdarzenia import (
    HarmonogramZdarzen,
    WylaczenieGalezi,
    ZdjecieZwarcia,
    ZwarcieTrojfazowe,
)

MOCE = {"G1": complex(0.5, 0.1), "DER": complex(0.4, 0.0), "ODB": complex(-0.4, -0.1)}
CZAS_KONCOWY_S = 2.0
KROK_S = 0.004


def _topologia() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("GPZ", "SN1", "SN2", "GEN", "DER"),
        galezie=[
            Galaz("GPZ", "SN1", 0.02, 0.08),
            # Tory równoległe MUSZĄ mieć jawną tożsamość — numer nadany po
            # kolejności rekordów nie jest tożsamością i permutacja listy
            # gałęzi wyłączyłaby inny tor niż zamierzony.
            Galaz("SN1", "SN2", 0.04, 0.10, ident="tor-1"),
            Galaz("SN1", "SN2", 0.05, 0.12, ident="tor-2"),
            Galaz("SN1", "GEN", 0.03, 0.09),
            Galaz("SN2", "DER", 0.05, 0.12),
        ],
        szyny_sztywne={"GPZ": complex(1.0, 0.0)},
    )


def _model(
    *, h_s: float = 4.0, k_frt: float = 2.0, p_odbioru: float = -0.4, k_qu: float = 5.0
) -> ModelDynamiczny:
    """Falownik ma NIEZEROWY statyzm Q(U) — i to jest wybór konieczny, nie kosmetyka.

    Przy ``k_qu = 0`` (wartość domyślna klasy) falownik poza trybem FRT jest
    źródłem o stałym zadaniu P i Q: żadna zmiana napięcia nie rusza jego mocy.
    Na takim ustawieniu „interakcja przez sieć" byłaby niemierzalna od strony
    mocy — nie dlatego, że sprzężenia nie ma, tylko dlatego, że urządzenie nie
    ma nim czym zareagować. Statyzm Q(U) jest ustawieniem realnym (wymaganym
    zresztą przez kodeksy sieciowe) i czyni sprzężenie obserwowalnym.
    """
    return ModelDynamiczny(
        topologia=_topologia(),
        urzadzenia=[
            ZespolSynchroniczny(
                maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="GEN", h_s=h_s),
                avr=RegulatorNapiecia(),
                governor=RegulatorTurbiny(),
            ),
            FalownikGFL(ref="DER", szyna="DER", i_max_pu=1.2, k_frt=k_frt, k_qu=k_qu),
            OdbiorStalejMocy(ref="ODB", szyna="SN2", p_pu=p_odbioru, q_pu=-0.1),
        ],
    )


def _bieg(zdarzenia, **parametry) -> WynikDynamiczny:
    model = _model(**parametry)
    silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=KROK_S)
    moce = dict(MOCE)
    if "p_odbioru" in parametry:
        moce["ODB"] = complex(parametry["p_odbioru"], -0.1)
    return silnik.symuluj(
        silnik.inicjalizuj(moce),
        czas_koncowy_s=CZAS_KONCOWY_S,
        harmonogram=HarmonogramZdarzen(list(zdarzenia)),
    )


def _odcisk_przebiegow(wynik: WynikDynamiczny) -> str:
    """Odcisk WSZYSTKICH przebiegów biegu — surowy `repr`, bez kwantyzacji.

    Bez kwantyzacji świadomie: tu nie porównujemy maszyn, tylko dwa biegi w JEDNYM
    procesie. Różnica ostatniego bitu byłaby prawdziwą różnicą wyniku, a nie
    szumem międzymaszynowym, i nie wolno jej zetrzeć.
    """
    ser = {
        f"{s.przestrzen.value}.{s.klucz}@{s.element_ref}": [repr(x) for x in s.wartosci]
        for s in wynik.sygnaly
    }
    return hashlib.sha256(json.dumps(ser, sort_keys=True).encode("utf-8")).hexdigest()


def _seria(wynik: WynikDynamiczny, klucz: str, ref: str, przestrzen=PrzestrzenSygnalu.WYJSCIE):
    return np.asarray(wynik.sygnal(klucz, ref, przestrzen).wartosci, dtype=np.float64)


SCENARIUSZ = (
    ZwarcieTrojfazowe(czas_s=0.5, szyna="SN2", x_f_pu=0.2),
    WylaczenieGalezi(czas_s=0.5, od_szyny="SN1", do_szyny="SN2", ident="tor-2"),
    ZdjecieZwarcia(czas_s=0.62, szyna="SN2"),
)


# ---------------------------------------------------------------------------
# 0. CZY BENCHMARK W OGÓLE COŚ ROBI
# ---------------------------------------------------------------------------


def test_benchmark_zbiega_i_zdarzenia_naprawde_zmieniaja_przebieg() -> None:
    """Bez tego testu cała reszta pliku mogłaby porównywać sześć kopii ciszy."""
    z_zakloceniem = _bieg(SCENARIUSZ)
    bez_zaklocenia = _bieg(())
    assert z_zakloceniem.diagnostyka.zbiegl
    assert bez_zaklocenia.diagnostyka.zbiegl

    u_z = _seria(z_zakloceniem, "u_pu", "DER")
    u_bez = _seria(bez_zaklocenia, "u_pu", "DER")
    assert float(np.max(np.abs(u_z - u_bez))) > 0.1, "zwarcie nie ruszyło napięcia"

    omega = _seria(z_zakloceniem, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
    assert float(np.max(np.abs(omega - 1.0))) > 1.0e-4, "wirnik nie zareagował na zwarcie"


# ---------------------------------------------------------------------------
# §11 — INTERAKCJA: urządzenia oddziałują PRZEZ SIEĆ, a nie stoją obok siebie
# ---------------------------------------------------------------------------


def test_bezwladnosc_MASZYNY_zmienia_przebieg_FALOWNIKA() -> None:
    """Perturbacja JEDNEGO parametru JEDNEGO urządzenia musi dojść do DRUGIEGO.

    Bezwładność H należy wyłącznie do maszyny; falownik nie ma do niej dostępu.
    Jeżeli zmiana H nie rusza przebiegu falownika, to znaczy, że urządzenia są
    policzone osobno i „sieć" jest w tym modelu dekoracją — dokładnie ta klasa
    defektu, którą audyt wykrył jako wynik niezależny od urządzenia (P0-07).
    """
    lekka = _bieg(SCENARIUSZ, h_s=2.0)
    ciezka = _bieg(SCENARIUSZ, h_s=8.0)
    for klucz in ("u_pu", "q_pu"):
        a = _seria(lekka, klucz, "DER")
        b = _seria(ciezka, klucz, "DER")
        assert float(np.max(np.abs(a - b))) > 1.0e-6, (
            f"zmiana bezwładności maszyny NIE zmieniła {klucz} falownika — "
            f"urządzenia nie są sprzężone przez sieć"
        )


def test_moc_CZYNNA_falownika_NIE_reaguje_poza_trybem_FRT_i_tak_ma_byc() -> None:
    """Granica modelu, zmierzona i nazwana — a nie odkryta przez kogoś na własnym biegu.

    Falownik podążający ma tor mocy czynnej sterowany ZADANIEM (``p_ref``), bez
    statyzmu P(U) i bez statyzmu P(f). Dopóki nie wejdzie w tryb FRT i dopóki
    ogranicznik okręgu nie jest aktywny, jego ``P`` jest STAŁE co do bitu,
    niezależnie od tego, co dzieje się w sieci.

    Pierwsza wersja testu interakcji sprawdzała `p_pu` razem z `u_pu` i `q_pu` i
    czerwieniła się na tym kanale — ZMIERZONA różnica wynosiła 1,67e-16, czyli
    dokładnie zero w arytmetyce maszynowej. To nie był defekt sprzężenia, tylko
    błąd oczekiwania: kanał, który z konstrukcji modelu nie może zareagować, nie
    jest dowodem braku sprzężenia.
    """
    lekka = _bieg(SCENARIUSZ, h_s=2.0)
    ciezka = _bieg(SCENARIUSZ, h_s=8.0)
    p_lekka = _seria(lekka, "p_pu", "DER")
    p_ciezka = _seria(ciezka, "p_pu", "DER")

    # (1) Kanał P NIE PRZENOSI sprzężenia od maszyny: różnica poniżej szumu
    #     zmiennoprzecinkowego, choć napięcie i moc bierna różnią się mierzalnie.
    assert float(np.max(np.abs(p_lekka - p_ciezka))) < 1.0e-12

    # (2) P trzyma zadanie z dokładnością do ograniczenia OKRĘGIEM. Zmierzone
    #     odchylenie 3,16e-05 p.u. NIE pochodzi ze statyzmu P (takiego nie ma),
    #     tylko stąd, że podniesione przez statyzm Q(U) zapotrzebowanie na moc
    #     bierną zjada margines okręgu i ścina czynną. Pierwsza wersja tego testu
    #     żądała tu ZERA co do bitu i czerwieniła się — oczekiwanie było błędne,
    #     bo pomijało sprzężenie P i Q wewnątrz jednego ogranicznika.
    assert float(np.max(np.abs(p_lekka - 0.4))) < 1.0e-4, "P odeszło od zadania za daleko"
    assert (
        float(np.max(np.abs(p_lekka - 0.4))) > 1.0e-9
    ), "P jest zupełnie niewrażliwe — wtedy ogranicznik okręgu nie działa wcale"

    # ...a przy GŁĘBOKIM zapadzie, gdy tryb FRT rezerwuje prąd bierny, TEN SAM
    # kanał reaguje — czyli brak reakcji wyżej jest własnością PUNKTU PRACY,
    # nie martwym torem.
    glebokie = (
        ZwarcieTrojfazowe(czas_s=0.5, szyna="DER", x_f_pu=0.05),
        ZdjecieZwarcia(czas_s=0.62, szyna="DER"),
    )
    p_frt = _seria(_bieg(glebokie), "p_pu", "DER")
    assert (
        float(np.max(np.abs(p_frt - 0.4))) > 0.05
    ), "tryb FRT nie ruszył mocy czynnej — tor P byłby wtedy martwy"


def test_wzmocnienie_FRT_falownika_zmienia_przebieg_MASZYNY() -> None:
    """Kierunek przeciwny — sprzężenie musi działać w obie strony.

    Test w jedną stronę pokazywałby tylko, że maszyna wpływa na sieć; falownik
    wstrzykujący prąd bierny podczas zapadu podnosi napięcie, więc zmienia moment
    elektryczny maszyny, a przez niego jej prędkość.
    """
    bez_wsparcia = _bieg(SCENARIUSZ, k_frt=0.0)
    ze_wsparciem = _bieg(SCENARIUSZ, k_frt=4.0)
    omega_a = _seria(bez_wsparcia, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
    omega_b = _seria(ze_wsparciem, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
    assert (
        float(np.max(np.abs(omega_a - omega_b))) > 1.0e-8
    ), "wsparcie napięciowe falownika NIE zmieniło prędkości maszyny"
    kat_a = _seria(bez_wsparcia, "delta_rad", "G1", PrzestrzenSygnalu.STAN)
    kat_b = _seria(ze_wsparciem, "delta_rad", "G1", PrzestrzenSygnalu.STAN)
    assert float(np.max(np.abs(kat_a - kat_b))) > 1.0e-8


def test_ODBIOR_posredniczy_miedzy_zrodlami() -> None:
    """Trzeci uczestnik: zmiana obciążenia musi ruszyć OBA źródła naraz.

    Odbiór nie ma stanu dynamicznego, więc gdyby sprzężenie szło wyłącznie przez
    stany, ten test by nie przeszedł — a przechodzi, bo sprzężenie idzie przez
    ALGEBRĘ SIECI, i o to chodzi.
    """
    lekki = _bieg(SCENARIUSZ, p_odbioru=-0.2)
    ciezki = _bieg(SCENARIUSZ, p_odbioru=-0.6)
    omega = np.max(
        np.abs(
            _seria(lekki, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
            - _seria(ciezki, "omega_pu", "G1", PrzestrzenSygnalu.STAN)
        )
    )
    p_der = np.max(np.abs(_seria(lekki, "p_pu", "DER") - _seria(ciezki, "p_pu", "DER")))
    assert float(omega) > 1.0e-8
    assert float(p_der) > 1.0e-8


# ---------------------------------------------------------------------------
# §12 — TOŻSAMOŚĆ ZDARZEŃ PRZY PERMUTACJI
# ---------------------------------------------------------------------------


def test_permutacja_harmonogramu_NIE_zmienia_wyniku() -> None:
    """Specyfikacja fizyczna nie zna kolejności listy.

    Scenariusz zawiera DWA ZDARZENIA RÓWNOCZESNE różnych typów (zwarcie i
    wyłączenie toru w tej samej chwili 0,5 s) — czyli dokładnie ten przypadek,
    w którym naiwna implementacja „stosuj w kolejności podania" dałaby dwa różne
    wyniki dla tej samej specyfikacji.

    Sprawdzane WSZYSTKIMI 6 permutacjami, a odcisk liczony z surowego `repr`
    wszystkich przebiegów — czyli różnica ostatniego bitu też by się ujawniła.
    """
    odciski = {_odcisk_przebiegow(_bieg(perm)) for perm in itertools.permutations(SCENARIUSZ)}
    assert len(odciski) == 1, (
        f"Permutacja harmonogramu dała {len(odciski)} różnych wyników — ta sama "
        f"specyfikacja fizyczna liczy się na kilka sposobów."
    )


def test_rownoczesne_zdarzenia_TEGO_SAMEGO_typu_tez_sa_przemienne() -> None:
    """Dwa zwarcia w tej samej chwili na RÓŻNYCH szynach.

    Przypadek trudniejszy od poprzedniego: zdarzenia tego samego typu mają
    IDENTYCZNY priorytet, więc o kolejności decyduje wyłącznie indeks
    wstawienia. Niezmienniczość wyniku nie wynika tu z porządku, tylko z
    PRZEMIENNOŚCI samych operacji (dwa boczniki dodane do różnych szyn), i
    dlatego musi być zmierzona, a nie założona.
    """
    scenariusz = (
        ZwarcieTrojfazowe(czas_s=0.5, szyna="SN2", x_f_pu=0.2),
        ZwarcieTrojfazowe(czas_s=0.5, szyna="GEN", x_f_pu=0.4),
        ZdjecieZwarcia(czas_s=0.62, szyna="SN2"),
        ZdjecieZwarcia(czas_s=0.62, szyna="GEN"),
    )
    odciski = {_odcisk_przebiegow(_bieg(perm)) for perm in itertools.permutations(scenariusz)}
    assert len(odciski) == 1


def test_zwarcie_i_zdjecie_TEJ_SAMEJ_szyny_w_TEJ_SAMEJ_chwili_rozstrzyga_PRIORYTET() -> None:
    """Specyfikacja zdegenerowana — ale rozstrzygana deterministycznie, nie losowo.

    Priorytety typów (zwarcie 10, zdjęcie 20) dają porządek NIEZALEŻNY od
    kolejności podania, więc oba ustawienia listy kończą się tym samym: zwarcie
    zostaje nałożone, a następnie natychmiast zdjęte, czyli sieć pozostaje zdrowa.

    To jest KONSEKWENCJA, nie przypadek — i jest tu nazwana, żeby nikt nie musiał
    jej odkrywać na własnym scenariuszu. Wynik jest porównywany z biegiem BEZ
    zdarzeń: równość dowodzi, że para zniosła się do zera.
    """
    sporne = (
        ZwarcieTrojfazowe(czas_s=0.5, szyna="SN2", x_f_pu=0.2),
        ZdjecieZwarcia(czas_s=0.5, szyna="SN2"),
    )
    odciski = {_odcisk_przebiegow(_bieg(perm)) for perm in itertools.permutations(sporne)}
    assert len(odciski) == 1, "zdegenerowana specyfikacja rozstrzyga się różnie w obu kolejnościach"
    assert odciski == {
        _odcisk_przebiegow(_bieg(()))
    }, "zwarcie i jego zdjęcie w tej samej chwili powinny znieść się do sieci zdrowej"


def test_ta_sama_specyfikacja_daje_ten_sam_wynik_w_powtorzonym_biegu() -> None:
    """Kontrola determinizmu SAMEGO silnika — inaczej testy permutacji mierzyłyby szum."""
    assert _odcisk_przebiegow(_bieg(SCENARIUSZ)) == _odcisk_przebiegow(_bieg(SCENARIUSZ))


def test_INNY_zbior_zdarzen_daje_INNY_wynik() -> None:
    """Kierunek przeciwny do testów permutacji.

    Gdyby odcisk był niewrażliwy na treść harmonogramu, wszystkie testy
    niezmienniczości przechodziłyby trywialnie — mierzyłyby stałą.
    """
    bez_wylaczenia = (SCENARIUSZ[0], SCENARIUSZ[2])
    assert _odcisk_przebiegow(_bieg(SCENARIUSZ)) != _odcisk_przebiegow(_bieg(bez_wylaczenia))


def test_wylaczenie_WSKAZANEGO_toru_rownoleglego_ma_znaczenie() -> None:
    """Tożsamość gałęzi nie jest etykietą: tor-1 i tor-2 mają różne impedancje."""
    tor_1 = (
        SCENARIUSZ[0],
        WylaczenieGalezi(czas_s=0.5, od_szyny="SN1", do_szyny="SN2", ident="tor-1"),
        SCENARIUSZ[2],
    )
    assert _odcisk_przebiegow(_bieg(SCENARIUSZ)) != _odcisk_przebiegow(_bieg(tor_1))
    u_2 = _seria(_bieg(SCENARIUSZ), "u_pu", "SN2")
    u_1 = _seria(_bieg(tor_1), "u_pu", "SN2")
    assert float(np.max(np.abs(u_1 - u_2))) > 1.0e-6


@pytest.mark.parametrize("integrator", ["rk4", "euler_niejawny", "trapez_niejawny"])
def test_niezmienniczosc_permutacji_trzyma_dla_KAZDEGO_integratora(integrator: str) -> None:
    """Iloczyn cech: permutacja × metoda całkowania.

    Niezmienniczość jest własnością harmonogramu, więc nie może zależeć od
    integratora — ale metody niejawne rozwiązują w chwili zdarzenia równanie
    nieliniowe, więc gdyby kolejność stosowania przeciekała do stanu
    startowego Newtona, ujawniłoby się to właśnie tutaj.
    """
    odciski = set()
    for perm in itertools.permutations(SCENARIUSZ):
        model = _model()
        silnik = SilnikRMS(model, integrator=integrator, krok_s=KROK_S)
        wynik = silnik.symuluj(
            silnik.inicjalizuj(MOCE),
            czas_koncowy_s=1.0,
            harmonogram=HarmonogramZdarzen(list(perm)),
        )
        odciski.add(_odcisk_przebiegow(wynik))
    assert len(odciski) == 1
