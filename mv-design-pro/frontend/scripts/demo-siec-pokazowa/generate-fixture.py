#!/usr/bin/env python3
"""Fixtura rysunku dla sieci pokazowej „pomiar rozliczeniowy w odgałęzieniu".

Most: REALNA końcówka aplikacji szablonu (`POST /api/station-templates/{id}/apply`,
wołana w procesie przez `TestClient` — bez uruchamiania serwera) → migawka ENM →
znormalizowany, deterministyczny JSON zapisany jako fixtura testów rysunku:

    frontend/src/ui/sld/v3/scene/__tests__/fixtures/pomiarOdgalezienie.enm.json

Sieć jest tą samą, którą buduje `seed.py --tryb po` (magistrala OSD z TRZEMA
stacjami przelotowymi + 2 klientów SN w odgałęzieniach, jeden za ZKSN na odcinku
kablowym, drugi za słupem rozgałęźnym na odcinku napowietrznym) — jedna prawda
kształtu, zero syntetycznego zgadywania w testach rysunku.

Determinizm: `created_at`/`updated_at` przypięte do stałej, `header.name`
i identyfikatory projektu/przypadku poza migawką, więc plik jest bajtowo stabilny
między regeneracjami.

Uruchomienie (z katalogu `backend/` — tam mieszka środowisko poetry):
    poetry run python ../frontend/scripts/demo-siec-pokazowa/generate-fixture.py
"""

from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

_THIS = pathlib.Path(__file__).resolve()
_FRONTEND = _THIS.parent.parent.parent
_REPO = _FRONTEND.parent
_BACKEND = _REPO / "backend"
sys.path.insert(0, str(_BACKEND / "src"))
sys.path.insert(0, str(_BACKEND))

from api.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_STALY_CZAS = "2026-08-06T00:00:00Z"
_WERSJA_KATALOGU = "2024.1"

#: Trzy stacje dystrybucyjne OSD wcięte przelotowo (klasa A kontraktu).
# Wszystkie trzy MUSZĄ mieć pole liniowe ODPŁYWOWE (OUT): magistrala biegnie
# przez nie dalej. Szablon 2-polowy (np. 250 kVA = IN + TR) jest stacją KOŃCOWĄ
# i w środku ciągu kłamałby o topologii.
STACJE_MAGISTRALI = ("tpl_sn_nn_630kva", "tpl_sn_nn_400kva", "tpl_sn_nn_1250kva")
#: Dwaj klienci SN w odgałęzieniach (klasa B). Pierwszy siada na odcinku KABLOWYM
#: (punkt odgałęźny = ZKSN), drugi na NAPOWIETRZNYM (punkt = słup rozgałęźny) —
#: sieć pokazowa ćwiczy OBA rodzaje punktu odgałęźnego, nie jeden.
KLIENCI = ("tpl_przemyslowa_1mva_4odplywy", "tpl_sn_nn_1000kva")
#: Magistrala: trzy przęsła kablowe + ostatnie napowietrzne.
ODCINKI_MAGISTRALI = (
    ("KABEL", "KABEL_SN", "cable-tfk-yakxs-3x120", 600),
    ("KABEL", "KABEL_SN", "cable-tfk-yakxs-3x120", 720),
    ("KABEL", "KABEL_SN", "cable-tfk-yakxs-3x120", 840),
    ("LINIA_NAPOWIETRZNA", "LINIA_SN", "line-base-afl2-70", 960),
)

_WYJSCIE = (
    _FRONTEND
    / "src"
    / "ui"
    / "sld"
    / "v3"
    / "scene"
    / "__tests__"
    / "fixtures"
    / "pomiarOdgalezienie.enm.json"
)


def _wiazanie(przestrzen: str, pozycja: str) -> dict[str, str]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": _WERSJA_KATALOGU,
    }


