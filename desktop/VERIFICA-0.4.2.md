# AKhbar studio 0.4.2

## Modifiche

- Nuova icona A/play verde lime fornita dall’utente, usata dalle finestre, dai collegamenti Windows e dalla configurazione del pacchetto. Anche intestazione e conferme interne usano la stessa immagine. L’originale contiene 32×32 pixel: quel fotogramma è conservato senza variazioni; le misure aggiuntive fino a 256×256 sono adattamenti per la compatibilità del pacchetto, senza dettaglio aggiuntivo rispetto all’originale.

- Il registratore rimane sopra le altre finestre durante conto alla rovescia, registrazione, pausa e finalizzazione. Il cambio di stato non richiama il fuoco della tastiera né rende la finestra modale. Quando torna pronto, il vincolo di primo piano viene rimosso; Riduci in icona rimane disponibile.
- La galleria Elementi ed effetti contiene **Zoom** e **Riduzione del rumore — DeepFilterNet3**. Si possono applicare alla selezione o trascinare sopra una clip compatibile. Lo zoom apre direttamente la scelta visiva del dettaglio; il denoiser abilita il controllo già presente nelle proprietà e mostra una barra sotto la clip.
- Lo zoom conserva scelta visiva, intensità, ingresso, ritorno, continuità attraverso i segmenti uniti e comando Rimuovi movimento. I quattro campi temporali precedenti sono sostituiti da **Durata entrata** e **Durata uscita**, entrambe inizialmente 2 secondi per i nuovi zoom. Le animazioni già salvate conservano i propri movimenti e le proprie durate.
- La barra nella timeline determina l'intervallo complessivo dello zoom. Modificarla conserva le durate di entrata/uscita e cambia automaticamente la permanenza sul dettaglio. Se l'intervallo è troppo breve, le transizioni si accorciano in proporzione; allungandolo tornano alle durate richieste. Nessun fermo o intervallo numerico aggiuntivo da impostare.
- Il tasto destro sulle barre apre un menu esplicito **Elimina zoom** o **Elimina effetto**. Aprire il menu non elimina nulla. Il comando rimuove solo l'applicazione scelta; clip, altri effetti e parametri audio restano conservati. Annulla/Ripristina includono queste operazioni. Anche gli effetti diretti precedenti e DeepFilterNet3 dispongono della propria barra di eliminazione.
- I quattro comandi di unione/raggruppamento sono rimossi dalle proprietà. Restano disponibili nella barra della timeline e nel menu del tasto destro.
- La palette delle clip mantiene l'identità della sorgente con colori più scuri e meno saturi. Il bordo delle clip unite conserva **#FFC82E** e passa da **3 a 2 pixel**; il riferimento sottile ai tagli interni e l'indicatore di selezione restano leggibili.

## Verifiche

- **68 test automatici superati**: includono zoom e composizione, export reale attraverso i tagli, DeepFilterNet3, durate con e senza permanenza, intervalli brevi, persistenza, gruppi, calamita, appunti e rendering.
- `test/v42-ui.cjs`: galleria, due controlli temporali, trascinamento della barra con transizioni fisse, menu contestuali ed eliminazione selettiva, annullamento, comandi delle proprietà rimossi, bordo da 2 pixel e primo piano del registratore durante registrazione/pausa.
- `test/v41-ui.cjs`: continuità su dieci segmenti, inquadratura visiva e ridimensionamento, effetti continui, inserimento di clip esistenti, base fissa delle tracce e registratore compatto.
- `test/v4-ui.cjs`: registratore separato persistente, conto alla rovescia 2 → 1, Stop/Scarta, stili, gruppi e salvataggio/riapertura.

Prove eseguite in Linux/Electron, con dispositivi simulati nelle prove di registrazione. Comportamento nativo e periferiche reali Windows restano da provare sul PC. Nessun test oltre quattro minuti e nessun EXE dell'applicazione generato.
