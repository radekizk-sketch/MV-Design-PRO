"""Serwis aplikacyjny: ocena migotania (Pst/Plt) i szybkich zmian napięcia.

Warstwa APPLICATION (mapowanie + normatywna arytmetyka oceny emisji, NIE fizyka).
Odczytuje GOTOWY wynik przebiegu zwarciowego (``short_circuit_sn``) — moc
zwarciową Sk'' w punkcie przyłączenia — oraz z katalogu przekształtnika moc
znamionową Sn i współczynnik emisji migotania c(ψk); wylicza emisję migotania
źródeł falownikowych (FW/PV/BESS) w węźle przyłączenia wg IEC/TR 61000-3-7.
ZERO fizyki: Sk'' pochodzi z solvera IEC 60909, Sn i c z katalogu — formuły to
deterministyczna arytmetyka normatywnej oceny emisji (interpretacja), analogicznie
do wskaźnika SCR (``grid_strength``).

Odwzorowania (plik:linia w kodzie źródłowym):
- ``sk_mva`` ← ``build_short_circuit_results(run)`` → wiersz ``sk_mva`` per węzeł
  (``enm.canonical_analysis.build_short_circuit_results``), tak jak
  ``grid_strength._sk_mva_by_bus``,
- ``sn_mva`` ← ``materialized_params.sn_mva`` lub ``ConverterType.sn_mva``,
- ``flicker_c`` ← ``materialized_params.flicker_c`` lub ``ConverterType.flicker_c``
  (współczynnik emisji migotania z certyfikatu urządzenia; brak → moduł pomijany
  w sumowaniu z jawnym wpisem INFO).

Źródła stałych normatywnych (KAŻDA stała z cytatem — brak cytatu → None + INFO):
- prawo sumowania emisji migotania wielu źródeł: ``Pst = (Σ Pst_i^m)^(1/m)`` z
  wykładnikiem ``m = 3`` — IEC/TR 61000-3-7:2008, §5.2 (ogólne prawo sumowania,
  wartość wykładnika sumowania dla migotania — sumowanie sześcienne),
- poziomy planowania dla sieci SN (wartości orientacyjne): ``Pst = 0.9``,
  ``Plt = 0.7`` — IEC/TR 61000-3-7:2008, Tablica 1 (indicative planning levels,
  MV). Norma wskazuje, że są to wartości orientacyjne; wiążące wymaganie ustala
  OSD (patrz ``zalozenia_pl``),
- ``kmax = 1`` dla szybkiej zmiany napięcia ``d = kmax · Sn/Sk'' · 100`` —
  jawne założenie konserwatywne (bez współczynnika kształtu kmax(ψk) z certyfikatu
  załączenie pełnej mocy w punkcie przyłączenia; IEC/TR 61000-3-7:2008, §5.5).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from application.analyses.grid_strength import IBG_GEN_TYPES, resolve_n_parallel
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results

# --- Stałe normatywne (KAŻDA ze źródłem powyżej w docstringu modułu) -----------

# IEC/TR 61000-3-7:2008, §5.2 — ogólne prawo sumowania; dla migotania stosuje się
# sumowanie sześcienne (wykładnik m = 3).
FLICKER_SUMMATION_EXPONENT_M = 3

# IEC/TR 61000-3-7:2008, Tablica 1 — orientacyjne poziomy planowania dla SN (MV).
PLANNING_LEVEL_PST_MV = 0.9
PLANNING_LEVEL_PLT_MV = 0.7

# Założenie konserwatywne (jawne): współczynnik kształtu szybkiej zmiany napięcia
# kmax = 1 (załączenie pełnej mocy w punkcie przyłączenia). IEC/TR 61000-3-7:2008,
# §5.5.
RVC_KMAX = 1.0

_ROUND = 6

# Werdykty (PL) — jawne, deterministyczne.
VERDICT_WITHIN = "w granicach planowania"
VERDICT_EXCEEDED = "przekroczenie poziomu planowania"
VERDICT_NOT_ASSESSABLE = "ocena niemożliwa — brak współczynnika/limitu"


def _r(value: float | None) -> float | None:
    """Deterministyczne zaokrąglenie do ``_ROUND`` miejsc (None przechodzi)."""
    if value is None:
        return None
    return round(float(value), _ROUND)


def _resolve_converter(catalog_ref: str | None) -> Any | None:
    """Rozwiąż ``ConverterType`` z katalogu domyślnego po ``catalog_ref``.

    Zwraca ``None`` gdy ref pusty lub pozycja nie jest przekształtnikiem
    (uczciwie — bez fabrykowania mocy ani współczynnika emisji).
    """
    if not catalog_ref:
        return None
    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_converter_type(str(catalog_ref))


def _sn_and_flicker_for_generator(gen: dict[str, Any]) -> tuple[float | None, float | None]:
    """Moc znamionowa Sn [MVA] i współczynnik emisji migotania c źródła IBG.

    Priorytet: ``materialized_params`` (zmaterializowany parametr katalogowy) →
    ``ConverterType`` z katalogu. Brak danej → None (jawnie, bez fabrykowania).

    Sn to moc zainstalowana grupy jednostek równoległych: znamionowa moc
    pojedynczej jednostki przemnożona przez ``n_parallel`` (``resolve_n_parallel``;
    brak/None → 1), spójnie z ``grid_strength._installed_mva_for_generator``.
    """
    materialized = gen.get("materialized_params") or {}
    converter = _resolve_converter(gen.get("catalog_ref"))

    sn_mva: float | None = None
    raw_sn = materialized.get("sn_mva")
    if raw_sn is not None:
        try:
            candidate = float(raw_sn)
        except (TypeError, ValueError):
            candidate = 0.0
        if candidate > 0.0:
            sn_mva = candidate
    if sn_mva is None and converter is not None and getattr(converter, "sn_mva", None):
        candidate = float(converter.sn_mva)
        if candidate > 0.0:
            sn_mva = candidate
    if sn_mva is not None:
        sn_mva = sn_mva * resolve_n_parallel(gen)

    flicker_c: float | None = None
    raw_c = materialized.get("flicker_c")
    if raw_c is not None:
        try:
            candidate_c = float(raw_c)
        except (TypeError, ValueError):
            candidate_c = 0.0
        if candidate_c > 0.0:
            flicker_c = candidate_c
    if flicker_c is None and converter is not None and getattr(converter, "flicker_c", None):
        candidate_c = float(converter.flicker_c)
        if candidate_c > 0.0:
            flicker_c = candidate_c

    return sn_mva, flicker_c


def _ibg_by_bus(snapshot: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Moduły falownikowe (IBG) per węzeł przyłączenia (ref_id szyny).

    Stała kolejność: węzły posortowane po ``bus_ref``, moduły po ``gen_ref``.
    """
    by_bus: dict[str, list[dict[str, Any]]] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        if str(gen.get("gen_type") or "") not in IBG_GEN_TYPES:
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str):
            continue
        sn_mva, flicker_c = _sn_and_flicker_for_generator(gen)
        gen_ref = str(gen.get("ref_id") or "")
        by_bus.setdefault(bus_ref, []).append(
            {"gen_ref": gen_ref, "sn_mva": sn_mva, "flicker_c": flicker_c}
        )
    for modules in by_bus.values():
        modules.sort(key=lambda module: module["gen_ref"])
    return by_bus


