# Utiliser la démonstration locale Freelio

Cette démonstration contient exclusivement des données fictives. Elle est prévue pour explorer le projet sur cet ordinateur ; elle n’ouvre pas un service commercial. Les textes visibles de démonstration sont activés uniquement dans ce mode. Les couleurs, boutons et dispositions existants sont conservés.

L’intégration Gemini a été retirée du projet avec accord explicite : SDK, actions d’analyse, configuration, compteur et ligne des paramètres. Les dépenses restent saisies manuellement et leurs justificatifs restent conservés. Le bouton de dépôt est nommé « Joindre un justificatif », conformément au lot visible approuvé.

## Créer une démo

Avec Node 24 LTS et les dépendances du projet déjà installées, depuis la racine du dépôt :

```powershell
npm run demo
```

Le lanceur crée un dossier distinct sous `%TEMP%\Freelio-local-demo`, copie le code courant, prépare une SQLite neuve et crée une entreprise fictive avec six clients, six devis, six factures brouillons, six interventions, trois produits et un dépôt. Il ne copie aucun `.env`, aucune base existante ni les fichiers métier du projet. Il réutilise les dépendances installées sans installation ni régénération du client Prisma.

Le terminal affiche l’adresse locale, par défaut `http://127.0.0.1:54177`, le dossier créé et le chemin `demo-access.json`. Ce fichier contient l’adresse du compte fictif, son mot de passe aléatoire et les clés propres à cette démo. Ouvrir ce fichier localement pour se connecter ; conserver ce fichier privé avec les sauvegardes. Le terminal n’affiche pas les secrets. La connexion exige le mot de passe, y compris en développement.

Le serveur écoute seulement sur `127.0.0.1`. Le lanceur transmet une liste explicite de variables aux processus : les clés fournisseur et les variables du projet ne sont pas héritées. Un garde-fou Node refuse les connexions externes, à l’exception des téléchargements publics de polices Google en HTTPS/GET sans authentification. Ce garde-fou ne constitue pas un pare-feu système. Aucun envoi métier aux fournisseurs n’est nécessaire pour cette démonstration.

Pour préparer les données sans lancer le serveur : `npm run demo -- --prepare`. Pour choisir un autre port : `npm run demo -- --port 54178`.

## Conserver et reprendre

Arrêter le serveur avec `Ctrl+C`. Reprendre le même compte et ses modifications avec le dossier affiché précédemment :

```powershell
npm run demo -- --resume "C:\chemin\vers\le\dossier-demo"
```

La reprise actualise le code depuis ce dépôt et conserve la base et les justificatifs de la démo. Elle refuse un dossier sans marqueur de démo valide. Une réservation empêche deux serveurs ou une sauvegarde simultanée sur cette même base ; une réservation laissée par un processus terminé peut être récupérée, avec conservation de son historique.

Les dossiers sont dans le répertoire temporaire Windows : les sauvegarder avant un nettoyage de ce répertoire.

## Sauvegarder et restaurer

Arrêter la démo avant la sauvegarde :

```powershell
npm run demo:backup -- --dir "C:\chemin\vers\le\dossier-demo"
```

La sauvegarde est placée dans un sous-dossier `backups` dont le chemin est affiché. Elle comprend une copie native cohérente de toute la SQLite, les fichiers du répertoire `data` et `demo-access.json`, nécessaire pour retrouver le compte et déchiffrer ses archives. Un manifeste conserve les empreintes SHA-256 ; les liens symboliques sont refusés. Conserver l’ensemble de ce dossier de sauvegarde, pas seulement le fichier `.db`.

Restaurer dans un nouveau dossier :

```powershell
npm run demo:backup -- --restore "C:\chemin\vers\le\dossier-sauvegarde"
npm run demo -- --resume "C:\nouveau-dossier-affiche-par-la-restauration"
```

La restauration vérifie les empreintes, les chemins et l’intégrité SQLite. Elle crée une cible neuve et ne remplace pas la source. Cette procédure concerne exclusivement la démo SQLite et ses fichiers locaux ; la restauration PostgreSQL ou d’objets distants demande une procédure distincte.

## Recette reproductible

Sur une démo lancée contenant les données fictives :

```powershell
node scripts/verify-demo.mjs "C:\chemin\vers\le\dossier-demo"
```

Cette recette se connecte au compte fictif, vérifie les pages principales, les textes de démonstration, les PDF et les accès anonymes, crée puis modifie un devis fictif et rapproche ses montants en centimes avec la base. Elle contrôle aussi le lien d’évitement au clavier et la navigation mobile. Elle écrit un rapport et des captures dans `verification`. Les devis de recette restent dans cette base fictive. Ce contrôle ciblé ne constitue pas un audit d’accessibilité complet ni un benchmark de production.

Les contrôles locaux ont été réalisés avec Node 24.15.0. Node 24 est désormais la version déclarée du projet, de la CI et des images. Les services fournisseur, PostgreSQL, la CI distante et un déploiement public ne font pas partie de cette recette SQLite ; les validations supplémentaires sont consignées dans le suivi CTO.
