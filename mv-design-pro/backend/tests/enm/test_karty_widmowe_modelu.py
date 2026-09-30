"""Karty widmowe w modelu ENM — ILOCZYN CECH (karta AB-H0 §0.7.3, §0.7.6, §2 Pakiet D).

Cechy, w których defekt mógłby się schować:

* źródło karty: katalog PROJEKTU modelu × katalog STATYCZNY (podmieniony w teście, bo
  dziś statyczny nie ma kart — pomiar 2026-09-23);
* rodzaj i tor elementu: ``pv_inverter``/``bess`` z kart referencyjnych
  (``add_converter_source``, przestrzenie ``ZRODLO_NN_PV``/``ZRODLO_NN_BESS``),
  ``wind_inverter`` (``CONVERTER``), ``pv_inverter`` torem DER-SN
  (``_add_converter_source_der_sn``), ``fw_pmsg``/``fw_dfig``/``fw_scig`` (rekord ENM z
  importu — żadna operacja ich nie tworzy), ``bess`` bez typu (``add_ups_nn``);
* wiązanie: brak / karta tego typu / karta innego typu → odmowa / karta nieznana → odmowa /
  karta usunięta z projektu → odmowa NAZWANA przy odczycie / odwiązanie ``null`` i ``[]`` /
  zły kształt / kolizja identyfikatorów modeli;
* ścieżka: ``assign_catalog_to_element`` (ten sam typ — przematerializowanie, inny typ —
  odmowa), ``update_element_parameters`` (pole nie ginie), eksport/import archiwum ZIP,
  CGMES (side-car zachowuje, EQ/TP daje ``None``), XLSX (sekcja kart pusta, odcisk bez
  zmian);
* odcisk: bez kart = odcisk sprzed karty, z kartą — inny, trzy funkcje hasza zgodne,
  migawka wołającego nietknięta.

Parytet typ ↔ element: element zmaterializowany z typu X bez nadpisań ma TE SAME statusy
ośmiu sekcji co typ X — dla każdej przestrzeni z elementem ENM.
"""

from __future__ import annotations

import copy
import dataclasses
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from application.model_urzadzenia.sekcje_elementu import (
    OdmowaSekcjiElementu,
    dane_elementu,
    sekcje_elementu,
)
from dziedziny.karta_widmowa import KartaWidmowa, ModeleWidmoweElementu
from enm import katalog_projektu as modul_katalogu_projektu
from enm import katalog_projektu_karty as modul_kart
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import dodaj_karte_widmowa_projektu
from enm.hash import compute_enm_hash, compute_input_hash, hash_migawki_enm
from enm.katalog_projektu import katalog_dla_modelu, kontekst_katalogu
from enm.models import EnergyNetworkModel
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.sekcje_modelu import PRZESTRZENIE_Z_SEKCJAMI, sekcje_typu

from tests.dziedziny import fabryki as f
from tests.enm import test_brama_katalogowa_operacji_v2 as h

TYP_PV = "conv-pv-card-huawei-sun2000-215ktl"
TYP_BESS = "conv-bess-card-sungrow-sc2000ud-mv"
TRAFO_0P8 = "tr-sn-nn-15-0p8-2p5mva-dyn11-inverter"
TRAFO_0P69 = "tr-sn-nn-15-0p69-2p5mva-dyn11-inverter"
LINIA_SN = "line-base-al-150"


# ---------------------------------------------------------------------------
# Budowa modeli (tory operacji domenowych)
# ---------------------------------------------------------------------------


def _siec(napiecie_nn_kv: float, trafo: str) -> dict[str, Any]:
    snapshot = h._wykonaj(
        h._pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": h.REF_ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    snapshot = h._wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": h.REF_KABEL}},
    )
    payload = h._payload_stacji(str(snapshot["branches"][-1]["to_bus_ref"]), h._blok_nn())
    payload["nn_voltage_kv"] = napiecie_nn_kv
    payload["transformer"]["transformer_catalog_ref"] = trafo
    return h._wykonaj(snapshot, "append_station_on_endpoint", payload)


def _szyna_nn(snapshot: dict[str, Any], napiecie_kv: float) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    for bus_ref in stacja["bus_refs"]:
        szyna = next(b for b in snapshot["buses"] if b["ref_id"] == bus_ref)
        if abs(float(szyna["voltage_kv"]) - napiecie_kv) < 1e-9:
            return str(bus_ref)
    raise AssertionError(f"brak szyny {napiecie_kv} kV")


def _zrodlo_z_karty(technologia: str, typ: str, napiecie: float, trafo: str) -> dict[str, Any]:
    snapshot = _siec(napiecie, trafo)
    return h._wykonaj(
        snapshot,
        "add_converter_source",
        {
            "source_technology": technologia,
            "connection_variant": "nn_side",
            "station_ref": h._stacja_ref(snapshot),
            "bus_nn_ref": _szyna_nn(snapshot, napiecie),
            "source_name": f"Źródło {technologia}",
            "catalog_ref": typ,
        },
    )


