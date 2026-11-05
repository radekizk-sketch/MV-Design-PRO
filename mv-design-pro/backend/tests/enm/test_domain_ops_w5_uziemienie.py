"""W5-A: operacje domenowe jednej reprezentacji uziemienia.

Kreator źródła GPZ: `Source.neutral_grounding` + Z0 wyłącznie po stronie 110 kV i wyłącznie
jawne (punkt uziemiony bez Z0 blokuje E-W5-01); równoważnik na szynach SN nie opisuje
uziemienia sieci SN — odmowa nazwana (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3); kreator stacji: `Transformer.lv_earthing_system` + `lv_neutral` z
właściwym kluczem R/X i odmową predykatu; ekran kabla we WSZYSTKICH operacjach tworzących
kabel (magistrala, odgałęzienie, pierścień, kabel nN) + podział odcinka; rola uziemnika
w kreatorze pola; allowlista `update_element_parameters`.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pola import pola_stacji
from enm.validator import ENMValidator

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
CATALOG_KABEL_SN = "cable-tfk-yakxs-3x120"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CATALOG_TRAFO_WN_SN = "tr-wn-sn-110-15-25mva-yd11"


def _empty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="w5-ops", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")


def _op(enm: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=enm, op_name=name, payload=payload)


def _ok(result: dict[str, Any]) -> dict[str, Any]:
    assert result.get("error") in (None, ""), result.get("error")
    assert result.get("snapshot") is not None
    return result["snapshot"]


def _gpz(grounding: dict[str, Any] | None, **extra: Any) -> dict[str, Any]:
    """Równoważnik na szynach SN (katalog źródeł GPZ)."""
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "catalog_ref": CATALOG_ZRODLO_SN,
    }
    if grounding is not None:
        payload["grounding"] = grounding
    payload.update(extra)
    return _op(_empty_enm(), "add_grid_source_sn", payload)


def _gpz_wn(grounding: dict[str, Any] | None, **extra: Any) -> dict[str, Any]:
    """Równoważnik sieci 110 kV z transformatorem 110/SN w modelu — jedyna strona, na której
    źródło opisuje punkt neutralny i Z0 (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3)."""
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "manual_equivalent": {
            "short_circuit_input_side": "HV_110",
            "hv_voltage_kv": 110.0,
            "sk3_hv_mva": 3000.0,
            "rx_ratio": 0.1,
        },
        "transformer_count": 1,
        "transformer_catalog_ref": CATALOG_TRAFO_WN_SN,
    }
    if grounding is not None:
        payload["grounding"] = grounding
    payload.update(extra)
    return _op(_empty_enm(), "add_grid_source_sn", payload)


_OPISY_UZIEMIENIA = [
    {"type": "resistor_grounded", "r_ohm": 12.0},
    {"type": "petersen_coil", "x_ohm": 150.0},
    {"type": "directly_grounded"},
    {"type": "isolated"},
]


class TestKreatorZrodla:
    @pytest.mark.parametrize("grounding", _OPISY_UZIEMIENIA)
    def test_rownowaznik_sn_z_opisem_uziemienia_odmawia_nazwanie(self, grounding):
        """Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3: równoważnik na szynach SN nie
        opisuje uziemienia punktu neutralnego sieci SN (także „izolowany” — to wniosek
        z modelu, nie deklaracja źródła). Odmowa nazwana, model bez zmian."""
        result = _gpz(grounding)
        assert result["error_code"] == "source.sn_neutral_not_on_source"
        assert "zespołem uziemiającym" in result["error"]
        assert result.get("snapshot") is None

    @pytest.mark.parametrize(
        "zero_sequence",
        [
            {"enabled": True, "z0_z1_ratio": 3.2},
            {"enabled": True, "r0_ohm": 0.4, "x0_ohm": 1.8},
        ],
    )
    def test_rownowaznik_sn_z_impedancja_zerowa_odmawia_nazwanie(self, zero_sequence):
        result = _gpz(None, zero_sequence=zero_sequence)
        assert result["error_code"] == "source.sn_neutral_not_on_source"
        assert result.get("snapshot") is None

    def test_rownowaznik_sn_bez_opisu_daje_siec_izolowana_z_modelu(self):
        snap = _ok(_gpz(None))
        source = snap["sources"][0]
        assert source.get("neutral_grounding") is None
        assert source.get("r0_ohm") is None and source.get("z0_z1_ratio") is None
        assert all("grounding" not in b for b in snap["buses"])
        meta = snap["substations"][0]["meta"]
        assert "grounding" not in meta and "zero_sequence" not in meta
        wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(snap))
        assert not [i for i in wynik.issues if i.code in ("E-W5-01", "W-W5-02", "W002")]
        from enm.uziemienie_sekcji import uziemienie_sieci

        (sekcja,) = uziemienie_sieci(EnergyNetworkModel.model_validate(snap))
        assert sekcja.wariant() == "izolowany"

    def test_opis_na_zrodle_wn_a_nie_na_szynach_ani_w_meta(self):
        snap = _ok(
            _gpz_wn(
                {"type": "directly_grounded"},
                zero_sequence={"enabled": True, "z0_z1_ratio": 3.2},
            )
        )
        source = snap["sources"][0]
        assert source["neutral_grounding"] == {"type": "directly_grounded"}
        assert source["z0_z1_ratio"] == 3.2
        assert all("grounding" not in b for b in snap["buses"])
        meta = snap["substations"][0]["meta"]
        assert "grounding" not in meta and "zero_sequence" not in meta

    @pytest.mark.parametrize(
        "grounding",
        [
            {"type": "resistor_grounded", "r_ohm": 12.0},
            {"type": "petersen_coil", "x_ohm": 150.0},
            {"type": "directly_grounded"},
        ],
    )
    def test_uziemiony_wn_bez_jawnego_z0_nie_wyprowadza_i_blokuje_e_w5_01(self, grounding):
        """Sieć 110 kV opisana jako uziemiona bez Z0 nie dostaje żadnej liczby (ani
        wyprowadzenia z transformatora) — walidator blokuje bieg kodem E-W5-01."""
        snap = _ok(_gpz_wn(grounding))
        source = snap["sources"][0]
        assert source.get("r0_ohm") is None and source.get("x0_ohm") is None
        assert source.get("z0_z1_ratio") is None
        assert "zero_sequence_provenance" not in source["materialized_params"]
        wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(snap))
        blokery = [i for i in wynik.issues if i.code == "E-W5-01"]
        assert [i.element_refs for i in blokery] == [[source["ref_id"]]]
        assert "impedancji zerowej" in blokery[0].message_pl

    def test_jawne_liczby_z0_wn_przechodza_walidacje(self):
        snap = _ok(
            _gpz_wn(
                {"type": "directly_grounded"},
                zero_sequence={"enabled": True, "z0_z1_ratio": 3.2},
            )
        )
        source = snap["sources"][0]
        assert "zero_sequence_provenance" not in source["materialized_params"]
        assert source.get("r0_ohm") is None
        wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(snap))
        assert not [i for i in wynik.issues if i.code == "E-W5-01"]

    def test_izolowany_wn_bez_z0_i_bez_blokady(self):
        snap = _ok(_gpz_wn({"type": "isolated"}))
        assert snap["sources"][0].get("r0_ohm") is None
        wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(snap))
        assert not [i for i in wynik.issues if i.code == "E-W5-01"]

    @pytest.mark.parametrize(
        "grounding",
        [
            {"type": "sztywne"},
            {"type": "resistor_grounded"},
            {"type": "resistor_grounded", "r_ohm": 0.0},
            {"type": "petersen_coil"},
            "resistor_grounded",
        ],
    )
    def test_odmowa_nazwana_dla_typu_spoza_slownika_i_braku_skladowej_dominujacej(self, grounding):
        result = _gpz_wn(grounding)
        assert result["error_code"] == "source.invalid_grounding"
        assert result.get("snapshot") is None

    def test_seed_identyfikatorow_bez_zmian_wzgledem_ladunku(self):
        a = _ok(_gpz_wn({"type": "resistor_grounded", "r_ohm": 12.0}))
        b = _ok(_gpz_wn({"type": "resistor_grounded", "r_ohm": 12.0}))
        assert [s["ref_id"] for s in a["sources"]] == [s["ref_id"] for s in b["sources"]]
        assert {k: v for k, v in a.items() if k != "header"} == {
            k: v for k, v in b.items() if k != "header"
        }


def _gpz_z_odcinkiem(screen_bonding: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    snap = _ok(_gpz(None))
    segment: dict[str, Any] = {"rodzaj": "KABEL", "dlugosc_m": 500, "catalog_ref": CATALOG_KABEL_SN}
    if screen_bonding is not None:
        segment["screen_bonding"] = screen_bonding
    result = _op(snap, "continue_trunk_segment_sn", {"segment": segment})
    return result, snap


def _stacja(snap: dict[str, Any], nn_earthing: dict[str, Any] | None) -> dict[str, Any]:
    segment = next(b for b in snap["branches"] if b.get("type") == "cable")
    payload: dict[str, Any] = {
        "segment_id": segment["ref_id"],
        "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "B",
            "station_name": "Stacja W5",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        # POLA-W-TORZE: pole wyjściowe niesie dalszą połówkę odcinka (zajęte) — odgałęzienie
        # ze stacji (test ekranu kabla odgałęzienia) wychodzi z wolnego pola odgałęźnego.
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "LINIA_ODG"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO_630},
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }
    if nn_earthing is not None:
        payload["nn_earthing"] = nn_earthing
    return _op(snap, "insert_station_on_segment_sn", payload)


class TestKreatorStacji:
    def test_uklad_nn_i_punkt_neutralny_na_transformatorze(self):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(result)
        snap = _ok(
            _stacja(
                snap, {"lv_system": "TN-S", "neutral_point": "petersen_coil", "lv_x_ohm": 150.0}
            )
        )
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        assert tr["lv_earthing_system"] == "TN-S"
        assert tr["lv_neutral"] == {"type": "petersen_coil", "x_ohm": 150.0}
        st = next(s for s in snap["substations"] if tr["ref_id"] in s["transformer_refs"])
        assert "nn_earthing_system" not in st["meta"]

    @pytest.mark.parametrize(
        ("nn_earthing", "kod"),
        [
            ({"lv_system": "TN-X"}, "station.invalid_nn_earthing_system"),
            ({"lv_system": "TN-S", "neutral_point": "solid"}, "station.invalid_grounding"),
            (
                {"lv_system": "TN-S", "neutral_point": "resistor_grounded"},
                "station.invalid_grounding",
            ),
            (
                {"lv_system": "TN-S", "neutral_point": "petersen_coil", "lv_r_ohm": 5.0},
                "station.invalid_grounding",
            ),
        ],
    )
    def test_odmowa_nazwana_zamiast_cichego_pominiecia(self, nn_earthing, kod):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(result)
        result = _stacja(snap, nn_earthing)
        assert result["error_code"] == kod
        assert result.get("snapshot") is None

    @pytest.mark.parametrize(
        ("tolerancja", "kod"),
        [
            ("PLUS_6", None),
            ("PLUS_10", None),
            (None, None),
            ("PLUS_8", "station.invalid_lv_voltage_tolerance"),
            ("+6 %", "station.invalid_lv_voltage_tolerance"),
        ],
    )
    def test_tolerancja_sieci_nn_na_transformatorze_stacji(self, tolerancja, kod):
        """Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: `nn_earthing.lv_voltage_tolerance` — wiersz nN
        tabeli 1 IEC 60909-0 (+6 %: c 1,05/0,95; +10 %: c 1,10/0,90) na transformatorze
        stacji, ten sam blok co układ sieci nN; brak = brak deklaracji (nie domyślka)."""
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(result)
        nn_earthing: dict[str, Any] = {"lv_system": "TN-C-S"}
        if tolerancja is not None:
            nn_earthing["lv_voltage_tolerance"] = tolerancja
        result = _stacja(snap, nn_earthing)
        if kod is not None:
            assert result["error_code"] == kod
            assert result.get("snapshot") is None
            return
        snap = _ok(result)
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        assert tr.get("lv_voltage_tolerance") == tolerancja

    def test_brak_bloku_zostawia_transformator_bez_ukladu_nie_domyslke(self):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(_stacja(_ok(result), None))
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        assert tr.get("lv_earthing_system") is None


class TestEkranKabla:
    def test_magistrala_odgalezienie_pierscien_i_podzial_odcinka(self):
        result, _ = _gpz_z_odcinkiem("both_ends")
        snap = _ok(result)
        kabel = next(b for b in snap["branches"] if b.get("type") == "cable")
        assert kabel["screen_bonding"] == "both_ends"
        # Podział odcinka przy wstawianiu stacji zachowuje deklarację na obu połówkach.
        snap = _ok(_stacja(snap, {"lv_system": "TN-C-S"}))
        kable = [
            b
            for b in snap["branches"]
            if b.get("type") == "cable" and b.get("catalog_ref") == CATALOG_KABEL_SN
        ]
        assert len(kable) >= 2 and all(k["screen_bonding"] == "both_ends" for k in kable)
        # Odgałęzienie od szyny SN stacji (jawny from_bus_ref, jak w kanonicznym teście flow).
        st = next(s for s in snap["substations"] if s["station_type"] != "gpz")
        szyna_sn = next(
            b
            for b in snap["buses"]
            if b["ref_id"] in st["bus_refs"] and 1.0 < b["voltage_kv"] <= 60.0
        )
        result = _op(
            snap,
            "start_branch_segment_sn",
            {
                "from_bus_ref": szyna_sn["ref_id"],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300,
                    "catalog_ref": CATALOG_KABEL_SN,
                    "screen_bonding": "cross_bonded",
                },
            },
        )
        snap = _ok(result)
        odg = next(b for b in snap["branches"] if b.get("screen_bonding") == "cross_bonded")
        assert odg["type"] == "cable"

    def test_linia_napowietrzna_z_ekranem_i_wartosc_spoza_slownika_sa_odmowa(self):
        snap = _ok(_gpz(None))
        result = _op(
            snap,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500,
                    "catalog_ref": "line-base-al-st-70",
                    "screen_bonding": "both_ends",
                }
            },
        )
        assert result["error_code"] == "segment.invalid_screen_bonding"
        result = _op(
            snap,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500,
                    "catalog_ref": CATALOG_KABEL_SN,
                    "screen_bonding": "trzystronne",
                }
            },
        )
        assert result["error_code"] == "segment.invalid_screen_bonding"

    def test_update_element_parameters_dopuszcza_screen_bonding_i_lv_earthing_system(self):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(_stacja(_ok(result), None))
        kabel = next(b for b in snap["branches"] if b.get("type") == "cable")
        snap = _ok(
            _op(
                snap,
                "update_element_parameters",
                {"element_ref": kabel["ref_id"], "parameters": {"screen_bonding": "single_end"}},
            )
        )
        assert (
            next(b for b in snap["branches"] if b["ref_id"] == kabel["ref_id"])["screen_bonding"]
            == "single_end"
        )
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        snap = _ok(
            _op(
                snap,
                "update_element_parameters",
                {"element_ref": tr["ref_id"], "parameters": {"lv_earthing_system": "TT"}},
            )
        )
        assert (
            next(t for t in snap["transformers"] if t["ref_id"] == tr["ref_id"])[
                "lv_earthing_system"
            ]
            == "TT"
        )


class TestRolaUziemnika:
    def test_kreator_pola_pisze_earthing_role_na_uziemniku(self):
        snap = _ok(_gpz(None))
        st = snap["substations"][0]
        bus_ref = st["gpz_sections"][0]["bus_ref"]
        result = _op(
            snap,
            "add_sn_bay",
            {
                "bus_ref": bus_ref,
                "station_ref": st["ref_id"],
                "bay_role": "OUT",
                "apparatus_kind": "BREAKER",
                "bay_template_ref": "bay_template_line_out",
                "earthing_role": "cable_screen",
            },
        )
        snap = _ok(result)
        st = snap["substations"][0]
        pole = pola_stacji(snap, st["ref_id"])[-1]
        uziemniki = [d for d in pole.get("primary_devices", []) if d["kind"] == "ES"]
        assert uziemniki and all(d["earthing_role"] == "cable_screen" for d in uziemniki)

    def test_rola_spoza_slownika_i_pole_bez_uziemnika_to_odmowa(self):
        snap = _ok(_gpz(None))
        st = snap["substations"][0]
        bus_ref = st["gpz_sections"][0]["bus_ref"]
        base = {
            "bus_ref": bus_ref,
            "station_ref": st["ref_id"],
            "bay_role": "OUT",
            "apparatus_kind": "BREAKER",
        }
        result = _op(
            snap,
            "add_sn_bay",
            {**base, "bay_template_ref": "bay_template_line_out", "earthing_role": "ekran"},
        )
        assert result["error_code"] == "sn.bay_earthing_role_invalid"
        result = _op(snap, "add_sn_bay", {**base, "earthing_role": "cable_screen"})
        assert result["error_code"] == "sn.bay_earthing_role_without_es"


def test_kabel_nn_niesie_screen_bonding():
    result, _ = _gpz_z_odcinkiem()
    snap = _ok(_stacja(_ok(result), {"lv_system": "TN-C-S"}))
    szyna_nn = next(b for b in snap["buses"] if b["voltage_kv"] < 1.0)
    result = _op(
        snap,
        "add_nn_cable_segment",
        {
            "from_bus_ref": szyna_nn["ref_id"],
            "length_m": 120,
            "catalog_ref": "kab_nn_4x120_al",
            "screen_bonding": "single_end",
        },
    )
    snap = _ok(result)
    kabel = next(b for b in snap["branches"] if b.get("catalog_ref") == "kab_nn_4x120_al")
    assert kabel["screen_bonding"] == "single_end"
    assert copy.deepcopy(kabel)["screen_bonding"] == "single_end"


def _transformator_na_gpz(**extra: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Transformator SN/nN z katalogu na szynie SN GPZ (nowa szyna nN przez `lv_voltage_kv`)."""
    snap = _ok(_gpz(None))
    szyna_sn = next(b for b in snap["buses"] if abs(float(b["voltage_kv"]) - 15.0) < 1e-9)
    payload: dict[str, Any] = {
        "hv_bus_ref": szyna_sn["ref_id"],
        "lv_voltage_kv": 0.4,
        "transformer_catalog_ref": CATALOG_TRAFO_630,
    }
    payload.update(extra)
    return _op(snap, "add_transformer_sn_nn", payload), snap


