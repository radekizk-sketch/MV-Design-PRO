"""Nazwy sekcji, składników i pól w powodzie statusu sekcji modelu — słowa, nigdy kody.

Powód statusu sekcji (``OcenaSekcji.powod_pl``, ``OcenaSkladnika.powod_pl``,
``BrakModelu.czego_brakuje_pl``) trafia do karty technicznej i do odmowy pakietu. Kod sekcji
(``short_circuit``), składnika (``udzial_zwarciowy``) i pola karty (``uk_percent``) zostaje
w polach maszynowych (``sekcja``, ``nazwa``); tekst niesie nazwę dla projektanta.

Iloczyn cech: klasa typu katalogu (każda z ``SKLADNIKI_SEKCJI``) × sekcja (każda) × pola
(wszystkie nieobecne — powód wymienia brakujące pola; obecne z jakością spoza karty — powód
wymienia sufit jakości) × stan rekordu katalogowego (każdy).
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from dziedziny.sekcje import (
    ETYKIETA_SEKCJI,
    ETYKIETA_STATUSU_REKORDU,
    SEKCJE,
    StatusWeryfikacjiRekordu,
    status_modelu_z_sekcji,
)
from network_model.catalog.sekcje_modelu import (
    _ETYKIETY_POL_SEKCJI_PL,
    ETYKIETY_SKLADNIKOW_PL,
    SKLADNIKI_SEKCJI,
    DaneUrzadzenia,
    etykieta_pola_sekcji,
    oceny_sekcji,
)
from network_model.catalog.types import etykieta_pola_katalogu_pl
from werdykt.proweniencja import FieldQuality

from tests.enm.test_komunikaty_operacji_bez_kodow import SYMBOLE_INZYNIERSKIE

_SKLADNIKI = sorted(
    {d.nazwa for klasa in SKLADNIKI_SEKCJI.values() for defs in klasa.values() for d in defs}
)
_POLA = sorted(
    {
        pole
        for klasa in SKLADNIKI_SEKCJI.values()
        for defs in klasa.values()
        for d in defs
        for pole in d.pola
    }
)
_STANY: tuple[StatusWeryfikacjiRekordu, ...] = get_args(StatusWeryfikacjiRekordu)


def test_slowniki_kompletne_i_bez_martwych_wpisow() -> None:
    """Każdy składnik i każde pole ``SKLADNIKI_SEKCJI`` ma nazwę; dopełnienie pól nie
    powtarza opisu tabliczki (wpis przy polu z opisem katalogu byłby drugą prawdą), a każda
    sekcja i stan rekordu mają etykietę."""
    assert sorted(ETYKIETY_SKLADNIKOW_PL) == _SKLADNIKI
    for pole in _POLA:
        assert etykieta_pola_sekcji(pole).strip(), pole
        assert etykieta_pola_sekcji(pole) != pole, pole
    for pole in _ETYKIETY_POL_SEKCJI_PL:
        assert pole in _POLA, f"{pole}: wpis spoza SKLADNIKI_SEKCJI"
        assert etykieta_pola_katalogu_pl(pole) is None, f"{pole}: opis jest już w tabliczce"
    assert set(ETYKIETA_SEKCJI) == set(SEKCJE)
    assert set(ETYKIETA_STATUSU_REKORDU) == set(_STANY)


@pytest.mark.parametrize(
    ("klasa", "obecne", "stan"),
    list(itertools.product(sorted(SKLADNIKI_SEKCJI), (False, True), _STANY)),
)
def test_powod_statusu_sekcji_bez_kodow_sekcji_skladnikow_i_pol(
    klasa: str, obecne: bool, stan: StatusWeryfikacjiRekordu
) -> None:
    """Każdy powód (sekcji, składnika, braku modelu) nie zawiera kodu pola, składnika ani
    sekcji z podkreśleniem; przy braku pól wymienia nazwy pól, przy obecnych polach o jakości
    spoza karty — nazwy pól w suficie jakości."""
    pola_klasy = {p for defs in SKLADNIKI_SEKCJI[klasa].values() for d in defs for p in d.pola}
    dane = DaneUrzadzenia(
        klasa=klasa,
        pola={p: 1.0 for p in pola_klasy} if obecne else {},
        status_weryfikacji_rekordu=stan,
        modele_widmowe=(),
        dowody=(),
        jakosci_zrodel={p: FieldQuality.ESTIMATED for p in pola_klasy} if obecne else {},
    )
    # Symbol normowy (``k_sc`` wg IEC 60909-0 §6.9, ``k_pf`` / ``k_qf`` wg IEEE Task Force 1993)
    # jest oznaczeniem wielkości w zdaniu, nie kodem — jedno źródło: ``SYMBOLE_INZYNIERSKIE``.
    kody = {k for k in (*_POLA, *_SKLADNIKI, *SEKCJE) if "_" in k and k not in SYMBOLE_INZYNIERSKIE}
    teksty: list[str] = []
    for ocena in oceny_sekcji(dane):
        teksty.append(ocena.powod_pl)
        teksty += [s.powod_pl for s in ocena.skladniki]
        teksty += [d.nazwa_pl for d in ocena.dane_przyjete]
        brak = status_modelu_z_sekcji(ocena)
        if not isinstance(brak, str):
            teksty += [brak.powod_pl, brak.czego_brakuje_pl]
    for tekst in teksty:
        obecne_kody = sorted(k for k in kody if k in tekst)
        assert not obecne_kody, (klasa, obecne_kody, tekst)
    wszystko = " ".join(teksty)
    nazwy = {etykieta_pola_sekcji(p) for p in pola_klasy}
    assert any(n in wszystko for n in nazwy), (klasa, wszystko[:300])
