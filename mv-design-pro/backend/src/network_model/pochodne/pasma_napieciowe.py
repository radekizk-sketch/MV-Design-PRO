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
# Napięcie najwyższe sieci U_s i poziom izolacji urządzenia U_m (jedna tabela, jeden predykat)
# ---------------------------------------------------------------------------

NAPIECIE_NAJWYZSZE_SIECI_KV: dict[float, float] = {
    # IEC 60038:2009+AMD1:2021 (PN-EN 60038:2012) tab. 3 — sieci trójfazowe powyżej 1 kV
    # do 35 kV, seria I (napięcie znamionowe sieci → napięcie najwyższe sieci = napięcie
    # najwyższe urządzeń):
    3.0: 3.6,
    3.3: 3.6,
    6.0: 7.2,
    6.6: 7.2,
    10.0: 12.0,
    11.0: 12.0,
    # 15 kV — para potwierdzona także w standardzie ENEA Operator „Stacje elektroenergetyczne
    # 110 kV, Zeszyt 1" (wersja 02.2023-2) §10.1 tab. 5 (15 → 17,5 kV, 20 → 24 kV):
    15.0: 17.5,
    20.0: 24.0,
    22.0: 24.0,
    30.0: 36.0,
    33.0: 36.0,
    35.0: 40.5,
    # IEC 60038 tab. 4 — sieci trójfazowe powyżej 35 kV do 230 kV (para 110 → 123 kV
    # potwierdzona także w ENEA Zeszyt 1 §10.1 tab. 5):
    45.0: 52.0,
    66.0: 72.5,
    69.0: 72.5,
    110.0: 123.0,
    115.0: 123.0,
    132.0: 145.0,
    138.0: 145.0,
    150.0: 170.0,
    220.0: 245.0,
    # IEC 60038 tab. 5 — sieci powyżej 245 kV (tablica podaje wyłącznie U_m; krajowa sieć
    # przesyłowa 400 kV pracuje z U_m = 420 kV):
    400.0: 420.0,
}
"""Napięcie znamionowe sieci Uₙ [kV] → napięcie najwyższe sieci U_s [kV] (IEC 60038).

JEDYNA tabela tej pary w produkcie (lustro frontu: `ui2/model/pasmaNapieciowe.ts`, parytet
przez `backend/schemas/napiecie_najwyzsze_parytet_v1.json`). Napięcie najwyższe urządzenia
U_m (IEC 60071-1:2006 p. 3.10) to najwyższe napięcie międzyfazowe, dla którego zaprojektowano
izolację urządzenia; napięcie najwyższe sieci U_s (p. 3.9) to najwyższe napięcie robocze sieci.
Z obu definicji urządzenie może pracować w sieci, gdy U_m ≥ U_s (PN-EN 62271-1 p. 5.2 —
napięcie znamionowe aparatu U_r jest wartością U_m)."""

_TOLERANCJA_NAPIECIA_SIECI_KV = 1e-6


def napiecie_najwyzsze_sieci_kv(voltage_kv: float | None) -> float | None:
    """Napięcie najwyższe sieci U_s [kV] dla sieci o napięciu znamionowym ``voltage_kv``.

    Napięcie znamionowe z tablic IEC 60038 → para z `NAPIECIE_NAJWYZSZE_SIECI_KV`. Napięcie
    spoza tablic (sieć nieznormalizowana) → najmniejsza wartość U_s tablic WIĘKSZA od Uₙ:
    napięcie najwyższe sieci leży z definicji powyżej napięcia znamionowego (każda para tablic
    ma U_s > Uₙ), więc urządzenie o U_m = Uₙ nie pokrywa takiej sieci. ``None`` — napięcie
    nieznane, niefizyczne, w paśmie nN (tablica 1 IEC 60038 nie definiuje U_s dla izolacji
    aparatury SN/WN) albo powyżej tablic.
    """
    napiecie = _znane(voltage_kv)
    if napiecie is None or pasmo_napieciowe(napiecie) == "nN":
        return None
    for znamionowe, u_s in NAPIECIE_NAJWYZSZE_SIECI_KV.items():
        if abs(znamionowe - napiecie) <= _TOLERANCJA_NAPIECIA_SIECI_KV:
            return u_s
    for u_s in sorted(set(NAPIECIE_NAJWYZSZE_SIECI_KV.values())):
        if u_s > napiecie + _TOLERANCJA_NAPIECIA_SIECI_KV:
            return u_s
    return None


