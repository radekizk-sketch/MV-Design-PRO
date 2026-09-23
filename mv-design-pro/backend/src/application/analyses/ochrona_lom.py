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
- No-Heuristics: okna to stałe modułu (liczby BEZ ZMIAN — karta AB-1a R-7), ale
  ich PODSTAWA jest opisana uczciwie: żaden dokument, wersja ani klauzula nie są
  potwierdzone, więc każda podstawa niesie ``zrodlo_status = UNVERIFIED_SOURCE`` i
  uwagę, czego brakuje (``PODSTAWY_LOM``). Dawna podstawa „IEEE 1547 / NC RfG
  Art. 14" była błędna (norma USA; art. 14 rozporządzenia 2016/631 nie wymaga
  zabezpieczenia od pracy wyspowej) i została usunięta. Jeżeli dla parametru NIE
  ma okna (przesunięcie wektora) — okno pozostaje ``None`` i uczciwy INFO; ZERO
  zmyślonych liczb.
- WYNIK WYJAŚNIALNY (karta AB-1a D7): każde porównanie jest obiektem
  ``OcenaNastawyLom`` z pięcioma towarzyszami — wartość (nastawa), wymaganie
  (krawędzie okna), zapas, podstawa, dowód — a nie parą (istotność, komunikat).
  Pilnuje tego ``scripts/explainable_verdict_guard.py``.
- MAGAZYN ENERGII poza zakresem rozporządzenia 2016/631 (art. 3 ust. 2): ocena
  pola z magazynem biegnie jak dotąd (liczby i istotności bez zmian), ale wynik
  NAZYWA, że okna wyprowadzone z wymagań dla modułów wytwarzania nie mają dla
  magazynu podstawy (``poza_zakresem_rfg``) — nie cicho.
- Determinizm: stała kolejność pól (sort po ``ref_id``) i porównań, hash wejścia
  SHA-256 (``input_hash``).

ŹRÓDŁO SPZ (uczciwość danych): czasy przerwy SPZ (``SpzState.fast_time_s`` /
``slow_time_s``) są atrybutem ``BayProtectionControlUnit`` budowanego w
read-modelu — NIE są materializowane w dokumencie ENM (``_build_protection_config``
ustawia ``spz=None``). Dlatego w obecnym modelu SpzState jest nieosiągalny z ENM
i koordynacja z SPZ kończy się uczciwym INFO. Deterministyczna logika werdyktu
(``_ocena_spz``) jest wydzielona i w pełni audytowalna.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any, Literal

from application.analyses.werdykt_projektowy import (
    ZRODLO_NIEZWERYFIKOWANE,
    PodstawaNormatywna,
)
from enm.models import Bay, EnergyNetworkModel, ProtectionAssignment, ProtectionSetting

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
# Okna nastaw — stałe modułu (LICZBY BEZ ZMIAN, karta AB-1a R-7) z podstawą opisaną
# uczciwie jako NIEZWERYFIKOWANA (audyt warstwy regulacyjnej 2026-09-23 §2.8)
# ---------------------------------------------------------------------------
# ROCOF (81R): nastawa df/dt PONIŻEJ tej wartości grozi zbędnym wyłączeniem na
# ogólnosystemowe zdarzenia częstotliwościowe (fałszywe wykrycie wyspy).
ROCOF_MIN_DF_DT_HZ_S: float = 2.0
# Częstotliwościowe krawędzie okna: nastawa 81U POWYŻEJ dolnej / 81O PONIŻEJ górnej
# krawędzi wchodzi w pasmo pozostawania w pracy → ryzyko zbędnych wyłączeń.
FREQ_UNDER_MAX_HZ: float = 47.5
FREQ_OVER_MIN_HZ: float = 51.5

#: Kod nazwanego wyłączenia magazynu energii z wymagań rozporządzenia 2016/631
#: (decyzja właściciela OD-40 w toku — wymagania krajowe dla magazynów).
KOD_POZA_ZAKRESEM_RFG = "poza_zakresem_rfg_do_OD-40"

