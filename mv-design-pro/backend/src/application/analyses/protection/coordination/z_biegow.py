"""Wejście koordynacji E-28 z modelu i zapisanych biegów — jedna ścieżka oceny.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21). Urządzenia i nastawy pochodzą z BIEŻĄCEGO modelu
projektu, topologia i prądy — z biegów zwarciowych maksymalnego i minimalnego (bramki
autorytetu ``wejscie_koordynacji_z_biegow``: istnienie, rodzaj, scenariusz MAX/MIN, jedna
migawka, proweniencja wkładu DER), prąd roboczy — z biegu rozpływu. Złożenie nastaw modelu
z wynikiem biegu jest dozwolone wyłącznie, gdy oba opisują TĘ SAMĄ sieć
(``siec_biegu_zgodna_z_modelem``); inaczej nazwana odmowa „przelicz".
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from application.analyses.protection.coordination.analyzer import (
    OvercurrentCoordinationAnalyzer,
    pary_jawne,
    pary_z_topologii,
)
from application.analyses.protection.coordination.models import (
    CoordinationAnalysisResult,
    CoordinationConfig,
    CoordinationInput,
    PradRoboczy,
)
from application.analyses.protection.ocena_nadpradowa import (
    StrefaUrzadzenia,
    prad_roboczy_przekaznika,
)
from application.autorytet_biegu_zwarciowego import (
    BiegNiemiarodajnyError,
    wejscie_koordynacji_z_biegow,
)
from enm.canonical_analysis import (
    RODZAJE_ZWARCIA_OCENY_NADPRADOWEJ,
    build_branch_results,
    get_run,
    ocen_zabezpieczenia_biegu,
)
from enm.hash import siec_biegu_zgodna_z_modelem
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, FuseBranch
from enm.nazwy_elementow import nazwa_elementu, nazwy_wezlow_grafu
from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu
from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna


class OdmowaKoordynacji(Exception):
    """Koordynacji nie da się policzyć na tym wejściu — kod i zdanie dla projektanta."""

    def __init__(self, powod: str, komunikat_pl: str) -> None:
        self.powod = powod
        self.komunikat_pl = komunikat_pl
        super().__init__(komunikat_pl)


def _sprawdz_siec(model: EnergyNetworkModel, bieg: Any, opis: str) -> None:
    if not siec_biegu_zgodna_z_modelem(bieg.snapshot, model.model_dump(mode="json")):
        raise OdmowaKoordynacji(
            "SIEC_ZMIENIONA_OD_BIEGU",
            f"Bieg {opis} policzono dla innej sieci niż bieżący model — od tego biegu zmieniło "
            "się coś poza zabezpieczeniami (element, parametr albo stan łącznika). Przelicz "
            "bieg na bieżącym modelu.",
        )


def _rodzaj_zwarcia(bieg: Any, opis: str) -> str:
    rodzaj = (bieg.raw_result or {}).get("short_circuit_type")
    if rodzaj not in RODZAJE_ZWARCIA_OCENY_NADPRADOWEJ:
        raise OdmowaKoordynacji(
            "RODZAJ_ZWARCIA_NIEWLASCIWY",
            f"Bieg {opis} liczy zwarcie {rodzaj} — koordynacja zabezpieczeń nadprądowych "
            "fazowych wymaga zwarcia międzyfazowego (3F albo 2F).",
        )
    return str(rodzaj)


def _prady_punktow(bieg: Any) -> dict[str, tuple[float, str]]:
    """Ik'' punktów zwarcia biegu (znaczniki TCC). Wartość nieskończona albo NaN nie jest
    prądem — punkt pomija się tu, a ocena urządzeń odmawia go nazwanym brakiem
    (``KOD_PRAD_NIELICZBOWY``)."""
    raw = bieg.raw_result or {}
    nazwy = nazwy_wezlow_grafu(raw)
    return {
        str(w["fault_node_id"]): (float(w["ikss_a"]), nazwy.get(str(w["fault_node_id"]), ""))
        for w in raw.get("results") or []
        if isinstance(w, dict)
        and w.get("ikss_a") is not None
        and w.get("fault_node_id")
        and math.isfinite(float(w["ikss_a"]))
    }


def koordynacja_z_biegow(
    *,
    model: EnergyNetworkModel,
    project_id: str,
    sc_run_id: str | None,
    sc_run_id_min: str | None,
    pf_run_id: str | None,
    pary_wskazane: Sequence[tuple[str, str]] | None,
    config: CoordinationConfig,
    uow_factory: Any = None,
) -> CoordinationAnalysisResult:
    """Koordynacja urządzeń modelu na biegach — albo ``OdmowaKoordynacji``/``BiegNiemiarodajny``."""
    wejscie_biegow = wejscie_koordynacji_z_biegow(run_id_max=sc_run_id, run_id_min=sc_run_id_min)
    wymagaj_autorytetu((ZdolnoscMiarodajna.PROTECTION_COORDINATION,), wejscie_biegow.proweniencja)
    bieg_max = wejscie_biegow.bieg_max
    bieg_min = wejscie_biegow.bieg_min
    rodzaj_max = _rodzaj_zwarcia(bieg_max, "maksymalny")
    rodzaj_min = _rodzaj_zwarcia(bieg_min, "minimalny")
    _sprawdz_siec(model, bieg_max, "zwarciowy maksymalny")

    ocena_max = ocen_zabezpieczenia_biegu(model, bieg_max, uow_factory=uow_factory)
    ocena_min = ocen_zabezpieczenia_biegu(model, bieg_min, uow_factory=uow_factory)
    if not ocena_max.nastawy:
        raise OdmowaKoordynacji(
            "BRAK_ZABEZPIECZEN_W_MODELU",
            "Model nie ma żadnego zabezpieczenia nadprądowego — koordynacji nie ma czego "
            "sprawdzać. Dodaj zabezpieczenie w polu albo przy wyłączniku liniowym i wpisz jego "
            "nastawy.",
        )

    strefy = {
        ref: frozenset(opis["wezly_strefy"])
        for ref, opis in ocena_max.strefy.items()
        if ref not in {o.urzadzenie_ref for o in ocena_max.odmowy}
    }
    if pary_wskazane:
        pary, odmowy_par = pary_jawne(list(pary_wskazane), strefy)
    else:
        pary, odmowy_par = pary_z_topologii(strefy)

    graph = map_enm_to_network_graph(EnergyNetworkModel.model_validate(bieg_max.snapshot or {}))
    prady_robocze: dict[str, PradRoboczy] = {}
    if pf_run_id:
        try:
            bieg_pf = get_run(UUID(str(pf_run_id)))
        except ValueError as blad:
            raise OdmowaKoordynacji(
                "BIEG_ROZPLYWU_NIE_ISTNIEJE",
                "Wskazany identyfikator nie jest identyfikatorem zapisanego biegu rozpływu.",
            ) from blad
        if bieg_pf is None or bieg_pf.analysis_type != "PF" or bieg_pf.status != "FINISHED":
            raise OdmowaKoordynacji(
                "BIEG_ROZPLYWU_NIEMIARODAJNY",
                "Wskazany bieg nie jest zakończonym biegiem rozpływu mocy — prądów roboczych "
                "nie ma z czego odczytać.",
            )
        _sprawdz_siec(model, bieg_pf, "rozpływu mocy")
        prady_galezi = {
            str(w["branch_id"]): (w.get("i_a"), w.get("i_do_a"))
            for w in build_branch_results(bieg_pf)["rows"]
        }
        for ref, opis in ocena_max.strefy.items():
            strefa = StrefaUrzadzenia(
                wezly=frozenset(opis["wezly_strefy"]),
                klaster_zacisku=frozenset(opis["klaster_zacisku"]),
                wezel_zacisku=str(opis["wezel_zacisku"]),
            )
            prad, galaz, powod = prad_roboczy_przekaznika(
                graph=graph, strefa=strefa, prady_galezi=prady_galezi
            )
            prady_robocze[ref] = PradRoboczy(prad_a=prad, galaz_ref=galaz, powod_pl=powod)

    bezpieczniki = tuple(
        {
            "id": galaz.ref_id,
            "name": nazwa_elementu(galaz, "branches"),
            "device_type": "FUSE",
            "nastawy": None,
            "strefa": None,
        }
        for galaz in sorted(model.branches, key=lambda g: g.ref_id)
        if isinstance(galaz, FuseBranch)
    )
    wejscie = CoordinationInput(
        ocena_max=ocena_max,
        ocena_min=ocena_min,
        pary=pary,
        odmowy_par=odmowy_par,
        prady_robocze=prady_robocze,
        prady_punktow_max=_prady_punktow(bieg_max),
        prady_punktow_min=_prady_punktow(bieg_min),
        rodzaj_zwarcia_max=rodzaj_max,
        rodzaj_zwarcia_min=rodzaj_min,
        bezpieczniki=bezpieczniki,
        config=config,
        project_id=project_id,
        sc_run_id=str(sc_run_id),
        sc_run_id_min=str(sc_run_id_min),
        pf_run_id=str(pf_run_id) if pf_run_id else None,
    )
    return OvercurrentCoordinationAnalyzer(config=config).analyze(wejscie)


__all__ = ["BiegNiemiarodajnyError", "OdmowaKoordynacji", "koordynacja_z_biegow"]
