# 🤖 Discord Leads Bot — Générateur de leads locaux 🇫🇷🇮🇱

Bot Discord qui trouve des businesses locaux via **Google Places API** et les poste en temps réel dans un channel Discord.
**Spécialement conçu pour les francophones en Israël** — prospection de clients sans site web.

**Nouveautés v2 :** Lead Scoring (0–100), Call Queue priorisée, Stats auto, Relances auto.

---

## ⚠️ SÉCURITÉ — À LIRE ABSOLUMENT

> **Ne partage JAMAIS ton token Discord ni ta clé Google API.**
> Si tu penses qu'un de ces secrets a fuité :
> 1. **Token Discord** → Va sur https://discord.com/developers/applications → ton app → Bot → **Reset Token**
> 2. **Clé Google** → Va sur https://console.cloud.google.com → Credentials → **Supprimer/Recréer la clé**

---

## 📋 Prérequis

- **Node.js 20+** — Télécharge sur https://nodejs.org
- **Un bot Discord** — Créé sur https://discord.com/developers/applications
- **Une clé API Google** — Avec les APIs activées :
  - ✅ Places API
  - ✅ Geocoding API

---

## 🚀 Installation (5 minutes)

### 1. Installe les dépendances
```bash
npm install
```

### 2. Configure les secrets
```bash
cp .env.example .env
```
Ouvre `.env` avec un éditeur de texte et remplis :
- `DISCORD_BOT_TOKEN` → Le token de ton bot Discord
- `GOOGLE_MAPS_API_KEY` → Ta clé API Google
- `LEADS_CHANNEL_ID` → L'ID du channel où poster les leads (clic droit sur le channel → "Copier l'identifiant")
- `CALL_CHANNEL_ID` → Salon "à appeler" pour `/update`
- `CALL_QUEUE_CHANNEL_ID` → Salon call queue pour `/call_queue`
- `STATS_CHANNEL_ID` → Salon stats automatiques
- `FOLLOWUP_CHANNEL_ID` → Salon relances automatiques
- `ASSOCIATE_USER_ID` → ID Discord de ton associé (mention auto)

### 3. Lance le bot
```bash
npm run dev
```
Tu devrais voir :
```
🚀 Démarrage du bot Discord Leads…
📦 Base de données SQLite ouverte : leads.db
✅ Tables créées / vérifiées.
🤖 Bot connecté en tant que TonBot#1234
✅ Commandes slash enregistrées avec succès !
```

---

## 🎮 Commandes disponibles

### `/help` — Aide rapide
Affiche la liste de toutes les commandes avec un résumé.
```
/help
```

### `/guide` — Tutoriel complet
**C'est LA commande pour comprendre le bot.** Explique tout pas-à-pas, avec des exemples pour Israël.
```
/guide                          → Guide complet
/guide sujet:scan               → Comment scanner
/guide sujet:nosite             → Trouver ceux sans site web
/guide sujet:franco_il          → Cibler les francophones en Israël
/guide sujet:domains            → Les domaines expliqués
/guide sujet:advanced           → Options avancées
```

---

### `/scan` — Scanner une zone
**C'est la commande principale.** Elle cherche des businesses dans une ville.

| Paramètre | Obligatoire | Description | Exemple |
|-----------|-------------|-------------|---------|
| `city` | ✅ | Ville à scanner ou coordonnées lat,lng | `Paris`, `Lyon`, `48.85,2.35` |
| `query` | ✅ | Ce que tu cherches | `coiffeur`, `boulangerie`, `garage` |
| `radius` | Non | Rayon en mètres (défaut: 2500) | `5000` |
| `domain` | Non | Catégorie pré-définie | `beauty`, `restaurant`, `auto` |
| `nosite` | Non | Ne garder que ceux SANS site web | `true` |
| `min_rating` | Non | Note Google minimum | `3.5` |
| `min_reviews` | Non | Nombre minimum d'avis | `10` |
| `country` | Non | Code pays pour biaiser la recherche | `FR`, `IL` |
| `limit` | Non | Nombre max de résultats (défaut: 60) | `100` |
| `realtime` | Non | Poster chaque lead au fil de l'eau | `true` |

