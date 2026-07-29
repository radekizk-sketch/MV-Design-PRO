"""Serwis aplikacyjny: dobór kompensacji mocy biernej z katalogu baterii (P42, D8).

Warstwa APPLICATION (orkiestracja, NIE fizyka). Odpowiada na pytanie „która
bateria kondensatorów z katalogu zapewnia wymagany cosφ w punkcie przyłączenia
(wskazanym węźle)" jako DETERMINISTYCZNY przegląd rekordów katalogu w rosnącej
kolejności mocy — dokładnie tym samym mechanizmem biegu rozpływu w pamięci,
którego używa zdolność przyłączeniowa (D3, ``hosting_capacity.py``) i odpowiedź
OSD (D7, ``odpowiedz_osd.py``):

1. dla każdego kandydata (rekord katalogu ``mv_shunt_capacitor_catalog``) dopisuje
   próbną baterię ShuntCapacitor do KOPII snapshotu przy wskazanej szynie (jak
   generator próbny w D3) — ZERO mutacji modelu/persystencji,
2. uruchamia ISTNIEJĄCY solver rozpływu przez ISTNIEJĄCĄ ścieżkę wykonania
   (``enm.canonical_analysis._execute_power_flow`` — ta sama funkcja, której używa
   kanoniczny przebieg PF; ZERO nowej fizyki, ZERO wołania klas solvera na skróty),
3. odczytuje P/Q wymieniane z siecią w punkcie przyłączenia Z WYNIKU solvera,
   przekłada je na KANONICZNĄ konwencję znaku przez adapter
   (``application/analyses/konwencja_mocy.py``, rozstrzygnięcie V12K-040, opcja B)
   i wyznacza DWIE ROZDZIELNE wielkości (patrz RECON „dwa cosφ" niżej):
   (1) cosφ przepływu w przekroju sieciowym, (2) cosφ punktu kompensowanego —
   podstawę doboru. Obie jako projekcja ``cosφ = |P| / √(P² + Q²)`` (bez fizyki).

RECON WIĄŻĄCY (plik:linia):
- Kształt rekordu katalogu: ``network_model/catalog/mv_shunt_capacitor_catalog.py:44``
  (``get_all_shunt_capacitor_records`` → ``{"id", "name", "params": {"rated_mvar",
  "rated_kv", "loss_kw", ...}}``). Kandydaci WYŁĄCZNIE z tego katalogu, sortowani
  rosnąco po mocy znamionowej (``rated_mvar``, tie-break ``id``).
- Mapowanie shunt → solver: ENM ``ShuntCapacitor`` (``enm/models.py:304``) trafia do
  snapshotu w kolekcji ``shunt_capacitors`` (``enm/models.py:1236``) i jest
  materializowana do ``ShuntSpec(b_pu = Q_rated / S_base)`` w
  ``enm/canonical_analysis.py:1119-1166`` (``_build_shunt_specs_from_snapshot``);
  wymagane pola rekordu snapshotu: ``bus_ref``, ``rated_mvar``, ``rated_kv``,
  ``status`` (``closed``). Dopisujemy próbną baterię do KOPII snapshotu — solver i
  warstwa enm pozostają nietknięte.
- Skąd P/Q punktu: wypadkowy PRZEPŁYW GAŁĘZI zasilających punkt z ``branch_results``
  solvera (``p_from_mw``/``q_from_mvar``/``p_to_mw``/``q_to_mvar``,
  ``network_model/solvers/power_flow_result.py:74-80``, WHITE BOX), odczytany na
  końcu przy punkcie i zsumowany po gałęziach incydentnych (przy JEDNEJ gałęzi
  zasilającej = przepływ tej gałęzi) przez adapter ``moc_kanoniczna_punktu`` — już
  w znaku kanonicznym (``Q>0`` indukcyjny pobór, ``Q<0`` pojemnościowy).
  ``branch_id`` w wyniku = ``uuid5(NAMESPACE_DNS, ref_id)`` gałęzi
  (``enm/mapping.py:45,262``), więc końce gałęzi odtwarzamy ze snapshotu tą samą
  funkcją (``_graph_id_from_ref``).

RECON „dwa cosφ" (V12K-040, opcja B; rekalibracja K3 po naprawie F9.8 pipeline —
``test_dowod_v12k040``):
  Po F9.8 (commit ``6508c12f``) przepływ gałęzi POPRAWNIE odzwierciedla efekt
  baterii (dawna „anomalia znaku shuntu" była objawem odwróconego znaku pipeline
  — patrz nota historyczna w docstringu ``konwencja_mocy``). Solver księguje
  shunt jako ``rated·V²`` odejmowane od zapotrzebowania punktu, więc kanoniczny
  przepływ ``Q_przekroju = Q_load − Q_cap_eff``. Rozdzielamy dwie wielkości
  (Wymóg 2 właściciela — pojęciowo różne, mimo że w punkcie zasilanym jedną
  gałęzią liczbowo się pokrywają):
    (1) ``cosfi_przekroju`` = |P| / √(P² + Q_przekroju²), gdzie ``Q_przekroju`` to
        kanoniczny przepływ gałęzi (zawiera efekt zainstalowanej baterii) —
        wielkość PRZEKROJOWA sieci,
    (2) ``cosfi_punktu``    = |P| / √(P² + Q_netto²), gdzie
        ``Q_cap_eff = (Σ znamionowych Mvar baterii w punkcie) · V²`` (model
        kondensatora z katalogu — dana znamionowa skalowana napięciem, NIE fizyka
        pola), ``Q_load = Q_przekroju + Q_cap_eff`` (odzysk zapotrzebowania odbioru
        z przepływu zawierającego efekt baterii), ``Q_netto = Q_load − Q_cap_eff``
        — wielkość STEROWNIKA doboru z lokalnego bilansu odbioru i baterii.
        Dodanie kondensatora do odbioru INDUKCYJNEGO obniża ``|Q_netto|`` →
        ``cosfi_punktu`` ROŚNIE (do ~1 przy pełnej kompensacji), a po
        przekompensowaniu ``Q_netto<0`` i cosφ spada z drugiej strony.
  DOBÓR opiera się na (2). (1) pozostaje dostępne z jawną etykietą przekrojową.

Wiązanie katalogowe: kandydaci dobierani są dla NAPIĘCIA ZNAMIONOWEGO szyny punktu
(rekord katalogu musi mieć ``rated_kv`` zgodne z ``voltage_kv`` szyny) — bateria
innego napięcia znamionowego nie jest instalowalna w punkcie (ograniczenie
poprawnościowe doboru z katalogu, NIE heurystyka). Brak zgodnego rekordu → brak
kandydatów, dobór ``null`` z uczciwym powodem.

Scenariusz nocny (opcjonalny, ``uwzglednij_noc``): drugi przegląd na KOPII
snapshotu z mocą czynną wszystkich generatorów ustawioną na 0 (moc bierna źródeł
bez zmian; generacja Q kabli ujawnia się w rozpływie). Werdykt per scenariusz
(dzień/noc); dobór musi spełniać OBA scenariusze, jeśli noc jest włączona.

Zaokrąglenia jawne: moce do 6 miejsc, cosφ do 6 miejsc.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from application.analyses.konwencja_mocy import (
    moc_kanoniczna_punktu,
    q_netto_po_kompensacji,
)
from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _graph_id_from_ref
from enm.models import ShuntCapacitor
from network_model.catalog.mv_shunt_capacitor_catalog import get_all_shunt_capacitor_records

_KV_TOLERANCE = 0.001


def _round6(value: float | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    if math.isnan(value) or math.isinf(value):
        return None
    return round(value, 6)


def _bus_index(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(bus["ref_id"]): bus for bus in (snapshot.get("buses") or []) if bus.get("ref_id")}


def _sorted_candidates(bus_kv: float) -> list[dict[str, Any]]:
    """Rekordy katalogu zgodne z napięciem szyny, rosnąco po mocy (tie-break id)."""
    matching = [
        record
        for record in get_all_shunt_capacitor_records()
        if abs(float(record["params"]["rated_kv"]) - bus_kv) <= _KV_TOLERANCE
    ]
    return sorted(matching, key=lambda r: (float(r["params"]["rated_mvar"]), str(r["id"])))


def _probe_capacitor(bus_ref: str, record: dict[str, Any]) -> dict[str, Any]:
    """Deterministyczna próbna bateria kondensatorów na wskazanej szynie.

    ``id`` z ``uuid5`` (stały dla szyny+rekordu) → snapshot scenariusza jest w pełni
    deterministyczny. ``catalog_ref`` wiąże element z rekordem katalogu (catalog-first).
    """
    type_id = str(record["id"])
    params = record["params"]
    return ShuntCapacitor(
        id=uuid5(NAMESPACE_URL, f"compensation-probe:{bus_ref}:{type_id}"),
        ref_id=f"__komp_probe__{bus_ref}__{type_id}",
        name=str(record["name"]),
        bus_ref=bus_ref,
        rated_mvar=float(params["rated_mvar"]),
        rated_kv=float(params["rated_kv"]),
        status="closed",
        catalog_ref=type_id,
        catalog_namespace="KOMPENSATOR_SN",
        parameter_source="CATALOG",
        source_mode="KATALOG",
    ).model_dump(mode="json")


def _night_generators(generators: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Kopia listy generatorów z mocą czynną = 0 (moc bierna bez zmian)."""
    night: list[dict[str, Any]] = []
    for gen in generators:
        clone = copy.deepcopy(gen)
        clone["p_mw"] = 0.0
        night.append(clone)
    return night


