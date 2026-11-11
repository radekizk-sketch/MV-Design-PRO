"""Profil referencyjny pola zespołu uziemiającego ``ZU`` (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).

DLACZEGO. Rola ``ZU`` weszła na jedną listę ról modelu (``enm.rola_pola_sn.ROLE_POLA_MODELU``),
ale ``reference_engine.registry.profile_id_for_bay`` zwracał dla niej ``None`` — pole ZU z aparatami
z katalogu nie byłoby oceniane wobec ENEA Zeszyt 1 Zał. 13–15 (cicha zgodność z braku profilu).
Profil ``earthing_unit``: odłącznik szynowy → wyłącznik → przekładnik prądowy → głowica kablowa
mostu; transformator uziemiający, dławik i rezystor są zespołem uziemiającym modelu na zacisku
pola, więc aparat transformatora w polu ZU jest drugą prawdą i profil go zakazuje.

ILOCZYN CECH: typ stacji {GPZ, stacja SN/nN, brak} × stos aparatów pola {kompletny tor, tor bez
wyłącznika, tor z aparatem transformatora, przekładnik przed wyłącznikiem, uziemnik w osi toru,
pole bez aparatów (konwencja rysunkowa)}. Pole ZU pochodzi z REALNEJ ścieżki kreatora GPZ
(``add_grid_source_sn`` z zespołem uziemiającym w sekcji), a nie z ręcznie złożonego rekordu.
"""

from __future__ import annotations

import pytest
from enm.models import BayPrimaryDevice, EnergyNetworkModel
from reference_engine import (
    FIELD_PROFILE_PACK_ID,
    FIELD_PROFILE_REGISTRY,
    evaluate_enm,
    profile_id_for_bay,
)

from tests.enm.test_prad_pojemnosciowy_sieci_galwanicznej import _model

_POLOZENIE = {
    "DS": "UPSTREAM",
    "CB": "MIDSTREAM",
    "CT": "MIDSTREAM",
    "CABLE_HEAD": "DOWNSTREAM",
    "TRANSFORMER_DEVICE": "DOWNSTREAM",
    "ES": "GROUND_BRANCH",
}

#: stos aparatów (rodzaj, położenie albo ``None`` = położenie domyślne rodzaju) → oczekiwane kody
#: reguł z wynikiem ``fail`` (pusty zbiór = pole zgodne z profilem).
_STOSY: dict[str, tuple[list[tuple[str, str | None]], set[str]]] = {
    "kompletny_tor": (
        [("DS", None), ("CB", None), ("CT", None), ("CABLE_HEAD", None), ("ES", None)],
        set(),
    ),
    "bez_wylacznika": (
        [("DS", None), ("CT", None), ("CABLE_HEAD", None)],
        {"profile.required.CB"},
    ),
    "z_aparatem_transformatora": (
        [("DS", None), ("CB", None), ("CT", None), ("TRANSFORMER_DEVICE", None)],
        # Aparat spoza profilu jest też spoza kanonicznej kolejności toru — dwa naruszenia.
        {"profile.forbidden", "profile.order"},
    ),
    "przekladnik_przed_wylacznikiem": (
        [("DS", None), ("CT", None), ("CB", None), ("CABLE_HEAD", None)],
        {"profile.order"},
    ),
    "uziemnik_w_osi_toru": (
        [("DS", None), ("CB", None), ("CT", None), ("ES", "MIDSTREAM")],
        {"profile.lateral_placement.ES"},
    ),
}


def _pole_zu_z_aparatami(
    enm: EnergyNetworkModel, typ_stacji: str | None, stos: list[tuple[str, str | None]]
) -> tuple[EnergyNetworkModel, str]:
    [pole, *_] = sorted((b for b in enm.bays if b.bay_role == "ZU"), key=lambda b: b.ref_id)
    aparaty = [
        BayPrimaryDevice(
            device_ref=f"{pole.ref_id}/aparat/{indeks}",
            symbol_ref=f"Q{indeks}",
            kind=rodzaj,  # type: ignore[arg-type]
            placement=polozenie or _POLOZENIE[rodzaj],  # type: ignore[arg-type]
        )
        for indeks, (rodzaj, polozenie) in enumerate(stos)
    ]
    pola = [
        b.model_copy(update={"primary_devices": aparaty}) if b.ref_id == pole.ref_id else b
        for b in enm.bays
    ]
    stacje = [
        s.model_copy(update={"station_type": typ_stacji}) if s.ref_id == pole.substation_ref else s
        for s in enm.substations
    ]
    return enm.model_copy(update={"bays": pola, "substations": stacje}), pole.ref_id


