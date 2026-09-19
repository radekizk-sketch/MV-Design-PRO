#!/usr/bin/env python3
"""Parytet pol kontraktu katalogu na granicy backend -> front.

PO CO (karta KATALOG-NIEZMIENNIKI §5 p.2, 2026-09-17). Karta S-2 wykryla, ze
`fetchConverterTypes()` w `ui/catalog/api.ts` po cichu GUBILO `k_sc` — pole, bez
ktorego wynik zwarciowy opiera sie na domyslce i przestaje byc miarodajny dla
doboru aparatury. Dopisanie jednego pola naprawiloby INSTANCJE; pomiar
2026-09-17 pokazal dwanascie dalszych pol gubionych ta sama droga
(`control_mode`, `grid_code`, `dynamic_profile_id`, piec pol PTPiREE, trzy pola
statusu katalogu). Reczne mapowanie z lista pol ZAWSZE odjedzie od kontraktu —
bo lista jest pisana raz, a kontrakt rosnie.

CO PILNUJE TEN GUARD. Kazde pole zadeklarowane w typie FE `ConverterType`, ktore
rekord backendu potrafi podac, MUSI byc przypisane w obu mapowaniach
(`pvConverters`, `bessConverters`). Pole swiadomie nienoszone ma tu NAZWANY
powod — milczenie nie jest uzasadnieniem.

CZEGO NIE UDAJE. To nie jest generowanie typow z OpenAPI: koncowki katalogu
zwracaja `list[dict[str, Any]]`, wiec OpenAPI nie niesie dla nich schematu pol.
Zrodlem prawdy jest tu KONTRAKT DATACLASS backendu (`catalog/types.py`) i
deklaracja typu FE — oba czytane AST-owo/tekstowo, zadnej trzeciej listy.

SCAN: `frontend/src/ui/catalog/api.ts` · `frontend/src/ui/catalog/types.ts`
      · `backend/src/network_model/catalog/types.py`

Uruchomienie (z katalogu `mv-design-pro`):
    python scripts/katalog_parytet_pol_guard.py

EXIT CODES:
  0 = kazde pole kontraktu jest niesione albo ma nazwany powod
  1 = pole kontraktu gubione po cichu
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_TS = ROOT / "frontend" / "src" / "ui" / "catalog" / "api.ts"
TYPES_TS = ROOT / "frontend" / "src" / "ui" / "catalog" / "types.ts"
TYPES_PY = ROOT / "backend" / "src" / "network_model" / "catalog" / "types.py"

#: Mapowanie FE -> (nazwa literalu w `api.ts`, klasa backendu w `types.py`).
MAPOWANIA: dict[str, tuple[str, str]] = {
    "PV": ("pvConverters", "PVInverterType"),
    "BESS": ("bessConverters", "BESSInverterType"),
}

#: Pola typu FE `ConverterType` SWIADOMIE nienoszone przez dane mapowanie, z
#: powodem. Zapadka tylko w dol: nowe pole trafia tu wylacznie z uzasadnieniem
#: merytorycznym, nigdy „bo tak wyszlo".
NIENOSZONE: dict[str, dict[str, str]] = {
    "PV": {
        "e_kwh": "przeksztaltnik PV nie ma magazynu — pole nalezy wylacznie do BESS",
        "model": "kontrakt `PVInverterType` nie niesie pola `model` (ma je `ConverterType`)",
        "qmin_mvar": "kontrakt PV opisuje zdolnosc bierna przez cosfi, nie przez Q",
        "qmax_mvar": "jak `qmin_mvar`",
    },
    "BESS": {
        "cosphi_min": "kontrakt `BESSInverterType` nie niesie granic cosfi",
        "cosphi_max": "jak `cosphi_min`",
        "control_mode": "kontrakt `BESSInverterType` nie niesie trybu sterowania",
        "grid_code": "kontrakt `BESSInverterType` nie niesie wymagan przylaczeniowych",
        "model": "kontrakt `BESSInverterType` nie niesie pola `model`",
        "qmin_mvar": "kontrakt BESS nie niesie granic mocy biernej",
        "qmax_mvar": "jak `qmin_mvar`",
    },
}

#: Pola typu FE wyliczane, a nie przepisywane — sprawdzamy ich OBECNOSC w
#: mapowaniu, ale nie oczekujemy pola o tej nazwie po stronie backendu.
WYLICZANE: frozenset[str] = frozenset({"kind", "un_kv", "sn_mva", "pmax_mw"})


def pola_typu_fe(nazwa: str) -> list[str]:
    """Pola interfejsu TypeScript (wraz z odziedziczonymi z `CatalogType`)."""
    tresc = TYPES_TS.read_text(encoding="utf-8")
    pola: list[str] = []
    for interfejs in (nazwa, "CatalogType"):
        wzorzec = re.compile(rf"export interface {re.escape(interfejs)}[^{{]*\{{(.*?)\n\}}", re.S)
        dopasowanie = wzorzec.search(tresc)
        if dopasowanie is None:
            raise SystemExit(f"Nie znaleziono interfejsu {interfejs} w {TYPES_TS}")
        for linia in dopasowanie.group(1).splitlines():
            pole = re.match(r"\s*([a-z_][a-z0-9_]*)\??\s*:", linia, re.I)
            if pole:
                pola.append(pole.group(1))
    return sorted(set(pola))


def pola_literalu(nazwa_literalu: str) -> set[str]:
    """Klucze przypisane w obiekcie zwracanym przez dane mapowanie `api.ts`."""
    tresc = API_TS.read_text(encoding="utf-8")
    wzorzec = re.compile(
        rf"const {re.escape(nazwa_literalu)}[^=]*=.*?return \[\{{(.*?)\n    \}}\];", re.S
    )
    dopasowanie = wzorzec.search(tresc)
    if dopasowanie is None:
        raise SystemExit(f"Nie znaleziono mapowania `{nazwa_literalu}` w {API_TS}")
    return {
        m.group(1)
        for m in re.finditer(r"^\s{6}([a-z_][a-z0-9_]*)\s*:", dopasowanie.group(1), re.M | re.I)
    }


def pola_klasy_backendu(nazwa: str) -> set[str]:
    drzewo = ast.parse(TYPES_PY.read_text(encoding="utf-8"))
    for wezel in drzewo.body:
        if isinstance(wezel, ast.ClassDef) and wezel.name == nazwa:
            return {
                s.target.id
                for s in wezel.body
                if isinstance(s, ast.AnnAssign) and isinstance(s.target, ast.Name)
            }
    raise SystemExit(f"Nie znaleziono klasy {nazwa} w {TYPES_PY}")


def zbadaj() -> list[str]:
    naruszenia: list[str] = []
    pola_docelowe = pola_typu_fe("ConverterType")
    if not pola_docelowe:
        return ["PUSTY SKAN: typ FE `ConverterType` nie ma pol"]
    for rodzaj, (literal, klasa_backendu) in sorted(MAPOWANIA.items()):
        niesione = pola_literalu(literal)
        if not niesione:
            naruszenia.append(f"PUSTY SKAN: mapowanie `{literal}` nie przypisuje zadnego pola")
            continue
        pola_backendu = pola_klasy_backendu(klasa_backendu)
        wyjatki = NIENOSZONE.get(rodzaj, {})
        for pole in pola_docelowe:
            if pole in niesione or pole in WYLICZANE:
                continue
            if pole in wyjatki:
                # Wyjatek MUSI byc prawdziwy: pole naprawde nieobecne w kontrakcie.
                if pole in pola_backendu:
                    naruszenia.append(
                        f"{literal}: pole `{pole}` jest na liscie nienoszonych z powodem "
                        f"[{wyjatki[pole]}], ale kontrakt `{klasa_backendu}` JE NIESIE - "
                        "powod przestal byc prawdziwy"
                    )
                continue
            if pole in pola_backendu:
                naruszenia.append(
                    f"{literal}: pole `{pole}` jest w kontrakcie `{klasa_backendu}` i w typie "
                    "FE `ConverterType`, ale mapowanie go NIE PRZEPISUJE — gubione po cichu"
                )
    return naruszenia


def main() -> int:
    naruszenia = zbadaj()
    if naruszenia:
        print(f"\n{'=' * 60}")
        print("PARYTET POL KATALOGU: mapowanie frontu gubi pole kontraktu")
        print(f"{'=' * 60}\n")
        for n in naruszenia:
            print(f"  VIOLATION: {n}")
        print()
        print("  Napraw: dopisz pole do mapowania w frontend/src/ui/catalog/api.ts")
        print("          albo nazwij powod w `NIENOSZONE` tego guarda.")
        print()
        return 1
    print(
        "Parytet pol katalogu: OK "
        f"({len(MAPOWANIA)} mapowania, {len(pola_typu_fe('ConverterType'))} pol typu docelowego)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
