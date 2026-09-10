"""Prototyp modelu zaufania (D-09): status dowodowy WYPROWADZANY, nie nadawany.

KOD BADAWCZY — patrz `backend/research/README.md`.

Testy sprawdzają jedną hipotezę: czy da się skonstruować rejestr, w którym
„to jest zwalidowana symulacja" jest FUNKCJĄ danych i którego **nie da się
oszukać przypisaniem wartości**. Każdy test opisuje jeden sposób, w jaki dziś
(przy stopniu nadawanym) fałszywy pozytyw byłby osiągalny.
"""

from __future__ import annotations

import pytest
from dynamic_lab.dowod_walidacji import (
    DowodWalidacji,
    MetrykiAkceptacji,
    PunktPracy,
    RejestrDowodow,
    StopienDowodowy,
    TozsamoscModelu,
    Wyrocznia,
    ZakresWalidacji,
)

ANDES = Wyrocznia(nazwa="ANDES", wersja="2.0.0", metoda="wartości własne")


def _model(**nadpisania: float) -> TozsamoscModelu:
    parametry = {"h_s": 4.0, "xd_prim_pu": 0.30, "d_tlumienie": 0.0}
    parametry.update(nadpisania)
    return TozsamoscModelu(klasa="MaszynaSynchroniczna4Rzedu", wersja="1", parametry=parametry)


def _dowod(model: TozsamoscModelu | None = None, blad: float = 1.0e-8) -> DowodWalidacji:
    return DowodWalidacji(
        model=model or _model(),
        wyrocznia=ANDES,
        zakres=ZakresWalidacji(
            napiecie_pu=(0.90, 1.10),
            moc_pu=(0.20, 0.80),
            scr=(3.0, 20.0),
            rodzaje_zdarzen=frozenset({"zwarcie_3f", "skok_obciazenia"}),
        ),
        metryki=(MetrykiAkceptacji(maks_blad_wzgledny=1.0e-4, zmierzony_blad_wzgledny=blad),),
        przypadki=("SMIB H=2", "SMIB H=4", "SMIB H=8"),
    )


PUNKT_W_ZAKRESIE = PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="zwarcie_3f")


def test_model_bez_dowodu_nie_jest_przydatny_dowodowo() -> None:
    """Domyślny stan to BRAK dowodu — fail closed, jak w produkcyjnym D-00."""
    orzeczenie = RejestrDowodow().orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.stopien is StopienDowodowy.MODEL_NIEZWALIDOWANY
    assert orzeczenie.przydatny_dowodowo is False
    assert "Brak zapisanego dowodu" in orzeczenie.powody[0]


def test_model_zwalidowany_w_zakresie_jest_przydatny_dowodowo() -> None:
    """Kierunek przeciwny: model z dowodem MUSI go dostać, inaczej rejestr blokuje wszystko."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.stopien is StopienDowodowy.ZWALIDOWANA_SYMULACJA
    assert orzeczenie.przydatny_dowodowo is True
    assert "ANDES 2.0.0" in orzeczenie.powody[0]


@pytest.mark.parametrize(
    ("punkt", "fragment"),
    [
        (PunktPracy(napiecie_pu=1.30, moc_pu=0.5, scr=10.0), "napięcie"),
        (PunktPracy(napiecie_pu=1.0, moc_pu=0.95, scr=10.0), "moc"),
        (PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=1.5), "SCR"),
        (
            PunktPracy(napiecie_pu=1.0, moc_pu=0.5, scr=10.0, rodzaj_zdarzenia="black_start"),
            "zdarzenie",
        ),
    ],
)
def test_poza_zakresem_walidacji_dowod_znika(punkt: PunktPracy, fragment: str) -> None:
    """Dowód jest RELACJĄ model–zakres–punkt, nie atrybutem modelu.

    To jest sedno prototypu: ten sam, w pełni zwalidowany model przestaje być
    przydatny dowodowo, gdy pytamy o punkt pracy poza zbadanym obszarem —
    automatycznie, bez niczyjej decyzji i bez pamiętania o tym.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    orzeczenie = rejestr.orzeknij(_model(), punkt)
    assert orzeczenie.przydatny_dowodowo is False
    assert any(fragment in p for p in orzeczenie.powody), orzeczenie.powody


