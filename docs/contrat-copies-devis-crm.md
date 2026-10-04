# Contrat proposé — copies PDF des devis dans les e-mails

État : spécification technique, interface non encore approuvée et fonction non implémentée. Elle complète le lot fichiers client/factures archivées de la recette du 4 octobre, sans modifier sa qualification.

## Constat et résultat attendu

La route `src/app/api/pdf/devis/[id]/route.ts` sélectionne la dernière QuoteVersion et génère le PDF avec les coordonnées et paramètres actuels. `updateQuote` modifie les lignes/totaux de cette version lorsque le devis est DRAFT ; les imports peuvent aussi la mettre à jour. Un numéro v1 n’est donc pas une preuve de révision immuable. Il n’existe pas d’archive du PDF accepté comparable à celle d’une facture émise.

Le prochain lot doit permettre de joindre une copie générée à cet instant depuis la dernière version disponible, explicitement identifiée comme copie actuelle. Il ne doit pas présenter ce PDF comme l’original historiquement envoyé ou accepté. Les factures conservent leur parcours d’archive ; les contrats nécessitent une spécification distincte sur leur contenu signé et leurs coordonnées historiques.

## Sélection reviewable à soumettre

Dans la fenêtre existante Joindre un document CRM : une source « Devis — copie actuelle », recherche et pagination 25 existantes, affichage du numéro, de la version et de la dernière modification du devis. Ajouter une mention : « PDF généré depuis la version et les coordonnées actuelles ; ce n’est pas une archive de l’envoi d’origine. » Le fichier portera un nom incluant le numéro et la version. Le client reste celui du destinataire, les droits sales.read sont obligatoires et l’envoi reste manuel. Styles et couleurs conservés ; démo publique en lecture seule.

Cette proposition attend l’accord visible exigé par l’utilisateur. Les contrats et la création d’un système d’archives de devis sont exclus de cette proposition.

## Contrat serveur

- Lister et lire uniquement les devis du client destinataire et de la société, avec les droits de l’auteur authentifié ; ne jamais appeler une URL PDF fournie par le navigateur.
- Identifier une révision par une empreinte des entrées effectives du rendu : version, lignes triées, totaux, objet/dates, identité client/émetteur et options de présentation. Inclure les données dont le rendu dépend, pas seulement updatedAt ou currentVersion.
- Refuser une sélection devenue ancienne si ces entrées ont changé ; conserver le texte et les pièces existantes du brouillon. Les identités et droits sont contrôlés avant le rendu puis la persistance.
- Générer une fois depuis les entrées capturées, avec le générateur et les protections réseau existants. Borner les entrées, la durée et la concurrence de génération, puis refuser une sortie supérieure à 5 Mo.
- Séparer l’empreinte de la révision source du SHA-256 des octets PDF produits. Une nouvelle génération peut produire des octets différents même depuis les mêmes données ; le retry ne doit pas régénérer silencieusement une copie déjà enregistrée.
- Conserver avec la pièce privée son type de source, son identifiant/version, l’empreinte des entrées et la date de copie, sans exposer de chemin interne au navigateur. Définir une extension compatible du JSON des pièces si nécessaire ; une migration n’est pas présumée utile.
- Réutiliser version du brouillon, lease, quotas, stockage privé, nettoyage sur échec et rotation de clé existants. Après enregistrement, les octets restent indépendants du devis : changement/suppression de source ne modifie pas une pièce déjà jointe.

## Critères de recette

SQL SQLite/PostgreSQL : client/société/auteur étrangers, permission Sales absente, révision modifiée sans incrément du numéro, coordonnées/options changées, devis sans version, sélection devenue ancienne, version concurrente du brouillon, quota, sortie trop grande, génération échouée, retry de copie déjà enregistrée sans nouvelle génération, gel programmation/envoi, source supprimée après copie et démo publique.

Navigateur ordinateur/mobile : choisir/rechercher/paginer le devis, voir version et qualification de copie, ajouter, recharger et rouvrir les mêmes pièces, retirer, conserver la saisie après refus, absence d’envoi automatique et de débordement. La recette doit inclure un cas où v1 est modifiée entre sélection et ajout.

CI : qualifier le SHA final, les artefacts de base et le générateur PDF Linux ; ne pas réutiliser la preuve du lot fichiers/factures pour prétendre qualifier ce rendu nouveau. Fournisseurs réels et valeur probatoire d’une archive acceptée ne sont pas couverts par cette copie actuelle.