_UWAGA_BRAK_DOKUMENTU = (
    "Dokument źródłowy nastaw wymaganych (IRiESD operatora, PN-EN 50549-1/-2), jego "
    "wydanie i klauzula nie są potwierdzone — wartość nie jest wymaganiem z dokumentu."
)

#: Podstawa KAŻDEJ funkcji LoM i koordynacji SPZ — jedno źródło dla porównań i sekcji
#: źródeł ekranu. ``dokument = None`` wszędzie: żaden dokument nie jest potwierdzony.
PODSTAWY_LOM: dict[str, PodstawaNormatywna] = {
    "rocof_81R": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Rozporządzenie (UE) 2016/631 art. 13 ust. 1 lit. b wymaga zdolności do "
            "wytrzymania szybkości zmian częstotliwości o wartości określonej przez "
            "właściwego operatora — rozporządzenie nie podaje 2 Hz/s. Wartość 2 Hz/s nie "
            "ma dokumentu, wersji ani okna pomiaru (szybkość zmian częstotliwości bez "
            "okna uśredniania jest niedookreślona). " + _UWAGA_BRAK_DOKUMENTU
        ),
    ),
    "underfrequency_81U": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Pasmo 47,5–51,5 Hz pochodzi z tabeli zakresów częstotliwości rozporządzenia "
            "(UE) 2016/631 art. 13 ust. 1 lit. a, która wiąże pasma z CZASAMI pracy "
            "(np. 47,5–48,5 Hz co najmniej 30 min); okno progu 81U ≤ 47,5 Hz pomija czasy. "
            + _UWAGA_BRAK_DOKUMENTU
        ),
    ),
    "overfrequency_81O": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Pasmo 47,5–51,5 Hz pochodzi z tabeli zakresów częstotliwości rozporządzenia "
            "(UE) 2016/631 art. 13 ust. 1 lit. a, która wiąże pasma z CZASAMI pracy "
            "(np. 51,0–51,5 Hz 30 min); okno progu 81O ≥ 51,5 Hz pomija czasy. "
            + _UWAGA_BRAK_DOKUMENTU
        ),
    ),
    "vector_shift_78": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Brak okna nastawy przesunięcia wektora w katalogu — wymaganie podaje "
            "operator. " + _UWAGA_BRAK_DOKUMENTU
        ),
    ),
    "obecnosc": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Wymóg zabezpieczenia interfejsowego od pracy wyspowej w polu modułu "
            "wytwórczego (klasa dokumentów: IRiESD operatora, PN-EN 50549-1 dla nN, "
            "PN-EN 50549-2 dla SN). " + _UWAGA_BRAK_DOKUMENTU
        ),
    ),
    "koordynacja_spz": PodstawaNormatywna(
        dokument=None,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=(
            "Zasada koordynacji: zabezpieczenie od pracy wyspowej wyłącza moduł przed "
            "ponownym załączeniem SPZ jednostek nadrzędnych (czasy SPZ z "
            "BayProtectionControlUnit). Wymagany zapas czasu nie ma dokumentu źródłowego."
        ),
    ),
}

#: Okna prezentacyjne (tekst) funkcji LoM — dla sekcji źródeł ekranu; podstawa z
#: `PODSTAWY_LOM` (jedno źródło, bez drugiego cytatu).
NORMATIVE_SOURCES: dict[str, dict[str, Any]] = {
    "rocof_81R": {
        "window_pl": f"df/dt ≥ {ROCOF_MIN_DF_DT_HZ_S} Hz/s",
        "podstawa": PODSTAWY_LOM["rocof_81R"].to_dict(),
    },
    "underfrequency_81U": {
        "window_pl": f"próg f ≤ {FREQ_UNDER_MAX_HZ} Hz",
        "podstawa": PODSTAWY_LOM["underfrequency_81U"].to_dict(),
    },
    "overfrequency_81O": {
        "window_pl": f"próg f ≥ {FREQ_OVER_MIN_HZ} Hz",
        "podstawa": PODSTAWY_LOM["overfrequency_81O"].to_dict(),
    },
    "vector_shift_78": {
        # Brak okna dla progu przesunięcia wektora — okno pozostaje None (uczciwy
        # INFO, ZERO zmyślonych liczb).
        "window_pl": None,
        "podstawa": PODSTAWY_LOM["vector_shift_78"].to_dict(),
    },
}

