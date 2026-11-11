"""Słowniki uziemienia — JEDNO miejsce dla literałów, które dzielą model ENM,
katalog i prezentację (karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1–4).

DLACZEGO TU, A NIE W ``enm/models.py``. Katalog (``network_model/catalog/`` — pozycje
zespołu uziemiającego) i domena scenariusza (``domain/fault_scenario.py`` — stan AWSC)
leżą POZA warstwą ENM w grafie importów (``enm`` importuje ``network_model.catalog``,
nigdy odwrotnie), więc typ współdzielony przez te warstwy musi mieszkać w liściu widocznym
dla wszystkich. Przed kartą W5-A ten sam zbiór czterech literałów żył w PIĘCIU słownikach
— każdy z osobna poprawny, razem: pięć predykatów jednego faktu. Karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA dołożyła warianty uziemienia sekcji (Z.13/Z.14/Z.15) i stan
AWSC przypadku, a usunęła katalog wariantów audytu stacji (druga prawda o punkcie
neutralnym SN).

Moduł importuje wyłącznie ``typing`` i liść ``network_model.odmowa_danych`` (biblioteka
standardowa) — jest liściem grafu importów i może być importowany z każdej warstwy na
poziomie modułu.
"""

from __future__ import annotations

from typing import Literal, cast, get_args

from network_model.odmowa_danych import OdmowaNazwana

#: Sposób pracy punktu neutralnego (``GroundingConfig.type``): jedyny słownik
#: wartości w systemie. Etykiety polskie dla prezentacji — obok, żeby żaden
#: konsument nie budował własnej tablicy tłumaczeń.
TypPunktuNeutralnego = Literal[
    "isolated", "petersen_coil", "directly_grounded", "resistor_grounded"
]

TYPY_PUNKTU_NEUTRALNEGO: tuple[str, ...] = get_args(TypPunktuNeutralnego)

ETYKIETA_PL_PUNKTU_NEUTRALNEGO: dict[str, str] = {
    "isolated": "izolowany",
    "petersen_coil": "kompensowany (cewka Petersena)",
    "resistor_grounded": "uziemiony przez rezystor",
    "directly_grounded": "bezpośrednio uziemiony",
}

#: Sieci o MAŁYM prądzie doziemnym (prąd pojemnościowy/resztkowy): kryterium
#: nadprądowe bez kierunkowości bywa w nich nieskuteczne (dobór 67N), a
#: przekładnik napięciowy faza–ziemia wymaga F_v = 1,9 (IEC 61869-3 tab. 2).
#: Uziemienie przez rezystor należy tu ŚWIADOMIE po stronie 1,9 (V12K-256):
#: sieć uziemiona rezystorem NIE jest siecią skutecznie uziemioną.
UZIEMIENIA_MALOPRADOWE: frozenset[str] = frozenset({"isolated", "petersen_coil"})
UZIEMIENIA_WYMAGAJACE_FV_19: frozenset[str] = frozenset(
    {"isolated", "petersen_coil", "resistor_grounded"}
)

#: Układ uziemienia ekranu kabla SN (``Cable.screen_bonding`` i ``CableType.
#: z0_reference_bonding``): jednostronne / dwustronne / krzyżowe (cross-bonding).
UziemienieEkranuKabla = Literal["single_end", "both_ends", "cross_bonded"]

UZIEMIENIA_EKRANU_KABLA: tuple[str, ...] = get_args(UziemienieEkranuKabla)

ETYKIETA_PL_UZIEMIENIA_EKRANU: dict[str, str] = {
    "single_end": "jednostronne",
    "both_ends": "dwustronne",
    "cross_bonded": "krzyżowe (cross-bonding)",
}

#: Rola uziemnika pola (``BayPrimaryDevice.earthing_role``, kind="ES" albo gałąź
#: uziemiająca ogranicznika): uziemnik pola / uziemienie ekranów kabla / konstrukcji /
#: punktu neutralnego / gałąź ogranicznika. Pisarz: kreator pola (`add_sn_bay`,
#: payload `earthing_role`) — do karty W5-A jedynym źródłem był szablon (`field_earth`).
RolaUziemnika = Literal["field_earth", "cable_screen", "structure", "neutral_point", "surge_ground"]

ROLE_UZIEMNIKA: tuple[str, ...] = get_args(RolaUziemnika)

ETYKIETA_PL_ROLI_UZIEMNIKA: dict[str, str] = {
    "field_earth": "uziemnik pola",
    "cable_screen": "uziemienie ekranów kabla",
    "structure": "uziemienie konstrukcji",
    "neutral_point": "uziemienie punktu neutralnego",
    "surge_ground": "gałąź uziemiająca ogranicznika",
}


