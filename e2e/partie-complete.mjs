// Partie complète jouée dans un vrai Chrome : 3 joueurs, 1 manche, 1 donne par croupier.
// Parcours : réglages, création, défis, recave, blackjacks, correction, annulation, rechargement,
// règlement, décompte, podium, championnat, revanche, fin anticipée, hors ligne.
// Usage : npm run build && npm run e2e   (captures d'écran dans e2e/captures/)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4179;
// E2E_URL=https://blackjack.dooka.fr/ npm run e2e pour jouer sur le site en ligne plutôt qu'en local.
const URL = process.env.E2E_URL ?? `http://localhost:${PORT}/`;
const OUT = 'e2e/captures';
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

try {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: 'fr-FR', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const nav = (label) => page.locator('.nav-btn', { hasText: label }).click();
  const btn = (name, opts = {}) => page.getByRole('button', { name, exact: true, ...opts });
  const toast = () => page.locator('.toast').innerText();
  const card = (name) => page.locator('.pcard', { has: page.locator('.pc-name', { hasText: name }) });
  const noHScroll = async (where) => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(w[0] <= w[1], `défilement horizontal sur ${where} (${w[0]} > ${w[1]})`);
  };

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('Réglages');
  await step('1 manche et 1 donne par croupier', async () => {
    await nav('Réglages');
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Diminuer Nombre de manches' }).click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Diminuer Donnes par croupier' }).click();
    check((await page.getByLabel('Nombre de manches', { exact: true }).inputValue()) === '1', 'manches ≠ 1');
    check((await page.getByLabel('Donnes par croupier', { exact: true }).inputValue()) === '1', 'donnes ≠ 1');
    check((await page.locator('.bet-edit').count()) === 1, 'une seule manche de mises attendue');
    await noHScroll('Réglages');
    await shot('01-reglages');
  });
  await step('mise min ≤ max garantie', async () => {
    const min = page.getByLabel('Mise min', { exact: true });
    await min.fill('15');
    await min.press('Tab');
    check((await page.getByLabel('Mise max', { exact: true }).inputValue()) === '15', 'max non remonté');
    await page.getByRole('button', { name: 'Diminuer la mise min de la manche 1' }).click();
    await min.fill('2');
    await min.press('Tab');
    await page.getByLabel('Mise max', { exact: true }).fill('10');
    await page.getByLabel('Mise max', { exact: true }).press('Tab');
  });

  console.log('Création de partie');
  await step('ajout, doublon refusé, réordonner, retirer', async () => {
    await nav('Table');
    const input = page.getByLabel('Nom du joueur');
    check(await btn('Lancer la partie').isDisabled(), 'lancer actif sans joueurs');
    for (const n of ['Alice', 'Bob', 'Chloé', 'Dave']) {
      await input.fill(n);
      await input.press('Enter');
    }
    await input.fill('alice');
    check(await btn('Ajouter').isDisabled(), 'doublon accepté');
    check((await page.locator('#setup-hint').innerText()).includes('déjà'), 'pas de message de doublon');
    await input.fill('');
    await btn('Monter Chloé').click();
    let order = await page.locator('.setup-name').allInnerTexts();
    check(order.join() === 'Alice,Chloé,Bob,Dave', 'ordre après montée : ' + order);
    await btn('Descendre Chloé').click();
    await btn('Retirer Dave').click();
    order = await page.locator('.setup-name').allInnerTexts();
    check(order.join() === 'Alice,Bob,Chloé', 'ordre final : ' + order);
    await noHScroll('création');
    await shot('02-creation');
  });
  await step('lancement', async () => {
    await btn('Lancer la partie').click();
    check((await toast()).includes('4 défis'), 'toast de lancement : ' + (await toast()));
    check((await page.locator('.dealer-name').innerText()) === 'Alice', 'premier croupier ≠ Alice');
    check((await page.locator('.pill-v').first().innerText()).replace(/\s/g, '') === '1/1', 'manche 1/1');
    check((await page.locator('.btn.big.gold').innerText()) === 'Croupier suivant : Bob', 'libellé du bouton');
    check((await page.locator('.notice').innerText()) === '4 cartes défis à retourner', 'bandeau des défis');
    check((await page.locator('.nav-badge').innerText()) === '4', 'badge Défis');
    check(await card('Alice').evaluate((el) => el.classList.contains('is-dealer')), 'Alice non encadrée');
    await noHScroll('tableau de bord');
    await shot('03-tableau-de-bord');
  });

  console.log('Défis');
  let poolBefore = '';
  await step('distribution face cachée, retournement, tout retourner', async () => {
    await page.locator('.notice').click();
    await page.waitForTimeout(900);
    await shot('04-defis-face-cachee');
    check((await page.locator('.flip').count()) === 4, '4 cartes attendues');
    poolBefore = await page.locator('.pool .badge').first().innerText();
    check(poolBefore === 'Pioche joueurs : 17', 'pioche joueurs : ' + poolBefore);
    await page.locator('.flip-inner').first().click();
    await page.waitForTimeout(900);
    check((await page.locator('.flip.flipped').count()) === 1, 'une carte retournée');
    check((await page.locator('.nav-badge').innerText()) === '3', 'badge à 3');
    await btn('Tout retourner').click();
    await page.waitForTimeout(900);
    check((await page.locator('.flip.flipped').count()) === 4, 'toutes retournées');
    check((await page.locator('.nav-badge').count()) === 0, 'badge encore visible');
    await noHScroll('Défis');
    await shot('05-defis-retournes');
  });
  await step('défi joueur réclamé par Bob puis remplacé', async () => {
    const text = await page.locator('.flip .front-txt').first().innerText();
    await page.locator('.claim').first().click();
    await shot('06-reclamer');
    await btn(/^Bob/).click();
    await page.waitForTimeout(700);
    check((await toast()).startsWith('Bob remporte +'), 'toast : ' + (await toast()));
    check((await page.locator('.flip').count()) === 4, 'la carte n’a pas été remplacée');
    check((await page.locator('.flip:not(.flipped)').count()) === 1, 'la nouvelle carte doit être face cachée');
    check((await page.locator('.pool .badge').first().innerText()) === 'Pioche joueurs : 16', 'pioche non décrémentée');
    check((await page.locator('.log-row').first().innerText()).includes(text), 'historique des défis');
    const texts = await page.locator('.flip .front-txt').allInnerTexts();
    check(!texts.includes(text), 'le défi réclamé est revenu');
  });
  await step('défi croupier : seul le croupier peut le réclamer', async () => {
    const last = page.locator('.flip').last();
    check((await last.locator('.front-note').innerText()) === 'Réservé au croupier : Alice', 'mention croupier');
    await last.locator('.claim').click();
    check(await btn(/^Bob/).isDisabled(), 'Bob peut réclamer le défi croupier');
    check(!(await btn(/^Alice/).isDisabled()), 'Alice ne peut pas réclamer');
    await btn(/^Alice/).click();
    await page.waitForTimeout(700);
    check((await toast()).startsWith('Alice remporte'), 'toast croupier');
    check((await page.locator('.flip').last().locator('.front-lv').textContent()) === 'Défi croupier', 'remplacé par un défi croupier');
  });

  console.log('Table');
  await step('recave avec confirmation', async () => {
    await nav('Table');
    await card('Chloé').getByRole('button', { name: 'Recave de Chloé' }).click();
    const q = await page.locator('.modal h2').innerText();
    check(q === 'Chloé est à 0 et reprend 30 jetons, malus −50 ?', 'texte de confirmation : ' + q);
    await shot('07-confirmation-recave');
    await btn('Oui').click();
    check((await card('Chloé').locator('.stack-v').innerText()) === '−50', 'à régler de Chloé');
    check((await card('Chloé').innerText()).includes('Recaves : 1'), 'badge recave');
  });
  await step('blackjacks et annulation', async () => {
    await btn('+1 blackjack pour Chloé').click();
    await btn('+1 blackjack pour Chloé').click();
    await btn('+1 blackjack pour Bob').click();
    check((await page.locator('.undo-lbl').innerText()) === 'Bob : +1 blackjack', 'libellé Annuler');
    await page.locator('.undo').click();
    check((await toast()) === 'Annulé : Bob : +1 blackjack', 'toast annuler');
    check((await card('Bob').innerText()).includes('Blackjacks : 0'), 'annulation du blackjack de Bob');
    check((await card('Chloé').innerText()).includes('Blackjacks : 2'), 'blackjacks de Chloé');
  });
  await step('corriger : panneau du bas', async () => {
    await btn('Corriger Alice').click();
    await page.waitForTimeout(400);
    await shot('08-corriger');
    await btn('Ajouter 5 jetons de défis').click();
    check((await page.locator('.sheet .stepv').nth(2).innerText()).startsWith('+'), 'valeur de défis');
    await btn('Fermer', { exact: true }).last().click();
    check((await page.locator('.sheet').count()) === 0, 'panneau non fermé');
  });
  let before = '';
  await step('rechargement : rien n’est perdu', async () => {
    before = await page.locator('.players').innerText();
    await page.reload();
    check((await page.locator('.players').innerText()) === before, 'état différent après rechargement');
    check((await page.locator('.undo').count()) === 1, 'historique perdu');
  });
  await step('rotation du croupier jusqu’au règlement', async () => {
    await btn('Croupier suivant : Bob').click();
    check((await page.locator('.dealer-name').innerText()) === 'Bob', 'croupier Bob');
    check((await toast()) === 'Bob prend la main', 'toast croupier suivant');
    await btn('Croupier suivant : Chloé').click();
    check((await page.locator('.dealer-name').innerText()) === 'Chloé', 'croupier Chloé');
    check((await page.locator('.dealer-name + .small').innerText()) === 'Dernière donne de la manche.', 'phrase dernier croupier');
    await btn('Fin de manche : on règle les comptes').click();
    check((await page.locator('h1').innerText()) === 'On règle les comptes', 'écran de règlement');
  });

  console.log('Règlement');
  await step('lignes signées et règlement partiel reporté', async () => {
    const rows = await page.locator('.panel .set-row').allInnerTexts();
    check(rows[2].includes('rend 50 jetons à la banque (recave)'), 'phrase de Chloé : ' + rows[2]);
    check(rows[1].includes('prend') && rows[1].includes('(défis)'), 'phrase de Bob : ' + rows[1]);
    check((await page.locator('.settle-amt.neg').innerText()) === '−50', 'montant rouge de Chloé');
    await noHScroll('règlement');
    await shot('09-reglement');
    await btn('Encaissé : Alice').click();
    check((await toast()).startsWith('Alice prend'), 'toast règlement');
    await page.locator('.undo').click();
    check((await btn('Encaissé : Alice').count()) === 1, 'annulation du règlement');
    await btn('Encaissé : Alice').click();
    await btn('Encaissé : Bob').click();
    check((await page.locator('.badge', { hasText: 'Réglé' }).count()) === 2, 'deux joueurs réglés');
    check((await btn('Payé : Chloé').count()) === 1, 'Chloé reste à régler');
    await btn('Passer au décompte final').click();
    check((await page.locator('h1').innerText()) === 'On compte les jetons', 'écran de décompte');
  });

  console.log('Décompte et podium');
  await step('saisie des jetons, roi du blackjack', async () => {
    check((await page.locator('.set-row', { hasText: 'Chloé' }).innerText()).includes('non réglé −50'), 'rappel non réglé de Chloé');
    check((await page.locator('.panel', { has: page.locator('h2', { hasText: 'Bonus du roi' }) }).innerText()).includes('Chloé avec 2 blackjacks'), 'roi du blackjack');
    check(await btn('Voir le podium').isDisabled(), 'podium actif trop tôt');
    await page.getByLabel('Alice', { exact: true }).fill('120');
    await btn('Plus 5 jetons pour Bob').click();
    await page.getByLabel('Bob', { exact: true }).fill('95');
    check(await btn('Voir le podium').isDisabled(), 'podium actif sans Chloé');
    for (let i = 0; i < 12; i++) await btn('Plus 5 jetons pour Chloé').click();
    await btn('Moins 5 jetons pour Chloé').click();
    check((await page.getByLabel('Chloé', { exact: true }).inputValue()) === '55', 'compteur −5/+5');
    await noHScroll('décompte');
    await shot('10-decompte');
    await btn('Voir le podium').click();
  });
  await step('podium et tableau détaillé', async () => {
    await page.waitForTimeout(3200);
    await shot('11-podium');
    const rows = await page.locator('.tbl tbody tr').allInnerTexts();
    const flat = rows.map((r) => r.replace(/\s+/g, ' ').trim());
    check(flat[0].startsWith('1 Alice 120'), 'ligne 1 : ' + flat[0]);
    check(flat[1].startsWith('2 Bob 95'), 'ligne 2 : ' + flat[1]);
    // Chloé : 55 jetons − 50 non réglé + 10 roi du blackjack = 15
    check(flat[2] === '3 Chloé 55 −50 +10 2 15', 'ligne 3 : ' + flat[2]);
    check((await page.locator('.pos1 .pod-name').innerText()) === 'Alice', 'Alice sur la 1re marche');
    check((await page.locator('.crown').count()) === 1, 'couronne');
    const tw = await page.locator('.tbl-wrap').evaluate((el) => [el.scrollWidth, el.clientWidth]);
    check(tw[0] <= tw[1], `tableau du décompte trop large (${tw[0]} > ${tw[1]})`);
    await noHScroll('podium');
  });
  await step('championnat : une seule fois, puis mise à jour', async () => {
    await btn('Enregistrer au championnat').click();
    check((await btn('Enregistrer au championnat').count()) === 0, 'bouton toujours là');
    check((await page.getByText('Soirée enregistrée au championnat.').count()) === 1, 'message enregistré');
    await nav('Classement');
    let champ = await page.locator('.panel', { hasText: 'Plusieurs soirées' }).locator('.rank-row').allInnerTexts();
    check(champ.length === 3 && champ[0].includes('Alice') && champ[0].includes('10'), 'championnat : ' + champ[0]);
    check(champ[2].includes('Chloé') && champ[2].includes('5'), 'Chloé 5 pts');
    await shot('12-championnat');
    await nav('Table');
    await btn('Modifier le décompte').click();
    await page.getByLabel('Bob', { exact: true }).fill('130');
    await btn('Voir le podium').click();
    await btn('Mettre à jour la soirée au championnat').click();
    await nav('Classement');
    champ = await page.locator('.panel', { hasText: 'Plusieurs soirées' }).locator('.rank-row').allInnerTexts();
    check(champ[0].includes('Bob') && champ[0].includes('10'), 'Bob premier après mise à jour');
    check((await page.locator('.log-row').count()) === 1, 'la soirée a été enregistrée deux fois');
  });
  await step('revanche avec les mêmes joueurs, puis fin anticipée', async () => {
    await nav('Table');
    await btn('Revanche').click();
    await btn('Oui').click();
    check((await page.locator('.dealer-name').innerText()) === 'Alice', 'revanche : croupier');
    check((await page.locator('.pc-name').allInnerTexts()).join() === 'Alice,Bob,Chloé', 'mêmes joueurs');
    check((await page.locator('.undo').count()) === 0, 'historique non remis à zéro');
    await nav('Classement');
    check((await page.locator('.rank-row').count()) === 3 + 3, 'classement en direct + championnat');
    await btn('Terminer la partie maintenant').click();
    await btn('Oui').click();
    check((await page.locator('h1').innerText()) === 'On compte les jetons', 'fin anticipée');
    check((await page.locator('.undo').innerText()).includes('Fin de partie'), 'fin de partie annulable');
    await page.locator('.undo').click();
    check((await page.locator('.dealer-name').count()) === 1, 'annulation de la fin de partie');
  });
  await step('championnat : suppression confirmée', async () => {
    await nav('Classement');
    await page.getByRole('button', { name: /^Supprimer la soirée/ }).click();
    await btn('Oui').click();
    check((await page.locator('.log-row').count()) === 0, 'soirée non supprimée');
  });
  await step('règles avec les valeurs des réglages', async () => {
    await nav('Règles');
    const txt = await page.locator('.rules').innerText();
    check(txt.includes('pendant 1 donne,') && txt.includes('1 manche par partie'), 'règles non dynamiques');
    check(txt.includes('2 à 10 jetons en manche 1'), 'mises dans les règles');
    check((await page.locator('.lv-head').count()) === 5, '5 niveaux');
    await shot('13-regles');
  });
  await step('aucune erreur dans la console', async () => check(errors.length === 0, errors.join(' | ')));
  const storageState = await ctx.storageState();
  await ctx.close();

  console.log('Tablette');
  await step('grilles élargies en 1024 × 768', async () => {
    const tctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'fr-FR', serviceWorkers: 'block', storageState });
    const p = await tctx.newPage();
    await p.goto(URL);
    await p.locator('.nav-btn', { hasText: 'Table' }).click();
    await p.screenshot({ path: `${OUT}/14-tablette-table.png`, fullPage: true });
    const cols = await p.locator('.players').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    check(cols >= 3, 'colonnes de joueurs : ' + cols);
    await p.locator('.nav-btn', { hasText: 'Défis' }).click();
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/15-tablette-defis.png`, fullPage: true });
    await tctx.close();
  });

  console.log('Mouvement réduit');
  await step('le podium s’affiche sans attendre', async () => {
    const rctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce', serviceWorkers: 'block', storageState });
    const p = await rctx.newPage();
    await p.goto(URL);
    await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('bj-soiree-potes-v1'));
      s.game.finished = true;
      s.game.revealed = true;
      s.game.players.forEach((pl, i) => (pl.final = 100 + i));
      s.tab = 'table';
      localStorage.setItem('bj-soiree-potes-v1', JSON.stringify(s));
    });
    await p.reload();
    await p.waitForTimeout(150);
    const op = await p.locator('.pos1 .pod-name').evaluate((el) => getComputedStyle(el).opacity);
    check(op === '1', 'opacité du nom du vainqueur : ' + op);
    check((await p.locator('.confetti').evaluate((el) => getComputedStyle(el).display)) === 'none', 'confettis visibles');
    await rctx.close();
  });

  console.log('Hors ligne');
  await step('l’application se recharge sans réseau', async () => {
    const octx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const p = await octx.newPage();
    await p.goto(URL);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await octx.setOffline(true);
    await p.reload();
    check((await p.locator('.brand').textContent()).replace(/\s+/g, ' ').includes('Blackjack entre potes'), 'page vide hors ligne');
    const fontOk = await p.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('900 20px "Playfair Display"');
    });
    check(fontOk, 'police Playfair indisponible hors ligne');
    await octx.close();
  });
} finally {
  await browser.close();
  server?.kill();
}

console.log(failures ? `\n${failures} étape(s) en échec` : '\nPartie complète : tout est bon');
process.exit(failures ? 1 : 0);
