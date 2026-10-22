"""Oczekiwane szyny KAŻDEJ stacji KAŻDEGO modelu ENM z fikstur generowanych (karta SZYNY-STACJI-LUSTRO).

Po co: frontend ma jedno lustro ``enm.tor_pola.szyny_stacji`` (``frontend/src/ui/shared/
szynyStacji.ts``) — adapter SLD pracuje na migawce ENM, bez pola wyprowadzonego przez
backend. Parytet lustra z backendem jest PRZYPIĘTY, nie zadeklarowany: ten generator liczy
zbiór szyn każdej stacji funkcją backendu na każdym modelu ENM, który front czyta z fikstur
generowanych, a test vitest ``szynyStacji.parytet.test.ts`` porównuje lustro z tym plikiem
stacja po stacji.

Wejście: pliki JSON z katalogów fikstur generowanych z backendu (``KATALOGI``) — każdy z nich
ma własny generator i test świeżości bajtowej, więc ten plik jest funkcją bajtów już
przypiętych. Model ENM w pliku = obiekt z listami ``substations`` i ``branches`` (na dowolnej
głębokości: migawka opakowana ``{"enm": …}``, scena harnessu, projekcja nN); jego położenie
zapisujemy wskaźnikiem JSON (RFC 6901), żeby test frontu czytał TEN SAM obiekt.

Zakres (commit 2 karty — jedna klasa „stacja i jej szyny”), klucze na każdy model:
``szyny`` (``szyny_stacji``), ``szyny_glowne`` (``szyna_glowna_stacji`` dla każdej szyny stacji;
w modelu iloczynu także dla każdego końca gałęzi), ``transformatory`` (``enm.pole_transformatorowe.
transformatory_stacji``), ``zaciski_pol`` (``enm.pola.zacisk_pola`` każdego rekordu ``bays``
stacji) i ``punkty_przylaczenia_rekordow_pol`` (``enm.pola.punkt_przylaczenia_pola`` każdego
rekordu ``bays``). Karta W5-B: pola czytane WYŁĄCZNIE z rekordów ``bays`` (SN i nN; poziom
z napięcia szyny pola) — dawne wpisy ``meta`` stacji nie istnieją.

Sekcja ``pola`` (karta W5-B/C — lustro frontu ``frontend/src/ui/shared/polaStacji.ts``,
test ``polaStacji.parytet.test.ts``): akcesory ``enm.pola`` na każdym modelu —
``stacje`` (``pola_sn_stacji``/``pola_nn_stacji``: ``ref_id`` pól w kolejności zapisu),
``czy_pole_nn`` (każdy rekord), ``stacja_pola`` (każdy rekord), ``zksn``
(``pola_zksn`` każdego punktu rozgałęzienia) i ``wg_szyny`` (``pola_wg_szyny``: kolejność
OUT < FEEDER < IN < pozostałe, potem ``ref_id``).

Determinizm: sortowane pliki, klucze i szyny; żadnej liczby zmiennoprzecinkowej (wynik nie
zależy od numeryki ani liczby wątków BLAS). Zapis przez ``tests/golden/zapis_fikstur``.

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.szyny_stacji_parytet --write
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from enm.pola import (
    czy_pole_nn,
    pola,
    pola_nn_stacji,
    pola_sn_stacji,
    pola_wg_szyny,
    pola_zksn,
    poziom_pol,
    punkt_przylaczenia_pola,
    stacja_pola,
    zacisk_pola,
)
from enm.pole_transformatorowe import transformatory_stacji
from enm.tor_pola import szyna_glowna_stacji, szyny_stacji

from tests.golden.zapis_fikstur import json_fikstury

FRONTEND = Path(__file__).resolve().parents[3] / "frontend"

#: Katalogi fikstur generowanych z backendu, które front czyta jako modele ENM.
KATALOGI: tuple[str, ...] = (
    "public/test-fixtures",
    "scripts/demo-oze-sc",
    "src/harness-fixtures/generated",
    "src/ui/sld/v2/geometry/__tests__/fixtures",
    "src/ui/sld/v3/canvas/__tests__/fixtures",
    "src/ui/sld/v3/scene/__tests__/fixtures",
)
# Poza listą świadomie: ``src/ui/sld/v3/lv-domain/fixtures/generated`` — projekcje domeny nN
# wyprowadzone przez backend (``eksport_fixtur_projekcji_nn``), bez modelu ENM; front czyta
# tam przynależność gotową (``graph.sub_switchboards[].bus_refs``), nie liczy jej.

#: Plik oczekiwanych zbiorów (względem ``frontend``).
WYJSCIE = "src/ui/shared/__tests__/fixtures/szynyStacjiParytet.json"

KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.szyny_stacji_parytet --write"
)


def _wskaznik(sciezka: tuple[str, ...]) -> str:
    return "".join("/" + s.replace("~", "~0").replace("/", "~1") for s in sciezka)


def _modele(dane: Any, sciezka: tuple[str, ...] = ()) -> list[tuple[str, dict[str, Any]]]:
    """Modele ENM w strukturze JSON (kolejność przejścia: klucze posortowane, listy po indeksie)."""
    wynik: list[tuple[str, dict[str, Any]]] = []
    if isinstance(dane, dict):
        if isinstance(dane.get("substations"), list) and isinstance(dane.get("branches"), list):
            wynik.append((_wskaznik(sciezka), dane))
        for klucz in sorted(dane):
            wynik.extend(_modele(dane[klucz], (*sciezka, str(klucz))))
    elif isinstance(dane, list):
        for indeks, element in enumerate(dane):
            wynik.extend(_modele(element, (*sciezka, str(indeks))))
    return wynik


def _nn(pole: str, z: str, do: str, ref: str) -> dict[str, Any]:
    """Aparat pola nN z automigracji (znacznik gałęzi = źródło idempotencji promocji)."""
    return {
        "ref_id": ref,
        "from_bus_ref": z,
        "to_bus_ref": do,
        "meta": {"nn_field_migrowany_z": pole},
    }


def _pole(ref: str, stacja: str, szyna: str | None, **dane: Any) -> dict[str, Any]:
    """Rekord pola (`bays`) modelu iloczynu — tylko klucze, które czyta reguła szyn stacji."""
    rekord: dict[str, Any] = {"ref_id": ref, "substation_ref": stacja, "bay_role": "OUT"}
    if szyna is not None:
        rekord["bus_ref"] = szyna
    return rekord | dane


#: Model ILOCZYNU CECH (reguła KLASA §2): dane brzegowe, których fikstury z API nie niosą, a
#: w których lustro frontu mogłoby się rozjechać z backendem. Karta W5-B: pola są rekordami
#: `bays` (SN i nN), poziom pola rozstrzyga napięcie szyny `bus_ref`. Cechy:
#:  * zacisk pola SN (`terminal_bus_ref`): zwykły; z białymi znakami; zacisk = szyna pola
#:    (dane zastane); pusty `ref_id`; brak `bus_ref`; pole na szynie bez napięcia (poziom
#:    nieznany = SN); pole bez zacisku;
#:  * aparat pola nN (`equipment_refs` rekordu pola nN): z szyny głównej; ŁAŃCUCH aparatów
#:    podany w odwrotnej kolejności gałęzi (sekcja po odpływie za nią); z OBCEJ szyny, ale
#:    wskazany przez pole tej stacji; wskazany przez pole innej stacji; na zacisku wyłącznika
#:    głównego nN; aparat ze znacznikiem gałęzi, którego ŻADEN rekord pola nie wskazuje
#:    (znacznik nie jest źródłem przynależności);
#:  * podrozdzielnica nN jako osobna ``Substation`` zasilana aparatem pola stacji;
#:  * szyna bez stacji (``Z/wolna``) i pusta szyna w ``bus_refs``;
#:  * stacja bez pól oraz pole nN bez aparatu.
#: Stacja A niesie jednocześnie zaciski pól SN i aparaty pól nN — kombinacja, na której
#: rozjeżdżały się dwie połówki reguły we froncie (karta SZYNY-STACJI-LUSTRO).
MODEL_ILOCZYNU: dict[str, Any] = {
    "buses": [
        {"ref_id": "A/sn", "voltage_kv": 15.0},
        {"ref_id": "A/nn", "voltage_kv": 0.4},
        {"ref_id": "A/sekcja", "voltage_kv": 0.4},
        {"ref_id": "A/bez-napiecia", "voltage_kv": None},
        {"ref_id": "B/board", "voltage_kv": 0.4},
        {"ref_id": "D/sn", "voltage_kv": 15.0},
        {"ref_id": "D/nn", "voltage_kv": 0.4},
    ],
    "substations": [
        {"ref_id": "A/stacja", "station_type": "mv_lv", "bus_refs": ["A/sn", "A/nn", "  "]},
        {
            "ref_id": "B/podrozdzielnica",
            "station_type": "rozdzielnica_nn",
            "bus_refs": ["B/board"],
        },
        {
            "ref_id": "C/stacja-bez-pol",
            "station_type": "mv_lv",
            "bus_refs": ["C/sn"],
            "transformer_refs": ["T/deklarowany-w-C"],
        },
        {
            "ref_id": "D/stacja-bez-aparatow",
            "station_type": "mv_lv",
            "bus_refs": ["D/sn", "D/nn"],
        },
    ],
    "bays": [
        _pole("A/pole-in", "A/stacja", "A/sn", terminal_bus_ref="A/zacisk-in"),
        _pole("A/pole-out", "A/stacja", "A/sn", terminal_bus_ref="A/zacisk-out"),
        _pole("A/pole-oze", "A/stacja", "A/sn", terminal_bus_ref="A/zacisk-oze"),
        _pole("A/pole-pomiar", "A/stacja", "A/sn", terminal_bus_ref="A/zacisk-pomiar"),
        _pole("A/pole-tr", "A/stacja", "A/sn", terminal_bus_ref=" A/zacisk-tr "),
        _pole("A/pole-stare", "A/stacja", "A/sn", terminal_bus_ref="A/sn"),
        _pole("", "A/stacja", "A/sn", terminal_bus_ref="A/zacisk-bez-refu"),
        _pole("A/pole-bez-szyny", "A/stacja", None, terminal_bus_ref="A/zacisk-bez-szyny"),
        _pole(
            "A/pole-szyna-bez-napiecia",
            "A/stacja",
            "A/bez-napiecia",
            terminal_bus_ref="A/zacisk-szyny-bez-napiecia",
        ),
        _pole("A/pole-bez-zacisku", "A/stacja", "A/sn"),
        _pole("A/nn-main", "A/stacja", "A/nn", equipment_refs=["A/aparat-main"]),
        _pole("A/nn-odp-1", "A/stacja", "A/nn", equipment_refs=["A/aparat-odp-1"]),
        _pole("A/nn-sekcja", "A/stacja", "A/nn", equipment_refs=["A/aparat-sekcja"]),
        _pole("A/nn-odp-2", "A/stacja", "A/sekcja", equipment_refs=["A/aparat-odp-2"]),
        _pole("A/nn-pod", "A/stacja", "A/nn", equipment_refs=["A/aparat-pod"]),
        _pole("A/nn-odp-3", "A/stacja", "A/nn", equipment_refs=["A/aparat-z-obcej-szyny"]),
        _pole("X/nn-pole", "X/stacja", "A/nn", equipment_refs=["X/aparat-obcej-stacji"]),
        _pole("B/odp", "B/podrozdzielnica", "B/board", equipment_refs=["B/aparat-odp"]),
        _pole("D/nn-odp", "D/stacja-bez-aparatow", "D/nn"),
    ],
    "branches": [
        _nn("A/nn-main", "A/zacisk-wg-nn", "A/nn", "A/aparat-main"),
        _nn("A/nn-odp-2", "A/sekcja", "A/odp-2", "A/aparat-odp-2"),
        _nn("A/nn-sekcja", "A/nn", "A/sekcja", "A/aparat-sekcja"),
        _nn("A/nn-odp-1", "A/nn", "A/odp-1", "A/aparat-odp-1"),
        _nn("A/nn-pod", "A/nn", "B/board", "A/aparat-pod"),
        _nn("A/nn-odp-3", "Y/szyna-obca", "A/odp-3", "A/aparat-z-obcej-szyny"),
        _nn("X/nn-pole", "A/nn", "X/obca", "X/aparat-obcej-stacji"),
        _nn("B/odp", "B/board", "B/odp-bus", "B/aparat-odp"),
        _nn("A/nn-sierota", "A/nn", "A/sierota", "A/aparat-sierota"),
        {"ref_id": "kabel", "from_bus_ref": "A/zacisk-in", "to_bus_ref": "Z/wolna", "meta": {}},
    ],
    # Transformatory: {na szynie głównej, na zacisku pola, blokowy przez wskazanie źródła,
    # blokowy przez rolę katalogową, na szynie obcej} × {stacja bez deklaracji (A),
    # stacja z deklaracją wskazującą transformator poza jej szynami (C)}.
    "transformers": [
        {"ref_id": "T/na-szynie-glownej", "hv_bus_ref": "A/sn", "lv_bus_ref": "A/nn", "meta": {}},
        {
            "ref_id": "T/na-zacisku",
            "hv_bus_ref": "A/zacisk-tr",
            "lv_bus_ref": "A/zacisk-wg-nn",
            "meta": {},
        },
        {
            "ref_id": "T/blokowy-wskazany",
            "hv_bus_ref": "A/zacisk-oze",
            "lv_bus_ref": "A/odp-1",
            "meta": {},
        },
        {
            "ref_id": "T/blokowy-rola",
            "hv_bus_ref": "A/zacisk-oze",
            "lv_bus_ref": "A/odp-3",
            "meta": {"catalog_role": "TRANSFORMATOR_BLOKOWY_DER"},
        },
        {"ref_id": "T/obcy", "hv_bus_ref": "X/obca", "lv_bus_ref": "X/obca-nn", "meta": {}},
        {
            "ref_id": "T/deklarowany-w-C",
            "hv_bus_ref": "Z/wolna",
            "lv_bus_ref": "Z/wolna-nn",
            "meta": {},
        },
    ],
    "generators": [{"ref_id": "G/pv", "blocking_transformer_ref": "T/blokowy-wskazany"}],
}


def _iloczyn_pol() -> dict[str, Any]:
    """Model ILOCZYNU CECH sekcji ``pola`` (karta W5-B/C, reguła KLASA §2): {pole stacji SN,
    pole stacji nN, pole ZKSN} × {z własnym zaciskiem, bez zacisku, zacisk = szyna pola} ×
    {rola IN / OUT / OUT+LINIA_ODG / FEEDER+LINIA_ODG / TR / COUPLER / MEASUREMENT / OZE /
    rezerwa (pole bez aparatu)}, plus pole na szynie bez napięcia (poziom nieznany = SN), pole
    stacji spoza modelu (stacja pola = brak), pole stacji GPZ na szynie w paśmie nN (GPZ nigdy
    nie ma pól nN — wyjątek ``czy_pole_nn``; lustro frontu go nie miało, karta W5-C) i
    identyfikatory podane NIE w porządku leksykalnym (kolejność ``wg_szyny`` z rangi roli,
    potem ``ref_id``)."""
    role: list[tuple[str, str, str | None]] = [
        ("in", "IN", "LINIA_IN"),
        ("out", "OUT", "LINIA_OUT"),
        ("odg-out", "OUT", "LINIA_ODG"),
        ("odg", "FEEDER", "LINIA_ODG"),
        ("tr", "TR", "TRANSFORMATOROWE"),
        ("spr", "COUPLER", "SPRZEGLO"),
        ("pom", "MEASUREMENT", "POMIAROWE"),
        ("oze", "OZE", None),
        ("rez", "OUT", None),
    ]
    zaciski: list[tuple[str, str | None]] = [
        ("zacisk", "wlasny"),
        ("bez", None),
        ("rowny", "szyna"),
    ]
    bays: list[dict[str, Any]] = []
    # Kolejność zapisu odwrócona względem leksykalnej — ranking ról musi ją przestawić.
    for poziom, szyna in (("sn", "S/sn"), ("nn", "S/nn")):
        for nazwa, bay_role, field_role in reversed(role):
            for wariant, zacisk in zaciski:
                ref = f"S/{poziom}/{nazwa}/{wariant}"
                rekord: dict[str, Any] = {
                    "ref_id": ref,
                    "substation_ref": "S/stacja",
                    "bus_ref": szyna,
                    "bay_role": bay_role,
                    "equipment_refs": [] if nazwa == "rez" else [f"{ref}/aparat"],
                }
                if field_role is not None:
                    rekord["field_role"] = field_role
                if zacisk == "wlasny":
                    rekord["terminal_bus_ref"] = f"{ref}/zacisk"
                elif zacisk == "szyna":
                    rekord["terminal_bus_ref"] = szyna
                bays.append(rekord)
    for port, bay_role, field_role in (
        ("MAIN_IN", "IN", "LINIA_IN"),
        ("MAIN_OUT", "OUT", "LINIA_OUT"),
        ("BRANCH_2", "OUT", "LINIA_ODG"),
        ("BRANCH_1", "OUT", "LINIA_ODG"),
    ):
        rekord = {
            "ref_id": f"P/zksn/pole/{port}",
            "branch_point_ref": "P/zksn",
            "branch_point_port_id": port,
            "bus_ref": "P/szyna",
            "bay_role": bay_role,
            "field_role": field_role,
        }
        if port == "BRANCH_1":
            rekord["terminal_bus_ref"] = "P/zacisk-odg-1"
        bays.append(rekord)
    bays.append(
        {
            "ref_id": "S/sn/bez-napiecia",
            "substation_ref": "S/stacja",
            "bus_ref": "S/bez-napiecia",
            "bay_role": "OUT",
            "terminal_bus_ref": "S/zacisk-bez-napiecia",
        }
    )
    bays.append(
        {"ref_id": "Q/pole-obcej", "substation_ref": "Q/brak", "bus_ref": "S/sn", "bay_role": "IN"}
    )
    bays.append(
        {"ref_id": "G/gpz/pole", "substation_ref": "G/gpz", "bus_ref": "G/nn", "bay_role": "OUT"}
    )
    return {
        "buses": [
            {"ref_id": "S/sn", "voltage_kv": 15.0},
            {"ref_id": "S/nn", "voltage_kv": 0.4},
            {"ref_id": "S/bez-napiecia", "voltage_kv": None},
            {"ref_id": "P/szyna", "voltage_kv": 15.0},
            {"ref_id": "G/nn", "voltage_kv": 0.4},
        ],
        "substations": [
            {"ref_id": "S/stacja", "station_type": "mv_lv", "bus_refs": ["S/sn", "S/nn"]},
            {"ref_id": "S/pusta", "station_type": "mv_lv", "bus_refs": []},
            {"ref_id": "G/gpz", "station_type": "gpz", "bus_refs": ["G/nn"]},
        ],
        "branch_points": [{"ref_id": "P/zksn", "branch_point_type": "zksn", "bus_ref": "P/szyna"}],
        "bays": bays,
        "branches": [],
    }


#: Model iloczynu cech sekcji ``pola`` (osobny od modelu szyn stacji — inne cechy).
MODEL_ILOCZYNU_POL: dict[str, Any] = _iloczyn_pol()


def _pola_modelu(model: dict[str, Any], stacje: list[dict[str, Any]]) -> dict[str, Any]:
    """Odpowiedzi akcesorów ``enm.pola`` dla jednego modelu (sekcja ``pola``, karta W5-B/C).

    Rekordy z pustym albo nienapisowym ``ref_id`` pomijamy w mapach po identyfikatorze (klucz
    mapy nie byłby jednoznaczny); w listach ``stacje``/``zksn``/``wg_szyny`` występują tak,
    jak zwraca je backend."""
    poziom = poziom_pol(model)
    rekordy = [r for r in pola(model) if isinstance(r.get("ref_id"), str) and r["ref_id"].strip()]
    punkty = sorted(
        str(p["ref_id"])
        for p in model.get("branch_points") or []
        if isinstance(p, dict) and isinstance(p.get("ref_id"), str)
    )

    def _stacja_pola(ref: str) -> str | None:
        stacja = stacja_pola(model, ref)
        return str(stacja["ref_id"]) if stacja is not None else None

    return {
        "czy_pole_nn": {str(r["ref_id"]): czy_pole_nn(model, r, poziom) for r in rekordy},
        "stacja_pola": {str(r["ref_id"]): _stacja_pola(str(r["ref_id"])) for r in rekordy},
        "stacje": {
            str(s["ref_id"]): {
                "nn": [str(r.get("ref_id")) for r in pola_nn_stacji(model, s["ref_id"])],
                "sn": [str(r.get("ref_id")) for r in pola_sn_stacji(model, s["ref_id"])],
            }
            for s in stacje
        },
        "wg_szyny": {
            szyna: [str(r.get("ref_id")) for r in lista]
            for szyna, lista in sorted(pola_wg_szyny(model).items())
        },
        "zksn": {ref: [str(r.get("ref_id")) for r in pola_zksn(model, ref)] for ref in punkty},
    }


def _oczekiwane_modelu(model: dict[str, Any], *, szyny_obce: bool = False) -> dict[str, Any] | None:
    """Wszystkie odpowiedzi backendu z klasy „stacja i jej szyny” dla jednego modelu ENM."""
    galezie = model.get("branches") or []
    stacje = [
        s
        for s in model.get("substations") or []
        if isinstance(s, dict) and isinstance(s.get("ref_id"), str)
    ]
    if not stacje:
        return None
    konce = sorted(
        {
            str(g[k])
            for g in galezie
            if isinstance(g, dict)
            for k in ("from_bus_ref", "to_bus_ref")
            if isinstance(g.get(k), str)
        }
    )
    szyny: dict[str, Any] = {}
    glowne: dict[str, Any] = {}
    transformatory: dict[str, Any] = {}
    for stacja in stacje:
        ref = str(stacja["ref_id"])
        nalezace = szyny_stacji(model, stacja)
        szyny[ref] = sorted(nalezace)
        # Szyna główna: każda szyna stacji; w modelu iloczynu także każdy koniec gałęzi modelu
        # (szyny obce — `null`). Na fiksturach szyny obce pomijamy (rozmiar pliku ×20, a cechę
        # pokrywa model iloczynu).
        pytane = nalezace | set(konce) if szyny_obce else nalezace
        glowne[ref] = {szyna: szyna_glowna_stacji(model, stacja, szyna) for szyna in sorted(pytane)}
        transformatory[ref] = sorted(
            str(t.get("ref_id")) for t in transformatory_stacji(model, stacja)
        )
    refy_stacji = {str(s["ref_id"]) for s in stacje}
    zaciski_pol = {
        str(bay["ref_id"]): zacisk_pola(bay)
        for bay in model.get("bays") or []
        if isinstance(bay, dict)
        and isinstance(bay.get("ref_id"), str)
        and bay["ref_id"].strip()
        and bay.get("substation_ref") in refy_stacji
    }
    rekordy_pol = {
        str(bay["ref_id"]): punkt_przylaczenia_pola(bay)
        for bay in model.get("bays") or []
        if isinstance(bay, dict) and isinstance(bay.get("ref_id"), str)
    }
    return {
        "pola": _pola_modelu(model, stacje),
        "punkty_przylaczenia_rekordow_pol": rekordy_pol,
        "szyny": szyny,
        "szyny_glowne": glowne,
        "transformatory": transformatory,
        "zaciski_pol": zaciski_pol,
    }


def oczekiwane_szyny_stacji() -> dict[str, Any]:
    """Plik → wskaźnik modelu → ``ref_id`` stacji → posortowane szyny wg ``szyny_stacji``;
    plus model iloczynu cech z oczekiwanymi zbiorami."""
    pliki: dict[str, Any] = {}
    for katalog in KATALOGI:
        for plik in sorted((FRONTEND / katalog).glob("*.json")):
            modele: dict[str, Any] = {}
            for wskaznik, model in _modele(json.loads(plik.read_text(encoding="utf-8"))):
                oczekiwane = _oczekiwane_modelu(model)
                if oczekiwane is not None:
                    modele[wskaznik] = oczekiwane
            if modele:
                pliki[str(plik.relative_to(FRONTEND))] = modele
    return {
        "iloczyn": {
            "model": MODEL_ILOCZYNU,
            **(_oczekiwane_modelu(MODEL_ILOCZYNU, szyny_obce=True) or {}),
        },
        "iloczyn_pol": {
            "model": MODEL_ILOCZYNU_POL,
            **(_oczekiwane_modelu(MODEL_ILOCZYNU_POL) or {}),
        },
        "pliki": pliki,
    }


def render_parytetu() -> str:
    return json_fikstury(oczekiwane_szyny_stacji())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="zapisz plik parytetu")
    args = parser.parse_args(argv)
    tresc = render_parytetu()
    plik = FRONTEND / WYJSCIE
    if args.write:
        plik.parent.mkdir(parents=True, exist_ok=True)
        plik.write_text(tresc, encoding="utf-8")
        return 0
    if not plik.exists() or plik.read_text(encoding="utf-8") != tresc:
        print(f"{WYJSCIE} ROZJECHANY z generatorem — {KOMENDA_REGENERACJI}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
