"""W5-A: reguły walidatora jednej reprezentacji uziemienia (E-W5-01..03, W-W5-01, E063).

Iloczyn cech: {źródło: strona SN / HV_110 × typ: isolated / grounded × liczby Z0: brak /
r0x0 / z0z1} × {transformator: grupa poprawna / spoza słownika × uziemienie na uzwojeniu
z literą N / bez litery × predykat R_N/X_N} × {kabel: screen_bonding = odniesienie /
inne / katalog bez odniesienia}. Każdy kod ma most do kanonu gotowości.
"""

from __future__ import annotations

from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Load,
    Source,
    Substation,
    Transformer,
)
from enm.validator import ENMValidator


def _model(**kwargs: object) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="w5", defaults=ENMDefaults()), **kwargs)


def _kody(model: EnergyNetworkModel, kod: str) -> list:
    return [i for i in ENMValidator().validate(model).issues if i.code == kod]


def _zrodlo(**over) -> Source:
    dane = {
        "ref_id": "src",
        "name": "GPZ",
        "bus_ref": "sn",
        "model": "short_circuit_power",
        "sk3_mva": 250.0,
        "rx_ratio": 0.1,
    }
    dane.update(over)
    return Source(**dane)


def _szyny() -> list[Bus]:
    return [
        Bus(ref_id="hv", name="hv", voltage_kv=110.0),
        Bus(ref_id="sn", name="sn", voltage_kv=15.0),
        Bus(ref_id="nn", name="nn", voltage_kv=0.4),
    ]


def _tr(**over) -> Transformer:
    dane = {
        "ref_id": "tr",
        "name": "tr",
        "hv_bus_ref": "sn",
        "lv_bus_ref": "nn",
        "sn_mva": 0.63,
        "uhv_kv": 15.0,
        "ulv_kv": 0.4,
        "uk_percent": 4.5,
        "pk_kw": 6.5,
        "vector_group": "Dyn11",
        "lv_earthing_system": "TN-S",
    }
    dane.update(over)
    return Transformer(**dane)


class TestEW501Zrodlo:
    def test_rezystor_bez_rn_i_dlawik_bez_xn(self):
        for cfg in (
            GroundingConfig(type="resistor_grounded"),
            GroundingConfig(type="petersen_coil", r_ohm=1.0),
        ):
            m = _model(
                buses=_szyny(), sources=[_zrodlo(neutral_grounding=cfg, r0_ohm=1.0, x0_ohm=2.0)]
            )
            problemy = _kody(m, "E-W5-01")
            assert len(problemy) == 1
            assert problemy[0].element_refs == ["src"]
            assert problemy[0].fix_action is not None
            assert problemy[0].fix_action.modal_type == "SourceModal"

    def test_izolowany_ze_skonczonym_z0_po_stronie_sn(self):
        for liczby in ({"r0_ohm": 0.1, "x0_ohm": 0.8}, {"z0_z1_ratio": 3.0}):
            m = _model(
                buses=_szyny(),
                sources=[_zrodlo(neutral_grounding=GroundingConfig(type="isolated"), **liczby)],
            )
            assert len(_kody(m, "E-W5-01")) == 1
        # Bez liczb: izolowany jest spójny.
        m = _model(
            buses=_szyny(), sources=[_zrodlo(neutral_grounding=GroundingConfig(type="isolated"))]
        )
        assert _kody(m, "E-W5-01") == []

    def test_uziemiony_bez_liczb_z0_po_stronie_sn(self):
        m = _model(
            buses=_szyny(),
            sources=[
                _zrodlo(neutral_grounding=GroundingConfig(type="resistor_grounded", r_ohm=12.0))
            ],
        )
        problemy = _kody(m, "E-W5-01")
        assert len(problemy) == 1 and "bez bocznika zerowego" in problemy[0].message_pl
        # Z liczbami — spójny.
        m = _model(
            buses=_szyny(),
            sources=[
                _zrodlo(
                    neutral_grounding=GroundingConfig(type="resistor_grounded", r_ohm=12.0),
                    z0_z1_ratio=3.0,
                )
            ],
        )
        assert _kody(m, "E-W5-01") == []

    def test_zrodlo_po_stronie_110_kv_nie_podlega_regule_opis_vs_liczby(self):
        m = _model(
            buses=_szyny(),
            sources=[
                _zrodlo(
                    bus_ref="hv",
                    source_side="HV_110",
                    neutral_grounding=GroundingConfig(type="isolated"),
                    z0_z1_ratio=3.0,
                )
            ],
        )
        assert _kody(m, "E-W5-01") == []


