# Aggiornamento grafico di AKhbar studio 0.3.5

L'aggiornamento include le precedenti modifiche a unione, raggruppamento, appunti e taglio. Nessun installer o EXE è stato creato.

## Verifiche eseguite su Linux/Electron

- `npm test`: 51 test passati, nessun fallimento o test saltato.
- `DISPLAY=:99 node test/visual-refresh-ui.cjs`: superato. Conferme interne con Annulla, Esc, Salva e Scarta; annullamento della scelta del nome senza perdere dati; salvataggio effettivo e riapertura; protezione del file esistente durante Salva con nome e durante export; recupero automatico e Ignora; chiusura dalla finestra del sistema con annullamento. Il test vieta esplicitamente l'uso di `dialog.showMessageBox`, verificando che le conferme attraversino la nuova interfaccia. Verificati anche calamita persistente, posizione/funzionamento dei controlli altezza, riquadri e relative azioni, immagini di esempio, fermo immagine effettivo e Annulla/Ripristina.
- `DISPLAY=:99 node test/workspace-ui.cjs`: superato. Libreria, trascinamento di elementi su nuova traccia, disposizione, impostazioni, conferme interne, salvataggi portabili, Salva con nome e progetti recenti. Aggiornato il test per interagire con le nuove conferme anziché simulare finestre native.
- `DISPLAY=:99 node test/group-cut-ui.cjs`: superato. Regressione per unione, bordi interni, gruppi sincronizzati, colori, appunti, taglio e Annulla/Ripristina.
- Sintassi JavaScript e `git diff --check`: superati.

Il vecchio script `test/akhbar-ui.cjs` si interrompe cercando `#mediaView`, un controllo già assente nell'HTML precedente a questo aggiornamento. Non è una prova di malfunzionamento della libreria o delle nuove icone; lo script deve essere adeguato all'interfaccia attuale. Il fermo immagine è stato verificato separatamente nel nuovo test grafico. La suite generale storica non viene dichiarata superata.

## Controllo sul PC

Dalla cartella `desktop`, eseguire `npm ci` e `npm start`. Aggiungere un elemento e chiudere la finestra: la conferma deve avere logo e colori dell'app. Provare Annulla, poi Salva, verificando che la chiusura sia annullata se si annulla il nome del progetto. Controllare calamita attiva/disattiva, icona fotografica, altezza sopra le tracce e riquadri di Elementi ed effetti. L'aspetto e i driver specifici di Windows non sono stati verificati in questa macchina Linux.
