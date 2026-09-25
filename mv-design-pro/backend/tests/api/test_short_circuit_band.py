"""Pasmo MIN/MAX zwarcia z JEDNEGO przypadku obok siebie —
`GET /api/analysis-runs/{run_id}/results/short-circuit/pasmo` (karta W3-G3,
aneks D7, mapa domknięcia 3 #12).

Router realny (`TestClient`) — konwencja tej rodziny tras (jak
`tests/api/test_analysis_runs_nastawy_routes.py`): sprawdzany jest tor
wpięcia end-to-end, nie sama fizyka solvera zwarciowego (FROZEN, testowana
osobno). Testy jako ILOCZYN CECH (KLASA, NIE INSTANCJA §2), nie pojedynczy
przykład z karty:
  {oba biegi zapisane / tylko kotwica auto-c / tylko kotwica c ręczne /
   kotwica jest wariantem scenariusza} ×
  {kotwica MAX / kotwica MIN} ×
  {ta sama rewizja / różne rewizje} ×
  {jeden kandydat / kilku kandydatów — wybór najświeższego} ×
  {ten sam typ zwarcia / inny typ zwarcia u kandydata — odrzucony}
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from api.main import app
from enm import canonical_analysis
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
    reset_canonical_runs,
)
from enm.envelope import zbuduj_koperte
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from fastapi.testclient import TestClient

CASE_ID = "case-pasmo-min-max"


@pytest.fixture()
def client() -> TestClient:
    reset_canonical_runs()
    with TestClient(app) as test_client:
        yield test_client


def _siec(*, revision: int = 1) -> EnergyNetworkModel:
    """Sieć 110/15 kV z danymi MIN źródła (S''kQmin, R/X min) — MAX i MIN dają
    różne liczby (parytet fizyki nie jest przedmiotem tego pliku; tu liczy się
    WYŁĄCZNIE, że pasmo pokazuje dwie różne, poprawnie dobrane strony)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec pasma MIN/MAX", revision=revision),
        buses=[
            Bus(ref_id="hv", name="GPZ 110", voltage_kv=110.0),
            Bus(ref_id="mv", name="Stacja SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="System 110 kV",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=2000.0,
                rx_ratio=0.1,
                sk3_min_mva=1200.0,
                rx_ratio_min=0.15,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=80.0,
                vector_group="YNd11",
            )
        ],
    )


def _zapisz_bieg(
    run_id: UUID,
    *,
    case_id: str = CASE_ID,
    scenario: str = "max",
    fault_type: str = "3F",
    c_factor: float | None = None,
    revision: int = 1,
    utworzony: datetime | None = None,
    envelope: dict[str, object] | None = None,
) -> CanonicalRun:
    opcje: dict[str, object] = {
        "fault_type": fault_type,
        "scenario": scenario,
        "thermal_time_seconds": 1.0,
    }
    if c_factor is not None:
        opcje["c_factor"] = c_factor
    utworzony = utworzony or datetime(2026, 1, 1, tzinfo=UTC)
    run = CanonicalRun(
        id=run_id,
        case_id=case_id,
        project_id="proj-pasmo-min-max",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=utworzony,
        snapshot_hash=f"snap-{run_id}",
        input_hash=f"in-{run_id}",
        snapshot=_siec(revision=revision).model_dump(mode="json"),
        validation={},
        readiness={},
        options=opcje,
        envelope=envelope,
    )
    run.finished_at = utworzony
    _execute_short_circuit(run)
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    return run


def _pasmo(client: TestClient, run_id: UUID) -> dict:
    response = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit/pasmo")
    assert response.status_code == 200, response.text
    return response.json()


def test_404_gdy_kotwica_nie_istnieje(client: TestClient) -> None:
    response = client.get(f"/api/analysis-runs/{uuid4()}/results/short-circuit/pasmo")
    assert response.status_code == 404


