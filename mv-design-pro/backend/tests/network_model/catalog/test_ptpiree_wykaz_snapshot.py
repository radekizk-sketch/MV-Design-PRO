"""Wykaz PTPiREE: JEDNA PRAWDA — jeden artefakt, z ktorego czyta backend i (przez API) front.

Do 2026-08 backend dopasowywal urzadzenia do RECZNIE przepisanego mini-snapshotu
6 rekordow, podczas gdy frontend mial pelny rejestr z PDF-ow. Kazdy falownik
spoza tej szostki dostawal „NIEPOWIAZANY", co odcinalo pola dowodowe certyfikatu
od wniosku przylaczeniowego do OSD.

Do 2026-09 wykaz mial DWIE projekcje (snapshot JSON backendu i kopia TS we
froncie), pilnowane testami parytetu artefakt kontra artefakt. Karta AB-1a D1
skasowala kopie frontowa (front czyta wykaz z API), wiec parytet dwoch kopii
zastapila KLASA: snapshot JSON jest JEDYNYM artefaktem wykazu (zadna sciezka
zrodel nie wskazuje artefaktu generowanego) i ma dokladnie postac kanoniczna
jedynego emitera `scripts/generate_ptpiree_inverter_catalog.py`. PDF-ow
zrodlowych nie ma w repozytorium, wiec to jest weryfikacja wykonalna w CI.
"""

from __future__ import annotations

import json
import re
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

    Postac kanoniczna snapshotu musi pochodzic z emitera generatora (jedno zrodlo
    prawdy o formacie), ale katalog `scripts/` NIE MOZE trafic na sciezke importu —
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


def _backend_snapshot() -> dict[str, Any]:
    with SNAPSHOT_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def backend_snapshot() -> dict[str, Any]:
    return _backend_snapshot()


# ---------------------------------------------------------------------------
# BRAMKA (a) — snapshot JSON jest JEDYNYM artefaktem wykazu
# ---------------------------------------------------------------------------

#: Zakres skanu klasy „artefakt generowany": zrodla, testy i skrypty, w ktorych
#: mogla przetrwac druga projekcja wykazu albo jej konsument.
KATALOGI_SKANU = ("scripts", "backend/src", "backend/tests", "frontend/src")
ROZSZERZENIA_SKANU = frozenset({".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"})
#: Nazwa artefaktu generowanego we froncie (`<nazwa>.generated.ts[x]`). Wzorzec
#: wymaga kropki PRZED „generated", wiec nie lapie nazw w rodzaju `test_generated.ts`.
WZORZEC_ARTEFAKTU_GENEROWANEGO = re.compile(r"\.generated\.tsx?\b")


def _pliki_skanu() -> list[Path]:
    pliki: list[Path] = []
    for katalog in KATALOGI_SKANU:
        for sciezka in sorted((PROJECT_ROOT / katalog).rglob("*")):
            czesci = sciezka.relative_to(PROJECT_ROOT).parts
            if any(c.startswith(".") or c in ("__pycache__", "node_modules") for c in czesci):
                continue
            if sciezka.is_file() and sciezka.suffix in ROZSZERZENIA_SKANU:
                pliki.append(sciezka)
    return pliki


def test_snapshot_jest_jedynym_artefaktem_wykazu() -> None:
    """KLASA, nie instancja: nie istnieje zaden plik `*.generated.ts[x]` i zadne zrodlo
    (generator, jego testy, backend, front) nie wskazuje artefaktu generowanego — druga
    projekcja wykazu nie moze wrocic ani jako plik, ani jako sciezka konsumenta."""

    pliki = _pliki_skanu()
    # Pusty skan przeszedlby kazda asercje „zero trafien".
    assert len(pliki) > 1000
    assert (PROJECT_ROOT / "scripts" / "generate_ptpiree_inverter_catalog.py") in pliki
    # Jedyny plik, ktory MUSI nazywac wzorzec, to ten test (definiuje skan) — wylaczony jawnie.
    ten_plik = Path(__file__).resolve()
    assert ten_plik in pliki

    artefakty = [
        str(p.relative_to(PROJECT_ROOT))
        for p in pliki
        if p.name.endswith((".generated.ts", ".generated.tsx"))
    ]
    wskazania = [
        f"{p.relative_to(PROJECT_ROOT)}:{nr}"
        for p in pliki
        if p != ten_plik
        for nr, linia in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1)
        if WZORZEC_ARTEFAKTU_GENEROWANEGO.search(linia)
    ]

    assert artefakty == [], f"artefakty generowane: {artefakty}"
    assert wskazania == [], "wskazania artefaktu generowanego:\n" + "\n".join(wskazania)


def test_snapshot_ma_postac_kanoniczna_jedynego_emitera(backend_snapshot) -> None:
    """Zatwierdzony plik == emisja generatora z jego wlasnych wierszy (bajt w bajt).

    To zastepuje dawny parytet dwoch artefaktow: recznie poprawiony rekord, pole
    naglowka albo kolejnosc rozjechana z emiterem wychodza tu, zanim trafia do API.
    """

    generator = _generator_module()
    tekst = SNAPSHOT_PATH.read_text(encoding="utf-8")
    wiersze = [
        {row_key: record[snapshot_key] for snapshot_key, row_key in generator.SNAPSHOT_FIELDS}
        for record in backend_snapshot["records"]
    ]

    assert generator.render_backend_snapshot(wiersze) == tekst
    assert backend_snapshot["derived_from"] == generator.DERIVED_FROM
    assert backend_snapshot["schema"] == generator.SNAPSHOT_SCHEMA


def test_licznosc_zrodla_i_unikalnosc_identyfikatorow(backend_snapshot) -> None:
    records = backend_snapshot["records"]
    # Pusty zbior przeszedlby kazda asercje "wszystkie sie zgadzaja".
    assert len(records) > 0
    assert backend_snapshot["record_count"] == len(records)
    identyfikatory = {str(record["id"]) for record in records}
    assert len(identyfikatory) == len(records), "identyfikatory nie sa unikalne"

    zrodla = {str(source["source_id"]): source for source in backend_snapshot["sources"]}
    assert sum(int(source["record_count"]) for source in zrodla.values()) == len(records)
    for source_id, source in zrodla.items():
        rekordy_zrodla = [r for r in records if r["source_id"] == source_id]
        assert len(rekordy_zrodla) == int(source["record_count"]), source_id
        # Wersja wykazu i adres PDF-u to dowod certyfikatu — rekord niesie te zrodla.
        assert {r["source_version"] for r in rekordy_zrodla} == {source["source_version"]}
        assert {r["source_url"] for r in rekordy_zrodla} == {source["source_url"]}


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
