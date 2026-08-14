"""Testy modelu rodzin rozdzielnic SN/RMU (etap S1 dyspozycji 2026-08-14).

Kazda regula ma pare czysty/czerwony; zapadki polityki danych pilnuja
deklaracji dokumentu BINDING (KLASA par. 4: deklaracja bez testu = falszywa
pewnosc).
"""

from __future__ import annotations

import pytest
from network_model.catalog import switchgear_families as sf
from network_model.catalog.bay_templates import BayDeviceTemplate

# ---------------------------------------------------------------------------
# Zapadki polityki danych (zero fabrykacji)
# ---------------------------------------------------------------------------


def test_kazda_rodzina_ma_proweniencje_i_architekture() -> None:
    for family in sf.SWITCHGEAR_FAMILIES:
        assert family.source_reference.strip(), family.id
        assert isinstance(family.architecture, sf.SwitchgearArchitecture), family.id


def test_rodzina_potwierdzona_ma_komplet_parametrow_klasowych() -> None:
    for family in sf.SWITCHGEAR_FAMILIES:
        if not family.parametry_potwierdzone:
            continue
        assert family.rated_voltages_kv and min(family.rated_voltages_kv) > 0, family.id
        assert family.rated_busbar_currents_a and min(family.rated_busbar_currents_a) > 0, family.id
        assert family.short_circuit_ik_ka > 0 and family.short_circuit_tk_s > 0, family.id


def test_wszystkie_rodziny_transzy_potwierdzone_karta_katalogowa() -> None:
    # Dyspozycja wlasciciela 2026-08-14 („szukaj w internecie i implementuj
    # karty katalogowe"): RELF 2S i RXD dostaly karty (zpue.pl / elektro.info,
    # odczyt 2026-08-14) — caly zbior transzy jest potwierdzony i oferowany.
    assert all(f.parametry_potwierdzone for f in sf.SWITCHGEAR_FAMILIES)
    assert {f.id for f in sf.rodziny_oferowane()} == {f.id for f in sf.SWITCHGEAR_FAMILIES}


def test_rodzina_niepotwierdzona_nie_jest_oferowana_w_konfiguratorze(monkeypatch) -> None:
    # Mechanizm zapadki przypiety na rodzinie SYNTETYCZNEJ (KLASA, nie stan
    # zbioru): rodzina bez karty istnieje w katalogu, ale konfigurator jej
    # nie oferuje, a walidator odmawia twardym bledem.
    widmo = sf.SwitchgearFamily(
        id="test_widmo_bez_karty",
        manufacturer="Producent testowy",
        name="Widmo",
        architecture=sf.SwitchgearArchitecture.MODULAR_AIS,
        technology="",
        rated_voltages_kv=(),
        rated_busbar_currents_a=(),
        short_circuit_ik_ka=0.0,
        short_circuit_tk_s=0.0,
        arc_classification="",
        source_reference="portfolio bez karty katalogowej (fikstura testowa)",
        parametry_potwierdzone=False,
    )
    monkeypatch.setattr(sf, "SWITCHGEAR_FAMILIES", sf.SWITCHGEAR_FAMILIES + (widmo,))
    monkeypatch.setitem(sf._FAMILIES_BY_ID, widmo.id, widmo)

    jednostka_widma = sf.CatalogFunctionalUnit(
        id="test_widmo_jednostka",
        family_id=widmo.id,
        catalog_code="W1",
        name="Jednostka widma",
        role=sf.FunctionalRole.RING,
        components=(sf.ComponentSpec(kind="LBS", status=sf.ComponentStatus.FABRYCZNY, position=0),),
        rated_current_a=630,
        width_mm=500,
    )
    monkeypatch.setitem(sf._UNITS_BY_ID, jednostka_widma.id, jednostka_widma)

    assert widmo.id not in {f.id for f in sf.rodziny_oferowane()}
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError):
        sf.family_supports_voltage(widmo.id, 15.0)
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="nie ma potwierdzonych"):
        sf.family_supports_unit(widmo.id, jednostka_widma.id)


def test_producent_zpue_nie_jest_jednym_wpisem() -> None:
    # Dyspozycja pkt 2: „ZPUE nie moze byc jednym wpisem".
    assert len(sf.rodziny_producenta("ZPUE")) >= 6


def test_slownik_rodzajow_elementow_jest_nadzbiorem_bay_templates() -> None:
    # REUZYCIE, nie duplikacja: kompozycje jednostek i BayTemplate mowia tym
    # samym slownikiem rodzajow aparatow (jeden model dla ENM i SLD).
    kinds_bay = set(BayDeviceTemplate.model_fields["kind"].annotation.__args__)
    assert kinds_bay <= sf.KANONICZNE_RODZAJE


