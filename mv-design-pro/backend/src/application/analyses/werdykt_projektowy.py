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
niesie pozycja, ktorej element ma rekord ``NIEJEDNOZNACZNY`` — nie jest ani spelnieniem,
ani naruszeniem, ani brakiem biegu. Czwarty stan NIE_DOTYCZY jest jawnie odrozniony i NIE
zastepuje zadnego z trzech: oznacza, ze kryterium nie ma zastosowania do tego projektu (np.
tor DER-SN w projekcie bez zrodla wytworczego). Projekt bez OZE nie moze byc na wieki
„niesprawdzony" z powodu kryterium, ktorego nie ma jak naruszyc.

JEDNO ZRODLO WYNIKU (karta WERDYKT-MIGRACJA-190, kontrakt werdyktu wyjasnialnego).
Kazdy dostawca niesie przy kazdym wierszu rekord werdyktu (``ocena``: K albo W pakietu
``werdykt``). Wynik elementu jest PROJEKCJA tego rekordu (``_wynik_z_ocen`` —
``rozstrzygniecie`` pakietu), wniosek elementu jest zdaniem jego wyjasnienia. Kod statusu
dostawcy (``PASS``/``WARN``/``FAIL``…) NIE decyduje o wyniku — dawne mapy „status ->
wynik" per dostawca zniknely razem z mozliwoscia ich rozjazdu z rekordem.

ZASADA ZACHOWAWCZOSCI AGREGACJI (kolejnosc §2.3 kontraktu werdyktu, pkt 4–7).
Kryterium obejmujace WIELE elementow (np. obciazenie gałęzi) skleja sie regula
``rozstrzygniecie`` nad rekordami wszystkich elementow:
  - jakiekolwiek naruszenie  => NARUSZONE (naruszenie jest zawsze dzialaniem do
    wykonania, niezaleznie od tego, ile pozycji zostalo niesprawdzonych),
  - brak naruszen, ale jakikolwiek wynik niejednoznaczny => NIEJEDNOZNACZNE,
  - brak naruszen i niejednoznacznosci, ale jakakolwiek pozycja niesprawdzona =>
    NIESPRAWDZONE (bo „50 z 51 gałęzi w normie" NIE znaczy „kryterium spelnione" —
    o pozostalej gałęzi nie wiemy nic),
  - wszystkie pozycje sprawdzone i dotrzymane => SPELNIONE.
Agregat NIGDY nie jest lepszy niz najgorsza skladowa — ta sama regula sklada werdykt
calosciowy z pozycji (NIE_DOTYCZY pomijane; komplet NIE_DOTYCZY to brak podstawy, nie
spelnienie). Kryterium oceniane na WIELU obiektach nie tworzy rekordu W nad nimi
(identyfikator kryterium skladowego nie powtarza sie w rekordzie W): pozycja i werdykt
niosa REKORD ROZSTRZYGAJACY (rekord pierwszego elementu, pierwszej pozycji, o tym samym
wyniku) i jego wyjasnienie, a liczniki stoja obok listy rekordow, nie zamiast niej.

OSTRZEZENIE (WARNING z walidacji energetycznej) NIE jest czwartym stanem
kryterium: rekord jest spelniony, a dostawca sygnalizuje bliskosc progu ostrzegawczego.
Liczba ostrzezen jedzie osobnym polem ``liczba_ostrzezen`` (wylacznie przy rekordzie
spelnionym — ten sam predykat co uwaga elementu), zeby informacja nie zginela, a stan
pozostal jednoznaczny. Pozycje informacyjne raportu doborow DER-SN (odstepstwa od propozycji
doboru, uklad polaczen z typu) nie sa ocenami — ida do licznika uwag, nie do elementow.

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

from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.analyses.raport_zgodnosci import STATUS_INFORMACJA, build_compliance_report
from application.analyses.sanity_bounds import build_sanity_bounds_view
from application.analyses.warunki_przylaczenia import (
    KRYTERIUM_COS_PHI,
    KRYTERIUM_MOC,
    build_warunki_przylaczenia_view,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.autorytet_biegu_zwarciowego import bieg_w_zakresie_iec60909
from domain.canonical_operations import opisy_kodow_gotowosci_pl
from enm.canonical_analysis import CanonicalRun, list_runs_for_case
from enm.hash import compute_enm_hash
from enm.nazwy_elementow import opis_bez_nazwy
from enm.store import get_enm
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaDanychError
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    SLOWNIK_ETYKIET,
    OcenaKryterium,
    Przedmiot,
    Relacja,
    WyjasnienieWerdyktu,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_zalozenia,
    rozstrzygniecie,
)

# --- Stany kryterium ---------------------------------------------------------

#: Kompletność dowodu kontraktu werdyktu (§3) — wartość jedyna, którą agregat emituje
#: (dowód pełny = brak klucza: słowniki werdyktu na danych projektu bez zmian).
KOMPLETNOSC_NIEPELNA = "NIEPELNY"

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
_STAN_Z_WYNIKU: dict[str, str] = dict(_KOLEJNOSC_WYNIKOW)

# Kierunek warunku kryterium — steruje zdaniem wniosku i znakiem zapasu.
WARUNEK_NIE_WIECEJ = "nie_wiecej_niz"
WARUNEK_NIE_MNIEJ = "nie_mniej_niz"
WARUNEK_PASMO = "w_pasmie"
WARUNEK_ZGODNOSC = "zgodnosc"

