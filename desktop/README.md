# Crea Studio — editor video desktop

Prima versione per Windows 10/11 x64, ispirata al flusso di montaggio di Camtasia. È un'applicazione indipendente: non usa codice o componenti di Camtasia. Il vecchio editor di immagini `../creapost.html` rimane disponibile e invariato.

## Avvio su Windows

Per utilizzare l'installer generato, aprire `dist/Crea-Studio-0.1.0-x64-Setup.exe` e scegliere la cartella di installazione. L'installer di sviluppo non è firmato digitalmente. Non occorre installare FFmpeg o Node.js per eseguire l'app installata.

Per sviluppare o ricostruire l'app dai sorgenti, installare Node.js 24 LTS, aprire PowerShell nella cartella `desktop` ed eseguire:

```powershell
npm ci
npx install-electron --no
npm start
```

Electron 42 scarica il runtime con `install-electron` o al primo avvio. Non disabilitare TLS o la verifica dei checksum. L'installazione richiede accesso a npm, GitHub e ai server degli asset delle release GitHub.

Per creare un nuovo installer sul PC Windows:

```powershell
npm run build:win
```

Il risultato è in `dist/`. Il build prepara la cartella `win-unpacked` con Electron Builder e genera l'installer con NSIS tramite `scripts/make-installer.cjs`. Il compilatore NSIS viene ottenuto attraverso gli strumenti di Electron Builder, mantenendo la verifica degli artefatti. L'installer si installa per il solo utente corrente, crea i collegamenti e registra la disinstallazione; la disinstallazione rimuove solo i file presenti nel pacchetto.

Il build include Electron, FFmpeg e FFprobe. Non richiede un server HTTP. I dati multimediali rimangono sul PC. Se usi il pacchetto portabile `Crea-Studio-0.1.0-Windows-x64.zip`, estrai **tutta** la cartella e avvia `Crea Studio.exe`: non spostare il solo eseguibile, perché servono anche `resources` e gli altri file.

Nell'ambiente cloud Linux, `bash scripts/prepare-cloud.sh` prepara le dipendenze e un display virtuale Xvfb locale, senza modificare i pacchetti di sistema. Per i test UI, avvia Xvfb in una sessione persistente (`.local-tools/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp -ac`) e poi esegui `DISPLAY=:99 npm run test:ui`. Non avviare un secondo server X sulla stessa porta/display se il primo è già attivo.

## Montare un video

1. Premi **Importa file** o trascina i file nella finestra. Sono supportati video, immagini e musica; la riproduzione in anteprima dipende dai codec disponibili in Electron.
2. Trascina video e immagini sulla traccia principale. Il pulsante `+` della libreria aggiunge una clip in fondo. Le immagini durano inizialmente 5 secondi.
3. Trascina la musica sulla traccia audio. Puoi aggiungere più clip audio, anche sovrapposte; trascinale per cambiarne il punto di inizio.
4. Seleziona una clip, posiziona il cursore cliccando sul righello e premi **S** per dividerla. Trascina i bordi per accorciarla o inserisci i punti di inizio/fine nelle proprietà.
5. Trascina il corpo delle clip video per cambiarne l'ordine. La traccia principale è magnetica: non mantiene vuoti tra le clip. Premi **Canc** per eliminare la selezione.
6. Usa **Spazio** per riprodurre/fermare, **Ctrl+rotellina** per scorrere la timeline e **Shift+rotellina** per zoomare intorno al mouse. **Ctrl+Z** annulla e **Ctrl+Shift+Z** ripristina.
7. In **Comandi** puoi cambiare i tasti per divisione, riproduzione e cancellazione. Le preferenze vengono salvate sul PC. Le scorciatoie non intervengono mentre scrivi nei campi.
8. **Salva progetto** salva il montaggio in JSON, con riferimenti ai file originali. Per riaprirlo, usa **Apri**. Il progetto non incorpora i media: conserva i file nei percorsi originali.

## Registrare lo schermo

