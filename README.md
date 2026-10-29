# Akhbar Blur 1.0.0

Estensione Firefox Manifest V3, in JavaScript puro, HTML e CSS. Sfoca rettangoli della pagina con `backdrop-filter: blur()`. Nessuna libreria, nessuna compilazione, nessuna modifica ad Akhbar Studio.

## Installazione temporanea in Firefox

Serve **Firefox 140 o successivo** (anche ESR).

1. Scarica ed estrai tutto lo ZIP in una cartella.
2. Apri Firefox e scrivi **`about:debugging`** nella barra degli indirizzi.
3. Seleziona **Questo Firefox**.
4. Premi **Carica componente aggiuntivo temporaneo…**.
5. Seleziona **`manifest.json`** nella cartella estratta.
6. Apri un normale articolo web. Nel menu delle estensioni (icona a forma di puzzle), premi **Akhbar Blur**. Puoi aggiungere l'icona alla barra degli strumenti dal menu dell'estensione.

Non devi eseguire comandi CMD, installare Node.js o creare un EXE. Il caricamento temporaneo dura fino alla chiusura di Firefox: alla riapertura ripeti il caricamento da `about:debugging`. Per un'installazione permanente occorre firmare il pacchetto tramite Mozilla; questo ZIP è pensato per il caricamento temporaneo richiesto.

## Come si usa

- **Clic sull'icona:** apre il pannello e attiva la selezione. Il puntatore diventa una croce.
- **Trascina sulla pagina:** crea una zona sfocata. Puoi ripetere per crearne altre. I rettangoli inferiori a 12 × 12 pixel vengono ignorati.
- **Sposta:** durante la selezione trascina l'interno di una zona.
- **Ridimensiona:** trascina uno degli otto piccoli quadratini sul bordo. Larghezza e altezza sono indipendenti.
- **Intensità:** scegli da 2 a 60 pixel. Il controllo aggiorna tutte le zone della scheda; 16 pixel è il valore iniziale.
- **↶ Ultima area:** rimuove l'ultima zona creata, anche se successivamente l'hai spostata. Non è una cronologia degli spostamenti.
- **Rimuovi tutte:** elimina tutte le zone della pagina.
- **Esc** oppure **Fine selezione:** termina la modifica, nasconde maniglie e contorni e lascia attiva la sfocatura. Durante un trascinamento Esc annulla anche quel gesto.
- **×:** nasconde il pannello e torna alla navigazione; le sfocature restano. Riclicca l'icona per ritrovare i comandi.

Fuori dalla selezione le zone non intercettano i clic: puoi usare link, video e scorrimento normalmente. Durante la selezione il trascinamento serve a disegnare; puoi comunque scorrere con la rotellina.

## Articoli, fotografie e pagine lunghe

Le coordinate usano numeri JavaScript, senza un'immagine/canvas grande quanto tutta la pagina. I rettangoli seguono lo scorrimento, anche a decine di migliaia di pixel dall'inizio. Quelli fuori schermo non vengono disegnati.

Quando possibile la zona si aggancia all'elemento sottostante: per immagini, video e iframe mantiene le proporzioni locali anche se cambia la dimensione. Per gli altri elementi mantiene le distanze dal loro angolo superiore sinistro. Se il rettangolo attraversa più elementi si usa il contenitore comune oppure una posizione nel documento.

Il browser sfoca ciò che è visibile sotto il rettangolo, comprese le foto negli articoli: nessun accesso ai pixel, download, ricodifica o modifica del file originale. Un articolo che sostituisce completamente il contenuto o cambia drasticamente impaginazione può richiedere di riposizionare la zona. Una zona che attraversa parti con comportamenti di scorrimento differenti non può seguire simultaneamente entrambi i contenuti.

Le aree sono temporanee e separate per scheda/documento. Un ricaricamento o una nuova pagina le cancella; cliccare nuovamente l'icona sulla stessa pagina le conserva.

## Prestazioni e privacy

- Soltanto **`activeTab`** e **`scripting`**; nessun permesso generale sui siti, nessun `content_scripts` automatico.
- Codice iniettato nella sola scheda attiva, esclusivamente quando premi l'icona.
- Nessuna richiesta a Internet, telemetria, analytics, cookie, database o raccolta dati.
- L'event page legge HTML e CSS inclusi nello ZIP tramite URL locali `moz-extension://`; non contatta server.
- Nessuna cattura schermo o elaborazione delle immagini. L'effetto è CSS gestito dal browser.
- Aggiornamenti delle posizioni raggruppati con `requestAnimationFrame` soltanto in risposta a scorrimenti, ridimensionamenti o gesti. Nessun ciclo continuo, `setInterval` o scansione continua del DOM.
- Interfaccia isolata con Shadow DOM e livello sovrapposto alla pagina; i fogli di stile dell'articolo non alterano i controlli.

Molte zone grandi con sfocatura elevata richiedono comunque lavoro grafico al browser. Per una schermata pulita premi Esc e poi × prima di registrare.

## Pagine protette da Firefox

Firefox impedisce alle estensioni di intervenire su pagine interne come `about:…`, sul sito dei componenti aggiuntivi Mozilla, su alcune pagine protette e nel suo lettore PDF integrato. In questi casi l'icona mostra **!**; passa sopra l'icona per leggere il motivo. I normali articoli HTTP/HTTPS sono l'uso previsto. I frame interni possono essere coperti da un rettangolo della pagina principale, senza iniettare codice al loro interno.

## File

- `manifest.json`: Manifest V3 e permessi.
- `background.js`: attivazione tramite icona e lettura dei due file locali dell'interfaccia.
- `content.js`: selezione, zone, spostamento, ridimensionamento e agganci.
- `interface.html` e `interface.css`: pannello e stile scuro.
- `icons/blur.svg`: icona vettoriale, senza immagini pesanti.
- `test/`: verifiche e pagina di prova locale, non caricate automaticamente dall'estensione.

Per aggiornare i file durante le prove, premi **Ricarica** su `about:debugging`, ricarica anche l'articolo e premi l'icona. Per rimuovere l'estensione usa **Rimuovi** su `about:debugging` e ricarica la pagina per eliminare le zone già applicate.
