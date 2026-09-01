# Configuration du paiement Wave et des nouvelles variables d'environnement

## Ce qui a été fait

- `WAVE_PAYMENT_NUMBER` : le numéro Wave de MIMOYE (0103296723) doit être défini en
  variable d'environnement, jamais écrit dans le code. Ce numéro n'est **jamais**
  affiché sur les profils professionnels — il sert uniquement de configuration
  interne du compte de paiement MIMOYE.
- `WAVE_API_KEY`, `WAVE_API_SECRET`, `WAVE_WEBHOOK_SECRET` : prévus dans le code
  (`server.js`, objet `WAVE_CONFIG`), mais laissés vides tant que le contrat
  marchand Wave n'est pas obtenu. Tant qu'ils sont vides, les paiements restent en
  **mode sandbox explicite** (aucune vraie transaction), comme annoncé à chaque
  paiement dans la réponse de l'API.
- Un point d'entrée `/api/admin/payment-config` permet à l'admin de voir si le
  mode réel est actif.
- Un point d'entrée `/api/webhooks/wave` existe déjà comme emplacement prêt à
  recevoir les confirmations de paiement une fois le contrat actif — il répond
  actuellement "non implémenté" tant que les credentials ne sont pas fournis, pour
  ne jamais prétendre traiter un vrai paiement qu'il ne traite pas.

## Ce que tu dois faire sur Render

Dans **Environment**, ajoute (en plus de `ADMIN_EMAIL` / `ADMIN_PASSWORD` déjà
configurés) :

- `WAVE_PAYMENT_NUMBER` = `0103296723`

Laisse `WAVE_API_KEY`, `WAVE_API_SECRET`, `WAVE_WEBHOOK_SECRET` **non définies**
tant que tu n'as pas de contrat marchand Wave actif — le site continuera de
fonctionner normalement en mode sandbox.

## Quand tu obtiendras un vrai contrat marchand Wave

Il faudra :
1. Définir `WAVE_API_KEY`, `WAVE_API_SECRET`, `WAVE_WEBHOOK_SECRET` sur Render avec
   les vraies valeurs fournies par Wave
2. Me redemander d'implémenter l'appel réel à l'API Wave dans la route de paiement
   (`/api/requests/:id/pay` dans `server.js`) et le traitement du webhook
   (`/api/webhooks/wave`) — le code actuel indique précisément où faire ces ajouts
   (commentaires `TODO`)

Sans ces clés, je ne peux pas construire l'appel réel (aucune documentation
d'intégration Wave n'est disponible dans cet environnement, et il n'y a pas
d'accès réseau pour la tester de toute façon) — mais l'architecture est prête à
les recevoir sans rien casser d'existant.
