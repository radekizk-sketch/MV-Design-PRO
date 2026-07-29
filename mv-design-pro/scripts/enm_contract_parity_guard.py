#!/usr/bin/env python3
"""ENM-CONTRACT-PARITY GUARD — lustro TypeScript musi znac kazde pole modelu (V12K-229).

DLACZEGO TEN GUARD POWSTAL. `frontend/src/types/enm.ts` jest LUSTREM modelu
`backend/src/enm/models.py`. Lustro rozjechalo sie po cichu i defekt byl
niewidoczny w obie strony:

- pola cieplne zyly (`jth_1s_a_per_mm2`, `ith_1s_a`, para temperatur,
  `thermal_source_ref`) oraz `cable_joints` istnialy w modelu od kart F-K1
  (V12K-210/211), a lustro ich NIE MIALO — wiec front nie mial TYPOWANEGO dostepu
  do danych, ktore model juz przewozi, i musial czytac je przez rzutowanie
  `as unknown as`;
- unia `insulation` w lustrze pomijala EPR, ktore backend zwraca i ktorego katalog
  SN ma 18 rekordow — kod galeziacy sie „wyczerpujaco" po izolacji pomijal realny
  przypadek bez ostrzezenia kompilatora.

To nie jest kosmetyka typow. Rzutowanie `as` wylacza kontrole typow, a wlasnie ono
przepuscilo DWIE ZGADNIETE NAZWY POL w V12K-226 (`station_ref` i
`nominal_power_kw` na odbiorze, ktory ich nie ma) — z tego wyszedl falszywy werdykt
„krytyczny eksport" na kazdej stacji z DER. Brak pola w lustrze WYMUSZA rzutowanie,
a rzutowanie otwiera droge na zgadniete nazwy. Guard zamyka wejscie do tego cyklu.

CZEGO GUARD NIE ROBI: nie porownuje TYPOW pol (to wymagaloby odwzorowania systemu
typow pydantic na TS) ani nie wymaga, by lustro mialo wszystkie encje modelu.
Sprawdza JEDNA rzecz, mierzalna i jednoznaczna: czy dla encji objetej lustrem
kazde pole backendu ma odpowiednik w lustrze (z uwzglednieniem dziedziczenia).

Uruchomienie (wymaga zaleznosci backendu — importuje modele):
  cd mv-design-pro/backend && poetry run python ../scripts/enm_contract_parity_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
MIRROR = REPO_ROOT / "frontend" / "src" / "types" / "enm.ts"

# Encje objete parzystoscia: nazwa klasy pydantic -> nazwa interfejsu TS.
# V12K-230: mapa objela CALA powierzchnie lustra — kazda klase modelu, ktora ma
# interfejs o tej samej nazwie w `enm.ts`. Lista jest JAWNA (nie odkrywana w
# runtime), zeby dodanie encji do lustra bylo swiadoma decyzja, a usuniecie jej z
# mapy bylo widoczne w diffie. Encje modelu BEZ odpowiednika w lustrze sa poza
# zakresem — guard nie wymaga kompletnosci lustra, tylko PARZYSTOSCI tego, co juz
# jest odwzorowane.
SPRAWDZANE: dict[str, str] = {
    "AlarmEntry": "AlarmEntry",
    "Bay": "Bay",
    "BayBaseModel": "BayBaseModel",
    "BayCanonicalModel": "BayCanonicalModel",
    "BayCommandExecutionState": "BayCommandExecutionState",
    "BayControlSurface": "BayControlSurface",
    "BayEarthFaultPath": "BayEarthFaultPath",
    "BayEnergizationSafetyState": "BayEnergizationSafetyState",
    "BayInterlockSet": "BayInterlockSet",
    "BayMeasurementChain": "BayMeasurementChain",
    "BayMeasurementSet": "BayMeasurementSet",
    "BayMeasurements": "BayMeasurements",
    "BayOperatingState": "BayOperatingState",
    "BayPowerFlowSourceContribution": "BayPowerFlowSourceContribution",
    "BayPrimaryDevice": "BayPrimaryDevice",
    "BayProjectResults": "BayProjectResults",
    "BayProofBinding": "BayProofBinding",
    "BayProtectionControlUnit": "BayProtectionControlUnit",
    "BayRuntimeState": "BayRuntimeState",
    "BayScenarioState": "BayScenarioState",
    "BaySecondaryArchitecture": "BaySecondaryArchitecture",
    "BaySecondaryUnitRef": "BaySecondaryUnitRef",
    "BayShortCircuitSourceContribution": "BayShortCircuitSourceContribution",
    "BaySourceEndpoint": "BaySourceEndpoint",
    "BaySwitchState": "BaySwitchState",
    "BayVerificationResult": "BayVerificationResult",
    "BranchBase": "BranchBase",
    "BranchPointSN": "BranchPointSN",
    "BranchRating": "BranchRating",
    "Bus": "Bus",
    "BusLimits": "BusLimits",
    "Cable": "Cable",
    "CableJoint": "CableJoint",
    "ConnectionConditions": "ConnectionConditions",
    "ConnectionNode": "ConnectionNode",
    "Corridor": "Corridor",
    "DisturbanceRecorderState": "DisturbanceRecorderState",
    "ENMDefaults": "ENMDefaults",
    "ENMElement": "ENMElement",
    "ENMHeader": "ENMHeader",
    "EnergyNetworkModel": "EnergyNetworkModel",
    "EventEntry": "EventEntry",
    "FuseBranch": "FuseBranch",
    "GPZSection": "GPZSection",
    "GenLimits": "GenLimits",
    "Generator": "Generator",
    "GroundingConfig": "GroundingConfig",
    "InterlockEntry": "InterlockEntry",
    "Junction": "Junction",
    "LineDropCompensation": "LineDropCompensation",
    "Load": "Load",
    "Measurement": "Measurement",
    "MeasurementRating": "MeasurementRating",
    "OverheadLine": "OverheadLine",
    "ParameterOverride": "ParameterOverride",
    "Port": "Port",
    "PortRef": "PortRef",
    "ProtectionAssignment": "ProtectionAssignment",
    "ProtectionFunctionState": "ProtectionFunctionState",
    "ProtectionSetting": "ProtectionSetting",
    "ProtectionSettingValue": "ProtectionSettingValue",
    "ShuntCapacitor": "ShuntCapacitor",
    "Source": "Source",
    "SpzState": "SpzState",
    "Substation": "Substation",
    "SwitchBranch": "SwitchBranch",
    "TapChanger": "TapChanger",
    "Transformer": "Transformer",
    "TrendState": "TrendState",
}

# Interfejsy TS, z ktorych encje dziedzicza pola. Bez nich kazde pole bazowe
# wygladaloby na brakujace (falszywy alarm — ta sama klasa bledu, co „brak
# izolacji" zglaszany dla przewodu golego, V12K-211).
BAZOWE_TS: tuple[str, ...] = ("ENMElement", "BranchBase")

# Pola modelu CELOWO nieobecne w lustrze, z uzasadnieniem. Wpis tutaj jest
# decyzja architektoniczna, nie obejsciem — wymaga powodu w komentarzu.
DOPUSZCZALNE_BRAKI: dict[tuple[str, str], str] = {}


def _pola_interfejsu_ts(zrodlo: str, nazwa: str) -> set[str]:
    """Nazwy pol zadeklarowanych WPROST w danym interfejsie TS."""
    wzor = re.compile(
        r"export interface " + re.escape(nazwa) + r"(?: extends [A-Za-z0-9_, ]+)?\s*\{(.*?)\n\}",
        re.S,
    )
    trafienie = wzor.search(zrodlo)
    if trafienie is None:
        return set()
    return set(re.findall(r"^\s{2}([a-zA-Z_][a-zA-Z_0-9]*)\??:", trafienie.group(1), re.M))


def main() -> int:
    sys.path.insert(0, str(BACKEND_SRC))
    try:
        from enm import models  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - brak zaleznosci backendu
        print(f"enm-contract-parity-guard: NIE MOZNA zaimportowac modeli ENM ({exc}).")
        print("Uruchom z katalogu backendu: poetry run python ../scripts/...")
        return 2

    zrodlo_ts = MIRROR.read_text(encoding="utf-8")
    baza = set()
    for nazwa_bazy in BAZOWE_TS:
        baza |= _pola_interfejsu_ts(zrodlo_ts, nazwa_bazy)

    naruszenia: list[str] = []
    sprawdzone = 0
    for nazwa_py, nazwa_ts in sorted(SPRAWDZANE.items()):
        klasa = getattr(models, nazwa_py, None)
        if klasa is None:
            naruszenia.append(
                f"{nazwa_py}: nie ma takiej klasy w enm/models.py — mapa guarda jest nieaktualna."
            )
            continue
        pola_ts = _pola_interfejsu_ts(zrodlo_ts, nazwa_ts)
        if not pola_ts:
            naruszenia.append(
                f"{nazwa_ts}: nie znaleziono interfejsu w lustrze {MIRROR.name}."
            )
            continue
        sprawdzone += 1
        widoczne = pola_ts | baza
        for pole in sorted(set(klasa.model_fields.keys()) - widoczne):
            if (nazwa_py, pole) in DOPUSZCZALNE_BRAKI:
                continue
            naruszenia.append(
                f"{nazwa_py}.{pole} -> brak w interfejsie TS `{nazwa_ts}`. "
                "Front nie ma typowanego dostepu do tej danej, wiec odczyt wymusi "
                "rzutowanie wylaczajace kontrole typow."
            )

    print("=" * 60)
    print(f"enm-contract-parity-guard: encje sprawdzone: {sprawdzone}/{len(SPRAWDZANE)}")
    if naruszenia:
        print(f"NARUSZENIA ({len(naruszenia)}):")
        for wiersz in naruszenia:
            print(f"  - {wiersz}")
        print()
        print("Napraw przez DOPISANIE pola do lustra `frontend/src/types/enm.ts`.")
        print("Wpis w DOPUSZCZALNE_BRAKI wymaga uzasadnienia architektonicznego.")
        return 1
    print("enm-contract-parity-guard: OK (lustro zna kazde pole sprawdzanych encji)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