def _scenario_snapshot(
    base_snapshot: dict[str, Any],
    *,
    record: dict[str, Any] | None,
    bus_ref: str,
    night: bool,
) -> dict[str, Any]:
    """KOPIA snapshotu: opcjonalnie noc (P generatorów = 0) + opcjonalna bateria próbna."""
    snapshot = copy.deepcopy(base_snapshot)
    if night:
        snapshot["generators"] = _night_generators(list(snapshot.get("generators") or []))
    if record is not None:
        banks = list(snapshot.get("shunt_capacitors") or [])
        banks.append(_probe_capacitor(bus_ref, record))
        snapshot["shunt_capacitors"] = banks
    return snapshot


def _scenario_run(base_run: CanonicalRun, snapshot: dict[str, Any]) -> CanonicalRun:
    """Przebieg PF w pamięci (bez persystencji) z podmienionym snapshotem."""
    return CanonicalRun(
        id=base_run.id,
        case_id=base_run.case_id,
        project_id=base_run.project_id,
        analysis_type="PF",
        status="FINISHED",
        created_at=base_run.created_at,
        snapshot_hash=base_run.snapshot_hash,
        input_hash=base_run.input_hash,
        snapshot=snapshot,
        validation={},
        readiness={},
        options=dict(base_run.options),
    )


