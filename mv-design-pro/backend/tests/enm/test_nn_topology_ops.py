"""P0.1 nN — topologia obwodów nN: operacje NN_NETWORK (karta P0.1).

Sieć nN = ISTNIEJĄCE generyczne elementy ENM (Bus/Cable/SwitchBranch/
FuseBranch/Load) w paśmie ≤1 kV — ZERO nowych klas Lv* (C §0 pkt 1). Testy
sprawdzają łańcuch RGnN → kabel → podrozdzielnica → odbiór, split/merge z
zachowaniem sumy długości, sekcje/sprzęgło, kopiowanie odpływu, usuwanie
elementów oraz inwalidację (revision bump + input_hash) po operacji
mutującej.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

#: Pozycje katalogowe nN istniejące w domyślnym katalogu (kab_nn_*/cb_nn_*,
#: `network_model/catalog/mv_auxiliary_catalog.py`) — te same referencje, co w
#: `tests/enm/test_brama_katalogowa_operacji_v2.py`.
REF_KABEL_NN = "kab_nn_4x120_al"
REF_KABEL_NN_2 = "kab_nn_yaky_4x150_al"
REF_APARAT_NN = "cb_nn_630a"
REF_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"

LITEROWKA = "-nie-istnieje"


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="nn_topology", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _wykonaj(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    return wynik


def _blad(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert wynik.get("error"), f"{nazwa}: operacja miała się nie powieść, ale przeszła"
    assert wynik.get("snapshot") is None
    return wynik


def _board(snapshot: dict[str, Any] | None = None, **nadpisania: Any) -> dict[str, Any]:
    payload = {"voltage_kv": 0.4, "name": "RGnN-1"}
    payload.update(nadpisania)
    return _wykonaj(snapshot or _pusty_enm(), "add_nn_distribution_board", payload)["snapshot"]


def _stacja(snapshot: dict[str, Any]) -> dict[str, Any]:
    stacje = [s for s in snapshot["substations"] if s.get("station_type") == "rozdzielnica_nn"]
    assert len(stacje) == 1
    return stacje[0]


def _branch_by_name(snapshot: dict[str, Any], name: str) -> dict[str, Any]:
    kandydaci = [b for b in snapshot["branches"] if b.get("name") == name]
    assert (
        len(kandydaci) == 1
    ), f"oczekiwano dokładnie jednej gałęzi '{name}', jest {len(kandydaci)}"
    return kandydaci[0]


# ---------------------------------------------------------------------------
# Łańcuch RGnN → kabel → podrozdzielnica → odbiór
# ---------------------------------------------------------------------------


def test_lancuch_rgnn_kabel_podrozdzielnica_odbior() -> None:
    """Scenariusz bazowy karty P0.1: RGnN → kabel nN → RGnN-2 → odbiór."""
    snap = _board(name="RGnN-1")
    stacja1 = _stacja(snap)
    bus1 = stacja1["bus_refs"][0]

    wynik = _wykonaj(
        snap,
        "add_nn_distribution_board",
        {
            "voltage_kv": 0.4,
            "name": "RGnN-2",
            "supply": {
                "from_bus_ref": bus1,
                "length_m": 80.0,
                "catalog_ref": REF_KABEL_NN,
                "name": "Kabel RGnN-1 → RGnN-2",
            },
        },
    )
    snap = wynik["snapshot"]
    stacje = [s for s in snap["substations"] if s.get("station_type") == "rozdzielnica_nn"]
    assert len(stacje) == 2
    stacja2 = next(s for s in stacje if s["name"] == "RGnN-2")
    bus2 = stacja2["bus_refs"][0]

    kabel = _branch_by_name(snap, "Kabel RGnN-1 → RGnN-2")
    assert kabel["from_bus_ref"] == bus1
    assert kabel["to_bus_ref"] == bus2
    assert kabel["catalog_ref"] == REF_KABEL_NN
    assert kabel["catalog_namespace"] == "KABEL_NN"
    assert kabel["materialized_params"]["r_ohm_per_km"] > 0

    # Odpływ nN legacy (nn_field_specs) na RGnN-2 + odbiór za nim.
    wynik = _wykonaj(snap, "add_nn_outgoing_field", {"bus_nn_ref": bus2, "field_name": "Odpływ K1"})
    snap = wynik["snapshot"]
    field_ref = wynik["changes"]["created_element_ids"][0]

    wynik = _wykonaj(
        snap,
        "add_nn_load",
        {"feeder_ref": field_ref, "active_power_kw": 12.0, "load_name": "Odbiór K1"},
    )
    snap = wynik["snapshot"]
    odbior = snap["loads"][-1]
    assert odbior["p_mw"] == pytest.approx(0.012)
    # Przed promocją migracji odbiór wisi wprost na szynie stacji (zachowanie
    # sprzed P0.1) — promocja i przeniesienie sprawdzone w
    # test_nn_field_specs_promocja.py.
    assert odbior["bus_ref"] == bus2


# ---------------------------------------------------------------------------
# add_nn_cable_segment
# ---------------------------------------------------------------------------


def test_add_nn_cable_segment_wymaga_wiazania_katalogowego() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _blad(snap, "add_nn_cable_segment", {"from_bus_ref": bus1, "length_m": 10.0})
    assert wynik["error_code"] == "catalog.ref_required"


def test_add_nn_cable_segment_odrzuca_nieistniejaca_pozycje_katalogowa() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _blad(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN + LITEROWKA},
    )
    assert wynik["error_code"] == "catalog.item_not_found"


def test_add_nn_cable_segment_tworzy_nowa_szyne_gdy_brak_to_bus_ref() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 25.5, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    utworzone = wynik["changes"]["created_element_ids"]
    assert len(utworzone) == 2  # nowa szyna + kabel
    kabel = snap["branches"][-1]
    assert kabel["from_bus_ref"] == bus1
    nowa_szyna = next(b for b in snap["buses"] if b["ref_id"] == kabel["to_bus_ref"])
    assert nowa_szyna["voltage_kv"] == pytest.approx(0.4)
    assert kabel["length_km"] == pytest.approx(0.0255)


def test_add_nn_cable_segment_do_istniejacej_szyny_tej_samej_woltowosci() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(snap, "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN-2"})
    snap = wynik["snapshot"]
    bus2 = next(s for s in snap["substations"] if s["name"] == "RGnN-2")["bus_refs"][0]

    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "to_bus_ref": bus2, "length_m": 15.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    assert wynik["changes"]["created_element_ids"] == [snap["branches"][-1]["ref_id"]]
    assert snap["branches"][-1]["to_bus_ref"] == bus2


def test_add_nn_cable_segment_odrzuca_niezgodnosc_napiec() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(snap, "add_nn_distribution_board", {"voltage_kv": 0.69, "name": "RGnN-069"})
    snap = wynik["snapshot"]
    bus_069 = next(s for s in snap["substations"] if s["name"] == "RGnN-069")["bus_refs"][0]

    wynik = _blad(
        snap,
        "add_nn_cable_segment",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus_069,
            "length_m": 15.0,
            "catalog_ref": REF_KABEL_NN,
        },
    )
    assert wynik["error_code"] == "nn.cable_voltage_mismatch"


def test_add_nn_cable_segment_odrzuca_szyne_poza_pasmem_nn() -> None:
    snap = _pusty_enm()
    wynik = _wykonaj(
        snap,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 100.0, "catalog_ref": REF_ZRODLO_SN},
    )
    snap = wynik["snapshot"]
    bus_sn = snap["buses"][0]["ref_id"]

    wynik = _blad(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus_sn, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    assert wynik["error_code"] == "nn.cable_from_bus_not_nn"


def test_add_nn_cable_segment_n_parallel_dzieli_impedancje_w_grafie() -> None:
    """n_parallel=1 (domyślnie) vs n_parallel=2 — Z_eff = Z/n w NetworkGraph."""
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]

    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {
            "from_bus_ref": bus1,
            "length_m": 100.0,
            "catalog_ref": REF_KABEL_NN,
            "name": "Pojedynczy",
        },
    )
    snap_1x = wynik["snapshot"]

    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {
            "from_bus_ref": bus1,
            "length_m": 100.0,
            "catalog_ref": REF_KABEL_NN,
            "n_parallel": 2,
            "name": "Podwojny",
        },
    )
    snap_2x = wynik["snapshot"]

    model_1x = EnergyNetworkModel.model_validate(snap_1x)
    model_2x = EnergyNetworkModel.model_validate(snap_2x)
    graph_1x = map_enm_to_network_graph(model_1x)
    graph_2x = map_enm_to_network_graph(model_2x)

    branch_1x = next(b for b in graph_1x.branches.values() if b.name == "Pojedynczy")
    branch_2x = next(b for b in graph_2x.branches.values() if b.name == "Podwojny")

    assert branch_2x.r_ohm_per_km == pytest.approx(branch_1x.r_ohm_per_km / 2.0)
    assert branch_2x.x_ohm_per_km == pytest.approx(branch_1x.x_ohm_per_km / 2.0)
    assert branch_2x.rated_current_a == pytest.approx(branch_1x.rated_current_a * 2.0)


# ---------------------------------------------------------------------------
# add_nn_distribution_board
# ---------------------------------------------------------------------------


def test_add_nn_distribution_board_wymaga_jawnego_napiecia() -> None:
    wynik = _blad(_pusty_enm(), "add_nn_distribution_board", {"name": "RGnN"})
    assert wynik["error_code"] == "nn.board_voltage_missing"


def test_add_nn_distribution_board_odrzuca_napiecie_poza_pasmem_nn() -> None:
    wynik = _blad(_pusty_enm(), "add_nn_distribution_board", {"voltage_kv": 15.0, "name": "RGnN"})
    assert wynik["error_code"] == "nn.board_voltage_not_nn"


def test_add_nn_distribution_board_tworzy_sekcje_1_domyslnie() -> None:
    snap = _board()
    stacja = _stacja(snap)
    assert stacja["nn_sections"] == [
        {
            "section_id": stacja["nn_sections"][0]["section_id"],
            "order": 1,
            "bus_ref": stacja["bus_refs"][0],
            "coupler_ref": None,
            "incoming_refs": [],
        }
    ]


def test_add_nn_distribution_board_z_zasileniem_bledne_propaguje_blad() -> None:
    """Zasilenie z nieistniejącej pozycji katalogowej — cała operacja odrzucona, ZERO śladu."""
    wynik = _blad(
        _pusty_enm(),
        "add_nn_distribution_board",
        {
            "voltage_kv": 0.4,
            "name": "RGnN",
            "supply": {
                "from_bus_ref": "nie-istnieje",
                "length_m": 10.0,
                "catalog_ref": REF_KABEL_NN,
            },
        },
    )
    assert wynik["error_code"] == "nn.cable_from_bus_not_found"


# ---------------------------------------------------------------------------
# add_nn_switch_device
# ---------------------------------------------------------------------------


def _dwie_szyny_nn(snap: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    bus2 = snap["branches"][-1]["to_bus_ref"]
    return bus1, bus2, snap


def test_add_nn_switch_device_switch_i_fuse() -> None:
    snap = _board()
    bus1, bus2, snap = _dwie_szyny_nn(snap)

    wynik = _wykonaj(
        snap,
        "add_nn_switch_device",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus2,
            "device_class": "switch",
            "catalog_ref": REF_APARAT_NN,
        },
    )
    snap = wynik["snapshot"]
    aparat = snap["branches"][-1]
    assert aparat["type"] == "switch"
    assert aparat["catalog_ref"] == REF_APARAT_NN
    assert aparat["catalog_namespace"] == "APARAT_NN"
    assert aparat["r_ohm"] == 0.0

    wynik = _wykonaj(
        snap,
        "add_nn_distribution_board",
        {"voltage_kv": 0.4, "name": "RGnN-3"},
    )
    snap2 = wynik["snapshot"]
    bus3 = next(s for s in snap2["substations"] if s["name"] == "RGnN-3")["bus_refs"][0]
    wynik = _wykonaj(
        snap2,
        "add_nn_switch_device",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus3,
            "device_class": "fuse",
            "catalog_ref": REF_APARAT_NN,
        },
    )
    bezpiecznik = wynik["snapshot"]["branches"][-1]
    assert bezpiecznik["type"] == "fuse"


def test_add_nn_switch_device_odrzuca_rozne_pasma_napiecia() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(snap, "add_nn_distribution_board", {"voltage_kv": 0.69, "name": "RGnN-069"})
    snap = wynik["snapshot"]
    bus_069 = next(s for s in snap["substations"] if s["name"] == "RGnN-069")["bus_refs"][0]

    wynik = _blad(
        snap,
        "add_nn_switch_device",
        {"from_bus_ref": bus1, "to_bus_ref": bus_069, "catalog_ref": REF_APARAT_NN},
    )
    assert wynik["error_code"] == "nn.switch_voltage_mismatch"


def test_add_nn_switch_device_odrzuca_samopetle() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _blad(
        snap,
        "add_nn_switch_device",
        {"from_bus_ref": bus1, "to_bus_ref": bus1, "catalog_ref": REF_APARAT_NN},
    )
    assert wynik["error_code"] == "nn.switch_self_loop"


def test_add_nn_switch_device_wymaga_wiazania_katalogowego() -> None:
    snap = _board()
    bus1, bus2, snap = _dwie_szyny_nn(snap)
    wynik = _blad(snap, "add_nn_switch_device", {"from_bus_ref": bus1, "to_bus_ref": bus2})
    assert wynik["error_code"] == "catalog.ref_required"


# ---------------------------------------------------------------------------
# add_nn_section_coupler
# ---------------------------------------------------------------------------


def test_add_nn_section_coupler_tworzy_sekcje_i_sprzeglo() -> None:
    snap = _board()
    stacja = _stacja(snap)
    station_ref = stacja["ref_id"]
    bus1 = stacja["bus_refs"][0]

    wynik = _wykonaj(
        snap, "add_nn_section_coupler", {"station_ref": station_ref, "catalog_ref": REF_APARAT_NN}
    )
    snap = wynik["snapshot"]
    stacja = _stacja(snap)
    sekcje = sorted(stacja["nn_sections"], key=lambda s: s["order"])
    assert [s["order"] for s in sekcje] == [1, 2]
    assert sekcje[0]["bus_ref"] == bus1
    assert sekcje[0]["coupler_ref"] is None
    assert sekcje[1]["coupler_ref"] is not None

    sprzeglo = next(b for b in snap["branches"] if b["ref_id"] == sekcje[1]["coupler_ref"])
    assert sprzeglo["type"] == "bus_coupler"
    assert sprzeglo["from_bus_ref"] == bus1
    assert sprzeglo["to_bus_ref"] == sekcje[1]["bus_ref"]
    assert sprzeglo["catalog_ref"] == REF_APARAT_NN

    # Druga sekcja dokłada się na końcu (order rosnący).
    wynik = _wykonaj(
        snap, "add_nn_section_coupler", {"station_ref": station_ref, "catalog_ref": REF_APARAT_NN}
    )
    snap = wynik["snapshot"]
    sekcje = sorted(_stacja(snap)["nn_sections"], key=lambda s: s["order"])
    assert [s["order"] for s in sekcje] == [1, 2, 3]


def test_add_nn_section_coupler_odrzuca_stacje_zlego_typu() -> None:
    snap = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 100.0, "catalog_ref": REF_ZRODLO_SN},
    )["snapshot"]
    stacje_gpz = [s for s in snap["substations"] if s.get("station_type") == "gpz"]
    assert stacje_gpz
    wynik = _blad(
        snap,
        "add_nn_section_coupler",
        {"station_ref": stacje_gpz[0]["ref_id"], "catalog_ref": REF_APARAT_NN},
    )
    assert wynik["error_code"] == "nn.coupler_station_wrong_type"


# ---------------------------------------------------------------------------
# split_nn_segment / merge_nn_segments
# ---------------------------------------------------------------------------


def test_split_nn_segment_zachowuje_sume_dlugosci() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 100.0, "catalog_ref": REF_KABEL_NN, "name": "Odcinek"},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _wykonaj(snap, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": 37.0})
    snap = wynik["snapshot"]

    assert segment_ref not in [b["ref_id"] for b in snap["branches"]]
    lewy = _branch_by_name(snap, "Odcinek (A)")
    prawy = _branch_by_name(snap, "Odcinek (B)")
    assert lewy["length_km"] == pytest.approx(0.037)
    assert prawy["length_km"] == pytest.approx(0.063)
    assert lewy["length_km"] + prawy["length_km"] == pytest.approx(0.1)
    assert lewy["catalog_ref"] == REF_KABEL_NN
    assert prawy["catalog_ref"] == REF_KABEL_NN
    assert lewy["to_bus_ref"] == prawy["from_bus_ref"]


@pytest.mark.parametrize("split_at_m", [0.0, -5.0, 100.0, 150.0])
def test_split_nn_segment_odrzuca_zly_zakres(split_at_m: float) -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 100.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _blad(snap, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": split_at_m})
    assert wynik["error_code"] == "nn.split_at_out_of_range"


def test_merge_nn_segments_odwraca_split() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 100.0, "catalog_ref": REF_KABEL_NN, "name": "Odcinek"},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    snap = _wykonaj(snap, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": 40.0})[
        "snapshot"
    ]
    lewy = _branch_by_name(snap, "Odcinek (A)")
    prawy = _branch_by_name(snap, "Odcinek (B)")
    mid_bus = lewy["to_bus_ref"]
    liczba_szyn_przed = len(snap["buses"])

    wynik = _wykonaj(
        snap,
        "merge_nn_segments",
        {"segment_a_ref": lewy["ref_id"], "segment_b_ref": prawy["ref_id"]},
    )
    snap = wynik["snapshot"]

    assert lewy["ref_id"] not in [b["ref_id"] for b in snap["branches"]]
    assert prawy["ref_id"] not in [b["ref_id"] for b in snap["branches"]]
    assert mid_bus not in [b["ref_id"] for b in snap["buses"]]
    assert len(snap["buses"]) == liczba_szyn_przed - 1

    scalony = snap["branches"][-1]
    assert scalony["length_km"] == pytest.approx(0.1)
    assert scalony["from_bus_ref"] == bus1
    assert scalony["catalog_ref"] == REF_KABEL_NN


def test_merge_nn_segments_odrzuca_gdy_wspolna_szyna_ma_inne_przylacza() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 100.0, "catalog_ref": REF_KABEL_NN, "name": "Odcinek"},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]
    snap = _wykonaj(snap, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": 40.0})[
        "snapshot"
    ]
    lewy = _branch_by_name(snap, "Odcinek (A)")
    prawy = _branch_by_name(snap, "Odcinek (B)")
    mid_bus = lewy["to_bus_ref"]

    # Odbiór na szynie pośredniej (dołożony wprost, bez pośrednictwa
    # add_nn_outgoing_field — ta szyna nie jest zarejestrowana w żadnej stacji,
    # co jest orzeczeniem osobnym od walidacji scalania) — scalenie musi zostać
    # odrzucone.
    snap["loads"].append(
        {
            "ref_id": "load-na-szynie-posredniej",
            "name": "Odbiór na szynie pośredniej",
            "bus_ref": mid_bus,
            "p_mw": 0.003,
            "q_mvar": 0.0,
            "model": "pq",
            "tags": [],
            "meta": {},
        }
    )

    wynik = _blad(
        snap,
        "merge_nn_segments",
        {"segment_a_ref": lewy["ref_id"], "segment_b_ref": prawy["ref_id"]},
    )
    assert wynik["error_code"] == "nn.merge_shared_bus_not_isolated"


def test_merge_nn_segments_odrzuca_rozne_pozycje_katalogowe() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 50.0, "catalog_ref": REF_KABEL_NN, "name": "A"},
    )
    snap = wynik["snapshot"]
    bus_mid = snap["branches"][-1]["to_bus_ref"]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus_mid, "length_m": 30.0, "catalog_ref": REF_KABEL_NN_2, "name": "B"},
    )
    snap = wynik["snapshot"]
    a = _branch_by_name(snap, "A")
    b = _branch_by_name(snap, "B")

    wynik = _blad(
        snap, "merge_nn_segments", {"segment_a_ref": a["ref_id"], "segment_b_ref": b["ref_id"]}
    )
    assert wynik["error_code"] == "nn.merge_catalog_mismatch"


# ---------------------------------------------------------------------------
# set_nn_cable_laying_conditions
# ---------------------------------------------------------------------------


def test_set_nn_cable_laying_conditions_zapisuje_i_czysci_meta() -> None:
    """Karta P0.5a (G-08/G-D1): payload nN jest TABLICOWY (środowisko/izolacja/
    temperatura/obwody/rezystywność), nie nazwanym zestawem SN (`wlasne` +
    f_grunt/f_wiazka/f_grupa) — do karty P0.5a operacja błędnie delegowała do
    walidatora SN (regula KLASA NIE INSTANCJA). Intencja testu bez zmian: zapis
    trafia do meta, jawny powrót do warunków katalogowych czyści meta.
    """
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 20.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _wykonaj(
        snap,
        "set_nn_cable_laying_conditions",
        {
            "segment_ref": segment_ref,
            "cable_laying_conditions": {
                "environment": "grunt",
                "insulation": "XLPE",
                "ambient_temperature_c": 20.0,
                "circuit_count": 2,
                "soil_thermal_resistivity_km_w": 1.5,
            },
        },
    )
    snap = wynik["snapshot"]
    kabel = next(b for b in snap["branches"] if b["ref_id"] == segment_ref)
    warunki = kabel["meta"]["cable_laying_conditions"]
    assert warunki["environment"] == "grunt"
    assert warunki["insulation"] == "XLPE"
    assert warunki["circuit_count"] == 2
    assert warunki["soil_thermal_resistivity_km_w"] == 1.5

    # Jawny powrót do warunków katalogowych czyści meta.
    wynik = _wykonaj(
        snap,
        "set_nn_cable_laying_conditions",
        {"segment_ref": segment_ref, "cable_laying_conditions": "warunki_katalogowe"},
    )
    snap = wynik["snapshot"]
    kabel = next(b for b in snap["branches"] if b["ref_id"] == segment_ref)
    assert "cable_laying_conditions" not in kabel["meta"]


def test_set_nn_cable_laying_conditions_wymaga_pola_w_payloadzie() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 20.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _blad(snap, "set_nn_cable_laying_conditions", {"segment_ref": segment_ref})
    assert wynik["error_code"] == "nn.laying_conditions_missing"


def test_set_nn_cable_laying_conditions_odrzuca_nieznana_kombinacje() -> None:
    """Fail-closed: kombinacja spoza zweryfikowanego rejestru G-D1 (np. 5 obwodów w
    powietrzu — poza kartą P0.5a) jest odrzucona, nie cicho przyjęta jako katalogowa."""
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 20.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _blad(
        snap,
        "set_nn_cable_laying_conditions",
        {
            "segment_ref": segment_ref,
            "cable_laying_conditions": {
                "environment": "powietrze",
                "insulation": "PVC",
                "ambient_temperature_c": 30.0,
                "circuit_count": 5,
            },
        },
    )
    assert wynik["error_code"] == "nn.cable_laying_conditions_invalid"


def test_set_nn_cable_laying_conditions_odrzuca_stara_skladnie_sn() -> None:
    """Nazwany zestaw SN (`wlasne`) nie jest juz rozpoznawany dla kabla nN — payload
    SN-owy trafia w gałąź string/nieznana-nazwa, nie w obiekt opisu tablicowego."""
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 20.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    segment_ref = snap["branches"][-1]["ref_id"]

    wynik = _blad(
        snap,
        "set_nn_cable_laying_conditions",
        {
            "segment_ref": segment_ref,
            "cable_laying_conditions": {
                "set_name": "wlasne",
                "f_grunt": 0.9,
                "f_wiazka": 0.8,
                "f_grupa": 1.0,
                "opis_pl": "Ziemia, rząd 2 wiązek, głębokość 0,7 m",
            },
        },
    )
    assert wynik["error_code"] == "nn.cable_laying_conditions_invalid"


# ---------------------------------------------------------------------------
# remove_nn_element
# ---------------------------------------------------------------------------


def test_remove_nn_element_zakazuje_usuniecia_szyny_z_przylaczami() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]  # bus1 ma teraz przyłącze (kabel) — usunięcie musi być zakazane

    wynik = _blad(snap, "remove_nn_element", {"element_ref": bus1})
    assert wynik["error_code"] == "nn.remove_bus_has_connections"


def test_remove_nn_element_usuwa_galaz_i_potem_lisc() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    kabel_ref = snap["branches"][-1]["ref_id"]
    bus2 = snap["branches"][-1]["to_bus_ref"]

    wynik = _wykonaj(snap, "remove_nn_element", {"element_ref": kabel_ref})
    snap = wynik["snapshot"]
    assert kabel_ref not in [b["ref_id"] for b in snap["branches"]]
    assert bus2 in [
        b["ref_id"] for b in snap["buses"]
    ]  # szyna zostaje osierocona, nie kasowana kaskadowo

    wynik = _wykonaj(snap, "remove_nn_element", {"element_ref": bus2})
    snap = wynik["snapshot"]
    assert bus2 not in [b["ref_id"] for b in snap["buses"]]


def test_remove_nn_element_usuwa_odbior() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(snap, "add_nn_outgoing_field", {"bus_nn_ref": bus1, "field_name": "Odpływ"})
    snap = wynik["snapshot"]
    field_ref = wynik["changes"]["created_element_ids"][0]
    wynik = _wykonaj(snap, "add_nn_load", {"feeder_ref": field_ref, "active_power_kw": 2.0})
    snap = wynik["snapshot"]
    load_ref = snap["loads"][-1]["ref_id"]

    wynik = _wykonaj(snap, "remove_nn_element", {"element_ref": load_ref})
    snap = wynik["snapshot"]
    assert snap["loads"] == []


def test_remove_nn_element_element_nieistniejacy() -> None:
    wynik = _blad(_board(), "remove_nn_element", {"element_ref": "nie-istnieje"})
    assert wynik["error_code"] == "nn.remove_element_not_found"


# ---------------------------------------------------------------------------
# copy_nn_feeder
# ---------------------------------------------------------------------------


def test_copy_nn_feeder_kopiuje_poddrzewo_z_wiazaniami_katalogowymi() -> None:
    snap = _board()
    bus1, bus2, snap = _dwie_szyny_nn(snap)
    wynik = _wykonaj(
        snap,
        "add_nn_switch_device",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus2,
            "catalog_ref": REF_APARAT_NN,
            "name": "Aparat odpływowy",
        },
    )
    snap = wynik["snapshot"]
    aparat_ref = _branch_by_name(snap, "Aparat odpływowy")["ref_id"]

    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {
            "from_bus_ref": bus2,
            "length_m": 15.0,
            "catalog_ref": REF_KABEL_NN,
            "name": "Kabel odpływu",
        },
    )
    snap = wynik["snapshot"]

    liczba_szyn_przed = len(snap["buses"])
    liczba_galezi_przed = len(snap["branches"])

    wynik = _wykonaj(
        snap, "copy_nn_feeder", {"feeder_apparatus_ref": aparat_ref, "name": "Kopia F1"}
    )
    snap = wynik["snapshot"]

    assert len(snap["buses"]) == liczba_szyn_przed + 2  # bus2-kopia + koniec kabla-kopia
    assert len(snap["branches"]) == liczba_galezi_przed + 2  # aparat-kopia + kabel-kopia

    kopia_aparatu = _branch_by_name(snap, "Kopia F1 — Aparat odpływowy")
    assert kopia_aparatu["from_bus_ref"] == bus1  # ta sama szyna nadrzędna (upstream)
    assert kopia_aparatu["catalog_ref"] == REF_APARAT_NN
    assert kopia_aparatu["materialized_params"] is not None

    kopia_kabla = _branch_by_name(snap, "Kopia F1 — Kabel odpływu")
    assert kopia_kabla["from_bus_ref"] == kopia_aparatu["to_bus_ref"]
    assert kopia_kabla["catalog_ref"] == REF_KABEL_NN
    assert kopia_kabla["length_km"] == pytest.approx(0.015)


def test_copy_nn_feeder_kopiuje_odbior_z_przemapowanym_feeder_ref() -> None:
    snap = _board()
    bus1, bus2, snap = _dwie_szyny_nn(snap)
    wynik = _wykonaj(
        snap,
        "add_nn_switch_device",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus2,
            "catalog_ref": REF_APARAT_NN,
            "name": "Aparat odpływowy",
        },
    )
    snap = wynik["snapshot"]
    aparat_ref = _branch_by_name(snap, "Aparat odpływowy")["ref_id"]

    # Odbiór dołożony wprost na szynie odpływu (bus2), z `meta.feeder_ref`
    # wskazującym aparat odpływowy — TAKĄ referencją posługuje się promocja
    # `nn_field_specs` (wzorzec: `Load.meta.feeder_ref`, `enm/migrations/
    # nn_field_specs_promocja.py`). Sprawdzamy, że kopia poddrzewa przemapowuje
    # tę referencję na kopię aparatu, nie zostawia jej wskazującą oryginał.
    snap["loads"].append(
        {
            "ref_id": "load-k",
            "name": "Odbiór K",
            "bus_ref": bus2,
            "p_mw": 0.007,
            "q_mvar": 0.0,
            "model": "pq",
            "tags": [],
            "meta": {"feeder_ref": aparat_ref},
        }
    )

    wynik = _wykonaj(snap, "copy_nn_feeder", {"feeder_apparatus_ref": aparat_ref, "name": "Kopia"})
    snap = wynik["snapshot"]
    kopia_aparatu = _branch_by_name(snap, "Kopia — Aparat odpływowy")
    kopia_odbioru = next(ld for ld in snap["loads"] if ld["name"] == "Kopia — Odbiór K")
    assert kopia_odbioru["bus_ref"] == kopia_aparatu["to_bus_ref"]
    assert kopia_odbioru["p_mw"] == pytest.approx(0.007)
    assert kopia_odbioru["meta"]["feeder_ref"] == kopia_aparatu["ref_id"]


def test_copy_nn_feeder_wymaga_aparatu_laczeniowego() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    snap = wynik["snapshot"]
    kabel_ref = snap["branches"][-1]["ref_id"]

    wynik = _blad(snap, "copy_nn_feeder", {"feeder_apparatus_ref": kabel_ref})
    assert wynik["error_code"] == "nn.copy_feeder_wrong_root"


# ---------------------------------------------------------------------------
# Inwalidacja: revision bump + input_hash zmieniony po operacji mutującej
# ---------------------------------------------------------------------------


def test_add_nn_cable_segment_podbija_rewizje_i_input_hash() -> None:
    snap = _board()
    bus1 = _stacja(snap)["bus_refs"][0]
    model_przed = EnergyNetworkModel.model_validate(snap)
    rewizja_przed = model_przed.header.revision

    wynik = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus1, "length_m": 10.0, "catalog_ref": REF_KABEL_NN},
    )
    model_po = EnergyNetworkModel.model_validate(wynik["snapshot"])

    # `execute_domain_operation` samo nie podbija rewizji (robi to `set_enm` w
    # warstwie store/API) — ale snapshot MUSI się zmienić na tyle, że hash
    # kanoniczny (input_hash, ten sam algorytm co `set_enm`) jest inny; to
    # WŁAŚNIE ten sygnał czyta inwalidacja rewizji.
    from enm.hash import compute_input_hash

    assert compute_input_hash(model_po) != compute_input_hash(model_przed)
    assert model_po.header.revision >= rewizja_przed
