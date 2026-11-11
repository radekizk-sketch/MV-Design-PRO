"""Profil referencyjny pola zespołu uziemiającego ``ZU`` (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).

DLACZEGO. Rola ``ZU`` weszła na jedną listę ról modelu (``enm.rola_pola_sn.ROLE_POLA_MODELU``),
ale ``reference_engine.registry.profile_id_for_bay`` zwracał dla niej ``None`` — pole ZU z aparatami
z katalogu nie byłoby oceniane wobec ENEA Zeszyt 1 Zał. 13–15 (cicha zgodność z braku profilu).
Profil ``earthing_unit`` (karta POLA-GPZ-SZABLONY, ENEA Zeszyt 1 wersja 02.2023 – 2, Z.13–Z.15
s.93–95, §13 i §16): funkcja odłączenia od szyny (łącznik trójpołożeniowy ALBO odłącznik szynowy
ALBO wysunięcie wyłącznika poziomo wysuwnego) → wyłącznik → przekładnik prądowy → głowica kablowa
mostu; ogranicznik przepięć, uziemnik i wskaźnik napięcia bocznie. Transformator uziemiający
ZNyn11 jest elementem modelu ``Transformer`` na zacisku pola (jedyny nośnik punktu neutralnego,
karta ZU-JEDEN-NOSNIK), dławik, rezystor i AWSC leżą w jego punkcie neutralnym — aparat
transformatora w polu ZU byłby drugą prawdą, więc profil go zakazuje.

ILOCZYN CECH: typ stacji {GPZ, stacja SN/nN, brak} × stos aparatów pola {kompletny tor
z odłącznikiem, kompletny tor z łącznikiem trójpołożeniowym, tor bez funkcji odłączenia z
wyłącznikiem stałym, tor bez odłącznika z wyłącznikiem wysuwnym, tor bez wyłącznika, tor z
aparatem transformatora, przekładnik przed wyłącznikiem, uziemnik w osi toru, pole bez aparatów
(konwencja rysunkowa)}. Pole ZU pochodzi z REALNEJ ścieżki kreatora GPZ (``add_grid_source_sn``
z zespołem uziemiającym w sekcji, ``zespoly_sekcji``), a nie z ręcznie złożonego rekordu.
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
    "THREE_POSITION_SWITCH": "UPSTREAM",
    "DS": "UPSTREAM",
    "CB": "MIDSTREAM",
    "CT": "MIDSTREAM",
    "CABLE_HEAD": "DOWNSTREAM",
    "TRANSFORMER_DEVICE": "DOWNSTREAM",
    "ES": "GROUND_BRANCH",
    "SURGE_ARRESTER": "GROUND_BRANCH",
}

#: Kod reguły grupy funkcji odłączenia od szyny profilu ``earthing_unit``.
ODLACZENIE = "profile.one_of.THREE_POSITION_SWITCH|DS"

#: stos aparatów (rodzaj, położenie albo ``None`` = położenie domyślne rodzaju, wykonanie
#: wyłącznika albo ``None``) → oczekiwane kody reguł z wynikiem ``fail`` (pusty zbiór = pole
#: zgodne z profilem).
Aparat = tuple[str, str | None, str | None]
_STOSY: dict[str, tuple[list[Aparat], set[str]]] = {
    "kompletny_tor": (
        [
            ("DS", None, None),
            ("CB", None, None),
            ("CT", None, None),
            ("CABLE_HEAD", None, None),
            ("ES", None, None),
            ("SURGE_ARRESTER", None, None),
        ],
        set(),
    ),
    "lacznik_trojpolozeniowy": (
        [
            ("THREE_POSITION_SWITCH", None, None),
            ("CB", None, None),
            ("CT", None, None),
            ("CABLE_HEAD", None, None),
        ],
        set(),
    ),
    "bez_odlaczenia_wylacznik_staly": (
        [("CB", None, "STALE"), ("CT", None, None), ("CABLE_HEAD", None, None)],
        {ODLACZENIE},
    ),
    "bez_odlaczenia_wylacznik_wysuwny": (
        # ENEA Zeszyt 1 §13: odłączenie od szyny wysunięciem wyłącznika poziomo wysuwnego.
        [("CB", None, "WYSUWNE"), ("CT", None, None), ("CABLE_HEAD", None, None)],
        set(),
    ),
    "bez_wylacznika": (
        [("DS", None, None), ("CT", None, None), ("CABLE_HEAD", None, None)],
        {"profile.required.CB"},
    ),
    "z_aparatem_transformatora": (
        [
            ("DS", None, None),
            ("CB", None, None),
            ("CT", None, None),
            ("TRANSFORMER_DEVICE", None, None),
        ],
        # Aparat spoza profilu jest też spoza kanonicznej kolejności toru — dwa naruszenia.
        {"profile.forbidden", "profile.order"},
    ),
    "przekladnik_przed_wylacznikiem": (
        [("DS", None, None), ("CT", None, None), ("CB", None, None), ("CABLE_HEAD", None, None)],
        {"profile.order"},
    ),
    "uziemnik_w_osi_toru": (
        [("DS", None, None), ("CB", None, None), ("CT", None, None), ("ES", "MIDSTREAM", None)],
        {"profile.lateral_placement.ES"},
    ),
}


def _pole_zu_z_aparatami(
    enm: EnergyNetworkModel, typ_stacji: str | None, stos: list[Aparat]
) -> tuple[EnergyNetworkModel, str]:
    [pole, *_] = sorted((b for b in enm.bays if b.bay_role == "ZU"), key=lambda b: b.ref_id)
    aparaty = [
        BayPrimaryDevice(
            device_ref=f"{pole.ref_id}/aparat/{indeks}",
            symbol_ref=f"Q{indeks}",
            kind=rodzaj,  # type: ignore[arg-type]
            placement=polozenie or _POLOZENIE[rodzaj],  # type: ignore[arg-type]
            wykonanie=wykonanie,  # type: ignore[arg-type]
        )
        for indeks, (rodzaj, polozenie, wykonanie) in enumerate(stos)
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
    assert set(definicja.required) == {"CB", "CT"}
    assert definicja.one_of_groups == [["THREE_POSITION_SWITCH", "DS"]]
    assert definicja.grupy_spelniane_wysunieciem == [["THREE_POSITION_SWITCH", "DS"]]
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
    assert any(c.rule_code == ODLACZENIE for c in kontrole)
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