def test_409_gdy_kotwica_nie_jest_zwarciem(client: TestClient) -> None:
    run_id = uuid4()
    run = CanonicalRun(
        id=run_id,
        case_id=CASE_ID,
        project_id="proj-pasmo-min-max",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-pf",
        input_hash="in-pf",
        snapshot={},
        validation={},
        readiness={},
    )
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    response = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit/pasmo")
    assert response.status_code == 409


def test_409_gdy_kotwica_nie_zakonczona(client: TestClient) -> None:
    run_id = uuid4()
    run = CanonicalRun(
        id=run_id,
        case_id=CASE_ID,
        project_id="proj-pasmo-min-max",
        analysis_type="short_circuit_sn",
        status="RUNNING",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-running",
        input_hash="in-running",
        snapshot=_siec().model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "scenario": "max"},
    )
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    response = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit/pasmo")
    assert response.status_code == 409


@pytest.mark.parametrize("scenariusz_kotwicy", ["max", "min"])
def test_auto_c_bez_pary_dolicza_wariant_w_pamieci(
    client: TestClient, scenariusz_kotwicy: str
) -> None:
    """{tylko kotwica, auto-c} × {kotwica MAX / kotwica MIN} — strona przeciwna
    zawsze dostępna, doliczona wariantem w pamięci, z tą samą rewizją."""
    run_id = uuid4()
    _zapisz_bieg(run_id, scenario=scenariusz_kotwicy)
    pasmo = _pasmo(client, run_id)

    assert pasmo["run_id_kotwicy"] == str(run_id)
    assert pasmo["scenariusz_kotwicy"] == scenariusz_kotwicy.upper()
    assert pasmo["typ_zwarcia_kotwicy"] == "3F"
    assert pasmo["brakujacy_scenariusz"] is None
    assert pasmo["powod_niedostepnosci"] is None
    assert pasmo["powod_niedostepnosci_pl"] is None

    scenariusz_brakujacy = "min" if scenariusz_kotwicy == "max" else "max"
    strona_kotwicy = pasmo[scenariusz_kotwicy]
    strona_wariantu = pasmo[scenariusz_brakujacy]

    assert strona_kotwicy["zrodlo"] == "biegu_zapisanego"
    assert strona_kotwicy["run_id"] == str(run_id)
    assert len(strona_kotwicy["wynik"]["rows"]) == 2

    assert strona_wariantu["zrodlo"] == "obliczony_na_zadanie"
    assert strona_wariantu["run_id"] is None
    assert strona_wariantu["bieg_bazowy_id"] == str(run_id)
    assert len(strona_wariantu["wynik"]["rows"]) == 2

    # Ik'' MAX > Ik'' MIN dla tej samej szyny (fizyka spoza tego pliku, tu tylko
    # dowod, ze dwie STRONY naprawde niosa dwa RÓŻNE wyniki, nie kopię).
    wiersze_max = {r["target_id"]: r["ikss_ka"] for r in pasmo["max"]["wynik"]["rows"]}
    wiersze_min = {r["target_id"]: r["ikss_ka"] for r in pasmo["min"]["wynik"]["rows"]}
    for target_id, ikss_max in wiersze_max.items():
        assert wiersze_min[target_id] < ikss_max

    # Wariant w pamięci dzieli migawkę kotwicy -> ta sama rewizja po obu stronach.
    assert (
        strona_kotwicy["analysis_case_context"]["rewizja_modelu"]
        == strona_wariantu["analysis_case_context"]["rewizja_modelu"]
    )

    # Proweniencja c (aneks D7: "identyfikator, rewizja, c, S''kQ") — AUTO z
    # pasma napięciowego IEC 60909 Tab. 1, różna dla MAX i MIN.
    zrodlo_max = {z["scenariusz"]: z for z in pasmo["max"]["wynik"]["zrodla_sieciowe"]}
    zrodlo_min = {z["scenariusz"]: z for z in pasmo["min"]["wynik"]["zrodla_sieciowe"]}
    assert zrodlo_max["MAX"]["c"] == pytest.approx(1.10)
    assert zrodlo_min["MIN"]["c"] == pytest.approx(1.00)
    assert zrodlo_max["MAX"]["sk3_mva"] == pytest.approx(2000.0)
    assert zrodlo_min["MIN"]["sk3_mva"] == pytest.approx(1200.0)