class TestEW501DrogaZerowaSnRownowaznikaWn:
    """Karta GPZ-MODEL: przy równoważniku 110 kV opis „uziemiony" punktu neutralnego SN
    wymaga drogi składowej zerowej po stronie SN w transformatorze WN/SN modelu — tej
    samej, którą czyta solver 1F (`build_transformer_zero_seq_model`).

    Iloczyn cech: {grupa TR WN/SN: Yd11 (SN trójkąt), YNd11 (SN trójkąt), Dyn11 (SN
    gwiazda uziem.), YNyn0 (droga szeregowa), Yyn0 (gwiazda WN bez N — otwarte)} ×
    {opis SN: uziemiony, izolowany} × {liczba TR: 1, 2 z różnymi grupami}."""

    @staticmethod
    def _tr_wn(ref: str, grupa: str, lv_neutral: GroundingConfig | None = None) -> Transformer:
        return _tr(
            ref_id=ref,
            name=ref,
            hv_bus_ref="hv",
            lv_bus_ref="sn",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=11.0,
            pk_kw=120.0,
            vector_group=grupa,
            lv_earthing_system=None,
            lv_neutral=lv_neutral,
        )

    @staticmethod
    def _opis(typ: str) -> GroundingConfig:
        if typ == "resistor_grounded":
            return GroundingConfig(type=typ, r_ohm=12.0)
        if typ == "petersen_coil":
            return GroundingConfig(type=typ, x_ohm=40.0)
        return GroundingConfig(type=typ)

    def _model_wn(
        self,
        grupy: tuple[str, ...],
        typ: str,
        lv_neutral: GroundingConfig | None = None,
    ) -> EnergyNetworkModel:
        return _model(
            buses=_szyny(),
            transformers=[
                self._tr_wn(f"tr{i}", g, lv_neutral) for i, g in enumerate(grupy, start=1)
            ],
            sources=[
                _zrodlo(bus_ref="hv", source_side="HV_110", neutral_grounding=self._opis(typ))
            ],
        )

    def test_uziemiony_bez_drogi_zerowej_sn_jest_blokada(self):
        for typ in ("resistor_grounded", "petersen_coil", "directly_grounded"):
            for grupy in (("Yd11",), ("YNd11",), ("Yyn0",), ("Yd11", "YNd11")):
                problemy = _kody(self._model_wn(grupy, typ), "E-W5-01")
                assert len(problemy) == 1, (typ, grupy)
                assert "nie daje drogi składowej zerowej po stronie SN" in problemy[0].message_pl
                assert problemy[0].element_refs[0] == "src"
                assert set(problemy[0].element_refs[1:]) == {
                    f"tr{i}" for i in range(1, len(grupy) + 1)
                }
                assert problemy[0].fix_action is not None
                assert problemy[0].fix_action.modal_type == "SourceModal"

    def test_droga_zerowa_z_innym_uziemieniem_niz_opis_jest_blokada(self):
        # Dyn11 bez konfiguracji punktu neutralnego: litera `n` = uziemienie bezpośrednie
        # (Z_N = 0) — opis „rezystor 12 Ω” mówi co innego niż fizyka 1F.
        problemy = _kody(self._model_wn(("Dyn11",), "resistor_grounded"), "E-W5-01")
        assert len(problemy) == 1
        assert "pracuje inaczej" in problemy[0].message_pl
        # Ten sam typ, inna rezystancja — też sprzeczność.
        inny_r = GroundingConfig(type="resistor_grounded", r_ohm=20.0)
        problemy = _kody(self._model_wn(("Dyn11",), "resistor_grounded", inny_r), "E-W5-01")
        assert len(problemy) == 1 and "R_N 20.0 Ω" in problemy[0].message_pl

    def test_uziemiony_z_ta_sama_droga_zerowa_sn_jest_spojny(self):
        rezystor = GroundingConfig(type="resistor_grounded", r_ohm=12.0)
        przypadki = (
            (("Dyn11",), "resistor_grounded", rezystor),
            (("YNyn0",), "directly_grounded", None),
            (("Dyn11",), "directly_grounded", None),
            # Wystarczy JEDEN transformator z drogą zerową SN o tym samym uziemieniu.
            (("Yd11", "Dyn11"), "directly_grounded", None),
        )
        for grupy, typ, lv in przypadki:
            assert _kody(self._model_wn(grupy, typ, lv), "E-W5-01") == [], (grupy, typ)

    def test_izolowany_przy_trojkacie_sn_jest_spojny(self):
        for grupy in (("Yd11",), ("YNd11",), ("Yyn0",), ("Yd11", "Yd11")):
            assert _kody(self._model_wn(grupy, "isolated"), "E-W5-01") == [], grupy

    def test_izolowany_przy_uziemionej_gwiezdzie_sn_jest_blokada(self):
        # Reguła w OBIE strony: „izolowany” przy Dyn11/YNyn0 (litera `n`, uziemienie
        # bezpośrednie w fizyce 1F) to ta sama sprzeczność opisu z fizyką.
        for grupy in (("Dyn11",), ("YNyn0",), ("Yd11", "Dyn11")):
            problemy = _kody(self._model_wn(grupy, "isolated"), "E-W5-01")
            assert len(problemy) == 1, grupy
            assert "opisany jako izolowany" in problemy[0].message_pl
            assert "bezpośrednio uziemiony" in problemy[0].message_pl

    def test_most_do_kanonu_gotowosci(self):
        assert "E-W5-01" in ODWZOROWANIE_WALIDATOR_NA_KANON


