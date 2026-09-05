"""Bieg ZBIORCZY nastaw zabezpieczeń I>/I>> — orkiestracja gałęzi c_max/c_min/rozpływ.

STATUS: CANONICAL (karta PACK-NASTAWY, domknięcie długu PACK-DLUG-NASTAWY).

DEFEKT, KTÓRY TO ZAMYKA. `application/protection_settings/engine.py` (metoda Hoppela,
PN-EN 60255, IRiESD ENEA) i generator pakietu dowodowego
(`application/proof_engine/packs/protection_settings.py`) istniały od dawna, ale
DZIEWIĘĆ z 22 pól wejściowych dowodu nie miało dostawcy (rejestr V12K, wiersz
PACK-BEZ-KONSUMENTA): trzy z gałęzi c_min (`ik3_min_beginning_a`, `ik3_min_end_a`,
`ik2_min_end_a`), jedno z rozpływu (`i_load_max_a`) i pięć nastaw — wyjść silnika
(`i_delayed_a`, `t_delayed_s`, `i_instantaneous_a`, `i_th_dop_a`, `j_thn`).

POWÓD ARCHITEKTONICZNY (dlaczego istniejąca brama pakietu przebiegu nie wystarcza).
`application/proof_engine/pakiet_biegu.py` mapuje JEDEN przebieg kanoniczny na JEDEN
pakiet — a dobór nastaw metodą Hoppela z definicji potrzebuje TRZECH: zwarcia
trójfazowego przy c_max (wytrzymałość aparatury, selektywność), zwarcia trójfazowego
PRZY c_min (czułość I>>) i zwarcia dwufazowego przy c_min (czułość I>), oraz rozpływu
(prąd obciążenia maksymalnego). Jeden bieg kanoniczny niesie JEDEN `c_factor` — tor
nadprądowy `application/analyses/protection/overcurrent/input_adapter.py::_build_fault_levels`
dokumentuje to wprost (klucz gałęzi min ALBO max, drugi zostaje `None`).

MECHANIZM WARIANTOWANIA (CV-3-W: JEDYNA fabryka kopii migawki z nadpisaniami
`enm.scenariusze.apply_scenario` + JEDYNA fabryka biegu wariantu w pamięci
`enm.canonical_analysis.bieg_wariantu` — ten sam mechanizm, którego po migracji
używają `application/analyses/kontyngencje_n1.py`, `pq_area.py`,
`hosting_capacity.py`, `odpowiedz_osd.py`, `dobor_kompensacji.py`).
Bazą jest ISTNIEJĄCY, PERSYSTOWANY, zakończony bieg zwarcia trójfazowego przy c_max
(„kotwica") — z jego zamrożonego wyniku CZYTAMY (bez przeliczania) prądy c_max na
początku, końcu odcinka i na sąsiedniej szynie (te trzy pola JUŻ miały dostawcę —
kotwica liczy zwarcie na WSZYSTKICH szynach jednym biegiem). Gałąź c_min i rozpływ
to WARIANTY WEJŚCIA na migawce `apply_scenario(model_kotwicy, SCENARIUSZ_NORMALNY)`
(model kotwicy walidowany RAZ, migawka bez nadpisań — model w magazynie
nietknięty), uruchamiane ISTNIEJĄCYM solverem przez ISTNIEJĄCĄ ścieżkę wykonania
(`enm.canonical_analysis.wykonaj_bieg_w_pamieci` — ta sama dyspozycja, której
używa bieg kanoniczny `execute_run`), W PAMIĘCI, bez persystencji — dokładnie jak
warianty N-1/hosting-capacity/PQ. Wybór „w pamięci" (a nie trzy osobne persystowane
biegi) jest ŚWIADOMY: pakiet dowodowy czyta wyniki read-only z JEDNEGO wywołania tej
warstwy, więc trzy warianty spójne z TĄ SAMĄ migawką kotwicy (ten sam `snapshot_hash`)
nie mogą się rozjechać — trzy niezależnie utworzone i persystowane biegi mogłyby
powstać z RÓŻNYCH migawek modelu (model zmieniony między biegami), co byłoby dokładnie
tą klasą defektu, którą reguła KLASA-NIE-INSTANCJA każe wykrywać.

ZERO FABRYKACJI. Każde z 9 pól ma dostawcę wymienionego w tabeli w module
`application/proof_engine/pakiet_nastaw.py` (gate). Element sieci, który nie niesie
kompletu danych katalogowych (przekrój, materiał, prąd znamionowy), NIE JEST OFERTĄ
(zwraca `None` z listy kandydatów), zamiast dostać wartość zastępczą. Zwarcie, które
nie zbiega / solver podnosi wyjątek, kończy się `BrakDanychNastawError` z powodem po
polsku — nigdy cichym podstawieniem.

NOT-A-SOLVER: ten moduł nie liczy fizyki. Woła WYŁĄCZNIE
`wykonaj_bieg_w_pamieci` (solver IEC 60909 / Newton-Raphson przez kanoniczną
dyspozycję `enm.canonical_analysis` — surowe parametry zwarcia nie opuszczają
tamtej warstwy, inwariant `no_direct_fault_params_guard`) i
`ProtectionSettingsEngine.calculate` (interpretacja istniejących wyników — metoda
Hoppela, sama deklaruje się jako NIE-solver). Ten moduł wyłącznie zestawia ich wejścia
i odczytuje wyjścia.

next_bus_id (szyna dla warunku selektywności) jest PARAMETREM WYMAGANYM, nie zgadywanym
— sieć może mieć więcej niż jedną gałąź w dół od końca chronionej linii (rozgałęzienie),
więc wybór „która gałąź jest kolejną strefą zabezpieczenia" należy do inżyniera, nie do
kodu (ten sam princyp co wybór odcinka w `voltage_drop_binding.py`).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from application.protection_settings.engine import ProtectionSettingsInput
from enm.canonical_analysis import CanonicalRun, bieg_wariantu, wykonaj_bieg_w_pamieci
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.scenariusze import SCENARIUSZ_NORMALNY, apply_scenario

#: Rodzaje gałęzi ENM kwalifikowane jako "linia chroniona" — mają impedancję
#: jednostkową, długość i mogą nieść dane katalogowe cieplne (F-K1). Aparat
#: łączeniowy i transformator NIE są liniami: wzory Hoppela dotyczą przewodu.
RODZAJE_LINII: frozenset[str] = frozenset({"line_overhead", "cable"})

#: c_factor rozdzielający gałąź maksymalną (kotwica) od minimalnej. IEC 60909-0
#: Tabela 1: dla SN c_max >= 1,0. Kotwica MUSI być gałęzią maksymalną — bieg
#: minimalny liczymy sami jako wariant, nigdy z osobnej kotwicy.
_C_MAX_MIN_DOPUSZCZALNY = 1.0


class BrakDanychNastawError(ValueError):
    """Zbiorczego biegu nastaw nie da się złożyć dla podanych parametrów (powód PL).

    Brama pakietu dowodowego (`pakiet_nastaw.py`) tłumaczy ten wyjątek na odpowiedź
    HTTP i pokazuje powód wprost — zero cichego pominięcia.
    """


@dataclass(frozen=True)
class DaneLinii:
    """Dane katalogowe chronionej linii/kabla — kompletne albo w ogóle."""

    ref_id: str
    nazwa: str
    from_bus_ref: str
    to_bus_ref: str
    cross_section_mm2: float
    conductor_material: str
    length_km: float
    i_nominal_a: float


@dataclass(frozen=True)
class WejscieNastawZBiegow:
    """Kompletne wejście silnika nastaw + nagłówek dowodu, zebrane z trzech biegów."""

    engine_input: ProtectionSettingsInput
    project_name: str
    case_name: str
    line_name: str
    run_timestamp: datetime
    solver_version: str


def linie_kandydujace(snapshot: dict[str, Any] | None) -> list[DaneLinii]:
    """Linie/kable migawki z KOMPLETEM danych katalogowych, posortowane po ref_id.

    Gałąź bez przekroju, materiału albo prądu znamionowego NIE jest kandydatem —
    zero wartości zastępczej (zero fabrykacji).
    """
    wynik: list[DaneLinii] = []
    for surowa in (snapshot or {}).get("branches") or []:
        dane = _dane_linii_z_galezi(surowa)
        if dane is not None:
            wynik.append(dane)
    return sorted(wynik, key=lambda pozycja: pozycja.ref_id)


def _dane_linii_z_galezi(surowa: Any) -> DaneLinii | None:
    if not isinstance(surowa, dict):
        return None
    if str(surowa.get("type")) not in RODZAJE_LINII:
        return None
    ref_id = surowa.get("ref_id")
    from_bus_ref = surowa.get("from_bus_ref")
    to_bus_ref = surowa.get("to_bus_ref")
    if not isinstance(ref_id, str) or not ref_id:
        return None
    if not isinstance(from_bus_ref, str) or not isinstance(to_bus_ref, str):
        return None
    cross = _opcjonalna_liczba(surowa.get("cross_section_mm2"))
    material = surowa.get("conductor_material")
    length = _opcjonalna_liczba(surowa.get("length_km"))
    rating = surowa.get("rating")
    i_n = _opcjonalna_liczba(rating.get("in_a")) if isinstance(rating, dict) else None
    if cross is None or not isinstance(material, str) or not material:
        return None
    if length is None or length <= 0.0:
        return None
    if i_n is None or i_n <= 0.0:
        return None
    nazwa = surowa.get("name")
    return DaneLinii(
        ref_id=ref_id,
        nazwa=nazwa if isinstance(nazwa, str) and nazwa.strip() else ref_id,
        from_bus_ref=from_bus_ref,
        to_bus_ref=to_bus_ref,
        cross_section_mm2=cross,
        conductor_material=material,
        length_km=length,
        i_nominal_a=i_n,
    )


def kandydaci_nastepnej_szyny(snapshot: dict[str, Any] | None, line_id: str) -> list[str]:
    """Szyny osiągalne JEDNYM krokiem w dół od końca chronionej linii.

    Kandydat = druga szyna dowolnej INNEJ gałęzi liniowej dotykającej szyny końca
    (``to_bus_ref``) chronionej linii. Lista bywa pusta (linia jest ostatnim
    odcinkiem promienia — brak warunku selektywności w dół) albo wieloelementowa
    (rozgałęzienie) — w obu przypadkach wybór NIE jest zgadywany przez kod.
    """
    linia = next(
        (
            dane
            for surowa in (snapshot or {}).get("branches") or []
            if (dane := _dane_linii_z_galezi(surowa)) is not None and dane.ref_id == line_id
        ),
        None,
    )
    if linia is None:
        return []
    koniec = linia.to_bus_ref
    kandydaci: set[str] = set()
    for surowa in (snapshot or {}).get("branches") or []:
        inna = _dane_linii_z_galezi(surowa)
        if inna is None or inna.ref_id == line_id:
            continue
        if inna.from_bus_ref == koniec:
            kandydaci.add(inna.to_bus_ref)
        elif inna.to_bus_ref == koniec:
            kandydaci.add(inna.from_bus_ref)
    return sorted(kandydaci)


def _opcjonalna_liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    liczba = float(wartosc)
    return liczba if math.isfinite(liczba) else None


def _opcje_wariantu_zwarciowego(
    kotwica: CanonicalRun, *, fault_type: str, c_factor: float
) -> dict[str, Any]:
    """Opcje wariantu zwarciowego (CV-3-W): `fault_type`/`c_factor` WŁASNE wariantu,
    `thermal_time_seconds` przejęty z opcji kotwicy (SC nie zna innej wartości)."""
    return {
        "fault_type": fault_type,
        "c_factor": c_factor,
        "thermal_time_seconds": float(kotwica.options.get("thermal_time_seconds", 1.0)),
    }


def _prad_zwarciowy_w_wezle(raw_result: dict[str, Any] | None, graph_node_id: str) -> float | None:
    """`ikss_a` zwarcia w podanym węźle grafu — z zamrożonych wierszy biegu."""
    for wiersz in (raw_result or {}).get("results") or []:
        if not isinstance(wiersz, dict):
            continue
        if wiersz.get("fault_node_id") != graph_node_id:
            continue
        return _opcjonalna_liczba(wiersz.get("ikss_a"))
    return None


def zbuduj_wejscie_nastaw(
    kotwica: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    t_upstream_s: float = 0.0,
    spz_enabled: bool = True,
    spz_pause_s: float = 0.5,
) -> WejscieNastawZBiegow:
    """Zbuduj komplet wejścia silnika nastaw z kotwicy + dwóch wariantów zwarciowych
    + jednego wariantu rozpływu — WSZYSTKIE trzy na migawce kotwicy.

    Podnosi `BrakDanychNastawError` (powód po polsku) na każdym brakującym ogniwie —
    nigdy nie zwraca wejścia z podstawioną wartością.
    """
    if kotwica.status != "FINISHED":
        raise BrakDanychNastawError(
            f"Przebieg {kotwica.id} nie jest zakończony (status={kotwica.status}) — "
            "bieg zbiorczy nastaw wymaga zakończonego zwarcia trójfazowego jako kotwicy."
        )
    if kotwica.analysis_type != "short_circuit_sn":
        raise BrakDanychNastawError(
            "Bieg zbiorczy nastaw wymaga jako kotwicy przebiegu zwarcia trójfazowego "
            f"(short_circuit_sn); otrzymano rodzaj: {kotwica.analysis_type}."
        )
    kotwica_wynik = kotwica.raw_result or {}
    if kotwica_wynik.get("short_circuit_type") != "3F":
        raise BrakDanychNastawError(
            "Kotwica biegu zbiorczego nastaw musi być zwarciem TRÓJFAZOWYM (gałąź "
            "maksymalna c_max) — otrzymano typ: "
            f"{kotwica_wynik.get('short_circuit_type')!r}."
        )
    c_max = _opcjonalna_liczba(kotwica.options.get("c_factor", 1.10))
    if c_max is None or c_max < _C_MAX_MIN_DOPUSZCZALNY:
        raise BrakDanychNastawError(
            f"Współczynnik napięciowy kotwicy c={kotwica.options.get('c_factor')!r} "
            f"nie jest wartością gałęzi maksymalnej (wymagane c >= {_C_MAX_MIN_DOPUSZCZALNY})."
        )
    if not (0.0 < c_min <= c_max):
        raise BrakDanychNastawError(
            f"Współczynnik napięciowy gałęzi minimalnej c_min={c_min!r} musi być "
            f"dodatni i nie większy niż c_max={c_max!r} kotwicy."
        )

    linia = next(
        (dane for dane in linie_kandydujace(kotwica.snapshot) if dane.ref_id == line_id),
        None,
    )
    if linia is None:
        raise BrakDanychNastawError(
            f"Element {line_id} nie jest linią ani kablem z kompletem danych "
            "katalogowych (przekrój, materiał, prąd znamionowy) w migawce kotwicy."
        )

    kandydaci = kandydaci_nastepnej_szyny(kotwica.snapshot, line_id)
    if next_bus_id not in kandydaci:
        opis_kandydatow = ", ".join(kandydaci) if kandydaci else "brak — linia bez gałęzi w dół"
        raise BrakDanychNastawError(
            f"Szyna {next_bus_id} nie jest kandydatem kolejnej strefy selektywności "
            f"dla linii {line_id} (kandydaci: {opis_kandydatow}) — wybierz szynę z "
            "listy kandydatów."
        )

    graf_poczatku = ref_to_graph_id(linia.from_bus_ref)
    graf_konca = ref_to_graph_id(linia.to_bus_ref)
    graf_nastepnej = ref_to_graph_id(next_bus_id)

    ik3_max_beginning_a = _prad_zwarciowy_w_wezle(kotwica_wynik, graf_poczatku)
    ik3_max_end_a = _prad_zwarciowy_w_wezle(kotwica_wynik, graf_konca)
    ik_max_next_bus_a = _prad_zwarciowy_w_wezle(kotwica_wynik, graf_nastepnej)
    if ik3_max_beginning_a is None or ik3_max_end_a is None or ik_max_next_bus_a is None:
        raise BrakDanychNastawError(
            "Kotwica biegu zbiorczego nastaw nie zawiera prądu zwarcia 3F dla "
            "początku, końca chronionego odcinka albo kolejnej szyny — sprawdź, czy "
            "wszystkie trzy szyny są w migawce kotwicy raportowalnymi punktami zwarcia."
        )

    # CV-3-W: model kotwicy walidowany RAZ, migawka bez nadpisań (SCENARIUSZ_NORMALNY)
    # zbudowana RAZ i dzielona przez WSZYSTKIE trzy warianty — jedyna fabryka
    # kopii migawki (`apply_scenario`) i jedyna fabryka biegu wariantu w pamięci
    # (`bieg_wariantu`); model w magazynie i kotwica bazowa nietknięte.
    enm_kotwicy = EnergyNetworkModel.model_validate(kotwica.snapshot or {})
    migawka_kotwicy = apply_scenario(enm_kotwicy, SCENARIUSZ_NORMALNY)

    wariant_3f_cmin = bieg_wariantu(
        kotwica,
        migawka_kotwicy,
        analysis_type="short_circuit_sn",
        options=_opcje_wariantu_zwarciowego(kotwica, fault_type="3F", c_factor=c_min),
    )
    try:
        wykonaj_bieg_w_pamieci(wariant_3f_cmin)
    except Exception as exc:  # noqa: BLE001 — niezbieznosc/blad solvera = odmowa z powodem
        raise BrakDanychNastawError(
            f"Wariant zwarcia trójfazowego przy c_min={c_min} przerwany błędem "
            f"solvera: {type(exc).__name__}: {exc}"
        ) from exc
    ik3_min_beginning_a = _prad_zwarciowy_w_wezle(wariant_3f_cmin.raw_result, graf_poczatku)
    ik3_min_end_a = _prad_zwarciowy_w_wezle(wariant_3f_cmin.raw_result, graf_konca)
    if ik3_min_beginning_a is None or ik3_min_end_a is None:
        raise BrakDanychNastawError(
            f"Wariant zwarcia trójfazowego przy c_min={c_min} nie policzył prądu "
            "na początku albo końcu chronionego odcinka."
        )

    wariant_2f_cmin = bieg_wariantu(
        kotwica,
        migawka_kotwicy,
        analysis_type="short_circuit_sn",
        options=_opcje_wariantu_zwarciowego(kotwica, fault_type="2F", c_factor=c_min),
    )
    try:
        wykonaj_bieg_w_pamieci(wariant_2f_cmin)
    except Exception as exc:  # noqa: BLE001 — jak wyzej
        raise BrakDanychNastawError(
            f"Wariant zwarcia dwufazowego przy c_min={c_min} przerwany błędem "
            f"solvera: {type(exc).__name__}: {exc}"
        ) from exc
    ik2_min_end_a = _prad_zwarciowy_w_wezle(wariant_2f_cmin.raw_result, graf_konca)
    if ik2_min_end_a is None:
        raise BrakDanychNastawError(
            f"Wariant zwarcia dwufazowego przy c_min={c_min} nie policzył prądu "
            "na końcu chronionego odcinka."
        )

    wariant_pf = bieg_wariantu(kotwica, migawka_kotwicy, analysis_type="PF", options={})
    try:
        wykonaj_bieg_w_pamieci(wariant_pf)
    except Exception as exc:  # noqa: BLE001 — niezbieznosc rozplywu = odmowa z powodem
        raise BrakDanychNastawError(
            f"Wariant rozpływu mocy migawki kotwicy przerwany błędem solvera: "
            f"{type(exc).__name__}: {exc}"
        ) from exc
    pf_wynik = wariant_pf.raw_result or {}
    if not bool((pf_wynik.get("result_v1") or {}).get("converged", False)):
        raise BrakDanychNastawError(
            "Wariant rozpływu mocy migawki kotwicy nie osiągnął zbieżności — "
            "prąd obciążenia maksymalnego chronionego odcinka nie jest wynikiem."
        )
    graf_linii = ref_to_graph_id(line_id)
    prad_galezi_ka = (pf_wynik.get("branch_current_ka") or {}).get(graf_linii)
    i_load_max_a = _opcjonalna_liczba(prad_galezi_ka)
    if i_load_max_a is None:
        raise BrakDanychNastawError(
            f"Wariant rozpływu mocy nie policzył prądu gałęzi {line_id} — chroniony "
            "odcinek nie jest częścią rozwiązanej wyspy zasilanej."
        )
    i_load_max_a = i_load_max_a * 1000.0  # kA -> A

    pf_solver_version = pf_wynik.get("solver_version")
    solver_version = (
        f"IEC_60909;{pf_solver_version}"
        if isinstance(pf_solver_version, str) and pf_solver_version
        else "IEC_60909"
    )

    engine_input = ProtectionSettingsInput(
        line_id=linia.ref_id,
        line_name=linia.nazwa,
        cross_section_mm2=linia.cross_section_mm2,
        conductor_material=linia.conductor_material,
        length_km=linia.length_km,
        i_nominal_a=linia.i_nominal_a,
        ik3_max_beginning_a=ik3_max_beginning_a,
        ik3_min_beginning_a=ik3_min_beginning_a,
        ik3_max_end_a=ik3_max_end_a,
        ik3_min_end_a=ik3_min_end_a,
        ik2_min_end_a=ik2_min_end_a,
        ik_max_next_bus_a=ik_max_next_bus_a,
        i_load_max_a=i_load_max_a,
        delta_t_s=delta_t_s,
        k_b=k_b,
        k_bth=k_bth,
        t_upstream_s=t_upstream_s,
        spz_enabled=spz_enabled,
        spz_pause_s=spz_pause_s,
    )

    header = (kotwica.snapshot or {}).get("header") or {}
    project_name = str(header.get("name")) if header.get("name") else str(kotwica.project_id or "")

    return WejscieNastawZBiegow(
        engine_input=engine_input,
        project_name=project_name,
        case_name=str(kotwica.case_id),
        line_name=linia.nazwa,
        run_timestamp=_znacznik_czasu(kotwica),
        solver_version=solver_version,
    )


def _znacznik_czasu(run: CanonicalRun) -> datetime:
    """Znacznik czasu dowodu = moment zakończenia kotwicy (deterministyczny)."""
    znacznik = run.finished_at or run.created_at
    if znacznik.tzinfo is None:
        return znacznik.replace(tzinfo=UTC)
    return znacznik
