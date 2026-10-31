/* Nastavení čtečky. dropboxKey = „App key“ aplikace na dropbox.com/developers (veřejný údaj,
   přihlášení jde přes PKCE bez tajemství). Aplikace má přístup jen ke své složce Apps/<název>. */
window.CTECKA = {
  dropboxKey: '',
  // při vývoji na localhostu se knihovna bere z disku (výstup nastroje/police/vydej.py)
  lokalniKnihovna: '../vydani/'
};