#: Zdolność dowodowa agregatu (``solver_input.provenance``) i identyfikator wymagania projektu.
ZDOLNOSC_WERDYKTU = "werdykt.projektowy"

#: Relacja rekordu kryterium dla kierunku warunku definicji (rekord pozycji bez elementów).
_RELACJA_WARUNKU: dict[str, Relacja] = {
    WARUNEK_NIE_WIECEJ: "NIE_WIECEJ",
    WARUNEK_NIE_MNIEJ: "NIE_MNIEJ",
    WARUNEK_PASMO: "PASMO",
    WARUNEK_ZGODNOSC: "LOGICZNE",
}

#: Rekord oceny elementu od dostawcy: poziom K albo W (wytrzymałość cieplna gałęzi).
RekordElementu = OcenaKryterium | WynikWymagania


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
    #: Rekord werdyktu wyjaśnialnego dostawcy (K albo W) — JEDYNE źródło wyniku elementu:
    #: ``wynik`` jest jego projekcją (``_wynik_z_ocen``), ``wniosek_pl`` jego zdaniem.
    ocena: RekordElementu
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
    #: Odwolanie do dowodu obliczeniowego: bieg + element (``None`` = brak biegu).
    dowod: dict[str, str] | None = None
    #: Dane przyjęte widoku dostawcy (wartości robocze: tolerancja sieci nN, linie 110 kV
    #: z wartością roboczą geometrii), na których stoi liczba elementu — kontrakt werdyktu §3:
    #: ocena na nich ma kompletność dowodu ``NIEPELNY`` (nie potwierdzony dowód zgodności).
    dane_przyjete: tuple[dict[str, Any], ...] = ()

    @property
    def wynik(self) -> str:
        """Wynik elementu — projekcja rekordu dostawcy (jedno źródło rozstrzygnięcia)."""
        return _wynik_z_ocen(_skladowe(self.ocena))

    @property
    def wniosek_pl(self) -> str:
        """Wniosek projektowy — zdanie wyjaśnienia rekordu dostawcy (generator pakietu werdykt)."""
        return self.ocena.wyjasnienie.zdanie_pl

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_id": self.element_id,
            "element_nazwa": self.element_nazwa,
            "element_rodzaj": self.element_rodzaj,
            "wynik": self.wynik,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.ocena.wyjasnienie.model_dump(mode="json"),
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
            # Addytywnie, WYŁĄCZNIE przy danych przyjętych — element na danych projektu
            # ma słownik bit w bit jak przed kartą LINIA-110.
            **(
                {
                    "dane_przyjete": [dict(d) for d in self.dane_przyjete],
                    "kompletnosc_dowodu": KOMPLETNOSC_NIEPELNA,
                }
                if self.dane_przyjete
                else {}
            ),
        }


