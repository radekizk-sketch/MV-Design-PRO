"""
Protection Base Values Resolver.

Deterministyczny resolver bazowych wartości Un/In dla funkcji zabezpieczeniowych.

REGUŁY WYBORU (zgodne z PF/ETAP):

Un (napięcie odniesienia):
1. Dla 27/59 (U</U>): Un = napięcie znamionowe miejsca pomiaru
   - preferencja: bus_voltage_kv (napięcie szyny)
   - jeśli VT: vt_primary_kv (napięcie pierwotne VT)
   - jeśli BoundaryNode: connection_voltage_kv
   - brak danych → UNKNOWN

In (prąd odniesienia):
2. Dla 50/51 (I>>/I>): In = prąd znamionowy obiektu chronionego
   - linia/kabel: line_rated_current_a
   - wyłącznik: breaker_rated_current_a
   - transformator: In = Sn / (√3 × Un_strony) — dozwolone wyliczenie
   - BoundaryNode: connection_rated_current_a
   - brak danych → UNKNOWN

ZASADA KLUCZOWA:
- NIGDY nie zgadywać wartości — brak danych = UNKNOWN
- Resolver NIE jest solverem — nie wykonuje obliczeń zwarciowych/rozpływowych
- Jedyne dozwolone obliczenie: In transformatora z Sn/Un
"""

from __future__ import annotations

from application.analyses.protection.base_values.models import (
    BaseValues,
    BaseValueSourceIn,
    BaseValueSourceUn,
    ProtectedElementContext,
    ProtectedElementType,
    TransformerSide,
)
from network_model.pochodne import prad_roboczy_a


def resolve_base_values(ctx: ProtectedElementContext) -> BaseValues:
    """
    Rozwiąż bazowe wartości Un/In na podstawie kontekstu elementu chronionego.

    Args:
        ctx: kontekst elementu z dostępnymi danymi znamionowymi

    Returns:
        BaseValues z rozwiązanymi wartościami i informacją o źródle

    Raises:
        ValueError: jeśli kontekst jest niespójny (np. brak element_type)
    """
    un_kv, source_un, notes_un = _resolve_un(ctx)
    in_a, source_in, notes_in = _resolve_in(ctx)

    # Łączymy notatki
    notes_parts = []
    if notes_un:
        notes_parts.append(notes_un)
    if notes_in:
        notes_parts.append(notes_in)
    notes_pl = "; ".join(notes_parts) if notes_parts else ""

    return BaseValues(
        un_kv=un_kv,
        in_a=in_a,
        source_un=source_un,
        source_in=source_in,
        notes_pl=notes_pl,
    )


def _resolve_un(
    ctx: ProtectedElementContext,
) -> tuple[float | None, BaseValueSourceUn, str]:
    """
    Rozwiąż napięcie odniesienia Un.

    Priorytety:
    1. VT primary (jeśli dostępne) — najdokładniejszy pomiar
    2. Bus voltage (jeśli dostępne) — z modelu sieci
    3. BoundaryNode voltage (jeśli element to BoundaryNode)
    4. UNKNOWN — brak danych
    """
    # Priorytet 1: VT primary
    if ctx.vt_primary_kv is not None and ctx.vt_primary_kv > 0:
        return (
            ctx.vt_primary_kv,
            BaseValueSourceUn.VT_PRIMARY,
            f"Un = {ctx.vt_primary_kv} kV (VT primary)",
        )

    # Priorytet 2: Bus voltage
    if ctx.bus_voltage_kv is not None and ctx.bus_voltage_kv > 0:
        return (
            ctx.bus_voltage_kv,
            BaseValueSourceUn.BUS,
            f"Un = {ctx.bus_voltage_kv} kV (szyna)",
        )

    # Priorytet 3: BoundaryNode voltage (jeśli element to BoundaryNode lub mamy dane BoundaryNode)
    if ctx.element_type == ProtectedElementType.BoundaryNode:
        if ctx.connection_voltage_kv is not None and ctx.connection_voltage_kv > 0:
            return (
                ctx.connection_voltage_kv,
                BaseValueSourceUn.BoundaryNode,
                f"Un = {ctx.connection_voltage_kv} kV (BoundaryNode – punkt wspolnego przylaczenia)",
            )

    # Fallback na BoundaryNode voltage jeśli dostępne
    if ctx.connection_voltage_kv is not None and ctx.connection_voltage_kv > 0:
        return (
            ctx.connection_voltage_kv,
            BaseValueSourceUn.BoundaryNode,
            f"Un = {ctx.connection_voltage_kv} kV (BoundaryNode)",
        )

    # Brak danych
    return (None, BaseValueSourceUn.UNKNOWN, "Un nieznane – brak danych napieciowych")


