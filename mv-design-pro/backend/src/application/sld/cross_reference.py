"""
SLD Cross-Reference Builder — powiązanie elementów raportu z SLD.

PR-06: Każdy element w raporcie (PDF/DOCX) może zawierać odniesienie do
odpowiedniego symbolu na schemacie SLD, umożliwiając nawigację zwrotną.

Czysta funkcja: ENM + SldDiagram → CrossReferenceTable (deterministyczna).
"""

from __future__ import annotations

from dataclasses import dataclass

from domain.sld import SldDiagram
from enm.models import EnergyNetworkModel


@dataclass(frozen=True)
class CrossReference:
    """Pojedyncze powiązanie: element raportu → symbol SLD → element ENM."""

    enm_ref_id: str
    enm_element_type: str
    enm_element_name: str
    sld_symbol_id: str | None
    wizard_step_hint: str
    report_section: str


@dataclass(frozen=True)
class CrossReferenceTable:
    """Tabela powiązań raport ↔ SLD ↔ ENM.

    INVARIANT: Ten sam ENM + SldDiagram → identyczna tabela.
    """

    entries: tuple[CrossReference, ...]
    total_elements: int
    mapped_to_sld: int
    coverage_percent: float


def build_cross_reference_table(
    enm: EnergyNetworkModel,
    sld: SldDiagram | None = None,
) -> CrossReferenceTable:
    """
    Zbuduj tabelę powiązań raport ↔ SLD ↔ ENM.

    Dla każdego elementu ENM tworzy wpis CrossReference z:
    - enm_ref_id: identyfikator elementu w ENM
    - sld_symbol_id: ID symbolu na SLD (jeśli SLD dostępny)
    - wizard_step_hint: krok kreatora do nawigacji
    - report_section: sekcja raportu, w której element się pojawia

    Args:
        enm: EnergyNetworkModel — kanoniczny model sieci.
        sld: SldDiagram — opcjonalny schemat SLD (dla mapowania symbolów).

    Returns:
        CrossReferenceTable z pełnym mapowaniem.
    """
    # Zbuduj mapę element_id → sld_symbol_id
    sld_map: dict[str, str] = {}
    if sld:
        for node in sld.nodes:
            sld_map[str(node.node_id)] = str(node.id)
        for branch in sld.branches:
            sld_map[str(branch.branch_id)] = str(branch.id)
        for switch in sld.switches:
            sld_map[str(switch.switch_id)] = str(switch.id)

    entries: list[CrossReference] = []

    # Szyny → sekcja "Topologia"
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=bus.ref_id,
                enm_element_type="bus",
                enm_element_name=bus.name,
                sld_symbol_id=sld_map.get(str(bus.id)),
                wizard_step_hint="K3",
                report_section="Topologia sieci",
            )
        )

    # Źródła → sekcja "Zasilanie"
    for src in sorted(enm.sources, key=lambda s: s.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=src.ref_id,
                enm_element_type="source",
                enm_element_name=src.name,
                sld_symbol_id=sld_map.get(str(src.id)),
                wizard_step_hint="K2",
                report_section="Zasilanie",
            )
        )

    # Gałęzie → sekcja "Linie i kable"
    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=branch.ref_id,
                enm_element_type="branch",
                enm_element_name=branch.name,
                sld_symbol_id=sld_map.get(str(branch.id)),
                wizard_step_hint="K4",
                report_section="Linie i kable",
            )
        )

    # Transformatory → sekcja "Transformatory"
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=trafo.ref_id,
                enm_element_type="transformer",
                enm_element_name=trafo.name,
                sld_symbol_id=sld_map.get(str(trafo.id)),
                wizard_step_hint="K5",
                report_section="Transformatory",
            )
        )

    # Odbiorniki → sekcja "Odbiory"
    for load in sorted(enm.loads, key=lambda load_item: load_item.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=load.ref_id,
                enm_element_type="load",
                enm_element_name=load.name,
                sld_symbol_id=sld_map.get(str(load.id)),
                wizard_step_hint="K6",
                report_section="Odbiory",
            )
        )

    # Generatory → sekcja "Generacja"
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=gen.ref_id,
                enm_element_type="generator",
                enm_element_name=gen.name,
                sld_symbol_id=sld_map.get(str(gen.id)),
                wizard_step_hint="K6",
                report_section="Generacja",
            )
        )

    # Stacje → sekcja "Stacje"
    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=sub.ref_id,
                enm_element_type="substation",
                enm_element_name=sub.name,
                sld_symbol_id=None,  # Substations are not SLD symbols
                wizard_step_hint="K3",
                report_section="Stacje",
            )
        )

    # Magistrale → sekcja "Magistrale"
    for corr in sorted(enm.corridors, key=lambda c: c.ref_id):
        entries.append(
            CrossReference(
                enm_ref_id=corr.ref_id,
                enm_element_type="corridor",
                enm_element_name=corr.name,
                sld_symbol_id=None,  # Corridors are not SLD symbols
                wizard_step_hint="K4",
                report_section="Magistrale",
            )
        )

    total = len(entries)
    mapped = sum(1 for e in entries if e.sld_symbol_id is not None)
    coverage = round((mapped / total * 100) if total > 0 else 0.0, 1)

    return CrossReferenceTable(
        entries=tuple(entries),
        total_elements=total,
        mapped_to_sld=mapped,
        coverage_percent=coverage,
    )
