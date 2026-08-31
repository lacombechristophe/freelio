# Plan d’achèvement — automatisations, UX et durcissement

Date d’exécution : 31 août 2026
Portée : studio d’automatisation, cohérence UI applicative, sécurité multi-tenant, performance React/Next et banc de recette.

## Objectif et critères de sortie

Le lot transforme l’ancienne page d’automatisations, qui regroupait des formulaires simples sans véritable espace de travail, en un studio exploitable au quotidien. Le lot est considéré terminé lorsque :

- un utilisateur autorisé peut créer, modifier, dupliquer, publier, mettre en pause et archiver les objets compatibles ;
- une séquence combine e-mails, appels, tâches, délais, jours ouvrés, fenêtres horaires, fuseaux et inscriptions consenties ;
- un workflow possède un déclencheur, des critères, une action ou une branche, une version publiable, une simulation sans effet et un historique ;
- un modèle peut être édité avec variables, conseils et aperçu HTML isolé en bureau/mobile ;
- les envois, incidents et exécutions sont lisibles et filtrables ;
- chaque mutation est validée côté serveur, bornée à la société et auditée ;
- les onglets lourds sont chargés à la demande et aucune page ne déborde horizontalement en desktop ou mobile ;
- types, lint, tests, build, audit des dépendances et E2E sont verts sur une base isolée.

## Plan exécuté

| Phase | Travail | État |
|---|---|---|
| 1. Inventaire | cartographie des routes, actions, modèles, tests et limites externes ; baseline types/lint/tests/build/audit | Terminé |
| 2. Architecture | DTO explicites, composants spécialisés par onglet, moteur et mutations conservés côté serveur | Terminé |
| 3. Séquences | bibliothèque maître-détail, recherche, états, duplication, cadence, étapes réordonnables, tâches/appels, inscriptions et performance | Terminé |
| 4. Workflows | constructeur en trois temps, critères, actions, branche vrai/faux, brouillons, publication versionnée, simulation et traces | Terminé |
| 5. Contenus | bibliothèque de modèles, catégories, variables, contrôles éditoriaux, aperçu bureau/mobile et désinscription expliquée | Terminé |
| 6. Pilotage | vue d’ensemble, contrôles de mise en service, audience éligible, activité, incidents et journal filtrable | Terminé |
| 7. Sécurité | contrôle société sur le traitement manuel, quota dédié, audit des mutations, séquence active obligatoire, iframes sans scripts et URLs exécutables retirées | Terminé |
| 8. UX partagée | hiérarchie des titres, contexte de page, libellés accessibles, dialogues francisés et comportement responsive | Terminé |
| 9. Performance | chargement dynamique des studios, réponses serveur minimales, requêtes parallèles et limites explicites | Terminé |
| 10. Recette | tests unitaires, build de production, E2E desktop/mobile, inspection visuelle et contrôle de débordement/console | Terminé |

## Décisions d’architecture

- Le traitement global reste réservé au worker et à la route cron protégée. Le bouton manuel ne traite que la société authentifiée et possède son propre rate limit.
- Les étapes d’une séquence active ou déjà utilisée sont immuables. Une évolution de parcours passe par la duplication afin de préserver l’historique.
- Une inscription serveur est refusée si la séquence n’est pas active, même si un client contourne l’interface.
- Un workflow actif doit être mis en pause avant modification ; chaque enregistrement crée un brouillon et chaque activation publie une version traçable.
- Les aperçus d’e-mail utilisent un document CSP dans une iframe sans permission de script. Le contenu envoyé est nettoyé une seconde fois côté serveur.
- Les secrets et identifiants fournisseur ne sont jamais renvoyés au navigateur ; seuls des booléens de disponibilité et l’état du canal sont exposés.

## Preuves finales du lot

- ESLint : zéro erreur et zéro avertissement ; les artefacts Playwright/coverage sont exclus de l’analyse.
- TypeScript : contrôle strict réussi.
- Vitest : 43 fichiers, 172 tests réussis.
- Next.js 16.3.2 : build de production réussi, 65 pages statiques analysées et routes dynamiques compilées.
- Dépendances : zéro vulnérabilité déclarée par `npm audit`, production et développement inclus.
- Playwright : 21 scénarios réussis, 13 mutations mobiles volontairement ignorées après preuve desktop.
- Inspection visuelle : cinq onglets desktop et vues mobiles contrôlés ; hydratation présente, aucune erreur console inattendue et aucun débordement horizontal à 1440 px ou 412 px.

## Limites externes qui ne doivent pas être maquillées

Le code est prêt, mais les opérations suivantes demandent encore des accès ou décisions réels : configuration du domaine Resend et des webhooks, OAuth Google/Microsoft si les boîtes historiques doivent être synchronisées, PostgreSQL/R2/Upstash de production, import des exports HubSpot/Extrabat, rapprochement des volumes et documents, puis recette métier et go/no-go signé. Ces gates restent décrites dans les runbooks de migration et de production.