# Kolejność (determinizm) prezentacji funkcji.
_FUNCTION_ORDER: tuple[str, ...] = (
    "rocof_81R",
    "vector_shift_78",
    "underfrequency_81U",
    "overfrequency_81O",
)

# Ranga statusów do wyznaczenia werdyktu pola (najwyższy priorytet wygrywa).
_SEVERITY_RANK: dict[str, int] = {"OK": 0, "INFO": 1, "WARN": 2, "ERROR": 3}


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 6)


# ---------------------------------------------------------------------------
# Ocena nastawy — obiekt z pięcioma towarzyszami (karta AB-1a D7)
# ---------------------------------------------------------------------------

#: Istotność wyniku porównania (dotychczasowe `severity`).
WynikLom = Literal["OK", "INFO", "WARN", "ERROR"]
RodzajOcenyLom = Literal["obecnosc", "okno_normatywne", "koordynacja_spz"]


@dataclass(frozen=True)
class OcenaNastawyLom:
    """Jedno porównanie oceny LoM jako WYNIK WYJAŚNIALNY (zamiast pary istotność/komunikat).

    Pięć towarzyszy werdyktu: ``wartosc`` (nastawa albo czas LoM), wymaganie
    (``odniesienie_dolne``/``odniesienie_gorne`` — krawędzie okna; ``None`` = brak
    okna), ``margines`` (zapas do krawędzi, dodatni = w oknie; ``None``, gdy
    porównanie nie zaszło), ``podstawa`` (zawsze — z ``PODSTAWY_LOM``, źródło
    niezweryfikowane) i ``dowod`` (pole oceny; ocena LoM nie jest biegiem, więc
    ``run_id = None``, a ślad niesie ``wywod``). ``wynik`` to dotychczasowa
    istotność (liczby i reguły BEZ ZMIAN).
    """

    rodzaj: RodzajOcenyLom
    funkcja: str | None
    funkcja_ansi: str | None
    funkcja_pl: str | None
    wynik: WynikLom
    komunikat_pl: str
    wartosc: float | None
    jednostka: str | None
    odniesienie_dolne: float | None
    odniesienie_gorne: float | None
    margines: float | None
    margines_jednostka: str | None
    podstawa: PodstawaNormatywna
    dowod: dict[str, str | None]
    wywod: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "funkcja": self.funkcja,
            "funkcja_ansi": self.funkcja_ansi,
            "funkcja_pl": self.funkcja_pl,
            "wynik": self.wynik,
            "komunikat_pl": self.komunikat_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "odniesienie_dolne": self.odniesienie_dolne,
            "odniesienie_gorne": self.odniesienie_gorne,
            "margines": self.margines,
            "margines_jednostka": self.margines_jednostka,
            "podstawa": self.podstawa.to_dict(),
            "dowod": dict(self.dowod),
            # Addytywny wywod dyplomowy {tekst, latex} (zasada KaTeX 2026-07-22);
            # pusta lista = uczciwy brak (porownanie nie zaszlo).
            "wywod": [dict(krok) for krok in self.wywod],
        }


def _dowod_pola(element_id: str | None) -> dict[str, str | None]:
    """Dowód oceny: pole (element) — ocena LoM nie jest biegiem (``run_id = None``)."""
    return {"run_id": None, "element_id": element_id, "trace_ref": None}


def _zapas(wartosc: float | None, krawedz: float, *, dolna: bool) -> float | None:
    """Zapas do krawędzi okna (arytmetyka prezentacji z DWÓCH liczb, nie fizyka):
    dodatni = w oknie. Dolna krawędź: wartość − krawędź; górna: krawędź − wartość."""
    if wartosc is None:
        return None
    return _round6(wartosc - krawedz if dolna else krawedz - wartosc)


