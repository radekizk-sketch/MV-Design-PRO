"""Model składowej zerowej transformatora dwuuzwojeniowego zależny od grupy
połączeń (IEC 60909-0:2016 § 6, składowe symetryczne) — karta SM-3 (V12K-181).

Zdolność ADDYTYWNA: buduje wkład transformatora do sieci składowej zerowej
(Y0/Z0) na podstawie grupy wektorowej ``vector_group`` oraz konfiguracji
uziemienia punktów neutralnych (``hv_neutral``/``lv_neutral``). Przed tą kartą
transformatory były w budowniczym Z0 (``enm.mapping.build_zero_sequence_zbus``)
CAŁKOWICIE POMIJANE — grupa połączeń nie sterowała realnie ścieżką prądu
zerowego. Tu wprowadzamy standardową tablicę połączeń sekwencji zerowej.

WHITE BOX: każdy krok (parsowanie grupy, decyzja o uziemieniu, impedancja
zerowa Z_T0, dodanie 3·Z_N, wybór połączenia sekwencji) jest jawnym śladem ze
wzorem i podstawieniem liczb.

Fizyka (dwuuzwojeniowy TR, składowa zerowa):
    - Uzwojenie w gwiazdę z uziemionym punktem zerowym (YN/yn) daje ZACISKOWĄ
      ścieżkę prądu zerowego do sieci.
    - Uzwojenie w trójkąt (D/d) zamyka prąd zerowy w obwodzie wewnętrznym
      (cyrkulacja), ale jego zacisk zewnętrzny jest OTWARTY dla składowej zerowej
      — stanowi za to drogę powrotu dla uziemionej gwiazdy po drugiej stronie.
    - Uzwojenie w zygzak z uziemieniem (ZN/zn) daje niskoimpedancyjną drogę do
      ziemi na swoim zacisku.
    - Uzwojenie w gwiazdę BEZ uziemienia (Y/y) lub punkt izolowany → zacisk
      OTWARTY (brak drogi prądu zerowego).

Tablica połączeń (strona HV, strona LV → połączenie sekwencji zerowej):
    (gwiazda uziem., gwiazda uziem.)  → SZEREGOWE (droga HV↔LV), Z = Z_T0 + 3Z_N,HV + 3Z_N,LV
    (gwiazda uziem., trójkąt)         → BOCZNIK na HV do ziemi,   Z = Z_T0 + 3Z_N,HV
    (trójkąt,        gwiazda uziem.)  → BOCZNIK na LV do ziemi,   Z = Z_T0 + 3Z_N,LV
    (zygzak uziem.,  *)               → BOCZNIK na HV do ziemi
    (*,              zygzak uziem.)   → BOCZNIK na LV do ziemi
    pozostałe (D-D, YN-y, Y-y, ...)   → OTWARTE (brak ścieżki I0)

Założenia (jawne, IEC 60909-0 § 3.3.3 / § 6):
    Z_T0 (impedancja zerowa transformatora) — model ENM ``Transformer`` NIE
    niesie odrębnej impedancji zerowej, więc przyjmujemy standardowy domyślny
    Z_T0 = Z_T (impedancja rozproszenia zgodnej, NIEskorygowana K_T; korekcja
    K_T dotyczy toru zgodnego prądu zwarciowego, nie zerowego). Jest to
    udokumentowane założenie — jeśli producent poda odrębne Z_T0/Z_T1, należy
    je wprowadzić jako rozszerzenie modelu (dług jawny, patrz raport SM-3).

    Uziemienie punktu neutralnego: impedancja uziemienia Z_N wchodzi do obwodu
    składowej zerowej jako 3·Z_N (norma). ``directly_grounded`` → Z_N = 0;
    ``resistor_grounded``/``petersen_coil`` → Z_N = r + jx z konfiguracji;
    ``isolated`` → brak uziemienia (zacisk otwarty). Gdy brak jawnej
    konfiguracji ``GroundingConfig`` — uziemienie wynika z litery neutralnej w
    grupie (N/n obecne → uziemienie bezpośrednie Z_N=0; brak → nieuziemione).

    Brak ``vector_group`` (None) → połączenie OTWARTE (uczciwy brak danych; TR
    nie wnosi wkładu do Z0 — zachowanie sprzed karty dla TR bez grupy).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from network_model.core.ybus import S_BASE_MVA

from .models import GroundingConfig, Transformer


class WindingZeroSeq(Enum):
    """Klasyfikacja uzwojenia dla składowej zerowej."""

    GROUNDED_WYE = "grounded_wye"
    DELTA = "delta"
    GROUNDED_ZIGZAG = "grounded_zigzag"
    OPEN = "open"  # gwiazda nieuziemiona / punkt izolowany / zygzak nieuziemiony


class ZeroSeqConnection(Enum):
    """Typ połączenia transformatora w sieci składowej zerowej."""

    SERIES_THROUGH = "series_through"  # droga HV↔LV (obie gwiazdy uziemione)
    HV_SHUNT_GROUND = "hv_shunt_ground"  # zacisk HV → ziemia
    LV_SHUNT_GROUND = "lv_shunt_ground"  # zacisk LV → ziemia
    OPEN = "open"  # brak ścieżki prądu zerowego


@dataclass(frozen=True)
class TransformerZeroSeqModel:
    """Wynik modelu składowej zerowej transformatora (per-unit na S_base).

    Atrybuty:
        connection: typ połączenia sekwencji zerowej.
        hv_winding / lv_winding: klasyfikacja uzwojeń.
        z0_pu: impedancja zerowa w per-unit na S_base — szeregowa (SERIES_THROUGH)
            albo bocznikowa (HV/LV_SHUNT_GROUND). None dla OPEN.
        trace: ślad WHITE BOX (lista kroków — wzór + podstawienie).
    """

    connection: ZeroSeqConnection
    hv_winding: WindingZeroSeq
    lv_winding: WindingZeroSeq
    z0_pu: complex | None
    trace: list[dict]


def _parse_vector_group(vector_group: str) -> tuple[str, bool, str, bool]:
    """Parsuje grupę wektorową → (hv_type, hv_neutral_letter, lv_type, lv_neutral_letter).

    hv_type/lv_type ∈ {'Y','D','Z'}. Litera neutralna: 'N' (HV) / 'n' (LV).
    Przykłady: 'Dyn11' → ('D',False,'Y',True); 'YNyn0' → ('Y',True,'Y',True);
    'YNd11' → ('Y',True,'D',False); 'Yyn0' → ('Y',False,'Y',True).
    """
    cleaned = "".join(ch for ch in vector_group if ch.isalpha())
    hv_chars = ""
    lv_chars = ""
    for ch in cleaned:
        if ch.isupper():
            # Strona HV kończy się, gdy pojawia się pierwsza mała litera (LV).
            if lv_chars:
                break
            hv_chars += ch
        else:
            lv_chars += ch
    if not hv_chars or not lv_chars:
        raise ValueError(f"Nieprawidłowa grupa wektorowa: {vector_group!r}")
    hv_type = hv_chars[0]
    hv_neutral = "N" in hv_chars
    lv_type = lv_chars[0].upper()
    lv_neutral = "n" in lv_chars
    return hv_type, hv_neutral, lv_type, lv_neutral


def _neutral_grounded_and_zn(
    grounding: GroundingConfig | None,
    neutral_letter_present: bool,
) -> tuple[bool, complex]:
    """Zwraca (uziemiony?, Z_N [Ω]) na podstawie GroundingConfig / litery neutralnej.

    Priorytet: jawna GroundingConfig > litera neutralna w grupie. 'isolated' →
    brak uziemienia. Brak configu i brak litery → nieuziemione.
    """
    if grounding is not None:
        if grounding.type == "isolated":
            return False, 0j
        if grounding.type == "directly_grounded":
            return True, 0j
        # resistor_grounded / petersen_coil: Z_N = r + jx (0 gdy brak danych).
        return True, complex(grounding.r_ohm or 0.0, grounding.x_ohm or 0.0)
    # Brak jawnej konfiguracji: uziemienie wynika z litery neutralnej (bezpośrednie).
    return neutral_letter_present, 0j


def _classify_winding(
    winding_type: str,
    grounded: bool,
) -> WindingZeroSeq:
    if winding_type == "D":
        return WindingZeroSeq.DELTA
    if winding_type == "Z":
        return WindingZeroSeq.GROUNDED_ZIGZAG if grounded else WindingZeroSeq.OPEN
    # 'Y'
    return WindingZeroSeq.GROUNDED_WYE if grounded else WindingZeroSeq.OPEN


def _z_t_leakage_pu_sn(trafo: Transformer) -> complex:
    """Impedancja rozproszenia (składowa zgodna) w per-unit na S_rT.

    z = uk/100; r = (pk/1000)/Sn; x = sqrt(z² - r²).
    """
    z_pu = trafo.uk_percent / 100.0
    r_pu = (trafo.pk_kw / 1000.0) / trafo.sn_mva if trafo.sn_mva > 0 else 0.0
    disc = z_pu * z_pu - r_pu * r_pu
    x_pu = math.sqrt(disc) if disc > 0 else 0.0
    return complex(r_pu, x_pu)


def _zn_pu_base(zn_ohm: complex, u_side_kv: float) -> complex:
    """3·Z_N w per-unit na S_base i napięciu danej strony: 3·Z_N·S_base/U²."""
    if u_side_kv <= 0:
        return 0j
    z_base_side = (u_side_kv**2) / S_BASE_MVA
    return 3.0 * zn_ohm / z_base_side


def _fmt_c(value: complex) -> str:
    sign = "+" if value.imag >= 0 else "-"
    return f"{value.real:.6g} {sign} j{abs(value.imag):.6g}"


def build_transformer_zero_seq_model(trafo: Transformer) -> TransformerZeroSeqModel:
    """Buduje model składowej zerowej transformatora dwuuzwojeniowego.

    ZERO zgadywania: połączenie wyprowadzone z ``vector_group`` +
    ``hv_neutral``/``lv_neutral``. Brak grupy → OPEN (uczciwy brak danych).
    """
    from network_model.whitebox.tracer import WhiteBoxTracer

    tracer = WhiteBoxTracer()

    if not trafo.vector_group:
        tracer.add(
            key=f"tr_z0_open[{trafo.ref_id}]",
            title=f"Transformator {trafo.name or trafo.ref_id}: brak grupy wektorowej",
            formula_latex=r"\text{brak vector\_group} \Rightarrow Z_0\ \text{otwarte}",
            inputs={"ref_id": trafo.ref_id, "vector_group": None},
            substitution="brak danych grupy → brak ścieżki I0",
            result={"connection": ZeroSeqConnection.OPEN.value},
            notes=(
                "Uczciwy brak: transformator bez grupy wektorowej nie wnosi wkładu "
                "do sieci składowej zerowej (zachowanie sprzed SM-3)."
            ),
        )
        return TransformerZeroSeqModel(
            connection=ZeroSeqConnection.OPEN,
            hv_winding=WindingZeroSeq.OPEN,
            lv_winding=WindingZeroSeq.OPEN,
            z0_pu=None,
            trace=tracer.to_list(),
        )

    hv_type, hv_n_letter, lv_type, lv_n_letter = _parse_vector_group(trafo.vector_group)
    hv_grounded, zn_hv_ohm = _neutral_grounded_and_zn(trafo.hv_neutral, hv_n_letter)
    lv_grounded, zn_lv_ohm = _neutral_grounded_and_zn(trafo.lv_neutral, lv_n_letter)
    hv_winding = _classify_winding(hv_type, hv_grounded)
    lv_winding = _classify_winding(lv_type, lv_grounded)

    tracer.add(
        key=f"tr_z0_parse[{trafo.ref_id}]",
        title=f"Transformator {trafo.name or trafo.ref_id}: klasyfikacja uzwojeń (składowa zerowa)",
        formula_latex=r"\text{vector\_group} \rightarrow (\text{HV}, \text{LV})",
        inputs={
            "ref_id": trafo.ref_id,
            "vector_group": trafo.vector_group,
            "hv_neutral": trafo.hv_neutral.type if trafo.hv_neutral else None,
            "lv_neutral": trafo.lv_neutral.type if trafo.lv_neutral else None,
        },
        substitution=(
            f"HV={hv_type}{'N' if hv_n_letter else ''} → {hv_winding.value}"
            f" (uziem={hv_grounded}); "
            f"LV={lv_type.lower()}{'n' if lv_n_letter else ''} → {lv_winding.value}"
            f" (uziem={lv_grounded})"
        ),
        result={
            "hv_winding": hv_winding.value,
            "lv_winding": lv_winding.value,
            "zn_hv_ohm": zn_hv_ohm,
            "zn_lv_ohm": zn_lv_ohm,
        },
    )

    # Impedancja zerowa transformatora Z_T0 = Z_T (rozproszenie zgodnej, nieskoryg.).
    z_t_pu_sn = _z_t_leakage_pu_sn(trafo)
    z_t_pu_base = z_t_pu_sn * (S_BASE_MVA / trafo.sn_mva) if trafo.sn_mva > 0 else 0j
    zn_hv_pu = _zn_pu_base(zn_hv_ohm, trafo.uhv_kv)
    zn_lv_pu = _zn_pu_base(zn_lv_ohm, trafo.ulv_kv)

    tracer.add(
        key=f"tr_z0_zt[{trafo.ref_id}]",
        title=f"Transformator {trafo.name or trafo.ref_id}: impedancja zerowa Z_T0",
        formula_latex=(
            r"Z_{T0} = Z_T = \left(\frac{p_k}{S_{rT}} + j\sqrt{"
            r"\left(\frac{u_k}{100}\right)^2 - \left(\frac{p_k}{S_{rT}}\right)^2}\right)"
            r"\cdot \frac{S_{base}}{S_{rT}}"
        ),
        inputs={
            "uk_percent": trafo.uk_percent,
            "pk_kw": trafo.pk_kw,
            "sn_mva": trafo.sn_mva,
            "s_base_mva": S_BASE_MVA,
        },
        substitution=(
            f"Z_T0(pu@Sn) = {_fmt_c(z_t_pu_sn)}; " f"Z_T0(pu@Sbase) = {_fmt_c(z_t_pu_base)}"
        ),
        result={"z_t0_pu_sn": z_t_pu_sn, "z_t0_pu_base": z_t_pu_base},
    )

    connection, z0_pu = _decide_connection(hv_winding, lv_winding, z_t_pu_base, zn_hv_pu, zn_lv_pu)

    tracer.add(
        key=f"tr_z0_conn[{trafo.ref_id}]",
        title=f"Transformator {trafo.name or trafo.ref_id}: połączenie sekwencji zerowej",
        formula_latex=(
            r"(\text{HV},\text{LV}) \rightarrow \text{połączenie},\ " r"Z_0 = Z_{T0} + 3Z_{N}"
        ),
        inputs={
            "hv_winding": hv_winding.value,
            "lv_winding": lv_winding.value,
            "z_t0_pu_base": z_t_pu_base,
            "zn_hv_3_pu": zn_hv_pu,
            "zn_lv_3_pu": zn_lv_pu,
        },
        substitution=(
            f"{connection.value}: Z0(pu) = "
            f"{_fmt_c(z0_pu) if z0_pu is not None else '— (otwarte)'}"
        ),
        result={
            "connection": connection.value,
            "z0_pu": z0_pu,
        },
        notes=(
            "SERIES_THROUGH: droga HV↔LV (Z=Z_T0+3Z_N,HV+3Z_N,LV). "
            "HV/LV_SHUNT_GROUND: bocznik zacisku do ziemi (Z=Z_T0+3Z_N). "
            "OPEN: brak ścieżki prądu zerowego (trójkąt/gwiazda nieuziemiona)."
        ),
    )

    return TransformerZeroSeqModel(
        connection=connection,
        hv_winding=hv_winding,
        lv_winding=lv_winding,
        z0_pu=z0_pu,
        trace=tracer.to_list(),
    )


def _decide_connection(
    hv: WindingZeroSeq,
    lv: WindingZeroSeq,
    z_t0_pu: complex,
    zn_hv_pu: complex,
    zn_lv_pu: complex,
) -> tuple[ZeroSeqConnection, complex | None]:
    """Tablica połączeń sekwencji zerowej (deterministyczna)."""
    gw = WindingZeroSeq.GROUNDED_WYE
    delta = WindingZeroSeq.DELTA
    zig = WindingZeroSeq.GROUNDED_ZIGZAG

    if hv == gw and lv == gw:
        return ZeroSeqConnection.SERIES_THROUGH, z_t0_pu + zn_hv_pu + zn_lv_pu
    if hv == gw and lv == delta:
        return ZeroSeqConnection.HV_SHUNT_GROUND, z_t0_pu + zn_hv_pu
    if hv == delta and lv == gw:
        return ZeroSeqConnection.LV_SHUNT_GROUND, z_t0_pu + zn_lv_pu
    # Zygzak uziemiony: droga do ziemi na swoim zacisku (samodzielna droga powrotu).
    if hv == zig:
        return ZeroSeqConnection.HV_SHUNT_GROUND, z_t0_pu + zn_hv_pu
    if lv == zig:
        return ZeroSeqConnection.LV_SHUNT_GROUND, z_t0_pu + zn_lv_pu
    # D-D, YN-y, Y-yn (bez drugiej drogi powrotu), Y-y, izolowane → otwarte.
    return ZeroSeqConnection.OPEN, None
