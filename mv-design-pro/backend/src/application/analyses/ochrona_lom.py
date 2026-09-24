"""Serwis aplikacyjny: weryfikacja ochrony przed pracą wyspową (LoM, P46, D10).

Warstwa APPLICATION (interpretacja normatywna, NIE fizyka). Odpowiada na pytanie
„czy pola przyłączeniowe modułów wytwórczych mają poprawnie dobraną ochronę od
utraty sieci (Loss of Mains)": obecność funkcji (ROCOF 81R, przesunięcie wektora
78, kryteria częstotliwościowe 81U/81O), zgodność nastaw z oknami normatywnymi
oraz koordynację czasową z automatyką SPZ jednostek nadrzędnych.

ZASADY WIĄŻĄCE (CLAUDE.md):
- NOT-A-SOLVER: ocena LoM to WYŁĄCZNIE deterministyczne porównania (wartość vs
  okno, czas LoM vs przerwa SPZ) — ZERO symulacji fizyki wyspy, ZERO wołania
  solverów.
- No-Heuristics: okna normatywne to udokumentowane stałe modułu z cytowanym
  źródłem (patrz ``NORMATIVE_SOURCES``). Jeżeli dla danego parametru NIE ma
  citowalnego źródła (np. przesunięcie wektora) — okno pozostaje ``None`` i
  emitujemy uczciwy INFO „brak okna normatywnego w katalogu — podaj wymaganie
  OSD"; ZERO zmyślonych liczb.
- WHITE BOX: każde porównanie eksponuje wartość, okno, źródło i klasę porównania
  (``whitebox.comparisons`` + pola ``checks`` per pole).
- Werdykt wyjaśnialny: KAŻDE porównanie niesie rekord ``OcenaKryterium``, pole —
  rekord ``WynikWymagania`` (agregacja §2.3), całość — rekord wymagania sieci
  (kontrakt ``werdykt``). Etykieta, zdanie i „czego brakuje" pochodzą WYŁĄCZNIE
  z rekordu — moduł nie ma słownika „status → etykieta". Podstawy okien mają stan
  źródła ``NIEUSTALONE`` (wydanie i jednostka redakcyjna nieustalone w rejestrze
  podstaw), więc porównanie w oknie nie wydaje „spełnia" bez ustalonej podstawy.
- Determinizm: stała kolejność pól (sort po ``ref_id``) i porównań, hash wejścia
  SHA-256 (``input_hash``).

ŹRÓDŁO SPZ (uczciwość danych): czasy przerwy SPZ (``SpzState.fast_time_s`` /
``slow_time_s``) są atrybutem ``BayProtectionControlUnit`` budowanego w
read-modelu — NIE są materializowane w dokumencie ENM (``_build_protection_config``
ustawia ``spz=None``). Dlatego w obecnym modelu SpzState jest nieosiągalny z ENM
i koordynacja z SPZ kończy się uczciwym INFO (rekord: ocena niewykonana z brakiem
przerwy SPZ). Deterministyczna logika porównania (``_spz_verdict``) jest wydzielona
i w pełni audytowalna.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from enm.models import Bay, EnergyNetworkModel, ProtectionAssignment, ProtectionSetting
from werdykt import (
    ClaimKind,
    EvidenceTier,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
    ocen_kryterium,
    zagreguj_wymaganie,
)

# ---------------------------------------------------------------------------
# Katalog funkcji LoM (function_type -> ANSI + etykieta PL)
# ---------------------------------------------------------------------------

LOM_FUNCTION_TYPES: dict[str, dict[str, str]] = {
    "rocof_81R": {"ansi": "81R", "label_pl": "Szybkość zmian częstotliwości (df/dt)"},
    "vector_shift_78": {"ansi": "78", "label_pl": "Przesunięcie wektora napięcia"},
    "underfrequency_81U": {"ansi": "81U", "label_pl": "Podczęstotliwościowa (f<)"},
    "overfrequency_81O": {"ansi": "81O", "label_pl": "Nadczęstotliwościowa (f>)"},
}

# Kody ANSI rozpoznawane w ``Bay.protection_codes`` jako deklaracja funkcji LoM.
LOM_ANSI_CODES: dict[str, str] = {
    "81R": "rocof_81R",
    "78": "vector_shift_78",
    "81U": "underfrequency_81U",
    "81O": "overfrequency_81O",
}

# ---------------------------------------------------------------------------
# Okna normatywne — stałe z cytowanym źródłem (NC RfG / PTPiREE)
# ---------------------------------------------------------------------------
# ROCOF (81R): zdolność pracy przy zmianach częstotliwości (ROCOF withstand).
# Nastawa df/dt PONIŻEJ tej wartości grozi zbędnym wyłączeniem na ogólnosystemowe
# zdarzenia częstotliwościowe (fałszywe wykrycie wyspy).
ROCOF_MIN_DF_DT_HZ_S: float = 2.0
# Częstotliwościowe pasmo pozostawania w pracy (Europa kontynentalna): 47,5–51,5 Hz.
# Nastawa 81U POWYŻEJ dolnej krawędzi / 81O PONIŻEJ górnej krawędzi wchodzi w
# obowiązkowe pasmo ride-through → ryzyko zbędnych wyłączeń.
FREQ_UNDER_MAX_HZ: float = 47.5
FREQ_OVER_MIN_HZ: float = 51.5

NORMATIVE_SOURCES: dict[str, dict[str, Any]] = {
    "rocof_81R": {
        "window_pl": f"df/dt ≥ {ROCOF_MIN_DF_DT_HZ_S} Hz/s",
        "lower_hz_s": ROCOF_MIN_DF_DT_HZ_S,
        "upper_hz_s": None,
        "source_pl": (
            "Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. b "
            "(zdolność pracy przy zmianach częstotliwości — ROCOF withstand); "
            "wartość krajowa PTPiREE 2 Hz/s"
        ),
    },
    "underfrequency_81U": {
        "window_pl": f"próg f ≤ {FREQ_UNDER_MAX_HZ} Hz",
        "upper_hz": FREQ_UNDER_MAX_HZ,
        "lower_hz": None,
        "source_pl": (
            "Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. a "
            "(pasmo częstotliwości pracy Europy kontynentalnej 47,5–51,5 Hz)"
        ),
    },
    "overfrequency_81O": {
        "window_pl": f"próg f ≥ {FREQ_OVER_MIN_HZ} Hz",
        "lower_hz": FREQ_OVER_MIN_HZ,
        "upper_hz": None,
        "source_pl": (
            "Rozporządzenie Komisji (UE) 2016/631 (NC RfG), Art. 13 ust. 1 lit. a "
            "(pasmo częstotliwości pracy Europy kontynentalnej 47,5–51,5 Hz)"
        ),
    },
    "vector_shift_78": {
        # Brak citowalnej stałej normatywnej dla progu przesunięcia wektora —
        # okno pozostaje None (uczciwy INFO, ZERO zmyślonych liczb).
        "window_pl": None,
        "source_pl": None,
    },
}

# Kolejność (determinizm) prezentacji funkcji.
_FUNCTION_ORDER: tuple[str, ...] = (
    "rocof_81R",
    "vector_shift_78",
    "underfrequency_81U",
    "overfrequency_81O",
)

# ---------------------------------------------------------------------------
# Rekordy werdyktu wyjaśnialnego — podstawy, kryteria okien, stałe rekordu
# ---------------------------------------------------------------------------

_POWOD_STOSOWALNOSCI_POLA = (
    "pole jest polem przyłączeniowym modułu wytwórczego albo polem o roli OZE z przypisaniem "
    "zabezpieczeń"
)
_STOSOWALNOSC_POLA = Stosowalnosc(dotyczy=True, powod_pl=_POWOD_STOSOWALNOSCI_POLA)
_POWOD_BRAKU_NIEPEWNOSCI = (
    "ocena normatywna porównuje nastawy zadeklarowane — niepewność numeryczna nie dotyczy"
)
_NIEPEWNOSC_DEKLARACJI = Niepewnosc(nie_dotyczy=True, powod_pl=_POWOD_BRAKU_NIEPEWNOSCI)
_ZAKRES_OCENY_LOM = ZakresWaznosci(
    opis_pl=(
        "Porównanie nastaw zabezpieczeń pola z oknami normatywnymi i z przerwą SPZ — nie "
        "wykazuje zachowania funkcji LoM przy utracie sieci"
    ),
    wykluczenia=(
        "zachowanie dynamiczne funkcji LoM przy utracie sieci (wymaga badania albo symulacji)",
    ),
)
#: Podstawa WYMAGANIA ochrony od pracy wyspowej (obecność funkcji, koordynacja z SPZ).
_PODSTAWA_WYMAGANIA_LOM = PodstawaWymagania(
    rodzaj="OSD",
    dokument=(
        "Wymagania operatora systemu dystrybucyjnego dla ochrony od pracy wyspowej modułów "
        "wytwórczych (IRiESD)"
    ),
    status="NIEUSTALONE",
    uwagi_pl=(
        "dokument operatora z wydaniem i jednostką redakcyjną nieustalony w rejestrze podstaw"
    ),
)
#: Podstawa limitu koordynacji: przerwa SPZ jest nastawą automatyki operatora.
_PODSTAWA_PRZERWY_SPZ = PodstawaWymagania(
    rodzaj="OSD",
    dokument="Przerwa beznapięciowa SPZ jednostek nadrzędnych (nastawy automatyki operatora)",
    status="NIEUSTALONE",
    uwagi_pl="dokument operatora z wartością przerwy SPZ nieustalony w rejestrze podstaw",
)


@dataclass(frozen=True)
class _KryteriumOkna:
    """Kryterium porównania nastawy funkcji LoM z oknem normatywnym (rekord K)."""

    opis_pl: str
    warunek_latex: str
    relacja: Relacja
    granica: float | None
    jednostka: str
    symbol_latex: str
    wielkosc_pl: str
    podstawa: PodstawaWymagania


_PODSTAWA_PASMA_CZESTOTLIWOSCI = PodstawaWymagania(
    rodzaj="ROZPORZADZENIE_UE",
    dokument=(
        "Rozporządzenie Komisji (UE) 2016/631 (NC RfG) — pasmo częstotliwości pracy Europy "
        "kontynentalnej 47,5–51,5 Hz"
    ),
    jednostka_redakcyjna="art. 13 ust. 1 lit. a",
    status="NIEUSTALONE",
    uwagi_pl=(
        "wydanie nieustalone w rejestrze podstaw; krawędź okna progu 81U/81O wyprowadzona "
        "z pasma pozostawania w pracy"
    ),
)

#: Kryterium okna KAŻDEJ funkcji LoM (ta sama lista co `_FUNCTION_ORDER`, test przypina).
_KRYTERIA_OKIEN: dict[str, _KryteriumOkna] = {
    "rocof_81R": _KryteriumOkna(
        opis_pl=(
            "Nastawa df/dt funkcji 81R nie niższa niż dolna krawędź okna normatywnego — "
            "funkcja nie może wyłączać modułu przy ogólnosystemowych zmianach częstotliwości"
        ),
        warunek_latex=(
            r"\left(\frac{df}{dt}\right)_{\mathrm{nast}} \ge "
            r"\left(\frac{df}{dt}\right)_{\mathrm{okno}}"
        ),
        relacja="NIE_MNIEJ",
        granica=ROCOF_MIN_DF_DT_HZ_S,
        jednostka="Hz/s",
        symbol_latex=r"\left(\frac{df}{dt}\right)_{\mathrm{nast}}",
        wielkosc_pl="nastawa df/dt funkcji 81R",
        podstawa=PodstawaWymagania(
            rodzaj="PROCEDURA_PTPIREE",
            dokument=(
                "Wartość krajowa PTPiREE wytrzymałości na zmiany częstotliwości (odwołanie: "
                "rozporządzenie Komisji (UE) 2016/631, art. 13 ust. 1 lit. b)"
            ),
            status="NIEUSTALONE",
            uwagi_pl="wartość 2 Hz/s bez dokumentu źródłowego z wydaniem i jednostką redakcyjną",
        ),
    ),
    "vector_shift_78": _KryteriumOkna(
        opis_pl=(
            "Nastawa przesunięcia wektora funkcji 78 nie niższa niż próg wymagany przez "
            "operatora"
        ),
        warunek_latex=r"\Delta\theta_{\mathrm{nast}} \ge \Delta\theta_{\mathrm{wymag}}",
        relacja="NIE_MNIEJ",
        granica=None,
        jednostka="°",
        symbol_latex=r"\Delta\theta_{\mathrm{nast}}",
        wielkosc_pl="nastawa przesunięcia wektora funkcji 78",
        podstawa=PodstawaWymagania(
            rodzaj="OSD",
            dokument="Wymaganie operatora dla progu przesunięcia wektora napięcia (funkcja 78)",
            status="NIEUSTALONE",
            uwagi_pl="brak cytowalnej stałej normatywnej — próg podaje operator",
        ),
    ),
    "underfrequency_81U": _KryteriumOkna(
        opis_pl=(
            "Próg funkcji 81U nie wyższy niż dolna krawędź pasma pozostawania w pracy — "
            "funkcja nie może wyłączać modułu wewnątrz pasma"
        ),
        warunek_latex=r"f_{\mathrm{81U}} \le f_{\mathrm{okno}}",
        relacja="NIE_WIECEJ",
        granica=FREQ_UNDER_MAX_HZ,
        jednostka="Hz",
        symbol_latex=r"f_{\mathrm{81U}}",
        wielkosc_pl="próg funkcji 81U",
        podstawa=_PODSTAWA_PASMA_CZESTOTLIWOSCI,
    ),
    "overfrequency_81O": _KryteriumOkna(
        opis_pl=(
            "Próg funkcji 81O nie niższy niż górna krawędź pasma pozostawania w pracy — "
            "funkcja nie może wyłączać modułu wewnątrz pasma"
        ),
        warunek_latex=r"f_{\mathrm{81O}} \ge f_{\mathrm{okno}}",
        relacja="NIE_MNIEJ",
        granica=FREQ_OVER_MIN_HZ,
        jednostka="Hz",
        symbol_latex=r"f_{\mathrm{81O}}",
        wielkosc_pl="próg funkcji 81O",
        podstawa=_PODSTAWA_PASMA_CZESTOTLIWOSCI,
    ),
}


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 6)


# ---------------------------------------------------------------------------
# Deterministyczne porównania nastaw (czyste funkcje — WHITE BOX, w pełni testowalne).
# Klasa porównania (`severity`) i jego opis są materiałem śladu; ocenę niesie rekord.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Verdict:
    severity: str
    message_pl: str


def _rocof_verdict(df_dt_hz_s: float | None) -> Verdict:
    """Werdykt okna normatywnego ROCOF (81R)."""
    if df_dt_hz_s is None:
        return Verdict("INFO", "Brak nastawy df/dt — podaj wartość progu ROCOF (81R).")
    if df_dt_hz_s < ROCOF_MIN_DF_DT_HZ_S:
        return Verdict(
            "WARN",
            f"Nastawa df/dt ({df_dt_hz_s} Hz/s) poniżej dolnego okna "
            f"({ROCOF_MIN_DF_DT_HZ_S} Hz/s) — ryzyko zbędnych wyłączeń "
            "(fałszywe wykrycie wyspy).",
        )
    return Verdict(
        "OK",
        f"Nastawa df/dt ({df_dt_hz_s} Hz/s) w oknie normatywnym "
        f"(≥ {ROCOF_MIN_DF_DT_HZ_S} Hz/s).",
    )


def _underfrequency_verdict(threshold_hz: float | None) -> Verdict:
    """Werdykt okna normatywnego 81U (podczęstotliwościowe)."""
    if threshold_hz is None:
        return Verdict("INFO", "Brak nastawy progu — podaj próg 81U (f<).")
    if threshold_hz > FREQ_UNDER_MAX_HZ:
        return Verdict(
            "WARN",
            f"Próg 81U ({threshold_hz} Hz) powyżej górnej krawędzi okna "
            f"({FREQ_UNDER_MAX_HZ} Hz) — wchodzi w pasmo pozostawania w pracy, "
            "ryzyko zbędnych wyłączeń.",
        )
    return Verdict(
        "OK",
        f"Próg 81U ({threshold_hz} Hz) w oknie normatywnym (≤ {FREQ_UNDER_MAX_HZ} Hz).",
    )


def _overfrequency_verdict(threshold_hz: float | None) -> Verdict:
    """Werdykt okna normatywnego 81O (nadczęstotliwościowe)."""
    if threshold_hz is None:
        return Verdict("INFO", "Brak nastawy progu — podaj próg 81O (f>).")
    if threshold_hz < FREQ_OVER_MIN_HZ:
        return Verdict(
            "WARN",
            f"Próg 81O ({threshold_hz} Hz) poniżej dolnej krawędzi okna "
            f"({FREQ_OVER_MIN_HZ} Hz) — wchodzi w pasmo pozostawania w pracy, "
            "ryzyko zbędnych wyłączeń.",
        )
    return Verdict(
        "OK",
        f"Próg 81O ({threshold_hz} Hz) w oknie normatywnym (≥ {FREQ_OVER_MIN_HZ} Hz).",
    )


def _vector_shift_verdict(threshold_deg: float | None) -> Verdict:
    """Werdykt funkcji 78 — brak citowalnego okna normatywnego (uczciwy INFO)."""
    if threshold_deg is None:
        return Verdict("INFO", "Brak nastawy przesunięcia wektora — podaj wymaganie OSD.")
    return Verdict(
        "INFO",
        f"Nastawa przesunięcia wektora ({threshold_deg}°) — brak okna normatywnego "
        "w katalogu, podaj wymaganie OSD.",
    )


def _spz_verdict(
    lom_time_s: float | None,
    spz_fast_time_s: float | None,
    spz_slow_time_s: float | None,
) -> Verdict:
    """Deterministyczny werdykt koordynacji czasu LoM z przerwą SPZ.

    Miarodajna przerwa SPZ to najkrótszy z dostępnych czasów (szybkie SPZ jest
    najbardziej wymagające). LoM musi zadziałać PRZED ponownym załączeniem.
    """
    if lom_time_s is None:
        return Verdict(
            "INFO", "Brak danych o czasie zadziałania LoM — porównanie z SPZ niemożliwe."
        )
    candidates = [t for t in (spz_fast_time_s, spz_slow_time_s) if t is not None]
    if not candidates:
        return Verdict(
            "INFO",
            "Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny w ENM) "
            "— porównanie niemożliwe.",
        )
    spz_interval = min(candidates)
    if lom_time_s < spz_interval:
        return Verdict(
            "OK",
            f"Czas LoM ({lom_time_s} s) krótszy od przerwy SPZ ({spz_interval} s) "
            "— wyłączenie przed ponownym załączeniem SPZ.",
        )
    return Verdict(
        "ERROR",
        f"Czas LoM ({lom_time_s} s) nie krótszy od przerwy SPZ ({spz_interval} s) "
        "— ryzyko załączenia na wyspę (LoM wolniejszy niż przerwa SPZ).",
    )


# Odwzorowanie function_type -> (nazwa pola nastawy, jednostka, funkcja werdyktu).
_WINDOW_EVALUATORS: dict[str, Any] = {
    "rocof_81R": ("threshold_hz_s", "Hz/s", _rocof_verdict),
    "vector_shift_78": ("threshold_deg", "deg", _vector_shift_verdict),
    "underfrequency_81U": ("threshold_hz", "Hz", _underfrequency_verdict),
    "overfrequency_81O": ("threshold_hz", "Hz", _overfrequency_verdict),
}


# ---------------------------------------------------------------------------
# Wywod dyplomowy per porownanie (zasada wywodow KaTeX 2026-07-22)
# ---------------------------------------------------------------------------


def _krok(tekst: str, latex: str | None = None) -> dict[str, Any]:
    """Krok wywodu WHITE BOX: tekst (ASCII-PL, deterministyczny) + opcjonalny LaTeX.

    Kontrakt kanoniczny ``{tekst, latex}`` — wzorzec 1:1 z
    ``analysis.energy_validation.builder._krok``.
    """
    return {"tekst": tekst, "latex": latex}


# Parametry wywodu okna normatywnego per function_type:
# (symbol LaTeX nastawy, jednostka LaTeX, znak warunku, wartosc okna, opis okna ASCII).
_WYWOD_OKNA: dict[str, tuple[str, str, str, float, str]] = {
    "rocof_81R": (
        r"\left(\tfrac{df}{dt}\right)_{nast}",
        r"\tfrac{\text{Hz}}{\text{s}}",
        r"\ge",
        ROCOF_MIN_DF_DT_HZ_S,
        "dolna krawedz okna (NC RfG Art. 13(1)(b), PTPiREE 2 Hz/s)",
    ),
    "underfrequency_81U": (
        r"f_{81U}",
        r"\text{Hz}",
        r"\le",
        FREQ_UNDER_MAX_HZ,
        "gorna krawedz okna (NC RfG Art. 13(1)(a), pasmo 47,5-51,5 Hz)",
    ),
    "overfrequency_81O": (
        r"f_{81O}",
        r"\text{Hz}",
        r"\ge",
        FREQ_OVER_MIN_HZ,
        "dolna krawedz okna (NC RfG Art. 13(1)(a), pasmo 47,5-51,5 Hz)",
    ),
}

_ZNAK_PRZECIWNY: dict[str, str] = {r"\ge": "<", r"\le": ">"}


def _wywod_okna(function_type: str, value: float | None, verdict: Verdict) -> list[dict[str, Any]]:
    """Wywod dyplomowy okna normatywnego: warunek (LaTeX) -> dane -> podstawienie
    z realnej nastawy (LaTeX) -> wynik porownania (ocena: rekord). Czysty formatter — ZERO nowych liczb:
    nastawa i krawedz okna sa juz czescia porownania. Pusta lista, gdy realne
    porownanie nie zaszlo (brak nastawy lub brak okna) — uczciwy brak wywodu."""
    params = _WYWOD_OKNA.get(function_type)
    if params is None or value is None:
        return []
    symbol, jednostka, znak, okno, opis_okna = params
    spelnione = verdict.severity == "OK"
    znak_podstawienia = znak if spelnione else _ZNAK_PRZECIWNY[znak]
    dolna_krawedz = znak == r"\ge"
    kierunek = "nastawa nie nizsza niz" if dolna_krawedz else "nastawa nie wyzsza niz"
    znak_ascii = ">=" if dolna_krawedz else "<="
    wynik_ascii = "SPELNIONE" if spelnione else "NIESPELNIONE"
    meta = LOM_FUNCTION_TYPES[function_type]
    return [
        _krok(
            f"Wzor: warunek okna normatywnego funkcji {meta['ansi']} " f"({kierunek} krawedz okna)",
            rf"{symbol} {znak} {okno:.1f}\ {jednostka}",
        ),
        _krok(
            f"Dane: nastawa = {value:.4f} (przekaznik pola), "
            f"krawedz okna = {okno:.1f} — {opis_okna}."
        ),
        _krok(
            f"Podstawienie: {value:.4f} {znak_ascii} {okno:.1f} {wynik_ascii}",
            rf"{value:.4f} {znak_podstawienia} {okno:.1f}\ {jednostka}",
        ),
        _krok(
            f"Wynik porownania: {'w oknie' if spelnione else 'poza oknem'} — "
            f"{verdict.message_pl}"
        ),
    ]


def _wywod_spz(
    lom_time_s: float | None,
    spz_fast_time_s: float | None,
    spz_slow_time_s: float | None,
    verdict: Verdict,
) -> list[dict[str, Any]]:
    """Wywod dyplomowy koordynacji LoM-SPZ: warunek -> dane -> podstawienie ->
    wynik porownania (ocena: rekord). Pusta lista, gdy porownanie nie zaszlo (brak czasu LoM lub SPZ).
    """
    candidates = [t for t in (spz_fast_time_s, spz_slow_time_s) if t is not None]
    if lom_time_s is None or not candidates:
        return []
    spz_interval = min(candidates)
    spelnione = verdict.severity == "OK"
    znak_ascii = "<" if spelnione else ">="
    znak_latex = "<" if spelnione else r"\ge"
    wynik_ascii = "SPELNIONE" if spelnione else "NIESPELNIONE"
    return [
        _krok(
            "Wzor: warunek koordynacji czasowej — LoM wylacza przed ponownym " "zalaczeniem SPZ",
            r"t_{LoM} < t_{SPZ}",
        ),
        _krok(
            f"Dane: czas LoM = {lom_time_s:.4f} s (najkrotsza zwloka funkcji LoM), "
            f"przerwa SPZ = {spz_interval:.4f} s (najkrotszy dostepny czas SPZ)."
        ),
        _krok(
            f"Podstawienie: {lom_time_s:.4f} {znak_ascii} {spz_interval:.4f} s {wynik_ascii}",
            rf"{lom_time_s:.4f} {znak_latex} {spz_interval:.4f}\ \text{{s}}",
        ),
        _krok(
            f"Wynik porownania: {'LoM przed SPZ' if spelnione else 'LoM nie przed SPZ'} — "
            f"{verdict.message_pl}"
        ),
    ]


# ---------------------------------------------------------------------------
# Pomocnicze — identyfikacja modułów wytwórczych i funkcji LoM
# ---------------------------------------------------------------------------


def _generating_module_buses(enm: EnergyNetworkModel) -> dict[str, list[str]]:
    """Mapa bus_ref -> lista ref_id modułów wytwórczych (generatorów) na szynie."""
    by_bus: dict[str, list[str]] = {}
    for gen in enm.generators:
        by_bus.setdefault(gen.bus_ref, []).append(gen.ref_id)
    for refs in by_bus.values():
        refs.sort()
    return by_bus


def _is_generating_field(bay: Bay, gen_buses: dict[str, list[str]]) -> bool:
    return bay.bus_ref in gen_buses or bay.bay_role == "OZE"


#: Klucze metadanych stacji, pod którymi ŻYJĄ POLA w kanonicznej postaci modelu
#: (`substations[].meta`) — te same, które czyta warstwa operacji domenowych
#: (`enm/domain_operations_v2.py::_field_ref_exists` / `_field_record`).
_KLUCZE_SPECYFIKACJI_POL: tuple[str, ...] = ("field_specs", "nn_field_specs")

#: Role pola dopuszczone kontraktem `Bay.bay_role`. Specyfikacja z rolą spoza
#: tej listy NIE jest po cichu przepisywana na rolę zastępczą — patrz
#: `_pole_ze_specyfikacji` (brak roli = brak pola, z jawnym pominięciem).
_ROLE_POLA: frozenset[str] = frozenset(
    {"IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"}
)


def _pole_ze_specyfikacji(spec: dict[str, Any], substation_ref: str) -> Bay | None:
    """Pole przyłączeniowe z kanonicznej specyfikacji stacji (`meta.field_specs`).

    Zwraca `None`, gdy specyfikacja nie niesie kompletu tożsamości pola
    (referencja, szyna, rola z kontraktu) — ocena LoM woli POMINĄĆ pole, którego
    nie umie zidentyfikować, niż zgadywać jego rolę albo szynę.
    """
    field_ref = spec.get("field_ref")
    bus_ref = spec.get("bus_ref")
    bay_role = spec.get("bay_role")
    if not isinstance(field_ref, str) or not isinstance(bus_ref, str):
        return None
    if not isinstance(bay_role, str) or bay_role not in _ROLE_POLA:
        return None
    meta = spec.get("meta")
    return Bay(
        ref_id=field_ref,
        name=str(spec.get("name") or field_ref),
        bay_role=bay_role,
        substation_ref=substation_ref,
        bus_ref=bus_ref,
        gpz_section_id=spec.get("gpz_section_id"),
        equipment_refs=[str(ref) for ref in (spec.get("equipment_refs") or [])],
        protection_ref=spec.get("protection_ref"),
        protection_codes=[str(kod) for kod in (spec.get("protection_codes") or [])],
        tags=[str(tag) for tag in (spec.get("tags") or [])],
        meta=dict(meta) if isinstance(meta, dict) else {},
    )


def _pola_przylaczeniowe(enm: EnergyNetworkModel) -> list[Bay]:
    """WSZYSTKIE pola przyłączeniowe modelu — z OBU reprezentacji pola.

    DLACZEGO (karta HARNESS-RESZTA-2, 2026-09-17; defekt zmierzony wprost).
    Ocena LoM czytała WYŁĄCZNIE `enm.bays`, a operacje domenowe, którymi
    projektant buduje sieć (`insert_station_on_segment_sn`,
    `append_station_on_endpoint` w części torów, `add_converter_source`), zapisują
    pola w kanonicznej postaci `substations[].meta.field_specs` /
    `nn_field_specs` — `bays` zostaje PUSTE. Skutek: na każdym modelu zbudowanym
    dzisiejszymi operacjami ekran „Ochrona przed pracą wyspową" meldował
    „moduły bez pola przyłączeniowego" i NIE oceniał niczego, choć pola w modelu
    są (pomiar: model sceny harnessu — 2 moduły wytwórcze, 0 ocenionych pól).
    Warstwa operacji czyta obie postacie od dawna (`_field_ref_exists`,
    `_field_record`) — ta funkcja zrównuje z nią warstwę analizy.

    Pierwszeństwo ma `enm.bays` (postać jawna): pole o tej samej referencji nie
    jest dokładane dwa razy.
    """
    pola: list[Bay] = list(enm.bays)
    znane: set[str] = {bay.ref_id for bay in pola}
    for stacja in enm.substations:
        meta = stacja.meta if isinstance(stacja.meta, dict) else {}
        for klucz in _KLUCZE_SPECYFIKACJI_POL:
            for spec in meta.get(klucz) or []:
                if not isinstance(spec, dict):
                    continue
                pole = _pole_ze_specyfikacji(spec, stacja.ref_id)
                if pole is None or pole.ref_id in znane:
                    continue
                znane.add(pole.ref_id)
                pola.append(pole)
    return pola


def _lom_settings_by_type(
    assignment: ProtectionAssignment | None,
) -> dict[str, ProtectionSetting]:
    """Nastawy LoM z ``ProtectionAssignment.settings`` — po function_type.

    Przy wielu nastawach tego samego typu bierzemy pierwszą deterministycznie
    (kolejność listy settings).
    """
    result: dict[str, ProtectionSetting] = {}
    if assignment is None:
        return result
    for setting in assignment.settings:
        if setting.function_type in LOM_FUNCTION_TYPES and setting.function_type not in result:
            result[setting.function_type] = setting
    return result


def _declared_lom_codes(bay: Bay) -> set[str]:
    """function_type funkcji LoM zadeklarowanych w ``Bay.protection_codes`` (po ANSI)."""
    declared: set[str] = set()
    for code in bay.protection_codes:
        function_type = LOM_ANSI_CODES.get(str(code).strip().upper())
        if function_type is not None:
            declared.add(function_type)
    return declared


def _setting_value(setting: ProtectionSetting, field: str) -> float | None:
    return _round6(getattr(setting, field, None))


# ---------------------------------------------------------------------------
# Ocena pojedynczego pola
# ---------------------------------------------------------------------------


def _evaluate_field(
    bay: Bay,
    assignment: ProtectionAssignment | None,
    gen_refs: list[str],
) -> tuple[dict[str, Any], list[OcenaKryterium]]:
    """Pole z porównaniami i rekordami; drugi element — rekordy K składowych oceny sieci."""
    checks: list[dict[str, Any]] = []
    oceny: list[OcenaKryterium] = []
    settings = _lom_settings_by_type(assignment)
    declared = _declared_lom_codes(bay)
    present_types = set(settings) | declared
    odniesienie = _odniesienie_nastaw(bay, assignment)

    if not present_types:
        oceny.append(_ocena_obecnosci(bay, odniesienie))
        checks.append(
            {
                "kind": "obecnosc",
                "function_ansi": None,
                "function_label_pl": None,
                "severity": "ERROR",
                "message_pl": (
                    "Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy "
                    "wyspowej (LoM: 81R / 78 / 81U / 81O)."
                ),
                "value": None,
                "unit": None,
                "window": None,
                "source_pl": None,
                "wywod": [],
            }
        )
    else:
        for function_type in _FUNCTION_ORDER:
            if function_type not in present_types:
                continue
            meta = LOM_FUNCTION_TYPES[function_type]
            ansi = meta["ansi"]
            label = meta["label_pl"]
            setting = settings.get(function_type)
            source = NORMATIVE_SOURCES[function_type]
            window_pl = source.get("window_pl")

            if setting is None:
                # Zadeklarowana w protection_codes, ale bez nastaw.
                oceny.append(_ocena_okna(bay, function_type, None, odniesienie))
                checks.append(
                    {
                        "kind": "obecnosc",
                        "function_ansi": ansi,
                        "function_label_pl": label,
                        "severity": "INFO",
                        "message_pl": (
                            f"Funkcja {ansi} zadeklarowana w kodach pola bez nastaw "
                            "— uzupełnij nastawy."
                        ),
                        "value": None,
                        "unit": None,
                        "window": window_pl,
                        "source_pl": source.get("source_pl"),
                        "wywod": [],
                    }
                )
                continue

            field_name, unit, evaluator = _WINDOW_EVALUATORS[function_type]
            value = _setting_value(setting, field_name)
            verdict = evaluator(value)
            oceny.append(_ocena_okna(bay, function_type, value, odniesienie))
            checks.append(
                {
                    "kind": "okno_normatywne",
                    "function_ansi": ansi,
                    "function_label_pl": label,
                    "severity": verdict.severity,
                    "message_pl": verdict.message_pl,
                    "value": value,
                    "unit": unit,
                    "window": window_pl,
                    "source_pl": source.get("source_pl"),
                    # Addytywny wywod dyplomowy {tekst, latex} (zasada KaTeX 2026-07-22);
                    # pusta lista = uczciwy brak (porownanie nie zaszlo).
                    "wywod": _wywod_okna(function_type, value, verdict),
                }
            )

        # Koordynacja z SPZ — miarodajny czas LoM = najkrótsza zwłoka funkcji LoM.
        lom_time = _lom_time(settings)
        spz_fast, spz_slow = _spz_intervals()
        spz = _spz_verdict(lom_time, spz_fast, spz_slow)
        oceny.append(_ocena_koordynacji_spz(bay, lom_time, spz_fast, spz_slow, odniesienie))
        checks.append(
            {
                "kind": "koordynacja_spz",
                "function_ansi": None,
                "function_label_pl": "Koordynacja czasowa z SPZ",
                "severity": spz.severity,
                "message_pl": spz.message_pl,
                "value": lom_time,
                "unit": "s",
                "window": {
                    "spz_fast_time_s": spz_fast,
                    "spz_slow_time_s": spz_slow,
                },
                "source_pl": (
                    "SpzState.fast_time_s / slow_time_s jednostek nadrzędnych "
                    "(BayProtectionControlUnit)"
                ),
                # Addytywny wywod dyplomowy — pusta lista, gdy porownanie z SPZ
                # nie zaszlo (uczciwy brak, ZERO fabrykacji).
                "wywod": _wywod_spz(lom_time, spz_fast, spz_slow, spz),
            }
        )

    for check, ocena in zip(checks, oceny, strict=True):
        check["ocena"] = rekord_json(ocena)
    return _pole_widoku(bay, gen_refs, checks, oceny)


def _pole_widoku(
    bay: Bay,
    gen_refs: list[str],
    checks: list[dict[str, Any]],
    oceny: list[OcenaKryterium],
) -> tuple[dict[str, Any], list[OcenaKryterium]]:
    """Pole widoku z rekordem pola; status pola = status maszynowy rekordu (jedno źródło).

    Drugi element: rekordy K, które pole wnosi do oceny sieci — rekordy porównań albo, gdy
    pole nie ma żadnego porównania, jego rekord oceny niewykonanej.
    """
    ocena_pola = _ocena_pola(bay, oceny)
    pole = {
        "bay_ref": bay.ref_id,
        "bay_name": bay.name,
        "substation_ref": bay.substation_ref,
        "bus_ref": bay.bus_ref,
        "generating_module_refs": gen_refs,
        "status": ocena_pola.status_maszynowy,
        "ocena": rekord_json(ocena_pola),
        "checks": checks,
    }
    if isinstance(ocena_pola, OcenaKryterium):
        return pole, [ocena_pola]
    return pole, oceny


def _lom_time(settings: dict[str, ProtectionSetting]) -> float | None:
    times: list[float] = [
        float(setting.time_delay_s)
        for setting in settings.values()
        if setting.time_delay_s is not None
    ]
    return _round6(min(times)) if times else None


def _spz_intervals() -> tuple[float | None, float | None]:
    """Czasy przerwy SPZ jednostek nadrzędnych.

    SpzState nie jest materializowany w dokumencie ENM (``_build_protection_config``
    ustawia ``spz=None``), więc uczciwie zwracamy brak danych — werdykt SPZ kończy
    się INFO. Wydzielone, aby po materializacji SpzState wystarczyło wpiąć źródło.
    """
    return None, None


def _odniesienie_nastaw(bay: Bay, assignment: ProtectionAssignment | None) -> str:
    """Odniesienie dowodu deklaracji: nastawy przypisanego zabezpieczenia albo kody pola."""
    if assignment is not None:
        return f"nastawy zabezpieczenia „{assignment.name}” pola „{bay.name}”"
    return f"kody zabezpieczeń pola „{bay.name}”"


def _dowod_deklaracji(odniesienie: str) -> StatusDowodu:
    return StatusDowodu(
        metoda="DEKLARACJA",
        poziom=EvidenceTier.DECLARATION,
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
        status_modelu="NIE_DOTYCZY",
        status_danych=StatusDanych(stan="ZWALIDOWANE"),
        odniesienie=odniesienie,
    )


def _slad(bay: Bay, krok: str, opis_pl: str) -> list[OdnosnikSladu]:
    return [OdnosnikSladu(krok=f"lom:{bay.ref_id}:{krok}", opis_pl=opis_pl)]


def _ocena_obecnosci(bay: Bay, odniesienie: str) -> OcenaKryterium:
    """Rekord K: pole modułu wytwórczego BEZ żadnej funkcji LoM (wynik logiczny 0)."""
    return ocen_kryterium(
        kryterium_id=f"lom.{bay.ref_id}.obecnosc",
        przedmiot=Przedmiot(
            element_ref=bay.ref_id,
            nazwa_pl=bay.name,
            opis_pl="Pole przyłączeniowe — obecność funkcji ochrony od pracy wyspowej",
        ),
        kryterium=Kryterium(
            opis_pl=(
                "Pole modułu wytwórczego ma co najmniej jedną funkcję ochrony od pracy wyspowej "
                "(81R, 78, 81U albo 81O)"
            ),
            warunek_latex="",
            relacja="LOGICZNE",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_LOM,
        stosowalnosc=_STOSOWALNOSC_POLA,
        wynik=WynikKryterium(
            wielkosc_pl="funkcja ochrony od pracy wyspowej w polu",
            symbol_latex="",
            wartosc=Wielkosc(wartosc=0.0, jednostka="1"),
            punkt_krytyczny_pl=(
                "brak funkcji 81R, 78, 81U i 81O w kodach zabezpieczeń pola i w nastawach "
                "przypisanego zabezpieczenia"
            ),
            metoda="DEKLARACJA",
        ),
        limit=None,
        niepewnosc=_NIEPEWNOSC_DEKLARACJI,
        dowod=_dowod_deklaracji(odniesienie),
        zakres_waznosci=_ZAKRES_OCENY_LOM,
        slad=_slad(bay, "obecnosc", "obecność funkcji LoM w kodach i nastawach pola"),
        braki_dodatkowe=(
            "Funkcja ochrony od pracy wyspowej w polu (81R, 78, 81U albo 81O) z nastawami "
            "w przypisaniu zabezpieczeń.",
        ),
    )


def _ocena_okna(
    bay: Bay, function_type: str, value: float | None, odniesienie: str
) -> OcenaKryterium:
    """Rekord K porównania nastawy funkcji z oknem; brak nastawy → ocena niewykonana."""
    spec = _KRYTERIA_OKIEN[function_type]
    ansi = LOM_FUNCTION_TYPES[function_type]["ansi"]
    braki: list[str] = []
    wynik: WynikKryterium | None = None
    if value is None:
        braki.append(f"Nastawa funkcji {ansi} w przypisaniu zabezpieczeń pola.")
    else:
        wynik = WynikKryterium(
            wielkosc_pl=spec.wielkosc_pl,
            symbol_latex=spec.symbol_latex,
            wartosc=Wielkosc(wartosc=value, jednostka=spec.jednostka),
            punkt_krytyczny_pl=odniesienie,
            metoda="DEKLARACJA",
        )
    limit: LimitKryterium | None = None
    if spec.granica is None:
        braki.append(
            f"Próg funkcji {ansi} wymagany przez operatora (wartość i dokument z wydaniem)."
        )
    else:
        limit = LimitKryterium(
            wartosc=Wielkosc(wartosc=spec.granica, jednostka=spec.jednostka),
            podstawa=spec.podstawa,
        )
    return ocen_kryterium(
        kryterium_id=f"lom.{bay.ref_id}.{ansi}",
        przedmiot=Przedmiot(
            element_ref=bay.ref_id,
            nazwa_pl=bay.name,
            opis_pl=f"Pole przyłączeniowe — {LOM_FUNCTION_TYPES[function_type]['label_pl']}",
        ),
        kryterium=Kryterium(
            opis_pl=spec.opis_pl, warunek_latex=spec.warunek_latex, relacja=spec.relacja
        ),
        podstawa=spec.podstawa,
        stosowalnosc=_STOSOWALNOSC_POLA,
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_DEKLARACJI,
        dowod=_dowod_deklaracji(odniesienie),
        zakres_waznosci=_ZAKRES_OCENY_LOM,
        slad=_slad(bay, ansi, f"porównanie nastawy funkcji {ansi} z oknem normatywnym"),
        braki_dodatkowe=braki,
    )


def _ocena_koordynacji_spz(
    bay: Bay,
    lom_time_s: float | None,
    spz_fast_time_s: float | None,
    spz_slow_time_s: float | None,
    odniesienie: str,
) -> OcenaKryterium:
    """Rekord K koordynacji czasu LoM z przerwą SPZ — ten sam wybór przerwy (najkrótsza
    dostępna) co `_spz_verdict`. Brak czasu LoM albo przerwy SPZ → ocena niewykonana
    z brakiem nazwanym (porównanie się nie odbyło)."""
    przerwy = [t for t in (spz_fast_time_s, spz_slow_time_s) if t is not None]
    spz_interval = min(przerwy) if przerwy else None
    braki: list[str] = []
    if lom_time_s is None:
        braki.append("Czas zadziałania funkcji LoM (zwłoka nastaw) w przypisaniu zabezpieczeń.")
    if spz_interval is None:
        braki.append(
            "Przerwa beznapięciowa SPZ jednostek nadrzędnych — nie jest zapisana w dokumencie "
            "sieci, więc porównanie z czasem LoM się nie odbyło."
        )
    porownanie = lom_time_s is not None and spz_interval is not None
    wynik = (
        WynikKryterium(
            wielkosc_pl="czas zadziałania funkcji LoM (najkrótsza zwłoka)",
            symbol_latex=r"t_{\mathrm{LoM}}",
            wartosc=Wielkosc(wartosc=lom_time_s, jednostka="s"),
            punkt_krytyczny_pl=odniesienie,
            metoda="DEKLARACJA",
        )
        if porownanie and lom_time_s is not None
        else None
    )
    limit = (
        LimitKryterium(
            wartosc=Wielkosc(wartosc=spz_interval, jednostka="s"), podstawa=_PODSTAWA_PRZERWY_SPZ
        )
        if spz_interval is not None
        else None
    )
    return ocen_kryterium(
        kryterium_id=f"lom.{bay.ref_id}.spz",
        przedmiot=Przedmiot(
            element_ref=bay.ref_id,
            nazwa_pl=bay.name,
            opis_pl="Pole przyłączeniowe — koordynacja czasowa ochrony LoM z SPZ",
        ),
        kryterium=Kryterium(
            opis_pl=(
                "Funkcja LoM wyłącza moduł przed ponownym załączeniem SPZ jednostek nadrzędnych"
            ),
            warunek_latex=r"t_{\mathrm{LoM}} \le t_{\mathrm{SPZ}}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_LOM,
        stosowalnosc=_STOSOWALNOSC_POLA,
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_DEKLARACJI,
        dowod=_dowod_deklaracji(odniesienie),
        zakres_waznosci=_ZAKRES_OCENY_LOM,
        slad=_slad(bay, "spz", "porównanie czasu LoM z przerwą SPZ"),
        braki_dodatkowe=braki,
    )


def _ocena_pola(bay: Bay, oceny: list[OcenaKryterium]) -> OcenaKryterium | WynikWymagania:
    """Rekord pola: wymaganie (rekord W, agregacja §2.3) z rekordów porównań pola.

    Pole BEZ żadnego porównania dostaje rekord ``NIE_OCENIONO`` poziomu K (puste ≠ spełnia;
    dawniej pusta lista dawała „OK" — uczciwość natychmiastowa 2026-09-23). Ten sam predykat
    (pusta lista rekordów) decyduje o rekordzie pola i o składowych oceny sieci.
    """
    if oceny:
        return zagreguj_wymaganie(
            wymaganie_id=f"lom.{bay.ref_id}",
            nazwa_pl=f"Ochrona od pracy wyspowej pola {bay.name}",
            podstawa=_PODSTAWA_WYMAGANIA_LOM,
            stosowalnosc=_STOSOWALNOSC_POLA,
            sposob_wykazania="DEKLARACJA",
            oceny_skladowe=oceny,
            pokrycie_programu="NIE_DOTYCZY",
            pokrycie_programu_pl=(
                "wymaganie wykazywane porównaniem nastaw zadeklarowanych — program badań nie "
                "dotyczy"
            ),
            dowod=_dowod_deklaracji(f"nastawy zabezpieczeń pola „{bay.name}”"),
            zakres_waznosci=_ZAKRES_OCENY_LOM,
            slad=[odnosnik for ocena in oceny for odnosnik in ocena.slad],
        )
    return ocena_niewykonana(
        kryterium_id=f"lom.{bay.ref_id}",
        przedmiot=Przedmiot(
            element_ref=bay.ref_id,
            nazwa_pl=bay.name,
            opis_pl="Pole przyłączeniowe — ochrona od pracy wyspowej (Loss of Mains)",
        ),
        opis_kryterium_pl=(
            "Ochrona od pracy wyspowej pola: obecność funkcji LoM, nastawy w oknach "
            "normatywnych i koordynacja z SPZ"
        ),
        podstawa=PodstawaWymagania(
            rodzaj="NIEUSTALONA",
            dokument="Okna normatywne funkcji LoM (NC RfG, PTPiREE)",
            status="NIEUSTALONE",
            uwagi_pl=(
                "źródła okien cytowane przy porównaniach nastaw — pole bez sprawdzeń nie ma "
                "porównania, do którego źródło by się odnosiło"
            ),
        ),
        powod_stosowalnosci_pl=_POWOD_STOSOWALNOSCI_POLA,
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
        poziom=EvidenceTier.DECLARATION,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=ZakresWaznosci(
            opis_pl="Ocena normatywna nastaw zabezpieczeń pola — porównania z oknami"
        ),
        powod_braku_niepewnosci_pl=_POWOD_BRAKU_NIEPEWNOSCI,
        czego_brakuje=(
            "Sprawdzenie obecności funkcji ochrony od pracy wyspowej (81R, 78, 81U, 81O) "
            "w polu.",
            "Nastawy funkcji LoM porównane z oknami normatywnymi.",
            "Czas zadziałania LoM porównany z przerwą SPZ jednostek nadrzędnych.",
            "Przypisanie polu zabezpieczenia z funkcjami LoM i ich nastawami (albo "
            "deklaracja funkcji w kodach zabezpieczeń pola) i ponowna ocena.",
        ),
    )


def _ocena_modulu_bez_pola(generator_ref: str, nazwa: str) -> OcenaKryterium:
    """Rekord ``NIE_OCENIONO`` modułu wytwórczego bez pola przyłączeniowego (brak przedmiotu
    porównań — ocena ochrony LoM modułu niemożliwa)."""
    return ocena_niewykonana(
        kryterium_id=f"lom.modul.{generator_ref}",
        przedmiot=Przedmiot(
            element_ref=generator_ref,
            nazwa_pl=nazwa,
            opis_pl="Moduł wytwórczy bez pola przyłączeniowego z przypisaniem zabezpieczeń",
        ),
        opis_kryterium_pl="Ochrona od pracy wyspowej modułu wytwórczego w jego polu przyłączeniowym",
        podstawa=_PODSTAWA_WYMAGANIA_LOM,
        powod_stosowalnosci_pl="moduł wytwórczy w dokumencie sieci",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
        poziom=EvidenceTier.DECLARATION,
        status_modelu="NIE_DOTYCZY",
        zakres_waznosci=_ZAKRES_OCENY_LOM,
        powod_braku_niepewnosci_pl=_POWOD_BRAKU_NIEPEWNOSCI,
        czego_brakuje=(
            "Pole przyłączeniowe modułu z przypisaniem zabezpieczeń (pole na szynie modułu albo "
            "pole o roli OZE) — bez pola nie ma nastaw, które można porównać.",
        ),
    )


def _ocena_sieci(skladowe: list[OcenaKryterium]) -> WynikWymagania:
    """Rekord wymagania całej sieci: agregacja §2.3 rekordów wszystkich pól i modułów bez pola.

    Sieć bez modułów wytwórczych → wymaganie nie dotyczy (brak przedmiotu oceny LoM).
    """
    dotyczy = bool(skladowe)
    return zagreguj_wymaganie(
        wymaganie_id="lom.siec",
        nazwa_pl="Ochrona od pracy wyspowej modułów wytwórczych sieci",
        podstawa=_PODSTAWA_WYMAGANIA_LOM,
        stosowalnosc=Stosowalnosc(
            dotyczy=dotyczy,
            powod_pl=(
                "sieć ma moduły wytwórcze — każdy wymaga ochrony od pracy wyspowej w swoim polu"
                if dotyczy
                else "sieć nie ma modułów wytwórczych ani pól o roli OZE — ocena LoM nie dotyczy"
            ),
        ),
        sposob_wykazania="DEKLARACJA",
        oceny_skladowe=skladowe,
        pokrycie_programu="NIE_DOTYCZY",
        pokrycie_programu_pl=(
            "wymaganie wykazywane porównaniem nastaw zadeklarowanych — program badań nie dotyczy"
        ),
        dowod=_dowod_deklaracji("nastawy zabezpieczeń pól przyłączeniowych dokumentu sieci"),
        zakres_waznosci=_ZAKRES_OCENY_LOM,
        slad=[odnosnik for ocena in skladowe for odnosnik in ocena.slad],
    )


def _liczniki_statusow(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Liczniki pól wg statusu i etykiety REKORDU pola (kolejność pierwszego wystąpienia)."""
    liczniki: dict[tuple[str, str], dict[str, Any]] = {}
    for field in fields:
        ocena = field["ocena"]
        klucz = (str(ocena["status_maszynowy"]), str(ocena["etykieta"]["etykieta_pl"]))
        if klucz not in liczniki:
            liczniki[klucz] = {
                "status": ocena["status_maszynowy"],
                "liczba": 0,
                "etykieta": dict(ocena["etykieta"]),
            }
        liczniki[klucz]["liczba"] += 1
    return list(liczniki.values())


# ---------------------------------------------------------------------------
# Determinizm — hash wejścia
# ---------------------------------------------------------------------------


def _input_hash(enm: EnergyNetworkModel, fields: list[dict[str, Any]]) -> str:
    payload = {
        "enm_hash": enm.header.hash_sha256,
        "fields": [
            {
                "bay_ref": field["bay_ref"],
                "bus_ref": field["bus_ref"],
                "generating_module_refs": field["generating_module_refs"],
                "checks": [
                    {
                        "kind": check["kind"],
                        "function_ansi": check["function_ansi"],
                        "value": check["value"],
                        "severity": check["severity"],
                    }
                    for check in field["checks"]
                ],
            }
            for field in fields
        ],
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Builder widoku
# ---------------------------------------------------------------------------


def build_ochrona_lom_view(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Zbuduj deterministyczny widok weryfikacji ochrony LoM dla dokumentu ENM."""
    gen_buses = _generating_module_buses(enm)
    protection_by_ref = {a.ref_id: a for a in enm.protection_assignments}

    generating_bays = sorted(
        (bay for bay in _pola_przylaczeniowe(enm) if _is_generating_field(bay, gen_buses)),
        key=lambda bay: bay.ref_id,
    )

    fields: list[dict[str, Any]] = []
    skladowe_sieci: list[OcenaKryterium] = []
    covered_buses: set[str] = set()
    for bay in generating_bays:
        assignment = protection_by_ref.get(bay.protection_ref) if bay.protection_ref else None
        gen_refs = gen_buses.get(bay.bus_ref, [])
        pole, skladowe_pola = _evaluate_field(bay, assignment, gen_refs)
        fields.append(pole)
        skladowe_sieci.extend(skladowe_pola)
        covered_buses.add(bay.bus_ref)

    # Moduły wytwórcze bez pola przyłączeniowego — rekord oceny niewykonanej każdego z nich.
    modules_without_field: list[str] = sorted(
        ref for bus_ref, refs in gen_buses.items() if bus_ref not in covered_buses for ref in refs
    )
    nazwy_generatorow = {gen.ref_id: gen.name for gen in enm.generators}
    skladowe_sieci.extend(
        _ocena_modulu_bez_pola(ref, nazwy_generatorow[ref]) for ref in modules_without_field
    )
    ocena_sieci = _ocena_sieci(skladowe_sieci)

    whitebox_comparisons = [
        {
            "bay_ref": field["bay_ref"],
            **{
                k: check[k]
                for k in (
                    "kind",
                    "function_ansi",
                    "value",
                    "window",
                    "source_pl",
                    "severity",
                    "message_pl",
                )
            },
        }
        for field in fields
        for check in field["checks"]
    ]

    return {
        "analysis": "ochrona_lom",
        "context": {
            "enm_name": enm.header.name,
            "enm_hash": enm.header.hash_sha256,
        },
        "input_hash": _input_hash(enm, fields),
        "zalozenia_pl": [
            "Ocena LoM to interpretacja normatywna (porównania), nie symulacja fizyki wyspy.",
            "Moduł wytwórczy = generator w ENM; pole przyłączeniowe = pole (bay) na szynie "
            "modułu lub o roli OZE z przypisaniem zabezpieczeń.",
            "Okna normatywne pochodzą wyłącznie z cytowanych źródeł (NC RfG / PTPiREE); "
            "brak źródła → okno None + INFO, bez zmyślonych liczb.",
            "Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne "
            "w ENM — uczciwy INFO.",
        ],
        "normative_sources": NORMATIVE_SOURCES,
        "fields": fields,
        "modules_without_field": modules_without_field,
        "summary": {
            "fields_total": len(fields),
            "generating_modules_total": sum(len(refs) for refs in gen_buses.values()),
            # Liczniki pól wg statusu i etykiety z rekordu pola (obok listy pól, nie zamiast).
            "statusy": _liczniki_statusow(fields),
            # Rekord wymagania całej sieci (agregacja §2.3 pól i modułów bez pola).
            "ocena": rekord_json(ocena_sieci),
        },
        "whitebox": {"comparisons": whitebox_comparisons},
    }
