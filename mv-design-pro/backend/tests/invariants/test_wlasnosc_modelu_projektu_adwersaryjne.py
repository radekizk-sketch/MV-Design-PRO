"""Inwarianty adwersaryjne CV-1 (§38): próba OBALENIA twierdzenia „PROJECT owns ENM".

Twierdzenie pod ostrzałem (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2):
projekt ma JEDEN kanoniczny model sieci kluczowany `projekt:<uuid>`; `case_id` jest
wyłącznie adresem wejściowym API tłumaczonym w JEDNYM miejscu; żadna ścieżka nie
tworzy modelu per przypadek; migracja zastanych plików per przypadek nic nie gubi.

Każdy test poniżej jest PRÓBĄ OBALENIA, nie ilustracją. Test zielony = twierdzenie
obroniło się na tej granicy i zostaje jako zapadka; test, który był czerwony przy
pisaniu tej karty, nazywa defekt i jego naprawę u źródła.

I-5  Ścieżka ADRESOWANA PROJEKTEM (nie przypadkiem) też migruje pliki zastane —
     eksport archiwum projektu nie może oddać pustej sekcji ENM tylko dlatego, że
     w tym procesie nikt jeszcze nie przetłumaczył żadnego `case_id`.
     [BYŁ CZERWONY — `project_archive/service.py::_collect_enm`]
I-6  Dziennik zmian idzie ZA modelem przy promocji przypadku na model projektu —
     rewizja modelu i historia rewizji nie mogą się rozjechać.
     [BYŁ CZERWONY — `store.migruj_klucz_przypadku_do_projektu`]
I-7  Ścieżka projektowa nie FABRYKUJE modelu domyślnego, gdy istnieją pliki zastane
     (inaczej realny model projektanta ląduje w `legacy_przypadki/` jako ROZBIEZNY,
     a projekt dostaje pustą sieć). [BYŁ CZERWONY — `analysis_dispatch/service.py`]
     USUNIĘTY (karta CV-3.3-A, 2026-09-05): jedyny wywoływacz tego scenariusza
     (`AnalysisDispatchService.dispatch(..., project_id=...)`) skasowany razem z
     `analysis_dispatch`/`api/unified_runs.py` (E2-widmo, zero konsumenta
     produkcyjnego) — ścieżka, którą ten test próbował obalić, już nie istnieje.
     Klasa defektu (ścieżka adresowana projektem fabrykuje pusty model) pozostaje
     pod strażą I-5 przez żywy, produkcyjny wpis: `project_archive/service.py`.
I-8  Równoległe pierwsze tłumaczenie dwóch przypadków tego samego projektu daje
     DOKŁADNIE jedną promocję i model przypadku aktywnego. [zielony od początku]
I-9  Dwa równoległe cykle odczyt→zapis adresowane przez dwa RÓŻNE przypadki TEGO
     SAMEGO projektu — po CV-1 pracują na JEDNYM modelu, więc blokada projektu musi
     objąć obie ścieżki. (Wyścig dwóch RÓŻNYCH KOŃCÓWEK HTTP na jednym przypadku ma
     własną bramkę: `tests/api/test_wspolbieznosc_koncowek_modelu.py`; tu chodzi o
     parę przypadków, która przed CV-1 miała DWA osobne modele i nie mogła sobie
     zaszkodzić.) [zielony od początku]
I-10 Świeżość wyniku liczy się pod TYM SAMYM kluczem, pod którym zapisano bieg:
     edycja modelu przez przypadek A unieważnia wynik przypadku B. [zielony]
I-11 Wspólny `ENM_STORE_DIR` dla wielu projektów nie miesza modeli. [zielony]
I-12 Plik zastany przypadku SKASOWANEGO z bazy nie jest ani promowany, ani kasowany
     (nie ma go w bazie, więc nie ma czyim modelem być — ale nie wolno go stracić).
     [zielony]
I-13 Projekt BEZ przypadków nie dostaje modelu „przy okazji" migracji. [zielony]
"""

