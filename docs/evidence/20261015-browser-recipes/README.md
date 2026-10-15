# Recettes navigateur du 15 octobre 2026

Le candidat [1fcb8a5](https://github.com/lacombechristophe/freelio/commit/1fcb8a5a06a71a9a378e53e0a6b3b57ed5cf5571) sépare les parcours desktop et mobile en deux jobs. Les [résultats CI](ci-1fcb8a5.json) conservent leurs conclusions distinctes : dans chacun des deux workflows, desktop termine 214 parcours avec une exclusion ; mobile termine 195 parcours avec deux échecs et 18 exclusions. Aucun de ces workflows n’est qualifié entièrement.

Les deux échecs mobiles sont un HTTP 409 dans l’aperçu d’une facture historique sans archive et un sélecteur Fournisseurs ambigu dans la fenêtre Produit. Ce dossier conserve le résultat initial ; il ne présume pas du succès des corrections suivantes. Le reporter line donne les comptes d’exclusions, sans leur liste détaillée.

Chaque job UI passe types, lint, build, 2 360 tests SQLite de 222 fichiers et deux audits annonçant zéro vulnérabilité. PostgreSQL passe 2 359 tests avec une exclusion native SQLite. Linux passe ses neuf contrôles dans la PR. Dans la branche, le registre d’image renvoie HTTP 429 avant construction lors des deux tentatives. La seconde tentative réexécute seulement Linux ; les autres jobs sont des résultats reportés aux mêmes horodatages.

Le quota GitHub refuse les rapports et traces. Ces preuves utilisent les métadonnées et les empreintes des journaux téléchargés ; elles ne remplacent pas les JSON natifs manquants.

La [comparaison Git](source-1fcb8a5.json) confirme les mêmes 1 071 entrées hors documentation entre candidat et merge testé. La [démo hébergée](hosted-1fcb8a5.json) passe 49 lectures par format, sans erreur JavaScript ni reprise. Ces lectures sur données fictives ne prouvent pas toutes les fonctions, les envois externes ou la tenue sous charge.
