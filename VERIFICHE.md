# Verifiche di Akhbar Blur 1.0.0

Estensione caricata realmente come componente aggiuntivo temporaneo in **Firefox ESR 140.15.0** su Linux. Manifest accettato e attivazione tramite il pulsante dell'estensione verificata, non simulata. Le prove sono limitate a 170 secondi per comando.

- Nessuna iniezione prima del clic e dopo il ricaricamento della pagina.
- Un solo controller anche con clic ripetuti sull'icona.
- Sfocatura effettivamente visibile sulle immagini, confrontando i pixel della finestra reale di Firefox.
- Disegno di più rettangoli, movimento e ridimensionamento indipendente di larghezza/altezza.
- Aggancio alla fotografia durante lo scorrimento e dopo un ridimensionamento della foto.
- Seconda area creata oltre 40.000 pixel dall'inizio della pagina, posizione corretta durante lo scorrimento.
- Intensità aggiornata per tutte le zone, annullamento dell'ultima area e rimozione totale.
- Esc interrompe la selezione; nascondere il pannello conserva la sfocatura e permette i normali clic sulla pagina.
- Sorgente della fotografia invariata.
- Verifica separata di Manifest V3, soli activeTab/scripting, lettura delle risorse locali su richiesta e segnalazione delle pagine protette.

Nota per chi ripete i test: lo screenshot WebDriver di Firefox può omettere `backdrop-filter` anche se l'effetto è visibile nella finestra. Il test grafico confronta perciò anche lo schermo nativo. La pagina `test/article.html` è interamente locale e contiene una foto sintetica, testo e un documento lungo.

## Ripetere le verifiche (facoltativo, per sviluppatori)

Questi strumenti servono soltanto ai test; non sono dipendenze dell'estensione.

- `node test/manifest-background.cjs`: verifica del manifest e dell'attivazione.
- `test/firefox.py`: richiede Python, Pillow, Firefox, geckodriver e uno schermo grafico. Impostare `FIREFOX_BINARY` al browser e `GECKODRIVER` al driver. Su Linux impostare `DISPLAY` allo schermo di test, quindi eseguire `python test/firefox.py`.

Per usare normalmente l'estensione non occorre nessuno di questi strumenti: basta Firefox e il caricamento di `manifest.json` descritto nel README.
