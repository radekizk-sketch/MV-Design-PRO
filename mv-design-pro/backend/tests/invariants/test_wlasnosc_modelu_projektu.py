"""Inwarianty CV-1 (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2): PROJECT owns ENM.

I-1: dla projektu istnieje dokładnie jeden klucz magazynu ENM — wszystkie przypadki
     projektu tłumaczą się na ten sam klucz.
I-2: przypadek nie posiada własnego modelu: tłumaczenie `case_id` spoza bazy jest
     JAWNYM błędem, nie „modelem domyślnym".
I-3: dwa przypadki tego samego projektu czytają ten sam model (ten sam hash).
Migracja zastanych plików per przypadek: model przypadku aktywnego staje się modelem
projektu; pozostałe lądują w `legacy_przypadki/` z manifestem ZGODNY / ROZBIEZNY —
nic nie ginie po cichu (procedura kasacji: data export → parity → cutover).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from application import twin_key
from domain.models import Project
from domain.study_case import StudyCase
from enm import dziennik_zmian, store
from enm.klucz_twin import PrzypadekBezProjektuError, klucz_twin_projektu
from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    store.reset_enm_store()
    twin_key.zapomnij_migracje()
    yield
    store.reset_enm_store()
    twin_key.zapomnij_migracje()


def _projekt_z_przypadkami(uow_factory, liczba: int, *, aktywny: int | None = 0):
    project_id = uuid4()
    case_ids = [uuid4() for _ in range(liczba)]
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Projekt inwariantow"), commit=False)
        for i, case_id in enumerate(case_ids):
            uow.cases.add_study_case(
                StudyCase(
                    id=case_id,
                    project_id=project_id,
                    name=f"Przypadek {i}",
                    is_active=(aktywny is not None and i == aktywny),
                ),
                commit=False,
            )
        uow.commit()
    return project_id, case_ids


def _model(nazwa: str, liczba_szyn: int) -> EnergyNetworkModel:
    enm = EnergyNetworkModel(
        header=ENMHeader(name=nazwa, defaults=ENMDefaults()),
        buses=[
            Bus(ref_id=f"szyna-{i}", name=f"Szyna {i}", voltage_kv=15.0) for i in range(liczba_szyn)
        ],
    )
    return enm


def test_i1_i3_wszystkie_przypadki_projektu_maja_jeden_klucz(uow_factory) -> None:
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 3)
    klucze = {twin_key.klucz_twin_dla_przypadku(str(c), uow_factory) for c in case_ids}
    assert klucze == {klucz_twin_projektu(project_id)}
    # I-3: zapis przez jeden przypadek jest widoczny przez drugi — ten sam model, ten sam hash.
    klucz = klucz_twin_projektu(project_id)
    zapisany = store.set_enm(klucz, _model("wspolny", 2))
    for c in case_ids:
        assert store.get_enm(
            twin_key.klucz_twin_dla_przypadku(str(c), uow_factory)
        ).header.hash_sha256 == (zapisany.header.hash_sha256)


def test_i2_przypadek_spoza_bazy_to_jawny_blad(uow_factory) -> None:
    with pytest.raises(PrzypadekBezProjektuError):
        twin_key.klucz_twin_dla_przypadku(str(uuid4()), uow_factory)
    with pytest.raises(PrzypadekBezProjektuError):
        twin_key.klucz_twin_dla_przypadku("nie-uuid", uow_factory)
    with pytest.raises(PrzypadekBezProjektuError):
        twin_key.klucz_twin_dla_przypadku(str(uuid4()), None)
    # I-2 na poziomie magazynu: przypadek spoza bazy NIE dostał modelu domyślnego pod
    # żadnym kluczem (zero plików w magazynie).
    assert list(store._store_dir().glob("*.json")) == []


def test_migracja_aktywny_przypadek_staje_sie_modelem_projektu_a_reszta_trafia_do_manifestu(
    uow_factory,
) -> None:
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 3, aktywny=1)
    # Stan zastany: trzy pliki per przypadek — aktywny (1) ma 3 szyny (rewizja 2),
    # przypadek 0 ma INNY model (5 szyn), przypadek 2 ma model IDENTYCZNY z aktywnym.
    # `compute_enm_hash` obejmuje `header.name` (nazwa modelu jest semantyczna), a pomija
    # pola techniczne nagłówka (rewizja, hash, znaczniki czasu) i losowe `id` elementów.
    store.set_enm(str(case_ids[1]), _model("aktywny", 3))
    store.set_enm(str(case_ids[1]), _model("aktywny v2", 3))  # rewizja 2 przypadku aktywnego
    store.set_enm(str(case_ids[0]), _model("inny", 5))
    store.set_enm(str(case_ids[2]), _model("aktywny v2", 3))  # treść identyczna z aktywnym
    hash_aktywnego = store.get_enm(str(case_ids[1])).header.hash_sha256
    rewizja_aktywnego = store.get_enm(str(case_ids[1])).header.revision

    klucz = twin_key.klucz_twin_dla_przypadku(str(case_ids[0]), uow_factory)

    model_projektu = store.get_enm(klucz)
    assert model_projektu.header.hash_sha256 == hash_aktywnego
    assert model_projektu.header.revision == rewizja_aktywnego  # bez podbicia rewizji (jak restore)
    assert len(model_projektu.buses) == 3
    statusy = {w["case_id"]: w["status"] for w in store.wiersze_manifestu_legacy()}
    assert statusy == {
        str(case_ids[1]): "PRZENIESIONY",
        str(case_ids[0]): "ROZBIEZNY",
        str(case_ids[2]): "ZGODNY",
    }
    # Pliki per przypadek zniknęły z katalogu głównego, ale NIE z dysku (legacy_przypadki/).
    for c in case_ids:
        assert not store._case_path(str(c)).exists()
    legacy = store._store_dir() / store.KATALOG_LEGACY
    snapshoty = [p for p in legacy.glob("*.json") if not p.name.endswith(".dziennik.json")]
    dzienniki = list(legacy.glob("*.dziennik.json"))
    # INTENCJA (bez zmian): nic nie ginie — snapshot KAŻDEGO przypadku ląduje w
    # `legacy_przypadki/`. KANON DZIENNIKA (przegląd adwersaryjny CV-1, korekta):
    # dziennik idzie ZA MODELEM, więc historia przypadku PRZENIESIONEGO żyje odtąd
    # pod kluczem projektu (model zachował jego licznik rewizji — dziennik odłożony
    # razem z odrzuconymi zostawiałby projekt z dziurą w historii). Odkładane są
    # więc dzienniki DWÓCH przypadków, których modele nie zostały modelem projektu.
    assert len(snapshoty) == 3
    assert len(dzienniki) == 2
    stan_dziennika = {w["case_id"]: w["dziennik"] for w in store.wiersze_manifestu_legacy()}
    assert stan_dziennika == {
        str(case_ids[1]): "ZA_MODELEM",
        str(case_ids[0]): "ODLOZONY",
        str(case_ids[2]): "ODLOZONY",
    }
    assert [w.rewizja for w in dziennik_zmian.wszystkie_wpisy(klucz)] == [1, 2]
    # Idempotencja: powtórne tłumaczenie nie skanuje ponownie i nie dopisuje manifestu.
    twin_key.klucz_twin_dla_przypadku(str(case_ids[2]), uow_factory)
    assert len(store.wiersze_manifestu_legacy()) == 3


def test_migracja_bez_plikow_legacy_nie_tworzy_manifestu(uow_factory) -> None:
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2)
    klucz = twin_key.klucz_twin_dla_przypadku(str(case_ids[0]), uow_factory)
    assert klucz == klucz_twin_projektu(project_id)
    assert store.wiersze_manifestu_legacy() == []
    assert not store.has_enm(klucz)  # projekt bez modelu nie dostaje modelu „przy okazji"


def test_migracja_bez_aktywnego_przypadku_bierze_pierwszy_w_porzadku_listy(uow_factory) -> None:
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=None)
    with uow_factory() as uow:
        kolejnosc = [str(c.id) for c in uow.cases.list_study_cases(project_id)]
    store.set_enm(kolejnosc[0], _model("pierwszy", 2))
    store.set_enm(kolejnosc[1], _model("drugi", 4))
    klucz = twin_key.klucz_twin_dla_przypadku(kolejnosc[1], uow_factory)
    assert len(store.get_enm(klucz).buses) == 2
    statusy = {w["case_id"]: w["status"] for w in store.wiersze_manifestu_legacy()}
    assert statusy[kolejnosc[0]] == "PRZENIESIONY" and statusy[kolejnosc[1]] == "ROZBIEZNY"


def test_migracja_aktywny_bez_modelu_zastanego_nie_blokuje_promocji_nastepnego(uow_factory) -> None:
    """Pułapka kolejności (przegląd CV-2-W): przypadek AKTYWNY bez modelu zastanego
    (`BRAK_LEGACY`) nie może zostawić projektu bez modelu, gdy inny przypadek
    projektu model MA — ten następny w kolejności promocji przyjmuje rolę modelu
    projektu, a jego plik nie ląduje w `legacy_przypadki/` jako `ROZBIEZNY`."""
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 3, aktywny=0)
    model_drugiego = _model("drugi", 2)
    store.set_enm(str(case_ids[1]), model_drugiego)
    store.set_enm(str(case_ids[2]), _model("trzeci", 3))

    wynik = twin_key.migruj_projekt_z_legacy(project_id, uow_factory)

    statusy = {w.case_id: w.status for w in wynik.wyniki}
    assert statusy == {
        str(case_ids[0]): "BRAK_LEGACY",
        str(case_ids[1]): "PRZENIESIONY",
        str(case_ids[2]): "ROZBIEZNY",
    }
    klucz = klucz_twin_projektu(project_id)
    assert store.has_enm(klucz)
    assert store.hash_tresci_modelu(store.get_enm(klucz)) == store.hash_tresci_modelu(
        model_drugiego
    )
    assert [w["status"] for w in store.wiersze_manifestu_legacy()] == ["PRZENIESIONY", "ROZBIEZNY"]
