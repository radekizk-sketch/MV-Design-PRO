"""Odcinki bez odbioru — JEDEN predykat końca otwartego odcinka linii albo kabla.

Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA. Odcinek (gałąź `cable` albo `line_overhead`), którego
szyna końcowa nie jest przyłączona do NICZEGO innego w modelu, kończy się w powietrzu: nie
zasila stacji, odbioru, źródła ani kolejnego odcinka. To brak MODELU (projekt nie mówi, dokąd
odcinek prowadzi), więc jest jawny w gotowości (walidator ENM `W065` →
`topology.segment_open_end`, w paśmie nN `W066` → `topology.lv_segment_open_end`) i na rysunku (słupek końca z podpisem „koniec otwarty · brak
stacji odbiorczej").

Fizycznie taki odcinek jest poprawny — kabel jałowy: rozpływ liczy jego prąd ładowania,
zwarcie na jego końcu ma impedancję zastępczą sieci i odcinka. Dlatego kod ma poziom
OSTRZEŻENIA, nie blokady obliczeń.

Szyna końcowa jest PRZYŁĄCZONA, gdy wskazuje ją jakikolwiek inny element modelu:
  * inna gałąź (dowolnego rodzaju, także łącznik i bezpiecznik) — `from_bus_ref`/`to_bus_ref`;
  * transformator — `hv_bus_ref`/`lv_bus_ref`;
  * źródło, odbiór, generator, bateria kondensatorów — `bus_ref`;
  * stacja — `bus_refs`; pole — `bus_ref` i `terminal_bus_ref` (zacisk pola SN);
  * sekcja szyn stacji (GPZ SN, GPZ WN, nN) i punkt odgałęźny — `bus_ref`.
Pomiar (`measurements[].bus_ref`) NIE przyłącza: przekładnik na szynie nie jest odbiorem ani
dalszym ciągiem sieci.

Lustro frontu: `frontend/src/ui/shared/odcinkiBezOdbioru.ts` (rysunek SLD), parytet przypięty
`frontend/src/ui/shared/__tests__/odcinkiBezOdbioru.parytet.test.ts` na każdym modelu ENM
z fikstur generowanych (oczekiwania: `tests/reference_networks/odcinki_bez_odbioru_parytet.py`).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .models import EnergyNetworkModel
from .pola import _kolekcja, _pole_rekordu, napis_lub_none

#: Kody walidatora ENM (most `domain.readiness_bridge`): koniec odcinka SN
#: (`topology.segment_open_end`) i koniec odcinka w paśmie nN (`topology.lv_segment_open_end`)
#: — dwa kody, bo naprawa jest inna (stacja SN/nN na końcu odcinka SN, odbiór nN w projekcji
#: nN stacji), a kanon przypisuje kodowi jedną akcję naprawczą.
KOD_WALIDATORA_KONIEC_OTWARTY = "W065"
KOD_WALIDATORA_KONIEC_OTWARTY_NN = "W066"

#: Rodzaje gałęzi, które są ODCINKAMI (linia napowietrzna, kabel).
RODZAJE_ODCINKA: frozenset[str] = frozenset({"cable", "line_overhead"})

#: (kolekcja, pola pojedynczej szyny) — elementy przyłączające szynę poza gałęziami.
_PRZYLACZENIA_POJEDYNCZE: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("transformers", ("hv_bus_ref", "lv_bus_ref")),
    ("sources", ("bus_ref",)),
    ("loads", ("bus_ref",)),
    ("generators", ("bus_ref",)),
    ("shunt_capacitors", ("bus_ref",)),
    ("bays", ("bus_ref", "terminal_bus_ref")),
    ("branch_points", ("bus_ref",)),
)


#: Sekcje szyn stacji (GPZ SN, GPZ WN, nN) — `bus_ref` każdej sekcji należy do stacji.
_SEKCJE_STACJI: tuple[str, ...] = ("gpz_sections", "gpz_hv_sections", "nn_sections")


@dataclass(frozen=True, order=True)
class KoniecOtwarty:
    """Koniec odcinka bez odbioru: odcinek i jego szyna końcowa bez przyłączenia."""

    odcinek_ref: str
    szyna_ref: str


def _szyny_sekcji_stacji(enm: Mapping[str, Any] | EnergyNetworkModel) -> set[str]:
    wynik: set[str] = set()
    for stacja in _kolekcja(enm, "substations"):
        for klucz in _SEKCJE_STACJI:
            sekcje = _pole_rekordu(stacja, klucz)
            for sekcja in sekcje if isinstance(sekcje, list) else []:
                if (ref := napis_lub_none(_pole_rekordu(sekcja, "bus_ref"))) is not None:
                    wynik.add(ref)
    return wynik


def konce_otwarte(enm: Mapping[str, Any] | EnergyNetworkModel) -> tuple[KoniecOtwarty, ...]:
    """Końce odcinków bez odbioru, posortowane (odcinek, szyna) — wynik deterministyczny.

    Odcinek o obu końcach bez przyłączenia (wyspa z jednego odcinka) daje dwa końce."""
    licznik: dict[str, int] = {}

    def dolicz(ref: object) -> None:
        if (napis := napis_lub_none(ref)) is not None:
            licznik[napis] = licznik.get(napis, 0) + 1

    galezie = _kolekcja(enm, "branches")
    for galaz in galezie:
        dolicz(_pole_rekordu(galaz, "from_bus_ref"))
        dolicz(_pole_rekordu(galaz, "to_bus_ref"))
    przylaczone: set[str] = set()
    for kolekcja, pola in _PRZYLACZENIA_POJEDYNCZE:
        for rekord in _kolekcja(enm, kolekcja):
            for pole in pola:
                if (ref := napis_lub_none(_pole_rekordu(rekord, pole))) is not None:
                    przylaczone.add(ref)
    for stacja in _kolekcja(enm, "substations"):
        szyny = _pole_rekordu(stacja, "bus_refs")
        for szyna in szyny if isinstance(szyny, list) else []:
            if (ref := napis_lub_none(szyna)) is not None:
                przylaczone.add(ref)
    przylaczone |= _szyny_sekcji_stacji(enm)

    wynik: set[KoniecOtwarty] = set()
    for galaz in galezie:
        if _pole_rekordu(galaz, "type") not in RODZAJE_ODCINKA:
            continue
        odcinek = napis_lub_none(_pole_rekordu(galaz, "ref_id"))
        if odcinek is None:
            continue
        konce = [
            napis_lub_none(_pole_rekordu(galaz, "from_bus_ref")),
            napis_lub_none(_pole_rekordu(galaz, "to_bus_ref")),
        ]
        for szyna in konce:
            if szyna is None or szyna in przylaczone:
                continue
            # Sam odcinek wskazuje szynę raz (pętla na jedną szynę — dwa razy); każde
            # wskazanie ponad to pochodzi od innej gałęzi.
            wlasne = konce.count(szyna)
            if licznik.get(szyna, 0) <= wlasne:
                wynik.add(KoniecOtwarty(odcinek_ref=odcinek, szyna_ref=szyna))
    return tuple(sorted(wynik))
