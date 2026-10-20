# Crea Studio — editor desktop con tracce progressive

Editor video indipendente per Windows 10/11 x64. I nuovi progetti iniziano con **una traccia**. **Aggiungi traccia**, oppure l’area di rilascio sopra la timeline, aggiunge tracce fino a 128. Ogni traccia accetta video, immagini, audio, testi ed effetti, con un solo elemento per istante. Le sovrapposizioni si costruiscono su tracce diverse. Il vecchio editor di immagini `../creapost.html` rimane invariato.

## Installazione e ricostruzione

Eseguire `dist/Crea-Studio-0.2.0-x64-Setup.exe`, oppure estrarre **tutto** `dist/Crea-Studio-0.2.0-Windows-x64.zip` in una cartella dedicata e aprire `Crea Studio.exe`. L'app contiene Electron, FFmpeg e FFprobe; sul PC non occorrono Node.js o FFmpeg separati. L'installer di sviluppo non è firmato digitalmente.

Per sviluppare con Node.js 24, da `desktop`:

```powershell
npm ci
npx install-electron --no
npm start
```

Per ricreare installer, ZIP portabile, sorgenti e checksum:

```powershell
npm run build:release
```

Sono inclusi lockfile, script di preparazione Windows e cloud Linux, installer NSIS e generatore/verificatore ZIP. Non occorre Wine. Istruzioni per il cloud e per riprendere la pubblicazione: [RESUME.md](RESUME.md). Non eseguire una reinstallazione npm mentre è in corso un build.

## Timeline, zoom, tagli e gruppi

- Importare file o trascinarli nella finestra. Trascinarli poi su **qualsiasi** traccia, nel punto desiderato; il pulsante `+` li aggiunge nel punto della linea verde sulla traccia scelta nella libreria.
- Le tracce con numero maggiore sono sopra quelle con numero minore. Dimensioni e posizione della clip permettono l’immagine nell’immagine. Una sagoma verde/rossa mostra la destinazione durante il trascinamento; una posizione occupata viene rifiutata senza spostare o sovrascrivere altre clip. Lo stesso controllo protegge inserimento, proprietà, cambio velocità e rifilatura. Gli audio attivi di tracce diverse vengono miscelati.
- **Aggiungi traccia** crea solo la traccia richiesta. L’area dedicata sopra le tracce permette di crearne una trascinando una clip o un elemento della libreria. Le tracce e i controlli sono raggiungibili con lo scorrimento verticale. Trascinare il bordo inferiore dell’etichetta ridimensiona anche clip e forma d’onda, senza cambiare tempi o volume.
- **Aggancio preciso durante il trascinamento, nessun ripple**: avvicinando due estremi sulla stessa traccia entro 10 pixel, questi combaciano esattamente. Lo spostamento verticale richiede un gesto di almeno 24 pixel. Muovere, cancellare, tagliare, accorciare o cambiare velocità non sposta automaticamente le altre clip. I vuoti sono mantenuti; in esportazione lo sfondo è nero dove non c'è alcun contenuto visivo.
- **Shift+rotellina** scorre orizzontalmente. **Ctrl+rotellina** e i pulsanti/slider di zoom mantengono come riferimento la **linea verde**, indipendentemente dalla posizione del mouse. Se il cursore è fuori vista, lo zoom lo riporta al centro della vista.
- Cliccare sul righello per spostare la linea verde; **S** divide le clip selezionate attraversate dalla linea. Trascinare i bordi per rifilare. I campi di inizio/fine sorgente permettono un taglio numerico preciso.
- **Ctrl/Shift+clic**, selezione a rettangolo trascinando su uno spazio vuoto o **Ctrl+A** selezionano più clip. **Canc** elimina; **Ctrl+Z** annulla; **Ctrl+Shift+Z** ripristina.
- Tasto destro → **Raggruppa elementi selezionati** (o **Ctrl+G**) associa video, audio, testi, indicatori ed effetti su tracce diverse mantenendo ogni clip separata e modificabile. Il gruppo mantiene tagli, spazi, effetti e posizioni relative. Si sposta come un insieme; **S** lo divide in due gruppi alla linea verde. **Separa gruppo** / **Ctrl+Shift+G** rende di nuovo visibili i frammenti. È un raggruppamento reversibile, non la ricodifica dei frammenti in un nuovo file sorgente.
- **Comandi** personalizza i tasti singoli per divisione, riproduzione e cancellazione. Le scorciatoie non intervengono mentre si scrive nei campi.

## Forma d'onda e velocità

La forma d’onda usa picchi reali del PCM stereo a banda intera, **2.000 punti al secondo (0,5 ms)**, con una piramide di massimi per lo zoom più distante. Il dettaglio viene scelto in base ai pixel fisici, allo zoom, alla velocità e all’altezza della traccia. Il canvas rispetta la densità del display: non si limita a ingrandire un’immagine. Picchi e silenzi restano su un solo lato della base. Il massimo fra i canali evita cancellazioni di fase; il volume della clip viene applicato al disegno, la normalizzazione è costante per file. L’analisi è eseguita in coda.

