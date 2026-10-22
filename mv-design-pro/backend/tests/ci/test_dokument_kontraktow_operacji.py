"""Dokumenty kontraktu operacji domenowych = rejestr ``CANONICAL_OPERATIONS`` i handler.

DLACZEGO (pomiar 2026-10-22). ``docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`` (v1.0)
opisywał 21 operacji, z których 9 już nie istniało (przypadki obliczeniowe, biegi, TCC),
pomijał 29 operacji rejestru, a ładunki przykładów niosły pola, których handler nie czyta
(``trunk_ref``, ``segment_target``, ``station_spec``…). Dokumenty siostrzane powtarzały
„zamknięty zestaw 11 operacji” i „jedną z 10 dozwolonych”. Nic tego nie pilnowało.

Teraz bloki rejestru, operacji usuniętych, przykładów i zdarzeń są GENEROWANE
(``tests/ci/dokument_operacji_enm.py``), a przykłady WYKONYWANE przez produkcyjną końcówkę
``POST /api/cases/{case_id}/enm/domain-ops`` w jednym łańcuchu budowy sieci. Ten test pilnuje:

- bloki dokumentu = generator (bajt w bajt, determinizm identyfikatorów łańcucha);
- zbiór operacji przykładów = rejestr (każda operacja ma wykonany przykład) i każdy przykład
  kończy się wynikiem, który deklaruje (sukces albo nazwana odmowa);
- ładunek przykładu niesie wyłącznie pola rejestru i przechodzi walidację rejestru;
- nazwa operacji w pięciu dokumentach kontraktu (cztery dokumenty operacji i specyfikacja
  catalog-first) ∈ rejestr ∪ operacje usunięte, operacja
  usunięta nie wróciła do rejestru, a pole w tabeli operacji dokumentów siostrzanych jest polem
  rejestru tej operacji;
- koperta: rozjazd ``snapshot_base_hash`` → HTTP 409, nazwa spoza rejestru →
  ``dispatcher.unknown_operation`` bez zmiany modelu.

Każdy mechanizm ma iniekcję (zatruty wejściowy zbiór → wykryte).
"""

from __future__ import annotations

import re
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    CIAGI_LINIOWE,
    KSZTALTY_ZAGNIEZDZONE,
    REQUIRED_FIELD_ALIASES,
    KsztaltObiektu,
    OperationSpec,
    klucze_spoza_kontraktu,
    validate_operation_payload,
)

from tests.ci.dokument_operacji_enm import (
    BACKEND,
    DOKUMENT,
    KROKI,
    OPERACJE_USUNIETE,
    PRZYKLAD_WYLACZNIE_ODMOWA,
    BladLancucha,
    Krok,
    WynikKroku,
    bloki,
    bloki_dokumentu,
    sprawdz_wynik,
    wykonaj_lancuch,
)

_DOCS = DOKUMENT.parents[1]
DOKUMENTY_KONTRAKTU: tuple[Path, ...] = (
    DOKUMENT,
    _DOCS / "domain" / "KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md",
    _DOCS / "domain" / "OPERACJE_DOMENOWE_V1.md",
    _DOCS / "ui" / "KONTRAKT_OPERACJI_ENM_OP.md",
    _DOCS / "catalog" / "CATALOG_FIRST_DOMAIN_OPERATIONS_SPEC.md",
)
#: Dokumenty z ręcznymi tabelami pól operacji (nagłówek z nazwą operacji + wiersze `pole`).
DOKUMENTY_Z_TABELAMI_POL: tuple[Path, ...] = (
    _DOCS / "domain" / "KONTRAKTY_OPERACJI_I_SCHEMATY_JSON.md",
    _DOCS / "domain" / "OPERACJE_DOMENOWE_V1.md",
    _DOCS / "ui" / "KONTRAKT_OPERACJI_ENM_OP.md",
)

_CZASOWNIK = re.compile(
    r"`((?:add|append|apply|assign|attach|bind|calculate|change|clear|close|compare|configure|"
    r"connect|continue|copy|create|delete|detach|generate|insert|link|merge|move|open|place|"
    r"refresh|remove|rename|run|set|split|start|toggle|unbind|update|validate)_[a-z0-9_]+)`"
)
_WIERSZ_POLA = re.compile(r"^\|\s*`([A-Za-z_][\w.\[\]]*)`")