def napiecie_wymagane_izolacji_kv(voltage_kv: float | None) -> float | None:
    """Najniższe napięcie najwyższe urządzenia [kV], przy którym urządzenie pokrywa sieć Uₙ.

    SN i WN — napięcie najwyższe sieci U_s (`napiecie_najwyzsze_sieci_kv`, IEC 60038 tab. 3–5).
    nN — samo napięcie znamionowe sieci: tablica 1 IEC 60038 nie podaje U_s dla izolacji,
    a aparat nN deklaruje napięcie znamionowe łączeniowe U_e, które ma pokrywać napięcie
    znamionowe sieci (IEC 60947-1). ``None`` — napięcie nieznane, niefizyczne albo powyżej
    tablic.
    """
    napiecie = _znane(voltage_kv)
    if napiecie is None:
        return None
    if pasmo_napieciowe(napiecie) == "nN":
        return napiecie
    return napiecie_najwyzsze_sieci_kv(napiecie)


def izolacja_pokrywa_siec(
    napiecie_najwyzsze_urzadzenia_kv: float | None, napiecie_sieci_kv: float | None
) -> bool | None:
    """Czy urządzenie o napięciu najwyższym U_m może pracować w sieci o napięciu Uₙ.

    JEDYNY predykat tej reguły w backendzie: U_m ≥ U_s, U_s = `napiecie_najwyzsze_sieci_kv`
    (IEC 60071-1:2006 p. 3.9–3.10; dla aparatury rozdzielczej U_m = U_r, PN-EN 62271-1 p. 5.2);
    w paśmie nN U_m ≥ Uₙ (`napiecie_wymagane_izolacji_kv`). Czytają go
    odmowa ogranicznika przepięć (`add_surge_arrester_sn`), kontrola aparatu pola
    (`set_bay_equipment`), zgodność napięciowa rodziny rozdzielnicy (klasy U_m karty),
    podgląd doboru aparatu pola DER i podpowiedzi katalogu. Dowód doboru aparatury wystawia
    kryterium U jako rekord werdyktu (`application.equipment_proof.oceny.ocena_izolacji`) na tej
    samej tablicy `napiecie_wymagane_izolacji_kv`; zgodność rozstrzygnięć obu przypina test
    `test_parytet_rekordu_izolacji_z_predykatem_pasm`. Granica równości U_m = U_s jest
    dopuszczona.

    ``None`` — rozstrzygnięcie niemożliwe: urządzenie bez U_m albo sieć bez napięcia
    wymaganego (napięcie nieznane, niefizyczne albo poza tablicami). Brak danej nie jest
    zgodnością ani niezgodnością.
    """
    u_s = napiecie_wymagane_izolacji_kv(napiecie_sieci_kv)
    u_m = _znane(napiecie_najwyzsze_urzadzenia_kv)
    if u_s is None or u_m is None:
        return None
    return u_m + _TOLERANCJA_NAPIECIA_SIECI_KV >= u_s


# ---------------------------------------------------------------------------
# Napięcie znamionowe urządzenia wobec napięcia znamionowego sieci (tabliczka maszyn i baterii)
# ---------------------------------------------------------------------------

#: Tolerancja WZGLĘDNA reprezentacji binarnej przy porównaniu dwóch napięć znamionowych
#: (NIE margines inżynierski): 15.0 i 15.000000001 to ta sama dana, 15.0 i 15.75 — nie.
TOLERANCJA_WZGLEDNA_NAPIECIA = 1e-9


