"""Koperta rewizji biegu (`enm/envelope.py`) i swiezosc WYPROWADZANA (CV-2).

Iloczyn cech przypiety testami: (mutacja modelu | mutacja katalogu | brak zmian |
koperta niespojna | brak koperty) × (bieg z wynikiem | bieg bez wyniku), determinizm
koperty i odcisku katalogu (dwa procesy), `create_run` wypelnia koperte z rewizji
biezacej i odcisku katalogu, status przypadku wyprowadzany z biegow bez pisarza.
"""

from __future__ import annotations

import json
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from application.result_freshness import (
    FreshnessReason,
    FreshnessVerdict,
    ResultFreshness,
    StanBiezacyModelu,
    evaluate_envelope_freshness,
    status_wynikow_przypadku,
    swiezosc_biegu_kanonicznego,
)
from enm.dziennik_zmian import WpisDziennika, wszystkie_wpisy, wyczysc_dziennik
from enm.envelope import RevisionEnvelope, zbuduj_koperte
from enm.hash import compute_enm_hash
from enm.store import ZrodloZmiany, get_enm, reset_enm_store, set_enm
from network_model.catalog.odcisk import odcisk_katalogu, odcisk_katalogu_domyslnego
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

ODCISK = "k" * 64


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield
    reset_enm_store()
    wyczysc_dziennik()


@dataclass
class _Bieg:
    status: str
    raw_result: dict[str, Any] | None
    envelope: dict[str, Any] | None
    snapshot_hash: str


def _koperta(rewizja: int, hash_: str, odcisk: str = ODCISK) -> RevisionEnvelope:
    return zbuduj_koperte(
        project_id=None,
        model_revision=rewizja,
        snapshot_hash=hash_,
        catalog_fingerprint=odcisk,
        options_hash="opcje",
    )


def _wpis(rewizja: int, operacja: str = "add_sn_bay") -> WpisDziennika:
    return WpisDziennika(
        rewizja=rewizja,
        znacznik_czasu="t",
        operacja=operacja,
        opis_pl=f"opis {rewizja}",
        utworzone=(f"el-{rewizja}",),
    )


class TestKoperta:
    def test_round_trip_i_spojnosc(self) -> None:
        koperta = _koperta(3, "h")
        assert koperta.spojna
        odczyt = RevisionEnvelope.from_dict(json.loads(json.dumps(koperta.to_dict())))
        assert odczyt == koperta
        assert RevisionEnvelope.from_dict(None) is None
        assert RevisionEnvelope.from_dict({"model_revision": "x"}) is None

    def test_zmiana_dowolnego_pola_zmienia_odcisk_semantyczny(self) -> None:
        bazowa = _koperta(3, "h")
        warianty = [
            _koperta(4, "h"),
            _koperta(3, "inny"),
            _koperta(3, "h", odcisk="x" * 64),
            zbuduj_koperte(
                project_id="p",
                model_revision=3,
                snapshot_hash="h",
                catalog_fingerprint=ODCISK,
                options_hash="opcje",
            ),
            zbuduj_koperte(
                project_id=None,
                model_revision=3,
                snapshot_hash="h",
                catalog_fingerprint=ODCISK,
                options_hash="inne-opcje",
            ),
        ]
        odciski = {w.semantic_fingerprint for w in warianty}
        assert bazowa.semantic_fingerprint not in odciski
        assert len(odciski) == len(warianty)

    def test_koperta_zmieniona_poza_systemem_nie_jest_spojna(self) -> None:
        dane = _koperta(3, "h").to_dict()
        dane["model_revision"] = 9
        odczyt = RevisionEnvelope.from_dict(dane)
        assert odczyt is not None and not odczyt.spojna


class TestOdciskKatalogu:
    def test_deterministyczny_w_procesie_i_miedzy_procesami(self) -> None:
        odcisk_a = odcisk_katalogu_domyslnego()
        assert odcisk_a == odcisk_katalogu(get_default_mv_catalog())
        kod = (
            "from network_model.catalog.odcisk import odcisk_katalogu_domyslnego;"
            "print(odcisk_katalogu_domyslnego())"
        )
        src = Path(__file__).resolve().parents[2] / "src"
        wynik = subprocess.run(
            [sys.executable, "-c", kod],
            capture_output=True,
            text=True,
            check=True,
            env={"PYTHONPATH": str(src), "PYTHONHASHSEED": "12345", "PATH": ""},
        )
        assert wynik.stdout.strip() == odcisk_a
        assert len(odcisk_a) == 64

    def test_zmiana_jednego_pola_typu_zmienia_odcisk(self) -> None:
        katalog = get_default_mv_catalog()
        identyfikator, typ = next(iter(sorted(katalog.cable_types.items())))
        zmieniony = CatalogRepository(
            **{
                **{pole: getattr(katalog, pole) for pole in katalog.__dataclass_fields__},
                "cable_types": {
                    **katalog.cable_types,
                    identyfikator: type(typ)(
                        **{**typ.__dict__, "r_ohm_per_km": typ.r_ohm_per_km + 1e-6}
                    ),
                },
            }
        )
        assert odcisk_katalogu(zmieniony) != odcisk_katalogu(katalog)