@pytest.mark.parametrize("typ_stacji", ["gpz", "mv_lv", None])
def test_rola_zu_ma_profil_pola_zespolu_uziemiajacego(typ_stacji: str | None) -> None:
    profil = profile_id_for_bay("ZU", typ_stacji)
    assert profil == "earthing_unit"
    definicja = FIELD_PROFILE_REGISTRY[profil]
    assert set(definicja.required) == {"DS", "CB", "CT"}
    assert "TRANSFORMER_DEVICE" in definicja.forbidden


@pytest.mark.parametrize("typ_stacji", ["gpz", "mv_lv", None])
@pytest.mark.parametrize("stos", sorted(_STOSY))
def test_pole_zu_z_kreatora_oceniane_profilem(typ_stacji: str | None, stos: str) -> None:
    aparaty, oczekiwane = _STOSY[stos]
    enm, pole_ref = _pole_zu_z_aparatami(_model("zamkniete", 1, "brak"), typ_stacji, aparaty)
    raport = evaluate_enm(enm, pack_ids=[FIELD_PROFILE_PACK_ID])
    kontrole = [c for c in raport.packs[0].checks if c.element_ref == pole_ref]
    # Pole ZU z aparatami JEST oceniane (dawniej brak profilu = zero kontroli = cicha zgodność).
    assert any(c.rule_code.startswith("profile.required.") for c in kontrole)
    assert {c.rule_code for c in kontrole if c.status == "fail"} == oczekiwane
    # Każda kontrola niesie wyjaśnienie dla projektanta.
    assert all(c.message_pl for c in kontrole)


@pytest.mark.parametrize("typ_stacji", ["gpz", "mv_lv", None])
def test_pole_zu_bez_aparatow_poza_ocena_profilu(typ_stacji: str | None) -> None:
    enm, pole_ref = _pole_zu_z_aparatami(_model("zamkniete", 1, "brak"), typ_stacji, [])
    raport = evaluate_enm(enm, pack_ids=[FIELD_PROFILE_PACK_ID])
    assert [c for c in raport.packs[0].checks if c.element_ref == pole_ref] == []


def test_kazda_rola_modelu_ma_rodzaj_pola_katalogowego_albo_jawny_brak() -> None:
    """Rola modelu → rodzaj pola katalogowego (`BayKind`) w ocenie zgodności rodziny: każda rola
    z JEDNEJ listy ról ma rodzaj z kanonu `BayKind`; jedyny jawny brak to FEEDER (pole
    rezerwowe / potrzeb własnych bez jednoznacznego rodzaju). Rola ZU → `zespol_uziemiajacy`,
    rodzaj bez szablonu w katalogu (rejestr braków), opisany rolą kanonu."""
    from typing import get_args

    from enm.rola_pola_sn import ROLE_POLA_MODELU
    from network_model.catalog.bay_templates import FIELD_TYPES_WITHOUT_TEMPLATE
    from network_model.catalog.switchgear.complete_mv_bay_template import (
        BayKind,
        nazwa_rodzaju_pola_katalogowego_pl,
    )
    from reference_engine.compliance import _BAY_ROLE_TO_FAMILY_BAY_KIND

    rodzaje = set(get_args(BayKind))
    assert set(ROLE_POLA_MODELU) - set(_BAY_ROLE_TO_FAMILY_BAY_KIND) == {"FEEDER"}
    assert set(_BAY_ROLE_TO_FAMILY_BAY_KIND.values()) <= rodzaje
    assert _BAY_ROLE_TO_FAMILY_BAY_KIND["ZU"] == "zespol_uziemiajacy"
    assert "zespol_uziemiajacy" in FIELD_TYPES_WITHOUT_TEMPLATE
    assert nazwa_rodzaju_pola_katalogowego_pl("zespol_uziemiajacy") == (
        "Pole zespołu uziemiającego"
    )