@dataclass(frozen=True)
class PozycjaWerdyktu:
    """Jedno kryterium projektu w werdykcie (WHITE BOX: liczby + powod braku oceny).

    Kryterium projektu ocenia się na WIELU obiektach tym samym kryterium składowym, więc nie
    tworzy rekordu W nad nimi (kontrakt werdyktu: identyfikator kryterium składowego nie
    powtarza się w rekordzie W, a liczniki stoją OBOK listy rekordów, nie zamiast niej).
    ``stan`` jest projekcją rekordów WSZYSTKICH elementów (reguła ``rozstrzygniecie``), a
    ``ocena`` — rekordem rozstrzygającym: rekordem elementu, którego wynik jest wynikiem pozycji
    (pierwszym w kolejności dostawcy), albo rekordem K pozycji bez elementów (ocena niewykonana,
    nie dotyczy). Spójność obu pilnuje ``__post_init__`` (jedno źródło, predykaty parami).
    """

    definicja: DefinicjaKryterium
    ocena: RekordElementu
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

    def __post_init__(self) -> None:
        # Niezmienniki programu (nie odmowa danych): naruszenie to błąd składania pozycji.
        assert not self.elementy or any(e.ocena is self.ocena for e in self.elementy), (
            f"Pozycja {self.definicja.kryterium_id}: rekord rozstrzygający nie jest rekordem "
            "żadnego elementu pozycji"
        )
        assert _wynik_z_ocen(_skladowe(self.ocena)) == self.wynik, (
            f"Pozycja {self.definicja.kryterium_id}: wynik rekordu rozstrzygającego różni "
            "się od wyniku pozycji"
        )

    @property
    def oceny_skladowe(self) -> tuple[OcenaKryterium, ...]:
        """Oceny poziomu K pozycji: elementów albo — bez elementów — rekordu pozycji."""
        if self.elementy:
            return tuple(o for element in self.elementy for o in _skladowe(element.ocena))
        return _skladowe(self.ocena)

    @property
    def wynik(self) -> str:
        """Wynik pozycji — projekcja rozstrzygnięcia rekordów wszystkich elementów."""
        return _wynik_z_ocen(self.oceny_skladowe)

    @property
    def stan(self) -> str:
        """Stan pozycji — projekcja wyniku; komplet ocen ``NIE_DOTYCZY`` to „nie dotyczy”."""
        oceny = self.oceny_skladowe
        if oceny and all(o.status_maszynowy == "NIE_DOTYCZY" for o in oceny):
            return STAN_NIE_DOTYCZY
        return _STAN_Z_WYNIKU[self.wynik]

    @property
    def wyjasnienie(self) -> WyjasnienieWerdyktu:
        """Wyjaśnienie stanu pozycji — wyjaśnienie rekordu rozstrzygającego."""
        return self.ocena.wyjasnienie

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
                "ocena": self.ocena.model_dump(mode="json"),
                "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
                # Agregat nie zastępuje składowych (kontrakt werdyktu §2.3): pozycja, której
                # którykolwiek element stoi na danej przyjętej, ma dowód niepełny.
                **({"kompletnosc_dowodu": KOMPLETNOSC_NIEPELNA} if self.dowod_niepelny else {}),
            }
        )
        return payload

    @property
    def dowod_niepelny(self) -> bool:
        """Czy którykolwiek element pozycji stoi na danej przyjętej (jedno źródło: elementy)."""
        return any(element.dane_przyjete for element in self.elementy)


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
    """Agregat: jeden werdykt projektu + rejestr kryteriow + jawny zakres.

    ``werdykt`` (kod zastany) jest projekcją rozstrzygnięcia rekordów WSZYSTKICH pozycji
    (kolejność §2.3: naruszenie → niejednoznaczność → brak podstaw → spełnienie; komplet
    ``NIE_DOTYCZY`` to brak podstaw). Wyjaśnienie werdyktu to wyjaśnienie rekordu
    rozstrzygającego pierwszej pozycji o tym samym wyniku — agregat nie zastępuje kryteriów
    składowych, pozycje z rekordami idą obok niego.
    """

    case_id: str
    model_hash: str
    pozycje: tuple[PozycjaWerdyktu, ...]
    zrodla: tuple[ZrodloWerdyktu, ...]

    @property
    def wynik(self) -> str:
        return _wynik_z_ocen([o for pozycja in self.pozycje for o in pozycja.oceny_skladowe])

    @property
    def werdykt(self) -> str:
        """Werdykt całościowy — projekcja rozstrzygnięcia rekordów wszystkich pozycji."""
        return _STAN_Z_WYNIKU[self.wynik]

    @property
    def pozycja_rozstrzygajaca(self) -> PozycjaWerdyktu | None:
        """Pierwsza pozycja rejestru o wyniku werdyktu (``None`` — rejestr pusty)."""
        wynik = self.wynik
        return next((p for p in self.pozycje if p.wynik == wynik), None)

    @property
    def wyjasnienie(self) -> WyjasnienieWerdyktu | None:
        pozycja = self.pozycja_rozstrzygajaca
        return None if pozycja is None else pozycja.wyjasnienie

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

    @property
    def liczniki_etykiet(self) -> list[dict[str, Any]]:
        """Liczba elementów pod każdą etykietą ich rekordów (§9 kontraktu, słownik etykiet).

        Liczniki stoją OBOK listy rekordów (agregat nie zastępuje składowych): ekran podpisuje
        je etykietą z rekordu, nie własnym tłumaczeniem kodu. Kolejność — słownik etykiet
        (``SLOWNIK_ETYKIET``: poziom K, potem W), deterministyczna.
        """
        liczby: dict[str, int] = {}
        semantyka: dict[str, str] = {}
        for pozycja in self.pozycje:
            for element in pozycja.elementy:
                etyk = element.ocena.etykieta
                liczby[etyk.etykieta_pl] = liczby.get(etyk.etykieta_pl, 0) + 1
                semantyka[etyk.etykieta_pl] = etyk.semantyka
        kolejnosc = list(dict.fromkeys(p.etykieta_pl for p in SLOWNIK_ETYKIET))
        return [
            {
                "etykieta": {"etykieta_pl": tekst, "semantyka": semantyka[tekst]},
                "liczba": liczby[tekst],
            }
            for tekst in sorted(liczby, key=kolejnosc.index)
        ]

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
                "liczniki_etykiet": self.liczniki_etykiet,
                "grupy": [{"kod": kod, "nazwa_pl": nazwa} for kod, nazwa in GRUPY_KRYTERIOW],
                "zakres_poza_automatem": [dict(wpis) for wpis in ZAKRES_POZA_AUTOMATEM],
                "kryterium_rozstrzygajace": (
                    None
                    if self.pozycja_rozstrzygajaca is None
                    else self.pozycja_rozstrzygajaca.definicja.kryterium_id
                ),
                "wyjasnienie": (
                    None if self.wyjasnienie is None else self.wyjasnienie.model_dump(mode="json")
                ),
                # Werdykt całościowy na danych przyjętych jest dowodem niepełnym (§2.3, §3) —
                # addytywnie, WYŁĄCZNIE gdy którakolwiek pozycja ma dowód niepełny.
                **(
                    {"kompletnosc_dowodu": KOMPLETNOSC_NIEPELNA}
                    if any(pozycja.dowod_niepelny for pozycja in self.pozycje)
                    else {}
                ),
            }
        )
        return kontrakt


def _definicja(kryterium_id: str) -> DefinicjaKryterium:
    return _DEFINICJE_PO_ID[kryterium_id]


