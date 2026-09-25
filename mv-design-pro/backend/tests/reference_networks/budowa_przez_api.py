"""Budowa sieci fikstur frontendu REALNĄ ścieżką użytkownika: API aplikacji w procesie.

Fikstury ENM i odpowiedzi operacji, które kontrakty SLD czytają jako „model z backendu",
powstawały dotąd ręcznie z żywego backendu (zrzut odpowiedzi po klikach w UI) i nie miały
generatora — po zmianach nazw, ziaren identyfikatorów i uzupełnień katalogowych testy
przechodziły na danych, których produkt już nie wytwarza (karta SLD-SUBSTRAT). Ten moduł
odtwarza te same zrzuty TĄ SAMĄ drogą: ``POST /api/projects`` → ``POST /api/study-cases``
→ ``POST /api/cases/{case}/enm/domain-ops`` (operacje domenowe) /
``POST /api/station-templates/{id}/apply`` (szablony stacji) → ``GET /api/cases/{case}/enm``
— w procesie (``TestClient``), bez serwera. Migawka przechodzi więc przez magazyn modelu z
jego uzupełnieniami katalogowymi dokładnie tak, jak widzi ją frontend.

Wspólne dla generatorów fikstur: ``KlientBudowy`` (projekt + przypadek + operacje),
``normalizuj_migawke`` (stały czas nagłówka, identyfikatory techniczne z ``ref_id``, reguła
zapisu liczb, odcisk policzony z treści pliku) — jedno miejsce reguł dla wszystkich.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from tests.golden.zapis_fikstur import przypnij_identyfikatory_zrzutu, zaokraglij_liczby

WERSJA_KATALOGU = "2024.1"
APARAT_POLA_SN = "sw-cb-abb-vd4-17kv-630a"
KABEL_SN = "cable-tfk-yakxs-3x120"
ZRODLO_GPZ = "src-gpz-15kv-250mva-rx010"
TRANSFORMATOR_630 = "tr-sn-nn-15-04-630kva-dyn11"


class BladBudowy(RuntimeError):
    """Operacja albo szablon odrzucone przez API — generator nie zgaduje obejścia."""


def wiazanie(przestrzen: str, pozycja: str) -> dict[str, str]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": WERSJA_KATALOGU,
    }


class KlientBudowy:
    """Projekt i przypadek w aplikacji w procesie + operacje domenowe przez API."""

    def __init__(self, klient: TestClient, nazwa_projektu: str) -> None:
        self._klient = klient
        projekt = klient.post(
            "/api/projects",
            json={
                "name": nazwa_projektu,
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
                "name": "Przypadek fikstury",
                "description": "",
                "config": {},
                "set_active": True,
            },
        ).json()
        self.case_id: str = przypadek["id"]
        self._licznik = 0

    def operacja(self, nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Odpowiedź operacji (``snapshot``, ``selection_hint``, ``changes``…)."""
        self._licznik += 1
        odpowiedz = self._klient.post(
            f"/api/cases/{self.case_id}/enm/domain-ops",
            json={
                "project_id": "",
                "snapshot_base_hash": "",
                "operation": {
                    "name": nazwa,
                    "idempotency_key": f"fikstura-{nazwa}-{self._licznik:04d}",
                    "payload": payload,
                },
            },
        )
        wynik = odpowiedz.json()
        if odpowiedz.status_code != 200 or wynik.get("error"):
            raise BladBudowy(f"operacja {nazwa!r} odrzucona: {odpowiedz.text[:400]}")
        return wynik

    def szablon(self, template_id: str, segment_ref: str, ratio: float = 0.5) -> dict[str, Any]:
        odpowiedz = self._klient.post(
            f"/api/station-templates/{template_id}/apply",
            json={
                "case_id": self.case_id,
                "target_segment_id": segment_ref,
                "insert_at_ratio": ratio,
                "params_override": {},
                "catalog_profile": None,
            },
        )
        if odpowiedz.status_code != 200:
            raise BladBudowy(f"szablon {template_id!r} odrzucony: {odpowiedz.text}")
        return odpowiedz.json()

    def migawka(self) -> dict[str, Any]:
        """Model tak, jak widzi go frontend (``GET /api/cases/{case}/enm``)."""
        return self._klient.get(f"/api/cases/{self.case_id}/enm").json()

    def domknij_aparaty_nn(self, glowny: str, odplywowy: str = "cb_nn_250a") -> None:
        """Wiąże z katalogiem aparaty pól nN, które automigracja promocji pól nN wprowadziła
        do modelu BEZ wiązania (``meta.nn_promocja_bez_wiazania_katalogowej`` — ostrzeżenie
        W061). To akcja naprawcza projektanta (``assign_catalog_to_element``): bez niej
        graf elektryczny SLD uznaje aparat w aktywnym torze nN za nierozpoznany
        (``UNRESOLVED_ACTIVE_APPARATUS`` → SLD_INVALID), a fikstury kontraktów SLD mają
        opisywać model KOMPLETNY. Wyłącznik główny i odpływowe — pozycje ``APARAT_NN``
        o rodzaju ``WYLACZNIK_GLOWNY``/``WYLACZNIK_ODPLYWOWY`` dobrane w budowniczym.
        """
        for galaz in self.migawka()["branches"]:
            meta = galaz.get("meta") or {}
            if not meta.get("nn_promocja_bez_wiazania_katalogowej"):
                continue
            pozycja = glowny if meta.get("nn_field_migrowana_rola") == "IN" else odplywowy
            self.operacja(
                "assign_catalog_to_element",
                {"element_ref": galaz["ref_id"], "catalog_binding": wiazanie("APARAT_NN", pozycja)},
            )

    # --- operacje sieci SN wspólne dla fikstur -------------------------------------

    def gpz(self) -> dict[str, Any]:
        return self.operacja(
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
                "catalog_binding": wiazanie("ZRODLO_SN", ZRODLO_GPZ),
            },
        )

    def odcinek_magistrali(self, dlugosc_m: float, nazwa: str | None = None) -> dict[str, Any]:
        segment: dict[str, Any] = {
            "rodzaj": "KABEL",
            "dlugosc_m": dlugosc_m,
            "catalog_binding": wiazanie("KABEL_SN", KABEL_SN),
        }
        if nazwa is not None:
            segment["name"] = nazwa
        return self.operacja("continue_trunk_segment_sn", {"segment": segment})

    def stacja_b(
        self, segment_ref: str, nazwa: str, ratio: float = 0.5, nn_odplywy: int = 2
    ) -> dict[str, Any]:
        """Stacja przelotowa typu B (IN + OUT + TR), transformator 630 kVA."""
        return self.operacja(
            "insert_station_on_segment_sn",
            {
                "segment_id": segment_ref,
                "field_apparatus_catalog_ref": APARAT_POLA_SN,
                "insert_at": {"mode": "RATIO", "value": ratio},
                "station": {
                    "station_type": "B",
                    "station_name": nazwa,
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
                "nn_earthing": {"lv_system": "TN-C-S"},
                "sn_fields": [
                    {"field_role": "LINIA_IN"},
                    {"field_role": "LINIA_OUT"},
                    {"field_role": "TRANSFORMATOROWE"},
                ],
                "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
                "nn_block": {"outgoing_feeders_nn_count": nn_odplywy},
            },
        )

    def odgalezienie(self, from_ref: str, dlugosc_m: float) -> dict[str, Any]:
        return self.operacja(
            "start_branch_segment_sn",
            {
                "from_ref": from_ref,
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": dlugosc_m,
                    "catalog_binding": wiazanie("KABEL_SN", KABEL_SN),
                },
            },
        )


