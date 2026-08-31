// Référentiel métiers étendu — seed initial pour MIMOYE.
// Chaque secteur contient des catégories, chaque catégorie une liste de métiers.
// `reglemente: true` marque les métiers nécessitant une vérification de diplôme/autorisation
// avant tout badge "vérifié" (santé, juridique/financier notamment) — voir REGLEMENTED_SET.
module.exports = [
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
