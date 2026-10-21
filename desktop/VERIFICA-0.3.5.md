# Verifiche AKhbar studio 0.3.5

Questa revisione distingue due comportamenti:

- **Aggancio durante gli spostamenti:** sempre attivo per tutte le clip, anche provenienti da file diversi. Usa le tolleranze in pixel, il controllo dell’ultima posizione al rilascio e la priorità alla traccia iniziale già introdotti nella 0.3.4. Un’impostazione precedente “Aggancio: no” non lo disattiva più.
- **🧲 Chiudi spazi della clip:** pulsante indipendente, con stato memorizzato. Dopo eliminazione o accorciamento di un bordo, sposta soltanto i segmenti successivi della stessa clip inserita, sulla stessa traccia. L’accorciamento chiude lo spazio al rilascio, conservando i punti sorgente scelti e tenendo conto della velocità. Disattivandolo, il vuoto rimane. I conflitti vengono rifiutati senza modifiche parziali. La semplice divisione non chiude spazi.

La provenienza è identificata da `sourceInstanceId`, assegnato al singolo inserimento e condiviso dai suoi tagli. Due inserimenti dello stesso file sono indipendenti. I vecchi elementi senza identificatore restano indipendenti; una nuova divisione assegna l’identità ai due segmenti senza indovinarla dal file.

## Libreria, copia/incolla e gruppi

Il clic singolo seleziona un materiale; doppio clic o Invio aprono l’anteprima sorgente. Il pulsante + e il trascinamento continuano a inserirlo nella timeline senza aprire l’anteprima.

Copia/Incolla sono disponibili nel menu contestuale e con Ctrl+C/Ctrl+V. Incolla usa il cursore e la traccia scelta come origine, rispetto alla traccia con indice minore della selezione copiata. Conserva distanze, disposizione sulle tracce e proprietà; crea eventuali tracce superiori necessarie. Un conflitto rifiuta l’intera operazione. Le copie ricevono nuove identità di inserimento, mantenendo le relazioni fra i segmenti copiati: la calamita non modifica gli originali. Negli input, nei campi multilinea e nei contenuti modificabili, le scorciatoie restano quelle del testo. La copia della timeline è interna all’applicazione e non persiste dopo la sua chiusura.

Raggruppa separa prima gli inserimenti e poi i blocchi effettivamente adiacenti sulla stessa traccia; anche un vuoto di 0,001 s separa i gruppi. Restano sfondo uniforme, perimetro e tagli interni visibili. Il collegamento esplicito tra tracce resta disponibile separatamente. Le clip brevi conservano una zona centrale trascinabile: le maniglie non coprono più tutta la loro larghezza.

## Esportazione

Finestra larga fino a 900 px, adattata alla dimensione disponibile, con Risoluzione/FPS e Qualità/Elaborazione su due colonne. Lo slider appare soltanto con Personalizzata. Avanzate e Dettagli tecnici sono chiusi all’apertura; la velocità CPU è visibile soltanto quando pertinente. La copia dei flussi indica che non applica il livello Qualità e richiede impostazioni compatibili.

Nome e cartella sono campi selezionabili. Sfoglia usa la finestra nativa di salvataggio, aggiornando entrambi e ricordando la cartella. Un nome indicato manualmente che esiste già richiede conferma prima della sostituzione. Impostazioni principali, qualità e nome sono memorizzati; un encoder salvato non disponibile usa CPU. L’area di avanzamento viene riutilizzata e mostra percentuale del contenuto, tempo trascorso e annullamento; il completamento mostra Apri video/Apri cartella. Chiudi ed Esporta rimangono nella barra inferiore, esterna allo scorrimento dei dettagli.

Il motore di rendering non è stato modificato in questa revisione.

## Verifiche brevi

**28 test automatici mirati passati**, oltre alle interazioni Electron/Playwright su Linux con sorgenti sintetiche brevi:

- Selezione e doppio clic per video, immagine e audio; trascinamento dalla libreria senza apertura dell’anteprima.
- Copia multipla e incolla con tagli, velocità, distanze e tracce conservati; conflitto senza modifiche, menu contestuale, scorciatoie e copia del testo in un campo multilinea.
- Copia di video, audio, immagini, testi, frecce ed effetti; nuove identità per le copie.
- Divisione senza spostamenti; chiusura dopo eliminazione, accorciamento sinistro e destro; stato disattivato, clip indipendenti dello stesso file e altre tracce ferme. Annulla/Ripristina.
- Aggancio rapido fra sorgenti diverse a 16, 80 e 320 px/s, superamento del contatto di 22 px e piccolo movimento verticale. La preferenza precedente che disattivava l’aggancio viene ignorata.
- Tre inserimenti suddivisi in dieci segmenti ciascuno: tre gruppi; un vuoto di 0,001 s ne crea un quarto. Salvataggio portabile e riapertura.
- Finestra di esportazione a 1366×768 e 1280×720, con zoom Chromium 100%, 125% e 150%: controllo dei bordi e della raggiungibilità dei pulsanti, slider condizionale e copia flussi. A 1366×768/100%, impostazioni principali e pulsanti sono visibili senza scorrimento.
- Esportazione reale di un secondo a risoluzione originale e 12 FPS, verifica MP4 tramite FFprobe. Nel test la risposta della finestra nativa viene simulata; il percorso scelto attraversa il vero bridge e il vero motore di esportazione.

Immagine della nuova finestra dopo una breve esportazione: [export-layout-0.3.5.png](test/artifacts/export-layout-0.3.5.png).

Il ridimensionamento Chromium simula lo spazio disponibile e l’ingrandimento dei controlli; **non è una prova dei DPI nativi di Windows**. Restano da controllare sul PC Windows il ridimensionamento 125%/150%, la finestra nativa, GPU, icona sulla barra delle applicazioni e installer. Nessuna prova lunga o benchmark è stato eseguito in questa revisione.

## Icona Windows e installer

La configurazione precedente disabilitava sia la firma sia la modifica delle risorse dell’eseguibile. Ora disabilita soltanto la firma e include esplicitamente `src/project-icon.ico`. Sono impostati AppUserModelID e dettagli di rilancio della finestra; i collegamenti e l’installer NSIS usano l’icona del programma. La configurazione è stata validata con lo schema di electron-builder. L’effetto effettivo nella barra Windows richiede il collaudo del nuovo installer sul PC; una vecchia icona fissata alla barra può conservare la cache del collegamento precedente.

Con Node.js **24 x64**, dallo ZIP estratto:

```cmd
cd desktop
npm ci
npm run build:win
```

Output: `desktop\dist\AKhbar-studio-0.3.5-x64-Setup.exe`. Questa revisione non è stata compilata né installata su Windows nel cloud.
