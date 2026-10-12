# Brief — version jouable dans le navigateur de « Blackjack entre potes »

Ce document sert de point de départ à une nouvelle session de travail. Il résume
ce qui existe déjà (session du 30/09/2026) et cadre le prochain chantier :
une version du jeu **jouable directement dans le navigateur**, avec des cartes et
des jetons virtuels.

## 1. Ce qui existe : l'application « compagnon »

Application web pour animer une soirée blackjack entre amis **avec de vraies
cartes et de vrais jetons**. Un téléphone ou une tablette posé au milieu de la
table remplace les cartes défis imprimées et la feuille de score. Elle ne suit
**pas** les mises ni les mains : les joueurs jouent en vrai et saisissent
seulement les événements (blackjack, recave, défi réussi).

- **Dossier local** : `~/Developer/blackjack-potes` (aucun lien avec Dooka /
  `pmu_finder`, même si la session précédente a été lancée depuis ce dossier).
- **Dépôt** : `chefdorv/blackjack` (public, branche `main`, créé par Valentin).
  Arbre propre, 2 commits : `39c758e` (l'application) et `99c9911` (e2e sur le
  site en ligne). `version` 1.0.0 dans `package.json`.
- **En ligne** : https://blackjack.dooka.fr
  - GitHub Pages en mode **GitHub Actions** : `.github/workflows/pages.yml` lance
    `npm ci`, `npm test`, `npm run build`, puis déploie `dist/` à chaque push sur `main`.
  - DNS chez OVH (zone `dooka.fr`) : `CNAME blackjack → chefdorv.github.io.`
    (ajouté par Valentin). HTTPS forcé, certificat approuvé.
  - Caché des moteurs : `<meta name="robots" content="noindex, nofollow">` +
    `public/robots.txt` (`Disallow: /`). `public/CNAME` contient le domaine.
  - Piège connu : changer le mode de publication Pages (`build_type`) **efface le
    domaine personnalisé** ; le remettre juste après (`gh api -X PUT
    repos/chefdorv/blackjack/pages -f cname=blackjack.dooka.fr`).
- **Maquette validée** : `design/maquette-blackjack.html` (format « Design
  Component » avec templates `{{…}}`). C'est la référence visuelle : feutre vert en
  dégradé radial, or `#e2b85a`, texte crème `#f6f1e3`, Playfair Display (titres,
  gros chiffres) + Manrope (texte), cartes défis au dos bordeaux et doré qui se
  retournent en 3D, podium animé avec jetons en confettis.
