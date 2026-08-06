#!/usr/bin/env python3
"""Sieć pokazowa „pomiar rozliczeniowy w odgałęzieniu" — seeder wielokrotnego użytku.

CO BUDUJE (kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`):

    GPZ ──odc.1── [S1 dystrybucyjna] ──odc.2── [S2 dystrybucyjna] ──odc.3──▶
                        │                            │
                    (ZKSN odg.)                  (ZKSN odg.)
                        │                            │
                 [K1 przemysłowa]             [K2 typowa 1000 kVA
                  1 MVA + pomiar]              „+ pomiary" + pomiar]

- magistrala OSD: 3 odcinki kablowe ze stacjami DYSTRYBUCYJNYMI wciętymi
  przelotowo (szablon BEZ pomiaru rozliczeniowego — klasa A kontraktu);
- 2 klientów SN (przemysłowy i typowy 1000 kVA) przyłączonych ODGAŁĘZIENIAMI
  od magistrali — stacje KOŃCOWE, pomiar w szeregu z gałęzią klienta;
- biegi zwarciowy i rozpływowy na zbudowanym modelu.

TRYBY (`--tryb`):
- `po`    (domyślny) — realna droga produkcyjna: `POST /api/station-templates/
  {id}/apply`. Szablon z polem pomiarowym sam trafia na drogę odgałęzienia.
- `przed` — ODTWORZENIE STANU SPRZED KARTY POMIAR-ODGAŁĘZIENIE: klienci wcięci
  przelotowo w magistralę operacją `insert_station_on_segment_sn` (dokładnie to
  robiła aplikacja szablonu przed naprawą). Służy WYŁĄCZNIE do zrzutów
  porównawczych „przed/po" — nie jest ścieżką produkcyjną.

UŻYCIE (backend musi działać):
    python scripts/demo-siec-pokazowa/seed.py --wynik /tmp/po.json
    python scripts/demo-siec-pokazowa/seed.py --tryb przed --wynik /tmp/przed.json
    BACKEND_URL=http://127.0.0.1:8000 python scripts/demo-siec-pokazowa/seed.py ...

WYNIK: plik JSON z identyfikatorami projektu/przypadku/biegów oraz (przy
`--enm <ścieżka>`) migawka ENM gotowa jako fixtura rysunku.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from typing import Any

BACKEND = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
WERSJA_KATALOGU = "2024.1"

#: Szablony sieci pokazowej. `klient=True` ⇒ szablon deklaruje pole pomiarowe,
#: więc kontrakt wymaga przyłączenia odgałęzieniem.
STACJE_MAGISTRALI = ("tpl_sn_nn_630kva", "tpl_sn_nn_400kva")
KLIENCI = ("tpl_przemyslowa_1mva_4odplywy", "tpl_sn_nn_1000kva")


def zadanie(metoda: str, sciezka: str, dane: Any = None, timeout: int = 600) -> Any:
    body = json.dumps(dane).encode() if dane is not None else None
    request = urllib.request.Request(
        BACKEND + sciezka,
        data=body,
        method=metoda,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as odpowiedz:
        return json.loads(odpowiedz.read().decode())


def wiazanie(przestrzen: str, pozycja: str) -> dict[str, str]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": WERSJA_KATALOGU,
    }


class Sesja:
    """Operacje domenowe na jednym przypadku obliczeniowym."""

    def __init__(self, case_id: str, etykieta: str) -> None:
        self.case_id = case_id
        self.etykieta = etykieta
        self._licznik = 0

    def operacja(self, nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._licznik += 1
        wynik = zadanie(
            "POST",
            f"/api/cases/{self.case_id}/enm/domain-ops",
            {
                "project_id": "",
                "snapshot_base_hash": "",
                "operation": {
                    "name": nazwa,
                    "idempotency_key": f"{self.etykieta}-{nazwa}-{self._licznik:04d}",
                    "payload": payload,
                },
            },
        )
        if wynik.get("error"):
            raise SystemExit(f"Operacja '{nazwa}' odrzucona: {wynik.get('error')}")
        return wynik

    def migawka(self) -> dict[str, Any]:
        return zadanie("GET", f"/api/cases/{self.case_id}/enm")


def zastosuj_szablon(sesja: Sesja, template_id: str, segment_ref: str) -> dict[str, Any]:
    """Realna droga produkcyjna — końcówka aplikacji szablonu."""
    return zadanie(
        "POST",
        f"/api/station-templates/{template_id}/apply",
        {
            "case_id": sesja.case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )


def wetnij_przelotowo(sesja: Sesja, template_id: str, segment_ref: str) -> dict[str, Any]:
    """Stan SPRZED karty: klient wcięty w magistralę (tranzyt przez jego rozdzielnicę).

    Buduje payload dokładnie tak, jak robiła to aplikacja szablonu przed naprawą:
    te same pola SN z biblioteki szablonów, ta sama operacja domenowa.
    """
    szablon = zadanie("GET", f"/api/station-templates/{template_id}")
    podglad = zadanie(
        "POST",
        f"/api/station-templates/{template_id}/preview",
        {"params_override": {}, "catalog_profile": None},
    )
    konfiguracja = podglad["effective_config"]
    return sesja.operacja(
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_ref,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "name_pl": szablon["name_pl"],
                "station_type": podglad["station_type"],
                "sn_voltage_kv": 15,
                "nn_voltage_kv": 0.4,
            },
            "transformer": {"transformer_catalog_ref": konfiguracja["transformer_ref"]},
            "sn_fields": konfiguracja["sn_fields"],
            "nn_block": {
                "outgoing_feeders_nn_count": konfiguracja["nn_feeders_count"],
                "outgoing_feeders_nn": [],
            },
        },
    )


def zbuduj(tryb: str) -> dict[str, Any]:
    znacznik = str(int(time.time()))
    projekt = zadanie(
        "POST",
        "/api/projects",
        {
            "name": f"Sieć pokazowa — pomiar w odgałęzieniu ({tryb}) {znacznik}",
            "description": "Magistrala OSD ze stacjami przelotowymi + 2 klientów SN.",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    )
    przypadek = zadanie(
        "POST",
        "/api/study-cases",
        {
            "project_id": projekt["id"],
            "name": f"Bieg pokazowy {tryb} {znacznik}",
            "description": "",
            "config": {},
            "set_active": True,
        },
    )
    sesja = Sesja(przypadek["id"], f"pokazowa-{tryb}-{znacznik}")

    sesja.operacja(
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": wiazanie("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
        },
    )

    # Magistrala: 3 odcinki. Po każdym z dwóch pierwszych — stacja DYSTRYBUCYJNA
    # wcięta przelotowo (klasa A: bez pomiaru rozliczeniowego).
    odcinki: list[str] = []
    for i in range(3):
        wynik = sesja.operacja(
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 600 + 120 * i,
                    "name": f"Magistrala SN — odcinek {i + 1}",
                    "catalog_binding": wiazanie("KABEL_SN", "cable-tfk-yakxs-3x120"),
                }
            },
        )
        odcinki.append(wynik["snapshot"]["corridors"][0]["ordered_segment_refs"][-1])

    stacje_osd = []
    for indeks, template_id in enumerate(STACJE_MAGISTRALI):
        wynik = zastosuj_szablon(sesja, template_id, odcinki[indeks])
        stacje_osd.append(wynik.get("station_ref"))

    # Klienci: szablony Z POMIAREM. W trybie „po" aplikacja sama wybiera drogę
    # odgałęzienia; w trybie „przed" wtykamy ich w magistralę operacją domenową.
    migawka = sesja.migawka()
    odcinki_magistrali = migawka["corridors"][0]["ordered_segment_refs"]
    cele = [odcinki_magistrali[1], odcinki_magistrali[-1]]

    klienci = []
    for template_id, cel in zip(KLIENCI, cele):
        if tryb == "przed":
            wynik = wetnij_przelotowo(sesja, template_id, cel)
            klienci.append((wynik.get("selection_hint") or {}).get("element_id"))
        else:
            wynik = zastosuj_szablon(sesja, template_id, cel)
            klienci.append(wynik.get("station_ref"))

    gotowosc = zadanie("GET", f"/api/cases/{sesja.case_id}/engineering-readiness")
    zwarcie = zadanie("POST", f"/api/cases/{sesja.case_id}/runs/short-circuit", {})
    rozplyw = zadanie("POST", f"/api/cases/{sesja.case_id}/runs/power-flow", {})

    return {
        "tryb": tryb,
        "project_id": projekt["id"],
        "project_name": projekt["name"],
        "case_id": sesja.case_id,
        "case_name": przypadek["name"],
        "stacje_osd": stacje_osd,
        "stacje_klientow": klienci,
        "ready": gotowosc.get("ready"),
        "sc_run": zwarcie.get("run_id"),
        "sc_rows": len(zwarcie.get("results", [])),
        "pf_run": rozplyw.get("run_id"),
        "pf_converged": (rozplyw.get("summary") or {}).get("converged"),
        "_case": sesja.case_id,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tryb", choices=("po", "przed"), default="po")
    parser.add_argument("--wynik", help="Plik JSON z identyfikatorami")
    parser.add_argument("--enm", help="Plik JSON z migawką ENM (fixtura rysunku)")
    argumenty = parser.parse_args()

    raport = zbuduj(argumenty.tryb)
    case_id = raport.pop("_case")
    if argumenty.enm:
        migawka = zadanie("GET", f"/api/cases/{case_id}/enm")
        with open(argumenty.enm, "w", encoding="utf-8") as plik:
            json.dump(migawka, plik, ensure_ascii=False, indent=1, sort_keys=True)
    if argumenty.wynik:
        with open(argumenty.wynik, "w", encoding="utf-8") as plik:
            json.dump(raport, plik, ensure_ascii=False, indent=1)
    print(json.dumps(raport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
