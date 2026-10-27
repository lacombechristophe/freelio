# Frontières d’architecture métier

Ce document fixe les invariants du CRM/ERP. Les écrans et Server Actions orchestrent les cas d’usage ; ils ne doivent pas devenir les propriétaires des règles financières ou des invariants multi-tenant.

## Organisation du code

| Emplacement | Responsabilité |
| --- | --- |
| `src/app`, `src/components` | Routes, composition des écrans et interactions |
| `src/actions` | Cas d’usage authentifiés, validation et transactions |
| `src/lib/finance`, `src/lib/operations`, `src/lib/communications`, `src/lib/automations` | Calculs, lecteurs et règles métier réutilisables |
| `src/lib/auth-wrapper.ts`, `src/lib/prisma.ts` | Contexte d’autorisation et contrôle des accès aux données |
| `prisma` | Schémas et migrations SQL versionnées |
| `tests/unit`, `tests/e2e`, `tests/hosted` | Règles pures/SQL, parcours locaux et lecture de la démo hébergée |

Les actions Opérations gardent un point d’entrée compatible dans `src/actions/operations/index.ts`. Les implémentations sont séparées en lectures, catalogue, achats, commandes, stock et service. Seuls les modules de points d’entrée portent `use server` ; schémas et auxiliaires partagés restent des modules ordinaires.

Les actions d’import conservent leur point d’entrée dans `src/actions/migrations/index.ts`. Connexions fournisseur, captures, analyse/simulation, application et vérification ont leurs modules ; les schémas et auxiliaires partagés restent ordinaires. L’application garde une transaction par enregistrement et sa reprise sans doublon. Ce découpage ne rend pas l’ensemble d’un import atomique.

Organisation conserve l’état et les mutations dans sa vue principale. Les types, libellés/formats, cartes et dialogues sont séparés dans le même dossier. Ce découpage n’ajoute pas de couche générique entre les composants et les cas d’usage.

## 1. Calcul commercial et facturation

Le moteur `src/lib/finance/commercial-calculation.ts` est la source unique des totaux de devis et factures.

- Les montants sont représentés en centimes entiers.
- La TVA est calculée ligne par ligne afin de couvrir les taux mixtes.
- Une remise de ligne est appliquée avant une remise globale.
- La remise globale est répartie proportionnellement, avec un reliquat déterministe, pour conserver exactement les invariants `HT + TVA = TTC`.
- Le mode sans TVA force la TVA à zéro sans modifier la base HT.
- Les marges matériel, main-d’œuvre, service et autres sont calculées seulement lorsque les coûts sont fournis.
- Toute nouvelle règle de prix doit d’abord être ajoutée comme fonction pure avec tests unitaires, puis appelée depuis les actions de devis, facture, commande ou contrat concernées.

Les composants d’interface peuvent afficher des simulations, mais le résultat persistant est toujours recalculé côté serveur par ce moteur. La numérotation lit le catalogue au niveau société ; la contrainte SQL unique et les reprises bornées départagent les créations concurrentes.

La facturation des temps construit ses lignes depuis les secondes enregistrées, sans arrondir les heures avant le calcul monétaire. Aperçu et action utilisent `time-invoice-lines.ts` ; chaque ligne est ensuite arrondie au centime par le moteur commercial. Les quantités affichées dans les nouveaux PDF sont arrondies à six décimales au maximum ; elles ne remplacent pas les secondes comme base du calcul. Le serveur recontrôle les temps et les paramètres financiers dans la transaction Serializable avant de créer le brouillon.

Le chargement fournit aussi une version signée des valeurs affichées pour chaque temps (`time-invoice-version.ts`). L'action vérifie ces versions avant le calcul : elle refuse ainsi une modification terminée avant le clic, puis conserve le recontrôle transactionnel pour les modifications pendant la préparation. Le marqueur est lié à la société et à l'utilisateur, sans être une autorisation ; les droits courants restent obligatoires. Le refus ne revalide pas la page et garde le formulaire intact. Le [contrat](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/contrat-facturation-temps-apercu-perime.md) décrit le rechargement requis et l'effet d'une rotation d'`AUTH_SECRET`.

Un rôle Finance peut rattacher les temps accessibles au seul brouillon créé par cette action, puis libérer les temps du brouillon qu'il supprime. Le contexte interne borne ces exceptions à `invoiceId` et à l'identifiant du document. Les autres écritures Temps exigent Opérations. À la suppression, un compte privé des liens exacts détecte les associations historiques incohérentes, puis les écritures restent filtrées par société, client, chantier et agence. Une différence de comptes annule suppression, libération et audit ; aucun détail de temps étranger n'est renvoyé. `invoiceId` reste un ancien champ sans FK : son index améliore la lecture, mais ne répare pas cette dette référentielle. Les [preuves et limites](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/evidence/20261013-time-invoice-release/README.md) décrivent cette autorisation restreinte.

## 2. Entreprise, agence et dépôt

Les trois niveaux ont des responsabilités différentes :

| Niveau | Responsabilité |
|---|---|
| `Company` | Tenant et entité juridique : identité, TVA, facturation, séquences documentaires, sécurité et export. |
| `Agency` | Unité opérationnelle : magasin, secteur de pose, équipe SAV ou activité mixte. |
| `Warehouse` | Stock physique rattaché à une seule agence. |

Un `CustomerSite` et un `Project` peuvent être rattachés à une agence responsable. Toute création sans choix explicite utilise l’agence principale active. Les identifiants d’agence sont toujours revalidés avec le `companyId` avant écriture ; un identifiant provenant du navigateur n’est jamais considéré comme sûr.

Une entreprise ne possède qu’une agence principale. Une adhésion utilisateur peut couvrir plusieurs agences, mais une seule relation peut être marquée principale. La migration crée une agence principale pour chaque entreprise existante et y rattache les sites, chantiers, dépôts et membres déjà présents.

La numérotation légale reste au niveau `Company`. Si une agence devient une entité juridique autonome, elle doit devenir un tenant séparé au lieu de détourner le modèle d’agence.

## 3. Évolution attendue

- Les filtres de visibilité par agence s’ajoutent aux permissions de domaine, sans les remplacer.
- Les transferts de stock inter-agences produisent un `StockTransfer` et deux mouvements corrélés `OUTBOUND`/`INBOUND` dans une transaction sérialisable. Le moteur pur refuse le stock négatif et le déplacement d’unités réservées.
- Les tableaux de bord agrègent l’entreprise entière ou filtrent une agence avec les mêmes définitions de KPI. Ce filtre est analytique et ne constitue jamais une autorisation d’accès.
- Les imports HubSpot et Extrabat doivent résoudre les agences et dépôts par correspondance explicite, avec une file d’anomalies pour les rattachements ambigus.

## 4. Critères de vérification

Une modification de ces domaines est prête lorsque :

1. les fonctions pures sont couvertes sur les arrondis et cas limites ;
2. les écritures serveur contrôlent le tenant de chaque relation ;
3. la migration conserve et rattache les données existantes ;
4. l’export de réversibilité inclut les nouvelles tables ;
5. les contrôles TypeScript, lint, unitaires, build et parcours Playwright sont verts.
