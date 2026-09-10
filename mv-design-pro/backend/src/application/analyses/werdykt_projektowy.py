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
Czwarty stan NIE_DOTYCZY jest jawnie odrozniony i NIE zastepuje zadnego z trzech:
oznacza, ze kryterium nie ma zastosowania do tego projektu (np. tor DER-SN w
projekcie bez zrodla wytworczego). Projekt bez OZE nie moze byc na wieki
„niesprawdzony" z powodu kryterium, ktorego nie ma jak naruszyc.

ZASADA ZACHOWAWCZOSCI AGREGACJI. Kryterium obejmujace WIELE elementow (np.
obciazenie gałęzi) skleja sie tak:
  - jakiekolwiek naruszenie  => NARUSZONE (naruszenie jest zawsze dzialaniem do
    wykonania, niezaleznie od tego, ile pozycji zostalo niesprawdzonych),
  - brak naruszen, ale jakakolwiek pozycja niesprawdzona => NIESPRAWDZONE
    (bo „50 z 51 gałęzi w normie" NIE znaczy „kryterium spelnione" — o
    pozostalej gałęzi nie wiemy nic),
  - wszystkie pozycje sprawdzone i dotrzymane => SPELNIONE.

OSTRZEZENIE (WARNING z walidacji energetycznej) NIE jest czwartym stanem
kryterium: limit nie zostal przekroczony, wiec kryterium JEST spelnione, ale
margines jest maly. Liczba ostrzezen jedzie osobnym polem ``liczba_ostrzezen``,
zeby informacja nie zginela, a stan pozostal jednoznaczny.

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

