# Konfigurator stacji — UI/UX

**Status:** kanon BINDING — implementacja w PR-5 i PR-11
**Wersja:** v1.0

---

## 1. Cel

Inspector stacji jest pełną kartą inżynierską z 10 zakładkami. Nie jest formularzem programisty.

---

## 2. Struktura inspectora (sticky header + tabs)

```
┌──────────────────────────────────────────────────────────────────┐
│ 📍 Stacja ST-04 "Las Iglasty"                       [≡] [⤢] [✕] │
│ Typ: stacja przelotowa  •  Status: pod napięciem                 │
│ Gotowość: rozpływ ●  zwarcia ●  napięcia ◐  raport ◐             │
│ Akcje: [Otwórz wewnętrzny SLD] [Pokaż braki] [Eksport]           │
├──────────────────────────────────────────────────────────────────┤
│ Projekt > GPZ Stacja > Ciąg główny F-01 > Stacja ST-04           │
├──────────────────────────────────────────────────────────────────┤
│ [Podstawowe] [Topologia] [Rozdzielnia SN] [Pola SN] [Trafo SN/nN]│
│ [Rozdzielnica nN] [Odbiory] [Zabezpieczenia] [Pomiary]           │
│ [Gotowość obliczeń] [Techniczne]                                 │
├──────────────────────────────────────────────────────────────────┤
│   <treść aktywnej zakładki>                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Header jest **sticky**, breadcrumb jest **dwukierunkowy** (klik wraca do nadrzędnego obiektu).

---

## 3. Karta 1: Dane podstawowe

| Pole | Typ | Walidacja |
|---|---|---|
| Nazwa stacji | text | wymagana, ≤ 80 znaków |
| Numer ruchowy / oznaczenie | text | opcjonalne |
| Typ topologiczny | wnioskowane (read-only badge): końcowa / przelotowa / odgałęźna / sekcyjna | nie edytowalne — wynika z portów |
| Typ konstrukcyjny | enum: wnętrzowa / kontenerowa / słupowa / prefabrykowana / inna | informacyjne |
| Napięcie SN | enum z katalogu: 6 / 10 / 15 / 20 / 30 kV | wymagane |
| Poziomy nN (lista) | enum: 0,4 / 0,69 / inne | przynajmniej jeden |
| Lokalizacja (jeśli model wspiera) | text / koordynaty | opcjonalne |
| Status kompletności | wnioskowane | read-only |

---

## 4. Karta 2: Topologia i porty

Tabela portów stacji:

| ID portu | Typ | Napięcie | Pole | Zajęty przez | Status |
|---|---|---|---|---|---|
| `…sn_input` | SN_INPUT | 15 kV | Pole #1 | F-01.S2 | ● |
| `…sn_output` | SN_OUTPUT | 15 kV | Pole #2 | F-01.S3 | ● |
| `…sn_transformer` | SN_TRANSFORMER | 15 kV | Pole #3 | TR1 | ● |
| `…nn_feeder_1` | NN_FEEDER | 0,4 kV | Pole nN #1 | Odbiór L-01 | ● |
| `…nn_der_pv_1` | NN_DER_PV | 0,4 kV | Pole nN #2 | PV-01 | ◐ |

Lista błędów topologicznych:
- brak endpointu kabla,
- port niepodłączony,
- niedopuszczalne przypisanie typu portu do typu pola,
- niespójność typu topologicznego.

---

## 5. Karta 3: Rozdzielnia SN

| Pole | Typ |
|---|---|
| Układ | pojedynczy system szyn / sekcjonowany / uproszczony / bezszynowy |
| Napięcie znamionowe | kV |
| Prąd znamionowy | A |
| Prąd zwarciowy znamionowy | kA |
| Liczba sekcji | int |
| Sprzęgło / łącznik sekcyjny | enum |
| Pola | tabela z linkiem do karty 4 |
| Rezerwy | int |
| Status gotowości | wnioskowane |

---

## 6. Karta 4: Pola SN

Lista pól stacji jako tabela + przyciski akcji.

Kolumny: Oznaczenie | Typ pola | Przyłączony obiekt | Aparatura | Zabezpieczenie | Pomiary | Status.

Akcje: Otwórz pole / Pokaż na SLD / Skopiuj konfigurację / Usuń.

Typy pola (enum): liniowe wejściowe / liniowe wyjściowe / transformatorowe / pomiarowe / sprzęgłowe / sekcyjne / PV / BESS / FW / rezerwowe / potrzeb własnych.

---

## 7. Karta 5: Transformator SN/nN

Per transformator:

| Pole | Typ |
|---|---|
| Oznaczenie | text |
| Sn (moc znamionowa) | kVA / MVA |
| Napięcie górne | kV |
| Napięcie dolne | kV (z katalogu albo manualnie, jeśli repo dopuszcza) |
| Układ połączeń | enum (Yyn0, Dyn5, Dyn11, …) |
| Grupa połączeń | enum |
| uk (napięcie zwarcia) | % |
| Pk (straty obciążeniowe) | kW |
| P0 (straty jałowe) | kW |
| I0 (prąd jałowy) | % |
| Regulacja zaczepów | enum: brak / OLTC / DETC |
| Położenie zaczepu | int |
| Zakres zaczepów | int range |
| Uziemienie punktu neutralnego | enum |
| Dane zerowe (R0, X0) | jeśli wymagane |
| Parametry cieplne | jeśli model wspiera |
| Przeciążalność | jeśli model wspiera |
| Status danych do zwarć | badge |
| Status danych do rozpływu | badge |
| Status danych do asymetrii | badge |
| Status danych do stabilności | badge (zwykle „brak modułu obliczeniowego”) |

---

## 8. Karta 6: Rozdzielnica nN

Per szyna nN:

| Pole | Typ |
|---|---|
| Poziom napięcia | kV / V |
| Sekcje | lista |
| Odpływy | tabela |
| Odbiory | link do karty 7 |
| PV / BESS / FW po nN | link do DerConfigurator |
| Zabezpieczenia nN | tabela |
| Pomiary nN | tabela |
| Bilans P/Q | wnioskowane |
| Status danych | wnioskowane |

---

## 9. Karta 7: Odbiory

Per odbiór:

| Pole | Typ |
|---|---|
| Nazwa | text |
| Punkt przyłączenia | port nN |
| P (moc czynna) | kW |
| Q (moc bierna) | kvar |
| cos φ | float |
| Profil obciążenia | jeśli model wspiera |
| Asymetria fazowa | jeśli model wspiera |
| Priorytet zasilania | enum |
| Status danych | wnioskowane |

---

## 10. Karta 8: Zabezpieczenia i automatyka

- Zabezpieczenie pola wejściowego, wyjściowego, transformatora (per pole).
- Zabezpieczenia: nadprądowe (50/51), ziemnozwarciowe (50N/51N/67N), napięciowe (27/59), częstotliwościowe (81U/81O), różnicowe (87T).
- Automatyki: SPZ, SZR, blokady łączeniowe.
- Sterowanie lokalne / zdalne.
- Sygnały SCADA (mapping).
- Status danych dla selektywności.

---

## 11. Karta 9: Pomiary

- Przekładniki prądowe per pole (rdzeń pomiarowy + zabezpieczeniowy).
- Przekładniki napięciowe per szyna.
- Klasy dokładności.
- Liczniki energii.
- Telepomiary.
- Wartości chwilowe (jeśli warstwa wyników włączona): I, U, P, Q, energia.
- Status braków pomiarowych.

---

## 12. Karta 10: Gotowość obliczeń

Macierz 9 typów obliczeń × statusy (per stacja):

| Obliczenie | Status | Brakujące dane | Akcja |
|---|---|---|---|
| Rozpływ mocy | ● | — | — |
| Spadki / wzrosty napięcia | ◐ | brak Q(U) PV-01 | „Uzupełnij dane PV-01” |
| Zwarcia | ● | — | — |
| Asymetria | ○ | brak modeli fazowych transformatora | „Uzupełnij Trafo TR1” |
| Obciążalność | ● | — | — |
| Stabilność | ⊘ | brak modułu obliczeniowego | n.d. |
| FRT / HVRT | ⊘ | brak modułu obliczeniowego | n.d. |
| Zgodność przyłączeniowa | ⊘ | brak profilu wymagań | „Wybierz profil OSD” |
| Raport OSD | ◐ | wynik częściowy | „Pokaż braki” |

Legenda statusów: ● gotowe, ◐ częściowe / wynik częściowy, ○ brak danych, ⊘ brak modułu / nie dotyczy.

Klik w status otwiera listę braków i podświetla obiekty na SLD.

---

## 13. Karta 11: Techniczne

- ID techniczne (ENM ref, snapshot fingerprint, hash).
- Surowy fragment ENM (read-only JSON viewer).
- Eksport stacji (ZIP fragment).
- Diagnostyka (sztywne ścieżki dla wsparcia).

---

**Koniec dokumentu.**
