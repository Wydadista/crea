# AKhbar studio 0.4.1

## Correzioni

- **Zoom sulle sequenze unite:** i segmenti condividono una sola animazione; il tempo viene convertito nella sorgente di ciascun segmento senza ripartenze. La stessa animazione attraversa anche tagli provenienti da intervalli sorgente diversi. I progetti 0.4.0 con identiche animazioni locali ripetute vengono corretti all'apertura; chiavi sorgente già continue rimangono invariate.
- **Inquadratura visiva:** scegliere Vista iniziale o Dettaglio finale, poi Scegli il dettaglio nell'anteprima. Nell'immagine completa compare un riquadro trascinabile e ridimensionabile; una piccola anteprima mostra il risultato. Il cursore arriva a 20×. I campi con coordinate sono nascosti. La barra sotto la sequenza regola inizio e fine del movimento; il pannello mantiene i tempi di entrata, mantenimento e ritorno.
- **Testi ed effetti collegati:** trascinarli sopra un segmento unito li applica all'intera sequenza. Anche i pulsanti della galleria usano la sequenza unita selezionata. Una sola barra continua regola la durata attraverso i tagli; anteprima ed esportazione trattano l'applicazione come un unico elemento. Copie ricevono identificativi indipendenti.
- **Inserimento delle clip esistenti:** trascinare una clip o un segmento presso un confine mostra la linea evidenziata; il rilascio sposta gli elementi successivi senza duplicare il media. La posizione di partenza resta libera. I gruppi mantengono i collegamenti; inserimenti che causerebbero collisioni su altre tracce vengono rifiutati.
- **Registratore:** nero, su una riga, senza menu o cornice nativa. Nome, livello microfono senza numeri, timer, Inizia, ⏸, Stop rosso, Impostazioni e Scarta distanziato. Soltanto Riduci in icona e X come comandi della finestra. Mantiene conto alla rovescia 2 → 1, Pausa, Stop, Scarta, impostazioni e persistenza dopo Stop.
- **Tracce:** la traccia 1 rimane alla base e quelle successive crescono sopra. Il bordo superiore, anche nell'area della traccia, aumenta l'altezza trascinando verso l'alto. Nessun ridimensionamento dal bordo inferiore. Le intestazioni seguono lo scorrimento verticale.
- Bordi delle clip unite: **#FFC82E**, anche quando selezionate, con riferimento sottile ai tagli interni.
- **DeepFilterNet3:** motore CPU ufficiale e modello preaddestrato scaricati durante `npm ci`, verificati con checksum. Elaborazione locale, nessun Python, addestramento o servizio remoto. Anteprima ed export usano lo stesso risultato; intensità e confronto prima/dopo restano disponibili. Vedere README per l'uso e THIRD_PARTY per le licenze.

## Verifiche

- **66 test automatici superati** con `npm test`, compreso un export reale che confronta l'inquadratura prima e dopo un taglio con ripartenza della sorgente.
- Prove Electron `test/v41-ui.cjs`: una sola animazione su dieci segmenti, testo con barra continua e regolazione delle estremità, scelta di un dettaglio laterale e ridimensionamento del riquadro, trascinamento reale di un elemento esistente con linea di inserimento, crescita dal bordo superiore con base fissa e registratore su una riga.
- Regressione `test/v4-ui.cjs`: stili, effetti collegati, salvataggio e riapertura, annulla, gruppi compatti e tagli indipendenti, margine della timeline, qualità, registratore separato, conto alla rovescia, Stop e Scarta.
- DeepFilterNet3 eseguito realmente su un campione di rumore: attenuazione verificata, frequenza e canali corretti, durata conservata e export riuscito. Questo non sostituisce un confronto d'ascolto su una registrazione vocale reale.

Prove eseguite su Linux/Electron con dispositivi simulati; driver, microfono reale e comportamento nativo Windows restano da verificare sul PC. Tutte le prove sono state limitate a meno di quattro minuti. Nessun installer o EXE dell'applicazione generato; configurazione AVG invariata.
