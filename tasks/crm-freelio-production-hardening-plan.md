# Plan / prompt objectif - CRM Freelio production-ready

## Objectif principal

Transformer Freelio d'un MVP avance en CRM freelance fiable, professionnel et utilisable au quotidien par un developpeur freelance qui debute, sans casser les workflows existants.

Le resultat attendu n'est pas "ajouter beaucoup de features". Le resultat attendu est un produit stable, clair, conforme aux besoins metier, verifie route par route, et suffisamment abouti pour gerer une activite freelance reelle.

## Role de l'agent

Agir comme un lead product engineer senior :

- auditer avant de modifier ;
- classer les problemes par impact utilisateur et risque metier ;
- corriger d'abord les blocages, erreurs runtime, workflows incomplets et incoherences ;
- renforcer ensuite les parcours cles : client, projet, temps, devis, contrat, facture, depense, comptabilite ;
- verifier chaque correction dans le navigateur quand l'interface est concernee ;
- ne pas remplacer le systeme existant par une refonte gratuite ;
- conserver les conventions du repo et limiter les refactors non necessaires.

## Public cible

Utilisateur principal : developpeur freelance francophone qui debute.

Ses besoins prioritaires :

- comprendre vite quoi faire ensuite ;
- creer un client, un projet, un devis, une facture et suivre le paiement sans friction ;
- enregistrer son temps et ses depenses ;
- obtenir des documents PDF professionnels ;
- eviter les erreurs legales ou comptables evidentes ;
- recuperer/exporter ses donnees ;
- utiliser l'outil sans avoir peur de perdre ou casser ses donnees.

## Definition de "abouti"

Freelio est considere abouti seulement si :

- les routes principales chargent sans overlay Next.js, erreur console bloquante ou crash serveur ;
- les actions visibles font quelque chose d'utile ou sont retirees/desactivees avec raison ;
- les formulaires gerent les valeurs par defaut, validations, erreurs serveur, chargements et succes ;
- les workflows metier sont lies logiquement ;
- les PDF de devis/factures sont professionnels, lisibles, parametrables et coherents ;
- les donnees critiques peuvent etre exportees ;
- le responsive ne casse pas les parcours principaux ;
- les composants partages fonctionnent partout ;
- les tests typecheck/build/unit passent ;
- au moins les flows critiques ont ete verifies dans le navigateur.

## Non-objectifs

Ne pas faire maintenant :

- marketplace, multi-tenant avance, roles complexes ou collaboration equipe ;
- IA generative profonde ;
- refonte complete de marque sans demande explicite ;
- integration bancaire complexe ;
- automatisation comptable certifiee ;
- garanties juridiques non verifiees.

## Principes de priorisation

Priorite 0 - Bloquant :

- crash runtime ;
- erreur serveur bloquant une route ;
- bouton principal inoperant ;
- creation/edition/suppression qui echoue ;
- sauvegarde qui perd des donnees ;
- PDF inutilisable ;
- facture/devis impossible a creer ;
- donnees affichees sous forme d'ID technique dans l'UI ;
- menu, dialog, datepicker, select ou composant partage casse.

Priorite 1 - Important :

- workflow metier incomplet ;
- manque d'etat vide, loading, erreur ou succes ;
- validation insuffisante ;
- UX confuse pour un debutant ;
- responsive casse ;
- manque d'export ;
- statut metier ambigu.

Priorite 2 - Finition :

- microcopy ;
- alignements ;
- densite ;
- transitions ;
- coherence visuelle ;
- raccourcis clavier ;
- confort d'usage.

## Parcours critiques a auditer

1. Onboarding
   - creation / recuperation du compte local ;
   - configuration entreprise ;
   - TVA, delais de paiement, mentions, logo, template PDF ;
   - redirection vers dashboard.

2. Clients
   - liste, recherche, creation, edition, detail ;
   - contacts ;
   - passage client -> projet/devis/facture.

3. Catalogue
   - categories ;
   - services ;
   - reutilisation dans devis/factures.

4. Projets
   - creation liee a un client ;
   - statut ;
   - detail projet ;
   - lien avec temps, devis, factures.

5. Pipeline
   - creation opportunite ;
   - changement d'etape ;
   - conversion logique vers devis/projet ;
   - valeurs visibles lisibles.

6. Temps passe
   - chronometre global ;
   - selection projet ;
   - persistance ;
   - saisie manuelle ;
   - calendrier hebdomadaire ;
   - export ou resume facturable.