class TestSlownikiPrzyZapisie:
    """W5-A p. 3: grupa połączeń ze słownika IEC 60076-1 przy ZAPISIE (kreator transformatora
    ui2 + korekta ekspercka `update_element_parameters`), a razem z nią cała klasa pól
    słownikowych transformatora (układ nN, punkt neutralny) i kabla (ekran) — ten sam
    predykat co kreatory i walidator, nie luźniejsza droga zapisu."""

    def test_kreator_bez_grupy_bierze_grupe_z_katalogu(self):
        result, _ = _transformator_na_gpz()
        snap = _ok(result)
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        assert tr["vector_group"] == tr["materialized_params"]["vector_group"] == "Dyn11"

    def test_kreator_jawna_grupa_ze_slownika_nadpisuje_katalog_i_zostawia_slad(self):
        result, _ = _transformator_na_gpz(vector_group="Yzn5")
        snap = _ok(result)
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        assert tr["vector_group"] == "Yzn5"
        assert tr["materialized_params"]["vector_group"] == "Dyn11"

    def test_kreator_grupa_spoza_slownika_to_odmowa_nazwana(self):
        result, _ = _transformator_na_gpz(vector_group="Dxy99")
        assert result["error_code"] == "transformer.invalid_vector_group"

    @pytest.mark.parametrize(
        ("parametry", "kod"),
        [
            ({"vector_group": "Dyn13"}, "transformer.invalid_vector_group"),
            ({"lv_earthing_system": "TN-X"}, "transformer.invalid_lv_earthing_system"),
            (
                {"lv_neutral": {"type": "resistor_grounded"}},
                "transformer.invalid_neutral_grounding",
            ),
            ({"hv_neutral": {"type": "sztywne"}}, "transformer.invalid_neutral_grounding"),
            ({"hv_neutral": "isolated"}, "transformer.invalid_neutral_grounding"),
        ],
    )
    def test_korekta_ekspercka_transformatora_odrzuca_wartosc_spoza_slownika(self, parametry, kod):
        result, _ = _transformator_na_gpz()
        snap = _ok(result)
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        odmowa = _op(
            snap,
            "update_element_parameters",
            {"element_ref": tr["ref_id"], "parameters": parametry},
        )
        assert odmowa["error_code"] == kod

    def test_korekta_ekspercka_transformatora_przyjmuje_wartosci_ze_slownika(self):
        result, _ = _transformator_na_gpz()
        snap = _ok(result)
        tr = next(t for t in snap["transformers"] if t["ulv_kv"] < 1.0)
        po = _ok(
            _op(
                snap,
                "update_element_parameters",
                {
                    "element_ref": tr["ref_id"],
                    "parameters": {
                        "vector_group": "Dyn5",
                        "lv_earthing_system": "IT",
                        "lv_neutral": {"type": "resistor_grounded", "r_ohm": 5.0},
                    },
                },
            )
        )
        tr_po = next(t for t in po["transformers"] if t["ref_id"] == tr["ref_id"])
        assert tr_po["vector_group"] == "Dyn5"
        assert tr_po["lv_earthing_system"] == "IT"
        assert tr_po["lv_neutral"] == {"type": "resistor_grounded", "r_ohm": 5.0}
        EnergyNetworkModel.model_validate(po)  # model wczytuje się bez awarii literału

    @pytest.mark.parametrize("wartosc", ["foo", "jednostronne"])
    def test_korekta_ekspercka_kabla_odrzuca_ekran_spoza_slownika(self, wartosc):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(result)
        kabel = next(b for b in snap["branches"] if b.get("type") == "cable")
        odmowa = _op(
            snap,
            "update_element_parameters",
            {"element_ref": kabel["ref_id"], "parameters": {"screen_bonding": wartosc}},
        )
        assert odmowa["error_code"] == "segment.invalid_screen_bonding"

    def test_korekta_ekspercka_kabla_przyjmuje_ekran_ze_slownika(self):
        result, _ = _gpz_z_odcinkiem()
        snap = _ok(result)
        kabel = next(b for b in snap["branches"] if b.get("type") == "cable")
        po = _ok(
            _op(
                snap,
                "update_element_parameters",
                {"element_ref": kabel["ref_id"], "parameters": {"screen_bonding": "both_ends"}},
            )
        )
        kabel_po = next(b for b in po["branches"] if b["ref_id"] == kabel["ref_id"])
        assert kabel_po["screen_bonding"] == "both_ends"
