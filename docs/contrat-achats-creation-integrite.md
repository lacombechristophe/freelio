# Création d’achat : références et préparation périmée

La recette SQL sur la fonction createPurchaseOrder du candidat 2b05e5f crée un brouillon cohérent de contrôle puis reproduit quatre acceptations invalides : chantier de la société lié à un client étranger ; chantier terminé absent du sélecteur actif ; client du chantier changé vers une société étrangère pendant la préparation du numéro ; produit désactivé après le contrôle initial pendant cette préparation. Le rapport conserve un cas réussi et quatre assertions de refus échouées. Les deux intercalages sont déterministes autour de la lecture des numéros ; ils ne constituent pas un test de concurrence réseau simultanée. Prisma et l’action restent réels, avec session/cache simulés et données fictives supprimées.

Lot proposé : contrôler le chantier actif, sa société, son client et son agence ainsi que les produits actifs de la société dans la transaction créant le brouillon, après la préparation du numéro. Refuser avec les messages existants « Chantier introuvable » / « Un produit fournisseur est introuvable », sans commande, ligne, audit, mouvement ni envoi lors du refus. Conserver les prix et libellés manuels ; aucune réécriture d’après le catalogue. Les modifications légitimes de la fixture concurrente restent conservées. Le verrou fournisseur existant et les permissions Opérations/démo restent appliqués.

Aucun bouton, champ, couleur ou placement nouveau. Aucun fournisseur réel ni envoi. Recette prévue : quatre refus réels et contrôle positif, aucun effet lors du refus, société/agence/rôles, fournisseur inactif, lignes libres et prix modifiés, intercalages à la préparation. La cohérence est vérifiée au moment de la création ; ce lot ne fige pas les versions de tous les documents d’achat ni tout leur cycle de vie.

## Accord et réalisation

Lot approuvé le 14 octobre 2026 : « Oui, protéger ces créations d’achat ». Les mêmes filtres de chantier actif/société/client/agence servent au contrôle initial et au recontrôle dans la transaction de création. Les produits actifs sont également relus après la préparation du numéro. Le verrou fournisseur existant, les prix manuels, les numéros et les droits sont conservés. Aucun changement d’isolation ni nouvelle relance automatique de transaction.

La frontière Action transmet les deux refus approuvés comme résultats explicites pour conserver leurs messages en production Next.js. Les erreurs techniques imprévues sont relancées et restent masquées par le runtime ; aucune donnée interne supplémentaire n’est transmise au navigateur.

Les contrôles sont effectués dans la transaction existante ; ils ne prétendent pas figer une référence pour toute la durée de vie des achats. Les intercalages de recette changent les données avant les relectures transactionnelles : ce ne sont pas des essais de charge ou de simultanéité réseau.
