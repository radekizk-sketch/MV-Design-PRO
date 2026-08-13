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
  * nie orzeka o transformatorach blokowych toru DER — te mają własny ref w
    `Generator.blocking_transformer_ref` i wchodzą do wykluczenia WYŁĄCZNIE na
    ścieżce bez deklaracji stacji (deklaracja stacji jest mocniejsza od
    wskazania po stronie źródła: transformator stacji, za którym stoi PV na
    szynie nN, pozostaje transformatorem STACJI);
  * nie zgłasza niczego dla transformatora, którego strona górna nie leży na
    szynie SN tej stacji — bo wtedy nie ma mowy o polu rozdzielni SN.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# Pasma napięciowe domeny — JEDNO miejsce definicji
# ---------------------------------------------------------------------------
# Do tej karty progi żyły jako prywatne stałe `enm/validator.py`. Predykat
# potrzebuje DOKŁADNIE tych samych granic (inaczej „szyna SN" znaczyłaby co
# innego w ostrzeżeniu niż w reszcie walidacji), więc definicja przenosi się
# tutaj, a walidator staje się jej konsumentem.
PASMO_NN_MAX_KV = 1.0
"""Górna granica pasma nN (wyłącznie): `voltage_kv < 1.0` ⇒ nN."""

PASMO_SN_MAX_KV = 60.0
"""Górna granica pasma SN (włącznie): `1.0 <= voltage_kv <= 60.0` ⇒ SN."""


def pasmo_napieciowe(voltage_kv: float) -> str:
    """Pasmo napięciowe szyny: ``'nN'``, ``'SN'`` albo ``'WN'``."""
    if voltage_kv < PASMO_NN_MAX_KV:
        return "nN"
    if voltage_kv <= PASMO_SN_MAX_KV:
        return "SN"
    return "WN"


def szyna_poza_pasmem_sn(voltage_kv: float | None) -> bool:
    """Czy szyna NA PEWNO leży poza pasmem SN.

    Brak danej napięcia ⇒ ``False`` (nie dyskwalifikuje). Tolerancja jest
    ŚWIADOMA i lustrzana z rysunkiem: scena SLD bywa budowana z danych, w
    których napięcie szyny nie dotarło (`busVoltageKv = null` — uczciwy brak,
    `compose/station.ts` degraduje wtedy etykietę). Gdyby brak napięcia
    dyskwalifikował, marker znikałby z rysunku dokładnie tam, gdzie danych jest
    NAJMNIEJ — czyli tam, gdzie ostrzeżenie jest najbardziej potrzebne. Regułę
    „nieznane nie dyskwalifikuje" stosują OBIE strony (parytet, tablica
    `pole_transformatorowe_parytet_v1.json`).
    """
    if voltage_kv is None:
        return False
    return pasmo_napieciowe(float(voltage_kv)) != "SN"


# ---------------------------------------------------------------------------
# Odczyt pól niezależny od nośnika (dict migawki albo model pydantic)
# ---------------------------------------------------------------------------
# Predykat wołany jest z DWÓCH miejsc o różnym nośniku: walidator ENM trzyma
# `EnergyNetworkModel` (obiekty pydantic), a brama dokumentacji dostaje surową
# migawkę biegu (`CanonicalRun.snapshot` — słowniki). Konwersja jednego na drugi
# byłaby kosztem na każdym wywołaniu walidacji; zamiast tego czytamy pola
# jednym akcesorem.


def _pole(obiekt: Any, nazwa: str, domyslna: Any = None) -> Any:
    if isinstance(obiekt, Mapping):
        wartosc = obiekt.get(nazwa, domyslna)
    else:
        wartosc = getattr(obiekt, nazwa, domyslna)
    return domyslna if wartosc is None else wartosc


def _ref(obiekt: Any) -> str:
    """Referencja elementu: `ref_id`, a przy jego braku `id` (jak w rysunku)."""
    for nazwa in ("ref_id", "id"):
        wartosc = _pole(obiekt, nazwa, "")
        if isinstance(wartosc, str) and wartosc.strip():
            return wartosc.strip()
    return ""


def _teksty(wartosci: Iterable[Any]) -> list[str]:
    return [w.strip() for w in wartosci if isinstance(w, str) and w.strip()]


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


# ---------------------------------------------------------------------------
# Predykat
# ---------------------------------------------------------------------------


def _szyny_stacji(stacja: Any, buses: Sequence[Any]) -> dict[str, Any]:
    """Szyny stacji: z `Substation.bus_refs` ORAZ z `Bus.substation_ref`.

    Oba kanały, bo oba występują w danych: operacje stacyjne wypełniają
    `bus_refs`, a część importów wiąże szynę od jej strony. Rysunek
    (`collectStationBusRefs`) czyta tak samo.
    """
    refy_stacji = set(_teksty([_pole(stacja, "ref_id", ""), _pole(stacja, "id", "")]))
    zadeklarowane = set(_teksty(_pole(stacja, "bus_refs", []) or []))
    wynik: dict[str, Any] = {}
    for bus in buses:
        refy_szyny = _teksty([_pole(bus, "ref_id", ""), _pole(bus, "id", "")])
        nalezy = bool(zadeklarowane.intersection(refy_szyny))
        wlasciciel = _pole(bus, "substation_ref", "")
        if isinstance(wlasciciel, str) and wlasciciel.strip() in refy_stacji:
            nalezy = True
        if not nalezy:
            continue
        for ref in refy_szyny:
            wynik[ref] = bus
    return wynik