class TestEW502I03Transformator:
    def test_grupa_spoza_slownika(self):
        m = _model(buses=_szyny(), transformers=[_tr(vector_group="Dyn13")])
        problemy = _kody(m, "E-W5-02")
        assert len(problemy) == 1 and problemy[0].fix_action.modal_type == "TransformerModal"
        assert _kody(_model(buses=_szyny(), transformers=[_tr(vector_group=None)]), "E-W5-02") == []

    def test_uziemienie_na_uzwojeniu_bez_litery_n(self):
        # Dyn11: HV = D (bez N), LV = yn (z N).
        m = _model(
            buses=_szyny(), transformers=[_tr(hv_neutral=GroundingConfig(type="directly_grounded"))]
        )
        assert len(_kody(m, "E-W5-03")) == 1
        m = _model(
            buses=_szyny(), transformers=[_tr(lv_neutral=GroundingConfig(type="directly_grounded"))]
        )
        assert _kody(m, "E-W5-03") == []
        # Izolowany na D nie jest uziemieniem — brak zacisku niczego nie blokuje.
        m = _model(buses=_szyny(), transformers=[_tr(hv_neutral=GroundingConfig(type="isolated"))])
        assert _kody(m, "E-W5-03") == []
        # Grupa spoza słownika: E-W5-02, a E-W5-03 nie zgaduje litery.
        m = _model(
            buses=_szyny(),
            transformers=[
                _tr(vector_group="Dyn13", hv_neutral=GroundingConfig(type="directly_grounded"))
            ],
        )
        assert _kody(m, "E-W5-03") == [] and len(_kody(m, "E-W5-02")) == 1
        # Dy11 (LEGALNA grupa bez neutralnego nN): uziemienie strony nN nie ma zacisku.
        m = _model(
            buses=_szyny(),
            transformers=[
                _tr(vector_group="Dy11", lv_neutral=GroundingConfig(type="directly_grounded"))
            ],
        )
        assert len(_kody(m, "E-W5-03")) == 1 and _kody(m, "E-W5-02") == []

    def test_predykat_rn_xn_na_uzwojeniach(self):
        m = _model(
            buses=_szyny(), transformers=[_tr(lv_neutral=GroundingConfig(type="resistor_grounded"))]
        )
        problemy = _kody(m, "E-W5-01")
        assert len(problemy) == 1 and problemy[0].element_refs == ["tr"]


class TestWW501Kabel:
    def _kabel(self, bonding, odniesienie) -> Cable:
        return Cable(
            ref_id="c",
            name="c",
            from_bus_ref="sn",
            to_bus_ref="sn",
            length_km=1.0,
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.1,
            screen_bonding=bonding,
            materialized_params={"z0_reference_bonding": odniesienie} if odniesienie else {},
        )

    def test_rozjazd_i_brak_odniesienia_to_ostrzezenie_zgodnosc_milczy(self):
        assert (
            _kody(
                _model(buses=_szyny(), branches=[self._kabel("both_ends", "both_ends")]), "W-W5-01"
            )
            == []
        )
        assert (
            len(
                _kody(
                    _model(buses=_szyny(), branches=[self._kabel("single_end", "both_ends")]),
                    "W-W5-01",
                )
            )
            == 1
        )
        assert (
            len(_kody(_model(buses=_szyny(), branches=[self._kabel("both_ends", None)]), "W-W5-01"))
            == 1
        )
        assert _kody(_model(buses=_szyny(), branches=[self._kabel(None, None)]), "W-W5-01") == []


def test_e063_na_transformatorze_z_mostem_do_kanonu():
    m = _model(
        buses=_szyny(),
        transformers=[_tr(lv_earthing_system=None)],
        substations=[
            Substation(
                ref_id="st",
                name="st",
                station_type="mv_lv",
                bus_refs=["sn", "nn"],
                transformer_refs=["tr"],
            )
        ],
        loads=[Load(ref_id="l", name="l", bus_ref="nn", p_mw=0.01, q_mvar=0.0)],
    )
    problemy = _kody(m, "E063")
    assert len(problemy) == 1 and problemy[0].element_refs == ["tr", "st"]


def test_kazdy_kod_w5_ma_kanon_gotowosci_z_fix_navigation():
    for kod in ("E063", "E-W5-01", "E-W5-02", "E-W5-03", "W-W5-01"):
        kanon = ODWZOROWANIE_WALIDATOR_NA_KANON[kod]
        spec = READINESS_CODES[kanon]
        assert spec.fix_navigation and spec.fix_navigation.get("panel") == "inspector"
