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
    solverem (P9, A3 §2.1); pomiar 2026-09-04: 12 benchmarków + oze_pv_bess. Do zwinięcia w ENM
    przez kanoniczny assembler (CV-4); zapadka `BENCHMARK_DICT_ZASTANE` w teście."""

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
        cel="zgodność przyłączeniowa DER, FRT, Q(U)",
        topologia="SN z DER przez TR",
        poziomy_napiec="15/0,4 kV",
        uziemienie="wg builderów",
        scenariusz="MAX GEN; FRT",
        analizy=("LF", "RfG", "FRT"),
        inwarianty=(),
        wyrocznie=(),
        budowniczowie=(),
        konsumenci=("ncrfg", "source_compliance"),
        status=StatusSieci.PARTIAL,
        proweniencja="V12-GN-004; tests/reference_networks/test_pv1mw_g1_physics.py (własne dane, nie builder rejestru)",
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
            "application.reference_networks.builders.oze_pv_bess:build_oze_pv_bess_network",
        ),
        konsumenci=("solver",),
        status=StatusSieci.PARTIAL,
        postac=PostacSieci.BENCHMARK_DICT,
        proweniencja="dialekt benchmarków (nie ENM) — druga prawda o sieci; do zwinięcia w ENM (CV-4)",
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
        proweniencja="substrat 52 stacji NIEOBLICZALNY (A10) — do naprawy u źródła; generator L nie istnieje",
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
        budowniczowie=("application.reference_networks.library:REFERENCE_NETWORK_REGISTRY",),
        konsumenci=("solver_output_drift_guard", "reference_networks_validation_guard"),
        status=StatusSieci.SUPPORTED,
        proweniencja="application/reference_networks/library.py — jedyna dziś niezależna wyrocznia; liczone własnym NR (P9) — do przepięcia na tor P1/S1 (CV-4)",
        postac=PostacSieci.BENCHMARK_DICT,
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
    """Buildery testowe zwracają opakowanie `{"enm": ..., "name": ..., ...}` — rejestr oddaje sieć."""
    if isinstance(siec, dict) and isinstance(siec.get("enm"), dict):
        return siec["enm"]
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