def _zbuduj(klient: TestClient) -> dict[str, Any]:
    projekt = klient.post(
        "/api/projects",
        json={
            "name": "Sieć pokazowa — pomiar w odgałęzieniu",
            "description": "",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    ).json()
    przypadek = klient.post(
        "/api/study-cases",
        json={
            "project_id": projekt["id"],
            "name": "Bieg pokazowy",
            "description": "",
            "config": {},
            "set_active": True,
        },
    ).json()
    case_id = przypadek["id"]
    licznik = [0]

    def operacja(nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
        licznik[0] += 1
        wynik = klient.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "project_id": "",
                "snapshot_base_hash": "",
                "operation": {
                    "name": nazwa,
                    "idempotency_key": f"pomiar-odg-{nazwa}-{licznik[0]:04d}",
                    "payload": payload,
                },
            },
        ).json()
        if wynik.get("error"):
            raise SystemExit(f"Operacja '{nazwa}' odrzucona: {wynik['error']}")
        return wynik

    def zastosuj(template_id: str, segment_ref: str) -> dict[str, Any]:
        odpowiedz = klient.post(
            f"/api/station-templates/{template_id}/apply",
            json={
                "case_id": case_id,
                "target_segment_id": segment_ref,
                "insert_at_ratio": 0.5,
                "params_override": {},
                "catalog_profile": None,
            },
        )
        if odpowiedz.status_code != 200:
            raise SystemExit(f"Szablon '{template_id}' odrzucony: {odpowiedz.text}")
        return odpowiedz.json()

    operacja(
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _wiazanie("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
        },
    )
    odcinki: list[str] = []
    for i, (rodzaj, przestrzen, pozycja, dlugosc) in enumerate(ODCINKI_MAGISTRALI):
        wynik = operacja(
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": rodzaj,
                    "dlugosc_m": dlugosc,
                    "name": f"Magistrala SN — odcinek {i + 1}",
                    "catalog_binding": _wiazanie(przestrzen, pozycja),
                }
            },
        )
        odcinki.append(wynik["snapshot"]["corridors"][0]["ordered_segment_refs"][-1])

    for indeks, template_id in enumerate(STACJE_MAGISTRALI):
        zastosuj(template_id, odcinki[indeks])

    # Klienci: pierwszy na odcinku KABLOWYM w środku ciągu (ZKSN), drugi na
    # OSTATNIM odcinku — napowietrznym, za ostatnią stacją (słup rozgałęźny).
    migawka = klient.get(f"/api/cases/{case_id}/enm").json()
    odcinki_magistrali = migawka["corridors"][0]["ordered_segment_refs"]
    for template_id, cel in zip(KLIENCI, [odcinki_magistrali[1], odcinki_magistrali[-1]]):
        zastosuj(template_id, cel)

    return klient.get(f"/api/cases/{case_id}/enm").json()


def _ustabilizuj_identyfikatory_techniczne(enm: dict[str, Any]) -> None:
    """`ENMElement.id` (UUID4 z `default_factory`) → UUID5 wyprowadzony z `ref_id`.

    Tożsamością elementu w modelu i na rysunku jest `ref_id` (deterministyczny,
    wyprowadzony z ziarna operacji domenowej); `id` to techniczny identyfikator
    nadawany losowo przy walidacji modelu. Bez tej normalizacji fixtura zmieniałaby
    się co regenerację w kilkudziesięciu miejscach, więc żaden przegląd różnic nie
    pokazałby zmiany MERYTORYCZNEJ. Odwzorowanie `ref_id` → `id` jest wzajemnie
    jednoznaczne, więc unikalność identyfikatorów zostaje zachowana.
    """
    from uuid import NAMESPACE_URL, uuid5

    for kolekcja in enm.values():
        if not isinstance(kolekcja, list):
            continue
        for element in kolekcja:
            if isinstance(element, dict) and "id" in element and element.get("ref_id"):
                element["id"] = str(uuid5(NAMESPACE_URL, str(element["ref_id"])))


def main() -> None:
    with TestClient(app) as klient:
        enm = _zbuduj(klient)

    naglowek = enm.setdefault("header", {})
    naglowek["created_at"] = _STALY_CZAS
    naglowek["updated_at"] = _STALY_CZAS
    naglowek["name"] = "Sieć pokazowa — pomiar w odgałęzieniu"
    _ustabilizuj_identyfikatory_techniczne(enm)
    # Odcisk migawki PO normalizacji — inaczej fixtura niosłaby hash policzony z
    # modelu sprzed przypięcia czasów i identyfikatorów, czyli deklarowałaby
    # odcisk, którego jej własna treść nie potwierdza.
    from enm.hash import compute_enm_hash  # noqa: PLC0415
    from enm.models import EnergyNetworkModel  # noqa: PLC0415

    naglowek["hash_sha256"] = compute_enm_hash(EnergyNetworkModel.model_validate(enm))

    _WYJSCIE.parent.mkdir(parents=True, exist_ok=True)
    _WYJSCIE.write_text(
        json.dumps({"enm": enm}, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    stacje = [s for s in enm["substations"] if s.get("station_type") != "gpz"]
    print(f"zapisano: {_WYJSCIE}")
    print(f"stacje: {len(stacje)}, odgałęzienia: {len(enm.get('branch_points', []))}")


if __name__ == "__main__":
    main()
