# Sites clients et parc installé

Dans l’onglet Sites d’Opérations, le lecteur charge au maximum 100 sites et 200 équipements. Les deux listes n’ont ni recherche ni pagination ; les anciens objets deviennent inaccessibles depuis cet écran. Ce lot complète la consultation des référentiels de L8. Il ne crée pas d’édition de site ou d’équipement.

## Commandes proposées

Ajouter une recherche indépendante dans les cartes « Sites clients » et « Parc installé », puis les commandes existantes de page précédente/suivante, total et numéro de page, par 25. Conserver les cartes, leurs colonnes, couleurs et liens d’équipement. Ne pas ajouter de création, désactivation, suppression ou sortie fournisseur.

La recherche des sites porte sur nom, adresse et client ; celle des équipements sur nom, numéro de série, catégorie et site/client. Le filtre d’agence existant s’applique côté serveur aux deux listes. Un changement d’agence ramène chaque liste à la première page en gardant sa recherche. Les deux recherches restent indépendantes ; chargement, erreur et reprise utilisent les commandes déjà présentes ailleurs dans Opérations et masquent les anciens résultats.

## Contrat de lecture

Deux lecteurs sous operations.read, après membership et affectations d’agence actuels. Fournir uniquement la page et les champs affichés. Filtrer explicitement société, site, client et agence ; compter après recherche et scope, utiliser un identifiant pour départager les noms/dates identiques et lire total/page dans une transaction cohérente. Une agence demandée hors droits est refusée, sans élargir la lecture à toutes les agences.

Les compteurs d’équipements et tickets de chaque site conservent le même périmètre autorisé. L’ensemble des cartes de synthèse du tableau de bord, les sélecteurs des formulaires, l’édition des référentiels et les historiques de la fiche équipement restent des lots distincts à examiner.

## Vérifications prévues

201 sites et 301 équipements fictifs ; retrouver les plus anciens par recherche et dernière page, puis conserver les recherches au changement d’agence. Vérifier autre société, agence non autorisée, révocation, membre suspendu et lecture en démo publique. Parcours ordinateur/mobile, liste vide, réponse périmée et échec/reprise. Aucun compte externe ni donnée existante.

Statut : lot approuvé le 8 octobre, puis implémenté avec deux lecteurs indépendants. Les tests SQL et navigateur sont dans `operations-assets.integration.test.ts` et `operations-assets.spec.ts`. La [qualification commune](qualification-catalogue-sites-service-20261008.md) distingue vérifications locales et CI du candidat. Les cartes de synthèse et sélecteurs des autres onglets conservent leurs propres limites.

