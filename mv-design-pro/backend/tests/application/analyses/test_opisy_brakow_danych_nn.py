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
        kod: opis_braku_danych_nn(None, kod) for kod in sorted(kody)
    }
    assert stala_ts(_LUSTRO, "BRAK_SPOZA_SLOWNIKA_NN") == BRAK_SPOZA_SLOWNIKA_NN_PL


#: Stany nazwy elementu wskazanego przedrostkiem: nazwa nadana, samo oznaczenie (stacja),
#: brak obu, element nieobecny w modelu.
_STANY_NAZWY = ("nazwa", "oznaczenie", "brak", "spoza modelu")


def _migawka(ref: str, stan: str) -> dict[str, object]:
    """Migawka ENM (słownik) z elementem ``ref`` w stanie nazwy ``stan`` (stacja — jedyna
    kolekcja z oznaczeniem; transformator i odcinek dla nazwy i jej braku)."""
    if stan == "spoza modelu":
        return {"substations": []}
    element: dict[str, object] = {"id": f"id-{ref}", "ref_id": ref, "name": "   "}
    if stan == "nazwa":
        element["name"] = "Obwód oświetlenia"
    elif stan == "oznaczenie":
        element["name"] = ""
        element["designation"] = "ST-12/4"
    return {"substations": [element]}


_MIEJSCE_W_STANIE = {
    "nazwa": "{rodzaj} „Obwód oświetlenia”",
    "oznaczenie": "{rodzaj} „ST-12/4”",
    "brak": "{rodzaj} bez nazwy",
    "spoza modelu": "{rodzaj} spoza modelu",
}


def test_przedrostek_nazywa_miejsce_braku_a_kod_nie_wraca() -> None:
    """Iloczyn: miejsce {bez przedrostka, ``swz``, ``upstream:<transformator>``, element} ×
    stan nazwy {nazwa, oznaczenie, brak, spoza modelu} × kod {strukturalny, pole
    transformatora, spoza słownika}. Opis nigdy nie zawiera kodu maszynowego ani
    identyfikatora elementu — miejsce nazywa nazwa albo oznaczenie z modelu (lustro frontu
    ``opisyBrakowDanychNn.test.ts`` przypina ten sam iloczyn)."""
    miejsca = {
        "": (None, None),
        "swz": ("swz", None),
        "upstream:TR_1": ("TR_1", "równoważnik sieci SN transformatora"),
        "odplyw_7": ("odplyw_7", "element"),
    }
    kody = {
        "rcd": OPISY_BRAKOW_DANYCH_NN_PL["rcd"],
        "uk_percent": "„Napięcie zwarcia uk”",
        "kod_nieznany_x": BRAK_SPOZA_SLOWNIKA_NN_PL,
    }
    for przedrostek, (ref, rodzaj) in miejsca.items():
        for stan in _STANY_NAZWY:
            enm = _migawka(ref or "brak", stan)
            for kod, opis in kody.items():
                wpis = f"{przedrostek}:{kod}" if przedrostek else kod
                wynik = opis_braku_danych_nn(enm, wpis)
                if not przedrostek:
                    oczekiwane = opis
                elif przedrostek == "swz":
                    oczekiwane = f"{opis} (ocena samoczynnego wyłączenia zasilania)"
                else:
                    oczekiwane = f"{opis} ({_MIEJSCE_W_STANIE[stan].format(rodzaj=rodzaj)})"
                assert wynik == oczekiwane, (wpis, stan)
                assert kod not in wynik, (wpis, stan)
                if ref and przedrostek != "swz":
                    assert ref not in wynik, (wpis, stan)


def test_miejsce_braku_z_modelu_enm_obiektowego() -> None:
    """Ten sam opis z ``EnergyNetworkModel`` (obiekt pydantic), nie tylko z migawki-słownika:
    stacja z oznaczeniem bez nazwy i transformator z nazwą."""
    from enm.models import EnergyNetworkModel

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {"name": "Model próby"},
            "substations": [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "ref_id": "st_1",
                    "name": "",
                    "designation": "ST-12/4",
                    "station_type": "mv_lv",
                }
            ],
        }
    )
    assert opis_braku_danych_nn(enm, "st_1:lv_bus") == (
        "stacja bez szyny w paśmie nN (element „ST-12/4”)"
    )
    assert opis_braku_danych_nn(enm, "upstream:brak_tr:lv_bus") == (
        "stacja bez szyny w paśmie nN (równoważnik sieci SN transformatora spoza modelu)"
    )
