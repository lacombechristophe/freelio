# Choix Client dans les documents et les affaires

Lot approuvé le 13 octobre 2026 par le propriétaire. Après le lot Chantiers, sept pages utilisent encore le catalogue plafonné de `getClientsMinimal()` : création/édition de devis, factures et contrats, ainsi que la page Pipeline. Le [diagnostic de 1 001 clients](evidence/20261013-project-choices/before.json) et le code du lecteur expliquent ce plafond ; aucun parcours compilé de ces sept pages n'est encore qualifié pour le supprimer.

La page de création d'un devis vérifie aussi le `clientId` reçu par URL dans ce catalogue tronqué. Un client valide au-delà du plafond ne peut donc pas être préselectionné depuis sa fiche. Les formulaires d'édition conservent un identifiant initial, mais recherchent son libellé dans ce même catalogue. Ces constats sont issus du code, distincts d'une preuve navigateur.

Ajouter recherche, total, page et précédent/suivant par 25 près des choix Client existants de ces quatre formulaires. Une lecture minimale `{ id, name }` vérifie séparément le choix courant, hors filtre/page et dans la société. Le lien de création depuis une fiche peut préselectionner tout client accessible. Les quatre formulaires conservent leur choix obligatoire.

Préserver le libellé déjà vu sans en faire une autorisation, permettre le remplacement d'un choix disparu et conserver toutes les autres saisies lors de la recherche, d'une erreur ou d'un refus. La sauvegarde d'un document exige un client vérifié ; les actions existantes gardent leurs droits Sales/Finance, société et relations. Les lignes, montants, dates, contenu du contrat, phases d'affaire, commandes d'enregistrement, couleurs et disposition générale restent conservés. Écritures interdites en démo publique.

Limiter le changement à ce choix commun et à ses sept pages appelantes. Les chantiers liés, le catalogue de produits, modèles de documents, signatures et documents déjà émis sont des sujets distincts. Une réutilisation du sélecteur ne doit ni élargir les permissions d'un domaine ni réinitialiser ses formulaires.

Recette prévue : 1 001 clients, choix hors page, entrée par URL, édition d'un ancien rattachement, client étranger/supprimé, adhésion révoquée, refus d'écriture selon le rôle, erreur de lecture puis reprise, absence de données financières dans le choix et créations/éditions compilées des quatre formulaires sur ordinateur/mobile. Les contrôles existants des documents et de leurs archives restent actifs.
