# Choix Client dans les documents et affaires

Le lecteur plafonné à 1 000 était encore appelé par sept pages de création/édition. Le [contrat approuvé](../../contrat-choix-clients-documents-affaires.md) porte sur Devis, Factures brouillons, Contrats et Affaires. Le lecteur commun renvoie des pages de 25 et une sélection séparée, avec seulement `id` et `name`. Les formulaires conservent leurs états métier ; aucun nouveau droit d'écriture n'est accordé.

Les [24 cas SQL locaux](local-after.json) couvrent 1 001 clients, l'ordre stable, les huit rôles, la révocation d'adhésion, le client étranger/supprimé, les créations et éditions réelles des quatre domaines par Owner/Admin, puis les refus Viewer et démo publique. La première attente de message Viewer ne correspondait pas au refus existant du DAL ; le test accepte les erreurs de permission existantes, sans changement de matrice. Les 21 cas de profil financier et 26 cas de sélection Client Chantiers passent aussi après remplacement de l'ancien lecteur.

Le [seed vérifié](seed.json) crée huit sociétés de formulaires indépendantes, chacune avec 1 001 clients et un ancien document lié au dernier. Il vérifie également les fixtures Portail et Modèles approuvées, ainsi que les mots de passe fictifs. Aucun serveur ou fournisseur n'est lancé ; les sociétés de cette recette sont ensuite supprimées et le contrôle SQL final est à zéro.

Huit cas compilés définis dans `tests/e2e/document-client-choices.spec.ts` couvrent création/édition, préselection du devis par URL, choix hors page, erreur de lecture/reprise et client supprimé remplaçable. Ils vérifient les lignes, montants, dates, contenu et phase effectivement conservés en SQL. Leur exécution CI et PostgreSQL restent à qualifier sur le candidat publié.

La [recette locale combinée](combined-local.json) passe 2 123 tests / 211 fichiers, types, ESLint, Oxlint et build de production. Les seuils de couverture restent appliqués aux six modules configurés ; cette mesure ne porte pas sur toute l'application. Les 12 E2E définis des trois lots ne sont pas exécutés localement.
