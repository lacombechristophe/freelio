# Factures historiques sans archive

Lot visible approuvé le 15 octobre 2026.

Une facture émise ou verrouillée sans métadonnées complètes d'archive reste lisible. Le Studio affiche « Archive historique indisponible », puis « Le document d’origine doit être récupéré ; il ne sera pas régénéré. » dans sa zone d'aperçu. Il ne charge aucune iframe PDF et désactive « Plein écran » et « Télécharger », avec les mêmes textes, icônes, classes et emplacements. Les réglages de présentation restent désactivés et l'entête ne promet plus un aperçu disponible.

La page transmet un booléen calculé après la lecture autorisée de la facture. L'absence d'un des champs `issuedDocument`, `pdfUrl` ou `pdfHash` déclenche cet état pour une facture émise ; ces valeurs ne sont ni complétées ni réparées automatiquement. Les brouillons restent modifiables. Les archives disposant de leurs métadonnées gardent les contrôles de lecture et d'intégrité existants.

L'API conserve son refus HTTP 409 pour une archive absente ou invalide. Aucun PDF, snapshot, facture, ligne, audit ou envoi n'est créé par l'affichage. Une archive perdue n'est jamais reconstruite depuis les coordonnées actuelles du client.

## Recette

Le test SSR échoue avant correction, avec les deux contrôles existants réussis. Après correction, il vérifie textes, absence d'iframe et de liens PDF, boutons et réglages désactivés, et absence d'appel au rendu d'un nouveau document. Les contrôles de brouillon et d'archive disponible restent actifs.

Un parcours compilé par surface lit la facture Banque fictive correspondante, vérifie l'absence de requête PDF automatique, puis appelle explicitement les deux variantes de l'API : HTTP 409 conservé, facture/lignes/audits inchangés. Son passage doit être confirmé sur le commit publié.

## Limites

La présence des métadonnées n'atteste pas l'existence ni l'intégrité du fichier : ces contrôles restent appliqués au téléchargement. Ce lot ne gère pas séparément l'affichage d'un fichier devenu absent ou invalide après conservation de ses métadonnées. Il ne restaure aucune archive et n'élargit aucun droit Finance ou périmètre d'agence.
