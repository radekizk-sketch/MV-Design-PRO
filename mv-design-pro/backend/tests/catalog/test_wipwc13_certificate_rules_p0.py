"""WiPWC1.3 §5-6, tekst źródłowy strony 8, 13-14 oraz §9/10."""
from __future__ import annotations

import pytest
from application.ncrfg_compliance.wipwc13_certificate_rules import (
    agreguj_zakres_badan,
    zasady_wipwc13,
)


def _state(typ: str, family: str, ability: str) -> str:
    return next(x.status for x in zasady_wipwc13(typ, family).reguly if x.zdolnosc == ability)


@pytest.mark.parametrize("typ", ["A", "B", "C", "D"])
@pytest.mark.parametrize("family,size", [("PPM", 17), ("SYPGM", 15)])
def test_all_type_family_cert_rows(typ: str, family: str, size: int) -> None:
    x = zasady_wipwc13(typ, family)
    assert not x.formalna_zgodnosc
    assert len(x.reguly) == size
    assert len({a.zdolnosc for a in x.reguly}) == size


def test_ppm_c_frt_lfsm_o_fault_current_all_require_certificate() -> None:
    for ability in ("FRT", "LFSM_O", "LFSM_U", "FAST_FAULT_CURRENT", "POST_FAULT_RECOVERY"):
        assert _state("C", "PPM", ability) == "CERT_REQUIRED"


def test_ppm_b_requires_inverter_certificate_and_reactive_field_test() -> None:
    x = agreguj_zakres_badan("B","PPM")
    c = {i["zdolnosc"]:i for i in x["zasady"]}
    assert c["LFSM_O"]["cert"] == "CERT_REQUIRED"
    assert c["REACTIVE_CAPABILITY"]["test"] == "TEST"
    assert c["REACTIVE_CAPABILITY"]["cert"] == "NOT_APPLICABLE"
    assert c["LFSM_O"]["dodatkowy_test_wymagany_gdy_ppc"]["wymaga"]
    assert not x["finalna_zgodnosc"]


def test_site_test_not_replaceable_in_type_c() -> None:
    assert _state("C","PPM","VOLTAGE_CONTROL") == "NO_CERT_SUBSTITUTION"
    assert _state("B","SYPGM","FRT") == "CERT_OPTIONAL"
    assert _state("D","SYPGM","FRT") == "NO_CERT_SUBSTITUTION"


def test_frequency_range_and_rocof_mandatory_all() -> None:
    for fam in ("PPM","SYPGM"):
        for typ in ("A","B","C","D"):
            assert _state(typ,fam,"FREQUENCY_RANGE") == "CERT_REQUIRED"
            assert _state(typ,fam,"ROCOF") == "CERT_REQUIRED"


def test_offshore_does_not_inherit_regular_ppm_without_proof() -> None:
    with pytest.raises(ValueError):
        zasady_wipwc13("C","OFFSHORE_PPM")


def test_all_rows_explicit_no_evidence() -> None:
    a=agreguj_zakres_badan("B","PPM")
    assert all(x["status_wykonania"]=="NIE_OCENIONO" for x in a["zasady"])
