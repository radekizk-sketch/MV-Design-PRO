"""Czas wyłączenia t_b (minimalny czas zwłoki t_min) biegu zwarciowego — jeden nośnik i jedna
reguła danych (karta SC-IB-ITH-ZRODLA, B-01 (n)).

PO CO. IEC 60909-0:2016 (rozdz. 9, 10) liczy symetryczny prąd wyłączeniowy I_b i składową
nieokresową i_DC w chwili t_b = t_min — najkrótszy czas zadziałania zabezpieczenia plus
najkrótszy czas własny wyłącznika. To DANA PROJEKTOWA (nastawy i aparat), nie stała solvera:
dawne domyślne ``tb_s = 0.1`` w czterech sygnaturach rdzenia było cichą stałą. Jedynym
nośnikiem t_b jest scenariusz zwarciowy (``ShortCircuitConfig.breaking_time_seconds``)
przenoszony do opcji biegu kluczem ``breaking_time_seconds``; brak danej = ``None`` i nazwana
odmowa gotowości ``fault.czas_tb_brak`` dla wielkości, które od t_b zależą (I_b z udziałem
maszyn wirujących, i_DC). Wartość niefizyczna = odmowa ``fault.czas_tb_niepoprawny`` w tym
jednym miejscu — API, magazyn scenariuszy i opcje biegu wołają tę samą funkcję.

Moduł jest liściem (stdlib + ``network_model.odmowa_danych``).
"""

from __future__ import annotations

import math

from network_model.odmowa_danych import OdmowaNazwana

__all__ = [
    "KLUCZ_OPCJI_CZASU_TB",
    "KOD_CZAS_TB_BRAK",
    "KOD_CZAS_TB_NIEPOPRAWNY",
    "OdmowaCzasuTbError",
    "czas_tb_z_danych",
]

#: Klucz opcji biegu zwarciowego niosący t_b [s] (projekcja scenariusza → opcje biegu).
KLUCZ_OPCJI_CZASU_TB = "breaking_time_seconds"
#: Kod gotowości: bieg bez t_b — I_b z udziałem maszyn wirujących i i_DC nie są wyznaczalne.
KOD_CZAS_TB_BRAK = "fault.czas_tb_brak"
#: Kod odmowy: t_b nieliczbowe, nieskończone albo niedodatnie.
KOD_CZAS_TB_NIEPOPRAWNY = "fault.czas_tb_niepoprawny"


class OdmowaCzasuTbError(OdmowaNazwana):
    """Czas t_b odrzucony — odmowa nazwana z kodem rejestru gotowości w polu ``kod``."""


def czas_tb_z_danych(dane: object) -> float | None:
    """t_b [s] z danych kontraktu (opcje biegu, konfiguracja scenariusza, żądanie API).

    ``None`` = brak danej (bieg liczy wielkości niezależne od t_b; zależne niosą kod
    ``fault.czas_tb_brak``). Liczba skończona dodatnia = t_b. Każda inna postać (napis,
    wartość logiczna, zero, ujemna, NaN, nieskończoność) = ``OdmowaCzasuTbError``.
    """
    if dane is None:
        return None
    if isinstance(dane, bool) or not isinstance(dane, int | float):
        raise OdmowaCzasuTbError(
            f"Czas wyłączenia t_b {dane!r} nie jest liczbą — podaj najkrótszy czas "
            "zadziałania zabezpieczenia powiększony o czas własny wyłącznika, w sekundach.",
            kod=KOD_CZAS_TB_NIEPOPRAWNY,
        )
    wartosc = float(dane)
    if not math.isfinite(wartosc) or wartosc <= 0.0:
        raise OdmowaCzasuTbError(
            f"Czas wyłączenia t_b {dane!r} musi być skończoną liczbą dodatnią w sekundach "
            "(najkrótszy czas zadziałania zabezpieczenia + czas własny wyłącznika).",
            kod=KOD_CZAS_TB_NIEPOPRAWNY,
        )
    return wartosc
