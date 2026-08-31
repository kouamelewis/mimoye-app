# MIMOYE — Livrable : lot "Argent, métiers, compte" (basé sur l'architecture existante)

Ce document répond au format demandé (partie 25 du cahier des charges). Rien de ce
qui existait n'a été supprimé ; ce lot **étend** `server.js` et `mimoye-app.html`.

## 1. Fonctionnalités existantes conservées

Authentification par mot de passe hashé, sessions par cookie, rôles vérifiés côté
serveur (client/pro/entreprise/admin), référentiel métiers administrable, inscription
professionnelle + file de vérification admin, cycle demande → devis → acceptation,
commissions par catégorie, statistiques admin — tout continue de fonctionner à
l'identique, testé après chaque modification de ce lot.

## 2. Nouvelles fonctionnalités ajoutées

- Mot de passe oublié (jeton réel, expirant, à usage unique) + réinitialisation
- Changement de mot de passe depuis le profil (utilisateur connecté)
- Modification des informations personnelles (nom, téléphone)
- Référentiel métiers étendu à **11 secteurs et 180 métiers** (automobile, bâtiment,
  électricité, plomberie, électroménager, informatique, maison, beauté, alimentation/
  événementiel, santé, juridique/financier/professions libérales) — toujours
  administrable, l'admin peut continuer à en ajouter
- Marquage `reglemente: true` sur les catégories de professions réglementées (santé,
  juridique, comptabilité) — base pour un futur contrôle renforcé des justificatifs
- Calcul réel de commission au moment du paiement (taux par catégorie, ou taux par
  défaut sinon), avec ventilation client → MIMOYE → professionnel tracée sur chaque
  transaction (référence unique, montant, taux, commission, montant professionnel)
- Portefeuille professionnel réel : solde "en attente" (juste après paiement client)
  et solde "disponible" (après libération par l'admin — modélise un délai de garantie)
- Demande de retrait professionnel, avec file d'attente admin (payer / refuser —
  le refus recrédite automatiquement le solde disponible)
- Système de litiges : ouverture par client ou professionnel, file admin, clôture
  avec décision enregistrée
- Notifications internes (in-app) sur les événements clés : paiement reçu, litige ouvert
- Tableau de bord admin enrichi : volume total payé, commissions MIMOYE cumulées,
  retraits à traiter, litiges ouverts

## 3. Modifications de la base de données (fichiers JSON, voir section 19 du cahier des charges)

Nouvelles collections : `wallets` (solde par professionnel), `withdrawals` (demandes
de retrait), `disputes` (litiges), `notifications`, `reset_tokens` (jetons de
réinitialisation, temporaires).

Modification de `requests` : l'objet `payment` contient maintenant `reference`,
`montant`, `tauxCommission`, `commissionAmount`, `montantPro` en plus du statut.

Modification de `taxonomy` : chaque catégorie peut porter `reglemente: true`.

Aucune collection existante n'a été supprimée ou renommée.

## 4. Nouvelles routes API

```
POST /api/auth/forgot-password        (public — génère un jeton)
POST /api/auth/reset-password         (public — consomme le jeton)
POST /api/auth/change-password        (authentifié)
POST /api/auth/profile                (authentifié — nom, téléphone)

GET  /api/pro/wallet                  (pro/entreprise — solde + historique retraits)
POST /api/pro/withdrawals             (pro/entreprise — demande de retrait)
GET  /api/admin/withdrawals           (admin)
POST /api/admin/withdrawals/:id/pay   (admin)
POST /api/admin/withdrawals/:id/reject(admin)
GET  /api/admin/wallets               (admin — vue de tous les portefeuilles)
POST /api/admin/wallets/:id/release   (admin — débloque le solde "en attente")

POST /api/disputes                    (client/pro concerné par la demande)
GET  /api/disputes/mine               (utilisateur connecté)
GET  /api/admin/disputes              (admin)
POST /api/admin/disputes/:id/close    (admin)

GET  /api/notifications               (authentifié)
POST /api/notifications/read-all      (authentifié)
```

Toutes vérifiées côté serveur par rôle — testées avec des appels directs (curl)
imitant un utilisateur malveillant tentant de contourner l'interface, refusées
comme attendu.

## 5. Rôles et permissions

Inchangés dans leur principe (client / pro / entreprise / admin, contrôlés côté
serveur). Les routes financières et de litiges héritent des mêmes vérifications de
rôle que le reste de l'API — aucune route sensible n'est accessible sans le bon rôle.

## 6. Fonctionnement du paiement

Le client règle le montant du devis accepté. Le serveur calcule automatiquement la
commission (taux de la catégorie du métier, ou taux par défaut de 12 % sinon),
crédite le solde "en attente" du professionnel avec le montant net, et notifie les
deux parties. **Le professionnel ne reçoit jamais l'argent directement du client
dans le flux applicatif** : le paiement passe par MIMOYE, exactement comme demandé.

Ce qui est réellement testé : le calcul (20 000 FCFA payés, commission 10 % →
2 000 FCFA pour MIMOYE, 18 000 FCFA crédités au professionnel).

