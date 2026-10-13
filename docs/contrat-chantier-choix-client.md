# Choix du client dans le formulaire Chantier

Lot approuvé le 13 octobre 2026. Le diagnostic SQL crée 1 001 clients accessibles ; l'ancien `getClientsMinimal()` renvoie uniquement les 1 000 premiers par nom. Le dernier client ne peut pas être choisi depuis ce formulaire sur le candidat du diagnostic.

Limiter le lot aux formulaires de création et d'édition de Chantiers. Ajouter recherche, total, page et précédent/suivant par 25 près du choix Client existant. Le client choisi garde son identifiant et son libellé hors page ; la saisie des autres champs reste conservée pendant recherche, chargement et erreur. Vérifier séparément le choix courant avant sauvegarde, avec société et session revalidées côté serveur. La réponse ne contient que identifiant et nom, sans montants ni score. Les autres consommateurs de `getClientsMinimal()` restent des lots distincts.

Conserver agence, modèle, budget, dates, champs et boutons d'enregistrement, couleurs et disposition générale. Pas de nouveau rattachement implicite, import, envoi ou réparation historique. Écritures interdites en démo publique.

Recette prévue : 1 001 clients, dernière page et recherche exacte, choix hors page, révocation de session, client étranger, rôles autorisés, saisie conservée après erreur et création/édition compilées sur ordinateur/mobile. Le diagnostic simule session/cache et utilise les vraies actions et SQL dans la copie fictive.

L'implémentation ajoute une lecture dédiée à Chantiers, avec Opérations en lecture, projection `{ id, name }`, recherche et pages de 25 dans une transaction sérialisable. Le choix courant est lu séparément hors filtre/page ; les clients restent partagés à l'échelle de leur société. Les autres lecteurs utilisant `getClientsMinimal()` ne sont pas modifiés. Le formulaire bloque l'enregistrement tant que son choix n'est pas vérifié ou si cette lecture échoue, sans effacer ses champs ; les actions de création/édition conservent leurs contrôles serveur. Les dépendances du formulaire utilisent l'identifiant stable de l'agence par défaut pour éviter une réinitialisation causée par une nouvelle instance du tableau de propriétés.
