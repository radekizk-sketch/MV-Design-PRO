"""Kontrakty wejscia/wyjscia rdzenia dynamiki RMS (karta W6-2 SS0 p.2).

ZERO FIZYKI. Ten modul niesie WYLACZNIE ksztalt danych, kody odmow i protokoly,
ktore realizuja pozostale moduly pakietu. Zadne rownanie ruchu, zadne calkowanie,
zadne skalowanie jednostek.

GRANICA IMPORTOW (SS0 p.1, pilnuje `scripts/dynamika_granica_importow_guard.py`):
caly pakiet `network_model/solvers/dynamika/**` importuje WYLACZNIE `math`,
`numpy`, `scipy.sparse`, wlasne moduly pakietu, `network_model/pochodne/*` oraz
zamkniety zbior modulow jezykowych stdlib. ZERO importow z `application/`,
`enm/`, `api/`, `domain/`, `infrastructure/` i ZERO importow z pozostalych
(ZAMROZONYCH) rdzeni `network_model/solvers/*` — nowy pakiet stoi OBOK nich
(B-01, A-12/DT-9), nie w nich.

DLACZEGO WEJSCIE JEST WLASNYM KONTRAKTEM, A NIE `PowerFlowInput`/`EnergyNetworkModel`.
Rdzen dynamiki musi byc liczony na TYM SAMYM widoku sieci, ktorym liczony jest
rozplyw (jedna prawda punktu pracy — SS0 p.2), ale NIE MOZE importowac warstwy,
ktora ten widok sklada (`enm/assembler.py` siedzi w `enm/`). Dlatego wejsciem jest
`WejscieDynamiki` — struktura o ksztalcie IR assemblera (wezly, galezie w modelu
pi z przekladnia zespolona, odsprzegi, odbiory o stalej mocy, zrodla), ktora
adapter warstwy aplikacyjnej wypelnia z IR. Adapter jest zakresem pozniejszego
wycinka; ten pakiet definiuje kontrakt, ktorego adapter ma dotrzymac.

ZERO FABRYKACJI. Zadne pole liczbowe nie ma wartosci domyslnej — brak danej jest
brakiem pola wymaganego (`TypeError` konstruktora zamrozonej dataklasy), nigdy
cicha domyslka. Pilnuje `scripts/dynamika_zero_default_guard.py` (ten plik jest
na jego liscie skanu razem z `enm/dynamika_modele.py` i katalogiem `der_dynamic`
— KLASA, nie instancja: kontrakt danych dynamiki zyje w trzech miejscach).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Protocol, runtime_checkable

import numpy as np

if TYPE_CHECKING:  # pragma: no cover — wylacznie adnotacja (brak cyklu importow w biegu)
    from .dozory import Dozor

# ---------------------------------------------------------------------------
# Kody odmow (SS0 p.2/p.3/p.5) — rejestr ZAMKNIETY, przypiety testem
# `tests/network_model/dynamika/test_kontrakty.py::test_kody_odmow_zamkniete`.
# ---------------------------------------------------------------------------

#: Brak elementu/parametru wejscia — `dynamika.<pole>_missing` (SS0 p.2).
KOD_BRAK_POLA = "dynamika.{pole}_missing"
#: Punkt pracy nie jest rownowaga DAE po inicjalizacji urzadzen (SS0 p.3).
KOD_INICJALIZACJA_NIEZBIEZNA = "dynamika.inicjalizacja_niezbiezna"
#: Newton na czesci algebraicznej `g(x,y)=0` nie zbiegl mimo globalizacji.
KOD_ALGEBRA_NIEZBIEZNA = "dynamika.algebra_niezbiezna"
#: Newton na kroku sprzezonym (x,y) nie zbiegl i nie ma czym skrocic kroku.
KOD_KROK_NIEZBIEZNY = "dynamika.krok_niezbiezny"
#: NaN/Inf w stanie albo w napieciu — zlapane w chwili powstania (SS0 p.4).
KOD_WARTOSC_NIESKONCZONA = "dynamika.wartosc_nieskonczona"
#: Zwarcie niesymetryczne (2F/1F/2FZ) — modelowane dopiero skladowymi (SS0 p.5).
KOD_ZWARCIE_NIESYMETRYCZNE = "dynamika.zwarcie_niesymetryczne_nieobslugiwane"
#: Zdarzenie wskazuje element, ktorego model nie ma (zero cichego pominiecia).
KOD_ZDARZENIE_BEZ_ELEMENTU = "dynamika.zdarzenie_bez_elementu"
#: Re-inicjalizacja algebry po zdarzeniu nie zbiegla (SS0 p.5).
KOD_REINICJALIZACJA_NIEZBIEZNA = "dynamika.reinicjalizacja_niezbiezna"
#: Nastawy solvera wewnetrznie sprzeczne (np. dt poza [dt_min, dt_max]).
KOD_NASTAWY_SPRZECZNE = "dynamika.nastawy_sprzeczne"
#: Wejscie sieciowe sprzeczne (wezel bez indeksu, galaz do nieistniejacego wezla).
KOD_SIEC_NIESPOJNA = "dynamika.siec_niespojna"
#: Rodzina parametrow dynamicznych spoza zbioru, ktory biblioteka urzadzen umie
#: zbudowac (karta W6-3A). NIGDY cicha degradacja do maszyny klasycznej: brak
#: modelu rodziny jest informacja dla projektanta, nie powodem do podmiany fizyki.
KOD_RODZINA_NIEOBSLUGIWANA = "dynamika.rodzina_urzadzenia_nieobslugiwana"
#: Parametry urzadzenia sa wewnetrznie sprzeczne w sposob, ktorego kontrakt ENM
#: nie waliduje (np. czlon wyprzedzajacy bez czlonu opozniajacego = rozniczkowanie
#: idealne, zerowa impedancja wirtualna zrodla napieciowego, dopasowanie krzywej
#: nasycenia bez rozwiazania). Zwiazek miedzy polami, nie brak pola.
KOD_PARAMETRY_SPRZECZNE = "dynamika.parametry_urzadzenia_sprzeczne"
#: Wariant bloku regulacji nazwany w kontrakcie, ktorego POZOSTALE pola kontraktu
#: nie parametryzuja (np. wzbudnica wirujaca IEEE AC1A bez stalej czasowej
#: wzbudnicy). Model o tej nazwie nie da sie zlozyc z dostepnych danych, a
#: podstawienie innej struktury pod ta sama nazwa byloby fabrykacja.
KOD_WARIANT_BEZ_PARAMETROW = "dynamika.wariant_regulatora_bez_parametrow"
#: Punkt pracy lezy poza ograniczeniem urzadzenia (prad ponad `i_max`, wzbudzenie
#: poza [Efd_min, Efd_max], moc turbiny poza [P_min, P_max], SOC poza zakresem),
#: wiec rownowaga poczatkowa nie istnieje — odmowa NAZWANA zamiast biegu, ktory
#: „startuje skokiem" i tlumaczy pierwsza sekunde artefaktem rozruchu. TEN SAM kod (i ten
#: sam predykat, np. `OknoMocy.zawiera`, granice mocy turbiny) niesie komenda regulacji,
#: ktorej nastawa lezy poza ogranicznikiem urzadzenia (`NastawaRegulacji.zakres`) —
#: zadany punkt pracy nie istnieje z tego samego powodu, co punkt poczatkowy.
KOD_PUNKT_PRACY_POZA_OGRANICZENIEM = "dynamika.punkt_pracy_poza_ograniczeniem"
#: Stan wyszedl poza ZAKRES WAZNOSCI modelu urzadzenia (nie poza ogranicznik — te
#: dwie rzeczy sa rozne, patrz `Urzadzenie.zakresy_waznosci`). Przyklad jedyny w
#: obecnej bibliotece: stan naladowania magazynu opuszczajacy `[SOC_min, SOC_max]`.
#: Od tej chwili urzadzenie oddawaloby do sieci moc, ktorej zrodla nie ma w
#: modelu — kazda dalsza probka byla by trajektoria nieosiagalna energetycznie.
KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY = "dynamika.zakres_waznosci_przekroczony"

#: Wyspa sieci niesie odbior, a zadne przylaczone do niej urzadzenie nie wnosi
#: ani pradu, ani pochodnej pradu po napieciu — punkt pracy NIE ISTNIEJE. Odmowa
#: pada PRZED Newtonem, bo dla takiej wyspy residuum `|S|/|V|` schodzi ponizej
#: dowolnej tolerancji przez samo odjechanie napiecia do nieskonczonosci: bez tego
#: sprawdzenia rdzen meldowal „zbieznosc" przy `|V| ~ 1e11 pu` albo przewracal sie
#: surowym `OverflowError` (R10 par. 8/9, defekt F-8). Predykat i wyprowadzenie:
#: `wyspy.py`.
KOD_WYSPA_BEZ_ZRODLA = "dynamika.wyspa_bez_zrodla"

#: Zdarzenie wewnetrznie sprzeczne: usuniecie zwarcia bez jawnego sposobu usuniecia
#: albo sposob bez chwili usuniecia, usuniecie nie pozniej niz zalozenie, polozenie
#: zwarcia w linii poza przedzialem otwartym (0, 1). Zwiazek miedzy polami zdarzenia,
#: nie brak pola — ten sam wzorzec, co `dynamika.nastawy_sprzeczne` dla nastaw.
KOD_ZDARZENIE_SPRZECZNE = "dynamika.zdarzenie_sprzeczne"
#: Usuniecie zwarcia rodzaju `izolacja` w chwili, w ktorej miejsce zwarcia (w stanie
#: PO naniesieniu wszystkich zdarzen tej chwili) nadal lezy w wyspie zasilanej —
#: zadne otwarcie nie odcielo zwarcia, wiec „usuniecie" byloby zniknieciem luku pod
#: napieciem, czyli innym zjawiskiem niz zadeklarowane.
KOD_ZWARCIE_NIEODIZOLOWANE = "dynamika.zwarcie_nieodizolowane"
#: Zwarcie w miejscu x*L galezi, ktora nie jest linia ani kablem (transformator,
#: lacznik) — dlugosc elektryczna takiej galezi nie istnieje.
KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE = "dynamika.zwarcie_galezi_nieobslugiwane"
#: Odbior o STALEJ MOCY w wezle, ktoremu wiersz ograniczenia narzuca napiecie zerowe
#: (zwarcie metaliczne w wezle) — model `P = const` nie ma rozwiazania przy U = 0.
KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU = "dynamika.odbior_stalej_mocy_przy_zerowym_napieciu"
#: Dwa rozne warunki narzucajace napiecie w JEDNYM wezle (zwarcie metaliczne na
#: zaciskach idealnego zrodla napieciowego, dwa zrodla napieciowe w jednym wezle):
#: uklad jest sprzeczny — pierwsze prawo Kirchhoffa zadaloby nieskonczonego pradu.
KOD_NAPIECIE_NARZUCONE_SPRZECZNE = "dynamika.napiecie_narzucone_sprzeczne"

#: Komenda regulacji wskazuje wielkosc (P, Q albo U), ktorej model urzadzenia nie ma jak
#: zadac: rodzina bez regulatora tej wielkosci (maszyna synchroniczna bez regulatora mocy
#: biernej, stale wzbudzenie bez nastawy napiecia), warunek brzegowy (szyna sztywna, zrodlo
#: testowe), moc czynna turbiny wiatrowej zalezna od mocy dostepnej z wiatru albo
#: urzadzenie odlaczone. Odmowa niesie urzadzenie, wielkosc i powod z deklaracji klasy
#: (`Urzadzenie.nastawy_regulacji`), nigdy cicha podmiane na inny stan.
KOD_NASTAWA_NIEOBSLUGIWANA = "dynamika.nastawa_nieobslugiwana"
#: Przypisanie stanu, ktorego klasa urzadzenia NIE deklaruje jako przypisywalnego
#: (`Urzadzenie.stany_przypisywalne`): skok strumienia, kata, predkosci albo stanu
#: naladowania wymagalby nieskonczonego napiecia, momentu albo mocy
#: (`reinicjalizacja.py`) — przypisac wolno wylacznie odniesienie albo nastawe.
KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE = "dynamika.zdarzenie_przypisania_niedozwolone"
#: Czesciowa utrata zrodla z udzialem pozostalym spoza przedzialu otwartego (0, 1), z
#: udzialem nie mniejszym niz poprzedni (wzrost = ponowne przylaczenie jednostek, ktore
#: wymaga kryteriow synchronizacji), dla urzadzenia, ktore nie jest agregatem jednostek
#: (szyna sztywna, zrodlo testowe — ekwiwalent sieci), albo dla urzadzenia juz odlaczonego.
KOD_UDZIAL_ZRODLA_NIEDOZWOLONY = "dynamika.udzial_zrodla_niedozwolony"
#: Dozor zdarzenia warunkowego pobudzony DRUGI raz w tej samej chwili — akcje wykonane w
#: tej chwili przywrocily jego warunek. Bez tej odmowy petla zdarzen bez uplywu czasu
#: nie mialaby konca.
KOD_PETLA_ZDARZEN_WARUNKOWYCH = "dynamika.petla_zdarzen_warunkowych"

#: Zamkniety rejestr kodow odmow tego rdzenia. Nowy kod DOPISUJESZ tutaj —
#: `OdmowaDynamiki` odrzuca kod spoza rejestru (deklaracja z przypietym testem,
#: nie obietnica w docstringu). Kod DOPISYWANY jest razem z mechanizmem, ktory go
#: podnosi — kod bez zadnej sciezki odmowy bylby deklaracja bez pokrycia.
KODY_ODMOW: tuple[str, ...] = (
    KOD_ALGEBRA_NIEZBIEZNA,
    KOD_INICJALIZACJA_NIEZBIEZNA,
    KOD_KROK_NIEZBIEZNY,
    KOD_NAPIECIE_NARZUCONE_SPRZECZNE,
    KOD_NASTAWA_NIEOBSLUGIWANA,
    KOD_NASTAWY_SPRZECZNE,
    KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU,
    KOD_PARAMETRY_SPRZECZNE,
    KOD_PETLA_ZDARZEN_WARUNKOWYCH,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    KOD_REINICJALIZACJA_NIEZBIEZNA,
    KOD_RODZINA_NIEOBSLUGIWANA,
    KOD_SIEC_NIESPOJNA,
    KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
    KOD_WARIANT_BEZ_PARAMETROW,
    KOD_WARTOSC_NIESKONCZONA,
    KOD_WYSPA_BEZ_ZRODLA,
    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE,
    KOD_ZDARZENIE_SPRZECZNE,
    KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
    KOD_ZWARCIE_NIEODIZOLOWANE,
    KOD_ZWARCIE_NIESYMETRYCZNE,
)


class OdmowaDynamiki(ValueError):
    """Nazwana odmowa rdzenia dynamiki — kod z `KODY_ODMOW` + dane pomiarowe.

    Odmowa NIGDY nie zamienia sie w wynik zerowy, pusty ani „artefakt rozruchu":
    kazde miejsce, w ktorym rdzen nie potrafi policzyc, konczy sie ta klasa.
    `szczegoly` niesie POMIAR (residua, indeksy, nazwy stanow), zeby wolajacy
    mogl pokazac projektantowi, CO dokladnie nie wyszlo, a nie tylko ze nie wyszlo.
    """

    def __init__(self, kod: str, komunikat: str, **szczegoly: object) -> None:
        if kod not in KODY_ODMOW and not kod.endswith("_missing"):
            raise AssertionError(
                f"Kod odmowy {kod!r} spoza rejestru KODY_ODMOW — dopisz go do rejestru."
            )
        super().__init__(f"{komunikat} (kod: {kod})")
        self.kod = kod
        self.szczegoly = dict(szczegoly)


def odmowa_braku_pola(pole: str, komunikat: str) -> OdmowaDynamiki:
    """Odmowa `dynamika.<pole>_missing` (SS0 p.2) — brak danej, nie domyslka."""
    return OdmowaDynamiki(KOD_BRAK_POLA.format(pole=pole), komunikat, pole=pole)


# ---------------------------------------------------------------------------
# Widok sieci (ksztalt IR assemblera)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WezelDynamiki:
    """Szyna: tozsamosc + napiecie znamionowe (baza impedancji wezla)."""

    ident: str
    u_n_kv: float


#: Rodzaj galezi — rozstrzyga, czy galaz ma DLUGOSC elektryczna (zwarcie w miejscu x*L
#: wolno postawic wylacznie w linii i kablu; transformator i lacznik nie maja punktu
#: „w polowie dlugosci"). Rodzaj podaje adapter z typu elementu ENM.
RodzajGalezi = Literal["linia", "kabel", "transformator", "lacznik"]


@dataclass(frozen=True)
class GalazDynamiki:
    """Galaz w modelu pi z przekladnia zespolona (linia/kabel/transformator/lacznik).

    `przekladnia` = 1+0j dla linii i kabli; dla transformatora niesie moduł
    (zaczep, zmiana bazy napieciowej) i przesuniecie fazowe grupy polaczen —
    ten sam ksztalt, ktorym liczy rozplyw.
    `y_szeregowa_pu` to ADMITANCJA galezi (1/z), `b_poprzeczna_pu` to CALKOWITA
    susceptancja poprzeczna modelu pi (dzielona po polowie na obie strony).

    AKTYWNOSC (karta AB-1b.1 par. 0 pkt 1). `aktywna_na_starcie` jest polem WYMAGANYM:
    galaz otwarta albo poza ruchem ISTNIEJE w rdzeniu od t = 0 i niesie stan
    nieaktywny — zdarzenie zalaczenia ma wtedy co zamknac (sprzeglo normalnie otwarte,
    lacznik rezerwowy, kabel rezerwowy). Galaz nieaktywna nie jest stemplowana, wiec
    macierz admitancyjna w t = 0 jest bitowo ta sama, co bez niej.
    """

    ident: str
    wezel_od: str
    wezel_do: str
    y_szeregowa_pu: complex
    b_poprzeczna_pu: float
    przekladnia: complex
    aktywna_na_starcie: bool
    rodzaj: RodzajGalezi


@dataclass(frozen=True)
class OdsprzegDynamiki:
    """Element poprzeczny w wezle (bateria, dlawik) — admitancja stala.

    `aktywna_na_starcie` jak w `GalazDynamiki`: bateria wylaczona istnieje w rdzeniu
    i moze zostac zalaczona zdarzeniem (`ZmianaOdsprzegu`).
    """

    ident: str
    wezel: str
    g_pu: float
    b_pu: float
    aktywna_na_starcie: bool


@dataclass(frozen=True)
class OdbiorDynamiki:
    """Odbior o STALEJ MOCY w konwencji poboru (P>0 = pobor z sieci).

    Postac stalej mocy jest ta sama, ktora niesie rozplyw (`PQSpec` bez ZIP) —
    jedna prawda punktu pracy. Granica waznosci jest FIZYCZNA i nazwana: przy
    zapadzie napiecia do zera model stalej mocy zada pradu bez granicy, wiec
    algebra nie ma rozwiazania; rdzen melduje wtedy `dynamika.algebra_niezbiezna`
    z residuum, a nie „rozjazd Newtona".
    """

    ident: str
    wezel: str
    p_pu: float
    q_pu: float


@dataclass(frozen=True)
class PunktPracy:
    """Rozwiazanie rozpływu, od ktorego startuje bieg (SS0 p.2).

    `napiecia_pu` jest slownikiem ident wezla -> fazor napiecia (pu, konwencja
    sieciowa); `moce_zrodel_pu` ident zrodla -> moc zespolona ODDAWANA do sieci
    (S = P + jQ, generacja dodatnia).
    """

    napiecia_pu: dict[str, complex]
    moce_zrodel_pu: dict[str, complex]


# ---------------------------------------------------------------------------
# Harmonogram zdarzen (SS0 p.5) — te same piec rodzajow, ktore rdzen umie wykonac
# ---------------------------------------------------------------------------


#: Sposob usuniecia zwarcia (karta AB-1b.1, par. 0 pkt 4). `izolacja` — zwarcie gasnie,
#: bo aparaty ODCINAJA jego miejsce od kazdego zrodla; rdzen sprawdza to w stanie PO
#: naniesieniu wszystkich zdarzen chwili usuniecia i odmawia, gdy miejsce nadal lezy w
#: wyspie zasilanej (`dynamika.zwarcie_nieodizolowane`). `samoczynne` — jawna
#: IDEALIZACJA zwarcia przemijajacego (luk gasnie pod napieciem), dopisywana do zalozen
#: wyniku; tak usuwaja zwarcie wzorce bramek G2-G12 i twierdzenia D-04 („usuwane bez
#: zmiany topologii pozwarciowej").
SposobUsuniecia = Literal["izolacja", "samoczynne"]


def _sprawdz_usuniecie(
    t_s: float, t_usuniecia_s: float | None, sposob: SposobUsuniecia | None, miejsce: str
) -> None:
    """Para (chwila, sposob) usuniecia — oba pola albo zadne; usuniecie PO zalozeniu.

    Jedno zrodlo prawdy dla zwarcia w wezle i w linii (predykaty parami). Kontrakt
    danych (`enm/scenariusze.py::Zwarcie`) waliduje te sama pare wlasnym walidatorem,
    bo nie importuje rdzenia — zgodnosc obu przypina test obu warstw.
    """
    if (t_usuniecia_s is None) != (sposob is None):
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Zwarcie {miejsce} w t={t_s} s: chwila usuniecia ({t_usuniecia_s}) i sposob "
            f"usuniecia ({sposob}) musza byc podane razem albo wcale — usuniecie bez "
            "jawnego sposobu nie mowi, czy luk zgasl po odcieciu, czy pod napieciem",
            t_s=t_s,
            t_usuniecia_s=t_usuniecia_s,
            sposob_usuniecia=sposob,
        )
    if sposob is not None and sposob not in ("izolacja", "samoczynne"):
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Zwarcie {miejsce}: nieznany sposob usuniecia {sposob!r}",
            sposob_usuniecia=sposob,
        )
    if t_usuniecia_s is not None and t_usuniecia_s <= t_s:
        raise OdmowaDynamiki(
            KOD_ZDARZENIE_SPRZECZNE,
            f"Zwarcie {miejsce}: usuniecie w t={t_usuniecia_s} s nie jest pozniejsze niz "
            f"zalozenie w t={t_s} s",
            t_s=t_s,
            t_usuniecia_s=t_usuniecia_s,
        )


@dataclass(frozen=True)
class ZwarcieWezla:
    """Zwarcie w wezle: admitancja zwarcia dopisana do Ybus (SS0 p.5).

    `typ` jest przenoszony z kontraktu wejsciowego BEZ zmiany — rdzen W6-2 umie
    wylacznie `"3F"`, a kazdy inny typ konczy sie odmowa nazwana
    `dynamika.zwarcie_niesymetryczne_nieobslugiwane`. Gdyby pole bylo zawezone
    do `Literal["3F"]`, odmowa nie mialaby gdzie powstac i niesymetria wchodzilaby
    po cichu jako zwarcie trojfazowe.

    `sposob_usuniecia` jest WYMAGANY (bez domyslki) i rowny `None` wtedy i tylko
    wtedy, gdy `t_usuniecia_s is None` — sprawdzane przy konstrukcji.
    """

    t_s: float
    wezel: str
    typ: str
    r_f_ohm: float
    x_f_ohm: float
    t_usuniecia_s: float | None
    sposob_usuniecia: SposobUsuniecia | None

    def __post_init__(self) -> None:
        _sprawdz_usuniecie(
            self.t_s, self.t_usuniecia_s, self.sposob_usuniecia, f"w wezle {self.wezel!r}"
        )


@dataclass(frozen=True)
class ZwarcieGalezi:
    """Zwarcie w linii/kablu w miejscu `x*L` od zacisku `wezel_od` (karta AB-1b.1 par. 0 pkt 5).

    Zwarcie jest STANEM GALEZI w rdzeniu, nie podzialem linii w adapterze: dopoki
    trwa, galaz jest stemplowana czwornikiem z redukcji Krona wezla wewnetrznego
    (polowki pi `y/x`, `y/(1-x)` z susceptancjami `B*x`, `B*(1-x)` i admitancja
    zwarcia w wezle wewnetrznym — `siec.stempel_galezi`); po usunieciu stempel
    zdrowej galezi wraca bitowo, bo siec jest skladana od nowa. Podzial linii OD t = 0
    zmienilby rozklad pradu ladowania (B*x/2 i B*(1-x)/2 na koncach zamiast B/2), wiec
    punkt pracy z rozplywu przestalby byc rownowaga.

    `polozenie_wzgledne` lezy w przedziale OTWARTYM (0, 1): zwarcie na zacisku to
    zwarcie w WEZLE (`ZwarcieWezla`), nie w galezi — dwa zapisy tego samego zjawiska
    bylyby dwiema prawdami. Obslugiwane wylacznie linie i kable (dlugosc elektryczna
    transformatora ani lacznika nie istnieje) — inne galezie koncza sie odmowa
    `dynamika.zwarcie_galezi_nieobslugiwane` przy budowie harmonogramu.
    """

    t_s: float
    galaz: str
    polozenie_wzgledne: float
    typ: str
    r_f_ohm: float
    x_f_ohm: float
    t_usuniecia_s: float | None
    sposob_usuniecia: SposobUsuniecia | None

    def __post_init__(self) -> None:
        if not 0.0 < self.polozenie_wzgledne < 1.0:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_SPRZECZNE,
                f"Zwarcie w galezi {self.galaz!r}: polozenie wzgledne "
                f"{self.polozenie_wzgledne} poza przedzialem otwartym (0, 1) — zwarcie na "
                "zacisku galezi zadaje sie jako zwarcie w wezle",
                galaz=self.galaz,
                polozenie_wzgledne=self.polozenie_wzgledne,
            )
        _sprawdz_usuniecie(
            self.t_s,
            self.t_usuniecia_s,
            self.sposob_usuniecia,
            f"w galezi {self.galaz!r} (x = {self.polozenie_wzgledne})",
        )


@dataclass(frozen=True)
class ZmianaGalezi:
    """Otwarcie (`zalaczona=False`) albo zamkniecie (`True`) galezi w chwili t."""

    t_s: float
    galaz: str
    zalaczona: bool


@dataclass(frozen=True)
class ZmianaOdsprzegu:
    """Wylaczenie (`zalaczony=False`) albo zalaczenie (`True`) odsprzegu w chwili t.

    Laczenie baterii kondensatorow jest ta sama klasa mechanizmu, co laczenie galezi:
    zmienia skladnik macierzy admitancyjnej, a siec jest skladana od nowa.
    """

    t_s: float
    odsprzeg: str
    zalaczony: bool


@dataclass(frozen=True)
class ZmianaOdbioru:
    """NAZWANE odlaczenie (`zalaczony=False`) albo zalaczenie (`True`) odbioru w chwili t.

    Odlaczenie odbioru jest zdarzeniem laczeniowym (FREEZE par. 2 wiersz D7), a NIE
    skokiem mocy do zera: odbior odlaczony nie ma obwodu, wiec nie wchodzi do bilansu
    wezla w ogole, a skoki mocy naniesione wczesniej zostaja przy nim na czas ponownego
    zalaczenia.
    """

    t_s: float
    odbior: str
    zalaczony: bool


@dataclass(frozen=True)
class OdlaczenieZrodla:
    """Odlaczenie zrodla od sieci — jego prad wstrzykiwany znika z bilansu."""

    t_s: float
    zrodlo: str


@dataclass(frozen=True)
class SkokObciazenia:
    """Skokowa zmiana mocy odbioru (delta wzgledem punktu pracy), konwencja poboru."""

    t_s: float
    odbior: str
    delta_p_pu: float
    delta_q_pu: float


@dataclass(frozen=True)
class PrzypisanieStanu:
    """Przypisanie WARTOSCI stanowi urzadzenia w chwili t (karta AB-1b.1 par. 0 pkt 9, D13).

    Dozwolone WYLACZNIE dla stanow, ktore klasa urzadzenia deklaruje w
    `Urzadzenie.stany_przypisywalne` (odniesienia i nastawy regulatorow, stany profilu
    zrodla testowego) — nigdy strumien, kat, predkosc ani stan naladowania, bo ich skok
    wymagalby nieskonczonego napiecia, momentu albo mocy. Pozostale stany przechodza przez
    chwile BITOWO bez zmiany (pomiar `delta_x_nieprzypisane_max` w wyniku), a algebra jest
    rozwiazywana od nowa przy stanach po przypisaniu. `wartosc` jest wartoscia STANU w jego
    jednostce (sufiks nazwy stanu), nie wielkoscia inzynierska — przeliczenie MW/Mvar na
    jednostki wzgledne robi `KomendaRegulacji`.
    """

    t_s: float
    urzadzenie: str
    stan: str
    wartosc: float


@dataclass(frozen=True)
class KomendaRegulacji:
    """Zmiana nastawy regulatora urzadzenia w chwili t — wielkosci inzynierskie P, Q, U.

    Co najmniej jedna z wielkosci jest podana. Rdzen przelicza MW i Mvar na jednostki
    wzgledne bazy ukladu (`konwencje.moc_pu`) i wykonuje komende jako przypisanie stanu
    wskazanego DEKLARACJA klasy urzadzenia (`Urzadzenie.nastawy_regulacji`) — tablica
    odwzorowania wielkosc -> stan zyje w urzadzeniu, a nie w silniku. Wielkosc, ktorej
    urzadzenie nie ma jak zadac, konczy sie odmowa `dynamika.nastawa_nieobslugiwana` z
    powodem z deklaracji. „Skok generacji" jest komenda P (nie osobnym zdarzeniem).
    """

    t_s: float
    urzadzenie: str
    p_mw: float | None
    q_mvar: float | None
    u_pu: float | None

    def __post_init__(self) -> None:
        if self.p_mw is None and self.q_mvar is None and self.u_pu is None:
            raise OdmowaDynamiki(
                KOD_ZDARZENIE_SPRZECZNE,
                f"Komenda regulacji urządzenia {self.urzadzenie!r} w t={self.t_s} s nie zadaje "
                "żadnej wielkości (P, Q, U) — komenda bez nastawy nie jest poleceniem",
                urzadzenie=self.urzadzenie,
                t_s=self.t_s,
            )


@dataclass(frozen=True)
class UtrataCzesciowaZrodla:
    """Ubytek czesci jednostek zrodla bedacego agregatem identycznych jednostek (D-20).

    `udzial_pozostaly` jest udzialem WZGLEDEM STANU POCZATKOWEGO (przedzial otwarty
    (0, 1)): 0,6 znaczy, ze pracuje 60 % jednostek z chwili t = 0. Kolejne zdarzenia tego
    samego zrodla wolno podawac WYLACZNIE malejaco — wzrost udzialu to ponowne przylaczenie
    jednostek (kryteria synchronizacji, poza tym rdzeniem), a pelna utrata to
    `OdlaczenieZrodla`. Model: prad do sieci i jego jakobiany skalowane udzialem, pochodne
    stanow bez skalowania (kazda pozostala jednostka zachowuje stan na jednostke) —
    `urzadzenia.czesciowe.UrzadzenieCzesciowe`.
    """

    t_s: float
    zrodlo: str
    udzial_pozostaly: float

    def __post_init__(self) -> None:
        if not 0.0 < self.udzial_pozostaly < 1.0:
            raise OdmowaDynamiki(
                KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
                f"Częściowa utrata źródła {self.zrodlo!r} w t={self.t_s} s: udział pozostaly "
                f"{self.udzial_pozostaly} spoza przedziału otwartego (0, 1) — udział 1 to brak "
                "utraty, udział 0 to odlaczenie całego źródła (`OdlaczenieZrodla`)",
                zrodlo=self.zrodlo,
                udzial_pozostaly=self.udzial_pozostaly,
            )


ZdarzenieDynamiki = (
    ZwarcieWezla
    | ZwarcieGalezi
    | ZmianaGalezi
    | ZmianaOdsprzegu
    | ZmianaOdbioru
    | OdlaczenieZrodla
    | UtrataCzesciowaZrodla
    | SkokObciazenia
    | PrzypisanieStanu
    | KomendaRegulacji
)


@dataclass(frozen=True)
class HarmonogramDynamiki:
    """Uporzadkowany harmonogram zdarzen biegu.

    Kolejnosc kanoniczna to (t_s, indeks zapisu) — `zdarzenia` sa przyjmowane w
    kolejnosci zapisu, a `zdarzenia.HarmonogramWykonawczy` sortuje je STABILNIE
    po czasie, wiec remisy zachowuja kolejnosc zapisu. Ten sam kontrakt
    kolejnosci, co `ScenariuszDynamiczny.zdarzenia_uporzadkowane` w warstwie
    danych — jedno zrodlo prawdy porzadku, dwa miejsca zapisu.

    `dozory` (karta AB-1b.1 par. 0 pkt 12) to zdarzenia WARUNKOWE: specyfikacja jest
    DANA (`dozory.Dozor`), a chwila pobudzenia wynika z przebiegu, lokalizowana z
    tolerancja `NastawySolvera.tolerancja_lokalizacji_zdarzen_s`. Pusta krotka znaczy
    „bieg bez dozorow" (zbior pusty, nie brak danej) — i wtedy silnik idzie
    dotychczasowa sciezka, bitowo.
    """

    zdarzenia: tuple[ZdarzenieDynamiki, ...]
    dozory: tuple[Dozor, ...] = ()


# ---------------------------------------------------------------------------
# Nastawy solvera (SS0 p.2)
# ---------------------------------------------------------------------------

NazwaIntegratora = Literal["trapez_niejawny", "rk4_jawny"]


@dataclass(frozen=True)
class NastawySolvera:
    """Nastawy numeryczne biegu — WSZYSTKIE wymagane, zero domyslek.

    Krok staly = `dt_min_s == dt_max_s == dt_s` (wtedy kontrola bledu kroku jest
    wylaczona z KONSTRUKCJI, bo nie ma czym skrocic kroku, a odrzucenie konczy
    sie odmowa `dynamika.krok_niezbiezny`). Krok adaptacyjny = `dt_min_s <
    dt_max_s`; wtedy kazdy krok ma oszacowanie bledu lokalnego przez podwojenie
    kroku, a krok odrzucony jest LICZONY (`kroki_odrzucone`), nie przemilczany.
    """

    dt_s: float
    dt_min_s: float
    dt_max_s: float
    tolerancja: float
    tolerancja_kroku: float
    eps_init: float
    max_iteracji_newtona: int
    max_nawrotow: int
    horyzont_s: float
    krok_wyjscia_s: float
    integrator: NazwaIntegratora
    #: Szerokosc przedzialu, do ktorego jest zawezana chwila zdarzenia WARUNKOWEGO
    #: (karta AB-1b.1 par. 0 pkt 12). Pole WYMAGANE bez domyslki: `None` jest dozwolone
    #: wylacznie dla biegu bez dozorow (silnik odmawia `dynamika.nastawy_sprzeczne`, gdy
    #: harmonogram niesie dozory, a tolerancji nie podano). LOKALIZACJA ma te tolerancje
    #: wzgledem trajektorii dyskretnej; WYKONANIE akcji jest dokladne (ladowanie w t*).
    tolerancja_lokalizacji_zdarzen_s: float | None

    def __post_init__(self) -> None:
        if not (self.dt_min_s <= self.dt_s <= self.dt_max_s):
            raise OdmowaDynamiki(
                KOD_NASTAWY_SPRZECZNE,
                f"dt_s={self.dt_s} poza granicami [{self.dt_min_s}, {self.dt_max_s}]",
                dt_s=self.dt_s,
                dt_min_s=self.dt_min_s,
                dt_max_s=self.dt_max_s,
            )
        for nazwa, wartosc in (
            ("dt_min_s", self.dt_min_s),
            ("tolerancja", self.tolerancja),
            ("tolerancja_kroku", self.tolerancja_kroku),
            ("eps_init", self.eps_init),
            ("horyzont_s", self.horyzont_s),
            ("krok_wyjscia_s", self.krok_wyjscia_s),
        ):
            if wartosc <= 0.0:
                raise OdmowaDynamiki(
                    KOD_NASTAWY_SPRZECZNE,
                    f"{nazwa}={wartosc} musi byc dodatnie",
                    pole=nazwa,
                    wartosc=wartosc,
                )
        if self.max_iteracji_newtona < 1 or self.max_nawrotow < 0:
            raise OdmowaDynamiki(
                KOD_NASTAWY_SPRZECZNE,
                f"max_iteracji_newtona={self.max_iteracji_newtona} musi byc >= 1, "
                f"max_nawrotow={self.max_nawrotow} musi byc >= 0",
                max_iteracji_newtona=self.max_iteracji_newtona,
                max_nawrotow=self.max_nawrotow,
            )
        if self.krok_wyjscia_s > self.horyzont_s:
            raise OdmowaDynamiki(
                KOD_NASTAWY_SPRZECZNE,
                f"krok_wyjscia_s={self.krok_wyjscia_s} > horyzont_s={self.horyzont_s}",
                krok_wyjscia_s=self.krok_wyjscia_s,
                horyzont_s=self.horyzont_s,
            )
        if (
            self.tolerancja_lokalizacji_zdarzen_s is not None
            and not self.tolerancja_lokalizacji_zdarzen_s > 0.0
        ):
            raise OdmowaDynamiki(
                KOD_NASTAWY_SPRZECZNE,
                "tolerancja_lokalizacji_zdarzen_s="
                f"{self.tolerancja_lokalizacji_zdarzen_s} musi być dodatnia (albo None dla "
                "biegu bez dozorow)",
                pole="tolerancja_lokalizacji_zdarzen_s",
                wartosc=self.tolerancja_lokalizacji_zdarzen_s,
            )

    @property
    def krok_staly(self) -> bool:
        """Czy nastawy opisuja krok STALY (brak marginesu na adaptacje)."""
        return self.dt_min_s == self.dt_max_s


# ---------------------------------------------------------------------------
# Protokol urzadzenia (SS0 p.4)
# ---------------------------------------------------------------------------

#: Sposob wejscia urzadzenia do algebry sieci — patrz `Urzadzenie.sprzezenie`.
SprzezenieUrzadzenia = Literal["pradowe", "napieciowe"]

#: Wielkosc komendy regulacji: moc czynna, moc bierna, napiecie (karta AB-1b.1 par. 0 pkt 9).
WielkoscNastawy = Literal["p", "q", "u"]
#: Kolejnosc kanoniczna wielkosci w deklaracji `Urzadzenie.nastawy_regulacji` — przypieta.
WIELKOSCI_NASTAW: tuple[WielkoscNastawy, ...] = ("p", "q", "u")


@dataclass(frozen=True)
class NastawaRegulacji:
    """Jak urzadzenie wykonuje komende regulacji JEDNEJ wielkosci — deklaracja klasy.

    * `stan` — stan-odniesienie, ktoremu komenda przypisuje wartosc (`None` = urzadzenie
      tej wielkosci nie zadaje; wtedy `powod_pl` mowi dlaczego, a komenda konczy sie
      odmowa `dynamika.nastawa_nieobslugiwana`).
    * `zakres` — dopuszczalny przedzial wartosci STANU (`None` = bez ograniczenia
      nastawy). To jest TEN SAM predykat, ktorym urzadzenie sprawdza punkt poczatkowy
      (okno mocy przeksztaltnika i magazynu, granice mocy turbiny maszyny) — nastawa poza
      nim konczy sie odmowa `dynamika.punkt_pracy_poza_ograniczeniem`, a nie cichym
      nasyceniem w ograniczniku.
    * `mnoznik` — wartosc stanu = `mnoznik` * wartosc komendy w jednostkach wzglednych
      bazy ukladu. Dla urzadzenia calego 1,0; po czesciowej utracie zrodla stany opisuja
      agregat WSZYSTKICH jednostek, a komenda dotyczy jednostek POZOSTALYCH, wiec
      nastawa mocy jest dzielona przez udzial (`urzadzenia.czesciowe`).
    """

    wielkosc: WielkoscNastawy
    stan: str | None
    powod_pl: str
    zakres: tuple[float, float] | None
    mnoznik: float


@runtime_checkable
class Urzadzenie(Protocol):
    """Urzadzenie dynamiczne przylaczone do wezla sieci.

    WSZYSTKIE skladowe sa WLASCIWOSCIAMI TYLKO DO ODCZYTU. To nie jest kosmetyka:
    dlug zmierzony w watku badawczym (21 bledow mypy w szesciu modulach) mial
    JEDNA przyczyne — protokoly deklarowaly skladowe jako zmienne modyfikowalne,
    a implementacje byly zamrozonymi dataklasami o atrybutach tylko do odczytu,
    wiec ZADNA konkretna klasa nie przechodzila swojego protokolu i system typow
    byl dla calej warstwy bezczynny.

    UKLAD ODNIESIENIA. `prad_pu` zwraca prad WSTRZYKIWANY do wezla w konwencji
    generacji (dodatni = do sieci), we wspolnym ukladzie sieciowym. Przejscie
    miedzy ukladem wirnika (dq) a sieciowym robi `konwencje.dq_na_siec` —
    urzadzenie nie ma wlasnej kopii tej transformacji.
    """

    @property
    def ident(self) -> str:
        """Tozsamosc urzadzenia (klucz w wyniku i w zdarzeniach)."""

    @property
    def wezel(self) -> str:
        """Ident wezla przylaczenia."""

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        """Nazwy stanow roznicowych — dlugosc = wymiar `x` tego urzadzenia."""

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Twarde granice stanow — po jednym wpisie na stan, `None` gdy stan jest wolny.

        PO CO TO JEST W KONTRAKCIE, A NIE W URZADZENIU. Ogranicznik NIENAWROTNY
        (anti-windup) jest funkcja NIECIAGLA: pochodna stanu skacze do zera w
        chwili dojscia do granicy. W metodzie NIEJAWNEJ oznacza to, ze residuum
        kroku `R(x1) = x1 - x0 - dt/2 (f0 + f(x1))` ma SKOK w punkcie granicy o
        `dt/2 * f(granica)` — jesli rozwiazanie lezy w tym skoku, rownanie kroku
        NIE MA rozwiazania i Newton nie ma do czego zbiegac. Pomiar (maszyna z
        AVR Ka=200, Ta=0,05 s i stabilizatorem, zwarcie na zaciskach): residuum
        stawalo w miejscu na 4,2e-02 i nie malalo ani po jedenastu nawrotach, ani
        po skroceniu kroku do 2e-05 s; ten sam bieg bez ogranicznika wzbudzenia
        zbiegal w TRZECH iteracjach.

        Dlatego granica NIE jest sprawa samego urzadzenia: zna ja calkowanie,
        ktore dla stanu wypchnietego poza granice zamienia rownanie rozniczkowe
        wiersza na rownanie ALGEBRAICZNE `x = granica` (klasyczny Newton z
        rzutowaniem, aktywny zbior wyznaczany w kazdej iteracji). Rownanie kroku
        odzyskuje rozwiazanie, Newton zbiega, a granica jest dotrzymana DOKLADNIE
        — nie z przestrzeleniem rzedu `dt/2 * f`, ktore daloby samo zerowanie
        pochodnej (pomiar przed naprawa: Efd = 7,165 pu przy granicy 6,0 pu).

        Urzadzenie bez ogranicznikow zwraca same `None` — i wtedy nic sie nie
        zmienia ani w rownaniach, ani w koszcie kroku.
        """

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Zakresy WAZNOSCI MODELU — po jednym wpisie na stan, `None` gdy stan jest wolny.

        TO NIE JEST DRUGA NAZWA `granice_stanow`. Roznica jest merytoryczna i
        rozstrzyga o tym, co silnik ma zrobic, gdy stan dojdzie do konca zakresu:

        * `granice_stanow` opisuje OGRANICZNIK, czyli czlon modelu. Wzbudnica
          naprawde nie wyda wiecej niz `Efd_max`, lopata naprawde nie obroci sie
          za oporem mechanicznym, sygnal dwustanowy naprawde lezy w [0, 1].
          Stan sprowadzony na granice jest stanem POPRAWNYM, a pozostale rownania
          go CZYTAJA i odpowiadaja na niego wlasciwie (strumien maszyny czyta
          `Efd`, moc aerodynamiczna czyta kat lopat, okno mocy czyta crowbar).
          Dlatego rzutowanie jest tu modelem fizyki i bieg leci dalej.
        * `zakresy_waznosci` opisuje ZALOZENIE BADANIA. Poza nim model nie ma
          rownan — nie dlatego, ze cos je zatrzymuje, tylko dlatego, ze nikt ich
          nie napisal. Stanu sprowadzonego na taka granice NIE CZYTA zadne
          rownanie, wiec rzutowanie niczego nie uzgadnia: zamraza jedna liczbe i
          zostawia reszte modelu w niezmienionym biegu.

        DLACZEGO TO MA WLASNY MECHANIZM (pomiar, nie przeczucie). Stan naladowania
        magazynu byl zadeklarowany jako `granice_stanow`. Bieg z SOC dochodzacym
        do `SOC_min` konczyl sie normalnie, ze statusem poprawnym i pelnym
        kompletem probek, a magazyn oddawal do sieci 24 MW przez 1,7 s po
        opróznieniu ogniw. Pomiar bilansu: z ogniw mialo ubyc 14,337 kWh, ubylo
        2,000 kWh — 12,337 kWh energii wzietej ZNIKAD (86 % bilansu przebiegu).
        Symetrycznie przy `SOC_max`: 10,667 kWh pochlonietych przez pelna baterie.
        Rzutowanie nie chronilo wyniku, tylko ukrywalo, ze wynik jest nieosiagalny.

        KONTRAKT: wyjscie stanu poza swoj zakres waznosci konczy bieg odmowa
        `dynamika.zakres_waznosci_przekroczony` z adresem stanu, chwila, wartoscia
        i przekroczona granica. Odmowa, nie flaga w wyniku: probki policzone poza
        zakresem waznosci nie sa „mniej pewne", tylko nie pochodza z zadnego
        modelu, a uzytkownik nie ma jak odgadnac, ktore odrzucic.

        Urzadzenie, ktorego kazdy stan jest wazny wszedzie, zwraca same `None`.
        """

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Stany, ktorych pochodna w punkcie pracy NIE MUSI byc zerowa.

        PO CO TO ISTNIEJE. Bramka rownowagi silnika (SS0 p.3) zada, zeby punkt
        pracy z rozpływu spelnial `f(x0, y0) = 0` — inaczej bieg startuje skokiem,
        a pierwsza sekunda przebiegu jest „artefaktem rozruchu". Dla stanow
        elektromechanicznych i regulacyjnych to jest wlasciwe. Ale sa wielkosci,
        ktore w poprawnym punkcie pracy Z DEFINICJI dryfuja: stan naladowania
        magazynu, ktory sie laduje albo rozladowuje, jest calka mocy i jego
        pochodna jest niezerowa dokladnie wtedy, gdy magazyn pracuje.

        Gdyby bramka nie miala tego wyjatku, KAZDY bieg z pracujacym magazynem
        konczylby sie odmowa `dynamika.inicjalizacja_niezbiezna` — czyli rodzina
        urzadzen istnialaby w testach, a nie na sciezce uzytkownika. Wyjatek jest
        DEKLAROWANY PER URZADZENIE i jawnie widoczny w sladzie White Box, a nie
        wpisany w silnik jako wyjatek dla nazwy stanu.

        Wiekszosc urzadzen zwraca krotke pusta — kazdy ich stan ma byc rownowaga.
        """

    @property
    def sprzezenie(self) -> SprzezenieUrzadzenia:
        """Jak urzadzenie wchodzi do algebry sieci — deklaracja JAWNA w kazdej klasie.

        * `"pradowe"` — urzadzenie wstrzykuje prad `prad_pu(x, V)` do rownania KCL swojego
          wezla (zrodlo za impedancja, przeksztaltnik, maszyna). Tak wchodzi kazde
          urzadzenie biblioteki.
        * `"napieciowe"` — urzadzenie NARZUCA napiecie wezla `V = E(x)`
          (`napiecie_bez_obciazenia`, jakobian `jakobian_napiecia_bez_obciazenia`):
          wiersz KCL wezla zastepuje wiersz ograniczenia `V - E(x) = 0`, a prad
          urzadzenia jest WYPROWADZANY z bilansu wezla (`siec.prad_wezla_ograniczonego`).
          Tak wchodzi idealne zrodlo napieciowe (impedancja zerowa) — INNY mechanizm niz
          droga Nortona, ktora zerowej impedancji odmawia (`bazowe.admitancja_wewnetrzna`).

        Protokol NIE ma domyslki: przyszle zrodlo napieciowe zadeklarowane „z rozpedu"
        jako pradowe policzyloby inny uklad niz zbudowany, bez jednego sladu.
        """

    @property
    def stany_przypisywalne(self) -> tuple[str, ...]:
        """Stany, ktorym zdarzenie `PrzypisanieStanu` wolno nadac wartosc — deklaracja JAWNA.

        Wylacznie odniesienia i nastawy regulatorow (oraz stany profilu zrodla testowego):
        ich skok nie wymaga nieskonczonej wielkosci fizycznej, bo zaden z nich nie jest
        calka mocy, momentu ani napiecia. Strumien, kat, predkosc i stan naladowania NIE
        sa tu nigdy wymieniane (`reinicjalizacja.py`). Protokol nie ma domyslki: klasa bez
        takich stanow zwraca krotke pusta i kazde przypisanie konczy sie odmowa
        `dynamika.zdarzenie_przypisania_niedozwolone`.
        """

    @property
    def nastawy_regulacji(self) -> tuple[NastawaRegulacji, ...]:
        """Deklaracja wykonania komendy regulacji — DOKLADNIE trzy pozycje w kolejnosci
        `WIELKOSCI_NASTAW` (P, Q, U). Stan kazdej obslugiwanej wielkosci nalezy do
        `stany_przypisywalne` (przypiete testem)."""

    @property
    def agregat_jednostek(self) -> bool:
        """Czy urzadzenie jest agregatem IDENTYCZNYCH jednostek rownoleglych.

        Warunek czesciowej utraty zrodla (`UtrataCzesciowaZrodla`): ubytek czesci jednostek
        ma sens wylacznie dla elektrowni zlozonej z jednostek (falowniki, maszyny,
        zasobniki, turbiny). Ekwiwalent sieci nadrzednej (szyna sztywna) i zrodlo testowe
        nie sa agregatami — ich „czesciowa utrata" nie opisuje zadnego zjawiska.
        """

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Parametry urzadzenia wchodzace do `tozsamosc.odcisk_migawki` — JAWNIE, bez refleksji.

        Kazde pole dataklasy urzadzenia jest tutaj ALBO na liscie `POLA_POZA_ODCISKIEM`
        klasy (z uzasadnieniem) — przypina to `test_tozsamosc_urzadzen`. Bloki
        zagniezdzone (rdzen regulacji, regulatory, zasobnik) oddaja SWOJE
        `parametry_tozsamosci()`. Bez tego dwa biegi rozniace sie stala H albo
        wzmocnieniem petli synchronizacji mialy identyczna piatke odciskow przy
        ROZNYCH wynikach (defekt `odcisk_migawki`, karta AB-1b.1 par. 0 pkt 13).
        """

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """Stan rownowagi dla zadanego punktu pracy (napiecie zaciskow + moc oddawana)."""

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """f(x, y) — pochodne stanow roznicowych (1/s)."""

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂f/∂x — macierz (n, n)."""

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂f/∂(Re V, Im V) — macierz (n, 2)."""

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        """Prad wstrzykiwany do wezla (pu, konwencja generacji)."""

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        """∂(Re E_jalowe, Im E_jalowe)/∂x — macierz (2, n).

        Potrzebna, bo napiecie jalowe SAMO zalezy od stanu (dla zrodla
        napieciowego jest jego SEM). Bez tego bloku pochodna urzadzenia
        odlaczonego liczyla by sie regula lancuchowa NIEPELNIE: `df/dx` przy
        ustalonym napieciu, zamiast `df/dx + df/dV * dE/dx`. Defekt byl
        niewidoczny w przebiegu (moc elektryczna odlaczonego urzadzenia i tak
        jest zerowa), ale psul jakobian kroku — znalazl go test pochodnych
        wobec roznicy skonczonej.
        """

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """Napiecie zaciskow przy ZEROWYM pradzie (stan jalowy urzadzenia).

        Potrzebne przy ODLACZENIU zrodla (SS0 p.5): urzadzenie odlaczone od sieci
        nadal ma wlasna dynamike, ale jego moc elektryczna jest zerowa. Zamiast
        rozgalezienia „jesli odlaczone" w torze gorącym rdzenia, urzadzenie jest
        wtedy opakowane (`urzadzenia.UrzadzenieOdlaczone`), a jego pochodne licza
        sie wlasnie przy tym napieciu — dla zrodla napieciowego za impedancja
        daje to dokladnie `I = 0` i `P_e = 0`, bez zadnego przyblizenia.
        """

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂(Re I, Im I)/∂(Re V, Im V) — macierz (2, 2)."""

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂(Re I, Im I)/∂x — macierz (2, n)."""


@dataclass(frozen=True)
class WejscieDynamiki:
    """Kompletne wejscie rdzenia dynamiki (SS0 p.2).

    `s_bazowa_mva` i `f_bazowa_hz` sa baza CALEGO ukladu: kazda wielkosc pu w tym
    kontrakcie jest odniesiona do nich, a urzadzenie o wlasnej bazie mocy
    przelicza sie na ta baze przy budowie (`konwencje.zmiana_bazy_impedancji`) —
    jeden przelicznik w jednym miejscu (kontrprzyklad 100/50 MVA z przegladu
    P1-B55-02: dwie bazy tej samej wielkosci pu dawaly trwaly blad mocy 2:1).
    """

    wezly: tuple[WezelDynamiki, ...]
    galezie: tuple[GalazDynamiki, ...]
    odsprzegi: tuple[OdsprzegDynamiki, ...]
    odbiory: tuple[OdbiorDynamiki, ...]
    urzadzenia: tuple[Urzadzenie, ...]
    punkt_pracy: PunktPracy
    harmonogram: HarmonogramDynamiki
    nastawy: NastawySolvera
    s_bazowa_mva: float
    f_bazowa_hz: float


__all__ = [
    "KODY_ODMOW",
    "KOD_ALGEBRA_NIEZBIEZNA",
    "KOD_BRAK_POLA",
    "KOD_INICJALIZACJA_NIEZBIEZNA",
    "KOD_KROK_NIEZBIEZNY",
    "KOD_NAPIECIE_NARZUCONE_SPRZECZNE",
    "KOD_NASTAWA_NIEOBSLUGIWANA",
    "KOD_NASTAWY_SPRZECZNE",
    "KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU",
    "KOD_PARAMETRY_SPRZECZNE",
    "KOD_PETLA_ZDARZEN_WARUNKOWYCH",
    "KOD_PUNKT_PRACY_POZA_OGRANICZENIEM",
    "KOD_REINICJALIZACJA_NIEZBIEZNA",
    "KOD_RODZINA_NIEOBSLUGIWANA",
    "KOD_SIEC_NIESPOJNA",
    "KOD_UDZIAL_ZRODLA_NIEDOZWOLONY",
    "KOD_WARIANT_BEZ_PARAMETROW",
    "KOD_WARTOSC_NIESKONCZONA",
    "KOD_WYSPA_BEZ_ZRODLA",
    "KOD_ZDARZENIE_BEZ_ELEMENTU",
    "KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE",
    "KOD_ZDARZENIE_SPRZECZNE",
    "KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY",
    "KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE",
    "KOD_ZWARCIE_NIEODIZOLOWANE",
    "KOD_ZWARCIE_NIESYMETRYCZNE",
    "WIELKOSCI_NASTAW",
    "GalazDynamiki",
    "HarmonogramDynamiki",
    "KomendaRegulacji",
    "NastawaRegulacji",
    "NastawySolvera",
    "NazwaIntegratora",
    "OdbiorDynamiki",
    "OdlaczenieZrodla",
    "OdmowaDynamiki",
    "OdsprzegDynamiki",
    "PrzypisanieStanu",
    "PunktPracy",
    "RodzajGalezi",
    "SkokObciazenia",
    "SposobUsuniecia",
    "SprzezenieUrzadzenia",
    "Urzadzenie",
    "UtrataCzesciowaZrodla",
    "WejscieDynamiki",
    "WezelDynamiki",
    "WielkoscNastawy",
    "ZdarzenieDynamiki",
    "ZmianaGalezi",
    "ZmianaOdbioru",
    "ZmianaOdsprzegu",
    "ZwarcieGalezi",
    "ZwarcieWezla",
    "odmowa_braku_pola",
]