def _zrodlo_wiatrowe() -> dict[str, Any]:
    snapshot = h._siec_ze_stacja()
    return h._wykonaj(
        snapshot,
        "add_converter_source",
        h._payload_zrodla(snapshot, catalog_ref=h.REF_FW, technologia="FW"),
    )


def _zrodlo_der_sn() -> dict[str, Any]:
    snapshot = h._siec_ze_stacja()
    return h._wykonaj(snapshot, "add_converter_source", h._payload_konwerter_der_sn(snapshot))


def _zrodlo_importowane(gen_type: str) -> Callable[[], dict[str, Any]]:
    """``fw_pmsg``/``fw_dfig``/``fw_scig`` — rekord ENM z importu (żadna operacja
    domenowa ich nie tworzy): generator wiatrowy z tym rodzajem."""

    def zbuduj() -> dict[str, Any]:
        snapshot = copy.deepcopy(_zrodlo_wiatrowe())
        snapshot["generators"][-1]["gen_type"] = gen_type
        return snapshot

    return zbuduj


def _ups() -> dict[str, Any]:
    snapshot = h._siec_ze_stacja()
    return h._wykonaj(
        snapshot,
        "add_ups_nn",
        {
            "bus_nn_ref": h._szyna_nn_ref(snapshot),
            "ups_spec": {"rated_power_kw": 100.0, "source_name": "UPS"},
        },
    )


@dataclasses.dataclass(frozen=True)
class Tor:
    """Rodzaj elementu × tor jego utworzenia."""

    nazwa: str
    zbuduj: Callable[[], dict[str, Any]]
    gen_type: str
    #: Typ katalogowy generatora (``None`` — element bez typu).
    typ: str | None


TORY: tuple[Tor, ...] = (
    Tor(
        "pv_karta_nn", lambda: _zrodlo_z_karty("PV", TYP_PV, 0.8, TRAFO_0P8), "pv_inverter", TYP_PV
    ),
    Tor(
        "bess_karta_nn",
        lambda: _zrodlo_z_karty("BESS", TYP_BESS, 0.69, TRAFO_0P69),
        "bess",
        TYP_BESS,
    ),
    Tor("wiatr_nn", _zrodlo_wiatrowe, "wind_inverter", h.REF_FW),
    Tor("pv_der_sn", _zrodlo_der_sn, "pv_inverter", h.REF_PV),
    Tor("fw_pmsg_import", _zrodlo_importowane("fw_pmsg"), "fw_pmsg", h.REF_FW),
    Tor("fw_dfig_import", _zrodlo_importowane("fw_dfig"), "fw_dfig", h.REF_FW),
    Tor("fw_scig_import", _zrodlo_importowane("fw_scig"), "fw_scig", h.REF_FW),
    Tor("ups_bez_typu", _ups, "bess", None),
)
_MODELE: dict[str, dict[str, Any]] = {}


def _model(tor: Tor) -> dict[str, Any]:
    if tor.nazwa not in _MODELE:
        _MODELE[tor.nazwa] = tor.zbuduj()
    return copy.deepcopy(_MODELE[tor.nazwa])


def _generator(snapshot: dict[str, Any]) -> dict[str, Any]:
    return dict(snapshot["generators"][-1])


def _karta_projektu(typ: str, karta_id: str = "karta-proj-1", **inne: Any) -> KartaWidmowa:
    dane: dict[str, Any] = {
        "id": karta_id,
        "urzadzenie_ref": typ,
        "verification_status": "NIEWERYFIKOWANY",
        "catalog_status": "PROJEKTOWY_V1",
    }
    dane.update(inne)
    return f.karta(**dane)


def _dodaj(snapshot: dict[str, Any], karta: KartaWidmowa) -> dict[str, Any]:
    with kontekst_katalogu(snapshot):
        wynik = dodaj_karte_widmowa_projektu(snapshot, {"karta": karta.model_dump(mode="json")})
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _wiaz(snapshot: dict[str, Any], ref: str, karty: Any) -> dict[str, Any]:
    return execute_domain_operation(
        snapshot, "set_der_catalog_bindings", {"generator_ref": ref, "karty_widmowe_ref": karty}
    )


@pytest.fixture
def katalog_statyczny_z_karta(monkeypatch: pytest.MonkeyPatch) -> Iterator[KartaWidmowa]:
    """Katalog statyczny z jedną kartą typu PV (dziś statyczny nie ma kart)."""
    karta = f.karta(id="karta-stat-1", urzadzenie_ref=TYP_PV, verification_status="REFERENCYJNY")
    podmieniony = dataclasses.replace(get_default_mv_catalog(), karty_widmowe={karta.id: karta})
    for modul in (modul_katalogu_projektu, modul_kart):
        monkeypatch.setattr(modul, "get_default_mv_catalog", lambda: podmieniony)
    modul_katalogu_projektu._katalog_z_klucza.cache_clear()
    yield karta
    modul_katalogu_projektu._katalog_z_klucza.cache_clear()


