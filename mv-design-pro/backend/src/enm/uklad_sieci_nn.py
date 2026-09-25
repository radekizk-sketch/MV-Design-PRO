"""Układ sieci nN — JEDEN predykat „brak układu nN" (karta W5-A §1 p. 2).

Do tej karty ten sam warunek („stacja zasilająca odbiory nN nie deklaruje
układu uziemienia sieci nN") żył w trzech miejscach (`enm/validator.py` E063,
`application/eligibility_service.py` ELIG_FLNN_MISSING_EARTHING_SYSTEM,
`domain/readiness_bridge.py` opis), a czwarte (`fault_loop/service.py`)
podstawiało za brak cichą domyślkę ``TN-C-S``. Nośnikiem układu jest odtąd
`Transformer.lv_earthing_system` (pole typowane), więc predykat pyta o
TRANSFORMATOR SN/nN, a nie o worek meta stacji: to transformator wnosi
odniesienie N/PE do sieci nN, którą zasila.
"""

from __future__ import annotations

from network_model.pochodne.pasma_napieciowe import w_pasmie_nn

from .models import EnergyNetworkModel, Substation, Transformer


def transformator_nn(trafo: Transformer) -> bool:
    """Transformator o stronie dolnej w paśmie nN (jedno źródło granicy: `w_pasmie_nn`)."""
    return w_pasmie_nn(trafo.ulv_kv)


def stacje_z_odbiorami_nn(enm: EnergyNetworkModel) -> list[Substation]:
    """Stacje, których szyny nN zasilają odbiór albo generator nN (deterministycznie)."""
    bus_by_ref = {b.ref_id: b for b in enm.buses}

    def _nn(bus_ref: str) -> bool:
        bus = bus_by_ref.get(bus_ref)
        return bus is not None and w_pasmie_nn(bus.voltage_kv)

    szyny_odbiorow = {ld.bus_ref for ld in enm.loads if _nn(ld.bus_ref)}
    szyny_odbiorow |= {g.bus_ref for g in enm.generators if _nn(g.bus_ref)}
    return [sub for sub in enm.substations if szyny_odbiorow & set(sub.bus_refs)]


def uklad_nn_stacji(enm: EnergyNetworkModel, sub: Substation) -> str | None:
    """Wspólny układ sieci nN transformatorów stacji albo ``None`` (brak / różne).

    Nagłówek widoków stacyjnych (arkusz obwodów nN, graf domeny nN); wiersz
    per odpływ czyta układ SWOJEGO transformatora (`uklad_nn_transformatora`).
    """
    refs = set(sub.transformer_refs or ())
    uklady = {
        t.lv_earthing_system
        for t in enm.transformers
        if t.ref_id in refs and t.lv_earthing_system is not None
    }
    return next(iter(uklady)) if len(uklady) == 1 else None


def transformatory_bez_ukladu_nn(
    enm: EnergyNetworkModel, stacje: list[Substation] | None = None
) -> list[tuple[Substation, Transformer]]:
    """Pary (stacja, transformator SN/nN) bez `lv_earthing_system` — JEDEN predykat braku.

    `stacje` zawęża zbiór stacji: walidator (E063) pyta o stacje zasilające
    odbiory nN (domyślnie), gotowość pętli zwarcia/SWZ — o KAŻDĄ stację SN/nN
    (pętla u źródła nie potrzebuje odbioru). Kolejność: kolejność stacji, w
    stacji — `transformer_refs`. Stacja bez transformatora nN nie ma nośnika
    układu — nie jest tu zgłaszana (brak zasilania nazywa E060).
    """
    tr_by_ref = {t.ref_id: t for t in enm.transformers}
    wynik: list[tuple[Substation, Transformer]] = []
    for sub in stacje_z_odbiorami_nn(enm) if stacje is None else stacje:
        for ref in sub.transformer_refs:
            trafo = tr_by_ref.get(ref)
            if trafo is None or not transformator_nn(trafo):
                continue
            if trafo.lv_earthing_system is None:
                wynik.append((sub, trafo))
    return wynik