from analysis.sanity_bounds.short_circuit_bounds import INCOMPLETE, OUT_OF_RANGE
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.raport_zgodnosci import build_compliance_report
from application.analyses.sanity_bounds import build_sanity_bounds_view
from application.analyses.warunki_przylaczenia import (
    KRYTERIUM_COS_PHI,
    KRYTERIUM_MOC,
    build_warunki_przylaczenia_view,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from enm.canonical_analysis import CanonicalRun, list_runs_for_case
from enm.hash import compute_enm_hash
from enm.store import get_enm

# --- Stany kryterium ---------------------------------------------------------

STAN_SPELNIONE = "SPELNIONE"
STAN_NARUSZONE = "NARUSZONE"
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
WYNIK_BRAK_PODSTAW = "BRAK_PODSTAW"

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
        nazwa_pl="Moc w punkcie przylaczenia",
        warunek_pl=r"$|P| \le P_{\text{przyl}}$ (moc przylaczeniowa z warunkow OSD)",
        norma_pl="Warunki przylaczenia OSD (dokument projektu)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_PRZYLACZENIE,
        wielkosc_pl="Moc czynna w punkcie przyłączenia",
        symbol="|P|",
        jednostka="MW",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_PWP_COS_PHI,
        etap="E1/E5",
        nazwa_pl="Wspolczynnik mocy w punkcie przylaczenia",
        warunek_pl=r"$\cos\varphi \ge \cos\varphi_{\text{wym}}$ (wymaganie warunkow OSD)",
        norma_pl="Warunki przylaczenia OSD (dokument projektu)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_PRZYLACZENIE,
        wielkosc_pl="Współczynnik mocy w punkcie przyłączenia",
        symbol="cos φ",
        jednostka="-",
        warunek=WARUNEK_NIE_MNIEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_NAPIECIE,
        etap="E5",
        nazwa_pl="Odchylenia napiec w wezlach",
        warunek_pl=r"$|\Delta U| \le \Delta U_{\text{dop}}$ (dopuszczalne odchylenie napiecia)",
        norma_pl="Kryterium jakosci napiecia (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_NAPIECIA,
        wielkosc_pl="Odchylenie napięcia od znamionowego",
        symbol="|ΔU|",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_OBCIAZENIE_GALEZI,
        etap="E5",
        nazwa_pl="Obciazenie dlugotrwale galezi",
        warunek_pl=r"$I_{\text{rob}} \le I_{z}$ (obciazalnosc dlugotrwala przewodu)",
        norma_pl="Obciazalnosc katalogowa przewodu (warunki odniesienia)",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_GALAZ_LINIOWA,
        grupa=GRUPA_OBCIAZALNOSC,
        wielkosc_pl="Obciążenie gałęzi względem obciążalności długotrwałej",
        symbol="I/I_z",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_OBCIAZENIE_TRAFO,
        etap="E5",
        nazwa_pl="Obciazenie transformatorow",
        warunek_pl=r"$S_{\text{rob}} \le S_{n}$ (moc znamionowa transformatora)",
        norma_pl="Moc znamionowa z typu katalogowego",
        zrodlo=ZRODLO_PF,
        element_rodzaj=ELEMENT_TRANSFORMATOR,
        grupa=GRUPA_OBCIAZALNOSC,
        wielkosc_pl="Obciążenie transformatora względem mocy znamionowej",
        symbol="S/S_n",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_STRATY,
        etap="E5",
        nazwa_pl="Budzet strat mocy",
        warunek_pl=r"$\Delta P \le \Delta P_{\text{budzet}}$ (zalozony budzet strat)",
        norma_pl="Zalozenie projektowe (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        grupa=GRUPA_BILANS,
        wielkosc_pl="Straty mocy czynnej względem mocy przesyłanej",
        symbol="ΔP/P",
        jednostka="%",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_BILANS_Q,
        etap="E5",
        nazwa_pl="Bilans mocy biernej",
        warunek_pl="bilans Q w zalozonym pasmie",
        norma_pl="Zalozenie projektowe (progi z konfiguracji walidacji energetycznej)",
        zrodlo=ZRODLO_PF,
        grupa=GRUPA_BILANS,
        wielkosc_pl="Współczynnik mocy w węźle bilansującym",
        symbol="cos φ",
        jednostka="-",
        warunek=WARUNEK_NIE_MNIEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_PRZEWOD_CIEPLNY,
        etap="E3/E4",
        nazwa_pl="Wytrzymalosc zwarciowa przewodu",
        warunek_pl=r"$I_{\text{th}} \le I_{\text{th(1s)}} / \sqrt{t}$",
        norma_pl="IEC 60949 / PN-HD 60364-5-54",
        zrodlo=ZRODLO_SC,
        element_rodzaj=ELEMENT_GALAZ_LINIOWA,
        grupa=GRUPA_WYTRZYMALOSC,
        wielkosc_pl="Energia cieplna zwarcia względem dopuszczalnej dla żyły",
        symbol="I²t",
        jednostka="A²·s",
        warunek=WARUNEK_NIE_WIECEJ,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_WIARYGODNOSC_SC,
        etap="E4",
        nazwa_pl="Wiarygodnosc pradu zwarciowego",
        warunek_pl=r"$I_{k}''$ w pasmie wiarygodnosci dla poziomu napiecia",
        norma_pl="Kontrola wiarygodnosci wyniku (brama pakietu OSD)",
        zrodlo=ZRODLO_SC,
        element_rodzaj=ELEMENT_SZYNA,
        grupa=GRUPA_ZWARCIA,
        wielkosc_pl="Prąd zwarciowy początkowy",
        symbol="I_k″",
        jednostka="kA",
        warunek=WARUNEK_PASMO,
    ),
    DefinicjaKryterium(
        kryterium_id=KRYTERIUM_DOBOR_DER_SN,
        etap="E3",
        nazwa_pl="Dobory toru przylaczenia zrodla (DER-SN)",
        warunek_pl="zgodnosc napiec, mocy TR blokowego i kaskady pradowej",
        norma_pl="Walidacje doborowe toru DER-SN (dane z tabliczek)",
        zrodlo=ZRODLO_MODEL,
        element_rodzaj=ELEMENT_ZRODLO,
        grupa=GRUPA_DOBORY,
        wielkosc_pl="Zgodność doboru toru źródła z tabliczkami",
        symbol="-",
        jednostka="-",
        warunek=WARUNEK_ZGODNOSC,
    ),
)

_DEFINICJE_PO_ID: dict[str, DefinicjaKryterium] = {
    definicja.kryterium_id: definicja for definicja in REJESTR_KRYTERIOW
}