- Une ancienne démo en Artifact (https://claude.ai/artifact/LsFwYC97aCNNc4M3N2q67L)
  n'a plus d'utilité depuis la mise en ligne.

### Stack et organisation

Vite 8 + TypeScript 7 (strict, pas de `any`) + Preact 11, Vitest 5, polices
embarquées via `@fontsource` (pour le hors-ligne), playwright-core pour l'e2e
(utilise le Chrome installé sur le Mac, aucun navigateur téléchargé).

```
src/game/      logique pure, sans interface, entièrement testée
  types.ts       Settings, Player, Game, Challenge, Night…
  defaults.ts    réglages et 24 défis par défaut, niveaux/couleurs, points du championnat
  settings.ts    modifier/borner les réglages (fixBets garantit min ≤ max, prolonge les mises)
  game.ts        createGame, advance (donne → croupier suivant → fin de manche), turnInfo,
                 finishSettling, endGame, addBlackjack, addRebuy, adjustPlayer, setFinalCount
  challenges.ts  fillChallenges (tirage sans remise, par type joueur/croupier),
                 claimChallenge (gain + remplacement du même type), flipCard, poolRemaining
  scoring.ts     pending (gains défis − malus recave − déjà réglé), settlePlayer/settleAll,
                 blackjackKings, rankWithTies, liveRanking, finalRanking, buildNight,
                 championshipStandings (noms insensibles à la casse, départage aux victoires)
  history.ts     pile d'annulation (60 instantanés de Game)
  names.ts       saisie des joueurs (16 car. max, pas de doublon, 3 à 8)
  persist.ts     relecture défensive de tout ce qui vient de localStorage
src/storage.ts   accès localStorage dans des try/catch (clé `bj-soiree-potes-v1`)
src/App.tsx      état global + actions (act() = action annulable, quiet() = sans historique)
src/ui/          écrans Preact : SetupScreen, GameScreen (+ CorrectSheet), DefisScreen
                 (+ ClaimDialog), EndScreens (règlement, décompte, podium), InfoScreens
                 (classement, règles), SettingsScreen, common (Dialog, Stepper, ConfirmDialog)
src/styles.css   CSS de la maquette + ajustements en fin de fichier
src/sw-template.js  service worker ; vite.config.ts y injecte la liste des fichiers et une version
tests/           38 tests unitaires (rotation, défis, scores, championnat, sauvegarde…)
e2e/partie-complete.mjs  partie complète jouée dans Chrome (3 joueurs, 1 manche, 1 donne)
scripts/make-icons.mjs   icônes PWA générées depuis public/icon.svg
```

Toute action de partie fonctionne sur des copies : les fonctions de `src/game/`
prennent un `Game` et renvoient un nouveau `Game`, avec un générateur aléatoire
injecté (`Rng`) pour des tests déterministes.

### Règles de la soirée (valeurs par défaut, réglables dans l'onglet Réglages)

- 3 à 8 joueurs, 100 jetons de départ.
- Croupier tournant : chaque joueur est croupier pendant 5 donnes, puis la main passe
  au joueur suivant dans l'ordre de la table. Une manche = tout le monde a été
  croupier une fois. 3 manches.
- Le croupier tire jusqu'à 16 et reste à 17. Blackjack payé 3 contre 2, arrondi au
  jeton supérieur. Pas d'assurance, un seul split par main.
- Mises : 2–10 (manche 1), 4–20 (manche 2), 6–30 (manche 3).
- Recave : un joueur à 0 reprend 30 jetons, malus de 50.
- Défis : 3 défis joueurs + 1 défi croupier toujours en jeu, remplacés par un défi du
  même type quand ils sont réclamés ; un défi ne sort qu'une fois par partie ; le défi
  croupier n'est réclamable que par le croupier en cours.
- Fin de manche : chacun prend ses gains de défis à la banque ou rembourse ses malus ;
  ce qui n'est pas payé est reporté.
- Score final : jetons comptés + non réglé + 10 au « roi du blackjack » (le plus de
  blackjacks ; tous en cas d'égalité ; personne si aucun).
- Championnat : 10 / 7 / 5 / 3 / 1 points selon la place (constante dans
  `defaults.ts`, pas réglable dans l'app).

Les 24 défis par défaut sont dans `src/game/defaults.ts` (5 faciles à +5, 7 moyens
à +10/+15, 6 difficiles à +20/+30, 2 légendaires à +40/+75, 4 croupier à +10/+40).

### Choix et corrections faits pendant la première session

- « Modifier le décompte » après un enregistrement au championnat propose « Mettre à
  jour la soirée » au lieu d'enregistrer la soirée une seconde fois (défaut de la maquette).
- Le lien partie ↔ soirée enregistrée survit à « Annuler » (pas de double enregistrement).
- Les défis croupier doivent être réclamés avant de passer au croupier suivant.
- Mouvement réduit : animations coupées, podium visible tout de suite, confettis masqués.
- Défauts trouvés sur captures et corrigés : icône Annuler sans taille, tableau final
  qui débordait sur téléphone, noms en petites majuscules dans ce tableau.

### Vérifier

Depuis `~/Developer/blackjack-potes` :

```bash
npm test                                         # 38 tests unitaires
npm run typecheck
npm run build && npm run e2e                     # partie complète en local
E2E_URL=https://blackjack.dooka.fr/ npm run e2e  # même partie sur le site en ligne
```

Dernier passage : tout vert, en local et en ligne (y compris rechargement hors ligne).

## 2. Le nouveau chantier : jouer au blackjack dans le navigateur

Objectif exprimé par Valentin : « une version du jeu jouable directement sur le
navigateur ». Concrètement, les cartes, les mains, les mises et les jetons deviennent
virtuels, alors que l'application actuelle suppose de vrais jeux de cartes.

### Ce qui se réutilise tel quel

- Toute l'identité visuelle et les composants (dos de carte, retournement 3D, podium,
  bandeau du croupier, barre de navigation, toasts, panneaux).
- La structure de partie (`advance`, manches, croupier tournant, mises par manche),
  les défis (tirage, remplacement, réservation au croupier), le règlement, le
  classement, le championnat, l'annulation, la sauvegarde, la PWA, la chaîne de
  publication.

### Ce qui change de nature

- **Un moteur de blackjack pur** à écrire dans `src/game/` : sabot mélangé
  (nombre de jeux à décider), valeur des mains (As à 1 ou 11, mains « souples »),
  actions tirer / rester / doubler / splitter (un seul split, cas des As), jeu
  automatique du croupier (tire jusqu'à 16, reste à 17), blackjack payé 3:2 arrondi
  au jeton supérieur, égalités, pas d'assurance. Testé comme le reste.
- **Les tas de jetons sont suivis** : mises saisies dans l'app, bornées par les
  mises de la manche, gains et pertes calculés. La recave devient automatique à 0
  jeton. Le « décompte final » n'a plus besoin de saisie.
- **Les défis peuvent être validés automatiquement** : le moteur voit les mains, donc
  « 21 avec 3 cartes », « gagner après avoir doublé », « 7-7-7 », « paire de départ de
  même couleur », « 3 mains d'affilée », « deux blackjacks dans la même manche »,
  « battre tous les joueurs », « ne perdre aucune donne sur tes donnes de
  croupier »… sont tous détectables. Le bouton « Réclamer » peut disparaître ou
  rester en secours.
- **Le rôle du croupier** : en virtuel, le croupier joue selon une règle fixe. Il
  faut décider si le croupier reste un joueur humain qui tourne (il ne mise pas,
  il encaisse et paie, il a ses défis) ou si c'est la banque/l'ordinateur.

### Décisions à prendre avec Valentin avant de coder

Les poser en début de session (avec une recommandation pour chacune) :

1. **Qui joue, et sur quel appareil ?**
   - un seul appareil qu'on se passe autour de la table (le plus simple, reste
     100 % statique) ;
   - chacun sur son téléphone (demande un serveur temps réel : par exemple Supabase
     Realtime, que Valentin utilise déjà sur ses autres projets — mais ce serait une
     base à part, pas celle de Dooka) ;
   - en solo contre des joueurs gérés par l'ordinateur.
2. **Le croupier** : un joueur humain qui tourne comme dans la version compagnon,
   ou un croupier automatique (et alors que deviennent les défis croupier ?).
3. **Où vit la version jouable** : un mode de plus dans la même application (choix
   au lancement : « Avec de vraies cartes » / « Tout dans l'app »), ou une seconde
   application sur un autre sous-domaine (un nouveau dépôt, car GitHub Pages ne sert
   qu'un domaine par dépôt).
4. **Paramètres de jeu absents jusqu'ici** : nombre de jeux de cartes dans le sabot,
   croupier qui reste ou tire sur 17 souple, doubler après un split, re-split interdit
   (déjà « un seul split »), ce qui se passe en cas de blackjack du croupier.
5. **Rythme et lisibilité** : animation de distribution des cartes, vitesse du jeu
   du croupier, tout le monde regarde le même écran ou chacun cache ses cartes.

Ma recommandation de départ, à valider : un **mode « Tout dans l'app » dans la même
application**, sur **un seul appareil passé de main en main**, croupier humain
tournant joué automatiquement par l'app selon la règle 16/17, et défis validés
automatiquement. Ça garde le site statique, réutilise presque tout le code, et
laisse le multi-appareils pour une étape suivante.

### Décisions prises avec Valentin (12/10/2026)

1. **Appareils** : chacun sur son téléphone. Un téléphone peut tenir une ou
   plusieurs places ; un seul téléphone avec tous les joueurs = l'appareil partagé,
   qui marche sans réseau.
2. **Croupier** : les deux modes, au choix au lancement de la partie :
   - *croupier tournant* : chaque joueur est croupier 5 donnes, ne mise pas, paie et
     encaisse avec son propre tas ; l'app joue ses cartes (règle 16/17) ; les défis
     croupier restent, détectés automatiquement ;
   - *banque automatique* : réserve infinie, tout le monde mise à chaque donne ;
     une manche = 5 donnes × nombre de joueurs (même durée), 3 manches ; les défis
     croupier sont retirés du tirage.
3. **Emplacement** : un mode de plus dans la même application (blackjack.dooka.fr),
   choix « Avec de vraies cartes » / « Tout dans l'app » au lancement.
4. **Règles « à l'européenne »** (modifiables dans Réglages) : sabot de 6 jeux
   remélangé aux 3/4, le croupier reste sur 17 souple, doubler sur 2 cartes y compris
   après un split, un seul split, deux As splittés = une carte chacun. Le croupier ne
   prend sa seconde carte qu'après les joueurs : s'il fait blackjack, les mises
   doublées ou splittées sont perdues en entier (un blackjack joueur fait égalité).
5. **Affichage** : chaque téléphone montre toute la table, cartes face visible, sa
   propre main mise en avant. Distribution animée (~0,3 s par carte), croupier carte
   par carte (~0,8 s), bouton « Accélérer » ; animations coupées en mouvement réduit.
6. **Réseau** : un téléphone hôte fait tourner le moteur ; les autres rejoignent avec
   un code à 4 lettres et échangent par Supabase Realtime (canal de messages, aucune
   table, aucun compte). Si l'hôte s'absente, la partie attend et reprend. Finalement
   sur le projet Supabase de Dooka (décision du 12/10/2026 : pas de projet en plus, pas de
   mise en pause pour inactivité ; la clé publique passe par les variables du dépôt).

Ordre de travail retenu : moteur pur et tests → branchement sur la partie (tas,
recave automatique, deux modes de croupier, défis détectés) → écran de table sur un
seul appareil (aperçu Artifact) → couche réseau hôte/invités → e2e.

### Contraintes à garder

- Français partout dans l'interface. Pas d'emoji ; icônes SVG inline ; symboles
  ♠ ♥ ♦ ♣ autorisés (et désormais indispensables pour dessiner les cartes).
- Accessibilité : vrais `<button>`, `<label>` sur chaque champ, cibles ≥ 48 px,
  contrastes suffisants, `prefers-reduced-motion` respecté, focus visible.
- Téléphone en portrait d'abord, tablette bien exploitée ; jamais de défilement horizontal.
- Logique de jeu pure, séparée de l'interface, avec tests unitaires (moteur de
  blackjack compris : valeurs de mains, croupier, paiements, split, double).
- Sauvegarde de tout l'état dans localStorage, accès protégés par try/catch ; une
  partie en cours survit à un rechargement.
- Étendre `e2e/partie-complete.mjs` (ou en ajouter un second) pour jouer une partie
  virtuelle complète, avec un sabot truqué injecté pour des résultats prévisibles.

## 3. Façon de travailler avec Valentin

- Répondre en français.
- Pour toute action de son côté : étapes numérotées, commande exacte et dossier d'où
  la lancer, chemin exact dans les interfaces web, résultat attendu et quoi faire
  sinon ; expliquer les sigles. Il ne faut jamais supposer qu'il connaît la manipulation.
- Il juge le visuel en le voyant : pour un écran ou une animation, publier un aperçu
  (Artifact) et le republier sur la même adresse à chaque retouche ; proposer des
  variantes côte à côte avec un libellé court quand il hésite.
- Pas de simulateur iOS/Android sur sa machine : vérifier dans Chrome à taille de
  téléphone et dire ce qui reste à confirmer sur un vrai appareil.
- Ne commiter et ne pousser que quand il le demande ; pousser sur `main` publie le
  site en ligne.
