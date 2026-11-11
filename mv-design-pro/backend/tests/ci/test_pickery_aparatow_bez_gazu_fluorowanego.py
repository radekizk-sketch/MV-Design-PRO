"""Każdy picker aparatury SN we froncie filtruje pozycje JEDNYM predykatem dopuszczenia backendu.

PO CO. Zakaz gazów fluorowanych w obiektach projektowanych (rozporządzenie (UE) 2024/573, art. 13
ust. 9; karta UX-04/POLE-LINIOWE-WZORZEC) egzekwuje strażnik operacji domenowej — odmowa
`pole.gaz_fluorowany` przy zapisie. Picker, który pokazuje pozycję z SF₆ dla obiektu
projektowanego, prowadzi projektanta prosto w odmowę (a picker z domyślnym pierwszym elementem
— po cichu ją wybiera). SF₆ zostaje w katalogu (inwentaryzacja aparatów zastanych), więc filtr
musi być w KAŻDYM miejscu wyboru, nie w jednym.

KLASA, NIE INSTANCJA. Inwentarz klasy = każdy plik frontu (poza testami i klientem API), który
pobiera katalog aparatów albo łączników SN (`fetchMvApparatusTypes`, `fetchSwitchEquipmentTypes`,
`fetchTypesByCategory`). Każdy taki plik jest jednym z trzech:

1. **picker** — sam woła `pozycjeDoWyboru(` z `ui/catalog/dopuszczenieNowychPol`;
2. **delegacja** — woła nazwanego pomocnika z innego pliku, który woła `pozycjeDoWyboru(`;
3. **zwolnienie** — plik nie wybiera pozycji dla obiektu (przegląd, odczyt pozycji przypisanej);
   uzasadnienie merytoryczne przy wpisie.

Nowy konsument bez żadnej z tych ról — czerwony. Wpis listy, który przestał być konsumentem
— czerwony (lista nie gnije). Predykat czyta wyłącznie pole backendu (bez literału medium).
"""

from __future__ import annotations

import re
from pathlib import Path

PROJEKT = Path(__file__).resolve().parents[3]
FRONT_SRC = PROJEKT / "frontend" / "src"
PREDYKAT = FRONT_SRC / "ui" / "catalog" / "dopuszczenieNowychPol.ts"

_POBRANIE = re.compile(
    r"\b(fetchMvApparatusTypes|fetchSwitchEquipmentTypes|fetchTypesByCategory)\("
)
_WYWOLANIE_PREDYKATU = "pozycjeDoWyboru("
_IMPORT_PREDYKATU = re.compile(
    r"from '[./]*(?:ui/)?catalog/dopuszczenieNowychPol'|from '\./dopuszczenieNowychPol'"
)

#: Pliki pickerów — same filtrują pozycje.
PICKERY: frozenset[str] = frozenset(
    {
        "ui/catalog/TypePicker.tsx",
        "ui/field/EdytorWyposazeniaPola.tsx",
        "ui2/kreatory/lacznik/KreatorLacznikaSekcyjnego.tsx",
        "ui2/kreatory/pole/KreatorPolaSn.tsx",
        "ui2/kreatory/zrodlo/KreatorZrodloZasilania.tsx",
    }
)

#: Delegacje: konsument → (pomocnik, nazwa funkcji pomocnika wołana przez konsumenta).
DELEGACJE: dict[str, tuple[str, str]] = {
    "ui2/kreatory/stacja/KreatorStacjiSnNn.tsx": (
        "ui2/kreatory/stacja/stacjaModel.ts",
        "aparatyDlaPola(",
    ),
}

#: Zwolnienia z uzasadnieniem merytorycznym (plik nie wybiera pozycji dla obiektu).
ZWOLNIENIA: dict[str, str] = {
    "ui/catalog/TypeLibraryBrowser.tsx": (
        "przeglądarka biblioteki typów — pokazuje cały katalog, także pozycje z SF₆ potrzebne do "
        "inwentaryzacji sieci zastanej; nie przypisuje typu"
    ),
    "ui/network-build/CatalogBrowser.tsx": (
        "przeglądarka katalogów — wyłącznie przegląd (martwy przycisk przypisania usunięty); "
        "przypisanie prowadzi TypePicker albo kreator przypisania"
    ),
    "ui/network-build/inspektor-elementu/katalogiKarty.ts": (
        "odczyt pozycji JUŻ przypisanej elementowi do karty technicznej — bez wyboru pozycji"
    ),
    "ui2/kreatory/edycja-parametrow/KreatorEdycjiParametrow.tsx": (
        "odczyt pozycji JUŻ przypisanej łącznikowi (podpowiedź wartości roboczych) — kreator "
        "edytuje parametry; jedyne przypisanie katalogu w nim to przewód linii 110 kV "
        "(`NAMESPACE_PRZEWOD_LINII_WN`), nie aparat"
    ),
    "ui2/spaces/model/katalog/adapters/katalogAdapter.ts": (
        "adapter przestrzeni Katalog — przegląd pozycji (cały katalog, także SF₆ dla "
        "inwentaryzacji sieci zastanej), bez przypisania do elementu"
    ),
}

#: Zwolniony plik, który przypisuje katalog INNEJ przestrzeni — jedyna dopuszczona postać wiązania.
PRZYPISANIA_INNEJ_PRZESTRZENI: dict[str, str] = {
    "ui2/kreatory/edycja-parametrow/KreatorEdycjiParametrow.tsx": (
        "buildCatalogBinding(NAMESPACE_PRZEWOD_LINII_WN"
    ),
}

