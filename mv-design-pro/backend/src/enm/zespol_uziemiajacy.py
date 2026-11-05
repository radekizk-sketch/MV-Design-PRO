"""Zespół uziemiający pola GPZ: przeniesienie punktu neutralnego sieci SN ze źródła na
transformator uziemiający ZNyn11 i oddanie go źródłu — JEDNO źródło pary predykatów.

Decyzja architekta D1 (karta POLA-GPZ-SZABLONY; ENEA Operator „Stacje elektroenergetyczne
110 kV. Zeszyt 1”, wersja 02.2023 – 2, §16 s.30 i Z.13–Z.15 s.93–95): punkt neutralny sieci SN
uziemia się w jednym miejscu wyspy galwanicznej (bloker E-W5-04,
``enm.nosniki_punktu_neutralnego``). Dodanie pola zespołu uziemiającego przenosi nośnik
``Source.neutral_grounding`` źródła GPZ na ``Transformer.hv_neutral`` transformatora
uziemiającego W JEDNYM kroku domenowym (źródło dostaje ``isolated``); usunięcie pola oddaje
nośnik temu samemu źródłu. Para jest sprzężona jednym zapisem: ``Transformer.meta`` pod
kluczem ``ZAPIS_ZESPOLU`` niesie źródło-dawcę (``zrodlo_ref``) — oddanie czyta TEN zapis, nie
osobny warunek „które źródło dziś pasuje” (reguła KLASA §3, predykaty parami).

Wariant rysunku wyznacza sposób uziemienia:

* Z.13 — dławik z automatyczną regulacją i AWSC z rezystorem po stronie wtórnej (20 A ÷ 40 A);
* Z.14 — dławik i rezystor w układzie równoległym (rezystor wymuszający po stronie pierwotnej,
  powyżej 40 A);
* Z.15 — rezystor.

Brak wartości urządzenia (ZASADA NR 4): wartość robocza jakości ``ESTIMATED`` z jawnym
założeniem w ``dane_przyjete`` zapisu zespołu — obliczenie biegnie, projektant zmienia wartość
w modelu. Uziemienie źródła tego samego typu z kompletem wartości przechodzi bez zmian (to dana
modelu, nie propozycja).
"""

from __future__ import annotations

import copy
from typing import Any, Literal

from network_model.catalog.audit2_catalogs import get_mv_neutral_grounding
from network_model.pochodne import reaktancja_dlawika_dostrojonego_ohm
from network_model.pochodne.pasma_napieciowe import w_pasmie_sn

from .models import EnergyNetworkModel
from .nosniki_punktu_neutralnego import wyspy_galwaniczne_sn

#: Rola pola zespołu uziemiającego w słowniku ról pól SN (``enm.rola_pola_sn``).
ROLA_POLA_ZESPOLU_UZIEMIAJACEGO = "ZU"
#: Grupa połączeń transformatora uziemiającego — Zeszyt 1 §16 s.30 („układ połączeń ZNyn 11”).
GRUPA_POLACZEN_TRANSFORMATORA_UZIEMIAJACEGO = "ZNyn11"
#: Napięcie znamionowe uzwojenia dolnego (potrzeb własnych) — Zeszyt 1 §16 s.30 („400 V”).
NAPIECIE_POTRZEB_WLASNYCH_KV = 0.4
#: Klucz zapisu zespołu w ``Transformer.meta`` — jedyny nośnik pary przeniesienie/oddanie.
ZAPIS_ZESPOLU = "zespol_uziemiajacy"
NOSNIK_ZRODLA = "neutral_grounding"
NOSNIK_TRANSFORMATORA = "hv_neutral"

WariantZespolu = Literal["Z13", "Z14", "Z15"]
_PODSTAWA_P16 = "ENEA Operator, Stacje 110 kV, Zeszyt 1 (wersja 02.2023 – 2), §16 s.30"

#: Typ punktu neutralnego wariantu rysunku.
TYP_UZIEMIENIA_WARIANTU: dict[str, str] = {
    "Z13": "petersen_coil",
    "Z14": "petersen_coil",
    "Z15": "resistor_grounded",
}