def _edge_endpoints(snapshot: dict[str, Any]) -> dict[str, tuple[str, str]]:
    """Mapa (id krawędzi grafu) → (węzeł from, węzeł to) dla gałęzi i transformatorów.

    ``branch_id`` w wyniku solvera = ``uuid5(NAMESPACE_DNS, ref_id)`` gałęzi
    (``enm/mapping.py:45,262`` — ``_ref_to_uuid``), więc odtwarzamy końce gałęzi ze
    snapshotu tą samą deterministyczną funkcją (``_graph_id_from_ref``). Gałęzie
    otwarte są poza topologią (nie ma ich w wyniku), więc je pomijamy.
    """
    endpoints: dict[str, tuple[str, str]] = {}
    for branch in snapshot.get("branches") or []:
        if str(branch.get("status") or "closed") == "open":
            continue
        ref = str(branch.get("ref_id") or "")
        from_ref = str(branch.get("from_bus_ref") or "")
        to_ref = str(branch.get("to_bus_ref") or "")
        if not (ref and from_ref and to_ref):
            continue
        endpoints[_graph_id_from_ref(ref)] = (
            _graph_id_from_ref(from_ref),
            _graph_id_from_ref(to_ref),
        )
    for trafo in snapshot.get("transformers") or []:
        ref = str(trafo.get("ref_id") or "")
        hv_ref = str(trafo.get("hv_bus_ref") or "")
        lv_ref = str(trafo.get("lv_bus_ref") or "")
        if not (ref and hv_ref and lv_ref):
            continue
        endpoints[_graph_id_from_ref(ref)] = (
            _graph_id_from_ref(hv_ref),
            _graph_id_from_ref(lv_ref),
        )
    return endpoints