#: Sposób uziemienia punktu neutralnego SEKCJI SN wyprowadzony z elementów fizycznych
#: modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, `enm/uziemienie_sekcji.py`) — słownik
#: wariantów ENEA Zeszyt 1 §16 (rysunki Z.13/Z.14/Z.15) i punktu neutralnego uzwojenia
#: transformatora. ``dlawik_awsc`` = dławik z rezystorem wymuszającym składową czynną
#: (Z.13); ``dlawik_rezystor`` = dławik równolegle z rezystorem (Z.14); ``rezystor`` =
#: Z.15; ``bezposrednie`` = punkt neutralny uziemiony bez impedancji (uzwojenie
#: transformatora albo jawna deklaracja zespołu uziemiającego).
WariantUziemieniaSekcji = Literal[
    "izolowany", "dlawik", "dlawik_awsc", "rezystor", "dlawik_rezystor", "bezposrednie"
]

WARIANTY_UZIEMIENIA_SEKCJI: tuple[str, ...] = get_args(WariantUziemieniaSekcji)

ETYKIETA_PL_WARIANTU_UZIEMIENIA: dict[str, str] = {
    "izolowany": "sieć izolowana (brak uziemienia punktu neutralnego)",
    "dlawik": "sieć skompensowana — dławik gaszący",
    "dlawik_awsc": "sieć skompensowana — dławik z automatyką wymuszania składowej czynnej (Z.13)",
    "rezystor": "sieć uziemiona przez rezystor (Z.15)",
    "dlawik_rezystor": "sieć uziemiona przez układ równoległy dławik–rezystor (Z.14)",
    "bezposrednie": "punkt neutralny uziemiony bezpośrednio",
}

#: Wariant sekcji → typ punktu neutralnego słownika ``TypPunktuNeutralnego`` — JEDNO
#: odwzorowanie dla konsumentów czterowartościowego słownika (koordynacja izolacji,
#: współczynnik F_v przekładników, droga doziemna pola, zabezpieczenia DER, tryb doziemienia
#: ``tryb_doziemienia_wariantu``). Z.14 niesie stały prąd czynny rezystora, więc jest siecią
#: uziemioną przez rezystor; dławik z AWSC jest siecią skompensowaną w OBU stanach automatyki
#: (rezystor wymuszający to składowa czynna I_w prądu resztkowego, nie uziemienie przez małą
#: impedancję — wariant punktu nie zależy od stanu łącznika AWSC).
TYP_PUNKTU_NEUTRALNEGO_WARIANTU: dict[str, TypPunktuNeutralnego] = {
    "izolowany": "isolated",
    "dlawik": "petersen_coil",
    "dlawik_awsc": "petersen_coil",
    "rezystor": "resistor_grounded",
    "dlawik_rezystor": "resistor_grounded",
    "bezposrednie": "directly_grounded",
}

#: Sposób pracy punktu neutralnego przy doziemieniu jednofazowym — fizyka prądu doziemnego
#: (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru 2026-10-29; solver
#: ``network_model.solvers.doziemienie_sn``): ``izolowany`` — prąd pojemnościowy I_C;
#: ``kompensowany`` — prąd resztkowy √(I_w² + (I_C − I_L)²); ``rezystor`` — |I_N + j·I_C|
#: (Z.15 i Z.14); ``bezposrednie`` — prąd zwarciowy IEC 60909-0 przez Z0.
TrybDoziemienia = Literal["izolowany", "kompensowany", "rezystor", "bezposrednie"]

TRYBY_DOZIEMIENIA: tuple[str, ...] = get_args(TrybDoziemienia)

#: Typ punktu neutralnego → tryb doziemienia: JEDNO odwzorowanie dla zespołu uziemiającego
#: (przez ``TYP_PUNKTU_NEUTRALNEGO_WARIANTU``) i punktu neutralnego uzwojenia transformatora
#: (``GroundingConfig.type``).
TRYB_DOZIEMIENIA_TYPU: dict[str, TrybDoziemienia] = {
    "isolated": "izolowany",
    "petersen_coil": "kompensowany",
    "resistor_grounded": "rezystor",
    "directly_grounded": "bezposrednie",
}

#: Tryby, w których prąd doziemny jest prądem zwarciowym w zakresie IEC 60909-0 (sieć
#: uziemiona przez małą impedancję; IEC 60909-0:2016 rozdz. 1 wyłącza doziemienia w sieciach
#: izolowanych i skompensowanych). JEDYNY predykat „bocznik rezystancyjny" sieci składowej
#: zerowej (``enm.mapping``) i punktu uziemienia (``PunktUziemienia.bocznik_rezystancyjny``).
TRYBY_IEC60909: frozenset[str] = frozenset({"rezystor", "bezposrednie"})


