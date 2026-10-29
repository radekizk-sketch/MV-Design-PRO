"""Parytet rodzajów aparatów pola baterii kondensatorów (BKR) między backendem a frontem.

DLACZEGO. Karta UX-04/POLE-BKR-MODEL dodała dwa rodzaje aparatów pola: przekładnik
niezrównoważenia baterii (``UNBALANCE_CT``, port ``obwod`` — połączenie międzygwiazdowe) i
przekładnik napięciowy międzyfazowy (``PHASE_TO_PHASE_VT``, porty ``A`` i ``B``) — ENEA
Operator, Stacje 110 kV, Zeszyt 1 §17 s. 32 i Zał. 16. Ten sam słownik rodzajów żyje w kilku
kopiach (rekord aparatu modelu, szablon aparatu kreatora, pakiet referencyjny, słownik
tożsamości aparatu kompozycji producenta) i w ich lustrach frontu; brak rodzaju w jednej kopii
oznacza kod backendu na ekranie albo odmowę zapisu. Każda para jest tu przypięta równością.

Porty obu rodzajów żyją w JEDNEJ liście portów aparatów pola (``PORTY_APARATU_POLA``, scalenie
z kartą UX-04/POLE-LINIOWE-WZORZEC; lustro frontu ``compose/rodzajeAparatuPola.ts``, równość
całej listy przypina ``test_parytet_rodzajow_aparatu_pola.py``) — bez osobnej listy portów BKR.

ILOCZYN CECH: kopia słownika {rekord aparatu pola ``BayPrimaryDevice.kind``, szablon aparatu
``BayDeviceTemplate.kind``, pakiet referencyjny ``reference_engine.models.ApparatusKind``,
tożsamość aparatu kompozycji ``device_instance.ApparatusKind``} × strona {backend, front} ×
dana {rodzaj, porty, liczba przekładników rozładowczych}.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

from enm.models import BayPrimaryDevice
from network_model.catalog.bay_templates import BayDeviceTemplate
from network_model.catalog.rodzaje_aparatury import (
    LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII,
    PORT_FAZY_A,
    PORT_FAZY_B,
    PORT_OBWODU,
    PORTY_APARATU_POLA,
    RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO,
    RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
    RODZAJE_APARATOW_POLA_BKR,
)
from network_model.catalog.switchgear.apparatus_vocabulary import (
    APPARATUS_KIND_FOR_TEMPLATE_KIND,
    FAMILY_APPARATUS_FOR_ENM_KIND,
)
from network_model.catalog.switchgear.device_instance import (
    NAZWY_RODZAJOW_APARATU_PL,
    ApparatusKind,
)
from reference_engine.models import ApparatusKind as RodzajAparatuReferencji

FRONT = Path(__file__).resolve().parents[3] / "frontend" / "src"
LUSTRO_RODZAJOW = FRONT / "ui" / "sld" / "v3" / "compose" / "rodzajeAparatuPola.ts"
TYPY_ENM = FRONT / "types" / "enm.ts"
WYBOR_SZABLONU = FRONT / "ui" / "catalog" / "BayTemplatePicker.tsx"
KONFIGURATOR = FRONT / "ui2" / "kreatory" / "stacja" / "konfiguratorRozdzielnicy.ts"


def _unia_typu(tekst: str, poczatek: str) -> set[str]:
    """Literały unii TS od ``poczatek`` do pierwszego średnika (komentarze pominięte)."""
    indeks = tekst.index(poczatek)
    koniec = tekst.index(";", indeks)
    fragment = re.sub(r"//[^\n]*", "", tekst[indeks:koniec])
    return set(re.findall(r"'([A-Za-z_]+)'", fragment))


def _klucze_mapy(tekst: str, poczatek: str) -> set[str]:
    indeks = tekst.index(poczatek)
    otwarcie = tekst.index("= {", indeks)
    zamkniecie = tekst.index("};", otwarcie)
    fragment = re.sub(r"//[^\n]*", "", tekst[otwarcie:zamkniecie])
    return set(re.findall(r"^\s*([a-z_]+):", fragment, flags=re.MULTILINE))


def _rodzaje_rekordu_aparatu() -> set[str]:
    return set(get_args(BayPrimaryDevice.model_fields["kind"].annotation))


def test_lustro_frontu_rodzajow_i_portow_bkr_rowne_backendowi() -> None:
    tekst = LUSTRO_RODZAJOW.read_text(encoding="utf-8")
    assert (
        re.search(r"RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA = '([A-Z_]+)'", tekst).group(1)  # type: ignore[union-attr]
        == RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA
    )
    assert (
        re.search(  # type: ignore[union-attr]
            r"RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO = '([A-Z_]+)'", tekst
        ).group(1)
        == RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO
    )
    zbior_frontu = re.search(
        r"RODZAJE_APARATOW_POLA_BKR[^=]*= new Set<[^>]*>\(\[(.*?)\]\)", tekst, re.S
    )
    assert zbior_frontu, "brak zbioru RODZAJE_APARATOW_POLA_BKR w lustrze frontu"
    assert set(re.findall(r"RODZAJ_[A-Z_]+", zbior_frontu.group(1))) == {
        "RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA",
        "RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO",
    }
    assert (
        int(re.search(r"LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII = (\d+)", tekst).group(1))  # type: ignore[union-attr]
        == LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII
    )


def test_porty_bkr_w_jednej_liscie_portow_jednoznaczne_i_niepuste() -> None:
    assert RODZAJE_APARATOW_POLA_BKR <= set(PORTY_APARATU_POLA)
    for rodzaj in RODZAJE_APARATOW_POLA_BKR:
        porty = PORTY_APARATU_POLA[rodzaj]
        assert porty, rodzaj
        assert len(set(porty)) == len(porty), rodzaj
    # Przekładnik niezrównoważenia OBEJMUJE obwód (jeden port, jak przekładnik Ferrantiego),
    # przekładnik międzyfazowy ma dwa zaciski pierwotne (A, B) — nie są aparatami w torze pola.
    assert PORTY_APARATU_POLA[RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA] == (PORT_OBWODU,)
    assert PORTY_APARATU_POLA[RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO] == (
        PORT_FAZY_A,
        PORT_FAZY_B,
    )
    assert (PORT_OBWODU, PORT_FAZY_A, PORT_FAZY_B) == ("obwod", "A", "B")


def test_kazda_kopia_slownika_rodzajow_zna_aparaty_bkr() -> None:
    rekord = _rodzaje_rekordu_aparatu()
    assert RODZAJE_APARATOW_POLA_BKR <= rekord
    assert RODZAJE_APARATOW_POLA_BKR <= set(
        get_args(BayDeviceTemplate.model_fields["kind"].annotation)
    )
    # Pakiet referencyjny opisuje te same aparaty co rekord pola (silnik zgodności czyta
    # rekordy pola wprost).
    assert set(get_args(RodzajAparatuReferencji)) == rekord
    # Słownik rodziny i tożsamość aparatu kompozycji: rodzaje BKR mają wpis.
    assert RODZAJE_APARATOW_POLA_BKR <= set(FAMILY_APPARATUS_FOR_ENM_KIND)
    assert RODZAJE_APARATOW_POLA_BKR <= set(APPARATUS_KIND_FOR_TEMPLATE_KIND)


def test_rodzaj_aparatu_pola_frontu_rowny_rekordowi_backendu() -> None:
    assert (
        _unia_typu(TYPY_ENM.read_text(encoding="utf-8"), "export type BayPrimaryDeviceKind")
        == _rodzaje_rekordu_aparatu()
    )


def test_tozsamosc_aparatu_kompozycji_frontu_rowna_backendowi() -> None:
    backend = set(get_args(ApparatusKind))
    assert set(NAZWY_RODZAJOW_APARATU_PL) == backend
    assert _unia_typu(WYBOR_SZABLONU.read_text(encoding="utf-8"), "readonly apparatus_kind:") == (
        backend
    )
    assert _klucze_mapy(KONFIGURATOR.read_text(encoding="utf-8"), "NAZWY_APARATU_PL") == backend
