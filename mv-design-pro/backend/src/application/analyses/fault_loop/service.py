"""Widok pętli zwarcia nN z modelu (G-STK-4, karta P0.6 — G-05).

Domyka łańcuch uziemienia G-STK-1 „do ostatniego klika": konfiguracja układu
sieci nN (``Transformer.lv_earthing_system``, W5-A — brak = odmowa nazwana,
nigdy domyślny TN-C-S) + impedancja transformatora
(z uk%/Sn/Ulv/Pk, składowa zgodna z grupą połączeń — zob. niżej) + REALNA
trasa kablowa (P0.6) + upstream Thevenin sieci SN (P0.6) → impedancja pętli
zwarcia w DOWOLNYM punkcie nN i prąd zwarcia jednofazowego Ik. Ochrona
przeciwporażeniowa przez samoczynne wyłączenie, IEC 60364-4-41.

Warstwa aplikacji: NIC nie liczy sama fizyki — ekstrakcja trasy z ENM żyje w
``.route`` (BFS, tylko odczyt pól gałęzi), a każde sumowanie/przeliczenie
(Z/n_parallel, pu→Ω, przekładnia) w ``network_model.solvers.fault_loop_builder``
(warstwa solvera, PHYSICS HERE ONLY). Tu tylko wyławiamy dane z modelu,
mapujemy układ i uczciwie raportujemy braki (zero fabrykacji).

JEDNA ŚCIEŻKA FIZYKI (KLASA NIE INSTANCJA): impedancja transformatora dla
pętli L-PE/L-PEN i upstream Thevenin sieci SN liczą się IDENTYCZNIE w KAŻDYM
punkcie nN — u źródła (szyna nN transformatora, trasa zerodługościowa),
w dowolnym wskazanym punkcie i w najdalszym punkcie każdego odpływu. Nie ma
drugiej, uproszczonej wersji tej samej fizyki dla „widoku u źródła".

STACJA WIELOTRANSFORMATOROWA (karta B-02 slice B, §0.1). Do 2026-09-01 KAŻDY
widok pętli zwarcia brał ``_station_transformer`` — PIERWSZY transformator
stacji — i liczył od niego pętlę dla WSZYSTKICH odpływów. Przy stacji 2×TR ze
sprzęgłem ZAMKNIĘTYM odpływy sekcji 2 dostawały impedancję TR1 powiększoną o
trasę przez sprzęgło (zawyżone Z_loop, zaniżone Ik — werdykt SWZ liczony na
niewłaściwej trasie), a przy sprzęgle OTWARTYM znikały z widoku zupełnie
(BFS od szyny nN TR1 ich nie dosięgał). Naprawa jest KLASOWA, nie punktowa:
``assign_station_lv_buses`` przypisuje KAŻDĄ szynę nN stacji do transformatora
NAJBLIŻSZEGO po zamkniętych gałęziach (remis → mniejszy ``ref_id``), a
``build_feeder_fault_loop_view_for_transformer`` liczy odpływy WYŁĄCZNIE tego
transformatora, którego szyna nN jest ich korzeniem.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

from enm.dane_przyjete_galezi import dane_przyjete_linii_wezla
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.maszyny_robocze import parametry_robocze_impedancji_maszyn
from enm.models import EnergyNetworkModel, Substation, Transformer
from enm.nazwy_elementow import nazwa_elementu
from enm.slownik_komunikatow import etykieta_parametru, opis_obiektu
from enm.tolerancja_nn import wyspy_wezlow_nn
from enm.zero_sequence_transformer import (
    ZeroSeqConnection,
    build_transformer_zero_seq_model,
)
from network_model.catalog.wartosci_robocze import (
    TolerancjaNnRozstrzygnieta,
    rozstrzygnij_tolerancje_nn,
)
from network_model.core.graph import NetworkGraph
from network_model.core.ybus import S_BASE_MVA
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import kv_na_v, napiecie_fazowe_v
from network_model.pochodne.pasma_napieciowe import (
    OPIS_PASMA_NN,
    pasmo_napieciowe,
    w_pasmie_nn,
)
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    LoopImpedanceComponent,
    TransformerLoopImpedance,
    build_fault_loop_input,
    refer_upstream_impedance_to_lv_ohm,
    sum_phase_and_return_route,
    transformer_lv_impedance_ohm,
    zero_sequence_transformer_loop_impedance_ohm,
)
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopResult,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)
from network_model.solvers.petla_zwarcia_tt_it import DaneTtIt
from network_model.solvers.short_circuit_core import build_zbus
from solver_input.uklad_sieci_nn import typ_sieci_solvera, uklad_tn

from .route import (
    LvBusPath,
    RouteExtractionError,
    bfs_paths_from,
    group_bus_refs_by_feeder,
    incomer_branch_refs,
    path_to_bus,
    route_segments,
)
from .tt_it import DanePunktuTtIt, dane_sieci_it, dane_tt_it_dla_punktu

#: Klucz `missing_data` przy braku układu sieci nN na transformatorze (W5-A §1 p. 2:
#: brak = odmowa nazwana, NIGDY domyślka — skasowana domyślka ``"TN-C-S"``).
BRAK_UKLADU_NN = "lv_earthing_system"

#: Kod listy braków: grupa połączeń bez lokalnie uziemionego punktu gwiazdowego strony nN
#: (składowa zerowa transformatora nie domyka pętli L-PE/L-PEN po stronie nN).
KOD_BRAK_LOKALNEGO_UZIEMIENIA_NN = "transformer_zero_sequence_lv_local_ground"

# Połączenia sekwencji zerowej dające LOKALNĄ drogę uziemienia po stronie nN
# (punkt gwiazdowy uzwojenia nN jest bezpośrednio/dostępnie uziemiony) — jedyne
# dla których pętla L-PE/L-PEN liczona metodą tego modułu ma fizyczny sens.
# Dyn11 (delta HV / gwiazda uziemiona nN) → LV_SHUNT_GROUND: „pełny obwód
# zerowy po stronie nN" (§0.1 karty P0.6) — dominujący przypadek dla stacji
# SN/nN w Polsce. SERIES_THROUGH (obie strony uziemione, np. YNyn0) TEŻ ma
# lokalne uziemienie nN, ale prąd zerowy propaguje się też przez stronę SN —
# ten moduł tego toru NIE dodaje (poza zakresem karty P0.6, uzasadnienie
# fizyczne dotyczy wyłącznie Dyn), więc SERIES_THROUGH jest tu ŚWIADOMIE
# wykluczone (fail-closed), nie zgadywane.
_LV_LOCAL_GROUND_CONNECTIONS = {ZeroSeqConnection.LV_SHUNT_GROUND}

#: Zasilanie odpływu — WYŁĄCZNIE stwierdzenie topologiczne (z ilu transformatorów
#: stacji szyny odpływu są osiągalne po ZAMKNIĘTYCH gałęziach), zero fizyki.
SUPPLY_ONE_SIDED = "jednostronne"
SUPPLY_MULTI_SIDED = "wielostronne"

#: Założenie zachowawcze dla odpływu osiągalnego z ≥2 transformatorów (§0.1 karty
#: B-02): impedancji równoległych NIE składamy w warstwie aplikacji (byłoby to
#: naruszenie NOT-A-SOLVER — nowa fizyka poza solverem), więc pętla liczy się od
#: transformatora WŁASNEJ sekcji. Wynik jest po bezpiecznej stronie: pojedynczy
#: transformator daje MNIEJSZY prąd zwarcia niż dwa pracujące równolegle.
SUPPLY_ASSUMPTION_MULTI_PL = (
    "pętla zwarcia liczona od transformatora własnej sekcji (założenie "
    "zachowawcze: sprzęgło otwarte / jeden transformator w pracy — mniejszy "
    "prąd zwarcia = warunek doboru SWZ)"
)


def _find_station(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    # Dopasowanie po ref_id (kanoniczny odnośnik domenowy) LUB id (UUID elementu),
    # spójnie z finderem ENM — wywołujący z inspektora podaje element.id.
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, getattr(s, "id", None))),
        None,
    )


def station_transformers(enm: EnergyNetworkModel, station: Substation) -> list[Transformer]:
    """WSZYSTKIE transformatory stacji, posortowane po ``ref_id`` (determinizm).

    Kolejność po ``ref_id``, a nie po pozycji w ``enm.transformers``, bo to ta
    sama reguła, którą stosuje kotwica SN domeny nN
    (``lv_domain.upstream_equivalent``) — dwie różne kolejności w dwóch
    modułach dawały przy stacji 2×TR snapshot upstream jednego transformatora
    i pętlę zwarcia drugiego (dwie prawdy o „transformatorze stacji").
    """
    refs = set(station.transformer_refs or ())
    return sorted((t for t in enm.transformers if t.ref_id in refs), key=lambda t: t.ref_id)


def resolve_station_transformer(
    enm: EnergyNetworkModel, station: Substation, transformer_ref: str | None
) -> tuple[Transformer | None, list[str]]:
    """Wybór transformatora stacji — JEDNO źródło prawdy dla wszystkich widoków nN.

    ``transformer_ref`` wskazany jawnie: musi istnieć w modelu (inaczej
    ``["transformer"]``) i należeć do tej stacji (inaczej
    ``["transformer_not_in_station"]``). Bez wskazania: PIERWSZY transformator
    stacji posortowany po ``ref_id`` — determinizm, ten sam wybór co
    ``station_transformers``.
    """
    if transformer_ref is not None:
        trafo = next((t for t in enm.transformers if t.ref_id == transformer_ref), None)
        if trafo is None:
            return None, ["transformer"]
        if trafo.ref_id not in set(station.transformer_refs or ()):
            return None, ["transformer_not_in_station"]
        return trafo, []
    transformers = station_transformers(enm, station)
    if not transformers:
        return None, ["transformer"]
    return transformers[0], []


@dataclass(frozen=True)
class LvBusAssignment:
    """Przypisanie szyn nN stacji do transformatorów — CZYSTA TOPOLOGIA.

    ``paths_by_transformer`` — trasy BFS (po gałęziach ``status="closed"``) od
    szyny nN każdego transformatora stacji.
    ``owner_by_bus`` — transformator, od którego szyna jest osiągalna
    NAJMNIEJSZĄ liczbą hopów (remis → mniejszy ``ref_id``). Trasa od
    właściciela NIGDY nie przechodzi przez szynę nN innego transformatora: gdyby
    przechodziła, tamten transformator dosięgałby szyny hopami mniej i to on
    byłby właścicielem. Dzięki temu każdy odpływ ma DOKŁADNIE jednego
    właściciela — bez podwójnego liczenia tych samych punktów.
    ``supplying_by_bus`` — WSZYSTKIE transformatory stacji, z których szyna jest
    osiągalna (posortowane); ≥2 pozycje = zasilanie wielostronne.
    """

    paths_by_transformer: dict[str, dict[str, LvBusPath]]
    owner_by_bus: dict[str, str]
    supplying_by_bus: dict[str, tuple[str, ...]]


def assign_station_lv_buses(
    enm: EnergyNetworkModel, transformers: list[Transformer]
) -> LvBusAssignment:
    """Przypisz szyny nN do transformatorów stacji (BFS wieloźródłowy, deterministyczny)."""
    paths_by_transformer: dict[str, dict[str, LvBusPath]] = {}
    for trafo in transformers:
        try:
            paths_by_transformer[trafo.ref_id] = bfs_paths_from(enm, trafo.lv_bus_ref)
        except RouteExtractionError:
            # Szyna nN transformatora nie istnieje w modelu — uczciwy brak tras,
            # nie wyjątek na całym widoku stacji (pozostałe TR liczą się dalej).
            paths_by_transformer[trafo.ref_id] = {}

    owner_by_bus: dict[str, str] = {}
    supplying: dict[str, list[str]] = {}
    for transformer_ref in sorted(paths_by_transformer):
        for bus_ref, path in paths_by_transformer[transformer_ref].items():
            supplying.setdefault(bus_ref, []).append(transformer_ref)
            current_owner = owner_by_bus.get(bus_ref)
            if current_owner is None:
                owner_by_bus[bus_ref] = transformer_ref
                continue
            current_hops = paths_by_transformer[current_owner][bus_ref].hop_count
            if (path.hop_count, transformer_ref) < (current_hops, current_owner):
                owner_by_bus[bus_ref] = transformer_ref

    return LvBusAssignment(
        paths_by_transformer=paths_by_transformer,
        owner_by_bus=owner_by_bus,
        supplying_by_bus={bus: tuple(sorted(refs)) for bus, refs in supplying.items()},
    )


def resolve_transformer_for_bus(
    enm: EnergyNetworkModel, station: Substation, bus_ref: str
) -> tuple[Transformer | None, list[str]]:
    """Transformator stacji ZASILAJĄCY WSKAZANY PUNKT nN — JEDNO źródło prawdy
    dla KAŻDEGO widoku „per punkt" (pętla zwarcia w punkcie, SWZ, Ik1_min doboru
    aparatu, pakiet dowodowy obwodu, wiersz arkusza, sekcja raportu).

    Właściciel szyny wg ``assign_station_lv_buses`` (transformator najbliższy po
    ZAMKNIĘTYCH gałęziach; remis → mniejszy ``ref_id``). Punkt nieosiągalny z
    żadnego transformatora stacji (odcięty otwartym łącznikiem, spoza stacji)
    dostaje transformator DOMYŚLNY (pierwszy po ``ref_id``) — wtedy brak trasy
    jest meldowany przez wołającego jako ``missing_data: ["route"]``, nie jako
    brak transformatora (transformator stacji istnieje; nie ma DROGI do punktu).

    Klasa, nie instancja (karta B-02): do 2026-09-01 pięć miejsc w czterech
    modułach brało „pierwszy transformator stacji" dla punktu w DOWOLNEJ sekcji —
    punkt sekcji 2 stacji 2×TR liczył się od TR1 przez sprzęgło (zła impedancja)
    albo nie miał trasy (sprzęgło otwarte).
    """
    assignment = assign_station_lv_buses(enm, station_transformers(enm, station))
    return resolve_station_transformer(enm, station, assignment.owner_by_bus.get(bus_ref))


@dataclass(frozen=True)
class UpstreamHvThevenin:
    """Impedancja Thevenina sieci SN w WĘŹLE HV transformatora — Ω w napięciu
    HV, NIE referowana do strony nN (karta T5b, docs/nn/KONCEPCJA_LOD_NN_2026-08.md,
    werdykt właściciela: ``UpstreamEquivalentSnapshot``).

    JEDNA ŚCIEŻKA FIZYKI (klasa nie instancja): dzielona podstawa dla
    ``_upstream_thevenin_lv_component`` (referuje TĘ SAMĄ wartość do strony nN
    kwadratem przekładni dla pętli zwarcia P0.6) i dla
    ``application.analyses.lv_domain.upstream_equivalent`` (kotwica SN domeny
    nN, T5b) — bez tego rozdzielenia druga ścieżka musiałaby powielić budowę
    grafu + odczyt Z-bus, dokładnie ten defekt, którego zakazuje CLAUDE.md §3.
    """

    hv_bus_ref: str
    z_hv_ohm: complex
    #: Karta PODSTAWA-Q (rozstrz. 3): wartości robocze parametrów maszyn wirujących wyspy węzła
    #: HV, z którymi policzono ``z_hv_ohm`` (maszyny są admitancjami bocznikowymi Z-bus) —
    #: każdy konsument (pętla zwarcia, kotwica SN) niesie je jako dane przyjęte.
    parametry_robocze_maszyn: tuple[dict[str, Any], ...] = field(default=(), compare=False)


def restrict_graph_to_island_of(graph: NetworkGraph, node_id: str) -> bool:
    """Zawęź graf (W MIEJSCU) do wyspy zasilania zawierającej ``node_id``.

    Wyspa = spójna składowa po AKTYWNYCH krawędziach grafu (gałęzie w ruchu +
    łączniki ZAMKNIĘTE — otwarty łącznik nie jest krawędzią, patrz
    ``NetworkGraph.add_switch``). Węzły spoza tej wyspy są usuwane razem z ich
    gałęziami/łącznikami (``NetworkGraph.remove_node``).

    Dlaczego (klasa B-02, defekt zastany zmierzony 2026-09-01): Z-bus liczy się
    z odwrócenia Y-bus CAŁEJ sieci, a szyna bez żadnej aktywnej krawędzi
    (podszyna za OTWARTYM rozłącznikiem, sekcja rezerwowa, wyspa DER) daje
    wiersz zerowy → macierz osobliwa GLOBALNIE. Skutek: jeden odcięty zacisk w
    modelu unieważniał upstream Thevenina, a więc KAŻDĄ pętlę zwarcia, KAŻDY
    werdykt SWZ i kotwicę SN całej stacji („upstream_network_singular"), choć
    fizycznie odcięta szyna nie ma z tymi obwodami nic wspólnego. Impedancja
    Thevenina w węźle jest własnością WYSPY tego węzła — węzły z innych wysp
    nie wnoszą do niej nic, więc ich usunięcie nie zmienia wyniku dla sieci
    spójnej (Z_kk identyczne), a dla sieci z wyspami daje wynik zamiast błędu.

    Zwraca ``False``, gdy ``node_id`` nie istnieje w grafie (nic nie zmieniono).
    Zero fizyki: czysta topologia stanów łączników, ta sama definicja wyspy co
    ``NetworkGraph.find_islands`` (jedno źródło prawdy).
    """
    if node_id not in graph.nodes:
        return False
    island = next(
        (set(members) for members in graph.find_islands() if node_id in members),
        {node_id},
    )
    removed = {other for other in graph.nodes if other not in island}
    for other in sorted(removed):
        graph.remove_node(other)
    # `remove_node` usuwa gałęzie i łączniki; źródła przypięte do usuniętych
    # węzłów (falowniki, maszyny, źródła zwarciowe sieci) też nie mogą zostać —
    # graf odwołujący się do nieistniejącego węzła jest niespójny.
    for collection in (
        graph.inverter_sources,
        graph.synchronous_machine_sources,
        graph.asynchronous_machine_sources,
        graph.grid_sc_sources,
    ):
        for element_id in sorted(
            element_id
            for element_id, element in collection.items()
            if getattr(element, "node_id", None) in removed
        ):
            del collection[element_id]
    return True


def compute_upstream_hv_thevenin(
    enm: EnergyNetworkModel, trafo: Transformer
) -> tuple[UpstreamHvThevenin | None, list[str]]:
    """Impedancja Thevenina sieci SN w węźle HV transformatora (Ω, NIE referowana).

    Reuse — zero własnej redukcji sieci: buduje TEN SAM graf i Z-bus co solver
    zwarciowy (``short_circuit_core.build_zbus``) i czyta Z_kk w węźle HV
    transformatora (impedancja widziana z zacisków HV, BEZ samego
    transformatora — gałąź TR prowadzi do sieci nN „w dół", nie z powrotem do
    źródła, więc nie ma podwójnego liczenia).

    Zwraca ``(None, missing)`` gdy zacisk HV nie jest częścią rozwiązywalnej
    sieci (brak zadeklarowanej szyny HV, sieć niepołączona z żadnym źródłem
    SN, model topologicznie niepoprawny — np. dwa węzły SLACK) —
    fail-closed, nigdy nie podstawia „silnego źródła" (nieskończonego)
    domyślnie ANI nie wywala się wyjątkiem na niepoprawnym modelu (endpoint
    MUSI zwrócić uczciwy stan, nie 500).
    """
    try:
        graph = map_enm_to_network_graph(enm)
    except OdmowaDanychError:
        return None, ["upstream_network_topology_invalid"]

    hv_node_id = ref_to_graph_id(trafo.hv_bus_ref)
    if not restrict_graph_to_island_of(graph, hv_node_id):
        return None, ["upstream_hv_bus"]

    try:
        builder, z_bus = build_zbus(graph)
    except (ValueError, ZeroDivisionError):
        return None, ["upstream_network_singular"]

    node_index = builder.node_id_to_index.get(hv_node_id)
    if node_index is None:
        return None, ["upstream_hv_bus"]

    z_base_ohm = builder.get_zbase_ohm(hv_node_id)
    z_kk_hv_ohm = complex(z_bus[node_index, node_index]) * z_base_ohm
    if z_kk_hv_ohm == 0:
        return None, ["upstream_network_source"]

    return (
        UpstreamHvThevenin(
            hv_bus_ref=hv_node_id,
            z_hv_ohm=z_kk_hv_ohm,
            parametry_robocze_maszyn=parametry_robocze_impedancji_maszyn(graph, hv_node_id),
        ),
        [],
    )


def _transformer_loop_impedance(
    trafo: Transformer,
) -> tuple[TransformerLoopImpedance | None, list[str]]:
    """Impedancja transformatora dla pętli L-PE/L-PEN, składowa ZGODNA z grupą
    połączeń (§0.1 karty P0.6).

    Reuse — zero własnej redukcji sieci sekwencji zerowej:
    ``enm.zero_sequence_transformer.build_transformer_zero_seq_model`` (już
    używane przez sieć składowej zerowej solvera zwarciowego) decyduje o typie
    połączenia; tu tylko przeliczenie pu→Ω
    (``zero_sequence_transformer_loop_impedance_ohm``, warstwa solvera).

    Zwraca ``(None, missing)`` gdy: brak parametrów TR (Sn/uk%/Ulv), brak
    ``vector_group``, albo grupa nie daje lokalnej drogi uziemienia strony nN
    (fail-closed — zero zgadywania dla grup innych niż rodzina Dyn).
    """
    missing: list[str] = []
    if not trafo.sn_mva or trafo.sn_mva <= 0:
        missing.append("sn_mva")
    if not trafo.uk_percent or trafo.uk_percent <= 0:
        missing.append("uk_percent")
    if not trafo.ulv_kv or trafo.ulv_kv <= 0:
        missing.append("ulv_kv")
    if missing:
        return None, missing

    if not trafo.vector_group:
        return None, ["vector_group"]

    zero_seq = build_transformer_zero_seq_model(trafo)
    if zero_seq.connection not in _LV_LOCAL_GROUND_CONNECTIONS or zero_seq.z0_pu is None:
        return None, [KOD_BRAK_LOKALNEGO_UZIEMIENIA_NN]

    z_tr = zero_sequence_transformer_loop_impedance_ohm(
        z0_pu=zero_seq.z0_pu,
        ulv_kv=trafo.ulv_kv,
        s_base_mva=S_BASE_MVA,
    )
    return z_tr, []


#: Kod listy braków: straty obciążeniowe P_k sprzeczne z napięciem zwarcia u_k (r > |z|).
KOD_PK_SPRZECZNE_Z_UK = "pk_kw_sprzeczne_z_uk_percent"

#: Pola modelu transformatora, których brak zgłaszają czytniki impedancji pętli
#: (`_transformer_loop_impedance`, `impedancja_transformatora_dla_ukladu`). Nazwę dla
#: projektanta daje słownik pól (`etykieta_parametru`) — bez drugiej kopii nazw.
POLA_BRAKOW_TRANSFORMATORA = ("sn_mva", "uk_percent", "ulv_kv", "vector_group")

#: Braki będące wynikiem predykatu (nie pustym polem modelu) → opis dla projektanta.
OPISY_BRAKOW_PREDYKATU_PL: dict[str, str] = {
    KOD_BRAK_LOKALNEGO_UZIEMIENIA_NN: (
        "„Grupa połączeń” bez lokalnie uziemionego punktu gwiazdowego strony nN — pętla "
        "L-PE/L-PEN nie ma drogi powrotnej przez transformator (np. Dyn ją daje)"
    ),
    KOD_PK_SPRZECZNE_Z_UK: (
        "„Straty obciążeniowe Pk” sprzeczne z „Napięciem zwarcia uk” (Pk/Sn większe niż uk)"
    ),
}


def opis_braku_transformatora(kod: str) -> str:
    """Opis pozycji listy braków transformatora dla projektanta — nigdy klucz maszynowy.

    Jedno źródło kodów: `POLA_BRAKOW_TRANSFORMATORA` (pola modelu) i
    `OPISY_BRAKOW_PREDYKATU_PL` (predykaty). Kompletność wobec kodów emitowanych przez
    czytniki pilnuje test iloczynu gałęzi czytnika.
    """
    opis = OPISY_BRAKOW_PREDYKATU_PL.get(kod)
    return opis if opis is not None else etykieta_parametru(kod)


#: Kody strukturalne listy braków analiz obwodu nN (pętla zwarcia, SWZ, karta obwodu, domena
#: nN, dowód obwodu) → opis dla projektanta. Kody pól transformatora i predykatów opisuje
#: ``opis_braku_transformatora``. Lustro frontu: ``frontend/src/ui/sld/v3/lv-domain/
#: opisyBrakowDanychNn.ts`` (parytet kluczy przypina
#: ``tests/application/analyses/test_opisy_brakow_danych_nn.py``).
OPISY_BRAKOW_DANYCH_NN_PL: dict[str, str] = {
    "station": "brak stacji w modelu sieci",
    "transformer": "brak transformatora stacji",
    "transformer_not_in_station": "wskazany transformator nie należy do stacji",
    "route": "brak trasy do źródła w aktualnej topologii",
    BRAK_UKLADU_NN: "brak układu uziemienia sieci nN transformatora",
    "upstream_network_topology_invalid": (
        "topologia sieci SN niepoprawna (źródło poza szyną modelu) — równoważnik nieobliczalny"
    ),
    "upstream_network_singular": "sieć SN osobliwa — brak drogi do źródła",
    "upstream_hv_bus": "szyna SN transformatora poza rozwiązywalną siecią",
    "upstream_network_source": "brak źródła zasilania sieci SN",
    "lv_bus": "stacja bez szyny w paśmie nN",
    "lv_bus_ref": "transformator bez szyny strony nN",
    "worst_point_bus_ref": "brak policzalnego najgorszego punktu odpływu",
    "breaker": "brak wyłącznika obwodu",
    "breaker_catalog_binding": "wyłącznik obwodu bez powiązania z katalogiem aparatów",
    "lv_neutral.r_ohm": "brak rezystancji uziemienia roboczego R_B punktu neutralnego",
    "earth_electrode_r_ohm": "brak rezystancji uziomu ochronnego R_A",
    "rcd": "brak wyłącznika różnicowoprądowego obwodu",
    "b0_siemens_per_km": "brak pojemności doziemnej (susceptancji zerowej b_0) odcinka",
    "header.defaults.frequency_hz": "brak częstotliwości znamionowej sieci w nagłówku modelu",
}

#: Opis kodu spoza słownika — uczciwe zdanie zamiast kodu maszynowego.
BRAK_SPOZA_SLOWNIKA_NN_PL = "brak danej spoza słownika aplikacji"


def _miejsce_braku_nn(przedrostek: str) -> str:
    """Miejsce braku z przedrostka pozycji listy braków domeny nN: ``swz`` (ocena SWZ
    odpływu), ``upstream:<transformator>`` (równoważnik sieci SN po stronie SN
    transformatora — `lv_domain/projection_v1.py`), ``<element>`` (wskazany element)."""
    if przedrostek == "swz":
        return "ocena samoczynnego wyłączenia zasilania"
    rownowaznik, _, transformator = przedrostek.partition(":")
    if rownowaznik == "upstream" and transformator:
        return f"równoważnik sieci SN transformatora {transformator}"
    return f"element {przedrostek}"


def opis_braku_danych_nn(kod: str) -> str:
    """Opis pozycji listy braków analiz obwodu nN — nigdy klucz maszynowy. Pozycja
    ``<przedrostek>:<kod>`` (brak dotyczący wskazanego elementu, oceny SWZ albo
    równoważnika SN transformatora) daje opis z nazwą miejsca przed identyfikatorem
    (``_miejsce_braku_nn``). Lustro frontu: ``opisBrakuDanychNn``."""
    przedrostek, _, wlasciwy = kod.rpartition(":")
    opis = OPISY_BRAKOW_DANYCH_NN_PL.get(wlasciwy)
    if opis is None and (
        wlasciwy in OPISY_BRAKOW_PREDYKATU_PL or wlasciwy in POLA_BRAKOW_TRANSFORMATORA
    ):
        opis = opis_braku_transformatora(wlasciwy)
    if opis is None:
        opis = BRAK_SPOZA_SLOWNIKA_NN_PL
    return f"{opis} ({_miejsce_braku_nn(przedrostek)})" if przedrostek else opis


def impedancja_transformatora_dla_ukladu(
    trafo: Transformer, uklad: str
) -> tuple[TransformerLoopImpedance | None, list[str]]:
    """Impedancja transformatora WŁAŚCIWA dla pętli danego układu (karta W5-E-TTIT).

    TN i TT — pętla domyka się przez uzwojenie nN i punkt neutralny (TN: PE/PEN, TT: uziomy
    R_A/R_B), więc składowa zgodna z grupą połączeń (``_transformer_loop_impedance``, z0
    rodziny Dyn). IT — drugie zwarcie doziemne L-PE-L nie płynie przez punkt neutralny (jest
    izolowany): pętla dwóch faz widzi impedancję zgodną Z1 transformatora
    (``transformer_lv_impedance_ohm`` z uk%, Sn, Ulv, Pk — warstwa solvera).
    """
    if uklad != "IT":
        return _transformer_loop_impedance(trafo)
    missing: list[str] = []
    if not trafo.sn_mva or trafo.sn_mva <= 0:
        missing.append("sn_mva")
    if not trafo.uk_percent or trafo.uk_percent <= 0:
        missing.append("uk_percent")
    if not trafo.ulv_kv or trafo.ulv_kv <= 0:
        missing.append("ulv_kv")
    if missing:
        return None, missing
    try:
        z_tr = transformer_lv_impedance_ohm(
            sn_mva=trafo.sn_mva,
            uk_percent=trafo.uk_percent,
            ulv_kv=trafo.ulv_kv,
            pk_kw=trafo.pk_kw,
        )
    except OdmowaDanychError:
        # Dane sprzeczne (P_k/S_n > u_k albo P_k < 0) — predykat warstwy solvera
        # (`odmowa_gdy_pk_sprzeczne_z_uk`); kontrakt tej funkcji to lista braków, nie wyjątek.
        return None, [KOD_PK_SPRZECZNE_Z_UK]
    return z_tr, []


#: Etykieta zerowej składowej powrotnej pętli TT (PE kabla nie należy do pętli doziemnej).
ETYKIETA_POWROT_TT = "Przewód ochronny kabla — poza pętlą TT (powrót przez uziomy R_A i R_B)"


@dataclass(frozen=True)
class SkladowePunktu:
    """Składowe pętli punktu wg układu: trasa + dane TT/IT (``None`` dla TN)."""

    phase_component: LoopImpedanceComponent
    return_component: LoopImpedanceComponent
    dane_tt_it: DaneTtIt | None
    dane_punktu: DanePunktuTtIt | None


def skladowe_punktu(
    enm: EnergyNetworkModel,
    trafo: Transformer,
    uklad: str,
    path: LvBusPath | None,
    bus_ref: str,
    phase_component: LoopImpedanceComponent,
    return_component: LoopImpedanceComponent,
    context: dict[str, Any],
) -> SkladowePunktu | dict[str, Any]:
    """Składowe pętli dla punktu WEDŁUG UKŁADU — jedno miejsce dla wszystkich widoków nN.

    TN: trasa fazowa + powrotna (PE/PEN). TT: trasa fazowa, powrót przez uziomy (składowa
    powrotna zerowa, R_A/R_B dochodzą w solverze), RCD z trasy. IT: trasa fazowa + PE
    (drugie zwarcie), pojemności sieci (pierwsze zwarcie). Brak danej TT/IT = odmowa
    nazwana z kodem (słownik odmów w ``tt_it``).
    """
    if uklad_tn(uklad):
        return SkladowePunktu(phase_component, return_component, None, None)
    dane = dane_tt_it_dla_punktu(enm, trafo, uklad, path, bus_ref, context)
    if isinstance(dane, dict):
        return dane
    powrot = (
        LoopImpedanceComponent(label=ETYKIETA_POWROT_TT, r_ohm=0.0, x_ohm=0.0)
        if uklad == "TT"
        else return_component
    )
    return SkladowePunktu(phase_component, powrot, dane.dane, dane)


def _upstream_thevenin_lv_component(
    enm: EnergyNetworkModel, trafo: Transformer
) -> tuple[LoopImpedanceComponent | None, list[str]]:
    """Impedancja Thevenina sieci SN w punkcie HV transformatora, sprowadzona do nN.

    Reuse — zero własnej redukcji sieci: buduje TEN SAM graf i Z-bus co solver
    zwarciowy (``short_circuit_core.build_zbus``), czyta Z_kk w węźle HV
    transformatora (impedancja widziana z zacisków HV, BEZ samego
    transformatora — gałąź TR prowadzi do sieci nN „w dół", nie z powrotem do
    źródła, więc nie ma podwójnego liczenia), i sprowadza do strony nN kwadratem
    przekładni (``refer_upstream_impedance_to_lv_ohm``).

    Zwraca ``(None, missing)`` gdy zacisk HV nie jest częścią rozwiązywalnej
    sieci (brak zadeklarowanej szyny HV, sieć niepołączona z żadnym źródłem
    SN, model topologicznie niepoprawny — np. dwa węzły SLACK) —
    fail-closed, nigdy nie podstawia „silnego źródła" (nieskończonego)
    domyślnie ANI nie wywala się wyjątkiem na niepoprawnym modelu (endpoint
    MUSI zwrócić uczciwy stan, nie 500).

    DELEGUJE do ``compute_upstream_hv_thevenin`` (Z1 SN w Ω HV, NIE referowana)
    i referuje WYNIK do strony nN — jedna ścieżka fizyki dzielona z kotwicą SN
    domeny nN (karta T5b), zero drugiej redukcji sieci.
    """
    hv_equiv, missing = compute_upstream_hv_thevenin(enm, trafo)
    if hv_equiv is None:
        return None, missing

    component = refer_upstream_impedance_to_lv_ohm(
        z_hv_ohm=hv_equiv.z_hv_ohm,
        uhv_kv=trafo.uhv_kv,
        ulv_kv=trafo.ulv_kv,
        label=etykieta_sieci_zasilajacej_petli(trafo),
    )
    # Karta PODSTAWA-Q (rozstrz. 3): składowa niesie wartości robocze maszyn, z którymi ją
    # policzono — wynik pętli zbiera je z tej składowej (`parametry_robocze_skladowych`).
    return replace(component, parametry_robocze_maszyn=hv_equiv.parametry_robocze_maszyn), []


def uklad_nn_transformatora(trafo: Transformer) -> str | None:
    """Układ sieci nN z transformatora ZASILAJĄCEGO (jedyny nośnik, W5-A) — brak = ``None``."""
    return trafo.lv_earthing_system


def odmowa_ukladu_nn(context: dict[str, Any], uklad: str | None) -> dict[str, Any] | None:
    """Odmowa NAZWANA, gdy transformator nie deklaruje układu sieci nN.

    Zwraca gotową odpowiedź widoku albo ``None`` (układ zadeklarowany — licz dalej:
    TN pętlą L-PE/L-PEN, TT/IT pętlą doziemną ``petla_zwarcia_tt_it`` przez to samo
    wejście ``compute_fault_loop``; karta W5-E-TTIT skasowała dawne „nie dotyczy" dla TT/IT).
    Jedno miejsce dla widoków pętli zwarcia, SWZ, doboru aparatów nN i wiązania dowodu.
    """
    if uklad is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": [BRAK_UKLADU_NN],
            "reason_pl": (
                "Transformator zasilający nie deklaruje układu uziemienia sieci nN "
                "(TN-S/TN-C-S/TN-C/TT/IT) — pętla zwarcia nie jest liczona; brak danej "
                "nie jest zastępowany żadnym układem domyślnym."
            ),
        }
    return None


#: Nazwana odmowa analiz nN: strona dolna transformatora zasilającego spoza pasma nN
#: (albo bez napięcia). Wartość addytywna — istniejące kody bez zmian.
KOD_ODMOWY_PASMA_NN = "nn.transformer_lv_not_nn_band"


def odmowa_pasma_nn(context: dict[str, Any], trafo: Transformer) -> dict[str, Any] | None:
    """Odmowa NAZWANA, gdy strona dolna transformatora zasilającego nie leży w paśmie nN.

    Analizy nN (pętla zwarcia TN wg IEC 60364-4-41, SWZ, dobór aparatów nN, dowód
    obwodu nN, arkusz obwodów nN) liczone dla transformatora 110/15 kV dawały „OK,
    U0 = 8660 V” — wynik fabrykowany. Predykat pasma: `pasma_napieciowe.w_pasmie_nn`
    (ten sam co w bramkach operacji strony dolnej). Zwraca gotową odpowiedź widoku albo
    ``None`` (strona dolna w paśmie nN — licz dalej).
    """
    napiecie = trafo.ulv_kv
    if w_pasmie_nn(napiecie):
        return None
    opis = opis_obiektu(trafo, "Transformator")
    pasmo = pasmo_napieciowe(napiecie)
    if pasmo is None:
        powod = (
            f"{opis} nie ma dodatniego napięcia strony dolnej — "
            "przynależności do pasma nN nie da się potwierdzić, więc analiza nN nie jest "
            "liczona. Uzupełnij napięcie strony dolnej z pozycji katalogowej transformatora."
        )
    else:
        powod = (
            f"{opis} ma stronę dolną {napiecie:g} kV "
            f"(pasmo {pasmo}) — analiza nN (pętla zwarcia TN, "
            "samoczynne wyłączenie zasilania, dobór aparatów nN) dotyczy wyłącznie sieci nN "
            f"({OPIS_PASMA_NN}) i nie jest liczona. Wskaż stację z transformatorem SN/nN albo "
            "sprawdź napięcie strony dolnej w pozycji katalogowej transformatora."
        )
    return {
        **context,
        "status": "nie dotyczy",
        "kod_odmowy": KOD_ODMOWY_PASMA_NN,
        "reason_pl": powod,
        "missing_data": [],
    }


def tolerancja_sieci_nn_transformatora(
    enm: EnergyNetworkModel, trafo: Transformer
) -> TolerancjaNnRozstrzygnieta:
    """Klasa tolerancji sieci nN zasilanej z transformatora — JEDEN predykat (`enm.tolerancja_nn`).

    Czytana dla szyny strony dolnej: punkt zwarcia trasy pętli leży w tej samej wyspie nN
    (trasa prowadzi od transformatora gałęziami nN). Zawsze ustalona (karta
    TOLERANCJA-NN-WARTOSC-ROBOCZA): deklaracja projektanta albo wartość robocza rejestru —
    brak deklaracji nie blokuje pętli. Szyna strony dolnej spoza pasma nN (napięcie szyny
    rozbieżne z napięciem strony dolnej transformatora) nie należy do żadnej wyspy nN — klasę
    rozstrzyga wtedy ta sama reguła rejestru z deklaracji samego transformatora.
    """
    wyspa = wyspy_wezlow_nn(enm).get(trafo.lv_bus_ref)
    if wyspa is not None:
        return wyspa.rozstrzygniecie
    return rozstrzygnij_tolerancje_nn((trafo.lv_voltage_tolerance,))


def odmowa_analizy_nn(context: dict[str, Any], trafo: Transformer) -> dict[str, Any] | None:
    """Jedno wejście odmów analiz nN: pasmo strony dolnej i układ sieci.

    Tolerancja napięcia sieci nN nie jest odmową (karta TOLERANCJA-NN-WARTOSC-ROBOCZA, zasada
    nr 4): brak deklaracji daje wartość roboczą rejestru, nazwaną w podstawie c pętli.
    """
    return odmowa_pasma_nn(context, trafo) or odmowa_ukladu_nn(
        context, uklad_nn_transformatora(trafo)
    )


def etykieta_transformatora_petli(trafo: Transformer) -> str:
    """Etykieta składowej transformatora w pętli zwarcia: nazwa urządzenia z modelu.

    Rolę składowej (transformator) niesie pole wejścia solvera
    (`FaultLoopInput.transformer_impedance`) i stała kolejność składowych wyniku, więc
    etykieta jej nie powtarza: sklejanie „Transformator SN/nN {nazwa}” dawało
    „Transformator SN/nN Transformator SN/nN” dla nazwy domyślnej stacji i przypisywało
    klasę SN/nN transformatorowi, którego napięcia jej nie potwierdzały. Pusta nazwa →
    opis rodzaju z jednej reguły nazw elementów (`enm.nazwy_elementow`, karta #144), nigdy
    identyfikator.
    """
    return nazwa_elementu(trafo, "transformers")


def etykieta_sieci_zasilajacej_petli(trafo: Transformer) -> str:
    """Etykieta składowej sieci zasilającej (Thevenin w węźle GN, sprowadzony na stronę DN).

    Pasma obu stron z jednego źródła (`pasma_napieciowe.pasmo_napieciowe`) zastosowanego
    do napięć znamionowych transformatora — nie ze stałej „SN”/„nN” domyślnej etykiety
    `refer_upstream_impedance_to_lv_ohm`.
    """
    strona_gorna = pasmo_napieciowe(trafo.uhv_kv) or "zasilająca"
    strona_dolna = pasmo_napieciowe(trafo.ulv_kv) or "strony dolnej"
    return f"Sieć {strona_gorna} (upstream Thevenin, sprowadzone do {strona_dolna})"


def oblicz_petle_na_trasie(
    *,
    enm: EnergyNetworkModel,
    trafo: Transformer,
    fault_node_id: str,
    u_phase_v: float,
    net_type: NetworkType,
    protection: ProtectionArrangement,
    z_tr: TransformerLoopImpedance,
    upstream: LoopImpedanceComponent,
    phase_component: LoopImpedanceComponent,
    return_component: LoopImpedanceComponent,
    dane_tt_it: DaneTtIt | None = None,
) -> FaultLoopResult:
    """Pętla zwarcia na trasie punkt → transformator: JEDNO złożenie wejścia solvera.

    Dzielone przez widoki pętli zwarcia, SWZ, dobór aparatów nN i dowód weryfikacji obwodu
    nN — dotąd każdy z czterech modułów składał `FaultLoopBuildRequest` osobno, z własną
    kopią etykiety transformatora.
    """
    tolerancja = tolerancja_sieci_nn_transformatora(enm, trafo)
    request = FaultLoopBuildRequest(
        fault_node_id=fault_node_id,
        u_nom_v=u_phase_v,
        network_type=net_type,
        protection_arrangement=protection,
        phase_conductor_r_ohm=phase_component.r_ohm,
        phase_conductor_x_ohm=phase_component.x_ohm,
        return_conductor_r_ohm=return_component.r_ohm,
        return_conductor_x_ohm=return_component.x_ohm,
        transformer_r_ohm=z_tr.r_ohm,
        transformer_x_ohm=z_tr.x_ohm,
        transformer_label=etykieta_transformatora_petli(trafo),
        upstream_r_ohm=upstream.r_ohm,
        upstream_x_ohm=upstream.x_ohm,
        upstream_label=upstream.label,
        phase_label=phase_component.label,
        return_label=return_component.label,
        dane_tt_it=dane_tt_it,
        # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c_min/c_max pętli z klasy tolerancji sieci nN
        # (deklaracja albo wartość robocza — karta TOLERANCJA-NN-WARTOSC-ROBOCZA).
        tolerancja_nn=tolerancja.wartosc,
        tolerancja_nn_robocza=tolerancja.robocza,
        # Karta PODSTAWA-Q (rozstrz. 3): wartości robocze maszyn, z którymi policzono Z sieci SN.
        parametry_robocze_maszyn=upstream.parametry_robocze_maszyn,
    )
    wynik = compute_fault_loop(build_fault_loop_input(request))
    # Karta LINIA-110: impedancja sieci zasilającej pętli (Z_kk w węźle HV transformatora)
    # zawiera linie 110 kV z wyspy tego węzła — ich wartości robocze geometrii są danymi
    # przyjętymi pętli (te same rekordy co założenia biegów, `zalozenia_linii_wn`).
    dane_linii = dane_przyjete_linii_wezla(enm, trafo.hv_bus_ref)
    if not dane_linii:
        return wynik
    return replace(wynik, dane_przyjete_linii_wn=dane_linii)


def build_station_fault_loop_view(
    enm: EnergyNetworkModel, station_ref: str, *, transformer_ref: str | None = None
) -> dict[str, Any]:
    """Zbuduj widok pętli zwarcia u źródła stacji (nN) z modelu.

    Trasa zerodługościowa (punkt zwarcia = szyna nN transformatora) — przypadek
    szczególny TEJ SAMEJ funkcji, której używa ``build_fault_loop_view_at_point``
    dla dowolnego punktu (jedna ścieżka fizyki, zero duplikacji).

    Układ TT (karta W5-E-TTIT): pętla doziemna domyka się przez uziom INSTALACJI odbiorczej
    R_A, a na szynie nN transformatora nie ma instalacji — widok u źródła odmawia kodem
    `nn.brak_r_a` (dane punktu odpływu z odbiorem daje `build_fault_loop_view_at_point`).
    Układ IT: prąd pierwszego zwarcia (pojemności całej sieci) i drugie zwarcie u źródła.

    ``transformer_ref`` (karta B-02) wskazuje transformator stacji; bez
    wskazania — domyślny (pierwszy po ``ref_id``). Przy stacji 2×TR „źródło" nie
    jest jedno: szyna nN każdego transformatora ma własną pętlę u źródła, więc
    bez tego parametru drugiej sekcji NIE DAŁO SIĘ w ogóle zapytać.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
        }

    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": None,
    }

    trafo, transformer_missing = resolve_station_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": transformer_missing}

    system = uklad_nn_transformatora(trafo)
    context["network_system"] = system
    odmowa = odmowa_analizy_nn(context, trafo)
    if odmowa is not None:
        return odmowa
    assert system is not None

    z_tr, missing = impedancja_transformatora_dla_ukladu(trafo, system)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {**context, "status": "brak danych", "missing_data": upstream_missing}

    net_type, protection = typ_sieci_solvera(system)
    u_phase_v = napiecie_fazowe_v(kv_na_v(trafo.ulv_kv))
    zero_component = LoopImpedanceComponent(label="—", r_ohm=0.0, x_ohm=0.0)
    skladowe = skladowe_punktu(
        enm,
        trafo,
        system,
        None,
        trafo.lv_bus_ref,
        zero_component,
        zero_component,
        context,
    )
    if isinstance(skladowe, dict):
        return skladowe

    result = oblicz_petle_na_trasie(
        enm=enm,
        trafo=trafo,
        fault_node_id=trafo.lv_bus_ref,
        u_phase_v=u_phase_v,
        net_type=net_type,
        protection=protection,
        z_tr=z_tr,
        upstream=upstream,
        phase_component=skladowe.phase_component,
        return_component=skladowe.return_component,
        dane_tt_it=skladowe.dane_tt_it,
    )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "fault_loop": result.to_dict(),
        "tt_it": (skladowe.dane_punktu.to_dict() if skladowe.dane_punktu is not None else None),
        "missing_data": [],
        "note_pl": (
            "Impedancja pętli zwarcia u źródła (szyna nN) — startowa dla obwodów nN. "
            "Napięcia dotyku i czas wyłączenia oceniane dla najdalszego punktu obwodu osobno."
        ),
    }


