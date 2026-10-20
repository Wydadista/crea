> Aggiornamento: il checkout di partenza di queste modifiche è `0463b0f228f44b5c4c3eff706c11697996c73b28`. Le modifiche correnti sono locali: non cambiare branch o resettare il checkout senza conservarle. Consultare FEATURES.md per le nuove funzioni; le istruzioni di pubblicazione sottostanti sono storiche e non autorizzano nuove pubblicazioni.

# Ripresa nella nuova sessione

Repository: `Wydadista/crea`. Branch di sviluppo: `codex/crea-studio-desktop`.

Usare il checkout già presente sotto `/workspace`: i task cloud sono già isolati, non occorre un Git worktree. Prima di cambiare branch verificare che non ci siano modifiche locali da conservare. Da `/workspace/crea`, in un checkout pulito:

```bash
git fetch origin codex/crea-studio-desktop
git switch --detach FETCH_HEAD
git rev-parse HEAD
cd desktop
```

Confrontare lo SHA con quello comunicato nella chat al termine del salvataggio. Non è necessario disporre dei vecchi file in `dist`: si possono rigenerare dai sorgenti. `dist`, dipendenze e cache non sono versionati.

## Installazione e controlli in cloud Linux

Prerequisiti: Node.js 24, npm e Debian 13 come nell'ambiente originale. Da `/workspace/crea/desktop`:

```bash
bash scripts/prepare-cloud.sh
npm test
```

Lo script usa npm ci con il lockfile, installa/verifica il runtime Electron e prepara Xvfb in `.local-tools` se manca. Non serve Wine per costruire l'installer: NSIS viene eseguito direttamente sul sistema host. TLS, checksum degli strumenti e firme APT restano abilitati.

Per il test completo dell'interfaccia, avviare in una sessione persistente un display libero, ad esempio:

```bash
.local-tools/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp -ac
```

Se Xvfb è già installato nel sistema, usare `Xvfb` al posto del percorso locale. Se `:99` è già occupato da un display funzionante, riutilizzarlo. In un'altra sessione di comando:

```bash
DISPLAY=:99 npm run test:ui
```

## Ricreare installer, ZIP portabile, sorgenti e checksum

Da `/workspace/crea/desktop`:

```bash
export NODE_USE_ENV_PROXY=1
export ELECTRON_CACHE=/tmp/crea-electron-cache
export ELECTRON_BUILDER_CACHE=/tmp/crea-builder-cache
export XDG_CACHE_HOME=/tmp/crea-cache
npm run build:release
```

Il processo è sequenziale: non eseguire `npm ci` mentre il build è in corso. `prebuild:win` scarica anche il binario Windows di FFmpeg per i build eseguiti da Linux. Electron Builder prepara `dist/win-unpacked`, poi NSIS crea l'installer; lo script `bundle-release.cjs` genera e verifica gli archivi ZIP e calcola SHA-256. Il pacchetto sorgenti comprende i file di `desktop` versionati da Git, inclusi script e lockfile.

Risultati della versione 0.2.0:

```text
dist/Crea-Studio-0.2.0-x64-Setup.exe
dist/Crea-Studio-0.2.0-Windows-x64.zip
dist/Crea-Studio-0.2.0-Sorgenti.zip
dist/SHA256SUMS.txt
```

Il nuovo ZIP portabile contiene `Crea Studio.exe` direttamente nella radice dell'archivio: estrarre sempre tutto lo ZIP in una cartella dedicata. La ricostruzione produce gli stessi tipi di pacchetti, non garantisce file identici byte per byte (timestamp e metadati di build possono cambiare).

Su Windows con Node.js 24, nella cartella `desktop`:

```powershell
npm ci
npx install-electron --no
npm test
npm run build:release
```

## Riprendere il caricamento su GitHub

La pubblicazione di installer e ZIP del progetto è già stata autorizzata dall'utente nella chat. Prima controllare l'accesso specifico alle API:

```bash
gh api repos/Wydadista/crea --jq '{full_name,permissions}'
```

L'ultima sessione riceveva `403 Forbidden` dal proxy alla connessione HTTPS, prima di raggiungere GitHub. La configurazione pubblicata include `api.github.com` e `uploads.github.com`: non richiedere un nuovo token soltanto per questo errore. Riutilizzare l'autenticazione fornita dalla piattaforma; non stampare né copiare valori di credenziali.

Quando il controllo API riesce, verificare se esiste già la release:

```bash
gh release list --repo Wydadista/crea --limit 10
```

Se `crea-studio-v0.2.0` non esiste, pubblicare una prerelease dal commit dei sorgenti presenti nel checkout:

```bash
gh release create crea-studio-v0.2.0 \
  --repo Wydadista/crea \
  --target "$(git rev-parse HEAD)" \
  --title "Crea Studio 0.2.0 — prima versione" \
  --prerelease \
  --notes-file RELEASE-NOTES.md \
  dist/Crea-Studio-0.2.0-x64-Setup.exe \
  dist/Crea-Studio-0.2.0-Windows-x64.zip \
  dist/Crea-Studio-0.2.0-Sorgenti.zip \
  dist/SHA256SUMS.txt
```

Se una release esiste già, ispezionarne prima gli asset e caricare soltanto quelli mancanti con `gh release upload`; non cancellare o sovrascrivere asset alla cieca. Infine ottenere e verificare i link effettivi:

```bash
gh release view crea-studio-v0.2.0 --repo Wydadista/crea --json url,assets
```

## Stato dei controlli

Verificati nella sessione originale: nove test automatici, test completo Electron con importazione/drag-drop/tagli/scorciatoie/salvataggio/riapertura/export MP4, registrazione sintetica MP4 con microfono scelto, forme d’onda reali, tre tracce, gruppi, effetti e annotazioni. Installer NSIS generato e contenuto ispezionato; ZIP portabile verificato tramite CRC. La pipeline di bundle è verificata separatamente prima del commit di salvataggio.

Restano da provare su Windows reale l'installazione e l'acquisizione di schermo, microfono e audio di sistema. L'installer di sviluppo non è firmato digitalmente. Limiti funzionali e licenze sono descritti in README.md e THIRD_PARTY.md.
