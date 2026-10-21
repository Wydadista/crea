# AKhbar studio 0.3.3

Anteprima aggiornata durante il trascinamento del cursore sulla timeline e della barra di navigazione: una ricerca video alla volta, destinazione intermedia sostituita dall’ultima richiesta, aggiornamenti accorpati al ridisegno dello schermo. Ogni fotogramma decodificato viene pubblicato prima di cercare il successivo. Durante le attese resta visibile l’ultimo fotogramma disponibile; i veri spazi vuoti della timeline rimangono neri. Risoluzione di anteprima temporaneamente limitata a 640 pixel di larghezza durante il movimento, con ripristino della qualità selezionata alla pausa o al rilascio. Cache e lettori inattivi limitati per contenere la memoria. Il video sorgente e l’esportazione conservano risoluzione e impostazioni.

Verifiche brevi: test automatici del gestore delle ricerche (raffiche, inversioni, metadata tardivi, limiti del file e cancellazione dei lettori); Electron su Linux con video sintetico di 18 secondi a 960×540, 12 FPS, GOP di 120 fotogrammi e GPU disabilitata. La prova iniziale con 721 richieste ha rilevato 68 campioni visualizzati, 0 campioni neri e 13 ricerche video; cambio di immagini durante il movimento e posizione finale 8,25 s corretti. Verificati trascinamento reale del cursore con il mouse, ripresa della riproduzione, mantenimento dell’immagine in attesa, veri spazi vuoti e ultimi secondi. Passate anche le verifiche delle funzioni della versione precedente (velocità, libreria, anteprima sorgente ed eliminazione tracce). Comando per ripetere la verifica: `npm run test:scrub` (richiede una sessione grafica). Nessun benchmark su video lunghi o collaudo Windows in questa revisione; verifica sul PC dell’utente.

# AKhbar studio 0.3.2

Ripristinato il controllo Velocità nel pannello destro; aggiunto al menu della clip con valore corrente e finestra di modifica, mantenendo Ripristina. Libreria con un’unica barra Importa/Griglia/Elenco e colonne −/+: minimo 1, valore iniziale 3, scelta memorizzata. Il pulsante Importa accetta anche il trascinamento dei file. Anteprima sorgente in un riquadro compatto, centrata con proporzioni conservate: scala iniziale massima 30%, ridotta quando necessario e aggiornata al ridimensionamento. Nessuna modifica alla risoluzione del montaggio o dell’esportazione.

Timeline più bassa (220 px iniziali), comando Compatta/Espandi e bordo superiore trascinabile fino a 180 px. Clic destro sull’intestazione o su uno spazio libero della traccia: Elimina traccia. Per tracce occupate viene chiesta conferma. Le altre clip conservano i loro tempi; i materiali rimangono nella libreria. Eliminazione annullabile e salvata nel progetto; rimane sempre una traccia vuota disponibile.

Verifiche brevi completate su Linux/Electron: velocità dai due controlli, Ripristina e Annulla; importazione da pulsante e trascinamento reale di un file; barre compatte, colonne 1–6 e griglia 3×3; video sintetici orizzontali, verticali e quadrati al ridimensionamento; eliminazione tracce vuote/occupate, annullamento e ripristino; salvataggi portabili e recenti. Nessun benchmark lungo o build Windows in questa revisione. Collaudo Windows affidato all’utente.

# AKhbar studio 0.3.1

Corretto l’avvio audio con residui numerici negativi. Menu File con progetti recenti, Salva con nome e conferma delle modifiche non salvate. Griglia Media con 2–5 colonne persistenti; elementi trascinabili su una nuova traccia, guide di allineamento e comandi di centratura. Impostazioni unificate per cartelle, durata decimale delle immagini e dei fermi immagine, colore del righello e scorciatoie multiple. Interfaccia delle proprietà semplificata. Le cartelle configurate vengono usate senza chiedere nuovamente la destinazione a ogni registrazione o esportazione.

Verifiche brevi: test audio con offset negativo infinitesimale e inserimento tracce; verifica Electron di griglia 3×3, durate decimali, trascinamento senza spostamento delle clip esistenti, centratura, annullamento/scarto, salvataggio portabile, Salva con nome, recenti e scorciatoie multiple. Nessun benchmark lungo o collaudo Windows in questa revisione: verifiche sul PC dell’utente. Percorso di rendering della versione precedente conservato.

# AKhbar studio 0.3

Percorso export diretto e una sola codifica video nei montaggi, fermo immagine, registrazione frase, cattura progressiva, preferenze dispositivi e cartelle, barra flottante, Media separati dagli effetti, griglia e anteprima sorgente, nomi numerati, progetti portabili, chiusura spazi per singola aggiunta, mono predefinito, denoise moderato con confronto, miniature per segmento, zoom adattivo e navigazione globale.

Dettagli: [README.md](README.md). Prove completate, interrotte e da eseguire: [PERFORMANCE.md](PERFORMANCE.md). Le verifiche finali sul PC sono affidate all’utente come richiesto; non è dichiarata equivalenza con Camtasia.