def _refy_transformatorow_blokowych(generators: Sequence[Any]) -> set[str]:
    """Transformatory wskazane przez źródła jako blokowe (`blocking_transformer_ref`)."""
    refy: set[str] = set()
    for generator in generators:
        ref = _pole(generator, "blocking_transformer_ref", "")
        if isinstance(ref, str) and ref.strip():
            refy.add(ref.strip())
    return refy


def _transformatory_stacji(
    stacja: Any,
    transformers: Sequence[Any],
    refy_szyn_stacji: set[str],
    refy_blokowe: set[str],
) -> list[Any]:
    """Transformatory NALEŻĄCE do stacji — deklaracja stacji przed dopasowaniem.

    Kolejność jest istotna i lustrzana wobec rysunku
    (`selectStationDistributionTransformers`): gdy stacja DEKLARUJE
    `transformer_refs`, to ona rozstrzyga. Wskazanie `blocking_transformer_ref`
    po stronie źródła NIE odbiera wtedy transformatorowi roli transformatora
    stacji — operacja `add_converter_source` w wariancie `block_transformer`
    ustawia je na JEDYNY transformator stacji, więc odwrotna kolejność gubiłaby
    transformator każdej stacji z PV/BESS na szynie nN.
    """
    zadeklarowane = set(_teksty(_pole(stacja, "transformer_refs", []) or []))
    if zadeklarowane:
        return [t for t in transformers if zadeklarowane.intersection(_teksty([_ref(t)]))]
    dopasowane: list[Any] = []
    for transformator in transformers:
        if _ref(transformator) in refy_blokowe:
            continue
        hv = _pole(transformator, "hv_bus_ref", "")
        lv = _pole(transformator, "lv_bus_ref", "")
        if hv in refy_szyn_stacji or lv in refy_szyn_stacji:
            dopasowane.append(transformator)
    return dopasowane


def stacja_ma_pole_transformatorowe(stacja: Any, bays: Sequence[Any]) -> bool:
    """Czy stacja ma pole roli ``TR`` — OBA kanały danych.

    Kanał 1: `Substation.meta.field_specs[].bay_role` (operacje stacyjne i
    szablony). Kanał 2: rekord `Bay.bay_role` z `substation_ref` tej stacji
    (`add_sn_bay`, dane starsze). Adapter rysunku czyta oba, więc pominięcie
    jednego z nich zapaliłoby marker bez ostrzeżenia albo odwrotnie.
    """
    meta = _pole(stacja, "meta", {}) or {}
    specyfikacje = _pole(meta, "field_specs", []) or []
    for spec in specyfikacje:
        rola = _pole(spec, "bay_role", "")
        if isinstance(rola, str) and rola.strip().upper() == "TR":
            return True

    refy_stacji = set(_teksty([_pole(stacja, "ref_id", ""), _pole(stacja, "id", "")]))
    for bay in bays:
        wlasciciel = _pole(bay, "substation_ref", "")
        if not isinstance(wlasciciel, str) or wlasciciel.strip() not in refy_stacji:
            continue
        rola = _pole(bay, "bay_role", "")
        if isinstance(rola, str) and rola.strip().upper() == "TR":
            return True
    return False


def transformatory_bez_pola_sn(enm: Any) -> list[TransformatorBezPolaSN]:
    """Transformatory na szynie SN stacji, dla których nie ma pola roli ``TR``.

    Wynik uporządkowany deterministycznie (stacja, transformator) — ten sam
    model daje tę samą listę, bo kolejność zgłoszeń trafia do bramki gotowości i
    do dokumentacji.
    """
    substations = _pole(enm, "substations", []) or []
    transformers = _pole(enm, "transformers", []) or []
    buses = _pole(enm, "buses", []) or []
    bays = _pole(enm, "bays", []) or []
    generators = _pole(enm, "generators", []) or []

    refy_blokowe = _refy_transformatorow_blokowych(generators)
    znaleziska: list[TransformatorBezPolaSN] = []

    for stacja in substations:
        szyny = _szyny_stacji(stacja, buses)
        if not szyny:
            continue
        if stacja_ma_pole_transformatorowe(stacja, bays):
            continue
        for transformator in _transformatory_stacji(
            stacja, transformers, set(szyny), refy_blokowe
        ):
            hv = _pole(transformator, "hv_bus_ref", "")
            if not isinstance(hv, str) or hv not in szyny:
                continue
            if szyna_poza_pasmem_sn(_pole(szyny[hv], "voltage_kv", None)):
                continue
            znaleziska.append(
                TransformatorBezPolaSN(
                    station_ref=_ref(stacja),
                    station_name=str(_pole(stacja, "name", "") or ""),
                    transformer_ref=_ref(transformator),
                    hv_bus_ref=hv,
                )
            )

    znaleziska.sort(key=lambda z: (z.station_ref, z.transformer_ref))
    return znaleziska


def komunikat_braku_pola(znalezisko: TransformatorBezPolaSN) -> str:
    """Komunikat OSTRZEŻENIA — brzmienie z dyspozycji recenzenta (§7)."""
    return (
        f"Transformator '{znalezisko.transformer_ref}' jest połączony elektrycznie "
        f"z szyną SN, lecz nie posiada kompletnej konfiguracji pola "
        f"transformatorowego po stronie SN."
    )
