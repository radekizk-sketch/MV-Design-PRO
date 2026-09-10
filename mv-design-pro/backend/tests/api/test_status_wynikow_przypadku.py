"""Status wynikow przypadku jest WYPROWADZANY z biegow — REALNA sciezka HTTP (CV-2-W).

DLUG, KTORY TE TESTY PILNUJA. `StudyCase.result_status` byl POLEM w bazie,
przestawianym przez siedmiu „uniewazniaczy”. Kazda sciezka mutujaca model, ktora
zapomniala ktoregos wywolac (zmiana typu katalogowego nie wolala NIKOGO), zostawiala
przypadek z plakietka „wyniki aktualne” przy modelu, ktory pojechal dalej. Status
jest odtad FUNKCJA (biegi × rewizja modelu × odcisk katalogu), wiec nie ma stanu,
ktorego mozna zapomniec przestawic — a te testy sprawdzaja to na iloczynie cech,
nie na jednym scenariuszu z karty.

Testy jada dokladnie tam, gdzie jedzie projektant: `POST /enm/domain-ops` (jedyna
produkcyjna droga zmiany modelu), `POST /api/execution/...` (bieg) i
`GET /api/study-cases/...` (odczyt statusu). Zero wymuszania stanu w store —
kazdy werdykt powstaje z tego, co naprawde stoi w bazie i w magazynie ENM.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient
from infrastructure.persistence.models import StudyCaseORM

# Tabliczka transformatora WN/SN podana JAWNIE (`hv_voltage_kv` + `transformer_sn_mva`):
# bez niej operacja fabrykuje „typowe" 110 kV / 25 MVA, a karta FAB-G zamienia ten
# domysl na jawny blad. Wartosci sa tu tozsame z dawnym domyslem, wiec sama siec
# testowa sie nie zmienia — znika tylko zgadywanie.
GPZ = {
    "operation": {
        "name": "add_grid_source_sn",
        "payload": {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
        },
    }
}

MAGISTRALA = {
    "operation": {
        "name": "continue_trunk_segment_sn",
        "payload": {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    }
}


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory):
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _projekt_i_przypadek(klient: TestClient) -> tuple[str, str]:
    project_resp = klient.post("/api/projects", json={"name": "Status wynikow — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = klient.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek testu", "set_active": True},
    )
    assert case_resp.status_code == 201, case_resp.text
    return project_id, str(case_resp.json()["id"])


def _zbuduj_model(klient: TestClient, case_id: str) -> None:
    """Model zdolny do biegu zwarciowego — przez PRODUKCYJNA operacje domenowa."""
    odp = klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=GPZ)
    assert odp.status_code == 200, odp.text
    assert not odp.json().get("error"), odp.text


def _policz_bieg(klient: TestClient, case_id: str) -> dict:
    create = klient.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create.status_code == 201, create.text
    run_id = create.json()["id"]
    execute = klient.post(f"/api/execution/runs/{run_id}/execute")
    assert execute.status_code == 200, execute.text
    return execute.json()


def _status(klient: TestClient, case_id: str) -> dict:
    odp = klient.get(f"/api/study-cases/{case_id}")
    assert odp.status_code == 200, odp.text
    return odp.json()


def _kolumna_zastana(uow_factory, case_id: str) -> str:
    """Surowa wartosc kolumny `study_cases.result_status` — DANE ZASTANE."""
    with uow_factory() as uow:
        row = uow.session.get(StudyCaseORM, UUID(case_id))
        assert row is not None
        return row.result_status


# ---------------------------------------------------------------------------
# BRAK WYNIKU — stan zerowy nie klamie
# ---------------------------------------------------------------------------


def test_przypadek_bez_biegow_ma_status_none(klient: TestClient) -> None:
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)

    dane = _status(klient, case_id)
    assert dane["result_status"] == "NONE"
    assert dane["results_valid"] is False
    assert dane["result_status_reason"] == "brak-wyniku"
    assert dane["result_status_reason_pl"]
    assert dane["zmiany_od_biegu"] == []
    # Rewizja biezaca jest znana nawet bez wyniku — ekran ma co pokazac.
    assert dane["rewizja_biezaca"] >= 1
    assert dane["rewizja_biegu"] is None


def test_bieg_nieudany_nie_daje_wyniku(klient: TestClient) -> None:
    """Bieg FAILED to brak wyniku (NONE), a nie „wynik nieaktualny”.

    Model bez zrodla nie przechodzi utworzenia biegu (`create` konczy sie 409 —
    brak zrodla i szyn), wiec przypadek nadal nie ma zadnego biegu z wynikiem.
    """
    _, case_id = _projekt_i_przypadek(klient)
    # Model pusty (bez zrodla) — analiza zwarciowa jest niedostepna.
    create = klient.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert create.status_code == 409, create.text

    dane = _status(klient, case_id)
    assert dane["result_status"] == "NONE"
    assert dane["result_status_reason"] == "brak-wyniku"


# ---------------------------------------------------------------------------
# BIEG × BRAK MUTACJI = FRESH, i to BEZ PISARZA
# ---------------------------------------------------------------------------


def test_zakonczony_bieg_daje_fresh_bez_zapisu_kolumny(klient: TestClient, uow_factory) -> None:
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    bieg = _policz_bieg(klient, case_id)
    assert bieg["status"] == "DONE"

    dane = _status(klient, case_id)
    assert dane["result_status"] == "FRESH"
    assert dane["results_valid"] is True
    assert dane["result_status_reason"] == "model-niezmieniony"
    assert dane["zmiany_od_biegu"] == []
    assert dane["rewizja_biegu"] == dane["rewizja_biezaca"]

    # SEDNO KARTY: kolumna zastana NIE zostala dotknieta — status powstal z
    # wyliczenia, nie z zapisu. Gdyby ktos przywrocil pisarza, ta asercja padnie.
    assert _kolumna_zastana(uow_factory, case_id) == "NONE"


# ---------------------------------------------------------------------------
# MUTACJA MODELU × ODCZYT = OUTDATED, bez zadnego uniewazniacza
# ---------------------------------------------------------------------------


def test_operacja_domenowa_po_biegu_daje_outdated_z_lista_zmian(
    klient: TestClient, uow_factory
) -> None:
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)
    assert _status(klient, case_id)["result_status"] == "FRESH"

    zmiana = klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)
    assert zmiana.status_code == 200, zmiana.text
    assert not zmiana.json().get("error"), zmiana.text

    dane = _status(klient, case_id)
    assert dane["result_status"] == "OUTDATED"
    assert dane["results_valid"] is False
    assert dane["result_status_reason"] == "model-zmieniony"
    assert dane["rewizja_biezaca"] > dane["rewizja_biegu"]

    # „Ktora zmiana uniewaznila wynik” — nazwa operacji, opis z kanonu, elementy.
    assert len(dane["zmiany_od_biegu"]) == 1
    wpis = dane["zmiany_od_biegu"][0]
    assert wpis["operacja"] == "continue_trunk_segment_sn"
    assert wpis["opis_pl"]
    assert wpis["elementy"], "lista elementow pochodzi z `changes` operacji"
    assert wpis["rewizja"] == dane["rewizja_biezaca"]

    # Nikt nie zapisal statusu — kolumna zastana nadal nietknieta.
    assert _kolumna_zastana(uow_factory, case_id) == "NONE"


def test_jeden_swiezy_bieg_wsrod_starych_daje_fresh(klient: TestClient) -> None:
    """Przypadek jest AKTUALNY, gdy chocby JEDEN jego bieg jest aktualny — stare
    biegi na poprzednich rewizjach nie przeciagaja werdyktu na OUTDATED."""
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)

    klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)
    assert _status(klient, case_id)["result_status"] == "OUTDATED"

    _policz_bieg(klient, case_id)
    dane = _status(klient, case_id)
    assert dane["result_status"] == "FRESH"
    assert dane["zmiany_od_biegu"] == []


# ---------------------------------------------------------------------------
# KATALOG × TEN SAM MODEL = OUTDATED (przyczyna: katalog)
# ---------------------------------------------------------------------------


def test_inny_odcisk_katalogu_przy_tym_samym_modelu_daje_outdated(
    klient: TestClient, monkeypatch
) -> None:
    """Zmiana biblioteki typow uniewaznia wynik — bez tej sciezki (do CV-2) zmiana
    typu katalogowego nie uniewazniala NICZEGO."""
    import application.result_freshness as swiezosc

    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)
    assert _status(klient, case_id)["result_status"] == "FRESH"

    monkeypatch.setattr(swiezosc, "odcisk_katalogu_domyslnego", lambda: "inny-odcisk-katalogu")

    dane = _status(klient, case_id)
    assert dane["result_status"] == "OUTDATED"
    assert dane["result_status_reason"] == "katalog-zmieniony"
    # Model sie NIE zmienil, wiec rewizje sa zgodne, a lista zmian pusta —
    # przyczyna jest jedyna informacja rozstrzygajaca i musi byc czytelna.
    assert dane["rewizja_biegu"] == dane["rewizja_biezaca"]
    assert dane["zmiany_od_biegu"] == []
    assert "katalog" in dane["result_status_reason_pl"].lower()


# ---------------------------------------------------------------------------
# JEDNA DERYWACJA WE WSZYSTKICH ODPOWIEDZIACH (regula KLASA, NIE INSTANCJA)
# ---------------------------------------------------------------------------


def test_wszystkie_odpowiedzi_z_przypadkiem_daja_ten_sam_werdykt(klient: TestClient) -> None:
    """Pojedynczy przypadek, lista projektu, przypadek aktywny i porownanie musza
    pokazac IDENTYCZNY status — inaczej dwa ekrany obok siebie klamia inaczej."""
    project_id, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)
    klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)

    pojedynczy = _status(klient, case_id)
    assert pojedynczy["result_status"] == "OUTDATED"

    lista = klient.get(f"/api/study-cases/project/{project_id}")
    assert lista.status_code == 200, lista.text
    pozycja = next(item for item in lista.json() if item["id"] == case_id)
    assert pozycja["result_status"] == "OUTDATED"
    assert pozycja["results_valid"] is False
    assert pozycja["zmiany_od_biegu"] == pojedynczy["zmiany_od_biegu"]

    aktywny = klient.get(f"/api/study-cases/project/{project_id}/active")
    assert aktywny.status_code == 200, aktywny.text
    assert aktywny.json()["result_status"] == "OUTDATED"

    klon = klient.post(f"/api/study-cases/{case_id}/clone", json={"new_name": "Kopia"})
    assert klon.status_code == 201, klon.text
    klon_id = klon.json()["id"]
    # Klon nie ma wlasnych biegow, wiec jego status wychodzi NONE bez kopiowania.
    assert klon.json()["result_status"] == "NONE"

    porownanie = klient.post(
        "/api/study-cases/compare", json={"case_a_id": case_id, "case_b_id": klon_id}
    )
    assert porownanie.status_code == 200, porownanie.text
    assert porownanie.json()["status_a"] == "OUTDATED"
    assert porownanie.json()["status_b"] == "NONE"


def test_zmiana_konfiguracji_nie_przestawia_statusu_przypadku(klient: TestClient) -> None:
    """PATCH konfiguracji nie zmienia MODELU, wiec bieg policzony na tym modelu
    pozostaje aktualny wobec modelu. (Bieg policzony na innej konfiguracji ma inny
    `input_hash` — rozroznienie zyje na biegu, nie na plakietce przypadku.)"""
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)

    patch = klient.patch(f"/api/study-cases/{case_id}", json={"config": {"c_factor_max": 1.05}})
    assert patch.status_code == 200, patch.text
    assert patch.json()["result_status"] == "FRESH"
    assert _status(klient, case_id)["result_status"] == "FRESH"


# ---------------------------------------------------------------------------
# KONCOWKI „UNIEWAZNIJ” ZNIKNELY NA AMEN
# ---------------------------------------------------------------------------


def test_koncowki_uniewaznienia_nie_istnieja(klient: TestClient) -> None:
    project_id, case_id = _projekt_i_przypadek(klient)
    assert klient.post(f"/api/study-cases/project/{project_id}/invalidate-all").status_code == 404
    assert klient.post(f"/api/study-cases/{case_id}/invalidate").status_code == 404


def test_invalidator_legacy_nie_dotyka_przypadkow(klient: TestClient, uow_factory) -> None:
    """`ResultInvalidator` zostal przy torze LEGACY (`analysis_runs`) i tylko przy nim.

    Deklaracja z jego naglowka („NIE dotyka przypadkow obliczeniowych”) ma tu swoj
    przypiety dowod: po wywolaniu na projekcie z AKTUALNYM wynikiem status
    przypadku jest nadal FRESH, a kolumna zastana nadal nietknieta.
    """
    from application.analysis_run.result_invalidator import ResultInvalidator

    project_id, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    _policz_bieg(klient, case_id)
    assert _status(klient, case_id)["result_status"] == "FRESH"

    with uow_factory() as uow:
        ResultInvalidator().invalidate_project_results(uow, UUID(project_id))
        uow.session.commit()

    assert _status(klient, case_id)["result_status"] == "FRESH"
    assert _kolumna_zastana(uow_factory, case_id) == "NONE"


# ---------------------------------------------------------------------------
# REWIZJA BIEGU MA TRESC — `GET /enm/rewizje/{n}`
# ---------------------------------------------------------------------------


def test_rewizja_biegu_ma_tresc_pod_koncowka_rewizji(klient: TestClient) -> None:
    """Koperta biegu wskazuje rewizje, ktora MUSI dac sie odczytac — inaczej
    „wynik policzono na rewizji 7” jest adresem bez tresci."""
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    bieg = _policz_bieg(klient, case_id)
    dane = _status(klient, case_id)
    rewizja = dane["rewizja_biegu"]
    assert rewizja is not None

    # Model jedzie dalej — migawka rewizji biegu ma przetrwac kolejne zmiany.
    klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)

    odp = klient.get(f"/api/cases/{case_id}/enm/rewizje/{rewizja}")
    assert odp.status_code == 200, odp.text
    tresc = odp.json()
    assert tresc["rewizja"] == rewizja
    assert tresc["snapshot"]["header"]["revision"] == rewizja

    szczegoly = klient.get(f"/api/analysis-runs/{bieg['id']}")
    assert szczegoly.status_code == 200, szczegoly.text
    # Odcisk migawki rewizji jest DOKLADNIE odciskiem modelu, na ktorym policzono
    # bieg (`CanonicalRun.snapshot_hash`) — to jest wiazanie wyniku z TRESCIA
    # modelu, nie z numerem rewizji.
    assert tresc["hash_sha256"] == szczegoly.json()["input_metadata"]["snapshot_hash"]


def test_rewizja_bez_migawki_daje_404_z_komunikatem_pl(klient: TestClient) -> None:
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)

    odp = klient.get(f"/api/cases/{case_id}/enm/rewizje/9999")
    assert odp.status_code == 404, odp.text
    assert "migawki" in odp.json()["detail"]


def test_uszkodzona_migawka_rewizji_daje_409(klient: TestClient) -> None:
    """Migawka niezgodna z wlasnym odciskiem to uszkodzenie nosnika albo reczna
    ingerencja — odpowiedz nazywa ten stan, zamiast oddac model, ktoremu nie mozna
    ufac."""
    import gzip
    import json

    from application.twin_key import klucz_twin_dla_przypadku
    from enm.rewizje import sciezka_rewizji

    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    biezaca = klient.get(f"/api/cases/{case_id}/enm").json()["header"]["revision"]
    # Model musi pojechac dalej, zeby `checkout` czytal MIGAWKE, a nie glowe.
    klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)

    klucz = klucz_twin_dla_przypadku(case_id, app.state.uow_factory)
    sciezka = sciezka_rewizji(klucz, biezaca)
    assert sciezka.exists(), sciezka
    payload = json.loads(gzip.decompress(sciezka.read_bytes()).decode("utf-8"))
    payload["hash_sha256"] = "0" * 64
    sciezka.write_bytes(
        gzip.compress(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            ),
            mtime=0,
        )
    )

    odp = klient.get(f"/api/cases/{case_id}/enm/rewizje/{biezaca}")
    assert odp.status_code == 409, odp.text
    assert "niespójna" in odp.json()["detail"]


# ---------------------------------------------------------------------------
# DZIENNIK NIESIE LADUNEK KOMENDY (CV-2)
# ---------------------------------------------------------------------------


def test_dziennik_oddaje_ladunek_hash_i_rodzica(klient: TestClient) -> None:
    """Nazwa operacji i listy elementow nie wystarczaly, zeby odtworzyc, CO
    projektant zrobil — dwie operacje o tej samej nazwie roznia sie ladunkiem."""
    _, case_id = _projekt_i_przypadek(klient)
    _zbuduj_model(klient, case_id)
    klient.post(f"/api/cases/{case_id}/enm/domain-ops", json=MAGISTRALA)

    wpisy = klient.get(f"/api/cases/{case_id}/enm/dziennik-zmian?od_rewizji=0").json()["wpisy"]
    assert len(wpisy) >= 2

    zrodlo = next(w for w in wpisy if w["operacja"] == "add_grid_source_sn")
    assert zrodlo["ladunek"] == GPZ["operation"]["payload"]
    assert zrodlo["hash_sha256"], "wpis niesie odcisk migawki swojej rewizji"

    magistrala = next(w for w in wpisy if w["operacja"] == "continue_trunk_segment_sn")
    assert magistrala["ladunek"] == MAGISTRALA["operation"]["payload"]
    assert magistrala["rodzic"] == zrodlo["rewizja"]
    # Odcisk z dziennika wskazuje TE SAMA migawke, ktora oddaje koncowka rewizji.
    tresc = klient.get(f"/api/cases/{case_id}/enm/rewizje/{zrodlo['rewizja']}").json()
    assert tresc["hash_sha256"] == zrodlo["hash_sha256"]


# ---------------------------------------------------------------------------
# PRZYPADEK SPOZA PROJEKTU — uczciwy brak wiedzy
# ---------------------------------------------------------------------------


def test_nieistniejacy_przypadek_daje_404(klient: TestClient) -> None:
    odp = klient.get(f"/api/study-cases/{uuid4()}")
    assert odp.status_code == 404, odp.text