# Kryteria BEZ automatycznego dostawcy — jawny zakres weryfikacji (patrz naglowek).
ZAKRES_POZA_AUTOMATEM: tuple[dict[str, str], ...] = (
    {
        "kryterium_pl": "Selektywnosc i czulosc zabezpieczen (stopniowanie czasowo-pradowe)",
        "etap": "E6",
        "powod_pl": (
            "Analiza koordynacji liczy charakterystyki i czasy, ale nie wystawia werdyktu "
            "selektywnosci na poziomie calego modelu — ocena nalezy do projektanta na "
            "ekranie koordynacji."
        ),
    },
    {
        "kryterium_pl": "Wytrzymalosc aparatury (Icu, Idyn, Ith) na calym modelu",
        "etap": "E4",
        "powod_pl": (
            "Dowod wytrzymalosci aparatu istnieje jako pakiet dowodowy dla WSKAZANEGO "
            "aparatu; nie ma przebiegu, ktory sprawdza wszystkie aparaty modelu naraz."
        ),
    },
    {
        # V12K-207 (karta F-K7): korekta JEST juz czescia toru doboru kabla DER — ale nie
        # calego modelu. Wpis zostaje z ZAWEZONYM powodem, bo skreslenie go sugerowaloby,
        # ze kazdy przewod modelu jest sprawdzony z warunkami trasy, a to nieprawda.
        "kryterium_pl": "Obciazalnosc przewodu z korekta warunkow ulozenia na calym modelu",
        "etap": "E3",
        "powod_pl": (
            "Korekta warunkow ulozenia dziala w torze doboru kabla DER (zestawy warunkow z "
            "udokumentowana podstawa albo wspolczynniki projektanta) i jest zapisana przy "
            "kablu w modelu. Nie ma przebiegu, ktory sprawdza obciazalnosc WSZYSTKICH "
            "przewodow modelu wobec warunkow ich trasy — magistrala SN dobierana jest inna "
            "sciezka, a katalog nie dokumentuje warunkow odniesienia przy typach."
        ),
    },
    {
        "kryterium_pl": "Ekonomiczna gestosc pradu przekroju",
        "etap": "E3",
        "powod_pl": (
            "Kryterium niewiazace (optymalizacja kosztowa); brak danych ekonomicznych w "
            "modelu, wiec ocena byłaby zgadywaniem."
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
    #: Uwaga przy wyniku SPELNIA (np. margines w pasmie ostrzegawczym).
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

    def to_dict(self) -> dict[str, Any]:
        payload = self.definicja.to_dict()
        payload.update(
            {
                "stan": self.stan,
                "liczba_ocenionych": self.liczba_ocenionych,
                "liczba_naruszen": self.liczba_naruszen,
                "liczba_niesprawdzonych": self.liczba_niesprawdzonych,
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
            "niesprawdzone": sum(1 for p in self.pozycje if p.stan == STAN_NIESPRAWDZONE),
            "nie_dotyczy": sum(1 for p in self.pozycje if p.stan == STAN_NIE_DOTYCZY),
            "razem": len(self.pozycje),
        }

    @property
    def ocena(self) -> dict[str, int]:
        """Liczniki PER ELEMENT (naglowek ekranu oceny): OCENIONO = SPELNIA + NIE_SPELNIA."""
        elementy = [element for pozycja in self.pozycje for element in pozycja.elementy]
        spelnia = sum(1 for e in elementy if e.wynik == WYNIK_SPELNIA)
        nie_spelnia = sum(1 for e in elementy if e.wynik == WYNIK_NIE_SPELNIA)
        brak = sum(1 for e in elementy if e.wynik == WYNIK_BRAK_PODSTAW)
        return {
            "oceniono": spelnia + nie_spelnia,
            "spelnia": spelnia,
            "nie_spelnia": nie_spelnia,
            "brak_podstaw": brak,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
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


def _stan_z_licznikow(*, naruszenia: int, niesprawdzone: int) -> str:
    """Zachowawcza agregacja stanu (patrz naglowek modulu)."""
    if naruszenia > 0:
        return STAN_NARUSZONE
    if niesprawdzone > 0:
        return STAN_NIESPRAWDZONE
    return STAN_SPELNIONE


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


def _zapas(
    warunek: str, wartosc: float | None, odniesienie: float | None, jednostka: str
) -> tuple[float | None, str]:
    """Zapas do granicy z DWOCH liczb dostawcy (arytmetyka prezentacji, nie fizyka).

    Wielkosci wyrazone w % (odchylenie, obciazenie, straty): zapas w punktach
    procentowych = granica − wartosc. Pozostale: zapas wzgledny w % granicy.
    Kryterium „nie mniej niz": zapas = (wartosc − granica)/granica. Pasmo i zgodnosc
    nie maja skalarnego zapasu.
    """
    if wartosc is None or odniesienie is None:
        return None, ""
    if warunek == WARUNEK_NIE_WIECEJ:
        if jednostka == "%":
            return odniesienie - wartosc, "pkt proc."
        if odniesienie == 0.0:
            return None, ""
        return (odniesienie - wartosc) / abs(odniesienie) * 100.0, "%"
    if warunek == WARUNEK_NIE_MNIEJ:
        if odniesienie == 0.0:
            return None, ""
        return (wartosc - odniesienie) / abs(odniesienie) * 100.0, "%"
    return None, ""


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
    if zapas is None:
        zapas, zapas_jedn = _zapas(definicja.warunek, wart, odn, jedn)
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
        uwaga_pl=uwaga_pl,
        uzasadnienie_pl=uzasadnienie_pl,
        wniosek_pl=wniosek,
        dowod=dowod,
    )


_WYNIK_Z_STATUSU: dict[str, str] = {
    _STATUS_PASS: WYNIK_SPELNIA,
    "WARNING": WYNIK_SPELNIA,
    "WARN": WYNIK_SPELNIA,
    _STATUS_FAIL: WYNIK_NIE_SPELNIA,
    _STATUS_UNAVAILABLE: WYNIK_BRAK_PODSTAW,
    "NOT_COMPUTED": WYNIK_BRAK_PODSTAW,
}

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
                        "Ocena warunkow przylaczenia nie zawiera tego kryterium — "
                        "brak warunkow OSD w naglowku modelu albo brak wyniku w punkcie "
                        "przylaczenia."
                    ),
                    run_id=run_id,
                    liczba_niesprawdzonych=1,
                )
            )
            continue
        status = str(surowa.get("status"))
        definicja = _definicja(kryterium_id)
        opis = str(surowa.get("opis_pl") or "") or None
        wartosc = _liczba(surowa.get("wartosc"))
        # Kryterium mocy dotyczy MODULU mocy czynnej (oba kierunki) — tak jak dostawca.
        if kryterium_id == KRYTERIUM_PWP_MOC and wartosc is not None:
            wartosc = abs(wartosc)
        element = _ocena_elementu(
            definicja,
            element_id=punkt,
            element_nazwa=None,
            wynik=_WYNIK_Z_STATUSU.get(status, WYNIK_BRAK_PODSTAW),
            wartosc=wartosc,
            odniesienie=surowa.get("wymagana"),
            jednostka=str(surowa.get("jednostka") or definicja.jednostka),
            uzasadnienie_pl=opis,
            run_id=run_id,
        )
        if status == _STATUS_UNAVAILABLE:
            kody = [str(kod) for kod in (surowa.get("readiness_codes") or [])]
            pozycje.append(
                PozycjaWerdyktu(
                    definicja=definicja,
                    stan=STAN_NIESPRAWDZONE,
                    liczba_niesprawdzonych=1,
                    wiodacy_element_id=punkt,
                    wiodacy_opis_pl=opis,
                    powod_kod=kody[0] if kody else POWOD_BRAK_DANYCH,
                    powod_pl=opis,
                    run_id=run_id,
                    elementy=(element,),
                )
            )
            continue
        naruszone = status == _STATUS_FAIL
        pozycje.append(
            PozycjaWerdyktu(
                definicja=definicja,
                stan=STAN_NARUSZONE if naruszone else STAN_SPELNIONE,
                liczba_ocenionych=1,
                liczba_naruszen=1 if naruszone else 0,
                wiodacy_element_id=punkt,
                wiodacy_opis_pl=opis,
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
                        "Walidacja energetyczna nie zwrocila zadnej pozycji tej kontroli "
                        "dla biezacego biegu rozplywu."
                    ),
                    run_id=run_id,
                )
            )
            continue
        naruszenia = [w for w in wiersze if str(w.get("status")) == "FAIL"]
        niesprawdzone = [w for w in wiersze if str(w.get("status")) == "NOT_COMPUTED"]
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
                stan=_stan_z_licznikow(
                    naruszenia=len(naruszenia), niesprawdzone=len(niesprawdzone)
                ),
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
        element_nazwa=(str(wiersz.get("target_name")) if wiersz.get("target_name") else None),
        wynik=_WYNIK_Z_STATUSU.get(status, WYNIK_BRAK_PODSTAW),
        wartosc=wiersz.get("observed_value"),
        odniesienie=wiersz.get("limit_fail"),
        odniesienie_ostrzegawcze=wiersz.get("limit_warn"),
        jednostka=jednostka,
        margines=(-margines if margines is not None else None),
        margines_jednostka=(
            ("pkt proc." if jednostka == "%" else jednostka) if margines is not None else None
        ),
        uwaga_pl=_UWAGA_OSTRZEZENIE_PL if status == "WARNING" else None,
        uzasadnienie_pl=(str(wiersz.get("why_pl")) if wiersz.get("why_pl") else None),
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
            powod_pl="Bieg zwarciowy nie zwrocil zadnej galezi do oceny cieplnej.",
            run_id=run_id,
        )
    naruszenia = [w for w in wiersze if str(w.get("status")) == _STATUS_FAIL]
    niesprawdzone = [w for w in wiersze if str(w.get("status")) == _STATUS_UNAVAILABLE]
    wiodacy = _wiodaca_galaz(naruszenia or niesprawdzone)
    definicja = _definicja(KRYTERIUM_PRZEWOD_CIEPLNY)
    elementy = tuple(
        _ocena_elementu(
            definicja,
            element_id=str(wiersz.get("branch_id")) if wiersz.get("branch_id") else None,
            element_nazwa=(str(wiersz.get("branch_name")) if wiersz.get("branch_name") else None),
            wynik=_WYNIK_Z_STATUSU.get(str(wiersz.get("status")), WYNIK_BRAK_PODSTAW),
            wartosc=wiersz.get("i2t_a2s"),
            odniesienie=wiersz.get("i2t_dopuszczalne_a2s"),
            margines=wiersz.get("margines_procent"),
            margines_jednostka="%" if _liczba(wiersz.get("margines_procent")) is not None else None,
            uzasadnienie_pl=_opis_galezi(wiersz),
            run_id=run_id,
        )
        for wiersz in sorted(
            wiersze,
            key=lambda w: (
                {"FAIL": 0, "UNAVAILABLE": 1, "PASS": 2}.get(str(w.get("status")), 3),
                str(w.get("branch_id") or ""),
            ),
        )
    )
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=_stan_z_licznikow(naruszenia=len(naruszenia), niesprawdzone=len(niesprawdzone)),
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
            f"Galaz {wiersz.get('branch_name') or wiersz.get('branch_id')}: wymagany przekroj "
            f"{float(wymagany):.1f} mm2 wobec zastosowanego {float(zastosowany):.1f} mm2."
        )
    kody = [str(kod) for kod in (wiersz.get("missing_codes") or [])]
    if kody:
        return f"Brak danych do oceny cieplnej: {', '.join(kody)}."
    return None


