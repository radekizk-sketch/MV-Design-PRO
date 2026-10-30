"""Opisy pozycji listy braków analiz obwodu nN — jeden słownik backendu i jego lustro frontu.

Backend (`application/analyses/fault_loop/service.py::opis_braku_danych_nn`) i front
(`frontend/src/ui/sld/v3/lv-domain/opisyBrakowDanychNn.ts`) opisują TEN SAM zbiór kodów
tym samym tekstem; rozjazd byłby drugą prawdą (projektant widziałby inne zdanie w domenie nN
kanwy i w raporcie). Kod spoza słownika nie wraca jako kod maszynowy, tylko jako uczciwe zdanie.
"""

from __future__ import annotations

from application.analyses.fault_loop.service import (
    BRAK_SPOZA_SLOWNIKA_NN_PL,
    OPISY_BRAKOW_DANYCH_NN_PL,
    OPISY_BRAKOW_PREDYKATU_PL,
    POLA_BRAKOW_TRANSFORMATORA,
    opis_braku_danych_nn,
)

from tests.utils.lustro_ts import FRONT_SRC, slownik_ts, stala_ts

_LUSTRO = FRONT_SRC / "ui" / "sld" / "v3" / "lv-domain" / "opisyBrakowDanychNn.ts"


def test_lustro_frontu_ma_te_same_kody_i_teksty() -> None:
    """Komplet kodów backendu (kody strukturalne, predykaty transformatora, pola
    transformatora) = klucze lustra frontu, a tekst każdego = ``opis_braku_danych_nn``."""
    kody = (
        set(OPISY_BRAKOW_DANYCH_NN_PL)
        | set(OPISY_BRAKOW_PREDYKATU_PL)
        | set(POLA_BRAKOW_TRANSFORMATORA)
    )
    assert slownik_ts(_LUSTRO, "OPISY_BRAKOW_DANYCH_NN") == {
        kod: opis_braku_danych_nn(kod) for kod in sorted(kody)
    }
    assert stala_ts(_LUSTRO, "BRAK_SPOZA_SLOWNIKA_NN") == BRAK_SPOZA_SLOWNIKA_NN_PL


def test_przedrostek_nazywa_miejsce_braku_a_kod_nie_wraca() -> None:
    """Iloczyn: przedrostek (brak / ``swz`` / ``upstream:<transformator>`` / element) ×
    kod (strukturalny / pole transformatora / spoza słownika). Opis nigdy nie zawiera kodu
    maszynowego, a identyfikator elementu stoi po nazwie miejsca."""
    przedrostki = {
        "": None,
        "swz": "ocena samoczynnego wyłączenia zasilania",
        "upstream:T1": "równoważnik sieci SN transformatora T1",
        "odplyw_7": "element odplyw_7",
    }
    kody = {
        "rcd": OPISY_BRAKOW_DANYCH_NN_PL["rcd"],
        "uk_percent": "„Napięcie zwarcia uk”",
        "kod_nieznany_x": BRAK_SPOZA_SLOWNIKA_NN_PL,
    }
    for przedrostek, miejsce in przedrostki.items():
        for kod, opis in kody.items():
            wpis = f"{przedrostek}:{kod}" if przedrostek else kod
            wynik = opis_braku_danych_nn(wpis)
            assert wynik == (f"{opis} ({miejsce})" if miejsce else opis), wpis
            assert kod not in wynik, wpis