from __future__ import annotations

import io
import json
import threading
import zipfile
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application import twin_key
from domain.models import Project
from domain.study_case import StudyCase
from enm import dziennik_zmian, store
from enm.klucz_twin import klucz_twin_projektu
from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader


@pytest.fixture(autouse=True)
def _czysty_magazyn(tmp_path, monkeypatch):
    """Izolacja magazynu ENM ORAZ dziennika zmian — obu zapisów towarzyszących modelowi.

    `reset_enm_store` czyści od tej karty także PAMIĘĆ dziennika (wcześniej kasował
    tylko jego pliki, więc wpisy z poprzedniego życia przeciekały do następnego
    testu). Wołanie `wyczysc_dziennik` zostaje jawne, bo te testy czytają dziennik
    jako DOWÓD — izolacja dowodu ma być widoczna w teście, nie domniemana.
    """
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    store.reset_enm_store()
    dziennik_zmian.wyczysc_dziennik()
    twin_key.zapomnij_migracje()
    yield
    store.reset_enm_store()
    dziennik_zmian.wyczysc_dziennik()
    twin_key.zapomnij_migracje()


def _model(nazwa: str, refy_szyn: tuple[str, ...]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name=nazwa, defaults=ENMDefaults()),
        buses=[Bus(ref_id=ref, name=ref, voltage_kv=15.0) for ref in refy_szyn],
    )


def _projekt_z_przypadkami(uow_factory, liczba: int, *, aktywny: int | None = 0):
    project_id = uuid4()
    case_ids = [uuid4() for _ in range(liczba)]
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Projekt adwersaryjny"), commit=False)
        for i, case_id in enumerate(case_ids):
            uow.cases.add_study_case(
                StudyCase(
                    id=case_id,
                    project_id=project_id,
                    # Nazwa wymusza porządek `list_study_cases` (ORDER BY name) —
                    # kolejność promocji ma być DANA, nie przypadkowa.
                    name=f"Przypadek {i}",
                    is_active=(aktywny is not None and i == aktywny),
                ),
                commit=False,
            )
        uow.commit()
    return project_id, case_ids


def _swiezy_proces() -> None:
    """Symuluj świeży proces backendu: pamięć pusta, PLIKI zostają na dysku.

    To jest dokładnie stan po restarcie uvicorna / starcie workera Celery —
    moment, w którym pierwsze żądanie może iść ścieżką ADRESOWANĄ PROJEKTEM
    (eksport archiwum, dispatch analizy nN), a nie `/api/cases/{case_id}/...`.
    """
    store.reset_enm_store(remove_persisted=False)
    dziennik_zmian.wyczysc_dziennik(usun_pliki=False)
    twin_key.zapomnij_migracje()


# ---------------------------------------------------------------------------
# I-5: eksport archiwum projektu (ścieżka adresowana PROJEKTEM)
# ---------------------------------------------------------------------------


def _project_json(archiwum: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(archiwum), "r") as zf:
        return json.loads(zf.read("project.json").decode("utf-8"))


