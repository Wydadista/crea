# AKhbar studio 0.4.15

- Il ＋ dei punti volume rimane sul margine visibile della clip mentre si scorre o si ingrandisce la timeline. Compare quando è attiva **Modifica volume**, come prima; non serve raggiungere la fine della clip.
- I nuovi segnalibri sono collegati al punto sorgente della clip sotto la linea verde. In caso di sovrapposizioni si preferisce la clip selezionata, poi la traccia attiva. Seguono spostamenti, divisioni e cambi di velocità. Non appaiono nell'esportazione. I vecchi segnalibri vengono collegati alla clip che occupa la loro posizione all'apertura. Se non c'è una clip, il vecchio segnalibro resta disponibile nella posizione originale.
- Un punto rifilato o eliminato non mostra più il relativo segnalibro: il riferimento viene conservato per ripristinarlo con Annulla o con il recupero del contenuto rifilato. Trascinando un segnalibro lo si riposiziona all'interno del suo spezzone, senza sganciarlo dalla clip.
- Gli stacchetti usano gli stessi selettori CSS delle schede di **Elementi ed effetti**, con miniature proporzionate e griglia compatta. Il numero di colonne segue la dimensione scelta per gli effetti.
- **Crea fermo immagine** riutilizza la prima traccia superiore libera nell'intero intervallo del fermo immagine. Aggiunge una traccia solo se le superiori sono occupate. Non sovrappone file già presenti e conserva l'ordine visivo.

Verifiche: test del modello per ancoraggi, tagli, spostamenti, velocità, salvataggio e tracce libere; prova Electron dei controlli reali, del ＋ con clip ingrandita oltre la larghezza della finestra, dei segnalibri con Annulla/Ripristina e del fermo immagine senza nuove tracce. Suite di regressione dell'esportazione e delle funzionalità precedenti. Ogni comando di test è limitato a 170 secondi; nessun EXE generato.
