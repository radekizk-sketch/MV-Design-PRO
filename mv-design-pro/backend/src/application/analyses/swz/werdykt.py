"""Werdykt SWZ — samoczynne wyłączenie zasilania (IEC 60364-4-41), karta P0.6 (G-06).

Warstwa ANALIZA (interpretacja — porównanie Ik1_min policzonego przez solver
pętli zwarcia z Ia aparatu, odczyt tabeli czasów Tab. 41.1). NIE solver — nie
liczy impedancji ani prądu, tylko interpretuje gotowe wyniki + dane
normatywne (G-D3/G-D4). Werdykt 3-STANOWY (§0.3 karty P0.6): spełnia / nie
spełnia / NIEROZSTRZYGALNE — trzeci stan jest OBOWIĄZKOWY dla dowolnego
aparatu bez wystarczających danych — NIGDY „spełnia" bez dowodu liczbowego.

Zakres (§0.3): wyłącznie TN (fault_loop solver nie obsługuje TT/IT — MVP
scope, ``fault_loop_iec60364.py``). Ia liczone WYŁĄCZNIE z gwarantowanej
górnej granicy pasma magnetycznego MCB (IEC 60898-1, G-D4) — dolna granica
NIE jest gwarancją zadziałania.

Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN", 2026-08-14): rozszerza ŹRÓDŁO Ia
o ``typ="MCCB"`` (wyłącznik z wyzwalaczem elektronicznym) — Ia z nastawy Ii
(magnetycznej/bezzwłocznej), analogicznie do MCB (gwarantowana górna granica
pasma), ale bez interpolacji pasma normatywnego: Ii JEST już KONKRETNĄ
nastawą (nie normatywnym przedziałem klasy B/C/D), więc Ia = Ii wprost.
Istniejące werdykty MCB/WKLADKA_GG NIETKNIĘTE (żadna gałąź powyżej nie
zmieniona).

Karta D2 (nN, „runda 8", 2026-08-14): ``typ="WKLADKA_GG"`` przestaje być
bezwarunkowo NIEROZSTRZYGALNY — P0.7 zasilił bramki KONWENCJONALNE gG
(Inf=1,25×In/If=1,6×In, `protection_lv_curves.compute_fuse_gg_gate`,
podwójnie zweryfikowane). Werdykt „NIE SPEŁNIA" jest ROZSTRZYGALNY z tych
bramek: Ik1_min<=Inf ⇒ norma gwarantuje brak stopienia NAWET w (dłuższym)
czasie umownym normy (1-4h) ⇒ a fortiori nie stopi się w KRÓTSZYM
t_wymagany SWZ (monotoniczność charakterystyki t-I). Werdykt „SPEŁNIA"
wymaga OSOBNEJ bramki I-t przy t_wymagany dokładnym (0,1-5 s, inny czas niż
umowny normy) — rejestr `protection_lv_curves.
FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER` jest PUSTY (próba pozyskania podwójnie
zweryfikowanych wartości podjęta i udokumentowana w tamtym module, bez
potwierdzenia źródłowego) — więc „spełnia" pozostaje NIEOSIĄGALNE do czasu
uzupełnienia rejestru (mechanizm gotowy, zero fabrykacji tymczasem).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from network_model.catalog.lv_disconnection_times_iec60364_4_41 import (
    CZAS_TN_ROZDZIELCZY,
    TABLICA_TN_ODBIORCZE,
    pasmo_dla_u0,
)
from network_model.catalog.lv_mcb_bands_iec60898 import ia_gwarantowane_a
from network_model.solvers.protection_lv_curves import (
    FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL,
    FUSE_GG_GATE_SOURCE_PL,
    GwarancjaNormy,
    bramka_t_wymagany_gg_a,
    compute_fuse_gg_gate,
)

# Próg prądu znamionowego obwodu odbiorczego wg §411.3.2.2 normy — karta P0.6
# upraszcza do JEDNEGO progu 63 A (patrz docstring
# ``lv_disconnection_times_iec60364_4_41`` — norma rozróżnia 63 A dla obwodów
# z gniazdami / 32 A dla odbiorników na stałe; obecność gniazd nie jest
# modelowana). Uproszczenie JAWNE — konsument może nadpisać przez
# ``rodzaj_obwodu`` jawnie podany.
PROG_PRADU_OBWODU_ODBIORCZEGO_A = 63.0

_TYPY_APARATU_DOZWOLONE = ("MCB", "WKLADKA_GG", "MCCB")


class SwzStatus(StrEnum):
    SPELNIA = "spełnia"
    NIE_SPELNIA = "nie spełnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


@dataclass(frozen=True)
class AparatZabezpieczajacy:
    """Dane wejściowe aparatu zabezpieczającego obwód — dla werdyktu SWZ.

    ``typ="MCB"``: wymaga ``in_a`` i ``klasa_mcb`` (B/C/D) — Ia z G-D4.
    ``typ="WKLADKA_GG"`` (karta D2): wymaga ``in_a`` (> 16 A — jedyny
    zweryfikowany zakres G-D2). Bramki KONWENCJONALNE Inf/If (IEC 60269-1)
    rozstrzygają „nie spełnia" wprost (Ik1_min<=Inf); „spełnia" wymaga
    dodatkowo bramki przy t_wymagany dokładnym — pusta do czasu potwierdzenia
    źródłowego (zob. docstring modułu i `protection_lv_curves.
    FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER`), więc pośredni zakres prądów daje
    NIEROZSTRZYGALNE (fail-closed, nigdy PASS bez dowodu przy t_wymagany).
    ``typ="MCCB"`` (karta D1): wymaga ``ii_a`` (nastawa zwarciowa/magnetyczna
    Ii, RESOLWOWANA — wartość absolutna [A], nie zakres) — Ia = ``ii_a``
    wprost (bez interpolacji, Ii jest już konkretną nastawą, nie normatywnym
    przedziałem). Brak ``ii_a`` → NIEROZSTRZYGALNY (zero fabrykacji).
    Inny ``typ`` (nieobsłużony) → NIEROZSTRZYGALNY (brak modelu Ia, nie
    fabrykacja).
    """

    typ: str
    in_a: float | None = None
    klasa_mcb: str | None = None
    ii_a: float | None = None


@dataclass(frozen=True)
class SwzResult:
    """Werdykt SWZ + PEŁEN dowód liczbowy (WHITE BOX)."""

    status: SwzStatus
    przyczyna_pl: str
    ik1_min_a: float
    ia_wymagane_a: float | None
    t_wymagany_s: float | None
    margines: float | None
    rodzaj_obwodu: str
    pasmo_u0: str
    white_box_trace: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "przyczyna_pl": self.przyczyna_pl,
            "ik1_min_a": self.ik1_min_a,
            "ia_wymagane_a": self.ia_wymagane_a,
            "t_wymagany_s": self.t_wymagany_s,
            "margines": self.margines,
            "rodzaj_obwodu": self.rodzaj_obwodu,
            "pasmo_u0": self.pasmo_u0,
            "white_box_trace": list(self.white_box_trace),
        }


def ocen_swz(
    *,
    ik1_min_a: float,
    u0_v: float,
    aparat: AparatZabezpieczajacy,
    rodzaj_obwodu: str | None = None,
) -> SwzResult:
    """Werdykt 3-stanowy SWZ dla obwodu w układzie TN (IEC 60364-4-41).

    Args:
        ik1_min_a: Prąd zwarcia jednofazowego minimalny (Ik1_min) w punkcie
            obwodu — z ``network_model.solvers.fault_loop_iec60364.
            compute_fault_loop`` (scenariusz MIN, R skorygowane temperaturowo
            — zob. ``application.analyses.fault_loop.route.
            route_segments_min_scenario``).
        u0_v: Napięcie fazowe znamionowe [V] (zwykle 230 V).
        aparat: Dane aparatu zabezpieczającego (MCB albo wkładka gG).
        rodzaj_obwodu: ``"odbiorczy"`` / ``"rozdzielczy"`` — jeśli ``None``,
            wyprowadzone z ``aparat.in_a`` wg progu 63 A (uproszczenie karty,
            patrz ``PROG_PRADU_OBWODU_ODBIORCZEGO_A``).

    Raises:
        ValueError: ``ik1_min_a < 0``, ``rodzaj_obwodu`` spoza
            {None, "odbiorczy", "rozdzielczy"}, albo ``u0_v`` poza zakresem
            Tab. 41.1 (``pasmo_dla_u0``).
    """
    if ik1_min_a < 0:
        raise ValueError(f"ik1_min_a musi być ≥ 0, otrzymano {ik1_min_a}.")
    if rodzaj_obwodu not in (None, "odbiorczy", "rozdzielczy"):
        raise ValueError(
            f"rodzaj_obwodu musi być 'odbiorczy'/'rozdzielczy'/None, otrzymano {rodzaj_obwodu!r}."
        )

    trace: list[dict[str, Any]] = []
    pasmo = pasmo_dla_u0(u0_v)

    if rodzaj_obwodu is None:
        rodzaj = (
            "odbiorczy"
            if (aparat.in_a is not None and aparat.in_a <= PROG_PRADU_OBWODU_ODBIORCZEGO_A)
            else "rozdzielczy"
        )
    else:
        rodzaj = rodzaj_obwodu

    wpis_czasu = TABLICA_TN_ODBIORCZE[pasmo] if rodzaj == "odbiorczy" else CZAS_TN_ROZDZIELCZY
    t_wymagany = wpis_czasu.czas_s

    trace.append(
        {
            "step": "tabela_czasow_41_1",
            "method": "Tab. 41.1 IEC 60364-4-41 (TN)",
            "u0_v": u0_v,
            "pasmo_u0": pasmo,
            "rodzaj_obwodu": rodzaj,
            "t_wymagany_s": t_wymagany,
            "podstawa": wpis_czasu.podstawa,
        }
    )

    if aparat.typ == "WKLADKA_GG":
        if aparat.in_a is None:
            trace.append(
                {
                    "step": "aparat_wkladka_gg_brak_in",
                    "method": "G-D2 — bramki I-t gG wymagają In wkładki",
                    "result": "NIEROZSTRZYGALNE",
                }
            )
            return SwzResult(
                status=SwzStatus.NIEROZSTRZYGALNE,
                przyczyna_pl=(
                    "Wkładka topikowa gG bez prądu znamionowego In — bramki I-t (G-D2, "
                    "IEC 60269-1) nie do wyznaczenia bez In. Werdykt SWZ NIEROZSTRZYGALNY."
                ),
                ik1_min_a=ik1_min_a,
                ia_wymagane_a=None,
                t_wymagany_s=t_wymagany,
                margines=None,
                rodzaj_obwodu=rodzaj,
                pasmo_u0=pasmo,
                white_box_trace=tuple(trace),
            )

        if aparat.in_a <= 16.0:
            trace.append(
                {
                    "step": "aparat_wkladka_gg_poza_zakresem",
                    "method": "G-D2 — mnożniki bramek dla In<=16A NIE zaimplementowane",
                    "in_a": aparat.in_a,
                    "result": "NIEROZSTRZYGALNE",
                }
            )
            return SwzResult(
                status=SwzStatus.NIEROZSTRZYGALNE,
                przyczyna_pl=(
                    f"Wkładka topikowa gG In={aparat.in_a:g} A <= 16 A — poza zweryfikowanym "
                    "zakresem G-D2 (mnożniki bramek Inf/If dla In<=16A różnią się od "
                    "In>16A wg IEC 60269-1 i nie mają w tej karcie podwójnej weryfikacji "
                    "źródłowej — patrz `protection_lv_curves._czas_umowny_fuse_gg_s`). "
                    "Werdykt SWZ NIEROZSTRZYGALNY, nie fabrykacja mnożnika."
                ),
                ik1_min_a=ik1_min_a,
                ia_wymagane_a=None,
                t_wymagany_s=t_wymagany,
                margines=None,
                rodzaj_obwodu=rodzaj,
                pasmo_u0=pasmo,
                white_box_trace=tuple(trace),
            )

        # Karta D2 (nN, „runda 8"): bramki konwencjonalne Inf/If (G-D2,
        # podwójnie zweryfikowane, IEC 60269-1) — REUSE `compute_fuse_gg_gate`
        # (solver), zero drugiej fizyki (zakaz duplikowania Inf=1,25×In /
        # If=1,6×In w tej warstwie interpretacji).
        bramka_konwencjonalna = compute_fuse_gg_gate(i_query_a=ik1_min_a, in_a=aparat.in_a)
        trace.append(
            {
                "step": "aparat_wkladka_gg_bramka_konwencjonalna",
                "solver_trace": bramka_konwencjonalna.white_box_trace,
            }
        )

        if bramka_konwencjonalna.gwarancja == GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY:
            # §0 pkt 1a karty D2: Ik1_min <= Inf ⇒ norma GWARANTUJE brak
            # stopienia NAWET w (dłuższym) czasie umownym (1-4h) — a fortiori
            # nie stopi się w KRÓTSZYM t_wymagany (0,1-5 s) SWZ. Charakterystyka
            # t-I jest monotoniczna (mniejszy prąd ⇒ dłuższy/nieskończony czas
            # stopienia), więc ten wniosek NIE wymaga bramki przy t_wymagany —
            # rozstrzygalny wprost z Inf, bez ekstrapolacji.
            margines = (
                ik1_min_a / bramka_konwencjonalna.inf_a
                if bramka_konwencjonalna.inf_a > 0
                else float("inf")
            )
            trace.append(
                {
                    "step": "werdykt_gg_nie_spelnia",
                    "method": (
                        "Ik1_min <= Inf ⇒ brak stopienia gwarantowany NAWET w czasie "
                        "umownym normy (dłuższym niż t_wymagany SWZ) — monotoniczność "
                        "charakterystyki t-I gG (mniejszy prąd nigdy nie topi szybciej)"
                    ),
                    "ik1_min_a": ik1_min_a,
                    "inf_a": bramka_konwencjonalna.inf_a,
                    "t_wymagany_s": t_wymagany,
                    "result": SwzStatus.NIE_SPELNIA.value,
                }
            )
            przyczyna = (
                f"Ik1_min={ik1_min_a:.1f} A <= Inf={bramka_konwencjonalna.inf_a:.1f} A "
                f"(wkładka gG {aparat.in_a:g} A, IEC 60269-1, {FUSE_GG_GATE_SOURCE_PL}) — "
                "norma gwarantuje BRAK stopienia nawet w (dłuższym) czasie umownym normy "
                f"({bramka_konwencjonalna.t_umowny_s:g} s), więc a fortiori wkładka NIE "
                f"stopi się w krótszym t_wymagany={t_wymagany:g} s SWZ ({rodzaj}, pasmo U0 "
                f"{pasmo}) — charakterystyka t-I gG jest monotoniczna. NIE SPEŁNIA."
            )
            return SwzResult(
                status=SwzStatus.NIE_SPELNIA,
                przyczyna_pl=przyczyna,
                ik1_min_a=ik1_min_a,
                ia_wymagane_a=bramka_konwencjonalna.inf_a,
                t_wymagany_s=t_wymagany,
                margines=margines,
                rodzaj_obwodu=rodzaj,
                pasmo_u0=pasmo,
                white_box_trace=tuple(trace),
            )

        # §0 pkt 1b/1c karty D2: „spełnia" wymaga bramki I-t PRZY t_wymagany
        # dokładnym (0,1-5 s) — Inf/If gwarantują zachowanie WYŁĄCZNIE w
        # czasie umownym normy (1-4h), fizycznie INNYM pytaniu. SPRÓBUJ
        # zasilić bramkę podwójnie zweryfikowaną (rejestr
        # `FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER` — patrz status badania w
        # `protection_lv_curves.py`); gdy brak — warunkowe NIEROZSTRZYGALNE,
        # NIGDY fabrykowane „spełnia".
        bramka_t_wym_a = bramka_t_wymagany_gg_a(t_wymagany_s=t_wymagany, in_a=aparat.in_a)
        trace.append(
            {
                "step": "aparat_wkladka_gg_bramka_t_wymagany",
                "t_wymagany_s": t_wymagany,
                "bramka_t_wymagany_a": bramka_t_wym_a,
                "status_zrodel": (
                    "potwierdzona podwójnie"
                    if bramka_t_wym_a is not None
                    else FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL
                ),
            }
        )

        if bramka_t_wym_a is not None and ik1_min_a >= bramka_t_wym_a:
            margines = ik1_min_a / bramka_t_wym_a if bramka_t_wym_a > 0 else float("inf")
            trace.append(
                {
                    "step": "werdykt_gg_spelnia",
                    "ik1_min_a": ik1_min_a,
                    "bramka_t_wymagany_a": bramka_t_wym_a,
                    "t_wymagany_s": t_wymagany,
                    "result": SwzStatus.SPELNIA.value,
                }
            )
            przyczyna = (
                f"Ik1_min={ik1_min_a:.1f} A >= bramka(t_wymagany={t_wymagany:g} s)="
                f"{bramka_t_wym_a:.1f} A (wkładka gG {aparat.in_a:g} A) — norma gwarantuje "
                f"stopienie w t_wymagany={t_wymagany:g} s ({rodzaj}, pasmo U0 {pasmo}). "
                "SPEŁNIA."
            )
            return SwzResult(
                status=SwzStatus.SPELNIA,
                przyczyna_pl=przyczyna,
                ik1_min_a=ik1_min_a,
                ia_wymagane_a=bramka_t_wym_a,
                t_wymagany_s=t_wymagany,
                margines=margines,
                rodzaj_obwodu=rodzaj,
                pasmo_u0=pasmo,
                white_box_trace=tuple(trace),
            )

        if bramka_t_wym_a is None:
            przyczyna = (
                f"Ik1_min={ik1_min_a:.1f} A > Inf={bramka_konwencjonalna.inf_a:.1f} A "
                f"(wkładka gG {aparat.in_a:g} A) — norma NIE gwarantuje braku stopienia, ale "
                f"brak PODWÓJNIE zweryfikowanej bramki czasowo-prądowej przy "
                f"t_wymagany={t_wymagany:g} s SWZ ({rodzaj}, pasmo U0 {pasmo}) w rejestrze "
                f"({FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL}). Bramki Inf/If (G-D2) gwarantują "
                f"WYŁĄCZNIE zachowanie w czasie umownym normy "
                f"({bramka_konwencjonalna.t_umowny_s:g} s), NIE w t_wymagany SWZ — nie da "
                "się wyprowadzić werdyktu 'spełnia' bez ekstrapolacji (zakaz §0.2 karty "
                "P0.7). NIEROZSTRZYGALNE (warunkowe)."
            )
        else:
            przyczyna = (
                f"Ik1_min={ik1_min_a:.1f} A < bramka(t_wymagany={t_wymagany:g} s)="
                f"{bramka_t_wym_a:.1f} A (wkładka gG {aparat.in_a:g} A) — Ik1_min powyżej "
                f"Inf, ale poniżej bramki gwarantującej stopienie w t_wymagany={t_wymagany:g} "
                f"s ({rodzaj}, pasmo U0 {pasmo}) — norma nie gwarantuje ani braku, ani "
                "wystąpienia stopienia w tym przedziale (zakaz interpolacji, §0.2 karty "
                "P0.7). NIEROZSTRZYGALNE (warunkowe)."
            )
        trace.append(
            {
                "step": "werdykt_gg_nierozstrzygalne",
                "ik1_min_a": ik1_min_a,
                "inf_a": bramka_konwencjonalna.inf_a,
                "if_a": bramka_konwencjonalna.if_a,
                "bramka_t_wymagany_a": bramka_t_wym_a,
                "t_wymagany_s": t_wymagany,
                "result": SwzStatus.NIEROZSTRZYGALNE.value,
            }
        )
        return SwzResult(
            status=SwzStatus.NIEROZSTRZYGALNE,
            przyczyna_pl=przyczyna,
            ik1_min_a=ik1_min_a,
            ia_wymagane_a=None,
            t_wymagany_s=t_wymagany,
            margines=None,
            rodzaj_obwodu=rodzaj,
            pasmo_u0=pasmo,
            white_box_trace=tuple(trace),
        )

    if aparat.typ == "MCCB":
        if aparat.ii_a is None:
            trace.append(
                {
                    "step": "aparat_mccb_brak_nastawy_ii",
                    "method": "Karta D1 — Ia z nastawy Ii (magnetycznej/bezzwłocznej)",
                    "result": "NIEROZSTRZYGALNE",
                }
            )
            return SwzResult(
                status=SwzStatus.NIEROZSTRZYGALNE,
                przyczyna_pl=(
                    "Wyłącznik z wyzwalaczem elektronicznym (MCCB) bez rozwiązanej nastawy "
                    "zwarciowej Ii w katalogu — Ia nie do wyznaczenia bez fabrykacji danych."
                ),
                ik1_min_a=ik1_min_a,
                ia_wymagane_a=None,
                t_wymagany_s=t_wymagany,
                margines=None,
                rodzaj_obwodu=rodzaj,
                pasmo_u0=pasmo,
                white_box_trace=tuple(trace),
            )

        ia = aparat.ii_a
        margines = ik1_min_a / ia if ia > 0 else float("inf")
        spelnia = ik1_min_a >= ia

        trace.append(
            {
                "step": "ia_z_nastawy_ii_mccb",
                "method": "Ia = Ii (nastawa zwarciowa/bezzwłoczna wyzwalacza elektronicznego, "
                "IEC 60947-2) — karta D1, bez interpolacji pasma (Ii jest KONKRETNĄ nastawą)",
                "ii_a": aparat.ii_a,
                "ia_a": ia,
            }
        )
        trace.append(
            {
                "step": "werdykt",
                "method": "Ik1_min ≥ Ia ⇒ wyzwolenie zwarciowe (natychmiastowe) gwarantowane "
                "(<0,1 s < t_wymagany z Tab. 41.1)",
                "ik1_min_a": ik1_min_a,
                "ia_a": ia,
                "margines": margines,
                "result": SwzStatus.SPELNIA.value if spelnia else SwzStatus.NIE_SPELNIA.value,
            }
        )

        przyczyna = (
            f"Ik1_min={ik1_min_a:.1f} A {'≥' if spelnia else '<'} Ia={ia:.1f} A "
            f"(MCCB, nastawa Ii={aparat.ii_a:.1f} A — wyzwolenie zwarciowe natychmiastowe, "
            f"<0,1 s, IEC 60947-2). Czas wyzwolenia jest poniżej t_wymagany={t_wymagany:g} s "
            f"z Tab. 41.1 ({rodzaj}, pasmo U0 {pasmo}), więc kryterium czasowe jest spełnione "
            "automatycznie po spełnieniu kryterium prądowego."
            if spelnia
            else (
                f"Ik1_min={ik1_min_a:.1f} A < Ia={ia:.1f} A (MCCB, nastawa Ii="
                f"{aparat.ii_a:.1f} A) — wyzwolenie zwarciowe NIE jest gwarantowane przy tej "
                f"nastawie; aparat może nie wyłączyć w czasie t_wymagany={t_wymagany:g} s "
                f"z Tab. 41.1 ({rodzaj}, pasmo U0 {pasmo})."
            )
        )

        return SwzResult(
            status=SwzStatus.SPELNIA if spelnia else SwzStatus.NIE_SPELNIA,
            przyczyna_pl=przyczyna,
            ik1_min_a=ik1_min_a,
            ia_wymagane_a=ia,
            t_wymagany_s=t_wymagany,
            margines=margines,
            rodzaj_obwodu=rodzaj,
            pasmo_u0=pasmo,
            white_box_trace=tuple(trace),
        )

    if aparat.typ != "MCB":
        trace.append(
            {
                "step": "aparat_typ_nieobslugiwany",
                "typ": aparat.typ,
                "dozwolone": list(_TYPY_APARATU_DOZWOLONE),
                "result": "NIEROZSTRZYGALNE",
            }
        )
        return SwzResult(
            status=SwzStatus.NIEROZSTRZYGALNE,
            przyczyna_pl=(
                f"Typ aparatu '{aparat.typ}' nieobsłużony w werdykcie SWZ karty P0.6 "
                f"(obsługiwane: {', '.join(_TYPY_APARATU_DOZWOLONE)}) — brak modelu Ia, "
                "nie fabrykacja."
            ),
            ik1_min_a=ik1_min_a,
            ia_wymagane_a=None,
            t_wymagany_s=t_wymagany,
            margines=None,
            rodzaj_obwodu=rodzaj,
            pasmo_u0=pasmo,
            white_box_trace=tuple(trace),
        )

    if aparat.in_a is None or aparat.klasa_mcb is None:
        trace.append(
            {
                "step": "aparat_mcb_dane_niekompletne",
                "in_a": aparat.in_a,
                "klasa_mcb": aparat.klasa_mcb,
                "result": "NIEROZSTRZYGALNE",
            }
        )
        return SwzResult(
            status=SwzStatus.NIEROZSTRZYGALNE,
            przyczyna_pl=(
                "MCB bez kompletnych danych (In i/lub klasa B/C/D) — Ia nie do "
                "wyznaczenia bez fabrykacji."
            ),
            ik1_min_a=ik1_min_a,
            ia_wymagane_a=None,
            t_wymagany_s=t_wymagany,
            margines=None,
            rodzaj_obwodu=rodzaj,
            pasmo_u0=pasmo,
            white_box_trace=tuple(trace),
        )

    ia = ia_gwarantowane_a(in_a=aparat.in_a, klasa=aparat.klasa_mcb)
    margines = ik1_min_a / ia if ia > 0 else float("inf")
    spelnia = ik1_min_a >= ia

    trace.append(
        {
            "step": "ia_gwarantowane_mcb",
            "method": "Ia = pasmo_magnetyczne_max × In (IEC 60898-1, G-D4)",
            "in_a": aparat.in_a,
            "klasa_mcb": aparat.klasa_mcb,
            "ia_a": ia,
        }
    )
    trace.append(
        {
            "step": "werdykt",
            "method": "Ik1_min ≥ Ia ⇒ wyzwolenie magnetyczne gwarantowane (chwilowe, <0,1 s "
            "< t_wymagany z Tab. 41.1)",
            "ik1_min_a": ik1_min_a,
            "ia_a": ia,
            "margines": margines,
            "result": SwzStatus.SPELNIA.value if spelnia else SwzStatus.NIE_SPELNIA.value,
        }
    )

    przyczyna = (
        f"Ik1_min={ik1_min_a:.1f} A {'≥' if spelnia else '<'} Ia={ia:.1f} A "
        f"(MCB {aparat.klasa_mcb} {aparat.in_a:g} A, wyzwolenie magnetyczne gwarantowane "
        f"na górnej granicy pasma IEC 60898-1). Czas wyzwolenia magnetycznego jest "
        f"chwilowy (<0,1 s) — poniżej t_wymagany={t_wymagany:g} s z Tab. 41.1 "
        f"({rodzaj}, pasmo U0 {pasmo}), więc kryterium czasowe jest spełnione automatycznie "
        "po spełnieniu kryterium prądowego."
        if spelnia
        else (
            f"Ik1_min={ik1_min_a:.1f} A < Ia={ia:.1f} A (MCB {aparat.klasa_mcb} "
            f"{aparat.in_a:g} A) — wyzwolenie magnetyczne NIE jest gwarantowane; "
            f"aparat może nie wyłączyć w czasie t_wymagany={t_wymagany:g} s z Tab. 41.1 "
            f"({rodzaj}, pasmo U0 {pasmo})."
        )
    )

    return SwzResult(
        status=SwzStatus.SPELNIA if spelnia else SwzStatus.NIE_SPELNIA,
        przyczyna_pl=przyczyna,
        ik1_min_a=ik1_min_a,
        ia_wymagane_a=ia,
        t_wymagany_s=t_wymagany,
        margines=margines,
        rodzaj_obwodu=rodzaj,
        pasmo_u0=pasmo,
        white_box_trace=tuple(trace),
    )
