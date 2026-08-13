"""P0.1 nN — walidator topologii obwodów nN: E060–E064, W060, W062 (karta P0.1, C §5).

Każda reguła sprawdzona po pozytywnym (nie strzela) i negatywnym (strzela z
właściwym kodem) przypadku. LV-INV-08 (otwarty łącznik przerywa ścieżkę) — E060.
"""

from __future__ import annotations

from enm.migrations.nn_field_specs_promocja import META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Generator,
    Load,
    ProtectionAssignment,
    Source,
    Substation,
    SwitchBranch,
)
from enm.validator import ENMValidator

REF_KABEL_NN = "kab_nn_4x120_al"


def _model(**kwargs: object) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="nn_validator", defaults=ENMDefaults()), **kwargs
    )


def _codes(model: EnergyNetworkModel) -> set[str]:
    return {i.code for i in ENMValidator().validate(model).issues}


def _kabel_nn(
    ref_id: str,
    from_bus: str,
    to_bus: str,
    *,
    status: str = "closed",
    catalog_ref: str | None = REF_KABEL_NN,
    meta: dict | None = None,
) -> Cable:
    return Cable(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=from_bus,
        to_bus_ref=to_bus,
        status=status,  # type: ignore[arg-type]
        length_km=0.05,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.08,
        catalog_ref=catalog_ref,
        catalog_namespace="KABEL_NN" if catalog_ref else None,
        meta=meta or {},
    )


# ---------------------------------------------------------------------------
# E060 — ciągłość zasilania odbiorów/generatorów nN (LV-INV-01)
# ---------------------------------------------------------------------------


def test_e060_nie_strzela_gdy_odbior_ma_sciezke_do_zrodla() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        branches=[_kabel_nn("k1", "b0", "b1")],
        loads=[Load(ref_id="l1", name="l1", bus_ref="b1", p_mw=0.01, q_mvar=0.0)],
    )
    assert "E060" not in _codes(model)


def test_e060_strzela_gdy_odbior_odciety() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        loads=[Load(ref_id="l1", name="l1", bus_ref="b1", p_mw=0.01, q_mvar=0.0)],
    )
    issues = ENMValidator().validate(model).issues
    e060 = [i for i in issues if i.code == "E060"]
    assert len(e060) == 1
    assert e060[0].element_refs == ["l1", "b1"]
    assert e060[0].severity == "BLOCKER"


def test_e060_lv_inv_08_otwarty_lacznik_przerywa_sciezke() -> None:
    """LV-INV-08: status='open' filtrowany w adjacency — otwarty łącznik = brak ścieżki."""
    model_zamkniety = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        branches=[
            SwitchBranch(
                ref_id="sw1",
                name="sw1",
                type="switch",
                from_bus_ref="b0",
                to_bus_ref="b1",
                status="closed",
            )
        ],
        loads=[Load(ref_id="l1", name="l1", bus_ref="b1", p_mw=0.01, q_mvar=0.0)],
    )
    assert "E060" not in _codes(model_zamkniety)

    model_otwarty = model_zamkniety.model_copy(deep=True)
    model_otwarty.branches[0].status = "open"
    assert "E060" in _codes(model_otwarty)


def test_e060_strzela_dla_generatora_nn_bez_sciezki() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        generators=[Generator(ref_id="g1", name="g1", bus_ref="b1", p_mw=0.05)],
    )
    assert "E060" in _codes(model)


def test_e060_nie_dotyczy_pasma_sn() -> None:
    """Element SN bez ścieżki nie podlega E060 (to E003, inny mechanizm)."""
    model = _model(
        buses=[
            Bus(ref_id="bsn1", name="bsn1", voltage_kv=15.0),
            Bus(ref_id="bsn2", name="bsn2", voltage_kv=15.0),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="bsn1", model="thevenin", sk3_mva=1.0)],
        loads=[Load(ref_id="l1", name="l1", bus_ref="bsn2", p_mw=0.01, q_mvar=0.0)],
    )
    assert "E060" not in _codes(model)


# ---------------------------------------------------------------------------
# E061/W061 — wiązanie katalogowe gałęzi nN (LV-INV-12, C §4.2)
# ---------------------------------------------------------------------------


def test_e061_nie_strzela_gdy_galaz_ma_wiazanie() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[_kabel_nn("k1", "b0", "b1", catalog_ref=REF_KABEL_NN)],
    )
    assert "E061" not in _codes(model)
    assert "W061" not in _codes(model)