_PODSTAWA_REJESTRU = podstawa_zalozenia(
    "Rejestr kryteriów werdyktu projektowego programu",
    "kryteria projektu objęte oceną automatyczną (rejestr kryteriów modułu)",
    uwagi_pl=(
        "podstawa każdego kryterium (norma, warunki OSD, katalog, założenie) jest w rekordzie "
        "oceny dostawcy"
    ),
)
_ZAKRES_PROJEKTU = ZakresWaznosci(
    opis_pl=(
        "Kryteria projektu ocenione z najnowszych aktualnych biegów rozpływu mocy i zwarć "
        "przypadku oraz z modelu (dobory toru źródła) w chwili budowy werdyktu."
    ),
    wykluczenia=tuple(wpis["kryterium_pl"] for wpis in ZAKRES_POZA_AUTOMATEM),
)


def _skladowe(rekord: RekordElementu) -> tuple[OcenaKryterium, ...]:
    """Oceny poziomu K rekordu (rekord W niesie je jako składowe)."""
    return rekord.oceny_skladowe if isinstance(rekord, WynikWymagania) else (rekord,)


def _rekord(dane: Mapping[str, Any]) -> RekordElementu:
    """Rekord dostawcy odczytany ze słownika widoku — konstrukcja z JSON przechodzi te same
    wyprowadzenia reguły co budowa (walidator rekordu odrzuca niespójny rekord)."""
    if "oceny_skladowe" in dane:
        return WynikWymagania.model_validate(dane)
    return OcenaKryterium.model_validate(dane)


def _wynik_z_ocen(oceny: Sequence[OcenaKryterium]) -> str:
    """Wynik rejestru (element, pozycja, projekt) — projekcja rozstrzygnięcia rekordów.

    ``rozstrzygniecie`` (pakiet ``werdykt``) daje naruszenie, gdy którakolwiek stosowalna ocena
    jest naruszona, spełnienie, gdy każda stosowalna jest spełniona na liczbach; w pozostałych
    przypadkach wynik nierozstrzygnięty jest NIEJEDNOZNACZNY, gdy którakolwiek ocena jest
    niejednoznaczna (§2.3 pkt 5), inaczej BRAK_PODSTAW (ocena niewykonana, brak podstawy,
    brak dowodu, komplet „nie dotyczy" — brak danych ≠ spełnia).
    """
    rozstrzygniete = rozstrzygniecie(oceny)
    if rozstrzygniete == "NIE_SPELNIA":
        return WYNIK_NIE_SPELNIA
    if rozstrzygniete == "SPELNIA":
        return WYNIK_SPELNIA
    if any(ocena.status_maszynowy == "NIEJEDNOZNACZNY" for ocena in oceny):
        return WYNIK_NIEJEDNOZNACZNY
    return WYNIK_BRAK_PODSTAW


def _ocena_kryterium_bez_elementow(
    definicja: DefinicjaKryterium, *, powod_pl: str, dotyczy: bool = True
) -> OcenaKryterium:
    """Rekord K pozycji, dla której dostawca nie dał żadnego elementu: ocena niewykonana
    (brak biegu, bieg nieaktualny albo nieudany, brak danych — ``powod_pl`` jako brak) albo
    — ``dotyczy=False`` — kryterium nie stosujące się do projektu (``powod_pl`` jako powód)."""
    return ocena_porownania(
        Porownanie(
            kryterium_id=definicja.kryterium_id,
            opis_pl=definicja.nazwa_pl,
            warunek_latex=definicja.warunek_latex,
            relacja=_RELACJA_WARUNKU[definicja.warunek],
            wielkosc_pl=definicja.wielkosc_pl or definicja.nazwa_pl,
            symbol_latex=definicja.symbol_latex,
            braki=(powod_pl,) if dotyczy else (),
            dotyczy=dotyczy,
            powod_stosowalnosci_pl=powod_pl,
        ),
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl="model sieci przypadku obliczeniowego",
            opis_pl=f"Kryterium projektu ({definicja.norma_pl})",
        ),
        podstawa=_PODSTAWA_REJESTRU,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WERDYKTU),
        zakres=_ZAKRES_PROJEKTU,
    )


def _pozycja_z_elementow(
    definicja: DefinicjaKryterium,
    elementy: Sequence[OcenaElementu],
    **pola: Any,
) -> PozycjaWerdyktu:
    """Pozycja z ocenami elementów; rekord rozstrzygający to rekord pierwszego elementu, którego
    wynik równa się wynikowi pozycji (ten sam predykat co ``PozycjaWerdyktu.wynik``)."""
    wynik = _wynik_z_ocen([o for element in elementy for o in _skladowe(element.ocena)])
    rozstrzygajacy = next(e for e in elementy if e.wynik == wynik)
    return PozycjaWerdyktu(
        definicja=definicja,
        ocena=rozstrzygajacy.ocena,
        elementy=tuple(elementy),
        **pola,
    )


def _niesprawdzona(
    kryterium_id: str,
    *,
    powod_kod: str,
    powod_pl: str,
    run_id: str | None = None,
    liczba_niesprawdzonych: int = 0,
    liczba_ostrzezen: int = 0,
    wiodacy_element_id: str | None = None,
) -> PozycjaWerdyktu:
    definicja = _definicja(kryterium_id)
    return PozycjaWerdyktu(
        definicja=definicja,
        ocena=_ocena_kryterium_bez_elementow(definicja, powod_pl=powod_pl),
        liczba_niesprawdzonych=liczba_niesprawdzonych,
        liczba_ostrzezen=liczba_ostrzezen,
        wiodacy_element_id=wiodacy_element_id,
        powod_kod=powod_kod,
        powod_pl=powod_pl,
        run_id=run_id,
    )


