# Calcul des temps et aperçu de leur facture

Deux minutes à 100 €/h produisaient un aperçu de 3,33 €, puis 3,00 € regroupés ou 4,00 € détaillés : le [diagnostic SQL](../20261012-time-billing-preflight/expanded-before.json) et son reproducteur conservent cet écart.

Le [lot approuvé](../../contrat-facturation-temps-arrondis.md) partage la construction des lignes entre serveur et navigateur, conserve les secondes jusqu'au calcul et emploie l'arrondi au centime par ligne du moteur commercial existant. Le regroupement donne 3,33 € ; le détail deux lignes de 1,67 €, soit 3,34 €. Avec TVA à 20 %, les taxes arrondies sont respectivement 0,67 € et 0,66 €. La sélection et le taux sont conservés si le calcul est hors capacité, avec création désactivée.

Les quantités des nouveaux PDF de facture sont affichées avec six décimales au maximum, y compris lors d'une [nouvelle émission](../../contrat-precision-nouvelles-archives-factures.md). Cette présentation reste arrondie ; le calcul et les quantités stockées ne sont pas limités à six décimales. Les devis conservent leur format, et les archives existantes sont relues sans recalcul.

Les [résultats locaux](local.json) distinguent les 1 927 tests / 203 fichiers avant le complément d'émission des 38 tests ciblés exécutés sur sa version finale. Types, deux lints et build de cette version finale passent. Les cas ciblés incluent les calculs SQL, TVA, seconde isolée, facture historique conservée, limites monétaires, trois modèles PDF, accès au PDF et immutabilité des archives. Session/cache et certaines opérations PDF sont simulés selon leur suite ; les transactions et contraintes SQL sont réelles.

Six E2E sont définis et chargés sur ordinateur/mobile : création regroupée, création détaillée et dépassement de capacité. Ils vérifient le formulaire compilé, la facture et les temps persistés, puis l'HTML de l'aperçu PDF authentifié. Ils doivent encore être exécutés par la CI ; leur chargement local ne les qualifie pas. Aucun document réel ni envoi fournisseur n'est effectué.