def test_i5_eksport_archiwum_nie_gubi_modelu_zastanego_per_przypadek(
    test_db_session, uow_factory
) -> None:
    """Eksport projektu, którego model leży jeszcze pod kluczem przypadku, niesie ten model.

    OBALENIE, KTÓRE SIĘ UDAŁO (naprawione w tej karcie). `_collect_enm` budowało
    klucz przez `klucz_twin_projektu(project_id)` i pytało `has_enm` — z pominięciem
    migracji plików zastanych, która wisi na `klucz_twin_dla_przypadku`. W świeżym
    procesie pierwszym żądaniem mógł być eksport: `has_enm` = False, sekcja `enm`
    pusta, archiwum ZIP BEZ SIECI. Import takiego archiwum tworzył projekt bez modelu.
    """
    from infrastructure.persistence.models import ProjectORM, StudyCaseORM

    project_id = uuid4()
    case_id = uuid4()
    teraz = datetime.now(UTC)
    test_db_session.add(
        ProjectORM(
            id=project_id,
            name="Projekt z modelem zastanym",
            description=None,
            schema_version="1.0.0",
            active_network_snapshot_id=None,
            connection_node_id=None,
            sources_jsonb=[],
            created_at=teraz,
            updated_at=teraz,
        )
    )
    test_db_session.add(
        StudyCaseORM(
            id=case_id,
            project_id=project_id,
            name="Przypadek zastany",
            description=None,
            network_snapshot_id=None,
            study_jsonb={},
            is_active=True,
            result_status="NONE",
            result_refs_jsonb=[],
            revision=1,
            created_at=teraz,
            updated_at=teraz,
        )
    )
    test_db_session.commit()

    store.set_enm(str(case_id), _model("model zastany", ("SZYNA-ZASTANA",)))
    _swiezy_proces()

    from application.project_archive.service import ProjectArchiveService

    dane = _project_json(ProjectArchiveService(test_db_session).export_project(project_id))

    modele = dane["enm"]["models"]
    assert modele, "archiwum bez sekcji ENM = eksport bez sieci (cicha utrata modelu)"
    refy = [bus["ref_id"] for bus in modele[0]["snapshot"]["buses"]]
    assert "SZYNA-ZASTANA" in refy
    # Migracja odbyła się przy okazji eksportu: model żyje odtąd pod kluczem projektu.
    assert store.has_enm(klucz_twin_projektu(project_id))


# ---------------------------------------------------------------------------
# I-6: dziennik zmian idzie za promowanym modelem
# ---------------------------------------------------------------------------


def test_i6_dziennik_promowanego_przypadku_idzie_za_modelem(uow_factory) -> None:
    """Promocja modelu przypadku na model projektu przenosi też jego historię rewizji.

    OBALENIE, KTÓRE SIĘ UDAŁO (naprawione w tej karcie). `_odloz_do_legacy` odkładał
    dziennik KAŻDEGO przypadku do `legacy_przypadki/` — także tego, którego model
    właśnie ZOSTAŁ modelem projektu. Model zachowywał rewizję N, a dziennik projektu
    startował pusty, więc `GET /enm/dziennik-zmian?od_rewizji=R` (odpowiedź na „co
    unieważniło mój wynik") oddawał listę Z DZIURĄ i wyglądającą na kompletną.
    """
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=0)
    store.set_enm(str(case_ids[0]), _model("v1", ("A",)))
    store.set_enm(str(case_ids[0]), _model("v2", ("A", "B")))
    store.set_enm(str(case_ids[1]), _model("inny", ("X",)))

    klucz = twin_key.klucz_twin_dla_przypadku(str(case_ids[1]), uow_factory)

    assert klucz == klucz_twin_projektu(project_id)
    assert store.get_enm(klucz).header.revision == 2
    assert [w.rewizja for w in dziennik_zmian.wszystkie_wpisy(klucz)] == [1, 2]

    # Kolejna rewizja dopisuje się do TEJ SAMEJ historii — bez dziury między 2 a 3.
    store.set_enm(klucz, _model("v3", ("A", "B", "C")))
    assert [w.rewizja for w in dziennik_zmian.wpisy_od(klucz, 1)] == [2, 3]

    # Dziennik przypadku ODŁOŻONEGO (ROZBIEZNY) wędruje do legacy razem z jego modelem.
    legacy = store._store_dir() / store.KATALOG_LEGACY
    odlozone = {p.name for p in legacy.glob("*.dziennik.json")}
    assert dziennik_zmian._sciezka(str(case_ids[1])).name in odlozone
    assert dziennik_zmian._sciezka(str(case_ids[0])).name not in odlozone


