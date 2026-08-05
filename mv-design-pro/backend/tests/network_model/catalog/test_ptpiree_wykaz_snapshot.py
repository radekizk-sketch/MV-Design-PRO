"""Wykaz PTPiREE: JEDNA PRAWDA — backend i frontend czytaja ten sam zbior wierszy.

Do 2026-08 backend dopasowywal urzadzenia do RECZNIE przepisanego mini-snapshotu
6 rekordow, podczas gdy frontend mial pelny rejestr z PDF-ow. Kazdy falownik
spoza tej szostki dostawal „NIEPOWIAZANY", co odcinalo pola dowodowe certyfikatu
od wniosku przylaczeniowego do OSD.

PDF-ow zrodlowych nie ma w repozytorium, wiec parytet weryfikujemy ARTEFAKT
kontra ARTEFAKT (frontendowy TS kontra backendowy JSON) — to wykonalne w CI.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from network_model.catalog.mv_converter_catalog import get_all_converter_types
from network_model.catalog.mv_ptpiree_catalog import (
    _DEVICE_KIND_PREFIX_TOKENS,
    SNAPSHOT_PATH,
    annotate_with_ptpiree_status,
    get_all_ptpiree_generator_certificates,
    get_ptpiree_catalog_manifest,
    manufacturers_match,
    match_ptpiree_certificate,
    model_match_keys,
    split_certificate_condition,
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]
FRONTEND_ARTIFACT = (
    PROJECT_ROOT
    / "frontend/src/ui/network-build/station-der/ptpireeCertifiedInverters.generated.ts"
)

#: Pola dowodowe certyfikatu przenoszone na rekord katalogu. Lista ZAMKNIETA —
#: to one plyna do parametrow DER i do wniosku OSD.
EVIDENCE_FIELDS = (
    "ptpiree_certificate_ref",
    "ptpiree_document_number",
    "ptpiree_document_acceptance_date",
    "ptpiree_wipwc_version",
    "ptpiree_ppm_scope",
    "ptpiree_source_url",
    "ptpiree_publication_date",
)


def _generator_module() -> Any:
    """Laduje generator PO SCIEZCE PLIKU, bez dotykania `sys.path`.

    Parsowanie artefaktu TS musi pochodzic z generatora (jedno zrodlo prawdy
    o formacie), ale katalog `scripts/` NIE MOZE trafic na sciezke importu —
    pilnuje tego `tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py`.
    """

    import importlib.util
    import sys

    nazwa = "_ptpiree_generator_pod_test"
    if nazwa in sys.modules:
        return sys.modules[nazwa]

    sciezka = PROJECT_ROOT / "scripts" / "generate_ptpiree_inverter_catalog.py"
    spec = importlib.util.spec_from_file_location(nazwa, sciezka)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    # Rejestracja w `sys.modules` jest WYMAGANA przed wykonaniem: generator
    # definiuje `@dataclass`, a `dataclasses` rozwiazuje adnotacje przez
    # `sys.modules[cls.__module__]`. To sys.modules, NIE sys.path — katalog
    # `scripts/` nadal nie trafia na sciezke importu.
    sys.modules[nazwa] = modul
    spec.loader.exec_module(modul)
    return modul


def _frontend_rows() -> list[dict[str, Any]]:
    """Wiersze czytane TA SAMA funkcja, ktorej uzywa generator."""

    return _generator_module().items_from_generated_ts(
        FRONTEND_ARTIFACT.read_text(encoding="utf-8")
    )


def _backend_snapshot() -> dict[str, Any]:
    with SNAPSHOT_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def frontend_rows() -> list[dict[str, Any]]:
    return _frontend_rows()


@pytest.fixture(scope="module")
def backend_snapshot() -> dict[str, Any]:
    return _backend_snapshot()


# ---------------------------------------------------------------------------
# BRAMKA (a) — parytet artefakt kontra artefakt
# ---------------------------------------------------------------------------


def test_parytet_licznosci_obu_artefaktow(frontend_rows, backend_snapshot) -> None:
    assert backend_snapshot["record_count"] == len(backend_snapshot["records"])
    assert len(backend_snapshot["records"]) == len(frontend_rows)
    # Pusty zbior przeszedlby kazda asercje "wszystkie sie zgadzaja".
    assert len(frontend_rows) > 0


def test_parytet_zbioru_identyfikatorow(frontend_rows, backend_snapshot) -> None:
    frontend_ids = {str(row["id"]) for row in frontend_rows}
    backend_ids = {str(record["id"]) for record in backend_snapshot["records"]}
    assert frontend_ids == backend_ids
    assert len(backend_ids) == len(backend_snapshot["records"]), "identyfikatory nie sa unikalne"


def test_parytet_numerow_dokumentow_i_wersji_zrodel(frontend_rows, backend_snapshot) -> None:
    """Numer dokumentu i wersja wykazu to dowod certyfikatu — musza byc identyczne."""

    frontend_by_id = {str(row["id"]): row for row in frontend_rows}
    rozjazdy: list[str] = []
    for record in backend_snapshot["records"]:
        row = frontend_by_id[str(record["id"])]
        for backend_key, frontend_key in (
            ("document_number", "documentNumber"),
            ("acceptance_date", "acceptanceDate"),
            ("source_version", "sourceVersion"),
            ("source_url", "sourceUrl"),
            ("manufacturer", "manufacturer"),
            ("model", "model"),
            ("wos_version", "wosVersion"),
        ):
            expected = row.get(frontend_key)
            if record.get(backend_key) != expected:
                rozjazdy.append(
                    f"{record['id']}.{backend_key}: {record.get(backend_key)!r} != {expected!r}"
                )
    assert not rozjazdy, "rozjazd artefaktow PTPiREE:\n" + "\n".join(rozjazdy[:20])


def test_manifest_liczy_rekordy_z_artefaktu_a_nie_z_literalu(backend_snapshot) -> None:
    manifest = get_ptpiree_catalog_manifest()

    assert manifest["record_count"] == len(backend_snapshot["records"])
    assert manifest["publication_date"] == max(
        str(source["publication_date"]) for source in backend_snapshot["sources"]
    )
    assert {source["wipwc_version"] for source in manifest["sources"]} == {
        str(source["source_version"]).split()[-1] for source in backend_snapshot["sources"]
    }
    assert manifest["current_wipwc_version"] == "1.3"


def test_modul_nie_ma_juz_recznych_rekordow() -> None:
    """Cala szostka recznych wpisow musi pochodzic teraz z pelnego wykazu."""

    certificates = get_all_ptpiree_generator_certificates()
    assert len(certificates) == get_ptpiree_catalog_manifest()["record_count"]
    assert len(certificates) > 1000, "backend znow czyta mini-snapshot zamiast wykazu"


# ---------------------------------------------------------------------------
# BRAMKA (b) — dopasowanie jako ILOCZYN CECH x wersja wykazu
# ---------------------------------------------------------------------------


def _rows_by_version(snapshot: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in snapshot["records"]:
        grouped.setdefault(str(record["source_version"]), []).append(record)
    return grouped


def _anchor(snapshot: dict[str, Any], version: str) -> dict[str, Any]:
    """Deterministyczny reprezentant wersji wykazu (bez warunku w nazwie)."""

    rows = [
        row
        for row in _rows_by_version(snapshot)[version]
        if split_certificate_condition(row["model"])[1] is None
    ]
    return sorted(rows, key=lambda row: str(row["id"]))[0]


WERSJE = ("WiPWC 1.3", "WiPWC 1.2")


@pytest.mark.parametrize("version", WERSJE)
def test_dopasowanie_dokladna_nazwa(backend_snapshot, version: str) -> None:
    row = _anchor(backend_snapshot, version)
    match = match_ptpiree_certificate(manufacturer=row["manufacturer"], model=row["model"])
    assert match is not None
    assert match["params"]["manufacturer"] == row["manufacturer"]


@pytest.mark.parametrize("version", WERSJE)
def test_dopasowanie_inna_wielkosc_liter(backend_snapshot, version: str) -> None:
    row = _anchor(backend_snapshot, version)
    match = match_ptpiree_certificate(
        manufacturer=str(row["manufacturer"]).lower(),
        model=str(row["model"]).upper(),
    )
    assert match is not None
    assert manufacturers_match(match["params"]["manufacturer"], row["manufacturer"])


@pytest.mark.parametrize("version", WERSJE)
def test_dopasowanie_producent_z_odmiana_interpunkcji(backend_snapshot, version: str) -> None:
    row = _anchor(backend_snapshot, version)
    zaburzony = str(row["manufacturer"]).replace(".", "").replace(",", " ").replace("  ", " ")
    match = match_ptpiree_certificate(manufacturer=zaburzony, model=row["model"])
    assert match is not None, f"interpunkcja rozbila producenta {zaburzony!r}"


@pytest.mark.parametrize("version", WERSJE)
def test_model_nieistniejacy_daje_brak_dopasowania(backend_snapshot, version: str) -> None:
    row = _anchor(backend_snapshot, version)
    match = match_ptpiree_certificate(
        manufacturer=row["manufacturer"],
        model="MODEL-KTOREGO-NIE-MA-W-WYKAZIE-0000",
    )
    assert match is None


@pytest.mark.parametrize("version", WERSJE)
def test_producent_nieistniejacy_daje_brak_dopasowania(backend_snapshot, version: str) -> None:
    row = _anchor(backend_snapshot, version)
    match = match_ptpiree_certificate(
        manufacturer="PRZEDSIEBIORSTWO KTOREGO NIE MA W WYKAZIE",
        model=row["model"],
    )
    assert match is None


def _conditioned_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        row
        for row in snapshot["records"]
        if split_certificate_condition(row["model"])[1] is not None
    ]


def test_wersje_wykazu_niosace_warunek_sa_wykrywane_z_danych(backend_snapshot) -> None:
    """Cecha „model z warunkiem" jest parametryzowana danymi, a nie literalem.

    W snapshocie 2026-05 wiersze z warunkiem („tylko z modulem ...") wystepuja
    WYLACZNIE w WiPWC 1.3 — dopisanie takiego wiersza do 1.2 byloby fabrykacja.
    Ten test pilnuje, ze cecha w ogole ma pokrycie; testy nizej chodza po
    wszystkich wersjach, ktore ja realnie niosa.
    """

    wersje = {str(row["source_version"]) for row in _conditioned_rows(backend_snapshot)}
    assert wersje, "zaden wiersz wykazu nie niesie warunku waznosci certyfikatu"
    assert wersje <= set(WERSJE)


def test_model_z_warunkiem_dopasowuje_sie_po_oznaczeniu_bazowym(backend_snapshot) -> None:
    for row in _conditioned_rows(backend_snapshot):
        base, condition = split_certificate_condition(row["model"])
        assert condition
        # pelna nazwa z wykazu
        assert match_ptpiree_certificate(manufacturer=row["manufacturer"], model=row["model"])
        # samo oznaczenie, bez doklejonego warunku — tak wpisuje je projektant
        match = match_ptpiree_certificate(manufacturer=row["manufacturer"], model=base)
        assert match is not None, f"oznaczenie bazowe {base!r} nie trafia w wykaz"


def test_warunek_waznosci_certyfikatu_nie_ginie(backend_snapshot) -> None:
    """Warunek („tylko z modulem ...") musi dojechac do rekordu, nie zniknac."""

    for row in _conditioned_rows(backend_snapshot):
        base, condition = split_certificate_condition(row["model"])
        match = match_ptpiree_certificate(manufacturer=row["manufacturer"], model=base)
        assert match is not None
        assert match["params"]["certificate_condition"] == condition

        annotated = annotate_with_ptpiree_status(
            {
                "id": "probny-falownik",
                "name": "probny falownik",
                "params": {"manufacturer": row["manufacturer"], "model": base},
            }
        )
        assert condition in annotated["params"]["ptpiree_note"]


def test_dopasowanie_jest_rownoscia_a_nie_zawieraniem_podciagu() -> None:
    """Regresja: dwukierunkowy `in` na tysiacach wierszy dawalby falszywy POWIAZANY."""

    certyfikat = {
        "id": "probny-certyfikat",
        "name": "PROBNY QT2",
        "params": {
            "manufacturer": "Probny Producent Co., Ltd",
            "model": "QT2",
            "publication_date": "2026-05-08",
            "source_row": 1,
        },
    }
    # model urzadzenia ZAWIERA klucz certyfikatu, ale nim nie jest
    assert (
        match_ptpiree_certificate(
            manufacturer="Probny Producent Co., Ltd",
            model="QT2000-XL",
            certificates=[certyfikat],
        )
        is None
    )
    assert (
        match_ptpiree_certificate(
            manufacturer="Probny Producent Co., Ltd",
            model="QT2",
            certificates=[certyfikat],
        )
        is not None
    )


def test_dopasowanie_jest_deterministyczne_przy_wielu_wierszach() -> None:
    """To samo urzadzenie bywa w 1.2 i 1.3 — wygrywa najnowszy wykaz, zawsze ten sam."""

    def certyfikat(item_id: str, published: str, row: int) -> dict[str, Any]:
        return {
            "id": item_id,
            "name": "Probny Producent MODEL-X",
            "params": {
                "manufacturer": "Probny Producent Co., Ltd",
                "model": "MODEL-X",
                "publication_date": published,
                "source_row": row,
            },
        }

    stary = certyfikat("stary", "2026-05-06", 10)
    nowy = certyfikat("nowy", "2026-05-08", 900)
    for kolejnosc in ([stary, nowy], [nowy, stary]):
        match = match_ptpiree_certificate(
            manufacturer="Probny Producent Co., Ltd",
            model="MODEL-X",
            certificates=kolejnosc,
        )
        assert match is not None and match["id"] == "nowy"


def test_klasa_prefiksow_rodzaju_urzadzenia_jest_zamknieta() -> None:
    """Deklaracja „lista ZAMKNIETA" w module musi miec przypiety test.

    Prefiks rodzaju urzadzenia jest odcinany tylko wtedy, gdy nie zjada calego
    oznaczenia — inaczej model „Falownik" zostalby pustym kluczem.
    """

    assert "PV" in _DEVICE_KIND_PREFIX_TOKENS
    assert model_match_keys("PV SUN2000-215KTL-H3")[-1] == "SUN2000 215KTL H3"
    # prefiks nie moze wyzerowac oznaczenia
    assert model_match_keys("Falownik") == ("FALOWNIK",)
    # „PVS-20-TL-SX" zaczyna sie od liter PV, ale to nie jest osobny token
    assert "PVS 20 TL SX" in model_match_keys("PV PVS-20-TL-SX")


def test_producent_nie_dopasowuje_sie_srodkiem_nazwy() -> None:
    assert manufacturers_match("SUNGROW", "Sungrow Power Supply Co., Ltd")
    assert not manufacturers_match("BYD", "Shanwei BYD Auto Co., Ltd")
    assert not manufacturers_match("SIEMENS", "KACO new energy HmbG Werner-von-Siemens-Allee1")
    # warianty zapisu tego samego podmiotu
    assert manufacturers_match("Renac Power Technology Co, Ltd", "Renac Power Technology Co., Ltd")
    assert manufacturers_match(
        "SolaX Power Network Technology (Zhe jiang) Co., Ltd",
        "SolaX Power Network Technology(Zhejiang) Co., Ltd",
    )


# ---------------------------------------------------------------------------
# BRAMKA (c) — klasa na adnotacji
# ---------------------------------------------------------------------------


def test_rekord_z_dopasowaniem_niesie_komplet_pol_dowodowych(backend_snapshot) -> None:
    row = _anchor(backend_snapshot, "WiPWC 1.3")
    annotated = annotate_with_ptpiree_status(
        {
            "id": "probny-falownik",
            "name": "probny falownik",
            "params": {"manufacturer": row["manufacturer"], "model": row["model"]},
        }
    )
    params = annotated["params"]

    assert params["ptpiree_status"] == "POWIAZANY"
    braki = [field for field in EVIDENCE_FIELDS if not params.get(field)]
    assert not braki, f"rekord z dopasowaniem bez pol dowodowych: {braki}"
    assert params["ptpiree_note"]


def test_rekord_bez_dopasowania_ma_status_i_note() -> None:
    annotated = annotate_with_ptpiree_status(
        {
            "id": "probny-falownik",
            "name": "probny falownik",
            "params": {"manufacturer": "NIE MA TAKIEJ FIRMY", "model": "NIE MA TAKIEGO MODELU"},
        }
    )
    params = annotated["params"]

    assert params["ptpiree_status"] == "NIEPOWIAZANY"
    assert params["ptpiree_note"]
    # Nota musi mowic, wobec CZEGO nie dopasowano — inaczej projektant nie wie,
    # czy to brak w wykazie, czy brak danych po stronie systemu.
    assert str(get_ptpiree_catalog_manifest()["record_count"]) in params["ptpiree_note"]
    assert not any(params.get(field) for field in EVIDENCE_FIELDS)


def test_adnotacja_nie_gubi_pol_ktore_rekord_juz_mial() -> None:
    for manufacturer, model in (
        ("NIE MA TAKIEJ FIRMY", "NIE MA TAKIEGO MODELU"),
        ("HUAWEI", "SUN2000-215KTL-H3"),
    ):
        wejscie = {
            "id": "probny-falownik",
            "name": "probny falownik",
            "params": {
                "manufacturer": manufacturer,
                "model": model,
                "kind": "PV",
                "un_kv": 0.4,
                "verification_status": "REFERENCYJNY",
            },
        }
        annotated = annotate_with_ptpiree_status(wejscie)
        for key, value in wejscie["params"].items():
            assert annotated["params"][key] == value, f"adnotacja nadpisala {key}"
        assert annotated["id"] == wejscie["id"]
        assert annotated["name"] == wejscie["name"]


def test_kazdy_rekord_katalogu_przetwornic_ma_status_ptpiree() -> None:
    records = get_all_converter_types()
    assert records
    for record in records:
        params = record["params"]
        assert params["ptpiree_status"] in {"POWIAZANY", "NIEPOWIAZANY"}
        assert params["ptpiree_note"]


# ---------------------------------------------------------------------------
# BRAMKA (d) — pomiar przejscia NIEPOWIAZANY -> POWIAZANY
# ---------------------------------------------------------------------------

#: POMIAR karty P1 (wykaz PTPiREE 2026-05, katalog przetwornic 176 rekordow):
#: przed przejsciem na pelny wykaz status POWIAZANY mialo 0 rekordow (backend
#: dopasowywal do recznych 6 pozycji), po przejsciu ma go 1 rekord —
#: `conv-pv-card-huawei-sun2000-215ktl` (HUAWEI SUN2000-215KTL-H3, wiersz 3254
#: wykazu WiPWC 1.2). Pozostale 175 rekordow to karty referencyjne MV/utility i
#: turbiny wiatrowe, ktorych wykaz PTPiREE (urzadzenia typu A/B, glownie nN) nie
#: obejmuje — ich NIEPOWIAZANY jest prawdziwy, a nie wynikajacy z braku danych.
POMIAR_POWIAZANYCH_PO_KARCIE = 1


def test_pomiar_liczby_rekordow_powiazanych_z_wykazem() -> None:
    records = get_all_converter_types()
    powiazane = [r for r in records if r["params"]["ptpiree_status"] == "POWIAZANY"]

    assert len(powiazane) == POMIAR_POWIAZANYCH_PO_KARCIE
    assert {r["id"] for r in powiazane} == {"conv-pv-card-huawei-sun2000-215ktl"}
    # Pomiar bez licznosci calego zbioru przeszedlby na pustym katalogu.
    assert len(records) == 176
