"""Eksperymenty wobec WYROCZNI ZEWNETRZNEJ (ANDES 1.9.3).

ANDES nie jest zaleznoscia produkcyjna (wlasny pin `scipy`), wiec te eksperymenty
biegna w osobnym srodowisku i sa oznaczone `@pytest.mark.andes`. To NIE jest ciche
odznaczenie: manifest dowodow (`tests/walidacja_fizyczna/manifest.py`) nazywa
wprost, ktore twierdzenia opieraja sie na tej wyroczni i gdzie ich dowod jest
wykonywany.

GRANICA INGERENCJI. Eksperyment `eksperyment_eps_tau` PODMIENIA jedna metode
biblioteki ANDES (`System.store_switch_times`), zeby wysterowac jej parametr
`eps`. Podmiana zyje WYLACZNIE w tym pakiecie badawczym i jest zdejmowana po
biegu; ani jedna linia rdzenia produktu nie jest przy tym dotykana.
"""
