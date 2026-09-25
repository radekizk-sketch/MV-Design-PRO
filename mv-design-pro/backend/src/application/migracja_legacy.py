"""Migracja zastanych modeli sieci legacy do ENM — JEDNA droga dla obu źródeł danych.

Model legacy (tabele `network_nodes`/`network_branches`/`network_sources`/`network_loads`
skasowane w W1 oraz sekcja `network_model` archiwów ZIP w formacie 2.x) niósł:
- węzły `{id, name, node_type, base_kv, attrs_jsonb}`,
- gałęzie `{id, name, branch_type: line|cable|transformer, from_node_id, to_node_id,
  in_service, params_jsonb}` z parametrami wpisanymi WPROST (`r_ohm_per_km`, `x_ohm_per_km`,
  `b_us_per_km`, `length_km`, `rated_current_a`, `type_ref` | `rated_power_mva`,
  `voltage_hv_kv`, `voltage_lv_kv`, `uk_percent`, `pk_kw`, `vector_group`),
- źródła `{id, node_id, source_type, payload_jsonb: {model, sk3_mva|ik3_ka, rx_ratio, …}}`,
- odbiory `{id, node_id, payload_jsonb: {p_mw, q_mvar}}`.

Te rekordy przechodzą przez TEN SAM kompilator grafu, co arkusz XLSX i budowniczy
benchmarków (`enm/kompilator_grafu.py`): typ producenta (`type_ref` obecny w katalogu
statycznym) wiąże się `catalog_ref`; parametry wpisane wprost stają się pozycją
KATALOGU PROJEKTU z proweniencją `legacy:<źródło>:<element>` i statusem NIEWERYFIKOWANY.

ZERO FABRYKACJI. Dana, której model legacy nie miał, nie jest wymyślana:
- obciążalność `0.0` (placeholder dawnego importera „wielkość nieznana") → odmowa,
- kabel bez typu katalogowego (model legacy nie niósł pojemności, temperatury, przekroju,
  liczby żył) → odmowa,
- źródło innego rodzaju niż systemowe (`model` ≠ `short_circuit_power`) → odmowa,
- gałąź wyłączona z ruchu (`in_service = False`) → odmowa (migracja nie odwzorowuje stanów
  łączeniowych),
- brak zaczepów transformatora w modelu legacy = brak regulacji (zaczep stały 0/0/0 %) —
  to WIERNE odwzorowanie modelu, w którym transformator liczył się stałą przekładnią;
  przyjęcie jest NAZWANE w `verification_note` pozycji katalogu projektu.
Odmowa (`OdmowaMigracji`) nazywa element i przyczynę; wołający (migracja bazy przy
starcie, import archiwum 2.x) zapisuje ją do manifestu — nigdy nie połyka.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from enm.katalog_projektu import STATUS_KATALOGU_PROJEKTU, STATUS_WERYFIKACJI_ARKUSZA
from enm.kompilator_grafu import (
    EdgeSpec,
    GrafDoKompilacji,
    OdbiorSpec,
    SzynaSpec,
    TransformatorSpec,
    ZrodloSpec,
)
from enm.nazwy_elementow import nazwa_elementu
from network_model.catalog.repository import get_default_mv_catalog
from network_model.pochodne import km_na_m

MODEL_ZRODLA_SYSTEMOWEGO = "short_circuit_power"


class OdmowaMigracji(ValueError):
    """Model legacy nie daje się odwzorować w ENM bez zgadywania — powód nazwany."""


def _liczba(rekord: Mapping[str, Any], klucz: str, *, element: str) -> float:
    wartosc = rekord.get(klucz)
    if wartosc is None:
        raise OdmowaMigracji(f"{element}: brak wartości '{klucz}' w modelu zastanym")
    try:
        return float(wartosc)
    except (TypeError, ValueError) as blad:
        raise OdmowaMigracji(f"{element}: '{klucz}' = {wartosc!r} nie jest liczbą") from blad


def _slug(tekst: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", str(tekst).lower()).strip("-")
    return slug or "element"


#: Rodzaj gałęzi zastanej → typ gałęzi ENM (opis rodzaju gałęzi bez nazwy, karta #144).
_TYP_ENM_GALEZI_ZASTANEJ: dict[str, str] = {
    "line": "line_overhead",
    "line_overhead": "line_overhead",
    "cable": "cable",
}


def _nazwa_galezi_zastanej(galaz: Mapping[str, Any], rodzaj: str) -> str:
    """Nazwa gałęzi zastanej z jej kolumny `name` albo polski opis rodzaju — nigdy klucz
    rekordu bazy (karta #144)."""
    if rodzaj == "transformer":
        return nazwa_elementu(galaz, "transformers")
    return nazwa_elementu(
        {"name": galaz.get("name"), "type": _TYP_ENM_GALEZI_ZASTANEJ.get(rodzaj)}, "branches"
    )


def graf_z_modelu_legacy(
    *,
    nazwa: str,
    wezly: Sequence[Mapping[str, Any]],
    galezie: Sequence[Mapping[str, Any]],
    zrodla: Sequence[Mapping[str, Any]],
    odbiory: Sequence[Mapping[str, Any]],
    proweniencja: str,
) -> GrafDoKompilacji:
    """Rekordy legacy → graf wejściowy kompilatora (parametry wprost → typy projektu)."""
    katalog = get_default_mv_catalog()
    szyny: list[SzynaSpec] = []
    napiecia: dict[str, float] = {}
    nazwy_wezlow: dict[str, str] = {}
    for wezel in wezly:
        lit = str(wezel["id"])
        nazwa_wezla = nazwa_elementu(wezel, "buses")
        napiecie = _liczba(wezel, "base_kv", element=f"węzeł '{nazwa_wezla}'")
        napiecia[lit] = napiecie
        nazwy_wezlow[lit] = nazwa_wezla
        szyny.append(SzynaSpec(lit=lit, name=nazwa_wezla, voltage_kv=napiecie))

    typy_projektu: dict[str, dict[str, dict[str, Any]]] = {
        "line_types": {},
        "cable_types": {},
        "transformer_types": {},
    }
    odcinki: list[EdgeSpec] = []
    transformatory: list[TransformatorSpec] = []
    for galaz in galezie:
        identyfikator = str(galaz["id"])
        rodzaj = str(galaz.get("branch_type") or "").lower()
        # Klucz rekordu bazy zastanej jest identyfikatorem maszynowym — nazwą gałęzi jest
        # jej nazwa z modelu zastanego albo opis rodzaju (karta #144), nigdy ten klucz.
        # Rodzaj opisu wg rodzaju gałęzi zastanej; linia z typem kabla — niżej, po typie.
        nazwa_galezi = _nazwa_galezi_zastanej(galaz, rodzaj)
        element = f"gałąź '{nazwa_galezi}'"
        if galaz.get("in_service", True) is False:
            raise OdmowaMigracji(
                f"{element}: wyłączona z ruchu — migracja nie odwzorowuje stanów łączeniowych"
            )
        od, do = str(galaz["from_node_id"]), str(galaz["to_node_id"])
        for koniec in (od, do):
            if koniec not in napiecia:
                raise OdmowaMigracji(f"{element}: węzeł '{koniec}' nie istnieje w modelu zastanym")
        params: Mapping[str, Any] = galaz.get("params_jsonb") or galaz.get("params") or {}
        if rodzaj in ("line", "line_overhead", "cable"):
            type_ref = params.get("type_ref")
            dlugosc_m = km_na_m(_liczba(params, "length_km", element=element))
            if type_ref:
                if type_ref in katalog.cable_types:
                    nazwa_kabla = _nazwa_galezi_zastanej(galaz, "cable")
                    odcinki.append(
                        EdgeSpec(
                            identyfikator, od, do, str(type_ref), dlugosc_m, "KABEL", nazwa_kabla
                        )
                    )
                    continue
                if type_ref in katalog.line_types:
                    odcinki.append(
                        EdgeSpec(
                            identyfikator, od, do, str(type_ref), dlugosc_m, "LINIA", nazwa_galezi
                        )
                    )
                    continue
                raise OdmowaMigracji(
                    f"{element}: typ katalogowy '{type_ref}' nie występuje w katalogu statycznym"
                )
            if rodzaj == "cable":
                raise OdmowaMigracji(
                    f"{element}: kabel bez typu katalogowego — model zastany nie niósł tabliczki "
                    "kabla (pojemność, temperatura, przekrój, liczba żył)"
                )
            obciazalnosc = _liczba(params, "rated_current_a", element=element)
            if obciazalnosc <= 0.0:
                raise OdmowaMigracji(
                    f"{element}: obciążalność {obciazalnosc:g} A to placeholder dawnego importera "
                    "(wielkość nieznana) — brak typu katalogowego i brak obciążalności"
                )
            catalog_ref = f"legacy-linia-{_slug(nazwa_galezi)}-{_slug(identyfikator)}"
            typy_projektu["line_types"][catalog_ref] = {
                "id": catalog_ref,
                "name": f"{nazwa_galezi} (model zastany)",
                "params": {
                    "r_ohm_per_km": _liczba(params, "r_ohm_per_km", element=element),
                    "x_ohm_per_km": _liczba(params, "x_ohm_per_km", element=element),
                    "b_us_per_km": _liczba(params, "b_us_per_km", element=element),
                    "rated_current_a": obciazalnosc,
                    "voltage_rating_kv": napiecia[od],
                    "max_temperature_c": None,
                    "cross_section_mm2": None,
                    "source_reference": f"{proweniencja}:{identyfikator}",
                    "verification_status": STATUS_WERYFIKACJI_ARKUSZA,
                    "catalog_status": STATUS_KATALOGU_PROJEKTU,
                    "verification_note": (
                        f"Napięcie znamionowe przewodu przyjęte z napięcia węzła "
                        f"'{nazwy_wezlow[od]}' "
                        f"({napiecia[od]:g} kV) — model zastany go nie niósł."
                    ),
                },
            }
            odcinki.append(
                EdgeSpec(identyfikator, od, do, catalog_ref, dlugosc_m, "LINIA", nazwa_galezi)
            )
        elif rodzaj == "transformer":
            type_ref = params.get("type_ref")
            if type_ref:
                if type_ref not in katalog.transformer_types:
                    raise OdmowaMigracji(
                        f"{element}: typ katalogowy '{type_ref}' nie występuje w katalogu "
                        "transformatorów"
                    )
                transformatory.append(
                    TransformatorSpec(identyfikator, od, do, str(type_ref), name=nazwa_galezi)
                )
                continue
            catalog_ref = f"legacy-trafo-{_slug(nazwa_galezi)}-{_slug(identyfikator)}"
            grupa = params.get("vector_group")
            if not grupa:
                raise OdmowaMigracji(f"{element}: brak grupy połączeń w modelu zastanym")
            typy_projektu["transformer_types"][catalog_ref] = {
                "id": catalog_ref,
                "name": f"{nazwa_galezi} (model zastany)",
                "params": {
                    "rated_power_mva": _liczba(params, "rated_power_mva", element=element),
                    "voltage_hv_kv": _liczba(params, "voltage_hv_kv", element=element),
                    "voltage_lv_kv": _liczba(params, "voltage_lv_kv", element=element),
                    "uk_percent": _liczba(params, "uk_percent", element=element),
                    "pk_kw": _liczba(params, "pk_kw", element=element),
                    "vector_group": str(grupa),
                    "tap_min": 0,
                    "tap_max": 0,
                    "tap_step_percent": 0.0,
                    "source_reference": f"{proweniencja}:{identyfikator}",
                    "verification_status": STATUS_WERYFIKACJI_ARKUSZA,
                    "catalog_status": STATUS_KATALOGU_PROJEKTU,
                    "verification_note": (
                        "Model zastany nie niósł danych zaczepów — przyjęto brak regulacji "
                        "(zaczep stały 0/0, krok 0 %), tak jak liczył się model zastany."
                    ),
                },
            }
            transformatory.append(
                TransformatorSpec(identyfikator, od, do, catalog_ref, name=nazwa_galezi)
            )
        else:
            raise OdmowaMigracji(f"{element}: nieznany rodzaj gałęzi '{rodzaj}'")

    rekordy_zrodel: list[ZrodloSpec] = []
    for zrodlo in zrodla:
        payload: Mapping[str, Any] = zrodlo.get("payload_jsonb") or zrodlo.get("payload") or {}
        nazwa_zrodla = nazwa_elementu(payload, "sources")
        element = f"źródło '{nazwa_zrodla}'"
        if str(payload.get("model") or "") != MODEL_ZRODLA_SYSTEMOWEGO:
            raise OdmowaMigracji(
                f"{element}: model źródła '{payload.get('model')}' — migracja odwzorowuje "
                f"wyłącznie źródło systemowe ('{MODEL_ZRODLA_SYSTEMOWEGO}')"
            )
        wezel_id = str(zrodlo["node_id"])
        if wezel_id not in napiecia:
            raise OdmowaMigracji(f"{element}: węzeł '{wezel_id}' nie istnieje w modelu zastanym")
        if payload.get("sk3_mva") is None and payload.get("ik3_ka") is None:
            raise OdmowaMigracji(f"{element}: brak mocy zwarciowej Sk'' i prądu Ik''")
        rekordy_zrodel.append(
            ZrodloSpec(
                lit=wezel_id,
                name=nazwa_zrodla,
                rx_ratio=_liczba(payload, "rx_ratio", element=element),
                sk3_mva=None if payload.get("sk3_mva") is None else float(payload["sk3_mva"]),
                ik3_ka=None if payload.get("ik3_ka") is None else float(payload["ik3_ka"]),
                sk3_min_mva=(
                    None if payload.get("sk3_min_mva") is None else float(payload["sk3_min_mva"])
                ),
                ik3_min_ka=(
                    None if payload.get("ik3_min_ka") is None else float(payload["ik3_min_ka"])
                ),
                rx_ratio_min=(
                    None if payload.get("rx_ratio_min") is None else float(payload["rx_ratio_min"])
                ),
                u_set_pu=None if payload.get("u_set_pu") is None else float(payload["u_set_pu"]),
            )
        )

    rekordy_odbiorow: list[OdbiorSpec] = []
    for odbior in odbiory:
        payload = odbior.get("payload_jsonb") or odbior.get("payload") or {}
        nazwa_odbioru = nazwa_elementu(payload, "loads")
        element = f"odbiór '{nazwa_odbioru}'"
        wezel_id = str(odbior["node_id"])
        if wezel_id not in napiecia:
            raise OdmowaMigracji(f"{element}: węzeł '{wezel_id}' nie istnieje w modelu zastanym")
        rekordy_odbiorow.append(
            OdbiorSpec(
                lit=wezel_id,
                name=nazwa_odbioru,
                p_mw=_liczba(payload, "p_mw", element=element),
                q_mvar=_liczba(payload, "q_mvar", element=element),
            )
        )

    sekcja = {
        rodzaj: [typy_projektu[rodzaj][klucz] for klucz in sorted(typy_projektu[rodzaj])]
        for rodzaj in ("line_types", "cable_types", "transformer_types")
    }
    return GrafDoKompilacji(
        name=nazwa,
        szyny=tuple(szyny),
        odcinki=tuple(odcinki),
        transformatory=tuple(transformatory),
        zrodla=tuple(rekordy_zrodel),
        odbiory=tuple(rekordy_odbiorow),
        katalog_projektu=sekcja if any(sekcja.values()) else None,
    )
