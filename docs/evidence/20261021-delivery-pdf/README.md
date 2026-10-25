# Bons de livraison : PDF natifs et marges d’impression

Code : `5f15d205ebba8c0eebb0689eeea2c4e964deb24b`. La [suite native](../../../tests/unit/delivery-pdf-native.integration.test.ts) utilise SQL, l’action de signature, la capture chiffrée, la route PDF, les polices livrées et Chromium réels. Seuls la session et le cache Next sont simulés ; aucun serveur applicatif n’est lancé.

Le [diagnostic](baseline.json) reproduit un défaut d’impression : les quatre pages du document long dépassent les marges prévues, avec du texte à 8 pt du bord supérieur sur les pages suivantes. Les polices sont bien incorporées ; les premiers échecs du harnais venaient d’une hypothèse incorrecte sur leur format PDF. Chromium émet ici des programmes de glyphes Type 3 avec table Unicode. La suite vérifie ces programmes ou les fichiers de police incorporés et retrouve les deux familles livrées.

La correction porte les marges dans `@page` et retire le padding du conteneur uniquement à l’impression. Le bon court reste sur une page ; le document fictif de 80 lignes passe de quatre à cinq pages pour respecter les marges. Les 80 lignes sont présentes, dans l’ordre, sans duplication ; accents, quantité 0,0001, réceptionnaire et empreinte sont extraits du vrai PDF. Les nouvelles captures et les rendus non scellés utilisent cette règle ; les captures déjà signées restent inchangées.

L’[inspection hors ligne](../../../scripts/verify-delivery-pdf.py) passe **37 contrôles** sur les trois PDF de la suite complète : marges de chaque page, contenu et empreintes, puis texte et pixels identiques avant/après modification des identités et lignes en base. Les pages sont rasterisées ; le document court et les deux dernières pages du long ont aussi été examinés visuellement sur la recette ciblée. Les fichiers fictifs restent externes au dépôt ; le [rapport](local.json) conserve leurs SHA-256, dimensions de texte, empreintes de pixels et versions des outils. Les octets PDF ne sont pas comparés comme une archive binaire immuable.

La suite complète passe **3 340 tests dans 272 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les 50 cas ciblés passent dans cette même exécution ; les 1 206 fichiers source correspondent au commit. Types, deux lints et build de 76 pages passent. La couverture porte toujours sur six modules configurés. Les refus sans session et sans capture historique n’invoquent pas Chromium.

Le cas de 80 lignes est une fixture SQL explicite d’un document historique/importé ; il ne démontre pas un formulaire de livraison en lot. Cette qualification Windows ne remplace ni PostgreSQL/Linux ni les interactions Playwright de l’application. HTML/ressources sont conservés et les PDF sont produits à la demande : identité certifiée et archive PDF binaire restent distinctes. Aucun envoi, installation, push, nouvelle CI, fusion ou déploiement.

## Reproduire

Dans une copie isolée déjà installée, avec Chromium existant, secrets fictifs et `DATABASE_URL` SQLite neuve :

1. `node scripts/prepare-dev-database.mjs`.
2. Définir `PDF_NATIVE_RECEIPT` vers un fichier JSON externe, puis `node node_modules/vitest/vitest.mjs run tests/unit/delivery-pdf-native.integration.test.ts --no-file-parallelism`. Une absence de Chromium fait échouer cette suite ; elle n’est pas ignorée.
3. Avec un Python disposant déjà de pdfplumber, pypdfium2 et Pillow, `python scripts/verify-delivery-pdf.py <chemin-du-reçu.json>`. Le script n’installe rien et retourne un code non nul si une assertion échoue. Cette inspection est distincte de la CI.
