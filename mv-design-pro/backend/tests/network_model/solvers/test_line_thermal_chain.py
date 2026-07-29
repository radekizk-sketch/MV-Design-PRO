"""Karta F-K1 faza 7: wytrzymalosc zwarciowa PRZEWODU GOLEGO linii napowietrznej.

DLUG, KTORY TA KARTA ZAMYKA. Faza 6 dostarczyla pelny dowod obliczeniowy kryterium
IEC 60949, ale wylacznie dla KABLI. Linia napowietrzna konczyla sie werdyktem
NIEDOSTEPNY na kazdym modelu — mimo ze katalog niosl Jth(1 s) od poczatku. Zerwane
byly trzy ogniwa naraz:

1. kontrakt materializacji ``LINIA_SN`` przenosil tylko impedancje i obciazalnosc,
2. model ENM ``OverheadLine`` nie mial pol cieplnych, a pydantic domyslnie IGNORUJE
   nadmiarowe pola — dane byly wiec cicho POLYKANE, bez zadnego bledu,
3. temperatura koncowa theta_k dla przewodu golego nie byla dana, tylko komentarzem
   przy stalych JTH — dowod nie mial czym uzasadnic wspolczynnika k.

Testy ida REALNA droga (katalog -> materializacja -> operacja domenowa -> model ->
graf -> analiza), a nie przez recznie zlozony fixture: dokladnie tam ukrywal sie dlug.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.catalog.mv_cable_line_catalog import (
    JTH_AL_OHL,
    JTH_AL_ST_OHL,
    TEMP_OPERATING_OHL_C,
    TEMP_SHORT_CIRCUIT_OHL_AL_C,
    TEMP_SHORT_CIRCUIT_OHL_AL_ST_C,
    get_all_line_types,
)
from network_model.catalog.types import MATERIALIZATION_CONTRACTS, CatalogNamespace, LineType
from network_model.solvers.conductor_thermal_withstand import (
    CONDUCTOR_KIND_BARE,
    CONDUCTOR_KIND_CABLE,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-24kv-630a"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"

# Stale materialowe wzoru IEC 60949 §3 dla ALUMINIUM (zalacznik A normy):
#   k = K · sqrt( ln( (beta + theta_k) / (beta + theta_b) ) )
# K — stala materialowa [A·s^0,5/mm²], beta — odwrotnosc wspolczynnika temperaturowego [K].
IEC60949_K_AL = 148.0
IEC60949_BETA_AL = 228.0


def _k_wg_iec60949(temp_robocza_c: float, temp_zwarciowa_c: float) -> float:
    """Wspolczynnik k [A·√s/mm²] z pary temperatur wg IEC 60949 §3 (aluminium)."""
    return IEC60949_K_AL * math.sqrt(
        math.log((IEC60949_BETA_AL + temp_zwarciowa_c) / (IEC60949_BETA_AL + temp_robocza_c))
    )


# ---------------------------------------------------------------------------
# Ogniwo 1: katalog — para temperatur ZGODNA ze stalymi JTH (a nie dobrana dowolnie)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("jth_katalogowe", "temp_zwarciowa_c", "opis"),
    [
        (JTH_AL_OHL, TEMP_SHORT_CIRCUIT_OHL_AL_C, "AAL / AAC — jednorodne aluminium"),
        (JTH_AL_ST_OHL, TEMP_SHORT_CIRCUIT_OHL_AL_ST_C, "AFL / ACSR — rdzen stalowy"),
    ],
)
def test_para_temperatur_odtwarza_stala_jth_wzorem_iec60949(
    jth_katalogowe: float, temp_zwarciowa_c: float, opis: str
) -> None:
    """Para temperatur przewodu golego NIE jest przyjeta dowolnie — odtwarza k z normy.

    To jest wlasciwy sprawdzian uzasadnienia k (uwaga 6 wlasciciela): theta_b i theta_k
    podstawione do wzoru IEC 60949 musza dawac wartosc, ktora katalog rzeczywiscie
    stosuje. Dodatkowo katalog nie moze byc OPTYMISTYCZNY wobec wzoru — dopuszczamy
    wylacznie zaokraglenie w strone bezpieczna (k katalogowe <= k wzorowe).
    """
    k_wzorowe = _k_wg_iec60949(TEMP_OPERATING_OHL_C, temp_zwarciowa_c)

    assert jth_katalogowe <= k_wzorowe, (
        f"{opis}: katalogowe k={jth_katalogowe} jest WYZSZE od wzorowego "
        f"k={k_wzorowe:.2f} dla pary {TEMP_OPERATING_OHL_C}->{temp_zwarciowa_c} °C — "
        "to zawyzalo wytrzymalosc przewodu."
    )
    odchylka = (k_wzorowe - jth_katalogowe) / k_wzorowe
    assert odchylka <= 0.02, (
        f"{opis}: katalogowe k={jth_katalogowe} odbiega od wzorowego {k_wzorowe:.2f} "
        f"o {odchylka:.1%} — para temperatur nie uzasadnia tej stalej."
    )


def test_kazdy_produkcyjny_rekord_linii_ma_pelna_pare_temperatur() -> None:
    """Bez theta_k dowod nie ma czym uzasadnic k — brak byl NAZYWANY na kazdej linii."""
    produkcyjne = [
        rekord
        for rekord in get_all_line_types()
        if rekord["params"].get("jth_1s_a_per_mm2") is not None
    ]
    assert produkcyjne, "Katalog linii nie ma rekordow z gestoscia pradu cieplnego."

    for rekord in produkcyjne:
        params = rekord["params"]
        temp_robocza = params.get("max_temperature_c")
        temp_zwarciowa = params.get("short_circuit_temperature_c")
        assert temp_robocza is not None, f"{rekord['id']}: brak temperatury roboczej"
        assert temp_zwarciowa is not None, f"{rekord['id']}: brak temperatury zwarciowej"
        assert temp_zwarciowa > temp_robocza, (
            f"{rekord['id']}: temperatura zwarciowa {temp_zwarciowa} nie jest wyzsza "
            f"od roboczej {temp_robocza} — para bezsensowna fizycznie."
        )
        assert params.get(
            "thermal_source_reference"
        ), f"{rekord['id']}: brak odniesienia normowego pary temperatur"


def test_odniesienie_normowe_linii_ma_polskie_znaki() -> None:
    """Ten napis trafia do UI (pole „Zrodlo" dowodu) — musi byc po polsku.

    Konwencja ASCII-PL obowiazuje w rejestrach i komentarzach, NIGDY w tekstach
    widocznych dla projektanta. Defekt wylapany przy ogledzinach zrzutu ekranu:
    zrodlo wyswietlalo sie jako „przewodow golych".
    """
    rekord = next(r for r in get_all_line_types() if r["id"] == CATALOG_LINE_70)
    zrodlo = rekord["params"]["thermal_source_reference"]
    assert "przewodów gołych" in zrodlo, zrodlo
    assert "IEC 60949" in zrodlo


def test_kontrakt_materializacji_linii_niesie_dane_cieplne() -> None:
    """Ogniwo, ktorego brak przerywal lancuch: kontrakt LINIA_SN bez danych cieplnych."""
    kontrakt = MATERIALIZATION_CONTRACTS[CatalogNamespace.LINIA_SN.value]
    for pole in (
        "conductor_material",
        "cross_section_mm2",
        "jth_1s_a_per_mm2",
        "max_temperature_c",
        "short_circuit_temperature_c",
        "thermal_source_reference",
    ):
        assert pole in kontrakt.solver_fields, (
            f"Kontrakt materializacji linii nie przenosi `{pole}` — kryterium cieplne "
            "IEC 60949 dostanie dla linii napowietrznej werdykt NIEDOSTEPNY."
        )


def test_typ_katalogowy_linii_wystawia_temperature_zwarciowa_w_slowniku() -> None:
    """Materializacja czyta rekord przez ``to_dict`` — pole musi tam byc, nie tylko w dataclass."""
    rekord = next(r for r in get_all_line_types() if r["id"] == CATALOG_LINE_70)
    typ = LineType.from_dict({"id": rekord["id"], "name": rekord["name"], **rekord["params"]})
    slownik = typ.to_dict()

    assert slownik["short_circuit_temperature_c"] == TEMP_SHORT_CIRCUIT_OHL_AL_ST_C
    assert slownik["thermal_source_reference"]
    # Ith(1 s) = Jth(1 s) · S — ta sama zasada, ktora stosuje kabel.
    assert typ.get_ith_1s() == pytest.approx(JTH_AL_ST_OHL * 70.0)


# ---------------------------------------------------------------------------
# Ogniwo 2: operacja domenowa -> model -> graf (realna droga produkcyjna)
# ---------------------------------------------------------------------------


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="linia_cieplna", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _operacja(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    if nazwa == "add_grid_source_sn":
        payload = {
            "catalog_ref": CATALOG_ZRODLO_250,
            "gpz_line_field_apparatus": {
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": CATALOG_APARAT_SN,
                },
            },
            **payload,
        }
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    return wynik["snapshot"]


def _model_z_linia_napowietrzna() -> dict[str, Any]:
    """GPZ + jeden odcinek NAPOWIETRZNY SN z typu katalogowego."""
    snapshot = _operacja(_pusty_enm(), "add_grid_source_sn", {"voltage_kv": 15.0, "sk3_mva": 250.0})
    return _operacja(
        snapshot,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 800.0,
                "catalog_ref": CATALOG_LINE_70,
            },
        },
    )


def test_dane_cieplne_linii_docieraja_z_katalogu_do_modelu() -> None:
    """Rdzen dlugu: pydantic CICHO polykal dane cieplne linii (model nie mial tych pol)."""
    snapshot = _model_z_linia_napowietrzna()
    linia = next(b for b in snapshot["branches"] if b.get("type") == "line_overhead")

    assert linia["jth_1s_a_per_mm2"] == JTH_AL_ST_OHL
    assert linia["conductor_material"] == "AL_ST"
    assert linia["cross_section_mm2"] == pytest.approx(70.0)
    assert linia["operating_temperature_c"] == pytest.approx(TEMP_OPERATING_OHL_C)
    assert linia["short_circuit_temperature_c"] == pytest.approx(TEMP_SHORT_CIRCUIT_OHL_AL_ST_C)
    # Odniesienie normowe: pole `thermal_source_ref` bylo w modelu od fazy 6 BEZ DOSTAWCY.
    assert "IEC 60949" in linia["thermal_source_ref"]

    # Walidacja dokumentu musi te pola PRZYJAC (a nie zignorowac).
    model = EnergyNetworkModel.model_validate(snapshot)
    linia_modelu = next(b for b in model.branches if getattr(b, "type", None) == "line_overhead")
    assert linia_modelu.jth_1s_a_per_mm2 == JTH_AL_ST_OHL
    assert linia_modelu.short_circuit_temperature_c == pytest.approx(TEMP_SHORT_CIRCUIT_OHL_AL_ST_C)


def test_dane_cieplne_linii_docieraja_do_galezi_grafu() -> None:
    """Graf jest jedynym zrodlem analizy cieplnej w sciezce produkcyjnej."""
    model = EnergyNetworkModel.model_validate(_model_z_linia_napowietrzna())
    graf = map_enm_to_network_graph(model)

    galaz = next(
        b for b in graf.branches.values() if getattr(b, "jth_1s_a_per_mm2", None) not in (None, 0.0)
    )
    assert galaz.jth_1s_a_per_mm2 == JTH_AL_ST_OHL
    assert galaz.cross_section_mm2 == pytest.approx(70.0)
    assert galaz.conductor_material == "AL_ST"
    assert galaz.operating_temperature_c == pytest.approx(TEMP_OPERATING_OHL_C)
    assert galaz.short_circuit_temperature_c == pytest.approx(TEMP_SHORT_CIRCUIT_OHL_AL_ST_C)
    # Ith(1 s) wyliczone z Jth · S — bez tego solver nie ma pradu dopuszczalnego.
    assert galaz.get_thermal_ith_1s_a() == pytest.approx(JTH_AL_ST_OHL * 70.0)
    # Przewod goly NIE ma izolacji i to jest poprawna informacja, nie brak danej.
    assert galaz.insulation is None


# ---------------------------------------------------------------------------
# Ogniwo 3: dowod obliczeniowy — brak izolacji przewodu golego NIE jest brakiem
# ---------------------------------------------------------------------------


def _wejscie_przewodu_golego(**nadpisania: Any) -> ConductorThermalInput:
    dane: dict[str, Any] = {
        "ith_a": 5000.0,
        "fault_duration_s": 0.5,
        "ith_1s_a": JTH_AL_ST_OHL * 70.0,
        "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
        "cross_section_mm2": 70.0,
        "conductor_material": "AL_ST",
        "insulation": None,
        "temp_operating_c": TEMP_OPERATING_OHL_C,
        "temp_short_circuit_c": TEMP_SHORT_CIRCUIT_OHL_AL_ST_C,
        "material_source_ref": "PN-E-05115 / IEC 61936-1; k wg IEC 60949 § 3",
        "conductor_kind": CONDUCTOR_KIND_BARE,
    }
    dane.update(nadpisania)
    return ConductorThermalInput(**dane)


def test_uzasadnienie_k_przewodu_golego_jest_kompletne_bez_izolacji() -> None:
    """Przewod goly izolacji NIE MA — zgloszenie braku byloby nieprawda.

    Przed ta karta kazdy dowod dla linii napowietrznej mial adnotacje „NIEPELNE
    UZASADNIENIE — brak: rodzaj izolacji", co falszowalo obraz kompletnosci danych.
    """
    wynik = check_conductor_thermal_withstand(_wejscie_przewodu_golego())
    uzasadnienie = wynik.k_justification
    assert uzasadnienie is not None

    assert uzasadnienie["braki_pl"] == ()
    assert uzasadnienie["kompletne"] is True
    assert uzasadnienie["izolacja"] == "brak — przewód goły"
    assert uzasadnienie["rodzaj_przewodu"] == CONDUCTOR_KIND_BARE
    assert "wytrzymałości mechanicznej" in uzasadnienie["granica_temperatury_pl"]
    assert uzasadnienie["k_a_s05_per_mm2"] == pytest.approx(JTH_AL_ST_OHL)


def test_kabel_bez_izolacji_nadal_zglasza_brak() -> None:
    """Rozluznienie dotyczy WYLACZNIE przewodu golego — dla kabla izolacja jest wymagana."""
    wynik = check_conductor_thermal_withstand(
        _wejscie_przewodu_golego(conductor_kind=CONDUCTOR_KIND_CABLE, insulation=None)
    )
    uzasadnienie = wynik.k_justification
    assert uzasadnienie is not None
    assert "rodzaj izolacji" in uzasadnienie["braki_pl"]
    assert uzasadnienie["kompletne"] is False


def test_podana_izolacja_wystarcza_bez_jawnej_deklaracji_rodzaju() -> None:
    """Regula jest SYMETRYCZNA: nie wolno naprawiac jednego falszywego braku, wprowadzajac drugi.

    Kabel poprawnie opisany (izolacja + para temperatur), ale bez jawnego rodzaju, jest
    KOMPLETNY — izolacja wyklucza przewod goly, wiec rodzaj da sie wywnioskowac. To
    dokladnie kanon fazy 6, ktory pierwsza (bezwarunkowa) wersja tej karty zlamala.
    """
    wynik = check_conductor_thermal_withstand(
        _wejscie_przewodu_golego(
            conductor_kind=None,
            conductor_material="AL",
            insulation="XLPE",
            temp_operating_c=90.0,
            temp_short_circuit_c=250.0,
        )
    )
    uzasadnienie = wynik.k_justification
    assert uzasadnienie is not None
    assert uzasadnienie["braki_pl"] == ()
    assert uzasadnienie["kompletne"] is True
    assert uzasadnienie["rodzaj_przewodu"] == CONDUCTOR_KIND_CABLE


def test_brak_rodzaju_i_izolacji_jest_nazwanym_brakiem() -> None:
    """Zero fabrykacji: bez rodzaju I bez izolacji nie wiadomo, czy izolacji ma brakowac."""
    wynik = check_conductor_thermal_withstand(
        _wejscie_przewodu_golego(conductor_kind=None, insulation=None)
    )
    uzasadnienie = wynik.k_justification
    assert uzasadnienie is not None
    assert "rodzaj przewodu (kabel / przewód goły)" in uzasadnienie["braki_pl"]
    assert "rodzaj izolacji" in uzasadnienie["braki_pl"]
    assert uzasadnienie["rodzaj_przewodu_pl"] is None


def test_slad_dowodu_przewodu_golego_pokazuje_rodzaj_i_granice() -> None:
    """Dowod ma umozliwiac NIEZALEZNA weryfikacje k — rodzaj przewodu jest dana wejsciowa."""
    wynik = check_conductor_thermal_withstand(_wejscie_przewodu_golego())
    krok_k = next(k for k in wynik.white_box_trace if k["key"] == "conductor_thermal_k_factor")

    assert krok_k["inputs"]["rodzaj_przewodu"]["value"] == "przewód goły (linia napowietrzna)"
    assert krok_k["inputs"]["izolacja"]["value"] == "brak — przewód goły"
    assert krok_k["inputs"]["temp_poczatkowa_c"]["value"] == pytest.approx(TEMP_OPERATING_OHL_C)
    assert krok_k["inputs"]["temp_koncowa_c"]["value"] == pytest.approx(
        TEMP_SHORT_CIRCUIT_OHL_AL_ST_C
    )
    assert "NIEPEŁNE UZASADNIENIE" not in krok_k["notes"]
    assert "IEC 60949" in krok_k["notes"]


def test_werdykt_linii_liczony_z_danych_katalogowych() -> None:
    """Dowod liczbowy: AFL 6 70 mm², I_th = 5000 A, t = 0,5 s.

    I_th(1 s) = 88 · 70 = 6160 A;  I_dop = 6160/sqrt(0,5) = 8711,55 A  =>  PASS
    S_min = 5000·sqrt(0,5) / 88 = 40,17 mm²  (mniej niz zastosowane 70 mm²)
    """
    wynik = check_conductor_thermal_withstand(_wejscie_przewodu_golego())

    assert wynik.status == "PASS"
    assert wynik.admissible_current_a == pytest.approx(6160.0 / math.sqrt(0.5))
    assert wynik.utilization == pytest.approx(5000.0 / (6160.0 / math.sqrt(0.5)))
    assert wynik.required_cross_section_mm2 == pytest.approx(5000.0 * math.sqrt(0.5) / 88.0)


# ---------------------------------------------------------------------------
# Ogniwo 4: PODZIAL odcinka nie moze gubic danych cieplnych
# ---------------------------------------------------------------------------


def test_wstawienie_stacji_na_odcinku_zachowuje_dane_cieplne_obu_polowek() -> None:
    """Drugi defekt tej karty: podzial odcinka GUBIL dane cieplne zyly fazowej.

    Biala lista `_copy_split_segment_fields` przenosila dane zyly POWROTNEJ, ale nie
    fazowej — po wstawieniu stacji na magistrali kryterium cieplne dawalo dla obu
    polowek werdykt NIEDOSTEPNY, mimo ze przewod byl fizycznie ten sam. Test idzie
    realna operacja projektanta (wstawienie stacji), nie recznym podzialem struktury.
    """
    snapshot = _model_z_linia_napowietrzna()
    odcinek = next(b for b in snapshot["branches"] if b.get("type") == "line_overhead")

    wynik = execute_domain_operation(
        snapshot,
        "insert_station_on_segment_sn",
        {
            "segment_id": odcinek["ref_id"],
            "station": {"name": "Stacja SN/nN", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"

    polowki = [b for b in wynik["snapshot"]["branches"] if b.get("type") == "line_overhead"]
    assert len(polowki) == 2, "Wstawienie stacji powinno dac dwie polowki odcinka."

    for polowka in polowki:
        assert polowka["jth_1s_a_per_mm2"] == JTH_AL_ST_OHL, (
            f"{polowka['ref_id']}: podzial zgubil gestosc pradu cieplnego — "
            "kryterium IEC 60949 bedzie NIEDOSTEPNE."
        )
        assert polowka["cross_section_mm2"] == pytest.approx(70.0)
        assert polowka["operating_temperature_c"] == pytest.approx(TEMP_OPERATING_OHL_C)
        assert polowka["short_circuit_temperature_c"] == pytest.approx(
            TEMP_SHORT_CIRCUIT_OHL_AL_ST_C
        )
        assert polowka["thermal_source_ref"]

    # Ta sama droga do grafu, z ktorego czyta analiza cieplna.
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(wynik["snapshot"]))
    galezie_z_danymi = [
        b for b in graf.branches.values() if getattr(b, "jth_1s_a_per_mm2", None) == JTH_AL_ST_OHL
    ]
    assert len(galezie_z_danymi) == 2
    for galaz in galezie_z_danymi:
        assert galaz.get_thermal_ith_1s_a() == pytest.approx(JTH_AL_ST_OHL * 70.0)
