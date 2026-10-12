// Partie « Tout dans l'app » jouée dans un vrai Chrome, avec un sabot truqué pour des donnes prévisibles,
// puis une partie à deux téléphones simulés (deux onglets reliés par le canal local du navigateur).
// Usage : npm run build && npm run e2e:virtuel   (captures d'écran dans e2e/captures/)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4180;
const URL = process.env.E2E_URL ?? `http://localhost:${PORT}/`;
const OUT = 'e2e/captures';
const KEY = 'bj-soiree-potes-v1';
mkdirSync(OUT, { recursive: true });

const server = process.env.E2E_URL ? null : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
if (server)
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
    server.on('exit', (c) => reject(new Error('vite preview arrêté : ' + c)));
    setTimeout(() => reject(new Error('vite preview ne démarre pas')), 15000);
  });

const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;
const errors = [];

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function step(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
  } catch (e) {
    failures++;
    console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n')[0]);
  }
}
function watch(page, tag = '') {
  page.on('pageerror', (e) => errors.push(tag + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(tag + m.text()));
}

/** Remplace le sabot et les défis de la partie sauvegardée, puis recharge. */
async function rig(page, cards, current, key = KEY) {
  // La sauvegarde est écrite juste après l'affichage : on l'attend avant de la modifier.
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.game?.virtual, key);
  await page.evaluate(
    ({ cards, current, key }) => {
      const s = JSON.parse(localStorage.getItem(key));
      s.game.virtual.shoe = { cards, size: cards.length, decks: 0 };
      s.game.current = current;
      s.game.flipped = current;
      s.game.drawn = current;
      localStorage.setItem(key, JSON.stringify(s));
    },
    { cards, current, key },
  );
  await page.reload();
}

const flat = (t) => t.replace(/\s+/g, ' ').trim();

