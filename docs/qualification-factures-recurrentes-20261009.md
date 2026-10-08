# Lecture des factures récurrentes

## Diagnostic sur 13a89e7

`getRecurringInvoices` utilise `withAuth` sans `finance.read`. Le DAL borne les récurrences à la société, mais leur chantier est stocké dans le JSON `template` et n’entre pas dans les règles d’agence du modèle. Le client imbriqué n’est pas vérifié par société.

Le [reproducer SQL](evidence/20261009-recurring-read/README.md) donne six échecs sur huit assertions, sans erreur de hook : Sales, Operations, Technician et Service lisent les modèles sans Finance ; Accounting voit un modèle du chantier d’une autre agence ; une récurrence locale reliée à un client étranger révèle ses coordonnées. Les deux contrôles positifs conservent les récurrences cohérentes Owner et la récurrence locale Accounting. Les relations incohérentes sont créées directement par la fixture ; les mutations de l’application ne sont pas déclarées capables de les créer.

## Correction à concevoir et faire approuver

- Exiger `finance.read` sur l’action et afficher « Accès Finance requis » sur la page pour les rôles interdits, avant toute lecture financière.
- Borner le client à la société. Donner aux récurrences un rattachement de chantier vérifiable par le DAL, avec cohérence du client et de la société. Le stockage actuel dans le JSON nécessite une décision de migration ; ne pas inventer une agence pour les anciens modèles sans chantier.
- Préserver les récurrences locales autorisées, leurs historiques et le traitement des échéances. Examiner création, activation et suppression ainsi que leurs occurrences avant de qualifier cette chaîne.
- Si le rattachement devient nécessaire aux rôles limités à des agences, leur formulaire doit permettre de choisir le chantier. Ce champ et les mentions visibles nécessitent un lot précis approuvé avant implémentation.

Aucun correctif, nouvelle migration ou qualification navigateur de ce diagnostic n’est revendiqué. Il reste distinct du lot des références documentaires déjà proposé et de la CI Contacts en cours. Ses futures vérifications devront couvrir Owner/Admin, Finance limité à une agence, sociétés, rôles sans Finance, anciens modèles et démo en lecture seule.
