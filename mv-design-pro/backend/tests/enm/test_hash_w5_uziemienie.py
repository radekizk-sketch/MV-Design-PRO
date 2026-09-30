"""W5-A: odciski modelu po kasacji `Bus.grounding` — migawki bez danych haszują jak PRZED kartą.

Postać sprzed karty odtworzona ręcznie: każda szyna wypisywała `"grounding": null`,
źródło/transformator/kabel NIE miały kluczy `neutral_grounding`/`lv_earthing_system`/
`screen_bonding`. Trzy hashe pełne i hash semantyczny muszą dać ten sam odcisk dla tej
postaci co dla modelu po karcie (bez tych danych) — inaczej rewizje (`enm/rewizje.py`)
uznałyby całą historię za uszkodzoną.
"""

from __future__ import annotations

import copy

from enm.hash import (
    _POLA_NAGLOWKA_POZA_HASHEM,
    _SEMANTIC_INCLUDE_BUS,
    _canonical_sha256,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Source,
    Transformer,
)


def _model(**over) -> EnergyNetworkModel:
    dane = {
        "header": ENMHeader(name="hash-w5", defaults=ENMDefaults()),
        "buses": [
            Bus(ref_id="sn", name="sn", voltage_kv=15.0),
            Bus(ref_id="nn", name="nn", voltage_kv=0.4),
        ],
        "sources": [
            Source(
                ref_id="src", name="GPZ", bus_ref="sn", model="short_circuit_power", sk3_mva=250.0
            )
        ],
        "transformers": [
            Transformer(
                ref_id="tr",
                name="tr",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        "branches": [
            Cable(
                ref_id="c",
                name="c",
                from_bus_ref="sn",
                to_bus_ref="sn",
                length_km=1.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
            )
        ],
    }
    dane.update(over)
    return EnergyNetworkModel(**dane)


def _postac_sprzed_karty(model: EnergyNetworkModel) -> dict:
    """Zrzut tak, jak wyglądał przed W5-A (bez `id`, bez pól nagłówka poza hashem)."""
    dane = model.model_dump(mode="json", exclude={"header": set(_POLA_NAGLOWKA_POZA_HASHEM)})
    for szyna in dane["buses"]:
        szyna.pop("id", None)
        szyna["grounding"] = None
    # Pola addytywne SPRZED karty (K7: dane MIN + u_set_pu) też były poza odciskiem gdy None.
    stare_addytywne = {"sources": ("sk3_min_mva", "ik3_min_ka", "rx_ratio_min", "u_set_pu")}
    for klucz, pola in (
        ("sources", ("neutral_grounding",)),
        ("transformers", ("lv_earthing_system",)),
        ("branches", ("screen_bonding",)),
    ):
        for element in dane[klucz]:
            element.pop("id", None)
            for pole in pola:
                element.pop(pole, None)
            for pole in stare_addytywne.get(klucz, ()):
                if element.get(pole) is None:
                    element.pop(pole, None)
    for klucz in ("loads", "generators", "bays", "substations", "shunt_capacitors"):
        for element in dane.get(klucz, []):
            element.pop("id", None)
    dane.pop("katalog_projektu", None)
    return dane


def test_pelny_odcisk_bez_danych_uziemienia_rowny_postaci_sprzed_karty():
    model = _model()
    oczekiwany = _canonical_sha256(copy.deepcopy(_postac_sprzed_karty(model)))
    assert compute_enm_hash(model) == oczekiwany
    assert hash_migawki_enm(model.model_dump(mode="json")) == oczekiwany


def test_odcisk_semantyczny_niesie_grounding_szyny_jako_null_jak_przed_karta():
    assert "grounding" not in _SEMANTIC_INCLUDE_BUS
    model = _model()
    dane = model.model_dump(mode="json", exclude={"header"})
    projekcja_szyn = [
        {**{k: b[k] for k in _SEMANTIC_INCLUDE_BUS if k in b}, "grounding": None}
        for b in dane["buses"]
    ]
    # Ten sam odcisk, gdy szyny zapisze się jak przed kartą (z `grounding: null`).
    from enm.hash import _semantic_payload

    payload = _semantic_payload(model)
    assert payload["buses"] == projekcja_szyn
    assert all("neutral_grounding" not in s for s in payload["sources"])


def test_dane_uziemienia_zmieniaja_odcisk_a_ich_brak_nie():
    bez = _model()
    z_opisem = _model(
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="short_circuit_power",
                sk3_mva=250.0,
                neutral_grounding=GroundingConfig(type="resistor_grounded", r_ohm=12.0),
            )
        ]
    )
    assert compute_enm_hash(bez) != compute_enm_hash(z_opisem)
    assert compute_input_hash(bez) != compute_input_hash(z_opisem)
    assert compute_semantic_hash(bez) != compute_semantic_hash(z_opisem)
    z_ukladem = _model()
    z_ukladem.transformers[0].lv_earthing_system = "TN-S"
    assert compute_enm_hash(bez) != compute_enm_hash(z_ukladem)
    z_ekranem = _model()
    z_ekranem.branches[0].screen_bonding = "both_ends"  # type: ignore[union-attr]
    assert compute_enm_hash(bez) != compute_enm_hash(z_ekranem)
