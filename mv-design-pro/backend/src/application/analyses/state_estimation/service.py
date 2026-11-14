"""Serwis aplikacyjny: estymacja stanu WLS na bazie gotowego przebiegu rozpływu.

Warstwa APPLICATION (mapowanie i serializacja, ZERO fizyki). Buduje macierz Y-bus
[pu] z grafu sieci gotowego przebiegu rozpływu (``PF``) przy użyciu ZAMROŻONEGO
buildera (read-only), a następnie deleguje CAŁE obliczenie do solvera estymacji
stanu WLS (``network_model.solvers.state_estimation_wls.estimate_wls``). Estymowany
stan (moduły |V|, kąty θ), rezydua, funkcja celu χ² oraz detekcja złych danych
pochodzą WYŁĄCZNIE z solvera — tu następuje tylko odwzorowanie węzeł↔indeks i
serializacja wyniku.

Domyka wyspę z inwentarza (``docs/uiux/INWENTARZ_FUNKCJI_2026-07.md``): solver WLS
istniał bez punktu wejścia (dispatch/API/UI). Faza 1 = ekspozycja BACKENDOWA.

WEJŚCIA WYMAGANE (No-Heuristics — bez fabrykacji):
- gotowy przebieg rozpływu ``PF`` (status FINISHED) — dostarcza topologię sieci,
  z której budowana jest Y-bus (napięcia/admitancje gałęzi),
- zestaw pomiarów telemetrycznych (SCADA/PMU) w jednostkach względnych (pu) na tej
  samej bazie ``base_mva`` co Y-bus. Bez pomiarów estymacja jest NIEMOŻLIWA — nie
  zmyślamy pseudo-pomiarów z rozwiązania rozpływu (to byłaby fabrykacja).

Mapa węzeł→indeks (``build_state_estimation_requirements``) publikuje identyfikatory
węzłów grafu, którymi pomiary muszą się posługiwać (pole ``bus_ref``/``bus_j_ref``).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from domain.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
from enm.canonical_analysis import CanonicalRun
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.zdania_odmow_rdzenia import nazwy_w_odmowach_rdzenia
from network_model.core.graph import NetworkGraph
from network_model.core.node import NodeType
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana, odmowa_rdzenia_b01
from network_model.solvers.state_estimation_wls import (
    Measurement,
    MeasurementSet,
    MeasurementType,
    StateEstimationResult,
    estimate_wls,
    ybus_from_network_graph,
)

# Metadane typów pomiarów obsługiwanych przez estymator (do publikacji w widoku
# wymagań — projektant wie, jakie pomiary może dostarczyć i które wymagają węzła
# "do" gałęzi ``bus_j``).
MEASUREMENT_TYPES: tuple[dict[str, Any], ...] = (
    {
        "code": MeasurementType.V_MAGNITUDE.value,
        "label_pl": "Moduł napięcia węzła |V| [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.P_INJECTION.value,
        "label_pl": "Iniekcja mocy czynnej w węźle P [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.Q_INJECTION.value,
        "label_pl": "Iniekcja mocy biernej w węźle Q [pu]",
        "requires_bus_j": False,
    },
    {
        "code": MeasurementType.P_FLOW.value,
        "label_pl": "Przepływ mocy czynnej w gałęzi [pu]",
        "requires_bus_j": True,
    },
    {
        "code": MeasurementType.Q_FLOW.value,
        "label_pl": "Przepływ mocy biernej w gałęzi [pu]",
        "requires_bus_j": True,
    },
)

#: Zdanie dla projektanta (karta #145): bez nazw pól kontraktu i kodów typów pomiarów —
#: baza mocy i węzeł „do" nazwane słowami, typy pomiaru przepływu opisane.
_UNITS_NOTE_PL = (
    "Pomiary muszą być w jednostkach względnych (pu) na tej samej bazie mocy co macierz "
    "admitancyjna Y-bus. Pomiary przepływu mocy czynnej i biernej w gałęzi wymagają "
    "wskazania węzła końcowego tej gałęzi. Węzły połączone zamkniętym łącznikiem mają ten "
    "sam indeks — są jednym węzłem elektrycznym: iniekcje podaje się dla każdego z nich "
    "(estymacja sumuje je w iniekcję węzła elektrycznego), a przepływu przez łącznik nie "
    "mierzy się jako przepływu gałęzi."
)


def _require_power_flow_run(run: CanonicalRun) -> None:
    """Estymacja stanu wymaga gotowego przebiegu rozpływu (topologia + Y-bus)."""
    if run.analysis_type != "PF":
        raise OdmowaDanychError(
            "Estymacja stanu WLS wymaga przebiegu rozpływu mocy (PF); "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise OdmowaDanychError(
            f"Przebieg nie jest zakończony (stan: {stan_przebiegu_pl(run.status)}); "
            "topologia sieci do budowy Y-bus nie jest dostępna."
        )


def _load_graph(run: CanonicalRun) -> NetworkGraph:
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    return map_enm_to_network_graph(enm)


def _base_mva(run: CanonicalRun) -> float:
    try:
        return float(run.options.get("base_mva", 100.0))
    except (TypeError, ValueError):
        return 100.0


def _slack_node_id(graph: NetworkGraph) -> str:
    slack_nodes = sorted(
        node_id for node_id, node in graph.nodes.items() if node.node_type == NodeType.SLACK
    )
    if not slack_nodes:
        raise OdmowaDanychError("Brak węzła bilansującego SLACK w snapshotcie ENM przebiegu.")
    return slack_nodes[0]


def _voltage_kv_by_node(run: CanonicalRun) -> dict[str, float | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _name_by_node(run: CanonicalRun) -> dict[str, str | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, str | None] = {}
    for node_id, node in graph_nodes.items():
        if isinstance(node, dict):
            name = node.get("name")
            out[str(node_id)] = str(name) if name is not None else None
    return out


def _context(run: CanonicalRun) -> dict[str, Any]:
    return zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=True)


def _prepare(
    run: CanonicalRun,
) -> tuple[NetworkGraph, float, str, np.ndarray, dict[str, int]]:
    """Wspólny fundament: waliduj przebieg, zbuduj Y-bus i mapę węzeł → indeks."""
    _require_power_flow_run(run)
    graph = _load_graph(run)
    base_mva = _base_mva(run)
    slack_node_id = _slack_node_id(graph)
    # Estymator WLS jest rdzeniem B-01 — jego odmowy wejścia (przekładnia zaczepu ≤ 0,
    # nieobserwowalność, pomiar spoza sieci) to goły `ValueError`; granica tłumaczy je na
    # odmowę danych (karta ODMOWA-DANYCH-422). Tak samo niżej przy każdym wywołaniu rdzenia.
    # Macierz admitancji buduje rozpływ NR (rdzeń B-01): jego odmowa strukturalna (przekładnia
    # zaczepu ≤ 0, decyzja O-59) wychodzi ze zdaniem z nazwami z grafu.
    with nazwy_w_odmowach_rdzenia(graph), odmowa_rdzenia_b01():
        ybus_pu, node_id_to_index = ybus_from_network_graph(graph, base_mva, slack_node_id)
    # Indeks Y-bus = węzeł ELEKTRYCZNY: węzły połączone zamkniętymi łącznikami dzielą indeks
    # (`power_flow_scalenie`), więc mapa NIE jest odwracalna — widoki iterują po węzłach.
    return graph, base_mva, slack_node_id, ybus_pu, node_id_to_index


def build_state_estimation_requirements(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok WYMAGANYCH wejść estymacji stanu (mapa węzeł→indeks, slack).

    Publikuje identyfikatory węzłów grafu (``bus_ref``) i ich indeksy w Y-bus, aby
    projektant wiedział, jakie pomiary telemetryczne dostarczyć. ZERO fizyki.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (PF) lub nie jest zakończony.
    """
    graph, base_mva, slack_node_id, ybus_pu, node_id_to_index = _prepare(run)
    n_buses = ybus_pu.shape[0]
    n_angles = n_buses - 1  # slack bez kąta
    n_states = n_angles + n_buses
    voltage_kv = _voltage_kv_by_node(run)
    name = _name_by_node(run)

    buses = [
        {
            "bus_ref": node_id,
            "index": index,
            "name": name.get(node_id),
            "voltage_kv": voltage_kv.get(node_id),
            "is_slack": node_id == slack_node_id,
        }
        for node_id, index in sorted(node_id_to_index.items(), key=lambda kv: kv[1])
    ]

    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "base_mva": base_mva,
        "slack_bus_ref": slack_node_id,
        "slack_index": node_id_to_index[slack_node_id],
        "n_buses": n_buses,
        "n_states": n_states,
        "min_measurements": n_states,
        "buses": buses,
        "measurement_types": [dict(entry) for entry in MEASUREMENT_TYPES],
        "note_pl": _UNITS_NOTE_PL,
    }


