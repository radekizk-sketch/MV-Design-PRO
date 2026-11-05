"""Kopie sieci rejestru (`tests/golden/registry.kopie_sieci_wpisu`) — budowa raz na proces,
wydawana jako NIEZALEŻNE kopie.

Przypina obietnicę z docstringu `kopie_sieci_wpisu`: test mutujący sieć nie zmienia sieci
żadnego innego testu (para: wspólna budowa × mutacja wydanej kopii), a kopia jest tą samą
siecią co budowa od nowa (`zbuduj_wszystkie`) — skrót nie zmienia danych wejściowych testów.
"""

from __future__ import annotations

from enm.models import EnergyNetworkModel

from tests.golden import registry

#: Wpis rejestru o sieciach ENM budowanych szybko (sieć złota CGMES).
WPIS = next(
    w.id for w in registry.REJESTR if w.budowniczowie and w.postac is registry.PostacSieci.ENM
)


def _zrzut(sieci: list[object]) -> list[object]:
    return [
        s.model_dump(mode="json") if isinstance(s, EnergyNetworkModel) else repr(s) for s in sieci
    ]


def test_kopia_rowna_budowie_od_nowa() -> None:
    assert _zrzut(registry.kopie_sieci_wpisu(WPIS)) == _zrzut(registry.zbuduj_wszystkie(WPIS))


def test_mutacja_kopii_nie_przecieka_do_nastepnej() -> None:
    pierwsza = registry.kopie_sieci_wpisu(WPIS)
    wzorzec = _zrzut(registry.zbuduj_wszystkie(WPIS))
    siec = pierwsza[0]
    if isinstance(siec, EnergyNetworkModel):
        siec.header.name = "zmutowana przez test"
        siec.buses.clear()
    else:
        assert isinstance(siec, dict), type(siec)
        siec.clear()
    druga = registry.kopie_sieci_wpisu(WPIS)
    assert druga[0] is not siec
    assert _zrzut(druga) == wzorzec
