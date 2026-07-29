"""Widok werdyktu stabilności SSCI dla gotowego przebiegu V12.6 (``ssci_impedance``).

Warstwa APPLICATION (mapowanie + serializacja, ZERO fizyki). Odczytuje GOTOWY
przebieg solvera D-03 SSCI (analiza akademicka V12.6 ``ssci_impedance`` —
tablice ``z_grid(f)``/``z_conv(f)``/``L(f)``) i deleguje werdykt stabilności
impedancyjnej (kryterium Nyquista, Sun 2011 / Wen 2016) do buildera warstwy
analizy (``analysis.ssci_stability.SsciStabilityBuilder``). Domyka lukę wykrytą
w inwentarzu funkcji: analiza SSCI istniała bez punktu wejścia (API/UI).

Wejście: rekord uruchomienia V12.6 (``dict`` z ``api.v126_academic._runs``) —
``result["result"]`` niesie zserializowany payload solvera SSCI, ``input`` niesie
kartę(y) przekształtnika do propagacji proweniencji. Werdykt jest deterministyczny:
dla ustalonego przebiegu identyczne wywołanie daje identyczny identyfikator.

Uczciwy stan zerowy (ZERO fabrykacji): gdy solver zwrócił „dane niekompletne"
(brak przekształtnika/DER lub brak pól karty falownika), builder wydaje werdykt
„brak danych" z jawnym ``missing_data`` — analiza NIE zmyśla tablic ani werdyktu.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from analysis.ssci_stability import SsciStabilityBuilder, SsciStabilityContext

SSCI_ANALYSIS_TYPE = "ssci_impedance"


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _context(
    run_record: Mapping[str, Any], solver_result: Mapping[str, Any]
) -> SsciStabilityContext:
    case_id = run_record.get("case_id")
    deterministic_hash = solver_result.get("deterministic_hash")
    run_id = run_record.get("run_id")
    return SsciStabilityContext(
        project_name=None,
        case_name=None,
        case_id=str(case_id) if case_id else None,
        run_timestamp=_parse_timestamp(run_record.get("created_at")),
        snapshot_hash=str(deterministic_hash) if deterministic_hash else None,
        run_id=str(run_id) if run_id else None,
    )


def _converter_for_provenance(run_record: Mapping[str, Any], converter_ref: Any) -> Any | None:
    """Odtwórz kartę przekształtnika z zapisanego wejścia przebiegu (proweniencja).

    Karta niesie realne pola pasm regulatora / filtra, od których zależy Z_conv,
    więc werdykt nosi najgorszą jakość tych pól (DATASHEET ≻ ESTIMATED ≻
    SYSTEM_DEFAULT). Zwraca ``None``, gdy przebieg nie ma dopasowanej karty (np.
    brak przekształtnika) — wtedy werdykt nie nosi etykiety proweniencji.
    """
    if converter_ref is None:
        return None
    model_input = run_record.get("input")
    if not isinstance(model_input, Mapping):
        return None
    converters = model_input.get("converters")
    if not isinstance(converters, list):
        return None
    match = next(
        (c for c in converters if isinstance(c, Mapping) and c.get("ref") == converter_ref),
        None,
    )
    if match is None:
        return None
    from solver_input.v126_contracts import V126ConverterInput

    return V126ConverterInput.model_validate(dict(match))


def build_ssci_stability_view(run_record: Mapping[str, Any]) -> dict[str, Any]:
    """Zbuduj widok werdyktu stabilności SSCI z gotowego przebiegu V12.6.

    Args:
        run_record: rekord uruchomienia V12.6 (``api.v126_academic._runs``) rodzaju
            ``ssci_impedance`` (klucze: ``result``, ``input``, ``case_id``,
            ``run_id``, ``created_at``).

    Raises:
        ValueError: gdy przebieg nie jest rodzaju ``ssci_impedance`` albo nie
            zawiera zserializowanego payloadu solvera SSCI — komunikat po polsku.
    """
    if run_record.get("analysis_type") != SSCI_ANALYSIS_TYPE:
        raise ValueError(
            "Werdykt stabilności SSCI wymaga przebiegu rodzaju „ssci_impedance”; "
            f"otrzymano: {run_record.get('analysis_type')}."
        )
    solver_result = run_record.get("result")
    if not isinstance(solver_result, Mapping):
        raise ValueError("Przebieg SSCI nie zawiera wyniku solvera.")
    payload = solver_result.get("result")
    if not isinstance(payload, Mapping):
        raise ValueError("Wynik solvera SSCI nie zawiera payloadu analizy (z_grid/z_conv/L).")

    converter = _converter_for_provenance(run_record, payload.get("converter_ref"))
    view = SsciStabilityBuilder().build(
        dict(payload),
        converter=converter,
        context=_context(run_record, solver_result),
    )
    return view.to_dict()
