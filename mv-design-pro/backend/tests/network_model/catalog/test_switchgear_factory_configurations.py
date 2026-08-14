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

#: Rodziny o torze BLOK_RMU, dla których bloki fabryczne NIE zostały przepisane
#: z karty producenta. Lista jest JAWNYM długiem danych (a nie cichą luką):
#: zmyślenie sekwencji byłoby fabrykacją katalogu. Dopisanie bloków dowolnej z
#: nich MUSI zaktualizować tę listę — inaczej test upada.
#:
#: STAN PO TRANSKRYPCJI 2026-08-14 (sprawdzone karty producentów):
#:
#: * ABB SafePlus — ZOSTAJE. Katalog ABB 1YVA000022 opisuje SafePlus
#:   moduł po module (rozdziały „C – Cable switch module”, „F – Switch – fuse
#:   module”, „V – Vacuum circuit-breaker module”, „Sl/Sv – Busbar
#:   sectionalizer”, „D – Direct cable connection”, „Be – Busbar earthing”,
#:   „CB – Circuit-breaker”, „M – Metering”) i nazywa go „ABB's flexible,
#:   extendable compact switchgear”. JEDYNE wyliczenie konfiguracji w karcie
#:   („Maximum weights for standard SafeRing”) jest podpisane SafeRing, nie
#:   SafePlus — przepisanie go pod SafePlus byłoby przypisaniem wyrobowi
#:   cudzego zestawu bloków. Brak: opublikowanego zamkniętego zestawu
#:   konfiguracji SafePlus.
#: * Schneider RM AirSeT — ZOSTAJE. Katalog RM AirSeT (dokument Schneider
#:   NRJCAT20014EN) potwierdza jednostki I/Q/B, warianty rozszerzalności
#:   NE/RE/LE/DE oraz szerokości wg liczby funkcji (1 f. 420 mm, 2 f. 770 mm,
#:   3 f. 1120 mm, 4 f. 1470 mm), ale KAŻDA lista konfiguracji w karcie jest
#:   listą przykładów zakończoną wielokropkiem („2 functional units: II, IQ,
#:   QI, QQ, IB, BB...”, „3 functions: IIQ, IQI, IIB, BBB, QQQ, BIQ…”). Karta
#:   nie ma odpowiednika tabeli „Complete board configuration table” z RM6.
#:   Brak: zamkniętego, wyliczonego zestawu bloków; złożenie go z list
#:   przykładowych byłoby zestawem, którego producent nie opublikował.
RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW = {
    "ABB__SAFEPLUS",
    "SCHNEIDER__RM_AIRSET",
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


def test_kazda_konfiguracja_ma_zrodlo_producenta() -> None:
    """Zero fabrykacji przypięte dla BLOKÓW, nie tylko rodzin (KLASA, nie
    instancja). Rodziny mają pin `test_all_families_have_source_refs`, ale tę
    samą deklarację („każdy wpis katalogu wskazuje publiczne źródło") składa
    też rejestr bloków — a deklaracja bez testu to fałszywa pewność. Iniekcja
    odbioru 2026-08-14: zmyślony blok z pustym `source_refs` przeszedł cały
    pakiet i upadł dopiero na imiennej liście długu, czyli mechanizmie o INNYM
    przeznaczeniu. Ten pin łapie fabrykację wprost."""
    for configuration in list_factory_configurations():
        assert configuration.source_refs, configuration.configuration_ref
        for ref in configuration.source_refs:
            assert ref.startswith(("http://", "https://")), (
                configuration.configuration_ref,
                ref,
            )


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


def test_tpm_ma_bloki_z_katalogu_producenta() -> None:
    """Konfiguracje typowe TPM wg katalogu ZPUE („TPM — KONFIGURACJE TYPOWE”),
    razem z układem Kompakt (LTL, LLTL)."""
    kody = {c.code for c in list_factory_configurations_for_family("ZPUE_WLOSZCZOWA__TPM")}
    assert kody == {
        "LT",
        "LLT",
        "LLLT",
        "TLLT",
        "TT",
        "LL",
        "LLL",
        "LLLL",
        "LW",
        "LLW",
        "LLLW",
        "WLLW",
        "WW",
        "WWW",
        "WWWW",
        "LWWW",
        "LTL",
        "LLTL",
    }
    llt = get_factory_configuration("ZPUE_WLOSZCZOWA__TPM__LLT")
    assert llt.unit_sequence == "L-L-T"
    assert llt.units[-1].apparatus_kinds == ["switch_disconnector", "fuse_set"]
    # Pole W karta opisuje jako wyłącznikowe — aparat odróżniający to wyłącznik.
    llw = get_factory_configuration("ZPUE_WLOSZCZOWA__TPM__LLW")
    assert llw.units[-1].apparatus_kinds == ["circuit_breaker"]


def test_rm6_ma_bloki_z_katalogu_producenta() -> None:
    """Sekwencje z tabeli „Complete board configuration table" katalogu RM6.
    Prefiks rozszerzalności (NE/RE/LE/DE) nie jest osobnym blokiem — to
    obudowa, nie sekwencja jednostek."""
    kody = {c.code for c in list_factory_configurations_for_family("SCHNEIDER__RM6")}
    assert kody == {
        "II",
        "BI",
        "DI",
        "QI",
        "III",
        "IBI",
        "IDI",
        "IQI",
        "IIII",
        "IIBI",
        "BIBI",
        "IIDI",
        "DIDI",
        "IIQI",
        "QIQI",
    }
    # IQI i IDI różni APARAT pola transformatorowego (rozłącznik z
    # bezpiecznikami wobec wyłącznika 200 A) — funkcja pola jest ta sama.
    iqi = get_factory_configuration("SCHNEIDER__RM6__IQI")
    idi = get_factory_configuration("SCHNEIDER__RM6__IDI")
    assert [u.bay_kind for u in iqi.units] == [u.bay_kind for u in idi.units]
    assert iqi.units[1].apparatus_kinds == ["switch_disconnector", "fuse_set"]
    assert idi.units[1].apparatus_kinds == ["circuit_breaker"]


#: Szerokości bloków 8DJH wg tabeli mas transportowych katalogu Siemens HA 40.2
#: — DRUGIE, niezależne zdanie karty wobec tabeli „Panel type / Width", z
#: której pochodzą szerokości jednostek w rejestrze. PREDYKATY PARAMI: jeśli
#: obie transkrypcje się nie zgadzają, któraś jest błędna.
SZEROKOSCI_BLOKOW_8DJH_Z_KARTY = {
    "KT": 740,
    "K(E)T": 860,
    "KL": 740,
    "K(E)L": 860,
    "RK": 620,
    "RT": 740,
    "RL": 740,
    "TT": 860,
    "RR": 620,
    "LL": 860,
    "RS": 740,
    "RH": 740,
    "RRT": 1050,
    "RRL": 1050,
    "RTR": 1050,
    "RLR": 1050,
    "RRR": 930,
    "TTT": 1290,
    "LLL": 1290,
    "RRS": 1050,
    "RRH": 1050,
    "RRRT": 1360,
    "RRRL": 1360,
    "RRRR": 1240,
    "TRRT": 1480,
    "LRRL": 1480,
    "TTTT": 1720,
    "LLLL": 1720,
    "RRRS": 1360,
    "RRRH": 1360,
}


def test_8djh_ma_bloki_z_karty_producenta() -> None:
    kody = {c.code for c in list_factory_configurations_for_family("SIEMENS__8DJH")}
    assert kody == set(SZEROKOSCI_BLOKOW_8DJH_Z_KARTY)


def test_8djh_suma_szerokosci_jednostek_zgadza_sie_z_szerokoscia_bloku() -> None:
    """Szerokość jednostki i szerokość bloku to DWA niezależne miejsca karty
    Siemensa. Suma pierwszych musi dać drugą — inaczej transkrypcja zmyśliła
    którąś liczbę. To jedyny pin, który wyłapie literówkę w milimetrach."""
    for configuration in list_factory_configurations_for_family("SIEMENS__8DJH"):
        assert (
            configuration.total_width_mm == SZEROKOSCI_BLOKOW_8DJH_Z_KARTY[configuration.code]
        ), configuration.configuration_ref


def test_8djh_ma_bloki_z_polem_sprzeglowym_dopuszczonym_przez_rodzine() -> None:
    """Pola S i H (sprzęgłowe) weszły do rejestru RAZEM z rozszerzeniem słownika
    rodziny — blok nie może wskazywać funkcji, której rodzina nie deklaruje."""
    rodzina = get_switchgear_family("SIEMENS__8DJH")
    assert "sprzeglowe_poprzeczne" in rodzina.allowed_bay_kinds
    rrh = get_factory_configuration("SIEMENS__8DJH__RRH")
    assert rrh.units[-1].bay_kind == "sprzeglowe_poprzeczne"
    assert rrh.units[-1].apparatus_kinds == ["switch_disconnector", "fuse_set"]
    rrs = get_factory_configuration("SIEMENS__8DJH__RRS")
    assert rrs.units[-1].apparatus_kinds == ["switch_disconnector"]


def test_safering_ma_komplet_blokow_z_karty_producenta() -> None:
    """Rejestr SafeRing po transkrypcji karty ABB 1YVA000022: 15 konfiguracji z
    tabeli mas („standard SafeRing") plus cztery z rysunków konfiguracji, w
    których występują moduły De oraz V."""
    kody = {c.code for c in list_factory_configurations_for_family("ABB__SAFERING")}
    assert kody == {
        "DF",
        "CF",
        "DeF",
        "DeV",
        "CCC",
        "CCF",
        "CFC",
        "FCC",
        "CCV",
        "CCCC",
        "CCCF",
        "CCFF",
        "CFFC",
        "CCVV",
        "CCCV",
        "CCCCC",
        "CCCCF",
        "CCCFF",
        "CCFFF",
    }
    # Moduł przyłącza kablowego De niesie uziemnik — tym różni się od D.
    assert get_factory_configuration("ABB__SAFERING__DeF").units[0].apparatus_kinds == [
        "cable_head",
        "earthing_switch",
    ]
    assert get_factory_configuration("ABB__SAFERING__DF").units[0].apparatus_kinds == ["cable_head"]


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


def test_suma_szerokosci_zalezy_od_kompletu_szerokosci_jednostek() -> None:
    """ILOCZYN CECH szerokości na REALNYM rejestrze: blok z kompletem szerokości
    jednostek × blok, w którym choć jednej brakuje.

    Korekta 2026-08-14: poprzednia wersja żądała `None` od KAŻDEJ konfiguracji
    rejestru. Było to prawdą przypadkową — akurat żadne ówczesne źródło nie
    podawało szerokości jednostki — więc test pilnował stanu danych zamiast
    reguły. Katalog Siemens HA 40.2 podaje szerokości pól wprost, więc reguła
    jest dwustronna: komplet szerokości ⇒ suma jest liczbą; brak choćby jednej
    ⇒ suma jest jawnym brakiem, nigdy zmyślonym milimetrem.
    """
    z_kompletem = 0
    z_brakiem = 0
    for configuration in list_factory_configurations():
        szerokosci = [u.width_mm for u in configuration.units]
        if all(width is not None for width in szerokosci):
            assert configuration.total_width_mm == sum(
                width for width in szerokosci if width is not None
            ), configuration.configuration_ref
            z_kompletem += 1
        else:
            assert configuration.total_width_mm is None, configuration.configuration_ref
            z_brakiem += 1
    # Obie gałęzie muszą być realnie ćwiczone — inaczej test przechodzi „bo
    # nie ma czego sprawdzać" i nie wykryłby regresji w tej pominiętej.
    assert z_kompletem > 0
    assert z_brakiem > 0


def test_configuration_ref_jest_bezpiecznym_identyfikatorem() -> None:
    """`code` niesie kod producenta (Siemens „K(E)T"), `configuration_ref` jest
    identyfikatorem technicznym — wędruje do payloadu API, więc nie może nieść
    nawiasów ani spacji. Deklaracja z docstringu `_ref_z_kodu` przypięta."""
    for configuration in list_factory_configurations():
        ref = configuration.configuration_ref
        assert ref.replace("_", "").isalnum(), ref


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