def _ocena_okna(
    function_type: str,
    wynik: WynikLom,
    komunikat_pl: str,
    wartosc: float | None,
    element_id: str | None,
) -> OcenaNastawyLom:
    """Ocena okna nastawy funkcji LoM — krawędzie i jednostka z JEDNEJ tabeli okien."""
    meta = LOM_FUNCTION_TYPES[function_type]
    okno = _OKNA_FUNKCJI.get(function_type)
    jednostka = _JEDNOSTKA_FUNKCJI[function_type]
    if okno is None:
        dolna_krawedz: float | None = None
        gorna_krawedz: float | None = None
        margines = None
    else:
        krawedz, dolna = okno
        dolna_krawedz = krawedz if dolna else None
        gorna_krawedz = None if dolna else krawedz
        margines = _zapas(wartosc, krawedz, dolna=dolna)
    ocena = OcenaNastawyLom(
        rodzaj="okno_normatywne",
        funkcja=function_type,
        funkcja_ansi=meta["ansi"],
        funkcja_pl=meta["label_pl"],
        wynik=wynik,
        komunikat_pl=komunikat_pl,
        wartosc=wartosc,
        jednostka=jednostka,
        odniesienie_dolne=dolna_krawedz,
        odniesienie_gorne=gorna_krawedz,
        margines=margines,
        margines_jednostka=jednostka if margines is not None else None,
        podstawa=PODSTAWY_LOM[function_type],
        dowod=_dowod_pola(element_id),
    )
    return _z_wywodem(ocena)


def _ocena_rocof(df_dt_hz_s: float | None, element_id: str | None = None) -> OcenaNastawyLom:
    """Ocena okna ROCOF (81R)."""
    if df_dt_hz_s is None:
        return _ocena_okna(
            "rocof_81R",
            "INFO",
            "Brak nastawy df/dt — podaj wartość progu ROCOF (81R).",
            None,
            element_id,
        )
    if df_dt_hz_s < ROCOF_MIN_DF_DT_HZ_S:
        return _ocena_okna(
            "rocof_81R",
            "WARN",
            f"Nastawa df/dt ({df_dt_hz_s} Hz/s) poniżej dolnego okna "
            f"({ROCOF_MIN_DF_DT_HZ_S} Hz/s) — ryzyko zbędnych wyłączeń "
            "(fałszywe wykrycie wyspy).",
            df_dt_hz_s,
            element_id,
        )
    return _ocena_okna(
        "rocof_81R",
        "OK",
        f"Nastawa df/dt ({df_dt_hz_s} Hz/s) w oknie (≥ {ROCOF_MIN_DF_DT_HZ_S} Hz/s).",
        df_dt_hz_s,
        element_id,
    )


def _ocena_81u(threshold_hz: float | None, element_id: str | None = None) -> OcenaNastawyLom:
    """Ocena okna 81U (podczęstotliwościowe)."""
    if threshold_hz is None:
        return _ocena_okna(
            "underfrequency_81U",
            "INFO",
            "Brak nastawy progu — podaj próg 81U (f<).",
            None,
            element_id,
        )
    if threshold_hz > FREQ_UNDER_MAX_HZ:
        return _ocena_okna(
            "underfrequency_81U",
            "WARN",
            f"Próg 81U ({threshold_hz} Hz) powyżej górnej krawędzi okna "
            f"({FREQ_UNDER_MAX_HZ} Hz) — wchodzi w pasmo pozostawania w pracy, "
            "ryzyko zbędnych wyłączeń.",
            threshold_hz,
            element_id,
        )
    return _ocena_okna(
        "underfrequency_81U",
        "OK",
        f"Próg 81U ({threshold_hz} Hz) w oknie (≤ {FREQ_UNDER_MAX_HZ} Hz).",
        threshold_hz,
        element_id,
    )


def _ocena_81o(threshold_hz: float | None, element_id: str | None = None) -> OcenaNastawyLom:
    """Ocena okna 81O (nadczęstotliwościowe)."""
    if threshold_hz is None:
        return _ocena_okna(
            "overfrequency_81O",
            "INFO",
            "Brak nastawy progu — podaj próg 81O (f>).",
            None,
            element_id,
        )
    if threshold_hz < FREQ_OVER_MIN_HZ:
        return _ocena_okna(
            "overfrequency_81O",
            "WARN",
            f"Próg 81O ({threshold_hz} Hz) poniżej dolnej krawędzi okna "
            f"({FREQ_OVER_MIN_HZ} Hz) — wchodzi w pasmo pozostawania w pracy, "
            "ryzyko zbędnych wyłączeń.",
            threshold_hz,
            element_id,
        )
    return _ocena_okna(
        "overfrequency_81O",
        "OK",
        f"Próg 81O ({threshold_hz} Hz) w oknie (≥ {FREQ_OVER_MIN_HZ} Hz).",
        threshold_hz,
        element_id,
    )