#: Zwolniony plik nie może po cichu stać się pickerem przypisania.
_SYGNALY_PRZYPISANIA = ("assign_catalog_to_element", "onSelectType")


def _wzgledna(plik: Path) -> str:
    return plik.relative_to(FRONT_SRC).as_posix()


def _konsumenci() -> dict[str, str]:
    wynik: dict[str, str] = {}
    for plik in sorted(FRONT_SRC.rglob("*.ts*")):
        if "__tests__" in plik.parts or plik.name.endswith((".test.ts", ".test.tsx")):
            continue
        sciezka = _wzgledna(plik)
        if sciezka == "ui/catalog/api.ts":
            continue
        tekst = plik.read_text(encoding="utf-8")
        if _POBRANIE.search(tekst):
            wynik[sciezka] = tekst
    return wynik


def test_kazdy_konsument_katalogu_aparatow_ma_role() -> None:
    znane = PICKERY | set(DELEGACJE) | set(ZWOLNIENIA)
    bez_roli = sorted(set(_konsumenci()) - znane)
    assert not bez_roli, (
        "Konsument katalogu aparatów/łączników SN bez filtra dopuszczenia "
        "(`ui/catalog/dopuszczenieNowychPol.pozycjeDoWyboru`) ani uzasadnionego zwolnienia:\n"
        + "\n".join(bez_roli)
    )


def test_lista_rol_nie_gnije() -> None:
    konsumenci = set(_konsumenci())
    nieaktualne = sorted((PICKERY | set(DELEGACJE) | set(ZWOLNIENIA)) - konsumenci)
    assert not nieaktualne, f"Wpisy listy, które nie pobierają już katalogu: {nieaktualne}"
    assert not (PICKERY & set(ZWOLNIENIA)) and not (PICKERY & set(DELEGACJE))


def test_pickery_wolaja_predykat() -> None:
    konsumenci = _konsumenci()
    braki = sorted(
        p
        for p in PICKERY
        if _WYWOLANIE_PREDYKATU not in konsumenci[p] or not _IMPORT_PREDYKATU.search(konsumenci[p])
    )
    assert not braki, braki


def test_delegacje_prowadza_do_predykatu() -> None:
    konsumenci = _konsumenci()
    for konsument, (pomocnik, wywolanie) in DELEGACJE.items():
        assert wywolanie in konsumenci[konsument], (konsument, wywolanie)
        tekst = (FRONT_SRC / pomocnik).read_text(encoding="utf-8")
        assert _WYWOLANIE_PREDYKATU in tekst and _IMPORT_PREDYKATU.search(tekst), pomocnik


def test_zwolnione_nie_przypisuja_typu() -> None:
    konsumenci = _konsumenci()
    naruszenia = sorted(
        (p, s)
        for p in ZWOLNIENIA
        for s in _SYGNALY_PRZYPISANIA
        if s in konsumenci[p] and p not in PRZYPISANIA_INNEJ_PRZESTRZENI
    )
    assert not naruszenia, naruszenia
    for plik, wiazanie in PRZYPISANIA_INNEJ_PRZESTRZENI.items():
        tekst = konsumenci[plik]
        # Każde wiązanie katalogu w pliku jest wiązaniem przewodu linii 110 kV.
        assert tekst.count("buildCatalogBinding(") == tekst.count(wiazanie) >= 1, plik
        assert "onSelectType" not in tekst, plik
    assert all(len(uzasadnienie) > 40 for uzasadnienie in ZWOLNIENIA.values())


def test_predykat_czyta_wylacznie_pole_backendu() -> None:
    tekst = PREDYKAT.read_text(encoding="utf-8")
    cialo = re.search(
        r"export function czyPozycjaDoWyboru\([\s\S]*?\): boolean \{(?P<cialo>[\s\S]*?)\n\}", tekst
    )
    assert cialo is not None
    tresc = cialo.group("cialo")
    assert "dopuszczony_do_nowych_pol === true" in tresc, "Brak pola ≠ dopuszczenie."
    assert "'ISTNIEJACY'" in tresc
    assert "medium" not in tresc and "SF6" not in tresc and "gaz_fluorowany" not in tresc


def test_front_nie_rozstrzyga_gazu_z_medium() -> None:
    """Druga kopia reguły: decyzja na porównaniu medium z SF6 gdziekolwiek we froncie."""
    wzorzec = re.compile(r"medium\s*[!=]==?\s*'SF6'|'SF6'\s*[!=]==?\s*\w*medium", re.IGNORECASE)
    naruszenia: list[str] = []
    for plik in sorted(FRONT_SRC.rglob("*.ts*")):
        if "__tests__" in plik.parts:
            continue
        tekst = plik.read_text(encoding="utf-8")
        for trafienie in wzorzec.finditer(tekst):
            linia = tekst.count("\n", 0, trafienie.start()) + 1
            naruszenia.append(f"{_wzgledna(plik)}:{linia}")
    assert not naruszenia, naruszenia


def test_detektory_lapia_wzorce() -> None:
    assert _POBRANIE.search("fetchMvApparatusTypes()")
    assert _POBRANIE.search("Promise.all([fetchSwitchEquipmentTypes(), x])")
    assert not _POBRANIE.search("import { fetchMvApparatusTypes } from")
    assert _IMPORT_PREDYKATU.search("from '../../../ui/catalog/dopuszczenieNowychPol'")
    assert _IMPORT_PREDYKATU.search("from '../catalog/dopuszczenieNowychPol'")
    assert _IMPORT_PREDYKATU.search("from './dopuszczenieNowychPol'")
