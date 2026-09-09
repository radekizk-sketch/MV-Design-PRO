"""Jądro budowy sieci benchmarkowych jako `EnergyNetworkModel` (CV-4.3 K1).

Każdy builder w tym pakiecie (``ieee_4bus.py``, ``ieee_9bus.py``, ...) składa
sieć referencyjną WYŁĄCZNIE przez ``enm.domain_operations.execute_domain_operation``
(K1.1 — zakaz ręcznego składania słownika ENM albo
``EnergyNetworkModel.model_validate(dict)`` z ominięciem walidacji operacji
domenowych). Ten moduł niesie WSPÓLNE elementy budowy — cienkie opakowanie nad
operacjami domenowymi, żeby 12 builderów nie powielało identycznego kodu
wołania/sprawdzania błędu.

Konwencja identyfikacji: każdy builder zwraca ``BenchmarkEnm`` z mapą
``bus_map: dict[literaturowy_id, faktyczny_ref_id]`` — testy wyroczni (a)/(b)/(c)
porównują wartości wyroczni (kluczowane literaturowym ID z publikacji, np.
"BUS-1") z wynikiem solvera na szynie ``bus_map[lit_id]`` (operacje domenowe
generują WŁASNE, deterministyczne-z-seeda identyfikatory — K1.1 nie pozwala
wymusić identycznego dosłownie ID jak w dawnym dialekcie słownikowym).

Kompilator topologii (``zbuduj_topologie``): sieci referencyjne to DOWOLNE
grafy (drzewo, gwiazda, pierścień/oczko) na jednym poziomie napięcia. Jedyna
stacja z wieloma polami odpływowymi w tych sieciach jest źródło zasilające
(GPZ) — każdy INNY węzeł to zwykła szyna, z której ``continue_trunk_segment_sn``
przyjmuje DOWOLNĄ liczbę kolejnych odejść przez jawny ``from_terminal_id``
(zweryfikowane empirycznie: cztery gałęzie z jednej zwykłej szyny, zero błędu
— ograniczenie „pole liniowe” dotyczy WYŁĄCZNIE głównej szyny stacji/GPZ).
Algorytm: BFS od GPZ przez JEDYNĄ implementację przeglądu wszerz
(``network_model.core.topologia.przeglad_wszerz_od`` — guard
``topology_single_impl_guard``, C.2.2; drzewo liczone czysto, operacje
domenowe odtwarzane NIŻEJ w kolejności odkrycia, patrz komentarz w
``zbuduj_topologie``), krawędzie drzewa rozpinającego przez
``continue_trunk_segment_sn``/``start_branch_segment_sn`` (GPZ) lub
``continue_trunk_segment_sn`` z jawnym ``from_terminal_id`` (zwykła szyna);
krawędzie ZAMYKAJĄCE (oba końce już odwiedzone) przez ``connect_secondary_ring_sn``.

Każda nowa szyna dostaje ``segment.bus_name`` = jej ID literaturowe (CV-4.3
K1 — patrz docstring ``kontynuuj_z_pola``): domyślnie te dwie operacje tagują
nową szynę ``helper_bus`` (anonimowy punkt techniczny, wykluczony z celów
zwarcia — `enm/assembler.py::skip_short_circuit_target`), co jest poprawne
dla przyrostowej edycji kreatora SLD, ale BŁĘDNE dla sieci benchmarkowej,
gdzie KAŻDA szyna jest gotowym, nazwanym punktem literatury — musi być
raportowalna dla zwarcia od chwili powstania. Znalezisko: sieć
``iec60909_example`` (czysto zwarciowa) miała szynę BUS-MV wykluczoną z
celów zwarcia, dopóki tej promocji nie dodano.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.core.topologia import przeglad_wszerz_od


class BenchmarkBuildError(RuntimeError):
    """Operacja domenowa odrzuciła krok budowy sieci benchmarkowej."""


@dataclass(frozen=True)
class EdgeSpec:
    """Jedna krawędź (linia/kabel) sieci referencyjnej — literaturowe ID węzłów."""

    edge_id: str
    from_lit: str
    to_lit: str
    catalog_ref: str
    dlugosc_m: float = 1000.0
    rodzaj: str = "LINIA"


@dataclass
class BenchmarkEnm:
    """Wynik budowy — ENM + mapa ID literaturowe -> faktyczne ref_id."""

    enm: dict[str, Any]
    bus_map: dict[str, str] = field(default_factory=dict)
    branch_map: dict[str, str] = field(default_factory=dict)


def pusty_enm(*, name: str, sn_nominal_kv: float) -> dict[str, Any]:
    """Pusty `EnergyNetworkModel` — punkt startowy KAŻDEGO buildera benchmarku."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name=name, defaults=ENMDefaults(sn_nominal_kv=sn_nominal_kv))
    )
    return enm.model_dump(mode="json")


