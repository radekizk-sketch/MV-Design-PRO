"""Parytet predykatu „tę rodzinę wolno wybrać" między katalogiem a frontem.

BÓL (pomiar 2026-10-15): front trzymał TRZY własne kopie zbioru statusów rodzin dopuszczających
budowę i każda dopuszczała `user_defined`, którego backend nie dopuszcza — rozjazd cichy.
Korekta 2026-10-28 (karta UX-04/POLE-LINIOWE-WZORZEC, zakaz gazów fluorowanych w obiektach
projektowanych): dopuszczenie rodziny ma DWIE osie (status rodziny i gaz fluorowany wobec stanu
obiektu pola), więc front nie trzyma już ŻADNEJ kopii reguły — czyta pola wyliczane backendu
(`dopuszczona_do_budowania` / `powod_blokady_pl`, `dopuszczona_do_nowych_pol` /
`powod_blokady_nowych_pol_pl`) przez jedyny predykat `czyRodzinaDoBudowania`.

Strażnik przypina:

1. pola wyliczane rodziny = reguła katalogu (status ∈ `STATUSY_DOPUSZCZONE_DO_BUDOWANIA`;
   dopuszczenie do nowych pól = status ∧ brak odmowy `odmowa_gazu_fluorowanego_pl` dla obiektu
   projektowanego), dla KAŻDEJ rodziny rejestru;
2. predykat frontu czyta wyłącznie pola backendu (bez zbioru statusów i bez literału izolacji
   `'sf6'` w warunku);
3. w źródłach frontu nie ma drugiej listy statusów budowy ani drugiego warunku gazu na rodzinie.
"""

from __future__ import annotations

import re
import typing
from pathlib import Path

from network_model.catalog.gazy_fluorowane import odmowa_gazu_fluorowanego_pl
from network_model.catalog.switchgear import STATUSY_DOPUSZCZONE_DO_BUDOWANIA
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY
from network_model.catalog.switchgear.switchgear_family import (
    InsulationType,
    MediumLacznikowRodziny,
)

PROJEKT = Path(__file__).resolve().parents[3]
FRONT_SRC = PROJEKT / "frontend" / "src"
PICKER = FRONT_SRC / "ui" / "catalog" / "SwitchgearFamilyPicker.tsx"

_PREDYKAT = re.compile(
    r"export function czyRodzinaDoBudowania\((?P<sygnatura>[^)]*)\)[^{]*\{(?P<cialo>[\s\S]*?)\n\}",
)
#: Druga lista statusów budowy: oba potwierdzone statusy w odległości kilku linii.
_DRUGA_LISTA = re.compile(r"'verified'[\s\S]{0,160}?'repo_verified'")
#: Drugi warunek gazu na rodzinie: porównanie izolacji rodziny z SF6 poza pickerem.
_DRUGI_WARUNEK_GAZU = re.compile(r"insulation_type\s*[!=]==?\s*'sf6'")


def test_pola_wyliczane_rodzin_rowne_regule_katalogu() -> None:
    for ref, rodzina in SWITCHGEAR_FAMILY_REGISTRY.items():
        status_ok = rodzina.status in STATUSY_DOPUSZCZONE_DO_BUDOWANIA
        assert rodzina.dopuszczona_do_budowania is status_ok, ref
        assert (rodzina.powod_blokady_pl is None) is status_ok, ref
        odmowa_gazu = odmowa_gazu_fluorowanego_pl(
            "x", gaz_fluorowany=rodzina.gaz_fluorowany, stan_obiektu="PROJEKTOWANY"
        )
        assert rodzina.dopuszczona_do_nowych_pol is (status_ok and odmowa_gazu is None), ref
        assert (rodzina.powod_blokady_nowych_pol_pl is None) is rodzina.dopuszczona_do_nowych_pol
        # Pole istniejące: ta sama rodzina — wyłącznie oś statusu (art. 13 ust. 7 i 10).
        assert rodzina.powod_odmowy_dla_stanu("ISTNIEJACY") == rodzina.powod_blokady_pl, ref