def _sk_mva_by_bus(run: CanonicalRun) -> dict[str, float | None]:
    """Moc zwarciowa Sk'' [MVA] per węzeł (ref_id szyny) z wyniku IEC 60909."""
    out: dict[str, float | None] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        bus_ref = row.get("element_id")
        if not isinstance(bus_ref, str):
            continue
        sk = row.get("sk_mva")
        out[bus_ref] = float(sk) if sk is not None else None
    return out


def _nominal_kv_by_bus(snapshot: dict[str, Any]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for bus in snapshot.get("buses") or []:
        if not isinstance(bus, dict):
            continue
        ref_id = bus.get("ref_id")
        if not isinstance(ref_id, str):
            continue
        kv = bus.get("voltage_kv")
        out[ref_id] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> dict[str, Any]:
    header = (run.snapshot or {}).get("header") or {}
    return {
        "project_name": str(header.get("name")) if header.get("name") else None,
        "case_name": str(run.case_id) if run.case_id else None,
        "run_timestamp": run.created_at.isoformat() if run.created_at else None,
        "snapshot_id": run.snapshot_hash,
        "trace_id": str(run.id),
    }


def _step(symbol: str, formula_latex: str, substitution_pl: str, result_pl: str) -> dict[str, str]:
    return {
        "symbol": symbol,
        "formula_latex": formula_latex,
        "substitution_pl": substitution_pl,
        "result_pl": result_pl,
    }


def _module_view(
    module: dict[str, Any], sk_mva: float | None
) -> tuple[dict[str, Any], float | None]:
    """Zbuduj widok modułu i jego wkład Pst_i (lub None, gdy pominięty)."""
    gen_ref = module["gen_ref"]
    sn_mva = module["sn_mva"]
    flicker_c = module["flicker_c"]

    if flicker_c is None:
        return (
            {
                "gen_ref": gen_ref,
                "sn_mva": _r(sn_mva),
                "flicker_c": None,
                "pst_i": None,
                "included": False,
                "info_pl": "brak współczynnika emisji migotania w katalogu — moduł pominięty w sumowaniu",
                "white_box": [],
            },
            None,
        )
    if sn_mva is None:
        return (
            {
                "gen_ref": gen_ref,
                "sn_mva": None,
                "flicker_c": _r(flicker_c),
                "pst_i": None,
                "included": False,
                "info_pl": "brak mocy znamionowej Sn w katalogu — moduł pominięty w sumowaniu",
                "white_box": [],
            },
            None,
        )
    if sk_mva is None:
        return (
            {
                "gen_ref": gen_ref,
                "sn_mva": _r(sn_mva),
                "flicker_c": _r(flicker_c),
                "pst_i": None,
                "included": False,
                "info_pl": "brak mocy zwarciowej Sk'' w węźle — moduł pominięty w sumowaniu",
                "white_box": [],
            },
            None,
        )

    pst_i = _r(flicker_c * sn_mva / sk_mva)
    white_box = [
        _step(
            "P_{st,i}",
            r"P_{st,i} = c_i \cdot \dfrac{S_{n,i}}{S_{k}''}",
            f"P_st_i = {flicker_c:g} · {sn_mva:g} / {sk_mva:g} MVA",
            f"P_st_i = {pst_i}",
        )
    ]
    return (
        {
            "gen_ref": gen_ref,
            "sn_mva": _r(sn_mva),
            "flicker_c": _r(flicker_c),
            "pst_i": pst_i,
            "included": True,
            "info_pl": None,
            "white_box": white_box,
        },
        pst_i,
    )


def _zalozenia_pl() -> list[str]:
    return [
        "Emisja pojedynczego źródła: Pst_i = c · Sn / Sk'' (c — współczynnik emisji "
        "migotania z certyfikatu urządzenia; metodyka IEC 61400-21-1).",
        "Sumowanie emisji wielu źródeł w węźle: Pst = (Σ Pst_i^m)^(1/m), wykładnik "
        "m = 3 (sumowanie sześcienne wg IEC/TR 61000-3-7:2008, §5.2).",
        "Plt = Pst — założenie konserwatywne dla ciągłej, ustalonej emisji źródeł OZE "
        "(równe wartości Pst w oknie 2 h dają Plt = Pst z definicji Plt).",
        "Poziomy planowania dla SN: Pst = 0.9, Plt = 0.7 — wartości orientacyjne wg "
        "IEC/TR 61000-3-7:2008, Tablica 1. Wiążące wymaganie ustala OSD.",
        "Szybka zmiana napięcia d = kmax · Sn / Sk'' · 100, kmax = 1 (założenie "
        "konserwatywne — załączenie pełnej mocy zainstalowanej w węźle; "
        "IEC/TR 61000-3-7:2008, §5.5).",
    ]


def _verdict(pst: float | None, plt: float | None) -> str:
    if pst is None or plt is None:
        return VERDICT_NOT_ASSESSABLE
    if pst <= PLANNING_LEVEL_PST_MV and plt <= PLANNING_LEVEL_PLT_MV:
        return VERDICT_WITHIN
    return VERDICT_EXCEEDED


def _bus_entry(
    bus_ref: str,
    nominal_kv: float | None,
    sk_mva: float | None,
    modules: list[dict[str, Any]],
) -> dict[str, Any]:
    module_views: list[dict[str, Any]] = []
    pst_contribs: list[float] = []
    sn_total = 0.0
    sn_seen = False
    for module in modules:
        view, pst_i = _module_view(module, sk_mva)
        module_views.append(view)
        if pst_i is not None:
            pst_contribs.append(pst_i)
        if module["sn_mva"] is not None:
            sn_total += float(module["sn_mva"])
            sn_seen = True

    white_box: list[dict[str, str]] = []

    # Sumowanie Pst wg prawa sumowania (m = 3).
    pst: float | None
    plt: float | None
    if pst_contribs:
        m = FLICKER_SUMMATION_EXPONENT_M
        summed = sum(value**m for value in pst_contribs)
        pst = _r(summed ** (1.0 / m))
        plt = pst
        terms = " + ".join(f"{value:g}^{m}" for value in pst_contribs)
        white_box.append(
            _step(
                "P_{st}",
                r"P_{st} = \left( \sum_i P_{st,i}^{\,m} \right)^{1/m}, \quad m = 3",
                f"P_st = ({terms})^(1/{m})",
                f"P_st = {pst}",
            )
        )
        white_box.append(
            _step(
                "P_{lt}",
                r"P_{lt} = P_{st}",
                f"P_lt = P_st = {pst} (emisja ciągła, założenie konserwatywne)",
                f"P_lt = {plt}",
            )
        )
    else:
        pst = None
        plt = None

    # Szybka zmiana napięcia d(%) — niezależna od współczynnika c.
    d_percent: float | None
    if sk_mva is not None and sn_seen and sn_total > 0.0:
        d_percent = _r(RVC_KMAX * sn_total / sk_mva * 100.0)
        white_box.append(
            _step(
                "d",
                r"d = k_{max} \cdot \dfrac{S_{n}}{S_{k}''} \cdot 100\%",
                f"d = {RVC_KMAX:g} · {sn_total:g} / {sk_mva:g} · 100 %",
                f"d = {d_percent} %",
            )
        )
    else:
        d_percent = None

    return {
        "bus_ref": bus_ref,
        "nominal_kv": _r(nominal_kv),
        "sk_mva": _r(sk_mva),
        "modules": module_views,
        "pst": pst,
        "plt": plt,
        "d_percent": d_percent,
        "pst_limit": PLANNING_LEVEL_PST_MV,
        "plt_limit": PLANNING_LEVEL_PLT_MV,
        "verdict_pl": _verdict(pst, plt),
        "zalozenia_pl": _zalozenia_pl(),
        "white_box": white_box,
    }


def _input_hash(config: dict[str, Any], entries: list[dict[str, Any]]) -> str:
    """Deterministyczny SHA-256 kanonicznego wejścia oceny migotania."""
    payload = {
        "config": config,
        "buses": [
            {
                "bus_ref": entry["bus_ref"],
                "sk_mva": entry["sk_mva"],
                "modules": [
                    {
                        "gen_ref": module["gen_ref"],
                        "sn_mva": module["sn_mva"],
                        "flicker_c": module["flicker_c"],
                    }
                    for module in entry["modules"]
                ],
            }
            for entry in entries
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_migotanie_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok oceny migotania i szybkich zmian napięcia dla przebiegu SC.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub
            nie został zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Ocena migotania (Pst/Plt) wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )

    snapshot = run.snapshot or {}
    ibg_by_bus = _ibg_by_bus(snapshot)
    sk_by_bus = _sk_mva_by_bus(run)
    kv_by_bus = _nominal_kv_by_bus(snapshot)

    entries = [
        _bus_entry(bus_ref, kv_by_bus.get(bus_ref), sk_by_bus.get(bus_ref), modules)
        for bus_ref, modules in sorted(ibg_by_bus.items(), key=lambda item: item[0])
    ]

    config = {
        "flicker_summation_exponent_m": FLICKER_SUMMATION_EXPONENT_M,
        "planning_level_pst": PLANNING_LEVEL_PST_MV,
        "planning_level_plt": PLANNING_LEVEL_PLT_MV,
        "rvc_kmax": RVC_KMAX,
    }
    summary = {
        "total_buses": len(entries),
        "assessed_count": sum(1 for entry in entries if entry["pst"] is not None),
        "exceeded_count": sum(1 for entry in entries if entry["verdict_pl"] == VERDICT_EXCEEDED),
        "not_assessed_count": sum(
            1 for entry in entries if entry["verdict_pl"] == VERDICT_NOT_ASSESSABLE
        ),
    }
    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "config": config,
        "buses": entries,
        "summary": summary,
        "input_hash": _input_hash(config, entries),
    }