def _pola(op: str, spec: OperationSpec, aliasy: dict[str, dict[str, tuple[str, ...]]]) -> set[str]:
    zastepcze = {k for wartosci in aliasy.get(op, {}).values() for k in wartosci}
    return set(spec.required_fields) | set(spec.optional_fields) | zastepcze


def _klucze_ksztaltu(ksztalt: KsztaltObiektu) -> set[str]:
    wynik = set(ksztalt.pola)
    for podrzedny in ksztalt.zagniezdzone.values():
        wynik |= _klucze_ksztaltu(podrzedny)
    return wynik


def _wszystkie_pola(rejestr: dict[str, OperationSpec]) -> set[str]:
    """Pola rejestru, klucze obiektów zagnieżdżonych (``KSZTALTY_ZAGNIEZDZONE``) i pola ciągu
    liniowego (``LineRun``) opisane w dokumencie — nazwy o kształcie operacji, które nią nie są."""
    from enm.models import LineRun

    return (
        {pole for op, spec in rejestr.items() for pole in _pola(op, spec, REQUIRED_FIELD_ALIASES)}
        | {
            k
            for ksztalty in KSZTALTY_ZAGNIEZDZONE.values()
            for x in ksztalty.values()
            for k in _klucze_ksztaltu(x)
        }
        | set(LineRun.model_fields)
    )


def nazwy_spoza_rejestru(
    tekst: str, rejestr: dict[str, OperationSpec], usuniete: dict[str, str]
) -> list[str]:
    """Nazwy o kształcie operacji (czasownik_…), które nie są ani operacją, ani polem rejestru."""
    pola = _wszystkie_pola(rejestr)
    return sorted(
        {
            nazwa
            for nazwa in _CZASOWNIK.findall(tekst)
            if nazwa not in rejestr and nazwa not in usuniete and nazwa not in pola
        }
    )


def _sciezka_poza_ksztaltem(op: str, sciezka: str) -> bool:
    """``a.b.c`` z kluczem obiektu ``a`` o kształcie (``KSZTALTY_ZAGNIEZDZONE``), którego
    kolejny poziom nie zna klucza. Obiekt bez kształtu (klucze wyliczane w biegu) — bez oceny."""
    czesci = [c.split("[")[0] for c in sciezka.split(".")]
    ksztalt = KSZTALTY_ZAGNIEZDZONE.get(op, {}).get(czesci[0])
    for klucz in czesci[1:]:
        if ksztalt is None:
            return False
        if klucz not in ksztalt.pola:
            return True
        ksztalt = ksztalt.zagniezdzone.get(klucz)
    return False


def pola_tabel_spoza_rejestru(tekst: str, rejestr: dict[str, OperationSpec]) -> list[str]:
    """Wiersze tabel pól pod nagłówkiem operacji, których pole nie jest polem tej operacji —
    na KAŻDYM poziomie ścieżki ``a.b`` (kształty obiektów zagnieżdżonych)."""
    wynik: list[str] = []
    operacje: list[str] = []
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        if linia.startswith("#"):
            operacje = [o for o in re.findall(r"`([a-z0-9_]+)`", linia) if o in rejestr]
            continue
        dopasowanie = _WIERSZ_POLA.match(linia)
        if not operacje or not dopasowanie:
            continue
        sciezka = dopasowanie.group(1)
        pole = sciezka.split(".")[0].split("[")[0]
        for op in operacje:
            if pole not in _pola(op, rejestr[op], REQUIRED_FIELD_ALIASES):
                wynik.append(f"{numer}:{op}:{pole}")
            elif _sciezka_poza_ksztaltem(op, sciezka):
                wynik.append(f"{numer}:{op}:{sciezka}")
    return wynik


