# Verifiche della prima versione

- Compilazione di tutte le classi Java contro `android.jar` della piattaforma ufficiale Android 35, con output bytecode Java 17.
- Test eseguiti della geometria: immagini orizzontali/verticali, proporzioni naturali, zoom 1–4, tutti i limiti di spostamento, nessun bordo vuoto nel ritaglio.
- Test delle parole gialle: frasi letterali, maiuscole/minuscole, Unicode, arabo, caratteri speciali e nessuna evidenziazione dentro una parola diversa.
- Controllo XML del manifest, del tema e dell'icona; nessun permesso Internet o accesso generale allo spazio di archiviazione.
- Gradle Wrapper ufficiale incluso con checksum della distribuzione fissato.

Queste verifiche non sostituiscono la compilazione Gradle completa e la prova sul dispositivo. Nessun APK generato e nessun emulatore eseguito in questa consegna.

## Prova consigliata sul telefono

1. Scegli una foto orizzontale e una verticale, anche scattate ruotando il telefono: verifica orientamento e ritagli.
2. Sposta e ingrandisci entrambe le foto; regola il cerchio e verifica che non copra il titolo.
3. Prova un titolo italiano e uno arabo, con parole gialle e a capo manuali.
4. Ruota il telefono e riapri l'app: la bozza deve essere recuperata.
5. Salva due PNG e verifica in galleria dimensioni 1080 × 1440, testo completo e assenza di controlli/watermark.
6. Su Android 8–9 verifica il selettore della destinazione; su Android 10+ la cartella Pictures/Akhbar Post.
