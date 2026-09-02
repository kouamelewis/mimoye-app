# Corriger "Cannot find module '/opt/render/project/src/server.js'"

## Cause la plus probable

Cette erreur signifie que Render ne trouve **pas du tout** `server.js` à la racine
de ton dépôt GitHub — pas un problème dans le code, un problème d'emplacement du
fichier. Le cas le plus fréquent : le dossier `mimoye-app/` entier a été mis dans
GitHub comme un sous-dossier, ce qui donne par exemple :

```
ton-depot/
  mimoye-app/          ← sous-dossier en trop
    server.js
    package.json
    public/
      mimoye-app.html
```

Alors que Render (avec la commande de démarrage `node server.js` et aucun "Root
Directory" configuré) s'attend à trouver `server.js` **directement à la racine** :

```
ton-depot/
  server.js            ← doit être ici, pas dans un sous-dossier
  package.json
  public/
    mimoye-app.html
    manifest.json
    service-worker.js
    icons/
      icon-72.png
      icon-96.png
      icon-128.png
      icon-144.png
      icon-152.png
      icon-180.png
      icon-192.png
      icon-384.png
      icon-512.png
      icon-maskable-512.png
```

## Comment vérifier et corriger sur GitHub

1. Va sur la page principale de ton dépôt GitHub (`github.com/ton-nom/mimoye-app`).
2. Regarde la liste des fichiers affichés directement sur cette page d'accueil du
   dépôt.
   - **Si tu vois `server.js` et `package.json` directement dans cette liste** →
     la structure est correcte, le problème est ailleurs (voir "Autre cause
     possible" plus bas).
   - **Si tu vois un dossier `mimoye-app` et qu'il faut cliquer dedans pour
     trouver `server.js`** → c'est la cause du problème. Il faut remonter tous
     les fichiers d'un niveau.

### Pour remonter les fichiers d'un niveau

Le plus simple avec l'interface web GitHub :
1. Ouvre le dossier `mimoye-app/` sur GitHub
2. Pour chaque fichier à l'intérieur (`server.js`, `package.json`, et tout le
   contenu de `public/`), ouvre-le, clique le crayon (éditer), puis dans le champ
   du nom de fichier en haut (à côté du nom actuel), retire le préfixe
   `mimoye-app/` du chemin, et sauvegarde (Commit changes). Cela déplace le
   fichier à la racine.
3. Une fois tous les fichiers déplacés, supprime le dossier `mimoye-app/`
   devenu vide (ou vérifie qu'il l'est).

Alternative plus rapide si tu es à l'aise : supprime tout le contenu du dépôt et
re-télécharge tous les fichiers un par un directement à la racine (glisser-
déposer sans passer par un dossier), en recréant uniquement le sous-dossier
`public/` (et `public/icons/`), qui eux doivent bien rester des sous-dossiers.

## Autre cause possible : Root Directory sur Render

Si la structure GitHub est déjà correcte (server.js à la racine) et que l'erreur
persiste, vérifie sur Render :
1. Ton service → **Settings**
2. Cherche le champ **Root Directory**
3. Il doit être **vide** (pas de valeur). S'il contient quelque chose comme
   `mimoye-app`, efface-le et sauvegarde — Render redéploiera.

## Vérification après correction

Dans les **Logs** de Render, tu dois voir apparaître :
```
MIMOYE backend démarré sur http://localhost:XXXX
```
sans message d'erreur "Cannot find module" au-dessus.

---

# Mot de passe administrateur

Aucune modification de code nécessaire — c'est déjà prévu pour passer par les
variables d'environnement (voir `SECURISER_ADMIN.md` livré précédemment).

**Ce que tu dois faire :**
1. Sur Render : ton service → **Environment**
2. Si `ADMIN_PASSWORD` existe déjà dans la liste, clique dessus pour modifier sa
   valeur ; sinon, **Add Environment Variable**
3. Valeur : `3050MARIUSKRA`
4. **Save Changes** — Render redéploie automatiquement

Après redéploiement, connecte-toi avec `ADMIN_EMAIL` (celui que tu as déjà
configuré) et ce nouveau mot de passe. Les anciens identifiants ne fonctionneront
plus.
