"""Pin odcisków: opcjonalne pole `ProweniencjaParametrow.status_walidacji` (karta AB-1a D3).

Pole jest addytywne i BEZ domyślki zapisywanej: brak statusu nie trafia do postaci
zserializowanej, więc odcisk ENM modelu z parametrami dynamicznymi jest bit w bit
taki, jak przed kartą. Literały poniżej policzono kodem SPRZED karty (HEAD
529837d2, `git archive` + ten sam model) — nie tym samym kodem, który testujemy.
"""

from __future__ import annotations

from enm.dynamika_modele import (
    MaszynaSynchroniczna,
    ProweniencjaParametrow,
    PrzeksztaltnikGFL,
)
from enm.hash import compute_enm_hash, compute_input_hash, hash_migawki_enm
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Generator
from solver_input.status_modelu import StatusParametrow

from tests.enm.test_dynamika_modele import _gfl_komplet, _sm_komplet

#: Odciski policzone kodem sprzed karty AB-1a (patrz docstring modułu).
ODCISK_ENM_SPRZED_KARTY = (
    "a21b084eb903d8bff17ad687f1b3cbb9edb7bb7fadc6ba0ad808ca82e2ddba45"
)
ODCISK_WEJSCIA_SPRZED_KARTY = (
    "451869500c3bcc0f0784854730564843654792f1d341e2de026d1dfe30af8321"
)


def _model(status: StatusParametrow | None = None) -> EnergyNetworkModel:
    sm = _sm_komplet()
    if status is not None:
        sm["proweniencja"] = ProweniencjaParametrow(
            zrodlo="karta_producenta",
            odniesienie="DS-0001",
            data="2026-01-01",
            status_walidacji=status,
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="pin-status-walidacji"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
        generators=[
            Generator(
                ref_id="g1",
                name="G1",
                bus_ref="b1",
                p_mw=1.0,
                dynamika=MaszynaSynchroniczna(**sm),
            ),
            Generator(
                ref_id="g2",
                name="G2",
                bus_ref="b1",
                p_mw=0.5,
                gen_type="pv_inverter",
                dynamika=PrzeksztaltnikGFL(**_gfl_komplet()),
            ),
        ],
    )


def test_brak_statusu_nie_zmienia_zadnego_odcisku() -> None:
    enm = _model()
    assert compute_enm_hash(enm) == ODCISK_ENM_SPRZED_KARTY
    assert compute_input_hash(enm) == ODCISK_WEJSCIA_SPRZED_KARTY
    assert hash_migawki_enm(enm.model_dump(mode="json")) == ODCISK_ENM_SPRZED_KARTY


def test_brak_statusu_nie_trafia_do_zrzutu_w_zadnym_trybie() -> None:
    prow = ProweniencjaParametrow(zrodlo="karta_producenta", odniesienie="DS-1")
    assert "status_walidacji" not in prow.model_dump()
    assert "status_walidacji" not in prow.model_dump(mode="json")
    assert "status_walidacji" not in prow.model_dump_json()
    zrzut = _model().model_dump(mode="json")
    for gen in zrzut["generators"]:
        assert "status_walidacji" not in gen["dynamika"]["proweniencja"]


def test_podany_status_jest_trescia_modelu_i_zmienia_odcisk() -> None:
    for status in StatusParametrow:
        enm = _model(status)
        assert compute_enm_hash(enm) != ODCISK_ENM_SPRZED_KARTY
        odtworzony = EnergyNetworkModel.model_validate(enm.model_dump(mode="json"))
        dyn = odtworzony.generators[0].dynamika
        assert dyn is not None and dyn.proweniencja.status_walidacji is status
