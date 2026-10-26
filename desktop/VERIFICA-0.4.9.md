# AKhbar studio 0.4.9 — ombra sul video con sfondo sfocato

Con **Sfondo sfocato** attivo, il video nitido proietta ora un'ombra nera morbida sullo sfondo, lungo il proprio contorno reale. L'ombra segue zoom, posizione e dimensioni del primo piano. Il video nitido viene disegnato sopra l'ombra e mantiene i propri colori. L'intensità e la sfumatura si adattano alla risoluzione del progetto.

Il comportamento è presente sia nell'anteprima sia nell'esportazione. Senza Sfondo sfocato, le sovrapposizioni restano trasparenti nelle aree vuote e non ricevono l'ombra. Anche il riquadro dell'effetto nella libreria mostra il nuovo stile.

## Verifiche

- **78 test superati**, suite completa in circa 13 secondi, con limite di 170 secondi per comando.
- Nuova prova FFmpeg su sfondo e primo piano bianchi: verifica la presenza dell'ombra sfumata all'esterno, il mantenimento del bianco nel video nitido e nello sfondo lontano, la posizione dell'ombra dopo zoom e ridimensionamento, i bordi superiori/inferiori e l'assenza dell'ombra senza l'effetto.
- Verifica Electron degli stessi casi nell'anteprima, incluso il ripristino dello stato del canvas per i disegni successivi.
- Ripetute le verifiche precedenti su trasparenza, tagli VFR, audio, esportazione, effetti e gruppi.

Nessun EXE generato. Nessun nuovo parametro salvato nel progetto; lo stile usa l'effetto Sfondo sfocato già presente nella 0.4.8. Le prove sono su sorgenti sintetiche brevi, non sul progetto completo o sulla GPU Windows dell'utente.
