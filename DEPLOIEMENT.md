# MIMOYE — Hébergement gratuit

Ce guide explique comment mettre le site en ligne gratuitement, avec une URL publique
que n'importe qui peut ouvrir. Je ne peux pas le faire à ta place depuis cette
conversation (pas d'accès réseau ni d'hébergement possible ici), mais chaque étape
ci-dessous prend quelques minutes et ne demande aucune carte bancaire.

## À savoir avant de choisir

Ce backend stocke ses données dans des fichiers JSON sur le disque du serveur
(`/data`). Sur la plupart des hébergeurs **gratuits**, ce disque est **éphémère** :
il peut être réinitialisé à chaque redéploiement du code, ou après une longue
période d'inactivité. Concrètement :

| Option | Gratuit sans carte | Données persistantes | Difficulté |
|---|---|---|---|
| **Render** (recommandé pour démarrer) | Oui | Non garanti (reset possible au redéploiement / réveil) | Facile |
| **Glitch** | Oui | Oui (tant que le projet reste actif) | Facile |
| **Fly.io** | Oui (carte requise pour vérification, pas de facturation en dessous des quotas) | Oui (avec un volume) | Moyenne |

**Pour une démonstration ou des tests** → Render ou Glitch suffisent.
**Pour garder de vraies données dans la durée** → Fly.io avec un volume, ou migrer
vers une vraie base de données gratuite (voir tout en bas).

---

## Option 1 — Render (le plus simple, recommandé)

1. Va sur **render.com** et crée un compte gratuit (avec GitHub, Google, ou email — aucune carte bancaire demandée pour le plan gratuit).
2. Mets le dossier `mimoye-app/` (les 3 fichiers : `server.js`, `package.json`, `public/mimoye-app.html`, plus ce guide) dans un dépôt GitHub :
   - Si tu n'as pas encore de compte GitHub, crée-en un sur **github.com** (gratuit).
   - Crée un nouveau dépôt, par exemple `mimoye-app`.
   - Mets-y les fichiers (via l'interface web GitHub : "Add file" → "Upload files", glisse les fichiers, puis "Commit").
3. Sur Render : **New +** → **Web Service** → connecte ton compte GitHub → sélectionne le dépôt `mimoye-app`.
4. Configuration :
   - **Build Command** : laisser vide (aucune dépendance à installer)
   - **Start Command** : `node server.js`
   - **Plan** : Free
5. Clique **Create Web Service**. Render construit et démarre le site (1 à 2 minutes).
6. Une URL du type `https://mimoye-app.onrender.com` est générée — c'est ton site en ligne.

**Limites du plan gratuit Render à connaître :**
- Le service "s'endort" après 15 minutes sans visite, et met ~30 secondes à se réveiller au prochain accès (normal, pas un bug).
- Le disque n'est pas garanti persistant entre deux déploiements — si tu redéploies une mise à jour du code, les données (professionnels inscrits, comptes créés) peuvent repartir de zéro. Pour un usage de démonstration, ce n'est pas gênant.

---

## Option 2 — Glitch (données conservées plus fiablement)

1. Va sur **glitch.com**, crée un compte gratuit.
2. **New Project** → **Import from GitHub** (utilise le même dépôt GitHub que ci-dessus), ou **New Project** → **glitch-hello-node** puis remplace les fichiers manuellement par les tiens.
3. Glitch détecte automatiquement `package.json` et lance `node server.js`.
4. L'URL est du type `https://mimoye-app.glitch.me`.
5. Sur Glitch, les fichiers (et donc `/data`) restent en place tant que le projet n'est pas explicitement supprimé — plus fiable que Render pour la persistance sur le plan gratuit.

**Limite :** le projet se met en veille après 5 minutes d'inactivité et se réveille à la prochaine visite (délai de quelques secondes).

---

## Option 3 — Fly.io (le plus robuste pour de vraies données persistantes)

Plus technique (nécessite d'installer un outil en ligne de commande `flyctl` sur ton
ordinateur), mais permet d'attacher un **volume persistant réel** au conteneur, donc
`/data` survit aux redéploiements.

1. Installe `flyctl` (instructions sur **fly.io/docs/getting-started**, disponible pour Windows/Mac/Linux).
2. Dans le dossier `mimoye-app/`, lance :
   ```
   fly launch
   ```
   Réponds aux questions (nom de l'app, région — choisis une région proche, ex. `cdg` Paris).
3. Crée un volume pour les données :
   ```
   fly volumes create mimoye_data --size 1
   ```
4. Dans le fichier `fly.toml` généré, ajoute :
   ```toml
   [mounts]
     source = "mimoye_data"
     destination = "/app/data"
   ```
5. Déploie :
   ```
   fly deploy
   ```
6. L'URL publique est donnée à la fin (`https://<nom-app>.fly.dev`).

Un compte Fly.io demande une carte bancaire pour vérification d'identité, mais
aucune facturation n'a lieu tant que tu restes dans le quota gratuit (largement
suffisant pour ce projet).

---

## Et après la mise en ligne ?

- **Change le mot de passe admin** (`admin@mimoye.ci` / `Admin#2026`) dès que le
  site est en ligne — n'importe qui connaissant ces identifiants pourrait s'y
  connecter. Actuellement il faudrait modifier la ligne `seedAdmin()` dans
  `server.js` et redéployer (pas encore d'écran "changer le mot de passe" côté
  interface — à ajouter dans une prochaine étape si utile).
- **Nom de domaine personnalisé** (ex. `mimoye.ci`) : les trois options ci-dessus
  permettent de brancher un domaine personnalisé gratuitement une fois le domaine
  acheté chez un registrar (Namecheap, OVH, ou un registrar ivoirien pour `.ci`).
- **Pour une vraie base de données gratuite** (au-delà des fichiers JSON, utile si
  le projet grandit) : **Supabase** ou **Neon** offrent un PostgreSQL gratuit
  hébergé. Cela demande d'adapter `server.js` pour parler à cette base au lieu des
  fichiers JSON — je peux m'en occuper si tu veux avancer dans cette direction.

## Test recommandé après déploiement

Une fois l'URL en ligne, vérifie que le cycle complet fonctionne (comme testé en
local) :
1. Crée un compte professionnel → soumets un dossier
2. Connecte-toi en admin → vérifie que le dossier apparaît dans la file de vérification → approuve-le
3. Crée un compte client → vérifie que le professionnel apparaît bien comme "Vérifié" dans la recherche

Si une étape échoue, le plus souvent c'est soit le **Start Command** mal réglé sur
la plateforme (doit être `node server.js`), soit le port : ce serveur écoute déjà
sur `process.env.PORT` automatiquement, donc aucune configuration supplémentaire
n'est nécessaire de ce côté.