def _ocena_78(threshold_deg: float | None, element_id: str | None = None) -> OcenaNastawyLom:
    """Ocena funkcji 78 — brak okna w katalogu (uczciwy INFO)."""
    if threshold_deg is None:
        return _ocena_okna(
            "vector_shift_78",
            "INFO",
            "Brak nastawy przesunięcia wektora — podaj wymaganie OSD.",
            None,
            element_id,
        )
    return _ocena_okna(
        "vector_shift_78",
        "INFO",
        f"Nastawa przesunięcia wektora ({threshold_deg}°) — brak okna "
        "w katalogu, podaj wymaganie OSD.",
        threshold_deg,
        element_id,
    )


def _ocena_spz(
    lom_time_s: float | None,
    spz_fast_time_s: float | None,
    spz_slow_time_s: float | None,
    element_id: str | None = None,
) -> OcenaNastawyLom:
    """Deterministyczna ocena koordynacji czasu LoM z przerwą SPZ.

    Miarodajna przerwa SPZ to najkrótszy z dostępnych czasów (szybkie SPZ jest
    najbardziej wymagające). LoM musi zadziałać PRZED ponownym załączeniem:
    wymaganie = górna krawędź ``t_LoM < t_SPZ``, zapas = ``t_SPZ − t_LoM``.
    """
    candidates = [t for t in (spz_fast_time_s, spz_slow_time_s) if t is not None]
    spz_interval = min(candidates) if candidates else None
    if lom_time_s is None:
        wynik: WynikLom = "INFO"
        komunikat = "Brak danych o czasie zadziałania LoM — porównanie z SPZ niemożliwe."
    elif spz_interval is None:
        wynik = "INFO"
        komunikat = (
            "Brak danych o przerwie SPZ jednostek nadrzędnych (SpzState nieosiągalny w ENM) "
            "— porównanie niemożliwe."
        )
    elif lom_time_s < spz_interval:
        wynik = "OK"
        komunikat = (
            f"Czas LoM ({lom_time_s} s) krótszy od przerwy SPZ ({spz_interval} s) "
            "— wyłączenie przed ponownym załączeniem SPZ."
        )
    else:
        wynik = "ERROR"
        komunikat = (
            f"Czas LoM ({lom_time_s} s) nie krótszy od przerwy SPZ ({spz_interval} s) "
            "— ryzyko załączenia na wyspę (LoM wolniejszy niż przerwa SPZ)."
        )
    margines = (
        _zapas(lom_time_s, spz_interval, dolna=False)
        if lom_time_s is not None and spz_interval is not None
        else None
    )
    return OcenaNastawyLom(
        rodzaj="koordynacja_spz",
        funkcja=None,
        funkcja_ansi=None,
        funkcja_pl="Koordynacja czasowa z SPZ",
        wynik=wynik,
        komunikat_pl=komunikat,
        wartosc=lom_time_s,
        jednostka="s",
        odniesienie_dolne=None,
        odniesienie_gorne=spz_interval,
        margines=margines,
        margines_jednostka="s" if margines is not None else None,
        podstawa=PODSTAWY_LOM["koordynacja_spz"],
        dowod=_dowod_pola(element_id),
        wywod=tuple(_wywod_spz(lom_time_s, spz_interval, wynik, komunikat)),
    )