def test_i6_promocja_nie_nadpisuje_istniejacego_dziennika_projektu(uow_factory) -> None:
    """Gdy projekt MA już własną historię, dziennik przypadku nie kasuje jej po cichu.

    Predykaty parami: warunek promocji MODELU (`projekt is None`) i warunek promocji
    DZIENNIKA muszą pochodzić z jednego źródła; dziennik projektu, który już istnieje,
    jest dowodem, że projekt ma historię — nadpisanie byłoby utratą.
    """
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 1, aktywny=0)
    klucz = klucz_twin_projektu(project_id)
    # Historia projektu istnieje, ale MODELU projektu nie ma (plik snapshotu usunięty
    # ręcznie — awaria nośnika/niepełne przywrócenie kopii). Promocja modelu jest wtedy
    # dozwolona, promocja dziennika NIE.
    store.set_enm(klucz, _model("projekt", ("P",)))
    store._case_path(klucz).unlink()
    store.reset_enm_store(remove_persisted=False)
    twin_key.zapomnij_migracje()
    store.set_enm(str(case_ids[0]), _model("przypadek", ("C",)))

    twin_key.klucz_twin_dla_przypadku(str(case_ids[0]), uow_factory)

    # Historia projektu nietknięta; dziennik przypadku poszedł do legacy z manifestem.
    assert [w.rewizja for w in dziennik_zmian.wszystkie_wpisy(klucz)] == [1]
    legacy = store._store_dir() / store.KATALOG_LEGACY
    assert dziennik_zmian._sciezka(str(case_ids[0])).name in {
        p.name for p in legacy.glob("*.dziennik.json")
    }


# ---------------------------------------------------------------------------
# I-7: ścieżka projektowa nie fabrykuje modelu domyślnego
#
# `test_i7_dispatch_nn_nie_fabrykuje_pustego_modelu_projektu` wołał
# `AnalysisDispatchService(uow_factory).dispatch(AnalysisKind.FAULT_LOOP_NN,
# project_id, ...)` — JEDYNY produkcyjny wywoływacz tego scenariusza. Karta
# CV-3.3-A (2026-09-05) skasowała `analysis_dispatch` razem z
# `api/unified_runs.py` (E2-widmo: zero konsumenta produkcyjnego), więc próba
# obalenia nie ma już żadnej ścieżki do wykonania — usunięta razem z modułem,
# nie zamaskowana. Klasa defektu (ścieżka adresowana projektem fabrykuje pusty
# model zamiast migrować plik zastany) pozostaje pod strażą I-5 przez żywy,
# produkcyjny wpis: `project_archive/service.py::_collect_enm`.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# I-8: równoległa migracja tego samego projektu
# ---------------------------------------------------------------------------


def test_i8_rownolegle_pierwsze_tlumaczenie_daje_jedna_promocje(uow_factory) -> None:
    """Dwa wątki tłumaczące RÓŻNE przypadki jednego projektu w tej samej chwili.

    Ryzyko: obie migracje biegną naraz, obie widzą „projekt bez modelu" i obie
    promują — albo żadna, bo każda widzi model drugiej i odkłada realny model do
    legacy. Wynik musi być jeden i ten sam niezależnie od przeplotu.
    """
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=0)
    store.set_enm(str(case_ids[0]), _model("aktywny", ("AKTYWNA",)))
    store.set_enm(str(case_ids[1]), _model("drugi", ("DRUGA",)))
    _swiezy_proces()

    bariera = threading.Barrier(2)
    wyniki: dict[str, str] = {}
    bledy: list[BaseException] = []

    def tlumacz(case_id: str) -> None:
        try:
            bariera.wait(timeout=5)
            wyniki[case_id] = twin_key.klucz_twin_dla_przypadku(case_id, uow_factory)
        except BaseException as exc:  # noqa: BLE001 - błąd wątku ma dojść do asercji
            bledy.append(exc)

    watki = [threading.Thread(target=tlumacz, args=(str(c),)) for c in case_ids]
    for w in watki:
        w.start()
    for w in watki:
        w.join(timeout=20)

    assert not bledy, bledy
    assert set(wyniki.values()) == {klucz_twin_projektu(project_id)}
    statusy = [w["status"] for w in store.wiersze_manifestu_legacy()]
    assert statusy.count("PRZENIESIONY") == 1
    assert [bus.ref_id for bus in store.get_enm(klucz_twin_projektu(project_id)).buses] == [
        "AKTYWNA"
    ]