def test_e061_strzela_gdy_galaz_reczna_bez_wiazania() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[_kabel_nn("k1", "b0", "b1", catalog_ref=None)],
    )
    issues = ENMValidator().validate(model).issues
    e061 = [i for i in issues if i.code == "E061"]
    assert len(e061) == 1
    assert e061[0].severity == "BLOCKER"
    assert "W061" not in {i.code for i in issues}


def test_w061_zamiast_e061_dla_galezi_z_migracji_bez_wiazania() -> None:
    """Gałąź z automigracji promocji pól nN bez wiązania → W061, nie E061."""
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[
            _kabel_nn(
                "k1", "b0", "b1", catalog_ref=None, meta={META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA: True}
            )
        ],
    )
    issues = ENMValidator().validate(model).issues
    kody = {i.code for i in issues}
    assert "E061" not in kody
    assert "W061" in kody
    w061 = next(i for i in issues if i.code == "W061")
    assert w061.severity == "IMPORTANT"


def test_e061_dotyczy_takze_aparatow_nie_tylko_kabli() -> None:
    """Rozszerzenie ponad E009 (który sprawdza wyłącznie Cable/OverheadLine)."""
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[
            SwitchBranch(
                ref_id="sw1",
                name="sw1",
                type="switch",
                from_bus_ref="b0",
                to_bus_ref="b1",
                status="closed",
            )
        ],
    )
    assert "E061" in _codes(model)


def test_e061_nie_dotyczy_galezi_sn() -> None:
    model = _model(
        buses=[
            Bus(ref_id="bsn1", name="bsn1", voltage_kv=15.0),
            Bus(ref_id="bsn2", name="bsn2", voltage_kv=15.0),
        ],
        branches=[
            SwitchBranch(
                ref_id="sw1",
                name="sw1",
                type="switch",
                from_bus_ref="bsn1",
                to_bus_ref="bsn2",
                status="closed",
            )
        ],
    )
    assert "E061" not in _codes(model)


# ---------------------------------------------------------------------------
# E062 — mieszanie poziomów napięcia WEWNĄTRZ pasma nN (LV-INV-11)
# ---------------------------------------------------------------------------


def test_e062_nie_strzela_dla_tego_samego_napiecia() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[_kabel_nn("k1", "b0", "b1")],
    )
    assert "E062" not in _codes(model)


def test_e062_strzela_dla_04_kv_polaczonego_z_069_kv() -> None:
    """E020 grupuje CAŁE pasmo nN razem (0,4 i 0,69 kV = 'nN') — E062 zaostrza."""
    model = _model(
        buses=[
            Bus(ref_id="b04", name="b04", voltage_kv=0.4),
            Bus(ref_id="b069", name="b069", voltage_kv=0.69),
        ],
        branches=[_kabel_nn("k1", "b04", "b069")],
    )
    issues = ENMValidator().validate(model).issues
    kody = {i.code for i in issues}
    assert "E062" in kody
    assert "E020" not in kody  # E020 NIE łapie tego przypadku (to samo pasmo band-wise)


def test_e062_nie_strzela_gdy_rozdzielone_transformatorem() -> None:
    """E062 sprawdza WYŁĄCZNIE gałęzie (Cable/Switch/...); transformator jest dozwolony."""
    from enm.models import Transformer

    model = _model(
        buses=[
            Bus(ref_id="b04", name="b04", voltage_kv=0.4),
            Bus(ref_id="b069", name="b069", voltage_kv=0.69),
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="t1",
                hv_bus_ref="b069",
                lv_bus_ref="b04",
                sn_mva=0.1,
                uhv_kv=0.69,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=1.0,
                catalog_ref="dummy",
            )
        ],
    )
    assert "E062" not in _codes(model)


# ---------------------------------------------------------------------------
# E063 — układ uziemienia sieci nN stacji z odbiorami (IEC 60364-4-41)
# ---------------------------------------------------------------------------


def test_e063_nie_strzela_gdy_zadeklarowany_uklad_uziemienia() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        substations=[
            Substation(
                ref_id="st1",
                name="st1",
                station_type="rozdzielnica_nn",
                bus_refs=["b0"],
                meta={"nn_earthing_system": "TN-S"},
            )
        ],
        loads=[Load(ref_id="l1", name="l1", bus_ref="b0", p_mw=0.01, q_mvar=0.0)],
    )
    assert "E063" not in _codes(model)


