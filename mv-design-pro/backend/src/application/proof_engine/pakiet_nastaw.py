"""Pakiet dowodowy NASTAW zabezpieczeń I>/I>> — brama biegu zbiorczego (karta PACK-NASTAWY).

STATUS: CANONICAL (domknięcie długu PACK-DLUG-NASTAWY, rejestr V12K wiersz
PACK-BEZ-KONSUMENTA).

Ta brama jest SIOSTRZANA względem `application/proof_engine/pakiet_biegu.py`, ale
NIE jest w niej rodzajem — `pakiet_biegu.py` mapuje JEDEN przebieg na JEDEN pakiet,
a nastawy metodą Hoppela z definicji potrzebują TRZECH biegów (kotwica c_max + wariant
c_min + wariant rozpływu, patrz `application/protection_settings/batch_run.py`) oraz
DWÓCH dodatkowych parametrów wyboru inżyniera (który odcinek, która szyna kolejnej
strefy) — więcej niż jeden opcjonalny `punkt`, którym operuje brama sióstr.

WZORZEC IDENTYCZNY: dostępność i budowa czytają JEDNO źródło prawdy (funkcje modułu
`batch_run.py`), więc „dostępny" nie może rozjechać się z „da się pobrać" (reguła
predykatów parami).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from application.analyses.protection.catalog.mapper import wymaganie_z_nastaw
from application.analyses.protection.catalog.pipeline import dopasuj_do_aparatu
from application.proof_engine.packs.protection_settings import (
    ProtectionSettingsProofInput,
    ProtectionSettingsProofPack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from application.protection_settings.batch_run import (
    C_MAX_MIN_DOPUSZCZALNY,
    BrakDanychNastawError,
    kandydaci_nastepnej_szyny,
    linie_kandydujace,
    oblicz_nastawy,
)
from enm.canonical_analysis import CanonicalRun

_POWOD_KOTWICA_NIEZAKONCZONA = (
    "Przebieg nie zakończył się wynikiem — pakiet nastaw powstaje wyłącznie z "
    "zakończonego zwarcia trójfazowego. Uruchom obliczenie ponownie."
)
_POWOD_KOTWICA_ZLY_RODZAJ = (
    "Pakiet nastaw wymaga jako kotwicy przebiegu zwarcia trójfazowego (gałąź "
    "maksymalna c_max) — ten przebieg jest innego rodzaju."
)
_POWOD_KOTWICA_NIE_JEST_MAX = (
    "Ten przebieg jest wariantem MINIMALNYM (współczynnik napięciowy c < 1,0) — "
    "pakiet nastaw wymaga kotwicy z gałęzi MAKSYMALNEJ (c_max ≥ 1,0, IEC 60909-0 "
    "Tabela 1). Uruchom zwarcie trójfazowe z wariantem maksymalnym."
)
_POWOD_BRAK_LINII = (
    "Migawka tego przebiegu nie zawiera żadnej linii ani kabla z kompletem danych "
    "katalogowych (przekrój, materiał przewodu, prąd znamionowy) — nastaw nie da "
    "się dobrać bez tych danych."
)


class PakietNastawError(ValueError):
    """Pakietu nastaw nie da się zbudować dla tych parametrów (powód po polsku)."""


def dostepnosc_pakietu_nastaw(run: CanonicalRun) -> dict[str, Any]:
    """Opis dostępności pakietu dowodowego nastaw dla PODANEGO przebiegu-kotwicy.

    Lista `linie` — kandydaci na chroniony odcinek — pochodzi z TEJ SAMEJ funkcji
    (`linie_kandydujace`), której użyje budowa; każda linia niesie z kolei listę
    `nastepne_szyny_kandydujace` (może być pusta — linia bez rozgałęzienia w dół).
    """
    if run.status != "FINISHED":
        return _niedostepny(run, _POWOD_KOTWICA_NIEZAKONCZONA)
    if run.analysis_type != "short_circuit_sn":
        return _niedostepny(run, _POWOD_KOTWICA_ZLY_RODZAJ)
    if (run.raw_result or {}).get("short_circuit_type") != "3F":
        return _niedostepny(run, _POWOD_KOTWICA_ZLY_RODZAJ)
    # Predykaty parami (karta W3-C1): `zbuduj_wejscie_nastaw` odmawia kotwicy
    # spoza gałęzi maksymalnej (`c_factor < C_MAX_MIN_DOPUSZCZALNY`) PO stronie
    # budowy — bez tego samego warunku TU, dostępność mówiłaby „tak", a budowa
    # zaraz potem 422 z tym samym powodem, którego dostępność mogła nazwać od razu.
    # Domyślne 1.10 jest TĄ SAMĄ wartością domyślną, której używa
    # `zbuduj_wejscie_nastaw` przy braku `c_factor` w opcjach kotwicy — inaczej
    # dwa niezależne domysły „co, gdy brak danej" mogłyby się rozjechać.
    c_factor = run.options.get("c_factor", 1.10)
    if not isinstance(c_factor, int | float) or c_factor < C_MAX_MIN_DOPUSZCZALNY:
        return _niedostepny(run, _POWOD_KOTWICA_NIE_JEST_MAX)

    linie = linie_kandydujace(run.snapshot)
    if not linie:
        return _niedostepny(run, _POWOD_BRAK_LINII)

    return {
        "run_id": str(run.id),
        "dostepny": True,
        "powod_pl": None,
        "linie": [
            {
                "line_id": linia.ref_id,
                "nazwa": linia.nazwa,
                "nastepne_szyny_kandydujace": kandydaci_nastepnej_szyny(run.snapshot, linia.ref_id),
            }
            for linia in linie
        ],
    }


def _niedostepny(run: CanonicalRun, powod_pl: str) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "dostepny": False,
        "powod_pl": powod_pl,
        "linie": [],
    }


def zbuduj_pakiet_nastaw(
    run: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> tuple[str, bytes]:
    """Zbuduj pakiet dowodowy nastaw: ``(nazwa_pliku, zawartość ZIP)``.

    Cała fizyka (dwa warianty zwarciowe + wariant rozpływu) po stronie serwera —
    wołający podaje wyłącznie tożsamość kotwicy i trzy wybory inżynierskie.
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc)) from exc

    wejscie = nastawy.wejscie
    wynik_silnika = nastawy.wynik
    ei = wejscie.engine_input

    pack_input = ProtectionSettingsProofInput(
        project_name=wejscie.project_name,
        case_name=wejscie.case_name,
        line_id=ei.line_id,
        line_name=wejscie.line_name,
        run_timestamp=wejscie.run_timestamp,
        solver_version=wejscie.solver_version,
        cross_section_mm2=ei.cross_section_mm2,
        conductor_material=ei.conductor_material,
        length_km=ei.length_km,
        i_nominal_a=ei.i_nominal_a,
        ik3_max_beginning_a=ei.ik3_max_beginning_a,
        ik3_min_beginning_a=ei.ik3_min_beginning_a,
        ik3_max_end_a=ei.ik3_max_end_a,
        ik3_min_end_a=ei.ik3_min_end_a,
        ik2_min_end_a=ei.ik2_min_end_a,
        ik_max_next_bus_a=ei.ik_max_next_bus_a,
        i_load_max_a=ei.i_load_max_a,
        i_delayed_a=wynik_silnika.delayed.i_setting_a,
        t_delayed_s=wynik_silnika.delayed.t_setting_s,
        i_instantaneous_a=wynik_silnika.instantaneous.i_setting_a,
        i_th_dop_a=wynik_silnika.thermal.i_th_dop_a,
        j_thn=wynik_silnika.thermal.j_thn,
        delta_t_s=ei.delta_t_s,
        k_b=ei.k_b,
        k_bth=ei.k_bth,
    )

    context = ProofPackContext(
        project_id=str(run.project_id or ""),
        case_id=str(run.case_id),
        run_id=str(run.id),
        snapshot_id=str(run.snapshot_hash),
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    try:
        zawartosc = ProtectionSettingsProofPack.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietNastawError(f"Nie udało się złożyć pakietu dowodowego nastaw: {exc}") from exc
    nazwa = f"pakiet_dowodowy_nastawy__{run.id}__{line_id}.zip"
    return nazwa, zawartosc


def zbuduj_odpowiedz_nastaw_json(
    run: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Nastawy I>/I>> w postaci JSON — TA SAMA fizyka co pakiet dowodowy ZIP
    (karta W3-C1, reguła KLASA-NIE-INSTANCJA: jeden rachunek — `oblicz_nastawy`
    — dwa rendery, ZIP i JSON — nigdy druga niezależna ścieżka).

    Zwraca ``wynik`` (`ProtectionSettingsResult.to_dict()`), ``wejscie``
    (proweniencja: kotwica, gałąź maksymalna/minimalna, chroniony odcinek,
    kolejna szyna, parametry inżynierskie) i ``dostepnosc_pakietu`` (zawsze
    ``True`` gdy ta funkcja zwróciła wynik — fizyka pakietu ZIP jest DOKŁADNIE
    tą samą, którą właśnie policzono).
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc)) from exc

    return {
        "wynik": nastawy.wynik.to_dict(),
        "wejscie": _proweniencja_wejscia(
            run, nastawy=nastawy, line_id=line_id, next_bus_id=next_bus_id, c_min=c_min
        ),
        "dostepnosc_pakietu": True,
    }


