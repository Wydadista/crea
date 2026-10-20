# Montaggio, esportazione e recupero

- **Export MP4**: percentuale complessiva basata sui timestamp `out_time_us` di FFmpeg. La composizione degli intervalli pesa secondo la durata, non secondo il numero delle clip; la codifica finale è una seconda passata. Il progresso resta inferiore a 100 fino alla copia del file completato. È una misura dei secondi elaborati, non una stima del tempo residuo: gli effetti possono rallentare alcuni intervalli.
- **Aggancio**: 10 pixel di tolleranza, stessa traccia, fine/inizio esatti anche con velocità diverse. Taglio, cancellazione e rifilatura mantengono ferme le altre clip. La sagoma di destinazione è verde se libera e rossa se occupata; gli intervalli occupati sono rifiutati senza ripple o sovrascrittura. I gruppi restano elementi distinti e mantengono le distanze temporali e tra tracce.
- **Tracce**: una iniziale, aggiunta esplicita con pulsante o area dedicata, massimo 128. Un solo elemento per istante sulla stessa traccia. Altezza indipendente, con clip e forma d’onda che occupano lo spazio disponibile. I vecchi progetti sovrapposti vengono migrati su tracce separate mantenendo i tempi.
- **Timeline**: Ctrl+rotella zoom, Shift+rotella scorrimento. Massimo 640 px/s; righello decimale ai livelli più alti. Trascinare anche direttamente la linea verde aggiorna il fotogramma a video fermo al completamento del seek del decoder.
- **Qualità**, sia in registrazione sia in export: Base 35% (CRF 31, file piccoli), Buona 55% (CRF 26), Ottima 75% (CRF 21), Super 100% (CRF 14, file grandi). Rimane lo slider personalizzato 1–100%. Risoluzione e FPS sono indipendenti; MP4 resta il formato predefinito. La registrazione usa bitrate crescenti per la cattura, poi CRF per la finalizzazione MP4.
- **Audio**: forma d’onda reale su un lato della base, 2.000 picchi/s e livelli di dettaglio selezionati per zoom e densità del display; altezza di ogni traccia regolabile dal bordo inferiore della sua etichetta. Silenzia clip, Silenzia traccia, Converti in mono e filtri voce sono reversibili e salvati nel progetto. Il mono duplica il canale attivo se l’altro ha meno dell’1% del suo RMS; altrimenti fa la media dei due canali, evitando saturazione. Rumore e uniformità sono regolabili da zero (disattivati); l’anteprima prepara un WAV locale con gli stessi filtri FFmpeg dell’export. Per file lunghi la prima preparazione può richiedere tempo. L’indicatore avvisa quando i campioni raggiungono circa 0 dBFS; il mix esportato conserva anche il limitatore esistente.
- **Effetti**: Sfocatura e Pixelizzazione creano clip senza file sorgente, con inizio/durata/traccia propri. Si applicano alla composizione sottostante nell’intervallo attivo. Trascinare l’area e la maniglia inferiore destra nell’anteprima. Gli effetti applicati alle vecchie clip restano leggibili.
- **Testi**: larghezza riquadro nelle proprietà o tramite maniglia; wrapping automatico anche per parole troppo lunghe, con ritorni manuali conservati. Anteprima e raster esportato usano lo stesso codice Canvas.
- **Zoom contenuto**: selezionare un video o un’immagine, usare lo slider Ingrandimento o la maniglia nell’anteprima, poi trascinare l’immagine per scegliere la parte da inquadrare. Reset dedicato. I campi numerici e lo zoom animato iniziale/finale precedenti rimangono disponibili.
- **Progetti**: estensione `.creastudio`, icona pellicola/Play e associazione per utente nell’installer Windows. Doppio clic supportato anche con app già aperta. Apertura dei vecchi JSON e migrazione versione 1 conservate. Ctrl+S funziona anche da un campo proprietà; successivi salvataggi aggiornano il percorso aperto. I media originali restano esterni al progetto.
- **Recupero**: snapshot atomico ogni 60 secondi nella cartella dati dell’app, con dialogo di recupero alla riapertura. Un salvataggio manuale riuscito elimina lo snapshot precedente. Gli ultimi cambiamenti dopo lo snapshot possono andare persi in caso di crash; Ctrl+S resta disponibile in qualsiasi momento.
- **GPU**: rilevamento tramite una vera codifica di prova degli encoder NVIDIA NVENC, Intel QSV, AMD AMF e Apple VideoToolbox presenti in FFmpeg. La scelta accelera la codifica MP4 finale; la composizione e i filtri rimangono CPU. Se l’encoder fallisce, messaggio e ripiego CPU automatico; CPU sempre selezionabile. La disponibilità dipende da binario FFmpeg, sistema, scheda e driver.
- **Prestazioni anteprima**: Alta, Media, Leggera cambiano soltanto la risoluzione di disegno del canvas (1280/854/640 pixel di larghezza); non creano proxy né riducono il costo della decodifica sorgente. L’export usa sempre la propria risoluzione e qualità.
- **Pannelli**: divisori della libreria, delle proprietà e della timeline trascinabili, cursore dedicato. Dimensioni ricordate sullo stesso computer; pulsante Ripristina pannelli. Il canvas mantiene 16:9. La qualità anteprima è anch’essa una preferenza locale; altezza e mute delle tracce sono dati del progetto.