@pytest.mark.parametrize("scenariusz_kotwicy", ["max", "min"])
def test_reczny_c_bez_pary_odmowa_nazwana(client: TestClient, scenariusz_kotwicy: str) -> None:
    """{tylko kotwica, c ręczne} — para NIEDOSTĘPNA, powód nazwany (zero
    zgadywania fizyki: wariant z c innym niż AUTO nie jest budowany cicho)."""
    run_id = uuid4()
    _zapisz_bieg(run_id, scenario=scenariusz_kotwicy, c_factor=1.05)
    pasmo = _pasmo(client, run_id)

    scenariusz_brakujacy = "MIN" if scenariusz_kotwicy == "max" else "MAX"
    assert pasmo["brakujacy_scenariusz"] == scenariusz_brakujacy
    assert pasmo["powod_niedostepnosci"] == "wspolczynnik_c_recznie_ustawiony"
    assert pasmo["powod_niedostepnosci_pl"]
    assert pasmo[scenariusz_brakujacy.lower()] is None
    # Strona kotwicy zostaje dostępna mimo braku pary.
    assert pasmo[scenariusz_kotwicy]["zrodlo"] == "biegu_zapisanego"


@pytest.mark.parametrize("scenariusz_kotwicy", ["max", "min"])
def test_kotwica_wariant_scenariusza_odmowa_nazwana(
    client: TestClient, scenariusz_kotwicy: str
) -> None:
    """Kotwica sama jest wariantem scenariusza roboczego (koperta wersja 2,
    `scenario_ref`) — `bieg_wariantu` nie modeluje składania scenariuszy, więc
    para jest NIEDOSTĘPNA z nazwanym powodem, nie cichym 500. Iloczyn cech
    (odbiór fali 3 W3, 2026-09-10): {kotwica-wariant} × {kotwica MAX / MIN} —
    gałąź odmowy nie zależy od tego, którą stronę pasma niesie kotwica."""
    run_id = uuid4()
    koperta = zbuduj_koperte(
        project_id="proj-pasmo-min-max",
        model_revision=1,
        snapshot_hash=f"snap-{run_id}",
        catalog_fingerprint="fp-1",
        options_hash="opt-1",
        scenario_ref=("scenariusz-testowy", 1),
        scenario_hash="hash-scenariusza",
    )
    _zapisz_bieg(run_id, scenario=scenariusz_kotwicy, envelope=koperta.to_dict())
    pasmo = _pasmo(client, run_id)

    scenariusz_brakujacy = "MIN" if scenariusz_kotwicy == "max" else "MAX"
    assert pasmo["brakujacy_scenariusz"] == scenariusz_brakujacy
    assert pasmo["powod_niedostepnosci"] == "kotwica_jest_wariantem_scenariusza"
    assert pasmo["powod_niedostepnosci_pl"]
    assert pasmo[scenariusz_brakujacy.lower()] is None
    assert pasmo[scenariusz_kotwicy]["zrodlo"] == "biegu_zapisanego"


