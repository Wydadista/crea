# AKhbar studio 0.4.7 — durata al passaggio del mouse

Il suggerimento delle clip nella timeline mostra il nome e una seconda riga `Durata: mm:ss.cc`.

- Clip singola: durata effettiva nella timeline, dopo tagli e velocità.
- Elementi uniti: durata della sequenza contigua, visibile passando su qualsiasi segmento.
- Gruppo: intervallo dal primo all'ultimo elemento, comprese distanze e sovrapposizioni. La durata compare anche passando sull'indicatore del gruppo.

Verifica diretta nell'interfaccia Electron: clip a velocità 2× e 4×, elementi uniti prima e dopo accorciamento, gruppo con elementi sovrapposti e poi distanziati, indicatore del gruppo. Verifica sintattica del renderer superata. Prova limitata a meno di tre minuti.

Nessun EXE generato. I percorsi di esportazione della 0.4.6 sono invariati.
