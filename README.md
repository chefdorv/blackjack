# Blackjack entre potes

Application web mobile pour animer une soirée blackjack entre amis, façon jeu de société,
sans argent. Deux façons de jouer, au choix sur l'écran de création :

- **Avec de vraies cartes** : cartes et jetons sur la table ; l'application remplace les
  cartes défis à imprimer et la feuille de score. Un seul téléphone ou une tablette est
  posé au milieu de la table.
- **Tout dans l'app** : cartes, mises et jetons virtuels. Croupier tournant (chacun paie la
  table avec ses jetons, l'application tire ses cartes) ou banque automatique. Les défis
  sont validés automatiquement. Sur un seul appareil qu'on se passe, ou à plusieurs
  téléphones (voir plus bas).

- Croupier tournant, manches, mises par manche
- Cartes défis tirées au hasard, retournées d'un geste, réclamées par le premier qui réussit
- Recaves, blackjacks, règlement de fin de manche avec report de ce qui n'est pas payé
- Décompte final, podium animé, championnat sur plusieurs soirées
- Bouton « Annuler » sur les 60 dernières actions
- Tout est sauvegardé dans le navigateur : fermer ou recharger la page ne fait rien perdre
- Installable sur l'écran d'accueil (PWA) et utilisable hors ligne

Site 100 % statique : pas de serveur, pas de compte. Seul le jeu à plusieurs téléphones
passe par un canal temps réel Supabase, celui du projet de Dooka (aucune table, aucune
donnée enregistrée).

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

`npm run e2e:virtuel` joue une partie « Tout dans l'app » avec un sabot truqué (double,
split, défis validés, recave du croupier, bilan, podium), vérifie l'animation de
distribution, puis une partie à deux téléphones simulés par deux onglets.

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

## Jouer en ligne, chacun sur son appareil

Sur téléphone, tablette ou ordinateur (dans le navigateur). Sur l'écran de création :
**Tout dans l'app**, puis **Où joue chacun ?** → **Chacun sur le sien**, puis
**Ouvrir la salle**. L'hôte ouvre une salle (code de 4 lettres) et fait tourner la
partie ; les autres joueurs la rejoignent depuis la liste **Parties ouvertes** (en haut
de l'onglet Table), avec le code (**Rejoindre une partie**) ou avec le lien partagé, puis
misent et jouent leurs mains chacun de leur côté. Le nombre de manches et de donnes se
règle dès l'écran de création, et encore dans la salle d'attente.

- **Ouverte ou verrouillée** : une salle est ouverte par défaut, elle apparaît alors dans
  la liste **Parties ouvertes** de tous ceux qui sont sur l'écran de création. L'hôte la
  verrouille avec l'interrupteur de la salle d'attente, ou le cadenas du bandeau pendant
  la partie : elle sort de la liste et refuse les nouveaux venus, même avec le code. Ceux
  qui y sont déjà peuvent toujours revenir (rechargement, coupure réseau).
- **Arrivée en cours de partie** : le nouveau joueur regarde la table et sait quand il
  jouera ; il s'assoit au début de la manche suivante (à la partie suivante si c'était
  la dernière manche). L'hôte le voit dans un bandeau « Arrivés en cours de partie ».
- **Appareil perdu ou éteint** : si un joueur revient sur un autre appareil avec le même
  prénom, l'hôte touche **Donner la place de …** sur son siège (le bouton apparaît quand
  l'ancien appareil ne répond plus depuis 12 secondes) et choisit le nouveau, ou se
  choisit lui-même pour jouer à sa place. Jetons, défis et main en cours sont conservés.
- **Nouvelle partie** : l'hôte revient à la salle d'attente, et tous les joueurs avec lui.

Petites vibrations à chaque carte posée, sur un blackjack, quand une main gagne contre la
banque, et au début et à la fin de chaque manche (`src/haptics.ts`). Android : API
Vibration. iPhone (Safari n'a pas cette API) : un interrupteur natif caché qu'on bascule,
qui donne un retour haptique depuis iOS 18. Coupables dans Réglages → Sur cet appareil.

Les messages passent par Supabase Realtime (diffusion, sans table ni compte),
sur le projet Supabase de Dooka : les salles sont des canaux `bj-ABCD`, rien n'est écrit
dans sa base. La liste des parties ouvertes est un canal commun `bj-SALLES` où chaque
hôte d'une salle ouverte s'annonce toutes les 5 secondes (une salle muette depuis 15
secondes sort de la liste). Le verrou est appliqué par l'hôte, qui ne répond plus aux
inconnus, et par l'application de l'invité, qui ignore alors la table : c'est un verrou
entre amis, pas une protection contre quelqu'un qui écouterait le canal.

Les options n'apparaissent que si ces deux valeurs sont connues au build :

```
VITE_SUPABASE_URL=https://ybnacpzicldzsmmypupj.supabase.co
VITE_SUPABASE_KEY=sb_publishable_… (clé publique du projet)
```

- En local : fichier `.env` à la racine (exclu de git).
- Sur GitHub : variables du dépôt (**Settings** → **Secrets and variables** → **Actions** →
  onglet **Variables**), lues par `.github/workflows/pages.yml` au moment du build. La clé
  n'est volontairement pas écrite dans le code du dépôt public.

Si la clé publique du projet Dooka change, mettre à jour ces deux endroits puis republier.

Pour essayer sans Supabase, dans un même navigateur : ouvrir
`http://localhost:5173/?reseau=local&appareil=a` et
`http://localhost:5173/?reseau=local&appareil=b` dans deux onglets (chaque `appareil`
a sa propre sauvegarde, comme deux téléphones).

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
    blackjack.ts   moteur de blackjack : sabot, mains, tirer/rester/doubler/splitter, croupier, paiements
    virtual.ts     partie « Tout dans l'app » : tas, mises, recaves automatiques, enchaînement
    detect.ts      validation automatique des défis à partir des mains
    intents.ts     demandes des joueurs (miser, jouer…), appliquées localement ou par l'hôte
  net/           parties en ligne (messages, salle d'attente, annuaire des salles, transport, hook)
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
- Croupier tournant : chaque joueur est croupier pendant 3 donnes, puis la main passe
  à gauche. Une manche = tout le monde a été croupier une fois. 3 manches.
- Banque automatique : une manche = 5 donnes, quel que soit le nombre de joueurs.
- Les deux se règlent à la création de la partie (et dans Réglages).
- Le croupier tire jusqu'à 16 et reste à 17. Blackjack payé 3 contre 2, arrondi au
  jeton supérieur. Pas d'assurance, un seul split par main.
- Mises : 5 à 10 (manche 1), 10 à 20 (manche 2), 15 à 30 (manche 3).
- Recave : 30 jetons, malus de 50.
- 3 défis joueurs et 1 défi croupier toujours en jeu ; un défi ne sort qu'une fois.
- Fin de manche : chacun prend ses gains de défis ou rembourse ses malus ; ce qui
  n'est pas payé est reporté.
- Score final : jetons comptés + non réglé + 10 au roi du blackjack (ex æquo compris).
- Championnat : 10 / 7 / 5 / 3 / 1 points selon la place.

Seuls les points du championnat (10 / 7 / 5 / 3 / 1) sont fixes : ils se changent dans
`src/game/defaults.ts`.
