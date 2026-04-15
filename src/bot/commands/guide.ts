/**
 * guide.ts — Commande /guide
 * Tutoriel interactif complet pour un utilisateur non-technique.
 * Explique pas-à-pas comment scanner, filtrer, exporter.
 * Adapté au contexte franco-israélien.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("guide")
  .setDescription("📖 Tutoriel complet du bot — apprends à scanner et trouver des leads")
  .addStringOption((opt) =>
    opt
      .setName("sujet")
      .setDescription("Sur quoi tu veux de l'aide ?")
      .addChoices(
        { name: "📖 Guide complet (tout lire)", value: "all" },
        { name: "🔍 Comment scanner ?", value: "scan" },
        { name: "🗺️ Scanner une grande zone", value: "grid" },
        { name: "🚫 Trouver ceux SANS site web", value: "nosite" },
        { name: "🇮🇱🇫🇷 Cibler les francophones en Israël", value: "franco_il" },
        { name: "📥 Exporter les résultats", value: "export" },
        { name: "💾 Utiliser les presets", value: "presets" },
        { name: "🏷️ Comprendre les boutons", value: "buttons" },
        { name: "📂 Les domaines expliqués", value: "domains" },
        { name: "⚙️ Options avancées", value: "advanced" }
      )
  );

// ─── Sections du guide ─────────────────────────────

function guideAll(): EmbedBuilder[] {
  return [
    guideScan(),
    guideGrid(),
    guideNosite(),
    guideFrancoIL(),
    guideExport(),
    guidePresets(),
    guideButtons(),
    guideDomains(),
    guideAdvanced(),
  ];
}

function guideScan(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2b82d9)
    .setTitle("🔍 Comment scanner une zone ?")
    .setDescription(
      "La commande `/scan` cherche des businesses autour d'une ville.\n" +
      "C'est **la commande principale** du bot."
    )
    .addFields(
      {
        name: "Le minimum pour scanner",
        value:
          "```\n/scan city:Tel Aviv query:coiffeur\n```\n" +
          "→ Cherche tous les coiffeurs autour de Tel Aviv.",
      },
      {
        name: "📌 `city` — Où chercher ?",
        value:
          "Mets le nom d'une ville, par exemple :\n" +
          "• `Tel Aviv`, `Netanya`, `Jerusalem`, `Haifa`, `Ashdod`\n" +
          "• `Raanana`, `Herzliya`, `Bat Yam`, `Ramat Gan`\n" +
          "• Tu peux aussi mettre des coordonnées GPS : `32.07,34.77`",
      },
      {
        name: "🔎 `query` — Que chercher ?",
        value:
          "Le métier ou type de business. Exemples :\n" +
          "• En français : `coiffeur`, `boulangerie`, `restaurant français`\n" +
          "• En hébreu : `מספרה`, `מאפייה`, `מסעדה`\n" +
          "• En anglais : `beauty salon`, `dentist`, `garage`\n" +
          "• Un nom de marque : `pizzeria`, `sushi`",
      },
      {
        name: "📏 `radius` — Quelle distance ?",
        value:
          "Le rayon autour de la ville, **en mètres**.\n" +
          "• `2500` (défaut) = 2.5 km\n" +
          "• `5000` = 5 km\n" +
          "• `10000` = 10 km\n" +
          "💡 Pour une petite ville comme Netanya, `3000` suffit.\n" +
          "Pour Tel Aviv, mets `5000` ou utilise `/scan_grid`.",
      },
      {
        name: "Exemple complet",
        value:
          "```\n/scan city:Netanya query:coiffeur radius:3000 nosite:true min_reviews:5\n```\n" +
          "→ Coiffeurs à Netanya dans 3km, **sans site web**, avec au moins 5 avis Google.",
      }
    )
    .setFooter({ text: "Page 1/9 — /guide sujet:scan" });
}

function guideGrid(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🗺️ Scanner une grande zone avec /scan_grid")
    .setDescription(
      "Google limite à ~60 résultats par recherche.\n" +
      "`/scan_grid` **découpe la zone en grille** et fait plusieurs recherches pour couvrir tout."
    )
    .addFields(
      {
        name: "Quand l'utiliser ?",
        value:
          "• Quand tu veux scanner **toute une ville** (Tel Aviv, Jérusalem…)\n" +
          "• Quand `/scan` te donne 60 résultats (= il y en a probablement plus)\n" +
          "• Quand tu veux être sûr de ne rien rater",
      },
      {
        name: "Exemple",
        value:
          "```\n/scan_grid city:Tel Aviv query:מספרה grid_km:10 step_m:800\n```\n" +
          "→ Scanne les coiffeurs (en hébreu) dans un carré de 10×10 km autour de Tel Aviv,\n" +
          "avec un point tous les 800m.\n\n" +
          "⚠️ **C'est plus long** car ça fait beaucoup de requêtes Google.\n" +
          "Un scan_grid de 10km prend environ 5-10 minutes.",
      },
      {
        name: "Les paramètres",
        value:
          "• `grid_km` — Taille du carré en km (défaut 6km)\n" +
          "• `step_m` — Distance entre chaque point en mètres (défaut 1000m)\n" +
          "• `radius` — Rayon de recherche par point (défaut 1200m)\n\n" +
          "💡 **Astuce :** mets `step_m` un peu plus petit que `radius` pour que les cercles se chevauchent.",
      }
    )
    .setFooter({ text: "Page 2/9 — /guide sujet:grid" });
}

function guideNosite(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🚫 Trouver les businesses SANS site web")
    .setDescription(
      "C'est le **cœur de notre prospection** :\n" +
      "Un business sans site web = un prospect qui a besoin de nos services !"
    )
    .addFields(
      {
        name: "Comment ça marche ?",
        value:
          "Ajoute `nosite:true` à n'importe quel scan :\n" +
          "```\n/scan city:Herzliya query:restaurant nosite:true\n```\n" +
          "Le bot ne gardera **que** les businesses qui :\n" +
          "• N'ont **aucun site web** sur Google\n" +
          "• Ou ont juste une page **Facebook/Instagram** (= \"social only\")",
      },
      {
        name: "Les codes couleur des embeds",
        value:
          "🔴 **Rouge** = Pas de site web du tout\n" +
          "🟠 **Orange** = Juste Facebook ou Instagram\n" +
          "🔵 **Bleu** = A un vrai site web\n\n" +
          "Les rouges et oranges sont nos meilleurs prospects !",
      },
      {
        name: "Combo puissant",
        value:
          "```\n/scan city:Raanana query:coiffeur nosite:true min_reviews:10 min_rating:4\n```\n" +
          "→ Coiffeurs à Raanana sans site web, mais avec **10+ avis** et **4+ étoiles**.\n" +
          "= Ce sont des businesses qui marchent bien mais qui n'ont pas de présence web !",
      }
    )
    .setFooter({ text: "Page 3/9 — /guide sujet:nosite" });
}

function guideFrancoIL(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x0055a4)
    .setTitle("🇮🇱🇫🇷 Cibler les francophones en Israël")
    .setDescription(
      "Le bot est **spécialement configuré** pour trouver les businesses francophones en Israël.\n" +
      "Voici comment en tirer le meilleur."
    )
    .addFields(
      {
        name: "🏙️ Villes à forte communauté francophone",
        value:
          "• **Netanya** — La plus francophone d'Israël\n" +
          "• **Ashdod** — Grande communauté FR\n" +
          "• **Jerusalem** — Quartiers francophones\n" +
          "• **Tel Aviv** — Centre Dizengoff, Florentin\n" +
          "• **Raanana** / **Herzliya** — Familles françaises\n" +
          "• **Bat Yam** / **Haifa** / **Beer Sheva**",
      },
      {
        name: "🔍 Queries pour trouver des francophones",
        value:
          "**En français** (les francophones mettent souvent leur nom en français sur Google) :\n" +
          "• `boulangerie`, `pâtisserie française`, `coiffeur français`\n" +
          "• `restaurant français`, `traiteur`, `institut de beauté`\n\n" +
          "**Avec le domaine `il_french`** :\n" +
          "```\n/scan city:Netanya domain:il_french\n```\n" +
          "→ Scanne automatiquement toutes les catégories typiquement françaises.",
      },
      {
        name: "🏷️ Tag \"🇫🇷 Business FR\"",
        value:
          "Le bot détecte automatiquement les businesses francophones grâce à :\n" +
          "• Le **nom** (contient \"boulangerie\", \"chez\", \"maison\", etc.)\n" +
          "• Les **catégories** Google (bakery, french_restaurant…)\n" +
          "• La **query** utilisée\n\n" +
          "C'est un tag heuristique — pas toujours exact, mais très utile pour filtrer.",
      },
      {
        name: "💡 Stratégie recommandée",
        value:
          "1️⃣ `/scan city:Netanya domain:il_french nosite:true` → Tous les FR sans site\n" +
          "2️⃣ `/scan city:Netanya query:מספרה nosite:true` → Coiffeurs hébreux sans site\n" +
          "3️⃣ `/scan_grid city:Ashdod query:restaurant grid_km:6` → Tous les restos d'Ashdod\n" +
          "4️⃣ `/export scope:last_scan` → Exporte et commence à appeler 📞",
      }
    )
    .setFooter({ text: "Page 4/9 — /guide sujet:franco_il" });
}

function guideExport(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle("📥 Exporter les résultats en CSV")
    .setDescription("Tu peux télécharger tous les leads en fichier CSV pour les ouvrir dans Excel ou Google Sheets.")
    .addFields(
      {
        name: "Exporter le dernier scan",
        value: "```\n/export scope:last_scan\n```",
      },
      {
        name: "Exporter tous les leads",
        value: "```\n/export scope:all limit:1000\n```",
      },
      {
        name: "Exporter par dates",
        value: "```\n/export scope:date_range from:2026-02-01 to:2026-02-13\n```",
      },
      {
        name: "💡 Que faire avec le CSV ?",
        value:
          "1. Ouvre-le dans **Google Sheets** ou **Excel**\n" +
          "2. Filtre par colonne `no_website` = OUI\n" +
          "3. Trie par `rating` décroissant\n" +
          "4. Appelle les meilleurs prospects en premier ! 📞",
      }
    )
    .setFooter({ text: "Page 5/9 — /guide sujet:export" });
}

function guidePresets(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("💾 Utiliser les presets de filtres")
    .setDescription(
      "Les presets te permettent de **sauvegarder une configuration** pour ne pas la retaper à chaque fois."
    )
    .addFields(
      {
        name: "Créer un preset",
        value:
          "```\n/filters_set name:coiffeurs_netanya query:coiffeur nosite:true min_reviews:5\n```\n" +
          "→ Sauvegarde ces filtres sous le nom `coiffeurs_netanya`.",
      },
      {
        name: "Voir les presets",
        value:
          "```\n/filters_show\n```\n" +
          "→ Liste tous les presets du serveur.\n\n" +
          "```\n/filters_show name:coiffeurs_netanya\n```\n" +
          "→ Détail d'un preset spécifique.",
      },
      {
        name: "💡 Idées de presets",
        value:
          "• `fr_nosite` — query:boulangerie nosite:true\n" +
          "• `top_restaurants` — domain:restaurant min_rating:4.5 min_reviews:50\n" +
          "• `beauty_herzliya` — query:coiffeur nosite:true min_reviews:10",
      }
    )
    .setFooter({ text: "Page 6/9 — /guide sujet:presets" });
}

function guideButtons(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("🏷️ Comprendre les boutons sur chaque lead")
    .setDescription(
      "Quand le bot poste un lead, il y a 3 boutons en dessous.\n" +
      "Clique dessus pour **organiser ta prospection**."
    )
    .addFields(
      {
        name: "✅ A appeler",
        value:
          "Tu comptes contacter ce prospect.\n" +
          "L'embed devient **vert** et le statut passe à `CALL`.",
      },
      {
        name: "🟡 À vérifier",
        value:
          "Tu veux d'abord vérifier (regarder sa page Google, etc.).\n" +
          "L'embed devient **orange** et le statut passe à `CHECK`.",
      },
      {
        name: "❌ Ignorer",
        value:
          "Pas intéressant (doublon, fermé, pas pertinent…).\n" +
          "L'embed devient **gris** et le statut passe à `IGNORE`.",
      },
      {
        name: "💡 Le statut est sauvegardé !",
        value:
          "Quand tu exportes en CSV, la colonne `status` contient le statut.\n" +
          "Tu peux filtrer dans Excel : `CALL` = à appeler, etc.",
      }
    )
    .setFooter({ text: "Page 7/9 — /guide sujet:buttons" });
}

function guideDomains(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("📂 Les domaines expliqués")
    .setDescription(
      "Un **domaine** est un raccourci qui lance plusieurs recherches d'un coup.\n" +
      "Au lieu de taper `query:coiffeur` puis `query:barbier` puis `query:esthéticienne`, " +
      "tu tapes juste `domain:beauty` et le bot fait tout."
    )
    .addFields(
      {
        name: "Domaines généraux",
        value:
          "• 🍽️ `restaurant` — resto, brasserie, bistro, traiteur, pizza, kebab…\n" +
          "• 💇 `beauty` — coiffeur, barbier, esthéticienne, onglerie…\n" +
          "• 🥐 `bakery` — boulangerie, pâtisserie\n" +
          "• 🔧 `auto` — garage, carrosserie, mécanicien…\n" +
          "• 🏥 `medical` — médecin, dentiste, pharmacie, kiné…\n" +
          "• 🏠 `immo` — agence immobilière, notaire\n" +
          "• 🛠️ `artisan` — plombier, électricien, serrurier…",
      },
      {
        name: "🇮🇱 Domaines Israël",
        value:
          "• 🇮🇱🍽️ `il_food` — מסעדה, קונדיטוריה, מאפייה, פיצרייה…\n" +
          "• 🇮🇱💇 `il_beauty` — מספרה, מכון יופי, ברבר…\n" +
          "• 🇮🇱🔧 `il_services` — מוסך, שרברב, חשמלאי…\n" +
          "• 🇫🇷🇮🇱 `il_french` — boulangerie, pâtisserie, coiffeur français, traiteur… (FR en Israël)",
      },
      {
        name: "Exemple",
        value:
          "```\n/scan city:Netanya domain:il_french nosite:true\n```\n" +
          "→ Scanne TOUTES les catégories françaises à Netanya, ne garde que ceux sans site web.",
      }
    )
    .setFooter({ text: "Page 8/9 — /guide sujet:domains" });
}

function guideAdvanced(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x34495e)
    .setTitle("⚙️ Options avancées")
    .addFields(
      {
        name: "`country` — Biaiser la géolocalisation",
        value:
          "Si le bot confond la ville (ex: \"Paris\" → Paris France au lieu de Paris Texas),\n" +
          "ajoute `country:IL` pour forcer Israël.\n" +
          "```\n/scan city:Jerusalem query:restaurant country:IL\n```",
      },
      {
        name: "`language` — Langue des résultats",
        value:
          "Par défaut c'est `fr` (français). Tu peux mettre :\n" +
          "• `he` pour l'hébreu\n" +
          "• `en` pour l'anglais\n" +
          "• `ar` pour l'arabe\n" +
          "```\n/scan city:Tel Aviv query:מספרה language:he\n```",
      },
      {
        name: "`min_rating` + `min_reviews` — Filtrer la qualité",
        value:
          "• `min_rating:4` → Que les 4 étoiles et plus\n" +
          "• `min_reviews:20` → Que ceux avec 20+ avis\n" +
          "💡 Un business avec beaucoup d'avis mais pas de site = **excellent prospect**",
      },
      {
        name: "`realtime` — Mode silencieux",
        value:
          "Par défaut le bot poste chaque lead au fur et à mesure.\n" +
          "Si tu veux juste le résumé final :\n" +
          "```\n/scan city:Haifa query:dentist realtime:false\n```",
      },
      {
        name: "`limit` — Nombre de résultats",
        value:
          "Par défaut : 60. Max : 200.\n" +
          "```\n/scan city:Tel Aviv query:restaurant limit:150\n```",
      }
    )
    .setFooter({ text: "Page 9/9 — /guide sujet:advanced" });
}

// ─── Map section → embeds ──────────────────────────

const SECTION_MAP: Record<string, () => EmbedBuilder | EmbedBuilder[]> = {
  all: guideAll,
  scan: guideScan,
  grid: guideGrid,
  nosite: guideNosite,
  franco_il: guideFrancoIL,
  export: guideExport,
  presets: guidePresets,
  buttons: guideButtons,
  domains: guideDomains,
  advanced: guideAdvanced,
};

// ─── Exécution ─────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sujet = interaction.options.getString("sujet") ?? "all";

  const builder = SECTION_MAP[sujet];
  if (!builder) {
    await interaction.reply({ content: "❌ Sujet inconnu.", flags: MessageFlags.Ephemeral });
    return;
  }

  const result = builder();
  const embeds = Array.isArray(result) ? result : [result];

  // Discord limite la taille totale des embeds à 6000 caractères par message.
  // On envoie chaque embed séparément pour éviter de dépasser.
  await interaction.reply({ embeds: [embeds[0]], flags: MessageFlags.Ephemeral });

  for (let i = 1; i < embeds.length; i++) {
    await interaction.followUp({ embeds: [embeds[i]], flags: MessageFlags.Ephemeral });
  }
}