# ---------------------------------------------------------------------------
# Iloczyn: tor × wiązanie
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tor", TORY, ids=lambda t: t.nazwa)
def test_brak_wiazania_brak_modeli_i_sekcja_harmonic_nieznana(tor: Tor) -> None:
    snapshot = _model(tor)
    generator = _generator(snapshot)
    assert generator["gen_type"] == tor.gen_type
    assert generator.get("modele_widmowe") is None
    oceny = {o.sekcja: o for o in sekcje_elementu(snapshot, generator["ref_id"])}
    emisja = {s.nazwa: s for s in oceny["harmonic"].skladniki}["emisja"]
    assert emisja.status == "UNKNOWN" and "karty widmowej" in emisja.powod_pl
    assert oceny["harmonic"].status == "UNKNOWN"


@pytest.mark.parametrize("tor", [t for t in TORY if t.typ is not None], ids=lambda t: t.nazwa)
def test_karta_projektu_tego_typu_materializuje_modele_z_proweniencja(tor: Tor) -> None:
    assert tor.typ is not None
    snapshot = _model(tor)
    generator = _generator(snapshot)
    karta = _karta_projektu(tor.typ)
    z_karta = _dodaj(snapshot, karta)
    wynik = _wiaz(z_karta, generator["ref_id"], [karta.id])
    assert not wynik.get("error"), wynik.get("error")
    po = _generator(wynik["snapshot"])
    modele = ModeleWidmoweElementu.model_validate(po["modele_widmowe"])
    assert [(z.karta_id, z.przestrzen, z.odcisk_karty) for z in modele.zrodla] == [
        (karta.id, "PROJEKT", karta.odcisk())
    ]
    assert modele.modele == karta.modele
    # Referencja karty NIE trafia do parametrów zmaterializowanych.
    assert po["materialized_params"] == generator["materialized_params"]
    oceny = {o.sekcja: o.status for o in sekcje_elementu(wynik["snapshot"], po["ref_id"])}
    assert oceny["harmonic"] != "UNKNOWN"
    assert oceny["supraharmonic"] == "UNKNOWN"


@pytest.mark.parametrize("tor", TORY, ids=lambda t: t.nazwa)
def test_karta_innego_typu_jest_odrzucona_i_model_nietkniety(tor: Tor) -> None:
    snapshot = _model(tor)
    generator = _generator(snapshot)
    obcy_typ = TYP_BESS if tor.typ != TYP_BESS else TYP_PV
    z_karta = _dodaj(snapshot, _karta_projektu(obcy_typ, "karta-obca"))
    wynik = _wiaz(z_karta, generator["ref_id"], ["karta-obca"])
    assert wynik.get("error_code") == "der_bindings.karta_widmowa_innego_urzadzenia", wynik
    assert _generator(z_karta).get("modele_widmowe") is None


@pytest.mark.parametrize("tor", TORY, ids=lambda t: t.nazwa)
def test_karta_nieznana_jest_odrzucona(tor: Tor) -> None:
    snapshot = _model(tor)
    wynik = _wiaz(snapshot, _generator(snapshot)["ref_id"], ["karta-ktorej-nie-ma"])
    assert wynik.get("error_code") == "der_bindings.catalog_ref_unknown", wynik
    # Karta #142: pole nazwane jak w formularzu, bez klucza kontraktu i identyfikatora
    # karty (dawniej test wymagał ``karty_widmowe_ref=<id>`` w treści).
    tresc = str(wynik.get("error"))
    assert "„Karty widmowe urządzenia”" in tresc, tresc
    assert "karty_widmowe_ref" not in tresc and "karta-ktorej-nie-ma" not in tresc, tresc


@pytest.mark.parametrize(
    ("wartosc", "kod"),
    [
        ("karta-proj-1", "der_bindings.karty_widmowe_ref_invalid"),
        (["karta-proj-1", "karta-proj-1"], "der_bindings.karty_widmowe_ref_invalid"),
        ([""], "der_bindings.karty_widmowe_ref_invalid"),
        ({"id": "karta-proj-1"}, "der_bindings.karty_widmowe_ref_invalid"),
    ],
)
def test_zly_ksztalt_listy_kart_jest_odrzucony(wartosc: Any, kod: str) -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV))
    wynik = _wiaz(snapshot, _generator(snapshot)["ref_id"], wartosc)
    assert wynik.get("error_code") == kod, wynik


