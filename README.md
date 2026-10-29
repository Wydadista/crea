# Akhbar Post 1.0.0 — Android

Prima versione di un'app Android nativa per creare copertine giornalistiche da **due fotografie scelte dal telefono**. Funziona senza Internet, account, abbonamenti o librerie esterne. Il progetto è separato da Akhbar Studio e da Akhbar Blur.

## Cosa fa

- Copertina verticale **3:4, 1080 × 1440 pixel**, esportata in PNG.
- Fotografia principale a tutta copertina: trascinamento per l'inquadratura e ingrandimento 100–400%, anche con due dita.
- Seconda fotografia nel cerchio, con bordo bianco e ombra: inquadratura e zoom indipendenti, posizione e diametro regolabili.
- Sfumatura nera progressiva nella parte inferiore, etichetta rossa per categoria/paese e linea verticale rossa accanto al titolo.
- Titolo bianco, pesante e compatto, adattato a un massimo di quattro righe. Puoi inserire manualmente gli a capo. Le frasi brevi possono occupare meno righe.
- Parole o frasi scelte evidenziate in giallo, senza sostituire il testo originale. Separale con virgole, punto e virgola o un a capo. Sono riconosciuti anche testi Unicode e parole arabe.
- Nessun logo, data, fonte o watermark aggiunto al PNG.
- Ultima bozza conservata sul dispositivo, comprese le inquadrature. Le foto sono riaperte dai riferimenti autorizzati, senza duplicarle nella memoria dell'app.

Lo stile segue la descrizione fornita in chat. Non è stata fornita un'immagine grafica di riferimento per un confronto preciso. La resa fotografica dipende dalle foto scelte: non vengono ricreati i volti né applicati ritocchi AI o una sfocatura selettiva automatica dello sfondo.

## Requisiti

- Telefono **Android 8.0 o successivo**.
- PC con **Android Studio** e Android SDK. Questi strumenti servono a creare l'APK; sul telefono basta installare l'APK.
- Connessione Internet sul PC per scaricare gli strumenti e i componenti della prima compilazione. L'app finita funziona offline e non richiede il permesso Internet.

## Preparazione del PC, una sola volta

1. Installa Android Studio da **https://developer.android.com/studio**.
2. Completa il suo assistente iniziale, compresa l'installazione dell'Android SDK.
3. Apri **SDK Manager** e installa **Android SDK Platform 35**. Nella scheda **SDK Tools**, con **Show Package Details**, verifica anche **Android SDK Build-Tools 35.0.0**.
4. Estrai tutto lo ZIP del progetto, senza lavorare dentro l'archivio.
5. In Android Studio scegli **Open** e seleziona la cartella che contiene `settings.gradle`.
6. Lascia completare la sincronizzazione Gradle e accetta le licenze SDK eventualmente proposte. Usa il JDK integrato in Android Studio come **Gradle JDK** (Java 17 o 21).

Il progetto include Gradle Wrapper 8.11.1, quindi non occorre installare Gradle separatamente.

## Creare l'APK con CMD

Apri CMD nella cartella estratta, dove si trova `CREA_APK.cmd`, e scrivi:

```cmd
CREA_APK.cmd
```

Il comando cerca automaticamente il JDK incluso nell'installazione standard di Android Studio e l'SDK in `%LOCALAPPDATA%\Android\Sdk`.

Se hai installato gli strumenti in cartelle diverse, imposta prima i tuoi percorsi reali:

```cmd
set "JAVA_HOME=C:\percorso\Android Studio\jbr"
set "ANDROID_HOME=C:\percorso\Android\Sdk"
CREA_APK.cmd
```

Il comando Gradle equivalente è:

```cmd
gradlew.bat assembleDebug
```

L'APK installabile si trova in:

```text
app\build\outputs\apk\debug\app-debug.apk
```

È una versione di prova firmata automaticamente con la chiave di sviluppo del PC. Non serve una chiave personale per provarla. Per una versione definitiva e per distribuire aggiornamenti firmati sempre allo stesso modo, usa **Build → Generate Signed Bundle / APK** in Android Studio e conserva con cura la chiave. Lo ZIP non contiene chiavi private.

Se compare **SDK location not found**, riapri il progetto in Android Studio o imposta `ANDROID_HOME` alla posizione dell'SDK. Se manca la Platform 35 o Build-Tools 35.0.0, installali da SDK Manager. La prima compilazione può richiedere diversi minuti sul PC.

## Installare sul telefono

1. Copia `app-debug.apk` sul telefono, tramite USB o un metodo di tua scelta.
2. Aprilo dall'app File del telefono.
3. Se Android lo chiede, consenti **Installa app sconosciute** soltanto all'app da cui stai aprendo l'APK.
4. Conferma l'installazione e apri **Akhbar Post**.

Puoi anche installarla da Android Studio collegando il telefono con il debug USB e premendo Run.

## Creare una copertina

1. Premi **Foto principale** e seleziona l'immagine.
2. Premi **Foto nel cerchio** e scegli il dettaglio fotografico.
3. Seleziona **Foto**, **Foto cerchio** o **Sposta cerchio**, poi trascina nell'anteprima. Per ingrandire puoi usare due dita o il controllo dedicato.
4. Regola la dimensione del cerchio. Il cerchio resta sopra il titolo; spostalo per non coprire il volto della fotografia principale.
5. Inserisci categoria/paese e titolo. Nel campo delle parole gialle scrivi le parole o le frasi presenti nel titolo, separate da virgole.
6. Se serve, regola la dimensione massima del titolo. La dimensione effettiva si adatta per conservare tutto il testo entro quattro righe. Un titolo troppo lungo viene segnalato e il salvataggio resta disattivato finché non lo accorci: il testo non viene troncato silenziosamente.
7. Premi **Salva copertina**. Su Android 10 e successivi trovi il PNG nella galleria, nella cartella **Pictures/Akhbar Post**. Su Android 8–9 il sistema chiede dove salvare il PNG.

Il pulsante Salva si abilita quando entrambe le foto, la categoria e il titolo sono presenti e il titolo entra nello spazio previsto. La copertina esportata contiene soltanto la grafica, senza pulsanti o scritte dell'interfaccia.

## Foto, memoria e bozza

Il selettore di Android autorizza soltanto i file scelti: non viene richiesto l'accesso generale alla galleria. I file originali non sono modificati. Le immagini vengono decodificate a una dimensione adatta al formato di uscita per contenere l'uso di memoria; l'orientamento EXIF viene rispettato.

Il sistema può mostrare provider cloud nel selettore: per un uso interamente offline scegli fotografie già presenti sul telefono. Foto molto piccole o ingrandimenti elevati possono apparire meno nitidi. Se rimuovi o sposti una fotografia originale, selezionala nuovamente nell'app per recuperare la bozza.

## Verifiche e limiti di questa consegna

I sorgenti Java sono stati compilati contro le API ufficiali **Android 35**. I test JVM verificano proporzioni 3:4, ritaglio senza deformazioni o bordi vuoti, spostamenti e selezione delle parole Unicode/arabe. Manifest e risorse XML sono stati controllati.

**Non è stato eseguito un emulatore né una prova su un telefono fisico, e qui non è stato generato un APK.** Il progetto va compilato e provato sul tuo PC/telefono. I controlli automatici eseguiti qui non superano tre minuti per comando.