L’anteprima audio usa un clock Web Audio e pianifica i segmenti in anticipo. I tagli condividono le pagine PCM della sorgente, con cache di 12 pagine da 30 secondi; i filtri e il mantenimento dell’intonazione sono preparati con FFmpeg. Il clock parte soltanto dopo la preparazione audio e il seek video: un decoder non pronto non consuma l’inizio di una clip. Tagli consecutivi della stessa sorgente riutilizzano un decoder video. Durante la preparazione il pulsante mostra `…`; una pausa o un nuovo seek annulla l’avvio in attesa. Un blocco della macchina oltre la finestra di anticipo comporta una ripresa dal confine interessato, invece di saltare silenziosamente l’audio.

**Velocità ×** accetta valori da `0,1` a `16`, compresi `2,5`, con virgola o punto. Selezionare **Seleziona segmenti della sorgente** per cambiare insieme tutti i tagli derivati dalla stessa aggiunta del file. **Ripristina velocità originale** ripristina tutta la famiglia selezionata al riferimento precedente alla prima accelerazione di lavoro (normalmente 1×); il riferimento si conserva anche dopo tagli e salvataggio. `0` nel campo velocità resta una scelta esplicita di 1×.

Il cambio velocità mantiene invariati `in/out` del file sorgente e l’ordine del montaggio. Ricalcola soltanto la posizione dei frammenti interessati; i consecutivi rimangono consecutivi e i vuoti già presenti mantengono la loro durata sulla timeline. Non vengono recuperate parti eliminate. Le altre clip restano ferme: i frammenti allungati che le incontrano passano su una traccia libera riutilizzata, creata solo se necessario. I frammenti che trovano spazio rimangono sulla traccia originale. Un solo Ctrl+Z annulla l’intera operazione. Trascinamento, taglio, cancellazione e rifilatura ordinari mantengono il comportamento senza ripple. Nei progetti precedenti privi dell’identificatore dell’aggiunta sorgente, la selezione della famiglia si basa sul file multimediale.

L’export e l’anteprima usano le stesse velocità con mantenimento dell’intonazione audio. A velocità estreme il video dipende anche dai limiti di Chromium.

## Sfocatura, pixelatura, zoom e annotazioni

Selezionare una clip video/immagine e aprire le proprietà:

- **Sfocatura e pixelatura**: pulsanti diretti vicino a Testo e Freccia creano elementi indipendenti sulla traccia scelta nella libreria (aggiungere e scegliere una traccia sopra i video da elaborare). Spostare/rifilare l’elemento per scegliere il suo intervallo. L’area è trascinabile e ridimensionabile con la maniglia nell’anteprima; le proprietà permettono una regolazione precisa. Gli effetti precedenti applicati direttamente alle clip restano supportati. La cornice è un aiuto di modifica e non viene esportata.
- **Posizione, dimensioni e zoom**: slider visivo 1–5×, otto maniglie e trascinamento diretto per posizione e dimensioni. **Mantieni proporzioni** è attivo inizialmente e può essere disattivato per modificare indipendentemente larghezza e altezza. **Ripristina inquadratura** azzera zoom e posizione. Controlli numerici secondari: X/Y e dimensioni del riquadro, zoom iniziale/finale da 1× a 5× e centro X/Y. Valori diversi fra inizio e fine producono uno zoom in/out lineare lungo la clip. Si può spostare il riquadro anche trascinandolo nell'anteprima quando non è attiva un'area effetto.
- **Testo**: riquadro ridimensionabile, ritorno a capo automatico e manuale, carattere fra quelli installati sul PC, dimensione, colore, sfondo opzionale e suo colore. I font non vengono incorporati nei progetti; su un altro PC devono essere installati per mantenere lo stesso aspetto.
- **Freccia**: colore (rosso iniziale), posizione, lunghezza, angolo e spessore.
- **Cerchio**: colore, posizione, diametro e spessore; il tempo di chiusura 0–2 secondi disegna progressivamente il cerchio. `0` lo rende fisso.

Testi e indicatori sono clip con posizione, durata e traccia proprie. Possono essere rifilati, divisi, spostati e raggruppati. Possono essere trascinati nell'anteprima. Gli effetti e le annotazioni sono inclusi nell'export, non soltanto nell'anteprima. Per il testo l'esportazione usa raster generati con lo stesso disegno Canvas dell'anteprima e con il font locale scelto.

## Registrazione di schermo e microfono

**Registra schermo** permette di scegliere:

- Schermo o finestra.
- Formato finale **MP4 H.264/AAC** (predefinito) oppure WebM.
- Risoluzione massima 720p / 1080p / 2160p e **FPS interi personalizzati 1–120**, anche inferiori a 24.
- Qualità video su slider 1–100%, con indicazione **70% consigliata**, e bitrate audio 32–320 kbps.
- Audio del computer su Windows e/o **microfono specifico**. **Rileva microfoni / autorizza accesso** richiede il permesso e mostra i nomi dei dispositivi; la scelta viene passata come `deviceId` esatto.
- Filtri di riduzione rumore, eco e guadagno automatico, disattivati inizialmente per acquisire senza elaborazioni automatiche del browser.

**Ferma e salva** apre il salvataggio nel formato scelto e importa il risultato nella libreria. Internamente la cattura viene scritta progressivamente su disco; l'MP4 viene finalizzato con FFmpeg quando si ferma la registrazione. Attendere la finalizzazione prima di chiudere l'app. Risoluzione, FPS e bitrate effettivi dipendono da sorgente e hardware. Il ritaglio libero di un rettangolo di schermo non è incluso: si può scegliere una finestra.

## Esportazione, progetti e verifiche

**Esporta** produce MP4 H.264/AAC a risoluzione **Originale** (dimensioni esatte del progetto) oppure 720p / 1080p / 1440p / 2160p, **FPS interi personalizzati 1–120** e qualità 1–100% (70% consigliata). La qualità video corrisponde a CRF 40–14; non è una percentuale di compressione o una garanzia sul peso finale. Le proporzioni sono quelle del progetto. La prima sorgente visiva importata stabilisce il riferimento, che viene salvato: selezionare un’altra clip non cambia la risoluzione. Le tracce sono composte con le posizioni e i riquadri impostati; l'audio è miscelato con limitazione dei picchi. Anche progetti con solo audio sono esportabili su sfondo nero.

Il motore renderizza intervalli definiti dagli inizi/fini delle clip, con un massimo di due thread per encoder e un thread di filtri, poi ricostruisce il flusso finale a FPS costanti. Usa file temporanei: durata, numero di clip, risoluzione e sovrapposizioni influenzano tempi e spazio disco. I tagli vengono adattati ai fotogrammi disponibili nel frame rate scelto. L'esportazione è annullabile.

I vecchi progetti con clip sovrapposte sulla stessa traccia vengono aperti distribuendo gli elementi su tracce separate, senza cambiare tagli, durata o posizioni temporali.

**Salva progetto** usa l’estensione `.creastudio` e conserva il montaggio strutturato e i riferimenti ai media; i file originali devono restare nei loro percorsi. I progetti 0.1 vengono migrati automaticamente mantenendo la posizione originale della sequenza e della musica; il salvataggio usa il formato 2.

```powershell
npm test
npm run test:ui
```

I test verificano posizioni senza ripple, gruppi e tagli a velocità variabile, migrazione, tre livelli realmente composti, audio sulle tracce video, spazi vuoti, export a 12 FPS, pixelatura/sfocatura/zoom nel video finale e silenzi reali nella forma d'onda. Il test Electron esercita selezione, trascinamento, gruppi, zoom sulla linea verde, proprietà, testi e indicatori, export, salvataggio/riapertura e una registrazione sintetica MP4 con microfono selezionato.

**Installazione, cattura reale dello schermo e loopback audio restano da verificare su Windows reale.** La prova automatica di registrazione usa sorgenti sintetiche e non prova i driver del PC. L'app non comprende ancora transizioni, webcam, animazioni a keyframe arbitrarie o transizioni avanzate. Licenze e riferimenti: [THIRD_PARTY.md](THIRD_PARTY.md).

## Nuovi controlli e verifiche

Vedere [FEATURES.md](FEATURES.md) per progressione export, qualità, audio, recupero, pannelli e limiti della verifica Windows/GPU.


## Visualizzazione dell’anteprima e apertura del risultato

Il menu **Adatta al pannello / 10% / 25% / 50% / 75% / 100%** modifica solo la visualizzazione. Il 100% corrisponde a un pixel del progetto per pixel fisico dello schermo; la qualità Alta mostra i dettagli originali a questo ingrandimento. Se il contenuto supera il pannello, usare le barre di scorrimento, il pulsante **Sposta vista** o il trascinamento con il tasto centrale del mouse. Questa preferenza locale non modifica il progetto né l’export.

Il riquadro con otto maniglie modifica invece l’elemento selezionato. Si può selezionare anche direttamente nell’anteprima; timeline e proprietà seguono la selezione. Le modifiche di posizione e dimensioni sono salvate e usate anche per foto, testi e indicatori esportati. Lo zoom interno della clip, con i suoi controlli numerici iniziale/finale e centro, resta disponibile separatamente.

Solo dopo la conclusione effettiva dell’export compaiono **Apri video** e **Apri cartella**. L’app usa i comandi nativi di sistema per il lettore predefinito e per mostrare il file, senza costruire righe di comando dai percorsi.