def _nie_dotyczy(kryterium_id: str, *, powod_pl: str) -> PozycjaWerdyktu:
    """Pozycja kryterium bez zastosowania w projekcie (rekord K ``NIE_DOTYCZY``)."""
    definicja = _definicja(kryterium_id)
    return PozycjaWerdyktu(
        definicja=definicja,
        ocena=_ocena_kryterium_bez_elementow(definicja, powod_pl=powod_pl, dotyczy=False),
        powod_pl=powod_pl,
    )


# --- Elementy: liczby, zapas, wniosek (karta B-02 / W3-E) -------------------


def _liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


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


def _ocena_elementu(
    definicja: DefinicjaKryterium,
    *,
    element_id: str | None,
    element_nazwa: str | None,
    rekord: RekordElementu,
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
    dane_przyjete: Sequence[Mapping[str, Any]] = (),
    zrodlo_liczb_pl: str = "Wielkości",
) -> OcenaElementu:
    """Ocena elementu: rekord dostawcy (wynik i wniosek) + liczby wiersza do tabeli ekranu."""
    dane = tuple(dict(d) for d in dane_przyjete)
    # Uwaga przy SPEŁNIA: „spełnia" nazywa daną przyjętą (kontrakt werdyktu §3) — obok
    # uwagi dostawcy (np. pasmo ostrzegawcze), nigdy zamiast niej.
    if dane:
        uwaga_danych = _uwaga_danych_przyjetych(dane, zrodlo_liczb_pl)
        uwaga_pl = f"{uwaga_pl.rstrip('.')}. {uwaga_danych}" if uwaga_pl else uwaga_danych
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
    dowod = (
        {"run_id": run_id, "element_id": element_id}
        if run_id is not None and element_id is not None
        else None
    )
    return OcenaElementu(
        element_id=element_id,
        element_nazwa=element_nazwa,
        element_rodzaj=definicja.element_rodzaj,
        ocena=rekord,
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
        dowod=dowod,
        dane_przyjete=dane,
    )


def _uwaga_danych_przyjetych(dane: Sequence[Mapping[str, Any]], zrodlo_liczb_pl: str) -> str:
    """JEDNO zdanie uwagi o danych przyjętych dla każdego dostawcy (cieplny, wiarygodność Ik″,
    warunki przyłączenia, walidacja energetyczna)."""
    return (
        f"{zrodlo_liczb_pl} liczone z daną przyjętą (wartość robocza): "
        + "; ".join(str(d.get("nazwa_pl")) for d in dane)
        + " — ocena na danej przyjętej, nie potwierdzony dowód zgodności"
    )