@pytest.mark.parametrize("odwiazanie", [None, []])
def test_odwiazanie_czysci_modele(odwiazanie: Any) -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV))
    ref = _generator(snapshot)["ref_id"]
    zwiazany = _wiaz(snapshot, ref, ["karta-proj-1"])["snapshot"]
    assert _generator(zwiazany)["modele_widmowe"] is not None
    wynik = _wiaz(zwiazany, ref, odwiazanie)
    assert not wynik.get("error"), wynik.get("error")
    assert _generator(wynik["snapshot"])["modele_widmowe"] is None


def test_dwie_karty_z_kolizja_identyfikatorow_modeli_sa_odrzucone() -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV, "karta-a"))
    snapshot = _dodaj(snapshot, _karta_projektu(TYP_PV, "karta-b"))
    wynik = _wiaz(snapshot, _generator(snapshot)["ref_id"], ["karta-a", "karta-b"])
    assert wynik.get("error_code") == "der_bindings.karty_widmowe_kolizja", wynik


def test_dwie_karty_tego_typu_skladaja_sie_w_jeden_nosnik() -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV, "karta-a"))
    druga = _karta_projektu(TYP_PV, "karta-b", modele=(f.model(ident="m-2"),))
    snapshot = _dodaj(snapshot, druga)
    wynik = _wiaz(snapshot, _generator(snapshot)["ref_id"], ["karta-b", "karta-a"])
    assert not wynik.get("error"), wynik.get("error")
    modele = ModeleWidmoweElementu.model_validate(_generator(wynik["snapshot"])["modele_widmowe"])
    assert [z.karta_id for z in modele.zrodla] == ["karta-a", "karta-b"]
    assert [m.ident for m in modele.modele] == ["m-1", "m-2"]


def test_karta_statyczna_materializuje_sie_z_przestrzenia_statyczna(
    katalog_statyczny_z_karta: KartaWidmowa,
) -> None:
    snapshot = _model(TORY[0])
    wynik = _wiaz(snapshot, _generator(snapshot)["ref_id"], [katalog_statyczny_z_karta.id])
    assert not wynik.get("error"), wynik.get("error")
    modele = ModeleWidmoweElementu.model_validate(_generator(wynik["snapshot"])["modele_widmowe"])
    assert [(z.karta_id, z.przestrzen) for z in modele.zrodla] == [
        (katalog_statyczny_z_karta.id, "STATYCZNA")
    ]


def test_karta_usunieta_z_projektu_odmowa_nazwana_przy_odczycie() -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV))
    ref = _generator(snapshot)["ref_id"]
    zwiazany = copy.deepcopy(_wiaz(snapshot, ref, ["karta-proj-1"])["snapshot"])
    zwiazany["katalog_projektu"]["karty_widmowe"] = []
    with pytest.raises(OdmowaSekcjiElementu, match="usunięta po materializacji") as blad:
        sekcje_elementu(zwiazany, ref)
    assert blad.value.kod == "sekcje.karta_widmowa_niedostepna"


def test_karta_zmieniona_po_materializacji_odmowa_nazwana_przy_odczycie() -> None:
    tor = TORY[0]
    snapshot = _dodaj(_model(tor), _karta_projektu(TYP_PV))
    ref = _generator(snapshot)["ref_id"]
    zwiazany = copy.deepcopy(_wiaz(snapshot, ref, ["karta-proj-1"])["snapshot"])
    zwiazany["katalog_projektu"]["karty_widmowe"][0]["wersja"] = "2"
    with pytest.raises(OdmowaSekcjiElementu, match="zmieniona po materializacji") as blad:
        sekcje_elementu(zwiazany, ref)
    assert blad.value.kod == "sekcje.karta_widmowa_niedostepna"


# ---------------------------------------------------------------------------
# Iloczyn: ścieżki operacji na elemencie z modelami
# ---------------------------------------------------------------------------


def _zwiazany_pv() -> tuple[dict[str, Any], str]:
    snapshot = _dodaj(_model(TORY[0]), _karta_projektu(TYP_PV))
    ref = _generator(snapshot)["ref_id"]
    return _wiaz(snapshot, ref, ["karta-proj-1"])["snapshot"], ref


def test_przypisanie_tego_samego_typu_przematerializowuje_modele() -> None:
    zwiazany, ref = _zwiazany_pv()
    przed = _generator(zwiazany)["modele_widmowe"]
    wynik = execute_domain_operation(
        zwiazany,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_item_id": TYP_PV, "catalog_namespace": "ZRODLO_NN_PV"},
    )
    assert not wynik.get("error"), wynik.get("error")
    assert _generator(wynik["snapshot"])["modele_widmowe"] == przed