def test_e063_strzela_gdy_brak_ukladu_uziemienia() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        substations=[
            Substation(ref_id="st1", name="st1", station_type="rozdzielnica_nn", bus_refs=["b0"])
        ],
        loads=[Load(ref_id="l1", name="l1", bus_ref="b0", p_mw=0.01, q_mvar=0.0)],
    )
    issues = ENMValidator().validate(model).issues
    e063 = [i for i in issues if i.code == "E063"]
    assert len(e063) == 1
    assert e063[0].element_refs == ["st1"]


def test_e063_nie_strzela_gdy_stacja_bez_odbiorow_nn() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        substations=[
            Substation(ref_id="st1", name="st1", station_type="rozdzielnica_nn", bus_refs=["b0"])
        ],
    )
    assert "E063" not in _codes(model)


# ---------------------------------------------------------------------------
# E064 — ProtectionAssignment.breaker_ref wskazujący nieistniejącą gałąź
# ---------------------------------------------------------------------------


def test_e064_nie_strzela_gdy_galaz_istnieje() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[
            SwitchBranch(
                ref_id="cb1",
                name="cb1",
                type="breaker",
                from_bus_ref="b0",
                to_bus_ref="b1",
                status="closed",
            )
        ],
        protection_assignments=[
            ProtectionAssignment(
                ref_id="pa1", name="pa1", breaker_ref="cb1", device_type="overcurrent"
            )
        ],
    )
    assert "E064" not in _codes(model)


def test_e064_strzela_gdy_galaz_nie_istnieje() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        protection_assignments=[
            ProtectionAssignment(
                ref_id="pa1", name="pa1", breaker_ref="cb-widmo", device_type="overcurrent"
            )
        ],
    )
    issues = ENMValidator().validate(model).issues
    e064 = [i for i in issues if i.code == "E064"]
    assert len(e064) == 1
    assert e064[0].element_refs == ["pa1", "cb-widmo"]


# ---------------------------------------------------------------------------
# W060 — kabel nN bez warunków ułożenia
# ---------------------------------------------------------------------------


def test_w060_nie_strzela_gdy_sa_warunki_ulozenia() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[
            _kabel_nn(
                "k1",
                "b0",
                "b1",
                meta={"cable_laying_conditions": {"set_name": "warunki_katalogowe_2"}},
            )
        ],
    )
    assert "W060" not in _codes(model)


def test_w060_strzela_gdy_brak_warunkow_ulozenia() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[_kabel_nn("k1", "b0", "b1")],
    )
    issues = ENMValidator().validate(model).issues
    w060 = [i for i in issues if i.code == "W060"]
    assert len(w060) == 1
    assert w060[0].severity == "IMPORTANT"


def test_w060_nie_dotyczy_aparatow() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        branches=[
            SwitchBranch(
                ref_id="sw1",
                name="sw1",
                type="switch",
                from_bus_ref="b0",
                to_bus_ref="b1",
                status="closed",
            )
        ],
    )
    assert "W060" not in _codes(model)


# ---------------------------------------------------------------------------
# W062 — równoległe źródła nN na jednej szynie bez sprzęgła/SZR
# ---------------------------------------------------------------------------


def test_w062_nie_strzela_dla_pojedynczego_zrodla() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
    )
    assert "W062" not in _codes(model)


def test_w062_strzela_dla_dwoch_zrodel_na_jednej_szynie() -> None:
    model = _model(
        buses=[Bus(ref_id="b0", name="b0", voltage_kv=0.4)],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        generators=[Generator(ref_id="g1", name="g1", bus_ref="b0", p_mw=0.05)],
    )
    issues = ENMValidator().validate(model).issues
    w062 = [i for i in issues if i.code == "W062"]
    assert len(w062) == 1
    assert w062[0].severity == "IMPORTANT"
    assert set(w062[0].element_refs) == {"b0", "s1", "g1"}


def test_w062_nie_strzela_gdy_zrodla_na_roznych_szynach() -> None:
    model = _model(
        buses=[
            Bus(ref_id="b0", name="b0", voltage_kv=0.4),
            Bus(ref_id="b1", name="b1", voltage_kv=0.4),
        ],
        sources=[Source(ref_id="s1", name="s1", bus_ref="b0", model="thevenin", sk3_mva=1.0)],
        generators=[Generator(ref_id="g1", name="g1", bus_ref="b1", p_mw=0.05)],
    )
    assert "W062" not in _codes(model)
