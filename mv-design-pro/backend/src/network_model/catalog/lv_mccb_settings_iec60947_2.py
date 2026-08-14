"""Rozwiązanie nastaw regulacyjnych wyzwalacza elektronicznego MCCB (IEC 60947-2).

Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN") wprowadziła rozwiązywanie nastaw
Ir/Isd/Ii/tr/tsd z zakresów regulacji katalogu (``LVApparatusType.ir_range``/
``isd_range``/``ii_range``/``tr_range``/``tsd_range``, P0.2) do wartości
absolutnych — pierwotnie WYŁĄCZNIE inline w
``application/analyses/nn_device_selection.py::_resolwuj_nastawy_mccb`` (dobór
kandydata z katalogu). Karta D2 (2026-08-14) wymaga TEJ SAMEJ rezolucji dla
aparatu JUŻ ZAINSTALOWANEGO na obwodzie (SWZ/dowód weryfikacji — nie dobór
kandydata) — DWA niezależne miejsca liczące tę samą formułę byłyby dokładnie
defektem klasy ostrzeganym przez „Regułę KLASA, NIE INSTANCJA" (CLAUDE.md):
formuła żyje TUTAJ, JEDNO miejsce; ``nn_device_selection`` (dobór) i
``application/analyses/swz/service.py``/``application/proof_engine/
lv_circuit_verification_binding.py`` (weryfikacja zainstalowanego aparatu)
wołają ten sam moduł zamiast utrzymywać równoległe kopie.

ZAŁOŻENIE NAZWANE WPROST (nie fabrykacja, zgodnie z oryginalnym uzasadnieniem
karty D1): każda nastawa resolwowana do GÓRNEGO krańca swojego zakresu
regulacji — konserwatywne (worst-case) dla werdyktów WYMAGAJĄCYCH gwarancji
zadziałania (SWZ, kryterium I2 doboru): jeśli obwód spełnia kryterium NAWET
przy najwyższej dozwolonej nastawie fabrycznej, spełnia je dla KAŻDEJ nastawy
w dozwolonym zakresie. Isd zależy łańcuchowo od Ir (Isd = isd_range[hi]×Ir,
nie ×In) — brak rozwiązanego Ir gasi Isd nawet gdy ``isd_range`` jest podany.
Brak zakresu w rekordzie katalogu/materializacji → ``None`` dla zależnej
wartości (i wszystkiego, co od niej zależy) — trzeci stan u konsumenta,
NIGDY cicha fabrykacja domyślnej nastawy.
"""

from __future__ import annotations

from collections.abc import Sequence


def resolwuj_nastawy_mccb(
    *,
    i_n_a: float,
    ir_range: Sequence[float] | None,
    isd_range: Sequence[float] | None,
    ii_range: Sequence[float] | None,
    tr_range: Sequence[float] | None = None,
    tsd_range: Sequence[float] | None = None,
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    """Rozwiąż zakresy regulacji wyzwalacza elektronicznego MCCB do wartości
    absolutnych [A]/[s] — GÓRNY kraniec (indeks 1) każdego zakresu (worst-case,
    patrz docstring modułu).

    Każdy parametr ``*_range`` przyjmuje ``(min, max)`` w dowolnej formie
    sekwencji dwuelementowej — ``tuple`` (z ``LVApparatusType`` bezpośrednio)
    albo ``list`` (z ``materialized_params`` po serializacji JSON-stabilnej,
    zob. ``network_model.catalog.types._float_range_to_list``) — oba
    konsumowane identycznie.

    Zwraca ``(ir_a, isd_a, ii_a, tr_s, tsd_s)``.

    Raises:
        ValueError: ``i_n_a <= 0``.
    """
    if i_n_a <= 0:
        raise ValueError(f"i_n_a musi być dodatnie, otrzymano {i_n_a}.")
    ir_a = ir_range[1] * i_n_a if ir_range is not None else None
    isd_a = isd_range[1] * ir_a if isd_range is not None and ir_a is not None else None
    ii_a = ii_range[1] * i_n_a if ii_range is not None else None
    tr_s = tr_range[1] if tr_range is not None else None
    tsd_s = tsd_range[1] if tsd_range is not None else None
    return ir_a, isd_a, ii_a, tr_s, tsd_s