def test_przypisanie_innego_typu_jest_odmowa_nazwana() -> None:
    zwiazany, ref = _zwiazany_pv()
    wynik = execute_domain_operation(
        zwiazany,
        "assign_catalog_to_element",
        {
            "element_ref": ref,
            "catalog_item_id": "conv-pv-nn-0p5mw-0p8kv",
            "catalog_namespace": "ZRODLO_NN_PV",
        },
    )
    assert wynik.get("error_code") == "der_bindings.karta_widmowa_innego_urzadzenia", wynik
    # Karta #142: podpowiedź naprawy słowami projektanta, nie zapisem kontraktu
    # (dawniej ``karty_widmowe_ref: null`` w treści).
    tresc = str(wynik.get("error"))
    assert "Odwiąż karty widmowe generatora" in tresc, tresc
    assert "karty_widmowe_ref" not in tresc and "conv-pv-nn-0p5mw-0p8kv" not in tresc, tresc


def test_aktualizacja_parametrow_nie_gubi_modeli() -> None:
    zwiazany, ref = _zwiazany_pv()
    przed = _generator(zwiazany)["modele_widmowe"]
    wynik = execute_domain_operation(
        zwiazany,
        "update_element_parameters",
        {"element_ref": ref, "parameters": {"name": "Falownik po zmianie nazwy"}},
    )
    assert not wynik.get("error"), wynik.get("error")
    po = _generator(wynik["snapshot"])
    assert po["name"] == "Falownik po zmianie nazwy"
    assert po["modele_widmowe"] == przed


def test_cgmes_side_car_zachowuje_modele_a_eq_tp_daje_none() -> None:
    from application.cgmes.service import export_cgmes, import_cgmes

    zwiazany, ref = _zwiazany_pv()
    model = EnergyNetworkModel.model_validate(zwiazany)
    archiwum = export_cgmes(model)
    z_side_car = import_cgmes(archiwum)
    assert z_side_car.enm is not None
    odtworzony = next(g for g in z_side_car.enm.generators if g.ref_id == ref)
    assert odtworzony.modele_widmowe == model.generators[-1].modele_widmowe
    assert z_side_car.enm.katalog_projektu == model.katalog_projektu
    z_eq_tp = import_cgmes(archiwum, prefer_side_car=False)
    assert z_eq_tp.enm is not None
    assert all(g.modele_widmowe is None for g in z_eq_tp.enm.generators)


def test_xlsx_daje_pusta_sekcje_kart_i_odcisk_bez_zmian() -> None:
    from application.xlsx_import.service import XlsxImportService

    from tests.utils.arkusz_xlsx import arkusz_siec_sn

    kompilacja, bledy = XlsxImportService(session=None)._wczytaj_i_skompiluj(  # type: ignore[arg-type]
        arkusz_siec_sn(), None, nazwa_modelu="xlsx"
    )
    assert kompilacja is not None, bledy
    model = kompilacja.model
    assert model.generators == []
    assert model.katalog_projektu is not None
    assert model.katalog_projektu.karty_widmowe == []
    migawka = model.model_dump(mode="json")
    sprzed_karty = copy.deepcopy(migawka)
    del sprzed_karty["katalog_projektu"]["karty_widmowe"]
    assert hash_migawki_enm(migawka) == hash_migawki_enm(sprzed_karty)
    assert compute_enm_hash(model) == hash_migawki_enm(sprzed_karty)


def test_archiwum_zip_zachowuje_modele_i_karty_projektu(
    test_db_session, tmp_path, monkeypatch
) -> None:
    from datetime import UTC, datetime
    from uuid import uuid4

    from application.project_archive.service import ProjectArchiveService
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import get_enm, reset_enm_store, set_enm
    from infrastructure.persistence.models import ProjectORM, StudyCaseORM

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    try:
        teraz = datetime.now(UTC)
        projekt = ProjectORM(
            id=uuid4(),
            name="Projekt z kartą widmową",
            description=None,
            schema_version="1.0.0",
            connection_node_id=None,
            sources_jsonb=[],
            created_at=teraz,
            updated_at=teraz,
        )
        test_db_session.add(projekt)
        test_db_session.add(
            StudyCaseORM(
                id=uuid4(),
                project_id=projekt.id,
                name="Przypadek",
                description=None,
                study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
                is_active=True,
                result_status="NONE",
                result_refs_jsonb=[],
                revision=1,
                created_at=teraz,
                updated_at=teraz,
            )
        )
        test_db_session.commit()
        zwiazany, ref = _zwiazany_pv()
        zapisany = set_enm(
            klucz_twin_projektu(projekt.id), EnergyNetworkModel.model_validate(zwiazany)
        )
        uslugi = ProjectArchiveService(test_db_session)
        archiwum = uslugi.export_project(projekt.id)
        reset_enm_store(remove_persisted=True)
        wynik = uslugi.import_project(archiwum, new_project_name="Import z kartą")
        assert wynik.project_id is not None, wynik.errors
        odtworzony = get_enm(klucz_twin_projektu(wynik.project_id))
        generator = next(g for g in odtworzony.generators if g.ref_id == ref)
        assert generator.modele_widmowe == zapisany.generators[-1].modele_widmowe
        assert odtworzony.katalog_projektu == zapisany.katalog_projektu
        # Odcisk nagłówka NIE jest tu porównywany: pomiar 2026-09-23 — import archiwum
        # modelu zbudowanego operacjami (stacja, źródło) podnosi rewizję do 2 i zmienia
        # odcisk TAKŻE bez kart widmowych (ta sama sonda na `_model(TORY[0])`); to
        # zachowanie magazynu/archiwum spoza tej karty, zgłoszone w meldunku.
    finally:
        reset_enm_store(remove_persisted=False)


