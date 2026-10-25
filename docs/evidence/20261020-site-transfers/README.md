# Transfert complet d’un site entre agences

Le commit `ae1b02f8d7b95e54c8adf626dca83ac7d2406ae7` applique la [règle choisie](../../transfert-dossier-site.md) : le dossier complet suit le site, avec motif et audit. Owner et Admin peuvent transférer vers une agence active de leur société. Les autres rôles et la démo publique sont refusés. Les permissions métier restent appliquées après transfert.

Les **28 cas SQL dédiés** vérifient conservation du contenu et des archives émises, accès de l’ancienne et de la nouvelle agence, versions périmées, destinations étrangères/inactives/absentes, membres suspendus, racines incohérentes, références partagées et double confirmation. Le cas de 302 chantiers prouve l’absence de plafond de page dans la mutation ; il ne mesure pas la capacité sous charge. Une activité désactivée reste désactivée.

Les sept suites liées terminent 163 cas réussis. La suite complète passe ensuite **2 664 tests dans 235 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Les six modules de couverture ciblée passent leurs seuils inchangés. Types, ESLint, Oxlint et build de production réussissent ; les 76 pages statiques sont générées.

Le [relevé](local.json) conserve les empreintes des rapports natifs et des logs. Les 1 108 fichiers source de la recette sont comparés au commit, sans différence. La session Auth.js et le cache Next sont simulés ; les adhésions, actions, lectures, contraintes et transactions Prisma sont réelles.

Les 446 cas navigateur, 223 par surface, sont sélectionnés sans exécution. La concurrence PostgreSQL et les parcours compilés restent à qualifier ; la double commande concurrente sous SQLite ne les remplace pas. Aucun push, workflow, déploiement, fournisseur ni abonnement n’est déclenché. Le plafond GitHub Actions à 0 € reste à vérifier avant une nouvelle CI.