def build_fault_loop_view_at_point(
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    *,
    transformer_ref: str | None = None,
) -> dict[str, Any]:
    """Pętla zwarcia w DOWOLNYM punkcie nN (karta P0.6, §0.2).

    Trasa REALNA z grafu (BFS ``.route``) od punktu do zacisków nN
    transformatora — kabel po kablu, z żyłą powrotną i n_parallel; ta sama
    impedancja transformatora + upstream co ``build_station_fault_loop_view``.

    TRANSFORMATOR (karta B-02): bez wskazania ``transformer_ref`` bierzemy ten,
    KTÓRY ZASILA WSKAZANY PUNKT — właściciela szyny wg
    ``assign_station_lv_buses`` (najbliższy po zamkniętych gałęziach). Wcześniej
    był to zawsze „pierwszy transformator stacji", więc punkt w sekcji 2 stacji
    2×TR liczył się od TR1 przez sprzęgło (zła impedancja) albo w ogóle nie miał
    trasy (sprzęgło otwarte). Punkt nieosiągalny z żadnego transformatora
    stacji zostaje przy domyślnym transformatorze — wtedy brak trasy jest
    uczciwie meldowany jako ``missing_data: ["route"]``, dokładnie jak dotąd.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "bus_ref": bus_ref,
        }

    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": None,
        "bus_ref": bus_ref,
    }

    trafo, transformer_missing = (
        resolve_transformer_for_bus(enm, station, bus_ref)
        if transformer_ref is None
        else resolve_station_transformer(enm, station, transformer_ref)
    )
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": transformer_missing}

    system = uklad_nn_transformatora(trafo)
    context["network_system"] = system
    odmowa = odmowa_analizy_nn(context, trafo)
    if odmowa is not None:
        return odmowa
    assert system is not None

    z_tr, missing = impedancja_transformatora_dla_ukladu(trafo, system)
    if z_tr is None:
        return {**context, "status": "brak danych", "missing_data": missing}

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {**context, "status": "brak danych", "missing_data": upstream_missing}

    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, bus_ref)
        segments = route_segments(path)
    except RouteExtractionError as exc:
        return {
            **context,
            "status": "brak danych",
            "missing_data": ["route"],
            "reason_pl": str(exc),
        }

    phase_component, return_component = sum_phase_and_return_route(segments)
    net_type, protection = typ_sieci_solvera(system)
    u_phase_v = napiecie_fazowe_v(kv_na_v(trafo.ulv_kv))
    skladowe = skladowe_punktu(
        enm, trafo, system, path, bus_ref, phase_component, return_component, context
    )
    if isinstance(skladowe, dict):
        return skladowe

    result = oblicz_petle_na_trasie(
        enm=enm,
        trafo=trafo,
        fault_node_id=bus_ref,
        u_phase_v=u_phase_v,
        net_type=net_type,
        protection=protection,
        z_tr=z_tr,
        upstream=upstream,
        phase_component=skladowe.phase_component,
        return_component=skladowe.return_component,
        dane_tt_it=skladowe.dane_tt_it,
    )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "hop_count": path.hop_count,
        "route_branch_refs": [b.ref_id for b in path.branches],
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "fault_loop": result.to_dict(),
        "tt_it": (skladowe.dane_punktu.to_dict() if skladowe.dane_punktu is not None else None),
        "missing_data": [],
    }


@dataclass(frozen=True)
class LvPointResult:
    """Wynik pętli zwarcia (albo uczciwy brak) w JEDNYM punkcie nN."""

    bus_ref: str
    hop_count: int
    status: str  # "OK" | "brak danych"
    fault_loop: dict[str, Any] | None = None
    reason_pl: str | None = None
    #: Karta W5-E-TTIT: kod odmowy nazwanej danych TT/IT punktu (R_A, RCD, pojemności).
    kod_odmowy: str | None = None
    tt_it: dict[str, Any] | None = None


@dataclass(frozen=True)
class FeederPoints:
    """Wszystkie punkty JEDNEGO odpływu + wskazanie najdalszego (najgorszego)."""

    feeder_root_branch_ref: str
    points: tuple[LvPointResult, ...]
    worst_point_bus_ref: str | None


def build_feeder_fault_loop_view_for_transformer(
    enm: EnergyNetworkModel, station_ref: str, transformer_ref: str
) -> dict[str, Any]:
    """Pętla zwarcia odpływów JEDNEGO transformatora stacji (karta B-02, §0.1).

    Odpływ należy do tego transformatora, od którego szyny nN zaczyna się jego
    trasa (``assign_station_lv_buses`` — najbliższy transformator po zamkniętych
    gałęziach). Odpływ osiągalny z ≥2 transformatorów stacji (sprzęgło
    ZAMKNIĘTE) dostaje ``supply="wielostronne"`` i JAWNE
    ``supply_assumption_pl``: pętla liczy się od transformatora WŁASNEJ sekcji,
    bo składania impedancji równoległych nie wolno robić w warstwie aplikacji
    (NOT-A-SOLVER) — a wynik jednego transformatora jest po bezpiecznej stronie
    kryterium SWZ. Odpływ zasilany z jednego transformatora:
    ``supply="jednostronne"``, ``supply_assumption_pl=None``.

    Kształt odpowiedzi jest DOKŁADNIE taki jak
    ``build_feeder_fault_loop_view`` dla stacji jednotransformatorowej (te same
    klucze) — plus dwa pola ``supply*`` na każdym odpływie.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "feeders": [],
        }

    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": None,
    }

    trafo, transformer_missing = resolve_station_transformer(enm, station, transformer_ref)
    if trafo is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": transformer_missing,
            "feeders": [],
        }

    system = uklad_nn_transformatora(trafo)
    context["network_system"] = system
    odmowa = odmowa_analizy_nn(context, trafo)
    if odmowa is not None:
        return {**odmowa, "feeders": []}
    assert system is not None

    z_tr, missing = impedancja_transformatora_dla_ukladu(trafo, system)
    if z_tr is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": missing,
            "feeders": [],
        }

    upstream, upstream_missing = _upstream_thevenin_lv_component(enm, trafo)
    if upstream is None:
        return {
            **context,
            "status": "brak danych",
            "missing_data": upstream_missing,
            "feeders": [],
        }

    if system == "IT":
        # Dane sieci IT (pojemności doziemne, częstotliwość) są własnością SIECI, nie punktu —
        # ich brak odmawia całego widoku odpływów tym samym kodem co punkt i źródło.
        siec_it = dane_sieci_it(enm, trafo, context)
        if isinstance(siec_it, dict):
            return {**siec_it, "feeders": []}

    net_type, protection = typ_sieci_solvera(system)
    u_phase_v = napiecie_fazowe_v(kv_na_v(trafo.ulv_kv))

    assignment = assign_station_lv_buses(enm, station_transformers(enm, station))
    paths = assignment.paths_by_transformer.get(trafo.ref_id, {})
    # Grupowanie per odpływ = pierwsza gałąź trasy od szyny TR (§0.2 karty P0.6),
    # REUSE `route.group_bus_refs_by_feeder` (karta ARKUSZ-NN, 2026-08-14),
    # ZAWĘŻONE do szyn, których właścicielem jest TEN transformator (karta B-02).
    owned_paths = {
        bus_ref: path
        for bus_ref, path in paths.items()
        if assignment.owner_by_bus.get(bus_ref) == trafo.ref_id
    }
    # Odpływ zaczyna się na szynie rozdzielnicy, nie na zacisku transformatora:
    # wyłącznik główny nN (incomer) nie jest odpływem (`route.incomer_branch_refs`).
    incomers = incomer_branch_refs(
        enm,
        station.bus_refs,
        [t.lv_bus_ref for t in station_transformers(enm, station)],
    )
    feeder_bus_refs = group_bus_refs_by_feeder(owned_paths, incomers)

    feeders: list[dict[str, Any]] = []
    for root_branch_ref in sorted(feeder_bus_refs):
        points: list[LvPointResult] = []
        worst_bus_ref: str | None = None
        worst_magnitude = -1.0
        bus_refs_of_feeder = sorted(feeder_bus_refs[root_branch_ref])
        for bus_ref in bus_refs_of_feeder:
            path = paths[bus_ref]
            try:
                segments = route_segments(path)
            except RouteExtractionError as exc:
                points.append(
                    LvPointResult(
                        bus_ref=bus_ref,
                        hop_count=path.hop_count,
                        status="brak danych",
                        reason_pl=str(exc),
                    )
                )
                continue
            phase_component, return_component = sum_phase_and_return_route(segments)
            skladowe = skladowe_punktu(
                enm, trafo, system, path, bus_ref, phase_component, return_component, {}
            )
            if isinstance(skladowe, dict):
                # Odmowa nazwana danych TT/IT PUNKTU (brak R_A instalacji w tym punkcie itp.)
                # — nie ukrywa pozostałych punktów odpływu.
                points.append(
                    LvPointResult(
                        bus_ref=bus_ref,
                        hop_count=path.hop_count,
                        status="brak danych",
                        reason_pl=skladowe.get("reason_pl"),
                        kod_odmowy=skladowe.get("kod_odmowy"),
                    )
                )
                continue
            result = oblicz_petle_na_trasie(
                enm=enm,
                trafo=trafo,
                fault_node_id=bus_ref,
                u_phase_v=u_phase_v,
                net_type=net_type,
                protection=protection,
                z_tr=z_tr,
                upstream=upstream,
                phase_component=skladowe.phase_component,
                return_component=skladowe.return_component,
                dane_tt_it=skladowe.dane_tt_it,
            )
            points.append(
                LvPointResult(
                    bus_ref=bus_ref,
                    hop_count=path.hop_count,
                    status="OK",
                    fault_loop=result.to_dict(),
                    tt_it=(
                        skladowe.dane_punktu.to_dict() if skladowe.dane_punktu is not None else None
                    ),
                )
            )
            magnitude = abs(result.z_loop_ohm)
            if magnitude > worst_magnitude:
                worst_magnitude = magnitude
                worst_bus_ref = bus_ref

        # Osiągalność jest własnością SPÓJNEJ SKŁADOWEJ zamkniętych gałęzi, więc
        # wszystkie szyny jednego odpływu mają tę samą listę zasilających
        # transformatorów — bierzemy ją z dowolnej (pierwszej) szyny odpływu.
        supplying = assignment.supplying_by_bus.get(bus_refs_of_feeder[0], (trafo.ref_id,))
        multi_sided = len(supplying) >= 2
        feeders.append(
            {
                "feeder_root_branch_ref": root_branch_ref,
                "points": [
                    {
                        "bus_ref": p.bus_ref,
                        "hop_count": p.hop_count,
                        "status": p.status,
                        "fault_loop": p.fault_loop,
                        "reason_pl": p.reason_pl,
                        "kod_odmowy": p.kod_odmowy,
                        "tt_it": p.tt_it,
                    }
                    for p in points
                ],
                "worst_point_bus_ref": worst_bus_ref,
                "supply": SUPPLY_MULTI_SIDED if multi_sided else SUPPLY_ONE_SIDED,
                "supply_assumption_pl": (SUPPLY_ASSUMPTION_MULTI_PL if multi_sided else None),
            }
        )

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "upstream_impedance_ohm": {"r": upstream.r_ohm, "x": upstream.x_ohm},
        "feeders": feeders,
        "missing_data": [],
    }


