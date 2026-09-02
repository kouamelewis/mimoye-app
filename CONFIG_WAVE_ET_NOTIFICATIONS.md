# Paiement Wave réel + notifications email/SMS — ce qui a changé

## 1. Paiement Wave — désormais réellement automatique (avec repli manuel)

Le code appelle maintenant la vraie **API Checkout de Wave**
(https://docs.wave.com/checkout) :
- `POST https://api.wave.com/v1/checkout/sessions` crée une session de paiement.
- Le client est redirigé vers `wave_launch_url` (l'app Wave), paie, puis Wave
  confirme automatiquement via un **webhook signé** sur `/api/webhooks/wave`
  (événement `checkout.session.completed`), vérifié en HMAC-SHA256 sur le corps
  brut de la requête — voir `verifyWaveWebhookSignature` dans `server.js`.

**Tant que `WAVE_API_KEY` n'est pas définie**, le circuit précédent (vérification
manuelle par un administrateur) continue de fonctionner exactement comme avant —
rien n'est cassé, aucune action requise de ta part pour l'instant.

### Variables à ajouter sur Render dès que tu as un contrat marchand Wave actif

Dans **Environment**, en plus de `ADMIN_EMAIL` / `ADMIN_PASSWORD` /
`WAVE_PAYMENT_NUMBER` déjà configurés :

- `WAVE_API_KEY` = ta clé API (Business Portal Wave → Developer section →
  `business.wave.com/dev-portal`, format `wave_sn_prod_...` ou équivalent CI)
- `WAVE_WEBHOOK_SECRET` = secret donné par Wave **au moment où tu enregistres
  l'URL de webhook** `https://<ton-domaine>/api/webhooks/wave` dans le Business
  Portal (Developer → Webhooks → Add New Webhook, événements
  `checkout.session.completed` et `checkout.session.payment_failed`)
- `PUBLIC_BASE_URL` = l'URL publique de ton site (ex. `https://mimoye.onrender.com`)
  — utilisée pour construire les URL de retour après paiement. Optionnelle : à
  défaut, le serveur la déduit de l'en-tête `Host` de la requête.

Dès que `WAVE_API_KEY` est définie, `/api/requests/:id/pay-initiate` bascule
automatiquement sur le circuit API réel — aucune autre modification de code
nécessaire, le circuit manuel reste disponible en repli si l'appel API échoue
temporairement.

⚠️ Point important pour l'IP whitelisting Wave (si activé sur ta clé) : il faudra
alors whitelister l'IP sortante de ton service Render, pas seulement les IP de
Wave listées dans leur doc webhook (celles-ci concernent le sens entrant).

## 2. Notifications email + SMS — via l'API Brevo (ex-Sendinblue)

Chaque notification interne (paiement, devis, litige, etc.) est maintenant aussi
envoyée par email et par SMS au destinataire, via Brevo (plan gratuit disponible :
300 emails/jour, SMS à l'unité). Un seul fournisseur pour les deux canaux, donc une
seule clé API à gérer.

**Tant que `BREVO_API_KEY` n'est pas définie**, seules les notifications internes
(déjà visibles dans l'app) continuent de fonctionner — aucun email/SMS n'est
envoyé, et ce n'est jamais présenté comme envoyé.

### Variables à ajouter sur Render

- `BREVO_API_KEY` = ta clé API Brevo (Brevo → SMTP & API → API Keys)
- `BREVO_SENDER_EMAIL` = l'adresse email expéditrice, **vérifiée dans Brevo**
  (Brevo → Senders, Domains & Dedicated IPs)
- `BREVO_SENDER_NAME` = nom affiché comme expéditeur (défaut : `MIMOYE`)
- `BREVO_SMS_SENDER` = nom affiché comme expéditeur SMS, 11 caractères
  alphanumériques max (défaut : `MIMOYE`) — Brevo peut exiger l'enregistrement
  d'un Sender ID par pays selon la date de création de ton compte

Dès que `BREVO_API_KEY` (+ `BREVO_SENDER_EMAIL` pour l'email) sont définies, les
emails et SMS partent automatiquement — aucune autre modification de code.

## 3. Non testé en conditions réelles

Cet environnement de développement n'a pas d'accès réseau : je n'ai pas pu exécuter
un vrai appel vers l'API Wave ni vers l'API Brevo. Le code suit fidèlement leur
documentation officielle (endpoints, en-têtes, format de signature), mais **teste
avec un petit montant réel dès l'activation**, et vérifie dans les logs Render que
les envois Brevo aboutissent (`payment_wave_api_error`, `notify_email_failed`,
`notify_sms_failed` dans les logs d'audit admin si un souci survient).
