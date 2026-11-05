"""Nośniki uziemionego punktu neutralnego w wyspach galwanicznych SN — JEDNO źródło prawdy.

Decyzja architekta D1 (karta POLA-GPZ-SZABLONY, ENEA Operator „Stacje elektroenergetyczne
110 kV. Zeszyt 1”, §16 i Z.13–Z.15): punkt neutralny sieci SN uziemia się w JEDNYM miejscu
wyspy galwanicznej — przez transformator uziemiający pola zespołu uziemiającego (nośnik
``Transformer.hv_neutral``: dławik, rezystor, AWSC) albo, przy równoważniku sieci na szynach SN,
przez opis źródła (``Source.neutral_grounding``). Dwa uziemione nośniki w jednej wyspie
(np. źródło GPZ nadal opisane jako uziemione obok transformatora uziemiającego albo dwa zespoły
uziemiające połączone zamkniętym sprzęgłem) to błąd konfiguracji: obliczenie doziemne
dodałoby równolegle dwa boczniki zerowe.

Czytają: walidator ENM (kod E-W5-04) i operacja domenowa dodania pola zespołu uziemiającego
(przeniesienie uziemienia ze źródła na transformator) — ten sam predykat po obu stronach.

Wyspa galwaniczna SN = szyny pasma SN połączone ZAMKNIĘTYMI gałęziami (``Branch.status``);
transformator nie jest połączeniem galwanicznym. Nośnik:
- źródło na szynie pasma SN (``source_side`` ≠ ``HV_110``) z uziemionym typem punktu
  neutralnego (``uziemienie_grounded``) — opis źródła po stronie 110 kV nie jest nośnikiem,
  tylko opisem fizyki transformatorów WN/SN (reguła E-W5-01);
- strona transformatora na szynie pasma SN, którą model składowej zerowej
  (``build_transformer_zero_seq_model`` — ten sam, który czyta zwarcie 1F) łączy z ziemią:
  bocznik po tej stronie albo droga szeregowa (obie gwiazdy uziemione).
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne.pasma_napieciowe import w_pasmie_sn

from .models import EnergyNetworkModel, GroundingConfig
from .uziemienie import uziemienie_grounded
from .zero_sequence_transformer import ZeroSeqConnection, build_transformer_zero_seq_model


@dataclass(frozen=True)
class NosnikPunktuNeutralnego:
    """Uziemiony nośnik punktu neutralnego na szynie SN."""

    element_ref: str
    rodzaj: str  # "source" | "transformer"
    bus_ref: str
    #: Klucz nośnika w rekordzie: ``neutral_grounding`` | ``hv_neutral`` | ``lv_neutral``.
    pole: str
    typ: str
    #: Uziemienie zadeklarowane konfiguracją (``GroundingConfig``); ``False`` — wyłącznie z litery
    #: grupy połączeń (punkt wyprowadzony bez opisu sposobu uziemienia). Bloker E-W5-04 i czytelnicy
    #: OPISU sieci liczą tylko jawne (brak konfiguracji = model milczy, karta W5-D p. 12).
    jawny: bool = True


def wyspy_galwaniczne_sn(enm: EnergyNetworkModel) -> dict[str, str]:
    """Szyna pasma SN → reprezentant wyspy (najmniejszy ``ref_id`` — deterministycznie)."""
    sn = sorted(b.ref_id for b in enm.buses if w_pasmie_sn(b.voltage_kv))
    rodzic = {ref: ref for ref in sn}

    def korzen(ref: str) -> str:
        while rodzic[ref] != ref:
            rodzic[ref] = rodzic[rodzic[ref]]
            ref = rodzic[ref]
        return ref

    for galaz in sorted(enm.branches, key=lambda g: g.ref_id):
        if galaz.status != "closed":
            continue
        a, b = galaz.from_bus_ref, galaz.to_bus_ref
        if a in rodzic and b in rodzic:
            ka, kb = korzen(a), korzen(b)
            if ka != kb:
                rodzic[max(ka, kb)] = min(ka, kb)
    return {ref: korzen(ref) for ref in sn}


def nosniki_uziemione_sn(enm: EnergyNetworkModel) -> list[NosnikPunktuNeutralnego]:
    """Uziemione nośniki punktu neutralnego na szynach SN (kolejność deterministyczna)."""
    sn = {b.ref_id for b in enm.buses if w_pasmie_sn(b.voltage_kv)}
    wynik: list[NosnikPunktuNeutralnego] = []
    for zrodlo in sorted(enm.sources, key=lambda s: s.ref_id):
        cfg = zrodlo.neutral_grounding
        if (
            cfg is not None
            and uziemienie_grounded(cfg.type)
            and zrodlo.source_side != "HV_110"
            and zrodlo.bus_ref in sn
        ):
            wynik.append(
                NosnikPunktuNeutralnego(
                    zrodlo.ref_id, "source", zrodlo.bus_ref, "neutral_grounding", cfg.type
                )
            )
    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        try:
            model = build_transformer_zero_seq_model(trafo)
        except (OdmowaDanychError, ValueError):
            # Model zerowy niezbudowalny — własne kody E-W5-02/E-W5-03 walidatora.
            continue
        strony: list[tuple[str, str, GroundingConfig | None]] = []
        if model.connection in (
            ZeroSeqConnection.HV_SHUNT_GROUND,
            ZeroSeqConnection.SERIES_THROUGH,
        ):
            strony.append((trafo.hv_bus_ref, "hv_neutral", trafo.hv_neutral))
        if model.connection in (
            ZeroSeqConnection.LV_SHUNT_GROUND,
            ZeroSeqConnection.SERIES_THROUGH,
        ):
            strony.append((trafo.lv_bus_ref, "lv_neutral", trafo.lv_neutral))
        for bus_ref, pole, cfg in strony:
            if bus_ref not in sn:
                continue
            typ = cfg.type if cfg is not None else "directly_grounded"
            wynik.append(
                NosnikPunktuNeutralnego(
                    trafo.ref_id, "transformer", bus_ref, pole, typ, jawny=cfg is not None
                )
            )
    return wynik


def wyspy_z_wieloma_nosnikami(
    enm: EnergyNetworkModel,
) -> list[tuple[str, tuple[NosnikPunktuNeutralnego, ...]]]:
    """Wyspy galwaniczne SN z co najmniej dwoma uziemionymi nośnikami: (reprezentant, nośniki)."""
    wyspa = wyspy_galwaniczne_sn(enm)
    grupy: dict[str, list[NosnikPunktuNeutralnego]] = {}
    for nosnik in nosniki_uziemione_sn(enm):
        klucz = wyspa.get(nosnik.bus_ref)
        # Wyłącznie nośniki ZADEKLAROWANE konfiguracją: punkt wyprowadzony bez konfiguracji
        # (litera grupy, np. Dyn11 dwóch transformatorów GPZ za zamkniętym sprzęgłem) jest
        # domyślną fizyką modelu (W5-A), nie decyzją projektanta, której można zapomnieć cofnąć.
        # Pomiar 2026-11-05: bez tego filtra golden network ENM (dwa TR Dyn11, sprzęgło
        # zamknięte) dostawał bloker E-W5-04.
        if klucz is not None and nosnik.jawny:
            grupy.setdefault(klucz, []).append(nosnik)
    return [(k, tuple(v)) for k, v in sorted(grupy.items()) if len(v) > 1]


def typy_punktu_neutralnego_szyn_sn(enm: EnergyNetworkModel) -> dict[str, str]:
    """Szyna pasma SN → typ punktu neutralnego JEJ WYSPY galwanicznej — jedno źródło dla
    czytelników opisu sieci (dane wejściowe koordynacji izolacji, propozycje gotowości analiz
    akademickich, ścieżka zwarcia doziemnego pola).

    Uziemiony nośnik wyspy (``nosniki_uziemione_sn`` — ten sam zbiór, który czyta bloker
    E-W5-04) wygrywa z każdą deklaracją izolowania: po przeniesieniu uziemienia na transformator
    uziemiający pola zespołu uziemiającego źródło GPZ ma ``isolated``, a sieć jest uziemiona
    przez transformator (decyzja D1). Przy kilku nośnikach (stan blokowany E-W5-04) — pierwszy
    w kolejności deterministycznej; nośnik wyłącznie z litery grupy (bez konfiguracji) nie jest
    opisem sieci (karta W5-D p. 12: brak danej ≠ uziemiony). Wyspa bez uziemionego nośnika: ``isolated``, gdy którekolwiek
    źródło SN albo strona transformatora na szynie wyspy deklaruje punkt izolowany; inaczej
    szyny w słowniku nie ma (model milczy — brak danej ≠ izolowany).
    """
    wyspa = wyspy_galwaniczne_sn(enm)
    typ_wyspy: dict[str, str] = {}
    for nosnik in nosniki_uziemione_sn(enm):
        klucz = wyspa.get(nosnik.bus_ref)
        if klucz is not None and nosnik.jawny:
            typ_wyspy.setdefault(klucz, nosnik.typ)
    deklaracje_izolowania: list[str] = [
        zrodlo.bus_ref
        for zrodlo in enm.sources
        if zrodlo.neutral_grounding is not None
        and zrodlo.neutral_grounding.type == "isolated"
        and zrodlo.source_side != "HV_110"
    ]
    for trafo in enm.transformers:
        for bus_ref, cfg in (
            (trafo.hv_bus_ref, trafo.hv_neutral),
            (trafo.lv_bus_ref, trafo.lv_neutral),
        ):
            if cfg is not None and cfg.type == "isolated":
                deklaracje_izolowania.append(bus_ref)
    for bus_ref in deklaracje_izolowania:
        klucz = wyspa.get(bus_ref)
        if klucz is not None:
            typ_wyspy.setdefault(klucz, "isolated")
    return {szyna: typ_wyspy[klucz] for szyna, klucz in sorted(wyspa.items()) if klucz in typ_wyspy}