**Exemples :**
```
/scan city:Netanya query:coiffeur
/scan city:Tel Aviv query:boulangerie nosite:true min_reviews:5
/scan city:Jerusalem query:restaurant domain:il_french country:IL
/scan city:32.07,34.77 query:מספרה radius:5000 limit:100 language:he
```

---

### `/scan_grid` — Scanner en grille (zone large)
Comme `/scan` mais découpe la zone en plusieurs points pour couvrir plus de terrain.
Utile quand tu veux scanner toute une ville.

| Paramètre | Obligatoire | Description | Exemple |
|-----------|-------------|-------------|---------|
| `city` | ✅ | Centre de la grille | `Marseille` |
| `query` | ✅ | Ce que tu cherches | `coiffeur` |
| `grid_km` | Non | Taille de la grille en km (défaut: 6) | `10` |
| `step_m` | Non | Distance entre les points (défaut: 1000m) | `800` |
| `radius` | Non | Rayon par point (défaut: 1200m) | `1500` |
| + mêmes filtres que `/scan` | | | |

**Exemple :**
```
/scan_grid city:Tel Aviv query:coiffeur grid_km:8 step_m:800 nosite:true
/scan_grid city:Ashdod domain:il_french grid_km:6
```

---

### `/filters_set` — Sauvegarder un preset de filtres
Sauvegarde une configuration de filtres réutilisable.

**Exemple :**
```
/filters_set name:fr_coiffeur_nosite query:coiffeur nosite:true min_reviews:10
```

### `/filters_show` — Voir les presets
```
/filters_show
/filters_show name:fr_coiffeur_nosite
```

---

### `/export` — Exporter en CSV
Exporte les leads en fichier CSV téléchargeable.

| Paramètre | Obligatoire | Description |
|-----------|-------------|-------------|
| `scope` | ✅ | `last_scan`, `all`, ou `date_range` |
| `from` | Non | Date début (YYYY-MM-DD) — pour `date_range` |
| `to` | Non | Date fin (YYYY-MM-DD) — pour `date_range` |
| `limit` | Non | Nombre max (défaut: 500) |

**Exemples :**
```
/export scope:last_scan
/export scope:all limit:1000
/export scope:date_range from:2026-01-01 to:2026-02-13
```

---

### `/status` — Voir l'état des scans
Affiche les scans en cours et l'historique récent.
```
/status
```

---

### `/call_queue` — File d'appels priorisée 🆕
Ouvre ta file d'appels : affiche UN lead à la fois, trié par **score décroissant**.

Boutons disponibles sur chaque lead :
| Bouton | Action |
|--------|--------|
| ➡️ **Suivant** | Passe au lead suivant (ne change rien en DB) |
| ✅ **Fait** | Marque comme DONE + last_contacted_at = maintenant |
| 📞 **Pris** | T'assigne ce lead (call_owner_id) |
| 🟡 **À vérifier** | Status → CHECK |
| ❌ **Ignorer** | Status → IGNORE (score -20) |
| ⏳ **Relance 3j** | Programme une relance dans 3 jours |
| ⏳ **Relance 7j** | Programme une relance dans 7 jours |

```
/call_queue
```

### `/call_next` — Lead suivant
Passe au prochain lead dans ta file.
```
/call_next
```

---

### `/stats_now` — Statistiques immédiates 🆕
Affiche les stats complètes : total leads, score moyen, breakdown par status, taux de conversion, top villes, top recherches.
```
/stats_now
```

> 💡 Les stats sont aussi postées **automatiquement** toutes les X minutes dans le salon configuré (`STATS_CHANNEL_ID`). Le même message est édité à chaque fois (pas de spam).

---

### `/update` — Rafraîchir le salon d'appels
Nettoie le salon "à-appeler" et reposte tous les leads à traiter, triés par score. Mentionne l'associé.
```
/update
```

---

## 🎯 Lead Scoring (0–100) 🆕

Chaque lead reçoit un **score automatique** qui détermine sa priorité dans la call queue.

