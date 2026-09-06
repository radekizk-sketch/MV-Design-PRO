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

CZEGO GUARD NIE ROBI: nie porownuje TYPOW pol w ogolnosci (to wymagaloby
odwzorowania calego systemu typow pydantic na TS) ani nie wymaga, by lustro
mialo wszystkie encje modelu. Sprawdza DWIE rzeczy, mierzalne i jednoznaczne:
(1) czy dla encji objetej lustrem kazde pole backendu ma odpowiednik w
lustrze (z uwzglednieniem dziedziczenia), (2) dla pol `Literal[...]` (lancuchy)
— czy zbior literalow po stronie TS jest ROWNY (nie tylko nadzbiorem ani
podzbiorem) zbiorowi literalow pydantic. Reszte typow (liczby, obiekty,
listy niebedace unia) guard swiadomie pomija.

PARYTET LITERALOW UNII (FAB-F, 2026-09-05) — DOKLADNIE ta sama klasa bledu,
co opisane wyzej pominiecie EPR w unii `insulation` (przewod goly bez
izolacji przechodzil bez ostrzezenia kompilatora), zmierzona i zamknieta
u zrodla:
- `parameter_source`: backend NIE MA jednej unii — `BranchBase`/`Source`/
  `ShuntCapacitor` dopuszczaja dodatkowo `MANUAL_EQUIVALENT`, pozostale encje
  (`Transformer`/`Load`/`Generator`/`Measurement`/`ProtectionAssignment`)
  maja WYLACZNIE `CATALOG`/`OVERRIDE` — parytet jest PER POLE, nie globalny
  (lustro mial jedna wspolna unie `ParameterSource` bez `MANUAL_EQUIVALENT`
  uzywana wszedzie, wiec `BranchBase`/`Source` byly zawezone; naprawione
  nowym typem `ParameterSourceWithManualEquivalent`).
- `ProtectionSetting.function_type`: backend ma 10 wartosci (dodatek D10 —
  funkcje ochrony od pracy wyspowej: `rocof_81R`, `vector_shift_78`,
  `underfrequency_81U`, `overfrequency_81O`), lustro mialo 6 — brak byl
  niewidoczny, bo sprawdzenie obecnosci POLA nie patrzy na WARTOSCI unii.
- `ShuntCapacitor` mial W OGOLE brakujace 6 pol katalogowych
  (`catalog_ref`/`catalog_namespace`/`parameter_source`/`source_mode`/
  `materialized_params`/`overrides`) — TA konkretna luka byla niewidoczna z
  INNEGO powodu: sprawdzenie obecnosci pol liczylo pola `BranchBase` jako
  "widoczne" dla KAZDEJ encji bezwarunkowo, choc `ShuntCapacitor` dziedziczy
  wylacznie po `ENMElement` (nie po `BranchBase`) — baza jest teraz PER
  ENCJA, wg jej faktycznego `extends` w lustrze TS (predykaty parami, KLASA
  §3: warunek "co jest widoczne" musi pochodzic z JEDNEGO zrodla prawdy,
  czyli z rzeczywistego dziedziczenia tej konkretnej encji).

Uruchomienie (wymaga zaleznosci backendu — importuje modele):
  cd mv-design-pro/backend && poetry run python ../scripts/enm_contract_parity_guard.py