def _dane_przyjete_widoku(widok: Mapping[str, Any]) -> tuple[Mapping[str, Any], ...]:
    """Dane przyjęte widoku dostawcy (``dane_przyjete`` — kształt wspólny widoków biegu)."""
    return tuple(d for d in (widok.get("dane_przyjete") or []) if isinstance(d, Mapping))


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
            rekord=_rekord(surowa["ocena"]),
            wartosc=wartosc,
            odniesienie=surowa.get("wymagana"),
            jednostka=str(surowa.get("jednostka") or definicja.jednostka),
            uzasadnienie_pl=opis,
            run_id=run_id,
            dane_przyjete=_dane_przyjete_widoku(widok),
            zrodlo_liczb_pl="Wielkości rozpływu",
        )
        # Stan pozycji z TEGO SAMEGO rekordu co wynik elementu (jedno zrodlo).
        bez_podstaw = element.wynik == WYNIK_BRAK_PODSTAW
        kody = [str(kod) for kod in (surowa.get("readiness_codes") or [])]
        pozycje.append(
            _pozycja_z_elementow(
                definicja,
                (element,),
                liczba_ocenionych=0 if bez_podstaw else 1,
                liczba_naruszen=1 if element.wynik == WYNIK_NIE_SPELNIA else 0,
                liczba_niesprawdzonych=1 if bez_podstaw else 0,
                wiodacy_element_id=punkt,
                wiodacy_opis_pl=opis,
                powod_kod=(kody[0] if kody else POWOD_BRAK_DANYCH) if bez_podstaw else None,
                powod_pl=opis if bez_podstaw else None,
                run_id=run_id,
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
        # Jedno źródło prawdy dla elementu i pozycji: rekord K wiersza (``ocena`` dostawcy).
        rekordy = [_rekord(w["ocena"]) for w in wiersze]
        wyniki = [_wynik_z_ocen(_skladowe(rekord)) for rekord in rekordy]
        naruszenia = [
            w for wynik, w in zip(wyniki, wiersze, strict=True) if wynik == WYNIK_NIE_SPELNIA
        ]
        niesprawdzone = [
            w for wynik, w in zip(wyniki, wiersze, strict=True) if wynik == WYNIK_BRAK_PODSTAW
        ]
        # Ostrzeżenie dostawcy = sygnał bliskości progu nałożony na rekord SPEŁNIONY (uwaga
        # przy SPEŁNIA), nie czwarty stan kryterium — ten sam predykat dla licznika, uwagi
        # elementu i kolejności elementów.
        ostrzega = {
            id(w): wynik == WYNIK_SPELNIA and str(w.get("status")) == "WARNING"
            for wynik, w in zip(wyniki, wiersze, strict=True)
        }
        ostrzezenia = [w for w in wiersze if ostrzega[id(w)]]
        wiodacy = _wiodacy_wiersz_walidacji(naruszenia or niesprawdzone or ostrzezenia)
        definicja = _definicja(kryterium_id)
        rekord_wiersza = {id(w): rekord for rekord, w in zip(rekordy, wiersze, strict=True)}
        ranga = {
            id(w): _ranga_wiersza_walidacji(wynik, ostrzega=ostrzega[id(w)])
            for wynik, w in zip(wyniki, wiersze, strict=True)
        }
        elementy = tuple(
            _element_walidacji(
                definicja,
                wiersz,
                rekord_wiersza[id(wiersz)],
                ostrzega=ostrzega[id(wiersz)],
                run_id=run_id,
                dane_przyjete=_dane_przyjete_widoku(widok),
            )
            for wiersz in _posortowane_wiersze_walidacji(wiersze, ranga)
        )
        pozycje.append(
            _pozycja_z_elementow(
                definicja,
                elementy,
                liczba_ocenionych=len(wiersze) - len(niesprawdzone),
                liczba_naruszen=len(naruszenia),
                liczba_niesprawdzonych=len(niesprawdzone),
                liczba_ostrzezen=len(ostrzezenia),
                wiodacy_element_id=(str(wiodacy.get("target_id")) if wiodacy else None),
                wiodacy_opis_pl=(str(wiodacy.get("why_pl")) if wiodacy else None),
                run_id=run_id,
            )
        )
    return pozycje


def _ranga_wiersza_walidacji(wynik: str, *, ostrzega: bool) -> int:
    """Ranga elementu walidacji z rekordu: naruszenie, spełnienie z ostrzeżeniem, spełnienie,
    pozostałe (niejednoznaczne, bez podstaw)."""
    if wynik == WYNIK_NIE_SPELNIA:
        return 0
    if wynik == WYNIK_SPELNIA:
        return 1 if ostrzega else 2
    return 3


def _posortowane_wiersze_walidacji(
    wiersze: Sequence[Mapping[str, Any]], ranga: Mapping[int, int]
) -> list[Mapping[str, Any]]:
    """Kolejność `elementy[]` wewnątrz pozycji wg rangi z rekordu (``_ranga_wiersza_walidacji``:
    naruszenia, spełnienia z ostrzeżeniem, spełnienia, pozostałe), wewnątrz rangi — najmniejszy
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
    for poziom in sorted({ranga[id(w)] for w in wiersze}):
        w_randze = [w for w in wiersze if ranga[id(w)] == poziom]
        z_zapasem = [w for w in w_randze if isinstance(w.get("margin_pct"), int | float)]
        bez_zapasu = [w for w in w_randze if not isinstance(w.get("margin_pct"), int | float)]
        z_zapasem.sort(key=lambda w: (-float(w["margin_pct"]), str(w.get("target_id") or "")))
        bez_zapasu.sort(key=lambda w: str(w.get("target_id") or ""))
        posortowane.extend(z_zapasem)
        posortowane.extend(bez_zapasu)
    return posortowane


def _element_walidacji(
    definicja: DefinicjaKryterium,
    wiersz: Mapping[str, Any],
    rekord: RekordElementu,
    *,
    ostrzega: bool,
    run_id: str,
    dane_przyjete: Sequence[Mapping[str, Any]] = (),
) -> OcenaElementu:
    """Pozycja walidacji energetycznej → ocena elementu (rekord i liczby 1:1 z dostawcy).

    ``margin_pct`` dostawcy = wartosc − prog przekroczenia (ujemny = w granicy);
    zapas ekranu = −margin_pct (dodatni = w granicy), w tej samej jednostce, co
    wartosc (dla wielkosci w % sa to punkty procentowe).
    """
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
        rekord=rekord,
        wartosc=wiersz.get("observed_value"),
        odniesienie=wiersz.get("limit_fail"),
        odniesienie_ostrzegawcze=wiersz.get("limit_warn"),
        jednostka=jednostka,
        margines=(-margines if margines is not None else None),
        margines_jednostka=(
            ("pkt proc." if jednostka == "%" else jednostka) if margines is not None else None
        ),
        uwaga_pl=_UWAGA_OSTRZEZENIE_PL if ostrzega else None,
        uzasadnienie_pl=str(wiersz.get("why_pl")) if wiersz.get("why_pl") else None,
        run_id=run_id,
        dane_przyjete=dane_przyjete,
        zrodlo_liczb_pl="Wielkości rozpływu",
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
    # Jedno źródło prawdy dla elementu i pozycji: rekord W gałęzi (``ocena`` dostawcy).
    z_rekordem = [(_rekord(w["ocena"]), w) for w in wiersze]
    wynik_wiersza = [(_wynik_z_ocen(_skladowe(rekord)), rekord, w) for rekord, w in z_rekordem]
    naruszenia = [w for wynik, _, w in wynik_wiersza if wynik == WYNIK_NIE_SPELNIA]
    niesprawdzone = [w for wynik, _, w in wynik_wiersza if wynik == WYNIK_BRAK_PODSTAW]
    wiodacy = _wiodaca_galaz(naruszenia or niesprawdzone)
    definicja = _definicja(KRYTERIUM_PRZEWOD_CIEPLNY)
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA i LINIA-110: prądy biegu na danej przyjętej
    # (``dane_przyjete`` widoku dostawcy) — „spełnia" nazywa daną przyjętą.
    dane_przyjete = _dane_przyjete_widoku(widok)
    elementy = tuple(
        _ocena_elementu(
            definicja,
            element_id=str(wiersz.get("branch_id")) if wiersz.get("branch_id") else None,
            element_nazwa=nazwa_nadana(wiersz.get("branch_name")),
            rekord=rekord,
            wartosc=wiersz.get("i2t_a2s"),
            odniesienie=wiersz.get("i2t_dopuszczalne_a2s"),
            margines=wiersz.get("margines_procent"),
            margines_jednostka="%" if _liczba(wiersz.get("margines_procent")) is not None else None,
            uzasadnienie_pl=_opis_galezi(wiersz),
            run_id=run_id,
            dane_przyjete=dane_przyjete,
            zrodlo_liczb_pl="Prądy zwarciowe",
        )
        for wynik, rekord, wiersz in sorted(
            wynik_wiersza,
            key=lambda trojka: (_RANGA_WYNIKU[trojka[0]], str(trojka[2].get("branch_id") or "")),
        )
    )
    return _pozycja_z_elementow(
        definicja,
        elementy,
        liczba_ocenionych=len(wiersze) - len(niesprawdzone),
        liczba_naruszen=len(naruszenia),
        liczba_niesprawdzonych=len(niesprawdzone),
        wiodacy_element_id=(str(wiodacy.get("branch_id")) if wiodacy else None),
        wiodacy_opis_pl=_opis_galezi(wiodacy),
        run_id=run_id,
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
    # Jedno źródło prawdy dla elementu i pozycji: rekord K wiersza (``ocena`` dostawcy).
    # Dawniej KAŻDY status spoza {poza zakresem, dane niekompletne} dawał SPEŁNIA, a liczniki
    # pozycji szły z podsumowania dostawcy — dwa niezależne warunki (KLASA §3).
    wynik_wiersza = [
        (_wynik_z_ocen(_skladowe(rekord)), rekord, w)
        for rekord, w in ((_rekord(w["ocena"]), w) for w in wiersze)
    ]
    poza_zakresem = sum(1 for wynik, _, _w in wynik_wiersza if wynik == WYNIK_NIE_SPELNIA)
    niekompletne = sum(1 for wynik, _, _w in wynik_wiersza if wynik == WYNIK_BRAK_PODSTAW)
    wiodacy = next((w for wynik, _, w in wynik_wiersza if wynik != WYNIK_SPELNIA), None)
    definicja = _definicja(KRYTERIUM_WIARYGODNOSC_SC)
    elementy = tuple(
        _ocena_elementu(
            definicja,
            # Element = referencja ENM szyny (`element_id`), a `target_id` biegu
            # zostaje identyfikatorem zapasowym, gdy dostawca jej nie zna.
            element_id=str(wiersz.get("element_id") or wiersz.get("target_id") or "") or None,
            element_nazwa=nazwa_nadana(wiersz.get("target_name")),
            rekord=rekord,
            wartosc=wiersz.get("ikss_ka"),
            odniesienie=wiersz.get("upper_ka"),
            odniesienie_dolne=wiersz.get("lower_ka"),
            uzasadnienie_pl=str(wiersz.get("why_pl")) if wiersz.get("why_pl") else None,
            run_id=run_id,
            dane_przyjete=_dane_przyjete_widoku(wiersz),
            zrodlo_liczb_pl="Prąd zwarciowy",
        )
        for wynik, rekord, wiersz in sorted(
            wynik_wiersza,
            key=lambda trojka: (_RANGA_WYNIKU[trojka[0]], str(trojka[2].get("target_id") or "")),
        )
    )
    return _pozycja_z_elementow(
        definicja,
        elementy,
        liczba_ocenionych=len(wiersze) - niekompletne,
        liczba_naruszen=poza_zakresem,
        liczba_niesprawdzonych=niekompletne,
        wiodacy_element_id=(str(wiodacy.get("target_id")) if wiodacy else None),
        wiodacy_opis_pl=(str(wiodacy.get("why_pl")) if wiodacy else None),
        run_id=run_id,
    )


# --- Dostawca: dobory toru DER-SN (model, bez biegu) ------------------------


def _pozycja_der_sn(raport: Mapping[str, Any] | None) -> PozycjaWerdyktu:
    if raport is None:
        return _nie_dotyczy(
            KRYTERIUM_DOBOR_DER_SN,
            powod_pl="Projekt nie zawiera toru przyłączenia źródła wytwórczego (DER-SN).",
        )
    definicja = _definicja(KRYTERIUM_DOBOR_DER_SN)
    pozycje = [p for p in (raport.get("pozycje") or []) if isinstance(p, Mapping)]
    # Pozycje informacyjne raportu (zgodność z propozycją D2, układ połączeń z typu) nie są
    # ocenami — odstępstwa i sekcja nieoceniona idą do licznika uwag, nie do elementów.
    oceniane = [p for p in pozycje if str(p.get("status")) != STATUS_INFORMACJA]
    liczba_uwag = sum(1 for p in pozycje if p.get("odstepstwo") or p.get("nieoceniono"))
    zrodlo_ref = str(raport.get("source_ref")) if raport.get("source_ref") else None
    zrodlo_nazwa = nazwa_nadana(raport.get("source_name"))
    elementy = [
        _ocena_elementu(
            definicja,
            element_id=zrodlo_ref,
            element_nazwa=(
                f"{zrodlo_nazwa or opis_bez_nazwy('generators')} — "
                f"{_nazwa_kontroli_der(pozycja)}"
            ),
            rekord=_rekord(pozycja["ocena"]),
            uzasadnienie_pl=_komunikat_der(pozycja),
        )
        for pozycja in oceniane
    ]
    wiodacy = next((e for e in elementy if e.wynik == WYNIK_NIE_SPELNIA), None) or next(
        (e for e in elementy if e.wynik != WYNIK_SPELNIA), None
    )
    if not elementy:
        powod = (
            "Raport doborów toru przyłączenia źródła nie zawiera żadnej kontroli — "
            "brak danych toru (napięcia falownika i szyny SN, transformator blokowy) "
            "do oceny doborów."
        )
        return _niesprawdzona(
            KRYTERIUM_DOBOR_DER_SN,
            powod_kod=POWOD_BRAK_DANYCH,
            powod_pl=powod,
            liczba_ostrzezen=liczba_uwag,
            wiodacy_element_id=zrodlo_ref,
        )
    liczba_fail = sum(1 for e in elementy if e.wynik == WYNIK_NIE_SPELNIA)
    liczba_bez_podstaw = sum(1 for e in elementy if e.wynik == WYNIK_BRAK_PODSTAW)
    return _pozycja_z_elementow(
        definicja,
        elementy,
        liczba_ocenionych=len(elementy) - liczba_bez_podstaw,
        liczba_naruszen=liczba_fail,
        liczba_niesprawdzonych=liczba_bez_podstaw,
        liczba_ostrzezen=liczba_uwag,
        wiodacy_element_id=zrodlo_ref,
        wiodacy_opis_pl=wiodacy.uzasadnienie_pl if wiodacy else None,
    )


def _nazwa_kontroli_der(pozycja: Mapping[str, Any]) -> str:
    """Nazwa kontroli doborowej po polsku (identyfikator kontroli → nazwa)."""
    check_id = str(pozycja.get("check_id") or "")
    nazwy = {
        "napiecie_falownika": "napięcie falownika a strona nN transformatora blokowego",
        "napiecie_sn": "strona SN transformatora blokowego a szyna SN",
        "moc_transformatora": "moc transformatora blokowego a suma mocy falowników",
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
    if check_id.endswith("kaskada_prad_tr_brak"):
        return "kaskada prądowa toru — ogniwo transformatora blokowego"
    if check_id.endswith("kaskada_prad_kabel_brak"):
        return "kaskada prądowa toru — ogniwo kabla SN"
    if check_id.endswith("kaskada_prad_pole_brak"):
        return "kaskada prądowa toru — ogniwo pola SN"
    if "kaskada" in check_id:
        return "kaskada prądowa toru — transformator blokowy i kabel SN"
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
    """Zbuduj widok dostawcy, zamieniajac jego odmowe danych na powod braku oceny.

    Awaria JEDNEGO dostawcy nie moze wywalic calego werdyktu — inaczej brak jednej
    danej ukrylby wszystkie pozostale kryteria, czyli agregat bylby krucha wyspa.
    ``OdmowaDanychError`` to kanoniczny sposob, w jaki widoki analiz zglaszaja brak
    podstawy do oceny (zly rodzaj biegu, brak wiersza wyniku). Zwykly ``ValueError``
    to blad programu i nie staje sie powodem braku oceny (karta ODMOWA-DANYCH-422).
    """
    try:
        return budowniczy(bieg), None
    except OdmowaDanychError as blad:
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
        case_id=case_id, model_hash=model_hash, pozycje=tuple(pozycje), zrodla=tuple(zrodla)
    )


def _najnowszy_bieg(biegi: Sequence[CanonicalRun], rodzaj: str) -> CanonicalRun | None:
    """Najnowszy bieg danego rodzaju.

    Preferuje bieg ZAKONCZONY; gdy nie ma zadnego zakonczonego, zwraca najnowszy
    o innym statusie, zeby werdykt mogl podac PRAWDZIWY powod (bieg nieudany albo
    w toku) zamiast ogolnego „brak biegu".
    """
    kandydaci = [bieg for bieg in biegi if bieg.analysis_type == rodzaj]
    if rodzaj == ZRODLO_SC:
        # Karta OD-14: werdykt projektowy ocenia dobór i wytrzymałość prądem zwarcia
        # METALICZNEGO — bieg przez impedancję przejścia Z_f (poza zakresem IEC 60909) nie jest
        # kandydatem „najnowszego biegu zwarciowego" (ten sam predykat co proweniencja).
        kandydaci = [bieg for bieg in kandydaci if bieg_w_zakresie_iec60909(bieg)]
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
