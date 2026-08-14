"""Konfiguracje fabryczne bloków RMU (scalenie kanonu 2026-08-14).

Intencja przeniesiona z etapu S1: RMU NIE jest zbiorem luźnych szaf —
projektant wybiera BLOK fabryczny, a jednostki bloku muszą pochodzić ze
słownika własnej rodziny. Testy pokrywają ILOCZYN CECH, w którym defekt mógłby
się schować: (rodzina RMU × rodzina modułowa) × (jednostka ze słownika ×
jednostka spoza słownika) × (szerokość zadeklarowana × niezadeklarowana).
"""

from __future__ import annotations

import pytest
from network_model.catalog.switchgear import (
    FactoryConfiguration,
    FactoryConfigurationUnit,
    family_supports_factory_configuration,
    get_factory_configuration,
    get_switchgear_family,
    list_factory_configurations,
    list_factory_configurations_for_family,
    list_switchgear_families,
)
from network_model.catalog.switchgear.errors import NiezgodnoscKonfiguracjiError
from pydantic import ValidationError

#: Rodziny o torze BLOK_RMU, dla których blokи fabryczne NIE zostały jeszcze
#: przepisane z karty producenta. Lista jest JAWNYM długiem danych (a nie cichą
#: luką): publiczne źródła tych rodzin nie wymieniają zestawu konfiguracji, a
#: zmyślenie sekwencji byłoby fabrykacją katalogu. Dopisanie bloków dowolnej z
#: nich MUSI zaktualizować tę listę — inaczej test upada.
RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW = {
    "ZPUE_WLOSZCZOWA__TPM",
    "ABB__SAFEPLUS",
    "SCHNEIDER__RM6",
    "SCHNEIDER__RM_AIRSET",
    "SIEMENS__8DJH",
}


def test_rejestr_konfiguracji_jest_deterministyczny() -> None:
    pierwszy = [c.configuration_ref for c in list_factory_configurations()]
    for _ in range(5):
        assert [c.configuration_ref for c in list_factory_configurations()] == pierwszy
    assert pierwszy == sorted(pierwszy)


def test_kazda_konfiguracja_sklada_sie_z_jednostek_wlasnej_rodziny() -> None:
    for configuration in list_factory_configurations():
        family_supports_factory_configuration(configuration)


def test_konfiguracje_naleza_wylacznie_do_rodzin_o_torze_blokowym() -> None:
    for configuration in list_factory_configurations():
        family = get_switchgear_family(configuration.switchgear_family_ref)
        assert family.tor_konfiguracji == "BLOK_RMU", configuration.configuration_ref


def test_rodziny_rmu_bez_transkrybowanych_blokow_sa_jawnie_wypisane() -> None:
    """Dług danych jest WIDOCZNY: rodzina blokowa bez konfiguracji stoi na
    imiennej liście, a nie znika w ciszy."""
    bez_blokow = {
        family.switchgear_family_ref
        for family in list_switchgear_families()
        if family.tor_konfiguracji == "BLOK_RMU"
        and not list_factory_configurations_for_family(family.switchgear_family_ref)
    }
    assert bez_blokow == RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW


def test_rodzina_modulowa_nie_ma_blokow_fabrycznych() -> None:
    for family in list_switchgear_families():
        if family.tor_konfiguracji == "MODULARNY":
            assert not list_factory_configurations_for_family(family.switchgear_family_ref)


def test_tpm_air_ma_bloki_z_karty_producenta() -> None:
    kody = {c.code for c in list_factory_configurations_for_family("ZPUE_WLOSZCZOWA__TPM_AIR")}
    # Zestaw wielopolowy wymieniony na karcie TPM Air (odczyt 2026-08-14).
    assert kody == {
        "LL",
        "LT",
        "LW",
        "LLL",
        "LLT",
        "LLW",
        "LTT",
        "LWW",
        "LLLL",
        "LLLT",
        "LLLW",
        "LLTT",
        "LLWW",
    }
    llt = get_factory_configuration("ZPUE_WLOSZCZOWA__TPM_AIR__LLT")
    assert llt.unit_sequence == "L-L-T"
    assert [u.bay_kind for u in llt.units] == [
        "liniowe_odplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
    ]
    assert llt.units[-1].apparatus_kinds == ["switch_disconnector", "fuse_set"]


def test_safering_ma_bloki_ccf_i_ccv_rozroznione_aparatem() -> None:
    """CCF i CCV różni APARAT jednostki transformatorowej, nie sama funkcja
    pola — model, który zna tylko `bay_kind`, skleiłby dwa różne wyroby."""
    ccf = get_factory_configuration("ABB__SAFERING__CCF")
    ccv = get_factory_configuration("ABB__SAFERING__CCV")
    assert ccf.unit_sequence == "C-C-F"
    assert ccv.unit_sequence == "C-C-V"
    assert [u.bay_kind for u in ccf.units] == [u.bay_kind for u in ccv.units]
    assert ccf.units[-1].apparatus_kinds == ["switch_disconnector", "fuse_set"]
    assert ccv.units[-1].apparatus_kinds == ["circuit_breaker"]


