# Import bancaire : dates impossibles

8 octobre 2026. Défaut reproduit sur la source **f5573b0**, dans une copie SQLite physique fictive. Session simulée, vraie action `importBankTransactions`, permissions, validation et écriture SQL ; seul `next/cache` est simulé. Le test de reproduction est resté dans la recette externe, sans changement de code applicatif ni donnée existante.

L’import de `2030-02-31` retourne `imported: 1`, puis la ligne SQL contient le 3 mars 2030. Le test vérifie séparément année, mois et jour ; il nettoie sa société et son utilisateur fictifs. Ce constat concerne une normalisation de calendrier locale, sans incident bancaire réel allégué.

## Correctif approuvé et implémenté

Refuser les dates qui ne sont pas un jour réel au format attendu `AAAA-MM-JJ`, y compris les jours impossibles et faux 29 février. La conversion française existante reste disponible. Le refus reprend l’emplacement d’erreur actuel et précise « Date bancaire invalide : … ». Si une ligne est invalide, aucun mouvement de ce fichier n’est importé ; la saisie et le mapping restent disponibles pour correction. Aucun champ, bouton, couleur ou emplacement ne change.

La déduplication et les dates de mouvements déjà importés restent intactes : ne pas inventer une correction rétroactive à partir d’un fichier absent. Les imports concurrents et la lisibilité des autres erreurs CSV restent à qualifier séparément.

L’action prépare et valide toutes les dates avant sa première écriture. Le contrôle compare les composantes calendaires au résultat de conversion, sans laisser JavaScript transformer le 31 février en mars. Le navigateur valide également toutes les dates du CSV, y compris celles d’une ligne écartée par les anciens filtres de libellé/montant. Il conserve fichier et mapping en cas de refus. Le compteur existant exclut désormais les dates impossibles des lignes valides.

## Recette

Vraies actions/SQL pour date impossible, 29 février valide/invalide et fichier mélangeant lignes valides/invalides sans écriture partielle. Vérifier aussi date conservée, rejeu sans doublon, permissions et démo publique. Tests du parseur français/ISO et parcours navigateur d’une erreur corrigée, avec mêmes contrôles visuels. Types/lint/build et CI du candidat final demeurent nécessaires.

Ces cas SQL passent dans `tests/unit/banking-lists.integration.test.ts`. Types/lint et build locaux passent ; le scénario français/ISO dans `tests/e2e/banking-history.spec.ts` reste à exécuter en CI. Aucune donnée existante n’est réécrite par ce correctif.