# ---------------------------------------------------------------------------
# Karta projektu — operacja domenowa
# ---------------------------------------------------------------------------


def _dodaj_wynik(snapshot: dict[str, Any], rekord: dict[str, Any]) -> dict[str, Any]:
    with kontekst_katalogu(snapshot):
        return dodaj_karte_widmowa_projektu(snapshot, {"karta": rekord})


def test_karta_projektu_idempotentna_i_posortowana() -> None:
    snapshot = _model(TORY[0])
    karta_b = _karta_projektu(TYP_PV, "karta-b")
    karta_a = _karta_projektu(TYP_PV, "karta-a")
    snapshot = _dodaj(_dodaj(snapshot, karta_b), karta_a)
    ponownie = _dodaj(snapshot, karta_a)
    assert ponownie["katalog_projektu"] == snapshot["katalog_projektu"]
    assert [k["id"] for k in snapshot["katalog_projektu"]["karty_widmowe"]] == [
        "karta-a",
        "karta-b",
    ]
    assert sorted(katalog_dla_modelu(snapshot).karty_widmowe) == ["karta-a", "karta-b"]


@pytest.mark.parametrize(
    ("zmiana", "kod"),
    [
        ({"verification_status": "ZWERYFIKOWANY"}, "karta_widmowa.status_projektu"),
        ({"catalog_status": "PRODUKCYJNY_V1"}, "karta_widmowa.status_projektu"),
        ({"urzadzenie_ref": "typ-ktorego-nie-ma"}, "karta_widmowa.urzadzenie_nieznane"),
        ({"modele": []}, "karta_widmowa.odrzucona"),
    ],
)
def test_karta_projektu_odmowy_nazwane(zmiana: dict[str, Any], kod: str) -> None:
    snapshot = _model(TORY[0])
    rekord = {**_karta_projektu(TYP_PV).model_dump(mode="json"), **zmiana}
    wynik = _dodaj_wynik(snapshot, rekord)
    assert wynik.get("error_code") == kod, wynik
    if kod == "karta_widmowa.odrzucona":
        # Karta #142: kod reguły katalogu w maszynowej części odpowiedzi, nie w zdaniu
        # dla projektanta (dawniej test wymagał kodu w treści — utrwalenie defektu).
        assert wynik.get("kod_reguly_katalogu") == "KAT-T-014", wynik
        tresc = str(wynik.get("error"))
        assert "KAT-T" not in tresc and rekord["id"] not in tresc, tresc
        assert "[widmo." not in tresc, tresc  # identyfikator reguły kontraktu to kod
        assert "twardą regułę katalogu kart widmowych" in tresc, tresc


def test_karta_projektu_inna_tresc_pod_tym_samym_id_odrzucona() -> None:
    snapshot = _dodaj(_model(TORY[0]), _karta_projektu(TYP_PV))
    inna = _karta_projektu(TYP_PV, wersja="2").model_dump(mode="json")
    assert _dodaj_wynik(snapshot, inna).get("error_code") == "karta_widmowa.id_zajety"


def test_karta_projektu_nie_przeslania_karty_statycznej(
    katalog_statyczny_z_karta: KartaWidmowa,
) -> None:
    rekord = _karta_projektu(TYP_PV, katalog_statyczny_z_karta.id).model_dump(mode="json")
    wynik = _dodaj_wynik(_model(TORY[0]), rekord)
    assert wynik.get("error_code") == "karta_widmowa.id_zajety"


def test_karta_projektu_bez_rekordu_odmowa() -> None:
    snapshot = _model(TORY[0])
    with kontekst_katalogu(snapshot):
        wynik = dodaj_karte_widmowa_projektu(snapshot, {})
    assert wynik.get("error_code") == "karta_widmowa.payload_missing"


# ---------------------------------------------------------------------------
# Odcisk modelu
# ---------------------------------------------------------------------------


def _sprzed_karty(migawka: dict[str, Any]) -> dict[str, Any]:
    kopia = copy.deepcopy(migawka)
    for generator in kopia["generators"]:
        generator.pop("modele_widmowe", None)
    return kopia