def _pusty_pomiar() -> dict[str, Any]:
    """Scenariusz nieoceniony (niezbieżność / punkt poza topologią) — bez zgadywania."""
    return {
        "converged": False,
        "cosfi_przekroju": None,
        "cosfi_punktu": None,
        "p_point_mw": None,
        "q_przekroju_mvar": None,
        "q_load_mvar": None,
        "q_cap_eff_mvar": None,
        "q_netto_punktu_mvar": None,
        "v_pu": None,
    }


def _cosfi(p_mw: float, q_mvar: float) -> float | None:
    """Projekcja cosφ = |P| / √(P² + Q²) (wielkość prezentacyjna, bez fizyki)."""
    apparent = math.hypot(p_mw, q_mvar)
    return None if apparent == 0.0 else _round6(abs(p_mw) / apparent)


def _v_pu_punktu(result_v1: dict[str, Any], point_node: str) -> float | None:
    """Napięcie [p.u.] w punkcie z ``bus_results`` (``bus_id == _graph_id_from_ref``)."""
    for bus in result_v1.get("bus_results") or []:
        if str(bus.get("bus_id")) == point_node:
            v_pu = bus.get("v_pu")
            return None if v_pu is None else float(v_pu)
    return None


def _q_kompensacji_znamionowa_mvar(snapshot: dict[str, Any], bus_ref: str) -> float:
    """Suma ZNAMIONOWYCH mocy biernych baterii kondensatorów (closed) w punkcie [Mvar].

    Dana KATALOGOWA (nameplate) ze snapshotu scenariusza — NIE wielkość liczona
    fizyką. Skalowana napięciem (``·V²``) w ``_point_cos_phi`` do mocy efektywnej.
    """
    total = 0.0
    for cap in snapshot.get("shunt_capacitors") or []:
        if str(cap.get("bus_ref") or "") != bus_ref:
            continue
        if str(cap.get("status") or "closed") == "open":
            continue
        total += float(cap.get("rated_mvar") or 0.0)
    return total


