# Déployer MIMOYE réellement — guide pas à pas (Render)

## 1. Fichiers à mettre sur GitHub

Structure exacte du dépôt (à la racine) :

```
server.js
mimoye-app.html
package.json
manifest.json
service-worker.js
icons/
  icon-72.png
  icon-96.png
  icon-128.png
  icon-144.png
  icon-152.png
  icon-192.png
  icon-384.png
  icon-512.png
  icon-maskable-512.png
```

`package.json` était manquant jusqu'ici — je l'ai créé (c'est lui qui permet à Render de
reconnaître correctement un projet Node, comme discuté plus tôt avec l'erreur Cargo.toml).
Les icônes étaient fournies en 192px/512px seulement ; j'ai généré toutes les tailles
requises par `manifest.json` à partir de la 512px.

**N'ajoute jamais** le dossier `data/` (créé automatiquement par le serveur) à Git : ce sont
des données runtime, pas du code.

## 2. Créer le service sur Render

1. Sur [render.com](https://render.com) → **New** → **Web Service**.
2. Connecte ton dépôt GitHub contenant les fichiers ci-dessus.
3. Vérifie que **Runtime** = **Node** (voir l'erreur Cargo.toml précédente si ce n'est pas
   le cas automatiquement).
4. **Build Command** : `npm install`
5. **Start Command** : `npm start` (ou `node server.js`)
6. Choisis une région proche de tes utilisateurs (Europe si pas de région Afrique de l'Ouest
   disponible — impact minime sur la latence en Côte d'Ivoire).

## 3. ⚠️ Disque persistant — étape critique

MIMOYE stocke ses données (utilisateurs, demandes, paiements, professionnels...) dans des
fichiers JSON sur disque (`./data/*.json`), pas dans une base de données externe. **Sans
disque persistant, Render efface ce dossier à chaque redéploiement ou redémarrage du
service** — tu perdrais tous les comptes et l'historique.

Pour l'éviter :
1. Sur le service Render → onglet **Disks** → **Add Disk**.
2. **Mount Path** : `/opt/render/project/src/data`
3. Taille : 1 Go suffit largement pour démarrer.
4. ⚠️ Les disques persistants Render nécessitent un plan payant (Starter, ~7 $/mois
   minimum) — non disponible sur le plan gratuit. C'est un point à budgéter avant un
   lancement réel : sans lui, l'app "marche" en test mais perd ses données à la moindre
   mise à jour ou redémarrage automatique.

## 4. Variables d'environnement à définir

Dans **Environment** :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `ADMIN_EMAIL` | Oui | Email du compte administrateur initial |
| `ADMIN_PASSWORD` | Oui | Mot de passe du compte administrateur initial |
| `WAVE_PAYMENT_NUMBER` | Recommandé | Numéro marchand Wave affiché aux clients (circuit manuel) |
| `PUBLIC_BASE_URL` | Recommandé | URL publique finale du site (ex. `https://mimoye.com`) |
| `WAVE_API_KEY` | Optionnel | Active le paiement Wave 100% automatique (sinon circuit manuel) |
| `WAVE_WEBHOOK_SECRET` | Optionnel | Requis si `WAVE_API_KEY` est définie |
| `BREVO_API_KEY` | Optionnel | Active les notifications email/SMS réelles |
| `BREVO_SENDER_EMAIL` | Optionnel | Requis si `BREVO_API_KEY` est définie |
| `BREVO_SENDER_NAME` | Optionnel | Défaut : MIMOYE |
| `BREVO_SMS_SENDER` | Optionnel | Défaut : MIMOYE |

Tant que les variables optionnelles ne sont pas définies, l'app fonctionne normalement en
mode manuel/sandbox pour ces fonctionnalités (voir `CONFIG_WAVE_ET_NOTIFICATIONS.md`).

## 5. Nom de domaine (optionnel mais recommandé pour un lancement réel)

Render fournit une URL du type `mimoye.onrender.com` gratuitement et en HTTPS. Pour un nom
de domaine personnalisé (ex. `mimoye.ci` ou `mimoye.com`) :
1. Achète le domaine chez un registrar (ex. Afrihost, Namecheap, OVH).
2. Sur Render → **Settings** → **Custom Domains** → ajoute le domaine.
3. Configure les enregistrements DNS indiqués par Render chez ton registrar.
4. Render gère automatiquement le certificat HTTPS (Let's Encrypt).
5. Mets à jour `PUBLIC_BASE_URL` avec ce nouveau domaine.

## 6. Après le premier déploiement — checklist de vérification

- [ ] Le site s'ouvre sur `https://<ton-service>.onrender.com`
- [ ] Connexion admin fonctionne avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [ ] Créer un compte client, un compte professionnel (le professionnel doit être validé
      depuis l'écran admin "File de vérification" avant d'apparaître dans les recherches)
- [ ] Parcours complet : recherche → devis → acceptation → paiement (circuit manuel) →
      confirmation admin → versement au professionnel
- [ ] Sur téléphone : ajout à l'écran d'accueil (PWA), navigation verticale, bouton retour
- [ ] CGU visibles et obligatoires à l'inscription
- [ ] Après un redéploiement test, vérifier que les comptes créés sont toujours là (preuve
      que le disque persistant est bien monté)

## 7. Limite à connaître pour la suite

Le stockage en fichiers JSON convient pour démarrer et valider le marché, mais n'est pas
conçu pour une charge importante ou plusieurs instances du serveur en parallèle. Si MIMOYE
grandit, prévoir une migration vers une vraie base de données (PostgreSQL, disponible
directement sur Render) — ce sera un chantier à part, mais rien n'empêche de lancer
MIMOYE tel quel dès maintenant.