def galezie_wyspy(
    graph: NetworkGraph, node_id_to_index: dict[str, int]
) -> tuple[tuple[str, str], ...]:
    """Końce gałęzi w ruchu wstemplowanych w Y-bus wyspy (oba końce w mapie węzeł → indeks).

    Ten sam warunek co budowniczy macierzy rozpływu (`_build_ybus_ohm`): gałąź w ruchu,
    oba węzły w wyspie. Posortowane — wynik zależy wyłącznie od sieci.
    """
    return tuple(
        sorted(
            (branch.from_node_id, branch.to_node_id)
            for branch in graph.branches.values()
            if branch.in_service
            and branch.from_node_id in node_id_to_index
            and branch.to_node_id in node_id_to_index
        )
    )


def _parse_measurements(
    measurements_in: list[dict[str, Any]],
    node_id_to_index: dict[str, int],
    galezie: tuple[tuple[str, str], ...],
) -> tuple[MeasurementSet, list[dict[str, Any]]]:
    """Odwzoruj pomiary wejściowe (bus_ref → indeks) na ``MeasurementSet``.

    Zwraca zestaw pomiarów oraz listę deskryptorów (do serializacji rezyduów per
    pomiar). Nieznany węzeł / zły typ / brak bus_j → ``ValueError`` (→ 422).

    Indeks Y-bus to węzeł ELEKTRYCZNY: węzły połączone zamkniętym łącznikiem dzielą indeks
    (`power_flow_scalenie`). Pomiar węzła jest funkcją stanu tylko wtedy, gdy opisuje
    wielkość węzła elektrycznego (`galezie` — końce gałęzi w Y-bus, `galezie_wyspy`):

    - moduł napięcia dowolnego węzła grupy = napięcie węzła elektrycznego (dokładnie);
    - iniekcja węzła elektrycznego = suma iniekcji jego węzłów (prawo Kirchhoffa), więc
      iniekcje węzłów grupy wchodzą do estymacji jako JEDEN pomiar sumy (wartość Σz,
      odchylenie √Σσ² — błędy niezależne), gdy podano po jednej iniekcji danego rodzaju dla
      KAŻDEGO węzła grupy; część grupy → odmowa nazwana (iniekcja reszty nieznana);
    - przepływ i→j = przepływ wszystkich gałęzi między węzłami elektrycznymi i, j; pomiar
      między węzłami scalonymi jest funkcją stanu tylko, gdy wszystkie te gałęzie łączą
      dokładnie wskazaną parę węzłów — inaczej odmowa nazwana; przepływ wewnątrz jednego
      węzła elektrycznego (łącznik) i przepływ między węzłami bez gałęzi → odmowa nazwana.
    """
    czlonkowie: dict[int, list[str]] = {}
    for node_id in sorted(node_id_to_index):
        czlonkowie.setdefault(node_id_to_index[node_id], []).append(node_id)
    pary_galezi: dict[tuple[int, int], set[frozenset[str]]] = {}
    for od, do in galezie:
        i, j = node_id_to_index[od], node_id_to_index[do]
        if i != j:
            pary_galezi.setdefault((min(i, j), max(i, j)), set()).add(frozenset((od, do)))
    if not measurements_in:
        raise OdmowaDanychError(
            "Brak pomiarów: estymacja stanu WLS wymaga zestawu pomiarów telemetrycznych "
            "(SCADA/PMU). Skorzystaj z /api/quality/state-estimation/requirements, aby "
            "poznać wymagane węzły i minimalną liczbę pomiarów."
        )

    measurements: list[Measurement] = []
    descriptors: list[dict[str, Any]] = []
    for raw in measurements_in:
        raw_type = str(raw.get("meas_type") or "").strip()
        try:
            meas_type = MeasurementType(raw_type)
        except ValueError as exc:
            allowed = ", ".join(entry["code"] for entry in MEASUREMENT_TYPES)
            raise OdmowaDanychError(
                f"Nieznany typ pomiaru: {raw_type!r} (dozwolone: {allowed})."
            ) from exc

        bus_i_ref = str(raw.get("bus_ref") or raw.get("bus_i_ref") or "")
        if bus_i_ref not in node_id_to_index:
            raise OdmowaNazwana(
                "Pomiar odnosi się do węzła, którego nie ma w modelu sieci.",
                kod="estymacja.pomiar_wezla_spoza_modelu",
                dane={"element_ref": bus_i_ref},
            )
        bus_i = node_id_to_index[bus_i_ref]

        bus_j_ref_raw = raw.get("bus_j_ref") or raw.get("bus_j")
        bus_j: int | None = None
        bus_j_ref: str | None = None
        if bus_j_ref_raw is not None and str(bus_j_ref_raw) != "":
            bus_j_ref = str(bus_j_ref_raw)
            if bus_j_ref not in node_id_to_index:
                raise OdmowaNazwana(
                    "Pomiar przepływu odnosi się do węzła końcowego, którego nie ma w modelu "
                    "sieci.",
                    kod="estymacja.pomiar_wezla_spoza_modelu",
                    dane={"element_ref": bus_j_ref},
                )
            bus_j = node_id_to_index[bus_j_ref]
            if bus_j == bus_i:
                # Węzły połączone zamkniętym łącznikiem są jednym węzłem elektrycznym
                # (łącznik bez impedancji): przepływ między nimi nie jest funkcją napięć
                # węzłów — model pomiarowy h(x) przepływu wymaga gałęzi z impedancją.
                raise OdmowaNazwana(
                    "Pomiar przepływu łączy węzły połączone zamkniętym łącznikiem — to jeden "
                    "węzeł elektryczny, przepływ łącznika nie jest funkcją napięć węzłów. "
                    "Przypisz pomiar do gałęzi (linii, kabla, transformatora) wychodzącej "
                    "z tego węzła.",
                    kod="estymacja.pomiar_przeplywu_w_wezle_scalonym",
                    dane={"element_ref": bus_i_ref, "element_ref_do": bus_j_ref},
                )
            pary = pary_galezi.get((min(bus_i, bus_j), max(bus_i, bus_j)), set())
            if not pary:
                raise OdmowaNazwana(
                    "Pomiar przepływu wskazuje węzły, między którymi nie ma gałęzi w ruchu — "
                    "przepływ mocy między nimi nie istnieje w modelu sieci.",
                    kod="estymacja.pomiar_przeplywu_bez_galezi",
                    dane={"element_ref": bus_i_ref, "element_ref_do": bus_j_ref},
                )
            if pary != {frozenset((bus_i_ref, bus_j_ref))}:
                raise OdmowaNazwana(
                    "Gałęzie łączące węzły elektryczne wskazanych węzłów (węzły połączone "
                    "zamkniętymi łącznikami) nie łączą dokładnie wskazanej pary — przepływ tej "
                    "pary nie jest funkcją napięć węzłów. Wskaż końce gałęzi, które łączą te "
                    "węzły elektryczne.",
                    kod="estymacja.pomiar_przeplywu_czesci_polaczenia_scalonego",
                    dane={"element_ref": bus_i_ref, "element_ref_do": bus_j_ref},
                )

        raw_value = raw.get("value")
        raw_sigma = raw.get("sigma")
        if raw_value is None or raw_sigma is None:
            raise OdmowaDanychError("Pomiar wymaga pól 'value' oraz 'sigma'.")
        # Liczba z żądania projektanta — odmowa danych po polsku, nazwana polem; surowy tekst
        # konwersji (`could not convert string to float`) nie trafia do odpowiedzi API.
        try:
            value = float(raw_value)
        except (TypeError, ValueError) as exc:
            raise OdmowaDanychError("Wartość pomiaru („value”) musi być liczbą.") from exc
        try:
            sigma = float(raw_sigma)
        except (TypeError, ValueError) as exc:
            raise OdmowaDanychError(
                "Odchylenie standardowe pomiaru („sigma”) musi być liczbą."
            ) from exc
        label = raw.get("label")
        label = str(label) if label is not None else None

        # Measurement.__post_init__ waliduje sigma>0 i spójność bus_j z typem.
        with odmowa_rdzenia_b01():
            pomiar = Measurement(
                meas_type=meas_type,
                bus_i=bus_i,
                value=value,
                sigma=sigma,
                bus_j=bus_j,
                label=label,
            )
        measurements.append(pomiar)
        descriptors.append(
            {
                "meas_type": meas_type.value,
                "bus_ref": bus_i_ref,
                "bus_j_ref": bus_j_ref,
                "value": value,
                "sigma": sigma,
                "label": label,
            }
        )

    measurements, descriptors = _iniekcje_wezlow_elektrycznych(
        measurements, descriptors, czlonkowie
    )
    with odmowa_rdzenia_b01():
        zestaw = MeasurementSet(tuple(measurements))
    return zestaw, descriptors