7. Devis
   - creation, edition, detail ;
   - lignes ;
   - TVA ;
   - PDF ;
   - conversion vers facture ;
   - statuts.

8. Contrats
   - creation ;
   - editeur riche ;
   - templates ;
   - PDF / signature ;
   - erreurs SSR/hydratation ;
   - parcours de signature.

9. Factures
   - creation ;
   - acompte / avoir / standard ;
   - paiement partiel ou total ;
   - statut ;
   - PDF ;
   - numerotation ;
   - mentions legales ;
   - relance.

10. Depenses
    - creation ;
    - categories ;
    - montant TVA ;
    - piece justificative si prevue ;
    - export comptable.

11. Comptabilite
    - chiffres coherents ;
    - livre de recettes / depenses ;
    - export CSV ;
    - filtres periode.

12. Notifications / aide / parametres
    - pas de liens ou boutons morts ;
    - aide utile pour debutant ;
    - preferences appliquees au produit.

## Checklist UI par ecran

Pour chaque route :

- page non blanche ;
- pas d'overlay framework ;
- pas d'erreur console pertinente ;
- titre et action principale clairs ;
- etat vide utile ;
- chargement visible si donnees async ;
- erreurs recuperables ;
- boutons visibles fonctionnels ;
- menus/selects affichent les labels, pas les IDs ;
- dialogs accessibles et fermables ;
- formulaire preserve les champs apres erreur ;
- responsive desktop + mobile raisonnable ;
- focus visible et navigation clavier minimale ;
- texte non coupe ou superpose.

## Checklist metier facturation

Verifier, sans promettre une conformite juridique absolue :

- numerotation sequentielle stable ;
- client et entreprise clairement identifies ;
- dates emission / echeance ;
- objet ;
- lignes avec quantite, prix, TVA, total HT, TVA, TTC ;
- cas TVA non applicable ;
- mentions de retard ;
- statut payee / partielle / en retard ;
- avoir lie a facture si applicable ;
- acompte clairement distingue ;
- exports ;
- coherence PDF / donnees en base.

Toute mention legale sensible doit etre verifiee contre une source officielle actuelle avant implementation finale.

## Prompt d'execution pour Codex

Tu travailles dans le repo `CRM-Freelio`.

Mission : rendre le CRM suffisamment fiable, complet et professionnel pour un developpeur freelance debutant.

Procedure obligatoire :

1. Lire la structure du repo, les scripts, le schema Prisma, les actions serveur, les composants partages et les routes dashboard.
2. Demarrer ou reutiliser le serveur local.
3. Auditer les routes critiques avec navigateur quand possible.
4. Produire un backlog classe P0/P1/P2 avec preuves : route, symptome, cause probable, fichier, impact.
5. Corriger les P0 avant toute amelioration P1/P2.
6. Apres chaque lot de corrections :
   - `npx tsc --noEmit`
   - lint cible sur fichiers modifies
   - tests unitaires pertinents
   - verification navigateur du flow corrige
7. Ne jamais masquer une erreur par un fallback faux.
8. Ne jamais casser un workflow existant pour ameliorer l'apparence.
9. Ajouter des tests seulement la ou le risque le justifie.
10. Documenter les limites restantes.

Ordre de travail recommande :

Phase A - Cartographie et audit
- inventorier routes, actions, modeles Prisma, composants partages ;
- reperer TODO, boutons sans handler, erreurs console, routes fragiles ;
- generer une matrice des flows.

Phase B - Stabilisation P0
- corriger crashs, erreurs runtime, hydratation, server actions, formulaires casses ;
- verifier creation/edition des objets principaux.

Phase C - Workflow freelance
- rendre fluide client -> projet -> devis -> contrat -> facture -> paiement ;
- clarifier statuts et actions secondaires.

Phase D - Facturation et documents
- consolider PDF, templates, mentions, numerotation, paiements, exports.

Phase E - UX debutant
- ameliorer onboarding, etats vides, aide contextuelle, microcopy, confirmations.

Phase F - QA finale
- smoke test de toutes les routes ;
- flows critiques desktop/mobile ;
- build/test/typecheck ;
- rapport final avec ce qui est pret, ce qui reste risque, et ce qui est volontairement hors scope.

## Livrables attendus

- backlog priorise ;
- corrections implementees ;
- preuves de verification ;
- rapport final court ;
- liste claire des risques restants ;
- recommandations de phase suivante.

