# Création d'achat : références et préparation

Le [diagnostic initial](before.json) crée un brouillon cohérent de contrôle, puis reproduit quatre acceptations invalides : chantier de la société lié à un client étranger, chantier terminé, rattachement du chantier changé pendant la préparation du numéro et produit désactivé pendant cette préparation. La fonction createPurchaseOrder testée correspond à celle publiée dans 2b05e5f ; son digest est conservé. Le [reproducteur](reproducer.test.ts.txt) utilise Prisma et l'action réelle, avec session/cache simulés et données fictives. Le [correctif visible limité](../../contrat-achats-creation-integrite.md) est approuvé.

Le chantier actif, sa société, son client et son agence sont contrôlés initialement puis dans la transaction de création, après préparation du numéro. Les produits actifs de la société sont également relus dans cette transaction. Un refus ne crée ni commande, ni ligne, ni audit. Les changements de données ayant rendu la préparation invalide restent conservés ; les prix et libellés manuels ne sont pas remplacés par ceux du catalogue.

Le formulaire reçoit les deux refus approuvés comme résultats explicites. Next.js masque les exceptions en production : transmettre ces refus comme données permet d'afficher leur explication. Les erreurs techniques imprévues restent des exceptions masquées, sans exposer de détail de base de données.

## Vérification locale

Les [171 contrôles ciblés](local-after.json) passent, dont 24 nouveaux cas de création. Ils couvrent les quatre défauts reproduits, les agences, les produits étrangers/inactifs, quatre rôles autorisés, quatre rôles sans écriture, la démo publique, le fournisseur inactif, une ligne libre et le chantier optionnel pour Owner. Les snapshots vérifient commandes, lignes, audits, mouvements, envois et révision fournisseur après refus. Deux cas vérifient les résultats explicites ; un autre conserve la confidentialité d'une erreur technique inattendue.

Les intercalages introduisent des modifications SQL réelles autour de la lecture des numéros : client du chantier, état, agence ou activation du produit. Ils prouvent la relecture après cette préparation, pas une simultanéité réseau. Les modifications introduites restent présentes lors du refus.

Les [deux fixtures navigateur](seed.json) sont exécutées et supprimées sans résidu. Deux parcours compilés ordinateur/mobile sont définis : refus d'un chantier devenu incohérent, refus d'un produit désactivé, conservation du formulaire, puis reprise cohérente avec les prix saisis. La commande finale doit rester brouillon, sans stock ni envoi. Leur passage dans les CI exactes du commit publié reste requis.

## Limites

L'isolation de la transaction existante et le mécanisme de numérotation sont conservés. Aucun verrou supplémentaire sur tout le catalogue, version figée à vie, charge, concurrence réseau simultanée ni cycle complet d'achat n'est qualifié par ces contrôles. Les historiques d'achat et autres actions restent des périmètres séparés. La consultation hébergée en lecture seule ne remplace pas la recette de création.
