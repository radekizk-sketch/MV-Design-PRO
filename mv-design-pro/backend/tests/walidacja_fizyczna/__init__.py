"""Aparat dowodowy dynamiki RMS — WERSJONOWANY i WYKONYWALNY (R10 par. 4-6).

PO CO TEN PAKIET ISTNIEJE. Runda 9 wystawiła rdzeniowi dynamiki ocenę opartą na
eksperymentach, ktore zyly w katalogu sesji POZA repozytorium: wyrocznia, wzorce,
bramki, mutacje i trajektorie nie byly ani wersjonowane, ani uruchamiane przez CI.
Niezalezny recenzent nie mogl ich powtorzyc — mogl wylacznie zrecenzowac raport.
Dowod, ktorego nie da sie wykonac z czystego klonu, nie jest dowodem.

Dlatego kazde twierdzenie, ktore rdzen dynamiki stawia o swojej fizyce, ma tutaj
wykonywalny odpowiednik: rownanie, niezalezna wyrocznia, wzorzec, mutacje
falsyfikujaca i test, ktory biegnie w zwyklym `pytest`. Rejestr wiazan jest w
`manifest.py`.

JAK URUCHOMIC Z CZYSTEGO KLONU — patrz `README.md` obok. Jedno wejscie:

    poetry run python -m tests.walidacja_fizyczna.uruchom

GRANICA. Ten pakiet WOLA produkt i wyrocznie, ale sam nie jest czescia produktu:
nic z `src/` go nie importuje. Wyrocznia (`wyrocznia.py`) nie importuje ani jednej
linii z `network_model.solvers.dynamika` — inaczej „potwierdzalaby" produkt jego
wlasnym kodem.
"""
