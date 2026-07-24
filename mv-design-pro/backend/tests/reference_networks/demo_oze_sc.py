"""
Siec DEMONSTRACYJNA DEMO-OZE-SC: magistrala SN od GPZ, na ktorej KAZDA stacja
ma INNA konfiguracje OZE (z realnych mozliwosci modelu), plus stacja odniesienia
bez OZE. Deterministyczna, solver-valid (SC zbiega na kazdej szynie SN).

REUZYCIE: siec budowana wylacznie sekwencja kanonicznych operacji domenowych
(``execute_domain_operation``), na helperach i katalogach zweryfikowanych w
``sld_substrate_52s`` (magistrala + stacje + DER nn_side + obciazenia) oraz na
kompletnym torze DER-SN z transformatorem blokowym (W2c, ``der_topology`` /
``connection_level='sn'``) zaczerpnietym z ``test_der_sn_documents_api``.

ZERO fabrykacji: kazda konfiguracja OZE to realne elementy ENM (converter
sources materializowane przez ``add_converter_source``); zadna wielkosc nie jest
tu liczona (fizyka wylacznie w solverze — bieg SC uruchamiany osobno).
"""

from __future__ import annotations

from typing import Any

# Reuse: proven helpers, catalog constants i tor domenowy z substratu 52s.
from tests.reference_networks.sld_substrate_52s import (
    _CABLE_REF,
    _GPZ_SOURCE_REF,
    _LINE_REF,
    _TRAFO_DER_LARGE,
    _TRAFO_STANDARD,
    _add_der,
    _add_station_load,
    _add_trunk_station,
    _cable_segment_refs,
    _empty_enm,
    _latest_station_ref,
    _nn_bus_ref,
    _op,
    _snapshot_hash,
)

# --- Katalogi OZE (rodzina conv-*-nn-*-0p4kv + pozycja 50 kW), zweryfikowane
#     w mv_converter_catalog.py; namespace jak w substracie. ------------------
_PV_NS = "ZRODLO_NN_PV"
_BESS_NS = "ZRODLO_NN_BESS"
_FW_NS = "CONVERTER"

_PV_0P5 = "conv-pv-nn-0p5mw-0p4kv"  # PV 0.5 MW / 0.4 kV
_PV_1P0 = "conv-pv-nn-1mw-0p4kv"  # PV 1.0 MW / 0.4 kV (duza PV)
_PV_50KW = "pv_inv_catalog_50"  # PV 0.05 MW / 0.4 kV (mala PV)
_BESS_0P5 = "conv-bess-nn-0p5mw-0p4kv"  # BESS 0.5 MW / 0.4 kV
_BESS_1P0 = "conv-bess-nn-1mw-0p4kv"  # BESS 1.0 MW / 0.4 kV (duza BESS)
_FW_2P0 = "conv-wind-nn-2mw-0p4kv"  # farma wiatrowa 2.0 MW / 0.4 kV

# --- Tor DER-SN (W2c): transformator blokowy + dedykowane pole SN. ----------
_TR_BLOCK = "tr-sn-nn-15-04-1000kva-dyn11"
_TR_BLOCK_NS = "TRAFO_SN_NN"
_APARAT_SN = "ap-sn-cb-630"
_APARAT_SN_NS = "APARAT_SN"
_CABLE_SN = "cable-base-epr-al-1c-240"
_CABLE_SN_NS = "KABEL_SN"


def _sn_bus_ref(enm: dict[str, Any], station_ref: str) -> str | None:
    """Zwroc szyne SN (>=1 kV) stacji — punkt przylaczenia dedykowanego pola SN (W2c)."""
    for stn in enm.get("substations", []):
        if stn.get("ref_id") != station_ref:
            continue
        for bus_ref in stn.get("bus_refs", []):
            for bus in enm.get("buses", []):
                if (
                    bus.get("ref_id") == bus_ref
                    and (bus.get("voltage_kv") or 0.0) >= 1.0
                ):
                    return bus_ref
    return None


