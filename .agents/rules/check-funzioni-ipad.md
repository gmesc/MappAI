---
trigger: always_on
---

Quando propongo una modifica, considera sempre il target iPadOS. Se una funzione (es. accesso al file system locale) non è supportata su iPadOS, proponi un'alternativa compatibile o usa la direttiva #if PLATFORM_DESKTOP nel codice.