# ---------------------------------------------------------------------------
# I-9: dwa RÓŻNE przypadki tego samego projektu, dwa równoległe zapisy
# ---------------------------------------------------------------------------


def test_i9_dwa_przypadki_jednego_projektu_nie_gubia_swojej_pracy(uow_factory) -> None:
    """Iloczyn cech NOWY PO CV-1: różny przypadek × ten sam projekt × równoległy zapis.

    Przed CV-1 dwa przypadki miały DWA modele, więc ta para nie mogła sobie zaszkodzić
    i żaden test jej nie pilnował. Po CV-1 pracują na JEDNYM modelu — jeśli blokada
    zostałaby kiedyś zawężona z klucza projektu z powrotem do `case_id`, praca jednego
    przypadku zaczęłaby po cichu kasować pracę drugiego. Okno jest rozciągnięte
    deterministycznie (odczyt → pauza → zapis), bo naturalne pasmo strat to ułamki
    milisekundy i test oparty na przypadkowym przeplocie bywałby zielony na zepsutym
    kodzie.
    """
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=0)
    klucze = [twin_key.klucz_twin_dla_przypadku(str(c), uow_factory) for c in case_ids]
    store.set_enm(klucze[0], _model("start", ()))

    bariera = threading.Barrier(2)
    bledy: list[BaseException] = []

    def dopisz(klucz: str, ref: str) -> None:
        try:
            with store.blokada_twin(klucz):
                enm = store.get_enm(klucz)
                bariera.wait(timeout=5)
                nowy = enm.model_copy(deep=True)
                nowy.buses.append(Bus(ref_id=ref, name=ref, voltage_kv=15.0))
                store.set_enm(klucz, nowy)
        except threading.BrokenBarrierError:
            # Blokada DZIAŁA: drugi uczestnik nie wszedł w okno, więc bariera nie
            # mogła się domknąć. To jest oczekiwany przebieg, nie błąd.
            with store.blokada_twin(klucz):
                enm = store.get_enm(klucz)
                nowy = enm.model_copy(deep=True)
                nowy.buses.append(Bus(ref_id=ref, name=ref, voltage_kv=15.0))
                store.set_enm(klucz, nowy)
        except BaseException as exc:  # noqa: BLE001
            bledy.append(exc)

    watki = [
        threading.Thread(target=dopisz, args=(klucze[0], "SZYNA-A")),
        threading.Thread(target=dopisz, args=(klucze[1], "SZYNA-B")),
    ]
    for w in watki:
        w.start()
    for w in watki:
        w.join(timeout=30)

    assert not bledy, bledy
    refy = {bus.ref_id for bus in store.get_enm(klucze[0]).buses}
    assert refy == {"SZYNA-A", "SZYNA-B"}, "praca jednego przypadku skasowała pracę drugiego"


# ---------------------------------------------------------------------------
# I-10: świeżość wyniku liczona pod tym samym kluczem, co zapis biegu
# ---------------------------------------------------------------------------