#: Prąd wymuszenia AWSC — wartość robocza i jej podstawa (wariant z dławikiem).
_AWSC_WARIANTU: dict[str, tuple[float, str]] = {
    "Z13": (
        40.0,
        f"{_PODSTAWA_P16}: AWSC z rezystorem po stronie wtórnej wymusza prąd pierwotny 20 A ÷ "
        "40 A — przyjęto górną granicę zakresu (największa składowa czynna dla wybiórczości "
        "zabezpieczeń ziemnozwarciowych)",
    ),
    "Z14": (
        40.0,
        f"{_PODSTAWA_P16}: rezystor wymuszający po stronie pierwotnej stosuje się, gdy prąd "
        "wymuszenia przekracza 40 A — przyjęto granicę 40 A; projektant podaje prąd swojego "
        "rezystora",
    ),
}

#: Rozstrojenie dławika — założenie inżynierskie. Zeszyt 1 §16 s.30 zabrania pracy w punkcie
#: rezonansowym (I_L = I_C) i nie podaje wartości rozstrojenia.
ROZSTROJENIE_DLAWIKA = 0.10
_PODSTAWA_ROZSTROJENIA = (
    f"{_PODSTAWA_P16} zabrania pracy zespołu w punkcie rezonansowym I_L = I_C; rozstrojenie "
    "+10 % (nadkompensacja) to założenie inżynierskie MV-DESIGN-PRO — wartości standard nie podaje"
)
#: Profil rezystora z katalogu sposobów uziemienia (`mv_neutral_grounding`).
_PROFIL_REZYSTORA = "mng_resistor_medium"


def _model(enm: dict[str, Any]) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(enm)


def zrodlo_wyspy(enm: dict[str, Any], bus_ref: str) -> dict[str, Any] | None:
    """Źródło GPZ na szynie SN tej samej wyspy galwanicznej co ``bus_ref`` (najmniejszy
    ``ref_id`` — deterministycznie); źródło po stronie 110 kV nie jest nośnikiem wyspy SN."""
    wyspa = wyspy_galwaniczne_sn(_model(enm))
    klucz = wyspa.get(bus_ref)
    if klucz is None:
        return None
    kandydaci = sorted(
        (
            s
            for s in enm.get("sources", [])
            if isinstance(s, dict)
            and s.get("source_side") != "HV_110"
            and wyspa.get(str(s.get("bus_ref"))) == klucz
        ),
        key=lambda s: str(s.get("ref_id")),
    )
    return kandydaci[0] if kandydaci else None


def susceptancja_zerowa_wyspy_s(enm: dict[str, Any], bus_ref: str) -> float:
    """Σ B_0 [S] zamkniętych linii i kabli wyspy galwanicznej ``bus_ref`` (gałęzie bez
    ``b0_siemens_per_km`` nie wnoszą — ten sam predykat co suma C0 gotowości analiz)."""
    model = _model(enm)
    wyspa = wyspy_galwaniczne_sn(model)
    klucz = wyspa.get(bus_ref)
    suma = 0.0
    for galaz in model.branches:
        b0 = getattr(galaz, "b0_siemens_per_km", None)
        dlugosc = getattr(galaz, "length_km", None)
        if galaz.status != "closed" or b0 is None or dlugosc is None:
            continue
        if wyspa.get(galaz.from_bus_ref) == klucz and klucz is not None:
            suma += float(b0) * float(dlugosc)
    return suma


