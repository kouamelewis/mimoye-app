// Service worker MIMOYE — met en cache uniquement la coquille de l'application
// (HTML, manifest, icônes) pour un chargement rapide et une meilleure tolérance
// aux réseaux mobiles instables. Les appels /api/* ne sont JAMAIS mis en cache :
// les données (professionnels, demandes, paiements...) doivent toujours être à
// jour, jamais servies depuis une copie locale obsolète.
const CACHE_NAME = "mimoye-shell-v1";
const SHELL_FILES = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Jamais de cache pour l'API : toujours du réseau, données toujours fraîches.
  if (url.pathname.startsWith("/api/")) return;

  // Pour la page d'accueil : réseau en priorité, secours sur le cache si hors-ligne.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
    return;
  }

  // Pour les autres ressources statiques (icônes, manifest) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