class TestSwiezoscZKoperty:
    def _biezacy(self, rewizja: int = 5, hash_: str = "h5") -> dict[str, Any]:
        return {
            "rewizja_biezaca": rewizja,
            "hash_biezacy": hash_,
            "odcisk_katalogu_biezacy": ODCISK,
        }

    def test_brak_wyniku_to_none_niezaleznie_od_koperty(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=False, envelope=_koperta(5, "h5"), **self._biezacy()
        )
        assert werdykt.status == ResultFreshness.NONE

    def test_brak_modelu_biezacego_to_outdated(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=True,
            envelope=_koperta(5, "h5"),
            rewizja_biezaca=None,
            hash_biezacy=None,
            odcisk_katalogu_biezacy=ODCISK,
        )
        assert (werdykt.status, werdykt.reason) == (
            ResultFreshness.OUTDATED,
            FreshnessReason.BRAK_MODELU_BIEZACEGO,
        )

    def test_brak_koperty_wraca_na_kotwice_hashowe(self) -> None:
        aktualny = evaluate_envelope_freshness(
            has_result=True, envelope=None, kotwice_hashowe=("h5",), **self._biezacy()
        )
        assert aktualny.status == ResultFreshness.FRESH
        nieaktualny = evaluate_envelope_freshness(
            has_result=True, envelope=None, kotwice_hashowe=("h4",), **self._biezacy()
        )
        assert nieaktualny.reason == FreshnessReason.MODEL_ZMIENIONY
        bez_kotwicy = evaluate_envelope_freshness(
            has_result=True, envelope=None, kotwice_hashowe=(None,), **self._biezacy()
        )
        assert bez_kotwicy.reason == FreshnessReason.BRAK_ODCISKU_W_BIEGU

    def test_koperta_niespojna_to_outdated_z_nazwana_przyczyna(self) -> None:
        dane = _koperta(5, "h5").to_dict()
        dane["snapshot_hash"] = "podmieniony"
        werdykt = evaluate_envelope_freshness(
            has_result=True, envelope=RevisionEnvelope.from_dict(dane), **self._biezacy()
        )
        assert werdykt.reason == FreshnessReason.KOPERTA_NIESPOJNA

    def test_mutacja_modelu_daje_liste_zmian_od_biegu(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=True,
            envelope=_koperta(3, "h3"),
            zmiany=[_wpis(2), _wpis(3), _wpis(4, "continue_trunk_segment_sn"), _wpis(5)],
            **self._biezacy(5, "h5"),
        )
        assert (werdykt.status, werdykt.reason) == (
            ResultFreshness.OUTDATED,
            FreshnessReason.MODEL_ZMIENIONY,
        )
        assert (werdykt.rewizja_biegu, werdykt.rewizja_biezaca) == (3, 5)
        assert [z.rewizja for z in werdykt.zmiany] == [4, 5]
        assert werdykt.zmiany[0].operacja == "continue_trunk_segment_sn"
        assert werdykt.zmiany[0].elementy == ("el-4",)
        pola = werdykt.to_overlay_fields()
        assert pola["result_status"] == "OUTDATED"
        assert [z["rewizja"] for z in pola["zmiany_od_biegu"]] == [4, 5]

    def test_ta_sama_rewizja_inny_hash_to_outdated(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=True, envelope=_koperta(5, "inny"), **self._biezacy(5, "h5")
        )
        assert werdykt.reason == FreshnessReason.MODEL_ZMIENIONY

    def test_mutacja_katalogu_przy_niezmienionym_modelu(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=True,
            envelope=_koperta(5, "h5", odcisk="stary" * 12 + "xxxx"),
            **self._biezacy(5, "h5"),
        )
        assert (werdykt.status, werdykt.reason) == (
            ResultFreshness.OUTDATED,
            FreshnessReason.KATALOG_ZMIENIONY,
        )

    def test_brak_zmian_to_fresh(self) -> None:
        werdykt = evaluate_envelope_freshness(
            has_result=True, envelope=_koperta(5, "h5"), **self._biezacy(5, "h5")
        )
        assert (werdykt.status, werdykt.reason) == (
            ResultFreshness.FRESH,
            FreshnessReason.MODEL_NIEZMIENIONY,
        )
        assert werdykt.zmiany == ()

    def test_kazdy_kod_przyczyny_ma_zdanie_pl(self) -> None:
        from application.result_freshness import REASON_TEXTS_PL

        for kod in FreshnessReason:
            assert REASON_TEXTS_PL[kod].strip()

    def test_werdykt_bez_nowych_pol_zachowuje_ksztalt(self) -> None:
        werdykt = FreshnessVerdict(ResultFreshness.FRESH, FreshnessReason.MODEL_NIEZMIENIONY)
        pola = werdykt.to_overlay_fields()
        assert pola["rewizja_biegu"] is None and pola["zmiany_od_biegu"] == []


