# PDF SchreibApp – Web/PWA

Die Web-App läuft auf iPad/iPhone/PC im Browser.

Wichtige Unterschiede zur nativen App:
- Apple Pencil wird über Browser-Pointer-Events unterstützt, Druckwerte hängen von Safari/iPadOS ab.
- PDFs und Annotationen werden lokal in IndexedDB gespeichert.
- Beim Export werden die handschriftlichen Einträge mit pdf-lib in eine neue PDF eingebettet und anschließend über den Browser-Download/Teilen-Mechanismus ausgegeben.
- Für zuverlässige PWA-Nutzung muss die App über HTTPS oder localhost bereitgestellt werden.
- PDF.js wird aktuell über ein CDN geladen. Für komplett offline müsste PDF.js lokal in den Projektordner aufgenommen werden.