@pytest.mark.parametrize("scenariusz_kotwicy", ["max", "min"])
def test_blad_solvera_wariantu_odmowa_nazwana(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, scenariusz_kotwicy: str
) -> None:
    """Gałąź `blad_solvera_wariantu:<Wyjątek>` (`enm/canonical_analysis.py`,
    `pasmo_min_max_zwarcia`): wariant przeciwnego scenariusza liczony w pamięci
    kończy się wyjątkiem solvera — pasmo NIE jest cichym 500 ani pustą stroną
    bez powodu, tylko odmową NAZWANĄ klasą wyjątku, z komunikatem PL
    (`api/canonical_run_views.py::_powod_niedostepnosci_pasma_pl`). Recenzja
    karty W3-G3 (odbiór fali 3 W3, 2026-09-10): deklaracja „nigdy cichy" stała
    bez testu — deklaracja bez testu = fałszywa pewność (CLAUDE.md § KLASA, NIE
    INSTANCJA pkt 4). Iloczyn cech: {błąd wariantu} × {kotwica MAX / MIN}."""
    run_id = uuid4()
    _zapisz_bieg(run_id, scenario=scenariusz_kotwicy)

    def _wykonaj_z_bledem(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("symulowana niezbieznosc wariantu")

    # Atrapa DOPIERO po zapisaniu kotwicy — `_zapisz_bieg` liczy ją realnym
    # solverem; podmieniamy wyłącznie wykonanie wariantu w pamięci.
    monkeypatch.setattr(canonical_analysis, "wykonaj_bieg_w_pamieci", _wykonaj_z_bledem)
    pasmo = _pasmo(client, run_id)

    scenariusz_brakujacy = "MIN" if scenariusz_kotwicy == "max" else "MAX"
    assert pasmo["brakujacy_scenariusz"] == scenariusz_brakujacy
    assert pasmo["powod_niedostepnosci"] == "blad_solvera_wariantu:RuntimeError"
    assert "błędem solvera" in pasmo["powod_niedostepnosci_pl"]
    assert pasmo[scenariusz_brakujacy.lower()] is None
    # Strona kotwicy zostaje dostępna mimo błędu wariantu (odmowa dotyczy pary).
    assert pasmo[scenariusz_kotwicy]["zrodlo"] == "biegu_zapisanego"
    assert pasmo[scenariusz_kotwicy]["run_id"] == str(run_id)


def test_oba_biegi_zapisane_ta_sama_rewizja(client: TestClient) -> None:
    """{oba biegi zapisane} × {ta sama rewizja} — dwa NIEZALEŻNE biegi tego
    samego przypadku, oba wystawione jako `biegu_zapisanego` z własnym run_id."""
    run_max = uuid4()
    run_min = uuid4()
    _zapisz_bieg(run_max, scenario="max", revision=5)
    _zapisz_bieg(run_min, scenario="min", revision=5)

    pasmo = _pasmo(client, run_max)
    assert pasmo["max"]["zrodlo"] == "biegu_zapisanego"
    assert pasmo["max"]["run_id"] == str(run_max)
    assert pasmo["min"]["zrodlo"] == "biegu_zapisanego"
    assert pasmo["min"]["run_id"] == str(run_min)
    assert pasmo["min"]["run_id"] != pasmo["max"]["run_id"]
    assert pasmo["brakujacy_scenariusz"] is None
    assert (
        pasmo["max"]["analysis_case_context"]["rewizja_modelu"]
        == pasmo["min"]["analysis_case_context"]["rewizja_modelu"]
        == 5
    )

    # Symetria: z kotwicy MIN dociera się do TEGO SAMEGO realnego biegu MAX.
    pasmo_z_min = _pasmo(client, run_min)
    assert pasmo_z_min["max"]["run_id"] == str(run_max)
    assert pasmo_z_min["scenariusz_kotwicy"] == "MIN"


def test_oba_biegi_zapisane_rozne_rewizje_ostrzezenie_swiezosci(client: TestClient) -> None:
    """{oba biegi zapisane} × {różne rewizje} — obie strony NIESIONE (nie
    ukryte), z rewizjami różnymi — front (`ui2/freshness`) buduje ostrzeżenie
    z tych dwóch liczb; ten test dowodzi, że liczby DOCIERAJĄ, różne i prawdziwe."""
    run_max = uuid4()
    run_min = uuid4()
    _zapisz_bieg(run_max, scenario="max", revision=5)
    _zapisz_bieg(run_min, scenario="min", revision=7)

    pasmo = _pasmo(client, run_max)
    rewizja_max = pasmo["max"]["analysis_case_context"]["rewizja_modelu"]
    rewizja_min = pasmo["min"]["analysis_case_context"]["rewizja_modelu"]
    assert rewizja_max == 5
    assert rewizja_min == 7
    assert rewizja_max != rewizja_min
    # Uczciwość: rozjazd rewizji NIE chowa strony (karta: "nie ciche zestawienie"
    # znaczy pokaż obie liczby, żeby front mógł ostrzec — nie znaczy "ukryj").
    assert pasmo["max"] is not None and pasmo["min"] is not None


def test_wybiera_najnowszy_gdy_kilku_kandydatow(client: TestClient) -> None:
    """{kilku kandydatów tej samej strony} — wybór NAJŚWIEŻSZEGO (deterministyczny,
    nie pierwszy z brzegu / nie ostatni wstawiony do bazy)."""
    run_max = uuid4()
    run_min_stary = uuid4()
    run_min_nowy = uuid4()
    baza = datetime(2026, 1, 1, tzinfo=UTC)
    _zapisz_bieg(run_max, scenario="max", utworzony=baza)
    _zapisz_bieg(run_min_stary, scenario="min", utworzony=baza + timedelta(hours=1))
    _zapisz_bieg(run_min_nowy, scenario="min", utworzony=baza + timedelta(hours=2))

    pasmo = _pasmo(client, run_max)
    assert pasmo["min"]["run_id"] == str(run_min_nowy)
    assert pasmo["min"]["run_id"] != str(run_min_stary)


def test_remis_czasow_kandydatow_rozstrzyga_identyfikator(client: TestClient) -> None:
    """{kilku kandydatów tej samej strony} × {identyczny znacznik czasu} — klucz
    doboru `(czas, str(id))` (`pasmo_min_max_zwarcia`) rozstrzyga remis
    identyfikatorem, więc wybór jest DETERMINISTYCZNY (ten sam przy każdym
    odczycie, niezależnie od kolejności zapisu do bazy), a nie „ostatni, jaki
    trafił się iteracji". Zalecenie recenzji W3-G3 (odbiór fali 3 W3)."""
    run_max = uuid4()
    kandydat_a = uuid4()
    kandydat_b = uuid4()
    ten_sam_czas = datetime(2026, 1, 1, 12, tzinfo=UTC)
    _zapisz_bieg(run_max, scenario="max", utworzony=ten_sam_czas)
    # Zapis w kolejności ODWROTNEJ do porządku identyfikatorów, żeby „ostatni
    # zapisany" i „największy identyfikator" nie były tym samym biegiem.
    pierwszy, drugi = sorted((kandydat_a, kandydat_b), key=str, reverse=True)
    _zapisz_bieg(pierwszy, scenario="min", utworzony=ten_sam_czas)
    _zapisz_bieg(drugi, scenario="min", utworzony=ten_sam_czas)

    oczekiwany = max((kandydat_a, kandydat_b), key=str)
    assert _pasmo(client, run_max)["min"]["run_id"] == str(oczekiwany)
    assert _pasmo(client, run_max)["min"]["run_id"] == str(oczekiwany)


def test_inny_typ_zwarcia_kandydata_odrzucony_dolicza_wariant(client: TestClient) -> None:
    """{ten sam typ zwarcia / inny typ u kandydata} — kandydat MIN o INNYM typie
    zwarcia (2F) NIE paruje się z kotwicą 3F; para dochodzi wariantem w pamięci
    (a nie fałszywym parowaniem różnych typów zwarcia)."""
    run_max_3f = uuid4()
    run_min_2f = uuid4()
    _zapisz_bieg(run_max_3f, scenario="max", fault_type="3F")
    _zapisz_bieg(run_min_2f, scenario="min", fault_type="2F")

    pasmo = _pasmo(client, run_max_3f)
    assert pasmo["typ_zwarcia_kotwicy"] == "3F"
    assert pasmo["min"]["zrodlo"] == "obliczony_na_zadanie"
    assert pasmo["min"]["run_id"] is None
    assert pasmo["min"]["run_id"] != str(run_min_2f)
    for row in pasmo["min"]["wynik"]["rows"]:
        assert row["fault_type"] == "3F"
