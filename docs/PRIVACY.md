# Privacy notice

*Version française plus bas.*

## As a guest (the default)
VCR2 runs entirely in your browser. What you type, the files you drop and Smart fill's reading of them, the ledger, the checks, the simulation and the score stay on your device. The page loads its own configuration from the same site. Nothing else is sent, unless you turn on an AI feature with your own key (then only the text you choose goes to the AI provider you choose).

**Market data (no key).** When you are online, the page downloads one public file from this site, `data/market.json` (market figures such as interest rates, an exchange rate and company counts, each with its source). Nothing about the company you analyse is sent: it is a plain download from vcr2.app. Offline, the snapshot built into the page is used. See docs/MARKET-DATA.md.

**Market intel (live), optional.** With your own AI key, the Market intel tab asks your AI provider to search the public web about the company. What is sent is the public profile shown on that tab (name, website, what it does, sector, customers, country, known competitors) and the research task, never the documents, the ledger, the financials or the evidence form. You see the exact text and tick a box before anything is sent. The results stay in this browser (the last 10 companies) until you delete them. Your key stays in your browser and goes only to the provider you chose: the page's own security policy blocks every other address.

## If you choose to sign in
- **Stored in your account:** the structured analysis (answers, choices, evidence levels, source lines of up to 160 characters, notes, checklist, assumptions, company name, stage, model, score summary, dates, app version), your saved versions, your comparables, your preferences, your email, your sign-in method and the date you accepted the terms.
- **Never stored:** uploaded documents or their text, customer-level ledger rows or customer names (unless encrypted in Vault mode), AI keys, passwords (the sign-in service hashes them; VCR2 never sees them).
- **Where:** Supabase, in the region you chose (Europe: London; or the United States: Oregon).
- **Who can see it:** only you; database rules enforce it. The site owner sees that your account exists (email, sign-in method, dates) and counts of analyses and storage. As database administrator the owner could technically read analyses that are not in Vault mode, and does not look at them. Vault analyses are encrypted in your browser and unreadable without your passphrase or recovery key.
- **Not done:** no analytics, no tracking, no advertising, no sharing with other users, no other use of your data. Your browser keeps only what signing in and saving need: your session, your region, which account record the open analysis is, a pending sign-in for a few minutes, and your default stage.
- **Your rights:** "Download my data" and "Delete my account" are in the account menu. Deletion is immediate and complete on the server. Questions: the contact on the About page.
- **A shared computer:** tick "Don't keep me signed in", and use "Remove this analysis from this device".

---

# Avis de confidentialité

## Deal flow (workspaces)

Deal flow (`flow.html`) reads decks in your browser, as the main page does. What leaves it, and only when you set it up:
- **Google** (your choice, Settings, Google Drive and sheet): decks, reports, memos and LP documents go to your own Drive and your
  master sheet. VCR2 asks for the narrowest Drive access (`drive.file`: the files it creates and the ones you pick). The access
  token stays in the browser tab for its hour of life.
- **The intake service** (a Cloudflare Worker run for this site): it holds a founder's form submission or a forwarded e-mail
  until your team's browser reads it, then deletes it (14 days at most), relays your webhook, and sends the optional digest and
  founder acknowledgement.
- **Team workspaces** (signed in, when switched on): the workspace settings and, per company, the structured record (facts with
  short quotes, scores, statuses, notes, votes) in your account's region, visible only to the workspace's members. Never the
  decks or their text.
- LP-facing exports contain only generic fields and pass an anonymization check before they can be exported.

## En invité (par défaut)
VCR2 fonctionne entièrement dans votre navigateur. Ce que vous saisissez, les fichiers déposés et leur lecture par Smart fill, le registre clients, les contrôles, la simulation et le score restent sur votre appareil. La page charge sa propre configuration depuis le même site. Rien d'autre n'est envoyé, sauf si vous activez une fonction d'IA avec votre propre clé (seul le texte choisi part alors chez le fournisseur choisi).

**Données de marché (sans clé).** En ligne, la page télécharge un fichier public de ce site, `data/market.json` (taux d'intérêt, taux de change, nombre d'entreprises, chacun avec sa source). Rien sur l'entreprise analysée n'est envoyé : c'est un simple téléchargement depuis vcr2.app. Hors ligne, l'instantané intégré à la page est utilisé. Voir docs/MARKET-DATA.md.

**Market intel (en direct), facultatif.** Avec votre propre clé d'IA, l'onglet Market intel demande à votre fournisseur d'IA de chercher sur le web public des informations sur l'entreprise. Ce qui part : le profil public affiché sur cet onglet (nom, site, activité, secteur, clients, pays, concurrents connus) et la consigne de recherche, jamais les documents, le registre clients, les chiffres ni le formulaire. Vous voyez le texte exact et cochez une case avant tout envoi. Les résultats restent dans ce navigateur (les 10 dernières entreprises) jusqu'à ce que vous les supprimiez. Votre clé reste dans votre navigateur et ne part que chez le fournisseur choisi : la politique de sécurité de la page bloque toute autre adresse.

## Si vous choisissez de vous connecter
- **Conservé dans votre compte :** l'analyse structurée (réponses, choix, niveaux de preuve, lignes de source de 160 caractères au plus, notes, liste de contrôle, hypothèses, nom de l'entreprise, stade, modèle, résumé du score, dates, version de l'application), vos versions, vos comparables, vos préférences, votre e-mail, votre méthode de connexion et la date d'acceptation des conditions.
- **Jamais conservé :** les documents importés ni leur texte, les lignes du registre clients ni les noms de clients (sauf chiffrés en mode coffre-fort), les clés d'IA, les mots de passe (le service de connexion les hache ; VCR2 ne les voit jamais).
- **Où :** Supabase, dans la région choisie (Europe : Londres ; ou États-Unis : Oregon).
- **Qui peut voir :** vous seul ; les règles de la base l'imposent. Le propriétaire du site voit que votre compte existe (e-mail, méthode de connexion, dates) et le nombre d'analyses et l'espace utilisé. En tant qu'administrateur de la base, il pourrait techniquement lire les analyses hors coffre-fort, et ne les consulte pas. Les analyses du coffre-fort sont chiffrées dans votre navigateur et illisibles sans votre phrase de passe ou votre clé de secours.
- **Jamais fait :** aucune mesure d'audience, aucun pistage, aucune publicité, aucun partage avec d'autres utilisateurs, aucun autre usage de vos données. Le navigateur ne garde que ce qu'exigent la connexion et l'enregistrement : votre session, votre région, le lien entre l'analyse ouverte et son enregistrement, une connexion en cours pendant quelques minutes, et votre stade par défaut.
- **Vos droits :** « Download my data » et « Delete my account » sont dans le menu du compte. La suppression est immédiate et complète sur le serveur. Questions : le contact de la page À propos.
- **Ordinateur partagé :** cochez « Don't keep me signed in » et utilisez « Remove this analysis from this device ».
