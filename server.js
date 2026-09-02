/**
 * MIMOYE — Backend (Node.js natif, aucune dépendance externe)
 * -------------------------------------------------------------
 * Pourquoi "natif" : cet environnement de build n'a pas d'accès réseau,
 * donc impossible d'installer express/sqlite3/bcrypt/jsonwebtoken.
 * Ce serveur utilise uniquement les modules intégrés de Node (http, crypto, fs).
 * Il est fonctionnellement réel : vrais mots de passe hashés (scrypt), vraies
 * sessions serveur, vrai contrôle d'accès par rôle, vraie persistance sur disque
 * (fichiers JSON dans /data) partagée entre TOUS les utilisateurs qui appellent ce serveur
 * — contrairement à la version précédente qui stockait tout dans le navigateur.
 *
 * LIMITES ASSUMÉES (à corriger dans une vraie stack de prod, voir README.md) :
 *  - Paiement : simulé (mode SANDBOX explicite), pas de vraie intégration Mobile Money.
 *  - Géolocalisation : champs texte (zone), pas de vraies coordonnées GPS.
 *  - Fichiers JSON comme base de données : correct pour une démo / un MVP à faible volume,
 *    pas dimensionné pour de la production à grande échelle (migrer vers PostgreSQL).
 *  - Un seul processus, un seul serveur : pas de haute disponibilité.
 *
 * LANCEMENT : node server.js   (voir README.md)
 */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const url = require("url");

// ---------------------------------------------------------------------------
// RÉFÉRENTIEL MÉTIERS INITIAL (inline — pas de fichier externe, pas de risque
// d'oubli lors d'un déploiement manuel sur GitHub)
// ---------------------------------------------------------------------------
// Chaque secteur contient des catégories, chaque catégorie une liste de métiers.
// `reglemente: true` marque les métiers nécessitant une vérification de diplôme/autorisation
// avant tout badge "vérifié" (santé, juridique/financier notamment) — voir REGLEMENTED_SET.
const TAXONOMY_SEED = [
  { secteur: "Automobile et Mobilité", cats: [
    { cat: "Réparation et entretien auto", metiers: ["Mécanicien", "Électricien automobile", "Dépanneur automobile", "Réparateur de pneus", "Vulcanisateur", "Carrossier", "Peintre automobile", "Tôlier", "Diagnostiqueur automobile", "Spécialiste climatisation automobile", "Spécialiste batterie", "Remorqueur", "Laveur automobile"] },
    { cat: "Transport et livraison", metiers: ["Transporteur", "Chauffeur privé", "Chauffeur de taxi", "Chauffeur de livraison", "Coursier", "Moto-taxi"] },
    { cat: "Deux-roues", metiers: ["Réparateur de motos", "Réparateur de vélos"] }
  ]},
  { secteur: "Bâtiment et Construction", cats: [
    { cat: "Gros œuvre", metiers: ["Maçon", "Carreleur", "Soudeur", "Ferrailleur", "Charpentier", "Couvreur", "Étancheur", "Façadier"] },
    { cat: "Second œuvre", metiers: ["Plombier", "Électricien bâtiment", "Peintre bâtiment", "Menuisier", "Menuisier aluminium", "Menuisier bois", "Serrurier", "Vitrier", "Staffeur", "Plaquiste", "Installateur de faux plafonds", "Poseur de portes et fenêtres", "Poseur de revêtements"] },
    { cat: "Climatisation et froid (bâtiment)", metiers: ["Spécialiste climatisation", "Frigoriste", "Technicien bâtiment"] },
    { cat: "Conception et maîtrise d'œuvre", metiers: ["Architecte", "Géomètre", "Ingénieur", "Maître d'œuvre", "Décorateur", "Architecte d'intérieur"] }
  ]},
  { secteur: "Électricité et Énergie", cats: [
    { cat: "Installations électriques", metiers: ["Électricien", "Électrotechnicien", "Automaticien", "Technicien réseau"] },
    { cat: "Énergies renouvelables", metiers: ["Installateur solaire", "Technicien photovoltaïque"] },
    { cat: "Groupes électrogènes", metiers: ["Installateur groupe électrogène", "Réparateur groupe électrogène", "Technicien énergie"] },
    { cat: "Sécurité et domotique", metiers: ["Installateur domotique", "Installateur vidéosurveillance", "Installateur alarme"] }
  ]},
  { secteur: "Plomberie et Eau", cats: [
    { cat: "Sanitaire", metiers: ["Plombier", "Installateur sanitaire", "Spécialiste chauffe-eau", "Déboucheur"] },
    { cat: "Hydraulique", metiers: ["Spécialiste pompe à eau", "Installateur de château d'eau", "Spécialiste forage", "Technicien hydraulique", "Spécialiste assainissement"] }
  ]},
  { secteur: "Électroménager", cats: [
    { cat: "Froid et lavage", metiers: ["Réparateur de réfrigérateur", "Réparateur de congélateur", "Réparateur de climatiseur", "Réparateur de machine à laver"] },
    { cat: "Cuisson et image", metiers: ["Réparateur de télévision", "Réparateur de cuisinière", "Réparateur de four", "Réparateur de micro-ondes"] },
    { cat: "Petit électroménager", metiers: ["Réparateur de ventilateur", "Réparateur de petits appareils électroménagers"] }
  ]},
  { secteur: "Informatique et Télécommunications", cats: [
    { cat: "Support et réseau", metiers: ["Informaticien", "Réparateur informatique", "Technicien réseau", "Technicien télécom", "Technicien fibre optique", "Installateur Wi-Fi"] },
    { cat: "Téléphonie", metiers: ["Réparateur téléphone", "Réparateur tablette"] },
    { cat: "Logiciel et digital", metiers: ["Développeur", "Spécialiste cybersécurité", "Spécialiste logiciels", "Spécialiste récupération de données", "Graphiste", "Webdesigner", "Community manager", "Spécialiste marketing digital"] }
  ]},
  { secteur: "Maison et Services à domicile", cats: [
    { cat: "Ménage et entretien", metiers: ["Femme de ménage", "Agent d'entretien", "Aide ménagère"] },
    { cat: "Extérieur", metiers: ["Jardinier", "Paysagiste", "Pisciniste", "Nettoyeur de piscine"] },
    { cat: "Hygiène et nuisibles", metiers: ["Désinfecteur", "Dératiseur", "Spécialiste lutte contre les nuisibles"] },
    { cat: "Nettoyage spécialisé", metiers: ["Nettoyeur de canapé", "Nettoyeur de tapis", "Laveur de vitres"] },
    { cat: "Déménagement et mobilier", metiers: ["Déménageur", "Manutentionnaire", "Monteur de meubles", "Réparateur de meubles"] }
  ]},
  { secteur: "Beauté et Bien-être", cats: [
    { cat: "Coiffure et barbier", metiers: ["Coiffeur", "Coiffeuse", "Barbier"] },
    { cat: "Esthétique", metiers: ["Esthéticienne", "Maquilleur", "Prothésiste ongulaire"] },
    { cat: "Bien-être", metiers: ["Masseur", "Spa"] },
    { cat: "Couture et stylisme", metiers: ["Styliste", "Couturier", "Tailleur", "Retoucheur", "Créateur de vêtements"] }
  ]},
  { secteur: "Alimentation et Événementiel", cats: [
    { cat: "Restauration", metiers: ["Cuisinier à domicile", "Traiteur", "Pâtissier", "Boulanger", "Serveur", "Barman"] },
    { cat: "Événementiel", metiers: ["Décorateur événementiel", "Organisateur d'événements", "Photographe", "Vidéaste", "DJ", "Animateur", "Fleuriste"] }
  ]},
  { secteur: "Santé et Paramédical", cats: [
    { cat: "Professions médicales réglementées", metiers: ["Médecin", "Infirmier", "Sage-femme", "Kinésithérapeute", "Pharmacien"], reglemente: true },
    { cat: "Paramédical et soutien", metiers: ["Psychologue", "Nutritionniste", "Orthophoniste", "Opticien", "Auxiliaire de santé", "Aide-soignant"], reglemente: true }
  ]},
  { secteur: "Services juridiques, financiers et professions libérales", cats: [
    { cat: "Juridique", metiers: ["Avocat", "Notaire", "Huissier de justice", "Conseiller juridique"], reglemente: true },
    { cat: "Comptabilité et finance", metiers: ["Expert-comptable", "Comptable", "Commissaire aux comptes", "Fiscaliste", "Conseiller fiscal", "Auditeur"], reglemente: true },
    { cat: "Immobilier et expertise", metiers: ["Architecte", "Ingénieur", "Géomètre", "Expert immobilier", "Agent immobilier", "Courtier", "Assureur"] },
    { cat: "Conseil et formation", metiers: ["Consultant", "Conseiller en gestion", "Consultant informatique", "Consultant RH", "Formateur", "Coach professionnel", "Traducteur", "Interprète", "Rédacteur", "Secrétaire indépendante", "Assistant administratif indépendant"] }
  ]}
];


