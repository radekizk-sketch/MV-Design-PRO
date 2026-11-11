"""P1: kontrola właściwego formularza, bez fabrykowania zgody operatora."""
from __future__ import annotations

import pytest

from application.ncrfg_compliance.dossier import plan_dossier


def test_a_without_proof_of_notification_is_conditional() -> None:
    p = plan_dossier("A", operator_id="enea")
    assert not p.formalnie_zaakceptowane
    assert [x.kod for x in p.dokumenty] == ["DI"]
    assert not p.dokumenty[0].wymagane_w_typowej_procedurze
    assert p.luki


def test_a_notification_does_not_force_di() -> None:
    assert plan_dossier(
        "A", operator_id="enea", mikroinstalacja_na_zgloszenie=True,
    ).dokumenty == ()


def test_a_explicit_non_notification_uses_di() -> None:
    p = plan_dossier(
        "A", operator_id="enea", mikroinstalacja_na_zgloszenie=False,
    )
    assert p.dokumenty[0].wymagane_w_typowej_procedurze


@pytest.mark.parametrize("typ", ["B", "C"])
def test_bc_choose_pgmd(typ: str) -> None:
    p = plan_dossier(typ, operator_id="enea")
    assert [x.kod for x in p.dokumenty] == ["PGMD"]
    assert not p.formalnie_zaakceptowane


def test_type_d_permits_limited_only_conditionally() -> None:
    p = plan_dossier("D", operator_id="enea")
    assert [x.kod for x in p.dokumenty] == ["EON", "ION", "FON", "LON"]
    assert not p.dokumenty[-1].wymagane_w_typowej_procedurze
    assert all(x.stan == "BRAK_DOWODU_OPERATORA" for x in p.dokumenty)


def test_other_osd_requires_other_operators_templates() -> None:
    p = plan_dossier("B", operator_id="pge")
    assert any("właściwego OSD" in x for x in p.luki)