Apri **Registra schermo**, scegli uno schermo o una finestra e imposta risoluzione massima (720p, 1080p, 2160p), FPS (30/60), bitrate video (2,5/8/16 Mbps) e audio (96–256 kbps). Puoi abilitare l'audio del computer su Windows e aggiungere il microfono predefinito.

La registrazione è scritta progressivamente in un file temporaneo, senza conservare tutto il filmato in memoria. Premi **Ferma e salva**, scegli la destinazione WebM e attendi l'aggiunta alla libreria. La finalizzazione WebM con FFmpeg permette di leggere durata e punti di taglio. Puoi esportarla successivamente in MP4. Finché non salvi, la registrazione è temporanea: non chiudere l'app o spegnere il PC.

La risoluzione e il frame rate effettivi dipendono dalla sorgente e dalle capacità del PC; i bitrate sono obiettivi di codifica. La cattura audio del computer richiede il supporto loopback di Windows. Se la sorgente non fornisce audio, l'app lo segnala. Al momento si può selezionare una finestra, ma non disegnare un rettangolo libero sullo schermo.

## Esportare

**Esporta** genera un MP4 H.264 con audio AAC, con proporzioni 16:9 e bande per i contenuti di proporzioni diverse. Puoi scegliere 720p, 1080p, 1440p o 2160p, 24/25/30/60 FPS e tre profili:

- **Dimensione ridotta**: CRF 30, maggiore compressione.
- **Bilanciata**: CRF 23.
- **Alta qualità**: CRF 18.

Il peso finale dipende anche dalla durata e dalla complessità delle immagini: non è garantito che un video già molto compresso diventi più piccolo. Risoluzioni inferiori e il profilo ridotto aiutano a contenerlo. L'export usa l'audio originale e tutte le clip musicali, con i volumi impostati, e termina alla fine della traccia video. Può essere annullato; i file originali non vengono modificati. Le clip intermedie sono conservate temporaneamente sul disco: assicurati di avere spazio libero sufficiente.

## Verifiche

```powershell
npm test
npm run test:ui
```

`npm test` verifica tagli, validazione del progetto e un export reale tramite i binari FFmpeg inclusi: video tagliato + immagine + musica ritardata, decodifica dell'MP4, dimensioni, durata, ultimo fotogramma e annullamento.

`test:ui` avvia Electron con Playwright ed esegue importazione e analisi dei file, trascinamento e riordino, taglio con S, annulla/ripristina, cancellazione, Ctrl/Shift+rotellina, riproduzione, personalizzazione tasti, salvataggio e apertura progetto, export MP4 e registrazione sintetica con finalizzazione WebM. Su Linux richiede un display X (anche Xvfb). Genera `test/desktop-smoke.png`.

Verificato nell'ambiente Linux con Electron e display virtuale. **La cattura reale dello schermo, microfono e loopback di sistema, così come l'installazione e l'avvio su Windows, devono essere provati su un PC Windows.** Il test di registrazione genera fotogrammi artificiali e non prova i driver audio/video del PC.

## Perimetro della prima versione

Questa versione comprende il flusso essenziale di montaggio. Non comprende ancora sovrapposizione di più tracce video, titoli, transizioni, dissolvenze, ritaglio libero della registrazione, registrazione webcam o un sistema di recupero dopo crash. Alcuni formati importabili da FFmpeg potrebbero non essere riproducibili in anteprima: per l'uso iniziale sono consigliati MP4 H.264/AAC, PNG/JPEG e MP3/WAV.

Le scorciatoie personalizzabili sono tasti singoli; Ctrl/Shift+rotellina e le combinazioni di salvataggio/annullamento restano fisse. Il progetto non viene salvato automaticamente. Le licenze e i riferimenti dei componenti inclusi sono elencati in [THIRD_PARTY.md](THIRD_PARTY.md).

## Ricostruzione e ripresa in cloud

Le istruzioni complete per riprendere da un nuovo checkout, rigenerare installer e ZIP e pubblicare la release sono in [RESUME.md](RESUME.md). `npm run build:release` ricrea tutti gli artefatti; `npm run bundle:release` ricrea solo gli archivi e i checksum dopo un build Windows esistente.