def test_odcisk_bez_kart_rowny_odciskowi_sprzed_karty() -> None:
    for tor in TORY:
        migawka = _model(tor)
        model = EnergyNetworkModel.model_validate(migawka)
        dump = model.model_dump(mode="json")
        assert "modele_widmowe" in dump["generators"][-1]
        assert hash_migawki_enm(dump) == hash_migawki_enm(_sprzed_karty(dump)), tor.nazwa
        assert compute_enm_hash(model) == hash_migawki_enm(_sprzed_karty(dump)), tor.nazwa


def test_odcisk_z_karta_inny_i_trzy_funkcje_hasza_zgodne() -> None:
    snapshot = _dodaj(_model(TORY[0]), _karta_projektu(TYP_PV))
    ref = _generator(snapshot)["ref_id"]
    zwiazany = _wiaz(snapshot, ref, ["karta-proj-1"])["snapshot"]
    bez, z = (EnergyNetworkModel.model_validate(m) for m in (snapshot, zwiazany))
    assert compute_enm_hash(bez) != compute_enm_hash(z)
    assert compute_input_hash(bez) != compute_input_hash(z)
    for model in (bez, z):
        migawka = model.model_dump(mode="json")
        assert compute_enm_hash(model) == hash_migawki_enm(migawka)
    # Karta w katalogu projektu (bez wiązania) też jest treścią modelu.
    goly = EnergyNetworkModel.model_validate(_model(TORY[0]))
    assert compute_enm_hash(goly) != compute_enm_hash(bez)


def test_hash_migawki_nie_modyfikuje_sekcji_katalogu_projektu() -> None:
    migawka = EnergyNetworkModel.model_validate(
        {**_model(TORY[0]), "katalog_projektu": {"line_types": []}}
    ).model_dump(mode="json")
    assert migawka["katalog_projektu"]["karty_widmowe"] == []
    hash_migawki_enm(migawka)
    assert migawka["katalog_projektu"]["karty_widmowe"] == []


# ---------------------------------------------------------------------------
# Parytet sekcji typ ↔ element
# ---------------------------------------------------------------------------


def _model_z_wszystkimi_elementami() -> dict[str, Any]:
    snapshot = h._siec_ze_stacja()
    kroki: tuple[tuple[str, Callable[[dict[str, Any]], dict[str, Any]]], ...] = (
        ("add_nn_load", h._payload_nn_load),
        ("add_converter_source", h._payload_konwerter),
        (
            "add_converter_source",
            lambda s: h._payload_zrodla(s, catalog_ref=h.REF_FW, technologia="FW"),
        ),
        ("add_converter_source", h._payload_konwerter_der_sn),
        ("add_shunt_compensator_sn", h._payload_kompensator),
        ("add_load_sn", h._payload_odbior_sn),
        ("add_generator_sn", h._payload_generator_sn),
        ("add_nn_cable_segment", h._payload_kabel_nn),
    )
    for operacja, payload in kroki:
        snapshot = h._wykonaj(snapshot, operacja, payload(snapshot))
    return snapshot


def _model_z_linia() -> dict[str, Any]:
    """GPZ → odcinek LINII napowietrznej (przestrzeń ``LINIA_SN``)."""
    snapshot = h._wykonaj(
        h._pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": h.REF_ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    return h._wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "LINIA", "dlugosc_m": 1000.0, "catalog_ref": LINIA_SN}},
    )


#: Przestrzenie z widokiem sekcji BEZ elementu ENM — z powodem.
PRZESTRZENIE_BEZ_ELEMENTU = {
    "BATERIA_BESS": (
        "pakiet baterii wiązany z generatorem BESS kluczem `battery_catalog_ref` — nie ma "
        "własnego elementu ENM"
    ),
}


def test_parytet_sekcji_typ_i_element_dla_kazdej_przestrzeni() -> None:
    migawki = [
        _model_z_wszystkimi_elementami(),
        _model_z_linia(),
        _model(TORY[0]),
        _model(TORY[1]),
    ]
    pokryte: set[str] = set()
    for migawka in migawki:
        katalog = katalog_dla_modelu(migawka)
        for kolekcja in (
            "generators",
            "sources",
            "transformers",
            "branches",
            "loads",
            "shunt_capacitors",
        ):
            for element in migawka.get(kolekcja, []):
                przestrzen = element.get("catalog_namespace")
                if przestrzen not in PRZESTRZENIE_Z_SEKCJAMI:
                    continue
                element_statusy = {
                    o.sekcja: o.status for o in sekcje_elementu(migawka, element["ref_id"])
                }
                typ_statusy = {
                    o.sekcja: o.status
                    for o in sekcje_typu(katalog, przestrzen, element["catalog_ref"])
                }
                assert element_statusy == typ_statusy, (kolekcja, element["ref_id"], przestrzen)
                pokryte.add(przestrzen)
    assert pokryte | set(PRZESTRZENIE_BEZ_ELEMENTU) == set(PRZESTRZENIE_Z_SEKCJAMI), sorted(
        set(PRZESTRZENIE_Z_SEKCJAMI) - pokryte - set(PRZESTRZENIE_BEZ_ELEMENTU)
    )