def wykonaj(enm: dict[str, Any], op_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Wywołaj operację domenową; podnieś `BenchmarkBuildError` przy odmowie.

    JEDYNA droga mutacji w tym pakiecie (K1.1) — żaden builder nie wolno mu
    składać słownika ENM ręcznie.
    """
    result = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    if result.get("error"):
        raise BenchmarkBuildError(f"{op_name}: {result['error']}")
    return result["snapshot"]


def _gpz_substation(enm: dict[str, Any]) -> dict[str, Any]:
    return next(
        s for s in enm.get("substations", []) if str(s.get("ref_id", "")).startswith("gpz/")
    )


def _gpz_line_fields(enm: dict[str, Any]) -> list[dict[str, Any]]:
    fields = [
        spec
        for spec in _gpz_substation(enm).get("meta", {}).get("field_specs", [])
        if "gpz_line_field" in (spec.get("tags") or [])
    ]
    fields.sort(key=lambda f: f["meta"]["gpz_line_field_index"])
    return fields


def dodaj_zrodlo_slack(
    enm: dict[str, Any],
    *,
    voltage_kv: float,
    sk3_mva: float,
    rx_ratio: float,
    line_fields_count: int,
    source_name: str = "GPZ",
    u_set_pu: float | None = None,
) -> tuple[dict[str, Any], str]:
    """Dodaj szynę bilansującą jako ekwiwalent ręczny WPROST na jej własnym
    napięciu (`skip_hv_transformer=True` — CV-4.3 K1: sieć referencyjna z
    literatury JEST szczytem modelu, bez nadrzędnego układu 110 kV, którego
    publikacja nie opisuje; zob. uzasadnienie w `enm/domain_operations.py::
    _resolve_manual_source_equivalent`). Zwraca (enm, bus_ref źródła/GPZ).

    ``u_set_pu`` — napięcie zadane szyny bilansującej z literatury (MATPOWER ``Vm``
    szyny slack / pandapower ``ext_grid.vm_pu``); ``None`` = 1,0 p.u. Do 2026-09-09
    assembler wpisywał 1,0 każdemu źródłu, więc IEEE case14 (1,06) i case39 (0,982)
    liczyły się z niewłaściwym napięciem bilansującym (case14: Q generatora B1
    165 Mvar zamiast 43,6 Mvar z pandapower).

    ``sk3_mva``/``rx_ratio`` — ZAŁOŻENIE JAWNE bliźniaka, nie dana literatury:
    benchmarki rozpływu mocy (IEEE/MATPOWER/CIGRE) opisują szynę bilansującą jako
    idealne źródło napięcia bez mocy zwarciowej. Rozpływ mocy tej wartości nie
    czyta (slack jest idealny); zwarcia liczone na bliźniakach PF są wynikiem
    tego założenia (parytet asemblera pilnuje ich determinizmu, NIE zgodności z
    literaturą — literatura nie podaje wyniku).
    """
    enm = wykonaj(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": voltage_kv,
            "manual_equivalent": {
                "sn_voltage_kv": voltage_kv,
                "sk3_mva": sk3_mva,
                "rx_ratio": rx_ratio,
                "skip_hv_transformer": True,
                **({"u_set_pu": u_set_pu} if u_set_pu is not None else {}),
            },
            "line_fields_count": max(line_fields_count, 1),
            "source_name": source_name,
        },
    )
    bus_ref = _gpz_substation(enm)["bus_refs"][0]
    return enm, bus_ref


def kontynuuj_z_pola(
    enm: dict[str, Any],
    *,
    field_ref: str,
    catalog_ref: str,
    dlugosc_m: float,
    name: str | None = None,
    rodzaj: str = "LINIA",
    bus_name: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Pierwsze odejście z pola liniowego GPZ (`continue_trunk_segment_sn`).

    `bus_name` (CV-4.3 K1): ID literaturowe nowej szyny — bez niego operacja
    domenowa tagowałaby ją `helper_bus` (anonimowy, ukryty, WYKLUCZONY z celów
    zwarcia — `enm/assembler.py::skip_short_circuit_target`), co jest błędne
    dla KAŻDEJ szyny sieci benchmarkowej (zawsze realny, nazwany punkt
    literatury — patrz docstring `continue_trunk_segment_sn`). `zbuduj_topologie`
    poniżej podaje je zawsze; ten parametr istnieje też dla wywołań spoza niej.
    """
    enm = wykonaj(
        enm,
        "continue_trunk_segment_sn",
        {
            "field_ref": field_ref,
            "segment": {
                "rodzaj": rodzaj,
                "dlugosc_m": dlugosc_m,
                "name": name,
                "catalog_ref": catalog_ref,
                "bus_name": bus_name,
            },
        },
    )
    branch = _ostatnia_dodana_galaz(enm, name)
    return enm, branch["to_bus_ref"]


def rozpocznij_z_pola(
    enm: dict[str, Any],
    *,
    field_ref: str,
    catalog_ref: str,
    dlugosc_m: float,
    name: str | None = None,
    rodzaj: str = "LINIA",
    bus_name: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Kolejne (drugie, trzecie, ...) odejście z GPZ (`start_branch_segment_sn`).

    `bus_name` (CV-4.3 K1): patrz docstring `kontynuuj_z_pola` — identyczne
    uzasadnienie, ta sama promocja w `start_branch_segment_sn`.
    """
    enm = wykonaj(
        enm,
        "start_branch_segment_sn",
        {
            "from_ref": f"{field_ref}.BRANCH",
            "segment": {
                "rodzaj": rodzaj,
                "dlugosc_m": dlugosc_m,
                "name": name,
                "catalog_ref": catalog_ref,
                "bus_name": bus_name,
            },
        },
    )
    branch = _ostatnia_dodana_galaz(enm, name)
    return enm, branch["to_bus_ref"]


def kontynuuj_z_szyny(
    enm: dict[str, Any],
    *,
    from_bus_ref: str,
    catalog_ref: str,
    dlugosc_m: float,
    name: str | None = None,
    rodzaj: str = "LINIA",
    bus_name: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Odejście z DOWOLNEJ zwykłej szyny (nie GPZ) — dowolna liczba wywołań
    z tej samej `from_bus_ref` jest dozwolona (zweryfikowane empirycznie).

    `bus_name` (CV-4.3 K1): patrz docstring `kontynuuj_z_pola`.
    """
    enm = wykonaj(
        enm,
        "continue_trunk_segment_sn",
        {
            "from_terminal_id": from_bus_ref,
            "segment": {
                "rodzaj": rodzaj,
                "dlugosc_m": dlugosc_m,
                "name": name,
                "catalog_ref": catalog_ref,
                "bus_name": bus_name,
            },
        },
    )
    branch = _ostatnia_dodana_galaz(enm, name)
    return enm, branch["to_bus_ref"]


def zamknij_pierscien(
    enm: dict[str, Any],
    *,
    from_bus_ref: str,
    to_bus_ref: str,
    catalog_ref: str,
    dlugosc_m: float,
    name: str | None = None,
    rodzaj: str = "LINIA",
) -> dict[str, Any]:
    """Domknij pierścień/oczko między DWIEMA istniejącymi szynami."""
    return wykonaj(
        enm,
        "connect_secondary_ring_sn",
        {
            "from_bus_ref": from_bus_ref,
            "to_bus_ref": to_bus_ref,
            "ring_name": name,
            "segment": {"rodzaj": rodzaj, "dlugosc_m": dlugosc_m, "catalog_ref": catalog_ref},
        },
    )


def _ostatnia_dodana_galaz(enm: dict[str, Any], name: str | None) -> dict[str, Any]:
    """Znajdź świeżo dodaną gałąź po nazwie (jednoznaczna w obrębie buildera —
    każda krawędź benchmarku ma unikalną nazwę literaturową)."""
    if name:
        for branch in reversed(enm.get("branches", [])):
            if branch.get("name") == name:
                return branch
    return enm["branches"][-1]


def dodaj_obciazenie(
    enm: dict[str, Any],
    *,
    bus_ref: str,
    p_mw: float,
    q_mvar: float,
    name: str | None = None,
) -> dict[str, Any]:
    """Odbiór wprost na szynie (`add_load_sn`, CV-4.3 K1 — bez katalogu, jak
    `add_nn_load`: odbiór nie jest wyrobem katalogowym)."""
    return wykonaj(
        enm,
        "add_load_sn",
        {"bus_ref": bus_ref, "p_mw": p_mw, "q_mvar": q_mvar, "load_name": name or "Odbiór"},
    )


def dodaj_generator_pv(
    enm: dict[str, Any],
    *,
    bus_ref: str,
    p_mw: float,
    u_set_pu: float,
    catalog_ref: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Generator synchroniczny w trybie regulacji napięcia — węzeł PV rozpływu
    (`add_generator_sn`, CV-4.3 K1). Granice mocy biernej z tabliczki
    katalogowej (patrz `mv_benchmark_catalog.py`)."""
    return wykonaj(
        enm,
        "add_generator_sn",
        {
            "bus_ref": bus_ref,
            "p_mw": p_mw,
            "catalog_ref": catalog_ref,
            "control_mode": "REGULACJA_NAPIECIA",
            "u_set_pu": u_set_pu,
            "name": name or "Generator",
        },
    )


def dodaj_generator_pq(
    enm: dict[str, Any],
    *,
    bus_ref: str,
    p_mw: float,
    q_mvar: float,
    catalog_ref: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Generator synchroniczny w trybie mocy stałej (bez regulacji napięcia).

    CV-4.3 K1: `enm/mapping.py` odrzuca DWA generatory w trybie regulacji
    napięcia na TEJ SAMEJ szynie (kontrakt rozpływu niesie jedną nastawę na
    węzeł — patrz `enm/mapping.py::_classify_buses`/komentarz A3-04). Gdy
    literatura benchmarku ma DWA źródła na jednej szynie o TEJ SAMEJ nastawie
    |U| (np. PV+BESS sieci `oze_pv_bess`), JEDNO z nich niesie regulację
    (`dodaj_generator_pv`), drugie wchodzi tu jako wstrzyk mocy stałej —
    fizycznie równoważne (ten sam węzeł PV, ta sama nastawa, suma mocy P
    identyczna) i zgodne z konwencją już istniejącą w kodzie dla tej klasy
    źródeł (`pandapower_bridge.py::enm_to_pandapower_dict` — `gen_kind`
    PV/BESS → `pp.create_sgen(q_mvar=0.0)`, generator statyczny bez regulacji).
    """
    return wykonaj(
        enm,
        "add_generator_sn",
        {
            "bus_ref": bus_ref,
            "p_mw": p_mw,
            "q_mvar": q_mvar,
            "catalog_ref": catalog_ref,
            "name": name or "Generator",
        },
    )


def dodaj_bocznik(
    enm: dict[str, Any],
    *,
    bus_ref: str,
    catalog_ref: str,
    name: str | None = None,
) -> dict[str, Any]:
    """Bateria kondensatorów SN wprost na szynie (`add_shunt_compensator_sn`)."""
    payload: dict[str, Any] = {"bus_ref": bus_ref, "catalog_ref": catalog_ref}
    if name:
        payload["name"] = name
    return wykonaj(enm, "add_shunt_compensator_sn", payload)


def dodaj_transformator(
    enm: dict[str, Any],
    *,
    hv_bus_ref: str | None = None,
    catalog_ref: str,
    lv_voltage_kv: float | None = None,
    lv_bus_ref: str | None = None,
    hv_voltage_kv: float | None = None,
    off_nominal_ratio: float | None = None,
) -> tuple[dict[str, Any], str]:
    """Transformator SN/nN — tworzy NOWĄ szynę LV, gdy `lv_bus_ref` nie podano
    (CV-4.3 K1, rozszerzenie `add_transformer_sn_nn` — zob. jego docstring), albo
    NOWĄ szynę HV nad istniejącą `lv_bus_ref`, gdy zamiast `hv_bus_ref` podano
    `hv_voltage_kv` (2026-09-09: zaczep MATPOWER po stronie „from" musi zostać na
    uzwojeniu HV także wtedy, gdy budowa dochodzi do transformatora od strony „to";
    zwracana szyna to ta NOWO utworzona — LV albo HV).

    `off_nominal_ratio` (CV-4.3 K1 — sieci IEEE 14/39-bus, konwencja MATPOWER):
    stosunek pozanominalny strony HV (`t` w `network_model/core/branch.py::
    TapChanger.effective_ratio` — `regulated_winding="HV" => t=tau`) — 1.0 =
    brak odchylenia (zachowanie NIEZMIENIONE, zero regulacji). `add_transformer_
    sn_nn` JUŻ ma mechanizm zaczepów (`_build_gpz_tap_changer`, reużyty od GPZ
    WN/SN — zero nowej ścieżki fizyki), ten kernel tylko podaje jego payload:
    DETC (zaczep stały, brak regulacji automatycznej — zgodne z siecią
    literaturową bez opisanej regulacji), jeden krok o rozmiarze dokładnie
    `(off_nominal_ratio - 1) * 100 %` od neutralnej pozycji 0 do 1, po stronie
    HV — `tau = 1 + (1-0)*step_percent/100 = off_nominal_ratio`.
    """
    payload: dict[str, Any] = {"transformer_catalog_ref": catalog_ref}
    if hv_bus_ref is not None:
        payload["hv_bus_ref"] = hv_bus_ref
    elif hv_voltage_kv is not None and lv_bus_ref is not None:
        payload["hv_voltage_kv"] = hv_voltage_kv
    else:
        raise BenchmarkBuildError(
            "dodaj_transformator: podaj hv_bus_ref albo (hv_voltage_kv + lv_bus_ref)."
        )
    if lv_bus_ref is not None:
        payload["lv_bus_ref"] = lv_bus_ref
    else:
        if lv_voltage_kv is None:
            raise BenchmarkBuildError("dodaj_transformator: podaj lv_bus_ref albo lv_voltage_kv.")
        payload["lv_voltage_kv"] = lv_voltage_kv
    if off_nominal_ratio is not None and off_nominal_ratio != 1.0:
        # Krok zaczepu musi być NIEUJEMNY (walidacja domenowa) — kierunek
        # odchylenia od 1,0 niesie znak `current_position`, nie `step_percent`
        # (tau = 1 + (current_position-neutral_position)*step_percent/100).
        current_position = -1 if off_nominal_ratio < 1.0 else 1
        step_percent = abs(off_nominal_ratio - 1.0) * 100.0
        payload.update(
            {
                "transformer_regulation_type": "DETC",
                "transformer_regulated_winding": "HV",
                "transformer_tap_neutral_position": 0,
                "transformer_tap_current_position": current_position,
                "transformer_tap_min_position": min(0, current_position),
                "transformer_tap_max_position": max(0, current_position),
                "transformer_tap_step_percent": step_percent,
            }
        )
    before = {t["ref_id"] for t in enm.get("transformers", [])}
    enm = wykonaj(enm, "add_transformer_sn_nn", payload)
    tr = next(t for t in enm["transformers"] if t["ref_id"] not in before)
    return enm, tr["hv_bus_ref"] if hv_bus_ref is None else tr["lv_bus_ref"]


def zbuduj_topologie(
    enm: dict[str, Any],
    *,
    slack_lit: str,
    slack_ref: str,
    edges: list[EdgeSpec],
) -> tuple[dict[str, Any], dict[str, str], dict[str, str]]:
    """Zbuduj dowolny graf (drzewo + domknięcia pierścieni/oczek) z listy
    krawędzi nazwanych literaturowymi ID węzłów — patrz docstring modułu.

    Zwraca (enm, bus_map, branch_map) — `bus_map` zaczyna się od
    `{slack_lit: slack_ref}`.
    """
    bus_map: dict[str, str] = {slack_lit: slack_ref}
    branch_map: dict[str, str] = {}

    adjacency: dict[str, list[EdgeSpec]] = {}
    for edge in edges:
        adjacency.setdefault(edge.from_lit, []).append(edge)
        adjacency.setdefault(edge.to_lit, []).append(edge)

    def sasiedzi(lit: str) -> list[tuple[str, str]]:
        wynik: list[tuple[str, str]] = []
        for edge in adjacency.get(lit, []):
            other = edge.to_lit if edge.from_lit == lit else edge.from_lit
            wynik.append((edge.edge_id, other))
        return wynik

    # JEDYNA implementacja BFS (network_model/core/topologia.py, guard
    # topology_single_impl_guard, C.2.2) — czyste obliczenie DRZEWA odkrycia,
    # bez efektów ubocznych. `drzewo.items()` = kolejność KLUCZY = kolejność
    # odkrycia węzłów (kontrakt `przeglad_wszerz_od`), więc replay operacji
    # domenowych niżej w tej kolejności odtwarza DOKŁADNIE tę samą sekwencję
    # (a więc te same ziarna/ref_id), co wcześniejszy przeplot BFS+efekt.
    drzewo = przeglad_wszerz_od([slack_lit], sasiedzi)

    gpz_fields = _gpz_line_fields(enm)
    gpz_field_index = 0
    gpz_first_departure_done = False
    tree_edge_ids: set[str] = set()

    for other_lit, info in drzewo.items():
        if info is None:  # korzeń (szyna bilansująca) — bez operacji
            continue
        edge_id, current_lit = info
        edge = next(e for e in adjacency[current_lit] if e.edge_id == edge_id)
        tree_edge_ids.add(edge_id)
        current_ref = bus_map[current_lit]
        # Krawędź drzewa rozpinającego — tworzy NOWĄ szynę.
        if current_lit == slack_lit:
            if not gpz_first_departure_done:
                enm, new_ref = kontynuuj_z_pola(
                    enm,
                    field_ref=gpz_fields[gpz_field_index]["field_ref"],
                    catalog_ref=edge.catalog_ref,
                    dlugosc_m=edge.dlugosc_m,
                    name=edge.edge_id,
                    rodzaj=edge.rodzaj,
                    bus_name=other_lit,
                )
                gpz_first_departure_done = True
            else:
                gpz_field_index += 1
                enm, new_ref = rozpocznij_z_pola(
                    enm,
                    field_ref=gpz_fields[gpz_field_index]["field_ref"],
                    catalog_ref=edge.catalog_ref,
                    dlugosc_m=edge.dlugosc_m,
                    name=edge.edge_id,
                    rodzaj=edge.rodzaj,
                    bus_name=other_lit,
                )
        else:
            enm, new_ref = kontynuuj_z_szyny(
                enm,
                from_bus_ref=current_ref,
                catalog_ref=edge.catalog_ref,
                dlugosc_m=edge.dlugosc_m,
                name=edge.edge_id,
                rodzaj=edge.rodzaj,
                bus_name=other_lit,
            )
        bus_map[other_lit] = new_ref
        branch_map[edge.edge_id] = _ostatnia_dodana_galaz(enm, edge.edge_id)["ref_id"]

    # Krawędzie ZAMYKAJĄCE (oba końce odkryte, żadna z nich nie była krawędzią
    # drzewa) — `zamknij_pierscien` jest funkcją CZYSTĄ swoich jawnych
    # argumentów (bez licznika sekwencyjnego), a `enm/mapping.py` sortuje
    # gałęzie po `ref_id` przed budową grafu — kolejność wywołań względem
    # siebie i względem krawędzi drzewa nie wpływa na wynik fizyczny ani na
    # ref_id którejkolwiek gałęzi.
    unreachable = sorted(
        e.edge_id
        for e in edges
        if e.edge_id not in tree_edge_ids and (e.from_lit not in bus_map or e.to_lit not in bus_map)
    )
    if unreachable:
        raise BenchmarkBuildError(
            f"zbuduj_topologie: krawędzie nieosiągalne z szyny bilansującej: {unreachable}"
        )

    for edge in edges:
        if edge.edge_id in tree_edge_ids:
            continue
        enm = zamknij_pierscien(
            enm,
            from_bus_ref=bus_map[edge.from_lit],
            to_bus_ref=bus_map[edge.to_lit],
            catalog_ref=edge.catalog_ref,
            dlugosc_m=edge.dlugosc_m,
            name=edge.edge_id,
            rodzaj=edge.rodzaj,
        )
        branch_map[edge.edge_id] = _ostatnia_dodana_galaz(enm, edge.edge_id)["ref_id"]

    return enm, bus_map, branch_map


def rozbuduj_z_dowolnej_szyny(
    enm: dict[str, Any],
    *,
    bus_map: dict[str, str],
    korzenie: list[str],
    edges: list[EdgeSpec],
) -> tuple[dict[str, Any], dict[str, str]]:
    """BFS ogólny (CV-4.3 K1 — sieć ieee_39bus): jak `zbuduj_topologie`, ale
    BEZ założenia „jeden korzeń = pole liniowe GPZ" — każdy element `korzenie`
    jest szyną JUŻ ISTNIEJĄCĄ w `bus_map` (np. utworzoną transformatorem, nie
    polem GPZ), z której `kontynuuj_z_szyny` odchodzi dowolną liczbę razy
    (zweryfikowane empirycznie — patrz `zbuduj_topologie`). Krawędzie
    ZAMYKAJĄCE (oba końce już odwiedzone) przez `connect_secondary_ring_sn`,
    jak w `zbuduj_topologie`. Użyj, gdy siatka ma WIELE punktów wejścia
    (np. dwa transformatory zasilające tę samą magistralę SN) albo gdy jedyny
    punkt wejścia nie jest polem GPZ (transformator ze szyny bilansującej).

    Modyfikuje `bus_map` W MIEJSCU (dopisuje nowe szyny) i zwraca też jako
    wynik — ten sam obiekt, wygodne obie strony wywołania.
    """
    branch_map: dict[str, str] = {}
    adjacency: dict[str, list[EdgeSpec]] = {}
    for edge in edges:
        adjacency.setdefault(edge.from_lit, []).append(edge)
        adjacency.setdefault(edge.to_lit, []).append(edge)

    def sasiedzi(lit: str) -> list[tuple[str, str]]:
        wynik: list[tuple[str, str]] = []
        for edge in adjacency.get(lit, []):
            other = edge.to_lit if edge.from_lit == lit else edge.from_lit
            wynik.append((edge.edge_id, other))
        return wynik

    # JEDYNA implementacja BFS (network_model/core/topologia.py, guard
    # topology_single_impl_guard, C.2.2) — patrz komentarz w `zbuduj_topologie`
    # (ten sam wzorzec: drzewo czysty, replay operacji domenowych w kolejności
    # odkrycia, krawędzie zamykające po wszystkich krawędziach drzewa).
    drzewo = przeglad_wszerz_od(list(korzenie), sasiedzi)

    tree_edge_ids: set[str] = set()
    for other_lit, info in drzewo.items():
        if info is None:  # jeden z korzeni — już w bus_map, bez operacji
            continue
        edge_id, current_lit = info
        edge = next(e for e in adjacency[current_lit] if e.edge_id == edge_id)
        tree_edge_ids.add(edge_id)
        enm, new_ref = kontynuuj_z_szyny(
            enm,
            from_bus_ref=bus_map[current_lit],
            catalog_ref=edge.catalog_ref,
            dlugosc_m=edge.dlugosc_m,
            name=edge.edge_id,
            rodzaj=edge.rodzaj,
            bus_name=other_lit,
        )
        bus_map[other_lit] = new_ref
        branch_map[edge.edge_id] = _ostatnia_dodana_galaz(enm, edge.edge_id)["ref_id"]

    unreachable = sorted(
        e.edge_id
        for e in edges
        if e.edge_id not in tree_edge_ids and (e.from_lit not in bus_map or e.to_lit not in bus_map)
    )
    if unreachable:
        raise BenchmarkBuildError(
            f"rozbuduj_z_dowolnej_szyny: krawędzie nieosiągalne z korzeni {korzenie}: "
            f"{unreachable}"
        )

    for edge in edges:
        if edge.edge_id in tree_edge_ids:
            continue
        enm = zamknij_pierscien(
            enm,
            from_bus_ref=bus_map[edge.from_lit],
            to_bus_ref=bus_map[edge.to_lit],
            catalog_ref=edge.catalog_ref,
            dlugosc_m=edge.dlugosc_m,
            name=edge.edge_id,
            rodzaj=edge.rodzaj,
        )
        branch_map[edge.edge_id] = _ostatnia_dodana_galaz(enm, edge.edge_id)["ref_id"]

    return enm, branch_map