# --- Dostawca: wiarygodnosc Ik'' (bieg SC) ----------------------------------


def _pozycja_wiarygodnosci(widok: Mapping[str, Any], *, run_id: str) -> PozycjaWerdyktu:
    wiersze = [w for w in (widok.get("items") or []) if isinstance(w, Mapping)]
    if not wiersze:
        return _niesprawdzona(
            KRYTERIUM_WIARYGODNOSC_SC,
            powod_kod=POWOD_BRAK_DANYCH,
            powod_pl="Bieg zwarciowy nie zwrocil zadnego wezla do oceny wiarygodnosci.",
            run_id=run_id,
        )
    podsumowanie = widok.get("summary") or {}
    poza_zakresem = int(podsumowanie.get("out_of_range_count") or 0)
    niekompletne = int(podsumowanie.get("incomplete_count") or 0)
    wiodacy = next(
        (w for w in wiersze if str(w.get("status")) in (OUT_OF_RANGE, INCOMPLETE)),
        None,
    )
    definicja = _definicja(KRYTERIUM_WIARYGODNOSC_SC)
    wynik_ze_statusu = {
        OUT_OF_RANGE: WYNIK_NIE_SPELNIA,
        INCOMPLETE: WYNIK_BRAK_PODSTAW,
    }
    elementy = tuple(
        _ocena_elementu(
            definicja,
            # Element = referencja ENM szyny (`element_id`), a `target_id` biegu
            # zostaje identyfikatorem zapasowym, gdy dostawca jej nie zna.
            element_id=str(wiersz.get("element_id") or wiersz.get("target_id") or "") or None,
            element_nazwa=(str(wiersz.get("target_name")) if wiersz.get("target_name") else None),
            wynik=wynik_ze_statusu.get(str(wiersz.get("status")), WYNIK_SPELNIA),
            wartosc=wiersz.get("ikss_ka"),
            odniesienie=wiersz.get("upper_ka"),
            odniesienie_dolne=wiersz.get("lower_ka"),
            uzasadnienie_pl=(str(wiersz.get("why_pl")) if wiersz.get("why_pl") else None),
            run_id=run_id,
        )
        for wiersz in sorted(
            wiersze,
            key=lambda w: (
                {OUT_OF_RANGE: 0, INCOMPLETE: 1}.get(str(w.get("status")), 2),
                str(w.get("target_id") or ""),
            ),
        )
    )
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=_stan_z_licznikow(naruszenia=poza_zakresem, niesprawdzone=niekompletne),
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
            powod_pl="Projekt nie zawiera toru przylaczenia zrodla wytworczego (DER-SN).",
        )
    pozycje = [p for p in (raport.get("pozycje") or []) if isinstance(p, Mapping)]
    podsumowanie = raport.get("podsumowanie") or {}
    liczba_fail = int(podsumowanie.get("fail") or 0)
    liczba_warn = int(podsumowanie.get("warn") or 0)
    wiodacy = next((p for p in pozycje if str(p.get("status")) == _STATUS_FAIL), None)
    if wiodacy is None:
        wiodacy = next((p for p in pozycje if str(p.get("status")) == "WARN"), None)
    zrodlo_ref = str(raport.get("source_ref")) if raport.get("source_ref") else None
    zrodlo_nazwa = str(raport.get("source_name")) if raport.get("source_name") else None
    elementy = tuple(
        _ocena_elementu(
            definicja,
            element_id=zrodlo_ref,
            element_nazwa=(
                f"{zrodlo_nazwa or zrodlo_ref or ''} — {_nazwa_kontroli_der(pozycja)}".strip(" —")
            ),
            wynik=_WYNIK_Z_STATUSU.get(str(pozycja.get("status")), WYNIK_BRAK_PODSTAW),
            uwaga_pl=(
                "Pozycja z uwagą (odstępstwo lub ostrzeżenie kaskady prądowej)"
                if str(pozycja.get("status")) == "WARN"
                else None
            ),
            uzasadnienie_pl=_komunikat_der(pozycja),
        )
        for pozycja in pozycje
    )
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=STAN_NARUSZONE if liczba_fail > 0 else STAN_SPELNIONE,
        liczba_ocenionych=len(pozycje),
        liczba_naruszen=liczba_fail,
        liczba_ostrzezen=liczba_warn,
        wiodacy_element_id=zrodlo_ref,
        wiodacy_opis_pl=(str(wiodacy.get("message_pl")) if wiodacy else None),
        elementy=elementy,
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
        return f"zgodność doboru „{pozycja.get('parametr') or check_id[3:]}” z propozycją"
    if "kaskada" in check_id:
        return "kaskada prądowa toru"
    return check_id.replace("_", " ")


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
    etykieta = "rozplywu mocy" if rodzaj == ZRODLO_PF else "zwarciowego"
    if bieg is None:
        return (
            ZrodloWerdyktu(
                rodzaj=rodzaj,
                run_id=None,
                wykonano=None,
                snapshot_hash=None,
                aktualny=False,
                dostepny=False,
                powod_pl=f"Brak zakonczonego biegu {etykieta} dla tego przypadku.",
            ),
            POWOD_BRAK_BIEGU,
            f"Brak zakonczonego biegu {etykieta} — uruchom obliczenia, zeby ocenic kryterium.",
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
            else f"Bieg {etykieta} nie zakonczyl sie poprawnie (status: {bieg.status})."
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
                    f"Model zmienil sie po biegu {etykieta} — wynik nie opisuje biezacego modelu."
                ),
            ),
            POWOD_BIEG_NIEAKTUALNY,
            (
                f"Model zmienil sie po biegu {etykieta}; wynik nie jest dowodem dla biezacego "
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
    if any(pozycja.stan == STAN_NARUSZONE for pozycja in pozycje):
        return STAN_NARUSZONE
    if any(pozycja.stan == STAN_NIESPRAWDZONE for pozycja in pozycje):
        return STAN_NIESPRAWDZONE
    return STAN_SPELNIONE


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
            powod_pl=None if snapshot else "Brak modelu do oceny doborow.",
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
    return werdykt.to_dict()
