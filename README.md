# Budget Flow

PWA personale per gestire un budget fino a una data finale. Funziona offline dopo il primo caricamento e conserva i dati nel browser del dispositivo.

## Funzioni
- budget totale + data finale;
- budget giornaliero automatico;
- avanzo dei giorni precedenti riportato sui giorni successivi;
- inserimento manuale delle spese;
- banca simulata con transazioni `pending -> completed`;
- backup ed importazione JSON;
- salvataggio locale via `localStorage`;
- service worker per l'uso offline;
- PWA installabile dalla schermata Home;
- nessun account, database remoto o API bancaria reale.

## Privacy
GitHub Pages ospita solo HTML, CSS, JavaScript, manifest e icone. Budget, spese e storico inseriti dall'utente vengono salvati nel browser e **non vengono inviati a GitHub**.

Non inserire mai dati personali direttamente nei file della repository. I backup esportati sono esclusi dal repository tramite `.gitignore`, purché mantengano il nome generato dall'app.

## Avvio locale
Il service worker non funziona aprendo semplicemente `index.html` con `file://`. Avvia un piccolo server locale:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.

## Pubblicare su GitHub Pages
1. Crea una repository GitHub, ad esempio `budget-flow`.
2. Carica **tutti** i file e la cartella `icons/` mantenendo la stessa struttura.
3. Vai in **Settings → Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**.
5. Seleziona il branch `main` e la cartella `/ (root)`, quindi salva.
6. Apri l'URL di GitHub Pages almeno una volta online.
7. Su iPhone: Safari → Condividi → **Aggiungi alla schermata Home**.

Dopo il primo caricamento completo, i file principali sono in cache e l'app può essere riaperta offline.

## Backup
`Esporta backup` scarica un JSON contenente configurazione e spese. Quel file contiene dati personali: non caricarlo su GitHub e conservalo in un luogo appropriato. `Importa backup` sostituisce i dati locali correnti con quelli del file scelto.

## Banca simulata
La demo non legge Apple Pay, carte, NFC o conti reali. Simula soltanto il flusso di una futura integrazione bancaria: `pagamento -> pending -> contabilizzato -> budget aggiornato`.
