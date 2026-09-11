#!/usr/bin/env python3
"""MACIERZ GOTOWOŚCI KATALOGÓW — pomiar, nie deklaracja (kanon §17/§23/§31-I).

Dla KAŻDEJ rodziny katalogu mierzy i klasyfikuje:

  * liczbę rekordów,
  * kompletność pól WYMAGANYCH przez obliczenia, które z tej rodziny korzystają,
  * proweniencję: ile pozycji wskazuje DOKUMENT ZEWNĘTRZNY (numer katalogu
    producenta albo normę), ile tylko etykietę wewnętrzną projektu,
  * rozkład `verification_status` / `catalog_status`,
  * duplikaty identyfikatorów.

DWA OSTRZEŻENIA METODYCZNE WBUDOWANE W TEN SKRYPT (obie pomyłki popełnione i
naprawione przy jego pisaniu — zapisane, żeby nie wróciły):

1. NAZWY PÓL CZYTAMY Z KONTRAKTU, nie z pamięci. Pierwsza wersja pytała o
   `primary_a`, `i_th_a`, `q_mvar` — nazwy, których kontrakt nie ma — i
   raportowała 0 % kompletności tam, gdzie dane BYŁY pod nazwami
   `ratio_primary_a`, `ith_1s_a`, `rated_mvar`. Fałszywy brak danych jest
   gorszy niż brak pomiaru, bo wygląda na wynik.

2. POLE WYPROWADZALNE TO NIE BRAK. `idyn_ka_peak` (CT) wyprowadza się z
   `ith_ka_1s` wg IEC 61869-2, a `ith_1s_a` (przewody) z `jth_1s_a_per_mm2`
   i przekroju wg IEC 60949 — katalog TRZYMA podstawę, a nie wynik, i to jest
   poprawna proweniencja (§19: DERIVED oddzielone od DIRECT). Takie pola są tu
   oznaczone jako WYPROWADZALNE i nie liczą się jako brak.

Uruchomienie:
    cd backend && poetry run python scripts/inwentarz_katalogow.py [--json]
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from network_model.catalog import get_default_mv_catalog  # noqa: E402

#: Numer dokumentu producenta albo oznaczenie normy — świadectwo ZEWNĘTRZNEGO źródła.
_DOKUMENT_ZEWNETRZNY = re.compile(
    r"\b(1S[DPX][A-Z]\d{6,}|1VCP\d{6,}|[A-Z]{2,}\d{4,}[A-Z]?\d*"
    r"|PN-EN\s*\d+|PN-HD\s*\d+|IEC\s*\d{4,}|EN\s*\d{4,}|VDE\s*\d+)",
    re.I,
)
#: Etykiety, które opisują pochodzenie WEWNĘTRZNE (matryca projektu, profil własny).
_ETYKIETY_WEWNETRZNE = ("MV-DESIGN-PRO", "matryca katalogowa", "profil przemyslowy")
#: Dane, których producent nie publikuje, bo nie są jego — warunki przyłączenia
#: OSD, standard projektowy operatora, profil odbioru. Brak numeru katalogowego
#: jest tu stanem POPRAWNYM i nie może być raportowany jako luka proweniencji.
_ZRODLO_PROJEKTOWE = re.compile(
    r"(warunki\s+przylaczenia|standard\s+(projektowy|OSD)|OSD\b|profil(e)?\s+"
    r"(referencyjne|odbior))",
    re.I,
)

#: Pola wymagane przez obliczenia korzystające z rodziny — nazwy Z KONTRAKTU.
WYMAGANE: dict[str, tuple[str, ...]] = {
    "cable_types": (
        "r_ohm_per_km",
        "x_ohm_per_km",
        "rated_current_a",
        "cross_section_mm2",
        "voltage_rating_kv",
        "conductor_material",
    ),
    "line_types": (
        "r_ohm_per_km",
        "x_ohm_per_km",
        "rated_current_a",
        "cross_section_mm2",
        "voltage_rating_kv",
        "conductor_material",
    ),
    "lv_cable_types": (
        "r_ohm_per_km",
        "x_ohm_per_km",
        "i_max_a",
        "cross_section_mm2",
        "u_n_kv",
        "conductor_material",
    ),
    "transformer_types": (
        "rated_power_mva",
        "voltage_hv_kv",
        "voltage_lv_kv",
        "uk_percent",
        "pk_kw",
        "vector_group",
    ),
    "mv_apparatus_types": ("u_n_kv", "i_n_a", "device_kind"),
    "switch_equipment_types": ("un_kv", "in_a", "equipment_kind", "u_m_kv"),
    "lv_apparatus_types": ("u_n_kv", "i_n_a", "device_kind", "u_m_kv"),
    "lv_breaker_mcb_types": ("in_a", "icn_ka", "u_n_kv", "curve_class"),
    "lv_fuse_link_types": ("in_a", "u_n_kv", "breaking_capacity_ka", "fuse_class"),
    "ct_types": (
        "ratio_primary_a",
        "ratio_secondary_a",
        "accuracy_class",
        "burden_va",
        "ith_ka_1s",
    ),
    "vt_types": (
        "ratio_primary_v",
        "ratio_secondary_v",
        "accuracy_class",
        "burden_va",
        "rated_voltage_factor",
    ),
    "surge_arrester_types": ("u_rated_kv", "mcov_kv", "u_residual_at_10ka_kv", "energy_class"),
    "shunt_capacitor_types": ("rated_mvar", "rated_kv", "loss_kw"),
    "source_system_types": ("voltage_rating_kv", "sk3_mva", "rx_ratio", "earthing_system"),
    "load_types": ("p_kw", "a_p", "b_p", "c_p", "a_q", "b_q", "c_q"),
    "converter_types": ("sn_mva", "un_kv", "pmax_mw", "qmin_mvar", "qmax_mvar"),
    "inverter_types": ("sn_mva", "un_kv", "pmax_mw", "qmin_mvar", "qmax_mvar"),
    "pv_inverter_types": ("s_n_kva", "un_kv", "p_max_kw", "cos_phi_min", "cos_phi_max"),
    "bess_inverter_types": ("s_n_kva", "un_kv", "p_charge_kw", "p_discharge_kw", "e_kwh"),
    "protection_device_types": ("vendor", "series"),
    "protection_curves": (),
    "protection_setting_templates": (),
    "ptpiree_generator_certificates": (),
}

#: Pola, których katalog świadomie NIE trzyma, bo wyprowadza je norma z danych,
#: które trzyma. Nazwane jawnie, żeby nie wracały w raporcie jako „brak".
WYPROWADZALNE: dict[str, dict[str, str]] = {
    "cable_types": {"ith_1s_a": "IEC 60949: I_th = J_th · S (pole `jth_1s_a_per_mm2`)"},
    "line_types": {"ith_1s_a": "IEC 60949: I_th = J_th · S (pole `jth_1s_a_per_mm2`)"},
    "lv_cable_types": {"ith_1s_a": "IEC 60949: I_th = J_th · S (pole `jth_1s_a_per_mm2`)"},
    "ct_types": {"idyn_ka_peak": "IEC 61869-2: I_dyn = 2,5 · I_th (pole `ith_ka_1s`)"},
}


def _slownik(obj: object) -> dict[str, object]:
    try:
        return dataclasses.asdict(obj)  # type: ignore[arg-type]
    except Exception:
        return {
            k: getattr(obj, k)
            for k in dir(obj)
            if not k.startswith("_") and not callable(getattr(obj, k))
        }


#: Pola, których SAMA OBECNOŚĆ świadczy o źródle zewnętrznym — mocniejszy sygnał
#: niż dopasowanie wzorca do tekstu. Wykaz PTPiREE („PTPiREE Wykaz urzadzen 1.2,
#: publikacja 2026-05-06") jest dokumentem zewnętrznym, choć nie ma numeru w
#: kształcie normy: pierwsza wersja tego skryptu klasyfikowała 6887 certyfikatów
#: jako „bez źródła zewnętrznego", czyli produkowała FAŁSZYWY brak proweniencji.
_POLA_DOKUMENTU_ZEWNETRZNEGO = (
    "document_number",
    "source_url",
    "ptpiree_document_number",
    "ptpiree_source_url",
)


def _klasa_zrodla(dane: dict[str, object]) -> str:
    """Klasa proweniencji pozycji — z pól STRUKTURALNYCH, potem z treści opisu."""
    if any(str(dane.get(pole) or "").strip() for pole in _POLA_DOKUMENTU_ZEWNETRZNEGO):
        return "DOKUMENT_ZEWNETRZNY"
    tekst = str(dane.get("source_reference") or "").strip()
    if not tekst:
        return "BRAK"
    if _DOKUMENT_ZEWNETRZNY.search(tekst):
        return "DOKUMENT_ZEWNETRZNY"
    if _ZRODLO_PROJEKTOWE.search(tekst):
        # Dana, której producent NIE publikuje, bo nie jest jego: warunki
        # przyłączenia OSD, standard projektowy, profil odbioru. Brak numeru
        # katalogowego jest tu POPRAWNY, nie brakujący — klasa osobna, żeby nie
        # mieszać jej z serią wymyśloną wewnętrznie.
        return "ZRODLO_PROJEKTOWE_OSD"
    if any(w.lower() in tekst.lower() for w in _ETYKIETY_WEWNETRZNE):
        return "ETYKIETA_WEWNETRZNA"
    return "OPIS_BEZ_NUMERU"


def _klasyfikacja(liczba: int, kompletnosc: float | None, zrodla: dict[str, int]) -> str:
    """Klasa gotowości rodziny wg §17 — wyłącznie z POMIARU, bez oceny uznaniowej."""
    if liczba == 0:
        return "MISSING"
    if kompletnosc is not None and kompletnosc < 100.0:
        return "DATA_INCOMPLETE"
    zewnetrzne = zrodla.get("DOKUMENT_ZEWNETRZNY", 0)
    projektowe = zrodla.get("ZRODLO_PROJEKTOWE_OSD", 0)
    if zewnetrzne + projektowe == liczba:
        # Pozycja o źródle projektowym/OSD jest kompletna tak samo jak pozycja z
        # kartą producenta — po prostu jej źródłem nie jest producent.
        return "PRODUCTION_READY"
    if zewnetrzne + projektowe == 0:
        return "PARTIAL_BEZ_ZRODLA_ZEWNETRZNEGO"
    return "PARTIAL_ZRODLA_MIESZANE"


def zmierz() -> dict[str, dict[str, object]]:
    katalog = get_default_mv_catalog()
    wynik: dict[str, dict[str, object]] = {}
    for akcesor in sorted(m for m in dir(katalog) if m.startswith("list_")):
        rodzina = akcesor.removeprefix("list_")
        try:
            pozycje = getattr(katalog, akcesor)()
        except Exception as blad:  # pragma: no cover - akcesor bez danych
            wynik[rodzina] = {"blad": f"{type(blad).__name__}: {blad}"}
            continue
        slowniki = [_slownik(p) for p in pozycje]
        wymagane = WYMAGANE.get(rodzina, ())
        braki: collections.Counter[str] = collections.Counter()
        for dane in slowniki:
            for pole in wymagane:
                if dane.get(pole) in (None, ""):
                    braki[pole] += 1
        zrodla = collections.Counter(_klasa_zrodla(d) for d in slowniki)
        identyfikatory = collections.Counter(str(d.get("id")) for d in slowniki)
        kompletnosc = (
            round(100.0 * (1 - sum(braki.values()) / (len(slowniki) * len(wymagane))), 1)
            if slowniki and wymagane
            else None
        )
        wynik[rodzina] = {
            "liczba": len(slowniki),
            "klasa": _klasyfikacja(len(slowniki), kompletnosc, dict(zrodla)),
            "kompletnosc_pct": kompletnosc,
            "pola_wymagane": list(wymagane),
            "braki_pol": dict(braki),
            "pola_wyprowadzalne": WYPROWADZALNE.get(rodzina, {}),
            "zrodla": dict(zrodla),
            "verification_status": {
                str(k): v
                for k, v in collections.Counter(
                    d.get("verification_status") for d in slowniki
                ).items()
            },
            "catalog_status": {
                str(k): v
                for k, v in collections.Counter(d.get("catalog_status") for d in slowniki).items()
            },
            "bez_producenta": sum(1 for d in slowniki if not d.get("manufacturer")),
            "id_zduplikowane": sorted(i for i, n in identyfikatory.items() if n > 1),
        }
    return wynik


def _tabela(pomiar: dict[str, dict[str, object]]) -> str:
    naglowek = (
        f"{'rodzina':32s} {'N':>6s} {'kompl%':>7s} {'dok.zewn':>8s} "
        f"{'projekt':>7s} {'etyk.w':>7s}  klasa"
    )
    wiersze = [naglowek, "-" * len(naglowek)]
    for rodzina, dane in sorted(pomiar.items(), key=lambda kv: -int(kv[1].get("liczba", 0) or 0)):
        if "blad" in dane:
            wiersze.append(f"{rodzina:32s} BŁĄD {dane['blad']}")
            continue
        zrodla = dane["zrodla"]  # type: ignore[index]
        kompletnosc = dane["kompletnosc_pct"]
        kompl = f"{kompletnosc:7.1f}" if kompletnosc is not None else "      -"
        wiersze.append(
            f"{rodzina:32s} {dane['liczba']:6d} {kompl} "
            f"{zrodla.get('DOKUMENT_ZEWNETRZNY', 0):8d} "  # type: ignore[union-attr]
            f"{zrodla.get('ZRODLO_PROJEKTOWE_OSD', 0):7d} "  # type: ignore[union-attr]
            f"{zrodla.get('ETYKIETA_WEWNETRZNA', 0):7d}  {dane['klasa']}"
        )
    return "\n".join(wiersze)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="wypisz surowy pomiar w JSON")
    argumenty = parser.parse_args()
    pomiar = zmierz()
    if argumenty.json:
        print(json.dumps(pomiar, ensure_ascii=False, indent=1, sort_keys=True))
        return 0
    print(_tabela(pomiar))
    braki = {r: d["braki_pol"] for r, d in pomiar.items() if d.get("braki_pol")}
    if braki:
        print("\nBRAKI PÓL WYMAGANYCH (pole: liczba pozycji bez wartości):")
        for rodzina, pola in sorted(braki.items()):
            print(f"  {rodzina:30s} {pola}")
    duplikaty = {r: d["id_zduplikowane"] for r, d in pomiar.items() if d.get("id_zduplikowane")}
    if duplikaty:
        print(f"\nZDUPLIKOWANE IDENTYFIKATORY: {duplikaty}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