def normalizuj_migawke(enm: dict[str, Any], *, czas: str) -> dict[str, Any]:
    """Migawka zapisywana w fiksturze: reguły ``tests/golden/zapis_fikstur`` + stały czas
    nagłówka + odcisk policzony z TREŚCI pliku (ta sama funkcja co produkcja)."""
    from enm.hash import compute_enm_hash
    from enm.models import EnergyNetworkModel

    wynik = zaokraglij_liczby(enm)
    naglowek = wynik.setdefault("header", {})
    naglowek["created_at"] = czas
    naglowek["updated_at"] = czas
    przypnij_identyfikatory_zrzutu(wynik)
    naglowek["hash_sha256"] = compute_enm_hash(EnergyNetworkModel.model_validate(wynik))
    return wynik


def segmenty_korytarza(enm: dict[str, Any], indeks: int = 0) -> list[str]:
    return list(enm["corridors"][indeks]["ordered_segment_refs"])


def pole_gpz(enm: dict[str, Any], indeks: int = 0) -> str:
    """``field_ref`` pola liniowego GPZ o danym indeksie (kolejność w ``field_specs``)."""
    for stacja in enm["substations"]:
        if stacja.get("station_type") == "gpz":
            return str(stacja["meta"]["field_specs"][indeks]["field_ref"])
    raise BladBudowy("brak GPZ w migawce")