def test_rejestr_ma_rodziny_obu_rodzajow_dopuszczenia() -> None:
    """Iloczyn cech: rodzina z gazem dopuszczona tylko do pól istniejących i rodzina bez gazu
    dopuszczona do nowych — inaczej test wyżej nie rozróżnia osi."""
    tylko_istniejace = [
        f
        for f in SWITCHGEAR_FAMILY_REGISTRY.values()
        if f.dopuszczona_do_budowania and not f.dopuszczona_do_nowych_pol
    ]
    nowe = [f for f in SWITCHGEAR_FAMILY_REGISTRY.values() if f.dopuszczona_do_nowych_pol]
    assert tylko_istniejace and all(f.gaz_fluorowany is not False for f in tylko_istniejace)
    assert nowe and all(f.gaz_fluorowany is False for f in nowe)


def test_predykat_frontu_czyta_wylacznie_pola_backendu() -> None:
    tekst = PICKER.read_text(encoding="utf-8")
    dopasowanie = _PREDYKAT.search(tekst)
    assert dopasowanie is not None, "Brak `export function czyRodzinaDoBudowania` w pickerze."
    cialo = dopasowanie.group("cialo")
    assert "dopuszczona_do_nowych_pol" in cialo and "dopuszczona_do_budowania" in cialo
    assert "status" not in cialo and "insulation_type" not in cialo
    assert "STATUSY_DO_BUDOWANIA" not in tekst, "Kopia zbioru statusów wróciła do frontu."


def test_brak_drugiej_listy_statusow_ani_warunku_gazu_we_froncie() -> None:
    naruszenia: list[str] = []
    for plik in sorted(FRONT_SRC.rglob("*.ts*")):
        if "__tests__" in plik.parts:
            continue
        tekst = plik.read_text(encoding="utf-8")
        # Plik pickera niesie unię typu statusów (`SwitchgearFamily['status']`) — to deklaracja
        # kontraktu, nie lista statusów budowy; predykat pickera przypina test wyżej.
        wzorce = (_DRUGI_WARUNEK_GAZU,) if plik == PICKER else (_DRUGA_LISTA, _DRUGI_WARUNEK_GAZU)
        for wzorzec in wzorce:
            for trafienie in wzorzec.finditer(tekst):
                linia = tekst.count("\n", 0, trafienie.start()) + 1
                naruszenia.append(f"{plik.relative_to(PROJEKT)}:{linia}")
    assert not naruszenia, (
        "Druga kopia reguły dopuszczenia rodziny we froncie (użyj `czyRodzinaDoBudowania`):\n"
        + "\n".join(naruszenia)
    )


def _klucze_slownika(nazwa: str) -> frozenset[str]:
    tekst = PICKER.read_text(encoding="utf-8")
    blok = re.search(rf"export const {nazwa}\b[\s\S]*?= \{{(?P<cialo>[\s\S]*?)\n\}};", tekst)
    assert blok is not None, nazwa
    return frozenset(re.findall(r"^\s+'?([A-Za-z0-9_]+)'?:", blok.group("cialo"), re.MULTILINE))


def test_slowniki_nazw_izolacji_i_medium_sa_lustrem_kontraktu() -> None:
    """Dwie osie gazu rodziny (izolacja × medium łączników) — nazwa PL dla KAŻDEJ wartości
    kontraktu i żadnej spoza (dawna oś `mixed`/`vacuum` rozjechała się z backendem)."""
    assert _klucze_slownika("NAZWY_IZOLACJI_RODZINY_PL") == frozenset(
        typing.get_args(InsulationType)
    )
    assert _klucze_slownika("NAZWY_MEDIUM_LACZNIKOW_PL") == frozenset(
        typing.get_args(MediumLacznikowRodziny)
    )


def test_detektory_lapia_wzorce_iniekcji() -> None:
    """Samosprawdzenie wzorców: kopia zbioru, warunek na dwóch statusach i warunek gazu."""
    kopia = "const X = new Set([\n  'verified',\n  'repo_verified',\n]);"
    warunek = "family.status === 'verified' || family.status === 'repo_verified'"
    assert _DRUGA_LISTA.search(kopia)
    assert _DRUGA_LISTA.search(warunek)
    assert not _DRUGA_LISTA.search("status === 'verified'")
    assert _DRUGI_WARUNEK_GAZU.search("rodzina.insulation_type === 'sf6'")
    assert _DRUGI_WARUNEK_GAZU.search("f.insulation_type !== 'sf6'")