def _point_cos_phi(
    base_run: CanonicalRun,
    *,
    record: dict[str, Any] | None,
    bus_ref: str,
    night: bool,
) -> dict[str, Any]:
    """Uruchom rozpływ scenariusza i zwróć DWA cosφ w punkcie (V12K-040, opcja B).

    Przepływ gałęzi incydentnych z punktem odczytany na końcu przy punkcie i
    przełożony na znak kanoniczny przez adapter ``moc_kanoniczna_punktu``
    (``Q>0`` indukcyjny pobór, ``Q<0`` pojemnościowy). Z tego wyznaczamy:

    (1) ``cosfi_przekroju`` — cosφ przepływu w przekroju sieciowym (z ``Q_przekroju``,
        zawiera efekt dopisanej baterii; opisuje przekrój sieci),
    (2) ``cosfi_punktu`` — cosφ punktu kompensowanego z ``Q_netto = Q_load − Q_cap_eff``,
        gdzie ``Q_cap_eff = (Σ znamionowych Mvar baterii w punkcie) · V²`` (model
        kondensatora z katalogu) i ``Q_load = Q_przekroju + Q_cap_eff`` (odzysk
        zapotrzebowania odbioru z przepływu zawierającego efekt baterii — po F9.8
        solver księguje shunt w przepływie, K3). To (2) jest podstawą doboru.

    Niezbieżność / punkt poza topologią → ``converged=False`` i cosφ=``None`` (bez
    zgadywania).
    """
    snapshot = _scenario_snapshot(
        base_run.snapshot or {}, record=record, bus_ref=bus_ref, night=night
    )
    run = _scenario_run(base_run, snapshot)
    try:
        _execute_power_flow(run)
    except Exception:  # noqa: BLE001 — niezbieżność/osobliwość = scenariusz nieoceniony
        return _pusty_pomiar()

    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    if not bool(result_v1.get("converged", False)):
        return _pusty_pomiar()

    point_node = _graph_id_from_ref(bus_ref)
    kanon = moc_kanoniczna_punktu(
        branch_results=result_v1.get("branch_results") or [],
        endpoints=_edge_endpoints(snapshot),
        point_node=point_node,
    )
    if kanon["incydentne"] == 0:
        return _pusty_pomiar()

    p_point = kanon["p_mw"]
    q_przekroju = kanon["q_mvar"]  # przepływ gałęzi (kanoniczny) — wielkość przekrojowa (1)

    # Model kondensatora z katalogu: Q_cap_eff = Σ(rated_mvar) · V² (nameplate·V²,
    # NIE fizyka pola). V — napięcie punktu zwrócone przez solver dla scenariusza.
    v_pu = _v_pu_punktu(result_v1, point_node)
    q_kompensacji = _q_kompensacji_znamionowa_mvar(snapshot, bus_ref)
    q_cap_eff = q_kompensacji * (v_pu**2) if v_pu is not None else 0.0
    # Q_load = zapotrzebowanie bierne odbioru (przepływ po F9.8 zawiera efekt baterii,
    # więc odzysk wymaga DODANIA Q_cap_eff — rekalibracja K3).
    q_load = q_przekroju + q_cap_eff
    # Q_netto = Q_load − Q_cap_eff (kompensacja pojemnościowa; Q_netto<0 = przekompensowanie).
    q_netto = q_netto_po_kompensacji(q_load, q_cap_eff)

    return {
        "converged": True,
        "cosfi_przekroju": _cosfi(p_point, q_przekroju),  # (1) przekrój sieci
        "cosfi_punktu": _cosfi(p_point, q_netto),  # (2) punkt kompensowany — dobór
        "p_point_mw": _round6(p_point),
        "q_przekroju_mvar": _round6(q_przekroju),
        "q_load_mvar": _round6(q_load),
        "q_cap_eff_mvar": _round6(q_cap_eff),
        "q_netto_punktu_mvar": _round6(q_netto),
        "v_pu": _round6(v_pu),
    }


def _meets(cos_phi: float | None, cos_phi_min: float) -> bool:
    return cos_phi is not None and cos_phi >= cos_phi_min


