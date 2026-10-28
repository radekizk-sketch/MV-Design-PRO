"""E023 — napięcie znamionowe strony transformatora w innym paśmie niż szyna (partia 11).

DLACZEGO. Po scaleniu karty WSPOLCZYNNIK-C-JEDEN-NOSNIK współczynnik korekcyjny K_T
(IEC 60909-0 eq. 12a) bierze c_max z wiersza tabeli 1 strony DOLNEJ transformatora, a pasmo
tej strony wynika z napięcia znamionowego uzwojenia. Krytyczny tok e2e przypisywał pozycję
katalogu SN/nN (15/0,4 kV) TAKŻE transformatorowi GPZ wpiętemu między szyny 110 kV i 15 kV:
model to przyjmował, a bieg zwarciowy odmawiał „braku tolerancji nN" dla sieci, która nie ma
strony nN. Przyczyna leżała w modelu — przekładnia i impedancja transformatora liczyły się
z napięć, których sieć nie ma, i nic tego nie blokowało. E023 blokuje gotowość.

ILOCZYN CECH: {strona górna, strona dolna} × {napięcie w paśmie szyny inne niż szyna (15,75
na 15 kV, 0,42 na 0,4 kV), napięcie z innego pasma} × {model zbudowany wprost, model po
operacji `assign_catalog_to_element`, model po operacji `update_element_parameters`} ×
{treść: nazwa transformatora i szyny, brak identyfikatorów}. Druga część pliku (W023): strona
× relacja {to samo napięcie, inne w paśmie, inne pasmo} × droga {przypisanie typu, aktualizacja
parametrów, model wprost, import arkusza XLSX}.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.xlsx_import import XlsxImportService, XlsxNetworkImporter
from application.xlsx_import.service import graf_z_arkusza
from domain.canonical_operations import READINESS_CODES, ReadinessLevel
from domain.readiness_bridge import KODY_WALIDATORA_BEZ_KANONU, ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.domain_operations import KOD_NAPIECIA_TYPU_TRANSFORMATORA, execute_domain_operation
from enm.hash import compute_enm_hash
from enm.kompilator_grafu import kompiluj_graf
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _build_mv_lv_enm
from tests.reference_networks.budowa_przez_api import TRANSFORMATOR_WN_SN, wiazanie
from tests.utils.arkusz_xlsx import (
    NAGLOWEK_LINII_TABLICZKA,
    NAGLOWEK_SZYN,
    NAGLOWEK_TRAFO_TABLICZKA,
    NAGLOWEK_ZRODEL,
    wiersz_linii_tabliczka,
    wiersz_trafo_tabliczka,
    zbuduj_skoroszyt,
)

REF_TRAFO_SN_NN = "tr-sn-nn-15-04-630kva-dyn11"


def _e023(model: EnergyNetworkModel) -> list[Any]:
    return [i for i in ENMValidator().validate(model).issues if i.code == "E023"]


def test_siec_poprawna_nie_ma_e023() -> None:
    assert _e023(_build_mv_lv_enm("Sieć")) == []


@pytest.mark.parametrize(
    ("pole", "napiecie_kv"),
    [("uhv_kv", 15.75), ("uhv_kv", 13.8), ("ulv_kv", 0.42), ("ulv_kv", 0.69)],
)
def test_napiecie_w_pasmie_szyny_nie_blokuje(pole: str, napiecie_kv: float) -> None:
    """Uzwojenie 15,75 kV na szynie 15 kV i 0,42 kV na 0,4 kV to typowe tabliczki — nie bloker,
    ale przekładnia nieznamionowa jest widoczna ostrzeżeniem W023 (2026-10-28)."""
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(update={pole: napiecie_kv})
    assert _e023(model) == []
    ostrzezenia = [i for i in ENMValidator().validate(model).issues if i.code == "W023"]
    assert [(i.severity, i.element_refs[0]) for i in ostrzezenia] == [("IMPORTANT", "TR1")]


@pytest.mark.parametrize(
    ("pole", "napiecie_kv", "strona", "szyna", "nazwa_szyny"),
    [
        ("uhv_kv", 110.0, "górnego", N1, "Szyna SN stacji"),
        ("uhv_kv", 0.4, "górnego", N1, "Szyna SN stacji"),
        ("ulv_kv", 15.0, "dolnego", N2, "Szyna nN"),
        ("ulv_kv", 6.0, "dolnego", N2, "Szyna nN"),
    ],
)
def test_napiecie_z_innego_pasma_blokuje(
    pole: str, napiecie_kv: float, strona: str, szyna: str, nazwa_szyny: str
) -> None:
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(update={pole: napiecie_kv})
    (blad,) = _e023(model)
    assert blad.severity == "BLOCKER"
    assert blad.element_refs == ["TR1", szyna]
    assert blad.fix_action is not None and blad.fix_action.element_ref == "TR1"
    assert "TR 15/0,4 kV 630 kVA Dyn11" in blad.message_pl
    assert f"strony {strona} napięcia" in blad.message_pl
    assert nazwa_szyny in blad.message_pl
    for identyfikator in ("TR1", N1, N2):
        assert identyfikator not in blad.message_pl, blad.message_pl


def test_obie_strony_poza_pasmem_daja_dwa_bledy() -> None:
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(
        update={"uhv_kv": 110.0, "ulv_kv": 15.0}
    )
    assert [b.element_refs[1] for b in _e023(model)] == [N1, N2]


def test_e023_jest_jawnie_bez_kodu_kanonu() -> None:
    """Most gotowości zna kod walidatora — nie gubi go jako nieznanego."""
    assert "E023" in KODY_WALIDATORA_BEZ_KANONU


# ---------------------------------------------------------------------------
# Pisarze modelu: każda operacja, która zmienia napięcia uzwojeń transformatora.
# ---------------------------------------------------------------------------


def _gpz() -> dict[str, Any]:
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="e023", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        pusty,
        "add_grid_source_sn",
        # Karta GPZ-MODEL: transformator 110/15 kV jest elementem modelu WYŁĄCZNIE przy
        # równoważniku sieci po stronie 110 kV (równoważnik na szynach SN zawiera już jego
        # impedancję i taki ładunek jest odmawiany). Ten sam GPZ co `KlientBudowy.gpz_110kv`.
        {
            "source_name": "Stacja zasilająca",
            "voltage_kv": 15.0,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": 1,
            "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
        },
    )
    assert not wynik.get("error"), wynik
    migawka = wynik["snapshot"]
    assert len(migawka["transformers"]) == 1
    return migawka


def _e023_migawki(migawka: dict[str, Any]) -> list[Any]:
    return _e023(EnergyNetworkModel.model_validate(migawka))


def test_gpz_110_15_nie_ma_e023() -> None:
    assert _e023_migawki(_gpz()) == []


def test_przypisanie_katalogu_sn_nn_transformatorowi_gpz_odmawia_operacja() -> None:
    """Dokładnie ścieżka krytycznego toku e2e sprzed partii 11. Korekta 2026-10-28: przypisanie
    typu 15/0,4 kV transformatorowi GPZ 110/15 kV nie dochodzi już do modelu (wcześniej
    przechodziło, a dopiero E023 blokował gotowość) — operacja odmawia tą samą równością napięć
    co tory tworzenia transformatora (`tests/enm/test_przypisanie_typu_transformatora_napiecia`).
    E023 zostaje strażnikiem modelu dla dróg, które napięcia uzwojeń ustawiają wprost."""
    migawka = _gpz()
    trafo = migawka["transformers"][0]
    wynik = execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": trafo["ref_id"],
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": REF_TRAFO_SN_NN,
                "catalog_item_version": "2024.1",
            },
        },
    )
    assert wynik.get("error_code") == "catalog.transformer_voltage_mismatch", wynik
    assert _e023_migawki(migawka) == []


@pytest.mark.parametrize(
    ("parametry", "strona"),
    [({"ulv_kv": 0.4}, "lv_bus_ref"), ({"uhv_kv": 15.0, "ulv_kv": 15.0}, "hv_bus_ref")],
)
def test_zmiana_parametrow_transformatora_gpz_blokuje(
    parametry: dict[str, float], strona: str
) -> None:
    migawka = _gpz()
    trafo = migawka["transformers"][0]
    wynik = execute_domain_operation(
        migawka,
        "update_element_parameters",
        {"element_ref": trafo["ref_id"], "parameters": parametry},
    )
    assert not wynik.get("error"), wynik
    bledy = _e023_migawki(wynik["snapshot"])
    assert [b.element_refs[1] for b in bledy] == [trafo[strona]]


# ---------------------------------------------------------------------------
# W023 — inne napięcie uzwojenia w TYM SAMYM paśmie co szyna (przekładnia nieznamionowa).
#
# DLACZEGO (2026-10-28). E023 porównuje pasmem, więc uzwojenie 20 kV na szynie 15 kV (oba SN)
# przechodziło bez śladu: rozpływ i zwarcia liczyły się z przekładnią 20/0,4 zamiast 15/0,4,
# a gotowość nic nie mówiła. Przekładnia nieznamionowa jest fizycznie liczalna (IEC 60909-0
# §6.3.3: przekładnia rzeczywista z napięć uzwojeń, K_T z napięcia uzwojenia), więc to
# OSTRZEŻENIE, nie bloker — ale widoczne. Jeden podział z jednego źródła: równe
# (`to_samo_napiecie_znamionowe`) → nic; to samo pasmo → W023; inne pasmo → E023.
#
# ILOCZYN CECH: strona {górna, dolna} × relacja {to samo napięcie, inne w paśmie, inne pasmo}
# × droga {przypisanie typu, aktualizacja parametrów, import arkusza XLSX}.
# ---------------------------------------------------------------------------

STRONY = {"HV": ("uhv_kv", "górnego", N1, 15.0), "LV": ("ulv_kv", "dolnego", N2, 0.4)}

#: (strona, relacja) → napięcie uzwojenia [kV] przy szynach 15 kV / 0,4 kV.
NAPIECIE_UZWOJENIA: dict[tuple[str, str], float] = {
    ("HV", "to_samo"): 15.0,
    ("HV", "w_pasmie"): 20.0,
    ("HV", "inne_pasmo"): 110.0,
    ("LV", "to_samo"): 0.4,
    ("LV", "w_pasmie"): 0.42,
    ("LV", "inne_pasmo"): 6.0,
}

ILOCZYN = sorted(NAPIECIE_UZWOJENIA)


def _kody_napiecia(model: EnergyNetworkModel) -> list[Any]:
    return [i for i in ENMValidator().validate(model).issues if i.code in ("E023", "W023")]


def _oczekiwany_wynik(zgloszenia: list[Any], strona: str, relacja: str, napiecie_kv: float) -> None:
    """Jeden podział: to samo → nic; w paśmie → W023 (IMPORTANT); inne pasmo → E023."""
    _, nazwa_strony, szyna, napiecie_szyny = STRONY[strona]
    if relacja == "to_samo":
        assert zgloszenia == [], zgloszenia
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.element_refs == ["TR1", szyna]
    assert zgloszenie.fix_action is not None
    assert zgloszenie.fix_action.action_type == "SELECT_CATALOG"
    assert zgloszenie.fix_action.element_ref == "TR1"
    if relacja == "inne_pasmo":
        assert (zgloszenie.code, zgloszenie.severity) == ("E023", "BLOCKER")
        return
    assert (zgloszenie.code, zgloszenie.severity) == ("W023", "IMPORTANT")
    tresc = zgloszenie.message_pl
    # Wyjaśnienie wg kontraktu werdyktu: co, obie wartości z jednostką, odchylenie, podstawa,
    # skutek dla obliczeń; akcja naprawcza w `suggested_fix`; bez identyfikatorów.
    assert f"uzwojenia strony {nazwa_strony} napięcia {napiecie_kv:g} kV" in tresc
    assert f"{napiecie_szyny:g} kV (to samo pasmo" in tresc
    odchylenie = (napiecie_kv / napiecie_szyny - 1.0) * 100.0
    assert f"odchylenie {odchylenie:+.2f} %" in tresc
    assert "IEC 60909-0 §6.3.3" in tresc
    assert "przekładnią rzeczywistą" in tresc
    assert zgloszenie.suggested_fix is not None
    assert "Przypisz transformatorowi typ o napięciach znamionowych równych" in (
        zgloszenie.suggested_fix
    )
    for identyfikator in ("TR1", N1, N2):
        assert identyfikator not in tresc, tresc


@pytest.mark.parametrize(("strona", "relacja"), ILOCZYN)
def test_droga_aktualizacja_parametrow(strona: str, relacja: str) -> None:
    """Jawne nadpisanie napięcia uzwojenia zostaje dopuszczone — skutek widać w gotowości."""
    pole = STRONY[strona][0]
    napiecie = NAPIECIE_UZWOJENIA[(strona, relacja)]
    migawka = _build_mv_lv_enm("Sieć").model_dump(mode="json")
    wynik = execute_domain_operation(
        migawka,
        "update_element_parameters",
        {"element_ref": "TR1", "parameters": {pole: napiecie}},
    )
    assert not wynik.get("error"), wynik
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    assert getattr(model.transformers[0], pole) == napiecie
    _oczekiwany_wynik(_kody_napiecia(model), strona, relacja, napiecie)


@pytest.mark.parametrize(("strona", "relacja"), ILOCZYN)
def test_droga_model_wprost(strona: str, relacja: str) -> None:
    """Model zbudowany wprost (odczyt zapisanego projektu, archiwum) — ten sam podział."""
    pole = STRONY[strona][0]
    napiecie = NAPIECIE_UZWOJENIA[(strona, relacja)]
    model = _build_mv_lv_enm("Sieć")
    model.transformers[0] = model.transformers[0].model_copy(update={pole: napiecie})
    _oczekiwany_wynik(_kody_napiecia(model), strona, relacja, napiecie)


#: Droga przypisania typu: (strona, relacja) → typ katalogu, przekształcenie szyn przed
#: przypisaniem. Katalog nie ma typu 15 kV / SN (dolna strona z innego pasma przy górnej równej),
#: więc ten jeden przypadek przestawia napięcie SZYNY nN na 6 kV, zostawiając typ 15/0,4 kV.
TYP_PRZYPISANIA: dict[tuple[str, str], tuple[str, float | None]] = {
    ("HV", "to_samo"): ("tr-sn-nn-15-04-630kva-dyn11", None),
    ("HV", "w_pasmie"): ("tr-sn-nn-20-04-630kva-dyn11", None),
    ("HV", "inne_pasmo"): (TRANSFORMATOR_WN_SN, None),
    ("LV", "to_samo"): ("tr-sn-nn-15-04-630kva-yd11", None),
    ("LV", "w_pasmie"): ("tr-sn-nn-15-0p69-0p5mva-dyn11-inverter", None),
    ("LV", "inne_pasmo"): ("tr-sn-nn-15-04-630kva-dyn11", 6.0),
}


@pytest.mark.parametrize(("strona", "relacja"), ILOCZYN)
def test_droga_przypisanie_typu(strona: str, relacja: str) -> None:
    """Przypisanie typu stosuje tę samą równość — każda niezgodność to odmowa bez skutku,
    więc W023 przez tę drogę do modelu nie wchodzi."""
    typ, napiecie_szyny_nn = TYP_PRZYPISANIA[(strona, relacja)]
    model = _build_mv_lv_enm("Sieć")
    if napiecie_szyny_nn is not None:
        model.buses = [
            b.model_copy(update={"voltage_kv": napiecie_szyny_nn}) if b.ref_id == N2 else b
            for b in model.buses
        ]
    przed = _kody_napiecia(model)
    migawka = model.model_dump(mode="json")
    skrot_przed = compute_enm_hash(model)
    wynik = execute_domain_operation(
        migawka,
        "assign_catalog_to_element",
        {
            "element_ref": "TR1",
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": typ,
                "catalog_item_version": "2024.1",
            },
        },
    )
    if relacja == "to_samo":
        assert not wynik.get("error"), wynik
        assert _kody_napiecia(EnergyNetworkModel.model_validate(wynik["snapshot"])) == []
        return
    assert wynik.get("error_code") == KOD_NAPIECIA_TYPU_TRANSFORMATORA, wynik
    assert f"strony {STRONY[strona][1]}" in str(wynik.get("error"))
    assert compute_enm_hash(EnergyNetworkModel.model_validate(migawka)) == skrot_przed
    assert _kody_napiecia(EnergyNetworkModel.model_validate(migawka)) == przed


def _arkusz(u_hv_kv: float, u_lv_kv: float) -> bytes:
    """GPZ 15 kV → linia → stacja 15 kV → T1 (tabliczka arkusza z napięciami uzwojeń) → nN."""
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [NAGLOWEK_SZYN, ["B1", "GPZ", 15.0], ["B2", "Stacja", 15.0], ["B3", "nN", 0.4]],
            ),
            ("Linie", [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)]),
            (
                "Trafo",
                [
                    NAGLOWEK_TRAFO_TABLICZKA + ["U_HV_kV", "U_LV_kV"],
                    wiersz_trafo_tabliczka("T1", "B2", "B3") + [u_hv_kv, u_lv_kv],
                ],
            ),
            ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
        ]
    )


@pytest.mark.parametrize(("strona", "relacja"), ILOCZYN)
def test_droga_import_arkusza(strona: str, relacja: str) -> None:
    """Import przenosi tabliczkę arkusza bez zmian: przekładnia nieznamionowa wchodzi do modelu
    i jest widoczna w gotowości (W023); uzwojenie z innego pasma zatrzymuje import (E023)."""
    napiecie = NAPIECIE_UZWOJENIA[(strona, relacja)]
    u_hv, u_lv = (napiecie, 0.4) if strona == "HV" else (15.0, napiecie)
    dane = _arkusz(u_hv, u_lv)
    podglad = XlsxImportService(session=None).podglad(dane)  # type: ignore[arg-type]
    if relacja == "inne_pasmo":
        assert podglad.poprawny is False
        assert [b["kod"] for b in podglad.bledy] == ["E023"], podglad.bledy
        return
    assert podglad.poprawny is True, podglad.bledy
    wynik = XlsxNetworkImporter().import_from_bytes(dane)
    assert wynik.siec is not None
    model = EnergyNetworkModel.model_validate(kompiluj_graf(graf_z_arkusza(wynik.siec, "S")).enm)
    zgloszenia = [i for i in ENMValidator().validate(model).issues if i.code in ("E023", "W023")]
    if relacja == "to_samo":
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert (zgloszenie.code, zgloszenie.severity) == ("W023", "IMPORTANT")
    assert f"strony {STRONY[strona][1]} napięcia {napiecie:g} kV" in zgloszenie.message_pl


def test_w023_ma_kod_kanoniczny_ostrzezenia() -> None:
    """Most gotowości: W023 → kod kanonu z treścią, poziomem OSTRZEŻENIE i nawigacją do typu."""
    kod = ODWZOROWANIE_WALIDATOR_NA_KANON["W023"]
    spec = READINESS_CODES[kod]
    assert spec.level is ReadinessLevel.WARNING
    assert spec.fix_navigation.get("tab") == "katalog"
    assert "W023" not in KODY_WALIDATORA_BEZ_KANONU
