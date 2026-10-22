"""Pasma napięciowe sieci (nN / SN / WN) — JEDNO źródło granic i predykatów w backendzie.

PODSTAWA (teksty pierwotne, zweryfikowane 2026-09-25, karta PASMO-1KV):

* IEC 60038:2009+AMD1:2021 (odpowiednik krajowy PN-EN 60038:2012), p. 4.1 i tytuł tabeli 1:
  „AC systems having a nominal voltage between 100 V and 1 000 V inclusive and related
  equipment" — wartość 1 000 V należy do tabeli niskich napięć; p. 4.3 i tabela 3:
  „AC three-phase systems having a nominal voltage above 1 kV and not exceeding 35 kV".
* Rozporządzenie Ministra Klimatu i Środowiska z dnia 22 marca 2023 r. w sprawie
  szczegółowych warunków funkcjonowania systemu elektroenergetycznego (Dz.U. 2023 poz. 819,
  t.j. Dz.U. 2025 poz. 919), załącznik nr 1 cz. I:
  pkt 3.2 — średnie napięcie (SN): napięcie znamionowe „wyższe niż 1 kV i niższe niż 110 kV";
  pkt 2.2 — wysokie napięcie (WN): „równe 110 kV lub wyższe, ale niższe niż 220 kV",
  najwyższe napięcie (NN): „równe 220 kV lub wyższe";
  § 3 ust. 1 pkt 4–5 — grupy przyłączeniowe IV i V: napięcie znamionowe
  „równe 1 kV lub niższe"; § 3 ust. 2 — napięcie znamionowe określa się w miejscu
  dostarczania.
* IEC 60364-1:2005 p. 11.2 (PN-HD 60364-1): instalacje zasilane napięciem znamionowym
  „up to and including 1 000 V a.c.".

GRANICE (napięcie znamionowe szyny, Uₙ):

    nN ⇔ 0 < Uₙ ≤ 1 kV        SN ⇔ 1 kV < Uₙ < 110 kV        WN ⇔ Uₙ ≥ 110 kV

Pasmo „WN" produktu obejmuje wysokie i najwyższe napięcie rozporządzenia (produkt nie
rozróżnia 220/400 kV w regułach modelu). Rozróżnienie czterech poziomów rozporządzenia
(`poziom_napiecia`) służy wyłącznie ocenom zależnym od poziomu aparatury (granice
wiarygodności Ik''). Skrót „NN" rozporządzenia koliduje z „nN", więc tekst dla projektanta
używa pełnej nazwy (`NAZWA_POZIOMU`).

DLACZEGO TU (liść grafu importów). Predykat pasma czytają warstwy, które nie mogą importować
`enm` (`network_model/core/**` — dobór współczynnika c IEC 60909 i rezystancji fikcyjnej
maszyn, `network_model/catalog/**`, `analysis/**`), a `enm` importuje `network_model`. Moduł
importuje wyłącznie `math` i `typing`, więc każda warstwa bierze go na poziomie modułu bez
cyklu (ta sama zasada co `wielkosci_pochodne.py`).

LUSTRO we froncie: `frontend/src/ui2/model/pasmaNapieciowe.ts`. Parytet pilnują wspólne
tablice `backend/schemas/pasmo_nn_parytet_v1.json` i `pole_transformatorowe_parytet_v1.json`
(pytest + vitest). Każde inne porównanie napięcia z granicą pasma wykrywa
`scripts/pasmo_napieciowe_guard.py` (allowlista pusta).

BRAK NAPIĘCIA. Napięcie nieznane, nieskończone albo niedodatnie nie leży w żadnym paśmie:
`pasmo_napieciowe` zwraca ``None``, `w_pasmie_nn` i `powyzej_pasma_nn` zwracają ``False``
(przynależności nie da się potwierdzić), a `szyna_poza_pasmem_sn` rozróżnia brak danej
(``False`` — nie dyskwalifikuje ostrzeżenia) od wartości niefizycznej (``True``).
"""

from __future__ import annotations

import math
from typing import Literal, TypeAlias

Pasmo: TypeAlias = Literal["nN", "SN", "WN"]
Poziom: TypeAlias = Literal["nN", "SN", "WN", "NN"]

PASMO_NN_MAX_KV = 1.0
"""Górna granica pasma nN [kV], WŁĄCZNIE: `0 < Uₙ ≤ 1,0 kV` ⇒ nN (IEC 60038 tab. 1)."""

PASMO_WN_MIN_KV = 110.0
"""Dolna granica pasma WN [kV], WŁĄCZNIE; zarazem górna granica SN, WYŁĄCZNIE:
`1 kV < Uₙ < 110 kV` ⇒ SN (rozporządzenie, zał. 1 cz. I pkt 3.2 i 2.2)."""