_RODZAJE_INIEKCJI = (MeasurementType.P_INJECTION, MeasurementType.Q_INJECTION)


def _iniekcje_wezlow_elektrycznych(
    measurements: list[Measurement],
    descriptors: list[dict[str, Any]],
    czlonkowie: dict[int, list[str]],
) -> tuple[list[Measurement], list[dict[str, Any]]]:
    """Iniekcje węzłów grupy scalonej → jeden pomiar sumy na węzeł elektryczny.

    Pomiar sumy stoi na miejscu pierwszego pomiaru składowego (kolejność wejścia — wynik
    deterministyczny); deskryptor niesie `bus_refs_skladowe` (posortowane węzły grupy).
    Węzeł bez łącznika — pomiar bez zmian (ścieżka tożsamościowa).
    """
    skladowe: dict[tuple[str, int], list[int]] = {}
    for pozycja, pomiar in enumerate(measurements):
        if pomiar.meas_type in _RODZAJE_INIEKCJI and len(czlonkowie[pomiar.bus_i]) > 1:
            skladowe.setdefault((pomiar.meas_type.value, pomiar.bus_i), []).append(pozycja)
    if not skladowe:
        return measurements, descriptors

    zastap: dict[int, tuple[Measurement, dict[str, Any]]] = {}
    pomin: set[int] = set()
    for (rodzaj, indeks), pozycje in sorted(skladowe.items()):
        grupa = czlonkowie[indeks]
        zmierzone = [str(descriptors[p]["bus_ref"]) for p in pozycje]
        if sorted(zmierzone) != grupa:
            brak = sorted(set(grupa) - set(zmierzone))
            podwojne = sorted({w for w in zmierzone if zmierzone.count(w) > 1})
            raise OdmowaNazwana(
                "Iniekcja węzła połączonego zamkniętym łącznikiem jest częścią iniekcji jego "
                "węzła elektrycznego — estymacja potrzebuje po jednym pomiarze tego rodzaju "
                "dla każdego węzła grupy (węzeł bez odbiorów i źródeł: pomiar zerowy).",
                kod="estymacja.pomiar_iniekcji_czesci_wezla_scalonego",
                dane={
                    "element_ref": zmierzone[0],
                    "rodzaj_pomiaru": rodzaj,
                    "wezly_bez_pomiaru": tuple(brak),
                    "wezly_z_wieloma_pomiarami": tuple(podwojne),
                },
            )
        etykiety = [descriptors[p]["label"] for p in pozycje if descriptors[p]["label"]]
        wartosc = math.fsum(measurements[p].value for p in pozycje)
        sigma = math.sqrt(math.fsum(measurements[p].sigma ** 2 for p in pozycje))
        pierwsza = pozycje[0]
        with odmowa_rdzenia_b01():
            suma = Measurement(
                meas_type=measurements[pierwsza].meas_type,
                bus_i=indeks,
                value=wartosc,
                sigma=sigma,
                label=" + ".join(etykiety) if etykiety else None,
            )
        opis = dict(descriptors[pierwsza])
        opis.update(value=wartosc, sigma=sigma, label=suma.label, bus_refs_skladowe=list(grupa))
        zastap[pierwsza] = (suma, opis)
        pomin.update(pozycje[1:])

    nowe_pomiary: list[Measurement] = []
    nowe_opisy: list[dict[str, Any]] = []
    for pozycja, (pomiar, opis) in enumerate(zip(measurements, descriptors, strict=True)):
        if pozycja in pomin:
            continue
        pomiar, opis = zastap.get(pozycja, (pomiar, opis))
        nowe_pomiary.append(pomiar)
        nowe_opisy.append(opis)
    return nowe_pomiary, nowe_opisy


