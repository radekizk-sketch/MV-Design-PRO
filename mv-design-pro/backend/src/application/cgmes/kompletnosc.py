"""
Bramka kompletności eksportu CGMES — nazwana odmowa zamiast pliku, który kłamie.

DLACZEGO TU (karta KASACJA-SCL-I-CIM-KLIENT, decyzja K-14/D-41). Eksport modelu
sieci ma JEDNĄ ścieżkę: ENM → ``infrastructure/cgmes`` (EQ + TP) → archiwum ZIP
(``service.export_cgmes``) → ``GET /api/cases/{case_id}/enm/eksport-cgmes``.
Klient nie buduje już żadnego pliku modelu sam. Skoro plik powstaje wyłącznie tu,
to tu musi zapaść decyzja, czy powstały graf RDF jest wymianą danych, czy pozornym
sukcesem.

CO JEST „MODELEM NIEKOMPLETNYM" DLA CGMES — trzy kryteria, każde z przyczyną:

* ``cgmes.model_pusty`` — profil EQ bez żadnego ``ConnectivityNode``. Plik byłby
  formalnie poprawnym RDF bez ani jednego węzła połączeń (ta sama klasa pozornego
  sukcesu, którą karta S9-6 zamknęła dla DXF/SCD/CIM klienta).
* ``cgmes.szyna_bez_napiecia`` — szyna z napięciem znamionowym ≤ 0 kV. Eksporter
  zapisuje z niego ``BaseVoltage.nominalVoltage``, do którego odwołuje się
  ``TopologicalNode``; napięcie bazowe ≤ 0 V nie jest wartością, którą odbiorca
  pliku może zinterpretować. Eksporter niczego nie zgaduje, więc odmawia.
* ``cgmes.zacisk_bez_szyny`` — ``Terminal`` w profilu TP wskazuje węzeł, którego
  w pliku NIE MA (element modelu odwołuje się do szyny nieobecnej w modelu).
  Wiszące ``rdf:resource`` to uszkodzony graf, nie wymiana danych.
* ``cgmes.stacja_z_szyna_spoza_modelu`` — stacja deklaruje szynę, której nie ma w
  modelu. Eksporter buduje poziomy napięć stacji z jej szyn i szynę nieobecną
  POMIJA (``_emit_substation``) — bez tej bramki plik po cichu gubiłby poziom
  napięcia stacji. Warunek jest ten sam co pominięcie w eksporterze: węzła
  ``ConnectivityNode`` tej szyny nie ma w wyprodukowanym profilu EQ.

PREDYKATY PARAMI (reguła KLASA, NIE INSTANCJA pkt 3). Kryterium trzecie NIE
powtarza listy „które elementy mają szyny" — takie drugie źródło rozjechałoby się
z eksporterem przy pierwszym nowym rodzaju elementu. Bramka czyta WYPRODUKOWANE
drzewa EQ/TP: zbiór zacisków sprawdzanych jest dokładnie zbiorem zacisków
zapisanych przez eksporter. Właściciela zacisku wskazuje ta sama tożsamość mRID
(``mrid_for("Terminal", ref_id, seq)``), którą eksporter nadał — bez klas CIM.

Braki niewymienione tu (brak źródła, brak powiązania z katalogiem, dane
zwarciowe) NIE blokują eksportu: CGMES jest wymianą danych, a eksporter pomija
atrybut, którego model nie deklaruje, zamiast go zgadywać (nagłówek
``cgmes_exporter.py``). Blokowanie ich byłoby odmową wymiany modelu w trakcie
projektowania, a nie ochroną przed plikiem uszkodzonym.

ZERO fizyki; ta warstwa nie importuje solverów ani analiz.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import TYPE_CHECKING

from enm.slownik_komunikatow import opis_obiektu
from infrastructure.cgmes.mrid import mrid_for, urn
from infrastructure.cgmes.profiles import NS_CIM, RDF_ABOUT, RDF_ID, RDF_RESOURCE

if TYPE_CHECKING:
    from enm.models import EnergyNetworkModel

_CIM = f"{{{NS_CIM}}}"

KOD_MODEL_PUSTY = "cgmes.model_pusty"
KOD_SZYNA_BEZ_NAPIECIA = "cgmes.szyna_bez_napiecia"
KOD_ZACISK_BEZ_SZYNY = "cgmes.zacisk_bez_szyny"
KOD_STACJA_Z_SZYNA_SPOZA_MODELU = "cgmes.stacja_z_szyna_spoza_modelu"

# Numery zacisków, które eksporter nadaje: 1 dla elementów jednozaciskowych,
# 1..2 dla gałęzi i transformatorów dwuuzwojeniowych.
_NUMERY_ZACISKOW = (1, 2)


@dataclass(frozen=True)
class BrakKompletnosciCgmes:
    """Jeden powód odmowy: kod maszynowy + zdanie po polsku + elementy modelu."""

    kod: str
    opis_pl: str
    element_refs: tuple[str, ...]


class ModelNiekompletnyDlaCgmesError(ValueError):
    """Model nie daje poprawnego grafu CGMES — lista nazwanych braków."""

    def __init__(self, braki: tuple[BrakKompletnosciCgmes, ...]) -> None:
        self.braki = braki
        super().__init__(self.komunikat_pl())

    def komunikat_pl(self) -> str:
        zdania = "; ".join(brak.opis_pl for brak in self.braki)
        return f"Eksport CGMES wstrzymany — model sieci jest niekompletny: {zdania}"


def _wlasciciele_zaciskow(enm: EnergyNetworkModel) -> dict[str, tuple[str, str]]:
    """``urn`` zacisku → (``ref_id``, opis) elementu modelu, który go posiada.

    Ta sama tożsamość co w eksporterze: ``mrid_for("Terminal", ref_id, numer)``.
    """
    elementy: list[tuple[object, str, str]] = []
    elementy.extend((b, b.ref_id, "Gałąź") for b in enm.branches)
    elementy.extend((t, t.ref_id, "Transformator") for t in enm.transformers)
    elementy.extend((s, s.ref_id, "Źródło zasilania") for s in enm.sources)
    elementy.extend((g, g.ref_id, "Generator") for g in enm.generators)
    elementy.extend((o, o.ref_id, "Odbiór") for o in enm.loads)
    elementy.extend((c, c.ref_id, "Bateria kondensatorów") for c in enm.shunt_capacitors)
    wlasciciele: dict[str, tuple[str, str]] = {}
    for element, ref_id, rodzaj in elementy:
        opis = opis_obiektu(element, rodzaj)
        for numer in _NUMERY_ZACISKOW:
            wlasciciele[urn(mrid_for("Terminal", ref_id, suffix=str(numer)))] = (ref_id, opis)
    return wlasciciele


def _cel(zacisk: ET.Element, wlasnosc: str) -> str:
    """mRID węzła wskazanego przez zacisk; brak odwołania = pusty napis (węzła brak)."""
    odwolanie = zacisk.find(f"{_CIM}{wlasnosc}")
    if odwolanie is None:
        return ""
    return odwolanie.get(RDF_RESOURCE, "").removeprefix("urn:uuid:")


def braki_kompletnosci_cgmes(
    enm: EnergyNetworkModel, eq: ET.Element, tp: ET.Element
) -> tuple[BrakKompletnosciCgmes, ...]:
    """Braki, przez które drzewa EQ/TP zbudowane z ``enm`` nie są wymianą danych.

    Pusta krotka = plik jest kompletnym grafem (każdy zacisk trafia w istniejący
    węzeł, każde napięcie bazowe jest dodatnie, jest co najmniej jeden węzeł).
    Kolejność braków jest deterministyczna: stała kolejność kryteriów (jak w nagłówku
    modułu), w obrębie kryterium według ``ref_id``.
    """
    braki: list[BrakKompletnosciCgmes] = []

    wezly_eq = {el.get(RDF_ID) for el in eq.iter(f"{_CIM}ConnectivityNode")}
    wezly_tp = {el.get(RDF_ID) for el in tp.iter(f"{_CIM}TopologicalNode")}

    if not wezly_eq:
        braki.append(
            BrakKompletnosciCgmes(
                kod=KOD_MODEL_PUSTY,
                opis_pl=(
                    "model nie zawiera żadnej szyny, więc plik nie miałby ani jednego "
                    "węzła połączeń"
                ),
                element_refs=(),
            )
        )

    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        if bus.voltage_kv <= 0:
            braki.append(
                BrakKompletnosciCgmes(
                    kod=KOD_SZYNA_BEZ_NAPIECIA,
                    opis_pl=(
                        f"{opis_obiektu(bus, 'Szyna')} ma napięcie znamionowe "
                        f"{bus.voltage_kv:g} kV, a napięcie bazowe w pliku musi być dodatnie"
                    ),
                    element_refs=(bus.ref_id,),
                )
            )

    wlasciciele = _wlasciciele_zaciskow(enm)
    wiszace: dict[str, str] = {}
    for zacisk in tp.iter(f"{_CIM}Terminal"):
        if (
            _cel(zacisk, "Terminal.ConnectivityNode") in wezly_eq
            and _cel(zacisk, "Terminal.TopologicalNode") in wezly_tp
        ):
            continue
        ref_id, opis = wlasciciele[zacisk.get(RDF_ABOUT, "")]
        wiszace.setdefault(ref_id, opis)
    for ref_id in sorted(wiszace):
        braki.append(
            BrakKompletnosciCgmes(
                kod=KOD_ZACISK_BEZ_SZYNY,
                opis_pl=(
                    f"{wiszace[ref_id]} jest przyłączony do szyny, której nie ma w modelu "
                    "(zacisk wskazywałby nieistniejący węzeł)"
                ),
                element_refs=(ref_id,),
            )
        )

    for stacja in sorted(enm.substations, key=lambda s: s.ref_id):
        brakujace = sorted(
            {ref for ref in stacja.bus_refs if mrid_for("ConnectivityNode", ref) not in wezly_eq}
        )
        if brakujace:
            braki.append(
                BrakKompletnosciCgmes(
                    kod=KOD_STACJA_Z_SZYNA_SPOZA_MODELU,
                    opis_pl=(
                        f"{opis_obiektu(stacja, 'Stacja')} wskazuje szyny, których nie ma w "
                        f"modelu (liczba: {len(brakujace)}), więc jej poziom napięcia "
                        "zniknąłby z pliku"
                    ),
                    element_refs=(stacja.ref_id, *brakujace),
                )
            )

    return tuple(braki)
