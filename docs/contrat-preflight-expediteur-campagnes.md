# Contrôle préalable de l’expéditeur des campagnes

Le contrôle de séquence complète le contrôle du contenu par celui de sa boîte
expéditrice et des plafonds internes. Il lit la configuration et les agrégats
autorisés, sans appel HTTP, DNS, renouvellement OAuth, admission ou envoi.

Une séquence contenant des e-mails doit désigner une boîte connectée et accessible
au rôle courant. Une connexion calendrier seule, des identifiants illisibles ou
des scopes ne permettant pas l’envoi et les brouillons bloquent la préparation.
Un jeton OAuth lisible ne prouve pas que l’autorisation distante est encore valide.
Le transport reste chargé de renouveler le jeton et de traiter le résultat réel.

Une politique de plafonds absente, désactivée ou incohérente empêche la capture,
le démarrage et la reprise d’une activation, avant toute inscription. Chaque lot
d’une activation existante revérifie ces prérequis ; leur retrait met l’activation
en pause avec son propre motif, sans effacer sa capture ni sa progression.
Corriger la configuration permet une reprise, sans réinscription des membres déjà
traités. Les séquences ne contenant que des tâches n’exigent pas de messagerie.

Un plafond temporairement rempli n’interdit pas de constituer l’audience ou de
mettre les messages en file d’attente. Le rapport l’indique avec les consommations
et les prochaines périodes UTC. Il ne réserve aucune capacité et ne promet pas
une heure de livraison. Seul le contrôle transactionnel précédant l’envoi admet
les destinataires ; il peut constater une consommation différente depuis le
rapport. Les limites sont des réglages opérationnels indépendants du contenu et
ne sont pas figées dans la capture d’audience.

Le rapport ne contient aucune adresse, clé, jeton, contenu de message ou empreinte
d’admission. Une boîte privée inaccessible produit un motif générique, sans ses
plafonds. L’autorisation utilise l’adhésion actuelle, y compris si son rôle a changé
depuis l’authentification. La lecture reste disponible en démo publique ; ses
mutations restent interdites.

La disponibilité des domaines, leur authentification chez le fournisseur, la
délivrabilité et les quotas du compte fournisseur ne sont pas vérifiés par cette
lecture locale. Leur qualification reste distincte, ainsi que le parcours de test
sur un destinataire autorisé. Aucun compte fournisseur réel n’est utilisé pour la
recette de ce lot.
