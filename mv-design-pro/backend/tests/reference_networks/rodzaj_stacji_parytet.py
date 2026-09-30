"""Oczekiwany rodzaj KAŻDEJ stacji KAŻDEGO modelu ENM z fikstur generowanych (karta
ETYKIETA-STACJI-PRZELOTOWEJ).

Po co: rodzaj stacji ma w produkcie jedną regułę — `enm.rodzaj_stacji` (SLD_CAD_SPEC_V3 §19.3,
V12K-034). Frontend pracuje na migawce ENM (adapter schematu, drzewo projektu, karty,
wyszukiwarka, inspektor, konfigurator, kreator), bez pola wyprowadzonego przez backend, więc ma
jedno lustro reguły (``frontend/src/ui/shared/rodzajStacji.ts``). Parytet lustra jest PRZYPIĘTY:
ten generator liczy rodzaj każdej stacji funkcją backendu na każdym modelu ENM z fikstur
generowanych oraz na modelu iloczynu cech, a test vitest ``rodzajStacji.parytet.test.ts``
porównuje lustro z tym plikiem stacja po stacji.

Wejście: te same katalogi fikstur, co parytet szyn stacji (``szyny_stacji_parytet.KATALOGI``),
każdy z własnym generatorem i testem świeżości. Determinizm: sortowane pliki i klucze, liczby
całkowite. Zapis przez ``tests/golden/zapis_fikstur``.

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.rodzaj_stacji_parytet --write
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from enm.rodzaj_stacji import RodzajStacji, rodzaj_ze_skladu_pol, rodzaje_stacji

from tests.golden.zapis_fikstur import json_fikstury
from tests.reference_networks.szyny_stacji_parytet import FRONTEND, KATALOGI, _modele

#: Plik oczekiwań (względem ``frontend``).
WYJSCIE = "src/ui/shared/__tests__/fixtures/rodzajStacjiParytet.json"

KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.rodzaj_stacji_parytet --write"
)


def _pole(
    ref: str, *, bay_role: str | None = None, field_role: str | None = None
) -> dict[str, Any]:
    spec: dict[str, Any] = {"field_ref": ref, "bus_ref": f"{ref.split('/')[0]}/sn"}
    if bay_role is not None:
        spec["bay_role"] = bay_role
    if field_role is not None:
        spec["meta"] = {"field_role": field_role}
    return spec


def _stacja(ref: str, station_type: str | None, pola: list[dict[str, Any]]) -> dict[str, Any]:
    stacja: dict[str, Any] = {
        "ref_id": ref,
        "name": f"Stacja {ref}",
        "bus_refs": [f"{ref}/sn"],
        "meta": {"field_specs": pola},
    }
    if station_type is not None:
        stacja["station_type"] = station_type
    return stacja


def _kabel(ref: str, z: str, do: str, typ: str = "cable") -> dict[str, Any]:
    return {"ref_id": ref, "type": typ, "from_bus_ref": z, "to_bus_ref": do}


#: Model ILOCZYNU CECH (reguła KLASA §2) — cechy, w których lustro frontu mogłoby się
#: rozjechać z backendem, a których fikstury z API nie niosą w każdej kombinacji:
#:  * źródło roli pola: `meta.field_role` (kanoniczna PL, katalogowa EN, alias modelu),
#:    sam `bay_role`, `meta.field_role` nierozpoznana z poprawnym `bay_role`, rola
#:    nierozpoznana w obu, wielkość liter i białe znaki;
#:  * liczba pól liniowych 0–4 × sprzęgło (tak/nie) × połączone wyprowadzenia 0–2 (kabel do
#:    stacji, linia napowietrzna przez punkt rozgałęźny, kabel wiszący, odcinek z powrotem do
#:    własnej szyny, łącznik między szynami bez stacji);
#:  * pola z elementów `bays` (stacja bez specyfikacji pól, identyfikator `id` zamiast `ref_id`);
#:  * deklaracja: każdy rodzaj topologiczny, `mv_lv`, `customer`, brak, GPZ i rozdzielnica nN
#:    (rodzaj nie dotyczy).
MODEL_ILOCZYNU: dict[str, Any] = {
    "substations": [
        {"ref_id": "G", "name": "GPZ", "station_type": "gpz", "bus_refs": ["G/sn"], "meta": {}},
        # 2 pola liniowe, oba połączone (z GPZ i do P2) — przelotowa, deklaracja zgodna.
        _stacja(
            "P1",
            "inline",
            [
                _pole("P1/in", bay_role="IN", field_role="LINIA_IN"),
                _pole("P1/out", bay_role="OUT", field_role="line_out"),
                _pole("P1/tr", bay_role="TR", field_role=" TRANSFORMER "),
            ],
        ),
        # 2 pola liniowe (sam bay_role), drugi kabel wisi — końcowa, deklaracja przelotowa.
        _stacja(
            "P2",
            "inline",
            [
                _pole("P2/in", bay_role="IN"),
                _pole("P2/out", bay_role="OUT"),
                _pole("P2/tr", bay_role="TR"),
            ],
        ),
        # 3 pola liniowe (odgałęźne jako `FEEDER` i rola katalogowa) — odgałęźna, deklaracja
        # przelotowa (sytuacja kadru karty).
        _stacja(
            "O1",
            "inline",
            [
                _pole("O1/in", bay_role="IN"),
                _pole("O1/out", bay_role="OUT"),
                _pole("O1/odg", bay_role="FEEDER", field_role="LINIA_ODG"),
                _pole("O1/tr", bay_role="TR"),
            ],
        ),
        # 4 pola liniowe — odgałęźna, deklaracja zgodna.
        _stacja(
            "O2",
            "branch",
            [
                _pole("O2/in", field_role="IN"),
                _pole("O2/out", field_role="OUT"),
                _pole("O2/odg1", field_role="LINE_BRANCH"),
                _pole("O2/odg2", bay_role="feeder"),
            ],
        ),
        # Sprzęgło przy 2 polach liniowych — sekcyjna, deklaracja zgodna.
        _stacja(
            "S1",
            "sectional",
            [
                _pole("S1/in", bay_role="IN"),
                _pole("S1/sp", bay_role="COUPLER", field_role="SPRZEGLO"),
                _pole("S1/out", bay_role="OUT"),
            ],
        ),
        # Sprzęgło przy 1 polu liniowym — sekcyjna, deklaracja końcowa.
        _stacja(
            "S2",
            "terminal",
            [_pole("S2/in", bay_role="IN"), _pole("S2/sp", field_role="COUPLER")],
        ),
        # 1 pole liniowe + pole źródłowe PV (rola, która dawniej stawała się odgałęźnym) i
        # pomiar — końcowa, deklaracja zgodna.
        _stacja(
            "K1",
            "terminal",
            [
                _pole("K1/in", bay_role="IN"),
                _pole("K1/pv", bay_role="OZE", field_role="PV_SN"),
                _pole("K1/pomiar", field_role="POMIAROWE"),
                _pole("K1/bess", field_role="bess"),
            ],
        ),
        # Pole z rolą nierozpoznaną w `meta.field_role`, ale poprawnym `bay_role` (liczy się
        # jako liniowe) i pole z rolą nierozpoznaną w obu (nie liczy się) — 2 pola liniowe,
        # połączone przez linię napowietrzną i punkt rozgałęźny — przelotowa; deklaracja
        # funkcji SN/nN (bez rodzaju).
        _stacja(
            "N1",
            "mv_lv",
            [
                _pole("N1/in", bay_role="IN", field_role="COS_INNEGO"),
                _pole("N1/x", bay_role="XYZ", field_role="XYZ"),
                _pole("N1/out", bay_role="OUT"),
            ],
        ),
        # Cztery pola z rolą modelu `FEEDER`: trzy NIE są liniowe (rodzaj pola katalogowego:
        # potrzeb własnych, rezerwowe w `meta` z inną wielkością liter, odgromnikowe), jedno jest
        # (rodzaj „liniowe_odplywowe") — 3 pola liniowe z WE i WY (dawniej 6) ⇒ odgałęźna,
        # deklaracja przelotowa niezgodna.
        _stacja(
            "A1",
            "inline",
            [
                _pole("A1/in", bay_role="IN"),
                _pole("A1/out", bay_role="OUT"),
                {**_pole("A1/pw", bay_role="FEEDER"), "bay_kind": "potrzeb_wlasnych"},
                {**_pole("A1/rez", bay_role="FEEDER"), "meta": {"bay_kind": "Rezerwowe"}},
                {**_pole("A1/odgr", bay_role="FEEDER"), "bay_kind": "odgromnikowe"},
                {**_pole("A1/odg", bay_role="FEEDER"), "bay_kind": "liniowe_odplywowe"},
            ],
        ),
        # Bez pól liniowych, deklaracja odbiorcza — końcowa (rodzaj wyprowadzony, deklaracja
        # nie jest rodzajem topologicznym).
        _stacja("C1", "customer", [_pole("C1/tr", bay_role="TR")]),
        # Brak deklaracji, bez specyfikacji pól — pola z elementów `bays` (także przez `id`).
        {"ref_id": "L1", "id": "L1-id", "name": "Stacja L1", "bus_refs": ["L1/sn"]},
        # 2 pola liniowe, kable: pętla wracająca do własnej szyny i kabel wiszący — żaden nie
        # prowadzi do innej stacji — końcowa, deklaracja przelotowa.
        _stacja(
            "W1",
            "inline",
            [_pole("W1/in", bay_role="IN"), _pole("W1/out", bay_role="OUT")],
        ),
        {
            "ref_id": "R",
            "name": "Rozdzielnica nN",
            "station_type": "rozdzielnica_nn",
            "bus_refs": ["R/nn"],
        },
    ],
    "bays": [
        {"ref_id": "L1/b-in", "substation_ref": "L1", "bay_role": "IN"},
        {"ref_id": "L1/b-out", "substation_ref": "L1-id", "bay_role": "OUT"},
        {"ref_id": "L1/b-odg", "substation_ref": "L1", "bay_role": "FEEDER"},
        {"ref_id": "X/b", "substation_ref": "X", "bay_role": "IN"},
    ],
    "branches": [
        _kabel("k/G-P1", "G/sn", "P1/sn"),
        _kabel("k/P1-P2", "P1/sn", "P2/sn"),
        _kabel("k/P2-ogon", "P2/sn", "wolna/koniec"),
        _kabel("k/G-O1", "G/sn", "O1/sn"),
        _kabel("k/O1-S1", "O1/sn", "S1/sn"),
        _kabel("k/S1-N1", "S1/sn", "N1/sn"),
        _kabel("l/N1-bp", "N1/sn", "bp/szyna", "line_overhead"),
        {
            "ref_id": "lacznik/bp",
            "type": "switch",
            "from_bus_ref": "bp/szyna",
            "to_bus_ref": "bp/odg",
        },
        _kabel("l/bp-K1", "bp/odg", "K1/sn", "line_overhead"),
        _kabel("k/W1-petla", "W1/sn", "W1/petla"),
        _kabel("k/W1-petla-powrot", "W1/petla", "W1/sn"),
        _kabel("k/W1-wolny", "W1/sn", "W1/wolny"),
        _kabel("k/L1-G", "L1/sn", "G/sn"),
        _kabel("k/G-A1", "G/sn", "A1/sn"),
        _kabel("k/A1-P1", "A1/sn", "P1/sn"),
    ],
}

#: Skład pól stacji jeszcze nieosadzonej (szablon, kreator) × połączone wyprowadzenia —
#: `rodzaj_ze_skladu_pol`, z którego czyta kreator stacji.
SKLADY: tuple[tuple[tuple[str, ...], int], ...] = (
    ((), 0),
    (("LINIA_IN", "TRANSFORMATOROWE"), 1),
    (("LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"), 1),
    (("LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"), 2),
    (("IN", "OUT", "FEEDER", "TR"), 2),
    (("LINIA_IN", "LINIA_OUT", "SPRZEGLO", "TRANSFORMATOROWE"), 2),
    (("LINIA_IN", "POMIAROWE", "PV_SN", "BESS_SN"), 1),
    (("LINIA_IN", "COS_INNEGO", "LINIA_OUT"), 2),
    (("IN", "OUT", "TR", "TR", "potrzeb_wlasnych"), 2),
    (("IN", "OUT", "REZERWOWE", "odgromnikowe"), 2),
)


def _rekord(rodzaj: RodzajStacji) -> dict[str, Any]:
    return {
        "rodzaj": rodzaj.rodzaj,
        "pola_liniowe": rodzaj.pola_liniowe,
        "sprzeglo": rodzaj.sprzeglo,
        "wyprowadzenia_polaczone": rodzaj.wyprowadzenia_polaczone,
        "deklaracja": rodzaj.deklaracja,
        "zgodny_z_deklaracja": rodzaj.zgodny_z_deklaracja,
        "pola_nierozpoznane": [p.field_ref for p in rodzaj.pola_nierozpoznane],
        "przyczyna_pl": rodzaj.przyczyna_pl,
    }


def oczekiwane_rodzaje_stacji() -> dict[str, Any]:
    """Plik → wskaźnik modelu → ``ref_id`` stacji → rodzaj z ``rodzaje_stacji``; plus model
    iloczynu cech i składy pól."""
    pliki: dict[str, Any] = {}
    for katalog in KATALOGI:
        for plik in sorted((FRONTEND / katalog).glob("*.json")):
            modele: dict[str, Any] = {}
            for wskaznik, model in _modele(json.loads(plik.read_text(encoding="utf-8"))):
                stacje = {ref: _rekord(r) for ref, r in rodzaje_stacji(model).items()}
                if stacje:
                    modele[wskaznik] = stacje
            if modele:
                pliki[str(plik.relative_to(FRONTEND))] = modele
    return {
        "iloczyn": {
            "model": MODEL_ILOCZYNU,
            "stacje": {ref: _rekord(r) for ref, r in rodzaje_stacji(MODEL_ILOCZYNU).items()},
        },
        "sklady": [
            {
                "role": list(role),
                "polaczone_wyprowadzenia": polaczone,
                "rodzaj": rodzaj_ze_skladu_pol(role, polaczone_wyprowadzenia=polaczone),
            }
            for role, polaczone in SKLADY
        ],
        "pliki": pliki,
    }


def render_parytetu() -> str:
    return json_fikstury(oczekiwane_rodzaje_stacji())


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
