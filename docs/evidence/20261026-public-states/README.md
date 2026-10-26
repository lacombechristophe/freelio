# Compléments de qualification — 26 octobre 2026

Le [reçu de restauration](postgres-snapshot-restore.json) porte sur la sauvegarde fictive précédant l’ajout des trois dossiers de démonstration. Son empreinte SHA-256 est contrôlée avant lecture. Aucun accès à la base hébergée n’est nécessaire pour cet essai.

La restauration utilise l’image PostgreSQL 18 déjà présente, sans téléchargement, dans un conteneur jetable sans réseau ni port publié. `pg_restore --exit-on-error --single-transaction --no-owner --no-acl` restaure le fichier natif dans une base neuve. Le contrôle retrouve les 144 tables et 314 lignes attendues ; tous les index et contraintes sont valides. Un nouvel export natif est restauré dans une seconde base neuve ; les empreintes de toutes les lignes restent identiques. Le conteneur et ses données temporaires sont retirés après l’essai.

Ce résultat vérifie ce corpus local. Il ne qualifie ni le retour du trafic, ni un RTO, ni la restauration des rôles, droits, secrets et fichiers, ni la récupération de l’hébergement. La sauvegarde elle-même, les identifiants SQL et les données de lignes restent hors du dépôt.

La qualification des états publics est reproductible avec `tests/e2e/public-document-layout.spec.ts`, sur la base E2E isolée préparée pour le reste de la suite. Elle utilise les limites réelles des champs et des valeurs longues plausibles, les deux thèmes et l’agrandissement du texte. Les captures ne constituent pas des essais sur appareils physiques ni une certification WCAG.