def _ocena_obecnosci(
    function_type: str | None, element_id: str | None, *, zadeklarowana: bool
) -> OcenaNastawyLom:
    """Obecność funkcji LoM: brak jakiejkolwiek (ERROR) albo funkcja bez nastaw (INFO)."""
    if not zadeklarowana or function_type is None:
        return OcenaNastawyLom(
            rodzaj="obecnosc",
            funkcja=None,
            funkcja_ansi=None,
            funkcja_pl=None,
            wynik="ERROR",
            komunikat_pl=(
                "Pole modułu wytwórczego bez jakiejkolwiek funkcji ochrony od pracy "
                "wyspowej (LoM: 81R / 78 / 81U / 81O)."
            ),
            wartosc=None,
            jednostka=None,
            odniesienie_dolne=None,
            odniesienie_gorne=None,
            margines=None,
            margines_jednostka=None,
            podstawa=PODSTAWY_LOM["obecnosc"],
            dowod=_dowod_pola(element_id),
        )
    meta = LOM_FUNCTION_TYPES[function_type]
    okno = _OKNA_FUNKCJI.get(function_type)
    return OcenaNastawyLom(
        rodzaj="obecnosc",
        funkcja=function_type,
        funkcja_ansi=meta["ansi"],
        funkcja_pl=meta["label_pl"],
        wynik="INFO",
        komunikat_pl=(
            f"Funkcja {meta['ansi']} zadeklarowana w kodach pola bez nastaw " "— uzupełnij nastawy."
        ),
        wartosc=None,
        jednostka=_JEDNOSTKA_FUNKCJI[function_type],
        odniesienie_dolne=okno[0] if okno is not None and okno[1] else None,
        odniesienie_gorne=okno[0] if okno is not None and not okno[1] else None,
        margines=None,
        margines_jednostka=None,
        podstawa=PODSTAWY_LOM[function_type],
        dowod=_dowod_pola(element_id),
    )


#: Krawędź okna per funkcja: (wartość, czy DOLNA krawędź). JEDNO źródło krawędzi
#: dla oceny, zapasu i wywodu (predykaty parami — reguła KLASA §3).
_OKNA_FUNKCJI: dict[str, tuple[float, bool]] = {
    "rocof_81R": (ROCOF_MIN_DF_DT_HZ_S, True),
    "underfrequency_81U": (FREQ_UNDER_MAX_HZ, False),
    "overfrequency_81O": (FREQ_OVER_MIN_HZ, True),
}
_JEDNOSTKA_FUNKCJI: dict[str, str] = {
    "rocof_81R": "Hz/s",
    "vector_shift_78": "deg",
    "underfrequency_81U": "Hz",
    "overfrequency_81O": "Hz",
}

# Odwzorowanie function_type -> (nazwa pola nastawy, funkcja oceny).
_WINDOW_EVALUATORS: dict[str, tuple[str, Callable[..., OcenaNastawyLom]]] = {
    "rocof_81R": ("threshold_hz_s", _ocena_rocof),
    "vector_shift_78": ("threshold_deg", _ocena_78),
    "underfrequency_81U": ("threshold_hz", _ocena_81u),
    "overfrequency_81O": ("threshold_hz", _ocena_81o),
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


# Parametry wywodu okna per function_type: (symbol LaTeX nastawy, jednostka LaTeX,
# opis okna ASCII). Krawedz i jej kierunek z `_OKNA_FUNKCJI` (jedno zrodlo). Opis nie
# cytuje dokumentu: podstawa jest NIEZWERYFIKOWANA (`PODSTAWY_LOM`).
_WYWOD_OKNA: dict[str, tuple[str, str, str]] = {
    "rocof_81R": (
        r"\left(\tfrac{df}{dt}\right)_{nast}",
        r"\tfrac{\text{Hz}}{\text{s}}",
        "dolna krawedz okna (podstawa niezweryfikowana)",
    ),
    "underfrequency_81U": (
        r"f_{81U}",
        r"\text{Hz}",
        "gorna krawedz okna (podstawa niezweryfikowana)",
    ),
    "overfrequency_81O": (
        r"f_{81O}",
        r"\text{Hz}",
        "dolna krawedz okna (podstawa niezweryfikowana)",
    ),
}

_ZNAK_PRZECIWNY: dict[str, str] = {r"\ge": "<", r"\le": ">"}


def _z_wywodem(ocena: OcenaNastawyLom) -> OcenaNastawyLom:
    """Ocena okna uzupelniona o wywod dyplomowy (ten sam obiekt, pole `wywod`)."""
    if ocena.funkcja is None:
        return ocena
    kroki = _wywod_okna(ocena.funkcja, ocena.wartosc, ocena.wynik, ocena.komunikat_pl)
    return replace(ocena, wywod=tuple(kroki))


def _wywod_okna(
    function_type: str, value: float | None, wynik: str, komunikat_pl: str
) -> list[dict[str, Any]]:
    """Wywod dyplomowy okna: warunek (LaTeX) -> dane -> podstawienie z realnej
    nastawy (LaTeX) -> werdykt. Czysty formatter — ZERO nowych liczb: nastawa i
    krawedz okna sa juz czescia porownania. Pusta lista, gdy realne porownanie nie
    zaszlo (brak nastawy lub brak okna) — uczciwy brak wywodu."""
    params = _WYWOD_OKNA.get(function_type)
    krawedz_okna = _OKNA_FUNKCJI.get(function_type)
    if params is None or krawedz_okna is None or value is None:
        return []
    symbol, jednostka, opis_okna = params
    okno, dolna = krawedz_okna
    znak = r"\ge" if dolna else r"\le"
    spelnione = wynik == "OK"
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
        _krok(f"Werdykt: {wynik} — {komunikat_pl}"),
    ]


