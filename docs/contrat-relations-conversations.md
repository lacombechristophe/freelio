# Relations des conversations

Six diagnostics SQL sur `05c7e1b` reproduisent la lecture de fils liés à une boîte, un client, un contact ou un prospect d'une autre société, ainsi que de messages étrangers rattachés à un fil local. Les clés étrangères existantes vérifient la présence des références, pas leur société.

Le périmètre commun des fils exige désormais que ces références optionnelles, lorsqu'elles existent, appartiennent à la société courante. Owner/Admin conservent l'accès aux boîtes privées de leur société et aux fils historiques sans boîte ; leur rôle ne permet pas de consulter une relation étrangère. Les autres membres conservent leurs restrictions de boîte.

Le même périmètre s'applique aux lectures directes, projections imbriquées et compteurs, à l'historique paginé, à l'archivage et à la prise en charge. Un message et ses événements doivent également appartenir à la société courante. La recherche dans les messages impose cette société avant de compter une correspondance. Un événement non encore associé à un message reste accessible aux administrateurs de sa propre société.

Une conversation incohérente est introuvable ; l'attribution retourne le refus existant. Les refus n'ajoutent ni mutation ni audit. Les données historiques sont conservées, sans réaffectation automatique. Les parcours cohérents, boîtes déconnectées et archives restent disponibles. Aucun schéma ni appel fournisseur n'est ajouté.

La recette utilise les actions réelles et une SQLite fictive, avec session simulée. Elle couvre quatre références étrangères, lectures, pagination, archivage, attribution, absence d'audit et messages/événements étrangers pour Owner, Admin et Sales. Elle ne prétend pas qualifier une connexion OAuth réelle.