def test_i10_edycja_przez_jeden_przypadek_uniewaznia_wynik_drugiego(uow_factory) -> None:
    """Odcisk modelu w biegu i odcisk „modelu bieżącego" pochodzą z jednego klucza.

    Po CV-1 przypadki dzielą model, więc wynik policzony w przypadku A MUSI zgasnąć,
    gdy ktoś edytuje sieć przez przypadek B. Gdyby świeżość liczyła się pod kluczem
    przypadku (dawny stan), plakietka przypadku A świeciłaby FRESH na modelu, którego
    ten wynik już nie opisuje.
    """
    from application.result_freshness import (
        ResultFreshness,
        current_model_hash,
        evaluate_result_freshness,
    )

    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=0)
    klucz = twin_key.klucz_twin_dla_przypadku(str(case_ids[0]), uow_factory)
    store.set_enm(klucz, _model("bazowy", ("A",)))

    kotwica = current_model_hash(str(case_ids[0]), uow_factory)
    assert kotwica is not None
    assert (
        evaluate_result_freshness(
            has_result=True, run_model_hashes=[kotwica], current_hash=kotwica
        ).status
        == ResultFreshness.FRESH
    )

    # Edycja modelu „przez drugi przypadek" — ten sam model projektu.
    klucz_b = twin_key.klucz_twin_dla_przypadku(str(case_ids[1]), uow_factory)
    assert klucz_b == klucz == klucz_twin_projektu(project_id)
    store.set_enm(klucz_b, _model("po edycji", ("A", "B")))

    po_edycji = current_model_hash(str(case_ids[0]), uow_factory)
    assert po_edycji != kotwica
    werdykt = evaluate_result_freshness(
        has_result=True, run_model_hashes=[kotwica], current_hash=po_edycji
    )
    assert werdykt.status == ResultFreshness.OUTDATED


# ---------------------------------------------------------------------------
# I-11..I-13: rozdzielność projektów, sieroty, projekt bez przypadków
# ---------------------------------------------------------------------------


def test_i11_wspolny_katalog_magazynu_nie_miesza_projektow(uow_factory) -> None:
    """Jeden `ENM_STORE_DIR`, wiele projektów — modele muszą pozostać rozdzielne."""
    projekt_a, przypadki_a = _projekt_z_przypadkami(uow_factory, 1, aktywny=0)
    projekt_b, przypadki_b = _projekt_z_przypadkami(uow_factory, 1, aktywny=0)

    klucz_a = twin_key.klucz_twin_dla_przypadku(str(przypadki_a[0]), uow_factory)
    klucz_b = twin_key.klucz_twin_dla_przypadku(str(przypadki_b[0]), uow_factory)
    assert klucz_a != klucz_b

    store.set_enm(klucz_a, _model("projekt A", ("A",)))
    store.set_enm(klucz_b, _model("projekt B", ("B1", "B2")))

    assert [bus.ref_id for bus in store.get_enm(klucz_a).buses] == ["A"]
    assert [bus.ref_id for bus in store.get_enm(klucz_b).buses] == ["B1", "B2"]
    assert store._case_path(klucz_a) != store._case_path(klucz_b)
    assert klucz_a == klucz_twin_projektu(projekt_a)
    assert klucz_b == klucz_twin_projektu(projekt_b)


def test_i12_plik_zastany_skasowanego_przypadku_nie_jest_promowany_ani_kasowany(
    uow_factory,
) -> None:
    """Przypadek skasowany z bazy, plik został — migracja nie może po nim dziedziczyć.

    Plik przypadku, którego nie ma w bazie, nie należy do żadnego projektu z punktu
    widzenia tłumacza (`list_study_cases` go nie zwróci). Nie wolno go promować (byłby
    to model wzięty znikąd) ani skasować (to praca projektanta). Zostaje nietknięty.
    """
    project_id, case_ids = _projekt_z_przypadkami(uow_factory, 2, aktywny=1)
    store.set_enm(str(case_ids[0]), _model("skasowany", ("SIEROTA",)))
    store.set_enm(str(case_ids[1]), _model("aktywny", ("AKTYWNA",)))
    with uow_factory() as uow:
        uow.cases.delete_study_case(case_ids[0], commit=False)
        uow.commit()
    _swiezy_proces()

    klucz = twin_key.klucz_twin_dla_przypadku(str(case_ids[1]), uow_factory)

    assert [bus.ref_id for bus in store.get_enm(klucz).buses] == ["AKTYWNA"]
    # Plik sieroty nadal leży w magazynie — nie skasowany i nie wciągnięty do projektu.
    assert store._case_path(str(case_ids[0])).exists()
    assert [w["case_id"] for w in store.wiersze_manifestu_legacy()] == [str(case_ids[1])]


