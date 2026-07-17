"""Reference Engine V1 — rejestr pakietów + egzekwowanie jednego źródła.

REFERENCE_ENGINE_SPEC_V1.md §8/§12 (V12K-060): kanoniczne szablony kreatora
(`bay_templates.py`) i szablony rodzin (`canonical_fallback`) MUSZĄ spełniać
profile referencyjne — kreator nie może definiować pól poza referencją
(pkt 10/12 dyrektywy właściciela 2026-07-17). Wyrocznie gryzą: sabotaż
szablonu ⇒ czerwono.
"""

from enm.models import Bay, BayPrimaryDevice, EnergyNetworkModel, ENMHeader, Substation
from network_model.catalog.bay_templates import BayTemplate, list_bay_templates
from network_model.catalog.switchgear import (
    SWITCHGEAR_FAMILY_REGISTRY,
    list_switchgear_solution_templates_for_manufacturer,
)
from network_model.catalog.switchgear.apparatus_vocabulary import (
    FAMILY_APPARATUS_FOR_TEMPLATE_KIND,
)
from reference_engine import (
    FIELD_PROFILE_PACK_ID,
    FIELD_PROFILE_REGISTRY,
    evaluate_enm,
    get_reference_pack,
    list_reference_packs,
    profile_id_for_bay,
)

EXPECTED_PACK_IDS = [
    "abb_safering",
    "abb_unigear",
    "elektrometal_e2alpha",
    "iec60617",
    "iec62271",
    "osd_enea",
    "schneider_sm6",
    "siemens_8djh",
]

# Mapowanie kindów szablonu kreatora → kindy ENM (DS_BUS/DS_LINE = odłącznik).
_TEMPLATE_KIND_TO_ENM = {"DS_BUS": "DS", "DS_LINE": "DS"}


def _bay_from_template(template: BayTemplate, ref_id: str, substation_ref: str) -> Bay:
    devices = [
        BayPrimaryDevice(
            device_ref=f"{ref_id}/{device.designation_q}/{index}",
            symbol_ref=device.designation_q,
            kind=_TEMPLATE_KIND_TO_ENM.get(device.kind, device.kind),
            placement=device.placement,
        )
        for index, device in enumerate(template.devices)
    ]
    return Bay(
        ref_id=ref_id,
        name=template.name,
        bay_role=template.bay_role,
        substation_ref=substation_ref,
        bus_ref="bus/sn",
        primary_devices=devices,
    )


class TestPackRegistry:
    def test_registry_loads_all_packs(self) -> None:
        packs = list_reference_packs()
        assert [p.pack_id for p in packs] == EXPECTED_PACK_IDS
        for pack in packs:
            assert pack.version, f"pakiet {pack.pack_id} bez wersji (pkt 11 dyrektywy)"
            assert pack.source_document_refs, (
                f"pakiet {pack.pack_id} bez źródeł — narusza regułę "
                "„nie fabrykuj danych producenta"
            )

    def test_manufacturer_packs_bind_catalog_families(self) -> None:
        for pack in list_reference_packs():
            if pack.kind == "manufacturer":
                assert pack.switchgear_family_ref in SWITCHGEAR_FAMILY_REGISTRY
            else:
                assert pack.switchgear_family_ref is None

    def test_field_profiles_live_only_in_iec62271(self) -> None:
        for pack in list_reference_packs():
            if pack.pack_id == FIELD_PROFILE_PACK_ID:
                assert pack.field_profiles
            else:
                assert not pack.field_profiles

    def test_symbol_map_covers_all_apparatus_kinds(self) -> None:
        # Słownik symboli IEC 60617 pokrywa pełny kanon BayPrimaryDevice.kind.
        pack = get_reference_pack("iec60617")
        kinds = {entry.kind for entry in pack.symbol_map}
        assert kinds == {
            "CB",
            "LOAD_SWITCH",
            "DS",
            "ES",
            "CT",
            "VT",
            "CABLE_HEAD",
            "TRANSFORMER_DEVICE",
            "FUSE",
            "SURGE_ARRESTER",
            "GENERATOR_PV",
            "GENERATOR_BESS",
            "GENERATOR_FW",
            "PCS",
            "BATTERY",
        }

    def test_profile_mapping_covers_all_bay_roles(self) -> None:
        for role in ("IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"):
            for station_type in ("gpz", "mv_lv"):
                profile_id = profile_id_for_bay(role, station_type)
                assert profile_id in FIELD_PROFILE_REGISTRY