def test_blok_ma_co_najmniej_dwie_jednostki() -> None:
    with pytest.raises(ValidationError):
        FactoryConfiguration(
            configuration_ref="TEST__JEDNOSTKOWY",
            switchgear_family_ref="ABB__SAFERING",
            code="C",
            name_pl="Pojedyncza jednostka to nie blok",
            units=[
                FactoryConfigurationUnit(
                    unit_code="C",
                    unit_name_pl="Jednostka kablowa",
                    bay_kind="liniowe_odplywowe",
                    apparatus_kinds=["switch_disconnector"],
                )
            ],
        )


def test_szerokosc_calkowita_jest_suma_szerokosci_jednostek() -> None:
    blok = FactoryConfiguration(
        configuration_ref="TEST__SZEROKOSC",
        switchgear_family_ref="ABB__SAFERING",
        code="CC",
        name_pl="Blok testowy z szerokościami",
        units=[
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
                width_mm=325,
            ),
            FactoryConfigurationUnit(
                unit_code="F",
                unit_name_pl="Jednostka transformatorowa",
                bay_kind="transformatorowe",
                apparatus_kinds=["switch_disconnector", "fuse_set"],
                width_mm=325,
            ),
        ],
    )
    assert blok.total_width_mm == 650


def test_brak_szerokosci_jednostki_daje_jawny_brak_sumy() -> None:
    """Suma części, z których jednej nie znamy, nie jest liczbą — to brak.
    Realne bloki nie mają szerokości w źródłach publicznych, więc raportują
    `None` zamiast zmyślonego milimetra."""
    for configuration in list_factory_configurations():
        assert configuration.total_width_mm is None, configuration.configuration_ref


def test_jednostka_spoza_slownika_rodziny_to_twardy_blad() -> None:
    blok = FactoryConfiguration(
        configuration_ref="TEST__OBCY_APARAT",
        switchgear_family_ref="ABB__SAFERING",
        code="CCM",
        name_pl="Blok z przekładnikiem spoza słownika rodziny",
        units=[
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="M",
                unit_name_pl="Jednostka pomiarowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["current_transformer"],
            ),
        ],
    )
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="spoza slownika rodziny"):
        family_supports_factory_configuration(blok)


def test_jednostka_o_funkcji_spoza_katalogu_rodziny_to_twardy_blad() -> None:
    blok = FactoryConfiguration(
        configuration_ref="TEST__OBCA_FUNKCJA",
        switchgear_family_ref="ABB__SAFERING",
        code="CCP",
        name_pl="Blok z polem pomiarowym w rodzinie, która go nie ma",
        units=[
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="P",
                unit_name_pl="Jednostka pomiarowa",
                bay_kind="pomiarowe",
                apparatus_kinds=["switch_disconnector"],
            ),
        ],
    )
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="ktorej"):
        family_supports_factory_configuration(blok)


def test_blok_przypisany_do_rodziny_modulowej_to_twardy_blad() -> None:
    """Blok fabryczny w rodzinie składanej z pojedynczych pól jest
    sprzecznością — kreator prowadziłby projektanta niewłaściwym torem."""
    blok = FactoryConfiguration(
        configuration_ref="TEST__BLOK_W_MODULOWEJ",
        switchgear_family_ref="ZPUE_WLOSZCZOWA__ROTOBLOK",
        code="LL",
        name_pl="Blok w rodzinie modułowej",
        units=[
            FactoryConfigurationUnit(
                unit_code="L",
                unit_name_pl="Jednostka liniowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="L",
                unit_name_pl="Jednostka liniowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
        ],
    )
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="bloki fabryczne"):
        family_supports_factory_configuration(blok)


def test_blok_nieznanej_rodziny_to_twardy_blad() -> None:
    blok = FactoryConfiguration(
        configuration_ref="TEST__NIEZNANA_RODZINA",
        switchgear_family_ref="NIE_MA_TAKIEJ",
        code="XX",
        name_pl="Blok rodziny spoza katalogu",
        units=[
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
            FactoryConfigurationUnit(
                unit_code="C",
                unit_name_pl="Jednostka kablowa",
                bay_kind="liniowe_odplywowe",
                apparatus_kinds=["switch_disconnector"],
            ),
        ],
    )
    with pytest.raises(NiezgodnoscKonfiguracjiError, match="nie istnieje w katalogu"):
        family_supports_factory_configuration(blok)


def test_nieznana_konfiguracja_to_jawny_blad() -> None:
    with pytest.raises(KeyError):
        get_factory_configuration("NIE_MA_TAKIEJ")