def _serialize_result(
    result: StateEstimationResult,
    *,
    run: CanonicalRun,
    base_mva: float,
    slack_node_id: str,
    slack_index: int,
    node_id_to_index: dict[str, int],
    descriptors: list[dict[str, Any]],
    include_trace: bool,
) -> dict[str, Any]:
    voltage_kv = _voltage_kv_by_node(run)
    name = _name_by_node(run)

    # Każdy węzeł wyspy — także węzły scalone zamkniętym łącznikiem, które mają stan
    # swojego węzła elektrycznego (wspólny indeks); kolejność: indeks, identyfikator.
    buses = [
        {
            "bus_ref": node_id,
            "index": index,
            "name": name.get(node_id),
            "voltage_kv": voltage_kv.get(node_id),
            "is_slack": node_id == slack_node_id,
            "v_magnitude_pu": result.v_magnitudes[index],
            "v_angle_rad": result.v_angles_rad[index],
            "v_angle_deg": math.degrees(result.v_angles_rad[index]),
        }
        for node_id, index in sorted(node_id_to_index.items(), key=lambda kv: (kv[1], kv[0]))
    ]

    bad_data = result.bad_data
    normalized = bad_data.normalized_residuals
    measurements: list[dict[str, Any]] = []
    # Rezydua końcowe z solvera: r̂ = z − h(x̂), z pola wyniku `final_residuals`
    # (zawsze obecne, niezależnie od śladu WHITE BOX — WLS-S1). Pochodzą z tego
    # samego wektora co znormalizowane rezydua bad_data, więc r i r_N są spójne
    # (ten sam iterat — WLS-S2).
    final_residuals = list(result.final_residuals)
    for idx, descriptor in enumerate(descriptors):
        row = dict(descriptor)
        row["index"] = idx
        row["normalized_residual"] = normalized[idx] if idx < len(normalized) else None
        if idx < len(final_residuals):
            row["residual"] = final_residuals[idx]
        else:
            row["residual"] = None
        row["suspect"] = bool(idx == bad_data.lnr_measurement_index and bad_data.lnr_flag)
        measurements.append(row)

    bad_data_dict = bad_data.to_dict()
    if bad_data.lnr_measurement_index is not None and bad_data.lnr_measurement_index < len(
        descriptors
    ):
        suspect_descriptor = descriptors[bad_data.lnr_measurement_index]
        bad_data_dict["lnr_measurement"] = {
            "index": bad_data.lnr_measurement_index,
            "meas_type": suspect_descriptor["meas_type"],
            "bus_ref": suspect_descriptor["bus_ref"],
            "bus_j_ref": suspect_descriptor["bus_j_ref"],
            "label": suspect_descriptor["label"],
        }
    else:
        bad_data_dict["lnr_measurement"] = None

    # Uczciwe missing_data: węzły grafu, których żaden pomiar nie dotyka (ani jako
    # bus_i, ani bus_j). Jeśli układ jest mimo to nieobserwowalny, solver zgłasza
    # ObservabilityError wcześniej (→ 422) — tu raportujemy tylko pokrycie.
    # Pomiar dotyka węzła ELEKTRYCZNEGO — więc wszystkich węzłów jego grupy scalonej.
    touched: set[int] = set()
    for descriptor in descriptors:
        touched.add(node_id_to_index[str(descriptor["bus_ref"])])
        if descriptor["bus_j_ref"] is not None:
            touched.add(node_id_to_index[str(descriptor["bus_j_ref"])])
    unmeasured = sorted(node for node, index in node_id_to_index.items() if index not in touched)
    missing_data = [{"code": "wezly_bez_pomiaru", "bus_refs": unmeasured}] if unmeasured else []

    view: dict[str, Any] = {
        "analysis_id": str(run.id),
        "context": _context(run),
        # Stan ZBIEŻNOŚCI estymacji (proces obliczeniowy), nie werdykt — dawne „OK” należało
        # do słownika werdyktów (karta AB-1a Pakiet E2, strażnik werdyktu reguła 6a).
        "status": "ZBIEZNY" if result.converged else "BRAK_ZBIEZNOSCI",
        "status_pl": "zbieżny" if result.converged else "brak zbieżności",
        "missing_data": missing_data,
        "solver_version": result.solver_version,
        "validation_status": result.validation_status,
        "estimate_id": result.estimate_id,
        "base_mva": base_mva,
        "slack_bus_ref": slack_node_id,
        "slack_index": slack_index,
        "converged": result.converged,
        "iterations": result.iterations,
        "n_states": result.n_states,
        "m_measurements": result.m_measurements,
        "degrees_of_freedom": result.bad_data.degrees_of_freedom,
        "objective_j": result.objective_j,
        "note": result.note,
        "buses": buses,
        "measurements": measurements,
        "bad_data": bad_data_dict,
    }
    if include_trace:
        view["white_box"] = [
            {
                "iteration": it.iteration,
                "objective_j": it.objective_j,
                "max_abs_residual": it.max_abs_residual,
                "step_norm": it.step_norm,
                "h_jacobian": it.h_jacobian,
                "gain_matrix_g": it.gain_matrix_g,
                "residual_r": it.residual_r,
                "delta_x": it.delta_x,
                "state_x": it.state_x,
            }
            for it in result.white_box
        ]
    return view