def pola_ladunku_spoza_rejestru(wyniki: list[WynikKroku]) -> list[str]:
    """Klucze przykładu spoza kontraktu operacji — KAŻDY poziom (``station.x``,
    ``sn_fields[0].x``), tym samym czujnikiem co dyspozytor. Dawniej sprawdzany był wyłącznie
    poziom najwyższy, a przykład stacji końcowej niósł ``station.station_name`` — nazwę, której
    ``append_station_on_endpoint`` nie czyta (stacja dostawała nazwę domyślną)."""
    return [
        f"{w.krok.etykieta}:{pole}"
        for w in wyniki
        for pole in klucze_spoza_kontraktu(w.krok.operacja, w.ladunek)
    ]


@pytest.fixture(scope="module")
def wyniki() -> list[WynikKroku]:
    return wykonaj_lancuch()


# -- dokument kanoniczny = generator ------------------------------------------------------


def test_bloki_dokumentu_rowne_generatorowi(wyniki) -> None:
    tresc = DOKUMENT.read_text(encoding="utf-8")
    assert bloki_dokumentu(tresc) == bloki(wyniki), (
        "Dokument kontraktu operacji rozjechał się z rejestrem — uruchom: "
        "PYTHONPATH=src:. python -m tests.ci.dokument_operacji_enm --write"
    )


def test_kazda_operacja_rejestru_ma_wykonany_przyklad() -> None:
    assert {krok.operacja for krok in KROKI} == set(CANONICAL_OPERATIONS)


def test_kazdy_przyklad_konczy_sie_deklarowanym_wynikiem(wyniki) -> None:
    for wynik in wyniki:
        sprawdz_wynik(wynik)
    # Odmowa jest przykładem, nie jedynym przykładem operacji — poza operacjami, których
    # sukcesu łańcuch operacji nie wytworzy (sukces przypina wskazany test).
    sukcesy = {w.krok.operacja for w in wyniki if w.krok.odmowa is None}
    assert sukcesy == set(CANONICAL_OPERATIONS) - set(PRZYKLAD_WYLACZNIE_ODMOWA)
    odmowy = {w.krok.operacja for w in wyniki if w.krok.odmowa is not None}
    assert set(PRZYKLAD_WYLACZNIE_ODMOWA) <= odmowy


@pytest.mark.parametrize("operacja", sorted(PRZYKLAD_WYLACZNIE_ODMOWA))
def test_sukces_operacji_bez_przykladu_sukcesu_przypiety_testem(operacja: str) -> None:
    powod, test = PRZYKLAD_WYLACZNIE_ODMOWA[operacja]
    plik, funkcja = test.split("::")
    assert powod.strip()
    assert f"def {funkcja}(" in (BACKEND / plik).read_text(encoding="utf-8")
    assert operacja in (BACKEND / plik).read_text(encoding="utf-8")


def test_ladunek_przykladu_wylacznie_z_pol_rejestru(wyniki) -> None:
    assert pola_ladunku_spoza_rejestru(wyniki) == []
    for wynik in wyniki:
        assert validate_operation_payload(wynik.krok.operacja, wynik.ladunek) == [], wynik.krok


# -- cztery dokumenty kontraktu -------------------------------------------------------------


@pytest.mark.parametrize("dokument", DOKUMENTY_KONTRAKTU, ids=lambda p: p.name)
def test_nazwy_operacji_w_dokumencie_z_rejestru(dokument: Path) -> None:
    tekst = dokument.read_text(encoding="utf-8")
    assert nazwy_spoza_rejestru(tekst, CANONICAL_OPERATIONS, OPERACJE_USUNIETE) == []


@pytest.mark.parametrize("dokument", DOKUMENTY_Z_TABELAMI_POL, ids=lambda p: p.name)
def test_pola_tabel_operacji_z_rejestru(dokument: Path) -> None:
    tekst = dokument.read_text(encoding="utf-8")
    assert pola_tabel_spoza_rejestru(tekst, CANONICAL_OPERATIONS) == []


def test_operacja_usunieta_nie_wrocila_do_rejestru() -> None:
    assert set(OPERACJE_USUNIETE) & set(CANONICAL_OPERATIONS) == set()
    assert all(powod.strip() for powod in OPERACJE_USUNIETE.values())