def to_samo_napiecie_znamionowe(pierwsze_kv: float | None, drugie_kv: float | None) -> bool:
    """Czy dwa napięcia znamionowe [kV] są TĄ SAMĄ daną (równość danych, nie ocena).

    JEDYNA równość napięć znamionowych w produkcie (lustro frontu `toSamoNapiecieZnamionowe`):
    zgodność strony transformatora z szyną, dopasowanie pozycji katalogu do napięcia szyny,
    tożsamość rekordu modelu z pozycją katalogu. Brak albo wartość niefizyczna ⇒ ``False``.
    """
    pierwsze = _znane(pierwsze_kv)
    drugie = _znane(drugie_kv)
    if pierwsze is None or drugie is None:
        return False
    return math.isclose(pierwsze, drugie, rel_tol=TOLERANCJA_WZGLEDNA_NAPIECIA)


#: Strefa A pracy maszyny synchronicznej wg IEC 60034-1 p. 7.3: napięcie na zaciskach
#: w granicach ±5 % napięcia znamionowego U_rG przy pracy ciągłej.
STREFA_A_NAPIECIA_MASZYNY_PU = 0.05


def napiecie_sieci_w_strefie_a_maszyny(
    napiecie_znamionowe_maszyny_kv: float | None, napiecie_sieci_kv: float | None
) -> bool | None:
    """Czy maszyna synchroniczna o U_rG może pracować ciągle na szynie o napięciu Uₙ.

    JEDYNY predykat tej reguły: |Uₙ/U_rG − 1| ≤ 5 % (strefa A, IEC 60034-1 p. 7.3). Porównywana
    wielkość to napięcie znamionowe tabliczki wobec napięcia znamionowego szyny, nie poziom
    izolacji. ``None`` — brak albo wartość niefizyczna którejkolwiek danej.
    """
    u_rg = _znane(napiecie_znamionowe_maszyny_kv)
    u_n = _znane(napiecie_sieci_kv)
    if u_rg is None or u_n is None:
        return None
    return abs(u_n / u_rg - 1.0) <= STREFA_A_NAPIECIA_MASZYNY_PU + TOLERANCJA_WZGLEDNA_NAPIECIA


def napiecie_baterii_pasuje_do_sieci(
    napiecie_znamionowe_baterii_kv: float | None, napiecie_sieci_kv: float | None
) -> bool | None:
    """Czy bateria kondensatorów o napięciu znamionowym U_N pasuje do szyny o napięciu Uₙ.

    JEDYNY predykat tej reguły (operacje tworzenia i zmiany katalogu baterii, walidator W040):
    Uₙ ≤ U_N ≤ U_s. Dolna granica — IEC 60871-1, tablica dopuszczalnych poziomów napięcia
    w eksploatacji: praca ciągła do 1,00·U_N, więc bateria o U_N < Uₙ pracowałaby stale
    w przepięciu. Górna granica — napięcie najwyższe sieci U_s (IEC 60038,
    `napiecie_najwyzsze_sieci_kv`): bateria o U_N powyżej U_s należy do wyższego poziomu
    napięcia (bateria 20 kV na szynie 15 kV dałaby (15/20)² = 56 % mocy znamionowej). W paśmie
    nN tablica 1 IEC 60038 nie definiuje U_s, więc górną granicą jest samo Uₙ. ``None`` — brak
    albo wartość niefizyczna którejkolwiek danej.
    """
    u_bat = _znane(napiecie_znamionowe_baterii_kv)
    u_n = _znane(napiecie_sieci_kv)
    if u_bat is None or u_n is None:
        return None
    u_s = napiecie_najwyzsze_sieci_kv(u_n)
    gorna = u_s if u_s is not None else u_n
    return u_n - _TOLERANCJA_NAPIECIA_SIECI_KV <= u_bat <= gorna + _TOLERANCJA_NAPIECIA_SIECI_KV