const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// COUCHE DE PERSISTANCE (fichiers JSON = "base de données" de ce MVP)
// ---------------------------------------------------------------------------
function dbFile(name) { return path.join(DATA_DIR, name + ".json"); }
function readDB(name, fallback) {
  const p = dbFile(name);
  if (!fs.existsSync(p)) { fs.writeFileSync(p, JSON.stringify(fallback, null, 2)); return fallback; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return fallback; }
}
function writeDB(name, data) { fs.writeFileSync(dbFile(name), JSON.stringify(data, null, 2)); }

let users = readDB("users", []);
let sessions = readDB("sessions", {});
let taxonomy = readDB("taxonomy", TAXONOMY_SEED);
// Migration additive : si un déploiement existant a l'ancien référentiel restreint,
// on complète avec les nouveaux secteurs/catégories/métiers sans jamais supprimer
// ce qu'un administrateur aurait déjà ajouté ou modifié.
(function migrateTaxonomy() {
  const seed = TAXONOMY_SEED;
  let changed = false;
  seed.forEach(seedSect => {
    let sect = taxonomy.find(s => s.secteur.toLowerCase() === seedSect.secteur.toLowerCase());
    if (!sect) { taxonomy.push(JSON.parse(JSON.stringify(seedSect))); changed = true; return; }
    seedSect.cats.forEach(seedCat => {
      let cat = sect.cats.find(c => c.cat.toLowerCase() === seedCat.cat.toLowerCase());
      if (!cat) { sect.cats.push(JSON.parse(JSON.stringify(seedCat))); changed = true; return; }
      seedCat.metiers.forEach(m => { if (!cat.metiers.includes(m)) { cat.metiers.push(m); changed = true; } });
      if (seedCat.reglemente && !cat.reglemente) { cat.reglemente = true; changed = true; }
    });
  });
  if (changed) writeDB("taxonomy", taxonomy);
})();
let professionals = readDB("professionals", [
  { id: "p1", userId: null, name: "Kouadio Yao", metier: "Plombier", zone: "Cocody, Abidjan", tel: "+225 07 00 00 00 01", tarif: "À partir de 8 000 FCFA", badge: "verifie", note: 4.8, avis: 132, init: "KY" },
  { id: "p2", userId: null, name: "SARL Frigo Plus", metier: "Frigoriste — Entreprise", zone: "Yopougon, Abidjan", tel: "+225 07 00 00 00 02", tarif: "Devis sur diagnostic", badge: "certifie", note: 4.6, avis: 87, init: "FP" },
  { id: "p3", userId: null, name: "Aïcha Traoré", metier: "Électricienne", zone: "Marcory, Abidjan", tel: "+225 07 00 00 00 03", tarif: "À partir de 10 000 FCFA", badge: "verifie", note: 4.9, avis: 201, init: "AT" }
]);
let commissions = readDB("commissions", { "Plomberie": 12, "Électricité": 12, "Froid et climatisation": 15, "Services aux entreprises": 10 });
let requests = readDB("requests", []);
let auditLogs = readDB("audit_logs", []);
let wallets = readDB("wallets", {}); // { [professionalId]: { available, pending } }
let withdrawals = readDB("withdrawals", []);
let disputes = readDB("disputes", []);
let notifications = readDB("notifications", []);
let resetTokens = readDB("reset_tokens", {}); // { token: {userId, expiresAt} }
// Numéros de compte marchand Mobile Money de MIMOYE, par opérateur — modifiables
// par l'administrateur depuis l'app (voir /api/admin/merchant-accounts). C'est le
// numéro que le CLIENT doit voir pour effectuer un dépôt manuel vers MIMOYE.
let merchantAccounts = readDB("merchant_accounts", {
  wave: "", orange_money: "", mtn_money: "", moov_money: ""
});
const MOMO_OPERATOR_LABELS = { wave: "Wave", orange_money: "Orange Money", mtn_money: "MTN Money", moov_money: "Moov Money" };

function saveAll() {
  writeDB("users", users);
  writeDB("sessions", sessions);
  writeDB("taxonomy", taxonomy);
  writeDB("professionals", professionals);
  writeDB("commissions", commissions);
  writeDB("requests", requests);
  writeDB("audit_logs", auditLogs);
  writeDB("wallets", wallets);
  writeDB("withdrawals", withdrawals);
  writeDB("disputes", disputes);
  writeDB("notifications", notifications);
  writeDB("reset_tokens", resetTokens);
  writeDB("merchant_accounts", merchantAccounts);
}
function log(action, userId, detail) {
  auditLogs.push({ id: newId("log"), action, userId: userId || null, detail: detail || null, at: Date.now() });
}
function notify(userId, type, message) {
  notifications.push({ id: newId("notif"), userId, type, message, read: false, at: Date.now() });
  // Doublage en email + SMS (best-effort, voir BREVO_CONFIG) : n'empêche jamais
  // la notification interne d'être enregistrée, même si l'envoi externe échoue.
  deliverExternalNotification(userId, "MIMOYE — " + (NOTIF_SUBJECTS[type] || "Notification"), message);
}
const NOTIF_SUBJECTS = {
  payment: "Paiement", contact_shared: "Contact communiqué", dispute: "Litige",
  request: "Nouvelle demande", quote: "Devis"
};
function getWallet(proId) {
  if (!wallets[proId]) wallets[proId] = { available: 0, pending: 0 };
  return wallets[proId];
}
// Taux de commission par défaut si la catégorie du métier n'a pas de taux spécifique.
const DEFAULT_COMMISSION_RATE = 12;
function commissionRateFor(metier) {
  // Cherche une commission définie sur la catégorie contenant ce métier ; sinon taux par défaut.
  for (const sect of taxonomy) {
    for (const cat of sect.cats) {
      if (cat.metiers.includes(metier) && commissions[cat.cat] != null) return commissions[cat.cat];
    }
  }
  return commissions[metier] != null ? commissions[metier] : DEFAULT_COMMISSION_RATE;
}

// ---------------------------------------------------------------------------
// AUTH : mots de passe hashés (scrypt + sel), sessions côté serveur
// ---------------------------------------------------------------------------
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
  } catch (e) { return false; }
}
function newId(prefix) { return prefix + "_" + crypto.randomBytes(6).toString("hex"); }

// L'email et le mot de passe admin viennent de VARIABLES D'ENVIRONNEMENT (jamais du code,
// jamais du dépôt GitHub qui est public). À définir sur Render : Dashboard → ton service →
// Environment → Add Environment Variable → ADMIN_EMAIL et ADMIN_PASSWORD.
// Si ces variables ne sont pas définies, des valeurs par défaut sont utilisées UNIQUEMENT
// en local pour ne pas bloquer le développement — ne jamais laisser les valeurs par défaut
// sur un site accessible publiquement.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@mimoye.ci").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin#2026";

// Configuration du paiement MIMOYE via l'API Checkout officielle de Wave
// (https://docs.wave.com/checkout). Cette API fonctionne par SESSION DE PAIEMENT :
// on crée une session (POST /v1/checkout/sessions), Wave renvoie une URL
// "wave_launch_url" vers laquelle on redirige le client, celui-ci paie dans
// l'app Wave, puis Wave confirme via webhook (POST /api/webhooks/wave) l'événement
// "checkout.session.completed". Il n'y a PAS de "numéro de paiement" à transmettre
// dans l'appel API : l'argent arrive automatiquement dans le portefeuille Wave
// Business lié à la clé API utilisée (WAVE_PAYMENT_NUMBER reste une info de
// configuration du compte marchand côté Wave, pas un paramètre d'API).
// Toutes ces valeurs viennent exclusivement de variables d'environnement — jamais
// écrites dans le code ni versionnées sur GitHub. Tant que WAVE_API_KEY n'est pas
// définie, le paiement continue de fonctionner en mode simulation (voir
// /api/requests/:id/pay), jamais présenté comme une transaction réelle.
const WAVE_CONFIG = {
  paymentNumber: process.env.WAVE_PAYMENT_NUMBER || null, // info compte, non utilisé dans l'appel API
  apiKey: process.env.WAVE_API_KEY || null,               // clé "Authorization: Bearer ..." du Business Portal Wave
  webhookSecret: process.env.WAVE_WEBHOOK_SECRET || null, // secret donné par Wave à l'enregistrement du webhook
  get liveReady() { return !!this.apiKey; }
};
// Reprend WAVE_PAYMENT_NUMBER comme numéro Wave par défaut si l'admin n'a pas encore
// renseigné merchantAccounts.wave depuis l'app (rétrocompatibilité).
if (!merchantAccounts.wave && WAVE_CONFIG.paymentNumber) merchantAccounts.wave = WAVE_CONFIG.paymentNumber;
// URL publique du site (pour construire success_url/error_url de la session Wave,
// qui doivent être des URL https absolues). À défaut de variable d'environnement,
// reconstruite depuis l'en-tête Host de la requête entrante (fonctionne sur Render).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
function publicBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return proto + "://" + req.headers.host;
}

