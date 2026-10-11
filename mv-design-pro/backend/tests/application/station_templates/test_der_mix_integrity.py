"""Regresje KSR: skład PV/BESS musi być spójny od szablonu po zastosowanie."""

from __future__ import annotations

import pytest

from application.station_templates import get_template, list_templates
from application.station_templates.apply import TemplateApplyError, apply_template_to_case
from application.station_templates.schema import (
    TemplateCategory,
    _wymagana_moc_der_domyslna_kva,
    rozstrzygnij_sklad_der,
)


_HYBRYDY = tuple(
    template for template in list_templates()
    if template.category == TemplateCategory.HYBRYDOWA
)


@pytest.mark.parametrize("template", _HYBRYDY, ids=lambda t: t.id)
def test_hybryda_zachowuje_deklarowane_liczby_pv_i_bess(template) -> None:
    mix = rozstrzygnij_sklad_der(template)
    assert len(mix) == template.schema.der_total_count.default
    for spec in template.schema.der_options:
        assert sum(element.kind == spec.kind for element in mix) == spec.default_count
    assert _wymagana_moc_der_domyslna_kva(template) is not None


def test_zmiana_skladu_hybrydy_nie_zgaduje_proporcji() -> None:
    template = get_template("tpl_hybrid_pv2_bess1")
    assert template is not None
    mix = rozstrzygnij_sklad_der(
        template,
        {"der_PV_count": 2, "der_BESS_count": 1, "der_total_count": 3},
    )
    assert [element.kind for element in mix] == ["PV", "PV", "BESS"]


def test_niezgodna_suma_hybrydy_jest_bledem_a_nie_zmiana_technologii() -> None:
    template = get_template("tpl_hybrid_pv2_bess1")
    assert template is not None
    with pytest.raises(ValueError, match="Suma liczby jednostek"):
        rozstrzygnij_sklad_der(template, {"der_total_count": 3})


def test_niezgodny_sklad_odrzucony_przed_modyfikacja_enm() -> None:
    template = get_template("tpl_hybrid_pv2_bess1")
    assert template is not None
    with pytest.raises(TemplateApplyError) as exc:
        apply_template_to_case(
            template=template,
            klucz_twin="test-der-mix-bez-modelu",
            target_segment_id="odcinek-nieistniejacy",
            params_override={"der_total_count": 2},
        )
    assert exc.value.code == "template.der_mix_invalid"


def test_podglad_api_uzywa_jawnego_skladu(app_client) -> None:
    response = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/preview",
        json={"params_override": {}},
    )
    assert response.status_code == 200, response.text
    cfg = response.json()["effective_config"]
    assert cfg["der_total_count"] == 5
    assert {item["kind"]: item["expected_count_per_kind"] for item in cfg["der_mix"]} == {
        "PV": 4,
        "BESS": 1,
    }


def test_podglad_api_odrzuca_niejawny_podzial_modulow(app_client) -> None:
    response = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/preview",
        json={"params_override": {"der_total_count": 3}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "template.der_mix_invalid"
