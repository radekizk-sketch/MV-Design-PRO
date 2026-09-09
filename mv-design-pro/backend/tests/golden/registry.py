"""Rejestr sieci wzorcowych (REFERENCE NETWORK REGISTRY) — jedno źródło klas przypadków.

Kanon: `docs/reference-networks/REFERENCE_NETWORK_REGISTRY.md` (kontrakt MAX PLATFORM
§30–§32). Rejestr jest ŻYWYM KATALOGIEM KLAS PRZYPADKÓW (D-40): wpis deklaruje klasę
problemu, istniejący materiał (budowniczych), klasę WYROCZNI i status. Wpis bez
niezależnej wyroczni ma klasę `REGRESSION_ONLY` i NIE jest dowodem fizyki (§32:
golden network ≠ self-test).

Dokument tabelaryczny `docs/reference-networks/REGISTRY_TABLE.md` jest GENEROWANY
z tego modułu (`backend/scripts/generuj_rejestr_sieci.py`); test
`tests/golden/test_registry.py` pilnuje, że dokument = rejestr, że każdy budowniczy
jest importowalny i wykonalny, oraz że pokrycie rodzin solverów wyroczniami nie
maleje (zapadka).
"""

from __future__ import annotations

import dataclasses
import importlib
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any


class KlasaWyroczni(str, Enum):
    ANALYTICAL = "ANALYTICAL"
    NORMATIVE = "NORMATIVE"
    PUBLISHED_BENCHMARK = "PUBLISHED_BENCHMARK"
    INDEPENDENTLY_VERIFIED = "INDEPENDENTLY_VERIFIED"
    REGRESSION_ONLY = "REGRESSION_ONLY"


