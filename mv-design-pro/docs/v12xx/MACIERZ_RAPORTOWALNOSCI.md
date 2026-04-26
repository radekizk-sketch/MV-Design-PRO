# Macierz raportowalnosci V12.xx

Status: aktywna  
Cel: rozroznienie wynikow raportowych, analitycznych, czesciowych i zablokowanych

## Statusy raportowalnosci

| Status | Znaczenie |
|---|---|
| raportowy | Wynik moze wejsc do raportu OSD. |
| raportowy_z_ograniczeniem | Wynik moze wejsc do raportu z jawna sekcja ograniczen. |
| analityczny | Wynik tylko do pracy inzynierskiej, bez publikacji OSD. |
| zablokowany | Wynik nie moze byc raportowany. |

## Macierz

| Wynik | Warunek raportowy | Warunek blokady | Uzasadnienie | Raport OSD |
|---|---|---|---|---|
| Zwarcie 3F | ENM aktualny, katalog snapshot, proof, jednostki | Brak zrodla, brak impedancji, wynik nieaktualny | wymagane | tak |
| Zwarcie 1F | Pelna siec zerowa, uziemienie, grupy trafo, `proof_status=complete`, `reporting_status=reportable` | Brak Z0, nieznany neutral albo brak proof/statusu w wierszu wyniku | wymagane z `proof_ref` i trace step refs | tak |
| Zwarcie 2F+Z | Pelna siec zerowa, skladowe symetryczne, `proof_status=complete`, `reporting_status=reportable` | Brak danych zerowych albo brak proof/statusu w wierszu wyniku | wymagane z `proof_ref` i trace step refs | tak |
| Rozplyw NR | Zbieznosc, status jakosci danych, aktualny wariant | Brak zbieznosci, brak odbiorow/generacji dla przypadku | wymagane | tak |
| Rozplyw GS | Tryb diagnostyczny | Uzycie jako glowny wynik raportowy | wymagane | analityczny |
| Rozplyw FD | Spelnione warunki stosowalnosci | Warunki niespelnione | wymagane | raportowy_z_ograniczeniem |
| Stan fazowy | Pelne dane fazowe i proof | Brak danych fazowych | wymagane | zalezne od celu |
| Stabilnosc dynamiczna | Scenariusz i zrodlo w zakresie raportowym | Zrodlo poza zakresem albo uproszczenie analityczne | wymagane | raportowy albo analityczny |
| FRT | Profil operatora, profil zrodla, snapshot katalogowy | Brak profilu operatora lub FRT | wymagane | tak |
| Selektywnosc | Nastawy, PP/PN, wynik zwarciowy aktualny | Brak PP/PN albo nieaktualne zwarcia | wymagane | tak |
| Automatyka po zakloceniu | Slad zadzialania, topologia po zdarzeniu | Brak urzadzenia wykonawczego lub logiki | wymagane | tak lub analityczny |

## Regula eksportu

Eksport raportu musi zawierac status raportowalnosci kazdej sekcji i powod ograniczenia, jezeli status nie jest `raportowy`.
