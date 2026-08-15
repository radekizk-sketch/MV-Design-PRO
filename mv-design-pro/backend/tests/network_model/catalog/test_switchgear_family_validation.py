"""Walidator zgodności rodziny rozdzielnicy — twarde błędy, pary czysty/czerwony.

POCHODZENIE TESTÓW. To są testy etapu S1 dyspozycji 2026-08-14 przepięte na
KANON PAKIETU (`network_model/catalog/switchgear/`) w ramach karty
SCALENIE-KANONU-ROZDZIELNIC: równoległy moduł `switchgear_families.py` został
wtopiony i usunięty, więc intencje jego testów mieszkają tutaj, na jednym
kanonie rodzin. Zachowane intencje: zapadki polityki danych, dwustronna
spójność referencji, para czysty/czerwony na każdą regułę, pełny tor pola
transformatorowego.
"""

from __future__ import annotations

import pytest
from network_model.catalog.switchgear import (
    ABB__SAFERING,
    SwitchgearFamily,
    list_offered_switchgear_families,
    list_switchgear_solution_templates_for_manufacturer,
)
from network_model.catalog.switchgear import family_validation as fv
from network_model.catalog.switchgear.errors import NiezgodnoscKonfiguracjiError

# ---------------------------------------------------------------------------
# Zapadka polityki danych (zero fabrykacji) na rodzinie SYNTETYCZNEJ
# ---------------------------------------------------------------------------


@pytest.fixture()
def rodzina_widmo(monkeypatch) -> SwitchgearFamily:
    """Rodzina bez karty katalogowej wstrzyknięta do rejestru.

    Mechanizm zapadki przypięty na rodzinie SYNTETYCZNEJ (KLASA, nie stan
    zbioru): niezależnie od tego, ile rodzin rejestru ma dziś potwierdzone
    dane, rodzina bez karty NIE jest oferowana, a walidator odmawia twardym
    błędem.
    """
    widmo = SwitchgearFamily(
        switchgear_family_ref="TEST__WIDMO_BEZ_KARTY",
        manufacturer_ref="TEST_PRODUCENT",
        family_name="Widmo",
        network_voltages_kv=[],
        um_classes_kv=[],
        rated_current_options=[],
        short_time_current_options=[],
        construction_type="RMU",
        allowed_bay_kinds=["liniowe_odplywowe"],
        allowed_apparatus_kinds=["switch_disconnector"],
        status="requires_catalog",
        source_refs=["portfolio bez karty katalogowej (fikstura testowa)"],
        notes_pl="Fikstura testowa: rodzina requires_catalog.",
    )
    monkeypatch.setitem(fv.SWITCHGEAR_FAMILY_REGISTRY, widmo.switchgear_family_ref, widmo)
    return widmo


def test_rodzina_bez_karty_nie_jest_oferowana_w_konfiguratorze(rodzina_widmo) -> None:
    oferowane = {f.switchgear_family_ref for f in list_offered_switchgear_families()}
    assert rodzina_widmo.switchgear_family_ref not in oferowane


def test_rodzina_bez_karty_odbija_kazde_sprawdzenie_walidatora(rodzina_widmo) -> None:
    """Zapadka jest na WSPÓLNYM predykacie, nie na jednym sprawdzeniu — żadne
    wejście boczne nie przepuszcza rodziny bez karty."""
    ref = rodzina_widmo.switchgear_family_ref
    for wywolanie in (
        lambda: fv.family_supports_bay_kind(ref, "liniowe_odplywowe"),
        lambda: fv.family_supports_apparatus(ref, "switch_disconnector"),
        lambda: fv.family_supports_voltage(ref, 15.0),
        lambda: fv.family_supports_current(ref, 630),
        lambda: fv.family_supports_short_circuit(ref, 16.0),
        lambda: fv.wymagaj_rodziny_oferowanej(ref),
    ):
        with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie ma potwierdzonych"):
            wywolanie()


def test_rodzina_bez_zadeklarowanej_konstrukcji_nie_ma_toru(monkeypatch) -> None:
    """Rodzina potwierdzona źródłem, ale bez konstrukcji, nie wie, którym
    torem prowadzić projektanta — twardy błąd zamiast domyślnego toru."""
    bez_konstrukcji = SwitchgearFamily(
        switchgear_family_ref="TEST__BEZ_KONSTRUKCJI",
        manufacturer_ref="TEST_PRODUCENT",
        family_name="Bez konstrukcji",
        network_voltages_kv=[15.0],
        um_classes_kv=[17.5],
        rated_current_options=[630],
        short_time_current_options=[16],
        status="repo_verified",
        source_refs=["https://przyklad.test/karta"],
        notes_pl="Fikstura testowa: repo_verified bez construction_type.",
    )
    monkeypatch.setitem(
        fv.SWITCHGEAR_FAMILY_REGISTRY,
        bez_konstrukcji.switchgear_family_ref,
        bez_konstrukcji,
    )
    monkeypatch.setattr(
        fv,
        "list_offered_switchgear_families",
        lambda: [*list_offered_switchgear_families(), bez_konstrukcji],
    )
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="toru konfiguracji"):
        fv.wymagaj_rodziny_oferowanej(bez_konstrukcji.switchgear_family_ref)