| Critère | Points |
|---------|--------|
| 🚫 Pas de site web | **+35** |
| 📱 Social only (FB/Insta) | **+20** (non cumulable avec +35) |
| 🇫🇷 Business français | **+10** |
| ⭐ Rating ≥ 4.6 | **+15** |
| ⭐ Rating ≥ 4.3 | **+10** |
| ⭐ Rating ≥ 4.0 | **+5** |
| 💬 ≥ 200 avis | **+15** |
| 💬 ≥ 50 avis | **+10** |
| 💬 ≥ 10 avis | **+5** |
| 📞 Téléphone présent | **+10** |
| ❌ Status IGNORE | **-20** |

Le score est recalculé à chaque changement de status.

---

## 🏷️ Boutons sur les leads

Chaque lead posté par `/scan` a 3 boutons de tri :
- ✅ **A appeler** → Status CALL
- 🟡 **À vérifier** → Status CHECK
- ❌ **Ignorer** → Status IGNORE

Les leads dans `/update` (salon "à-appeler") ont 4 boutons de workflow :
- 📞 **Appelé** → DONE
- � **À rappeler** → CALL + relance 3j
- 🤝 **Conclu** → DONE
- 🚫 **Sans suite** → IGNORE

Le status est sauvegardé en base, le score recalculé, et l'embed se met à jour en temps réel.

---

## 🔔 Relances automatiques 🆕

Quand une relance est programmée (via `/call_queue` → "Relance 3j/7j"), le bot vérifie automatiquement toutes les **60 minutes** (configurable via `FOLLOWUP_CHECK_INTERVAL_MIN`).

Quand une relance est due :
1. Le bot poste dans `FOLLOWUP_CHANNEL_ID`
2. Mentionne ton associé `@user`
3. Affiche l'embed du lead avec score
4. Boutons : ✅ Relancé | ⏳ Repousser 3j | ❌ Ignorer

---

## 📊 Ce que le bot détecte

- **🚫 No Website** : Le business n'a pas de site web → prospect potentiel !
- **📱 Social Only** : Le "site" est juste une page Facebook/Instagram → prospect potentiel !
- **🇫🇷 Business FR** : Heuristique qui détecte si c'est un business typiquement français (boulangerie, "chez ...", coiffeur, etc.)

---

## 🇮🇱🇫🇷 Cibler les francophones en Israël

Le bot est **spécialement configuré** pour trouver les businesses francophones en Israël.

### Villes à forte communauté francophone
Netanya, Ashdod, Jérusalem, Tel Aviv, Raanana, Herzliya, Bat Yam, Haifa, Beer Sheva, Ramat Gan, Petah Tikva, Modiin, Ashkelon.

### Domaines spéciaux Israël
| Domaine | Description | Exemples de queries |
|---------|-------------|-------------------|
| `il_food` | Restaurants & food en hébreu | מסעדה, מאפייה, קונדיטוריה |
| `il_beauty` | Beauté & coiffure en hébreu | מספרה, מכון יופי, ברבר |
| `il_services` | Services & artisans en hébreu | מוסך, שרברב, חשמלאי |
| `il_french` | **Businesses FR en Israël** | boulangerie, coiffeur français, traiteur |

### Stratégie recommandée
1. `/scan city:Netanya domain:il_french nosite:true` → Francos sans site
2. `/scan city:Netanya query:מספרה nosite:true` → Coiffeurs hébreux sans site
3. `/scan_grid city:Ashdod domain:il_french grid_km:6` → Tous les FR d'Ashdod
4. `/export scope:last_scan` → Export CSV et on commence à appeler 📞

---

## 🗂️ Structure du projet

