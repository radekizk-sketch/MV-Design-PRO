"""Parytet predykatu „na tej rodzinie wolno budować" między katalogiem a frontem.

BÓL (pomiar 2026-10-15, weryfikacja zmiany „stanowisko pola SN"): front trzymał TRZY
własne kopie zbioru statusów rodzin dopuszczających budowę (`SwitchgearFamilyPicker`,
`ui2/kreatory/stacja/konfiguratorRozdzielnicy.ts`, martwe `isUsableSwitchgearFamily`)
i każda dopuszczała `user_defined`, a backend (`POTWIERDZONE_STATUSY_RODZINY`,
`family_validation.wymagaj_rodziny_oferowanej`) tego statusu NIE dopuszcza. Weryfikowana
zmiana dokładała czwartą kopię. Rozjazd był cichy, bo nic go nie pilnowało.

Strażnik przypina dwie deklaracje:

1. jedyny zbiór frontu (`STATUSY_DO_BUDOWANIA`) jest równy zbiorowi backendu;
2. w źródłach frontu nie ma drugiej listy statusów budowy — każda konsumpcja idzie przez
   `czyRodzinaDoBudowania` (wzorzec: literał `'repo_verified'` obok `'verified'` w zbiorze
   lub warunku poza plikiem pickera).
"""

from __future__ import annotations

import re
from pathlib import Path

from network_model.catalog.switchgear import POTWIERDZONE_STATUSY_RODZINY

PROJEKT = Path(__file__).resolve().parents[3]
FRONT_SRC = PROJEKT / "frontend" / "src"
PICKER = FRONT_SRC / "ui" / "catalog" / "SwitchgearFamilyPicker.tsx"

_ZBIOR = re.compile(
    r"export const STATUSY_DO_BUDOWANIA[^=]*=\s*new Set\(\[(?P<tresc>[^\]]*)\]\)",
    re.DOTALL,
)
_LITERAL = re.compile(r"'([a-z_]+)'")
#: Druga lista statusów budowy: oba potwierdzone statusy w odległości kilku linii.
_DRUGA_LISTA = re.compile(r"'verified'[\s\S]{0,160}?'repo_verified'")


def _statusy_frontu() -> set[str]:
    dopasowanie = _ZBIOR.search(PICKER.read_text(encoding="utf-8"))
    assert dopasowanie is not None, "Brak `export const STATUSY_DO_BUDOWANIA` w pickerze rodzin."
    return set(_LITERAL.findall(dopasowanie.group("tresc")))


def test_zbior_frontu_rowny_zbiorowi_katalogu() -> None:
    assert _statusy_frontu() == set(POTWIERDZONE_STATUSY_RODZINY)


def test_brak_drugiej_listy_statusow_budowy_we_froncie() -> None:
    naruszenia: list[str] = []
    for plik in sorted(FRONT_SRC.rglob("*.ts*")):
        if "__tests__" in plik.parts or plik == PICKER:
            continue
        tekst = plik.read_text(encoding="utf-8")
        for trafienie in _DRUGA_LISTA.finditer(tekst):
            linia = tekst.count("\n", 0, trafienie.start()) + 1
            naruszenia.append(f"{plik.relative_to(PROJEKT)}:{linia}")
    assert not naruszenia, (
        "Druga lista statusów rodzin dopuszczających budowę (użyj `czyRodzinaDoBudowania`):\n"
        + "\n".join(naruszenia)
    )


def test_detektor_drugiej_listy_lapie_wzorzec_iniekcji() -> None:
    """Samosprawdzenie wzorca: kopia zbioru i warunek na dwóch statusach są wykrywane."""
    kopia = "const X = new Set([\n  'verified',\n  'repo_verified',\n]);"
    warunek = "family.status === 'verified' || family.status === 'repo_verified'"
    assert _DRUGA_LISTA.search(kopia)
    assert _DRUGA_LISTA.search(warunek)
    assert not _DRUGA_LISTA.search("status === 'verified'")