class TestSwiezoscBieguWMagazynie:
    """Koperta × PRAWDZIWY magazyn: zmiany po biegu pochodza z dziennika."""

    def test_zmiany_od_biegu_pochodza_z_dziennika_projektu(self) -> None:
        klucz = f"projekt:{uuid.uuid4()}"
        model = get_enm(klucz).model_copy(deep=True)
        model.header.name = "Stan biegu"
        zapisany = set_enm(klucz, model, zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay"))
        koperta = zbuduj_koperte(
            project_id=None,
            model_revision=zapisany.header.revision,
            snapshot_hash=compute_enm_hash(zapisany),
            catalog_fingerprint=odcisk_katalogu_domyslnego(),
            options_hash="o",
        )
        bieg = _Bieg("FINISHED", {"ok": True}, koperta.to_dict(), compute_enm_hash(zapisany))

        stan = StanBiezacyModelu(
            klucz,
            zapisany.header.revision,
            compute_enm_hash(zapisany),
            odcisk_katalogu_domyslnego(),
        )
        assert swiezosc_biegu_kanonicznego(bieg, stan).status == ResultFreshness.FRESH

        po_zmianie = get_enm(klucz).model_copy(deep=True)
        po_zmianie.header.name = "Po zmianie"
        nowy = set_enm(
            klucz,
            po_zmianie,
            zrodlo_zmiany=ZrodloZmiany(operacja="continue_trunk_segment_sn", utworzone=("seg-1",)),
        )
        stan_po = StanBiezacyModelu(
            klucz, nowy.header.revision, compute_enm_hash(nowy), odcisk_katalogu_domyslnego()
        )
        werdykt = swiezosc_biegu_kanonicznego(bieg, stan_po)
        assert werdykt.reason == FreshnessReason.MODEL_ZMIENIONY
        assert [z.rewizja for z in werdykt.zmiany] == [nowy.header.revision]
        assert werdykt.zmiany[0].operacja == "continue_trunk_segment_sn"
        assert werdykt.zmiany[0].elementy == ("seg-1",)
        assert [w.rewizja for w in wszystkie_wpisy(klucz)][-1] == nowy.header.revision

    def test_status_przypadku_wyprowadzony_z_biegow(self) -> None:
        stan = StanBiezacyModelu("k", 5, "h5", ODCISK)
        swiezy = _Bieg("FINISHED", {"ok": True}, _koperta(5, "h5").to_dict(), "h5")
        stary = _Bieg("FINISHED", {"ok": True}, _koperta(3, "h3").to_dict(), "h3")
        bez_wyniku = _Bieg("FAILED", None, _koperta(5, "h5").to_dict(), "h5")
        assert status_wynikow_przypadku([], stan)[0] == ResultFreshness.NONE
        assert status_wynikow_przypadku([bez_wyniku], stan)[0] == ResultFreshness.NONE
        status, werdykt = status_wynikow_przypadku([stary, bez_wyniku], stan)
        assert status == ResultFreshness.OUTDATED and werdykt is not None
        assert werdykt.rewizja_biegu == 3
        status, werdykt = status_wynikow_przypadku([stary, swiezy], stan)
        assert (
            status == ResultFreshness.FRESH and werdykt is not None and werdykt.rewizja_biegu == 5
        )

    def test_stan_biezacy_bez_przypadku_jest_uczciwym_brakiem(self) -> None:
        stan = StanBiezacyModelu.dla_przypadku(None, None)
        assert (stan.klucz, stan.rewizja, stan.hash_sha256) == (None, None, None)
        assert stan.odcisk_katalogu == odcisk_katalogu_domyslnego()


class TestKopertaNaBieguKanonicznym:
    """`create_run` wypelnia koperte z rewizji BIEZACEJ i odcisku katalogu; swiezosc
    biegu jest wyprowadzana z tej koperty przez ten sam mechanizm co nakladka."""

    def _magistrala(self, klucz: str) -> None:
        from enm.domain_operations import execute_domain_operation
        from enm.models import EnergyNetworkModel

        enm_dict = get_enm(klucz).model_dump(mode="json")
        wynik = execute_domain_operation(
            enm_dict=enm_dict,
            op_name="add_grid_source_sn",
            payload={
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                # FAB-G: para (kV, MVA) wskazuje typ transformatora GPZ z katalogu.
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
                "catalog_binding": {
                    "catalog_namespace": "ZRODLO_SN",
                    "catalog_item_id": "src-gpz-15kv-250mva-rx010",
                    "catalog_item_version": "2026.1",
                },
            },
        )
        assert not wynik.get("error"), wynik.get("error")
        set_enm(
            klucz,
            EnergyNetworkModel.model_validate(wynik["snapshot"]),
            zrodlo_zmiany=ZrodloZmiany(operacja="add_grid_source_sn"),
        )

    def test_create_run_niesie_koperte_rewizji_biezacej(self, tmp_path, monkeypatch) -> None:
        from enm.canonical_analysis import create_run
        from infrastructure.persistence.repositories import canonical_run_repository as repo

        monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'biegi.db'}")
        repo._cached_database_url = None
        repo._cached_engine = None
        repo._cached_session_factory = None
        klucz = f"projekt:{uuid.uuid4()}"
        self._magistrala(klucz)
        model = get_enm(klucz)

        run = create_run(
            case_id=str(uuid.uuid4()),
            klucz_twin=klucz,
            analysis_type="short_circuit_sn",
            options={"fault_type": "3F"},
        )
        koperta = run.koperta
        assert koperta is not None and koperta.spojna
        assert koperta.model_revision == model.header.revision
        assert koperta.snapshot_hash == compute_enm_hash(model) == run.snapshot_hash
        assert koperta.catalog_fingerprint == odcisk_katalogu_domyslnego()
        assert koperta.options_hash == run.input_hash
        assert koperta.project_id == klucz.split(":", 1)[1]

        # Zapis i odczyt z bazy zachowuja koperte (kolumna addytywna `envelope_json`).
        with repo.canonical_run_repository_scope() as repository:
            odczyt = repository.get(run.id)
            lista = repository.list_by_case(run.case_id)
        assert odczyt is not None and odczyt.envelope == run.envelope
        assert lista and lista[0].envelope == run.envelope

        # Swiezosc: bieg bez wyniku = NONE; po „wyniku" = FRESH; po mutacji modelu =
        # OUTDATED z lista zmian z dziennika (bez zadnego pisarza statusu).
        stan = StanBiezacyModelu(
            klucz, model.header.revision, compute_enm_hash(model), odcisk_katalogu_domyslnego()
        )
        assert swiezosc_biegu_kanonicznego(run, stan).status == ResultFreshness.NONE
        run.status = "FINISHED"
        run.raw_result = {"wynik": True}
        assert swiezosc_biegu_kanonicznego(run, stan).status == ResultFreshness.FRESH

        zmieniony = get_enm(klucz).model_copy(deep=True)
        zmieniony.header.name = "Po biegu"
        nowy = set_enm(
            klucz,
            zmieniony,
            zrodlo_zmiany=ZrodloZmiany(operacja="add_sn_bay", utworzone=("pole-1",)),
        )
        stan_po = StanBiezacyModelu(
            klucz, nowy.header.revision, compute_enm_hash(nowy), odcisk_katalogu_domyslnego()
        )
        werdykt = swiezosc_biegu_kanonicznego(run, stan_po)
        assert werdykt.reason == FreshnessReason.MODEL_ZMIENIONY
        assert [z.operacja for z in werdykt.zmiany] == ["add_sn_bay"]
        assert werdykt.zmiany[0].elementy == ("pole-1",)
        assert status_wynikow_przypadku([run], stan_po)[0] == ResultFreshness.OUTDATED
