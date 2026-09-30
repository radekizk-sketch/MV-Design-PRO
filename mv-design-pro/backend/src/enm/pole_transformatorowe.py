"""Pole transformatorowe SN — JEDNA prawda predykatu „transformator bez pola".

DLACZEGO TEN MODUŁ ISTNIEJE (karta KOMPLETNOSC-POLA-TR, §0 pkt 2).
Karta TR2W-BEZ-POLA nauczyła RYSUNEK uczciwie pokazywać transformator, którego
dane nie wiążą z żadnym polem rozdzielni SN: symbol zostaje symbolem
transformatora, a stan niekompletny niesie dyskretny marker „!" przy stronie WN
(`frontend/src/ui/sld/v3/layout/measure.ts::implicitStationTransformers`).
Rysunek przestał kłamać, ale SAMA KONFIGURACJA nadal przechodziła przez system
bez słowa: bramka gotowości inżynierskiej nic o niej nie wiedziała, więc projekt
z transformatorem „na goło" na szynie SN dawało się doprowadzić do dokumentacji
wykonawczej.

Ten moduł jest ŹRÓDŁEM PRAWDY dla obu ról tego samego faktu:

  * OSTRZEŻENIE gotowości — `enm/validator.py` (kod `W041` → kanoniczny
    `transformer.bay_missing`, `domain/readiness_bridge.py`),
  * BRAMA DOKUMENTACJI WYKONAWCZEJ — `application/dokumentacja_wykonawcza/`.

Rysunek liczy ten sam fakt po swojej stronie (scena SLD nie odpytuje backendu w
trakcie kompozycji), więc parytet MARKER ↔ OSTRZEŻENIE nie może opierać się na
dobrej woli: pilnuje go WSPÓLNA TABLICA DECYZYJNA
`backend/schemas/pole_transformatorowe_parytet_v1.json`, czytana przez pytest
(`tests/enm/test_pole_transformatorowe.py`) i przez vitest
(`frontend/src/ui/sld/v3/layout/__tests__/parytetPolaTr.test.ts`). Jedna tablica,
dwóch konsumentów — rozjazd predykatów wywraca test po obu stronach.

REGUŁA (dyspozycja recenzenta-właściciela 2026-08-12 §7):

    Transformer.exists
    AND HV_side_connected_to_SN
    AND NOT valid_transformer_bay_configuration
    → OSTRZEŻENIE

`valid_transformer_bay_configuration` = stacja, do której należy transformator,
ma pole roli ``TR`` (kanał `Substation.meta.field_specs[].bay_role` ALBO rekord
`Bay.bay_role`; oba kanały czyta też adapter rysunku
`enmToSldAdapter.ts`, więc jeden pominięty kanał = natychmiastowy rozjazd).

CZEGO PREDYKAT NIE ROBI (zero zgadywania):
  * nie domyśla się przynależności transformatora do stacji — bierze deklarację
    `Substation.transformer_refs`, a dopiero przy jej BRAKU schodzi do
    dopasowania po szynach stacji (dokładnie ta sama kolejność, co
    `selectStationDistributionTransformers` w rysunku);
  * nie orzeka o transformatorach blokowych toru DER — wskazanie
    `Generator.blocking_transformer_ref` wyklucza transformator z obu ścieżek
    (patrz `_transformatory_stacji`: to jest ZMIERZONA GRANICA reguły, nie
    cichy wyjątek);
  * nie zgłasza niczego dla transformatora, którego strona górna nie leży na
    szynie SN tej stacji — bo wtedy nie ma mowy o polu rozdzielni SN.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import TypeAlias

from network_model.pochodne.pasma_napieciowe import szyna_poza_pasmem_sn

from .slownik_komunikatow import opis_nazwy
from .tor_pola import szyny_stacji

#: Element migawki ENM: słownik surowej migawki biegu ALBO obiekt modelu
#: (`enm.models`). Świadomie `object`, nie `Any`: `object` wymusza jawne
#: zawężenie przed użyciem (i tak robione tu `isinstance`-ami), a `Any`
#: wyłączyłby kontrolę typów w warstwie domenowej — czego pilnuje niezmiennik
#: `tests/test_professional_invariants.py::test_no_any_in_domain_types`.
ElementEnm: TypeAlias = object

# ---------------------------------------------------------------------------
# Odczyt pól niezależny od nośnika (dict migawki albo model pydantic)
# ---------------------------------------------------------------------------
# Predykat wołany jest z DWÓCH miejsc o różnym nośniku: walidator ENM trzyma
# `EnergyNetworkModel` (obiekty pydantic), a brama dokumentacji dostaje surową
# migawkę biegu (`CanonicalRun.snapshot` — słowniki). Konwersja jednego na drugi
# byłaby kosztem na każdym wywołaniu walidacji; zamiast tego czytamy pola
# jednym akcesorem.


def _pole(obiekt: ElementEnm, nazwa: str, domyslna: object = None) -> object:
    if isinstance(obiekt, Mapping):
        wartosc = obiekt.get(nazwa, domyslna)
    else:
        wartosc = getattr(obiekt, nazwa, domyslna)
    return domyslna if wartosc is None else wartosc


def _ref(obiekt: ElementEnm) -> str:
    """Referencja elementu: `ref_id`, a przy jego braku `id` (jak w rysunku)."""
    for nazwa in ("ref_id", "id"):
        wartosc = _pole(obiekt, nazwa, "")
        if isinstance(wartosc, str) and wartosc.strip():
            return wartosc.strip()
    return ""


def _teksty(wartosci: Iterable[object]) -> list[str]:
    return [w.strip() for w in wartosci if isinstance(w, str) and w.strip()]


def _lista(obiekt: ElementEnm, nazwa: str) -> list[ElementEnm]:
    """Kolekcja spod klucza — ZAWSZE lista (brak/nie-lista ⇒ pusta)."""
    wartosc = _pole(obiekt, nazwa, [])
    if isinstance(wartosc, list):
        return list(wartosc)
    if isinstance(wartosc, tuple):
        return list(wartosc)
    return []


def _tekst(obiekt: ElementEnm, nazwa: str) -> str:
    """Napis spod klucza — pusty, gdy danej nie ma albo nie jest napisem."""
    wartosc = _pole(obiekt, nazwa, "")
    return wartosc.strip() if isinstance(wartosc, str) else ""


def _liczba(obiekt: ElementEnm, nazwa: str) -> float | None:
    """Liczba spod klucza — ``None``, gdy danej nie ma (uczciwy brak, nie zero)."""
    wartosc = _pole(obiekt, nazwa, None)
    if isinstance(wartosc, bool):
        return None
    if isinstance(wartosc, int | float):
        return float(wartosc)
    return None


# ---------------------------------------------------------------------------
# Wynik predykatu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TransformatorBezPolaSN:
    """Jeden transformator SN/nN przyłączony do szyny SN stacji BEZ pola roli TR."""

    station_ref: str
    """Referencja stacji, do której należy transformator."""

    station_name: str
    """Nazwa stacji (pusta, gdy migawka jej nie niesie) — do komunikatu."""

    transformer_ref: str
    """Referencja rekordu `Transformer` — realna, nigdy fabrykowana."""

    hv_bus_ref: str
    """Szyna SN, na której leży strona górna transformatora."""

    transformer_name: str = ""
    """Nazwa transformatora z modelu (pusta, gdy migawka jej nie niesie) — do komunikatu:
    treść dla projektanta nie niesie identyfikatora (karta #142)."""


# ---------------------------------------------------------------------------
# Predykat
# ---------------------------------------------------------------------------


#: Rola katalogowa transformatora blokowego toru DER po stronie SN — zapisuje ją
#: `enm.domain_operations_v2` przy materializacji toru (``meta.catalog_role``), a operacja NIE
#: wypełnia wtedy `Generator.blocking_transformer_ref`.
ROLA_TRANSFORMATORA_BLOKOWEGO_DER = "TRANSFORMATOR_BLOKOWY_DER"


def _refy(obiekt: ElementEnm) -> set[str]:
    """Obie referencje elementu (`ref_id`, `id`) — jak `transformerRefs` w rysunku."""
    return set(_teksty([_pole(obiekt, "ref_id", ""), _pole(obiekt, "id", "")]))


def _refy_transformatorow_blokowych(generators: Sequence[ElementEnm]) -> set[str]:
    """Transformatory wskazane przez źródła jako blokowe (`blocking_transformer_ref`)."""
    refy: set[str] = set()
    for generator in generators:
        ref = _tekst(generator, "blocking_transformer_ref")
        if ref:
            refy.add(ref)
    return refy


def transformator_blokowy_der(transformator: ElementEnm, refy_blokowe: set[str]) -> bool:
    """JEDYNY filtr transformatora blokowego źródła DER — z jawnych danych, w obu kanałach:
    wskazanie `Generator.blocking_transformer_ref` albo `meta.catalog_role ==
    TRANSFORMATOR_BLOKOWY_DER`. Lustro frontu:
    `frontend/src/ui/shared/transformatoryStacji.ts::transformatorBlokowyDer`."""
    if _refy(transformator) & refy_blokowe:
        return True
    meta = _pole(transformator, "meta", {})
    return _tekst(meta, "catalog_role") == ROLA_TRANSFORMATORA_BLOKOWEGO_DER


def transformatory_stacji(
    stacja: ElementEnm,
    transformers: Sequence[ElementEnm],
    galezie: Sequence[ElementEnm],
    generators: Sequence[ElementEnm],
) -> list[ElementEnm]:
    """Transformatory ROZDZIELCZE stacji — JEDNA reguła, lustrzana wobec rysunku
    (`frontend/src/ui/shared/transformatoryStacji.ts::selectStationDistributionTransformers`,
    parytet przypięty plikiem `szynyStacjiParytet.json`, klucz `transformatory`):

      1. transformator blokowy źródła DER (`transformator_blokowy_der`) jest WYKLUCZONY —
         także wtedy, gdy stacja deklaruje go w `transformer_refs`;
      2. dalej rozstrzyga deklaracja stacji (`transformer_refs`);
      3. przy BRAKU deklaracji — koniec transformatora na szynie stacji
         (`enm.tor_pola.szyny_stacji`: szyny główne, zaciski pól SN, końce aparatów pól nN).

    GRANICA TEJ REGUŁY, ZMIERZONA I NAZWANA. Krok 1 jest szerszy, niż chciałby tego przypadek
    odwrotny: PV na szynie nN wskazuje przez auto-resolve (V12K-022, `domain_operations_v2.py`)
    JEDYNY transformator stacji jako swój blokowy. Oba kształty są w danych identyczne; skutek
    jest przypięty wierszem `tr-stacji-z-der-na-nn` tablicy `pole_transformatorowe_parytet_v1.json`
    (stacja bez ostrzeżenia i bez markera) — ZNANA GRANICA, nie cichy wyjątek.
    """
    refy_blokowe = _refy_transformatorow_blokowych(generators)
    zadeklarowane = set(_teksty(_lista(stacja, "transformer_refs")))
    szyny = szyny_stacji(stacja, galezie)
    wynik: list[ElementEnm] = []
    for transformator in transformers:
        if transformator_blokowy_der(transformator, refy_blokowe):
            continue
        if zadeklarowane:
            if _refy(transformator) & zadeklarowane:
                wynik.append(transformator)
            continue
        if (
            _tekst(transformator, "hv_bus_ref") in szyny
            or _tekst(transformator, "lv_bus_ref") in szyny
        ):
            wynik.append(transformator)
    return wynik


def stacja_ma_pole_transformatorowe(stacja: ElementEnm, bays: Sequence[ElementEnm]) -> bool:
    """Czy stacja ma pole roli ``TR`` — OBA kanały danych.

    Kanał 1: `Substation.meta.field_specs[].bay_role` (operacje stacyjne i
    szablony). Kanał 2: rekord `Bay.bay_role` z `substation_ref` tej stacji
    (`add_sn_bay`, dane starsze). Adapter rysunku czyta oba, więc pominięcie
    jednego z nich zapaliłoby marker bez ostrzeżenia albo odwrotnie.
    """
    meta = _pole(stacja, "meta", {})
    for spec in _lista(meta, "field_specs"):
        if _tekst(spec, "bay_role").upper() == "TR":
            return True

    refy_stacji = set(_teksty([_tekst(stacja, "ref_id"), _tekst(stacja, "id")]))
    for bay in bays:
        wlasciciel = _tekst(bay, "substation_ref")
        if not wlasciciel or wlasciciel not in refy_stacji:
            continue
        if _tekst(bay, "bay_role").upper() == "TR":
            return True
    return False


def transformatory_bez_pola_sn(enm: ElementEnm) -> list[TransformatorBezPolaSN]:
    """Transformatory na szynie SN stacji, dla których nie ma pola roli ``TR``.

    Wynik uporządkowany deterministycznie (stacja, transformator) — ten sam
    model daje tę samą listę, bo kolejność zgłoszeń trafia do bramki gotowości i
    do dokumentacji.
    """
    substations = _lista(enm, "substations")
    transformers = _lista(enm, "transformers")
    buses = _lista(enm, "buses")
    bays = _lista(enm, "bays")
    generators = _lista(enm, "generators")
    galezie = _lista(enm, "branches")
    szyna_wg_refu = {ref: bus for bus in buses for ref in _refy(bus)}

    znaleziska: list[TransformatorBezPolaSN] = []

    for stacja in substations:
        # SZYNY-STACJI-LUSTRO: szyny stacji z JEDNEJ reguły (`enm.tor_pola.szyny_stacji`) —
        # dawny drugi kanał `Bus.substation_ref` był martwy (model `Bus` nie ma tego pola).
        szyny = {
            ref: szyna_wg_refu[ref] for ref in szyny_stacji(stacja, galezie) if ref in szyna_wg_refu
        }
        if not szyny:
            continue
        if stacja_ma_pole_transformatorowe(stacja, bays):
            continue
        for transformator in transformatory_stacji(stacja, transformers, galezie, generators):
            hv = _tekst(transformator, "hv_bus_ref")
            if not hv or hv not in szyny:
                continue
            if szyna_poza_pasmem_sn(_liczba(szyny[hv], "voltage_kv")):
                continue
            znaleziska.append(
                TransformatorBezPolaSN(
                    station_ref=_ref(stacja),
                    station_name=_tekst(stacja, "name"),
                    transformer_ref=_ref(transformator),
                    hv_bus_ref=hv,
                    transformer_name=_tekst(transformator, "name"),
                )
            )

    znaleziska.sort(key=lambda z: (z.station_ref, z.transformer_ref))
    return znaleziska


def komunikat_braku_pola(znalezisko: TransformatorBezPolaSN) -> str:
    """Komunikat OSTRZEŻENIA — brzmienie z dyspozycji recenzenta (§7)."""
    return (
        f"{opis_nazwy(znalezisko.transformer_name, 'Transformator')} jest połączony "
        "elektrycznie z szyną SN, lecz nie posiada kompletnej konfiguracji pola "
        "transformatorowego po stronie SN."
    )