def test_i13_projekt_bez_przypadkow_nie_dostaje_modelu(uow_factory) -> None:
    """Migracja projektu bez przypadków jest pusta i nie tworzy modelu."""
    project_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Projekt pusty"), commit=False)
        uow.commit()

    wynik = twin_key.migruj_projekt_z_legacy(project_id, uow_factory)

    assert wynik.wyniki == ()
    assert wynik.klucz_projektu == klucz_twin_projektu(project_id)
    assert not store.has_enm(wynik.klucz_projektu)
    assert store.wiersze_manifestu_legacy() == []


def test_i2_rozszerzony_przypadek_bez_projektu_nie_tworzy_pliku(uow_factory) -> None:
    """I-2 na granicy API: tłumaczenie przypadku spoza bazy nie zostawia śladu.

    Iloczyn cech: (nie-UUID | UUID spoza bazy) × (brak warstwy DB) — w każdym z tych
    układów magazyn ma zostać pusty, a błąd jawny.
    """
    from enm.klucz_twin import PrzypadekBezProjektuError

    for case_id, factory in (
        ("nie-uuid", uow_factory),
        (str(uuid4()), uow_factory),
        (str(uuid4()), None),
    ):
        with pytest.raises(PrzypadekBezProjektuError):
            twin_key.klucz_twin_dla_przypadku(case_id, factory)
    assert list(store._store_dir().glob("*.json")) == []
    assert store.wiersze_manifestu_legacy() == []


def test_klucz_projektu_odwracalny_i_odporny_na_klucz_surowy() -> None:
    """`klucz_twin_projektu` / `project_id_z_klucza` są parą; klucz surowy jest odrzucany."""
    from enm.klucz_twin import czy_klucz_projektu, project_id_z_klucza

    project_id = uuid4()
    klucz = klucz_twin_projektu(project_id)
    assert czy_klucz_projektu(klucz)
    assert project_id_z_klucza(klucz) == project_id
    for surowy in (str(project_id), "projekt:", "projekt:nie-uuid", ""):
        assert not czy_klucz_projektu(surowy)
        with pytest.raises(ValueError):
            project_id_z_klucza(surowy)


def test_klucz_twin_projektu_przyjmuje_uuid_i_tekst() -> None:
    """Tekstowy i obiektowy `project_id` dają TEN SAM klucz (jedna tożsamość projektu)."""
    project_id = uuid4()
    assert klucz_twin_projektu(project_id) == klucz_twin_projektu(str(project_id))
    assert klucz_twin_projektu(str(project_id).upper()) == klucz_twin_projektu(project_id)
    with pytest.raises(ValueError):
        klucz_twin_projektu("nie-uuid")


def test_kolejnosc_promocji_jest_jedna_regula_dla_wszystkich_zrodel() -> None:
    """Reguła „aktywny pierwszy, reszta w porządku wołającego" ma JEDNĄ implementację.

    Kolejność rozstrzyga, CZYJ model zostaje modelem projektu, więc trzy kopie tej
    reguły (baza, eksport archiwum, wpisy archiwum przy imporcie) byłyby trzema
    okazjami do cichej podmiany sieci. Test pinuje samą regułę: aktywny na czele,
    bez duplikatu, gdy jest już na liście, i pełna lista w porządku wołającego, gdy
    aktywnego nie ma.
    """
    assert twin_key.kolejnosc_promocji(["b", "a", "c"], "a") == ["a", "b", "c"]
    assert twin_key.kolejnosc_promocji(["b", "a", "c"], None) == ["b", "a", "c"]
    assert twin_key.kolejnosc_promocji([], "a") == ["a"]
    assert twin_key.kolejnosc_promocji(["b", "c"], "a") == ["a", "b", "c"]
    assert twin_key.kolejnosc_promocji([], None) == []


def test_uuid_typ_klucza_jest_stabilny() -> None:
    """Klucz nie zależy od formy zapisu UUID (myślniki, wielkość liter)."""
    project_id = uuid4()
    bez_myslnikow = project_id.hex
    assert klucz_twin_projektu(UUID(bez_myslnikow)) == klucz_twin_projektu(project_id)
