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
let taxonomy = readDB("taxonomy", [
  { secteur: "Habitat et Bâtiment", cats: [
    { cat: "Plomberie", metiers: ["Plombier", "Chauffagiste"] },
    { cat: "Électricité", metiers: ["Électricien", "Domotique"] }
  ]},
  { secteur: "Automobile", cats: [
    { cat: "Mécanique générale", metiers: ["Mécanicien", "Carrossier"] }
  ]},
  { secteur: "Électroménager", cats: [
    { cat: "Froid & climatisation", metiers: ["Frigoriste", "Technicien climatisation"] }
  ]}
]);
let professionals = readDB("professionals", [
  { id: "p1", userId: null, name: "Kouadio Yao", metier: "Plombier", zone: "Cocody, Abidjan", tel: "+225 07 00 00 00 01", tarif: "À partir de 8 000 FCFA", badge: "verifie", note: 4.8, avis: 132, init: "KY" },
  { id: "p2", userId: null, name: "SARL Frigo Plus", metier: "Frigoriste — Entreprise", zone: "Yopougon, Abidjan", tel: "+225 07 00 00 00 02", tarif: "Devis sur diagnostic", badge: "certifie", note: 4.6, avis: 87, init: "FP" },
  { id: "p3", userId: null, name: "Aïcha Traoré", metier: "Électricienne", zone: "Marcory, Abidjan", tel: "+225 07 00 00 00 03", tarif: "À partir de 10 000 FCFA", badge: "verifie", note: 4.9, avis: 201, init: "AT" }
]);
let commissions = readDB("commissions", { "Plomberie": 12, "Électricité": 12, "Froid et climatisation": 15, "Services aux entreprises": 10 });
let requests = readDB("requests", []);
let auditLogs = readDB("audit_logs", []);

function saveAll() {
  writeDB("users", users);
  writeDB("sessions", sessions);
  writeDB("taxonomy", taxonomy);
  writeDB("professionals", professionals);
  writeDB("commissions", commissions);
  writeDB("requests", requests);
  writeDB("audit_logs", auditLogs);
}
function log(action, userId, detail) {
  auditLogs.push({ id: newId("log"), action, userId: userId || null, detail: detail || null, at: Date.now() });
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

function seedAdmin() {
  if (!users.find(u => u.role === "admin")) {
    const { salt, hash } = hashPassword("Admin#2026");
    users.push({ id: newId("u"), email: "admin@mimoye.ci", salt, hash, role: "admin", name: "Administrateur MIMOYE", phone: "", createdAt: Date.now() });
    saveAll();
    console.log("→ Compte admin créé : admin@mimoye.ci / Admin#2026 (à changer en production)");
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
function publicPro(p) { return p; } // pas de données sensibles côté pro pour l'instant

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
      const tarif = (body.tarif || "").trim();
      if (!metier || !zone || !tel) return sendJSON(res, 400, { error: "metier, zone et tel sont requis." });
      const init = (user.name || "NN").split(" ").filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "NN";
      let existing = professionals.find(p => p.userId === user.id);
      if (existing) {
        Object.assign(existing, { metier, zone, tel, tarif: tarif || existing.tarif, badge: "attente" });
      } else {
        existing = { id: newId("p"), userId: user.id, name: user.name, metier, zone, tel, tarif: tarif || "Non renseigné", badge: "attente", note: 0, avis: 0, init };
        professionals.push(existing);
      }
      log("pro_register", user.id, { professionalId: existing.id });
      saveAll();
      return sendJSON(res, 201, { ok: true, professional: existing });
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
      const body = await readBody(req);
      // MODE SANDBOX — aucune vraie transaction Mobile Money. À remplacer par une intégration
      // réelle (ex. CinetPay, PayDunya) utilisant des clés API en variables d'environnement.
      reqObj.payment = { status: "SUCCESS", mode: body.mode || "mobile_money", simulated: true, at: Date.now() };
      reqObj.status = "PAID";
      log("payment_sandbox", user.id, { requestId: reqObj.id });
      saveAll();
      return sendJSON(res, 200, { ok: true, request: reqObj, warning: "Paiement simulé (mode sandbox) — aucune vraie transaction n'a eu lieu." });
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

    // ================= ADMIN : STATS =================
    if (pathname === "/api/admin/stats" && method === "GET") {
      const user = requireAuth(); if (!user) return;
      if (!requireRole(user, ["admin"])) return;
      return sendJSON(res, 200, {
        totalUsers: users.length,
        totalPros: professionals.length,
        verifiedPros: professionals.filter(p => p.badge === "verifie" || p.badge === "certifie").length,
        pendingPros: professionals.filter(p => p.badge === "attente").length,
        totalRequests: requests.length,
        totalMetiers: taxonomy.reduce((n, s) => n + s.cats.reduce((m, c) => m + c.metiers.length, 0), 0)
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
