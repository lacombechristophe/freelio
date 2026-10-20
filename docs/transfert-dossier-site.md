# Transférer un site entre agences

La règle choisie est le transfert du dossier complet, avec audit. La commande est réservée à `company.manage` : Owner ou Admin. Elle conserve le client et tous les identifiants, affecte le site et ses chantiers à une agence active de la même société, puis enregistre agence d’origine, destination, motif et nombre de chantiers dans la même transaction.

Les équipements, SAV, interventions et entretiens suivent le périmètre de leur site ; les documents et temps des chantiers suivent celui du chantier. Les anciennes agences perdent cet accès et la destination le reçoit, toujours sous réserve des permissions métier. Une affectation supplémentaire du membre à la nouvelle agence lui conserve naturellement son accès. Le transfert ne donne aucun droit Finance ou Commercial supplémentaire.

Les archives émises, montants, statuts, signatures et dates métier restent inchangés. Le stock physique et les journaux des dépôts conservent leur agence : transférer un dossier ne constitue pas un mouvement de stock. Leurs propres contrôles d’accès restent appliqués.

Le formulaire conserve la version du site, exige un motif et une confirmation du changement d’accès. Sa recherche parcourt toutes les agences admissibles, par pages de 25, et conserve le choix hors page. Une version périmée ou une destination devenue inactive est refusée sans transfert partiel ni nouvel audit. La saisie reste présente après refus.

Les nouvelles références et le transfert prennent un verrou sur le même site. Les contrôles et la mise à jour des chantiers utilisent une transaction sérialisable. Un dossier contenant des racines étrangères ou des liens partagés avec un autre site est refusé avec un message générique ; aucune réparation ni réaffectation silencieuse n’est effectuée. Les anciens dossiers désactivés peuvent être transférés sans être réactivés.

La commande est interdite dans la démonstration publique. La qualification de concurrence PostgreSQL et des parcours navigateur doit être attachée au commit testé ; une suite SQLite ou une sélection Playwright ne la remplace pas.