def _wywod_spz(
    lom_time_s: float | None,
    spz_interval: float | None,
    wynik: str,
    komunikat_pl: str,
) -> list[dict[str, Any]]:
    """Wywod dyplomowy koordynacji LoM-SPZ: warunek -> dane -> podstawienie ->
    werdykt. Pusta lista, gdy porownanie nie zaszlo (brak czasu LoM lub SPZ)."""
    if lom_time_s is None or spz_interval is None:
        return []
    spelnione = wynik == "OK"
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
        _krok(f"Werdykt: {wynik} — {komunikat_pl}"),
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
        bay_role=bay_role,  # type: ignore[arg-type]  # sprawdzone wobec `_ROLE_POLA`
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
    bess_refs: list[str],
) -> dict[str, Any]:
    oceny: list[OcenaNastawyLom] = []
    settings = _lom_settings_by_type(assignment)
    declared = _declared_lom_codes(bay)
    present_types = set(settings) | declared

    if not present_types:
        oceny.append(_ocena_obecnosci(None, bay.ref_id, zadeklarowana=False))
    else:
        for function_type in _FUNCTION_ORDER:
            if function_type not in present_types:
                continue
            setting = settings.get(function_type)
            if setting is None:
                # Zadeklarowana w protection_codes, ale bez nastaw.
                oceny.append(_ocena_obecnosci(function_type, bay.ref_id, zadeklarowana=True))
                continue
            field_name, evaluator = _WINDOW_EVALUATORS[function_type]
            oceny.append(evaluator(_setting_value(setting, field_name), bay.ref_id))

        # Koordynacja z SPZ — miarodajny czas LoM = najkrótsza zwłoka funkcji LoM.
        spz_fast, spz_slow = _spz_intervals()
        oceny.append(_ocena_spz(_lom_time(settings), spz_fast, spz_slow, bay.ref_id))

    checks = [ocena.to_dict() for ocena in oceny]
    return {
        "bay_ref": bay.ref_id,
        "bay_name": bay.name,
        "substation_ref": bay.substation_ref,
        "bus_ref": bay.bus_ref,
        "generating_module_refs": gen_refs,
        "status": _field_status(oceny),
        "checks": checks,
        "poza_zakresem_rfg": _poza_zakresem_rfg(bess_refs),
    }


def _poza_zakresem_rfg(bess_refs: list[str]) -> dict[str, Any] | None:
    """Nazwane wyłączenie magazynów energii z zakresu rozporządzenia 2016/631.

    Ocena pola biegnie bez zmian (liczby, istotności), ale wynik mówi wprost, że
    okna wyprowadzone z wymagań dla MODUŁÓW WYTWARZANIA nie mają dla magazynu
    podstawy — do czasu rozstrzygnięcia wymagań krajowych dla magazynów.
    """
    if not bess_refs:
        return None
    return {
        "kod": KOD_POZA_ZAKRESEM_RFG,
        "moduly": list(bess_refs),
        "opis_pl": (
            "Magazyn energii nie jest objęty rozporządzeniem (UE) 2016/631 (art. 3 "
            "ust. 2) — okna nastaw wyprowadzone z wymagań dla modułów wytwarzania nie "
            "mają dla niego podstawy. Wymagania krajowe dla magazynów czekają na "
            "rozstrzygnięcie; ocena pola jest pokazana bez zmian, ale nie jest oceną "
            "wobec wymagań magazynu."
        ),
    }


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