# ---------------------------------------------------------------------------
# Walidator zgodności — pary czysty/czerwony
# ---------------------------------------------------------------------------


def test_nieznana_rodzina_to_jawny_blad() -> None:
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie istnieje w katalogu"):
        fv.get_family_or_raise("NIE_MA_TAKIEJ")


def test_family_supports_bay_kind_para() -> None:
    fv.family_supports_bay_kind("ZPUE_WLOSZCZOWA__ROTOBLOK", "transformatorowe")
    # SafeRing (RMU) nie ma w katalogu pola pomiarowego.
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie przewiduje pola"):
        fv.family_supports_bay_kind("ABB__SAFERING", "pomiarowe")


def test_family_supports_apparatus_para() -> None:
    fv.family_supports_apparatus("ZPUE_WLOSZCZOWA__ROTOBLOK", "circuit_breaker")
    # Rodziny RMU nie mają w słowniku przekładników prądowych.
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie dopuszcza aparatu"):
        fv.family_supports_apparatus("ABB__SAFERING", "current_transformer")


def test_family_supports_voltage_para() -> None:
    fv.family_supports_voltage("ZPUE_WLOSZCZOWA__ROTOBLOK", 20.0)
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie obsluguje napiecia"):
        fv.family_supports_voltage("ZPUE_WLOSZCZOWA__TPM_AIR", 36.0)


def test_family_supports_current_para() -> None:
    fv.family_supports_current("ZPUE_WLOSZCZOWA__RELF", 2500)
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie obsluguje pradu szyn"):
        fv.family_supports_current("ZPUE_WLOSZCZOWA__TPM_AIR", 1250)


def test_family_supports_short_circuit_para() -> None:
    fv.family_supports_short_circuit("ZPUE_WLOSZCZOWA__RXD", 25.0)
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="pradu zwarciowego"):
        fv.family_supports_short_circuit("ZPUE_WLOSZCZOWA__ROTOBLOK_AIR", 25.0)


def _szablon(family_ref: str, bay_kind: str):
    manufacturer = fv.get_family_or_raise(family_ref).manufacturer_ref
    return next(
        template
        for template in list_switchgear_solution_templates_for_manufacturer(manufacturer)
        if template.switchgear_family_ref == family_ref and template.bay_kind == bay_kind
    )


def test_family_supports_bay_template_para() -> None:
    rotoblok = _szablon("ZPUE_WLOSZCZOWA__ROTOBLOK", "transformatorowe")
    fv.family_supports_bay_template("ZPUE_WLOSZCZOWA__ROTOBLOK", rotoblok)

    # Fikcyjne pole „rodzina A + celka B": pole SafeRing w Rotobloku.
    safering = _szablon("ABB__SAFERING", "transformatorowe")
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie przewiduje takiej"):
        fv.family_supports_bay_template("ZPUE_WLOSZCZOWA__ROTOBLOK", safering)


def test_bay_template_supports_apparatus_para() -> None:
    szablon = _szablon("ZPUE_WLOSZCZOWA__ROTOBLOK", "transformatorowe")
    assert fv.bay_template_supports_apparatus(szablon, "circuit_breaker") == "FABRYCZNY"
    # Aparat spoza listy pola = twardy błąd, nie ciche „nie ma".
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie przewiduje elementu"):
        fv.bay_template_supports_apparatus(szablon, "surge_arrester")


def test_status_opcja_jest_odczytywany_a_nie_zgadywany() -> None:
    """Para dla statusu OPCJA: aparat oznaczony w kanonie jako opcjonalny
    wychodzi z walidatora jako OPCJA, a nie jako wyposażenie fabryczne.

    Kanoniczne szablony nie deklarują dziś ŻADNEGO aparatu opcjonalnego, więc
    tor OPCJA ćwiczymy na szablonie z opcjonalnym ogranicznikiem przepięć —
    mechanizm jest realny (ten sam model i ta sama materializacja), syntetyczna
    jest wyłącznie zawartość karty.
    """
    from network_model.catalog.bay_templates import BAY_TEMPLATE_LINE_OUT, BayDeviceTemplate
    from network_model.catalog.switchgear.apparatus_vocabulary import (
        instancje_aparatow_z_szablonu,
    )

    baza = BAY_TEMPLATE_LINE_OUT.model_copy(
        update={
            "devices": [
                *BAY_TEMPLATE_LINE_OUT.devices,
                BayDeviceTemplate(
                    kind="SURGE_ARRESTER",
                    designation_q="F2",
                    position=6,
                    placement="OFF_PATH",
                    optional=True,
                ),
            ]
        }
    )
    szablon = _szablon("ZPUE_WLOSZCZOWA__ROTOBLOK", "liniowe_odplywowe").model_copy(
        update={
            "device_instances": instancje_aparatow_z_szablonu(baza, "TEST__OPCJA"),
        }
    )
    assert fv.bay_template_supports_apparatus(szablon, "surge_arrester") == "OPCJA"
    assert fv.bay_template_supports_apparatus(szablon, "circuit_breaker") == "FABRYCZNY"


