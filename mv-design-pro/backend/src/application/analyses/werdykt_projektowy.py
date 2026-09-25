"""Agregat werdyktu projektowego — rejestr kryteriow projektu (karta F-K3).

Znalezisko Z3 audytu FLOW (docs/uiux/AUDYT_I_PROJEKT_FLOW_2026-07.md): projektant
NIE MA jednej odpowiedzi na pytanie, ktore zadaje na koncu opracowania — „czy ten
projekt spelnia wymagania i czego jeszcze brakuje?". Sa ekrany per analiza (kazdy
zna wlasne kryterium i nic poza nim), a istniejacy raport zgodnosci
(``raport_zgodnosci.py``) obejmuje WYLACZNIE tor DER-SN, czyli dobory z jednego
kreatora. Etap E7 projektu FLOW (weryfikacja normatywna) nie mial dostawcy.

Ten modul jest tym dostawca. Jest AGREGATOREM, nie analiza: nie liczy zadnej
wielkosci, nie dotyka solverow, nie mutuje modelu. Odczytuje GOTOWE widoki analiz
(kazda z nich jest juz przetestowanym ogniwem lancucha) i sprowadza je do jednego
rejestru kryteriow o wspolnym kontrakcie.

DOSTAWCY (kazde kryterium ma realne zrodlo — zero fabrykacji):
  E1/E5  warunki przylaczenia OSD     <- ``warunki_przylaczenia``       (bieg PF)
  E5     odchylenia napiec, obciazenia,
         budzet strat, bilans Q       <- ``energy_validation``          (bieg PF)
  E3/E4  wytrzymalosc zwarciowa
         przewodu (IEC 60949)         <- ``wytrzymalosc_cieplna_przewodow`` (bieg SC)
  E4     wiarygodnosc Ik''            <- ``sanity_bounds``              (bieg SC)
  E3     dobory toru DER-SN           <- ``raport_zgodnosci``           (model)

TRZY STANY, NIGDY DWA (kontrakt ekranu prowadzacego, punkt 4):
  SPELNIONE      — kryterium sprawdzone i dotrzymane,
  NARUSZONE      — kryterium sprawdzone i przekroczone,
  NIESPRAWDZONE  — BRAK PODSTAWY do oceny (brak biegu, bieg nieaktualny, brak
                   danych wejsciowych). Nie wolno tego mylic ze spelnieniem.
Stan NIEJEDNOZNACZNE (kontrakt werdyktu §2.1: dane nie pozwalaja na wniosek binarny)
niesie pozycja, ktorej element dostal od dostawcy OSTRZEZENIE bez wniosku binarnego
(patrz nizej) — nie jest ani spelnieniem, ani naruszeniem, ani brakiem biegu.
Czwarty stan NIE_DOTYCZY jest jawnie odrozniony i NIE zastepuje zadnego z trzech:
oznacza, ze kryterium nie ma zastosowania do tego projektu (np. tor DER-SN w
projekcie bez zrodla wytworczego). Projekt bez OZE nie moze byc na wieki
„niesprawdzony" z powodu kryterium, ktorego nie ma jak naruszyc.

ZASADA ZACHOWAWCZOSCI AGREGACJI (kolejnosc §2.3 kontraktu werdyktu, pkt 4–7 —
`_KOLEJNOSC_WYNIKOW`, jedno zrodlo dla pozycji, werdyktu calosciowego i porzadku
elementow). Kryterium obejmujace WIELE elementow (np. obciazenie gałęzi) skleja sie tak:
  - jakiekolwiek naruszenie  => NARUSZONE (naruszenie jest zawsze dzialaniem do
    wykonania, niezaleznie od tego, ile pozycji zostalo niesprawdzonych),
  - brak naruszen, ale jakikolwiek wynik niejednoznaczny => NIEJEDNOZNACZNE,
  - brak naruszen i niejednoznacznosci, ale jakakolwiek pozycja niesprawdzona =>
    NIESPRAWDZONE (bo „50 z 51 gałęzi w normie" NIE znaczy „kryterium spelnione" —
    o pozostalej gałęzi nie wiemy nic),
  - wszystkie pozycje sprawdzone i dotrzymane => SPELNIONE.
Agregat NIGDY nie jest lepszy niz najgorsza skladowa — ta sama kolejnosc sklada werdykt
calosciowy z pozycji (NIE_DOTYCZY pomijane; komplet pozycji NIE_DOTYCZY to brak podstawy,
nie spelnienie).

OSTRZEZENIE (WARNING z walidacji energetycznej) NIE jest czwartym stanem
kryterium: limit nie zostal przekroczony, wiec kryterium JEST spelnione, ale
margines jest maly. Liczba ostrzezen jedzie osobnym polem ``liczba_ostrzezen``,
zeby informacja nie zginela, a stan pozostal jednoznaczny.

OSTRZEZENIE DOSTAWCY MA WLASNA SEMANTYKE (uczciwosc natychmiastowa, 2026-09-23).
Raport doborow toru DER-SN melduje ``WARN`` dla BRAKU DANYCH (aparat pola bez
powiazania katalogowego — ``kaskada_prad_pole_brak``), dla odstepstwa od propozycji
doboru i dla biegu w toku: to NIE jest sprawdzenie dotrzymanego kryterium, a komunikat
dostawcy nie daje wniosku binarnego — ``WARN`` tego dostawcy daje ``NIEJEDNOZNACZNY``
(kontrakt werdyktu §2.1; rozstrzygniecie zarzadcy 2026-09-23: ostrzezenie dostawcy to
NIEJEDNOZNACZNY w ocenie elementu, agregat wg §2.3), nigdy SPELNIA. Agregat nie
interpretuje TRESCI ostrzezenia (brak danych / odstepstwo / bieg w toku) — wynik niesie
status dostawcy, uzasadnienie niesie jego komunikat. Walidacja energetyczna ``WARNING``
to co innego: dostawca POLICZYL wartosc i sam stwierdza, ze granica jest dotrzymana
(„zbliza sie do limitu", `analysis/energy_validation/builder.py::_threshold_check`) —
to SPELNIA z uwaga o malym zapasie (kontrakt §2.1: kryterium sprawdzone i dotrzymane).
Dawniej JEDNA mapa „status -> wynik" obslugiwala czterech dostawcow i zamieniala kazde
``WARN``/``WARNING`` w SPELNIA, a wiarygodnosc Ik'' dawala SPELNIA dla KAZDEGO statusu
spoza mapy. Teraz kazdy dostawca ma WLASNA mape, status spoza mapy daje
``BRAK_PODSTAW`` z nazwanym powodem, a stan pozycji liczy sie z wynikow JEJ elementow
(jedno zrodlo prawdy — element bez podstaw albo niejednoznaczny nie moze stac pod
pozycja „spelnione").

BIEG NIEAKTUALNY = NIESPRAWDZONE (regula 4 kanonu: „Model change invalidates ALL
case results"). Werdykt porownuje hash snapshotu biegu z hashem BIEZACEGO modelu.
Wynik policzony przed zmiana modelu nie jest dowodem na nic — pokazanie go jako
„spelnione" byloby najgrozniejszym rodzajem fabrykacji, bo wyglada na pomiar.

ZAKRES WERYFIKACJI JEST JAWNY. Kryteria, ktore system dzisiaj sprawdza
automatycznie, sa w rejestrze; kryteria, ktorych NIE sprawdza (selektywnosc
zabezpieczen, wytrzymalosc aparatury na calym modelu, korekta obciazalnosci wg
warunkow ulozenia, ekonomiczna gestosc pradu) jada w polu ``zakres`` z powodem.
Milczenie o nich robiloby z werdyktu falszywy certyfikat kompletnosci — dokladnie
odwrotnie do celu tej karty.

DETERMINIZM: kolejnosc pozycji = kolejnosc statycznego rejestru; wewnatrz
kryterium wiodacy element wybierany deterministycznie (najgorszy, przy remisie
najmniejsze id).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE, INCOMPLETE, OUT_OF_RANGE
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.analyses.raport_zgodnosci import build_compliance_report
from application.analyses.sanity_bounds import build_sanity_bounds_view
from application.analyses.warunki_przylaczenia import (
    KRYTERIUM_COS_PHI,
    KRYTERIUM_MOC,
    build_warunki_przylaczenia_view,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from domain.canonical_operations import opisy_kodow_gotowosci_pl
from enm.canonical_analysis import CanonicalRun, list_runs_for_case
from enm.hash import compute_enm_hash
from enm.nazwy_elementow import opis_bez_nazwy
from enm.store import get_enm
from network_model.nazwy import nazwa_nadana
from werdykt import format_liczba

# --- Stany kryterium ---------------------------------------------------------

STAN_SPELNIONE = "SPELNIONE"
STAN_NARUSZONE = "NARUSZONE"
STAN_NIEJEDNOZNACZNE = "NIEJEDNOZNACZNE"
STAN_NIESPRAWDZONE = "NIESPRAWDZONE"
STAN_NIE_DOTYCZY = "NIE_DOTYCZY"

# --- Kanoniczne kody powodu braku oceny (zsynchronizowane z READINESS_CODES) --

POWOD_BRAK_BIEGU = "verdict.run_missing"
POWOD_BIEG_NIEAKTUALNY = "verdict.run_stale"
POWOD_BIEG_NIEUDANY = "verdict.run_failed"
POWOD_BRAK_DANYCH = "verdict.input_data_missing"

# --- Rodzaje zrodel danych ---------------------------------------------------

ZRODLO_PF = "PF"
ZRODLO_SC = "short_circuit_sn"
ZRODLO_MODEL = "model"

# Semantyka elementu wiodacego (DOMENA, nie typ UI — mapowanie na typ elementu
# interfejsu nalezy do warstwy prezentacji).
ELEMENT_SZYNA = "szyna"
ELEMENT_GALAZ_LINIOWA = "galaz_liniowa"
ELEMENT_TRANSFORMATOR = "transformator"
ELEMENT_ZRODLO = "zrodlo"

# --- Grupy techniczne kryteriow (karta B-02 / W3-E, 2026-09-10) -----------
# Ekran „Ocena techniczna wynikow" grupuje pozycje wg ZNACZENIA technicznego,
# nie wg dostawcy — grupa jest polem definicji kryterium (backend decyduje,
# front tylko grupuje). Kolejnosc = kolejnosc prezentacji.

GRUPA_NAPIECIA = "napiecia"
GRUPA_OBCIAZALNOSC = "obciazalnosc"
GRUPA_BILANS = "bilans_mocy_i_straty"
GRUPA_ZWARCIA = "zwarcia"
GRUPA_WYTRZYMALOSC = "wytrzymalosc_toru"
GRUPA_PRZYLACZENIE = "warunki_przylaczenia"
GRUPA_DOBORY = "dobory_toru_zrodla"

GRUPY_KRYTERIOW: tuple[tuple[str, str], ...] = (
    (GRUPA_NAPIECIA, "Napięcia"),
    (GRUPA_OBCIAZALNOSC, "Obciążalność"),
    (GRUPA_BILANS, "Bilans mocy i straty"),
    (GRUPA_ZWARCIA, "Zwarcia"),
    (GRUPA_WYTRZYMALOSC, "Wytrzymałość toru"),
    (GRUPA_PRZYLACZENIE, "Warunki przyłączenia"),
    (GRUPA_DOBORY, "Dobory toru źródła"),
)

# --- Wynik oceny per element (trzy stany, nigdy dwa) -----------------------

WYNIK_SPELNIA = "SPELNIA"
WYNIK_NIE_SPELNIA = "NIE_SPELNIA"
#: Ostrzezenie dostawcy bez wniosku binarnego (kontrakt werdyktu §2.1 ``NIEJEDNOZNACZNY``).
WYNIK_NIEJEDNOZNACZNY = "NIEJEDNOZNACZNY"
WYNIK_BRAK_PODSTAW = "BRAK_PODSTAW"

#: Kolejnosc agregacji wg §2.3 kontraktu werdyktu (``werdykt.decyzja``, pkt 4–7): naruszenie
#: przed niejednoznacznoscia, niejednoznacznosc przed brakiem podstaw, spelnienie na koncu.
#: JEDNO zrodlo dla stanu pozycji (najgorszy element), werdyktu calosciowego (najgorsza
#: pozycja) i porzadku elementow w pozycji (najgorsze pierwsze) — agregat nigdy nie jest
#: lepszy niz najgorsza skladowa. ``BRAK_PODSTAW`` tego rejestru obejmuje oba statusy
#: kontraktu z pkt 6–7 (``NIE_OCENIONO`` — brak biegu albo danych; ``BRAK_PODSTAWY``).
_KOLEJNOSC_WYNIKOW: tuple[tuple[str, str], ...] = (
    (WYNIK_NIE_SPELNIA, STAN_NARUSZONE),
    (WYNIK_NIEJEDNOZNACZNY, STAN_NIEJEDNOZNACZNE),
    (WYNIK_BRAK_PODSTAW, STAN_NIESPRAWDZONE),
    (WYNIK_SPELNIA, STAN_SPELNIONE),
)
_RANGA_WYNIKU: dict[str, int] = {wynik: nr for nr, (wynik, _) in enumerate(_KOLEJNOSC_WYNIKOW)}
_RANGA_STANU: dict[str, int] = {stan: nr for nr, (_, stan) in enumerate(_KOLEJNOSC_WYNIKOW)}
_STAN_Z_WYNIKU: dict[str, str] = dict(_KOLEJNOSC_WYNIKOW)

# Kierunek warunku kryterium — steruje zdaniem wniosku i znakiem zapasu.
WARUNEK_NIE_WIECEJ = "nie_wiecej_niz"
WARUNEK_NIE_MNIEJ = "nie_mniej_niz"
WARUNEK_PASMO = "w_pasmie"
WARUNEK_ZGODNOSC = "zgodnosc"

_STATUS_PASS = "PASS"
_STATUS_FAIL = "FAIL"
_STATUS_UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class DefinicjaKryterium:
    """Statyczna definicja kryterium projektowego (rejestr = zrodlo prawdy)."""

    kryterium_id: str
    etap: str
    nazwa_pl: str
    warunek_pl: str
    norma_pl: str
    zrodlo: str
    element_rodzaj: str | None = None
    # Karta B-02 / W3-E: znaczenie techniczne pozycji na ekranie oceny.
    grupa: str = GRUPA_NAPIECIA
    wielkosc_pl: str = ""
    symbol: str = ""
    jednostka: str = ""
    warunek: str = WARUNEK_NIE_WIECEJ
    #: Karta V12.7 §0.1 — zapis LaTeX SYMBOLU (`MathInline`), np. dla
    #: `symbol = "cos φ"` → `symbol_latex = r"\cos\varphi"`. Pusty napis
    #: WYŁĄCZNIE dla kryteriów bez symbolu liczbowego (`symbol = "-"`,
    #: `warunek = WARUNEK_ZGODNOSC`) — test pinuje dokładnie ten wyjątek.
    symbol_latex: str = ""
    #: Karta V12.7 §0.1 — pełny warunek jako LaTeX (`MathInline`/`MathBlock`),
    #: WIERNY temu samemu kryterium co `warunek_pl` (dziś tekst z osadzonym
    #: `$...$`, renderowany dosłownie — dokładnie defekt tej karty). Pusty
    #: napis WYŁĄCZNIE dla `WARUNEK_ZGODNOSC` (kryterium bez nierówności).
    warunek_latex: str = ""
    #: Karta V12.7 §0.7 — zakres, jaki werdykt tego kryterium WOLNO nazwać:
    #: "kryterium" (werdykt nazywa WYŁĄCZNIE tę jedną wielkość — domyślne dla
    #: 9 z 10 kryteriów: każde sprawdza jedną wielkość fizyczną wobec jednej
    #: granicy, nie komplet wymagań obiektu) albo "uklad" (komplet kryteriów
    #: kontraktu oceny wykonany — wolno nazwać CAŁY obiekt). Jedyny "uklad" to
    #: KRYTERIUM_DOBOR_DER_SN: jego dostawca (raport_zgodnosci.py) sam jest
    #: kontrolą KOMPLETU trzech kryteriów toru źródła (zgodność napięć, mocy
    #: transformatora blokowego, kaskady prądowej) i wystawia JEDEN werdykt
    #: dla całego toru — nie jednej wielkości.
    zakres_oceny: str = "kryterium"

    def to_dict(self) -> dict[str, Any]:
        return {
            "kryterium_id": self.kryterium_id,
            "etap": self.etap,
            "nazwa_pl": self.nazwa_pl,
            "warunek_pl": self.warunek_pl,
            "norma_pl": self.norma_pl,
            "zrodlo": self.zrodlo,
            "element_rodzaj": self.element_rodzaj,
            "grupa": self.grupa,
            "wielkosc_pl": self.wielkosc_pl,
            "symbol": self.symbol,
            "jednostka": self.jednostka,
            "warunek": self.warunek,
            "symbol_latex": self.symbol_latex,
            "warunek_latex": self.warunek_latex,
            "zakres_oceny": self.zakres_oceny,
        }


# Kryteria per dostawca. Kolejnosc = kolejnosc prezentacji (determinizm) i idzie
# wg etapow flow projektanta E1 -> E5, potem E3/E4 (zwarcia), potem dobory.
KRYTERIUM_PWP_MOC = "pwp.moc_przylaczeniowa"
KRYTERIUM_PWP_COS_PHI = "pwp.wspolczynnik_mocy"
KRYTERIUM_NAPIECIE = "napiecie.odchylenie"
KRYTERIUM_OBCIAZENIE_GALEZI = "galaz.obciazenie_dlugotrwale"
KRYTERIUM_OBCIAZENIE_TRAFO = "transformator.obciazenie"
KRYTERIUM_STRATY = "straty.budzet"
KRYTERIUM_BILANS_Q = "moc_bierna.bilans"
KRYTERIUM_PRZEWOD_CIEPLNY = "przewod.wytrzymalosc_zwarciowa"
KRYTERIUM_WIARYGODNOSC_SC = "wynik.wiarygodnosc_zwarciowa"
KRYTERIUM_DOBOR_DER_SN = "dobor.tor_der_sn"

REJESTR_KRYTERIOW: tuple[DefinicjaKryterium, ...] = (
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_PWP_MOC,
        etap="E1/E5",
        nazwa_pl="Moc w punkcie przyłączenia",
        warunek_pl=r"$|P| \le P_{\text{przył}}$ (moc przyłączeniowa z warunków OSD)",
        norma_pl="Warunki przyłączenia OSD (dokument projektu)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_PRZYLACZENIE,
        wielkosc_pl="Moc czynna w punkcie przyłączenia",
        symbol="|P|",
        jednostka="MW",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"|P|",
        warunek_latex=r"|P| \leq P_{\text{przył}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_PWP_COS_PHI,
        etap="E1/E5",
        nazwa_pl="Współczynnik mocy w punkcie przyłączenia",
        warunek_pl=r"$\cos\varphi \ge \cos\varphi_{\text{wym}}$ (wymaganie warunków OSD)",
        norma_pl="Warunki przyłączenia OSD (dokument projektu)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_PRZYLACZENIE,
        wielkosc_pl="Współczynnik mocy w punkcie przyłączenia",
        symbol="cos φ",
        jednostka="-",
        warunek=WARUNEK_NIE_MNIEJ,
        symbol_latex=r"\cos\varphi",
        warunek_latex=r"\cos\varphi \geq \cos\varphi_{\mathrm{wym}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_NAPIECIE,
        etap="E5",
        nazwa_pl="Odchylenia napięć w węzłach",
        warunek_pl=r"$|\Delta U| \le \Delta U_{\text{dop}}$ (dopuszczalne odchylenie napięcia)",
        norma_pl="Kryterium jakości napięcia (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_NAPIECIA,
        wielkosc_pl="Odchylenie napięcia od znamionowego",
        symbol="|ΔU|",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"|\Delta U|",
        warunek_latex=r"|\Delta U| \leq \Delta U_{\mathrm{dop}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_OBCIAZENIE_GALEZI,
        etap="E5",
        nazwa_pl="Obciążenie długotrwałe gałęzi",
        warunek_pl=r"$I_{\text{rob}} \le I_{z}$ (obciążalność długotrwała przewodu)",
        norma_pl="Obciążalność katalogowa przewodu (warunki odniesienia)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_GALAZ_LINIOWA,
        grupa=GRUPA_OBCIAZALNOSC,
        wielkosc_pl="Obciążenie gałęzi względem obciążalności długotrwałej",
        symbol="I/I_z",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"I/I_z",
        warunek_latex=r"I_{\mathrm{rob}} \leq I_z",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_OBCIAZENIE_TRAFO,
        etap="E5",
        nazwa_pl="Obciążenie transformatorów",
        warunek_pl=r"$S_{\text{rob}} \le S_{n}$ (moc znamionowa transformatora)",
        norma_pl="Moc znamionowa z typu katalogowego",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_TRANSFORMATOR,
        grupa=GRUPA_OBCIAZALNOSC,
        wielkosc_pl="Obciążenie transformatora względem mocy znamionowej",
        symbol="S/S_n",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"S/S_n",
        warunek_latex=r"S_{\mathrm{rob}} \leq S_n",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_STRATY,
        etap="E5",
        nazwa_pl="Budżet strat mocy",
        warunek_pl=r"$\Delta P \le \Delta P_{\text{budżet}}$ (założony budżet strat)",
        norma_pl="Założenie projektowe (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        grupa=GRUPA_BILANS,
        wielkosc_pl="Straty mocy czynnej względem mocy przesyłanej",
        symbol="ΔP/P",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"\Delta P/P",
        warunek_latex=r"\Delta P \leq \Delta P_{\text{budżet}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_BILANS_Q,
        etap="E5",
        nazwa_pl="Bilans mocy biernej",
        warunek_pl="bilans Q w założonym paśmie",
        norma_pl="Założenie projektowe (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        grupa=GRUPA_BILANS,
        wielkosc_pl="Współczynnik mocy w węźle bilansującym",
        symbol="cos φ",
        jednostka="-",
        warunek=WARUNEK_NIE_MNIEJ,
        symbol_latex=r"\cos\varphi",
        warunek_latex=r"\cos\varphi \geq \cos\varphi_{\mathrm{min}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_PRZEWOD_CIEPLNY,
        etap="E3/E4",
        nazwa_pl="Wytrzymałość zwarciowa przewodu",
        warunek_pl=r"$I_{\text{th}} \le I_{\text{th(1s)}} / \sqrt{t}$",
        norma_pl="IEC 60949 / PN-HD 60364-5-54",
        zrodlo=ZRODLO_SC,
        element_rodzaj=ELEMENT_GALAZ_LINIOWA,
        grupa=GRUPA_WYTRZYMALOSC,
        wielkosc_pl="Energia cieplna zwarcia względem dopuszczalnej dla żyły",
        symbol="I²t",
        jednostka="A²·s",
        warunek=WARUNEK_NIE_WIECEJ,
        symbol_latex=r"I^{2} t",
        warunek_latex=r"I_{\mathrm{th}} \leq \dfrac{I_{\mathrm{th(1s)}}}{\sqrt{t}}",
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_WIARYGODNOSC_SC,
        etap="E4",
        nazwa_pl="Wiarygodność prądu zwarciowego",
        warunek_pl=r"$I_{k}''$ w paśmie wiarygodności dla poziomu napięcia",
        norma_pl="Kontrola wiarygodności wyniku (brama pakietu OSD)",
        zrodlo=ZRODLO_SC,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_ZWARCIA,
        wielkosc_pl="Prąd zwarciowy początkowy",
        symbol="I_k″",
        jednostka="kA",
        warunek=WARUNEK_PASMO,
        symbol_latex=r"I_k^{\prime\prime}",
        warunek_latex=(
            r"I_{k,\text{dolna}}^{\prime\prime} \leq I_k^{\prime\prime} "
            r"\leq I_{k,\text{górna}}^{\prime\prime}"
        ),
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_DOBOR_DER_SN,
        etap="E3",
        nazwa_pl="Dobory toru przyłączenia źródła (DER-SN)",
        warunek_pl="zgodność napięć, mocy TR blokowego i kaskady prądowej",
        norma_pl="Walidacje doborowe toru DER-SN (dane z tabliczek)",
        zrodlo=ZRODLO_MODEL,
        element_rodzaj=ELEMENT_ZRODLO,
        grupa=GRUPA_DOBORY,
        wielkosc_pl="Zgodność doboru toru źródła z tabliczkami",
        symbol="-",
        jednostka="-",
        warunek=WARUNEK_ZGODNOSC,
        zakres_oceny="uklad",
    ),
)

_DEFINICJE_PO_ID: dict[str, DefinicjaKryterium] = {
    definicja.kryterium_id: definicja for definicja in REJESTR_KRYTERIOW
}

# Kryteria BEZ automatycznego dostawcy — jawny zakres weryfikacji (patrz naglowek).
ZAKRES_POZA_AUTOMATEM: tuple[dict[str, str], ...] = (
    {
        "kryterium_pl": "Selektywność i czułość zabezpieczeń (stopniowanie czasowo-prądowe)",
        "etap": "E6",
        "powod_pl": (
            "Analiza koordynacji liczy charakterystyki i czasy, ale nie wystawia werdyktu "
            "selektywności na poziomie całego modelu — ocena należy do projektanta na "
            "ekranie koordynacji."
        ),
    },
    {
        "kryterium_pl": "Wytrzymałość aparatury (Icu, Idyn, Ith) na całym modelu",
        "etap": "E4",
        "powod_pl": (
            "Dowód wytrzymałości aparatu istnieje jako pakiet dowodowy dla wskazanego "
            "aparatu; nie ma przebiegu, który sprawdza wszystkie aparaty modelu naraz."
        ),
    },
    {
        # V12K-207 (karta F-K7): korekta JEST juz czescia toru doboru kabla DER — ale nie
        # calego modelu. Wpis zostaje z ZAWEZONYM powodem, bo skreslenie go sugerowaloby,
        # ze kazdy przewod modelu jest sprawdzony z warunkami trasy, a to nieprawda.
        "kryterium_pl": "Obciążalność przewodu z korektą warunków ułożenia na całym modelu",
        "etap": "E3",
        "powod_pl": (
            "Korekta warunków ułożenia działa w torze doboru kabla DER (zestawy warunków z "
            "udokumentowaną podstawą albo współczynniki projektanta) i jest zapisana przy "
            "kablu w modelu. Nie ma przebiegu, który sprawdza obciążalność wszystkich "
            "przewodów modelu wobec warunków ich trasy — magistrala SN dobierana jest inną "
            "ścieżką, a katalog nie dokumentuje warunków odniesienia przy typach."
        ),
    },
    {
        "kryterium_pl": "Ekonomiczna gęstość prądu przekroju",
        "etap": "E3",
        "powod_pl": (
            "Kryterium niewiążące (optymalizacja kosztowa); brak danych ekonomicznych w "
            "modelu, więc ocena byłaby zgadywaniem."
        ),
    },
)


@dataclass(frozen=True)
class OcenaElementu:
    """Ocena JEDNEGO elementu wobec kryterium (karta B-02 / W3-E).

    Pozycja ekranu „Ocena techniczna wynikow": PRZEDMIOT (element) · WIELKOSC
    (z definicji kryterium) · WARTOSC OBLICZONA · WARTOSC ODNIESIENIA · MARGINES ·
    PODSTAWA (z definicji) · WYNIK · WNIOSEK. Liczby pochodza WPROST z widoku
    dostawcy (walidacja energetyczna, warunki przylaczenia, wytrzymalosc cieplna,
    wiarygodnosc Ik'', raport DER-SN) — agregat niczego nie liczy poza zapasem
    procentowym z dwoch liczb dostawcy. Brak liczby zostaje ``None`` (kreska na
    ekranie), nigdy wartoscia zastepcza.
    """

    element_id: str | None
    element_nazwa: str | None
    element_rodzaj: str | None
    wynik: str
    wartosc: float | None = None
    odniesienie: float | None = None
    #: Druga granica pasma (wiarygodnosc Ik'') albo prog ostrzegawczy (walidacja).
    odniesienie_dolne: float | None = None
    odniesienie_ostrzegawcze: float | None = None
    jednostka: str = ""
    #: Zapas do granicy: dodatni = w granicy. Jednostka zapasu w ``margines_jednostka``.
    margines: float | None = None
    margines_jednostka: str = ""
    #: Karta V12.7 §0.1/§0.8 — zapis LaTeX wzoru, którym wyliczono `margines`
    #: (`MathInline`, obok liczby). Pusty, gdy `margines` jest `None` (pasmo,
    #: zgodność, brak podstaw) — ten sam warunek co brak liczby marginesu.
    margines_wzor_latex: str = ""
    #: Uwaga przy wyniku SPELNIA (np. margines w pasmie ostrzegawczym) — wylacznie SPELNIA.
    uwaga_pl: str | None = None
    #: Uzasadnienie dostawcy (``why_pl`` / ``opis_pl`` / ``powod_decyzji_pl``).
    uzasadnienie_pl: str | None = None
    #: Wniosek projektowy — 1–2 zdania w jezyku formalnym.
    wniosek_pl: str = ""
    #: Odwolanie do dowodu obliczeniowego: bieg + element (``None`` = brak biegu).
    dowod: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_id": self.element_id,
            "element_nazwa": self.element_nazwa,
            "element_rodzaj": self.element_rodzaj,
            "wynik": self.wynik,
            "wartosc": self.wartosc,
            "odniesienie": self.odniesienie,
            "odniesienie_dolne": self.odniesienie_dolne,
            "odniesienie_ostrzegawcze": self.odniesienie_ostrzegawcze,
            "jednostka": self.jednostka,
            "margines": self.margines,
            "margines_jednostka": self.margines_jednostka,
            "margines_wzor_latex": self.margines_wzor_latex,
            "uwaga_pl": self.uwaga_pl,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "wniosek_pl": self.wniosek_pl,
            "dowod": self.dowod,
        }


@dataclass(frozen=True)
class PozycjaWerdyktu:
    """Jedno kryterium projektu w werdykcie (WHITE BOX: liczby + powod braku oceny)."""

    definicja: DefinicjaKryterium
    stan: str
    liczba_ocenionych: int = 0
    liczba_naruszen: int = 0
    liczba_niesprawdzonych: int = 0
    liczba_ostrzezen: int = 0
    wiodacy_element_id: str | None = None
    wiodacy_opis_pl: str | None = None
    powod_kod: str | None = None
    powod_pl: str | None = None
    run_id: str | None = None
    #: Karta B-02 / W3-E: oceny per element (puste, gdy brak podstawy calego kryterium).
    elementy: tuple[OcenaElementu, ...] = ()

    @property
    def liczba_niejednoznacznych(self) -> int:
        """Elementy z wynikiem NIEJEDNOZNACZNY — wyprowadzone z elementow (jedno zrodlo)."""
        return sum(1 for element in self.elementy if element.wynik == WYNIK_NIEJEDNOZNACZNY)

    def to_dict(self) -> dict[str, Any]:
        payload = self.definicja.to_dict()
        payload.update(
            {
                "stan": self.stan,
                "liczba_ocenionych": self.liczba_ocenionych,
                "liczba_naruszen": self.liczba_naruszen,
                "liczba_niesprawdzonych": self.liczba_niesprawdzonych,
                "liczba_niejednoznacznych": self.liczba_niejednoznacznych,
                "liczba_ostrzezen": self.liczba_ostrzezen,
                "wiodacy_element_id": self.wiodacy_element_id,
                "wiodacy_opis_pl": self.wiodacy_opis_pl,
                "powod_kod": self.powod_kod,
                "powod_pl": self.powod_pl,
                "run_id": self.run_id,
                "elementy": [element.to_dict() for element in self.elementy],
            }
        )
        return payload


@dataclass(frozen=True)
class ZrodloWerdyktu:
    """Metadane biegu, z ktorego pochodza kryteria danego rodzaju."""

    rodzaj: str
    run_id: str | None
    wykonano: str | None
    snapshot_hash: str | None
    aktualny: bool
    dostepny: bool
    powod_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "run_id": self.run_id,
            "wykonano": self.wykonano,
            "snapshot_hash": self.snapshot_hash,
            "aktualny": self.aktualny,
            "dostepny": self.dostepny,
            "powod_pl": self.powod_pl,
        }


@dataclass(frozen=True)
class WerdyktProjektowy:
    """Agregat: jeden werdykt projektu + rejestr kryteriow + jawny zakres."""

    werdykt: str
    case_id: str
    model_hash: str
    pozycje: tuple[PozycjaWerdyktu, ...]
    zrodla: tuple[ZrodloWerdyktu, ...]

    @property
    def podsumowanie(self) -> dict[str, int]:
        return {
            "spelnione": sum(1 for p in self.pozycje if p.stan == STAN_SPELNIONE),
            "naruszone": sum(1 for p in self.pozycje if p.stan == STAN_NARUSZONE),
            "niejednoznaczne": sum(1 for p in self.pozycje if p.stan == STAN_NIEJEDNOZNACZNE),
            "niesprawdzone": sum(1 for p in self.pozycje if p.stan == STAN_NIESPRAWDZONE),
            "nie_dotyczy": sum(1 for p in self.pozycje if p.stan == STAN_NIE_DOTYCZY),
            "razem": len(self.pozycje),
        }

    @property
    def ocena(self) -> dict[str, int]:
        """Liczniki PER ELEMENT (naglowek ekranu oceny).

        OCENIONO = SPELNIA + NIE_SPELNIA + NIEJEDNOZNACZNY — element, dla ktorego dostawca
        wydal ocene (takze ostrzezenie bez wniosku binarnego); BRAK_PODSTAW to element bez
        oceny. OCENIONO + BRAK_PODSTAW = wszystkie elementy (podzial rozlaczny).
        """
        elementy = [element for pozycja in self.pozycje for element in pozycja.elementy]
        spelnia = sum(1 for e in elementy if e.wynik == WYNIK_SPELNIA)
        nie_spelnia = sum(1 for e in elementy if e.wynik == WYNIK_NIE_SPELNIA)
        niejednoznaczny = sum(1 for e in elementy if e.wynik == WYNIK_NIEJEDNOZNACZNY)
        brak = sum(1 for e in elementy if e.wynik == WYNIK_BRAK_PODSTAW)
        return {
            "oceniono": spelnia + nie_spelnia + niejednoznaczny,
            "spelnia": spelnia,
            "nie_spelnia": nie_spelnia,
            "niejednoznaczny": niejednoznaczny,
            "brak_podstaw": brak,
        }

    def to_dict(self) -> dict[str, Any]:
        """Kontrakt wyjściowy werdyktu — JEDNO miejsce dla API i eksportu fixtur.

        ADR-018 (M0-2): liczby kontraktu WYJŚCIOWEGO kwantyzowane do 9 cyfr
        znaczących przed serializacją — wartości/marginesy pochodzą z rozpływu i
        zwarcia, których surowe `float` różnią się między maszynami (CI run
        34467401727 na b89c13b3: dwie fixtury sceny werdyktu rozjechały się na
        10.–11. cyfrze). Kwantyzacja nie zastępuje tolerancji porównania fixtur
        (`tests/ci/test_fixtury_harnessu.py`): szum solvera ~1e-10 względnie
        przekracza ziarno 1e-9, więc obie warstwy działają razem.
        """
        kontrakt: dict[str, Any] = kwantyzuj_kontrakt(
            {
                "werdykt": self.werdykt,
                "case_id": self.case_id,
                "model_hash": self.model_hash,
                "pozycje": [pozycja.to_dict() for pozycja in self.pozycje],
                "zrodla": [zrodlo.to_dict() for zrodlo in self.zrodla],
                "podsumowanie": self.podsumowanie,
                "ocena": self.ocena,
                "grupy": [{"kod": kod, "nazwa_pl": nazwa} for kod, nazwa in GRUPY_KRYTERIOW],
                "zakres_poza_automatem": [dict(wpis) for wpis in ZAKRES_POZA_AUTOMATEM],
            }
        )
        return kontrakt


def _definicja(kryterium_id: str) -> DefinicjaKryterium:
    return _DEFINICJE_PO_ID[kryterium_id]


def _niesprawdzona(
    kryterium_id: str,
    *,
    powod_kod: str,
    powod_pl: str,
    run_id: str | None = None,
    liczba_niesprawdzonych: int = 0,
) -> PozycjaWerdyktu:
    return PozycjaWerdyktu(
        definicja=_definicja(kryterium_id),
        stan=STAN_NIESPRAWDZONE,
        liczba_niesprawdzonych=liczba_niesprawdzonych,
        powod_kod=powod_kod,
        powod_pl=powod_pl,
        run_id=run_id,
    )


# --- Elementy: liczby, zapas, wniosek (karta B-02 / W3-E) -------------------


def _liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _tekst_liczby(wartosc: float | None, jednostka: str = "") -> str:
    """Liczba w zapisie polskim (przecinek dziesietny, do 3 miejsc, bez zer koncowych)."""
    if wartosc is None:
        return "—"
    tekst = f"{wartosc:.3f}".rstrip("0").rstrip(".").replace(".", ",")
    if tekst in ("", "-0"):
        tekst = "0"
    if jednostka and jednostka != "-":
        return f"{tekst} {jednostka}"
    return tekst


#: Karta V12.7 §0.1 — wzory LaTeX marginesu, JEDNO źródło prawdy dzielone
#: z `_zapas` (reguła KLASA §3, predykaty parami): każda gałąź poniżej
#: odpowiada DOKŁADNIE jednej gałęzi arytmetyki `_zapas` — zmiana jednej bez
#: drugiej jest naruszeniem tej samej reguły. Zapis generyczny („wartość" /
#: „granica", nie nazwa konkretnej wielkości) — margines jest tym samym
#: wzorem prezentacji dla napięcia, obciążenia, strat, cos φ.
_MARGINES_WZOR_PUNKTY_PROC = r"\Delta = \text{granica} - \text{wartość}"
_MARGINES_WZOR_WZGLEDNY_DOP = (
    r"\delta = \dfrac{\text{granica} - \text{wartość}}{\text{granica}}\cdot 100\%"
)
_MARGINES_WZOR_WZGLEDNY_MIN = (
    r"\delta = \dfrac{\text{wartość} - \text{granica}}{\text{granica}}\cdot 100\%"
)


def _zapas(
    warunek: str, wartosc: float | None, odniesienie: float | None, jednostka: str
) -> tuple[float | None, str, str]:
    """Zapas do granicy z DWOCH liczb dostawcy (arytmetyka prezentacji, nie fizyka).

    Wielkosci wyrazone w % (odchylenie, obciazenie, straty): zapas w punktach
    procentowych = granica − wartosc. Pozostale: zapas wzgledny w % granicy.
    Kryterium „nie mniej niz": zapas = (wartosc − granica)/granica. Pasmo i zgodnosc
    nie maja skalarnego zapasu.

    Zwraca TRÓJKĘ (zapas, jednostka_zapasu, wzor_latex) — wzór LaTeX pochodzi
    z TEJ SAMEJ gałęzi warunku co arytmetyka (jedno źródło prawdy, karta
    V12.7 §0.1/§0.8), nigdy nie jest dobierany osobnym warunkiem.
    """
    if wartosc is None or odniesienie is None:
        return None, "", ""
    if warunek == WARUNEK_NIE_WIECEJ:
        if jednostka == "%":
            return odniesienie - wartosc, "pkt proc.", _MARGINES_WZOR_PUNKTY_PROC
        if odniesienie == 0.0:
            return None, "", ""
        return (
            (odniesienie - wartosc) / abs(odniesienie) * 100.0,
            "%",
            _MARGINES_WZOR_WZGLEDNY_DOP,
        )
    if warunek == WARUNEK_NIE_MNIEJ:
        if odniesienie == 0.0:
            return None, "", ""
        return (
            (wartosc - odniesienie) / abs(odniesienie) * 100.0,
            "%",
            _MARGINES_WZOR_WZGLEDNY_MIN,
        )
    return None, "", ""


def _wniosek(
    *,
    wynik: str,
    warunek: str,
    wielkosc_pl: str,
    wartosc: float | None,
    odniesienie: float | None,
    odniesienie_dolne: float | None,
    jednostka: str,
    margines: float | None,
    margines_jednostka: str,
    uwaga_pl: str | None,
    uzasadnienie_pl: str | None,
) -> str:
    """Wniosek projektowy: 1–2 zdania w jezyku formalnym, WYLACZNIE z liczb dostawcy."""
    wielkosc = wielkosc_pl[:1].lower() + wielkosc_pl[1:] if wielkosc_pl else "wielkość"
    if wynik == WYNIK_BRAK_PODSTAW:
        powod = uzasadnienie_pl or "dostawca nie zwrócił wartości ani granicy dla tego elementu"
        return f"Brak podstaw do oceny spełnienia wymagania: {powod.rstrip('.')}."
    if wynik == WYNIK_NIEJEDNOZNACZNY:
        powod = uzasadnienie_pl or "dostawca zgłosił ostrzeżenie, które nie daje wniosku binarnego"
        return f"Wynik niejednoznaczny — wymaga weryfikacji: {powod.rstrip('.')}."
    if (
        warunek == WARUNEK_ZGODNOSC
        or wartosc is None
        or (odniesienie is None and odniesienie_dolne is None)
    ):
        powod = (uzasadnienie_pl or "").rstrip(".")
        if wynik == WYNIK_SPELNIA:
            return f"Wymaganie spełnione: {powod}." if powod else "Wymaganie spełnione."
        return (
            f"Wymaganie nie jest spełnione: {powod}." if powod else "Wymaganie nie jest spełnione."
        )
    w = _tekst_liczby(wartosc, jednostka)
    if warunek == WARUNEK_PASMO:
        pasmo = f"[{_tekst_liczby(odniesienie_dolne)}; {_tekst_liczby(odniesienie)}] {jednostka}".strip()
        if wynik == WYNIK_SPELNIA:
            return f"{wielkosc_pl} {w} mieści się w paśmie wiarygodności {pasmo}; wynik nadaje się do dalszej oceny."
        return (
            f"{wielkosc_pl} {w} leży poza pasmem wiarygodności {pasmo}; wynik nie może być podstawą "
            "dalszej oceny bez wyjaśnienia przyczyny."
        )
    o = _tekst_liczby(odniesienie, jednostka)
    zapas = (
        f"; zapas {_tekst_liczby(margines, margines_jednostka).rstrip('.')}"
        if margines is not None and margines_jednostka
        else ""
    )
    if warunek == WARUNEK_NIE_MNIEJ:
        if wynik == WYNIK_SPELNIA:
            zdanie = f"{wielkosc_pl} {w} osiąga wartość wymaganą {o}{zapas}."
        else:
            zdanie = (
                f"{wielkosc_pl} {w} nie osiąga wartości wymaganej {o}; wymaganie nie jest "
                "spełnione dla tego elementu."
            )
    else:
        if wynik == WYNIK_SPELNIA:
            zdanie = f"{wielkosc_pl} {w} mieści się w granicy {o}{zapas}."
        else:
            zdanie = (
                f"{wielkosc_pl} {w} przekracza granicę {o}; wymaganie nie jest spełnione "
                "dla tego elementu."
            )
    if uwaga_pl and wynik == WYNIK_SPELNIA:
        zdanie += f" {uwaga_pl.rstrip('.')}."
    del wielkosc
    return zdanie


def _ocena_elementu(
    definicja: DefinicjaKryterium,
    *,
    element_id: str | None,
    element_nazwa: str | None,
    wynik: str,
    wartosc: Any = None,
    odniesienie: Any = None,
    odniesienie_dolne: Any = None,
    odniesienie_ostrzegawcze: Any = None,
    jednostka: str | None = None,
    margines: Any = None,
    margines_jednostka: str | None = None,
    uwaga_pl: str | None = None,
    uzasadnienie_pl: str | None = None,
    run_id: str | None = None,
) -> OcenaElementu:
    jedn = jednostka if jednostka is not None else definicja.jednostka
    wart = _liczba(wartosc)
    odn = _liczba(odniesienie)
    odn_dolne = _liczba(odniesienie_dolne)
    zapas, zapas_jedn = (_liczba(margines), margines_jednostka or "")
    # Karta V12.7 §0.1/§0.8: wzór LaTeX marginesu idzie WYŁĄCZNIE razem z
    # marginesem WYLICZONYM przez `_zapas` — dostawca, który podaje własny,
    # już policzony margines (`margines=...` jawnie), nie ujawnia formuły, wg
    # której go policzył, więc adapter nie zgaduje jej tutaj (zero fabrykacji).
    zapas_wzor = ""
    if zapas is None:
        zapas, zapas_jedn, zapas_wzor = _zapas(definicja.warunek, wart, odn, jedn)
    wniosek = _wniosek(
        wynik=wynik,
        warunek=definicja.warunek,
        wielkosc_pl=definicja.wielkosc_pl,
        wartosc=wart,
        odniesienie=odn,
        odniesienie_dolne=odn_dolne,
        jednostka=jedn,
        margines=zapas,
        margines_jednostka=zapas_jedn,
        uwaga_pl=uwaga_pl,
        uzasadnienie_pl=uzasadnienie_pl,
    )
    dowod = (
        {"run_id": run_id, "element_id": element_id}
        if run_id is not None and element_id is not None
        else None
    )
    return OcenaElementu(
        element_id=element_id,
        element_nazwa=element_nazwa,
        element_rodzaj=definicja.element_rodzaj,
        wynik=wynik,
        wartosc=wart,
        odniesienie=odn,
        odniesienie_dolne=odn_dolne,
        odniesienie_ostrzegawcze=_liczba(odniesienie_ostrzegawcze),
        jednostka=jedn,
        margines=zapas,
        margines_jednostka=zapas_jedn,
        margines_wzor_latex=zapas_wzor,
        uwaga_pl=uwaga_pl,
        uzasadnienie_pl=uzasadnienie_pl,
        wniosek_pl=wniosek,
        dowod=dowod,
    )


# Mapy „status dostawcy -> wynik elementu" — JEDNA na dostawce, bo dostawcy maja rozna
# semantyke ostrzezenia (patrz naglowek modulu). Status spoza mapy daje BRAK_PODSTAW
# z nazwanym powodem (`_wynik_i_uzasadnienie`), nigdy SPELNIA.

#: Warunki przylaczenia OSD i wytrzymalosc cieplna przewodow: PASS/FAIL/UNAVAILABLE.
_WYNIK_OCENY_Z_GRANICA: dict[str, str] = {
    _STATUS_PASS: WYNIK_SPELNIA,
    _STATUS_FAIL: WYNIK_NIE_SPELNIA,
    _STATUS_UNAVAILABLE: WYNIK_BRAK_PODSTAW,
}
#: Walidacja energetyczna: WARNING = wartosc policzona, granica dotrzymana, maly zapas
#: (`analysis/energy_validation/builder.py` — prog ostrzegawczy lezy PRZED granica).
_WYNIK_WALIDACJI_ENERGETYCZNEJ: dict[str, str] = {
    _STATUS_PASS: WYNIK_SPELNIA,
    "WARNING": WYNIK_SPELNIA,
    _STATUS_FAIL: WYNIK_NIE_SPELNIA,
    "NOT_COMPUTED": WYNIK_BRAK_PODSTAW,
}
#: Dobory toru DER-SN: WARN = brak danych / odstepstwo / bieg w toku — ostrzezenie bez
#: wniosku binarnego, wiec NIEJEDNOZNACZNY (kontrakt werdyktu §2.1; tresc ostrzezenia
#: niesie uzasadnienie, agregat jej nie interpretuje).
_WYNIK_DOBOROW_DER_SN: dict[str, str] = {
    _STATUS_PASS: WYNIK_SPELNIA,
    "WARN": WYNIK_NIEJEDNOZNACZNY,
    _STATUS_FAIL: WYNIK_NIE_SPELNIA,
}
#: Wiarygodnosc Ik'': pasmo fizyczne dotrzymane / przekroczone / dane niekompletne.
_WYNIK_WIARYGODNOSCI: dict[str, str] = {
    CREDIBLE: WYNIK_SPELNIA,
    OUT_OF_RANGE: WYNIK_NIE_SPELNIA,
    INCOMPLETE: WYNIK_BRAK_PODSTAW,
}


def _wynik_i_uzasadnienie(
    mapa: Mapping[str, str], status: str, uzasadnienie_pl: str | None
) -> tuple[str, str | None]:
    """Wynik elementu z mapy dostawcy; status spoza mapy = BRAK_PODSTAW z powodem.

    Status nieznany nie jest ani spelnieniem, ani naruszeniem — dostawca powiedzial
    cos, czego ta mapa nie rozumie, wiec jedyne uczciwe rozstrzygniecie to brak
    podstaw do oceny z nazwanym statusem.
    """
    wynik = mapa.get(status)
    if wynik is not None:
        return wynik, uzasadnienie_pl
    powod = (
        f"Dostawca zwrócił status „{status}” spoza słownika oceny tego kryterium — "
        "brak podstaw do rozstrzygnięcia"
    )
    if uzasadnienie_pl:
        return WYNIK_BRAK_PODSTAW, f"{uzasadnienie_pl.rstrip('.')}. {powod}."
    return WYNIK_BRAK_PODSTAW, f"{powod}."


def _stan_z_elementow(elementy: Sequence[OcenaElementu]) -> str:
    """Stan pozycji = stan NAJGORSZEGO elementu wg kolejnosci §2.3 (`_KOLEJNOSC_WYNIKOW`).

    Jedno zrodlo prawdy dla elementu i pozycji (predykaty parami). Pozycja BEZ elementow
    nie jest spelniona — zero sprawdzen to brak podstawy do oceny, nie dowod dotrzymania
    kryterium (puste != spelnia).
    """
    if not elementy:
        return STAN_NIESPRAWDZONE
    najgorszy = min(elementy, key=lambda element: _RANGA_WYNIKU[element.wynik])
    return _STAN_Z_WYNIKU[najgorszy.wynik]


_UWAGA_OSTRZEZENIE_PL = "Margines jest niewielki — wartość leży w paśmie ostrzegawczym"


# --- Dostawca: warunki przylaczenia OSD (bieg PF) ----------------------------


def _pozycje_warunkow_przylaczenia(
    widok: Mapping[str, Any], *, run_id: str
) -> list[PozycjaWerdyktu]:
    ocena = widok.get("ocena") or {}
    punkt = ocena.get("punkt_przylaczenia")
    po_kryterium = {
        str(pozycja.get("kryterium")): pozycja
        for pozycja in (ocena.get("pozycje") or [])
        if isinstance(pozycja, Mapping)
    }
    mapowanie = (
        (KRYTERIUM_PWP_MOC, KRYTERIUM_MOC),
        (KRYTERIUM_PWP_COS_PHI, KRYTERIUM_COS_PHI),
    )
    pozycje: list[PozycjaWerdyktu] = []
    for kryterium_id, klucz_oceny in mapowanie:
        surowa = po_kryterium.get(klucz_oceny)
        if surowa is None:
            pozycje.append(
                _niesprawdzona(
                    kryterium_id,
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=(
                        "Ocena warunków przyłączenia nie zawiera tego kryterium — "
                        "brak warunków OSD w nagłówku modelu albo brak wyniku w punkcie "
                        "przyłączenia."
                    ),
                    run_id=run_id,
                    liczba_niesprawdzonych=1,
                )
            )
            continue
        status = str(surowa.get("status"))
        definicja = _definicja(kryterium_id)
        wynik, opis = _wynik_i_uzasadnienie(
            _WYNIK_OCENY_Z_GRANICA, status, str(surowa.get("opis_pl") or "") or None
        )
        wartosc = _liczba(surowa.get("wartosc"))
        # Kryterium mocy dotyczy MODULU mocy czynnej (oba kierunki) — tak jak dostawca.
        if kryterium_id == KRYTERIUM_PWP_MOC and wartosc is not None:
            wartosc = abs(wartosc)
        element = _ocena_elementu(
            definicja,
            element_id=punkt,
            element_nazwa=None,
            wynik=wynik,
            wartosc=wartosc,
            odniesienie=surowa.get("wymagana"),
            jednostka=str(surowa.get("jednostka") or definicja.jednostka),
            uzasadnienie_pl=opis,
            run_id=run_id,
        )
        # Stan pozycji z TEJ SAMEJ agregacji co u pozostalych dostawcow (jedno zrodlo).
        bez_podstaw = element.wynik == WYNIK_BRAK_PODSTAW
        kody = [str(kod) for kod in (surowa.get("readiness_codes") or [])]
        pozycje.append(
            PozycjaWerdyktu(
                definicja=definicja,
                stan=_stan_z_elementow((element,)),
                liczba_ocenionych=0 if bez_podstaw else 1,
                liczba_naruszen=1 if element.wynik == WYNIK_NIE_SPELNIA else 0,
                liczba_niesprawdzonych=1 if bez_podstaw else 0,
                wiodacy_element_id=punkt,
                wiodacy_opis_pl=opis,
                powod_kod=(kody[0] if kody else POWOD_BRAK_DANYCH) if bez_podstaw else None,
                powod_pl=opis if bez_podstaw else None,
                run_id=run_id,
                elementy=(element,),
            )
        )
    return pozycje


# --- Dostawca: walidacja energetyczna (bieg PF) ------------------------------

_KRYTERIUM_PO_KONTROLI: dict[str, str] = {
    "VOLTAGE_DEVIATION": KRYTERIUM_NAPIECIE,
    "BRANCH_LOADING": KRYTERIUM_OBCIAZENIE_GALEZI,
    "TRANSFORMER_LOADING": KRYTERIUM_OBCIAZENIE_TRAFO,
    "LOSS_BUDGET": KRYTERIUM_STRATY,
    "REACTIVE_BALANCE": KRYTERIUM_BILANS_Q,
}


def _pozycje_walidacji_energetycznej(
    widok: Mapping[str, Any], *, run_id: str
) -> list[PozycjaWerdyktu]:
    po_kontroli: dict[str, list[Mapping[str, Any]]] = {
        klucz: [] for klucz in _KRYTERIUM_PO_KONTROLI
    }
    for pozycja in widok.get("items") or []:
        if not isinstance(pozycja, Mapping):
            continue
        rodzaj = str(pozycja.get("check_type"))
        if rodzaj in po_kontroli:
            po_kontroli[rodzaj].append(pozycja)

    pozycje: list[PozycjaWerdyktu] = []
    for rodzaj, kryterium_id in _KRYTERIUM_PO_KONTROLI.items():
        wiersze = po_kontroli[rodzaj]
        if not wiersze:
            pozycje.append(
                _niesprawdzona(
                    kryterium_id,
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=(
                        "Walidacja energetyczna nie zwróciła żadnej pozycji tej kontroli "
                        "dla bieżącego biegu rozpływu."
                    ),
                    run_id=run_id,
                )
            )
            continue
        # Jedno źródło prawdy dla elementu i pozycji: wynik wiersza z mapy dostawcy.
        wynik_wiersza = [
            (_WYNIK_WALIDACJI_ENERGETYCZNEJ.get(str(w.get("status")), WYNIK_BRAK_PODSTAW), w)
            for w in wiersze
        ]
        naruszenia = [w for wynik, w in wynik_wiersza if wynik == WYNIK_NIE_SPELNIA]
        niesprawdzone = [w for wynik, w in wynik_wiersza if wynik == WYNIK_BRAK_PODSTAW]
        ostrzezenia = [w for w in wiersze if str(w.get("status")) == "WARNING"]
        wiodacy = _wiodacy_wiersz_walidacji(naruszenia or niesprawdzone or ostrzezenia)
        definicja = _definicja(kryterium_id)
        elementy = tuple(
            _element_walidacji(definicja, wiersz, run_id=run_id)
            for wiersz in _posortowane_wiersze_walidacji(wiersze)
        )
        pozycje.append(
            PozycjaWerdyktu(
                definicja=definicja,
                stan=_stan_z_elementow(elementy),
                liczba_ocenionych=len(wiersze) - len(niesprawdzone),
                liczba_naruszen=len(naruszenia),
                liczba_niesprawdzonych=len(niesprawdzone),
                liczba_ostrzezen=len(ostrzezenia),
                wiodacy_element_id=(str(wiodacy.get("target_id")) if wiodacy else None),
                wiodacy_opis_pl=(str(wiodacy.get("why_pl")) if wiodacy else None),
                run_id=run_id,
                elementy=elementy,
            )
        )
    return pozycje


_RANGA_STATUSU_WALIDACJI: dict[str, int] = {"FAIL": 0, "WARNING": 1, "PASS": 2, "NOT_COMPUTED": 3}


def _posortowane_wiersze_walidacji(
    wiersze: Sequence[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    """Kolejność `elementy[]` wewnątrz pozycji: naruszenia najpierw (FAIL, potem
    WARNING, potem PASS, potem NOT_COMPUTED), wewnątrz statusu — najmniejszy
    zapas pierwszy, przy remisie `target_id` (determinizm).

    ZERO podstawienia liczby za brakujący `margin_pct` (karta B02-BE-TESTY,
    `solver_input_substitute_guard`, forma H — znalezisko przy weryfikacji
    §7): wiersz BEZ zapasu (analiza go nie policzyła, np. status NOT_COMPUTED)
    NIE dostaje fabrykowanego „najbezpieczniejszego" zapasu (`float("inf")`,
    poprzednia postać tej funkcji) — trafia do WŁASNEJ grupy „bez danej",
    posortowanej po `target_id`, nie po zmyślonej liczbie. Grupa „bez danej"
    ląduje ZA grupą z zapasem w obrębie tej samej rangi statusu — ten sam
    efekt porządkujący, co dawne `float("inf")` (zmierzone testem
    `test_elementy_sortuja_niesprawdzone_po_naruszonych_mimo_brakujacego_marginesu`),
    ale bez podstawienia liczby, której dostawca nie policzył.
    """
    posortowane: list[Mapping[str, Any]] = []
    rangi_obecne = sorted({_RANGA_STATUSU_WALIDACJI.get(str(w.get("status")), 4) for w in wiersze})
    for ranga in rangi_obecne:
        w_randze = [
            w for w in wiersze if _RANGA_STATUSU_WALIDACJI.get(str(w.get("status")), 4) == ranga
        ]
        z_zapasem = [w for w in w_randze if isinstance(w.get("margin_pct"), int | float)]
        bez_zapasu = [w for w in w_randze if not isinstance(w.get("margin_pct"), int | float)]
        z_zapasem.sort(key=lambda w: (-float(w["margin_pct"]), str(w.get("target_id") or "")))
        bez_zapasu.sort(key=lambda w: str(w.get("target_id") or ""))
        posortowane.extend(z_zapasem)
        posortowane.extend(bez_zapasu)
    return posortowane


def _element_walidacji(
    definicja: DefinicjaKryterium, wiersz: Mapping[str, Any], *, run_id: str
) -> OcenaElementu:
    """Pozycja walidacji energetycznej → ocena elementu (liczby 1:1 z dostawcy).

    ``margin_pct`` dostawcy = wartosc − prog przekroczenia (ujemny = w granicy);
    zapas ekranu = −margin_pct (dodatni = w granicy), w tej samej jednostce, co
    wartosc (dla wielkosci w % sa to punkty procentowe).
    """
    status = str(wiersz.get("status"))
    wynik, uzasadnienie = _wynik_i_uzasadnienie(
        _WYNIK_WALIDACJI_ENERGETYCZNEJ,
        status,
        str(wiersz.get("why_pl")) if wiersz.get("why_pl") else None,
    )
    margines = _liczba(wiersz.get("margin_pct"))
    # Jednostka dostawcy; „cos(phi)" nie jest jednostka fizyczna — definicja
    # kryterium niesie bezwymiarowe „-" (na ekranie: bez jednostki).
    jednostka_dostawcy = str(wiersz.get("unit") or "")
    jednostka = (
        definicja.jednostka if jednostka_dostawcy in ("", "cos(phi)") else jednostka_dostawcy
    )
    return _ocena_elementu(
        definicja,
        element_id=str(wiersz.get("target_id")) if wiersz.get("target_id") is not None else None,
        element_nazwa=nazwa_nadana(wiersz.get("target_name")),
        wynik=wynik,
        wartosc=wiersz.get("observed_value"),
        odniesienie=wiersz.get("limit_fail"),
        odniesienie_ostrzegawcze=wiersz.get("limit_warn"),
        jednostka=jednostka,
        margines=(-margines if margines is not None else None),
        margines_jednostka=(
            ("pkt proc." if jednostka == "%" else jednostka) if margines is not None else None
        ),
        uwaga_pl=_UWAGA_OSTRZEZENIE_PL if status == "WARNING" else None,
        uzasadnienie_pl=uzasadnienie,
        run_id=run_id,
    )


def _wiodacy_wiersz_walidacji(
    kandydaci: Sequence[Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    """Najgorszy wiersz: najmniejszy margines; przy remisie najmniejsze ``target_id``."""
    if not kandydaci:
        return None

    def klucz(wiersz: Mapping[str, Any]) -> tuple[float, str]:
        margines = wiersz.get("margin_pct")
        wartosc = float(margines) if isinstance(margines, int | float) else float("inf")
        return (wartosc, str(wiersz.get("target_id") or ""))

    return min(kandydaci, key=klucz)


# --- Dostawca: wytrzymalosc cieplna przewodow (bieg SC) ----------------------


def _pozycja_cieplna(widok: Mapping[str, Any], *, run_id: str) -> PozycjaWerdyktu:
    ocena = widok.get("ocena") or {}
    wiersze = [w for w in (ocena.get("items") or []) if isinstance(w, Mapping)]
    if not wiersze:
        return _niesprawdzona(
            KRYTERIUM_PRZEWOD_CIEPLNY,
            powod_kod=POWOD_BRAK_DANYCH,
            powod_pl="Bieg zwarciowy nie zwrócił żadnej gałęzi do oceny cieplnej.",
            run_id=run_id,
        )
    # Jedno źródło prawdy dla elementu i pozycji: wynik wiersza z mapy dostawcy.
    wynik_wiersza = [
        (_wynik_i_uzasadnienie(_WYNIK_OCENY_Z_GRANICA, str(w.get("status")), _opis_galezi(w)), w)
        for w in wiersze
    ]
    naruszenia = [w for (wynik, _), w in wynik_wiersza if wynik == WYNIK_NIE_SPELNIA]
    niesprawdzone = [w for (wynik, _), w in wynik_wiersza if wynik == WYNIK_BRAK_PODSTAW]
    wiodacy = _wiodaca_galaz(naruszenia or niesprawdzone)
    definicja = _definicja(KRYTERIUM_PRZEWOD_CIEPLNY)
    elementy = tuple(
        _ocena_elementu(
            definicja,
            element_id=str(wiersz.get("branch_id")) if wiersz.get("branch_id") else None,
            element_nazwa=nazwa_nadana(wiersz.get("branch_name")),
            wynik=wynik,
            wartosc=wiersz.get("i2t_a2s"),
            odniesienie=wiersz.get("i2t_dopuszczalne_a2s"),
            margines=wiersz.get("margines_procent"),
            margines_jednostka="%" if _liczba(wiersz.get("margines_procent")) is not None else None,
            uzasadnienie_pl=uzasadnienie,
            run_id=run_id,
        )
        for (wynik, uzasadnienie), wiersz in sorted(
            wynik_wiersza,
            key=lambda para: (
                _RANGA_WYNIKU[para[0][0]],
                str(para[1].get("branch_id") or ""),
            ),
        )
    )
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=_stan_z_elementow(elementy),
        liczba_ocenionych=len(wiersze) - len(niesprawdzone),
        liczba_naruszen=len(naruszenia),
        liczba_niesprawdzonych=len(niesprawdzone),
        wiodacy_element_id=(str(wiodacy.get("branch_id")) if wiodacy else None),
        wiodacy_opis_pl=_opis_galezi(wiodacy),
        run_id=run_id,
        elementy=elementy,
    )


def _wiodaca_galaz(kandydaci: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    """Najbardziej wykorzystana galaz; przy remisie najmniejsze ``branch_id``."""
    if not kandydaci:
        return None

    def klucz(wiersz: Mapping[str, Any]) -> tuple[float, str]:
        wykorzystanie = wiersz.get("utilization")
        wartosc = float(wykorzystanie) if isinstance(wykorzystanie, int | float) else -1.0
        return (-wartosc, str(wiersz.get("branch_id") or ""))

    return min(kandydaci, key=klucz)


def _opis_galezi(wiersz: Mapping[str, Any] | None) -> str | None:
    if wiersz is None:
        return None
    powod = wiersz.get("powod_decyzji_pl")
    if powod:
        return str(powod)
    uzasadnienie = wiersz.get("uzasadnienie_pl")
    if uzasadnienie:
        return str(uzasadnienie)
    wymagany = wiersz.get("s_min_mm2")
    zastosowany = wiersz.get("applied_cross_section_mm2")
    if wymagany is not None and zastosowany is not None:
        return (
            f"Gałąź {nazwa_nadana(wiersz.get('branch_name')) or opis_bez_nazwy('branches')}: "
            f"wymagany przekrój {format_liczba(float(wymagany))} mm² wobec zastosowanego "
            f"{format_liczba(float(zastosowany))} mm²."
        )
    kody = [str(kod) for kod in (wiersz.get("missing_codes") or [])]
    if kody:
        return f"Brak danych do oceny cieplnej: {opisy_kodow_gotowosci_pl(kody)}"
    return None


# --- Dostawca: wiarygodnosc Ik'' (bieg SC) ----------------------------------


def _pozycja_wiarygodnosci(widok: Mapping[str, Any], *, run_id: str) -> PozycjaWerdyktu:
    wiersze = [w for w in (widok.get("items") or []) if isinstance(w, Mapping)]
    if not wiersze:
        return _niesprawdzona(
            KRYTERIUM_WIARYGODNOSC_SC,
            powod_kod=POWOD_BRAK_DANYCH,
            powod_pl="Bieg zwarciowy nie zwrócił żadnego węzła do oceny wiarygodności.",
            run_id=run_id,
        )
    # Jedno źródło prawdy dla elementu i pozycji: wynik wiersza z mapy dostawcy. Dawniej
    # KAŻDY status spoza {poza zakresem, dane niekompletne} dawał SPEŁNIA, a liczniki
    # pozycji szły z podsumowania dostawcy — dwa niezależne warunki (KLASA §3).
    wynik_wiersza = [
        (
            _wynik_i_uzasadnienie(
                _WYNIK_WIARYGODNOSCI,
                str(w.get("status")),
                str(w.get("why_pl")) if w.get("why_pl") else None,
            ),
            w,
        )
        for w in wiersze
    ]
    poza_zakresem = sum(1 for (wynik, _), _w in wynik_wiersza if wynik == WYNIK_NIE_SPELNIA)
    niekompletne = sum(1 for (wynik, _), _w in wynik_wiersza if wynik == WYNIK_BRAK_PODSTAW)
    wiodacy = next(
        (w for (wynik, _), w in wynik_wiersza if wynik != WYNIK_SPELNIA),
        None,
    )
    definicja = _definicja(KRYTERIUM_WIARYGODNOSC_SC)
    elementy = tuple(
        _ocena_elementu(
            definicja,
            # Element = referencja ENM szyny (`element_id`), a `target_id` biegu
            # zostaje identyfikatorem zapasowym, gdy dostawca jej nie zna.
            element_id=str(wiersz.get("element_id") or wiersz.get("target_id") or "") or None,
            element_nazwa=nazwa_nadana(wiersz.get("target_name")),
            wynik=wynik,
            wartosc=wiersz.get("ikss_ka"),
            odniesienie=wiersz.get("upper_ka"),
            odniesienie_dolne=wiersz.get("lower_ka"),
            uzasadnienie_pl=uzasadnienie,
            run_id=run_id,
        )
        for (wynik, uzasadnienie), wiersz in sorted(
            wynik_wiersza,
            key=lambda para: (
                _RANGA_WYNIKU[para[0][0]],
                str(para[1].get("target_id") or ""),
            ),
        )
    )
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=_stan_z_elementow(elementy),
        liczba_ocenionych=len(wiersze) - niekompletne,
        liczba_naruszen=poza_zakresem,
        liczba_niesprawdzonych=niekompletne,
        wiodacy_element_id=(str(wiodacy.get("target_id")) if wiodacy else None),
        wiodacy_opis_pl=(str(wiodacy.get("why_pl")) if wiodacy else None),
        run_id=run_id,
        elementy=elementy,
    )


# --- Dostawca: dobory toru DER-SN (model, bez biegu) ------------------------


def _pozycja_der_sn(raport: Mapping[str, Any] | None) -> PozycjaWerdyktu:
    definicja = _definicja(KRYTERIUM_DOBOR_DER_SN)
    if raport is None:
        return PozycjaWerdyktu(
            definicja=definicja,
            stan=STAN_NIE_DOTYCZY,
            powod_pl="Projekt nie zawiera toru przyłączenia źródła wytwórczego (DER-SN).",
        )
    pozycje = [p for p in (raport.get("pozycje") or []) if isinstance(p, Mapping)]
    liczba_warn = sum(1 for p in pozycje if str(p.get("status")) == "WARN")
    wiodacy = next((p for p in pozycje if str(p.get("status")) == _STATUS_FAIL), None)
    if wiodacy is None:
        wiodacy = next(
            (p for p in pozycje if str(p.get("status")) not in (_STATUS_PASS, _STATUS_FAIL)),
            None,
        )
    zrodlo_ref = str(raport.get("source_ref")) if raport.get("source_ref") else None
    zrodlo_nazwa = nazwa_nadana(raport.get("source_name"))
    elementy: list[OcenaElementu] = []
    for pozycja in pozycje:
        # WARN tego dostawcy = brak danych / odstępstwo / bieg w toku → NIEJEDNOZNACZNY
        # z komunikatem dostawcy jako uzasadnieniem (nigdy SPEŁNIA).
        wynik, uzasadnienie = _wynik_i_uzasadnienie(
            _WYNIK_DOBOROW_DER_SN, str(pozycja.get("status")), _komunikat_der(pozycja)
        )
        elementy.append(
            _ocena_elementu(
                definicja,
                element_id=zrodlo_ref,
                element_nazwa=(
                    f"{zrodlo_nazwa or opis_bez_nazwy('generators')} — "
                    f"{_nazwa_kontroli_der(pozycja)}"
                ),
                wynik=wynik,
                uzasadnienie_pl=uzasadnienie,
            )
        )
    liczba_fail = sum(1 for e in elementy if e.wynik == WYNIK_NIE_SPELNIA)
    liczba_bez_podstaw = sum(1 for e in elementy if e.wynik == WYNIK_BRAK_PODSTAW)
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=_stan_z_elementow(elementy),
        liczba_ocenionych=len(elementy) - liczba_bez_podstaw,
        liczba_naruszen=liczba_fail,
        liczba_niesprawdzonych=liczba_bez_podstaw,
        liczba_ostrzezen=liczba_warn,
        wiodacy_element_id=zrodlo_ref,
        wiodacy_opis_pl=(str(wiodacy.get("message_pl")) if wiodacy else None),
        powod_kod=None if elementy else POWOD_BRAK_DANYCH,
        powod_pl=(
            None
            if elementy
            else (
                "Raport doborów toru przyłączenia źródła nie zawiera żadnej kontroli — "
                "brak danych toru (napięcia falownika i szyny SN, transformator blokowy) "
                "do oceny doborów."
            )
        ),
        elementy=tuple(elementy),
    )


def _nazwa_kontroli_der(pozycja: Mapping[str, Any]) -> str:
    """Nazwa kontroli doborowej po polsku (identyfikator kontroli → nazwa)."""
    check_id = str(pozycja.get("check_id") or "")
    nazwy = {
        "napiecie_falownika": "napięcie falownika a strona nN transformatora blokowego",
        "napiecie_sn": "strona SN transformatora blokowego a szyna SN",
        "moc_transformatora": "moc transformatora blokowego a suma mocy falowników",
        "grupa_polaczen": "układ połączeń transformatora blokowego",
        "bieg_analiz": "bieg analiz toru",
    }
    if check_id in nazwy:
        return nazwy[check_id]
    if check_id.startswith("d2."):
        parametr = pozycja.get("parametr")
        return (
            f"zgodność doboru „{parametr}” z propozycją"
            if parametr
            else "zgodność doboru z propozycją"
        )
    if "kaskada" in check_id:
        return "kaskada prądowa toru"
    # Kontrola spoza słownika nazw — opis rodzaju, nie identyfikator kontroli (karta #144).
    return "kontrola doboru toru przyłączenia"


def _komunikat_der(pozycja: Mapping[str, Any]) -> str | None:
    """Komunikat kontroli bez znakow graficznych statusu (✓/⚠️/❌ — stan niesie `wynik`)."""
    tekst = str(pozycja.get("message_pl") or "").strip()
    for znak in ("✓", "⚠️", "⚠", "❌"):
        if tekst.startswith(znak):
            tekst = tekst[len(znak) :].strip()
    return tekst or None


# --- Rozstrzyganie dostepnosci biegu ---------------------------------------


def _ocen_zrodlo(
    rodzaj: str,
    bieg: CanonicalRun | None,
    *,
    model_hash: str,
) -> tuple[ZrodloWerdyktu, str | None, str | None]:
    """Zwroc metadane zrodla oraz (kod, opis) powodu braku oceny — ``None`` gdy OK."""
    etykieta = "rozpływu mocy" if rodzaj == ZRODLO_PF else "zwarciowego"
    if bieg is None:
        return (
            ZrodloWerdyktu(
                rodzaj=rodzaj,
                run_id=None,
                wykonano=None,
                snapshot_hash=None,
                aktualny=False,
                dostepny=False,
                powod_pl=f"Brak zakończonego biegu {etykieta} dla tego przypadku.",
            ),
            POWOD_BRAK_BIEGU,
            f"Brak zakończonego biegu {etykieta} — uruchom obliczenia, żeby ocenić kryterium.",
        )
    wykonano = bieg.created_at.isoformat() if bieg.created_at else None
    aktualny = bieg.snapshot_hash == model_hash
    if bieg.status != "FINISHED":
        # Bieg W TOKU to nie bieg NIEUDANY — inna przyczyna i inna reakcja
        # projektanta (poczekaj kontra napraw dane i uruchom ponownie).
        w_toku = bieg.status in ("CREATED", "RUNNING")
        opis = (
            f"Bieg {etykieta} jest w toku (status: {bieg.status}) — wynik jeszcze nie istnieje."
            if w_toku
            else f"Bieg {etykieta} nie zakończył się poprawnie (status: {bieg.status})."
        )
        return (
            ZrodloWerdyktu(
                rodzaj=rodzaj,
                run_id=str(bieg.id),
                wykonano=wykonano,
                snapshot_hash=bieg.snapshot_hash,
                aktualny=aktualny,
                dostepny=False,
                powod_pl=opis,
            ),
            POWOD_BRAK_BIEGU if w_toku else POWOD_BIEG_NIEUDANY,
            opis,
        )
    if not aktualny:
        return (
            ZrodloWerdyktu(
                rodzaj=rodzaj,
                run_id=str(bieg.id),
                wykonano=wykonano,
                snapshot_hash=bieg.snapshot_hash,
                aktualny=False,
                dostepny=False,
                powod_pl=(
                    f"Model zmienił się po biegu {etykieta} — wynik nie opisuje bieżącego modelu."
                ),
            ),
            POWOD_BIEG_NIEAKTUALNY,
            (
                f"Model zmienił się po biegu {etykieta}; wynik nie jest dowodem dla bieżącego "
                "modelu — uruchom obliczenia ponownie."
            ),
        )
    return (
        ZrodloWerdyktu(
            rodzaj=rodzaj,
            run_id=str(bieg.id),
            wykonano=wykonano,
            snapshot_hash=bieg.snapshot_hash,
            aktualny=True,
            dostepny=True,
        ),
        None,
        None,
    )


def _kryteria_zrodla(rodzaj: str) -> tuple[str, ...]:
    return tuple(
        definicja.kryterium_id for definicja in REJESTR_KRYTERIOW if definicja.zrodlo == rodzaj
    )


def _bezpiecznie(
    budowniczy: Callable[[CanonicalRun], dict[str, Any]], bieg: CanonicalRun
) -> tuple[dict[str, Any] | None, str | None]:
    """Zbuduj widok dostawcy, zamieniajac jego ``ValueError`` na powod braku oceny.

    Awaria JEDNEGO dostawcy nie moze wywalic calego werdyktu — inaczej brak jednej
    danej ukrylby wszystkie pozostale kryteria, czyli agregat bylby krucha wyspa.
    ``ValueError`` to kanoniczny sposob, w jaki widoki analiz zglaszaja brak
    podstawy do oceny (zly rodzaj biegu, brak wiersza wyniku).
    """
    try:
        return budowniczy(bieg), None
    except ValueError as blad:
        return None, str(blad)


def _wpisz(cel: dict[str, PozycjaWerdyktu], pozycje: Sequence[PozycjaWerdyktu]) -> None:
    for pozycja in pozycje:
        cel[pozycja.definicja.kryterium_id] = pozycja


def _niesprawdzone_kryteria(
    kryteria: Sequence[str],
    *,
    powod_kod: str,
    powod_pl: str | None,
    run_id: str | None,
) -> list[PozycjaWerdyktu]:
    return [
        _niesprawdzona(
            kryterium_id,
            powod_kod=powod_kod,
            powod_pl=powod_pl or "Brak podstawy do oceny kryterium.",
            run_id=run_id,
        )
        for kryterium_id in kryteria
    ]


def _werdykt_calosciowy(pozycje: Sequence[PozycjaWerdyktu]) -> str:
    """Werdykt projektu = stan NAJGORSZEJ pozycji wg kolejnosci §2.3 (`_KOLEJNOSC_WYNIKOW`).

    Pozycje NIE_DOTYCZY nie uczestnicza; komplet pozycji NIE_DOTYCZY (zadne kryterium nie
    ma zastosowania) to brak podstawy do oceny, nie spelnienie (puste != spelnia).
    """
    stany = [pozycja.stan for pozycja in pozycje if pozycja.stan != STAN_NIE_DOTYCZY]
    if not stany:
        return STAN_NIESPRAWDZONE
    return min(stany, key=lambda stan: _RANGA_STANU[stan])


def zbuduj_werdykt_projektowy(
    *,
    case_id: str,
    model_hash: str,
    bieg_pf: CanonicalRun | None,
    bieg_sc: CanonicalRun | None,
    enm_snapshot: Mapping[str, Any] | None = None,
    uow_factory: Callable[[], Any] | None = None,
) -> WerdyktProjektowy:
    """Zbuduj agregat werdyktu projektowego z gotowych widokow analiz.

    Funkcja jest CZYSTA wobec magazynu: biegi i snapshot przychodzą argumentami,
    dzieki czemu agregacja jest testowalna bez repozytorium (a serwis nizej
    dostarcza je z magazynu). ``uow_factory`` — fabryka `UnitOfWork` wołającego
    (`app.state.uow_factory`), przekazywana dostawcy cieplnemu: od PERF-SC-50 wkłady
    gałęziowe liczą się na żądanie z wejścia biegu, a bieg z opcjami audytu 2 czyta
    swoją konfigurację wyłącznie tą fabryką (bez niej dostawca odmawia nazwanym
    `ValueError`, a kryterium cieplne spadałoby do „niesprawdzone" z powodu, który
    nie jest brakiem danych inżynierskich).
    """
    pozycje_po_id: dict[str, PozycjaWerdyktu] = {}
    zrodla: list[ZrodloWerdyktu] = []

    # --- Bieg rozplywu ------------------------------------------------------
    zrodlo_pf, kod_pf, opis_pf = _ocen_zrodlo(ZRODLO_PF, bieg_pf, model_hash=model_hash)
    zrodla.append(zrodlo_pf)
    if zrodlo_pf.dostepny and bieg_pf is not None:
        run_pf = str(bieg_pf.id)
        widok_warunkow, blad_warunkow = _bezpiecznie(build_warunki_przylaczenia_view, bieg_pf)
        if widok_warunkow is not None:
            _wpisz(pozycje_po_id, _pozycje_warunkow_przylaczenia(widok_warunkow, run_id=run_pf))
        else:
            _wpisz(
                pozycje_po_id,
                _niesprawdzone_kryteria(
                    (KRYTERIUM_PWP_MOC, KRYTERIUM_PWP_COS_PHI),
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=blad_warunkow,
                    run_id=run_pf,
                ),
            )
        widok_energii, blad_energii = _bezpiecznie(build_energy_validation_view, bieg_pf)
        if widok_energii is not None:
            _wpisz(pozycje_po_id, _pozycje_walidacji_energetycznej(widok_energii, run_id=run_pf))
        else:
            _wpisz(
                pozycje_po_id,
                _niesprawdzone_kryteria(
                    tuple(_KRYTERIUM_PO_KONTROLI.values()),
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=blad_energii,
                    run_id=run_pf,
                ),
            )
    else:
        _wpisz(
            pozycje_po_id,
            _niesprawdzone_kryteria(
                _kryteria_zrodla(ZRODLO_PF),
                powod_kod=kod_pf or POWOD_BRAK_BIEGU,
                powod_pl=opis_pf,
                run_id=zrodlo_pf.run_id,
            ),
        )

    # --- Bieg zwarciowy -----------------------------------------------------
    zrodlo_sc, kod_sc, opis_sc = _ocen_zrodlo(ZRODLO_SC, bieg_sc, model_hash=model_hash)
    zrodla.append(zrodlo_sc)
    if zrodlo_sc.dostepny and bieg_sc is not None:
        run_sc = str(bieg_sc.id)
        widok_cieplny, blad_cieplny = _bezpiecznie(
            lambda bieg: build_wytrzymalosc_cieplna_view(bieg, uow_factory), bieg_sc
        )
        if widok_cieplny is not None:
            _wpisz(pozycje_po_id, [_pozycja_cieplna(widok_cieplny, run_id=run_sc)])
        else:
            _wpisz(
                pozycje_po_id,
                _niesprawdzone_kryteria(
                    (KRYTERIUM_PRZEWOD_CIEPLNY,),
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=blad_cieplny,
                    run_id=run_sc,
                ),
            )
        widok_sanity, blad_sanity = _bezpiecznie(build_sanity_bounds_view, bieg_sc)
        if widok_sanity is not None:
            _wpisz(pozycje_po_id, [_pozycja_wiarygodnosci(widok_sanity, run_id=run_sc)])
        else:
            _wpisz(
                pozycje_po_id,
                _niesprawdzone_kryteria(
                    (KRYTERIUM_WIARYGODNOSC_SC,),
                    powod_kod=POWOD_BRAK_DANYCH,
                    powod_pl=blad_sanity,
                    run_id=run_sc,
                ),
            )
    else:
        _wpisz(
            pozycje_po_id,
            _niesprawdzone_kryteria(
                _kryteria_zrodla(ZRODLO_SC),
                powod_kod=kod_sc or POWOD_BRAK_BIEGU,
                powod_pl=opis_sc,
                run_id=zrodlo_sc.run_id,
            ),
        )

    # --- Model (bez biegu) --------------------------------------------------
    snapshot = dict(enm_snapshot or {})
    raport_der = build_compliance_report(snapshot) if snapshot else None
    pozycja_der = _pozycja_der_sn(raport_der)
    pozycje_po_id[pozycja_der.definicja.kryterium_id] = pozycja_der
    zrodla.append(
        ZrodloWerdyktu(
            rodzaj=ZRODLO_MODEL,
            run_id=None,
            wykonano=None,
            snapshot_hash=model_hash,
            aktualny=True,
            dostepny=bool(snapshot),
            powod_pl=None if snapshot else "Brak modelu do oceny doborów.",
        )
    )

    # Kolejnosc = kolejnosc rejestru (determinizm prezentacji).
    pozycje = tuple(
        pozycje_po_id[definicja.kryterium_id]
        for definicja in REJESTR_KRYTERIOW
        if definicja.kryterium_id in pozycje_po_id
    )
    return WerdyktProjektowy(
        werdykt=_werdykt_calosciowy(pozycje),
        case_id=case_id,
        model_hash=model_hash,
        pozycje=pozycje,
        zrodla=tuple(zrodla),
    )


def _najnowszy_bieg(biegi: Sequence[CanonicalRun], rodzaj: str) -> CanonicalRun | None:
    """Najnowszy bieg danego rodzaju.

    Preferuje bieg ZAKONCZONY; gdy nie ma zadnego zakonczonego, zwraca najnowszy
    o innym statusie, zeby werdykt mogl podac PRAWDZIWY powod (bieg nieudany albo
    w toku) zamiast ogolnego „brak biegu".
    """
    kandydaci = [bieg for bieg in biegi if bieg.analysis_type == rodzaj]
    if not kandydaci:
        return None
    zakonczone = [bieg for bieg in kandydaci if bieg.status == "FINISHED"]
    pula = zakonczone or kandydaci
    return max(pula, key=lambda bieg: (bieg.created_at, str(bieg.id)))


def build_werdykt_projektowy_view(
    case_id: str, klucz_twin: str, uow_factory: Callable[[], Any] | None = None
) -> dict[str, Any]:
    """Widok agregatu werdyktu projektowego dla przypadku obliczeniowego.

    Serwis rozwiazuje zaleznosci z magazynu (biezacy model + najnowsze biegi) i
    deleguje agregacje do czystej funkcji ``zbuduj_werdykt_projektowy``.
    `klucz_twin` — klucz magazynu ENM (Canonical Project Twin, CV-1-W),
    przetlumaczony z `case_id` na granicy API (`api/klucz_twin_dep.py`);
    `case_id` zostaje jako identyfikator biegow (`list_runs_for_case`) i pole
    werdyktu.
    """
    enm = get_enm(klucz_twin)
    model_hash = compute_enm_hash(enm)
    biegi = list_runs_for_case(case_id)
    werdykt = zbuduj_werdykt_projektowy(
        case_id=case_id,
        model_hash=model_hash,
        bieg_pf=_najnowszy_bieg(biegi, ZRODLO_PF),
        bieg_sc=_najnowszy_bieg(biegi, ZRODLO_SC),
        enm_snapshot=enm.model_dump(mode="json"),
        uow_factory=uow_factory,
    )
    # Kwantyzacja kontraktu (ADR-018) siedzi w `WerdyktProjektowy.to_dict` — jedno
    # miejsce dla tej końcówki i dla eksportu fixtur harnessu.
    return werdykt.to_dict()