def _field_status(oceny: list[OcenaNastawyLom]) -> str:
    if not oceny:
        return "OK"
    return max((ocena.wynik for ocena in oceny), key=lambda s: _SEVERITY_RANK[s])


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
                # Klucze postaci pod odcisk BEZ ZMIAN od karty D10 (determinizm:
                # ten sam model -> ten sam `input_hash` przed i po karcie AB-1a D7);
                # wartosci czytane z nowego ksztaltu `OcenaNastawyLom`.
                "checks": [
                    {
                        "kind": check["rodzaj"],
                        "function_ansi": check["funkcja_ansi"],
                        "value": check["wartosc"],
                        "severity": check["wynik"],
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
    bess = {gen.ref_id for gen in enm.generators if gen.gen_type == "bess"}
    protection_by_ref = {a.ref_id: a for a in enm.protection_assignments}

    generating_bays = sorted(
        (bay for bay in _pola_przylaczeniowe(enm) if _is_generating_field(bay, gen_buses)),
        key=lambda bay: bay.ref_id,
    )

    fields: list[dict[str, Any]] = []
    covered_buses: set[str] = set()
    for bay in generating_bays:
        assignment = protection_by_ref.get(bay.protection_ref) if bay.protection_ref else None
        gen_refs = gen_buses.get(bay.bus_ref, [])
        bess_refs = [ref for ref in gen_refs if ref in bess]
        fields.append(_evaluate_field(bay, assignment, gen_refs, bess_refs))
        covered_buses.add(bay.bus_ref)

    # Moduły wytwórcze bez pola przyłączeniowego (uczciwy INFO — nie da się ocenić).
    modules_without_field: list[str] = sorted(
        ref for bus_ref, refs in gen_buses.items() if bus_ref not in covered_buses for ref in refs
    )

    by_status: dict[str, int] = {"OK": 0, "INFO": 0, "WARN": 0, "ERROR": 0}
    for field in fields:
        by_status[field["status"]] += 1
    overall = _overall_status(fields, modules_without_field)

    whitebox_comparisons = [
        {
            "bay_ref": field["bay_ref"],
            **{
                k: check[k]
                for k in (
                    "rodzaj",
                    "funkcja_ansi",
                    "wartosc",
                    "odniesienie_dolne",
                    "odniesienie_gorne",
                    "margines",
                    "wynik",
                    "komunikat_pl",
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
            "Okna nastaw są stałymi oceny; ich podstawa (dokument, wydanie, klauzula) NIE "
            "jest potwierdzona — każda ocena niesie podstawę ze statusem źródła "
            "niezweryfikowanego. Brak okna → okno None + INFO, bez zmyślonych liczb.",
            "Magazyn energii nie jest objęty rozporządzeniem (UE) 2016/631 — pole z "
            "magazynem niesie jawne wyłączenie z zakresu wymagań dla modułów wytwarzania.",
            "Czasy przerwy SPZ pochodzą z SpzState jednostek nadrzędnych; gdy nieosiągalne "
            "w ENM — uczciwy INFO.",
        ],
        "normative_sources": NORMATIVE_SOURCES,
        "fields": fields,
        "modules_without_field": modules_without_field,
        "summary": {
            "fields_total": len(fields),
            "generating_modules_total": sum(len(refs) for refs in gen_buses.values()),
            "by_status": by_status,
            "overall_status": overall,
        },
        "whitebox": {"comparisons": whitebox_comparisons},
    }


def _overall_status(fields: list[dict[str, Any]], modules_without_field: list[str]) -> str:
    statuses = [field["status"] for field in fields]
    if modules_without_field:
        statuses.append("INFO")
    if not statuses:
        return "INFO"
    return max(statuses, key=lambda s: _SEVERITY_RANK[s])
