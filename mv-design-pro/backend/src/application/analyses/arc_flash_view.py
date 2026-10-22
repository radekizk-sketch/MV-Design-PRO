"""Widok analizy Arc Flash (IEEE 1584-2018) dla gotowego przebiegu zwarciowego.

Warstwa APPLICATION (mapowanie, ZERO fizyki). Odwzorowuje wejścia solvera zwarciowego
na ``ArcFlashInput`` i deleguje obliczenie energii incydentu / granicy łuku / kategorii
PPE do buildera analizy (``analysis.arc_flash``). Domyka wyspę wykrytą w audycie
V12K-059 poz. A: model IEEE 1584-2018 istniał bez punktu wejścia (dispatch/API/UI/raport).

Wejścia z przebiegu (per węzeł):
- ``i_bf_ka`` ← ``ShortCircuitResult`` wiersz ``ikss_ka`` (Ik'' bolted) [kA],
- ``voltage_kv`` ← napięcie znamionowe węzła z zapisanego grafu [kV].

Wejścia projektowe (z żądania — realne decyzje projektanta, NIE domyślne zmyślone):
- ``working_distance_mm``, ``conductor_gap_mm`` (odstęp elektrod, odległość robocza),
- ``arc_time_s`` — czas wyłączenia zwarcia (z koordynacji zabezpieczeń), to samo źródło,
  którego używa obliczenie U_touch / uziemienia,
- ``electrode_config`` (VCB/VCBB/HCB/VOA/HOA), ``enclosure_type`` (Typical/Shallow).

Brak wejścia obowiązkowego ⇒ builder zwraca „dane niekompletne" per punkt (bez zmyślania).
"""

from __future__ import annotations

from typing import Any

from analysis.arc_flash import (
    ArcFlashBuilder,
    ArcFlashContext,
    ArcFlashInput,
    ElectrodeConfig,
    EnclosureType,
)
from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
from application.autorytet_biegu_zwarciowego import wymagaj_zakresu_biegu
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results
from enm.dane_przyjete_galezi import dane_przyjete_galezi_wiersza
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaDanychError
from werdykt import DanaPrzyjeta


def _voltage_by_target(run: CanonicalRun) -> dict[str, float | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> ArcFlashContext:
    header = (run.snapshot or {}).get("header") or {}
    return ArcFlashContext(
        project_name=nazwa_nadana(header.get("name")),
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


def build_arc_flash_view(
    run: CanonicalRun,
    *,
    working_distance_mm: float | None,
    conductor_gap_mm: float | None,
    arc_time_s: float | None,
    electrode_config: str = "VCB",
    enclosure_type: str = "Typical",
) -> dict[str, Any]:
    """Zbuduj widok Arc Flash per węzeł dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub nie
            został zakończony, albo gdy podano nieznaną konfigurację elektrod/obudowy —
            komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise OdmowaDanychError(
            "Analiza Arc Flash wymaga przebiegu zwarciowego; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise OdmowaDanychError(
            f"Przebieg nie jest zakończony (stan: {stan_przebiegu_pl(run.status)}); "
            "wynik zwarciowy nie jest dostępny."
        )
    # Karta OD-14: wynik zwarcia przez impedancję przejścia Z_f poza zakresem tej
    # zdolności — odmowa SI-117 (jedno źródło: `blokady_zakresu_biegu`).
    wymagaj_zakresu_biegu(run, ZdolnoscMiarodajna.ARC_FLASH)
    try:
        cfg = ElectrodeConfig(electrode_config)
    except ValueError as exc:
        raise OdmowaDanychError(
            f"Nieznana konfiguracja elektrod: {electrode_config!r} "
            "(dozwolone: VCB, VCBB, HCB, VOA, HOA)."
        ) from exc
    try:
        enc = EnclosureType(enclosure_type)
    except ValueError as exc:
        raise OdmowaDanychError(
            f"Nieznany typ obudowy: {enclosure_type!r} (dozwolone: Typical, Shallow)."
        ) from exc

    voltage_by_target = _voltage_by_target(run)
    inputs: list[ArcFlashInput] = []
    # Nazwa szyny z tabeli wyników zwarć (nazwa z modelu albo opis rodzaju) — wiersz
    # widoku i raportu nazywa szynę nią, nie identyfikatorem węzła (karta #144).
    nazwy_szyn: dict[str, str] = {}
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: punkty w sieci nN liczonej z wartością roboczą
    # tolerancji (znacznik wiersza biegu) — I_bf stoi na danej przyjętej. Karta LINIA-110:
    # tak samo punkty, do których prądu wchodzi linia 110 kV z wartością roboczą geometrii.
    robocze: set[str] = set()
    dane_linii: dict[str, tuple[DanaPrzyjeta, ...]] = {}
    # Karta PODSTAWA-Q (rozstrzygnięcie 3): wartości robocze parametrów maszyn wirujących wyspy
    # punktu z TEGO SAMEGO wiersza — I_bf = I″k punktu stoi na nich, gdy wpływają na I″k.
    robocze_maszyn: dict[str, list[dict[str, Any]]] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        target_id = row.get("target_id")
        if not target_id:
            continue
        nazwy_szyn[str(target_id)] = str(row.get("target_name"))
        if row.get("tolerancja_nn_robocza"):
            robocze.add(str(target_id))
        dane_linii[str(target_id)] = dane_przyjete_galezi_wiersza(row)
        robocze_maszyn[str(target_id)] = list(row.get("parametry_robocze_maszyn") or ())
        inputs.append(
            ArcFlashInput(
                bus_ref=str(target_id),
                i_bf_ka=row.get("ikss_ka"),
                voltage_kv=voltage_by_target.get(str(target_id)),
                arc_time_s=arc_time_s,
                electrode_config=cfg,
                conductor_gap_mm=conductor_gap_mm,
                working_distance_mm=working_distance_mm,
                enclosure_type=enc,
            )
        )

    view = ArcFlashBuilder().build(inputs, context=_context(run)).to_dict()
    for wynik in view.get("results") or []:
        wynik["bus_name"] = nazwy_szyn[str(wynik["bus_ref"])]
        dane = (
            (
                (dana_przyjeta_tolerancji_nn(miejsce_pl=f"punkt zwarcia: {wynik['bus_name']}"),)
                if str(wynik["bus_ref"]) in robocze
                else ()
            )
            + dane_linii.get(str(wynik["bus_ref"]), ())
            + dane_przyjete_maszyn(robocze_maszyn.get(str(wynik["bus_ref"])), wielkosc="ikss")
        )
        if dane:
            wynik["status_danych"] = "UNVALIDATED_INPUT"
            wynik["dane_przyjete"] = [dana.model_dump(mode="json") for dana in dane]
    return view