def _candidate_verdict(
    base_run: CanonicalRun,
    *,
    record: dict[str, Any],
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool,
) -> dict[str, Any]:
    day = _point_cos_phi(base_run, record=record, bus_ref=bus_ref, night=False)
    night = (
        _point_cos_phi(base_run, record=record, bus_ref=bus_ref, night=True)
        if uwzglednij_noc
        else None
    )
    # Dobór opiera się na cosφ PUNKTU KOMPENSOWANEGO (wielkość 2), NIE na przekroju.
    meets_day = _meets(day["cosfi_punktu"], cos_phi_min)
    meets_night = True if night is None else _meets(night["cosfi_punktu"], cos_phi_min)
    return {
        "catalog_ref": str(record["id"]),
        "name": str(record["name"]),
        "rated_mvar": _round6(record["params"]["rated_mvar"]),
        "rated_kv": _round6(record["params"]["rated_kv"]),
        # (1) cosφ przepływu w przekroju sieciowym (opisuje przekrój, NIE stopień kompensacji):
        "cosfi_przekroju_dzien": day["cosfi_przekroju"],
        "cosfi_przekroju_noc": None if night is None else night["cosfi_przekroju"],
        # (2) cosφ punktu kompensowanego (Q_netto = Q_load − Q_cap_eff) — podstawa doboru:
        "cosfi_punktu_dzien": day["cosfi_punktu"],
        "cosfi_punktu_noc": None if night is None else night["cosfi_punktu"],
        "p_point_day_mw": day["p_point_mw"],
        "q_przekroju_dzien_mvar": day["q_przekroju_mvar"],
        "q_cap_eff_dzien_mvar": day["q_cap_eff_mvar"],
        "q_netto_punktu_dzien_mvar": day["q_netto_punktu_mvar"],
        "p_point_night_mw": None if night is None else night["p_point_mw"],
        "q_przekroju_noc_mvar": None if night is None else night["q_przekroju_mvar"],
        "q_cap_eff_noc_mvar": None if night is None else night["q_cap_eff_mvar"],
        "q_netto_punktu_noc_mvar": None if night is None else night["q_netto_punktu_mvar"],
        "spelnia_dzien": meets_day,
        "spelnia_noc": None if night is None else meets_night,
        "spelnia": meets_day and meets_night,
    }


