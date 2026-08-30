# Frontières d’architecture métier

Ce document fixe les invariants à préserver à mesure que le CRM/ERP piscine s’étend. Les écrans et Server Actions orchestrent les cas d’usage ; ils ne doivent pas devenir les propriétaires des règles financières ou des invariants multi-tenant.

## 1. Calcul commercial et facturation

Le moteur `src/lib/finance/commercial-calculation.ts` est la source unique des totaux de devis et factures.

- Les montants sont représentés en centimes entiers.
- La TVA est calculée ligne par ligne afin de couvrir les taux mixtes.
- Une remise de ligne est appliquée avant une remise globale.
- La remise globale est répartie proportionnellement, avec un reliquat déterministe, pour conserver exactement les invariants `HT + TVA = TTC`.
- Le mode sans TVA force la TVA à zéro sans modifier la base HT.
- Les marges matériel, main-d’œuvre, service et autres sont calculées seulement lorsque les coûts sont fournis.
- Toute nouvelle règle de prix doit d’abord être ajoutée comme fonction pure avec tests unitaires, puis appelée depuis les actions de devis, facture, commande ou contrat concernées.

Les composants d’interface peuvent afficher des simulations, mais le résultat persistant est toujours recalculé côté serveur par ce moteur. Les numéros de facture et de devis restent alloués par les services de numérotation transactionnels.

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

- Les futurs filtres de visibilité par agence doivent s’ajouter aux permissions de domaine, jamais les remplacer.
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
