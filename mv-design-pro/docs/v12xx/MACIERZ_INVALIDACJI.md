# Macierz invalidacji wynikow V12.xx

Status: aktywna  
Cel: deterministyczne oznaczanie wynikow jako aktualne, nieaktualne, czesciowe albo zablokowane

## Zakres invalidacji

| Poziom | Znaczenie |
|---|---|
| lokalna | Dotyczy jednego obiektu lub etykiety wynikowej. |
| obszaru | Dotyczy ciagu, stacji, pola, zrodla albo grupy elementow. |
| przypadku | Dotyczy jednego przypadku obliczeniowego. |
| projektu | Dotyczy wszystkich przypadkow i raportow projektu. |

## Macierz

| Zmiana | Zakres | Zwarcia | Rozplyw | Selektywnosc | FRT/zgodnosc | Stan fazowy | Stabilnosc | Raport | Uzasadnienie |
|---|---|---|---|---|---|---|---|---|---|
| Dlugosc odcinka | obszaru | invaliduj | invaliduj | invaliduj zalezne | bez zmian | invaliduj | zalezne | invaliduj sekcje | invaliduj slady odcinka |
| Typ katalogowy kabla/linii | obszaru | invaliduj | invaliduj | invaliduj zalezne | bez zmian | invaliduj | zalezne | invaliduj | invaliduj |
| Stan lacznika | przypadku | invaliduj wariant | invaliduj wariant | invaliduj topologie | invaliduj zalezne | invaliduj | invaliduj po zakloceniu | invaliduj wariant | invaliduj |
| Wariant pracy | przypadku | invaliduj wariant | invaliduj wariant | invaliduj wariant | invaliduj wariant | invaliduj wariant | invaliduj wariant | invaliduj wariant | invaliduj wariant |
| Nastawy zabezpieczen | przypadku | bez zmian | bez zmian | invaliduj | zalezne | bez zmian | zalezne | invaliduj zabezpieczenia | invaliduj protection proof |
| Profil operatora | projektu | bez zmian | invaliduj zgodnosc | invaliduj zalezne | invaliduj | zalezne | zalezne | invaliduj zgodnosc | invaliduj zgodnosc |
| Profil FRT | obszaru | zalezne dla zrodel | zalezne | zalezne | invaliduj | zalezne | invaliduj | invaliduj OZE | invaliduj FRT proof |
| Uziemienie punktu neutralnego | projektu | invaliduj 1F/2F+Z | bez zmian | invaliduj ziemnozwarciowe | bez zmian | invaliduj awarie fazowe | zalezne | invaliduj zwarcia | invaliduj zero-sequence proof |
| PP/PN | obszaru | bez zmian | bez zmian | invaliduj pomiary i selektywnosc | zalezne | zalezne | bez zmian | invaliduj EAZ | invaliduj EAZ proof |
| Grupa polaczen transformatora | obszaru | invaliduj 1F/2F+Z | invaliduj zalezne | invaliduj ziemnozwarciowe | zalezne | invaliduj | zalezne | invaliduj | invaliduj |
| Snapshot katalogowy | projektu | invaliduj runy z innym hash | invaliduj runy z innym hash | invaliduj zalezne | invaliduj zalezne | invaliduj zalezne | invaliduj zalezne | invaliduj | invaliduj |
| Szablon raportu | projektu | bez zmian | bez zmian | bez zmian | bez zmian | bez zmian | bez zmian | invaliduj eksport | bez zmian |

## Regula raportowa

Raport moze uzyc tylko wynikow ze statusem `aktualny` albo `czesciowy_dopuszczony` z jawna sekcja ograniczen. Wynik `nieaktualny` blokuje publikacje raportu.
