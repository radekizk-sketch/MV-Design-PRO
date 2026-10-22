#!/usr/bin/env python3
"""
Strażnik kompletności toku pracy operacji domenowych (dialog completeness).

Cel: KAŻDA operacja kanoniczna backendu (`CANONICAL_OPERATIONS`) ma realną ścieżkę
użytkownika w interfejsie. Operacja bez ścieżki to zdolność istniejąca tylko w testach
(ZASADA NR 1); przed korektą V12K-351 strażnik sprawdzał ręczną listę 25 operacji, a 23
operacje rejestru nie były sklasyfikowane wcale — dziewięć z nich nie miało żadnego
wołającego w interfejsie.

ŹRÓDŁA (czytane, nie przepisywane):
  backend/src/domain/canonical_operations.py      — klucze `CANONICAL_OPERATIONS` (AST)
  frontend/src/ui/workspace/operationFormRegistry.tsx — `OPERATION_FORM_REGISTRY`
  frontend/src/ui/sld/v2/command/SldCommandService.ts — pozycje `SLD_MENU_REGISTRY`
  frontend/src/ui/topology/modals/index.ts         — eksporty okien warstwy topologii

KLASYFIKACJA (dokładnie jedna na operację):
  1. OKNO — wpis rejestru formularzy wskazuje komponent; jego import rozwiązuje się do
     istniejącego pliku albo katalogu modułu.
  2. BEZ OKNA — wpis `null` + `BezOkna` niżej: pliki interfejsu, które wołają operację
     (literał nazwy operacji w pliku), i uzasadnienie, dlaczego nie ma okna.
  3. ŚCIEŻKA MENU — wpis `null` + `SciezkaMenu` niżej: pozycje `SLD_MENU_REGISTRY`
     (każda istnieje w rejestrze menu) i plik wykonawcy, w którym jest literał operacji
     oraz literał każdej z tych pozycji.

NARUSZENIA (RC 1): operacja rejestru bez wpisu w rejestrze formularzy; wpis rejestru
formularzy spoza rejestru kanonicznego; operacja `null` bez klasyfikacji; klasyfikacja
operacji, która ma okno, albo operacji spoza rejestru (nieaktualna); import okna
nierozwiązywalny; plik dowodu bez literału operacji; pozycja menu nieistniejąca; okno
warstwy topologii nieeksportowane z `index.ts`; brak któregokolwiek źródła (fail-closed).

Samotest z iniekcją: `scripts/test_dialog_completeness_guard.py`.

EXIT CODES: 0 = czysto, 1 = naruszenia.
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_OPS_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
FORM_REGISTRY_FILE = FRONTEND_SRC / "ui" / "workspace" / "operationFormRegistry.tsx"
SLD_MENU_FILE = FRONTEND_SRC / "ui" / "sld" / "v2" / "command" / "SldCommandService.ts"
MODALS_DIR = FRONTEND_SRC / "ui" / "topology" / "modals"
INDEX_FILE = MODALS_DIR / "index.ts"


@dataclass(frozen=True)
class BezOkna:
    """Operacja wołana z interfejsu bez osobnego okna (ścieżki względem `frontend/src`)."""

    sciezki: tuple[str, ...]
    uzasadnienie: str


@dataclass(frozen=True)
class SciezkaMenu:
    """Operacja wykonywana z pozycji menu kontekstowego schematu."""

    akcje: tuple[str, ...]
    wykonawca: str


_WYKONAWCA_MENU = "ui/sld/shared/sldActionExecutor.ts"
_WYKONAWCA_NN = "ui/sld/v3/lv-domain/operacjeNn.ts"
_SEKCJE_GPZ = BezOkna(
    ("ui/network-build/cards/GpzSectionsEditor.tsx",),
    "Edycja sekcji szyn GPZ jest tabelą na karcie stacji GPZ (StationCard) — wiersz sekcji "
    "z przyciskami dodaj/zapisz/usuń; okno powielałoby tę samą tabelę.",
)

KLASYFIKACJA_BEZ_FORMULARZA: dict[str, BezOkna | SciezkaMenu] = {
    "open_switch": SciezkaMenu(("open-switch",), _WYKONAWCA_MENU),
    "close_switch": SciezkaMenu(("close-switch",), _WYKONAWCA_MENU),
    "delete_element": SciezkaMenu(
        (
            "delete-bay",
            "delete-segment",
            "delete-station",
            "delete-zksn",
            "delete-branch-pole",
            "delete-pv",
            "delete-bess",
            "delete-fw",
            "delete-nn-cable",
            "delete-nn-apparatus",
            "delete-nn-terminal",
            "delete-nn-load",
        ),
        _WYKONAWCA_MENU,
    ),
    "merge_nn_segments": SciezkaMenu(("merge-nn-segments",), _WYKONAWCA_NN),
    "copy_nn_feeder": SciezkaMenu(("copy-nn-feeder",), _WYKONAWCA_NN),
    "set_bay_equipment": BezOkna(
        ("ui/field/EdytorWyposazeniaPola.tsx",),
        "Wyposażenie pola edytuje się w miejscu na karcie pola (E-11) — lista aparatów pola "
        "z wyborem typu katalogowego.",
    ),
    "update_protection_settings": BezOkna(
        ("ui2/kreatory/przekaznik/EdytorNastawZabezpieczenia.tsx",),
        "Nastawy zabezpieczenia edytuje się na karcie pola i na ekranie zabezpieczeń (E-27) — "
        "edytor osadzony obok wyników koordynacji.",
    ),
    "set_measurement_secondary_circuit": BezOkna(
        ("ui/field/EdytorObwoduWtornegoPola.tsx",),
        "Obwód wtórny przekładnika edytuje się na karcie pola (E-11), przy przekładnikach "
        "tego pola.",
    ),
    "dodaj_karte_widmowa_projektu": BezOkna(
        ("ui2/spaces/model/karty-widmowe/PanelKartWidmowych.tsx",),
        "Kartę widmową projektu wczytuje się z pliku w zakładce „Karty widmowe” przestrzeni "
        "Model — jedynym wejściem jest plik rekordu karty.",
    ),
    "set_der_catalog_bindings": BezOkna(
        ("ui2/spaces/model/karty-widmowe/PanelKartWidmowych.tsx",),
        "Wiązania katalogowe źródła edytuje się w miejscu, przy danych, których dotyczą: "
        "karty widmowe w zakładce „Karty widmowe” przestrzeni Model (literał operacji), "
        "model dynamiczny na ekranie dynamiki (ui2/wyniki/dynamika/api.ts, nazwa operacji "
        "przekazywana przez magazyn migawki).",
    ),
    "set_connection_conditions": BezOkna(
        ("ui2/spaces/projekt/KafelPrzylaczenia.tsx",),
        "Warunki przyłączenia edytuje się na kafelku przyłączenia przestrzeni Projekt.",
    ),
    "refresh_snapshot": BezOkna(
        ("ui/topology/snapshotStore.ts",),
        "Odświeżenie migawki modelu jest akcją magazynu migawki bez danych wejściowych.",
    ),
    "add_gpz_section": _SEKCJE_GPZ,
    "update_gpz_section": _SEKCJE_GPZ,
    "delete_gpz_section": _SEKCJE_GPZ,
    "set_source_operating_mode": BezOkna(
        ("ui2/oze/osd/EkranOsd.tsx",),
        "Tryb pracy źródła przełącza się na ekranie wymagań operatora (OSD) przy źródle.",
    ),
    "set_load_dynamic_binding": BezOkna(
        ("ui2/wyniki/dynamika/EkranDynamiki.tsx",),
        "Wiązanie odbioru z modelem dynamicznym wybiera się na ekranie dynamiki, przy "
        "danych modelu dynamicznego.",
    ),
}


def operacje_kanoniczne(plik: Path) -> list[str]:
    """Klucze słownika `CANONICAL_OPERATIONS` odczytane z AST (bez importu modułu)."""
    drzewo = ast.parse(plik.read_text(encoding="utf-8"))
    for wezel in drzewo.body:
        cel = None
        if isinstance(wezel, ast.AnnAssign) and isinstance(wezel.target, ast.Name):
            cel, wartosc = wezel.target.id, wezel.value
        elif isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
            t = wezel.targets[0]
            cel, wartosc = (t.id if isinstance(t, ast.Name) else None), wezel.value
        if cel == "CANONICAL_OPERATIONS" and isinstance(wartosc, ast.Dict):
            return [
                k.value
                for k in wartosc.keys
                if isinstance(k, ast.Constant) and isinstance(k.value, str)
            ]
    return []


_BLOK_REJESTRU = re.compile(r"OPERATION_FORM_REGISTRY\b[^=]*=\s*\{(?P<cialo>.*?)\n\};", re.DOTALL)
_WPIS = re.compile(r"^\s*(\w+)\s*:\s*(\w+)\s*,", re.MULTILINE)
_IMPORT = re.compile(r"import\s*\{(?P<nazwy>[^}]*)\}\s*from\s*'(?P<sciezka>[^']+)'")


def rejestr_formularzy(plik: Path) -> tuple[dict[str, str], dict[str, str]]:
    """(operacja → komponent albo 'null', komponent → ścieżka importu)."""
    tekst = plik.read_text(encoding="utf-8")
    blok = _BLOK_REJESTRU.search(tekst)
    if blok is None:
        return {}, {}
    cialo = re.sub(r"//[^\n]*", "", blok.group("cialo"))
    wpisy = {m.group(1): m.group(2) for m in _WPIS.finditer(cialo)}
    importy: dict[str, str] = {}
    for m in _IMPORT.finditer(tekst):
        for nazwa in m.group("nazwy").split(","):
            nazwa = nazwa.strip()
            if nazwa:
                importy[nazwa.split(" as ")[-1].strip()] = m.group("sciezka")
    return wpisy, importy


def _rozwiaz_import(baza: Path, sciezka: str) -> Path | None:
    cel = (baza.parent / sciezka).resolve()
    for kandydat in (
        cel.with_name(cel.name + ".tsx"),
        cel.with_name(cel.name + ".ts"),
        cel / "index.ts",
        cel / "index.tsx",
    ):
        if kandydat.is_file():
            return kandydat
    return None


def _zawiera_literal(tekst: str, nazwa: str) -> bool:
    return f"'{nazwa}'" in tekst or f'"{nazwa}"' in tekst


def sprawdz_eksporty_okien() -> list[str]:
    if not MODALS_DIR.is_dir():
        return [f"brak katalogu okien warstwy topologii: {MODALS_DIR}"]
    if not INDEX_FILE.is_file():
        return [f"brak {INDEX_FILE.name} w katalogu okien warstwy topologii"]
    tekst = INDEX_FILE.read_text(encoding="utf-8")
    return [
        f"okno '{f.stem}' nie jest eksportowane z index.ts"
        for f in sorted(MODALS_DIR.glob("*.tsx"))
        if f.stem not in tekst
    ]


def main() -> int:
    naruszenia: list[str] = []
    for zrodlo in (CANONICAL_OPS_FILE, FORM_REGISTRY_FILE, SLD_MENU_FILE):
        if not zrodlo.is_file():
            naruszenia.append(f"brak źródła strażnika: {zrodlo}")
    if naruszenia:
        return _raport(naruszenia)

    operacje = operacje_kanoniczne(CANONICAL_OPS_FILE)
    wpisy, importy = rejestr_formularzy(FORM_REGISTRY_FILE)
    if not operacje:
        naruszenia.append("nie odczytano CANONICAL_OPERATIONS (pusty albo zmieniony kształt)")
    if not wpisy:
        naruszenia.append("nie odczytano OPERATION_FORM_REGISTRY (pusty albo zmieniony kształt)")
    menu = SLD_MENU_FILE.read_text(encoding="utf-8")

    zbior_operacji = set(operacje)
    for op in sorted(zbior_operacji - set(wpisy)):
        naruszenia.append(f"operacja '{op}' nie ma wpisu w OPERATION_FORM_REGISTRY")
    for op in sorted(set(wpisy) - zbior_operacji):
        naruszenia.append(f"wpis OPERATION_FORM_REGISTRY '{op}' nie jest operacją kanoniczną")
    for op in sorted(set(KLASYFIKACJA_BEZ_FORMULARZA) - zbior_operacji):
        naruszenia.append(f"klasyfikacja '{op}' dotyczy operacji spoza rejestru (nieaktualna)")

    liczniki = {"okno": 0, "bez_okna": 0, "menu": 0}
    for op in sorted(zbior_operacji & set(wpisy)):
        komponent = wpisy[op]
        klasa = KLASYFIKACJA_BEZ_FORMULARZA.get(op)
        if komponent != "null":
            if klasa is not None:
                naruszenia.append(
                    f"operacja '{op}' ma okno {komponent} i jednocześnie klasyfikację bez okna"
                )
            sciezka = importy.get(komponent)
            if sciezka is None or _rozwiaz_import(FORM_REGISTRY_FILE, sciezka) is None:
                naruszenia.append(
                    f"okno operacji '{op}' ({komponent}) nie rozwiązuje się do pliku modułu"
                )
            liczniki["okno"] += 1
            continue
        if klasa is None:
            naruszenia.append(
                f"operacja '{op}' nie ma okna ani klasyfikacji (bez okna / ścieżka menu) — "
                "brak ścieżki użytkownika"
            )
            continue
        if isinstance(klasa, BezOkna):
            if not klasa.uzasadnienie.strip():
                naruszenia.append(f"klasyfikacja bez okna '{op}' nie ma uzasadnienia")
            if not klasa.sciezki:
                naruszenia.append(f"klasyfikacja bez okna '{op}' nie wskazuje plików")
            for rel in klasa.sciezki:
                plik = FRONTEND_SRC / rel
                if not plik.is_file():
                    naruszenia.append(f"operacja '{op}': plik dowodu {rel} nie istnieje")
                elif not _zawiera_literal(plik.read_text(encoding="utf-8"), op):
                    naruszenia.append(f"operacja '{op}': plik {rel} nie woła tej operacji")
            liczniki["bez_okna"] += 1
            continue
        wykonawca = FRONTEND_SRC / klasa.wykonawca
        tekst_wykonawcy = wykonawca.read_text(encoding="utf-8") if wykonawca.is_file() else ""
        if not wykonawca.is_file():
            naruszenia.append(f"operacja '{op}': wykonawca {klasa.wykonawca} nie istnieje")
        elif not _zawiera_literal(tekst_wykonawcy, op):
            naruszenia.append(f"operacja '{op}': wykonawca {klasa.wykonawca} jej nie woła")
        if not klasa.akcje:
            naruszenia.append(f"ścieżka menu '{op}' nie wskazuje pozycji menu")
        for akcja in klasa.akcje:
            if f"id: '{akcja}'" not in menu:
                naruszenia.append(f"operacja '{op}': pozycji menu '{akcja}' nie ma w rejestrze")
            elif tekst_wykonawcy and not _zawiera_literal(tekst_wykonawcy, akcja):
                naruszenia.append(
                    f"operacja '{op}': wykonawca {klasa.wykonawca} nie obsługuje pozycji "
                    f"'{akcja}'"
                )
        liczniki["menu"] += 1

    naruszenia.extend(sprawdz_eksporty_okien())
    if naruszenia:
        return _raport(naruszenia)
    print(
        f"Dialog Completeness Guard: OK ({len(zbior_operacji)} operacji: "
        f"{liczniki['okno']} z oknem, {liczniki['bez_okna']} bez okna, "
        f"{liczniki['menu']} z menu)"
    )
    return 0


def _raport(naruszenia: list[str]) -> int:
    print(f"\n{'=' * 60}")
    print(f"DIALOG COMPLETENESS GUARD: {len(naruszenia)} naruszeń")
    print(f"{'=' * 60}\n")
    for n in naruszenia:
        print(f"  VIOLATION: {n}")
    print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