Ce qui reste simulé : l'encaissement bancaire réel du client (aucune API Mobile
Money contractuelle disponible ici). Voir section 17.

## 7. Fonctionnement du portefeuille professionnel

`pending` (en attente) → `available` (disponible) : la bascule se fait quand l'admin
"libère" les fonds (`/api/admin/wallets/:id/release`), ce qui modélise un délai de
garantie avant reversement. Depuis `available`, le professionnel peut demander un
retrait ; l'admin le marque payé (fonds définitivement sortis) ou refusé (recrédit
automatique).

## 8. Fonctionnement des commissions

Configurables par catégorie de métier via le tableau de bord admin (déjà existant,
étendu). Si aucune commission spécifique n'est définie pour la catégorie du métier
concerné, un taux par défaut de 12 % s'applique (modifiable dans le code,
`DEFAULT_COMMISSION_RATE` dans `server.js`).

## 9. Fonctionnement de la récupération du mot de passe

Mécanisme réel et sécurisé : jeton aléatoire de 24 octets, à usage unique, expirant
après 1 heure, invalidant toutes les sessions actives une fois utilisé. **La seule
partie non réelle est le canal de livraison** (email/SMS) : sans fournisseur externe
configuré (SendGrid, Twilio...), le jeton est renvoyé directement dans la réponse,
clairement annoté "DEV MODE" dans l'interface. Pour passer en envoi réel, voir
section 17.

## 10. Système de gestion des métiers

180 métiers répartis en 11 secteurs, chacun administrable (ajout déjà possible
depuis l'écran Référentiel). Ce lot n'a pas encore ajouté l'écran "proposer une
nouvelle spécialité" côté professionnel (point 6 du cahier des charges) — prévu
dans un prochain lot, voir section 18.

## 11. Système de vérification des professionnels

Inchangé dans ce lot (statuts non vérifié / en attente / vérifié / certifié / refusé,
déjà fonctionnel). Le marquage `reglemente` sur les catégories santé/juridique/
finance est en place comme point d'ancrage pour un contrôle renforcé des documents,
mais l'écran de dépôt de documents n'est pas encore construit (section 18).

## 12. Système de litiges

Fonctionnel de bout en bout : ouverture (client ou pro, liée à une demande précise),
file d'attente admin, clôture avec décision textuelle enregistrée et horodatée.

## 13. Business model

Voir le document séparé `BUSINESS_PLAN.md`.

## 14. Business plan chiffré

Voir le document séparé `BUSINESS_PLAN.md`.

## 15. Hypothèses financières

Voir le document séparé `BUSINESS_PLAN.md`.

## 16. Dépendances ou clés API à configurer plus tard

| Fonction | Variable d'environnement à définir | Fournisseur à choisir |
|---|---|---|
| Envoi réel de l'email de réinitialisation | `EMAIL_PROVIDER_API_KEY` (nom indicatif, à adapter au SDK choisi) | SendGrid, Mailgun, etc. |
| Encaissement réel du client | Clés marchand du fournisseur choisi | CinetPay, PayDunya, ou API directe des opérateurs |
| Virement réel vers le professionnel | Clés marchand du fournisseur choisi (souvent le même que ci-dessus) | idem |
| SMS (vérification téléphone, notifications) | Clé fournisseur SMS | Twilio, ou un agrégateur local |

Aucune de ces clés n'existe dans le code — c'est volontaire (sécurité). Elles se
définissent uniquement dans **Environment** sur Render (ou l'hébergeur choisi), comme
déjà fait pour `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 17. Instructions pour lancer et tester

Identique au README existant : `node server.js`, puis ouvrir `http://localhost:3000`.
Aucune nouvelle dépendance à installer (toujours Node natif, zéro package externe).

Test recommandé du nouveau lot :
1. Compte pro → soumettre le dossier → admin approuve
2. Compte client → rechercher le pro → demander un devis
3. Pro → répondre avec un montant → client accepte → client paie
4. Pro → onglet **Portefeuille** → voir le montant "en attente"
5. Admin → **Retraits** (le solde doit être libéré avant qu'un retrait soit possible :
   actuellement la libération se fait via l'API `/api/admin/wallets/:id/release`,
   pas encore d'écran dédié — voir section 18)
6. Client ou pro → ouvrir un litige sur la demande → admin le clôture

## 18. Ce qui reste à faire (prochain lot)

- Écran admin dédié pour visualiser tous les portefeuilles et déclencher la
  libération des fonds en un clic (actuellement accessible par API seulement)
- Écran "proposer une nouvelle spécialité" côté professionnel, avec validation admin
- Dépôt de documents justificatifs (upload) pour les professions réglementées,
  avec contrôle bloquant avant badge "vérifié" pour ces catégories spécifiquement
- Vérification du téléphone par SMS à l'inscription
- Rôles "Super Administrateur" et "Agent MIMOYE" distincts (actuellement un seul
  rôle admin unique)
- Export comptable / rapprochement bancaire
- Filtres analytics par période/métier/commune sur le tableau de bord admin
- Intégration réelle d'un fournisseur de paiement Mobile Money (dépend de
  l'obtention d'un contrat marchand, hors périmètre technique)
