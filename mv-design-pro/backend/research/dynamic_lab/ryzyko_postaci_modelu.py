"""§11.3/8 — INWENTARZ ograniczników i nasyceń z klasyfikacją RYZYKA POSTACI MODELU.

KOD BADAWCZY — patrz `backend/research/README.md`.

CO TO JEST „RYZYKO POSTACI MODELU" (model-form risk)
----------------------------------------------------
Nie błąd implementacji i nie błąd parametru. To ryzyko, że KSZTAŁT równania jest
inny niż kształt zjawiska — a wynik i tak wygląda poprawnie, bo jest gładki,
zbieżny i mieści się w zakresie. Ogranicznik jest tu przypadkiem najgorszym:

* działa RZADKO (tylko w nasyceniu), więc testy w zakresie liniowym go nie
  dotykają — a to właśnie zdarzenia zwarciowe wpychają model w nasycenie;
* ma WIELE obronnych postaci (obcięcie żądania, rzutowanie stanu, anti-windup
  ze sprzężeniem, ograniczenie okręgiem z priorytetem, impedancja wirtualna),
  które w zakresie liniowym dają IDENTYCZNE wyniki, a w nasyceniu różne;
* wybór postaci jest DECYZJĄ, nie odczytem z karty katalogowej — producent
  podaje ``I_max``, nie strategię, którą jego regulator realizuje.

Dlatego inwentarz jest tu pierwszym produktem, a nie dokumentacją po fakcie:
nie da się ocenić ryzyka listy, której się nie zna.

ZASADA TEGO MODUŁU: LISTA JEST ZAMKNIĘTA I PILNOWANA SKANEM ŹRÓDEŁ
-------------------------------------------------------------------
``tests/research/test_ryzyko_postaci_modelu.py`` przechodzi drzewem składni
KAŻDEGO pliku laboratorium, znajduje wywołania funkcji ograniczających i
deklaracje ``OgraniczenieStanu``, i wymaga, żeby KAŻDE miejsce (plik + symbol
otaczający) miało wpis w ``INWENTARZ``. Nowy ogranicznik dołożony gdziekolwiek
w laboratorium czerwieni ten test — inaczej „lista zamknięta" byłoby obietnicą
bez testu, czyli rzeczą groźniejszą od samego braku listy.

CZEGO TEN MODUŁ NIE ROBI — i to jest wymóg, nie skromność
----------------------------------------------------------
NIE wybiera postaci kanonicznej. Klasyfikacja mówi, gdzie alternatywa istnieje i
czy różnica została ZMIERZONA; wybór postaci dla produktu jest decyzją
architektoniczną, nie wnioskiem z tego pliku.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

__all__ = [
    "INWENTARZ",
    "KlasaRyzyka",
    "PostacOgranicznika",
    "PozycjaOgranicznika",
    "miejsca_inwentarza",
    "pozycje_o_ryzyku",
]


class PostacOgranicznika(StrEnum):
    """JAKĄ POSTAĆ MATEMATYCZNĄ ma ograniczenie — nie gdzie stoi, tylko czym jest."""

    OBCIECIE_ZADANIA = "obciecie_zadania"
    """``cel := clamp(cel)`` PRZED wejściem do równania różniczkowego.

    Skutek: ``f`` pozostaje ciągła i afiniczna, więc równanie niejawne ma
    rozwiązanie, a przedział jest zbiorem niezmienniczym przepływu ścisłego.
    """

    RZUTOWANIE_STANU = "rzutowanie_stanu"
    """Niezmiennik DYSKRETNY: przyjęty stan rzutowany na przedział, z dziennikiem.

    Osobna postać od obcięcia żądania, choć często występują razem: obcięcie
    dotyczy WEJŚCIA równania, rzutowanie — WYJŚCIA kroku całkowania.
    """

    OKRAG_Z_PRIORYTETEM = "okrag_z_priorytetem"
    """``|S| <= S_max`` (albo ``|I| <= I_max``) z regułą, która składowa ustępuje."""

    IMPEDANCJA_WIRTUALNA = "impedancja_wirtualna"
    """Ograniczenie MIĘKKIE: wzrost impedancji, prąd maleje bez obrotu fazy."""

    BRAK_OGRANICZNIKA = "brak_ogranicznika"
    """Wielkość fizycznie ograniczona, w modelu NIE ograniczona — jawnie."""


class KlasaRyzyka(StrEnum):
    """Ryzyko postaci — kryterium jest OPERACYJNE, nie uznaniowe."""

    POSTAC_WYMUSZONA = "postac_wymuszona"
    """Postać wynika z fizyki albo z matematyki i nie ma obronnej alternatywy.

    Wymaga PODANIA argumentu wymuszającego (pole ``uzasadnienie_pl``) — samo
    stwierdzenie „tak się robi" nie jest argumentem.
    """

    ALTERNATYWA_ZMIERZONA = "alternatywa_zmierzona"
    """Alternatywna postać istnieje, jest zaimplementowana i różnica ZMIERZONA.

    Najniższe realne ryzyko dla miejsca, w którym wybór faktycznie istnieje:
    wiadomo, ile kosztuje pomyłka.
    """

    ALTERNATYWA_NIEZMIERZONA = "alternatywa_niezmierzona"
    """Alternatywa jest znana i obronna, ale RÓŻNICA NIE ZOSTAŁA ZMIERZONA.

    To jest właściwa nazwa dla „nie wiemy, ile to zmienia" — i nie wolno jej
    mylić z niskim ryzykiem tylko dlatego, że nic złego się dotąd nie zdarzyło.
    """

    LUKA_MODELU = "luka_modelu"
    """Wielkość ograniczona w rzeczywistości, nieograniczona w modelu."""


@dataclass(frozen=True)
class PozycjaOgranicznika:
    """Jedno miejsce, w którym laboratorium ogranicza wielkość fizyczną."""

    identyfikator: str
    plik: str
    symbol: str
    """Symbol OTACZAJĄCY miejsce (``Klasa.metoda`` albo ``funkcja``) — tożsamość
    używana przez skan źródeł, więc musi zgadzać się co do znaku."""
    wielkosc_pl: str
    jednostka: str
    postac: PostacOgranicznika
    klasa_ryzyka: KlasaRyzyka
    alternatywy_pl: tuple[str, ...]
    uzasadnienie_pl: str
    pomiar_pl: str
    """Co ZMIERZONO. Pusty napis wolno zostawić WYŁĄCZNIE dla postaci wymuszonej."""
    test_przypinajacy: str

    def __post_init__(self) -> None:
        if self.klasa_ryzyka is KlasaRyzyka.ALTERNATYWA_ZMIERZONA and not self.pomiar_pl.strip():
            raise ValueError(
                f"{self.identyfikator}: klasa ALTERNATYWA_ZMIERZONA bez podanego pomiaru "
                f"jest deklaracją, nie pomiarem."
            )
        if self.klasa_ryzyka is KlasaRyzyka.POSTAC_WYMUSZONA and self.alternatywy_pl:
            raise ValueError(
                f"{self.identyfikator}: postać nie może być WYMUSZONA i mieć alternatyw "
                f"jednocześnie — to są dwie sprzeczne deklaracje o tym samym miejscu."
            )
        if not self.uzasadnienie_pl.strip():
            raise ValueError(f"{self.identyfikator}: brak uzasadnienia wyboru postaci.")
        if not self.test_przypinajacy.strip():
            raise ValueError(
                f"{self.identyfikator}: wpis bez testu przypinającego jest obietnicą, "
                f"a obietnica bez testu wyłącza czujność."
            )


INWENTARZ: tuple[PozycjaOgranicznika, ...] = (
    # --- konwencje: wspólne reguły przekształtnika ---------------------------
    PozycjaOgranicznika(
        identyfikator="okrag-mocy-pozornej",
        plik="konwencje.py",
        symbol="ogranicz_okregiem",
        wielkosc_pl="zadanie mocy pozornej falownika (P, Q)",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=("ograniczenie prostokątem (|P|<=S i |Q|<=S niezależnie)",),
        uzasadnienie_pl=(
            "Granicą falownika jest prąd zaworów, a |I| = |S|/|U| — ograniczenie jest "
            "z natury na MODULE mocy pozornej."
        ),
        pomiar_pl=(
            "Prostokąt dopuszcza punkt P = Q = S, w którym |S| = sqrt(2)·S_max, czyli "
            "41 % przeciążenia prądowego ponad granicę termiczną."
        ),
        test_przypinajacy="test_ogranicznik_falownika_jest_okregiem_a_nie_prostokatem",
    ),
    PozycjaOgranicznika(
        identyfikator="okrag-pradu-falownika",
        plik="konwencje.py",
        symbol="ogranicz_prad",
        wielkosc_pl="moduł prądu przekształtnika",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=(
            "priorytet składowej czynnej zamiast biernej",
            "skalowanie całego wektora bez rozkładu na składowe",
            "priorytet zmienny w czasie (najpierw bierna, po ustaniu zapadu czynna)",
        ),
        uzasadnienie_pl=(
            "Priorytet biernej odpowiada wymaganiu wsparcia napięcia w kodeksie "
            "sieciowym; przy zaniku napięcia faza jest nieokreślona, więc skalowany "
            "jest cały wektor — rozkład na składowe nie ma wtedy odniesienia."
        ),
        pomiar_pl=(
            "ZMIERZONE uprzężą §11.3/9 (sieć SN z dwoma falownikami, zwarcie na SN2, trapez niejawny, krok 2 ms). Zapad PŁYTKI (x_f = 0,30 p.u.): różnica DOKŁADNIE ZEROWA we wszystkich pięciu kanałach — ogranicznik nieaktywny, postacie NIEROZRÓŻNIALNE. Zapad GŁĘBOKI (x_f = 0,10 p.u.): max |ΔU| = 0,0622 p.u. na zaciskach DER2, max |ΔI| = 0,195 p.u. (priorytet czynnej dobija do 1,200 p.u., priorytet biernej zatrzymuje się na 1,005), max |ΔQ| = 0,052 p.u. — wszystkie maksima w chwili 0,512 s, czyli W ZWARCIU."
        ),
        test_przypinajacy="test_zapad_GLEBOKI_odroznia_postacie_i_podaje_LICZBE",
    ),
    PozycjaOgranicznika(
        identyfikator="clamp-podstawowy",
        plik="konwencje.py",
        symbol="ogranicz_do_przedzialu",
        wielkosc_pl="dowolna wielkość skalarna (prymityw wspólny)",
        jednostka="—",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl=(
            "To nie jest model fizyczny, tylko prymityw z jawnym sprawdzeniem, że "
            "przedział nie jest pusty. Ryzyko postaci leży w miejscach, które go WOŁAJĄ."
        ),
        pomiar_pl="",
        test_przypinajacy="test_ogranicznik_odrzuca_odwrocony_przedzial",
    ),
    # --- regulatory ----------------------------------------------------------
    PozycjaOgranicznika(
        identyfikator="avr-obciecie-zadania",
        plik="regulatory.py",
        symbol="RegulatorNapiecia.pochodna",
        wielkosc_pl="żądanie napięcia wzbudzenia (sufit wzbudnicy)",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=(
            "stan nieograniczony + nasycone wyjście + sprzężenie anti-windup -K_aw·(x-sat(x))",
            "zerowanie pochodnej na granicy (ogranicznik non-windup klasyczny)",
        ),
        uzasadnienie_pl=(
            "Ograniczone żądanie czyni f ciągłą i afiniczną, więc równanie niejawne ZAWSZE "
            "ma rozwiązanie, a przedział jest zbiorem niezmienniczym przepływu ścisłego."
        ),
        pomiar_pl=(
            "Wariant ze sprzężeniem anti-windup (K_aw = 100, T_a = 0,05): integratory jawne "
            "rozjeżdżają się przy dt >= 0,005 (błąd końcowy 1,010 p.u.), raportując wyjście "
            "W ZAKRESIE, bo sat() maskuje rozjazd. Wariant z zerowaniem pochodnej: równanie "
            'niejawne NIE MA rozwiązania (governor, dt = 0,5: gałąź „poniżej limitu" daje '
            'x1 = 1,4 przy założeniu x1 < 1,2, gałąź „na limicie" daje x1 = 1,0 przy '
            "założeniu x1 >= 1,2) — Newton kończył BrakZbieznosciIntegratoraError z "
            "residuum 4,000e-01."
        ),
        test_przypinajacy="test_avr_wejscie_i_zejscie_z_ogranicznika",
    ),
    PozycjaOgranicznika(
        identyfikator="avr-rzutowanie-stanu",
        plik="regulatory.py",
        symbol="RegulatorNapiecia.ogranicznik_stanu",
        wielkosc_pl="stan Efd (napięcie wzbudzenia)",
        jednostka="p.u.",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl=(
            "Przedział jest niezmienniczy dla przepływu ŚCISŁEGO, więc wyjście poza niego "
            "jest wyłącznie artefaktem dyskretyzacji; rzutowanie odtwarza własność "
            "rozwiązania ścisłego i jest zapisywane w dzienniku."
        ),
        pomiar_pl=(
            "Bez rzutowania, Euler jawny (x = 4,0; cel = 5,0; T = 0,05; dt = 0,10): "
            "x_next = 6,000 przy suficie 5,0 — 20 % ponad sufit wzbudnicy."
        ),
        test_przypinajacy="test_bez_niezmiennika_stan_wychodzi_poza_sufit_wzbudnicy",
    ),
    PozycjaOgranicznika(
        identyfikator="avr-rzutowanie-punktu-pracy",
        plik="regulatory.py",
        symbol="RegulatorNapiecia.stan_ustalony",
        wielkosc_pl="startowe Efd wyliczone z punktu pracy rozpływu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl=(
            "Maszyna może wymagać Efd ponad sufitem wzbudnicy; start poza ogranicznikiem "
            "dałby w pierwszym kroku skok wzbudzenia bez przyczyny fizycznej."
        ),
        pomiar_pl=(
            "Mutacja usuwająca to rzutowanie PRZEŻYŁA komplet 35 testów §5-§7, bo wszystkie "
            "startowały wewnątrz zakresu — dołożony test pokrywa obie granice."
        ),
        test_przypinajacy="test_avr_punkt_startowy_lezy_W_OGRANICZNIKU",
    ),
    PozycjaOgranicznika(
        identyfikator="governor-obciecie-zadania",
        plik="regulatory.py",
        symbol="RegulatorTurbiny.pochodna",
        wielkosc_pl="żądanie mocy mechanicznej (zakres regulacyjny turbiny)",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=("zerowanie pochodnej na granicy (ogranicznik non-windup klasyczny)",),
        uzasadnienie_pl="Jak w AVR — ta sama klasa, naprawiona w obu, nie w jednym.",
        pomiar_pl=(
            "Euler jawny, omega = 0,95, R = 0,05, T_g = 0,5, p_max = 1,2: żądanie "
            "nieograniczone 1,800 p.u.; dt = 0,50 dawało Pm = 1,800 (+0,600 ponad limit), "
            "dt = 0,20 — Pm = 1,320 (+0,120)."
        ),
        test_przypinajacy="test_governor_punkt_startowy_lezy_W_OGRANICZNIKU",
    ),
    PozycjaOgranicznika(
        identyfikator="governor-rzutowanie-stanu",
        plik="regulatory.py",
        symbol="RegulatorTurbiny.ogranicznik_stanu",
        wielkosc_pl="stan Pm (moc mechaniczna)",
        jednostka="p.u.",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Jak w AVR: przedział niezmienniczy przepływu ścisłego.",
        pomiar_pl="",
        test_przypinajacy="test_niezmiennik_stanu_trzyma_sie_dla_kazdej_metody_i_kazdego_kroku",
    ),
    PozycjaOgranicznika(
        identyfikator="governor-rzutowanie-punktu-pracy",
        plik="regulatory.py",
        symbol="RegulatorTurbiny.stan_ustalony",
        wielkosc_pl="startowe Pm wyliczone z punktu pracy rozpływu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Jak w AVR — start poza zakresem regulacyjnym nie ma sensu fizycznego.",
        pomiar_pl="",
        test_przypinajacy="test_zadanie_jest_ograniczone_w_obu_regulatorach",
    ),
    PozycjaOgranicznika(
        identyfikator="pss-ogranicznik-wyjscia",
        plik="regulatory.py",
        symbol="StabilizatorSystemowy.wyjscie",
        wielkosc_pl="sygnał stabilizujący v_pss dodawany do uchybu AVR",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=(
            "ograniczenie stanów filtru zamiast wyjścia",
            "ogranicznik asymetryczny z osobną logiką wyłączania PSS przy dużym zapadzie",
        ),
        uzasadnienie_pl=(
            "Stany x_w, x_1, x_2 są stanami FILTRU i nie mają granicy fizycznej — "
            "rzutowanie ich na jakikolwiek przedział byłoby wymyśloną liczbą. Granicę "
            "fizyczną ma wyjście (zakres modulacji uchybu wzbudnicy)."
        ),
        pomiar_pl=(
            "NIE ZMIERZONO: różnica trajektorii między ograniczeniem wyjścia a "
            "ograniczeniem stanów filtru nie została policzona."
        ),
        test_przypinajacy="test_pss_ogranicznik_wyjscia_dziala",
    ),
    # --- falownik GFL --------------------------------------------------------
    PozycjaOgranicznika(
        identyfikator="gfl-okrag-zadania",
        plik="urzadzenia.py",
        symbol="FalownikGFL.pochodne",
        wielkosc_pl="zadanie (P, Q) falownika podążającego, z rezerwą na prąd FRT",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("priorytet czynnej", "brak rezerwy na prąd FRT w zadaniu"),
        uzasadnienie_pl=(
            "Prąd wsparcia FRT jest rezerwowany PRZED podziałem reszty, bo wymaganie "
            "kodeksowe dotyczy składowej biernej, nie sumy."
        ),
        pomiar_pl=(
            "Priorytet składowej: ZMIERZONY (patrz `okrag-pradu-falownika` — 0,0622 p.u. "
            "na napięciu zacisków przy głębokim zapadzie). Natomiast sama REZERWACJA "
            "prądu FRT: NIE ZMIERZONO różnicy wobec wariantu bez rezerwacji — to osobna "
            "decyzja o postaci, której alternatywa nie jest zaimplementowana."
        ),
        test_przypinajacy="test_gfl_rezerwuje_prad_frt_przed_podzialem",
    ),
    PozycjaOgranicznika(
        identyfikator="gfl-okrag-pradu",
        plik="urzadzenia.py",
        symbol="FalownikGFL.wstrzykniecie",
        wielkosc_pl="moduł prądu wstrzykiwanego (nasycenie zaworów)",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=("priorytet czynnej", "skalowanie wektora bez rozkładu"),
        uzasadnienie_pl="Ogranicznik WSPÓLNY z modułami OZE — jedna reguła, nie dwie.",
        pomiar_pl=(
            "ZMIERZONE uprzężą §11.3/9 (sieć SN z dwoma falownikami, zwarcie na SN2, trapez niejawny, krok 2 ms). Zapad PŁYTKI (x_f = 0,30 p.u.): różnica DOKŁADNIE ZEROWA we wszystkich pięciu kanałach — ogranicznik nieaktywny, postacie NIEROZRÓŻNIALNE. Zapad GŁĘBOKI (x_f = 0,10 p.u.): max |ΔU| = 0,0622 p.u. na zaciskach DER2, max |ΔI| = 0,195 p.u. (priorytet czynnej dobija do 1,200 p.u., priorytet biernej zatrzymuje się na 1,005), max |ΔQ| = 0,052 p.u. — wszystkie maksima w chwili 0,512 s, czyli W ZWARCIU. Pomiar wykonano WŁAŚNIE na tej ścieżce (falownik GFL), więc jest to "
            "pomiar własny tej pozycji, a nie odziedziczony."
        ),
        test_przypinajacy="test_zapad_GLEBOKI_odroznia_postacie_i_podaje_LICZBE",
    ),
    PozycjaOgranicznika(
        identyfikator="gfl-rzutowanie-stanow",
        plik="urzadzenia.py",
        symbol="FalownikGFL.ograniczniki_stanu",
        wielkosc_pl="stany P i Q toru sterowania",
        jednostka="p.u.",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl=(
            "Cel obu torów przechodzi przez ogranicz_okregiem, więc kwadrat [-S,S]^2 jest "
            "zbiorem niezmienniczym przepływu ścisłego."
        ),
        pomiar_pl="",
        test_przypinajacy="test_stany_pq_przekstaltnikow_nie_wychodza_poza_ogranicznik",
    ),
    # --- falownik GFM: DWIE STRATEGIE, świadomie nierozstrzygnięte -----------
    PozycjaOgranicznika(
        identyfikator="gfm-nasycenie-zadania",
        plik="urzadzenia.py",
        symbol="KandydatOgraniczeniaNasycenieZadania.prad_ograniczony",
        wielkosc_pl="prąd falownika tworzącego sieć — obcięcie modułu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=("impedancja wirtualna (ograniczenie miękkie)",),
        uzasadnienie_pl=(
            "Limit TWARDY: |I| nigdy nie przekracza i_max. Kosztem jest zmiana charakteru "
            "źródła — w nasyceniu prąd jest zadany co do modułu, więc GFM przestaje być "
            "źródłem napięciowym."
        ),
        pomiar_pl=(
            "Sztywność napięciowa |dU/dP| w nasyceniu: 0,168 p.u./p.u. (zwarcie x_f = 0,05). "
            "Ranking obu strategii ZALEŻY OD GŁĘBOKOŚCI zapadu — nie ma zwycięzcy globalnego."
        ),
        test_przypinajacy="test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci",
    ),
    PozycjaOgranicznika(
        identyfikator="gfm-impedancja-wirtualna",
        plik="urzadzenia.py",
        symbol="KandydatOgraniczeniaImpedancjaWirtualna.prad_ograniczony",
        wielkosc_pl="prąd falownika tworzącego sieć — wzrost impedancji",
        jednostka="p.u.",
        postac=PostacOgranicznika.IMPEDANCJA_WIRTUALNA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_ZMIERZONA,
        alternatywy_pl=("nasycenie zadania (ograniczenie twarde)",),
        uzasadnienie_pl=(
            "Moduł prądu maleje BEZ obrotu fazy, więc prąd pozostaje prądem źródła "
            "napięciowego za większą impedancją. Limit jest MIĘKKI — kres wynosi "
            "max(i_max, |Z_w|/k), czyli powyżej i_max dla małych k."
        ),
        pomiar_pl=(
            "|dU/dP| rośnie z 0,0253 do 0,0571 p.u./p.u. (k = 0,10; x_f = 0,05), a przy "
            "k = 0,20 i x_f = 0,01 sięga 1,081. Próg twardości k* = |Z_w|/i_max = 0,125277."
        ),
        test_przypinajacy="test_kres_gorny_impedancji_wirtualnej_zgadza_sie_z_wyprowadzeniem",
    ),
    PozycjaOgranicznika(
        identyfikator="gfm-bez-ogranicznika",
        plik="urzadzenia.py",
        symbol="FalownikGFM",
        wielkosc_pl="prąd GFM przy `ogranicznik=None` (wartość domyślna)",
        jednostka="p.u.",
        postac=PostacOgranicznika.BRAK_OGRANICZNIKA,
        klasa_ryzyka=KlasaRyzyka.LUKA_MODELU,
        alternatywy_pl=("wymuszenie ogranicznika w konstruktorze",),
        uzasadnienie_pl=(
            "GFM bez ogranicznika jest źródłem napięciowym o nieograniczonym prądzie — "
            'porównanie „GFL vs GFM podczas FRT" porównuje wtedy urządzenie z limitem z '
            "urządzeniem bez limitu, czyli nie porównuje strategii."
        ),
        pomiar_pl=(
            "Zmierzone na sieci DER-MID-SYS (x_f = 0,05 na MID, P = 0,6, RK4, 2 ms): "
            "I_max = 2,4425 p.u., około dwukrotności wartości osiągalnej dla rzeczywistego "
            "przekształtnika (typowo 1,1-1,5 p.u.)."
        ),
        test_przypinajacy="test_domyslny_gfm_nie_ma_ogranicznika_i_daje_prad_niefizyczny",
    ),
    # --- OZE: jednostki PQ, magazyn, regulator elektrowni --------------------
    PozycjaOgranicznika(
        identyfikator="pq-okrag-zadania",
        plik="urzadzenia_oze.py",
        symbol="JednostkaSterowanaPQ.pochodne_ze_zadaniem",
        wielkosc_pl="zadanie (P, Q) jednostki sterowanej",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("priorytet czynnej",),
        uzasadnienie_pl="Wspólna reguła przekształtnika (konwencje), nie druga prawda.",
        pomiar_pl=(
            "NIE ZMIERZONO dla TEJ rodziny. Rząd zjawiska jest znany z pomiaru na "
            "falowniku GFL (`okrag-pradu-falownika`: 0,0622 p.u. na napięciu zacisków), "
            "ale jednostka PQ ma inne stałe czasowe i inny domyślny priorytet, więc "
            "przeniesienie liczby byłoby ekstrapolacją, nie pomiarem."
        ),
        test_przypinajacy="test_magazyn_odrzuca_dyspozycje_ponad_moc_falownika",
    ),
    PozycjaOgranicznika(
        identyfikator="pq-okrag-pradu",
        plik="urzadzenia_oze.py",
        symbol="JednostkaSterowanaPQ.wstrzykniecie",
        wielkosc_pl="moduł prądu jednostki sterowanej",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("priorytet czynnej", "skalowanie wektora bez rozkładu"),
        uzasadnienie_pl="Wspólna reguła przekształtnika.",
        pomiar_pl=(
            "NIE ZMIERZONO dla TEJ rodziny. Rząd zjawiska znany z pomiaru na falowniku "
            "GFL (`okrag-pradu-falownika`), ale magazyn ma domyślnie priorytet CZYNNEJ "
            "(odwrotnie niż GFL), więc kierunek różnicy może być inny."
        ),
        test_przypinajacy="test_prad_magazynu_nie_przekracza_ogranicznika",
    ),
    PozycjaOgranicznika(
        identyfikator="pq-okrag-inicjalizacji",
        plik="urzadzenia_oze.py",
        symbol="JednostkaSterowanaPQ.inicjalizuj",
        wielkosc_pl="startowe (P, Q) z punktu pracy rozpływu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Start poza okręgiem znamionowym nie ma sensu fizycznego.",
        pomiar_pl="",
        test_przypinajacy="test_magazyn_startuje_w_rownowadze",
    ),
    PozycjaOgranicznika(
        identyfikator="pq-rzutowanie-stanow",
        plik="urzadzenia_oze.py",
        symbol="JednostkaSterowanaPQ.ograniczniki_stanu",
        wielkosc_pl="stany P i Q jednostki sterowanej",
        jednostka="p.u.",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Kwadrat [-S,S]^2 jest niezmienniczy dla przepływu ścisłego.",
        pomiar_pl="",
        test_przypinajacy="test_stany_pq_przekstaltnikow_nie_wychodza_poza_ogranicznik",
    ),
    PozycjaOgranicznika(
        identyfikator="bess-okrag-celu",
        plik="urzadzenia_oze.py",
        symbol="MagazynEnergiiBESS.cel_mocy",
        wielkosc_pl="zadanie mocy magazynu po uwzględnieniu dostępności energii",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("priorytet czynnej przy niskim SOC",),
        uzasadnienie_pl=(
            "Magazyn ma tę samą granicę falownikową co inne przekształtniki; ograniczenie "
            "energetyczne jest NAKŁADANE OSOBNO (dostepnosc_energii), a nie mieszane z "
            "ograniczeniem mocy."
        ),
        pomiar_pl="NIE ZMIERZONO różnicy wobec priorytetu czynnej przy niskim SOC.",
        test_przypinajacy="test_magazyn_odrzuca_dyspozycje_ponad_moc_falownika",
    ),
    PozycjaOgranicznika(
        identyfikator="bess-dostepnosc-energii",
        plik="urzadzenia_oze.py",
        symbol="MagazynEnergiiBESS.dostepnosc_energii",
        wielkosc_pl="moc ograniczona zapasem energii (SOC przy krańcach)",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=(
            "wygaszanie liniowe mocy w pasie przy krańcu SOC (taper) zamiast obcięcia",
            "histereza wyłączenia/załączenia przy krańcu SOC",
        ),
        uzasadnienie_pl=(
            "Obcięcie jest najprostszą postacią spełniającą bilans energii; taper i "
            "histereza są realne w sterownikach producenta, ale ich parametry nie wynikają "
            "z żadnej dostępnej karty katalogowej — wpisanie ich byłoby fabrykacją."
        ),
        pomiar_pl=(
            "NIE ZMIERZONO: różnica trajektorii SOC i mocy między obcięciem a wygaszaniem "
            "liniowym nie została policzona. To jest NAJWIĘKSZE nierozpoznane ryzyko "
            "postaci w module OZE, bo dotyczy krańca SOC, czyli obszaru, w którym magazyn "
            "pracuje w scenariuszach bilansowych."
        ),
        test_przypinajacy="test_magazyn_bez_energii_odrzuca_dyspozycje_rozladowania",
    ),
    PozycjaOgranicznika(
        identyfikator="bess-okrag-pradu",
        plik="urzadzenia_oze.py",
        symbol="MagazynEnergiiBESS.wstrzykniecie",
        wielkosc_pl="moduł prądu magazynu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OKRAG_Z_PRIORYTETEM,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("priorytet czynnej", "skalowanie wektora bez rozkładu"),
        uzasadnienie_pl="Wspólna reguła przekształtnika.",
        pomiar_pl=(
            "NIE ZMIERZONO dla TEJ rodziny. Rząd zjawiska znany z pomiaru na falowniku "
            "GFL (`okrag-pradu-falownika`), ale magazyn ma domyślnie priorytet CZYNNEJ "
            "(odwrotnie niż GFL), więc kierunek różnicy może być inny."
        ),
        test_przypinajacy="test_prad_magazynu_nie_przekracza_ogranicznika",
    ),
    PozycjaOgranicznika(
        identyfikator="bess-okrag-inicjalizacji",
        plik="urzadzenia_oze.py",
        symbol="MagazynEnergiiBESS.inicjalizuj",
        wielkosc_pl="startowe (P, Q) magazynu",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Start poza okręgiem znamionowym nie ma sensu fizycznego.",
        pomiar_pl="",
        test_przypinajacy="test_magazyn_startuje_w_rownowadze",
    ),
    PozycjaOgranicznika(
        identyfikator="bess-rzutowanie-stanow",
        plik="urzadzenia_oze.py",
        symbol="MagazynEnergiiBESS.ograniczniki_stanu",
        wielkosc_pl="stany P, Q oraz SOC magazynu",
        jednostka="p.u. / —",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl=(
            "SOC poza [0, 1] jest wielkością nieistniejącą fizycznie, a nie liczbą do "
            "interpretacji; P i Q — jak w pozostałych przekształtnikach."
        ),
        pomiar_pl="",
        test_przypinajacy="test_soc_nie_wychodzi_poza_zero_jeden_w_biegu",
    ),
    PozycjaOgranicznika(
        identyfikator="ppc-obciecie-celu",
        plik="urzadzenia_oze.py",
        symbol="RegulatorElektrowniPPC.cel_plantu",
        wielkosc_pl="zadanie mocy elektrowni rozdzielane na jednostki",
        jednostka="p.u.",
        postac=PostacOgranicznika.OBCIECIE_ZADANIA,
        klasa_ryzyka=KlasaRyzyka.ALTERNATYWA_NIEZMIERZONA,
        alternatywy_pl=("ograniczenie okręgiem na poziomie elektrowni zamiast osobno P i Q",),
        uzasadnienie_pl=(
            "Zadanie elektrowni jest rozdzielane na jednostki, które MAJĄ własny okrąg — "
            "ograniczenie prostokątne na poziomie elektrowni nie może więc wypchnąć żadnej "
            "jednostki poza jej granicę."
        ),
        pomiar_pl=(
            "NIE ZMIERZONO: różnica między prostokątem na poziomie elektrowni a okręgiem "
            "nie została policzona. Argument powyżej dowodzi BEZPIECZEŃSTWA (żadna "
            "jednostka nie przekroczy swojej granicy), a nie równoważności trajektorii."
        ),
        test_przypinajacy="test_limit_eksportu_jest_dotrzymany_w_pcc",
    ),
    PozycjaOgranicznika(
        identyfikator="ppc-rzutowanie-stanow",
        plik="urzadzenia_oze.py",
        symbol="RegulatorElektrowniPPC.ograniczniki_stanu",
        wielkosc_pl="stany regulatora elektrowni",
        jednostka="p.u.",
        postac=PostacOgranicznika.RZUTOWANIE_STANU,
        klasa_ryzyka=KlasaRyzyka.POSTAC_WYMUSZONA,
        alternatywy_pl=(),
        uzasadnienie_pl="Przedział niezmienniczy przepływu ścisłego, jak w regulatorach.",
        pomiar_pl="",
        test_przypinajacy="test_ppc_propaguje_ograniczniki_swoich_modulow",
    ),
)


def miejsca_inwentarza() -> frozenset[tuple[str, str]]:
    """Zbiór ``(plik, symbol)`` objętych inwentarzem — wejście do skanu źródeł."""
    return frozenset((p.plik, p.symbol) for p in INWENTARZ)


def pozycje_o_ryzyku(klasa: KlasaRyzyka) -> tuple[PozycjaOgranicznika, ...]:
    return tuple(p for p in INWENTARZ if p.klasa_ryzyka is klasa)