POZIOM_NN_MIN_KV = 220.0
"""Dolna granica najwyższego napięcia [kV], WŁĄCZNIE (rozporządzenie, zał. 1 cz. I pkt 2.2)."""

OPIS_PASMA_NN = "napięcie znamionowe do 1 kV włącznie"
"""Jedno brzmienie pasma nN w komunikatach odmowy i ostrzeżenia (backend i front)."""

OPIS_PASMA_SN = "napięcie znamionowe powyżej 1 kV i poniżej 110 kV"
"""Jedno brzmienie pasma SN w komunikatach."""

NAZWA_POZIOMU: dict[Poziom, str] = {
    "nN": "niskie napięcie",
    "SN": "średnie napięcie",
    "WN": "wysokie napięcie",
    "NN": "najwyższe napięcie",
}
"""Pełne nazwy poziomów napięcia (bez kolizji skrótów „NN" i „nN")."""


def _znane(voltage_kv: float | None) -> float | None:
    if voltage_kv is None:
        return None
    napiecie = float(voltage_kv)
    if not math.isfinite(napiecie) or napiecie <= 0.0:
        return None
    return napiecie


def pasmo_napieciowe(voltage_kv: float | None) -> Pasmo | None:
    """Pasmo napięcia znamionowego: ``'nN'``, ``'SN'``, ``'WN'`` albo ``None`` (brak/niefizyczne)."""
    napiecie = _znane(voltage_kv)
    if napiecie is None:
        return None
    if napiecie <= PASMO_NN_MAX_KV:
        return "nN"
    if napiecie < PASMO_WN_MIN_KV:
        return "SN"
    return "WN"


def poziom_napiecia(voltage_kv: float | None) -> Poziom | None:
    """Poziom napięcia wg rozporządzenia (cztery poziomy, ``'NN'`` = najwyższe napięcie)."""
    pasmo = pasmo_napieciowe(voltage_kv)
    if pasmo == "WN" and float(voltage_kv or 0.0) >= POZIOM_NN_MIN_KV:
        return "NN"
    return pasmo


def w_pasmie_nn(voltage_kv: float | None) -> bool:
    """Czy napięcie NA PEWNO leży w paśmie nN — jedyny predykat bramek strony nN.

    Wspólny dla wejść analiz nN (pętla zwarcia, SWZ, dobór aparatów, dowód obwodu, arkusz
    obwodów, graf domeny nN), pre-kontroli gotowości, walidatora i operacji strony dolnej
    (pola, odbiory, kable, aparaty, źródła nN, stacje SN/nN), żeby bramka wejścia i wyjścia
    miała jedno źródło prawdy (reguła KLASA §3). Brak napięcia albo wartość niedodatnia ⇒
    ``False``: przynależności do pasma nN nie da się potwierdzić, więc bramka odmawia.
    """
    return pasmo_napieciowe(voltage_kv) == "nN"


def powyzej_pasma_nn(voltage_kv: float | None) -> bool:
    """Czy napięcie NA PEWNO leży powyżej pasma nN (SN albo WN).

    Predykat ról „strona SN/WN" (dobór współczynnika c IEC 60909-0 tab. 1 i rezystancji
    fikcyjnej maszyn IEC 60909-0 §6.3/§6.7 — norma definiuje niskie napięcie przez
    IEC 60038 tab. 1, więc granica jest ta sama; szyna SN stacji; transformator SN/SN).
    Brak napięcia albo wartość niedodatnia ⇒ ``False``.
    """
    return pasmo_napieciowe(voltage_kv) in ("SN", "WN")


def szyna_poza_pasmem_sn(voltage_kv: float | None) -> bool:
    """Czy szyna NA PEWNO leży poza pasmem SN.

    Brak danej napięcia ⇒ ``False`` (nie dyskwalifikuje). Tolerancja jest ŚWIADOMA i
    lustrzana z rysunkiem: scena SLD bywa budowana z danych, w których napięcie szyny nie
    dotarło (`busVoltageKv = null`), a marker braku pola transformatorowego jest tam
    potrzebny najbardziej. Wartość obecna, ale niefizyczna (≤ 0, nieskończona), NIE leży w
    paśmie SN ⇒ ``True`` (tablica `pole_transformatorowe_parytet_v1.json`).
    """
    if voltage_kv is None:
        return False
    return pasmo_napieciowe(voltage_kv) != "SN"


# ---------------------------------------------------------------------------
# Najwyższe napięcie urządzeń U_m dla napięcia znamionowego sieci (karta KATALOG-APARATURA-WN)
# ---------------------------------------------------------------------------

