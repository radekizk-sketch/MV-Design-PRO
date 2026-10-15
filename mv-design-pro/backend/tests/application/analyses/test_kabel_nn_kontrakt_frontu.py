"""Kontrakt obiektu kabla nN dla frontu — próbki z PRAWDZIWEGO backendu (karta OBIEKT-KABEL-NN).

Testy sekcji inspektora (`frontend/src/ui2/inspector/__tests__/SekcjaKablaNn.test.tsx`)
renderują odpowiedzi backendu z pliku `backend/schemas/kabel_nn_kontrakt_v1.json`. Ten test
pilnuje, że plik JEST bieżącą odpowiedzią backendu — rozjazd kontraktu (nowe pole, inna
postać rekordu, inny zapis LaTeX) czerwieni test tutaj, zanim front zacznie testować fikcję.

Próbki pokrywają trzy osie iloczynu cech karty (rodzaj zabezpieczenia × warunki ułożenia ×
wynik): MCB + warunki katalogowe + spełnia, wkładka gG + grunt (2 obwody) + narusza Iz′,
MCCB + warunki katalogowe + narusza SWZ — oraz warianty przekroju i stan „brak biegów".
Identyfikatory biegów (UUID nadawane przy każdym biegu) są zastępowane stałymi znacznikami;
odcisk modelu jest deterministyczny i zostaje.

Odświeżenie pliku po świadomej zmianie kontraktu:
``KABEL_NN_ZAPISZ_KONTRAKT=1 pytest tests/application/analyses/test_kabel_nn_kontrakt_frontu.py``.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_kabel_nn as siec  # noqa: E402
from application.analyses.kabel_nn import (  # noqa: E402
    krok_w_kontrakcie,
    obliczenia_kabla_nn,
    warianty_przekroju_kabla_nn,
    wejscie_dowodu_kabla_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (  # noqa: E402
    LVCircuitVerificationProofPack,
)
from enm.canonical_analysis import reset_canonical_runs  # noqa: E402
from enm.store import reset_enm_store  # noqa: E402

PLIK = Path(__file__).resolve().parents[3] / "schemas" / "kabel_nn_kontrakt_v1.json"

#: (klucz próbki, rodzaj zabezpieczenia, warunki ułożenia, przypadek wyniku)
PROBKI: tuple[tuple[str, str, dict[str, Any] | None, str], ...] = (
    ("mcb_katalogowe_spelnia", "MCB", None, "spelnia"),
    ("gg_grunt_narusza_iz", "gG", siec.GRUNT_2_OBWODY, "narusza_iz"),
    ("mccb_katalogowe_narusza_swz", "MCCB", None, "narusza_swz"),
)


def _bez_identyfikatorow_biegow(wynik: dict[str, Any]) -> dict[str, Any]:
    audyt = wynik.get("audyt")
    if isinstance(audyt, dict):
        for klucz in ("bieg_bazowy_rozplywu", "bieg_bazowy_zwarcia"):
            if audyt.get(klucz) is not None:
                audyt[klucz] = f"<{klucz}>"
    return wynik


def kontrakt() -> dict[str, Any]:
    """Odpowiedzi backendu dla próbek — ta sama funkcja, którą woła trasa API."""
    wynik: dict[str, Any] = {"wersja": 1, "obliczenia": {}, "warianty": {}, "dowod": {}}
    for klucz, rodzaj, ulozenie, przypadek in PROBKI:
        reset_enm_store()
        reset_canonical_runs()
        enm = siec._z_biegami(
            siec._siec(rodzaj, ulozenie=ulozenie, **siec._PRZYPADKI[przypadek][rodzaj])
        )
        wynik["obliczenia"][klucz] = _bez_identyfikatorow_biegow(
            obliczenia_kabla_nn(enm, "k1", case_id=siec.CASE_ID)
        )
        if klucz == "mcb_katalogowe_spelnia":
            warianty = warianty_przekroju_kabla_nn(enm, "k1", case_id=siec.CASE_ID)
            wynik["warianty"][klucz] = warianty
            dowod = wejscie_dowodu_kabla_nn(
                enm, "k1", case_id=siec.CASE_ID, project_name="Projekt", case_name="Przypadek"
            )
            assert dowod["status"] == "OK", dowod
            dokument = LVCircuitVerificationProofPack.generate(dowod["wejscie"])
            wynik["dowod"][klucz] = {"kroki": [krok_w_kontrakcie(k) for k in dokument.steps]}
            # Skutek wyboru wariantu: TEN SAM obwód z typem rekomendowanym (operacja wyboru
            # wiąże kabel z pozycją katalogu — tu przez to samo wiązanie w budowie sieci).
            reset_enm_store()
            reset_canonical_runs()
            po = siec._z_biegami(
                siec._siec(rodzaj, ulozenie=ulozenie, typ_kabla=warianty["rekomendacja"])
            )
            wynik["obliczenia"]["mcb_katalogowe_po_wyborze"] = _bez_identyfikatorow_biegow(
                obliczenia_kabla_nn(po, "k1", case_id=siec.CASE_ID)
            )
    # Brak biegów przypadku: liczby wymagające biegu nieobliczone, akcje „Uruchom".
    reset_enm_store()
    reset_canonical_runs()
    enm = siec._siec("MCB")
    wynik["obliczenia"]["mcb_bez_biegow"] = _bez_identyfikatorow_biegow(
        obliczenia_kabla_nn(enm, "k1", case_id=siec.CASE_ID)
    )
    reset_enm_store()
    reset_canonical_runs()
    return wynik


def _tekst(dane: dict[str, Any]) -> str:
    return json.dumps(dane, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def test_plik_kontraktu_to_biezaca_odpowiedz_backendu() -> None:
    biezacy = _tekst(kontrakt())
    if os.environ.get("KABEL_NN_ZAPISZ_KONTRAKT") == "1":
        PLIK.write_text(biezacy, encoding="utf-8")
    assert PLIK.exists(), "brak pliku kontraktu — uruchom z KABEL_NN_ZAPISZ_KONTRAKT=1"
    assert PLIK.read_text(encoding="utf-8") == biezacy, (
        "kontrakt obiektu kabla nN różni się od pliku próbek frontu — świadoma zmiana? "
        "odśwież plik (KABEL_NN_ZAPISZ_KONTRAKT=1) i uruchom testy sekcji inspektora"
    )


def test_probki_pokrywaja_trzy_osie_iloczynu() -> None:
    dane = json.loads(PLIK.read_text(encoding="utf-8"))
    o = dane["obliczenia"]
    rodzaje = {o[k]["obwod"]["aparat_rodzaj_pl"] for k, *_ in PROBKI}
    assert len(rodzaje) == 3, rodzaje
    assert o["gg_grunt_narusza_iz"]["kabel"]["warunki_ulozenia"] is not None
    assert o["mcb_katalogowe_spelnia"]["kabel"]["warunki_ulozenia"] is None

    def semantyka(klucz: str, kryterium_id: str) -> str:
        return next(
            k["ocena_semantyka"] for k in o[klucz]["kryteria"] if k["kryterium_id"] == kryterium_id
        )

    assert semantyka("mcb_katalogowe_spelnia", "kabel_nn.obciazalnosc") == "pozytywna"
    assert semantyka("gg_grunt_narusza_iz", "kabel_nn.obciazalnosc") == "negatywna"
    assert semantyka("mccb_katalogowe_narusza_swz", "kabel_nn.samoczynne_wylaczenie") == (
        "negatywna"
    )
    assert o["mcb_bez_biegow"]["brakujace_biegi"] == ["LOAD_FLOW", "SC_3F"]