def test_aparat_spoza_kanonicznego_slownika_nie_przechodzi_konstrukcji() -> None:
    from network_model.catalog.switchgear import BayDeviceInstanceTemplate
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        BayDeviceInstanceTemplate(
            device_template_ref="TEST__WIDGET",
            apparatus_kind="WIDGET",  # type: ignore[arg-type]
            label="X1",
            status_wyposazenia="FABRYCZNY",
        )


def test_status_wyposazenia_jest_obowiazkowy() -> None:
    """Katalog rozstrzyga, czy aparat jest fabryczny czy opcjonalny — brak
    wartości domyślnej, bo domyślna byłaby zgadywaniem karty producenta."""
    from network_model.catalog.switchgear import BayDeviceInstanceTemplate
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        BayDeviceInstanceTemplate(
            device_template_ref="TEST__BEZ_STATUSU",
            apparatus_kind="circuit_breaker",
            label="Q1",
        )


# ---------------------------------------------------------------------------
# Spójność dwustronna szablonów rodzin
# ---------------------------------------------------------------------------


def test_kazde_pole_wskazuje_istniejaca_rodzine_oferowana() -> None:
    oferowane = {f.switchgear_family_ref for f in list_offered_switchgear_families()}
    for template in list_switchgear_solution_templates_for_manufacturer(None):
        assert template.switchgear_family_ref in oferowane, template.template_ref
        fv.family_supports_bay_template(template.switchgear_family_ref, template)


def test_rodzina_bez_karty_nie_produkuje_pol_katalogowych(rodzina_widmo) -> None:
    """Rodzina requires_catalog nie wchodzi do ścieżki szablonów — inaczej
    wyprodukowałaby pola opisane jako zweryfikowane bez pokrycia w karcie."""
    refs = {
        t.switchgear_family_ref for t in list_switchgear_solution_templates_for_manufacturer(None)
    }
    assert rodzina_widmo.switchgear_family_ref not in refs
    assert "ABB__UNISEC" not in refs


def test_pole_transformatorowe_niesie_pelny_tor() -> None:
    """Pole TR to cały tor funkcjonalny, nie para szyna-aparat.

    Pin przeniesiony z etapu S1 na szablony pakietu: uziemnik, transformator
    pola oraz aparat zabezpieczający (wyłącznik albo rozłącznik z
    bezpiecznikami) MUSZĄ być w wyposażeniu każdego katalogowego pola
    transformatorowego.
    """
    sprawdzone = 0
    for template in list_switchgear_solution_templates_for_manufacturer(None):
        if template.bay_kind != "transformatorowe":
            continue
        aparaty = {d.apparatus_kind for d in template.device_instances}
        assert "earthing_switch" in aparaty, template.template_ref
        assert "transformer" in aparaty, template.template_ref
        assert "circuit_breaker" in aparaty or "fuse_set" in aparaty, template.template_ref
        sprawdzone += 1
    assert sprawdzone > 0


def test_wyposazenie_pola_jest_lustrem_kanonicznego_szablonu() -> None:
    """Dwie listy w jednym obiekcie = dwie prawdy. Instancje aparatów MUSZĄ
    odpowiadać aparatom szablonu bazowego co do sztuki i kolejności."""
    from network_model.catalog.switchgear.apparatus_vocabulary import (
        APPARATUS_KIND_FOR_TEMPLATE_KIND,
    )

    for template in list_switchgear_solution_templates_for_manufacturer(None):
        oczekiwane = [
            APPARATUS_KIND_FOR_TEMPLATE_KIND[device.kind]
            for device in template.base_template.devices
        ]
        assert [
            d.apparatus_kind for d in template.device_instances
        ] == oczekiwane, template.template_ref


def test_pola_rodziny_rmu_nie_dostaja_przekladnikow_spoza_slownika() -> None:
    """Filtr słownika rodziny działa NA WYPOSAŻENIU, nie tylko na szablonie
    bazowym — inaczej pole miałoby aparat, którego rodzina nie zna."""
    for template in list_switchgear_solution_templates_for_manufacturer("ABB"):
        if template.switchgear_family_ref != ABB__SAFERING.switchgear_family_ref:
            continue
        aparaty = {d.apparatus_kind for d in template.device_instances}
        assert "current_transformer" not in aparaty, template.template_ref
        assert "voltage_transformer" not in aparaty, template.template_ref