def _input_hash(
    base_run: CanonicalRun,
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool,
    candidate_ids: list[str],
) -> str:
    payload = {
        "snapshot_hash": base_run.snapshot_hash,
        "bus_ref": bus_ref,
        "cos_phi_min": cos_phi_min,
        "uwzglednij_noc": uwzglednij_noc,
        "candidate_ids": candidate_ids,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_compensation_sizing_view(
    run: CanonicalRun,
    *,
    bus_ref: str,
    cos_phi_min: float,
    uwzglednij_noc: bool = False,
) -> dict[str, Any]:
    """Zbuduj widok doboru kompensacji dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony, gdy ``cos_phi_min`` jest poza (0, 1] albo gdy wskazana
            szyna nie istnieje — komunikaty w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Dobór kompensacji wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )
    if not (0.0 < cos_phi_min <= 1.0):
        raise ValueError("Wymagany cosφ (cos_phi_min) musi być w przedziale (0, 1].")

    snapshot = run.snapshot or {}
    buses = _bus_index(snapshot)
    bus = buses.get(bus_ref)
    if bus is None:
        raise ValueError(f"Wskazana szyna punktu przyłączenia nie istnieje w modelu: {bus_ref}.")

    bus_kv = float(bus.get("voltage_kv") or 0.0)
    records = _sorted_candidates(bus_kv)

    baseline_day = _point_cos_phi(run, record=None, bus_ref=bus_ref, night=False)
    baseline_night = (
        _point_cos_phi(run, record=None, bus_ref=bus_ref, night=True) if uwzglednij_noc else None
    )
    # Bez baterii (Q_cap_eff=0) cosφ przekroju == cosφ punktu; oba pola wystawiamy jawnie.
    baseline = {
        "cosfi_przekroju_dzien": baseline_day["cosfi_przekroju"],
        "cosfi_przekroju_noc": (
            None if baseline_night is None else baseline_night["cosfi_przekroju"]
        ),
        "cosfi_punktu_dzien": baseline_day["cosfi_punktu"],
        "cosfi_punktu_noc": None if baseline_night is None else baseline_night["cosfi_punktu"],
    }

    candidates = [
        _candidate_verdict(
            run,
            record=record,
            bus_ref=bus_ref,
            cos_phi_min=cos_phi_min,
            uwzglednij_noc=uwzglednij_noc,
        )
        for record in records
    ]

    selected = next((c for c in candidates if c["spelnia"]), None)
    if selected is not None:
        dobor: dict[str, Any] | None = {
            "catalog_ref": selected["catalog_ref"],
            "name": selected["name"],
            "rated_mvar": selected["rated_mvar"],
            "rated_kv": selected["rated_kv"],
            # Dobór to wielkość punktu kompensowanego (2); przekrój (1) dostępny obok.
            "cosfi_punktu_dzien": selected["cosfi_punktu_dzien"],
            "cosfi_punktu_noc": selected["cosfi_punktu_noc"],
            "cosfi_przekroju_dzien": selected["cosfi_przekroju_dzien"],
            "cosfi_przekroju_noc": selected["cosfi_przekroju_noc"],
        }
        powod = None
    else:
        dobor = None
        if not records:
            powod = f"Brak baterii w katalogu dla napięcia znamionowego szyny {_round6(bus_kv)} kV."
        else:
            zakres = "dzień i noc" if uwzglednij_noc else "dzień"
            powod = (
                f"Żadna bateria z katalogu nie zapewnia wymaganego cosφ ≥ {cos_phi_min} "
                f"w punkcie {bus_ref} ({zakres}); największy przegląd nie spełnia wymagania."
            )

    return {
        "analysis": "compensation_sizing",
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=False),
        "parameters": {
            "bus_ref": bus_ref,
            "bus_name": bus.get("name"),
            "bus_voltage_kv": _round6(bus_kv),
            "cos_phi_min": cos_phi_min,
            "uwzglednij_noc": uwzglednij_noc,
        },
        "input_hash": _input_hash(
            run, bus_ref, cos_phi_min, uwzglednij_noc, [str(r["id"]) for r in records]
        ),
        "baseline": baseline,
        "candidates": candidates,
        "dobor": dobor,
        "powod_braku": powod,
        # Ślad pełnej jawności obliczeń: semantyka po polsku, matematyka wyłącznie
        # LaTeX w delimiterach $...$ (konwencja Proof Engine; dyrektywa właściciela
        # 2026-07-29 — zero kodów rejestru, nazw API i ścieżek plików w treści
        # widocznej dla inżyniera).
        "whitebox": {
            "pq_source": (
                "wypadkowy przepływ gałęzi zasilających punkt z wyniku rozpływu "
                "(koniec przy punkcie, suma po gałęziach incydentnych) przełożony "
                "na znak kanoniczny przez adapter konwencji mocy biernej"
            ),
            "cosfi_przekroju": (
                r"cosφ przepływu w przekroju sieciowym: "
                r"$\cos\varphi_{\text{przekroju}} = \dfrac{|P|}{\sqrt{P^{2} + "
                r"Q_{\text{przekroju}}^{2}}}$; opisuje przekrój sieci, "
                "NIE stopień skompensowania odbioru"
            ),
            "cosfi_punktu": (
                r"cosφ punktu kompensowanego: "
                r"$\cos\varphi_{\text{punktu}} = \dfrac{|P|}{\sqrt{P^{2} + "
                r"Q_{\text{netto}}^{2}}}$, $Q_{\text{netto}} = Q_{\text{odb}} - "
                r"Q_{\text{bat}}$, $Q_{\text{bat}} = \sum Q_{\text{zn}} \cdot V^{2}$ "
                "(moc znamionowa baterii z katalogu, nie fizyka pola); PODSTAWA DOBORU"
            ),
            "konwencja_kanoniczna": (
                "$P>0$ — pobór mocy czynnej, $Q>0$ — pobór mocy biernej (indukcyjny), "
                "$Q<0$ — moc pojemnościowa"
            ),
            "decyzja": (
                "wynik rozpływu pozostaje nienaruszony (tylko odczyt); znak mocy "
                "biernej interpretuje adapter konwencji — dobór nie modyfikuje "
                "solvera ani wyniku"
            ),
            "candidate_count": len(candidates),
            "night_scenario": (
                "moc czynna generatorów = 0 (moc bierna bez zmian)" if uwzglednij_noc else None
            ),
        },
    }