def test_parytet_z_karta_projektu_typ_i_element() -> None:
    """Element z kartą projektu typu X ≡ typ X w katalogu modelu z tą kartą."""
    karta = _karta_projektu(
        TYP_PV,
        modele=(f.model(pomiar=f.pomiar_kompletny()),),
        dowody=(f.dowod("RAPORT_BADAN", ("HARMONIC_FREQUENCY_DOMAIN",)),),
    )
    snapshot = _dodaj(_model(TORY[0]), karta)
    ref = _generator(snapshot)["ref_id"]
    zwiazany = _wiaz(snapshot, ref, [karta.id])["snapshot"]
    element = {o.sekcja: o.status for o in sekcje_elementu(zwiazany, ref)}
    typ = {
        o.sekcja: o.status
        for o in sekcje_typu(katalog_dla_modelu(zwiazany), "ZRODLO_NN_PV", TYP_PV)
    }
    assert element == typ
    assert element["measurement"] == "MEASURED"


# ---------------------------------------------------------------------------
# Adapter elementu — przypadki brzegowe
# ---------------------------------------------------------------------------


def test_element_bez_typu_ma_status_danych_inzyniera() -> None:
    snapshot = _model(TORY[-1])
    dane = dane_elementu(snapshot, _generator(snapshot)["ref_id"])
    assert dane.status_weryfikacji_rekordu == "NIEWERYFIKOWANY"
    assert dane.klasa == "Generator"


@pytest.mark.parametrize(
    ("ref", "kod"),
    [("element-ktorego-nie-ma", "sekcje.element_nieznany")],
)
def test_element_nieznany_odmowa(ref: str, kod: str) -> None:
    with pytest.raises(OdmowaSekcjiElementu) as blad:
        sekcje_elementu(_model(TORY[0]), ref)
    assert blad.value.kod == kod


def test_aparat_bez_widoku_sekcji_odmowa_z_powodem() -> None:
    snapshot = h._siec_ze_stacja()
    aparat = next(b for b in snapshot["branches"] if b.get("catalog_namespace") == "APARAT_SN")
    with pytest.raises(OdmowaSekcjiElementu, match="aparatura łączeniowa") as blad:
        sekcje_elementu(snapshot, aparat["ref_id"])
    assert blad.value.kod == "sekcje.brak_widoku"


def test_typ_usuniety_z_katalogu_odmowa_nazwana() -> None:
    snapshot = copy.deepcopy(_model(TORY[0]))
    snapshot["generators"][-1]["catalog_ref"] = "typ-usuniety"
    with pytest.raises(OdmowaSekcjiElementu) as blad:
        sekcje_elementu(snapshot, _generator(snapshot)["ref_id"])
    assert blad.value.kod == "sekcje.typ_niedostepny"


@pytest.mark.parametrize(
    ("dynamika_zrodlo", "wiazanie", "oczekiwany"),
    [
        (None, None, "UNKNOWN"),
        (None, "default_pv_gfl", "UNVALIDATED"),
        ("karta_producenta", None, "UNVALIDATED"),
        ("profil_typowy_normy", "default_pv_gfl", "UNVALIDATED"),
    ],
)
def test_sekcja_dynamic_elementu_ze_zrodel_modelu(
    dynamika_zrodlo: str | None, wiazanie: str | None, oczekiwany: str
) -> None:
    snapshot = copy.deepcopy(_model(TORY[0]))
    generator = snapshot["generators"][-1]
    if wiazanie is not None:
        generator["materialized_params"]["dynamic_model_ref"] = wiazanie
    if dynamika_zrodlo is not None:
        generator["dynamika"] = {
            "rodzina": "przeksztaltnik_gfl",
            "proweniencja": {"zrodlo": dynamika_zrodlo, "odniesienie": "dokument"},
        }
    dane = dane_elementu(snapshot, generator["ref_id"])
    oceny = {o.sekcja: o for o in sekcje_elementu(snapshot, generator["ref_id"])}
    assert oceny["dynamic"].status == oczekiwany
    if dynamika_zrodlo is None and wiazanie is None:
        assert dane.pola["model_dynamiczny"] is None
    if wiazanie is not None:
        assert "wiązanie elementu" in str(dane.pola["model_dynamiczny"])


def test_katalog_z_projektem_ma_karte_i_zachowuje_statyczny() -> None:
    snapshot = _dodaj(_model(TORY[0]), _karta_projektu(TYP_PV))
    katalog: CatalogRepository = katalog_dla_modelu(snapshot)
    assert katalog.get_karta_widmowa("karta-proj-1") is not None
    assert katalog.converter_types == get_default_mv_catalog().converter_types
