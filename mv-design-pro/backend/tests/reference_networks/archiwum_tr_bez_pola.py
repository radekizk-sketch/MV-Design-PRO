"""Archiwum projektu „klasy B" (transformator stacji SN/nN BEZ pola roli TR) dla e2e.

SKĄD DZIŚ BIERZE SIĘ KLASA B. Od kanonu toru pola (karta POLA-W-TORZE) operacje domenowe
nie wytwarzają już transformatora stacji bez pola transformatorowego:
``insert_station_on_segment_sn`` z transformatorem SAMA dokłada pole roli ``TR`` (zacisk
pola = strona górna transformatora), a ``add_transformer_sn_nn`` na szynie z polami odmawia
(``tor.field_missing``). Klasa B żyje w produkcie WYŁĄCZNIE w modelach zapisanych PRZED tą
regułą — magazyn nie przepina ich przy wczytaniu (``enm/store.py::
przygotuj_model_po_odczycie`` nie dokłada pola), a rysunek (marker braku pola) i walidator
(``W041`` / ``transformer.bay_missing``) nadal je obsługują. Jedyna realna droga takiego
modelu do aplikacji to import archiwum projektu (``POST /api/projects/import``).

CO ROBI TEN MODUŁ. Buduje sieć TYMI SAMYMI operacjami domenowymi, co spec
``frontend/e2e/tr2w-bez-pola.spec.ts`` przed kanonem toru (API aplikacji w procesie,
``budowa_przez_api``), sprawdza zapadkę (operacje DOKŁADAJĄ pole TR — gdyby przestały,
klasę B dałoby się zbudować wprost i to archiwum byłoby zbędne: nazwany błąd
``OperacjeNieDokladajaPolaTr``), odtwarza kształt zapisu sprzed reguły toru
(``zapis_sprzed_reguly_toru``) i pakuje archiwum JEDYNYM pakującym produktu
(``ProjectArchiveService.export_project``) — z odciskami integralności, które import z
domyślnym ``verify_integrity`` sprawdza.

DETERMINIZM. Identyfikatory projektu i przypadku są przypięte (``uuid5``), czasy zapisu
także (``_CZAS``); zegar pakującego (``exported_at`` manifestu i stempel wpisu ZIP) jest
przypięty na czas eksportu — kod pakującego biegnie bez zmian. Model ENM przechodzi przez
``normalizuj_migawke`` (identyfikatory techniczne z ``ref_id``, reguła liczb, odcisk z
treści). Wpisy ZIP są kompresowane przez zlib maszyny (``ZIP_DEFLATED`` pakującego), więc
test świeżości porównuje TREŚĆ archiwum (``tresc_archiwum``: nazwa, stempel czasu i bajty
każdego wpisu po dekompresji), a zapis nie nadpisuje pliku o tej samej treści.

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.archiwum_tr_bez_pola --write
Sprawdzenie bez zapisu (kod 1 przy rozjeździe):
    poetry run python -m tests.reference_networks.archiwum_tr_bez_pola
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import tempfile
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi.testclient import TestClient

from tests.reference_networks.budowa_przez_api import (
    KlientBudowy,
    normalizuj_migawke,
    segmenty_korytarza,
    wiazanie,
)

SCIEZKA_ARCHIWUM = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "e2e"
    / "fixtures"
    / "projekt-tr-bez-pola.mvdp.zip"
)

KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.archiwum_tr_bez_pola --write"
)

NAZWA_PROJEKTU = "Stacja SN/nN — zapis sprzed reguły toru pola"
NAZWA_PRZYPADKU = "Przypadek bazowy"
ROLA_POLA_TR = "TR"

#: Chwila zapisu projektu w archiwum — dzień karty TR2W-BEZ-POLA (2026-08-12), czyli
#: model zapisany zanim operacje zaczęły dokładać pole TR.
_CZAS = datetime(2026, 8, 12, tzinfo=UTC)
_CZAS_ISO = "2026-08-12T00:00:00Z"
_PROJEKT_ID = uuid5(NAMESPACE_URL, "mv-design-pro:e2e:tr2w-bez-pola:projekt")
_PRZYPADEK_ID = uuid5(NAMESPACE_URL, "mv-design-pro:e2e:tr2w-bez-pola:przypadek")

# Ten sam łańcuch operacji, co spec e2e przed kanonem toru (katalogi, długość, pola SN).
_KABEL = "cable-tfk-yakxs-3x120"
_TRANSFORMATOR = "tr-sn-nn-15-04-630kva-dyn11"
_APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"


class OperacjeNieDokladajaPolaTr(RuntimeError):
    """Operacje domenowe przestały dokładać pole TR stacji z transformatorem.

    Wtedy klasa B powstaje wprost z operacji, archiwum „zapisu sprzed reguły toru" traci
    rację bytu, a spec e2e trzeba przepiąć z powrotem na operacje — generator nie zgaduje."""


class NiepelnePrzeksztalcenie(RuntimeError):
    """Po przekształceniu model nadal wskazuje usunięte pole, jego zacisk albo aparat."""


class EksportZmienilModel(RuntimeError):
    """Model w archiwum różni się od modelu przywróconego do magazynu przed eksportem.

    Odczyt magazynu przy eksporcie przechodzi przez automigracje i uzupełnienia
    (``przygotuj_model_po_odczycie``); gdyby któraś zmieniła model zapisu sprzed reguły
    toru, archiwum niosłoby inny model niż ten, który narzędzie zbudowało — bez słowa."""


# --- przekształcenie „zapis sprzed reguły toru" -------------------------------------------


def _stacja_sn_nn(enm: dict[str, Any]) -> dict[str, Any]:
    stacje = [
        s for s in enm.get("substations", []) if str(s.get("ref_id", "")).endswith("/station")
    ]
    if len(stacje) != 1:
        raise OperacjeNieDokladajaPolaTr(
            f"oczekiwano jednej stacji SN/nN w migawce, jest {len(stacje)}"
        )
    return stacje[0]


def pola_tr_stacji(enm: dict[str, Any]) -> list[dict[str, Any]]:
    """Pola roli TR stacji SN/nN, każde ZWERYFIKOWANE jako pole jej transformatora.

    Zapadka narzędzia: operacje MAJĄ dołożyć pole TR, którego zacisk jest stroną górną
    transformatora stacji, a lista aparatów pola niesie ten transformator. Każde odstępstwo
    to ``OperacjeNieDokladajaPolaTr`` — z nazwanym powodem."""
    stacja = _stacja_sn_nn(enm)
    transformatory_stacji = set(stacja.get("transformer_refs") or [])
    if not transformatory_stacji:
        raise OperacjeNieDokladajaPolaTr("stacja nie deklaruje transformatora")
    pola = [
        p
        for p in enm.get("bays", [])
        if p.get("substation_ref") == stacja["ref_id"]
        and str(p.get("bay_role") or "").upper() == ROLA_POLA_TR
    ]
    if not pola:
        raise OperacjeNieDokladajaPolaTr(
            f"stacja {stacja['ref_id']} z transformatorem nie ma pola roli TR"
        )
    transformatory = {t["ref_id"]: t for t in enm.get("transformers", [])}
    for pole in pola:
        w_polu = [r for r in pole.get("equipment_refs") or [] if r in transformatory_stacji]
        if not w_polu:
            raise OperacjeNieDokladajaPolaTr(
                f"pole {pole['ref_id']} nie niesie transformatora stacji w equipment_refs"
            )
        for ref in w_polu:
            if transformatory[ref].get("hv_bus_ref") != pole.get("terminal_bus_ref"):
                raise OperacjeNieDokladajaPolaTr(
                    f"strona górna {ref} nie leży na zacisku pola {pole['ref_id']}"
                )
    return pola


def _napisy(dane: Any) -> Iterator[str]:
    if isinstance(dane, dict):
        for wartosc in dane.values():
            yield from _napisy(wartosc)
    elif isinstance(dane, list):
        for wartosc in dane:
            yield from _napisy(wartosc)
    elif isinstance(dane, str):
        yield dane


def zapis_sprzed_reguly_toru(enm: dict[str, Any]) -> dict[str, Any]:
    """Kopia modelu w kształcie zapisu sprzed kanonu toru pola (klasa B).

    Dla każdego pola TR stacji: rekord pola znika z ``bays``, aparat pola (gałęzie z jego
    ``equipment_refs`` obecne w ``branches``; transformator z tej listy ZOSTAJE) znika z
    ``branches``, zacisk pola (``terminal_bus_ref``) znika z ``buses``, a transformator
    pola wraca stroną górną na szynę SN stacji (``bus_ref`` pola) — tak przyłączała go
    operacja sprzed reguły toru. Po przekształceniu w modelu nie zostaje żadne odwołanie
    do usuniętego pola, zacisku ani aparatu (inaczej ``NiepelnePrzeksztalcenie``)."""
    import copy

    wynik = copy.deepcopy(enm)
    pola = pola_tr_stacji(wynik)
    transformatory = {t["ref_id"]: t for t in wynik["transformers"]}
    galezie = {g["ref_id"] for g in wynik["branches"]}
    usuniete: set[str] = set()
    for pole in pola:
        for ref in pole.get("equipment_refs") or []:
            if ref in transformatory:
                transformatory[ref]["hv_bus_ref"] = pole["bus_ref"]
            elif ref in galezie:
                usuniete.add(ref)
        usuniete.add(pole["ref_id"])
        usuniete.add(pole["terminal_bus_ref"])
    wynik["bays"] = [p for p in wynik["bays"] if p["ref_id"] not in usuniete]
    wynik["branches"] = [g for g in wynik["branches"] if g["ref_id"] not in usuniete]
    wynik["buses"] = [s for s in wynik["buses"] if s["ref_id"] not in usuniete]
    pozostale = sorted(usuniete.intersection(_napisy(wynik)))
    if pozostale:
        raise NiepelnePrzeksztalcenie(f"model nadal wskazuje usunięte refy: {pozostale}")
    return wynik


# --- budowa i pakowanie ------------------------------------------------------------------


def migawka_z_operacji(klient: TestClient) -> tuple[str, dict[str, Any]]:
    """Sieć z operacji domenowych (jak spec e2e przed kanonem toru): (przypadek, model
    z ``GET /api/cases/{case}/enm`` — po uzupełnieniach magazynu, jak widzi go frontend)."""
    budowa = KlientBudowy(klient, NAZWA_PROJEKTU)
    budowa.gpz()
    budowa.operacja(
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 250,
                "name": "Odcinek 1",
                "catalog_binding": wiazanie("KABEL_SN", _KABEL),
            }
        },
    )
    segmenty = segmenty_korytarza(budowa.migawka())
    budowa.operacja(
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": _APARAT_POLA,
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            # Lista pól SN BEZ 'TR' — dawniej to dawało klasę B wprost.
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "transformer": {
                "create": True,
                "catalog_binding": wiazanie("TRAFO_SN_NN", _TRANSFORMATOR),
            },
        },
    )
    return budowa.case_id, budowa.migawka()


class _ZegarStaly(datetime):
    @classmethod
    def now(cls, tz: Any = None) -> datetime:  # type: ignore[override]
        return _CZAS if tz is not None else _CZAS.replace(tzinfo=None)


class _CzasZipStaly:
    """Zastępca modułu ``time`` w ``zipfile``: stempel wpisu = ``_CZAS``."""

    @staticmethod
    def time() -> float:
        return _CZAS.timestamp()

    @staticmethod
    def localtime(_sekundy: float | None = None) -> Any:
        return _CZAS.timetuple()


@contextmanager
def _srodowisko_izolowane() -> Iterator[None]:
    """Własna baza i magazyn ENM na czas budowy — zero śladów w drzewie i w magazynie
    wołającego (generator uruchamiany ręcznie i w teście świeżości)."""
    with tempfile.TemporaryDirectory(prefix="archiwum-tr-bez-pola-") as katalog:
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": f"sqlite+pysqlite:///{katalog}/baza.sqlite",
                "ENM_STORE_DIR": f"{katalog}/enm",
            },
        ):
            yield


def _kopia_wiersza(model: type, zrodlo: Any, **nadpisania: Any) -> Any:
    kolumny = {c.key: getattr(zrodlo, c.key) for c in model.__table__.columns}  # type: ignore[attr-defined]
    kolumny.update(nadpisania)
    return model(**kolumny)


def zbuduj_archiwum(*, przeksztalc: bool = True) -> bytes:
    """Bajty archiwum projektu z modelem z operacji; ``przeksztalc=False`` = ten sam model
    BEZ przekształcenia (z polem TR) — kontrprzykład dla zapadek testów i iniekcji."""
    from api.main import app
    from application.project_archive.service import ProjectArchiveService
    from enm.klucz_twin import klucz_twin_projektu
    from enm.store import restore_enm
    from infrastructure.persistence.models import ProjectORM, StudyCaseORM

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("mv_design_pro").setLevel(logging.WARNING)
    with _srodowisko_izolowane(), TestClient(app) as klient:
        przypadek_api, migawka = migawka_z_operacji(klient)
        # Zapadka zawsze — także dla kontrprzykładu: model z operacji MA pole TR.
        pola_tr_stacji(migawka)
        model = zapis_sprzed_reguly_toru(migawka) if przeksztalc else migawka
        model = normalizuj_migawke(model, czas=_CZAS_ISO)

        with app.state.uow_factory() as uow:
            sesja = uow.session
            przypadek = sesja.get(StudyCaseORM, UUID(przypadek_api))
            projekt = sesja.get(ProjectORM, przypadek.project_id)
            sesja.add(
                _kopia_wiersza(
                    ProjectORM,
                    projekt,
                    id=_PROJEKT_ID,
                    name=NAZWA_PROJEKTU,
                    created_at=_CZAS,
                    updated_at=_CZAS,
                )
            )
            sesja.flush()
            sesja.add(
                _kopia_wiersza(
                    StudyCaseORM,
                    przypadek,
                    id=_PRZYPADEK_ID,
                    project_id=_PROJEKT_ID,
                    name=NAZWA_PRZYPADKU,
                    created_at=_CZAS,
                    updated_at=_CZAS,
                )
            )
            sesja.flush()
            if restore_enm(klucz_twin_projektu(_PROJEKT_ID), model) is None:
                raise NiepelnePrzeksztalcenie("model po przekształceniu nie waliduje się")
            with (
                patch("application.project_archive.service.datetime", _ZegarStaly),
                patch.object(zipfile, "time", _CzasZipStaly),
            ):
                archiwum = ProjectArchiveService(sesja).export_project(_PROJEKT_ID)
    if model_z_archiwum(archiwum) != model:
        raise EksportZmienilModel("odczyt magazynu przy eksporcie zmienił model archiwum")
    return archiwum


def model_z_archiwum(dane: bytes) -> dict[str, Any]:
    """Model ENM niesiony przez archiwum (jeden przypadek — jeden wpis ``enm.models``)."""
    with zipfile.ZipFile(io.BytesIO(dane)) as plik:
        projekt = json.loads(plik.read("project.json"))
    wpisy = projekt["enm"]["models"]
    if len(wpisy) != 1:
        raise EksportZmienilModel(f"archiwum niesie {len(wpisy)} wpisów modelu, oczekiwano 1")
    return dict(wpisy[0]["snapshot"])


def tresc_archiwum(dane: bytes) -> list[tuple[str, tuple[int, ...], bytes]]:
    """Treść archiwum niezależna od zlib maszyny: (nazwa, stempel, bajty) każdego wpisu."""
    with zipfile.ZipFile(io.BytesIO(dane)) as plik:
        return [(w.filename, tuple(w.date_time), plik.read(w.filename)) for w in plik.infolist()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="zapisz archiwum do fikstur e2e")
    args = parser.parse_args(argv)
    swieze = zbuduj_archiwum()
    aktualne = SCIEZKA_ARCHIWUM.exists() and tresc_archiwum(
        SCIEZKA_ARCHIWUM.read_bytes()
    ) == tresc_archiwum(swieze)
    if aktualne:
        print(f"[aktualne] {SCIEZKA_ARCHIWUM}")
        return 0
    if args.write:
        SCIEZKA_ARCHIWUM.parent.mkdir(parents=True, exist_ok=True)
        SCIEZKA_ARCHIWUM.write_bytes(swieze)
        print(f"[zapisano] {SCIEZKA_ARCHIWUM} ({len(swieze)} B)")
        return 0
    print(f"[rozjazd] {SCIEZKA_ARCHIWUM}. {KOMENDA_REGENERACJI}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
