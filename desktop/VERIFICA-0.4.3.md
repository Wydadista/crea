# AKhbar studio 0.4.3 — tagli ed esportazione VFR

Le registrazioni dello schermo possono mantenere un fotogramma per molti secondi. Il vecchio export eliminava il fotogramma precedente al taglio e azzerava il timestamp del successivo, anticipando immagini che non dovevano comparire. L'audio rimaneva tagliato correttamente.

La correzione conserva l'immagine visualizzata al punto richiesto e i timestamp relativi al taglio, convertendoli in cadenza costante. La durata viene imposta all'uscita; l'audio esclude esplicitamente il materiale decodificato prima del taglio. Si applica sia alle composizioni sia al percorso diretto e ai cambi di velocità, anche con DeepFilterNet3. Non cambia i tagli salvati o il formato del progetto.

Gli intervalli con un solo video senza effetti visivi, zoom o sovrapposizioni usano ora una codifica diretta: evitano sfondo sintetico, passaggi RGBA e overlay. Conservano qualità, encoder, volume, mono, filtri voce e dimensioni richiesti. Gli altri intervalli mantengono la composizione. L'assemblaggio finale non ricodifica il video. Non viene dichiarato un tempo di esportazione completa senza misura sul PC di destinazione.

## Verifiche

- Difetto riprodotto con una sorgente di 30 secondi contenente soltanto quattro fotogrammi, a 0, 10, 20 e 29 secondi. Prima della correzione apparivano immagini successive escluse dai tagli.
- `vfr-export.test.js` controlla immagini rosse/blu/verdi e toni audio distinti dopo i tagli, sovrapposizioni, velocità 2×, DeepFilterNet3 e clip singola. Verifica durata e scelta del percorso diretto.
- Suite completa: **69 test superati**. Ogni comando di prova è limitato a meno di tre minuti.
- I media originali del progetto fornito non sono disponibili nell'ambiente: la verifica usa sorgenti sintetiche con la stessa caratteristica di cadenza variabile. Non è stato esportato il progetto completo di 28 minuti.
- Nessun EXE generato; le funzioni e l'icona della 0.4.2 sono conservate.
