# Proposition d’hébergement de la démo

Proposition préparée le 1er octobre 2026 ; aucun service ni abonnement créé. Le budget, la région et la publication restent à choisir par le propriétaire après la préproduction. Le dossier technique peut déjà être montré en local.

**Décision reçue : budget de 0 € pour l’instant.** L’option payante ci-dessous reste une estimation pour une étape ultérieure. Aucun achat, compte fournisseur ni ouverture publique n’est engagé. La démonstration locale et les preuves reproductibles constituent le périmètre immédiat ; une offre gratuite éventuelle devra être qualifiée avec ses limites.

## Configuration minimale proposée

Pour la découverte publique en lecture seule : une instance web Docker, une PostgreSQL dédiée avec rôle applicatif lecteur, un bucket R2 privé contenant seulement des fichiers fictifs et un limiteur distribué Upstash. Le worker et Redis/BullMQ ne démarrent pas dans ce profil ; leurs fonctionnalités sont qualifiées séparément dans la recette privée. Aucun fournisseur d’e-mail, OAuth, paiement ou traitement métier n’est activé.

Exemple Render à qualifier, avec une région européenne commune pour web et SQL :

| Ressource | Dimension proposée | Tarif mensuel consulté |
| --- | --- | --- |
| Espace Hobby | Un propriétaire | 0 USD, hors calcul et usage |
| Web Docker | 1 CPU / 2 Go RAM | 25 USD |
| PostgreSQL | 0,5 CPU / 1 Go RAM | 19 USD |
| Sous-total calcul | Web + base | 44 USD |

Les montants sont ceux de la [page officielle Render](https://render.com/pricing), consultée dans le navigateur le 1er octobre. Ce sous-total exclut taxes, conversion monétaire, stockage supplémentaire, trafic, build, domaine et services externes. La capacité mémoire est une proposition prudente pour Node et Chromium, pas une mesure de ce runtime hébergé.

Le palier gratuit n’est pas la référence d’une démonstration disponible pour un rendez-vous : ses limites et interruptions doivent être acceptées explicitement. La [documentation des offres gratuites](https://render.com/docs/free) décrit notamment les contraintes des services web et de PostgreSQL.

Le [tarif Upstash](https://upstash.com/pricing/redis) présente une facturation à l’usage de 0,20 USD pour 100 000 commandes. Le [tarif R2](https://developers.cloudflare.com/r2/pricing/) comporte des allocations gratuites pour le stockage Standard et certaines opérations ; cela ne garantit pas une facture nulle. Définir alertes, plafonds lorsqu’ils sont disponibles et procédure d’arrêt ; vérifier les quotas et factures du compte au moment de l’ouverture.

## Release et récupération proposées

1. Identifier un commit revu, exécuter ses jobs CI et conserver le digest de l’image. Construire avec `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_READ_ONLY=true` et `DEMO_ACCESS_MODE=readonly` ; les mêmes valeurs doivent être présentes au runtime.
2. Créer une base neuve dédiée, migrer avec un rôle administrateur temporaire, puis préparer uniquement les fixtures fictives. Retirer ce rôle de l’environnement web et fournir le rôle lecteur aux visiteurs.
3. Charger les clés et secrets par le gestionnaire de l’hébergeur. Configurer HTTPS, R2 privé et Upstash ; interdire les clés des fournisseurs métier, le worker et les ordonnanceurs. Le [guide Docker Render](https://render.com/docs/docker) décrit les builds, variables et étapes de déploiement.
4. Vérifier les sondes, connexion, consultation, PDF, refus des mutations, absence d’appels fournisseur et comportement sous charge sur la préproduction réelle. Une readiness verte ne prouve pas l’accès R2/Upstash : leurs lectures et limitations doivent être contrôlées séparément.
5. Restaurer dans une autre base et un autre emplacement de fichiers avec les clés conservées hors du serveur. Tester le retour à l’image précédente sur un schéma compatible ; ne pas annuler aveuglément des migrations SQL.
6. Présenter au propriétaire l’URL de préproduction, la facture prévue, les limites, la région et la portée publique avant ouverture. Décider le domaine et les textes de confidentialité propres au site hébergé.

Pour une recette privée modifiable, ajouter un web/worker et une base distincts avec leurs propres identifiants, durée d’accès et effets externes neutralisés. Son coût ne fait pas partie des 44 USD et aucun accès privé supplémentaire n’est créé par ce document.
