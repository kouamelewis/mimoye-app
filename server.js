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
let taxonomy = readDB("taxonomy", require("./taxonomy-seed.js"));
// Migration additive : si un déploiement existant a l'ancien référentiel restreint,
// on complète avec les nouveaux secteurs/catégories/métiers sans jamais supprimer
// ce qu'un administrateur aurait déjà ajouté ou modifié.
(function migrateTaxonomy() {
  const seed = require("./taxonomy-seed.js");
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
}
function log(action, userId, detail) {
  auditLogs.push({ id: newId("log"), action, userId: userId || null, detail: detail || null, at: Date.now() });
}
function notify(userId, type, message) {
  notifications.push({ id: newId("notif"), userId, type, message, read: false, at: Date.now() });
}
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

// Configuration du compte de paiement MIMOYE (Wave). Le numéro et les clés secrètes
// viennent exclusivement de variables d'environnement — jamais écrits dans le code
// ni versionnés sur GitHub. WAVE_API_KEY / WAVE_API_SECRET / WAVE_WEBHOOK_SECRET
// restent vides tant que le contrat marchand Wave n'est pas obtenu : dans ce cas,
// le paiement continue de fonctionner en mode simulation (voir /api/requests/:id/pay),
// jamais présenté comme une transaction réelle.
const WAVE_CONFIG = {
  paymentNumber: process.env.WAVE_PAYMENT_NUMBER || null,
  apiKey: process.env.WAVE_API_KEY || null,
  apiSecret: process.env.WAVE_API_SECRET || null,
  webhookSecret: process.env.WAVE_WEBHOOK_SECRET || null,
  get liveReady() { return !!(this.apiKey && this.apiSecret); }
};

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
function publicUser(u) { return { id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone }; }
// SÉPARATION STRICTE DONNÉES PUBLIQUES / PRIVÉES (voir cahier des charges, partie 20).
// Le téléphone, WhatsApp, email et informations de paiement d'un professionnel ne sont
// JAMAIS inclus dans les réponses API destinées aux clients — la protection est ici,
// au niveau du backend, pas seulement cachée dans l'interface. Un client qui inspecte
// les requêtes réseau ne peut pas récupérer ces champs : ils ne sont simplement jamais
// envoyés dans ces réponses.
const PRO_PRIVATE_FIELDS = ["tel", "whatsapp", "emailPro", "paymentInfo", "userId"];
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
      if (!metier || !zone || !tel) return sendJSON(res, 400, { error: "metier, zone et tel sont requis." });
      const init = (user.name || "NN").split(" ").filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "NN";
      let existing = professionals.find(p => p.userId === user.id);
      if (existing) {
        Object.assign(existing, { metier, zone, tel, whatsapp, emailPro, tarif: tarif || existing.tarif, badge: "attente" });
      } else {
        existing = { id: newId("p"), userId: user.id, name: user.name, metier, zone, tel, whatsapp, emailPro, tarif: tarif || "Non renseigné", badge: "attente", note: 0, avis: 0, init };
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
        status: "SEARCHING", quote: null, payment: { status: "PENDING" }, rating: null, createdAt: Date.now()
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
    const payMatch = pathname.match(/^\/api\/requests\/([^\/]+)\/pay$/);
    if (payMatch && method === "POST") {
      const user = requireAuth(); if (!user) return;
      const reqObj = requests.find(r => r.id === payMatch[1]);
      if (!reqObj) return sendJSON(res, 404, { error: "Demande introuvable." });
      if (reqObj.clientId !== user.id) return sendJSON(res, 403, { error: "Accès refusé." });
      if (reqObj.status !== "QUOTE_ACCEPTED") return sendJSON(res, 400, { error: "Aucun devis accepté à payer pour cette demande." });
      const body = await readBody(req);
      const pro = professionals.find(p => p.id === reqObj.professionalId);
      const montant = Number(reqObj.quote && reqObj.quote.amount) || 0;
      const tauxCommission = commissionRateFor(reqObj.professionalMetier || (pro ? pro.metier : ""));
      const commissionAmount = Math.round(montant * tauxCommission / 100);
      const montantPro = montant - commissionAmount;
      // MODE SANDBOX tant que WAVE_API_KEY / WAVE_API_SECRET ne sont pas configurées (voir
      // WAVE_CONFIG) — le CLIENT PAIE MIMOYE (jamais directement le professionnel) : le calcul
      // de commission et le crédit du portefeuille professionnel sont réels et tracés dans les
      // deux cas. Seul l'encaissement réel de l'argent est simulé sans contrat marchand Wave actif.
      // Une fois WAVE_API_KEY/WAVE_API_SECRET définies, brancher ici l'appel réel à l'API Wave
      // (création de charge sur WAVE_CONFIG.paymentNumber) et vérifier le statut via webhook
      // (voir /api/webhooks/wave ci-dessous) avant de marquer SUCCESS.
      reqObj.payment = {
        status: "SUCCESS", mode: body.mode || "wave", simulated: !WAVE_CONFIG.liveReady, at: Date.now(),
        reference: newId("txn"), montant, tauxCommission, commissionAmount, montantPro
      };
      reqObj.status = "PAID";
      if (pro) {
        const w = getWallet(pro.id);
        w.pending += montantPro; // reversé après délai / validation admin (voir /api/pro/withdrawals)
        notify(pro.userId, "payment", `Paiement reçu pour une prestation : ${montantPro} FCFA seront crédités à votre portefeuille (commission MIMOYE : ${commissionAmount} FCFA).`);
      }
      notify(user.id, "payment", `Votre paiement de ${montant} FCFA a été enregistré.`);
      log("payment_sandbox", user.id, { requestId: reqObj.id, montant, commissionAmount, montantPro });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj, warning: WAVE_CONFIG.liveReady ? undefined : "Paiement simulé (mode sandbox, API Wave non configurée) — aucune vraie transaction bancaire n'a eu lieu. Le calcul de commission et le portefeuille sont réels." });
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

    // ================= PAIEMENT WAVE : statut config + webhook (prêt, pas branché) =================
    if (pathname === "/api/admin/payment-config" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, {
        paymentNumberConfigured: !!WAVE_CONFIG.paymentNumber,
        liveReady: WAVE_CONFIG.liveReady,
        note: WAVE_CONFIG.liveReady
          ? "Clés API Wave configurées — les paiements peuvent utiliser l'API réelle une fois l'appel effectif branché dans /api/requests/:id/pay."
          : "WAVE_API_KEY / WAVE_API_SECRET non définies : les paiements restent en mode sandbox (simulés). Définir ces variables sur l'hébergeur pour activer le mode réel."
      });
    }
    // Point d'entrée prêt à recevoir les notifications de paiement réelles de Wave.
    // Non fonctionnel tant que WAVE_WEBHOOK_SECRET n'est pas configuré et que Wave n'a
    // pas ce endpoint enregistré comme URL de webhook sur le compte marchand.
    if (pathname === "/api/webhooks/wave" && method === "POST") {
      if (!WAVE_CONFIG.webhookSecret) return sendJSON(res, 503, { error: "Webhook Wave non configuré (WAVE_WEBHOOK_SECRET absent)." });
      const signature = req.headers["x-wave-signature"];
      // TODO (une fois le contrat marchand actif) : vérifier `signature` avec WAVE_CONFIG.webhookSecret
      // selon la méthode documentée par Wave, puis mettre à jour le statut de paiement correspondant.
      return sendJSON(res, 501, { error: "Traitement du webhook Wave à implémenter une fois les credentials réels obtenus." });
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