def test_wymiar_niebadany_nie_znaczy_dowolny() -> None:
    """„Nie badano" to brak pokrycia, nie zgoda milcząca."""
    rejestr = RejestrDowodow()
    dowod = _dowod()
    rejestr.zarejestruj(
        DowodWalidacji(
            model=dowod.model,
            wyrocznia=dowod.wyrocznia,
            zakres=ZakresWalidacji(
                napiecie_pu=(0.9, 1.1), rodzaje_zdarzen=frozenset({"zwarcie_3f"})
            ),
            metryki=dowod.metryki,
            przypadki=dowod.przypadki,
        )
    )
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("nie był walidowany w tym wymiarze" in p for p in orzeczenie.powody)


def test_zmiana_parametru_uniewaznia_dowod() -> None:
    """Rejestr indeksuje ODCISKIEM, nie nazwą — cicha zmiana stałej gubi dowód.

    Bez tego „ten sam model" obejmowałby też model po zmianie bezwładności,
    czyli dowód przenosiłby się na coś, czego nie zmierzono.
    """
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(_model(h_s=4.0)))
    assert rejestr.orzeknij(_model(h_s=4.0), PUNKT_W_ZAKRESIE).przydatny_dowodowo is True
    assert rejestr.orzeknij(_model(h_s=4.5), PUNKT_W_ZAKRESIE).przydatny_dowodowo is False


def test_niespelniona_metryka_odbiera_stopien_dowodowy() -> None:
    """Walidacja wykonana ≠ walidacja zdana."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod(blad=1.0e-2))
    orzeczenie = rejestr.orzeknij(_model(), PUNKT_W_ZAKRESIE)
    assert orzeczenie.przydatny_dowodowo is False
    assert any("NIE są spełnione" in p for p in orzeczenie.powody)


def test_dowod_bez_przypadkow_jest_odrzucany() -> None:
    """Pułapka `all([]) == True` — pusta walidacja nie może być dowodem.

    Ta sama pułapka została znaleziona w produkcyjnym `NcRfgComplianceReport`
    podczas wdrażania D-00; tutaj jest zamknięta konstrukcyjnie.
    """
    with pytest.raises(ValueError, match="nieobecność dowodu"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(MetrykiAkceptacji(1e-4, 1e-8),),
            przypadki=(),
        )


def test_dowod_bez_metryk_jest_odrzucany() -> None:
    with pytest.raises(ValueError, match="bez metryk akceptacji"):
        DowodWalidacji(
            model=_model(),
            wyrocznia=ANDES,
            zakres=ZakresWalidacji(napiecie_pu=(0.9, 1.1)),
            metryki=(),
            przypadki=("SMIB",),
        )


def test_orzeczenie_zawsze_niesie_uzasadnienie() -> None:
    """Odmowa bez powodu jest bezużyteczna dla projektanta — i nieweryfikowalna."""
    rejestr = RejestrDowodow()
    rejestr.zarejestruj(_dowod())
    for punkt in (PUNKT_W_ZAKRESIE, PunktPracy(napiecie_pu=1.4, moc_pu=0.5, scr=10.0)):
        orzeczenie = rejestr.orzeknij(_model(), punkt)
        assert orzeczenie.powody, "orzeczenie bez powodów"
        assert all(p.strip() for p in orzeczenie.powody)


def test_odcisk_dowodu_zalezy_od_wersji_wyroczni() -> None:
    """Nowa wersja narzędzia wzorcowego zmienia odcisk — dowód wymaga przeglądu."""
    a = _dowod()
    b = DowodWalidacji(
        model=a.model,
        wyrocznia=Wyrocznia(nazwa="ANDES", wersja="2.1.0", metoda="wartości własne"),
        zakres=a.zakres,
        metryki=a.metryki,
        przypadki=a.przypadki,
    )
    assert a.odcisk != b.odcisk
