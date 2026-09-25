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
(prąd obciążenia maksymalnego). Jeden bieg kanoniczny niesie JEDEN `c_factor`
— sam kontrakt wejścia zwarciowego (`enm/canonical_analysis.py::_c_factor_punktu`,
klucz `c_factor` w `_KLUCZE_WEJSCIOWE_WIERSZA_ZWARCIA`) niesie WYŁĄCZNIE tę
jedną wartość na bieg (klucz gałęzi min ALBO max, drugi zostaje `None`; przed
kasacją V12K-189 — karta W3-C1, 2026-09 — tę samą konwencję dokumentował też
skasowany `overcurrent/input_adapter.py::_build_fault_levels`).

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
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from application.nazwy_biegu import nazwa_projektu_z_migawki
from application.protection_settings.engine import (
    ProtectionSettingsEngine,
    ProtectionSettingsInput,
    ProtectionSettingsResult,
)
from application.protection_settings.zacisk_zabezpieczenia import (
    OdmowaZacisku,
    Zacisk,
    ZrodloZacisku,
    rozstrzygnij_zacisk,
)
from enm.canonical_analysis import (
    CanonicalRun,
    bieg_wariantu,
    build_branch_results,
    wykonaj_bieg_w_pamieci,
)
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu
from enm.scenariusze import SCENARIUSZ_NORMALNY, apply_scenario

#: Rodzaje gałęzi ENM kwalifikowane jako "linia chroniona" — mają impedancję
#: jednostkową, długość i mogą nieść dane katalogowe cieplne (F-K1). Aparat
#: łączeniowy i transformator NIE są liniami: wzory Hoppela dotyczą przewodu.
RODZAJE_LINII: frozenset[str] = frozenset({"line_overhead", "cable"})

#: c_factor rozdzielający gałąź maksymalną (kotwica) od minimalnej. IEC 60909-0
#: Tabela 1: dla SN c_max >= 1,0. Kotwica MUSI być gałęzią maksymalną — bieg
#: minimalny liczymy sami jako wariant, nigdy z osobnej kotwicy.
C_MAX_MIN_DOPUSZCZALNY = 1.0


class BrakDanychNastawError(ValueError):
    """Zbiorczego biegu nastaw nie da się złożyć dla podanych parametrów (powód PL).

    Brama pakietu dowodowego (`pakiet_nastaw.py`) tłumaczy ten wyjątek na odpowiedź
    HTTP i pokazuje powód wprost — zero cichego pominięcia. `kod` niesie kod z kanonu
    kodów gotowości, gdy odmowa go ma (np. zacisk zabezpieczenia, decyzja O-51).
    """

    def __init__(self, powod_pl: str, *, kod: str | None = None) -> None:
        super().__init__(powod_pl)
        self.kod = kod


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
    """Kompletne wejście silnika nastaw + nagłówek dowodu, zebrane z trzech biegów.

    Nazwy przypadku obliczeniowego tu NIE MA (karta #144): biegi jej nie niosą — pole
    `case_name` niosło dawniej identyfikator przypadku. Nagłówek dokumentu dostaje nazwę
    przypadku od wołającego (`application.nazwy_biegu.nazwa_przypadku_z_bazy`).
    """

    engine_input: ProtectionSettingsInput
    project_name: str
    line_name: str
    run_timestamp: datetime
    solver_version: str
    #: Zacisk chronionej linii, przy którym stoi zabezpieczenie (decyzja O-51): orientacja
    #: pakietu („początek" = ten zacisk) i miejsce prądu obciążenia `i_load_max_a`.
    zacisk_zabezpieczenia: Zacisk
    #: Skąd zacisk: z modelu (przypięcie zabezpieczenia do wyłącznika) albo ze wskazania.
    zrodlo_zacisku: ZrodloZacisku


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
    return DaneLinii(
        ref_id=ref_id,
        # Nazwa z modelu albo opis rodzaju gałęzi („Kabel bez nazwy"), nigdy
        # identyfikator (karta #144).
        nazwa=nazwa_elementu(surowa, "branches"),
        from_bus_ref=from_bus_ref,
        to_bus_ref=to_bus_ref,
        cross_section_mm2=cross,
        conductor_material=material,
        length_km=length,
        i_nominal_a=i_n,
    )