def zbuduj_odpowiedz_dopasowania(
    run: CanonicalRun,
    *,
    device_id: str,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Dopasowanie nastaw Hoppela do aparatu (karta W3-C1, decyzja §0.4).

    Ta sama fizyka (`oblicz_nastawy`) mapowana na wymaganie aparatu
    (`mapper.wymaganie_z_nastaw`) i dobór (`pipeline.dopasuj_do_aparatu`) —
    JSON zwykły, bez koperty biegu (`AnalysisRunEnvelope` w tym torze zbędny,
    patrz kasacja `protection.device_mapping.v0`).
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc)) from exc

    wymaganie = wymaganie_z_nastaw(nastawy.wynik)
    dopasowanie = dopasuj_do_aparatu(wymaganie, device_id=device_id)
    return {
        **dopasowanie,
        "proweniencja_nastaw": _proweniencja_wejscia(
            run, nastawy=nastawy, line_id=line_id, next_bus_id=next_bus_id, c_min=c_min
        ),
    }


def _proweniencja_wejscia(
    run: CanonicalRun,
    *,
    nastawy: Any,
    line_id: str,
    next_bus_id: str,
    c_min: float,
) -> dict[str, Any]:
    """Proweniencja WHITE BOX wspólna dla trasy JSON i doboru aparatu: skąd
    dokładnie wzięły się liczby — kotwica, gałąź c_max/c_min, wybory inżyniera.

    Warianty c_min/2F/PF policzone przez `batch_run.zbuduj_wejscie_nastaw` NIE
    są tu identyfikowane osobno (ta funkcja jest FROZEN przez harness złotych
    hashy `tests/golden/parytet_scenariuszy/` — nowe pole na jej wyniku
    zmieniłoby zawartość hashowaną, patrz `KLUCZE_WYKLUCZONE` w harnessie).
    Proweniencja niesie więc to, co dostępne BEZ dotykania tamtego kontraktu:
    tożsamość kotwicy, jej współczynnik c_max, wybory inżyniera i pełne dane
    wejścia silnika (już WHITE BOX — `ei.*` poniżej), z których każda liczba
    wyniku da się odtworzyć ręcznie.
    """
    wejscie = nastawy.wejscie
    ei = wejscie.engine_input
    return {
        "kotwica_run_id": str(run.id),
        "c_max": run.options.get("c_factor"),
        "c_min": c_min,
        "line_id": line_id,
        "next_bus_id": next_bus_id,
        "project_name": wejscie.project_name,
        "case_name": wejscie.case_name,
        "line_name": wejscie.line_name,
        "run_timestamp": wejscie.run_timestamp.isoformat(),
        "solver_version": wejscie.solver_version,
        "engine_input": {
            "cross_section_mm2": ei.cross_section_mm2,
            "conductor_material": ei.conductor_material,
            "length_km": ei.length_km,
            "i_nominal_a": ei.i_nominal_a,
            "ik3_max_beginning_a": ei.ik3_max_beginning_a,
            "ik3_min_beginning_a": ei.ik3_min_beginning_a,
            "ik3_max_end_a": ei.ik3_max_end_a,
            "ik3_min_end_a": ei.ik3_min_end_a,
            "ik2_min_end_a": ei.ik2_min_end_a,
            "ik_max_next_bus_a": ei.ik_max_next_bus_a,
            "i_load_max_a": ei.i_load_max_a,
            "delta_t_s": ei.delta_t_s,
            "k_b": ei.k_b,
            "k_bth": ei.k_bth,
        },
    }
