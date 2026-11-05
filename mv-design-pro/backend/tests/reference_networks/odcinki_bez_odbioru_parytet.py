"""Oczekiwane końce otwarte odcinków KAŻDEGO modelu ENM z fikstur generowanych.

Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA. Gotowość (walidator ENM W065/W066) i rysunek SLD (słupek
końca z podpisem „koniec otwarty · brak stacji odbiorczej") mówią o tych samych końcach: backend
liczy je ``enm.odcinki_bez_odbioru.konce_otwarte``, front — lustrem
``frontend/src/ui/shared/odcinkiBezOdbioru.ts``. Parytet jest PRZYPIĘTY: ten generator liczy
końce funkcją backendu na każdym modelu ENM, który front czyta z fikstur generowanych (te same
katalogi co parytet szyn stacji), a test vitest ``odcinkiBezOdbioru.parytet.test.ts`` porównuje
z tym plikiem lustro.

Model iloczynu cech (``MODEL_ILOCZYNU``) niesie przypadki brzegowe, których fikstury z API nie
mają: każdy rodzaj przyłączenia szyny końcowej, pomiar jako jedyne przyłączenie, łącznik
i bezpiecznik (nie odcinki), wyspę z jednego odcinka, pętlę na jednej szynie, napisy z białymi
znakami i odcinek bez ``ref_id``.

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.odcinki_bez_odbioru_parytet --write
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from enm.odcinki_bez_odbioru import konce_otwarte

from tests.golden.zapis_fikstur import json_fikstury
from tests.reference_networks.szyny_stacji_parytet import FRONTEND, KATALOGI, _modele

WYJSCIE = "src/ui/shared/__tests__/fixtures/odcinkiBezOdbioruParytet.json"
KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.odcinki_bez_odbioru_parytet --write"
)


def _kabel(ref: str, z: str, do: str, rodzaj: str = "cable") -> dict[str, Any]:
    return {"ref_id": ref, "type": rodzaj, "from_bus_ref": z, "to_bus_ref": do}


#: Szyna zasilana ``Z`` i po jednym odcinku do szyny ``K/<cecha>`` przyłączonej tylko daną cechą.
MODEL_ILOCZYNU: dict[str, Any] = {
    "sources": [{"ref_id": "Q", "bus_ref": "Z"}, {"ref_id": "Q/zrodlo", "bus_ref": "K/zrodlo"}],
    "branches": [
        _kabel("O/nic", "Z", "K/nic"),
        _kabel("O/linia", "Z", "K/linia", "line_overhead"),
        _kabel("O/pomiar", "Z", "K/pomiar"),
        _kabel("O/odwrotny", "K/odwrotny", "Z"),
        _kabel("O/galaz", "Z", "K/galaz"),
        _kabel("O/galaz-dalej", "K/galaz", "K/galaz-koniec", "line_overhead"),
        _kabel("O/lacznik", "Z", "K/lacznik"),
        _kabel("S/lacznik", "K/lacznik", "Z", "switch"),
        _kabel("S/sam-lacznik", "Z", "K/sam-lacznik", "breaker"),
        _kabel("S/bezpiecznik", "Z", "K/bezpiecznik", "fuse"),
        _kabel("O/trafo-wn", "Z", "K/trafo-wn"),
        _kabel("O/trafo-nn", "Z", "K/trafo-nn"),
        _kabel("O/zrodlo", "Z", "K/zrodlo"),
        _kabel("O/odbior", "Z", "K/odbior"),
        _kabel("O/generator", "Z", "K/generator"),
        _kabel("O/bateria", "Z", "K/bateria"),
        _kabel("O/stacja", "Z", "K/stacja"),
        _kabel("O/zacisk-pola", "Z", "K/zacisk-pola"),
        _kabel("O/szyna-pola", "Z", "K/szyna-pola"),
        _kabel("O/sekcja-gpz", "Z", "K/sekcja-gpz"),
        _kabel("O/sekcja-gpz-wn", "Z", "K/sekcja-gpz-wn"),
        _kabel("O/sekcja-nn", "Z", "K/sekcja-nn"),
        _kabel("O/punkt", "Z", "K/punkt"),
        _kabel("O/wyspa", "W/a", "W/b"),
        _kabel("O/petla", "P/x", "P/x"),
        _kabel("  O/biale  ", "Z", "  K/biale  "),
        _kabel("", "Z", "K/bez-refu"),
    ],
    "transformers": [
        {"ref_id": "T/wn", "hv_bus_ref": "K/trafo-wn", "lv_bus_ref": "N/1"},
        {"ref_id": "T/nn", "hv_bus_ref": "N/2", "lv_bus_ref": "K/trafo-nn"},
    ],
    "loads": [{"ref_id": "L", "bus_ref": "K/odbior"}],
    "generators": [{"ref_id": "G", "bus_ref": "K/generator"}],
    "shunt_capacitors": [{"ref_id": "C", "bus_ref": "K/bateria"}],
    "substations": [
        {
            "ref_id": "ST",
            "bus_refs": ["K/stacja", "  "],
            "gpz_sections": [{"bus_ref": "K/sekcja-gpz"}],
            "gpz_hv_sections": [{"bus_ref": "K/sekcja-gpz-wn"}],
            "nn_sections": [{"bus_ref": "K/sekcja-nn"}],
        }
    ],
    "bays": [
        {"ref_id": "P/1", "bus_ref": "X", "terminal_bus_ref": "K/zacisk-pola"},
        {"ref_id": "P/2", "bus_ref": "K/szyna-pola"},
    ],
    "branch_points": [{"ref_id": "ZK", "bus_ref": "K/punkt"}],
    "measurements": [{"ref_id": "VT", "bus_ref": "K/pomiar", "measurement_type": "VT"}],
}


def _konce(model: dict[str, Any]) -> list[list[str]]:
    return [[k.odcinek_ref, k.szyna_ref] for k in konce_otwarte(model)]


def oczekiwane_konce() -> dict[str, Any]:
    """Plik → wskaźnik modelu → lista par [odcinek, szyna] końców otwartych."""
    pliki: dict[str, Any] = {}
    for katalog in KATALOGI:
        for plik in sorted((FRONTEND / katalog).glob("*.json")):
            modele = {
                wskaznik: _konce(model)
                for wskaznik, model in _modele(json.loads(plik.read_text(encoding="utf-8")))
            }
            if modele:
                pliki[str(plik.relative_to(FRONTEND))] = modele
    return {
        "iloczyn": {"model": MODEL_ILOCZYNU, "konce": _konce(MODEL_ILOCZYNU)},
        "pliki": pliki,
    }


def render_parytetu() -> str:
    return json_fikstury(oczekiwane_konce())


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
