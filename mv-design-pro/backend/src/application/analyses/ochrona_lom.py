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
- WHITE BOX: każde porównanie eksponuje wartość, okno, źródło i werdykt
  (``whitebox.comparisons`` + pola ``checks`` per pole).
- Determinizm: stała kolejność pól (sort po ``ref_id``) i porównań, hash wejścia
  SHA-256 (``input_hash``).

ŹRÓDŁO SPZ (uczciwość danych): czasy przerwy SPZ (``SpzState.fast_time_s`` /
``slow_time_s``) są atrybutem ``BayProtectionControlUnit`` budowanego w
read-modelu — NIE są materializowane w dokumencie ENM (``_build_protection_config``
ustawia ``spz=None``). Dlatego w obecnym modelu SpzState jest nieosiągalny z ENM
i koordynacja z SPZ kończy się uczciwym INFO. Deterministyczna logika werdyktu
(``_spz_verdict``) jest wydzielona i w pełni audytowalna.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

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

# Ranga statusów do wyznaczenia werdyktu pola (najwyższy priorytet wygrywa).
_SEVERITY_RANK: dict[str, int] = {"OK": 0, "INFO": 1, "WARN": 2, "ERROR": 3}


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 6)


# ---------------------------------------------------------------------------
# Deterministyczne werdykty (czyste funkcje — WHITE BOX, w pełni testowalne)
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
    z realnej nastawy (LaTeX) -> werdykt. Czysty formatter — ZERO nowych liczb:
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
        _krok(f"Werdykt: {verdict.severity} — {verdict.message_pl}"),
    ]


def _wywod_spz(
    lom_time_s: float | None,
    spz_fast_time_s: float | None,
    spz_slow_time_s: float | None,
    verdict: Verdict,
) -> list[dict[str, Any]]:
    """Wywod dyplomowy koordynacji LoM-SPZ: warunek -> dane -> podstawienie ->
    werdykt. Pusta lista, gdy porownanie nie zaszlo (brak czasu LoM lub SPZ)."""
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
        _krok(f"Werdykt: {verdict.severity} — {verdict.message_pl}"),
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
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    settings = _lom_settings_by_type(assignment)
    declared = _declared_lom_codes(bay)
    present_types = set(settings) | declared

    if not present_types:
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

    status = _field_status(checks)
    return {
        "bay_ref": bay.ref_id,
        "bay_name": bay.name,
        "substation_ref": bay.substation_ref,
        "bus_ref": bay.bus_ref,
        "generating_module_refs": gen_refs,
        "status": status,
        "checks": checks,
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


def _field_status(checks: list[dict[str, Any]]) -> str:
    if not checks:
        return "OK"
    return max((check["severity"] for check in checks), key=lambda s: _SEVERITY_RANK[s])


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
        (bay for bay in enm.bays if _is_generating_field(bay, gen_buses)),
        key=lambda bay: bay.ref_id,
    )

    fields: list[dict[str, Any]] = []
    covered_buses: set[str] = set()
    for bay in generating_bays:
        assignment = protection_by_ref.get(bay.protection_ref) if bay.protection_ref else None
        gen_refs = gen_buses.get(bay.bus_ref, [])
        fields.append(_evaluate_field(bay, assignment, gen_refs))
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