def kandydaci_nastepnej_szyny(
    snapshot: dict[str, Any] | None, line_id: str, zacisk: Zacisk
) -> list[str]:
    """Szyny osiągalne JEDNYM krokiem w dół od KOŃCA chronionej linii.

    Końcem jest zacisk PRZECIWNY do zacisku zabezpieczenia (`zacisk`, rozstrzygnięty
    przez `zacisk_zabezpieczenia.rozstrzygnij_zacisk` — decyzja O-51: orientacja pakietu
    z jednego źródła, nie z konwencji `from`). Kandydat = druga szyna dowolnej INNEJ
    gałęzi liniowej dotykającej szyny końca. Lista bywa pusta (linia jest ostatnim
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
    koniec = linia.to_bus_ref if zacisk == "od" else linia.from_bus_ref
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


def szyna_ma_prad_zwarciowy(raw_result: dict[str, Any] | None, bus_ref: str) -> bool:
    """Czy WYNIK kotwicy niesie prąd zwarcia 3F dla tej szyny modelu.

    JEDEN predykat dla WEJŚCIA (lista kandydatów pokazywana projektantowi) i
    WYJŚCIA (`zbuduj_wejscie_nastaw`, które bez tego prądu odmawia) — reguła
    „predykaty parami" z jednego źródła prawdy.

    DLACZEGO POWSTAŁ (karta HARNESS-RESZTA-2, 2026-09-17). Dostępność pakietu
    nastaw (`application/proof_engine/pakiet_nastaw.py::dostepnosc_pakietu_nastaw`)
    deklarowała w docstringu, że „dostępny" nie może rozjechać się z „da się
    pobrać" — a rozjeżdżała się na KAŻDEJ sieci rejestru. Pomiar bezpośredni na
    HEAD (bieg `short_circuit_sn` + próba `zbuduj_odpowiedz_nastaw_json` dla
    KAŻDEJ reklamowanej pary): GN_01 3 pary / 0 działających, GN_02 2/0,
    GN_03 3/0, GN_04 1/0, GN_05 1/0, `gpzFeeder.enm.json` 2/0 — RAZEM 12
    reklamowanych par, 0 działających, wszystkie z tym samym powodem
    („kotwica nie zawiera prądu zwarcia 3F dla początku, końca chronionego
    odcinka albo kolejnej szyny"). Ekran nastaw prowadził projektanta w ślepy
    zaułek na każdej sieci, jaką repozytorium ma.

    Powód rozjazdu: kandydatów wyznaczała WYŁĄCZNIE topologia i komplet danych
    katalogowych, a budowa wymaga DODATKOWO, żeby trzy szyny (początek i koniec
    chronionego odcinka oraz kolejna szyna) były RAPORTOWALNYMI punktami
    zwarcia biegu — szyny pomocnicze magistrali (`helper_bus`,
    `enm/assembler.py::skip_short_circuit_target`) punktami nie są.
    """
    return _prad_zwarciowy_w_wezle(raw_result, ref_to_graph_id(bus_ref)) is not None


def _opcjonalna_liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    liczba = float(wartosc)
    return liczba if math.isfinite(liczba) else None


def _opcje_audit2_kotwicy(kotwica: CanonicalRun) -> dict[str, Any]:
    """Para opcji konfiguracji audytu 2 stacji przejęta z kotwicy (CV-4.2b).

    Warianty nastaw liczą TEN SAM model co kotwica — jeśli kotwicę policzono z
    korektami audytu 2 (uziemienie punktu neutralnego → Z0, zaczepy), warianty
    bez tej pary liczyłyby inną sieć (do tej karty: cicho, bez korekt). Brak
    pary w kotwicy = brak pary w wariantach.
    """
    return {
        klucz: kotwica.options[klucz]
        for klucz in ("audit2_project_id", "audit2_station_id")
        if klucz in kotwica.options
    }


def _opcje_wariantu_zwarciowego(
    kotwica: CanonicalRun, *, fault_type: str, c_factor: float
) -> dict[str, Any]:
    """Opcje wariantu zwarciowego (CV-3-W): `fault_type`/`c_factor` WŁASNE wariantu,
    `thermal_time_seconds` i para audytu 2 przejęte z opcji kotwicy (SC nie zna
    innej wartości; ten sam model stacji co kotwica)."""
    return {
        "fault_type": fault_type,
        "c_factor": c_factor,
        "thermal_time_seconds": float(kotwica.options.get("thermal_time_seconds", 1.0)),
        **_opcje_audit2_kotwicy(kotwica),
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
    zacisk_zabezpieczenia: Zacisk | None,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    t_upstream_s: float = 0.0,
    spz_enabled: bool = True,
    spz_pause_s: float = 0.5,
    uow_factory: Callable[[], Any] | None = None,
) -> WejscieNastawZBiegow:
    """Zbuduj komplet wejścia silnika nastaw z kotwicy + dwóch wariantów zwarciowych
    + jednego wariantu rozpływu — WSZYSTKIE trzy na migawce kotwicy.

    Podnosi `BrakDanychNastawError` (powód po polsku) na każdym brakującym ogniwie —
    nigdy nie zwraca wejścia z podstawioną wartością.

    `uow_factory` (CV-4.2b): fabryka `UnitOfWork` wołającego — trzy warianty
    dziedziczą parę audytu 2 kotwicy, więc kotwica z konfiguracją audytu 2
    stacji wymaga jej do odczytu tej konfiguracji (`wykonaj_bieg_w_pamieci`).

    `zacisk_zabezpieczenia` (decyzja O-51, wariant (b)): jawne wskazanie inżyniera
    (`od`/`do`) albo `None`. BEZ wartości domyślnej — rozstrzyga `rozstrzygnij_zacisk`
    (model → wskazanie → odmowa nazwana z kodem). Z rozstrzygniętego zacisku bierze się
    orientacja CAŁEGO pakietu: „początek" odcinka (Ik3 max/min na początku, prąd
    obciążenia w miejscu zabezpieczenia), „koniec" (Ik3 na końcu, Ik2 min) i kolejna
    strefa za końcem.
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
    if c_max is None or c_max < C_MAX_MIN_DOPUSZCZALNY:
        raise BrakDanychNastawError(
            f"Współczynnik napięciowy kotwicy c={kotwica.options.get('c_factor')!r} "
            f"nie jest wartością gałęzi maksymalnej (wymagane c >= {C_MAX_MIN_DOPUSZCZALNY})."
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

    rozstrzygniecie = rozstrzygnij_zacisk(kotwica.snapshot, line_id, zacisk_zabezpieczenia)
    if isinstance(rozstrzygniecie, OdmowaZacisku):
        raise BrakDanychNastawError(rozstrzygniecie.powod_pl, kod=rozstrzygniecie.kod)

    kandydaci = kandydaci_nastepnej_szyny(kotwica.snapshot, line_id, rozstrzygniecie.zacisk)
    if next_bus_id not in kandydaci:
        opis_kandydatow = ", ".join(kandydaci) if kandydaci else "brak — linia bez gałęzi w dół"
        raise BrakDanychNastawError(
            f"Szyna {next_bus_id} nie jest kandydatem kolejnej strefy selektywności "
            f"dla linii {line_id} (kandydaci: {opis_kandydatow}) — wybierz szynę z "
            "listy kandydatów."
        )

    graf_poczatku = ref_to_graph_id(rozstrzygniecie.szyna_zacisku_ref)
    graf_konca = ref_to_graph_id(rozstrzygniecie.szyna_przeciwna_ref)
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
        wykonaj_bieg_w_pamieci(wariant_3f_cmin, uow_factory=uow_factory)
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
        wykonaj_bieg_w_pamieci(wariant_2f_cmin, uow_factory=uow_factory)
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

    # W3-G1 (2026-09-10): kotwica jest ZAWSZE short_circuit_sn (asercja u góry funkcji)
    # — nie ma bazowego biegu PF, więc `options=None` nie miałby czego dziedziczyć
    # (`bieg_wariantu` dziedziczy `bazowy.options`, a `kotwica.options` nigdy nie
    # niesie `solver_method`). Metoda wariantu PF audytu 2 jest więc jawnie NR:
    # ten sam prąd obciążeniowy referencyjny niezależnie od tego, jaką metodą
    # policzono INNE, niepowiązane biegi PF w projekcie (dowód pakietu nastaw ma
    # być powtarzalny, nie zależny od wyboru operatora gdzie indziej).
    wariant_pf = bieg_wariantu(
        kotwica,
        migawka_kotwicy,
        analysis_type="PF",
        options={**_opcje_audit2_kotwicy(kotwica), "solver_method": "newton-raphson"},
    )
    try:
        wykonaj_bieg_w_pamieci(wariant_pf, uow_factory=uow_factory)
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
    i_load_max_a = _prad_w_miejscu_zabezpieczenia(wariant_pf, linia, rozstrzygniecie.zacisk)
    if i_load_max_a is None:
        raise BrakDanychNastawError(
            f"Wariant rozpływu mocy nie policzył prądu zacisku {rozstrzygniecie.zacisk} "
            f"gałęzi {line_id} — chroniony odcinek nie jest częścią rozwiązanej wyspy "
            "zasilanej."
        )

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

    return WejscieNastawZBiegow(
        engine_input=engine_input,
        # Nazwa modelu z nagłówka migawki kotwicy albo opis braku — nigdy identyfikator
        # projektu (karta #144).
        project_name=nazwa_projektu_z_migawki(kotwica.snapshot),
        line_name=linia.nazwa,
        run_timestamp=_znacznik_czasu(kotwica),
        solver_version=solver_version,
        zacisk_zabezpieczenia=rozstrzygniecie.zacisk,
        zrodlo_zacisku=rozstrzygniecie.zrodlo,
    )


def _prad_w_miejscu_zabezpieczenia(
    wariant_pf: CanonicalRun, linia: DaneLinii, zacisk: Zacisk
) -> float | None:
    """Prąd obciążenia [A] w miejscu zabezpieczenia — prąd TEGO zacisku linii (klasa P9).

    JEDNA droga z tabelą gałęzi (`enm.canonical_analysis.build_branch_results`, predykaty
    parami): zacisk `od` = kolumna `i_a` (prąd strony `from` rdzenia rozpływu), zacisk `do`
    = kolumna `i_do_a` (prąd z mocy strony `to` i napięcia węzła `to`,
    `analysis/obciazenie_galezi.py`). Ten sam wiersz czyta prąd roboczy urządzeń
    koordynacji po stronie interfejsu. Brak danej = `None` (odmowa wyżej), nigdy zero.
    """
    graf_linii = ref_to_graph_id(linia.ref_id)
    wiersz = next(
        (w for w in build_branch_results(wariant_pf)["rows"] if w["branch_id"] == graf_linii),
        None,
    )
    if wiersz is None:
        return None
    return _opcjonalna_liczba(wiersz["i_a" if zacisk == "od" else "i_do_a"])


def _znacznik_czasu(run: CanonicalRun) -> datetime:
    """Znacznik czasu dowodu = moment zakończenia kotwicy (deterministyczny)."""
    znacznik = run.finished_at or run.created_at
    if znacznik.tzinfo is None:
        return znacznik.replace(tzinfo=UTC)
    return znacznik


@dataclass(frozen=True)
class NastawyZBiegu:
    """Wynik silnika Hoppela + pełna proweniencja wejścia — JEDNO obliczenie,
    które dzielą trasa JSON (`GET .../nastawy`), pakiet dowodowy ZIP
    (`zbuduj_pakiet_nastaw`) i dobór aparatu (`GET .../nastawy/dopasowanie`)
    (karta W3-C1, reguła KLASA-NIE-INSTANCJA — predykaty parami: jeden rachunek,
    wiele renderów, nigdy druga niezależna ścieżka tej samej fizyki)."""

    wynik: ProtectionSettingsResult
    wejscie: WejscieNastawZBiegow


def oblicz_nastawy(
    run: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    zacisk_zabezpieczenia: Zacisk | None,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> NastawyZBiegu:
    """Nastawy I>/I>> dla kotwicy + wyboru inżyniera — silnik Hoppela wywołany
    RAZ na kompletnym wejściu zbudowanym z trzech biegów (kotwica c_max + wariant
    c_min + wariant rozpływu, patrz `zbuduj_wejscie_nastaw`).

    Podnosi `BrakDanychNastawError` (powód po polsku) na każdym brakującym
    ogniwie — dokładnie jak `zbuduj_wejscie_nastaw`, które ta funkcja owija.
    """
    wejscie = zbuduj_wejscie_nastaw(
        run,
        line_id=line_id,
        next_bus_id=next_bus_id,
        c_min=c_min,
        zacisk_zabezpieczenia=zacisk_zabezpieczenia,
        delta_t_s=delta_t_s,
        k_b=k_b,
        k_bth=k_bth,
        uow_factory=uow_factory,
    )
    wynik = ProtectionSettingsEngine.calculate(wejscie.engine_input)
    return NastawyZBiegu(wynik=wynik, wejscie=wejscie)
