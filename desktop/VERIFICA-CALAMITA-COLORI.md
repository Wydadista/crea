# Riaggancio e colori della clip originale

Correzioni per AKhbar studio 0.3.5, comprese tutte le modifiche precedenti. Installer ed eseguibili non modificati o generati; nessuna azione su AVG.

## Comportamento

- Accorciando il bordo sinistro con calamita attiva, al rilascio la clip si attacca esattamente alla fine della precedente sulla stessa traccia, anche in presenza di un vuoto iniziale. I valori sorgente `in/out` restano quelli accorciati: il contenuto rimosso non viene recuperato. Vale anche per un insieme unito e per un trascinamento che supera un taglio interno.
- Con calamita disattivata il vuoto rimane. La chiusura dello spazio dopo eliminazione conserva il comportamento precedente.
- Se la chiusura degli spazi successivi è bloccata da un'altra clip, gli spezzoni successivi restano fermi: il taglio e il riaggancio sinistro vengono conservati anziché annullare l'accorciamento.
- Lo zoom Adatta tutto rimane stabile durante il trascinamento dei bordi e viene ripristinato al rilascio. Le maniglie hanno priorità sui nomi delle clip e un'area di presa leggermente più ampia; restano assenti sui confini interni degli elementi uniti.
- Il colore identifica la clip originale inserita nella timeline. I suoi tagli mantengono lo stesso colore anche dopo unione, raggruppamento, copia/incolla, annulla/ripristina e salvataggio/riapertura. Il gruppo continua ad avere un indicatore comune, senza imporre un colore unico. Questa regola sostituisce i diversi colori per ciascuno spezzone richiesti in precedenza.

## Verifiche eseguite

- `npm test`: 56 test superati, nessun fallimento o test saltato.
- `DISPLAY=:99 node test/provenance-ripple-ui.cjs`: superato. Trascinamenti reali del bordo sinistro con calamita attiva/disattiva, clip singole/unite, vuoti preesistenti, attraversamento dei tagli interni, contenuto sorgente rimosso, tracce indipendenti e annulla/ripristina. Trascinamento del bordo destro con Adatta tutto attivo senza oscillazioni dello zoom. Colori effettivi nel DOM dopo taglio, unione, raggruppamento, separazione, annulla e salvataggio/riapertura reale.
- `DISPLAY=:99 node test/group-cut-ui.cjs`: superato. Regressione per bordi interni bloccati, gruppi, appunti, taglio e storia.
- `DISPLAY=:99 node test/visual-refresh-ui.cjs`: superato. Conferme interne, pulsanti, fermo immagine, salvataggio, recupero e protezione dei file esistenti.
- `DISPLAY=:99 node test/workflow-editing-ui.cjs`: superato. Libreria, appunti, chiusura spazi dopo eliminazione e rifilatura, aggancio durante gli spostamenti, salvataggio e export MP4 di un secondo.
- Sintassi JavaScript e `git diff --check`: superati.

Prove eseguite su Linux/Electron con media sintetici, senza creazione di installer Windows.
