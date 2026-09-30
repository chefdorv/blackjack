# Blackjack entre potes

Application web mobile pour animer une soirée blackjack entre amis, façon jeu de société.
On joue avec de vraies cartes et de vrais jetons, sans argent : l'application remplace
les cartes défis à imprimer et la feuille de score. Un seul téléphone ou une tablette
est posé au milieu de la table.

- Croupier tournant, manches, mises par manche
- Cartes défis tirées au hasard, retournées d'un geste, réclamées par le premier qui réussit
- Recaves, blackjacks, règlement de fin de manche avec report de ce qui n'est pas payé
- Décompte final, podium animé, championnat sur plusieurs soirées
- Bouton « Annuler » sur les 60 dernières actions
- Tout est sauvegardé dans le navigateur : fermer ou recharger la page ne fait rien perdre
- Installable sur l'écran d'accueil (PWA) et utilisable hors ligne

Site 100 % statique : pas de serveur, pas de compte.

En ligne : **https://blackjack.dooka.fr** (non indexé par les moteurs de recherche).

## Prérequis

- [Node.js](https://nodejs.org) 20 ou plus récent (`node -v` pour vérifier)
- Pour la partie de test automatique et les icônes : Google Chrome installé

## Lancer en local

Depuis le dossier du projet :

```bash
npm install        # une seule fois
npm run dev        # serveur de développement, ouvre http://localhost:5173
```

Pour tester depuis un téléphone sur le même wifi : `npm run dev -- --host`, puis ouvrir
sur le téléphone l'adresse « Network » affichée dans le terminal.

## Vérifier

```bash
npm test           # tests unitaires de la logique de jeu (Vitest)
npm run typecheck  # vérification TypeScript
npm run build      # construit le site dans dist/
npm run e2e        # joue une partie complète dans Chrome (après npm run build)
```

`npm run e2e` joue une partie de 3 joueurs en 1 manche et 1 donne par croupier :
réglages, création, défis, recave, blackjacks, correction, annulation, rechargement,
règlement, décompte, podium, championnat, revanche, fin anticipée, tablette,
mouvement réduit et rechargement hors ligne. Les captures d'écran vont dans
`e2e/captures/`. Autre navigateur : `CHROME_PATH=/chemin/vers/chrome npm run e2e`.

## Déployer

### blackjack.dooka.fr (publication automatique)

Chaque push sur `main` du dépôt `chefdorv/blackjack` lance
`.github/workflows/pages.yml` : tests, build, puis mise en ligne sur GitHub Pages.
Le suivi se voit dans l'onglet **Actions** du dépôt. Réglages en place :

- GitHub : **Settings** → **Pages** → Source = **GitHub Actions**, domaine
  personnalisé `blackjack.dooka.fr`, **Enforce HTTPS** coché.
- DNS (OVH, zone `dooka.fr`) : enregistrement `CNAME` `blackjack` → `chefdorv.github.io.`
- `public/CNAME` et `public/robots.txt` (`Disallow: /`) + balise `noindex` dans
  `index.html` : le site reste hors des moteurs de recherche.

### Autre hébergement

`npm run build` produit un dossier `dist/` autonome, à déposer tel quel sur n'importe
quel hébergement statique. Les chemins sont relatifs : le site fonctionne à la racine
d'un domaine comme dans un sous-dossier.

### Netlify

1. Se connecter sur [app.netlify.com](https://app.netlify.com).
2. Menu **Sites** → **Add new site** → **Deploy manually**.
3. Glisser le dossier `dist/` dans la zone de dépôt.
4. Netlify affiche l'adresse du site (`https://quelque-chose.netlify.app`).

### GitHub Pages

1. Pousser le projet sur un dépôt GitHub.
2. Construire (`npm run build`) et publier `dist/`, par exemple avec une GitHub Action
   `actions/upload-pages-artifact` + `actions/deploy-pages`, ou en poussant le contenu
   de `dist/` sur une branche `gh-pages`.
3. Sur GitHub : **Settings** → **Pages** → choisir la source correspondante.

Le mode hors ligne et l'installation sur l'écran d'accueil demandent du HTTPS (fourni
par Netlify et GitHub Pages) ; en local, `localhost` suffit.

### Installer sur le téléphone

- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

Après une nouvelle mise en ligne, l'application se met à jour à la visite suivante.

## Organisation du code

```
src/
  game/          logique de jeu pure, sans interface (testée)
    types.ts       types partagés
    defaults.ts    réglages et défis par défaut, points du championnat
    settings.ts    modification et validation des réglages
    game.ts        création de partie, donnes, rotation du croupier, manches
    challenges.ts  tirage, retournement, réclamation et remplacement des défis
    scoring.ts     reste à régler, règlements, classements, championnat
    history.ts     historique d'annulation (60 actions)
    names.ts       saisie des noms de joueurs
    persist.ts     relecture défensive de l'état sauvegardé
  storage.ts     accès à localStorage (protégé par try/catch)
  App.tsx        état de l'application et actions
  ui/            écrans et composants (Preact)
  styles.css     styles, repris de la maquette
  sw-template.js service worker (la liste des fichiers est injectée au build)
tests/           tests unitaires
e2e/             partie complète automatisée
design/          maquette validée de référence
scripts/         génération des icônes PNG (npm run icons)
```

Stack : Vite + TypeScript + [Preact](https://preactjs.com) (3 Ko), polices Playfair
Display et Manrope embarquées (`@fontsource`) pour marcher hors ligne.

## Règles par défaut

Toutes réglables dans l'onglet Réglages, et affichées avec les valeurs en cours dans
l'onglet Règles.

- 3 à 8 joueurs, 100 jetons chacun au départ.
- Chaque joueur est croupier pendant 5 donnes, puis la main passe à gauche.
  Une manche = tout le monde a été croupier une fois. 3 manches.
- Le croupier tire jusqu'à 16 et reste à 17. Blackjack payé 3 contre 2, arrondi au
  jeton supérieur. Pas d'assurance, un seul split par main.
- Mises : 2 à 10 (manche 1), 4 à 20 (manche 2), 6 à 30 (manche 3).
- Recave : 30 jetons, malus de 50.
- 3 défis joueurs et 1 défi croupier toujours en jeu ; un défi ne sort qu'une fois.
- Fin de manche : chacun prend ses gains de défis ou rembourse ses malus ; ce qui
  n'est pas payé est reporté.
- Score final : jetons comptés + non réglé + 10 au roi du blackjack (ex æquo compris).
- Championnat : 10 / 7 / 5 / 3 / 1 points selon la place.

Seuls les points du championnat (10 / 7 / 5 / 3 / 1) sont fixes : ils se changent dans
`src/game/defaults.ts`.