"""

from __future__ import annotations

import re
import sys
import typing
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

# Interfejsy TS, z ktorych encje dziedzicza pola. `ENMElement` obowiazuje
# bezwarunkowo (kazda sprawdzana encja go rozszerza — konwencja lustra).
# `BranchBase` NIE jest bezwarunkowy: dodawany do bazy encji TYLKO gdy jej
# WLASNY interfejs TS faktycznie deklaruje `extends ... BranchBase ...`
# (patrz `_extends_ts` + petla w `main`) — wczesniejsza wersja dodawala pola
# `BranchBase` do KAZDEJ encji bezwarunkowo, co dalo `ShuntCapacitor` (dziedziczy
# WYLACZNIE po `ENMElement`) falszywa przepustke na 6 brakujacych pol.
BAZA_BEZWARUNKOWA: tuple[str, ...] = ("ENMElement",)
BAZA_WARUNKOWA: tuple[str, ...] = ("BranchBase",)

# Pola modelu CELOWO nieobecne w lustrze, z uzasadnieniem. Wpis tutaj jest
# decyzja architektoniczna, nie obejsciem — wymaga powodu w komentarzu.
DOPUSZCZALNE_BRAKI: dict[tuple[str, str], str] = {}

# Rozjazdy literalow unii CELOWO dopuszczone, z uzasadnieniem architektonicznym
# (klucz: (nazwa_klasy_py, nazwa_pola)). Pusty na 2026-09-05 — kazdy zmierzony
# rozjazd zostal naprawiony u zrodla (patrz docstring modulu), nie wpisany tutaj.
DOPUSZCZALNE_ROZBIEZNOSCI_LITERALOW: dict[tuple[str, str], str] = {}


def _pola_interfejsu_ts(zrodlo: str, nazwa: str) -> set[str]:
    """Nazwy pol zadeklarowanych WPROST w danym interfejsie TS."""
    trafienie = _tresc_interfejsu_ts(zrodlo, nazwa)
    if trafienie is None:
        return set()
    return set(re.findall(r"^\s{2}([a-zA-Z_][a-zA-Z_0-9]*)\??:", trafienie, re.M))


def _tresc_interfejsu_ts(zrodlo: str, nazwa: str) -> str | None:
    """Surowa tresc ciala interfejsu TS `nazwa` (miedzy `{` a domykajacym `}`)."""
    wzor = re.compile(
        r"export interface " + re.escape(nazwa) + r"(?: extends [A-Za-z0-9_, ]+)?\s*\{(.*?)\n\}",
        re.S,
    )
    trafienie = wzor.search(zrodlo)
    return trafienie.group(1) if trafienie is not None else None


def _extends_ts(zrodlo: str, nazwa: str) -> list[str]:
    """Nazwy interfejsow z klauzuli `extends` interfejsu TS `nazwa` (puste = brak)."""
    wzor = re.compile(
        r"export interface " + re.escape(nazwa) + r"(?: extends ([A-Za-z0-9_, ]+))?\s*\{"
    )
    trafienie = wzor.search(zrodlo)
    if trafienie is None or trafienie.group(1) is None:
        return []
    return [czesc.strip() for czesc in trafienie.group(1).split(",")]


def _py_literal_wartosci(adnotacja: object) -> set[str] | None:
    """Zbior wartosci `Literal[...]` (WYLACZNIE lancuchy) dla adnotacji pola
    pydantic, z rozpakowaniem `Optional`/`X | None`. `None` gdy pole nie jest
    (opcjonalnym) `Literal` lancuchow — taki przypadek guard pomija, nie zglasza."""
    origin = typing.get_origin(adnotacja)
    if origin is typing.Literal:
        argumenty = typing.get_args(adnotacja)
        if argumenty and all(isinstance(a, str) for a in argumenty):
            return set(argumenty)
        return None
    if origin is typing.Union:
        pozostale = [a for a in typing.get_args(adnotacja) if a is not type(None)]
        if len(pozostale) == 1:
            return _py_literal_wartosci(pozostale[0])
    return None


def _resolve_ts_literal_type(
    zrodlo: str, wyrazenie_typu: str, glebokosc: int = 0
) -> set[str] | None:
    """Zbior wartosci unii literalow po stronie TS dla wyrazenia typu pola
    (np. `'A' | 'B' | null` albo odwolanie do aliasu `export type X = ...`).
    `None` gdy wyrazenie nie daje sie rozpoznac jako czysta unia literalow
    lancuchowych (obiekt, generyk, tablica) — guard wtedy POMIJA to pole,
    zamiast zgadywac."""
    if glebokosc > 5:
        return None
    # usun jednoliniowe komentarze `// ...` (unia moze je miec miedzy czlonami
    # rozbita na wiele linii, np. `station_type` w Substation).
    wyrazenie = re.sub(r"//[^\n]*", "", wyrazenie_typu).strip()
    czesci = [c.strip() for c in wyrazenie.split("|")]
    czesci = [c for c in czesci if c and c not in ("null", "undefined")]
    if not czesci:
        return None
    wynik: set[str] = set()
    for czesc in czesci:
        literal = re.fullmatch(r"'([^']*)'", czesc)
        if literal:
            wynik.add(literal.group(1))
            continue
        alias = re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", czesc)
        if alias:
            wzor_aliasu = re.compile(r"export type " + re.escape(czesc) + r"\s*=\s*([^;]+);", re.S)
            trafienie_aliasu = wzor_aliasu.search(zrodlo)
            if trafienie_aliasu is None:
                return None
            pod_zbior = _resolve_ts_literal_type(zrodlo, trafienie_aliasu.group(1), glebokosc + 1)
            if pod_zbior is None:
                return None
            wynik |= pod_zbior
            continue
        # ksztalt nierozpoznany (generyk, tablica, obiekt) — nie zgaduj.
        return None
    return wynik


def _ts_wyrazenie_pola(zrodlo: str, nazwa_interfejsu: str, nazwa_pola: str) -> str | None:
    """Surowe wyrazenie typu (tekst) dla jednego pola wewnatrz cialA interfejsu TS."""
    tresc = _tresc_interfejsu_ts(zrodlo, nazwa_interfejsu)
    if tresc is None:
        return None
    wzor_pola = re.compile(r"^\s{2}" + re.escape(nazwa_pola) + r"\??:\s*(.+?);", re.M | re.S)
    trafienie = wzor_pola.search(tresc)
    return trafienie.group(1) if trafienie is not None else None


def _znajdz_wyrazenie_pola_z_baza(
    zrodlo: str,
    nazwa_ts: str,
    rozszerzenia_ts: set[str],
    nazwa_pola: str,
) -> tuple[str, str] | None:
    """Znajdz surowe wyrazenie typu pola `nazwa_pola`: najpierw WPROST na
    interfejsie `nazwa_ts`, potem (fallback) na kazdej bazie, z ktorej `nazwa_ts`
    FAKTYCZNIE dziedziczy wg `rozszerzenia_ts` (plus bazy bezwarunkowe, np.
    `ENMElement`). Zwraca `(zrodlowy_interfejs, wyrazenie)` albo `None`, gdy pole
    nie ma odpowiednika w lustrze TS w ogole (pole moze byc wtedy zgloszone przez
    osobne sprawdzenie obecnosci, ktore uzywa TEGO SAMEGO `rozszerzenia_ts`).

    UWAGA (naprawione 2026-09-05, znalezione przy weryfikacji karty F4):
    poprzednia wersja tej logiki (inline w `main()`) testowala przynaleznosc
    kandydata-na-baze do zbioru NAZW POL (`baza`, uzywanego do sprawdzenia
    obecnosci), zamiast do zbioru NAZW INTERFEJSOW (`rozszerzenia_ts`) — te dwa
    zbiory nigdy sie nie przecinaja, wiec warunek byl ZAWSZE prawdziwy i fallback
    NIGDY faktycznie nie probowal `ENMElement`/`BranchBase`. Efekt: 12 pol
    dziedziczonych z `BranchBase` (`status`/`parameter_source`/`source_mode` na
    `Cable`/`FuseBranch`/`OverheadLine`/`SwitchBranch`) bylo CICHO pomijanych w
    sprawdzeniu parytetu literalow, mimo ze licznik i komunikat „OK” sugerowaly
    pelne pokrycie — dokladnie klasa bledu „deklaracja bez testu = falszywa
    pewnosc” (KLASA-NIE-INSTANCJA §4), ktora ten guard mial ZAMYKAC, nie
    powielac. Funkcja wydzielona do osobnej jednostki wlasnie po to, zeby ten
    dokladny przypadek (pole WYLACZNIE na warunkowo dolaczonej bazie) dalo sie
    przypiac testem — patrz `backend/tests/ci/test_enm_contract_parity_guard.py`.
    """
    wyrazenie = _ts_wyrazenie_pola(zrodlo, nazwa_ts, nazwa_pola)
    if wyrazenie is not None:
        return nazwa_ts, wyrazenie
    for nazwa_bazy_kandydat in (*BAZA_BEZWARUNKOWA, *BAZA_WARUNKOWA):
        czy_stosowalna_baza = (
            nazwa_bazy_kandydat in BAZA_BEZWARUNKOWA or nazwa_bazy_kandydat in rozszerzenia_ts
        )
        if not czy_stosowalna_baza:
            continue
        wyrazenie = _ts_wyrazenie_pola(zrodlo, nazwa_bazy_kandydat, nazwa_pola)
        if wyrazenie is not None:
            return nazwa_bazy_kandydat, wyrazenie
    return None


def main() -> int:
    sys.path.insert(0, str(BACKEND_SRC))
    try:
        from enm import models  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - brak zaleznosci backendu
        print(f"enm-contract-parity-guard: NIE MOZNA zaimportowac modeli ENM ({exc}).")
        print("Uruchom z katalogu backendu: poetry run python ../scripts/...")
        return 2

    zrodlo_ts = MIRROR.read_text(encoding="utf-8")
    baza_bezwarunkowa = set()
    for nazwa_bazy in BAZA_BEZWARUNKOWA:
        baza_bezwarunkowa |= _pola_interfejsu_ts(zrodlo_ts, nazwa_bazy)
    pola_warunkowej_bazy: dict[str, set[str]] = {
        nazwa_bazy: _pola_interfejsu_ts(zrodlo_ts, nazwa_bazy) for nazwa_bazy in BAZA_WARUNKOWA
    }

    naruszenia: list[str] = []
    sprawdzone = 0
    pol_literalowych_sprawdzonych = 0
    for nazwa_py, nazwa_ts in sorted(SPRAWDZANE.items()):
        klasa = getattr(models, nazwa_py, None)
        if klasa is None:
            naruszenia.append(
                f"{nazwa_py}: nie ma takiej klasy w enm/models.py — mapa guarda jest nieaktualna."
            )
            continue
        pola_ts = _pola_interfejsu_ts(zrodlo_ts, nazwa_ts)
        if not pola_ts:
            naruszenia.append(f"{nazwa_ts}: nie znaleziono interfejsu w lustrze {MIRROR.name}.")
            continue
        sprawdzone += 1

        # Baza PER ENCJA: `ENMElement` zawsze, `BranchBase` TYLKO gdy encja
        # faktycznie go rozszerza w lustrze TS (nie zgadywanie — sprawdzenie
        # rzeczywistej klauzuli `extends`).
        rozszerzenia_ts = set(_extends_ts(zrodlo_ts, nazwa_ts))
        baza = set(baza_bezwarunkowa)
        for nazwa_bazy_warunkowej, pola_bazy_warunkowej in pola_warunkowej_bazy.items():
            if nazwa_bazy_warunkowej in rozszerzenia_ts:
                baza |= pola_bazy_warunkowej

        widoczne = pola_ts | baza
        for pole in sorted(set(klasa.model_fields.keys()) - widoczne):
            if (nazwa_py, pole) in DOPUSZCZALNE_BRAKI:
                continue
            naruszenia.append(
                f"{nazwa_py}.{pole} -> brak w interfejsie TS `{nazwa_ts}`. "
                "Front nie ma typowanego dostepu do tej danej, wiec odczyt wymusi "
                "rzutowanie wylaczajace kontrole typow."
            )

        # Parytet literalow unii: WYLACZNIE pola pydantic typu Literal[str,...]
        # (opcjonalnie), ktore MAJA odpowiednik w lustrze (obecnosc juz
        # sprawdzona wyzej) — poroznanie zbiorow wartosci, nie tylko nazw pol.
        for nazwa_pola, info_pola in klasa.model_fields.items():
            wartosci_py = _py_literal_wartosci(info_pola.annotation)
            if wartosci_py is None:
                continue
            # Pole moze byc zadeklarowane WPROST na tej encji albo odziedziczone
            # z jednej z baz — `_znajdz_wyrazenie_pola_z_baza` uzywa TEGO SAMEGO
            # `rozszerzenia_ts` co budowa `baza` powyzej (predykaty parami,
            # KLASA §3: jedno zrodlo prawdy o dziedziczeniu tej encji).
            trafienie = _znajdz_wyrazenie_pola_z_baza(
                zrodlo_ts, nazwa_ts, rozszerzenia_ts, nazwa_pola
            )
            if trafienie is None:
                continue  # brak pola juz zgloszony wyzej (sprawdzenie obecnosci)
            zrodlowy_interfejs, wyrazenie = trafienie
            pol_literalowych_sprawdzonych += 1
            wartosci_ts = _resolve_ts_literal_type(zrodlo_ts, wyrazenie)
            if wartosci_ts is None:
                continue  # ksztalt zlozony (nie czysta unia literalow) — pomin, nie zgaduj
            if wartosci_ts == wartosci_py:
                continue
            if (nazwa_py, nazwa_pola) in DOPUSZCZALNE_ROZBIEZNOSCI_LITERALOW:
                continue
            brakujace = sorted(wartosci_py - wartosci_ts)
            nadmiarowe = sorted(wartosci_ts - wartosci_py)
            szczegoly = []
            if brakujace:
                szczegoly.append(f"brakuje w TS: {brakujace}")
            if nadmiarowe:
                szczegoly.append(f"TS ma dodatkowo (backend ich nie zna): {nadmiarowe}")
            naruszenia.append(
                f"{nazwa_py}.{nazwa_pola} (TS `{zrodlowy_interfejs}.{nazwa_pola}`): "
                f"zbior literalow unii NIE JEST rowny — {'; '.join(szczegoly)}."
            )

    print("=" * 60)
    print(f"enm-contract-parity-guard: encje sprawdzone: {sprawdzone}/{len(SPRAWDZANE)}")
    print(
        f"enm-contract-parity-guard: pola Literal[str,...] sprawdzone (parytet wartosci): {pol_literalowych_sprawdzonych}"
    )
    if naruszenia:
        print(f"NARUSZENIA ({len(naruszenia)}):")
        for wiersz in naruszenia:
            print(f"  - {wiersz}")
        print()
        print("Brak pola: napraw przez DOPISANIE pola do lustra `frontend/src/types/enm.ts`.")
        print("Rozjazd literalow: dopisz brakujace wartosci do unii TS (lub usun nadmiarowe).")
        print(
            "Wpis w DOPUSZCZALNE_BRAKI / DOPUSZCZALNE_ROZBIEZNOSCI_LITERALOW wymaga uzasadnienia architektonicznego."
        )
        return 1
    print("enm-contract-parity-guard: OK (lustro zna kazde pole i literaly sprawdzanych encji)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
