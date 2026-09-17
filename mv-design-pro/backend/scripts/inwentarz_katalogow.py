#!/usr/bin/env python3
"""Miernik GOTOWOSCI katalogow — pomiar, nie deklaracja.

PO CO (karta KATALOG-NIEZMIENNIKI, 2026-09-17). Zdanie „katalog X jest gotowy"
bylo dotad ETYKIETA: `catalog_status = PRODUKCYJNY_V1` wpisywano do rekordu recznie
i nikt nie liczyl, ile pol kontraktu ten rekord faktycznie niesie ani skad pochodza
jego dane. Etykieta bez pomiaru jest grozniejsza niz jej brak, bo wylacza czujnosc:
pozycja oznaczona jako produkcyjna, ktorej brakuje polowy pol opcjonalnych,
wyglada tak samo jak kompletna.

CO MIERZYMY (wszystko WYPROWADZONE, nic wpisane):
  * liczebnosc rodziny i rozklad `catalog_status` — z rejestru repozytorium;
  * KOMPLETNOSC pol z KONTRAKTU: pola dataclass, ktore moga byc puste
    (`| None` albo z wartoscia domyslna `None`), liczone jako „ile pozycji je
    niesie". Pola metadanych katalogu sa wylaczone, bo opisuja rekord, a nie wyrob;
  * PROWENIENCJE po STRUKTURZE rekordu, nie po regexie: obecnosc niepustego
    `source_reference` oraz — jesli kontrakt rodziny takie pola ma — numeru
    dokumentu, adresu zrodla albo daty publikacji. Regex po tresci przypisywalby
    proweniencje zdaniu w opisie;
  * DUPLIKATY identyfikatorow w rodzinie (wiazanie katalogowe wskazujace na dwie
    pozycje to defekt, nie niuans).

CZEGO NIE ROBIMY. Nie wprowadzamy etykiety `production_ready` ani zadnej innej
oceny wyprowadzonej z progu — miernik podaje LICZBY, a decyzje o dopuszczeniu
rodziny do doboru podejmuje czlowiek. Zadna rodzina katalogu nie ginie: komplet
rodzin jest porownywany z `RODZINY_MIERNIKA` testem parytetu.

Wynik: tabela WSTAWIANA miedzy znaczniki w
`docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (wzorzec przejety z
`scripts/generuj_slownik_kodow_gotowosci.py`), pilnowana przez
`scripts/inwentarz_katalogow_guard.py`.

Uzycie (z katalogu `backend`):
    poetry run python scripts/inwentarz_katalogow.py            # zapisuje dokument
    poetry run python scripts/inwentarz_katalogow.py --sprawdz  # RC=1 przy rozjezdzie

Kody wyjscia:
  0 = dokument aktualny (albo zapisano nowy)
  1 = dokument rozni sie od wygenerowanej tresci / brak znacznikow
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, fields, is_dataclass
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "src"))
sys.path.insert(0, str(BACKEND_DIR))

from network_model.catalog.repository import (  # noqa: E402
    CatalogRepository,
    get_default_mv_catalog,
)

REPO_ROOT = BACKEND_DIR.parent
DOKUMENT = REPO_ROOT / "docs" / "system" / "SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md"

ZNACZNIK_POCZATEK = "<!-- GENEROWANE: gotowosc katalogow — poczatek -->"
ZNACZNIK_KONIEC = "<!-- GENEROWANE: gotowosc katalogow — koniec -->"

#: Pola METADANYCH katalogu — opisuja rekord, nie wyrob, wiec nie wchodza do
#: kompletnosci danych technicznych (liczylyby sie zawsze, zawyzajac wynik).
POLA_METADANYCH: frozenset[str] = frozenset(
    {
        "verification_status",
        "source_reference",
        "catalog_status",
        "contract_version",
        "verification_note",
    }
)

#: Pola, ktorych obecnosc STRUKTURALNIE swiadczy o proweniencji dokumentowej.
#: Sprawdzamy ISTNIENIE POLA W KONTRAKCIE i jego wartosc — nigdy tresci tekstem.
POLA_PROWENIENCJI_DOKUMENTU: tuple[str, ...] = (
    "ptpiree_document_number",
    "ptpiree_source_url",
    "ptpiree_publication_date",
    "data_source",
    "standard",
    "catalog_number",
)

#: rodzina -> czytnik REJESTRU SUROWEGO repozytorium. Rejestry surowe, nie listy
#: `list_*`: listy widoczne dla projektanta pomijaja benchmarki literaturowe, a
#: miernik ma zmierzyc WSZYSTKO, co repozytorium niesie.
RODZINY_MIERNIKA: dict[str, str] = {
    "line": "line_types",
    "cable": "cable_types",
    "transformer": "transformer_types",
    "switch-equipment": "switch_equipment_types",
    "mv-apparatus": "mv_apparatus_types",
    "lv-apparatus": "lv_apparatus_types",
    "lv-cable": "lv_cable_types",
    "lv-breaker-mcb": "lv_breaker_mcb_types",
    "lv-fuse-link": "lv_fuse_link_types",
    "load": "load_types",
    "ct": "ct_types",
    "vt": "vt_types",
    "surge-arrester": "surge_arrester_types",
    "shunt-capacitor": "shunt_capacitor_types",
    "converter": "converter_types",
    "bess-battery": "bess_battery_types",
    "source-system": "source_system_types",
    "synchronous-generator": "synchronous_generator_types",
    "protection-device": "protection_device_types",
    "protection-curve": "protection_curves",
    "protection-setting-template": "protection_setting_templates",
    "ptpiree-certificate": "ptpiree_generator_certificates",
    "pv-inverter": "pv_inverter_types",
    "bess-inverter": "bess_inverter_types",
}


@dataclass(frozen=True)
class PomiarRodziny:
    """Zmierzona gotowosc JEDNEJ rodziny katalogu."""

    rodzina: str
    liczba_pozycji: int
    liczba_produkcyjnych: int
    pola_opcjonalne: int
    wypelnienie_pol_procent: float | None
    pozycje_z_proweniencja: int
    pola_proweniencji_w_kontrakcie: tuple[str, ...]
    duplikaty_id: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzina": self.rodzina,
            "liczba_pozycji": self.liczba_pozycji,
            "liczba_produkcyjnych": self.liczba_produkcyjnych,
            "pola_opcjonalne": self.pola_opcjonalne,
            "wypelnienie_pol_procent": self.wypelnienie_pol_procent,
            "pozycje_z_proweniencja": self.pozycje_z_proweniencja,
            "pola_proweniencji_w_kontrakcie": list(self.pola_proweniencji_w_kontrakcie),
            "duplikaty_id": list(self.duplikaty_id),
        }


def _pola_opcjonalne(typ: Any) -> tuple[str, ...]:
    """Pola kontraktu, ktore MOGA byc puste — czyli te, ktorych kompletnosc mierzymy.

    Pole wymagane przez konstruktor jest wypelnione w 100 % z definicji i nic nie
    mierzy; pole z wartoscia domyslna inna niz `None` (np. `contract_version`)
    tak samo. Kompletnosc ma sens wylacznie dla pol, ktorych rekord legalnie moze
    nie niesc; metadane katalogu sa z niej wylaczone, bo opisuja rekord, nie wyrob.
    """
    if not is_dataclass(typ):
        return ()
    # PREDYKAT: adnotacja kontraktu dopuszcza `None`. Pole z wartoscia domyslna
    # INNA niz `None` (np. `catalog_status: str = "REFERENCYJNY_V1"`) jest zawsze
    # wypelnione i tez nic nie mierzy — liczy sie wylacznie to, czego rekord
    # legalnie MOZE nie niesc.
    return tuple(
        sorted(
            pole.name
            for pole in fields(typ)
            if pole.name not in POLA_METADANYCH and "None" in str(pole.type)
        )
    )


def _ma_proweniencje(pozycja: Any, pola_dokumentu: tuple[str, ...]) -> bool:
    """Proweniencja STRUKTURALNA: niepuste `source_reference` albo pole dokumentu."""
    zrodlo = getattr(pozycja, "source_reference", None)
    if isinstance(zrodlo, str) and zrodlo.strip():
        return True
    for nazwa in pola_dokumentu:
        wartosc = getattr(pozycja, nazwa, None)
        if isinstance(wartosc, str) and wartosc.strip():
            return True
    return False


def zmierz_rodzine(rodzina: str, pozycje: list[Any]) -> PomiarRodziny:
    identyfikatory = [str(getattr(p, "id", "")) for p in pozycje]
    duplikaty = tuple(sorted({i for i in identyfikatory if identyfikatory.count(i) > 1}))
    if not pozycje:
        return PomiarRodziny(
            rodzina=rodzina,
            liczba_pozycji=0,
            liczba_produkcyjnych=0,
            pola_opcjonalne=0,
            wypelnienie_pol_procent=None,
            pozycje_z_proweniencja=0,
            pola_proweniencji_w_kontrakcie=(),
            duplikaty_id=duplikaty,
        )
    typ = type(pozycje[0])
    opcjonalne = _pola_opcjonalne(typ)
    nazwy_pol = {pole.name for pole in fields(typ)} if is_dataclass(typ) else set()
    pola_dokumentu = tuple(n for n in POLA_PROWENIENCJI_DOKUMENTU if n in nazwy_pol)

    wypelnione = 0
    mozliwe = len(opcjonalne) * len(pozycje)
    for pozycja in pozycje:
        for nazwa in opcjonalne:
            if getattr(pozycja, nazwa, None) is not None:
                wypelnione += 1
    wypelnienie = round(100.0 * wypelnione / mozliwe, 1) if mozliwe else None

    return PomiarRodziny(
        rodzina=rodzina,
        liczba_pozycji=len(pozycje),
        liczba_produkcyjnych=sum(
            1 for p in pozycje if str(getattr(p, "catalog_status", "")) == "PRODUKCYJNY_V1"
        ),
        pola_opcjonalne=len(opcjonalne),
        wypelnienie_pol_procent=wypelnienie,
        pozycje_z_proweniencja=sum(1 for p in pozycje if _ma_proweniencje(p, pola_dokumentu)),
        pola_proweniencji_w_kontrakcie=pola_dokumentu,
        duplikaty_id=duplikaty,
    )


def zmierz_katalog(katalog: CatalogRepository | None = None) -> tuple[PomiarRodziny, ...]:
    """Pomiar KOMPLETU rodzin, posortowany po nazwie rodziny (determinizm)."""
    katalog = katalog or get_default_mv_catalog()
    brakujace = [
        rodzina for rodzina, atrybut in RODZINY_MIERNIKA.items() if not hasattr(katalog, atrybut)
    ]
    if brakujace:
        raise RuntimeError(
            "Miernik wskazuje rejestry, ktorych repozytorium katalogu nie ma: "
            f"{', '.join(sorted(brakujace))}."
        )
    return tuple(
        zmierz_rodzine(rodzina, list(getattr(katalog, RODZINY_MIERNIKA[rodzina]).values()))
        for rodzina in sorted(RODZINY_MIERNIKA)
    )


def _liczba(wartosc: float | None) -> str:
    return "—" if wartosc is None else f"{wartosc:.1f}".replace(".", ",")


def renderuj_tabele(pomiary: tuple[PomiarRodziny, ...]) -> str:
    wiersze = [
        "| Rodzina | Pozycji | Produkcyjnych | Pól opcjonalnych w kontrakcie | "
        "Wypełnienie pól opcjonalnych [%] | Pozycji z proweniencją | Duplikaty id |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for pomiar in pomiary:
        duplikaty = ", ".join(pomiar.duplikaty_id) if pomiar.duplikaty_id else "brak"
        wiersze.append(
            f"| `{pomiar.rodzina}` | {pomiar.liczba_pozycji} | {pomiar.liczba_produkcyjnych} | "
            f"{pomiar.pola_opcjonalne} | {_liczba(pomiar.wypelnienie_pol_procent)} | "
            f"{pomiar.pozycje_z_proweniencja} | {duplikaty} |"
        )
    return "\n".join(wiersze)


def renderuj_blok_generowany(pomiary: tuple[PomiarRodziny, ...]) -> str:
    laczna_liczba = sum(p.liczba_pozycji for p in pomiary)
    laczne_produkcyjne = sum(p.liczba_produkcyjnych for p in pomiary)
    laczna_proweniencja = sum(p.pozycje_z_proweniencja for p in pomiary)
    rodziny_puste = [p.rodzina for p in pomiary if p.liczba_pozycji == 0]
    rodziny_z_duplikatami = [p.rodzina for p in pomiary if p.duplikaty_id]
    return "\n".join(
        [
            ZNACZNIK_POCZATEK,
            "",
            "> Tabela jest GENEROWANA z rejestrów repozytorium katalogu przez",
            "> `backend/scripts/inwentarz_katalogow.py`. Nie edytuj jej ręcznie —",
            "> aktualności pilnuje `scripts/inwentarz_katalogow_guard.py`.",
            "",
            renderuj_tabele(pomiary),
            "",
            f"Rodzin objętych pomiarem: {len(pomiary)}. "
            f"Pozycji łącznie: {laczna_liczba}, w tym produkcyjnych: {laczne_produkcyjne}. "
            f"Pozycji z proweniencją strukturalną: {laczna_proweniencja}.",
            "",
            "Rodziny bez ani jednej pozycji: "
            + (", ".join(f"`{r}`" for r in rodziny_puste) if rodziny_puste else "brak")
            + ".",
            "",
            "Rodziny z duplikatami identyfikatorów: "
            + (
                ", ".join(f"`{r}`" for r in rodziny_z_duplikatami)
                if rodziny_z_duplikatami
                else "brak"
            )
            + ".",
            "",
            ZNACZNIK_KONIEC,
        ]
    )


def zloz_dokument(tresc: str, blok: str) -> str:
    poczatek = tresc.find(ZNACZNIK_POCZATEK)
    koniec = tresc.find(ZNACZNIK_KONIEC)
    if poczatek < 0 or koniec < 0 or koniec < poczatek:
        raise ValueError(
            f"Brak znacznikow generowanego bloku w dokumencie: "
            f"{ZNACZNIK_POCZATEK} / {ZNACZNIK_KONIEC}"
        )
    return tresc[:poczatek] + blok + tresc[koniec + len(ZNACZNIK_KONIEC) :]


def wygeneruj_dokument(katalog: CatalogRepository | None = None) -> str:
    return zloz_dokument(
        DOKUMENT.read_text(encoding="utf-8"), renderuj_blok_generowany(zmierz_katalog(katalog))
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Miernik gotowosci katalogow.")
    parser.add_argument("--sprawdz", action="store_true", help="tylko porownaj z dokumentem")
    args = parser.parse_args(argv)

    if not DOKUMENT.exists():
        print(f"VIOLATION: brak dokumentu: {DOKUMENT}")
        return 1
    oczekiwana = wygeneruj_dokument()
    obecna = DOKUMENT.read_text(encoding="utf-8")
    if args.sprawdz:
        if obecna != oczekiwana:
            print(f"[rozjazd] {DOKUMENT}")
            print("Napraw: python backend/scripts/inwentarz_katalogow.py")
            return 1
        print(f"[ok] {DOKUMENT}")
        return 0
    DOKUMENT.write_text(oczekiwana, encoding="utf-8")
    print(f"[zapisano] {DOKUMENT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
