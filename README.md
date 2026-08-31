# MIMOYE — Backend fonctionnel (Étapes 2 à 5 + début Étape 9)

## Ce que ce livrable corrige par rapport au prototype précédent

Avant : tout était stocké dans `localStorage` du navigateur. Un professionnel inscrit
sur un appareil n'apparaissait jamais côté admin sur un autre appareil. Aucun bouton
n'était réellement sécurisé.

Maintenant : un vrai serveur (`server.js`) avec une vraie base de données partagée
(fichiers JSON dans `/data`), de vrais comptes avec mots de passe hashés, de vraies
sessions, et un vrai contrôle d'accès par rôle **vérifié côté serveur** (pas seulement
caché côté interface). Testé de bout en bout : inscription pro → visible en attente
côté client → visible dans la file admin → approbation → badge vérifié partout.
Testé aussi : un client qui tente d'appeler une route admin reçoit une vraie erreur 403.

## Lancer le projet

Prérequis : Node.js installé (v18 ou plus), aucune autre dépendance.

```bash
cd mimoye-app
node server.js
```

Puis ouvrir `http://localhost:3000` dans le navigateur.

Le premier lancement crée automatiquement :
- Un compte administrateur : **admin@mimoye.ci / Admin#2026** (à changer avant toute mise en production réelle)
- Un dossier `/data` avec les fichiers JSON qui servent de base de données (`users.json`, `professionals.json`, `taxonomy.json`, `requests.json`, `commissions.json`, `audit_logs.json`, `sessions.json`)

## Comptes pour tester

- **Admin** : admin@mimoye.ci / Admin#2026
- **Client / Pro** : à créer via "Créer un compte" sur la page d'accueil

## Ce qui est réellement fonctionnel (testé, pas seulement affiché)

- Inscription et connexion avec mot de passe hashé (scrypt), sessions serveur par cookie HttpOnly
- Rôles réellement séparés et vérifiés côté serveur (client / pro / entreprise / admin) — toute route sensible refuse l'accès si le rôle ne correspond pas, même en appelant l'API directement
- Référentiel métiers administrable (ajout/modification en base, visible immédiatement dans les recherches)
- Inscription professionnelle réelle → file de vérification admin réelle → approbation/refus réel → statut visible par tous les clients
- Recherche et fiche professionnel connectées à la base de données réelle
- Cycle demande → devis → acceptation → paiement (sandbox) → évaluation, avec statuts gérés côté serveur
- Commissions par catégorie, modifiables par l'admin, persistées
- Journal d'audit (`audit_logs.json`) des actions sensibles (inscriptions, vérifications, connexions, changements de commission)

## Ce qui reste à faire (prochaines étapes, volontairement non traitées maintenant)

Conformément à la logique "étape par étape" : ceci couvre les étapes 2 à 5 de votre plan
(architecture, base de données, backend/API, authentification et rôles), plus une partie
de l'étape 9 (référentiel administrable) et un premier jet des étapes 12-13 (devis, paiement).
Restent à construire, dans cet ordre logique :

- **Étape 7 — Entreprise** : gestion multi-techniciens (actuellement l'entreprise a le même
  espace basique que le pro indépendant)
- **Étape 10 — Recherche avancée** : recherche libre en texte, filtres par distance/disponibilité
- **Étape 11 — Géolocalisation réelle** : actuellement la "zone" est un champ texte libre, pas des coordonnées GPS. Nécessite une clé API cartographique (Google Maps, Mapbox…) en variable d'environnement
- **Étape 15 — Messagerie** entre client et professionnel
- **Étape 16 — Réclamations**
- **Étape 15/16 — Notifications**
- **Étape 15 (paiement réel)** : le paiement actuel est un mode SANDBOX explicite (voir `server.js`, recherche "MODE SANDBOX"). Une vraie intégration Mobile Money (CinetPay, PayDunya, ou API directe des opérateurs) nécessite des clés API contractuelles, à placer en variables d'environnement — jamais dans le code ni le frontend
- **Étape 18 — Tests automatisés**
- **Étape 19 — Déploiement** : ce serveur tourne actuellement en local uniquement. Pour une URL publique, il faut le déployer sur un service comme Railway, Render ou un VPS, avec une vraie base de données (PostgreSQL recommandé au-delà d'un usage MVP) — voir la conversation précédente pour le détail des options d'hébergement

## Limite structurelle assumée

Les fichiers JSON comme base de données conviennent à un MVP et à une démonstration,
mais pas à une montée en charge en production réelle (écritures concurrentes non
transactionnelles). La migration vers PostgreSQL (ou équivalent) est recommandée avant
un vrai lancement public — l'architecture des routes ci-dessus est conçue pour rendre
cette migration directe (chaque bloc d'API correspond à une table).