def build_state_estimation_view(
    run: CanonicalRun,
    measurements_in: list[dict[str, Any]],
    *,
    alpha: float = 0.01,
    lnr_threshold: float = 3.0,
    include_trace: bool = True,
) -> dict[str, Any]:
    """Zbuduj widok estymacji stanu WLS dla gotowego przebiegu rozpływu.

    Args:
        run: kanoniczny przebieg rozpływu (PF, FINISHED) — źródło topologii/Y-bus.
        measurements_in: lista pomiarów telemetrycznych (dict: meas_type, bus_ref,
            value, sigma, opcjonalnie bus_j_ref/label). Wartości w pu na base_mva.
        alpha: poziom istotności testu chi-kwadrat (detekcja złych danych).
        lnr_threshold: próg odrzucenia znormalizowanej rezyduy (LNR).
        include_trace: czy dołączyć ślad WHITE BOX każdej iteracji (audytowalność).

    Returns:
        Zserializowany widok: estymowany stan per węzeł (|V|, kąt), rezydua per
        pomiar, χ²/LNR, ślad WHITE BOX. Deterministyczny (``estimate_id``).

    Raises:
        ValueError: przebieg nie jest rozpływem / niezakończony / brak pomiarów /
            nieznany węzeł lub typ pomiaru / układ nieobserwowalny (m<n lub G
            osobliwa — ``ObservabilityError`` jest podklasą ``ValueError``).
    """
    (
        graph,
        base_mva,
        slack_node_id,
        ybus_pu,
        node_id_to_index,
    ) = _prepare(run)

    measurement_set, descriptors = _parse_measurements(
        measurements_in, node_id_to_index, galezie_wyspy(graph, node_id_to_index)
    )
    slack_index = node_id_to_index[slack_node_id]

    with odmowa_rdzenia_b01():
        result = estimate_wls(
            ybus_pu,
            measurement_set,
            slack_index,
            alpha=alpha,
            lnr_threshold=lnr_threshold,
            trace=include_trace,
        )

    return _serialize_result(
        result,
        run=run,
        base_mva=base_mva,
        slack_node_id=slack_node_id,
        slack_index=slack_index,
        node_id_to_index=node_id_to_index,
        descriptors=descriptors,
        include_trace=include_trace,
    )
