# Karta ZEROWA-POJEMNOSCI — warunek IEC 60909-0:2016 pkt 5.2 f) dla pojemności w składowej zerowej (B-01, decyzja architekta)

Baza: gałąź partii `claude/mv-design-pro-twin-audit-u4lhy0-partia-zwarcia` (po scaleniu BEZ-POJEMNOSCI + WKLAD-ZRODLA).
Worktree i gałąź nadaje sesja główna przy zleceniu. Jeden commit lokalny bez push; autor/stopka/zakazy jak w kartach rdzenia.

## Po co
Ustalenie właściciela (2026-10-22, tekst normy, parafraza — norma chroniona prawem autorskim):
IEC 60909-0:2016 pkt 5.2 f): w składowej zgodnej i przeciwnej pojemności linii się pomija (wdrożone kartą
BEZ-POJEMNOSCI); w składowej ZEROWEJ pojemności linii uwzględnia się w sieciach uziemionych przez małą impedancję,
gdy współczynnik zwarcia doziemnego δ > 1,4 (ostra nierówność). Pkt 5.3.2 to metoda składowych (I_L1 = I_1+I_2+I_0,
a = e^{j120°}; impedancja uziemienia punktu neutralnego w składowej zerowej jako 3·Z_N). Dziś rdzeń dokłada B0 do
składowej zerowej BEZWARUNKOWO (`enm/mapping.py::_assemble_zero_sequence_y0`) — to odstępstwo od 5.2 f) w sieciach
skutecznie uziemionych (δ ≤ 1,4).

## Rozstrzygnięcie (§0)
1. Jeden predykat `pojemnosci_zerowe_wymagane(...)`: True ⇔ sieć uziemiona przez małą impedancję ∧ δ > 1,4.
   δ liczony w rdzeniu (White Box) z definicji: stosunek największego napięcia fazowego fazy zdrowej przy zwarciu
   doziemnym w danym miejscu do napięcia fazowego przed zwarciem (IEC 60050-604 / definicja w normie — ustal
   i zacytuj punkt definicji, parafrazą), z impedancji Z1, Z2, Z0 w miejscu zwarcia (składowe symetryczne 5.3.2).
   Pętla: δ zależy od Z0, a Z0 od decyzji o B0 — rozstrzygnij jawnie i udokumentuj (np. δ liczone z Z0 bez pojemności
   jako kryterium klasyfikacji sieci; podstawa lub jawne założenie inżynierskie w śladzie).
2. Sieci izolowane i kompensowane: zwarcie doziemne nie jest zwarciem w zakresie metody IEC 60909-0 dla prądu 1F —
   ustal, co rdzeń dziś robi (pętla IT / prąd doziemny pojemnościowy osobną ścieżką) i nie dubluj; brak automatycznego
   stosowania progu 1,4 do innych układów uziemienia. Każdy przypadek: jawny status w wyniku z wyjaśnieniem
   (kontrakt werdyktu wyjaśnialnego) — „δ nieustalony” ≠ spełnione.
3. Ślad White Box: krok `pojemnosci_zerowe` z δ (liczba), progiem 1,4, układem uziemienia, decyzją i podstawą
   „IEC 60909-0:2016 pkt 5.2 f)”. Profil normy jawnie `IEC_60909_0_2016` (wydanie 3.0 z 2026-07 nieporównane).
4. Sonda przed/po dla każdej zmienionej sieci (Ik1″, Ik2E″, I_E), lista hashy, fikstury generatorem.
## Testy
Iloczyn: {uziemienie: bezpośrednie, mała impedancja (rezystor), izolowane, kompensowane} × {δ ≤ 1,4, δ > 1,4,
δ = 1,4 dokładnie (granica — B0 pominięte)} × {1F, 2F-Z} × {linia napowietrzna, kabel}; wyrocznia ręczna δ
dla sieci dwuwęzłowej; iniekcje: ≥ zamiast >, B0 bezwarunkowo, δ z Z0 z pojemnością (jeśli rozstrzygnięto inaczej).
## Kryterium
Jak w karcie BEZ-POJEMNOSCI (pełna regresja, guardy rdzenia + samotesty, black/ruff, `npm test` oba kroki, jeśli
zmieniły się fikstury frontu). Meldunek: podstawa, rozstrzygnięcie pętli δ↔B0, tabela sondy, hashe, iniekcje.