try {
  // Mouvement réduit : pas d'animation, les résultats s'affichent tout de suite.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: 'fr-FR', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  watch(page);
  const btn = (name, opts = {}) => page.getByRole('button', { name, exact: true, ...opts });
  const nav = (label) => page.locator('.nav-btn', { hasText: label }).click();
  const seat = (name) => page.locator('.seat-card', { has: page.locator('.seat-name', { hasText: name }) });
  const recap = () => page.locator('.recap').innerText().then(flat);
  const noHScroll = async (where) => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(w[0] <= w[1], `défilement horizontal sur ${where} (${w[0]} > ${w[1]})`);
  };

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('Réglages et création');
  await step('20 jetons, 1 manche, 1 donne par croupier', async () => {
    await nav('Réglages');
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Diminuer Jetons de départ' }).click();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Diminuer Nombre de manches' }).click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Diminuer Donnes par croupier' }).click();
    check((await page.getByLabel('Jetons de départ', { exact: true }).inputValue()) === '20', 'jetons ≠ 20');
    check((await page.getByLabel('Jeux de cartes dans le sabot', { exact: true }).inputValue()) === '6', 'sabot ≠ 6 jeux');
    check((await page.getByLabel('Carte cachée du croupier').inputValue()) === 'europeenne', 'règle européenne attendue');
    await noHScroll('Réglages');
  });
  await step('mode « Tout dans l’app », croupier tournant, 2 joueurs suffisent', async () => {
    await nav('Table');
    await page.getByText("Tout dans l'app").click();
    check(await page.getByRole('radio', { name: /Croupier tournant/ }).isChecked(), 'croupier tournant par défaut');
    const input = page.getByLabel('Nom du joueur');
    for (const n of ['Alice', 'Bob']) {
      await input.fill(n);
      await input.press('Enter');
    }
    check(await btn('Lancer la partie').isEnabled(), 'lancer inactif à 2 joueurs');
    await page.screenshot({ path: `${OUT}/v01-creation.png`, fullPage: true });
    await btn('Lancer la partie').click();
    check(flat(await page.locator('.dz-name').innerText()) === 'Alice', 'Alice croupier');
    check((await page.locator('.seat-card').count()) === 1, 'le croupier ne doit pas avoir de siège');
    await rig(page, ['5♠', '10♥', '6♦', '10♣', '7♠', '8♥', '9♠', '8♦', '10♣', 'K♦', '10♠', '2♣', '3♣', '4♣'], ['c1', 'c21']);
    await page.screenshot({ path: `${OUT}/v02-mises.png`, fullPage: true });
  });

  console.log('Donne 1 : Bob double et gagne, Alice croupier se recave');
  await step('mise bornée par la manche', async () => {
    const bet = page.locator('.bet-panel').getByLabel('Bob', { exact: true });
    await bet.fill('50');
    await bet.press('Tab');
    check((await bet.inputValue()) === '10', 'mise non bornée à 10 : ' + (await bet.inputValue()));
    await btn('Distribuer').click();
    check((await page.locator('.dock').innerText()).includes('À Bob'), 'pas au tour de Bob');
    check(await btn('Splitter').isDisabled(), 'split permis sur 5-6');
    check(flat(await seat('Bob').locator('.stack-v').innerText()) === '10', 'tas de Bob pendant la donne (mise posée)');
    await page.screenshot({ path: `${OUT}/v03-jeu.png` });
  });
  await step('rechargement en pleine donne', async () => {
    await page.reload();
    check((await page.locator('.dock').innerText()).includes('À Bob'), 'tour perdu au rechargement');
    check((await seat('Bob').locator('.pc').count()) === 2, 'cartes perdues');
  });
  await step('doubler, défi validé tout seul, recave automatique du croupier', async () => {
    await btn('Doubler').click();
    const r = await recap();
    check(r.includes('Bob réussit « Gagner une main après avoir doublé. » : +5 jetons'), 'défi non validé : ' + r);
    check(r.includes('Alice est à sec : recave de 30 jetons, malus −50'), 'recave absente : ' + r);
    check(flat(await seat('Bob').locator('.out').innerText()) === 'Gagné +20', 'résultat de Bob');
    check(flat(await seat('Bob').locator('.stack-v').innerText()) === '45', 'tas de Bob : 20 + 20 + 5');
    check(flat(await page.locator('.dealer-zone .stack-v').innerText()) === '30', 'tas d’Alice après recave');
    check((await page.locator('.mini-defi', { hasText: 'après avoir doublé' }).count()) === 0, 'défi toujours sur la table');
    check((await page.locator('.mini-defi').count()) === 4, 'table des défis non complétée');
    await noHScroll('bilan de donne');
    await page.screenshot({ path: `${OUT}/v04-bilan-donne.png`, fullPage: true });
  });

  console.log('Donne 2 : Bob croupier, Alice splitte et perd tout');
  await step('le croupier tourne', async () => {
    await btn('Croupier suivant : Bob').click();
    check(flat(await page.locator('.dz-name').innerText()) === 'Bob', 'Bob croupier');
    // les défis tirés en remplacement sont remplacés par des défis neutres pour une donne prévisible
    await page.evaluate((key) => {
      const s = JSON.parse(localStorage.getItem(key));
      s.game.current = s.game.current.filter((c) => c === 'c21').concat(['c9', 'c16', 'c19']);
      s.game.flipped = s.game.current;
      localStorage.setItem(key, JSON.stringify(s));
    }, KEY);
    await page.reload();
    const bet = page.locator('.bet-panel').getByLabel('Alice', { exact: true });
    await bet.fill('10');
    await bet.press('Tab');
    await btn('Distribuer').click();
  });
  await step('splitter une paire, défi croupier pour Bob', async () => {
    check(await btn('Splitter').isEnabled(), 'split refusé sur 8-8');
    await btn('Splitter').click();
    check((await page.locator('.seat-card .hand').count()) === 2, 'deux mains attendues');
    check((await page.locator('.dock').innerText()).includes('main 1'), 'main 1 en cours');
    await btn('Rester').click();
    await btn('Rester').click();
    const r = await recap();
    check(r.includes('Bob réussit « Battre tous les joueurs sur une même donne. » : +10 jetons'), 'défi croupier : ' + r);
    check(r.includes('Alice −20'), 'perte d’Alice : ' + r);
    await page.screenshot({ path: `${OUT}/v05-split.png`, fullPage: true });
  });

  console.log('Fin de partie');
  await step('bilan de manche sans rien à saisir', async () => {
    await btn('Fin de manche : le bilan').click();
    check((await page.locator('h1').innerText()) === 'Le bilan', 'écran de bilan');
    const rows = (await page.locator('.panel .set-row').allInnerTexts()).map(flat);
    check(rows[0].startsWith('Alice') && rows[0].endsWith('10'), 'ligne Alice : ' + rows[0]);
    check(rows[1].startsWith('Bob') && rows[1].endsWith('75'), 'ligne Bob : ' + rows[1]);
    await page.screenshot({ path: `${OUT}/v06-bilan-manche.png`, fullPage: true });
  });
  await step('podium : tas − malus, pas de décompte à saisir', async () => {
    await btn('Voir le podium').click();
    const rows = (await page.locator('.tbl tbody tr').allInnerTexts()).map(flat);
    check(rows[0] === '1 Bob 75 0 0 0 75', 'ligne 1 : ' + rows[0]);
    check(rows[1] === '2 Alice 10 −50 0 0 −40', 'ligne 2 : ' + rows[1]);
    check((await page.locator('.tbl thead').innerText()).includes('MALUS'), 'colonne Malus');
    check((await btn('Modifier le décompte').count()) === 0, 'décompte modifiable en virtuel');
    await btn('Enregistrer au championnat').click();
    await page.screenshot({ path: `${OUT}/v07-podium.png`, fullPage: true });
  });
  await step('revanche dans le même mode', async () => {
    await btn('Revanche').click();
    await btn('Oui').click();
    check((await page.locator('.dealer-zone').count()) === 1, 'la revanche n’est pas virtuelle');
    check(flat(await page.locator('.dz-name').innerText()) === 'Alice', 'la revanche repart avec Alice croupier');
  });
  await step('règles du mode virtuel', async () => {
    await nav('Règles');
    const txt = await page.locator('.rules').nth(1).innerText();
    check(txt.includes('6 jeux') && txt.includes('européenne'), 'règles virtuelles : ' + txt.slice(0, 80));
  });
  await step('aucune erreur dans la console', async () => check(errors.length === 0, errors.join(' | ')));
  await ctx.close();

  console.log('Animations');
  await step('distribution carte par carte, puis « Accélérer »', async () => {
    const actx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'fr-FR', serviceWorkers: 'block' });
    const p = await actx.newPage();
    watch(p, 'anim ');
    await p.goto(URL);
    await p.getByText("Tout dans l'app").click();
    await p.getByText('Banque automatique').click();
    await p.getByLabel('Nom du joueur').fill('Zoé');
    await p.getByLabel('Nom du joueur').press('Enter');
    await p.getByRole('button', { name: 'Lancer la partie' }).click();
    check(flat(await p.locator('.dz-name').innerText()) === 'La banque', 'banque automatique');
    await p.getByRole('button', { name: 'Distribuer' }).click();
    await p.waitForTimeout(100);
    const early = await p.locator('.pc').count();
    check(early < 3, 'toutes les cartes posées d’un coup : ' + early);
    await p.getByRole('button', { name: 'Accélérer' }).click();
    check((await p.locator('.pc').count()) >= 3, 'cartes manquantes après Accélérer');
    await actx.close();
  });

  console.log('Deux téléphones');
  await step('l’hôte ouvre une salle, l’invité la rejoint avec le lien', async () => {
    const mctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'fr-FR', serviceWorkers: 'block', reducedMotion: 'reduce' });
    const A = await mctx.newPage();
    const B = await mctx.newPage();
    watch(A, 'hôte ');
    watch(B, 'invité ');
    const base = URL + (URL.includes('?') ? '&' : '?') + 'reseau=local';
    await A.goto(base + '&appareil=a');
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.getByText("Tout dans l'app").click();
    await A.getByLabel('Nom du joueur').fill('Alice');
    await A.getByLabel('Nom du joueur').press('Enter');
    await A.getByRole('button', { name: 'Ouvrir une salle pour les autres téléphones' }).click();
    const code = (await A.locator('.room-code').getAttribute('aria-label')).replace(/[^A-Z]/g, '').slice(-4);
    check(/^[A-Z]{4}$/.test(code), 'code de salle : ' + code);
    await A.screenshot({ path: `${OUT}/v08-salle-hote.png`, fullPage: true });

    await B.goto(base + '&appareil=b&salle=' + code);
    check((await B.getByLabel(/Code de la salle/).inputValue()) === code, 'code non prérempli');
    await B.getByLabel('Votre prénom').fill('alice');
    await B.getByLabel('Votre prénom').press('Enter');
    await B.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await B.waitForSelector('.hint-err', { timeout: 8000 });
    check((await B.locator('.hint-err').innerText()).includes('alice'), 'doublon de nom non signalé');
    await B.getByRole('button', { name: 'Quitter la salle' }).click();
    await B.getByRole('button', { name: 'Oui' }).click();

    await B.goto(base + '&appareil=b&salle=' + code);
    await B.getByLabel('Votre prénom').fill('Bob');
    await B.getByLabel('Votre prénom').press('Enter');
    await B.getByRole('button', { name: 'Rejoindre', exact: true }).click();
    await A.waitForFunction(() => document.querySelectorAll('.setup-name').length === 2, null, { timeout: 8000 });
    check(flat(await A.locator('.setup-row').nth(1).innerText()).includes('Bob autre téléphone'), 'Bob absent de la salle');
    await B.screenshot({ path: `${OUT}/v09-salle-invite.png`, fullPage: true });

    await A.getByRole('button', { name: 'Lancer la partie' }).click();
    await B.waitForSelector('.dealer-zone', { timeout: 8000 });
    check((await A.locator('.bet-panel').innerText()).includes('En attente de Bob'), 'l’hôte devrait attendre Bob');
    check((await B.locator('.seat-card.is-mine').count()) === 1, 'siège de Bob non marqué');

    // Bob mise depuis son téléphone : l'hôte le voit.
    await B.getByRole('button', { name: 'Miser un jeton de plus pour Bob' }).click();
    await A.waitForFunction(() => document.querySelector('.seat-card')?.textContent?.includes('Choisit sa mise'), null, { timeout: 5000 });
    await B.getByRole('button', { name: 'Distribuer' }).click();
    await A.waitForSelector('.pc', { timeout: 8000 });
    const turn = await A.locator('.dock').innerText().catch(() => '');
    if (turn.includes('À Bob')) {
      check(turn.includes('réfléchit sur son téléphone'), 'l’hôte ne doit pas jouer pour Bob');
      check((await A.getByRole('button', { name: 'Rester', exact: true }).count()) === 0, 'boutons de Bob chez l’hôte');
      await B.screenshot({ path: `${OUT}/v10-invite-joue.png` });
      await B.getByRole('button', { name: 'Rester', exact: true }).click();
    }
    await A.waitForSelector('.recap', { timeout: 8000 });
    await B.waitForSelector('.recap', { timeout: 8000 });
    const tasA = await A.locator('.stack-v').allInnerTexts();
    const tasB = await B.locator('.stack-v').allInnerTexts();
    check(tasA.join() === tasB.join(), `tas différents : ${tasA} / ${tasB}`);

    // L'invité recharge : il retrouve la table.
    await B.reload();
    await B.waitForSelector('.recap', { timeout: 8000 });
    check((await B.locator('.room-bar').innerText()).includes('Salle ' + code), 'bandeau de salle');

    // L'hôte ferme la salle : l'invité est prévenu, la partie continue chez l'hôte.
    await A.getByRole('button', { name: 'Fermer la salle' }).click();
    await A.getByRole('button', { name: 'Oui' }).click();
    await B.waitForSelector('text=Salle fermée', { timeout: 8000 });
    check((await A.locator('.dealer-zone').count()) === 1, 'la partie de l’hôte a disparu');
    await mctx.close();
  });
  await step('aucune erreur dans la console (animations, deux téléphones)', async () => check(errors.length === 0, errors.join(' | ')));
} finally {
  await browser.close();
  server?.kill();
}

console.log(failures ? `\n${failures} étape(s) en échec` : '\nPartie virtuelle : tout est bon');
process.exit(failures ? 1 : 0);
