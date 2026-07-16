"""Serwis aplikacyjny: siła sieci (SCR/WSCR) dla źródeł falownikowych.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
zwarciowego (``short_circuit_sn``) oraz dane modelu (moc zainstalowana źródeł
falownikowych IBG w węźle przyłączenia) i buduje wejścia dla gotowego buildera
interpretacji ``analysis.grid_strength``. ZERO obliczeń fizycznych — moc zwarciowa
S_sc'' pochodzi z solvera IEC 60909, moc zainstalowana z katalogu przekształtnika.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``s_sc_mva`` ← ``build_short_circuit_results(run)`` → wiersz ``sk_mva`` per węzeł
  (``enm.canonical_analysis.build_short_circuit_results``),
- ``s_installed_mva`` ← suma ``sn_mva`` przekształtników źródeł IBG w węźle
  (``materialized_params.sn_mva`` lub ``ConverterType.sn_mva`` z katalogu).
"""

from __future__ import annotations

from typing import Any

from analysis.grid_strength.builder import GridStrengthBuilder
from analysis.grid_strength.models import BusStrengthInput, GridStrengthContext
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results

# Typy źródeł falownikowych (Inverter-Based Generation) — SCR dotyczy punktu
# przyłączenia źródeł energoelektronicznych. Generatory synchroniczne pominięte.
IBG_GEN_TYPES: frozenset[str] = frozenset(
    {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}
)


def _resolve_converter(catalog_ref: str | None) -> Any | None:
    """Rozwiąż ``ConverterType`` z katalogu domyślnego po ``catalog_ref``.

    Zwraca ``None`` gdy ref pusty lub pozycja nie jest przekształtnikiem
    (uczciwie — brak fabrykowania mocy znamionowej).
    """
    if not catalog_ref:
        return None
    from network_model.catalog.repository import get_default_mv_catalog

    return get_default_mv_catalog().get_converter_type(str(catalog_ref))


def _installed_mva_for_generator(gen: dict[str, Any]) -> float | None:
    """Moc pozorna znamionowa (S_n) źródła IBG [MVA] z danych modelu.

    Priorytet: ``materialized_params.sn_mva`` (zmaterializowany parametr
    katalogowy) → ``ConverterType.sn_mva`` (rozwiązany z katalogu). Brak → None.
    """
    materialized = gen.get("materialized_params") or {}
    sn_mva = materialized.get("sn_mva")
    if sn_mva is not None:
        try:
            value = float(sn_mva)
        except (TypeError, ValueError):
            value = 0.0
        if value > 0.0:
            return value
    converter = _resolve_converter(gen.get("catalog_ref"))
    if converter is not None and getattr(converter, "sn_mva", None):
        value = float(converter.sn_mva)
        if value > 0.0:
            return value
    return None


def _installed_mva_by_bus(snapshot: dict[str, Any]) -> dict[str, float]:
    """Suma mocy zainstalowanej źródeł IBG per węzeł (ref_id szyny).

    Agreguje po WSZYSTKICH elementach-źródłach IBG przyłączonych do danej szyny
    (test: „suma mocy wielu źródeł w jednym węźle").
    """
    by_bus: dict[str, float] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        if str(gen.get("gen_type") or "") not in IBG_GEN_TYPES:
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str):
            continue
        installed = _installed_mva_for_generator(gen)
        if installed is None:
            # Węzeł hostuje IBG, ale bez znanej mocy znamionowej — utrzymujemy
            # klucz z sumą 0.0, aby builder wydał uczciwie „brak danych".
            by_bus.setdefault(bus_ref, 0.0)
            continue
        by_bus[bus_ref] = by_bus.get(bus_ref, 0.0) + installed
    return by_bus


def _sk_mva_by_bus(run: CanonicalRun) -> dict[str, float | None]:
    """Moc zwarciowa S_sc'' [MVA] per węzeł (ref_id szyny) z wyniku IEC 60909."""
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


def _context(run: CanonicalRun) -> GridStrengthContext:
    header = (run.snapshot or {}).get("header") or {}
    return GridStrengthContext(
        project_name=str(header.get("name")) if header.get("name") else None,
        case_name=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_id=run.snapshot_hash,
        trace_id=str(run.id),
    )


def build_grid_strength_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok siły sieci (SCR/WSCR) dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub
            nie został zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Siła sieci (SCR/WSCR) wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )

    snapshot = run.snapshot or {}
    installed_by_bus = _installed_mva_by_bus(snapshot)
    sk_by_bus = _sk_mva_by_bus(run)
    kv_by_bus = _nominal_kv_by_bus(snapshot)

    inputs = [
        BusStrengthInput(
            bus_ref=bus_ref,
            nominal_kv=kv_by_bus.get(bus_ref),
            s_sc_mva=sk_by_bus.get(bus_ref),
            s_installed_mva=(installed if installed > 0.0 else None),
        )
        for bus_ref, installed in installed_by_bus.items()
    ]

    view = GridStrengthBuilder().build(inputs, context=_context(run))
    return view.to_dict()
