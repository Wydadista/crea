# AKhbar studio 0.4.17 — Anteprima, registratore e timeline

## Modifiche

- **Inquadratura su più spezzoni:** trascinare o ridimensionare dall'anteprima modifica tutti i video e le foto selezionati, inclusi gli elementi uniti. Il segmento sotto la testina serve da riferimento, senza limitare l'operazione a quel solo pezzo. La trasformazione conserva le differenze relative delle inquadrature e costituisce una sola operazione Annulla/Ripristina.
- **Angoli sempre accessibili:** quando una clip supera i bordi dell'anteprima, le maniglie restano visibili all'interno dell'area disponibile e continuano a controllare le estremità dell'immagine.
- **Estensione verso sinistra:** immagini, testi ed effetti autonomi possono essere allungati anche dal bordo sinistro, mantenendo fermo quello destro. Restano i controlli contro le sovrapposizioni. I video e gli audio continuano a rispettare i limiti reali della sorgente.
- **Nomi delle registrazioni:** eliminato il campo nome. Le nuove registrazioni ricevono automaticamente la data locale e un progressivo giornaliero, per esempio `04-11-2026-1`. Il contatore persiste tra riavvii ed evita collisioni tra formati e registrazioni precedenti; i file già esistenti non vengono rinominati. La finestra iniziale è più corta.
- **Lettore unito all'anteprima:** pulsanti, avanzamento e tempo restano nel pannello anche restringendolo. I controlli si dispongono su due righe nelle larghezze ridotte. Rimossi dalla vista `Audio: —`, `Sposta vista` e `Compatta`.
- **Transizioni / I miei stacchetti:** ogni scheda mostra soltanto nome e durata, oltre alla miniatura, Inserisci e X. Rimossi i dettagli testuali sui componenti video/audio. La musica più lunga del video conserva la sua durata e il collegamento allo stacchetto.

## Verifiche eseguite

- Suite generale: **38 file di test superati**, circa 13 secondi.
- Prova reale Electron su una registrazione sintetica divisa in più pezzi: riprodotto il difetto iniziale, poi verificati ridimensionamento comune su tre segmenti uniti, selezione multipla senza unione, Annulla/Ripristina e maniglie utilizzabili dopo ulteriori ingrandimenti.
- Esportazione breve con tagli non contigui: controllati tutti i 15 fotogrammi esportati. I tre intervalli mantengono i colori attesi e la barra inferiore rimossa non ricompare.
- Trascinamento reale dei bordi sinistro e destro di foto, testo e sfocatura; validazione, salvataggio e vincoli della sorgente coperti anche dai test del modello.
- Apertura della finestra nativa del registratore senza campi nome e prenotazione di due registrazioni con data e progressivi automatici, ignorando eventuali nomi personalizzati obsoleti.
- Controlli del lettore verificati anche con pannello molto basso, inclusa la possibilità effettiva di raggiungerli con il mouse.
- Prova Electron delle funzionalità 0.4.14: punti volume, segnalibri collegati alle clip, stacchetti e fermo immagine. Aggiunte verifiche della scheda con sola durata e conservazione di Inserisci e X.

Ogni comando di test è limitato a 170 secondi. Nessun EXE creato. Le prove grafiche sono eseguite su Linux; resta utile la verifica finale del registratore sul PC Windows.

Nota tecnica: l'estensione delle sorgenti statiche usa tempi sorgente virtuali negativi, senza modificare le fotografie originali. I file di progetto della nuova versione vanno riaperti con questa versione o successive.