```
src/
├── index.ts                    ← Point d'entrée (démarre le bot + jobs)
├── config.ts                   ← Configuration (lit le .env)
├── deploy-commands.ts          ← Enregistre les commandes Discord
├── scoring/
│   └── computeScore.ts         ← Lead scoring 0–100
├── jobs/
│   ├── statsPoster.ts          ← Stats auto périodiques
│   └── followupChecker.ts      ← Relances auto
├── bot/
│   ├── commands/
│   │   ├── scan.ts             ← Commande /scan
│   │   ├── scan_grid.ts        ← Commande /scan_grid
│   │   ├── filters.ts          ← Commandes /filters_set et /filters_show
│   │   ├── export.ts           ← Commande /export
│   │   ├── status.ts           ← Commande /status
│   │   ├── help.ts             ← Commande /help
│   │   ├── guide.ts            ← Commande /guide (tutoriel complet)
│   │   ├── update.ts           ← Commande /update (salon à-appeler)
│   │   ├── callQueue.ts        ← Commandes /call_queue et /call_next
│   │   └── statsNow.ts         ← Commande /stats_now
│   ├── interactions/
│   │   └── buttons.ts          ← Gestion des boutons (scan + queue + followup)
│   └── embeds.ts               ← Construction des messages Discord
├── services/
│   ├── googlePlaces.ts         ← Client Google Places API
│   └── geocode.ts              ← Géocodage ville → coordonnées
├── db/
│   ├── schema.ts               ← Tables SQLite + migrations auto
│   └── queries.ts              ← Requêtes base de données
└── utils/
    ├── rateLimiter.ts           ← Contrôle du débit API
    ├── csv.ts                   ← Génération de fichiers CSV
    └── logger.ts                ← Logs formatés
```

---

## 🔧 Notes techniques

- **Base de données** : SQLite par défaut (fichier `leads.db` à la racine). Prévu pour migration Postgres via `DATABASE_URL`.
- **Migrations auto** : Les nouvelles colonnes (lead_score, followup_at, etc.) sont ajoutées automatiquement au démarrage si absentes.
- **Déduplication** : Chaque business est identifié par son `place_id` Google. Pas de doublon possible.
- **Scoring** : Recalculé à l'insertion et à chaque changement de status. Stocké en colonne `lead_score`.
- **Rate limiting** : 5 requêtes/sec vers Google par défaut. Configurable via `RATE_LIMIT_PER_SEC` dans `.env`.
- **Jobs planifiés** : Stats et relances tournent en `setInterval`. Les stats éditent un message pinned (pas de spam).
- **Concurrence** : Les opérations critiques (status + score) utilisent des transactions SQLite.
- **Emails** : Google Places API ne fournit PAS les emails. Le champ reste vide. Il faudrait un scraper web séparé pour ça.

---

## ⚙️ Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DISCORD_BOT_TOKEN` | ✅ | Token du bot Discord |
| `GOOGLE_MAPS_API_KEY` | ✅ | Clé API Google Maps |
| `LEADS_CHANNEL_ID` | ✅ | Salon où poster les leads scannés |
| `CALL_CHANNEL_ID` | Non | Salon "à appeler" pour `/update` |
| `CALL_QUEUE_CHANNEL_ID` | Non | Salon call queue pour `/call_queue` |
| `STATS_CHANNEL_ID` | Non | Salon stats automatiques |
| `FOLLOWUP_CHANNEL_ID` | Non | Salon relances automatiques |
| `ASSOCIATE_USER_ID` | Non | ID Discord de l'associé (mention auto) |
| `STATS_POST_INTERVAL_MIN` | Non | Intervalle stats en minutes (défaut: 10) |
| `FOLLOWUP_CHECK_INTERVAL_MIN` | Non | Intervalle relances en minutes (défaut: 60) |
| `DATABASE_URL` | Non | URL Postgres (sinon SQLite) |
| `RATE_LIMIT_PER_SEC` | Non | Limite requêtes Google/sec (défaut: 5) |

---

## 🐛 Dépannage

| Problème | Solution |
|----------|----------|
| "Variable d'environnement manquante" | Vérifie que `.env` est rempli correctement |
| "Cannot find module" | Relance `npm install` |
| Les commandes n'apparaissent pas sur Discord | Attends 1-2 minutes (propagation Discord) ou relance le bot |
| "OVER_QUERY_LIMIT" | Tu as dépassé le quota Google. Attends ou augmente ton quota |
| "REQUEST_DENIED" | Vérifie que Places API et Geocoding API sont activées sur ta console Google |

---

## 📄 Licence

Projet privé — Usage interne uniquement.
