# Verifiche della versione 1.1.0

- Compilazione di tutte le classi Java contro `android.jar` della piattaforma ufficiale Android 35, con output bytecode Java 17.
- Nuovi test eseguiti: foto intera contenuta sopra il titolo, nessuna immagine nella zona nera sotto il titolo, limite della foto adattato all’altezza del testo e ingrandimento soltanto manuale.
- Test eseguiti della geometria: immagini orizzontali/verticali, proporzioni naturali, zoom 1–4, tutti i limiti di spostamento, nessun bordo vuoto nel ritaglio.
- Test delle parole gialle: frasi letterali, maiuscole/minuscole, Unicode, arabo, caratteri speciali e nessuna evidenziazione dentro una parola diversa.
- Controllo XML del manifest, del tema e dell'icona; nessun permesso Internet o accesso generale allo spazio di archiviazione.
- Gradle Wrapper ufficiale incluso con checksum della distribuzione fissato.

Queste verifiche non sostituiscono la compilazione Gradle completa e la prova sul dispositivo. Nessun APK generato e nessun emulatore eseguito in questa consegna.

## Prova consigliata sul telefono

1. Scegli una foto orizzontale e una verticale, anche scattate ruotando il telefono: verifica orientamento e ritagli.
2. Spegni il cerchio e salva con la sola foto principale. Riaccendilo: la foto secondaria e la sua inquadratura devono rimanere disponibili.
3. A zoom 100% verifica che la foto sia intera sopra il titolo. Allunga/accorcia il titolo: la zona fotografica deve adattarsi. Il nero pieno sotto non contiene la foto.
4. Apri la tastiera nei tre campi: l’anteprima in alto a destra deve restare visibile e aggiornata. Sposta e ingrandisci le foto e regola il cerchio.
5. Prova un titolo italiano e uno arabo, con parole gialle e a capo manuali.
6. Ruota il telefono e riapri l'app: la bozza deve essere recuperata.
7. Salva due PNG e verifica in galleria dimensioni 1080 × 1440, testo completo e assenza di controlli/watermark.
8. Su Android 8–9 verifica il selettore della destinazione; su Android 10+ la cartella Pictures/Akhbar Post.