def _add_der_sn_block(
    enm: dict[str, Any],
    station_ref: str,
    technology: str,
    catalog_ref: str,
    catalog_namespace: str,
    power_mw: float,
    name: str,
) -> tuple[dict[str, Any], str | None]:
    """Dodaj DER po stronie SN przez transformator blokowy (tor W2c).

    Materializuje: szyna nN producenta -> TR blokowy 15/0.4 kV -> kabel SN ->
    pole zrodlowe SN na szynie SN stacji. Zwraca ``(new_enm, None)`` albo
    ``(old_enm, error)``.
    """
    sn_ref = _sn_bus_ref(enm, station_ref)
    if sn_ref is None:
        return enm, f"Brak szyny SN na stacji {station_ref}"
    payload = {
        "source_technology": technology,
        "connection_variant": "block_transformer",
        "station_ref": station_ref,
        "bus_nn_ref": sn_ref,
        "source_name": name,
        "quantity": 1,
        "power_setpoint_mw": power_mw,
        "catalog_binding": {
            "catalog_namespace": catalog_namespace,
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "materialized_params": {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": "2024.1",
            "un_kv": 0.4,
            "pmax_mw": power_mw,
            "sn_mva": round(power_mw * 1.1, 3),
        },
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": 0.4,
            "has_manufacturer_lv_switchgear": True,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": True,
            "block_transformer": {
                "rated_power_mva": 1.0,
                "primary_voltage_kv": 15.0,
                "secondary_voltage_kv": 0.4,
                "catalog_ref": _TR_BLOCK,
                "catalog_binding": {
                    "catalog_namespace": _TR_BLOCK_NS,
                    "catalog_item_id": _TR_BLOCK,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": sn_ref,
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": True,
                "earthing_switch": True,
                "surge_arrester": True,
                "protection_relay": True,
                "cable_head": True,
                "cable_length_km": 0.05,
                "apparatus_catalog_binding": {
                    "catalog_namespace": _APARAT_SN_NS,
                    "catalog_item_id": _APARAT_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_catalog_ref": _CABLE_SN,
                "cable_catalog_binding": {
                    "catalog_namespace": _CABLE_SN_NS,
                    "catalog_item_id": _CABLE_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
        },
    }
    from enm.domain_operations import execute_domain_operation

    result = execute_domain_operation(
        enm_dict=enm, op_name="add_converter_source", payload=payload
    )
    if result.get("error"):
        return enm, result["error"]
    snapshot = result.get("snapshot")
    if snapshot is None:
        return enm, "brak snapshotu"
    return snapshot, None


# ---------------------------------------------------------------------------
# Enumeracja konfiguracji OZE (KAZDA stacja inna). ``trafo`` = katalog TR stacji;
# ``builder`` przyjmuje (enm, station_ref) -> (enm, der_records | error).
# ``der_records`` to lista {tech, variant, catalog_ref, power_mw, name}.
# ---------------------------------------------------------------------------

_STATION_CONFIGS: list[dict[str, Any]] = [
    {
        "key": "PV_NN_05",
        "label_pl": "PV za transformatorem (nN, 0.5 MW)",
        "trafo": _TRAFO_STANDARD,
        "ders": [("PV", "nn_side", _PV_0P5, _PV_NS, 0.5)],
    },
    {
        "key": "BESS_NN_05",
        "label_pl": "Magazyn BESS za transformatorem (nN, 0.5 MW)",
        "trafo": _TRAFO_STANDARD,
        "ders": [("BESS", "nn_side", _BESS_0P5, _BESS_NS, 0.5)],
    },
    {
        "key": "FW_NN_2",
        "label_pl": "Farma wiatrowa za transformatorem (nN, 2.0 MW)",
        "trafo": _TRAFO_DER_LARGE,
        "ders": [("FW", "nn_side", _FW_2P0, _FW_NS, 2.0)],
    },
    {
        "key": "HYB_PV_BESS_NN",
        "label_pl": "Hybryda PV + BESS za transformatorem (nN, 0.5 + 0.5 MW)",
        "trafo": _TRAFO_STANDARD,
        "ders": [
            ("PV", "nn_side", _PV_0P5, _PV_NS, 0.5),
            ("BESS", "nn_side", _BESS_0P5, _BESS_NS, 0.5),
        ],
    },
    {
        "key": "PV_NN_1",
        "label_pl": "Duza PV za transformatorem (nN, 1.0 MW)",
        "trafo": _TRAFO_DER_LARGE,
        "ders": [("PV", "nn_side", _PV_1P0, _PV_NS, 1.0)],
    },
    {
        "key": "PV_NN_50KW",
        "label_pl": "Mala PV za transformatorem (nN, 0.05 MW)",
        "trafo": _TRAFO_STANDARD,
        "ders": [("PV", "nn_side", _PV_50KW, _PV_NS, 0.05)],
    },
    {
        "key": "PV_SN_BLOCK",
        "label_pl": "PV po stronie SN przez transformator blokowy (tor W2c)",
        "trafo": _TRAFO_STANDARD,
        "ders": [("PV", "block_transformer", _PV_0P5, _PV_NS, 0.5)],
    },
    {
        "key": "BESS_SN_BLOCK",
        "label_pl": "Magazyn BESS po stronie SN przez transformator blokowy (tor W2c)",
        "trafo": _TRAFO_STANDARD,
        "ders": [("BESS", "block_transformer", _BESS_0P5, _BESS_NS, 0.5)],
    },
    {
        "key": "HYB_FW_PV_NN",
        "label_pl": "Hybryda wiatr + PV za transformatorem (nN, 2.0 + 0.5 MW)",
        "trafo": _TRAFO_DER_LARGE,
        "ders": [
            ("FW", "nn_side", _FW_2P0, _FW_NS, 2.0),
            ("PV", "nn_side", _PV_0P5, _PV_NS, 0.5),
        ],
    },
    {
        "key": "BESS_NN_1",
        "label_pl": "Duzy magazyn BESS za transformatorem (nN, 1.0 MW)",
        "trafo": _TRAFO_DER_LARGE,
        "ders": [("BESS", "nn_side", _BESS_1P0, _BESS_NS, 1.0)],
    },
    {
        "key": "HYB_PV_BESS_FW_NN",
        "label_pl": "Potrojna hybryda PV + BESS + wiatr za transformatorem (nN)",
        "trafo": _TRAFO_DER_LARGE,
        "ders": [
            ("PV", "nn_side", _PV_0P5, _PV_NS, 0.5),
            ("BESS", "nn_side", _BESS_0P5, _BESS_NS, 0.5),
            ("FW", "nn_side", _FW_2P0, _FW_NS, 2.0),
        ],
    },
    {
        "key": "BEZ_OZE",
        "label_pl": "Stacja odniesienia bez OZE (tylko odbior)",
        "trafo": _TRAFO_STANDARD,
        "ders": [],
    },
]


def _new_generator_refs(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """Refy generatorow dodanych miedzy dwoma snapshotami (kolejnosc stabilna)."""
    prev = {g.get("ref_id") for g in before.get("generators", [])}
    return [
        str(g.get("ref_id"))
        for g in after.get("generators", [])
        if g.get("ref_id") not in prev
    ]


def _attach_ders(
    enm: dict[str, Any], station_ref: str, config: dict[str, Any], seq: int
) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    """Dolacz wszystkie DER konfiguracji do stacji. Zwraca (enm, der_records, errors)."""
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for di, (tech, variant, cat, ns, power) in enumerate(config["ders"], start=1):
        name = f"{config['key']}_{tech}_{seq}_{di}"
        if variant == "block_transformer":
            new_enm, err = _add_der_sn_block(
                enm, station_ref, tech, cat, ns, power, name
            )
        else:
            new_enm, err = _add_der(enm, station_ref, tech, cat, ns, power, name)
        if err:
            errors.append(f"{config['key']}/{tech}/{variant}: {err}")
            continue
        generator_refs = _new_generator_refs(enm, new_enm)
        enm = new_enm
        records.append(
            {
                "technology": tech,
                "variant": variant,
                "catalog_ref": cat,
                "power_mw": power,
                "source_name": name,
                "generator_refs": generator_refs,
            }
        )
    return enm, records, errors


def build_demo_oze_sc_network() -> dict[str, Any]:
    """Zbuduj siec demonstracyjna: GPZ + magistrala + 12 stacji, kazda z inna OZE.

    Zwraca ``dict`` z ``enm``, ``snapshot_hash``, lista ``station_configs``
    (stacja + opis konfiguracji + elementy DER) oraz metrykami. Deterministyczny:
    identyczny hash przy powtorzeniu (brak losowosci / czasu).
    """
    enm = _empty_enm()
    enm["header"]["name"] = "Siec demonstracyjna OZE + zwarcia"

    # 1. GPZ / zrodlo SN.
    enm = _op(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Demonstracyjny 15 kV",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _GPZ_SOURCE_REF,
        },
    )

    n_stations = len(_STATION_CONFIGS)

    # 2. Magistrala — n+1 odcinkow (mix kabel + linia napowietrzna), zeby zmiescic
    #    stacje po wstawieniu (kazde wstawienie dzieli odcinek).
    trunk_specs: list[tuple[str, int, str]] = []
    for i in range(n_stations + 1):
        if i % 5 == 4:
            trunk_specs.append(("NAPOWIETRZNA", 300 + 10 * (i % 7), _LINE_REF))
        else:
            trunk_specs.append(("KABEL", 200 + 10 * (i % 9), _CABLE_REF))
    for idx, (rodzaj, length_m, cat_ref) in enumerate(trunk_specs):
        enm = _op(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": rodzaj,
                    "dlugosc_m": length_m,
                    "name": f"Magistrala {idx + 1}",
                    "catalog_ref": cat_ref,
                },
            },
        )

    # 3. Wstaw 12 stacji rozlozonych na magistrali (rozmiar TR wg konfiguracji).
    station_refs: list[str] = []
    for i, config in enumerate(_STATION_CONFIGS):
        segs = _cable_segment_refs(enm)
        if not segs:
            break
        n_segs = len(segs)
        target_frac = (i + 1) / (n_stations + 1)
        seg_idx = max(0, min(n_segs - 1, int(target_frac * n_segs)))
        seg_ref = segs[seg_idx]
        enm = _add_trunk_station(
            enm, seg_ref, f"Stacja S{i + 1}", trafo_ref=config["trafo"]
        )
        ref = _latest_station_ref(enm)
        if ref:
            station_refs.append(ref)

    # 4. Dolacz OZE wg konfiguracji + obciazenie na kazdej stacji (bilans wezla
    #    decyduje o znaku rozplywu; tor SC nie zalezy od obciazen, ale siec jest
    #    dzieki temu pelnym, realistycznym feederem).
    station_configs: list[dict[str, Any]] = []
    der_errors: list[str] = []
    load_errors: list[str] = []
    for i, (station_ref, config) in enumerate(
        zip(station_refs, _STATION_CONFIGS, strict=False)
    ):
        enm, der_records, errs = _attach_ders(enm, station_ref, config, seq=i + 1)
        der_errors.extend(errs)

        p_kw = 400.0 if config["ders"] else 700.0
        enm, lerr = _add_station_load(
            enm, station_ref, p_kw, p_kw * 0.33, f"Odbior stacja S{i + 1}"
        )
        if lerr:
            load_errors.append(f"S{i + 1}: {lerr}")

        station_configs.append(
            {
                "station_ref": station_ref,
                "station_name": f"Stacja S{i + 1}",
                "config_key": config["key"],
                "config_label_pl": config["label_pl"],
                "transformer_catalog_ref": config["trafo"],
                "sn_bus_ref": _sn_bus_ref(enm, station_ref),
                "nn_bus_ref": _nn_bus_ref(enm, station_ref),
                "der": der_records,
            }
        )

    generators = enm.get("generators", [])
    der_types = {g.get("gen_type") for g in generators if g.get("gen_type")}

    return {
        "name": "DEMO_OZE_SC",
        "description": (
            "Siec demonstracyjna: magistrala SN od GPZ, kazda stacja z inna "
            "konfiguracja OZE + stacja odniesienia bez OZE."
        ),
        "enm": enm,
        "station_configs": station_configs,
        "station_count": len(station_refs),
        "config_count": len({c["config_key"] for c in station_configs}),
        "der_count": len(generators),
        "der_types": der_types,
        "der_errors": der_errors,
        "load_count": len(enm.get("loads", [])),
        "load_errors": load_errors,
        "snapshot_hash": _snapshot_hash(enm),
    }
