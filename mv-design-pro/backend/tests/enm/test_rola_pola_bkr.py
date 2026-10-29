"""Rola pola baterii kondensatorów ``BKR`` na JEDNEJ liście ról modelu (karta UX-04/POLE-BKR-MODEL).

DLACZEGO. Literał roli pola modelu żył w pięciu kopiach; rola ``BKR`` dopisana do jednej
kopii, a pominięta w innej, dawała cichą zamianę na pole liniowe (``FEEDER``) albo odmowę
walidacji modelu. Teraz każda kopia czyta ``enm.rola_pola_sn.RolaPolaModelu`` — przypinamy to
równością, a do tego lustro frontu, rolę kanoniczną, nazwę, kategorię rodzaju stacji, profil
referencyjny i operację ``add_sn_bay``.

ILOCZYN CECH: kopia literału {rekord pola ``Bay``, szablon pola ``BayTemplate``, szablon pola
kompletnego ``CompleteMvBayTemplate``, ładunek ``AddSnBayPayload``, lustro frontu
``BAY_MODEL_ROLES``} × rola {każda z listy} × zapis roli w żądaniu {wielkie litery, małe
litery ze spacjami, kod roli kanonicznej, kod spoza słownika}.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

import pytest
from enm.domain_ops_models import AddSnBayPayload
from enm.models import Bay, BayBaseModel
from enm.rodzaj_stacji import KATEGORIA_INNE, kategoria_pola
from enm.rola_pola_sn import (
    NAZWA_ROLI_POLA_SN_PL,
    ROLA_POLA_SN_Z_ALIASU,
    ROLE_KANONICZNE_POLA_SN,
    ROLE_POLA_MODELU,
    kanoniczna_rola_pola_sn,
    nazwa_roli_pola_sn,
)
from network_model.catalog.bay_templates import BayTemplate
from network_model.catalog.switchgear.complete_mv_bay_template import CompleteMvBayTemplate
from reference_engine.registry import profile_id_for_bay

from tests.reference_networks.scena_geometrii_stacji import zbuduj_gpz_110kv
from tests.reference_networks.scena_pola_bkr import gpz
from tests.reference_networks.sceny_zajetosci_pol import APARAT, ok, op

TYPY_ENM = Path(__file__).resolve().parents[3] / "frontend" / "src" / "types" / "enm.ts"


def _role_pola(model: type) -> tuple[str, ...]:
    return get_args(model.model_fields["bay_role"].annotation)


@pytest.mark.parametrize(
    "model", [Bay, BayTemplate, CompleteMvBayTemplate, AddSnBayPayload], ids=lambda m: m.__name__
)
def test_kazda_kopia_roli_pola_czyta_jedna_liste(model: type) -> None:
    assert _role_pola(model) == ROLE_POLA_MODELU
    assert "BKR" in ROLE_POLA_MODELU


def test_lustro_frontu_rol_pola_rowne_backendowi() -> None:
    tekst = TYPY_ENM.read_text(encoding="utf-8")
    [lista] = re.findall(r"export const BAY_MODEL_ROLES = \[([^\]]*)\] as const;", tekst)
    assert tuple(re.findall(r"'([A-Z_]+)'", lista)) == ROLE_POLA_MODELU


def test_rola_kanoniczna_read_modelu_rowna_kluczom_nazw() -> None:
    assert set(ROLE_KANONICZNE_POLA_SN) == set(NAZWA_ROLI_POLA_SN_PL)
    assert set(_role_pola(BayBaseModel)) == set(ROLE_KANONICZNE_POLA_SN)
    # Każda rola modelu poza źródłową (technologię zna dopiero pole z generatorem) ma rolę
    # kanoniczną z kanonu, a każda rola kanoniczna jest swoim aliasem.
    for rola in ROLE_POLA_MODELU:
        if rola == "OZE":
            continue
        assert ROLA_POLA_SN_Z_ALIASU[rola] in ROLE_KANONICZNE_POLA_SN, rola
    assert set(ROLA_POLA_SN_Z_ALIASU.values()) <= set(ROLE_KANONICZNE_POLA_SN)


def test_rola_bkr_nazwa_kategoria_i_profil_referencyjny() -> None:
    assert kanoniczna_rola_pola_sn("BKR") == "BATERIA_KONDENSATOROW"
    assert nazwa_roli_pola_sn("BKR") == "Pole baterii kondensatorów"
    assert nazwa_roli_pola_sn("BATERIA_KONDENSATOROW") == "Pole baterii kondensatorów"
    # Pole baterii nie jest wyprowadzeniem liniowym ani sprzęgłem: nie zmienia rodzaju stacji
    # i nie jest „rolą nierozpoznaną" (W044).
    assert kategoria_pola({"bay_role": "BKR"}) == KATEGORIA_INNE
    assert kategoria_pola({"field_role": "BATERIA_KONDENSATOROW"}) == KATEGORIA_INNE
    for typ_stacji in ("gpz", "mv_lv", None):
        assert profile_id_for_bay("BKR", typ_stacji) == "capacitor_bank"


def _dodaj_pole(rola: object) -> dict[str, object]:
    enm = zbuduj_gpz_110kv()
    stacja = gpz(enm)
    return op(
        enm,
        "add_sn_bay",
        {
            "bus_ref": stacja["gpz_sections"][0]["bus_ref"],
            "station_ref": stacja["ref_id"],
            "bay_role": rola,
            "apparatus_kind": "BREAKER",
            "catalog_binding": {"catalog_namespace": "APARAT_SN", "catalog_item_id": APARAT},
        },
    )


@pytest.mark.parametrize(
    ("rola", "oczekiwana"),
    [("BKR", "BKR"), (" bkr ", "BKR"), ("TR", "TR"), ("coupler", "COUPLER")],
)
def test_add_sn_bay_rola_z_listy_modelu(rola: str, oczekiwana: str) -> None:
    przed = {b["ref_id"] for b in zbuduj_gpz_110kv()["bays"]}
    snapshot = ok(_dodaj_pole(rola))
    [nowe] = [b for b in snapshot["bays"] if b["ref_id"] not in przed]
    assert nowe["bay_role"] == oczekiwana
    if oczekiwana == "BKR":
        assert nowe["name"].startswith("Pole baterii kondensatorów")


@pytest.mark.parametrize("rola", ["LINIA_OUT", "BATERIA_KONDENSATOROW", "XYZ", 7])
def test_add_sn_bay_rola_spoza_listy_odmowa_nazwana_bez_cichej_zamiany(rola: object) -> None:
    odpowiedz = _dodaj_pole(rola)
    assert odpowiedz.get("error_code") == "sn.bay_role_unknown"
    komunikat = str(odpowiedz["error"])
    # Komunikat wylicza nazwy ról (nie kody) — każda rola modelu jest w zdaniu.
    for rola_modelu in ROLE_POLA_MODELU:
        assert nazwa_roli_pola_sn(rola_modelu) in komunikat
    assert "BKR" not in komunikat and "FEEDER" not in komunikat
