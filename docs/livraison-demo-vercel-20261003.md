# Livraison de la démonstration hébergée — 3 octobre 2026

La livraison vers `main` et Vercel a été autorisée par le propriétaire. Ce profil utilise uniquement des données fictives, en lecture seule. Le [plan de complétude fonctionnelle](plan-completude-fonctionnelle-20261002.md) reste distinct : cette livraison ne termine pas ses lots et n'ouvre pas un service commercial.

Adresse canonique : https://freelio-eight.vercel.app. Les identifiants fictifs sont transmis séparément du dépôt. La [PR de livraison](https://github.com/lacombechristophe/freelio/pull/2) et les [exécutions CI](https://github.com/lacombechristophe/freelio/actions) donnent l'état de l'intégration. Vérifier le commit exact et le déploiement actif avant une présentation.

## Qualification hébergée

Code applicatif testé : `135227950e615dc8e10988340e93a0b82ea56877`. Déploiement : `dpl_36pYfJVjMaZCDrkFuBxu3dPd1Cyc`, région web `iad1`. Il provient d'une archive des fichiers suivis, sans `.env`, base locale ni données existantes. La protection Vercel était active pendant la qualification ; sa clé d'automatisation reste hors des rapports publics.

- Sondes : base et configuration prêtes, HTTP 200.
- Desktop : neuf groupes de contrôles réussis ; mobile 390 px : dix, incluant navigation et largeur globale. Connexion, consultation, filtres serveur, commandes désactivées, refus des routes cachées et inconnues, exports administratifs, téléversements, facturation fournisseur et déconnexion ont été contrôlés.
- PDF de devis et facture brouillon fictifs : HTTP 200 et signature `%PDF-`. Aucun appel navigateur externe ni erreur JavaScript dans ces parcours.
- Les six factures fictives passent la validation XML courante. Cela ne certifie ni PDF/A-3, ni Factur-X globalement, ni l'identité fiscale fictive.
- Huit contrôles SQL vérifient le rôle lecteur : lecture des fixtures, absence de privilèges administratifs et refus des insertions, modifications, suppressions métier et créations de tables. Seul l'ajout au journal d'audit est autorisé.

Les [rapports](evidence/20261002-hosted/README.md) donnent les dates et la portée exacte. Ces parcours ne couvrent pas exhaustivement chaque écran. La version finale doit réussir ses trois jobs CI : SQLite/typage/lint/build/E2E, PostgreSQL et image Linux/Chromium. Le statut Vercel `Ready` ne remplace pas ces contrôles.

## Corrections révélées par l'hébergement

Le garde réseau chargé par un chemin dynamique manquait dans les fonctions Vercel. Son import devient traçable, ses imports Node statiquement résolvables et son fichier est inclus au build Docker. Il autorise maintenant les lectures HTTPS de l'origine canonique pour les redirections internes Next.js, tout en refusant ses POST et les appels fournisseurs ; le test vérifie aussi méthode et port.

Chromium téléchargé au build manquait au runtime Vercel. `@sparticuz/chromium` 152.0.0 apporte les binaires empaquetés correspondant au navigateur attendu par Puppeteer ; leur tracing est explicite pour les routes documentaires. Local et Docker conservent leur navigateur habituel. Le rendu continue à désactiver JavaScript et à refuser les ressources réseau arbitraires.

La fixture vendeuse taxable n'avait aucun identifiant fiscal : la validation XML refusait correctement la facture. Le numéro `FR00000000000`, explicitement fictif, est ajouté à cette seule base et au lanceur des futures démos. Aucun contrôle documentaire n'est désactivé. Le test mobile qui capturait un titre avant la fin du rendu attend désormais le même premier titre attendu, sans assouplir l'exigence. Le texte « instance locale » devient « instance de démonstration » dans le profil public, après confirmation du propriétaire.

## Configuration et reproduction

La base `freelio_demo_20261002_release` a été créée dans PostgreSQL existant ; les 43 migrations et les fixtures ont été appliquées. L'ancienne base n'a pas été modifiée. Le rôle de migration reste hors du web ; `DATABASE_URL` utilise le rôle lecteur. Les secrets de session et de chiffrement sont propres à cette démo.

Les flags `DEMO_ACCESS_MODE=readonly`, `NEXT_PUBLIC_DEMO_MODE=true` et `NEXT_PUBLIC_DEMO_READ_ONLY=true` concordent au build et au runtime. Les clés Gemini, e-mail, OAuth et paiement, ainsi que les secrets des processeurs métier, sont retirés de la production. Aucun worker ni traitement fournisseur n'est activé. R2 et Upstash existants sont conservés. La démo locale modifiable reste distincte.

Pour reproduire sans copier de secrets dans le dépôt :

1. Identifier le commit et le déploiement actifs dans GitHub/Vercel ; vérifier les trois jobs CI.
2. Contrôler `/api/health/ready` puis les HTTP 403 des mutations, inscriptions, OAuth, processeurs et export administratif.
3. Dans une session neuve, se connecter avec le compte fictif transmis séparément, consulter clients/devis/factures/dépenses, télécharger les deux PDF, filtrer les devis et se déconnecter. Répéter à 390 px avec navigation mobile.
4. Vérifier les privilèges avec le rôle SQL lecteur sur la seule base dédiée ; conserver un rapport sans URL SQL ni mot de passe. La recette `scripts/verify-public-demo.mjs` garde sa restriction localhost et n'autorise pas implicitement un test externe.

## Limites d'exploitation

Vercel utilise le plan Hobby existant. Aucun compte ni abonnement payant supplémentaire n'a été souscrit. Les quotas et factures des comptes PostgreSQL, R2 et Upstash existants ne sont pas attestés par ces tests ; ce choix ne garantit ni SLA ni disponibilité gratuite permanente.

Cette base contient des brouillons et aucune archive émise à récupérer depuis R2. Une configuration verte ne prouve pas une lecture R2, une restauration hébergée, une rétention de journaux, un plafond de charge distribué ou un RPO/RTO. Ces points et les intégrations réelles du plan fonctionnel restent à qualifier avant usage commercial.

Un retour de version doit sélectionner un artefact déjà qualifié en lecture seule, compatible avec cette base. Ne pas réactiver un déploiement modifiable ou un rôle SQL administrateur, ni annuler les migrations pour un simple retour web. Les restaurations locales du runbook ne constituent pas un essai de récupération des fournisseurs hébergés.

## Vérification du 10 octobre

Le [contrôle courant de preview](evidence/20261010-preview-readiness/README.md) identifie une configuration incomplète, un schéma public historique à 43 migrations sur 60, puis prépare une nouvelle base fictive et un rôle lecteur distincts. Le propriétaire indique que les comptes R2/Upstash ne sont pas encore créés. Les sondes et parcours historiques ci-dessus ne prouvent pas leur disponibilité : les mentions de configuration conservée ne valent pas qualification des fournisseurs. La production historique reste inchangée ; la preview du candidat courant n’est pas prête.