class StatusSieci(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIAL = "PARTIAL"
    NOT_BUILT = "NOT_BUILT"


class PostacSieci(str, Enum):
    """Postać danych budowniczego. `ENM` = `EnergyNetworkModel` (lub słownik walidujący się jako ENM);
    `BENCHMARK_DICT` = słownik dialektu benchmarków (`application/reference_networks/library.py`:
    `id` szyn jako napisy, NIE waliduje się jako ENM) — DRUGA PRAWDA O SIECI liczona własnym
    solverem (P9, A3 §2.1). CV-4.3 K1 (2026-09-06): B-BENCH i G07 (12 benchmarków + oze_pv_bess)
    przepięte na `ENM` (`application/reference_networks/enm_builders/*.py`) — `BENCHMARK_DICT_ZASTANE`
    puste, żaden wpis dziś nie deklaruje tej postaci; stary dialekt (`library.py`, własny NR) żyje
    dalej jako wyrocznia (b) w `tests/golden/parytet_benchmarkow/`, do usunięcia w karcie A2/K2."""

    ENM = "ENM"
    BENCHMARK_DICT = "BENCHMARK_DICT"


class RodzinaSolvera(str, Enum):
    LF = "LF"
    SC = "SC"
    EARTH_FAULT = "EARTH_FAULT"
    LV_ABCN = "LV_ABCN"
    FAULT_LOOP_LV = "FAULT_LOOP_LV"
    THERMAL = "THERMAL"
    PROTECTION = "PROTECTION"
    DYNAMICS = "DYNAMICS"
    POWER_QUALITY = "POWER_QUALITY"


@dataclass(frozen=True)
class Wyrocznia:
    klasa: KlasaWyroczni
    opis: str
    rodziny: tuple[RodzinaSolvera, ...] = ()
    zrodlo: str | None = (
        None  # dokument / norma / narzędzie (z wersją) — wymagane poza REGRESSION_ONLY
    )


@dataclass(frozen=True)
class WpisRejestru:
    id: str
    klasa_przypadku: str
    cel: str
    topologia: str
    poziomy_napiec: str
    uziemienie: str
    scenariusz: str
    analizy: tuple[str, ...]
    inwarianty: tuple[str, ...]
    wyrocznie: tuple[Wyrocznia, ...]
    budowniczowie: tuple[
        str, ...
    ]  # "pakiet.modul:atrybut" — callable albo krotka rekordów z `budowniczy`
    konsumenci: tuple[str, ...]
    status: StatusSieci
    proweniencja: str = "repozytorium MV-DESIGN-PRO (fixture testowa)"
    postac: PostacSieci = PostacSieci.ENM

    @property
    def klasy_wyroczni(self) -> tuple[KlasaWyroczni, ...]:
        return tuple(w.klasa for w in self.wyrocznie) or (KlasaWyroczni.REGRESSION_ONLY,)


_ANALITYCZNA_G01 = Wyrocznia(
    KlasaWyroczni.ANALYTICAL,
    "I_C = 3·ω·C0·U_f·L; I_L = U_f/(ω·L); I_res przy zadanym rozstrojeniu; U0 = U_f przy "
    "zwarciu metalicznym; rozdział I0 ∝ C0 odpływu",
    (RodzinaSolvera.EARTH_FAULT,),
    "wzory zamknięte sieci kompensowanej (do przypięcia w teście G01)",
)

REJESTR: tuple[WpisRejestru, ...] = (
    WpisRejestru(
        id="G01",
        klasa_przypadku="sieć SN kompensowana / zwarcie doziemne / zabezpieczenia (pierwszy vertical slice §31)",
        cel="GPZ 15 kV → impedancja źródła → cewka Petersena → rozdzielnica SN → kabel → linia → kabel → stacja SN/nN → TR → rozdzielnica nN → odpływ → odbiór → PV",
        topologia="promieniowa z odgałęzieniem, stacja SN/nN, obwody nN",
        poziomy_napiec="110/15/0,4 kV",
        uziemienie="punkt neutralny kompensowany (cewka Petersena)",
        scenariusz="normalny; MAX LOAD; łącznik OPEN; TR niedostępny",
        analizy=("LF", "SC 3F/2F/1F/2FZ", "EARTH_FAULT", "PROTECTION", "LV_ABCN", "SWZ"),
        inwarianty=(
            "brak równoległej prawdy o sieci na żadnym etapie",
            "hash EDIT→SAVE→LOAD identyczny",
        ),
        wyrocznie=(_ANALITYCZNA_G01,),
        budowniczowie=(),
        konsumenci=("solver", "SLD SN", "SLD nN", "dokumenty", "e2e"),
        status=StatusSieci.NOT_BUILT,
        proweniencja="do zbudowania komendami domenowymi (CV-6); części: tests/e2e/test_nn_full_chain.py KROK 0, GN_04/GN_05",
    ),
    WpisRejestru(
        id="G02",
        klasa_przypadku="SN promieniowa: rozpływ + zwarcia",
        cel="podstawowy rozpływ i zwarcia w sieci promieniowej",
        topologia="promieniowa (GN_01) i z odgałęzieniem (GN_02)",
        poziomy_napiec="15 kV",
        uziemienie="wg builderów",
        scenariusz="normalny",
        analizy=("LF", "SC"),
        inwarianty=("struktura sieci (test_has_*)",),
        wyrocznie=(),
        budowniczowie=(
            "tests.reference_networks.builders:build_gn01_sn_promieniowa",
            "tests.reference_networks.builders:build_gn02_sn_odgalezienie",
        ),
        konsumenci=("solver", "SLD (test_sld_network_model)"),
        status=StatusSieci.PARTIAL,
    ),
    WpisRejestru(
        id="G03",
        klasa_przypadku="SN pierścień / punkt podziału (NOP) / N-1",
        cel="pierścień z punktem podziału; N-1 na tej samej sieci",
        topologia="pierścień + NOP (GN_03)",
        poziomy_napiec="15 kV",
        uziemienie="wg buildera",
        scenariusz="NOP w dwóch położeniach; N-1",
        analizy=("LF", "SC", "N-1"),
        inwarianty=("OPEN/CLOSED nie zmienia łączności",),
        wyrocznie=(),
        budowniczowie=("tests.reference_networks.builders:build_gn03_sn_pierscien",),
        konsumenci=("solver",),
        status=StatusSieci.PARTIAL,
        proweniencja="N-1 liczone dziś na cgmes/golden_enm.py (inna sieć) — do przepięcia na G03",
    ),
    WpisRejestru(
        id="G04",
        klasa_przypadku="stacja dwutransformatorowa ze sprzęgłem szyn",
        cel="podział obciążenia dwóch TR, sprzęgło OPEN/CLOSED",
        topologia="stacja SN/nN, 2 TR, sekcje nN, sprzęgło",
        poziomy_napiec="15/0,4 kV",
        uziemienie="TN (projekcja nN 3.0.0)",
        scenariusz="sprzęgło OPEN / CLOSED",
        analizy=("projekcja nN", "LF", "SC nN"),
        inwarianty=("hash projekcji identyczny cross-platform (18 fixtur)",),
        wyrocznie=(),
        budowniczowie=("tests.application.analyses.lv_domain.scenariusze_nn:SCENARIUSZE",),
        konsumenci=("projekcja nN", "SLD nN (fixtury generowane)"),
        status=StatusSieci.PARTIAL,
    ),
    WpisRejestru(
        id="G05",
        klasa_przypadku="nN ABCN / N / PEN / SWZ",
        cel="asymetria, prąd N, pętla zwarcia, samoczynne wyłączenie zasilania",
        topologia="rozdzielnica nN, obwody odbiorcze, podrozdzielnice",
        poziomy_napiec="0,4 kV",
        uziemienie="TN-C/TN-S/TN-C-S/TT/IT (docelowo jako encja EarthingSystem)",
        scenariusz="obwody jedno- i trójfazowe, asymetria",
        analizy=("FAULT_LOOP_LV", "SWZ", "LV_ABCN"),
        inwarianty=("czasy wyłączenia wg IEC 60364-4-41",),
        wyrocznie=(),
        budowniczowie=("tests.application.analyses.lv_domain.scenariusze_nn:SCENARIUSZE",),
        konsumenci=("fault_loop", "swz", "projekcja nN"),
        status=StatusSieci.PARTIAL,
        proweniencja="czeka na model fazowy (CV-5)",
    ),
    WpisRejestru(
        id="G06",
        klasa_przypadku="PV w punkcie przyłączenia / RfG",
        cel="zgodność przyłączeniowa DER, FRT, Q(U); regulacja napięcia (A3-04)",
        topologia="SN z DER przez TR",
        poziomy_napiec="15/0,4 kV",
        uziemienie="wg builderów",
        scenariusz="MAX GEN; FRT; PV w regulacji napięcia (osiągalna nastawa / nasycenie Q)",
        analizy=("LF", "RfG", "FRT"),
        inwarianty=(
            "PV w trybie regulacji napięcia: |U| szyny PV = nastawa, gdy w granicach Q "
            "(karta CV-4.1b, A3-04)",
        ),
        wyrocznie=(
            Wyrocznia(
                KlasaWyroczni.INDEPENDENTLY_VERIFIED,
                "pandapower create_gen(vm_pu=...) — węzeł PV, cross-validation |V|",
                (RodzinaSolvera.LF,),
                "pandapower (tests/application/reference_networks/test_pandapower_cross_validation.py)",
            ),
        ),
        # Karta CV-4.1b (A3-04): 2 warianty (osiągalna nastawa / nasycenie Q) —
        # reużywają topologię `build_gn04_sn_nn_oze` (KLASA NIE INSTANCJA: jeden
        # budowniczy topologii, nie druga kopia sieci).
        budowniczowie=(
            "tests.reference_networks.builders:build_gn06_pv_regulacja_napiecia",
            "tests.reference_networks.builders:build_gn06_pv_regulacja_napiecia_nasycenie",
        ),
        konsumenci=("ncrfg", "source_compliance", "solver"),
        status=StatusSieci.PARTIAL,
        proweniencja=(
            "V12-GN-004; tests/reference_networks/test_pv1mw_g1_physics.py (własne dane, nie "
            "builder rejestru); warianty regulacji napięcia — karta CV-4.1b (A3-04), 2026-09-05"
        ),
    ),
    WpisRejestru(
        id="G07",
        klasa_przypadku="BESS ładowanie / rozładowanie",
        cel="bilans mocy i energii w kroku QSTS, SOC(t)",
        topologia="SN z PV+BESS",
        poziomy_napiec="15/0,4 kV",
        uziemienie="wg buildera",
        scenariusz="BESS charge / discharge",
        analizy=("LF", "QSTS"),
        inwarianty=("bilans energii w kroku",),
        wyrocznie=(),
        budowniczowie=(
            "application.reference_networks.enm_builders.oze_pv_bess:build_oze_pv_bess_enm",
        ),
        konsumenci=("solver",),
        status=StatusSieci.PARTIAL,
        postac=PostacSieci.ENM,
        proweniencja=(
            "CV-4.3 K1 (2026-09-06): przepięte na ENM-bliźniak (operacje domenowe + typy "
            "katalogowe `benchmark`), tor kanoniczny — PV-2 REGULACJA_NAPIECIA, BESS-2 wstrzyk "
            "PQ Q=0 na tej samej szynie (dwa niezależne źródła regulacji napięcia na jednej "
            "szynie są zabronione przez `enm/mapping.py`). Stary dialekt (własny NR, P9) NIE "
            "ZBIEGA na tej sieci (`converged: False`, zmierzone bezpośrednio) — wyrocznia (b) "
            "PLANNED/NIE_DOTYCZY dla tej sieci, nie brakująca rozbieżność do wyjaśnienia."
        ),
    ),
    WpisRejestru(
        id="G08",
        klasa_przypadku="koordynacja zabezpieczeń / TCC",
        cel="selektywność nadprądowa, krzywe IEC 60255",
        topologia="SN+nN z zabezpieczeniami (GN_05)",
        poziomy_napiec="15/0,4 kV",
        uziemienie="wg buildera",
        scenariusz="SC max/min",
        analizy=("PROTECTION", "TCC"),
        inwarianty=("t(I) wg wzoru normy dla SI/VI/EI/LTI",),
        wyrocznie=(
            Wyrocznia(
                KlasaWyroczni.NORMATIVE,
                "krzywe IEC 60255-151 — wzory zamknięte t(I)",
                (RodzinaSolvera.PROTECTION,),
                "IEC 60255-151",
            ),
        ),
        budowniczowie=("tests.reference_networks.builders:build_gn05_sn_nn_oze_ochrona",),
        konsumenci=("protection_iec60255",),
        status=StatusSieci.PARTIAL,
    ),
    WpisRejestru(
        id="G09",
        klasa_przypadku="CT/VT + zabezpieczenia kierunkowe",
        cel="polaryzacja 67N w sieci izolowanej vs kompensowanej; nasycenie CT",
        topologia="SN z przekładnikami",
        poziomy_napiec="15 kV",
        uziemienie="izolowany / kompensowany",
        scenariusz="zwarcie doziemne na odpływie",
        analizy=("EARTH_FAULT", "PROTECTION"),
        inwarianty=(),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=(),
        status=StatusSieci.NOT_BUILT,
    ),
    WpisRejestru(
        id="G10",
        klasa_przypadku="jakość energii / architektura harmonicznych",
        cel="rezonans równoległy, THD dla jednego źródła prądowego",
        topologia="SN z baterią kondensatorów i źródłem harmonicznych",
        poziomy_napiec="15 kV",
        uziemienie="wg definicji",
        scenariusz="—",
        analizy=("POWER_QUALITY",),
        inwarianty=(),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=(),
        status=StatusSieci.NOT_BUILT,
    ),
    WpisRejestru(
        id="G11",
        klasa_przypadku="wariant strukturalny / rozbudowa sieci",
        cel="wariant = baza + komendy ⇒ hash materializacji równy sieci zbudowanej wprost",
        topologia="dowolna z rejestru + komendy domenowe",
        poziomy_napiec="—",
        uziemienie="—",
        scenariusz="—",
        analizy=("tożsamościowa",),
        inwarianty=("hash(materializacja wariantu) == hash(budowa wprost)",),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=(),
        status=StatusSieci.NOT_BUILT,
        proweniencja="CV-3 (NetworkVariation)",
    ),
    WpisRejestru(
        id="G12",
        klasa_przypadku="optymalizacja wielokryterialna",
        cel="mały problem dyskretny z ręcznie policzonym frontem Pareto",
        topologia="3 przekroje × 2 TR",
        poziomy_napiec="15/0,4 kV",
        uziemienie="—",
        scenariusz="MAX/MIN LOAD",
        analizy=("optymalizacja",),
        inwarianty=(),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=(),
        status=StatusSieci.NOT_BUILT,
    ),
    WpisRejestru(
        id="G13",
        klasa_przypadku="GIS / import / topology healing",
        cel="round-trip import → ENM → eksport → import (ten sam hash); healing znanych defektów",
        topologia="feeder 110/SN (CGMES)",
        poziomy_napiec="110/15 kV",
        uziemienie="wg buildera",
        scenariusz="—",
        analizy=("tożsamościowa", "N-1"),
        inwarianty=("round-trip hash",),
        wyrocznie=(),
        budowniczowie=("tests.cgmes.golden_enm:build_golden_enm",),
        konsumenci=("cgmes", "N-1"),
        status=StatusSieci.PARTIAL,
    ),
    WpisRejestru(
        id="G14",
        klasa_przypadku="katalog / dobór urządzeń",
        cel="dobór kabla wg IEC 60364-5-52 (I_z, współczynniki)",
        topologia="—",
        poziomy_napiec="0,4/15 kV",
        uziemienie="—",
        scenariusz="—",
        analizy=("dobór",),
        inwarianty=(),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=("catalog_* guardy",),
        status=StatusSieci.PARTIAL,
        proweniencja="katalogi + guardy catalog_*; brak sieci rejestru",
    ),
    WpisRejestru(
        id="G15",
        klasa_przypadku="raportowanie / proweniencja / dowody",
        cel="dokument z envelope E odtwarzalny bit-identycznie; wartości w dowodzie = wartości ze śladu",
        topologia="—",
        poziomy_napiec="—",
        uziemienie="—",
        scenariusz="—",
        analizy=("tożsamościowa",),
        inwarianty=("zero fizyki w proof engine",),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=("proof packs",),
        status=StatusSieci.PARTIAL,
        proweniencja="golden dowody (tests/proof_engine)",
    ),
    WpisRejestru(
        id="G00",
        klasa_przypadku="skala: sieć L ≈ 2 000 szyn (benchmark wydajności)",
        cel="budżety B1–B10 (docs/twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md §1a)",
        topologia="≥ 52 stacje (substrat), docelowo ≈ 150 stacji z nN, 2 GPZ",
        poziomy_napiec="110/15/0,4 kV",
        uziemienie="wg buildera",
        scenariusz="—",
        analizy=("LF", "SC", "projekcje"),
        inwarianty=("deterministyczny SHA-256 substratu",),
        wyrocznie=(),
        budowniczowie=("tests.reference_networks.sld_substrate_52s:build_sld_substrate_52s",),
        konsumenci=("SLD v2/v3", "jacobian", "kopia graniczna"),
        status=StatusSieci.PARTIAL,
        proweniencja=(
            "substrat 52 stacji naprawiony u źródła 2026-09-04 (SUB-52s: 21 blokerów "
            "walidatora ENM -> 0 — 20x E063 uzupełnione deklaracją nn_earthing, 1x E003 "
            "zamknięciem pierścienia do sąsiedniego odgałęzienia); generator L "
            "(≈2 000 szyn) nie istnieje — PARTIAL do czasu jego dodania"
        ),
    ),
    WpisRejestru(
        id="B-BENCH",
        klasa_przypadku="benchmarki opublikowane IEEE / CIGRE / IEC 60909 / pandapower",
        cel="walidacja krzyżowa solverów LF i SC",
        topologia="IEEE 4/9/13/14/34/39, CIGRE MV/LV, IEC 60909 przykład, pandapower radial, pp_simple_four_bus",
        poziomy_napiec="wg benchmarku",
        uziemienie="wg benchmarku",
        scenariusz="wg benchmarku",
        analizy=("LF", "SC"),
        inwarianty=("worst |V| błąd ≈ 5e-8 % vs pandapower",),
        wyrocznie=(
            Wyrocznia(
                KlasaWyroczni.INDEPENDENTLY_VERIFIED,
                "pandapower (wartości oczekiwane w application/reference_networks/expected/*.json)",
                (RodzinaSolvera.LF, RodzinaSolvera.SC),
                "pandapower — wersja w expected/*.json",
            ),
            Wyrocznia(
                KlasaWyroczni.PUBLISHED_BENCHMARK,
                "IEEE test feeders, CIGRE benchmark networks",
                (RodzinaSolvera.LF,),
                "IEEE PES / CIGRE TB 575",
            ),
            Wyrocznia(
                KlasaWyroczni.NORMATIVE,
                "przykład obliczeniowy IEC 60909-4",
                (RodzinaSolvera.SC,),
                "IEC 60909-4",
            ),
        ),
        budowniczowie=(
            "application.reference_networks.enm_builders.ieee_4bus:build_ieee_4bus_enm",
            "application.reference_networks.enm_builders.ieee_9bus:build_ieee_9bus_enm",
            "application.reference_networks.enm_builders.ieee_13bus:build_ieee_13bus_enm",
            "application.reference_networks.enm_builders.ieee_14bus:build_ieee_14bus_enm",
            "application.reference_networks.enm_builders.ieee_34bus:build_ieee_34bus_enm",
            "application.reference_networks.enm_builders.ieee_39bus:build_ieee_39bus_enm",
            "application.reference_networks.enm_builders.cigre_mv:build_cigre_mv_enm",
            "application.reference_networks.enm_builders.cigre_lv_benchmark:build_cigre_lv_benchmark_enm",
            "application.reference_networks.enm_builders.pp_simple_four_bus:build_pp_simple_four_bus_enm",
            "application.reference_networks.enm_builders.iec60909_example:build_iec60909_example_enm",
            "application.reference_networks.enm_builders.pandapower_iec60909_radial:build_pandapower_iec60909_radial_enm",
        ),
        konsumenci=("solver_output_drift_guard", "reference_networks_validation_guard"),
        status=StatusSieci.SUPPORTED,
        proweniencja=(
            "CV-4.3 K1 (2026-09-06): przepięte na ENM-bliźniaki "
            "(`application/reference_networks/enm_builders/*.py`, budowa przez operacje domenowe "
            "+ typy katalogowe `benchmark`), tor kanoniczny (`enm/assembler.py` -> FROZEN solvers). "
            "Odkrycie klasowe tej karty: `enm/mapping.py` podstawiał domyślnie "
            '`vector_group="Dyn11"` (+30°) gdy katalog transformatora nie deklarował grupy '
            "połączeń (`vector_group=None`) — poprawne, zamierzone zachowanie FROZEN "
            "`power_flow_newton_internal.py::transformer_phase_shift_rad` (SM-2/V12K-180), ale "
            "BŁĘDNE dane katalogowe (9 rekordów transformatorów benchmarków miało "
            "`vector_group=None`, literatura PF zakłada brak przesunięcia) — naprawione na "
            '`vector_group="Yy0"` we WSZYSTKICH 9 (mv_benchmark_catalog.py). Skutek: '
            "pp_simple_four_bus/oze_pv_bess (kąt był podbity dokładnie o +30° — potwierdzone "
            "numerycznie) i ieee_39bus (PF przechodzi z NIEPRZETestowanego/prawdopodobnie "
            "rozbieżnego na `quality_status: accepted`, profil napięć fizyczny 0,957-1,064 pu) "
            "odzyskały zbieżność/poprawność; ieee_14bus ROZBIEGAŁ do 2026-09-09 (przyczyny: "
            "baza impedancji linii 0,208 kV = 135 kV w katalogu, brak napięcia zadanego slacka "
            "1,06 p.u., granice Q wiążące na stanie przejściowym — `enm_builders/ieee_14bus.py`), "
            "po naprawie zgodny z pandapower `case14` co do 3·10⁻⁵ p.u.; ieee_39bus po naprawie "
            "orientacji zaczepów BR36/BR38 i slacka 0,982 p.u. zgodny z `case39` < 1·10⁻⁵ p.u. "
            "(`tests/golden/wyrocznie/test_pandapower_blizniaki_matpower.py`). ieee_13bus: pozytywna-sekwencja/aproksymacja "
            "zweryfikowana wyrocznią (a) (`expected/ieee_13bus.json`, własna deklaracja pliku: "
            '"BFS regression baseline z naszego uproszczonego 13-bus builder" — nie jest to '
            "wyrocznia prawdziwej fizyki niesymetrycznej); PRAWDZIWE rozwiązanie niesymetryczne "
            "pozostaje PLANNED (FROZEN solver liczy wyłącznie sieci symetryczne — 4-przewodowy "
            "tor to przyszłe ADR-021). ieee_34bus: PLANNED bez zmian (sieć niesymetryczna jw. "
            "+ topologia 30-z-32 szyn, BUS-862 nieosiągalny w danych starego dialektu — patrz "
            "docstring buildera). ieee_39bus: PO naprawie vector_group zbiega "
            "(`quality_status: accepted`), wyrocznia (a) (prawdziwe pandapower/MATPOWER case39, "
            "NIEZALEŻNE od naszego solvera) zgodna na 53/78 porównań; pozostałe ~2-4% zaniżenia "
            "napięcia na szynach odbiorczych zdalnych od szyny bilansującej — zmierzone, dwie "
            "hipotezy WYKLUCZONE dowodem (susceptancja linii: bajt-w-bajt zgodna z MATPOWER b_pu "
            "dla wszystkich 35 linii; granice mocy biernej generatorów PV: celowo szerokie/"
            "nie wiążące z konstrukcji, `_q_bound` w katalogu), przyczyna ostateczna nie "
            'zdiagnozowana w tej sesji — PLANNED, status podniesiony z "rozbieżność niezbadana" '
            'na "zbieżne, częściowa zgodność zmierzona, przyczyna resztkowej luki zawężona". '
            "Stary dialekt słownikowy (`application/reference_networks/library.py`, własny NR P9) "
            "pozostaje ŻYWY jako druga, niezależna wyrocznia (b) — `tests/golden/parytet_benchmarkow/` — "
            "do usunięcia w karcie A2/K2."
        ),
        postac=PostacSieci.ENM,
    ),
)


def wpis(id_: str) -> WpisRejestru:
    for w in REJESTR:
        if w.id == id_:
            return w
    raise KeyError(id_)


def _importuj(sciezka: str) -> Any:
    modul, atrybut = sciezka.split(":")
    return getattr(importlib.import_module(modul), atrybut)


def _rozpakuj(siec: Any) -> Any:
    """Buildery testowe zwracają opakowanie `{"enm": ..., "name": ..., ...}` — rejestr oddaje sieć.

    CV-4.3 K1: buildery benchmarków (`application/reference_networks/
    enm_builders/*.py`) zwracają `BenchmarkEnm` — dataclass z polem `.enm`
    (plus `bus_map`/`branch_map` dla wyroczni (a)/(b)/(c), nieużywane przez
    ten rejestr) — ten sam wzorzec „opakowanie z .enm", inny nośnik (dataclass,
    nie dict), stąd osobna gałąź zamiast rozszerzania warunku dict.
    """
    if isinstance(siec, dict) and isinstance(siec.get("enm"), dict):
        return siec["enm"]
    if dataclasses.is_dataclass(siec) and isinstance(getattr(siec, "enm", None), dict):
        return siec.enm  # type: ignore[union-attr]
    return siec


def zbuduj_wszystkie(id_: str) -> list[Any]:
    """Zbuduj wszystkie sieci wpisu (callable → jedna sieć; krotka rekordów z `budowniczy`
    → wiele; słownik rejestru benchmarków (`ReferenceNetwork.builder_fn`) → wiele)."""
    sieci: list[Any] = []
    for sciezka in wpis(id_).budowniczowie:
        obiekt = _importuj(sciezka)
        if callable(obiekt):
            sieci.append(_rozpakuj(obiekt()))
        elif isinstance(obiekt, dict):
            for rekord in obiekt.values():
                budowniczy: Callable[[], Any] = rekord.builder_fn
                sieci.append(_rozpakuj(budowniczy()))
        else:
            for rekord in obiekt:
                sieci.append(_rozpakuj(rekord.budowniczy()))
    return sieci


def pokrycie_rodzin() -> dict[RodzinaSolvera, set[KlasaWyroczni]]:
    """Rodzina solvera → zbiór klas wyroczni innych niż REGRESSION_ONLY."""
    pokrycie: dict[RodzinaSolvera, set[KlasaWyroczni]] = {r: set() for r in RodzinaSolvera}
    for w in REJESTR:
        for wyrocznia in w.wyrocznie:
            if wyrocznia.klasa is KlasaWyroczni.REGRESSION_ONLY:
                continue
            for rodzina in wyrocznia.rodziny:
                pokrycie[rodzina].add(wyrocznia.klasa)
    return pokrycie


def tabela_markdown() -> str:
    linie = [
        "# Rejestr sieci wzorcowych — tabela generowana",
        "",
        "Źródło: `backend/tests/golden/registry.py` (generator `backend/scripts/generuj_rejestr_sieci.py`; "
        "test `backend/tests/golden/test_registry.py` pilnuje zgodności). Kanon i zasady: "
        "`REFERENCE_NETWORK_REGISTRY.md`. Nie edytować ręcznie.",
        "",
        "| ID | Klasa przypadku | Status | Postać | Klasy wyroczni | Rodziny z wyrocznią | Budowniczowie | Konsumenci |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for w in REJESTR:
        rodziny = sorted({r.value for wy in w.wyrocznie for r in wy.rodziny})
        linie.append(
            "| "
            + " | ".join(
                [
                    w.id,
                    w.klasa_przypadku,
                    w.status.value,
                    w.postac.value,
                    ", ".join(k.value for k in w.klasy_wyroczni),
                    ", ".join(rodziny) or "—",
                    "<br>".join(f"`{b}`" for b in w.budowniczowie) or "—",
                    ", ".join(w.konsumenci) or "—",
                ]
            )
            + " |"
        )
    linie += [
        "",
        "## Pokrycie rodzin solverów niezależnymi wyroczniami",
        "",
        "| Rodzina | Klasy wyroczni |",
        "|---|---|",
    ]
    for rodzina, klasy in pokrycie_rodzin().items():
        linie.append(
            f"| {rodzina.value} | {', '.join(sorted(k.value for k in klasy)) or 'BRAK (luka pokrycia)'} |"
        )
    linie.append("")
    return "\n".join(linie)