// Configuration des notifications email + SMS via l'API Brevo (ex-Sendinblue) —
// https://developers.brevo.com. Un seul fournisseur pour les deux canaux (plan
// gratuit disponible pour démarrer). Tant que BREVO_API_KEY n'est pas définie, les
// notifications restent uniquement internes à l'application (déjà fonctionnelles
// via /api/notifications) — aucun email ni SMS n'est réellement envoyé, et c'est
// journalisé comme tel, jamais présenté comme envoyé.
const BREVO_CONFIG = {
  apiKey: process.env.BREVO_API_KEY || null,
  senderEmail: process.env.BREVO_SENDER_EMAIL || null,
  senderName: process.env.BREVO_SENDER_NAME || "MIMOYE",
  smsSender: process.env.BREVO_SMS_SENDER || "MIMOYE", // 11 caractères alphanumériques max côté Brevo
  get emailReady() { return !!(this.apiKey && this.senderEmail); },
  get smsReady() { return !!this.apiKey; }
};

// ---------------------------------------------------------------------------
// APPELS HTTPS SORTANTS (natifs, sans dépendance) — utilisés pour Wave et Brevo
// ---------------------------------------------------------------------------
const https = require("https");
function httpsRequestJSON(method, hostname, pathname, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const bodyStr = bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined;
    const reqHeaders = Object.assign({ "Content-Type": "application/json" }, headers || {});
    if (bodyStr !== undefined) reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr);
    const request = https.request({ method, hostname, path: pathname, headers: reqHeaders, timeout: 15000 }, (res) => {
      let chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Délai dépassé.")));
    request.on("error", reject);
    if (bodyStr !== undefined) request.write(bodyStr);
    request.end();
  });
}

// ---------------------------------------------------------------------------
// PAIEMENT WAVE — création réelle d'une session Checkout (voir WAVE_CONFIG)
// ---------------------------------------------------------------------------
async function createWaveCheckoutSession({ amount, currency, successUrl, errorUrl, clientReference }) {
  const { status, body, raw } = await httpsRequestJSON(
    "POST", "api.wave.com", "/v1/checkout/sessions",
    { Authorization: "Bearer " + WAVE_CONFIG.apiKey },
    { amount: String(amount), currency, success_url: successUrl, error_url: errorUrl, client_reference: clientReference }
  );
  if (status < 200 || status >= 300 || !body || !body.wave_launch_url) {
    const err = new Error((body && (body.error_message || body.error_code)) || raw || "Erreur inconnue de l'API Wave.");
    err.waveStatus = status; err.waveBody = body;
    throw err;
  }
  return body; // Checkout Session object (id, wave_launch_url, ...)
}
// Vérifie la signature d'un webhook Wave : header "Wave-Signature: t=...,v1=..."
// calculé en HMAC-SHA256(timestamp + corps_brut, WAVE_WEBHOOK_SECRET).
// IMPORTANT : la vérification doit se faire sur le corps BRUT, avant tout parsing JSON.
function verifyWaveWebhookSignature(rawBody, signatureHeader) {
  if (!WAVE_CONFIG.webhookSecret || !signatureHeader) return false;
  const parts = String(signatureHeader).split(",");
  const tPart = parts.find(p => p.startsWith("t="));
  const sigParts = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  if (!tPart || !sigParts.length) return false;
  const timestamp = tPart.slice(2);
  const payload = timestamp + rawBody;
  const computed = crypto.createHmac("sha256", WAVE_CONFIG.webhookSecret).update(payload).digest("hex");
  return sigParts.some(sig => {
    try { return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(computed, "hex")); }
    catch (e) { return false; }
  });
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS EMAIL / SMS (Brevo) — best-effort, ne bloquent jamais la requête
// principale et ne font jamais échouer l'action qui les déclenche.
// ---------------------------------------------------------------------------
async function sendEmailBrevo(toEmail, toName, subject, htmlContent) {
  if (!BREVO_CONFIG.emailReady || !toEmail) return { sent: false, reason: "not_configured" };
  try {
    const { status, body } = await httpsRequestJSON(
      "POST", "api.brevo.com", "/v3/smtp/email",
      { "api-key": BREVO_CONFIG.apiKey, "accept": "application/json" },
      { sender: { name: BREVO_CONFIG.senderName, email: BREVO_CONFIG.senderEmail },
        to: [{ email: toEmail, name: toName || toEmail }], subject, htmlContent }
    );
    if (status < 200 || status >= 300) return { sent: false, reason: (body && body.message) || ("HTTP " + status) };
    return { sent: true };
  } catch (e) { return { sent: false, reason: e.message }; }
}
async function sendSmsBrevo(toPhone, content) {
  if (!BREVO_CONFIG.smsReady || !toPhone) return { sent: false, reason: "not_configured" };
  try {
    // Endpoint documenté par Brevo pour l'envoi de SMS transactionnel.
    const { status, body } = await httpsRequestJSON(
      "POST", "api.brevo.com", "/v3/transactionalSMS/send",
      { "api-key": BREVO_CONFIG.apiKey, "accept": "application/json" },
      { sender: BREVO_CONFIG.smsSender, recipient: toPhone.replace(/[^\d+]/g, ""), content, type: "transactional" }
    );
    if (status < 200 || status >= 300) return { sent: false, reason: (body && body.message) || ("HTTP " + status) };
    return { sent: true };
  } catch (e) { return { sent: false, reason: e.message }; }
}
// Envoie email + SMS en tâche de fond pour un utilisateur donné, sans jamais
// bloquer ni faire échouer l'appelant (log dans audit_logs en cas d'échec).
function deliverExternalNotification(userId, subject, message) {
  if (!userId) return; // notifications broadcast admin (userId null) : email/SMS non pertinents
  if (!BREVO_CONFIG.emailReady && !BREVO_CONFIG.smsReady) return;
  const u = users.find(x => x.id === userId);
  if (!u) return;
  const html = `<p>${message}</p><p style="color:#8a8272;font-size:12px;">MIMOYE — plateforme multiservices.</p>`;
  Promise.all([
    sendEmailBrevo(u.email, u.name, subject, html),
    sendSmsBrevo(u.phone, message.slice(0, 300))
  ]).then(([emailRes, smsRes]) => {
    if (!emailRes.sent && BREVO_CONFIG.emailReady) log("notify_email_failed", userId, { reason: emailRes.reason });
    if (!smsRes.sent && BREVO_CONFIG.smsReady && u.phone) log("notify_sms_failed", userId, { reason: smsRes.reason });
  }).catch(() => {});
}

function seedAdmin() {
  const existing = users.find(u => u.role === "admin");
  if (!existing) {
    const { salt, hash } = hashPassword(ADMIN_PASSWORD);
    users.push({ id: newId("u"), email: ADMIN_EMAIL, salt, hash, role: "admin", name: "Administrateur MIMOYE", phone: "", createdAt: Date.now() });
    saveAll();
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log("⚠️  ADMIN_EMAIL / ADMIN_PASSWORD non définis en variables d'environnement — identifiants par défaut utilisés (" + ADMIN_EMAIL + "). À définir avant toute mise en ligne publique.");
    } else {
      console.log("→ Compte admin créé avec les identifiants définis en variables d'environnement.");
    }
  } else if (process.env.ADMIN_EMAIL || process.env.ADMIN_PASSWORD) {
    // Si les variables d'environnement changent après coup (ex. rotation du mot de passe),
    // on met à jour le compte admin existant pour refléter la nouvelle valeur.
    let changed = false;
    if (process.env.ADMIN_EMAIL && existing.email !== ADMIN_EMAIL) { existing.email = ADMIN_EMAIL; changed = true; }
    if (process.env.ADMIN_PASSWORD) {
      const { salt, hash } = hashPassword(ADMIN_PASSWORD);
      existing.salt = salt; existing.hash = hash; changed = true;
    }
    if (changed) { saveAll(); console.log("→ Identifiants admin mis à jour depuis les variables d'environnement."); }
  }
}
seedAdmin();

