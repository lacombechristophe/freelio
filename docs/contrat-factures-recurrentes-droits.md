# Périmètre des modèles de facturation récurrente

## Diagnostic et correction interne distincte

Le [lecteur](qualification-factures-recurrentes-20261009.md) reproduit six échecs sur huit assertions : accès sans Finance, modèle d’une autre agence et client étranger. Le [worker](evidence/20261009-recurring-generation/README.md) reproduit quatre échecs sur sept cas de références historiques et auteur explicite. La correction interne du worker ne ferme pas les défauts de lecture ni de rattachement d’agence.

## Lot approuvé le 9 octobre 2026

Sans `finance.read`, la page affiche « Accès Finance requis » avant tout chargement de modèle financier. Les actions de création, activation et suppression exigent `finance.write` et leurs commandes restent indisponibles sans ce droit, ainsi qu’en démo publique.

La liste ajoute recherche et pages de 25 avec total/page. Le formulaire garde ses champs actuels et ajoute « Chantier », avec recherche/pagination par 25 des clients et chantiers. La sélection du client borne les chantiers ; changer de client efface un chantier devenu incompatible. Un chantier est obligatoire dans ce formulaire pour un rôle limité aux agences. Les modèles créés depuis un contrat d’entretien conservent le périmètre du site de ce contrat. Owner/Admin peuvent conserver les anciens modèles sans chantier ni entretien rattaché ; les rôles limités ne les voient pas. La matrice générale des droits demeure inchangée.

Le choix déjà sélectionné reste visible au changement de page ou de recherche. Les couleurs, cartes, colonnes et commandes existantes sont conservées ; aucun envoi, émission de facture, changement de cadence ou activation automatique n’est ajouté.

## Contrat de données

Ajouter un rattachement relationnel nullable `projectId` au modèle récurrent et son index. Le client et le chantier doivent appartenir à la même société et correspondre l’un à l’autre ; un entretien rattaché et son site doivent respecter la même cohérence. Les filtres de lecture et de mutation utilisent le chantier, ou le site de l’entretien lorsqu’il n’y a pas de chantier, avec relecture des agences autorisées à chaque appel ; les occurrences sont bornées à un modèle accessible.

Lorsqu’un chantier et un entretien sont tous deux renseignés, les deux références doivent être cohérentes et autorisées. Ne pas choisir le rattachement le plus permissif pour contourner une agence interdite.

La migration PostgreSQL reprend uniquement un `template.projectId` existant dont la société et le client sont cohérents. La procédure SQLite suit la même règle. Ne pas attribuer d’agence aux anciens modèles sans chantier et ne pas transformer une référence JSON incohérente en modèle valide sans chantier. Conserver ces références pour diagnostic, les exclure des lectures usuelles et bloquer leur génération. Les nouveaux modèles écrivent un rattachement cohérent ; le worker vérifie les références avant chaque génération.

Les factures déjà générées restent inchangées. Une suppression de modèle conserve ses factures selon le comportement actuel ; le contrôle du périmètre interdit la suppression d’un modèle inaccessible. La migration ne réactive aucun modèle et ne lance aucun job.

## Qualification

Rejouer les huit assertions de lecture, puis couvrir Owner/Admin, Finance d’une seule agence, rôles interdits, révocation, société/client incohérents, ancien modèle sans chantier et ancien JSON invalide. Vérifier mutations directes, occurrences, sélection conservée, pagination et démo publique. Exécuter les migrations sur données historiques fictives SQLite/PostgreSQL et conserver les contrôles du worker. Les résultats sont attachés à la référence corrigée, pas aux CI antérieures de Contacts.

La correction `565986e` et ses [preuves locales](evidence/20261009-recurring-read/README.md) sont disponibles. Les 26 régressions du lecteur et les treize cas worker passent en SQLite et PostgreSQL. Les huit nouveaux E2E passent dans les [deux CI de 0f45087](evidence/20261009-recurring-read/ci-0f45087.json), avec les six Documents conservés.
