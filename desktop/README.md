# Crea Studio 0.2 — editor desktop a tre tracce libere

Editor video indipendente per Windows 10/11 x64. La versione 0.2 sostituisce la timeline magnetica con tre tracce universali: video, immagini, audio e annotazioni possono occupare qualsiasi traccia, sovrapporsi e lasciare spazi vuoti. Il vecchio editor di immagini `../creapost.html` rimane invariato.

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
- La traccia 3 è sopra la 2, che è sopra la 1. Dimensioni e posizione della clip si regolano nelle proprietà per mostrare più video contemporaneamente, ad esempio immagine nell'immagine. Se più clip della stessa traccia si sovrappongono, la timeline le mostra su sottorighe; l'ordine di inserimento decide quale appare davanti. Tutti gli audio attivi vengono miscelati.
- **Nessuna calamita e nessun ripple**: muovere, cancellare, tagliare, accorciare o cambiare velocità non sposta automaticamente le altre clip. I vuoti sono mantenuti; in esportazione lo sfondo è nero dove non c'è alcun contenuto visivo.
- **Ctrl+rotellina** scorre orizzontalmente. **Shift+rotellina** e i pulsanti/slider di zoom mantengono come riferimento la **linea verde**, indipendentemente dalla posizione del mouse. Se il cursore è fuori vista, lo zoom lo riporta al centro della vista.
- Cliccare sul righello per spostare la linea verde; **S** divide le clip selezionate attraversate dalla linea. Trascinare i bordi per rifilare. I campi di inizio/fine sorgente permettono un taglio numerico preciso.
- **Ctrl/Shift+clic**, selezione a rettangolo trascinando su uno spazio vuoto o **Ctrl+A** selezionano più clip. **Canc** elimina; **Ctrl+Z** annulla; **Ctrl+Shift+Z** ripristina.
- Tasto destro → **Unifica in un gruppo modificabile** (o **Ctrl+G**) raccoglie anche molti frammenti in un unico blocco per traccia. Il gruppo mantiene tagli, spazi, effetti e posizioni relative. Si sposta come un insieme; **S** lo divide in due gruppi alla linea verde. **Separa gruppo** / **Ctrl+Shift+G** rende di nuovo visibili i frammenti. È un raggruppamento reversibile, non la ricodifica dei frammenti in un nuovo file sorgente.
- **Comandi** personalizza i tasti singoli per divisione, riproduzione e cancellazione. Le scorciatoie non intervengono mentre si scrive nei campi.

## Forma d'onda e velocità

La forma d'onda di video e audio proviene dai campioni reali del file: picchi del PCM stereo a banda intera, 50 punti al secondo, massimo fra i canali per evitare cancellazioni di fase. Non è un disegno decorativo. I silenzi non hanno picchi; i livelli molto bassi sotto circa −54 dB vengono omessi. L'altezza è normalizzata per file per rendere leggibili anche voci poco forti. Rifilatura, volume e velocità cambiano la rappresentazione. L'analisi viene eseguita in coda senza bloccare l'importazione; i file lunghi possono richiedere tempo.

**Velocità ×** accetta valori numerici da `0,1` a `16`, compresi `0,5`, `2` o `2,4`; sono accettati sia la virgola sia il punto decimale. Su più clip selezionate applica il valore a tutte. **Ripristina selezione a 1×** ripristina la velocità originale; anche il valore `0` nel campo è interpretato come ripristino a `1×`. La durata sulla timeline è `(fine − inizio sorgente) / velocità`. Le posizioni delle altre clip restano invariate. L'export adatta l'audio con mantenimento dell'intonazione; l'anteprima a velocità estreme dipende anche dai limiti di Chromium.

## Sfocatura, pixelatura, zoom e annotazioni

Selezionare una clip video/immagine e aprire le proprietà:

- **Sfocatura e pixelatura**: tipo, intensità e area X/Y/larghezza/altezza in percentuale della clip. Si può trascinare l'area tratteggiata nell'anteprima. Per applicare l'effetto soltanto a una parte del video, dividere il segmento con S e applicarlo al pezzo selezionato. La cornice è un aiuto di modifica e non viene esportata.
- **Posizione, dimensioni e zoom**: X/Y e dimensioni del riquadro, zoom iniziale/finale da 1× a 5× e centro X/Y. Valori diversi fra inizio e fine producono uno zoom in/out lineare lungo la clip. Si può spostare il riquadro anche trascinandolo nell'anteprima quando non è attiva un'area effetto.
- **Testo**: testo su più righe, carattere fra quelli installati sul PC, dimensione, colore, sfondo opzionale e suo colore. I font non vengono incorporati nei progetti; su un altro PC devono essere installati per mantenere lo stesso aspetto.
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

**Esporta** produce MP4 H.264/AAC a 720p / 1080p / 1440p / 2160p, **FPS interi personalizzati 1–120** e qualità 1–100% (70% consigliata). La qualità video corrisponde a CRF 40–14; non è una percentuale di compressione o una garanzia sul peso finale. Il file ha proporzioni 16:9. Le tracce sono composte con le posizioni e i riquadri impostati; l'audio è miscelato con limitazione dei picchi. Anche progetti con solo audio sono esportabili su sfondo nero.

Il motore renderizza intervalli definiti dagli inizi/fini delle clip, con un massimo di due thread per encoder e un thread di filtri, poi ricostruisce il flusso finale a FPS costanti. Usa file temporanei: durata, numero di clip, risoluzione e sovrapposizioni influenzano tempi e spazio disco. I tagli vengono adattati ai fotogrammi disponibili nel frame rate scelto. L'esportazione è annullabile.

**Salva progetto** conserva il montaggio JSON e i riferimenti ai media; i file originali devono restare nei loro percorsi. I progetti 0.1 vengono migrati automaticamente mantenendo la posizione originale della sequenza e della musica; il salvataggio usa il formato 2.

```powershell
npm test
npm run test:ui
```

I test verificano posizioni senza ripple, gruppi e tagli a velocità variabile, migrazione, tre livelli realmente composti, audio sulle tracce video, spazi vuoti, export a 12 FPS, pixelatura/sfocatura/zoom nel video finale e silenzi reali nella forma d'onda. Il test Electron esercita selezione, trascinamento, gruppi, zoom sulla linea verde, proprietà, testi e indicatori, export, salvataggio/riapertura e una registrazione sintetica MP4 con microfono selezionato.

**Installazione, cattura reale dello schermo e loopback audio restano da verificare su Windows reale.** La prova automatica di registrazione usa sorgenti sintetiche e non prova i driver del PC. L'app non comprende ancora transizioni, webcam, animazioni a keyframe arbitrarie o recupero automatico dopo crash. Licenze e riferimenti: [THIRD_PARTY.md](THIRD_PARTY.md).