function parseCookies(req) {
  const h = req.headers.cookie;
  const out = {};
  if (!h) return out;
  h.split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function getSessionUser(req) {
  const token = parseCookies(req)["mimoye_session"];
  if (!token) return null;
  const s = sessions[token];
  if (!s) return null;
  if (s.expiresAt < Date.now()) { delete sessions[token]; saveAll(); return null; }
  return users.find(u => u.id === s.userId) || null;
}

// ---------------------------------------------------------------------------
// UTILITAIRES HTTP
// ---------------------------------------------------------------------------
function sendJSON(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign(
    { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) },
    extraHeaders || {}
  ));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    let total = 0;
    req.on("data", c => {
      total += c.length;
      if (total > 5 * 1024 * 1024) { req.destroy(); return resolve({}); } // limite 5 Mo
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}
// Comme readBody, mais renvoie le corps BRUT (chaîne) sans le parser en JSON —
// nécessaire pour la vérification de signature du webhook Wave, qui doit porter
// sur les octets exacts envoyés, avant tout re-sérialisation.
function readRawBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    let total = 0;
    req.on("data", c => {
      total += c.length;
      if (total > 5 * 1024 * 1024) { req.destroy(); return resolve(""); }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}
function publicUser(u) { return { id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone }; }
// SÉPARATION STRICTE DONNÉES PUBLIQUES / PRIVÉES (voir cahier des charges, partie 20).
// Le téléphone, WhatsApp, email et informations de paiement d'un professionnel ne sont
// JAMAIS inclus dans les réponses API destinées aux clients — la protection est ici,
// au niveau du backend, pas seulement cachée dans l'interface. Un client qui inspecte
// les requêtes réseau ne peut pas récupérer ces champs : ils ne sont simplement jamais
// envoyés dans ces réponses.
const PRO_PRIVATE_FIELDS = ["tel", "whatsapp", "emailPro", "paymentInfo", "userId", "momoOperator", "momoNumber"];
function publicPro(p) {
  const out = {};
  Object.keys(p).forEach(k => { if (!PRO_PRIVATE_FIELDS.includes(k)) out[k] = p[k]; });
  return out;
}
function adminPro(p) { return p; } // vue admin uniquement : inclut les champs privés

// ---------------------------------------------------------------------------
// SERVEUR
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  res.setHeader("X-Content-Type-Options", "nosniff");

  if (method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    // ---- FRONTEND STATIQUE ----
    // Tolérant à l'emplacement du fichier : cherche d'abord dans /public, puis à la racine
    // du projet. Cela évite les erreurs fréquentes liées à l'upload manuel sur GitHub, où le
    // sous-dossier "public/" n'est parfois pas recréé et le fichier atterrit à la racine.
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const candidates = [
        path.join(PUBLIC_DIR, "mimoye-app.html"),
        path.join(__dirname, "mimoye-app.html"),
        path.join(__dirname, "public", "mimoye-app.html")
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (!found) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(
          "Fichier mimoye-app.html introuvable.\n\n" +
          "Emplacements vérifiés :\n" + candidates.map(c => " - " + c).join("\n") +
          "\n\nVérifie que mimoye-app.html a bien été téléversé sur GitHub, " +
          "soit dans un dossier public/, soit à la racine du dépôt, à côté de server.js."
        );
      }
      const html = fs.readFileSync(found);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    // ---- FICHIERS STATIQUES PWA (manifest, service worker, icônes) ----
    // Même tolérance d'emplacement que ci-dessus (public/ ou racine du dépôt).
    const STATIC_MIME = { ".json": "application/manifest+json", ".js": "application/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
    const staticAllowlist = ["/manifest.json", "/service-worker.js"];
    const isIconRequest = /^\/icons\/[a-zA-Z0-9_.-]+\.(png|svg)$/.test(pathname);
    if (method === "GET" && (staticAllowlist.includes(pathname) || isIconRequest)) {
      const relative = pathname.replace(/^\//, "");
      const candidates = [
        path.join(PUBLIC_DIR, relative),
        path.join(__dirname, relative)
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (!found) { res.writeHead(404); return res.end("Fichier introuvable : " + pathname); }
      const ext = path.extname(found);
      res.writeHead(200, { "Content-Type": STATIC_MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
      return res.end(fs.readFileSync(found));
    }

    function requireAuth() {
      const user = getSessionUser(req);
      if (!user) { sendJSON(res, 401, { error: "Authentification requise." }); return null; }
      return user;
    }
    function requireRole(user, roles) {
      if (!roles.includes(user.role)) { sendJSON(res, 403, { error: "Accès refusé : rôle insuffisant." }); return false; }
      return true;
    }

    // ================= AUTH =================
    if (pathname === "/api/auth/register" && method === "POST") {
      const body = await readBody(req);
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const role = body.role;
      const name = (body.name || "").trim();
      const phone = (body.phone || "").trim();
      if (!email || !password || password.length < 6 || !name || !["client", "pro", "entreprise"].includes(role)) {
        return sendJSON(res, 400, { error: "Champs invalides. Mot de passe : 6 caractères minimum. Rôle : client, pro ou entreprise." });
      }
      if (users.find(u => u.email === email)) {
        return sendJSON(res, 409, { error: "Un compte existe déjà avec cet email." });
      }
      const { salt, hash } = hashPassword(password);
      const user = { id: newId("u"), email, salt, hash, role, name, phone, createdAt: Date.now() };
      users.push(user);
      log("register", user.id, { role });
      saveAll();
      return sendJSON(res, 201, { ok: true });
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await readBody(req);
      const email = (body.email || "").trim().toLowerCase();
      const user = users.find(u => u.email === email);
      if (!user || !verifyPassword(body.password || "", user.salt, user.hash)) {
        return sendJSON(res, 401, { error: "Email ou mot de passe incorrect." });
      }
      const token = crypto.randomBytes(24).toString("hex");
      sessions[token] = { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 };
      saveAll();
      log("login", user.id);
      const cookie = `mimoye_session=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      return sendJSON(res, 200, { ok: true, user: publicUser(user) }, { "Set-Cookie": cookie });
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      const token = parseCookies(req)["mimoye_session"];
      if (token) { delete sessions[token]; saveAll(); }
      return sendJSON(res, 200, { ok: true }, { "Set-Cookie": "mimoye_session=; Path=/; Max-Age=0" });
    }

    if (pathname === "/api/auth/me" && method === "GET") {
      const user = getSessionUser(req);
      if (!user) return sendJSON(res, 200, { authenticated: false });
      return sendJSON(res, 200, { authenticated: true, user: publicUser(user) });
    }

    // ================= RÉFÉRENTIEL MÉTIERS =================
    if (pathname === "/api/taxonomy" && method === "GET") {
      return sendJSON(res, 200, taxonomy);
    }
    if (pathname === "/api/taxonomy" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const body = await readBody(req);
      const secteur = (body.secteur || "").trim();
      const categorie = (body.categorie || "").trim();
      const metier = (body.metier || "").trim();
      if (!secteur || !categorie || !metier) return sendJSON(res, 400, { error: "secteur, categorie et metier sont requis." });
      let sect = taxonomy.find(s => s.secteur.toLowerCase() === secteur.toLowerCase());
      if (!sect) { sect = { secteur, cats: [] }; taxonomy.push(sect); }
      let cat = sect.cats.find(c => c.cat.toLowerCase() === categorie.toLowerCase());
      if (!cat) { cat = { cat: categorie, metiers: [] }; sect.cats.push(cat); }
      if (!cat.metiers.includes(metier)) cat.metiers.push(metier);
      log("taxonomy_add", user.id, { secteur, categorie, metier });
      saveAll();
      return sendJSON(res, 201, { ok: true, taxonomy });
    }
    const catRenameMatch = pathname.match(/^\/api\/taxonomy\/rename$/);
    if (catRenameMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const body = await readBody(req);
      const sect = taxonomy.find(s => s.secteur === body.secteur);
      if (!sect) return sendJSON(res, 404, { error: "Secteur introuvable." });
      const cat = sect.cats.find(c => c.cat === body.ancienNom);
      if (!cat) return sendJSON(res, 404, { error: "Catégorie introuvable." });
      cat.cat = body.nouveauNom;
      log("taxonomy_rename", user.id, body);
      saveAll();
      return sendJSON(res, 200, { ok: true, taxonomy });
    }

    // ================= PROFESSIONNELS =================
    if (pathname === "/api/professionals" && method === "GET") {
      const q = parsed.query || {};
      let list = professionals.filter(p => p.badge !== "refuse");
      if (q.metier) list = list.filter(p => p.metier.toLowerCase().includes(String(q.metier).toLowerCase()));
      return sendJSON(res, 200, list.map(publicPro));
    }
    if (pathname === "/api/professionals/me" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      const p = professionals.find(x => x.userId === user.id) || null;
      return sendJSON(res, 200, { professional: p });
    }
    if (pathname === "/api/professionals/register" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["pro"])) return;
      const body = await readBody(req);
      const metier = (body.metier || "").trim();
      const zone = (body.zone || "").trim();
      const tel = (body.tel || "").trim();
      const whatsapp = (body.whatsapp || "").trim();
      const emailPro = (body.emailPro || "").trim();
      const tarif = (body.tarif || "").trim();
      const momoOperator = (body.momoOperator || "").trim(); // wave | orange_money | mtn_money | moov_money
      const momoNumber = (body.momoNumber || "").trim(); // numéro Mobile Money où MIMOYE dépose son paiement
      if (!metier || !zone || !tel) return sendJSON(res, 400, { error: "metier, zone et tel sont requis." });
      const init = (user.name || "NN").split(" ").filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "NN";
      let existing = professionals.find(p => p.userId === user.id);
      if (existing) {
        Object.assign(existing, { metier, zone, tel, whatsapp, emailPro, tarif: tarif || existing.tarif, momoOperator: momoOperator || existing.momoOperator, momoNumber: momoNumber || existing.momoNumber, badge: "attente" });
      } else {
        existing = { id: newId("p"), userId: user.id, name: user.name, metier, zone, tel, whatsapp, emailPro, tarif: tarif || "Non renseigné", momoOperator, momoNumber, badge: "attente", note: 0, avis: 0, init };
        professionals.push(existing);
      }
      log("pro_register", user.id, { professionalId: existing.id });
      saveAll();
      return sendJSON(res, 201, { ok: true, professional: existing });
    }

    // ================= ADMIN : ANNUAIRE COMPLET (contacts privés) =================
    // Seul l'admin peut voir ces champs. Chaque consultation et chaque communication au
    // client sont journalisées (voir audit_logs) — traçabilité exigée par le cahier des charges.
    if (pathname === "/api/admin/professionals" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      log("admin_view_contacts", user.id, { count: professionals.length });
      saveAll();
      return sendJSON(res, 200, professionals.map(adminPro));
    }
    if (pathname === "/api/admin/share-contact" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const body = await readBody(req);
      const pro = professionals.find(p => p.id === body.professionalId);
      const reqObj = requests.find(r => r.id === body.requestId);
      if (!pro || !reqObj || reqObj.professionalId !== pro.id) return sendJSON(res, 400, { error: "Professionnel ou demande introuvable, ou ne correspondent pas." });
      const field = body.field; // "tel" | "whatsapp" | "emailPro"
      if (!["tel", "whatsapp", "emailPro"].includes(field) || !pro[field]) return sendJSON(res, 400, { error: "Information demandée indisponible pour ce professionnel." });
      const value = pro[field];
      const client = users.find(u => u.id === reqObj.clientId);
      notify(reqObj.clientId, "contact_shared", `MIMOYE vous communique un contact pour votre demande : ${field === "tel" ? "Téléphone" : field === "whatsapp" ? "WhatsApp" : "Email"} — ${value}${body.motif ? " (" + body.motif + ")" : ""}`);
      log("contact_shared", user.id, { professionalId: pro.id, clientId: reqObj.clientId, field, motif: body.motif || null, requestId: reqObj.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, sharedWith: client ? client.name : reqObj.clientId, field, value });
    }

    // ================= ADMIN : VÉRIFICATIONS =================
    if (pathname === "/api/admin/verifications" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, {
        pending: professionals.filter(p => p.badge === "attente"),
        verified: professionals.filter(p => p.badge === "verifie" || p.badge === "certifie"),
        rejected: professionals.filter(p => p.badge === "refuse")
      });
    }
    const verifMatch = pathname.match(/^\/api\/admin\/professionals\/([^\/]+)\/(approve|reject)$/);
    if (verifMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const pro = professionals.find(p => p.id === verifMatch[1]);
      if (!pro) return sendJSON(res, 404, { error: "Professionnel introuvable." });
      pro.badge = verifMatch[2] === "approve" ? "verifie" : "refuse";
      log("verification_" + verifMatch[2], user.id, { professionalId: pro.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, professional: pro });
    }

    // ================= ADMIN : COMMISSIONS =================
    if (pathname === "/api/admin/commissions" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, commissions);
    }
    if (pathname === "/api/admin/commissions" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const body = await readBody(req);
      const categorie = (body.categorie || "").trim();
      const taux = Number(body.taux);
      if (!categorie || isNaN(taux) || taux < 0 || taux > 100) return sendJSON(res, 400, { error: "categorie et taux (0-100) requis." });
      commissions[categorie] = taux;
      log("commission_set", user.id, { categorie, taux });
      saveAll();
      return sendJSON(res, 200, { ok: true, commissions });
    }

    // ================= DEMANDES / DEVIS / PAIEMENT (flux simplifié) =================
    if (pathname === "/api/requests" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["client"])) return;
      const body = await readBody(req);
      const pro = professionals.find(p => p.id === body.professionalId);
      if (!pro) return sendJSON(res, 400, { error: "Professionnel introuvable." });
      const reqObj = {
        id: newId("req"), clientId: user.id, professionalId: pro.id,
        description: body.description || "", dateSouhaitee: body.dateSouhaitee || "", budget: body.budget || "",
        status: "SEARCHING", quote: null, payment: null, rating: null, createdAt: Date.now()
      };
      requests.push(reqObj);
      log("request_create", user.id, { requestId: reqObj.id });
      saveAll();
      return sendJSON(res, 201, { ok: true, request: reqObj });
    }
    if (pathname === "/api/requests/mine" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      return sendJSON(res, 200, requests.filter(r => r.clientId === user.id));
    }
    if (pathname === "/api/requests/received" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["pro"])) return;
      const pro = professionals.find(p => p.userId === user.id);
      if (!pro) return sendJSON(res, 200, []);
      return sendJSON(res, 200, requests.filter(r => r.professionalId === pro.id));
    }
    const quoteMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/quote$/);
    if (quoteMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["pro"])) return;
      const reqObj = requests.find(r => r.id === quoteMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      const pro = professionals.find(p => p.userId === user.id);
      if (!pro || reqObj.professionalId !== pro.id) return sendJSON(res, 403, { error: "Cette demande ne vous est pas adressée." });
      const body = await readBody(req);
      reqObj.quote = { amount: body.amount || "", note: body.note || "" };
      reqObj.status = "QUOTE_SENT";
      log("quote_sent", user.id, { requestId: reqObj.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }
    const acceptMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/accept$/);
    if (acceptMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const reqObj = requests.find(r => r.id === acceptMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (reqObj.clientId !== user.id) return sendJSON(res, 403, { error: "Accès refusé." });
      if (reqObj.status !== "QUOTE_SENT") return sendJSON(res, 400, { error: "Aucun devis à accepter pour le moment." });
      reqObj.status = "QUOTE_ACCEPTED";
      log("quote_accept", user.id, { requestId: reqObj.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }
    // ================= PAIEMENT WAVE =================
    // ================= PAIEMENT MOBILE MONEY (Wave, Orange Money, MTN Money, Moov Money) =================
    // Deux circuits cohabitent, sélectionnés automatiquement selon l'opérateur choisi :
    //
    // 1) CIRCUIT AUTOMATIQUE — uniquement Wave, si WAVE_API_KEY définie : appel réel à
    //    l'API Checkout de Wave (https://docs.wave.com/checkout). On crée une session de
    //    paiement, on renvoie au client l'URL "wave_launch_url" vers laquelle son navigateur
    //    doit être redirigé ; il paie dans l'app Wave puis Wave confirme automatiquement via
    //    webhook signé (POST /api/webhooks/wave) — voir finalizeMobileMoneyPayment ci-dessous.
    //
    // 2) CIRCUIT MANUEL (tous les opérateurs, y compris Wave sans clé API) : merchantAccounts
    //    contient le vrai numéro marchand MIMOYE pour l'opérateur choisi, modifiable par
    //    l'administrateur (voir /api/admin/merchant-accounts). Le client envoie réellement
    //    l'argent sur ce numéro via l'app de son opérateur, indique la référence de sa
    //    transaction, et un administrateur MIMOYE confirme après vérification manuelle. Ce
    //    n'est pas une simulation : c'est un vrai paiement, avec un contrôle humain au lieu
    //    d'un webhook automatique.
    const payInitMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/pay-initiate$/);
    if (payInitMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const reqObj = requests.find(r => r.id === payInitMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (reqObj.clientId !== user.id) return sendJSON(res, 403, { error: "Accès refusé." });
      if (reqObj.status !== "QUOTE_ACCEPTED") return sendJSON(res, 400, { error: "Aucun devis accepté à payer pour cette demande." });
      const montant = Number(reqObj.quote && reqObj.quote.amount) || 0;
      const body = await readBody(req);
      const operator = ["wave", "orange_money", "mtn_money", "moov_money"].includes(body.operator) ? body.operator : "wave";

      if (operator === "wave" && WAVE_CONFIG.liveReady) {
        const base = publicBaseUrl(req);
        try {
          const session = await createWaveCheckoutSession({
            amount: montant, currency: "XOF", clientReference: reqObj.id,
            successUrl: base + "/?paiement=succes&requestId=" + reqObj.id,
            errorUrl: base + "/?paiement=erreur&requestId=" + reqObj.id
          });
          reqObj.payment = { status: "PENDING_CONFIRMATION", operator, mode: "wave_api", montant, reference: session.id, waveLaunchUrl: session.wave_launch_url, initiatedAt: Date.now() };
          log("payment_wave_api_initiated", user.id, { requestId: reqObj.id, montant, checkoutId: session.id });
          saveAll();
          return sendJSON(res, 200, { ok: true, request: reqObj, redirectUrl: session.wave_launch_url });
        } catch (e) {
          log("payment_wave_api_error", user.id, { requestId: reqObj.id, error: e.message });
          return sendJSON(res, 502, { error: "L'API Wave n'a pas pu créer la session de paiement : " + e.message });
        }
      }

      const merchantNumber = merchantAccounts[operator];
      if (!merchantNumber) return sendJSON(res, 503, { error: `Numéro marchand ${MOMO_OPERATOR_LABELS[operator]} non configuré. Contactez l'administrateur MIMOYE.` });
      reqObj.payment = { status: "PENDING_CONFIRMATION", operator, mode: "manual", merchantNumber, montant, reference: newId("txn"), initiatedAt: Date.now() };
      log("payment_momo_initiated", user.id, { requestId: reqObj.id, montant, operator });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj, instructions: `Envoyez ${montant} FCFA via ${MOMO_OPERATOR_LABELS[operator]} au numéro marchand MIMOYE : ${merchantNumber}. Une fois l'envoi effectué, indiquez la référence de votre transaction pour confirmation.` });
    }
    // Numéros marchands Mobile Money MIMOYE, gérés par l'administrateur.
    if (pathname === "/api/admin/merchant-accounts" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, merchantAccounts);
    }
    if (pathname === "/api/merchant-accounts" && method === "GET") {
      // Accessible à tout utilisateur connecté : le client doit voir le numéro à créditer.
      const user = requireAuth(); if (!user) return;
      return sendJSON(res, 200, merchantAccounts);
    }
    if (pathname === "/api/admin/merchant-accounts" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const body = await readBody(req);
      ["wave", "orange_money", "mtn_money", "moov_money"].forEach(op => {
        if (typeof body[op] === "string") merchantAccounts[op] = body[op].trim();
      });
      log("merchant_accounts_update", user.id, merchantAccounts);
      saveAll();
      return sendJSON(res, 200, { ok: true, merchantAccounts });
    }
    // Utilisée par le webhook Wave (confirmation automatique), par
    // /api/admin/requests/:id/confirm-payment (confirmation manuelle) et par le circuit
    // Mobile Money manuel générique, pour garantir que le calcul de commission et le
    // crédit du portefeuille pro suivent toujours exactement la même logique.
    function finalizeMobileMoneyPayment(reqObj, confirmedByUserId) {
      const pro = professionals.find(p => p.id === reqObj.professionalId);
      const montant = reqObj.payment.montant;
      const tauxCommission = commissionRateFor(pro ? pro.metier : "");
      const commissionAmount = Math.round(montant * tauxCommission / 100);
      const montantPro = montant - commissionAmount;
      reqObj.payment.status = "SUCCESS";
      reqObj.payment.confirmedBy = confirmedByUserId || null;
      reqObj.payment.confirmedAt = Date.now();
      reqObj.payment.tauxCommission = tauxCommission;
      reqObj.payment.commissionAmount = commissionAmount;
      reqObj.payment.montantPro = montantPro;
      reqObj.status = "PAID";
      if (pro) {
        const w = getWallet(pro.id);
        w.pending += montantPro;
        notify(pro.userId, "payment", `Paiement client confirmé pour une prestation : ${montantPro} FCFA vous seront reversés par MIMOYE sur votre compte Mobile Money (commission MIMOYE : ${commissionAmount} FCFA). L'administration vous préviendra dès le dépôt effectué.`);
      }
      notify(reqObj.clientId, "payment", `Votre paiement de ${montant} FCFA a été confirmé.`);
      log("payment_wave_confirmed", confirmedByUserId, { requestId: reqObj.id, montant, commissionAmount, montantPro });
      saveAll();
    }
    const payConfirmClientMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/pay-confirm-sent$/);
    if (payConfirmClientMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const reqObj = requests.find(r => r.id === payConfirmClientMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (reqObj.clientId !== user.id) return sendJSON(res, 403, { error: "Accès refusé." });
      if (!reqObj.payment || reqObj.payment.status !== "PENDING_CONFIRMATION") return sendJSON(res, 400, { error: "Aucun paiement en attente pour cette demande." });
      const body = await readBody(req);
      reqObj.payment.clientReference = (body.waveReference || body.reference || "").trim();
      reqObj.payment.status = "PENDING_ADMIN_VERIFICATION";
      reqObj.payment.declaredAt = Date.now();
      notify(null, "payment", `Un client déclare avoir payé ${reqObj.payment.montant} FCFA via ${MOMO_OPERATOR_LABELS[reqObj.payment.operator] || "Mobile Money"} pour la demande ${reqObj.id} — référence indiquée : ${reqObj.payment.clientReference || "non fournie"}. Vérification requise.`);
      log("payment_wave_declared", user.id, { requestId: reqObj.id, reference: reqObj.payment.clientReference });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }
    if (pathname === "/api/admin/payments/pending" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, requests.filter(r => r.payment && r.payment.status === "PENDING_ADMIN_VERIFICATION"));
    }
    const payConfirmAdminMatch = pathname.match(/^\/api\/admin\/requests\/([^\/]+)\/confirm-payment$/);
    if (payConfirmAdminMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const reqObj = requests.find(r => r.id === payConfirmAdminMatch[1]);
      if (!reqObj || !reqObj.payment || reqObj.payment.status !== "PENDING_ADMIN_VERIFICATION") return sendJSON(res, 400, { error: "Aucun paiement à confirmer pour cette demande." });
      finalizeMobileMoneyPayment(reqObj, user.id);
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }
    const payRejectAdminMatch = pathname.match(/^\/api\/admin\/requests\/([^\/]+)\/reject-payment$/);
    if (payRejectAdminMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const reqObj = requests.find(r => r.id === payRejectAdminMatch[1]);
      if (!reqObj || !reqObj.payment) return sendJSON(res, 400, { error: "Aucun paiement pour cette demande." });
      reqObj.payment.status = "FAILED";
      const body = await readBody(req);
      reqObj.payment.rejectReason = body.reason || "";
      notify(reqObj.clientId, "payment", `Votre déclaration de paiement n'a pas pu être confirmée par MIMOYE${body.reason ? " : " + body.reason : ""}. Merci de réessayer ou de nous contacter.`);
      log("payment_wave_rejected", user.id, { requestId: reqObj.id, reason: body.reason || "" });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }

    const rateMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/rate$/);
    if (rateMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const reqObj = requests.find(r => r.id === rateMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (reqObj.clientId !== user.id) return sendJSON(res, 403, { error: "Accès refusé." });
      if (reqObj.rating) return sendJSON(res, 400, { error: "Cette demande a déjà été évaluée." });
      const body = await readBody(req);
      const stars = Number(body.stars);
      if (!stars || stars < 1 || stars > 5) return sendJSON(res, 400, { error: "Note entre 1 et 5 requise." });
      reqObj.rating = { stars, comment: body.comment || "", at: Date.now() };
      const pro = professionals.find(p => p.id === reqObj.professionalId);
      if (pro) {
        const totalPoints = (pro.note || 0) * (pro.avis || 0) + stars;
        pro.avis = (pro.avis || 0) + 1;
        pro.note = Math.round((totalPoints / pro.avis) * 10) / 10;
      }
      log("rate", user.id, { requestId: reqObj.id, stars });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj });
    }

    // ================= MOT DE PASSE OUBLIÉ (jeton réel, livraison à brancher) =================
    // Mécanisme réel : jeton aléatoire, à usage unique, expirant après 1h, stocké côté serveur.
    // La LIVRAISON (email/SMS) nécessite un fournisseur externe (ex. SendGrid, Twilio) non
    // disponible dans cet environnement. En attendant, le jeton est renvoyé dans la réponse API
    // avec la mention explicite "DEV MODE" — à remplacer par un envoi réel une fois une clé API
    // fournie en variable d'environnement (voir README).
    if (pathname === "/api/auth/forgot-password" && method === "POST") {
      const body = await readBody(req);
      const email = (body.email || "").trim().toLowerCase();
      const user = users.find(u => u.email === email);
      // Réponse volontairement identique que le compte existe ou non (évite de révéler les emails inscrits).
      if (!user) return sendJSON(res, 200, { ok: true, devNote: "Si un compte existe avec cet email, un jeton a été généré." });
      const token = crypto.randomBytes(24).toString("hex");
      resetTokens[token] = { userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 };
      saveAll();
      log("password_reset_requested", user.id);
      const emailConfigured = !!process.env.EMAIL_PROVIDER_API_KEY;
      if (emailConfigured) {
        // Point d'intégration futur : envoyer `token` par email ici avec le fournisseur configuré.
      }
      return sendJSON(res, 200, {
        ok: true,
        devMode: !emailConfigured,
        devNote: emailConfigured ? "Email envoyé." : "DEV MODE (aucun fournisseur email configuré) — jeton renvoyé directement ici au lieu d'être envoyé par email.",
        resetToken: emailConfigured ? undefined : token
      });
    }
    if (pathname === "/api/auth/reset-password" && method === "POST") {
      const body = await readBody(req);
      const token = body.token || "";
      const entry = resetTokens[token];
      if (!entry || entry.expiresAt < Date.now()) return sendJSON(res, 400, { error: "Jeton invalide ou expiré. Refaites une demande de réinitialisation." });
      if (!body.password || body.password.length < 6) return sendJSON(res, 400, { error: "Mot de passe : 6 caractères minimum." });
      const user = users.find(u => u.id === entry.userId);
      if (!user) return sendJSON(res, 404, { error: "Compte introuvable." });
      const { salt, hash } = hashPassword(body.password);
      user.salt = salt; user.hash = hash;
      delete resetTokens[token];
      Object.keys(sessions).forEach(t => { if (sessions[t].userId === user.id) delete sessions[t]; }); // déconnecte toutes les sessions existantes
      log("password_reset_done", user.id);
      saveAll();
      return sendJSON(res, 200, { ok: true });
    }

    // ================= PROFIL (modification) =================
    if (pathname === "/api/auth/change-password" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const body = await readBody(req);
      if (!verifyPassword(body.currentPassword || "", user.salt, user.hash)) return sendJSON(res, 401, { error: "Mot de passe actuel incorrect." });
      if (!body.newPassword || body.newPassword.length < 6) return sendJSON(res, 400, { error: "Nouveau mot de passe : 6 caractères minimum." });
      const { salt, hash } = hashPassword(body.newPassword);
      user.salt = salt; user.hash = hash;
      log("password_changed", user.id);
      saveAll();
      return sendJSON(res, 200, { ok: true });
    }
    if (pathname === "/api/auth/profile" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const body = await readBody(req);
      if (body.name) user.name = String(body.name).trim();
      if (body.phone != null) user.phone = String(body.phone).trim();
      log("profile_updated", user.id);
      saveAll();
      return sendJSON(res, 200, { ok: true, user: publicUser(user) });
    }

    // ================= PORTEFEUILLE PROFESSIONNEL & RETRAITS =================
    if (pathname === "/api/pro/wallet" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["pro", "entreprise"])) return;
      const pro = professionals.find(p => p.userId === user.id);
      if (!pro) return sendJSON(res, 200, { wallet: { available: 0, pending: 0 }, withdrawals: [] });
      return sendJSON(res, 200, { wallet: getWallet(pro.id), withdrawals: withdrawals.filter(w => w.professionalId === pro.id) });
    }
    if (pathname === "/api/pro/withdrawals" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["pro", "entreprise"])) return;
      const pro = professionals.find(p => p.userId === user.id);
      if (!pro) return sendJSON(res, 400, { error: "Profil professionnel introuvable." });
      const body = await readBody(req);
      const montant = Number(body.montant);
      const w = getWallet(pro.id);
      if (!montant || montant <= 0) return sendJSON(res, 400, { error: "Montant invalide." });
      if (montant > w.available) return sendJSON(res, 400, { error: "Montant supérieur au solde disponible (" + w.available + " FCFA)." });
      w.available -= montant;
      const wd = { id: newId("wd"), professionalId: pro.id, montant, status: "PENDING", createdAt: Date.now() };
      withdrawals.push(wd);
      log("withdrawal_requested", user.id, { withdrawalId: wd.id, montant });
      saveAll();
      return sendJSON(res, 201, { ok: true, withdrawal: wd, wallet: w });
    }
    // Versement DIRECT de l'administrateur au professionnel, une fois le paiement du
    // client confirmé (reqObj.payment.status === "SUCCESS") — indépendamment du fait
    // que la prestation soit déjà réalisée ou non ("avant ou après service fait").
    // La commission MIMOYE a déjà été défalquée au moment de la confirmation du
    // paiement client (voir finalizeMobileMoneyPayment) : montantPro est le solde net.
    if (pathname === "/api/admin/payouts-pending" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const list = requests.filter(r => r.payment && r.payment.status === "SUCCESS" && !r.payment.proPayout).map(r => {
        const pro = professionals.find(p => p.id === r.professionalId);
        return {
          requestId: r.id, professionalId: r.professionalId, professionalName: pro ? pro.name : "—",
          momoOperator: pro ? pro.momoOperator : "", momoNumber: pro ? pro.momoNumber : "",
          montantPro: r.payment.montantPro, commissionAmount: r.payment.commissionAmount,
          serviceStatus: r.rating ? "Prestation évaluée" : "Prestation en cours ou non confirmée"
        };
      });
      return sendJSON(res, 200, list);
    }
    const payoutProMatch = pathname.match(/^\/api\/admin\/requests\/([^\/]+)\/payout-pro$/);
    if (payoutProMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const reqObj = requests.find(r => r.id === payoutProMatch[1]);
      if (!reqObj || !reqObj.payment || reqObj.payment.status !== "SUCCESS") return sendJSON(res, 400, { error: "Le paiement du client n'a pas encore été confirmé pour cette demande." });
      if (reqObj.payment.proPayout) return sendJSON(res, 400, { error: "Le professionnel a déjà été payé pour cette demande." });
      const pro = professionals.find(p => p.id === reqObj.professionalId);
      if (!pro) return sendJSON(res, 404, { error: "Professionnel introuvable." });
      const body = await readBody(req);
      const reference = (body.reference || "").trim();
      const montantPro = reqObj.payment.montantPro;
      const w = getWallet(pro.id);
      w.pending = Math.max(0, w.pending - montantPro); // versé directement, ne transite pas par "disponible"
      const wd = {
        id: newId("wd"), professionalId: pro.id, montant: montantPro, status: "PAID",
        requestId: reqObj.id, momoOperator: pro.momoOperator || "", momoNumber: pro.momoNumber || "",
        reference, createdAt: Date.now(), paidAt: Date.now(), paidBy: user.id
      };
      withdrawals.push(wd);
      reqObj.payment.proPayout = { withdrawalId: wd.id, montant: montantPro, reference, at: Date.now(), by: user.id };
      if (pro.userId) notify(pro.userId, "payment", `MIMOYE a déposé ${montantPro} FCFA sur votre compte ${MOMO_OPERATOR_LABELS[pro.momoOperator] || "Mobile Money"}${reference ? " (référence : " + reference + ")" : ""}.`);
      log("payout_pro", user.id, { requestId: reqObj.id, professionalId: pro.id, montant: montantPro, reference });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj, withdrawal: wd });
    }
    if (pathname === "/api/admin/withdrawals" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, withdrawals);
    }
    const wdMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^\/]+)\/(pay|reject)$/);
    if (wdMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const wd = withdrawals.find(w => w.id === wdMatch[1]);
      if (!wd) return sendJSON(res, 404, { error: "Retrait introuvable." });
      if (wd.status !== "PENDING") return sendJSON(res, 400, { error: "Ce retrait a déjà été traité." });
      if (wdMatch[2] === "reject") {
        const w = getWallet(wd.professionalId);
        w.available += wd.montant; // recrédit en cas de refus
        wd.status = "REJECTED";
      } else {
        wd.status = "PAID"; wd.paidAt = Date.now();
        // MODE SANDBOX — le virement réel vers Mobile Money du professionnel nécessite l'API du
        // fournisseur de paiement, à brancher via variable d'environnement.
      }
      log("withdrawal_" + wdMatch[2], user.id, { withdrawalId: wd.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, withdrawal: wd });
    }
    // Reversement du "pending" vers "available" — l'admin valide le déblocage (délai de garantie).
    if (pathname === "/api/admin/wallets" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, professionals.filter(p => p.userId).map(p => ({ professionalId: p.id, name: p.name, wallet: getWallet(p.id) })));
    }
    const releaseMatch = pathname.match(/^\/api\/admin\/wallets\/([^\/]+)\/release$/);
    if (releaseMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const w = getWallet(releaseMatch[1]);
      const amount = w.pending;
      w.available += w.pending; w.pending = 0;
      log("wallet_release", user.id, { professionalId: releaseMatch[1], amount });
      saveAll();
      return sendJSON(res, 200, { ok: true, wallet: w });
    }

    // ================= LITIGES =================
    if (pathname === "/api/disputes" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const body = await readBody(req);
      const reqObj = requests.find(r => r.id === body.requestId);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      const pro = professionals.find(p => p.id === reqObj.professionalId);
      const isClient = reqObj.clientId === user.id;
      const isPro = pro && pro.userId === user.id;
      if (!isClient && !isPro) return sendJSON(res, 403, { error: "Vous n'êtes pas partie prenante de cette demande." });
      if (!body.motif || !body.description) return sendJSON(res, 400, { error: "motif et description requis." });
      const d = { id: newId("disp"), requestId: reqObj.id, openedBy: user.id, openedByRole: isClient ? "client" : "pro", motif: body.motif, description: body.description, status: "OUVERT", decision: null, createdAt: Date.now() };
      disputes.push(d);
      notify(null, "dispute", `Nouveau litige ouvert sur la demande ${reqObj.id}.`); // notif admin générique (userId null = broadcast admin, filtré côté lecture)
      log("dispute_open", user.id, { disputeId: d.id });
      saveAll();
      return sendJSON(res, 201, { ok: true, dispute: d });
    }
    if (pathname === "/api/disputes/mine" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      const pro = professionals.find(p => p.userId === user.id);
      return sendJSON(res, 200, disputes.filter(d => d.openedBy === user.id || (pro && requests.find(r => r.id === d.requestId && r.professionalId === pro.id))));
    }
    if (pathname === "/api/admin/disputes" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, disputes);
    }
    const disputeCloseMatch = pathname.match(/^\/api\/admin\/disputes\/([^\/]+)\/close$/);
    if (disputeCloseMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const d = disputes.find(x => x.id === disputeCloseMatch[1]);
      if (!d) return sendJSON(res, 404, { error: "Litige introuvable." });
      const body = await readBody(req);
      d.status = "CLOS"; d.decision = body.decision || ""; d.closedAt = Date.now();
      log("dispute_close", user.id, { disputeId: d.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, dispute: d });
    }

    // ================= NOTIFICATIONS =================
    if (pathname === "/api/notifications" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      const list = notifications.filter(n => n.userId === user.id || (n.userId === null && user.role === "admin"));
      return sendJSON(res, 200, list.slice().reverse().slice(0, 50));
    }
    if (pathname === "/api/notifications/read-all" && method === "POST") {
      const user = requireAuth(); if (!user) return;
      notifications.forEach(n => { if (n.userId === user.id) n.read = true; });
      saveAll();
      return sendJSON(res, 200, { ok: true });
    }

    // ================= PAIEMENT WAVE : statut config + webhook =================
    if (pathname === "/api/admin/payment-config" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, {
        paymentNumberConfigured: !!WAVE_CONFIG.paymentNumber,
        liveReady: WAVE_CONFIG.liveReady,
        webhookConfigured: !!WAVE_CONFIG.webhookSecret,
        note: WAVE_CONFIG.liveReady
          ? "Clé API Wave configurée — les paiements passent par l'API Checkout réelle de Wave (redirection + webhook)."
          : "WAVE_API_KEY non définie : les paiements passent par le circuit manuel (numéro marchand Wave + vérification par un administrateur)."
      });
    }
    // Reçoit les confirmations de paiement en temps réel de Wave (checkout.session.completed /
    // checkout.session.payment_failed). Signature vérifiée sur le corps BRUT de la requête, en
    // HMAC-SHA256, selon https://docs.wave.com/webhook — voir verifyWaveWebhookSignature.
    if (pathname === "/api/webhooks/wave" && method === "POST") {
      if (!WAVE_CONFIG.webhookSecret) return sendJSON(res, 503, { error: "Webhook Wave non configuré (WAVE_WEBHOOK_SECRET absent)." });
      const rawBody = await readRawBody(req);
      const signature = req.headers["wave-signature"];
      if (!verifyWaveWebhookSignature(rawBody, signature)) {
        log("webhook_wave_invalid_signature", null, {});
        return sendJSON(res, 401, { error: "Signature Wave-Signature invalide." });
      }
      let event = null;
      try { event = JSON.parse(rawBody); } catch (e) { return sendJSON(res, 400, { error: "Corps JSON invalide." }); }
      const data = event && event.data;
      if (event && event.type === "checkout.session.completed" && data) {
        const reqObj = requests.find(r => (r.payment && r.payment.reference === data.id) || r.id === data.client_reference);
        if (reqObj && reqObj.payment && reqObj.payment.status === "PENDING_CONFIRMATION") {
          finalizeMobileMoneyPayment(reqObj, null);
        }
      } else if (event && event.type === "checkout.session.payment_failed" && data) {
        const reqObj = requests.find(r => r.payment && r.payment.reference === data.id);
        if (reqObj && reqObj.payment) {
          reqObj.payment.status = "FAILED";
          reqObj.payment.rejectReason = (data.last_payment_error && data.last_payment_error.message) || "Paiement Wave échoué.";
          notify(reqObj.clientId, "payment", `Votre paiement Wave n'a pas abouti : ${reqObj.payment.rejectReason}`);
          log("payment_wave_api_failed", null, { requestId: reqObj.id });
          saveAll();
        }
      }
      // Toujours répondre 2xx rapidement (voir doc Wave) — même pour un événement ignoré,
      // sans quoi Wave retentera inutilement l'envoi du webhook pendant 3 jours.
      return sendJSON(res, 200, { ok: true });
    }

    // ================= ADMIN : DEMANDES (pour retrouver les références utiles au partage de contact) =================
    if (pathname === "/api/admin/requests" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const enriched = requests.slice().reverse().slice(0, 100).map(r => {
        const client = users.find(u => u.id === r.clientId);
        const pro = professionals.find(p => p.id === r.professionalId);
        return { id: r.id, clientName: client ? client.name : "—", professionalId: r.professionalId, professionalName: pro ? pro.name : "—", status: r.status, description: r.description, createdAt: r.createdAt };
      });
      return sendJSON(res, 200, enriched);
    }

    // ================= ADMIN : STATS =================
    if (pathname === "/api/admin/stats" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      const totalCommissions = requests.reduce((n, r) => n + (r.payment && r.payment.commissionAmount ? r.payment.commissionAmount : 0), 0);
      const totalVolume = requests.reduce((n, r) => n + (r.payment && r.payment.montant ? r.payment.montant : 0), 0);
      return sendJSON(res, 200, {
        totalUsers: users.length,
        totalPros: professionals.length,
        verifiedPros: professionals.filter(p => p.badge === "verifie" || p.badge === "certifie").length,
        pendingPros: professionals.filter(p => p.badge === "attente").length,
        totalRequests: requests.length,
        totalMetiers: taxonomy.reduce((n, s) => n + s.cats.reduce((m, c) => m + c.metiers.length, 0), 0),
        totalVolume, totalCommissions,
        pendingWithdrawals: withdrawals.filter(w => w.status === "PENDING").length,
        openDisputes: disputes.filter(d => d.status === "OUVERT").length
      });
    }

    return sendJSON(res, 404, { error: "Route introuvable : " + method + " " + pathname });
  } catch (e) {
    console.error(e);
    return sendJSON(res, 500, { error: "Erreur serveur." });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("MIMOYE backend démarré sur http://localhost:" + PORT);
});

module.exports = server;
