"""Fikstury substratu SLD 52 stacji dla frontendu — JEDEN tor renderowania.

Kontrakty SLD v2/v3 (``layoutEngine.substrate``, ``portAnchoredGeometry.substrate``,
``buildScene.*``, ``lodContinuity``, ``kotwicaLodStacji``, ``obrysArkusza`` i kilkadziesiat
innych) oraz harness zrzutow czytaja trzy pliki substratu, kazdy w dwoch lokalizacjach:

* ``sldSubstrate52s.enm.json`` — kanoniczny ENM z ``build_sld_substrate_52s()``
  (``EnergyNetworkModel.model_validate`` -> ``model_dump(mode="json")``),
* ``sldSubstrate52s.powerflow.json`` — towarzysz rozplywu stanu normalnego (solver FROZEN),
* ``sldSubstrate52s.powerflow.maintenance.json`` — towarzysz scenariusza konserwacji.

Do karty SLD-SUBSTRAT pliki powstawaly dwoma skryptami we ``frontend/scripts``, ale ZADEN
test nie sprawdzal, ze zakomitowany plik rowna sie wyjsciu generatora — kontrakty SLD
mogly przechodzic na danych, ktorych produkt juz nie wytwarza. Teraz ``render_fikstur_substratu``
jest jedynym torem: ten sam dla zapisu (``--write``) i dla testu swiezosci
``tests/application/test_fikstury_substratu_sld.py`` (porownanie BAJTOWE).

Determinizm: znaczniki czasu naglowka przypiete do stalej, ``header.hash_sha256`` =
deterministyczny skrot migawki budowniczego, liczby zapisane regula
``zapis_fikstur`` (stala liczba cyfr znaczacych), klucze sortowane. Dwa biegi = te
same bajty (test ``test_render_jest_deterministyczny``).

Regeneracja (z katalogu ``backend``):
    poetry run python -m tests.reference_networks.sld_substrate_fixtures --write
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from enm.hash import hash_migawki_enm
from enm.models import EnergyNetworkModel

from tests.golden.sld_substrate_power_flow import (
    compute_substrate_power_flow,
    compute_substrate_power_flow_maintenance,
)
from tests.golden.zapis_fikstur import (
    json_fikstury,
    przypnij_identyfikatory_modelu,
    zaokraglij_liczby,
)
from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

#: Katalog ``mv-design-pro/frontend`` (backend/tests/reference_networks -> 3 poziomy w gore).
FRONTEND = Path(__file__).resolve().parents[3] / "frontend"

#: Obie lokalizacje kazdego pliku (trzymane w lock-step): fikstura testow Vitest
#: silnika ukladu oraz sciezka pobierana przez harness/speki e2e.
KATALOGI_FIKSTUR: tuple[str, ...] = (
    "src/ui/sld/v2/geometry/__tests__/fixtures",
    "public/test-fixtures",
)

KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && poetry run python -m "
    "tests.reference_networks.sld_substrate_fixtures --write"
)

_STALY_CZAS = "2026-05-29T00:00:00Z"

#: Przypadek stanu normalnego (wszystkie NO otwarte, DER na nastawie).
_CASE_REF = "case/sld-substrate-radial-normal"
_CASE_LABEL = "Stan normalny (radialny, NO otwarte)"

#: Przypadek konserwacji: jedna stacja pierscieniowa wylaczona z ruchu.
_CASE_REF_MAINT = "case/sld-substrate-maintenance-isolated-station"
_CASE_LABEL_MAINT = "Wyłączenie stacji do konserwacji (rezerwa pierścieniowa)"


def enm_fikstury_substratu() -> tuple[dict[str, Any], dict[str, Any], str]:
    """(wynik budowniczego, ENM wg reguly zapisu liczb, odcisk TEGO ENM).

    Fikstura JEST modelem: liczby ENM przechodza regule ``zapis_fikstur`` PRZED
    wyliczeniem odcisku i rozplywow, wiec odcisk w naglowku, towarzysze rozplywu i
    ``sldNetwork53.ts`` (``source_hash``) sa policzone z dokladnie tych wartosci, ktore
    lezą w pliku — kto wczyta fiksturę do backendu, dostanie ten sam odcisk i te same
    kierunki mocy. Jedno zrodlo dla wszystkich artefaktow substratu.
    """
    wynik = build_sld_substrate_52s()
    enm = zaokraglij_liczby(wynik["enm"])
    return wynik, enm, hash_migawki_enm(enm)


def _fikstura_enm(wynik: dict[str, Any], dumped: dict[str, Any], odcisk: str) -> dict[str, Any]:
    header = dumped["header"]
    header["created_at"] = _STALY_CZAS
    header["updated_at"] = _STALY_CZAS
    header["hash_sha256"] = odcisk  # czytnik bierze stad snapshotFingerprint
    return {
        "_meta": {
            "source": (
                "backend tests/reference_networks/sld_substrate_52s.build_sld_substrate_52s"
            ),
            "builder_snapshot_hash": odcisk,
            "station_count": wynik["station_count"],
            "trunk_station_count": wynik["trunk_station_count"],
            "lateral_station_count": wynik["lateral_station_count"],
            "branch_count": wynik["branch_count"],
            "lateral_count": wynik["lateral_count"],
            "der_count": wynik["der_count"],
            "der_types": sorted(wynik["der_types"]),
            "note": (
                "Canonical ENM for the SLD layout engine. Loaded via readTopologyFromENM "
                "(real bridge) in Vitest. GENERATED - do not edit by hand. Regenerate: "
                f"{KOMENDA_REGENERACJI}. Freshness test: "
                "backend tests/application/test_fikstury_substratu_sld.py. Deterministic: "
                "timestamps pinned, hash = builder snapshot hash."
            ),
        },
        "enm": dumped,
    }


def render_fikstur_substratu() -> dict[str, str]:
    """Sciezka wzgledem ``frontend`` -> PELNA tresc pliku (jeden tor zapisu i testu)."""
    wynik, enm_dict, odcisk = enm_fikstury_substratu()
    enm = EnergyNetworkModel.model_validate(enm_dict)
    # ``id`` losowany przy walidacji -> identyfikator z ``ref_id`` (regula ``zapis_fikstur``).
    przypnij_identyfikatory_modelu(enm)

    enm_json = json_fikstury(_fikstura_enm(wynik, enm.model_dump(mode="json"), odcisk))
    normalny = json_fikstury(
        compute_substrate_power_flow(
            enm,
            case_ref=_CASE_REF,
            case_label=_CASE_LABEL,
            # Wiaze towarzysza z fikstura ENM odciskiem migawki
            # (== _meta.builder_snapshot_hash / header.hash_sha256 fikstury ENM).
            enm_hash=odcisk,
        )
    )
    konserwacja = json_fikstury(
        compute_substrate_power_flow_maintenance(
            enm, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
        )
    )
    tresci = {
        "sldSubstrate52s.enm.json": enm_json,
        "sldSubstrate52s.powerflow.json": normalny,
        "sldSubstrate52s.powerflow.maintenance.json": konserwacja,
    }
    return {
        f"{katalog}/{nazwa}": tresc
        for katalog in KATALOGI_FIKSTUR
        for nazwa, tresc in sorted(tresci.items())
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="zapisz fikstury do frontendu")
    args = parser.parse_args(argv)
    rozjazdy = 0
    for sciezka, tresc in render_fikstur_substratu().items():
        plik = FRONTEND / sciezka
        if args.write:
            plik.parent.mkdir(parents=True, exist_ok=True)
            plik.write_text(tresc, encoding="utf-8")
            print(f"[zapisano] {plik}")
        elif not plik.exists() or plik.read_text(encoding="utf-8") != tresc:
            rozjazdy += 1
            print(f"[rozjazd] {plik}")
        else:
            print(f"[ok] {plik}")
    return 1 if rozjazdy else 0


if __name__ == "__main__":
    sys.exit(main())
