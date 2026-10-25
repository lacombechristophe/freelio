# Tri et prise en charge des conversations

Le bilan de L5 retrouve trois filtres manquants : boîte, état Ouvert/Clos et attribution. Le lecteur de `977e60f` ignore les deux premiers critères supplémentaires boîte/attribution et refuse le nouvel état ; trois diagnostics SQL conservent ces symptômes. L'interface sait consulter les archives mais ne propose pas d'archiver un fil.

## Lecture

Recherche, boîte, état et attribution s'appliquent ensemble côté serveur, au compteur comme aux pages de 50. « Toutes » conserve le sens existant : tous les fils accessibles hors archives. Les états Ouvert/Clos et le filtre Archives sont explicites. Les filtres d'attribution sont Tous, À moi et Sans responsable ; l'identité courante vient du contexte serveur, jamais d'un identifiant fourni par le navigateur.

Les boîtes déconnectées restent consultables pour leurs copies historiques. « Sans boîte associée » décrit les anciennes références inconnues, sans les présenter comme une boîte fournisseur identifiée. Les droits société/boîte privée/partagée continuent de s'appliquer. La réponse indique seulement présence d'une attribution et attribution personnelle ; aucun identifiant d'un autre membre n'est ajouté au navigateur.

## Suivi local

Archiver retire le fil de la lecture courante et conserve messages, observations distantes et attribution. Restaurer remet le fil en état Ouvert. Clore/Rouvrir conserve son comportement distinct. Aucun appel fournisseur ni suppression de message n'est associé à ces actions.

Un membre disposant d'Automatisations en écriture peut prendre un fil libre et libérer sa propre attribution. Il ne peut pas voler ou libérer celle d'un autre membre. Owner/Admin peuvent libérer une attribution devenue indisponible ; ils ne la transfèrent pas silencieusement. Deux demandes concurrentes de membres différents ne gagnent pas toutes les deux. L'attribution ne donne aucun droit supplémentaire et ne conditionne pas la lecture ou la réponse.

La mutation et son audit partagent une transaction. L'adhésion et le rôle sont relus dans celle-ci, puis les restrictions de boîte du rôle courant s'appliquent. Les refus ne modifient ni l'attribution ni ses traces. La démo publique reste en lecture seule ; les filtres de lecture restent disponibles.

## Interface et qualification

Les nouveaux sélecteurs et commandes reprennent les composants et couleurs existants. Une recherche, pagination, archive ou attribution conserve les autres critères et la rédaction ouverte. Une erreur d'attribution explique le conflit ; la saisie n'est pas remplacée. Après sortie du filtre courant, la liste et sa sélection sont recalculées normalement.

Les tests SQL couvrent filtres combinés, anciennes lignes au-delà de 50, sociétés/boîtes privées, attribution concurrente, rôle périmé, adhésion suspendue et refus en démo. Le SSR vérifie les commandes et droits initiaux, sans prétendre exécuter les interactions. Une recette ordinateur/mobile et ses deux comptes fictifs distincts sont préparés ; leur exécution navigateur reste une qualification séparée.