def uziemienie_zespolu(
    wariant: WariantZespolu,
    uziemienie_zrodla: dict[str, Any] | None,
    susceptancja_zerowa_s: float,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Konfiguracja ``hv_neutral`` transformatora uziemiającego i wpisy ``dane_przyjete``.

    Uziemienie źródła typu wariantu z kompletem wartości przechodzi bez zmian (brak wpisów).
    Inaczej każda brakująca wartość dostaje propozycję jakości ``ESTIMATED``: X_N dławika
    dostrojony do Σ B_0 wyspy z rozstrojeniem ``ROZSTROJENIE_DLAWIKA`` (gdy model zna pojemność
    doziemną; bez niej X_N zostaje pusty i nazywa go walidator E-W5-01 — pojemność sieci to
    dana modelu), R_N z profilu katalogu ``mng_resistor_medium``, prąd AWSC wg §16.
    """
    typ = TYP_UZIEMIENIA_WARIANTU[wariant]
    zrodlo = uziemienie_zrodla or {}
    cfg: dict[str, Any] = {"type": typ, "r_ohm": None, "x_ohm": None}
    if zrodlo.get("type") == typ:
        cfg["r_ohm"] = zrodlo.get("r_ohm")
        cfg["x_ohm"] = zrodlo.get("x_ohm")
        cfg["awsc_prad_wymuszenia_a"] = zrodlo.get("awsc_prad_wymuszenia_a")
    przyjete: list[dict[str, Any]] = []
    if typ == "petersen_coil" and cfg["x_ohm"] is None and susceptancja_zerowa_s > 0:
        x_n = reaktancja_dlawika_dostrojonego_ohm(susceptancja_zerowa_s, ROZSTROJENIE_DLAWIKA)
        cfg["x_ohm"] = x_n
        przyjete.append(
            {
                "parametr": "x_ohm",
                "nazwa_pl": "reaktancja dławika gaszącego X_N",
                "wartosc": x_n,
                "jednostka": "Ω",
                "jakosc": "ESTIMATED",
                "podstawa_pl": (
                    f"X_N = 1/(3·ΣB_0·(1 + v)), ΣB_0 = {susceptancja_zerowa_s:.6g} S z linii "
                    f"i kabli wyspy SN; {_PODSTAWA_ROZSTROJENIA}"
                ),
            }
        )
    if typ == "resistor_grounded" and cfg["r_ohm"] is None:
        profil = get_mv_neutral_grounding(_PROFIL_REZYSTORA)
        assert profil is not None and profil.r_ohm is not None
        cfg["r_ohm"] = float(profil.r_ohm)
        przyjete.append(
            {
                "parametr": "r_ohm",
                "nazwa_pl": "rezystancja rezystora uziemiającego R_N",
                "wartosc": float(profil.r_ohm),
                "jednostka": "Ω",
                "jakosc": "ESTIMATED",
                "podstawa_pl": f"profil katalogu sposobów uziemienia: {profil.label_pl}",
            }
        )
    if wariant in _AWSC_WARIANTU and cfg.get("awsc_prad_wymuszenia_a") is None:
        prad, podstawa = _AWSC_WARIANTU[wariant]
        cfg["awsc_prad_wymuszenia_a"] = prad
        przyjete.append(
            {
                "parametr": "awsc_prad_wymuszenia_a",
                "nazwa_pl": "prąd wymuszenia AWSC",
                "wartosc": prad,
                "jednostka": "A",
                "jakosc": "ESTIMATED",
                "podstawa_pl": podstawa,
            }
        )
    return cfg, przyjete


def przenies_uziemienie_na_zespol(
    enm: dict[str, Any],
    *,
    transformator: dict[str, Any],
    bay_ref: str,
    wariant: WariantZespolu,
) -> str | None:
    """Jeden krok domenowy (mutacja ``enm`` w miejscu — wołający pracuje na kopii): nośnik
    ``hv_neutral`` transformatora z uziemienia źródła wyspy, źródło dostaje ``isolated``, zapis
    pary w ``transformator["meta"][ZAPIS_ZESPOLU]``. Zwraca odmowę (tekst) albo ``None``."""
    bus_ref = str(transformator.get("hv_bus_ref"))
    uhv_kv = transformator.get("uhv_kv")
    if not isinstance(uhv_kv, int | float) or not w_pasmie_sn(float(uhv_kv)):
        return "Transformator uziemiający stoi po stronie SN rozdzielni — szyna pola nie jest SN."
    zrodlo = zrodlo_wyspy(enm, bus_ref)
    cfg, przyjete = uziemienie_zespolu(
        wariant,
        copy.deepcopy(zrodlo.get(NOSNIK_ZRODLA)) if zrodlo else None,
        susceptancja_zerowa_wyspy_s(enm, bus_ref),
    )
    transformator[NOSNIK_TRANSFORMATORA] = cfg
    if zrodlo is not None:
        zrodlo[NOSNIK_ZRODLA] = {"type": "isolated"}
    transformator.setdefault("meta", {})[ZAPIS_ZESPOLU] = {
        "bay_ref": bay_ref,
        "wariant": wariant,
        "zrodlo_ref": zrodlo.get("ref_id") if zrodlo else None,
        "dane_przyjete": przyjete,
    }
    return None


def zapis_zespolu(transformator: dict[str, Any]) -> dict[str, Any] | None:
    """Zapis pary zespołu na transformatorze (``None`` = transformator nie jest zespołem)."""
    meta = transformator.get("meta")
    zapis = meta.get(ZAPIS_ZESPOLU) if isinstance(meta, dict) else None
    return zapis if isinstance(zapis, dict) else None


def oddaj_uziemienie_zrodlu(enm: dict[str, Any], transformator: dict[str, Any]) -> str | None:
    """Odwrotność ``przenies_uziemienie_na_zespol``: źródło-dawca z zapisu pary dostaje
    bieżący nośnik ``hv_neutral`` transformatora (z wartościami zmienionymi przez projektanta).
    Transformator usuwa wołający. Zwraca ref źródła albo ``None`` (brak zapisu / brak dawcy)."""
    zapis = zapis_zespolu(transformator)
    if zapis is None or not zapis.get("zrodlo_ref"):
        return None
    zrodlo = next(
        (
            s
            for s in enm.get("sources", [])
            if isinstance(s, dict) and s.get("ref_id") == zapis["zrodlo_ref"]
        ),
        None,
    )
    if zrodlo is None:
        return None
    # Nośnik wraca taki, jaki jest (także niekompletny — brak wartości nazywa walidator E-W5-01).
    cfg = copy.deepcopy(transformator.get(NOSNIK_TRANSFORMATORA))
    zrodlo[NOSNIK_ZRODLA] = cfg
    return str(zrodlo["ref_id"])


#: Typ punktu neutralnego źródła → wariant rysunku, gdy pole ZU powstaje bez wskazanego
#: szablonu: projektant zadeklarował sposób uziemienia sieci na źródle, a pole zespołu przenosi
#: TEN sposób na transformator. Dławik → Z.13 (§16: sieć skompensowana z regulacją nadążną
#: i AWSC), rezystor → Z.15. Inny opis (izolowany, brak) nie wyznacza wariantu — wołający odmawia.
WARIANT_Z_TYPU_UZIEMIENIA_ZRODLA: dict[str, WariantZespolu] = {
    "petersen_coil": "Z13",
    "resistor_grounded": "Z15",
}


def wariant_z_uziemienia_zrodla(enm: dict[str, Any], bus_ref: str) -> WariantZespolu | None:
    """Wariant zespołu z opisu punktu neutralnego źródła wyspy ``bus_ref`` (``None`` — opis nie
    wyznacza wariantu)."""
    zrodlo = zrodlo_wyspy(enm, bus_ref)
    cfg = zrodlo.get(NOSNIK_ZRODLA) if zrodlo else None
    typ = cfg.get("type") if isinstance(cfg, dict) else None
    return WARIANT_Z_TYPU_UZIEMIENIA_ZRODLA.get(str(typ)) if typ else None


def transformator_zespolu_pola(enm: dict[str, Any], bay_ref: str) -> dict[str, Any] | None:
    """Transformator uziemiający pola ``bay_ref`` — po zapisie pary (jedno źródło powiązania)."""
    return next(
        (
            t
            for t in enm.get("transformers", [])
            if isinstance(t, dict) and (zapis_zespolu(t) or {}).get("bay_ref") == bay_ref
        ),
        None,
    )


def zmien_wariant_zespolu(enm: dict[str, Any], bay_ref: str, wariant: WariantZespolu) -> bool:
    """Zmiana szablonu pola ZU na szablon innego wariantu (mutacja w miejscu, wołający pracuje
    na kopii): nośnik ``hv_neutral`` transformatora dostaje typ nowego wariantu — wartości
    projektanta tego samego typu przechodzą bez zmian, brakujące dostają wartości robocze
    ESTIMATED (``uziemienie_zespolu``); zapis pary zachowuje źródło-dawcę. Zwraca, czy zmieniono."""
    transformator = transformator_zespolu_pola(enm, bay_ref)
    zapis = zapis_zespolu(transformator) if transformator else None
    if transformator is None or zapis is None or zapis.get("wariant") == wariant:
        return False
    cfg, przyjete = uziemienie_zespolu(
        wariant,
        copy.deepcopy(transformator.get(NOSNIK_TRANSFORMATORA)),
        susceptancja_zerowa_wyspy_s(enm, str(transformator.get("hv_bus_ref"))),
    )
    # Wartość robocza poprzedniego wariantu, która przeszła bez zmian (ten sam typ), zostaje
    # wartością roboczą — przejście nie może zamienić propozycji w daną projektanta.
    nowe = {p["parametr"] for p in przyjete}
    przyjete.extend(
        p
        for p in zapis.get("dane_przyjete") or []
        if p.get("parametr") not in nowe and cfg.get(p.get("parametr")) == p.get("wartosc")
    )
    transformator[NOSNIK_TRANSFORMATORA] = cfg
    zapis["wariant"] = wariant
    zapis["dane_przyjete"] = sorted(przyjete, key=lambda p: str(p["parametr"]))
    return True
