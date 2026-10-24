# AKhbar studio 0.4.0

## Utilizzo delle nuove funzioni

- Libreria: la X su ogni media rimuove il riferimento dal progetto. Se il media è usato, una conferma spiega che verranno rimossi anche gli elementi corrispondenti dalla timeline. Il file sul disco rimane intatto; Annulla ripristina il progetto.
- Registratore: finestra separata, nome clip, livello microfono e timer. Impostazioni apre il pannello completo già esistente. Ogni avvio mostra **2 → 1** prima della cattura. Stop importa la registrazione e lascia aperta la finestra; Scarta elimina la cattura corrente senza importarla. La X chiude il registratore, chiedendo come gestire una registrazione attiva.
- Invio conferma i dialoghi; nei testi multilinea continua a inserire un ritorno a capo.
- Timeline: **N** adatta l'intero progetto con margine finale; **B** adatta la selezione. Le scorciatoie non intervengono mentre si scrive.
- Raggruppa mostra un solo blocco sulla traccia 1, conservando separatamente le tracce di composizione. Separa gruppo ripristina quelle tracce. **S** produce due gruppi indipendenti anche quando la testina passa in uno spazio interno al gruppo.
- Elementi ed effetti: i controlli vicino al titolo scelgono da una a quattro anteprime per riga.
- Trascinare un elemento o effetto sopra una clip lo collega direttamente alla clip. La freccia espande le barre sottili: le estremità regolano l'intervallo di ogni elemento, senza cambiare la durata del video. Il menu della barra consente di rimuoverlo. Spostamenti, copie e tagli conservano i collegamenti.
- Sfocatura e pixelizzazione: forma rettangolare o circolare. Il rettangolo permette larghezza e altezza indipendenti; l'area si sposta nell'anteprima.
- Testo: salvare uno stile con nome, quindi applicarlo ad altri testi. Carattere, dimensione, colore, contorno e sfondo vengono ripresi; il contenuto resta invariato. Gli stili e la dimensione delle anteprime sono preferenze locali.
- Esportazione: la percentuale di qualità è sempre visibile e regolabile.
- Inserimento media: vicino a un confine nella traccia compare una linea verticale. Il rilascio inserisce il media e sposta gli elementi successivi; i collegamenti di gruppo conservano la sincronizzazione. L'operazione viene rifiutata se spostare un gruppo creerebbe sovrapposizioni su altre tracce.
- Zoom animato: il pannello permette scala e inquadratura iniziale/finale, tempi di entrata, mantenimento e ritorno. La scelta nell'anteprima consente di puntare un dettaglio e trascinare l'inquadratura. La freccia sotto la clip regola l'intervallo del movimento. Anteprima ed esportazione usano la stessa interpolazione fluida.

## Verifiche eseguite

- `npm test`: **60 test superati**, inclusi tagli, gruppi, calamita, appunti e nuove strutture per effetti collegati, inserimento e zoom.
- `node test/v4-ui.cjs`: verifica Electron con media simulati di effetti collegati tramite trascinamento, stili testo, salvataggio con Invio e riapertura, rimozione media e annullamento, gruppi compatti e taglio indipendente, B/N, galleria, qualità percentuale, registratore separato persistente, conto alla rovescia, Stop e Scarta.
- Un'esportazione FFmpeg breve verifica zoom fuori centro, maschere circolari e un effetto collegato alla clip (`test/v4-render.test.js`, incluso in `npm test`).
- Le verifiche sono state eseguite in ambiente Linux/Electron con schermo e microfono simulati. Dispositivi reali, barra delle applicazioni e driver Windows vanno verificati sul PC di destinazione.
- Nessun test oltre quattro minuti; nessun installer o EXE generato.

La riduzione del rumore esistente e la configurazione antivirus non sono state modificate. I progetti precedenti sono apribili; salvare una copia prima di usare le nuove strutture con versioni vecchie dell'editor.
