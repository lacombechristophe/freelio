# Sites clients et parc installé

Les annuaires d’Opérations permettent de retrouver, modifier et désactiver un site ou un équipement. Recherche, filtre d’activité et pagination portent sur tout le périmètre autorisé. Le référencement actif est distinct du statut technique importé d’un équipement : une désactivation renseigne `archivedAt` et conserve ce statut, les coordonnées et les historiques.

## Droits et modifications

La lecture exige `operations.read`. Les coordonnées d’un site exigent `crm.write` ; les métadonnées d’un équipement exigent `operations.write`. Les contrôles de société, client, agence et produit sont partagés avec les autres lecteurs Opérations. Les commandes restent interdites dans la démonstration publique.

Les formulaires capturent la version `updatedAt` à leur ouverture. Une modification concurrente produit un refus, sans écraser la saisie ni l’autre modification. La mise à jour et sa trace d’audit appartiennent à la même transaction. Les refus attendus sont retournés comme données par la frontière des Server Actions ; les erreurs techniques restent traitées par Next.js.

L’édition conserve client, site et agence de rattachement. Un nouveau produit catalogue doit être actif et cohérent avec la société ; un produit historique inactif peut rester associé à son équipement. Les dates d’installation et de garantie déjà enregistrées sont conservées tant que leur champ n’est pas changé.

## Désactivation et reprise

Un site ne peut être désactivé tant qu’il possède un équipement référencé, un chantier en cours, un SAV ouvert, une intervention à terminer ou un entretien non clos. Un équipement ne peut être désactivé tant qu’un SAV, une intervention associée ou un entretien reste en cours. Ces contrôles prennent aussi en compte les enfants historiques incohérents, avec un refus générique qui ne divulgue pas leur identité.

La réactivation d’un site exige une agence active lorsqu’il en possède une. Celle d’un équipement exige un site actif et accessible. Aucune suppression ni réparation automatique des historiques n’est effectuée.

Les nouveaux équipements, tickets, interventions, entretiens et renouvellements revérifient leurs références dans la transaction d’écriture. Un verrou de ligne sans changement de version coordonne ces créations avec la désactivation. Il ne donne pas aux rôles Service ou Opérations le droit de modifier les coordonnées CRM. Le worker des visites utilise les mêmes contrôles.

Les imports vérifient les nouveaux rattachements et les réouvertures de dossiers. Les métadonnées d’un dossier historique clos restent actualisables sans réactiver son site. Un refus conserve la source brute, sa correspondance antérieure et les historiques métier ; le run reste récupérable après correction. Une collision de numéro de série sur un autre site ne déplace jamais silencieusement l’équipement existant.

## Formulaires et facturation

Les choix Site et Équipement disposent de recherches et de pages de 25. La sélection reste identifiable hors page et doit être revérifiée dans le client/site courant avant enregistrement. Le serveur effectue une dernière vérification : une référence désactivée après le chargement du formulaire est refusée sans création. Les autres saisies restent présentes.

Le renouvellement d’un entretien exige Service et Opérations en écriture. Finance en écriture est également nécessaire pour reprendre la facturation automatique, y compris une récurrence historique active. Les commandes affichées utilisent ces mêmes capacités ; la matrice des rôles n’est pas élargie.

## Vérification

Les suites dédiées couvrent versions concurrentes, atomicité des refus, historiques, activité, droits, choix hors page, imports et renouvellements sur une base fictive. `node scripts/verify-asset-lifecycle-upgrade.mjs` crée une nouvelle base SQLite, y insère des dossiers selon le schéma antérieur, applique l’évolution et compare les lignes, relations, valeurs par défaut et index. Le script ne lit aucune URL de base applicative.

La migration PostgreSQL ajoute deux colonnes nullables et deux index, sans suppression de données. Son exécution PostgreSQL et les parcours navigateur doivent être qualifiés sur le commit concerné avant publication. Le [transfert complet entre agences](transfert-dossier-site.md) est un parcours administratif distinct, avec motif, confirmation du changement d’accès et audit ; il conserve les contenus historiques.