# -- koperta wywołania ----------------------------------------------------------------------


def _przypadek(klient: Any) -> tuple[str, str]:
    projekt = klient.post(
        "/api/projects",
        json={
            "name": "Koperta operacji",
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
            "name": "Koperta",
            "description": "",
            "config": {},
            "set_active": True,
        },
    ).json()
    return projekt["id"], przypadek["id"]


def _wywolaj(klient: Any, projekt: str, przypadek: str, nazwa: str, skrot: str) -> Any:
    return klient.post(
        f"/api/cases/{przypadek}/enm/domain-ops",
        json={
            "project_id": projekt,
            "snapshot_base_hash": skrot,
            "operation": {"name": nazwa, "idempotency_key": "koperta", "payload": {}},
        },
    )


def test_koperta_rozjazd_skrotu_409_i_nazwa_spoza_rejestru_bez_skutku() -> None:
    from api.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as klient:
        projekt, przypadek = _przypadek(klient)
        przed = klient.get(f"/api/cases/{przypadek}/enm").json()
        skrot = przed["header"]["hash_sha256"]

        rozjazd = _wywolaj(klient, projekt, przypadek, "refresh_snapshot", "0" * 64)
        assert rozjazd.status_code == 409

        for nazwa in ("rename_element", "operacja_nieistniejaca"):
            odpowiedz = _wywolaj(klient, projekt, przypadek, nazwa, skrot)
            assert odpowiedz.status_code == 200
            assert odpowiedz.json()["error_code"] == "dispatcher.unknown_operation"
        po = klient.get(f"/api/cases/{przypadek}/enm").json()
        assert po["header"]["hash_sha256"] == skrot


# -- iniekcje: każdy mechanizm musi WYKRYĆ rozjazd ------------------------------------------


def test_iniekcja_wiersz_fantomowy_w_bloku_wykryty(wyniki) -> None:
    tresc = DOKUMENT.read_text(encoding="utf-8")
    zatruta = tresc.replace(
        "<!-- GENEROWANE:rejestr-operacji:KONIEC -->",
        "| `add_fantom_sn` | Fantom | — | — | tak | — |\n<!-- GENEROWANE:rejestr-operacji:KONIEC -->",
    )
    assert zatruta != tresc
    assert bloki_dokumentu(zatruta) != bloki(wyniki)


def test_iniekcja_pole_fantomowe_w_ladunku_wykryte(wyniki) -> None:
    pierwszy = wyniki[0]
    zatruty = replace(pierwszy, ladunek={**pierwszy.ladunek, "trunk_ref": "fantom"})
    assert pola_ladunku_spoza_rejestru([zatruty]) == [f"{pierwszy.krok.etykieta}:trunk_ref"]


def test_iniekcja_pole_fantomowe_zagniezdzone_w_ladunku_wykryte(wyniki) -> None:
    stacja = next(w for w in wyniki if w.krok.operacja == "append_station_on_endpoint")
    zatruty = replace(
        stacja,
        ladunek={**stacja.ladunek, "station": {**stacja.ladunek["station"], "station_name": "X"}},
    )
    assert pola_ladunku_spoza_rejestru([zatruty]) == [
        f"{stacja.krok.etykieta}:station.station_name"
    ]


def test_iniekcja_odmowa_deklarowana_a_sukces_wykryta(wyniki) -> None:
    sukces = next(w for w in wyniki if w.krok.odmowa is None)
    zatruty = replace(sukces, krok=replace(sukces.krok, odmowa="tor.element_not_bypassing_field"))
    with pytest.raises(BladLancucha):
        sprawdz_wynik(zatruty)
    odmowa = next(w for w in wyniki if w.krok.odmowa is not None)
    zatruty = replace(odmowa, krok=replace(odmowa.krok, odmowa=None))
    with pytest.raises(BladLancucha):
        sprawdz_wynik(zatruty)


def test_iniekcja_nazwa_fantomowa_w_dokumencie_wykryta() -> None:
    tekst = "Operacja `add_trunk_segment_sn` oraz pole `close_ref` i `insert_at`."
    assert nazwy_spoza_rejestru(tekst, CANONICAL_OPERATIONS, OPERACJE_USUNIETE) == [
        "add_trunk_segment_sn"
    ]