def tryb_doziemienia_typu(typ: str | None) -> TrybDoziemienia:
    """Tryb doziemienia typu punktu neutralnego; ``None`` = uzwojenie z literą N/n bez
    konfiguracji — uziemione bezpośrednio (ta sama reguła co model składowej zerowej
    transformatora, ``enm.zero_sequence_transformer``)."""
    return TRYB_DOZIEMIENIA_TYPU[typ or "directly_grounded"]


def tryb_doziemienia_wariantu(wariant: str) -> TrybDoziemienia:
    """Tryb doziemienia wariantu uziemienia sekcji (przez typ punktu neutralnego)."""
    return TRYB_DOZIEMIENIA_TYPU[TYP_PUNKTU_NEUTRALNEGO_WARIANTU[wariant]]


#: Stan automatyki wymuszania składowej czynnej (AWSC, Z.13) w przypadku obliczeniowym:
#: ``spoczynek`` — łącznik rezystora wymuszającego otwarty (stan normalny), ``zalaczony``
#: — rezystor wymuszający równolegle z dławikiem (stan po pobudzeniu automatyki). Parametr
#: SCENARIUSZA zwarciowego, nie modelu (Case Immutability Rule).
StanAwsc = Literal["spoczynek", "zalaczony"]

STANY_AWSC: tuple[str, ...] = get_args(StanAwsc)

ETYKIETA_PL_STANU_AWSC: dict[str, str] = {
    "spoczynek": "AWSC w spoczynku (rezystor wymuszający odłączony)",
    "zalaczony": "AWSC załączona (rezystor wymuszający równolegle z dławikiem)",
}

#: Klucz opcji biegu zwarciowego ze stanem AWSC (projekcja scenariusza). Klucz obecny
#: WYŁĄCZNIE przy ``zalaczony`` — payload i ``input_hash`` biegów w stanie normalnym
#: pozostają bajtowo te same co przed kartą UX-04/POLE-ZU-SKLADOWA-ZEROWA.
KLUCZ_OPCJI_STANU_AWSC = "stan_awsc"

#: Kod odmowy stanu AWSC spoza słownika (opcje biegu, scenariusz, API).
KOD_STANU_AWSC_NIEPOPRAWNEGO = "fault.stan_awsc_niepoprawny"


def stan_awsc_z_danych(surowy: object) -> StanAwsc:
    """Stan AWSC z kontraktu — ``None`` = stan normalny ``spoczynek``; inna wartość spoza
    słownika to odmowa nazwana (jedna reguła danych dla API, scenariusza i opcji biegu)."""
    if surowy is None:
        return "spoczynek"
    if surowy not in STANY_AWSC:
        raise OdmowaNazwana(
            f"Stan automatyki AWSC musi być jednym z: {', '.join(STANY_AWSC)} "
            f"(otrzymano {surowy!r}).",
            kod=KOD_STANU_AWSC_NIEPOPRAWNEGO,
            dane={"stan_awsc": str(surowy)},
        )
    return cast(StanAwsc, surowy)


#: Stan odłącznika gałęzi punktu neutralnego (odłącznik dławika, odłącznik rezystora —
#: Zeszyt 1 §16, Z.14) zapisany w modelu. Łącznik rezystora wymuszającego AWSC nie ma stanu
#: w modelu — jego stan wybiera przypadek obliczeniowy (``StanAwsc``).
StanLacznikaPunktuNeutralnego = Literal["zamkniety", "otwarty"]

#: Grupa połączeń transformatora uziemiającego (Zeszyt 1 §16: „układ połączeń ZNyn 11").
GrupaTransformatoraUziemiajacego = Literal["ZNyn11", "ZNyn5", "ZNy11", "ZNy5", "ZN"]

GRUPY_TRANSFORMATORA_UZIEMIAJACEGO: tuple[str, ...] = get_args(GrupaTransformatoraUziemiajacego)

#: Regulacja dławika gaszącego: płynna (nadążna, Zeszyt 1 §16 — 10–100 %) albo zaczepowa.
RegulacjaDlawika = Literal["ciagla", "zaczepy"]

#: Strona przyłączenia rezystora wymuszającego AWSC (Zeszyt 1 §16: po stronie wtórnej
#: dławika, 20–40 A po stronie pierwotnej; strona pierwotna przy prądach > 40 A).
StronaRezystoraAwsc = Literal["wtorna", "pierwotna"]


def etykieta_punktu_neutralnego_pl(typ: str | None) -> str:
    """Etykieta PL typu punktu neutralnego; ``None`` = „nieokreślony w modelu"."""
    if typ is None:
        return "punkt neutralny nieokreślony w modelu"
    return ETYKIETA_PL_PUNKTU_NEUTRALNEGO.get(typ, typ)