NAPIECIE_NAJWYZSZE_URZADZEN_KV: dict[float, float] = {
    # IEC 60038:2009 (PN-EN 60038:2012) tab. 3 — sieci trójfazowe 1–35 kV (seria I):
    3.0: 3.6,
    3.3: 3.6,
    6.0: 7.2,
    6.6: 7.2,
    10.0: 12.0,
    11.0: 12.0,
    # 15 kV i 20 kV — pary potwierdzone w standardzie ENEA Operator „Stacje
    # elektroenergetyczne 110 kV, Zeszyt 1" (wersja 02.2023-2) §10.1 tab. 5, str. I 16/76.
    15.0: 17.5,
    20.0: 24.0,
    22.0: 24.0,
    30.0: 36.0,
    33.0: 36.0,
    35.0: 40.5,
    # IEC 60038 tab. 4 — sieci trójfazowe powyżej 35 kV do 230 kV; para 110 → 123 kV
    # potwierdzona także w ENEA Zeszyt 1 §10.1 tab. 5:
    45.0: 52.0,
    66.0: 72.5,
    69.0: 72.5,
    110.0: 123.0,
    115.0: 123.0,
    132.0: 145.0,
    138.0: 145.0,
    150.0: 170.0,
    220.0: 245.0,
    # IEC 60038 tab. 5 — sieci powyżej 245 kV (podana jest wyłącznie wartość U_m; polska
    # sieć przesyłowa 400 kV pracuje z U_m = 420 kV):
    400.0: 420.0,
}
"""Napięcie znamionowe sieci Uₙ [kV] → najwyższe napięcie urządzeń U_m [kV] (IEC 60038).

U_m wyznacza dolną granicę napięcia znamionowego aparatu U_r w tej sieci (PN-EN 62271-1
p. 5.2: napięcie znamionowe aparatu równe jest najwyższemu napięciu sieci, w której aparat
może pracować)."""

_TOLERANCJA_NAPIECIA_SIECI_KV = 1e-6


def napiecie_najwyzsze_urzadzen_kv(voltage_kv: float | None) -> float | None:
    """Najwyższe napięcie urządzeń U_m [kV] dla sieci o napięciu znamionowym ``voltage_kv``.

    JEDNO źródło tej pary w backendzie: kontrola napięcia aparatu pola (`enm/wyposazenie_pola`)
    i poziom izolacji koordynacji izolacji IEC 60071 (`solver_input/v126_contracts`).

    Napięcie znamionowe spoza tablic IEC 60038 nie ma normowej pary — wtedy U_m to najmniejsza
    wartość typoszeregu U_m tablic 3–5, nie mniejsza niż Uₙ (aparat o niższym U_m nie może
    pracować w tej sieci z definicji napięcia znamionowego). Napięcie w paśmie nN, nieznane
    albo niefizyczne daje ``None`` — dla nN norma aparatury SN/WN nie definiuje U_m.
    """
    napiecie = _znane(voltage_kv)
    if napiecie is None or pasmo_napieciowe(napiecie) == "nN":
        return None
    for znamionowe, u_m in NAPIECIE_NAJWYZSZE_URZADZEN_KV.items():
        if abs(znamionowe - napiecie) <= _TOLERANCJA_NAPIECIA_SIECI_KV:
            return u_m
    for u_m in sorted(set(NAPIECIE_NAJWYZSZE_URZADZEN_KV.values())):
        if u_m >= napiecie:
            return u_m
    return None


def napiecie_aparatu_wystarcza(
    napiecie_znamionowe_aparatu_kv: float | None, napiecie_sieci_kv: float | None
) -> bool | None:
    """Czy aparat o napięciu znamionowym U_r może pracować w sieci o napięciu Uₙ.

    JEDYNY predykat tej reguły w backendzie (PN-EN 62271-1 p. 5.2: U_r ≥ U_m sieci, U_m z pary
    IEC 60038 — `napiecie_najwyzsze_urzadzen_kv`): kontrola aparatu pola
    (`enm/wyposazenie_pola`), zgodność napięciowa rodziny rozdzielnicy
    (`catalog/switchgear/family_validation`) i reguła walidatora modelu czytają tę funkcję.

    ``None`` — rozstrzygnięcie niemożliwe: aparat bez U_r albo sieć bez U_m (napięcie nieznane
    albo w paśmie nN). Brak danej nie jest zgodnością ani niezgodnością.
    """
    u_m = napiecie_najwyzsze_urzadzen_kv(napiecie_sieci_kv)
    u_r = _znane(napiecie_znamionowe_aparatu_kv)
    if u_m is None or u_r is None:
        return None
    return u_r + _TOLERANCJA_NAPIECIA_SIECI_KV >= u_m