def test_iniekcja_pole_fantomowe_w_tabeli_operacji_wykryte() -> None:
    tekst = (
        "### 3.2 `continue_trunk_segment_sn`\n"
        "| Pole | Typ |\n|---|---|\n"
        "| `segment.rodzaj` | `string` |\n"
        "| `parametry_jawne` | `object` |\n"
        "## 4. Inna sekcja\n"
        "| `parametry_jawne` | poza operacją — nie sprawdzane |\n"
    )
    assert pola_tabel_spoza_rejestru(tekst, CANONICAL_OPERATIONS) == [
        "5:continue_trunk_segment_sn:parametry_jawne"
    ]


def test_iniekcja_operacja_usunieta_wraca_do_rejestru_wykryta() -> None:
    zatruty = {**CANONICAL_OPERATIONS, "rename_element": CANONICAL_OPERATIONS["delete_element"]}
    assert set(OPERACJE_USUNIETE) & set(zatruty) == {"rename_element"}


def test_iniekcja_operacja_bez_przykladu_wykryta() -> None:
    bez_przykladu: tuple[Krok, ...] = tuple(k for k in KROKI if k.operacja != "refresh_snapshot")
    assert {k.operacja for k in bez_przykladu} != set(CANONICAL_OPERATIONS)


# -- ciągi liniowe w łańcuchu przykładów -----------------------------------------------------


def zmiany_ciagow_poza_kontraktem(wyniki: list[WynikKroku]) -> list[str]:
    """Kroki, po których ciągi liniowe się zmieniły, a operacja nie jest w ``CIAGI_LINIOWE``,
    oraz kroki zostawiające w ciągu odwołanie do odcinka albo stacji, których nie ma."""
    bledy: list[str] = []
    poprzednie: list[Any] | None = None
    for w in wyniki:
        migawka = w.odpowiedz.get("snapshot")
        if migawka is None:
            continue
        ciagi = migawka.get("line_runs", [])
        if poprzednie is not None and ciagi != poprzednie and w.krok.operacja not in CIAGI_LINIOWE:
            bledy.append(f"{w.krok.etykieta}: zmiana ciągów poza kontraktem")
        poprzednie = ciagi
        galezie = {g["ref_id"] for g in migawka.get("branches", [])}
        stacje = {s["ref_id"] for s in migawka.get("substations", [])}
        for ciag in ciagi:
            bledy += [
                f"{w.krok.etykieta}: {ciag['id']} -> {x['segment_ref']}"
                for x in ciag.get("segments", [])
                if x["segment_ref"] not in galezie
            ]
            bledy += [
                f"{w.krok.etykieta}: {ciag['id']} -> {x['substation_ref']}"
                for x in ciag.get("stations", [])
                if x["substation_ref"] not in stacje
            ]
    return bledy


def test_ciagi_liniowe_lancucha_zgodne_z_kontraktem(wyniki) -> None:
    assert zmiany_ciagow_poza_kontraktem(wyniki) == []
    zmieniajace = {w.krok.operacja for w in wyniki if w.krok.operacja in CIAGI_LINIOWE}
    # Łańcuch ćwiczy każdą operację kontraktu ciągów poza usunięciem odcinka (usuwa baterię).
    assert zmieniajace == set(CIAGI_LINIOWE)


def test_iniekcja_ciag_z_odcinkiem_skasowanym_wykryta(wyniki) -> None:
    ostatni = next(w for w in reversed(wyniki) if w.odpowiedz.get("snapshot"))
    migawka = {**ostatni.odpowiedz["snapshot"]}
    migawka["line_runs"] = [
        {**c, "segments": [*c["segments"], {"segment_ref": "seg/skasowany", "order": 99}]}
        for c in migawka["line_runs"]
    ]
    zatruty = replace(ostatni, odpowiedz={**ostatni.odpowiedz, "snapshot": migawka})
    assert any("seg/skasowany" in b for b in zmiany_ciagow_poza_kontraktem([zatruty]))
