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
transformatory_stacji``), ``zaciski_pol`` (``enm.zajetosc_pol.zacisk_pola`` każdej specyfikacji
pola) i ``punkty_przylaczenia_rekordow_pol`` (``application.field_read_model.
punkt_przylaczenia_pola`` każdego rekordu ``bays``).

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
from types import SimpleNamespace
from typing import Any

from application.field_read_model import punkt_przylaczenia_pola
from enm.pole_transformatorowe import transformatory_stacji
from enm.tor_pola import szyna_glowna_stacji, szyny_stacji
from enm.zajetosc_pol import zacisk_pola

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
    return {
        "ref_id": ref,
        "from_bus_ref": z,
        "to_bus_ref": do,
        "meta": {"nn_field_migrowany_z": pole},
    }


#: Model ILOCZYNU CECH (reguła KLASA §2): dane brzegowe, których fikstury z API nie niosą, a
#: w których lustro frontu mogłoby się rozjechać z backendem. Cechy:
#:  * zacisk pola SN: każdy z czterech kluczy zacisku; zacisk = szyna pola (dane zastane);
#:    pusty ``field_ref``; brak ``bus_ref``; zacisk z białymi znakami;
#:  * aparat pola nN: z szyny głównej; ŁAŃCUCH aparatów podany w odwrotnej kolejności
#:    gałęzi (sekcja po odpływie za nią); z OBCEJ szyny, ale z deklaracją pola tej stacji;
#:    z deklaracją pola innej stacji; na zacisku wyłącznika głównego nN;
#:  * podrozdzielnica nN jako osobna ``Substation`` zasilana aparatem pola stacji;
#:  * szyna bez stacji (``Z/wolna``) i pusta szyna w ``bus_refs``;
#:  * stacja bez ``meta`` oraz ``nn_field_specs`` bez gałęzi.
#: Stacja A niesie jednocześnie zaciski pól SN i aparaty pól nN — kombinacja, na której
#: rozjeżdżały się dwie połówki reguły we froncie (karta SZYNY-STACJI-LUSTRO).
MODEL_ILOCZYNU: dict[str, Any] = {
    "substations": [
        {
            "ref_id": "A/stacja",
            "station_type": "mv_lv",
            "bus_refs": ["A/sn", "A/nn", "  "],
            "meta": {
                "field_specs": [
                    {
                        "field_ref": "A/pole-in",
                        "bus_ref": "A/sn",
                        "meta": {"terminal_bus_ref": "A/zacisk-in"},
                    },
                    {
                        "field_ref": "A/pole-out",
                        "bus_ref": "A/sn",
                        "meta": {"field_terminal_bus_ref": "A/zacisk-out"},
                    },
                    {
                        "field_ref": "A/pole-oze",
                        "bus_ref": "A/sn",
                        "field_terminal_bus_ref": "A/zacisk-oze",
                    },
                    {
                        "field_ref": "A/pole-pomiar",
                        "bus_ref": "A/sn",
                        "terminal_bus_ref": "A/zacisk-pomiar",
                    },
                    {
                        "field_ref": "A/pole-tr",
                        "bus_ref": "A/sn",
                        "meta": {"field_terminal_bus_ref": " A/zacisk-tr "},
                    },
                    {
                        "field_ref": "A/pole-stare",
                        "bus_ref": "A/sn",
                        "meta": {"terminal_bus_ref": "A/sn"},
                    },
                    {
                        "field_ref": "",
                        "bus_ref": "A/sn",
                        "meta": {"terminal_bus_ref": "A/zacisk-bez-refu"},
                    },
                    {
                        "field_ref": "A/pole-bez-szyny",
                        "meta": {"terminal_bus_ref": "A/zacisk-bez-szyny"},
                    },
                ],
                "nn_field_specs": [
                    {"field_ref": "A/nn-main"},
                    {"field_ref": "A/nn-odp-1"},
                    {"field_ref": "A/nn-sekcja"},
                    {"field_ref": "A/nn-odp-2"},
                    {"field_ref": "A/nn-pod"},
                    {"field_ref": "A/nn-odp-3"},
                ],
            },
        },
        {
            "ref_id": "B/podrozdzielnica",
            "station_type": "rozdzielnica_nn",
            "bus_refs": ["B/board"],
            "meta": {"nn_field_specs": [{"field_ref": "B/odp"}]},
        },
        {
            "ref_id": "C/stacja-bez-meta",
            "station_type": "mv_lv",
            "bus_refs": ["C/sn"],
            "transformer_refs": ["T/deklarowany-w-C"],
        },
        {
            "ref_id": "D/stacja-bez-aparatow",
            "station_type": "mv_lv",
            "bus_refs": ["D/sn", "D/nn"],
            "meta": {"field_specs": "nie-lista", "nn_field_specs": [{"field_ref": "D/nn-odp"}]},
        },
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
    # Rekordy pól (`bays`): {zacisk w meta rekordu / w szablonie / w obu, różne / brak}.
    "bays": [
        {
            "ref_id": "B/pole-meta",
            "substation_ref": "A/stacja",
            "bus_ref": "A/sn",
            "meta": {"field_terminal_bus_ref": "A/zacisk-z-meta"},
        },
        {
            "ref_id": "B/pole-szablon",
            "substation_ref": "A/stacja",
            "bus_ref": "A/sn",
            "meta": {"sn_field_template": {"meta": {"terminal_bus_ref": "A/zacisk-z-szablonu"}}},
        },
        {
            "ref_id": "B/pole-szablon-gorny-klucz",
            "substation_ref": "A/stacja",
            "bus_ref": "A/sn",
            "meta": {"sn_field_template": {"field_terminal_bus_ref": "A/zacisk-szablon-gorny"}},
        },
        {
            "ref_id": "B/pole-oba",
            "substation_ref": "A/stacja",
            "bus_ref": "A/sn",
            "meta": {
                "terminal_bus_ref": "A/zacisk-meta-wygrywa",
                "sn_field_template": {"meta": {"field_terminal_bus_ref": "A/zacisk-przegrywa"}},
            },
        },
        {
            "ref_id": "B/pole-bez-zacisku",
            "substation_ref": "A/stacja",
            "bus_ref": "A/sn",
            "meta": {},
        },
    ],
}


def _punkt_przylaczenia_rekordu(bay: dict[str, Any]) -> str:
    """Backend `application.field_read_model.punkt_przylaczenia_pola` na rekordzie `bays`."""
    return str(
        punkt_przylaczenia_pola(
            SimpleNamespace(meta=bay.get("meta") or {}, bus_ref=bay.get("bus_ref"))  # type: ignore[arg-type]
        )
    )


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
        nalezace = szyny_stacji(stacja, galezie)
        szyny[ref] = sorted(nalezace)
        # Szyna główna: każda szyna stacji; w modelu iloczynu także każdy koniec gałęzi modelu
        # (szyny obce — `null`). Na fiksturach szyny obce pomijamy (rozmiar pliku ×20, a cechę
        # pokrywa model iloczynu).
        pytane = nalezace | set(konce) if szyny_obce else nalezace
        glowne[ref] = {
            szyna: szyna_glowna_stacji(stacja, galezie, szyna) for szyna in sorted(pytane)
        }
        transformatory[ref] = sorted(
            str(t.get("ref_id"))
            for t in transformatory_stacji(
                stacja, model.get("transformers") or [], galezie, model.get("generators") or []
            )
        )
    zaciski_pol = {
        str(spec["field_ref"]): zacisk_pola(spec)
        for stacja in stacje
        for spec in (stacja.get("meta") or {}).get("field_specs") or []
        if isinstance(spec, dict)
        and isinstance(spec.get("field_ref"), str)
        and spec["field_ref"].strip()
    }
    rekordy_pol = {
        str(bay["ref_id"]): _punkt_przylaczenia_rekordu(bay)
        for bay in model.get("bays") or []
        if isinstance(bay, dict) and isinstance(bay.get("ref_id"), str)
    }
    return {
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