def build_feeder_fault_loop_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Pętla zwarcia we WSZYSTKICH punktach nN stacji, pogrupowana per odpływ.

    Kontrakt danych kompletny (wszystkie punkty obwodu w odpowiedzi, karta
    P0.6) — dla każdego odpływu (pierwsza gałąź od szyny nN transformatora)
    zwraca KAŻDY osiągalny punkt (``LvPointResult``, ``status`` OK albo uczciwy
    brak per punkt — brak danych na jednym kablu NIE ukrywa pozostałych punktów
    tego odpływu) oraz ``worst_point_bus_ref`` — punkt o NAJWIĘKSZEJ impedancji
    pętli spośród punktów policzalnych tego odpływu.

    Widok jest PĘTLĄ PO WSZYSTKICH TRANSFORMATORACH stacji (karta B-02, §0.1):
    każdy odpływ liczy się od SWOJEGO transformatora, a odpowiedź scala odpływy
    wszystkich transformatorów posortowane po ``feeder_root_branch_ref``. Dla
    stacji jednotransformatorowej wynik jest identyczny co do wartości z
    poprzednim (jednotransformatorowym) widokiem — plus pola ``supply*``.
    Pola nagłówkowe (``transformer_ref``, ``nn_bus_ref``,
    ``transformer_impedance_ohm``, ``upstream_impedance_ohm``) opisują PIERWSZY
    policzalny transformator stacji; konsument potrzebujący rozbicia per
    transformator woła ``build_feeder_fault_loop_view_for_transformer``
    (tak robi ``lv_domain.projection_v1``).
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "missing_data": ["station"],
            "station_ref": station_ref,
            "feeders": [],
        }

    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": None,
    }

    transformers = station_transformers(enm, station)
    if not transformers:
        return {
            **context,
            "status": "brak danych",
            "missing_data": ["transformer"],
            "feeders": [],
        }

    per_transformer = [
        build_feeder_fault_loop_view_for_transformer(enm, station_ref, trafo.ref_id)
        for trafo in transformers
    ]
    # Układ sieci nN jest własnością TRANSFORMATORA (W5-A): widok stacji niesie
    # układ pierwszego transformatora; „nie dotyczy" (TT/IT) — gdy WSZYSTKIE
    # transformatory stacji tak deklarują.
    context["network_system"] = per_transformer[0].get("network_system")
    if all(view.get("status") == "nie dotyczy" for view in per_transformer):
        return {**per_transformer[0], **context, "feeders": []}
    computable = [view for view in per_transformer if view.get("status") == "OK"]
    missing_data = sorted(
        {
            f"{trafo.ref_id}:{item}"
            for trafo, view in zip(transformers, per_transformer, strict=True)
            if view.get("status") != "OK"
            # Odmowa nazwana transformatora (strona dolna spoza pasma nN) nie ma braków
            # danych — jej kod trafia do braków stacji, żeby nie znikała po cichu.
            for item in (
                view.get("missing_data") or ([view["kod_odmowy"]] if view.get("kod_odmowy") else [])
            )
        }
    )

    if not computable:
        # Wszystkie transformatory nieobliczalne — status i braki pierwszego z
        # nich (stacja 1×TR: DOKŁADNIE poprzednie zachowanie, bo prefiks braku
        # dokłada się dopiero przy stacji wielotransformatorowej).
        first = per_transformer[0]
        # Odmowa nazwana (kod + przyczyna) pierwszego transformatora nie ginie w widoku
        # stacji — konsument (ekran nN, SWZ, dowód) dostaje ten sam kod co per transformator.
        odmowa_nazwana = {
            k: first[k] for k in ("kod_odmowy", "reason_pl") if first.get(k) is not None
        }
        if len(transformers) == 1:
            return {
                **context,
                **{k: first[k] for k in ("status", "missing_data")},
                **odmowa_nazwana,
                "feeders": [],
            }
        return {
            **context,
            "status": "brak danych",
            **odmowa_nazwana,
            "missing_data": missing_data,
            "feeders": [],
        }

    head = computable[0]
    feeders = sorted(
        (feeder for view in computable for feeder in view["feeders"]),
        key=lambda row: str(row["feeder_root_branch_ref"]),
    )
    return {
        **context,
        "status": "OK",
        "transformer_ref": head["transformer_ref"],
        "nn_bus_ref": head["nn_bus_ref"],
        "transformer_impedance_ohm": head["transformer_impedance_ohm"],
        "upstream_impedance_ohm": head["upstream_impedance_ohm"],
        "feeders": feeders,
        "missing_data": missing_data,
    }
