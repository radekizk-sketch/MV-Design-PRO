"""Serwis aplikacyjny: siła sieci (SCR/WSCR) dla źródeł falownikowych.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
zwarciowego (``short_circuit_sn``) oraz dane modelu (moc zainstalowana źródeł
falownikowych IBG w węźle przyłączenia) i buduje wejścia dla gotowego buildera
interpretacji ``analysis.grid_strength``. ZERO obliczeń fizycznych — moc zwarciowa
S_sc'' pochodzi z solvera IEC 60909, moc zainstalowana z karty przekształtnika
zmaterializowanej w elemencie ENM.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``s_sc_mva`` ← ``build_short_circuit_results(run)`` → wiersz ``sk_mva`` per węzeł
  (``enm.canonical_analysis.build_short_circuit_results``),
- ``s_installed_mva`` ← suma ``materialized_params.sn_mva`` przekształtników źródeł IBG
  w węźle — WYŁĄCZNIE z migawki modelu przebiegu. Karta AB-H0 Pakiet D: skasowany
  odczyt zapasowy ``ConverterType.sn_mva`` z katalogu STATYCZNEGO po ``catalog_ref``
  (omijał materializację i katalog projektu modelu; wynik zależał od stanu katalogu w
  chwili odczytu, nie od modelu, na którym liczono zwarcie).
"""

from __future__ import annotations

from typing import Any

from analysis.grid_strength.builder import GridStrengthBuilder
from analysis.grid_strength.models import (
    BusSourceModule,
    BusStrengthInput,
    GridStrengthContext,
)
from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
from application.autorytet_biegu_zwarciowego import wymagaj_zakresu_biegu
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results
from enm.dane_przyjete_galezi import (
    dane_przyjete_galezi_wiersza,
    pola_danych_przyjetych_wiersza,
)
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE
from enm.nazwy_elementow import nazwa_elementu
from enm.tor_pola import szyna_raportowa
from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaDanychError
from werdykt import DanaPrzyjeta

# Źródła falownikowe (Inverter-Based Generation) — SCR dotyczy punktu przyłączenia
# źródeł energoelektronicznych; zbiór = kanoniczny `GEN_TYPES_PRZEKSZTALTNIKOWE`
# (karta AB-H0 Pakiet D: lokalna kopia skasowana, parytet w
# `tests/enm/test_gen_types_przeksztaltnikowe.py`). Generatory synchroniczne pominięte.


def resolve_n_parallel(gen: dict[str, Any]) -> int:
    """Krotność jednostek równoległych źródła IBG (``n_parallel``).

    Źródło: ``gen['n_parallel']`` lub ``materialized_params['n_parallel']``
    (materializacja pola ENM ``GenModel.n_parallel``). Brak/None/≤0 → 1
    (pojedyncza jednostka — uczciwie, bez fabrykowania krotności).
    """
    raw = gen.get("n_parallel")
    if raw is None:
        materialized = gen.get("materialized_params") or {}
        raw = materialized.get("n_parallel")
    if raw is None:
        return 1
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 1
    return value if value > 0 else 1


def _installed_mva_for_generator(gen: dict[str, Any]) -> float | None:
    """Moc pozorna zainstalowana źródła IBG [MVA] z danych modelu.

    Moc znamionowa pojedynczej jednostki S_n (``materialized_params.sn_mva`` —
    karta zmaterializowana w elemencie, jedyne źródło) przemnożona przez krotność
    jednostek równoległych ``n_parallel`` (``resolve_n_parallel``; brak/None → 1):
    moc zainstalowana = S_n × n_parallel. Brak S_n → None.
    """
    materialized = gen.get("materialized_params") or {}
    unit_sn: float | None = None
    sn_mva = materialized.get("sn_mva")
    if sn_mva is not None:
        try:
            value = float(sn_mva)
        except (TypeError, ValueError):
            value = 0.0
        if value > 0.0:
            unit_sn = value
    if unit_sn is None:
        return None
    return unit_sn * resolve_n_parallel(gen)


