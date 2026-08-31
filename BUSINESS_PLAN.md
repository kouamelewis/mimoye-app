# MIMOYE — Business plan et hypothèses financières

*Document de travail. Les chiffres ci-dessous sont des hypothèses de départ à
ajuster avec des données réelles de marché — je ne suis pas conseiller financier
et ces projections ne constituent pas une garantie de résultat.*

## 1. Présentation

MIMOYE est une plateforme ivoirienne de mise en relation entre clients
(particuliers, entreprises, administrations) et professionnels de services, sur
un modèle où le paiement transite systématiquement par la plateforme, qui prélève
une commission avant reversement au professionnel.

## 2. Problème identifié

Trouver un professionnel de confiance en Côte d'Ivoire repose largement sur le
bouche-à-oreille. Pas de moyen simple de comparer, vérifier les qualifications, ou
sécuriser le paiement d'une prestation.

## 3. Solution et proposition de valeur

- **Pour le client** : recherche guidée par métier, professionnels vérifiés,
  paiement sécurisé via la plateforme, système d'évaluation.
- **Pour le professionnel** : visibilité, flux de demandes qualifiées, paiement
  garanti (le client paie MIMOYE, pas le professionnel directement).
- **Pour MIMOYE** : commission sur chaque transaction.

## 4. Segmentation

**Clients** : particuliers urbains (Abidjan en priorité), petites entreprises,
administrations pour des besoins ponctuels de maintenance.

**Professionnels** : indépendants et petites entreprises de service, tous secteurs
(voir le référentiel de 180 métiers), avec une attention particulière aux
professions réglementées (santé, juridique, finance) nécessitant une vérification
renforcée.

## 5. Modèle économique

**Revenu principal** : commission sur chaque transaction payée via la plateforme,
taux variable par catégorie de métier (paramétrable par l'administrateur, taux par
défaut 12 %).

**Revenus complémentaires envisageables** (non implémentés dans le produit actuel,
à évaluer) :
- Abonnement professionnel premium (visibilité accrue, badge mis en avant)
- Mise en avant payante dans les résultats de recherche
- Frais de traitement de paiement (si distincts de la commission)
- Partenariats B2B (contrats de maintenance avec entreprises/administrations)

## 6. Hypothèses de base (à ajuster)

| Hypothèse | Valeur de départ |
|---|---|
| Panier moyen par prestation | 15 000 FCFA |
| Taux de commission moyen | 10 % |
| Coût d'acquisition par professionnel actif | 5 000 FCFA (marketing + vérification) |
| Coût d'acquisition par client actif | 1 500 FCFA |
| Taux de conversion demande → paiement | 60 % |
| Coût technique mensuel (hébergement, paiement, SMS/email) | 150 000 FCFA/mois en phase de lancement |
| Coût support/vérification (temps humain) | 300 000 FCFA/mois (1 personne à temps partiel) |

## 7. Trois scénarios (par mois, en régime établi après lancement)

### Scénario prudent

| Indicateur | Valeur |
|---|---|
| Prestations payées / mois | 300 |
| Panier moyen | 15 000 FCFA |
| Volume mensuel | 4 500 000 FCFA |
| Commission moyenne | 10 % |
| **Revenus bruts MIMOYE / mois** | **450 000 FCFA** |
| Charges fixes estimées (technique + support) | 450 000 FCFA |
| **Résultat net estimé** | **≈ 0 FCFA (seuil de rentabilité)** |

### Scénario réaliste

| Indicateur | Valeur |
|---|---|
| Prestations payées / mois | 1 000 |
| Panier moyen | 15 000 FCFA |
| Volume mensuel | 15 000 000 FCFA |
| Commission moyenne | 10 % |
| **Revenus bruts MIMOYE / mois** | **1 500 000 FCFA** |
| Charges fixes estimées | 600 000 FCFA (support renforcé) |
| **Résultat net estimé / mois** | **≈ 900 000 FCFA** |

### Scénario ambitieux

| Indicateur | Valeur |
|---|---|
| Prestations payées / mois | 3 000 |
| Panier moyen | 16 000 FCFA (montée en gamme, plus de B2B) |
| Volume mensuel | 48 000 000 FCFA |
| Commission moyenne | 11 % (mix incluant catégories à commission plus élevée) |
| **Revenus bruts MIMOYE / mois** | **5 280 000 FCFA** |
| Charges fixes estimées | 1 500 000 FCFA (équipe support élargie, marketing continu) |
| **Résultat net estimé / mois** | **≈ 3 780 000 FCFA** |

## 8. Seuil de rentabilité

Avec les hypothèses ci-dessus, le seuil de rentabilité se situe autour de
**300 prestations payées par mois** (scénario prudent), soit environ 10
prestations par jour sur l'ensemble de la plateforme. C'est le chiffre à suivre en
priorité dans les premiers mois.

## 9. Projections sur 3 ans (indicatif, scénario réaliste comme base)

| Année | Prestations/mois (fin d'année) | Volume annuel | Revenus MIMOYE annuels (10%) |
|---|---|---|---|
| Année 1 | 300 → 800 (montée progressive) | ≈ 66 000 000 FCFA | ≈ 6 600 000 FCFA |
| Année 2 | 800 → 2 000 | ≈ 168 000 000 FCFA | ≈ 16 800 000 FCFA |
| Année 3 | 2 000 → 3 500 | ≈ 330 000 000 FCFA | ≈ 33 000 000 FCFA |

Ces chiffres supposent une exécution réussie de l'acquisition client/professionnel
et ne tiennent pas compte de la concurrence, de la saisonnalité, ni des coûts
d'expansion géographique (hors Abidjan).

## 10. Coûts opérationnels à prévoir

- **Technique** : hébergement, base de données en production, fournisseur de
  paiement (frais par transaction, souvent 1,5 à 3,5 % selon l'opérateur — à
  intégrer dans le calcul de marge nette, distinct de la commission MIMOYE),
  SMS/email
- **Vérification** : temps humain pour contrôler les documents professionnels,
  particulièrement pour les professions réglementées
- **Support client** : gestion des litiges, assistance
- **Marketing** : acquisition client et professionnel (les deux faces du marché
  doivent croître ensemble — un client sans professionnel disponible dans son
  besoin, ou un professionnel sans demandes, abandonnent vite)

## 11. Stratégie de déploiement suggérée

1. **Abidjan uniquement** en phase de lancement, sur un nombre limité de secteurs
   prioritaires (probablement : bâtiment/plomberie/électricité/électroménager, qui
   correspondent à des besoins fréquents et récurrents)
2. Extension progressive des secteurs une fois la boucle demande/paiement/avis
   validée
3. Extension géographique vers d'autres grandes villes (Bouaké, Yamoussoukro...)
   uniquement après consolidation à Abidjan

## 12. Indicateurs clés à suivre dès le lancement

- Nombre de professionnels vérifiés actifs (pas seulement inscrits)
- Nombre de prestations payées par semaine
- Taux de conversion demande → devis → paiement
- Délai moyen de réponse des professionnels à une demande
- Taux de litiges par rapport au nombre de prestations
- Taux de rétention client à 30/60/90 jours

---

**Note méthodologique** : ces chiffres sont des points de départ construits sur
des hypothèses raisonnables mais non vérifiées par une étude de marché. Avant de
les utiliser pour lever des fonds ou prendre des décisions d'investissement
importantes, il est recommandé de les confronter à des données réelles (test sur
un échantillon restreint de professionnels et clients à Abidjan) et, si besoin, de
consulter un expert-comptable ou conseiller financier.
