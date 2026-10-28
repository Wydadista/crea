# AKhbar studio 0.4.14 — stacchetti, punti volume, segnalibri e salvataggio

## Calamita

L'accorciamento sinistro richiude solo lo spazio prodotto dal gesto: non cerca più una clip estranea come ancoraggio e non cancella i vuoti già presenti. Il taglio sorgente rimane applicato. Gli spezzoni successivi della stessa inserzione seguono la riduzione come prima; elementi di altre inserzioni e tracce restano fermi. La chiusura dopo Dividi/Elimina resta limitata alla stessa inserzione.

## Transizioni → I miei stacchetti

Selezionare video e audio, aprire **Transizioni** e scegliere **Salva selezione come stacchetto**. Dare un nome e salvare. La raccolta appartiene all'applicazione e rimane disponibile aprendo o creando altri progetti. Conserva una copia dei media necessari, così non dipende dai file del progetto originale.

Il pulsante **Inserisci** usa la linea verde sulla traccia selezionata; trascinando il riquadro sulla timeline compare una linea evidenziata ai confini delle clip. Si inserisce tra due clip, senza spezzare automaticamente un elemento attraversato. Gli elementi successivi di tutte le tracce vengono spostati della durata visiva per conservare la sincronizzazione; un gruppo attraversato dal punto scelto viene segnalato senza modifiche parziali.

Con video di 4 secondi e musica di 6, la notizia seguente parte dopo 4 secondi e riceve 2 secondi di coda musicale. La musica usa una traccia audio libera, riutilizzata negli inserimenti successivi se non ci sono sovrapposizioni; una nuova traccia viene aggiunta soltanto quando serve. Gli usi dello stesso preset riutilizzano i suoi media nella libreria. La musica ha una traccia indipendente: niente secondi neri incorporati nel video. I componenti sono collegati negli spostamenti ma restano visibili sulle rispettive tracce, così la durata audio è riconoscibile e modificabile. Le copie inserite sono gruppi indipendenti. Rimuovere un preset dalla raccolta lo nasconde e conserva i media già referenziati da progetti esistenti.

## Volume variabile

**Modifica volume** mostra la linea e il piccolo **＋**. Quest'ultimo aggiunge un punto alla linea verde, oppure al centro della clip se la linea verde è esterna. **Ctrl+clic** permette di aggiungerlo direttamente dove si desidera. Dopo i primi punti si può anche fare doppio clic sull'area della curva.

I punti si trascinano orizzontalmente per il tempo e verticalmente per il volume, tra 0 e 200%. La variazione tra due punti è lineare e graduale. Tasto destro sul punto: **Elimina punto volume**. Tasto destro sull'area della curva: **Rimuovi tutti i punti volume**. Annulla/Ripristina, salvataggio, tagli, rifilature, velocità e copia/incolla conservano la curva nei tempi sorgente. Per gli elementi collegati il controllo conserva una curva sincronizzata.

Il guadagno è applicato con Web Audio in anteprima e con il filtro volume negli stessi percorsi FFmpeg già presenti; la codifica video e la correzione dei tagli VFR non cambiano. I progetti con punti volume richiedono questa versione per riprodurli correttamente.

## Segnalibri

**⚑ Segnalibro** inserisce un nome alla linea verde. Clic sul flag per raggiungerlo; trascinamento per spostarlo; tasto destro per rinominarlo o eliminarlo. I segnalibri sono metadati del progetto, con Annulla/Ripristina e salvataggio. Non fanno parte delle clip, della scena o dei fotogrammi esportati.

## Menu

Tolti dal menu del tasto destro Taglia, Copia, Incolla, Dividi e Velocità su tutta la sorgente. Le scorciatoie Ctrl+X/C/V e i comandi Dividi della barra e da tastiera restano disponibili. Silenzia/Riattiva audio ora ha un'icona riconoscibile.

## Registrazioni e cartella progetto

Nel salvataggio i media registrati dall'app, e quelli che si trovano nella cartella Registrazioni configurata, restano collegati al file esistente. Non viene creata una seconda copia in `Media/`. I media importati esterni continuano a essere raccolti una volta e riutilizzati nei salvataggi successivi. I file originali non vengono spostati o eliminati; le vecchie copie già esistenti non vengono cancellate automaticamente. Per trasferire il progetto su un altro PC bisogna includere anche le registrazioni collegate.

La raccolta stacchetti conserva invece i media del preset, per mantenerli disponibili indipendentemente dal progetto che li ha creati.

## Verifiche

- Suite di test completa superata in circa 15 secondi, con limite di 170 secondi per comando.
- Calamita: spazio preesistente di un minuto tra inserzioni diverse, clip unite, rifilatura e cancellazione degli spezzoni della stessa inserzione.
- Salvataggio stacchetti, nuova istanza della raccolta, cancellazione del file originale e rimozione del preset senza rompere i riferimenti già utilizzati.
- Esportazione reale: video stacchetto di 4 secondi, musica di 6, notizia successiva subito dopo il video, coda audio presente nei secondi 4–6 e assente dopo; fotogrammi controllati per evitare secondi neri o grafica dei segnalibri.
- Curve volume in esportazioni reali dirette, a blocchi, con composizione e con cambio di velocità; base a 0% con punti maggiori di zero, tempi sorgente corretti attraverso i tagli.
- Prova Electron con audio/video sintetici: trascinamento sinistro, menu semplificato, aggiunta/spostamento/eliminazione dei punti, Annulla/Ripristina, audio Web Audio realmente renderizzato in OfflineAudioContext, segnalibri nominati e trascinati, raccolta stacchetti tra progetti e movimento sincronizzato dei componenti.
- Raccolta progetto: registrazioni collegate, altri importati copiati una sola volta, salvataggi ripetuti e nessuna modifica dei file originali.

Nessun EXE generato; nessuna prova o esportazione lunga del progetto personale dell'utente. Le verifiche grafiche cloud usano Linux; la prova sul PC Windows resta utile prima del lavoro quotidiano.