def _installed_mva_by_bus(snapshot: dict[str, Any]) -> dict[str, float | None]:
    """Suma mocy zainstalowanej źródeł IBG per węzeł (ref_id szyny).

    Agreguje po WSZYSTKICH elementach-źródłach IBG przyłączonych do danej szyny
    (test: „suma mocy wielu źródeł w jednym węźle"). Gdy KTÓRYKOLWIEK generator
    w węźle ma nieznaną moc znamionową (``_installed_mva_for_generator`` →
    ``None``), suma CAŁEGO węzła jest ``None`` — nie da się uczciwie podać
    sumy zainstalowanej mocy, gdy jeden ze składników jest nieznany, niezależnie
    od tego, czy w tym samym węźle są też generatory o znanej mocy (FAB-E, E1:
    brak wyniku ≠ zero).

    Poprzednia wersja trzymała ``0.0`` jako sentinel „nieznane" i wpisywała go
    WYŁĄCZNIE przez ``setdefault`` — gdy w tym samym węźle wcześniej lub później
    trafił generator o ZNANEJ mocy, jego suma cicho „wygrywała" i sentinel nigdy
    nie był widoczny (defekt KLASA NIE INSTANCJA: ten sam plik ma trzy siostrzane
    funkcje — ``_sk_mva_by_bus``, ``_nominal_kv_by_bus``, ``BusSourceModule.sn_mva``
    przez ``_modules_by_bus`` — i wszystkie poprawnie zwracają ``float | None``;
    tylko ta jedna używała fikcyjnego zera zamiast jawnego braku).
    """
    suma: dict[str, float] = {}
    nieznane: set[str] = set()
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        if str(gen.get("gen_type") or "") not in GEN_TYPES_PRZEKSZTALTNIKOWE:
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str):
            continue
        installed = _installed_mva_for_generator(gen)
        if installed is None:
            nieznane.add(bus_ref)
            suma.setdefault(bus_ref, 0.0)
            continue
        suma[bus_ref] = suma.get(bus_ref, 0.0) + installed
    return {bus_ref: (None if bus_ref in nieznane else total) for bus_ref, total in suma.items()}


def _modules_by_bus(snapshot: dict[str, Any]) -> dict[str, tuple[BusSourceModule, ...]]:
    """Moduły źródłowe IBG per węzeł (ref_id szyny) — metadana opisowa (P47b).

    ADDYTYWNE: nie zmienia pól istniejących ani odcisku analizy. Iteruje te same
    źródła co ``_installed_mva_by_bus`` (typy IBG z ``bus_ref``), lecz wymaga
    identyfikatora modułu (``ref_id``) — bez niego moduł nie jest mapowalny na
    węzeł, więc jest pomijany (uczciwie, bez fabrykowania referencji). Udział mocy
    modułu = ``_installed_mva_for_generator`` (``None`` gdy nieznana). Kolejność
    modułów w węźle deterministyczna (sort po ``ref``).
    """
    grouped: dict[str, list[BusSourceModule]] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        if str(gen.get("gen_type") or "") not in GEN_TYPES_PRZEKSZTALTNIKOWE:
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str):
            continue
        ref = gen.get("ref_id")
        if not isinstance(ref, str):
            continue
        name = gen.get("name")
        module = BusSourceModule(
            ref=ref,
            name=nazwa_nadana(name),
            sn_mva=_installed_mva_for_generator(gen),
        )
        grouped.setdefault(bus_ref, []).append(module)
    return {
        bus_ref: tuple(sorted(modules, key=lambda m: m.ref)) for bus_ref, modules in grouped.items()
    }


def _sk_mva_by_bus(run: CanonicalRun) -> dict[str, float | None]:
    """Moc zwarciowa S_sc'' [MVA] per węzeł (ref_id szyny) z wyniku IEC 60909."""
    out: dict[str, float | None] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        bus_ref = row.get("element_id")
        if not isinstance(bus_ref, str):
            continue
        sk = row.get("sk_mva")
        out[bus_ref] = float(sk) if sk is not None else None
    return out


def _dane_przyjete_by_bus(run: CanonicalRun) -> dict[str, dict[str, Any]]:
    """Karta LINIA-110: pola danych przyjętych S_sc'' per węzeł — z TEGO SAMEGO wiersza co
    moc zwarciowa (`pola_danych_przyjetych_wiersza`); węzeł bez danych przyjętych nie ma wpisu."""
    out: dict[str, dict[str, Any]] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        bus_ref = row.get("element_id")
        pola = pola_danych_przyjetych_wiersza(row)
        if isinstance(bus_ref, str) and pola:
            out[bus_ref] = pola
    return out