## Verifiche

`npm test` esercita FFmpeg reale, canali audio, pixel esportati prima/durante/dopo un effetto, avanzamento, ripiego GPU, migrazione e modello timeline. `DISPLAY=:99 npm run test:ui` esegue quattro prove Electron: funzionalità precedenti e nuove interazioni, elaborazione audio, export dopo riapertura, snapshot da timer e recupero.

La generazione dell’installer NSIS è verificabile su Linux. Installazione/disinstallazione, associazione con doppio clic, cattura reale schermo/audio e accelerazione hardware vanno collaudate anche su un PC Windows con i driver desiderati. L’installer non è firmato. Nessuna release viene pubblicata automaticamente da queste modifiche.


## Verifica della riproduzione breve

`test/precision-ui.cjs` crea una registrazione reale di 10 secondi e la divide con il modello in 20 segmenti da 0,5 secondi. Avvia tutti i segmenti, prima in avanti e poi indietro, alternando seek/Play/Pausa. Un AudioWorklet di prova registra i campioni sul thread audio con timestamp dei frame: i primi 80 ms vengono confrontati con il PCM sorgente. La prova controlla anche il tempo del video, il riuso di un solo decoder, l’assenza di buchi nella riproduzione continua, 31 tracce, la crescita della forma d’onda, il rifiuto delle collisioni e il salvataggio/riapertura. I test del motore verificano anche l’export MP4 dalla traccia 31 con il suo mute.

L’audio viene preparato prima dell’avvio del clock. La prima lettura di una sorgente lunga o con filtri può richiedere tempo: viene mostrato lo stato di preparazione, senza avanzare la timeline o modificare i tagli. La verifica automatica misura il segnale digitale; uscita sonora e driver fisici del PC Windows restano da provare sul computer di destinazione.

## Ricostruzione dal pacchetto sorgenti su Windows

Estrarre **tutto** lo ZIP della versione desiderata. Con Node.js 24 installato, aprire il Prompt dei comandi nella cartella `desktop` estratta:

```bat
npm ci
npx install-electron --no
npm test
npm run build:release
```

I risultati della build locale saranno nella cartella `desktop\dist`. Questo aggiornamento viene consegnato come sorgenti su GitHub; non richiede un EXE generato nel cloud.


## Ripristino del montaggio accelerato e controllo dell’immagine

- **Seleziona segmenti della sorgente** raccoglie i tagli della stessa aggiunta del file; **Ripristina velocità originale** ripristina il riferimento precedente all’accelerazione di lavoro. Nuove aggiunte indipendenti dello stesso file hanno identificatori distinti. I progetti precedenti senza tali identificatori usano il media come riferimento. Il campo numerico permette una velocità comune diversa sui selezionati.
- I punti sorgente `in/out` non cambiano. L’ordine e i vuoti esistenti vengono mantenuti; i frammenti consecutivi sono riposizionati consecutivamente. Le clip estranee non si spostano. Solo i frammenti in conflitto cambiano traccia conservando il tempo calcolato; una traccia aggiuntiva viene riutilizzata per tutti gli intervalli liberi. Il limite di 128 tracce causa un errore atomico, senza modifiche parziali. Tutto è annullabile con un Ctrl+Z.
- Il menu di visualizzazione anteprima offre Adatta, 10%, 25%, 50%, 75%, 100%. Il 100% usa i pixel fisici del monitor, tenendo conto del fattore DPI. Pan con barre di scorrimento, **Sposta vista** o tasto centrale. Il menu e il pan non modificano il montaggio.
- Otto maniglie ridimensionano l’elemento, con proporzioni bloccate inizialmente e sblocco esplicito nelle proprietà. Video, foto, testi e indicatori condividono posizione/dimensioni salvate ed esportate. Il disegno legacy dei vecchi riquadri rimane leggibile; una manipolazione nuova memorizza anche l’area sorgente adattata, così lo sblocco può allargare realmente il contenuto anziché aggiungere solo bordi vuoti.
- **Originale** mostra la risoluzione esatta del progetto, stabilita dalla prima sorgente visiva e salvata; non dipende dalla selezione corrente. I preset mantengono le proporzioni del progetto. Sono testate anche dimensioni dispari: per conservarle viene usato H.264 4:4:4, con ripiego CPU se l’encoder hardware non lo supporta.
- **Apri video / Apri cartella** compaiono dopo completamento e copia del file finale. Usano `shell.openPath` e `shell.showItemInFolder`; spazi e accenti non richiedono quoting manuale. I test verificano l’IPC nativo e i percorsi; l’apertura del lettore Windows viene eseguita sul PC dell’utente.

Verifiche aggiuntive: `retime.test.js` usa 100 frammenti e parti eliminate, clip estranee, riutilizzo tracce, riferimento 0,8× e fallimento atomico al limite. `original-export.test.js` controlla con FFmpeg dimensioni 1536×864, 1535×863 e 432×768, più pixel dell’elemento ridimensionato. `workflow-ui.cjs` verifica accelerazione/tagli/eliminazione/ripristino, undo/redo, sincronizzazione, sei ingrandimenti, pan, otto maniglie, foto/testi/frecce, salvataggio/riapertura, export originale e comandi di apertura con percorsi accentati. `npm run test:ui` esegue ora quattro suite.