class TestCreatorTemplatesComplyWithProfiles:
    """Kreator = implementacja referencji (spec §8 pkt 3): zero failów."""

    def _evaluate_templates(self, station_type: str) -> list[str]:
        station = Substation(
            ref_id="st/x",
            name="Stacja testowa",
            station_type=station_type,  # type: ignore[arg-type]
            bus_refs=["bus/sn"],
        )
        bays = [
            _bay_from_template(template, f"bay/{template.template_id}", "st/x")
            for template in list_bay_templates()
        ]
        enm = EnergyNetworkModel(
            header=ENMHeader(name="Szablony kreatora"),
            substations=[station],
            bays=bays,
        )
        report = evaluate_enm(enm, pack_ids=[FIELD_PROFILE_PACK_ID])
        return [
            f"{c.element_ref}:{c.rule_code}" for c in report.packs[0].checks if c.status == "fail"
        ]

    def test_bay_templates_comply_with_profiles_gpz(self) -> None:
        # Kanoniczne szablony to technologia wyłącznikowa (GPZ).
        assert self._evaluate_templates("gpz") == []

    def test_family_solution_templates_comply_with_family_vocabulary(self) -> None:
        # Pkt 2/4 dyrektywy: szablon rodziny nie zawiera aparatu spoza
        # słownika rodziny (filtr _family_filtered_base).
        for template in list_switchgear_solution_templates_for_manufacturer(None):
            assert template.switchgear_family_ref is not None
            family = SWITCHGEAR_FAMILY_REGISTRY[template.switchgear_family_ref]
            allowed = set(family.allowed_apparatus_kinds)
            if not allowed:
                continue
            for device in template.base_template.devices:
                mapped = FAMILY_APPARATUS_FOR_TEMPLATE_KIND.get(device.kind)
                assert mapped is None or mapped in allowed, (
                    f"{template.template_ref}: aparat {device.kind} spoza "
                    f"słownika rodziny {family.family_name}"
                )

    def test_sabotaged_template_bites(self) -> None:
        # NEGATYW-SABOTAŻ: szablon liniowy z wstrzykniętym transformatorem
        # (aparat zakazany) MUSI oblać profil — wyrocznia gryzie.
        from network_model.catalog.bay_templates import BAY_TEMPLATE_LINE_OUT

        bay = _bay_from_template(BAY_TEMPLATE_LINE_OUT, "bay/sabotaz", "st/x")
        bay.primary_devices.append(
            BayPrimaryDevice(
                device_ref="bay/sabotaz/tr",
                symbol_ref="TR",
                kind="TRANSFORMER_DEVICE",
                placement="DOWNSTREAM",
            )
        )
        station = Substation(ref_id="st/x", name="Stacja", station_type="gpz", bus_refs=["bus/sn"])
        enm = EnergyNetworkModel(
            header=ENMHeader(name="Sabotaż"), substations=[station], bays=[bay]
        )
        report = evaluate_enm(enm, pack_ids=[FIELD_PROFILE_PACK_ID])
        fails = [c.rule_code for c in report.packs[0].checks if c.status == "fail"]
        assert "profile.forbidden" in fails


class TestFamilyTemplatesMatchCells:
    """Kreator ↔ celki katalogowe (pkt 2/4 dyrektywy): pola liniowe i
    transformatorowe szablonów rodzin MUSZĄ odpowiadać którejś konfiguracji
    celki z katalogu producenta (family.cell_match). Dane celek: research
    2026-07-17 z oficjalnych katalogów (cytowania w pack.json)."""

    _TEMPLATE_KIND = {"DS_BUS": "DS", "DS_LINE": "DS"}
    _CHECKED_BAY_KINDS = ("liniowe_doplywowe", "liniowe_odplywowe", "transformatorowe")

    def test_line_and_transformer_family_templates_match_a_cell(self) -> None:
        from reference_engine.compliance import _cell_match_check_for_bay
        from reference_engine.registry import family_for_pack

        packs_by_family = {
            p.switchgear_family_ref: p for p in list_reference_packs() if p.kind == "manufacturer"
        }
        checked = 0
        for template in list_switchgear_solution_templates_for_manufacturer(None):
            pack = packs_by_family.get(template.switchgear_family_ref)
            if pack is None or not pack.cell_configurations:
                continue
            if template.bay_kind not in self._CHECKED_BAY_KINDS:
                continue
            family = family_for_pack(pack)
            assert family is not None
            bay = Bay(
                ref_id=f"bay/{template.template_ref}",
                name=template.template_ref,
                bay_role=template.base_template.bay_role,
                substation_ref="st/x",
                bus_ref="bus/sn",
                primary_devices=[
                    BayPrimaryDevice(
                        device_ref=f"d{i}",
                        symbol_ref=device.designation_q,
                        kind=self._TEMPLATE_KIND.get(device.kind, device.kind),
                        placement=device.placement,
                    )
                    for i, device in enumerate(template.base_template.devices)
                ],
            )
            checks = _cell_match_check_for_bay(bay, pack, family)
            assert len(checks) == 1
            assert checks[0].status == "pass", f"{template.template_ref}: {checks[0].message_pl}"
            checked += 1
        # 4 rodziny z celkami × 3 typy pól = 12 szablonów.
        assert checked == 12

    def test_manufacturer_packs_with_cells_have_citations(self) -> None:
        for pack in list_reference_packs():
            for cell in pack.cell_configurations:
                assert cell.source_pl.strip(), f"{pack.pack_id}/{cell.cell_code}"

    def test_e2alpha_honestly_carries_no_cells(self) -> None:
        # Producent nie publikuje składu per typ pola (research 2026-07-17,
        # karty K-1.2.2/K-11.1.1/K-0.2.11) — pakiet ŚWIADOMIE bez celek.
        pack = get_reference_pack("elektrometal_e2alpha")
        assert pack.cell_configurations == []
        assert "NIE publikuje składu aparatowego" in (pack.notes_pl or "")