def _rekordy_danych_przyjetych_by_bus(run: CanonicalRun) -> dict[str, tuple[DanaPrzyjeta, ...]]:
    """Dane przyjęte S_sc'' per węzeł jako rekordy dowodu werdyktu — z TEGO SAMEGO wiersza
    zwarciowego co pola ``_dane_przyjete_by_bus`` (jedno źródło)."""
    out: dict[str, tuple[DanaPrzyjeta, ...]] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        bus_ref = row.get("element_id")
        dane = dane_przyjete_galezi_wiersza(row)
        if isinstance(bus_ref, str) and dane:
            out[bus_ref] = tuple(dane)
    return out


def _nazwy_wezlow(snapshot: dict[str, Any]) -> dict[str, str]:
    """Nazwa węzła z modelu (albo opis rodzaju) per ``ref_id`` — przedmiot rekordu werdyktu."""
    return {
        str(bus["ref_id"]): nazwa_elementu(bus, "buses")
        for bus in snapshot.get("buses") or []
        if isinstance(bus, dict) and isinstance(bus.get("ref_id"), str)
    }


def _nominal_kv_by_bus(snapshot: dict[str, Any]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for bus in snapshot.get("buses") or []:
        if not isinstance(bus, dict):
            continue
        ref_id = bus.get("ref_id")
        if not isinstance(ref_id, str):
            continue
        kv = bus.get("voltage_kv")
        out[ref_id] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> GridStrengthContext:
    header = (run.snapshot or {}).get("header") or {}
    return GridStrengthContext(
        project_name=nazwa_nadana(header.get("name")),
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


def build_grid_strength_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok siły sieci (SCR/WSCR) dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub
            nie został zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise OdmowaDanychError(
            "Siła sieci (SCR/WSCR) wymaga przebiegu zwarciowego; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise OdmowaDanychError(
            f"Przebieg nie jest zakończony (stan: {stan_przebiegu_pl(run.status)}); "
            "wynik zwarciowy nie jest dostępny."
        )
    # Karta OD-14: wynik zwarcia przez impedancję przejścia Z_f poza zakresem tej
    # zdolności — odmowa SI-117 (jedno źródło: `blokady_zakresu_biegu`).
    wymagaj_zakresu_biegu(run, ZdolnoscMiarodajna.REGULATORY_EVIDENCE)

    snapshot = run.snapshot or {}
    installed_by_bus = _installed_mva_by_bus(snapshot)
    sk_by_bus = _sk_mva_by_bus(run)
    kv_by_bus = _nominal_kv_by_bus(snapshot)
    modules_by_bus = _modules_by_bus(snapshot)
    nazwy = _nazwy_wezlow(snapshot)
    dane_rekordow = _rekordy_danych_przyjetych_by_bus(run)

    inputs = [
        BusStrengthInput(
            bus_ref=bus_ref,
            nominal_kv=kv_by_bus.get(bus_ref),
            # Wytwórca na zacisku pola (POLA-W-TORZE) — zacisk jest szyną pomocniczą bez
            # własnego wiersza zwarciowego; ten sam węzeł elektryczny raportuje szyna pola
            # (`enm.tor_pola.szyna_raportowa`, jedno źródło dla konsumentów wyniku).
            s_sc_mva=sk_by_bus.get(szyna_raportowa(snapshot, bus_ref)),
            # `_installed_mva_by_bus` już zwraca `None` dla węzła z nieznaną
            # mocą zainstalowaną — przekazanie wprost, bez własnej translacji.
            s_installed_mva=installed,
            modules=modules_by_bus.get(bus_ref, ()),
            nazwa_pl=nazwy.get(bus_ref),
            dane_przyjete=dane_rekordow.get(szyna_raportowa(snapshot, bus_ref), ()),
        )
        for bus_ref, installed in installed_by_bus.items()
    ]

    view = GridStrengthBuilder().build(inputs, context=_context(run)).to_dict()
    # Karta LINIA-110 (kontrakt werdyktu §3): SCR liczony z S_sc'' stojącej na danej przyjętej
    # gałęzi (linia 110 kV z wartością roboczą geometrii) — pozycja niesie ją addytywnie.
    dane_by_bus = _dane_przyjete_by_bus(run)
    for entry in view.get("entries") or []:
        # Ten sam węzeł raportowy co S_sc'' wejścia (zacisk pola → szyna pola) — pola danych
        # przyjętych i moc zwarciowa z JEDNEGO wiersza (predykaty parami).
        entry.update(dane_by_bus.get(szyna_raportowa(snapshot, str(entry.get("bus_ref"))), {}))
    return view