# ---------------------------------------------------------------------------
# Spojnosc referencji (dwustronna)
# ---------------------------------------------------------------------------


def test_kazda_jednostka_wskazuje_istniejaca_rodzine_potwierdzona() -> None:
    for unit in sf.CATALOG_FUNCTIONAL_UNITS:
        family = sf.get_family(unit.family_id)
        assert family.parametry_potwierdzone, unit.id
        assert unit.rated_current_a <= max(family.rated_busbar_currents_a), unit.id


def test_kazda_rodzina_rmu_ma_konfiguracje_fabryczna_albo_zadnych_jednostek() -> None:
    # RMU != zbior luznych szaf: jesli rodzina RMU ma jednostki w katalogu,
    # musi miec tez co najmniej jeden blok fabryczny.
    for family in sf.SWITCHGEAR_FAMILIES:
        if family.architecture not in (
            sf.SwitchgearArchitecture.COMPACT_RMU,
            sf.SwitchgearArchitecture.BLOCK_RMU,
        ):
            continue
        jednostki = sf.jednostki_rodziny(family.id) if family.parametry_potwierdzone else ()
        if jednostki:
            assert sf.konfiguracje_rodziny(family.id), family.id


def test_kazda_konfiguracja_fabryczna_sklada_sie_z_jednostek_wlasnej_rodziny() -> None:
    for config in sf.FACTORY_CONFIGURATIONS:
        sf.configuration_supports_family(config.id)


def test_jednostka_transformatorowa_niesie_pelny_tor() -> None:
    # Dyspozycja pkt 5/7: pole TR to caly tor funkcjonalny, nie BUS-aparat-TR.
    for unit in sf.CATALOG_FUNCTIONAL_UNITS:
        if unit.role is not sf.FunctionalRole.TRANSFORMER:
            continue
        kinds = {c.kind for c in unit.elementy_fabryczne()}
        assert "ES" in kinds, unit.id
        assert "CABLE_HEAD" in kinds, unit.id
        assert "TRANSFORMER_DEVICE" in kinds, unit.id
        assert ("FUSE" in kinds) or ("CB" in kinds), unit.id


# ---------------------------------------------------------------------------
# Walidator zgodnosci — twarde bledy (para czysty/czerwony)
# ---------------------------------------------------------------------------


def test_family_supports_unit_czysto_dla_wlasnej_jednostki() -> None:
    sf.family_supports_unit("zpue_rotoblok", "zpue_rotoblok_rl")


def test_family_supports_unit_odrzuca_jednostke_obcej_rodziny() -> None:
    # Fikcyjne pole „rodzina A + szafa B": jednostka SafeRing w Rotobloku.
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="nie przewiduje"):
        sf.family_supports_unit("zpue_rotoblok", "abb_safering_c")


def test_family_supports_voltage_para() -> None:
    sf.family_supports_voltage("zpue_rotoblok", 24.0)
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="nie obsluguje napiecia"):
        sf.family_supports_voltage("zpue_tpm_air", 36.0)


def test_family_supports_current_para() -> None:
    sf.family_supports_current("zpue_relf", 2500)
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="nie obsluguje pradu"):
        sf.family_supports_current("zpue_tpm_air", 1250)


def test_family_supports_short_circuit_para() -> None:
    sf.family_supports_short_circuit("abb_unisec", 25.0)
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="zwarciow"):
        sf.family_supports_short_circuit("zpue_tpm_air", 25.0)


def test_unit_supports_component_para() -> None:
    assert sf.unit_supports_component("zpue_rotoblok_rl", "LBS") is sf.ComponentStatus.FABRYCZNY
    assert (
        sf.unit_supports_component("zpue_rotoblok_rl", "SURGE_ARRESTER") is sf.ComponentStatus.OPCJA
    )
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError, match="nie przewiduje elementu"):
        sf.unit_supports_component("zpue_rotoblok_rl", "CB")


def test_nieznana_rodzina_i_jednostka_to_jawny_blad() -> None:
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError):
        sf.get_family("nie_ma_takiej")
    with pytest.raises(sf.NiezgodnoscKonfiguracjiError):
        sf.get_unit("nie_ma_takiej")


def test_element_spoza_kanonicznego_slownika_nie_przechodzi_konstrukcji() -> None:
    with pytest.raises(ValueError, match="spoza kanonicznego slownika"):
        sf.ComponentSpec(kind="WIDGET", status=sf.ComponentStatus.FABRYCZNY, position=0)  # type: ignore[arg-type]