def _resolve_in(
    ctx: ProtectedElementContext,
) -> tuple[float | None, BaseValueSourceIn, str]:
    """
    Rozwiąż prąd odniesienia In.

    Logika zależna od typu elementu chronionego:
    - LINE/CABLE: line_rated_current_a
    - BREAKER: breaker_rated_current_a
    - TRANSFORMER: In = Sn / (√3 × Un_strony)
    - BoundaryNode: connection_rated_current_a
    - BUS: preferuje breaker, potem line (pole rozdzielcze)
    """
    element_type = ctx.element_type

    # LINE / CABLE
    if element_type in (ProtectedElementType.LINE, ProtectedElementType.CABLE):
        if ctx.line_rated_current_a is not None and ctx.line_rated_current_a > 0:
            return (
                ctx.line_rated_current_a,
                BaseValueSourceIn.LINE,
                f"In = {ctx.line_rated_current_a:.1f} A (linia/kabel)",
            )
        return (None, BaseValueSourceIn.UNKNOWN, "In nieznane – brak rated_current_a linii")

    # BREAKER
    if element_type == ProtectedElementType.BREAKER:
        if ctx.breaker_rated_current_a is not None and ctx.breaker_rated_current_a > 0:
            return (
                ctx.breaker_rated_current_a,
                BaseValueSourceIn.BREAKER,
                f"In = {ctx.breaker_rated_current_a:.1f} A (wylacznik)",
            )
        return (None, BaseValueSourceIn.UNKNOWN, "In nieznane – brak rated_current_a wylacznika")

    # TRANSFORMER
    if element_type == ProtectedElementType.TRANSFORMER:
        return _resolve_in_transformer(ctx)

    # BoundaryNode
    if element_type == ProtectedElementType.BoundaryNode:
        if ctx.connection_rated_current_a is not None and ctx.connection_rated_current_a > 0:
            return (
                ctx.connection_rated_current_a,
                BaseValueSourceIn.BoundaryNode,
                f"In = {ctx.connection_rated_current_a:.1f} A (BoundaryNode – punkt wspolnego przylaczenia)",
            )
        return (None, BaseValueSourceIn.UNKNOWN, "In nieznane – brak rated_current_a BoundaryNode")

    # BUS — może mieć przypisane zabezpieczenie (np. pole rozdzielcze)
    if element_type == ProtectedElementType.BUS:
        # Preferencja: breaker (zabezpieczenie na polu)
        if ctx.breaker_rated_current_a is not None and ctx.breaker_rated_current_a > 0:
            return (
                ctx.breaker_rated_current_a,
                BaseValueSourceIn.BREAKER,
                f"In = {ctx.breaker_rated_current_a:.1f} A (wylacznik pola)",
            )
        # Fallback: line (jeśli szyna ma przypisaną linię)
        if ctx.line_rated_current_a is not None and ctx.line_rated_current_a > 0:
            return (
                ctx.line_rated_current_a,
                BaseValueSourceIn.LINE,
                f"In = {ctx.line_rated_current_a:.1f} A (linia)",
            )
        # BoundaryNode jeśli to szyna BoundaryNode
        if ctx.connection_rated_current_a is not None and ctx.connection_rated_current_a > 0:
            return (
                ctx.connection_rated_current_a,
                BaseValueSourceIn.BoundaryNode,
                f"In = {ctx.connection_rated_current_a:.1f} A (BoundaryNode)",
            )
        return (None, BaseValueSourceIn.UNKNOWN, "In nieznane – brak danych pradowych szyny")

    # UNKNOWN element type
    return (None, BaseValueSourceIn.UNKNOWN, "In nieznane – nieobslugiwany typ elementu")


def _resolve_in_transformer(
    ctx: ProtectedElementContext,
) -> tuple[float | None, BaseValueSourceIn, str]:
    """
    Rozwiąż prąd odniesienia In dla transformatora.

    Wzór: In = Sn / (√3 × Un_strony)

    Gdzie:
    - Sn = transformer_rated_power_mva [MVA]
    - Un_strony = voltage_hv_kv lub voltage_lv_kv [kV] zależnie od transformer_side

    To jest jedyne dozwolone obliczenie w resolverze (NIE jest to solver).
    """
    sn = ctx.transformer_rated_power_mva
    side = ctx.transformer_side

    if sn is None or sn <= 0:
        return (
            None,
            BaseValueSourceIn.UNKNOWN,
            "In nieznane – brak mocy znamionowej transformatora (Sn)",
        )

    # Określ napięcie strony
    if side == TransformerSide.HV:
        un_side = ctx.transformer_voltage_hv_kv
        side_label = "WN"
    elif side == TransformerSide.LV:
        un_side = ctx.transformer_voltage_lv_kv
        side_label = "nN"
    else:
        # Brak informacji o stronie — spróbuj LV jako domyślne (częstsze pomiary)
        un_side = ctx.transformer_voltage_lv_kv
        if un_side is None or un_side <= 0:
            un_side = ctx.transformer_voltage_hv_kv
            side_label = "WN (domyslnie)"
        else:
            side_label = "nN (domyslnie)"

    if un_side is None or un_side <= 0:
        return (
            None,
            BaseValueSourceIn.UNKNOWN,
            "In nieznane – brak napiecia strony transformatora",
        )

    # Oblicz In = Sn / (√3 × Un)
    # Sn [MVA], Un [kV] → In [kA], więc ×1000 dla [A]
    in_a = prad_roboczy_a(sn, un_side)

    return (
        in_a,
        BaseValueSourceIn.TRANSFORMER_SIDE,
        # Zapis typograficzny (√3), nie surowe ASCII — nota prozy w polu tekstowym.
        f"In = Sn / (√3 × Un_{side_label}) = {sn} MVA / (√3 × {un_side} kV) = {in_a:.1f} A",
    )
