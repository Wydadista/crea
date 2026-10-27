# AKhbar studio 0.4.13 — preparazione anteprime e avanzamento DeepFilterNet3

## Apertura e importazione

All'apertura di un progetto e dopo l'importazione dei media compare una finestra interna di avanzamento. La preparazione comprende miniature della libreria, miniature dei segmenti della timeline, forme d'onda, audio iniziale e primo fotogramma video. Durante questa attesa il montaggio è protetto dalla finestra modale.

La percentuale conta le operazioni completate, deduplicando le miniature condivise; non è una stima del tempo rimanente. Arriva al 100% dopo la conclusione delle operazioni e resta visibile per un breve istante, poi la finestra scompare automaticamente. Un file non leggibile viene segnalato e la miniatura riceve un simbolo sostitutivo, senza trattenere indefinitamente la finestra. Una preparazione precedente non può chiudere quella di un progetto successivo.

## Riduzione del rumore

Applicare DeepFilterNet3 dalla galleria, trascinarlo sulla clip oppure modificare l'intensità nelle proprietà mostra l'avanzamento fino alla disponibilità dell'audio elaborato. Vengono preparate anche le clip selezionate lontane dalla testina. I file elaborati già disponibili continuano a usare la cache esistente.

Il motore comunica le fasi completate: preparazione sorgente, riduzione del rumore, ricostruzione e preparazione dell'anteprima. La percentuale descrive queste fasi; non misura ogni campione del motore DeepFilterNet3. Il 100% attende il completamento effettivo del file di anteprima. Motore, modello, attenuazione, compensazione temporale e filtri audio restano quelli precedenti.

## Libreria media

Ogni riquadro ha **+** circolare in alto a sinistra, **X** circolare in alto a destra, durata **minuti:secondi** in basso a destra sulla miniatura e nome del file sotto. Rimossa la riga aggiuntiva con il tipo del media. I comandi funzionano sia nella griglia sia nell'elenco: il più inserisce al cursore sulla traccia selezionata e la X conserva la rimozione dal progetto, con conferma per i media utilizzati.

## Verifiche

- Suite completa `timeout 170s npm test`: superata in circa 14 secondi, incluse prove dei tagli VFR, composizione ed esportazione.
- Prova Electron con video, immagine e audio reali sintetici: avanzamento trattenuto durante la coda miniature, comparsa del 100% prima della chiusura, immagini effettivamente decodificate, riapertura con miniature dei punti di taglio e progetto invariato.
- Verificati disposizione dei riquadri, durata e inserimento sulla traccia selezionata.
- Applicazione reale DeepFilterNet3 dalla galleria e dalle proprietà, eventi di avanzamento delle fasi, chiusura dopo il file pronto e miniatura mancante con sostituzione senza blocco.
- Ogni comando di prova limitato a 170 secondi. Nessun EXE generato; nessuna esportazione lunga del progetto dell'utente.
