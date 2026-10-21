# Commandes client et bons de livraison

La création manuelle d’une commande, sa livraison et son accusé de réception exigent `operations.write`. Les lectures HTML/PDF exigent `operations.read` et le même périmètre de société, client, chantier, agence et produits. Une référence incohérente est refusée ; les données historiques ne sont ni réparées ni réaffectées automatiquement.

## Création et quantités

Les références sont vérifiées dans la transaction de création : client de la société, chantier actif de ce client, site cohérent et produit actif dont le fournisseur appartient à la société. Les rôles limités aux agences doivent conserver un chantier accessible. Le numéro reste soumis à la protection concurrente commune.

Les montants utilisent le calcul commercial commun : arrondis par ligne en centimes entiers, total borné par la capacité SQL, TVA conforme à la configuration de la société et acompte inférieur ou égal au TTC. Les dates de pose impossibles sont refusées. Écriture et audit sont atomiques.

Une livraison est préparée à partir de la ligne et de sa commande, puis les références et la version sont relues dans une transaction sérialisable. Un verrou de commande précède la revendication conditionnelle de la quantité livrée. Les opérations décimales utilisent `Prisma.Decimal`, puis la valeur calculée est enregistrée dans la colonne existante : `0,1 + 0,2` produit `0,3`. Une commande annulée pendant la préparation reste annulée ; un dépassement du reliquat ne crée ni bon ni audit. Les quantités du document ne sont plus limitées à trois décimales d’affichage.

La consommation d’une réservation est une commande de stock explicite et distincte. Déclarer la livraison n’effectue pas une seconde sortie de stock. Le parcours navigateur préparé suit réservation, consommation, livraison et accusé de réception.

## Capture du bon signé

Le réceptionnaire est nommé et son accord est confirmé dans le formulaire existant. Le contenu rendu, ses polices incorporées, le numéro, les identifiants de société/commande/client, le nom et l’horodatage sont capturés en version 1. L’empreinte SHA-256 porte sur cette capture ; le document est chiffré avec la clé applicative et conservé avec le bon. Une modification achevée pendant la préparation empêche son scellement, tout en conservant cette modification et la saisie.

La signature et son audit sont enregistrés dans une transaction unique. Un rejeu identique restitue l’empreinte existante sans nouvelle écriture ; un autre réceptionnaire est refusé. La capture chiffrée n’est pas sérialisée dans la liste du tableau de bord.

Les routes HTML et PDF vérifient le périmètre courant, déchiffrent la capture, contrôlent son empreinte, sa version et ses identifiants, puis utilisent le contenu conservé. Les modifications ultérieures des coordonnées ou des lignes courantes ne recalculent pas le document présenté. Une capture déplacée, altérée ou incompatible est refusée. La migration additive `20261021030000_delivery_note_seal` laisse les anciens bons sans capture à `NULL` ; ils affichent « Archive historique indisponible » et leur document n’est pas régénéré.

La capture HTML et ses ressources sont conservées ; les octets PDF sont produits à la demande. Cette preuve interne de contenu et d’accord nommé ne constitue pas une vérification externe de l’identité du réceptionnaire. L’archivage binaire du PDF et un service de signature tiers restent des capacités distinctes.

## Vérification et limites

[customer-order-delivery.integration.test.ts](../tests/unit/customer-order-delivery.integration.test.ts) exerce les vraies actions, les routes et SQL, avec authentification/cache et préparation PDF simulés. Il couvre les droits et références, les montants, les livraisons partielles, les dates, le rollback d’audit, la péremption, le rejeu, la confidentialité de la capture et sa conservation après modification des données courantes.

[verify-delivery-seal-upgrade.mjs](../scripts/verify-delivery-seal-upgrade.mjs) crée une base SQLite externe neuve, vérifie la conservation de huit lignes de six tables et compare hors ligne le diff PostgreSQL à la migration. [delivery-seal.spec.ts](../tests/e2e/delivery-seal.spec.ts) prépare un parcours desktop/mobile dans une société fictive indépendante. Les résultats exécutés et les limites sont consignés dans le [registre du candidat](completude-recette-20261003.md).

Les listes et sélecteurs de livraison restent bornés par les lectures historiques d’Opérations ; ce lot ne livre pas leur pagination complète, l’édition d’une commande confirmée, une annulation après livraison ou une réparation des anciens scellements. PostgreSQL natif, concurrence entre processus, rendu PDF natif et interactions navigateur du candidat restent à qualifier. Aucun envoi externe ni service de signature fournisseur n’est déclenché par ces commandes.
