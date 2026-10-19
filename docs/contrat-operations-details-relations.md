# Périmètre des fiches Service et Achat

Lot validé le 19 octobre 2026, distinct de la synthèse Opérations : les fiches Équipement, Intervention, Ticket SAV et Achat deviennent introuvables si une référence requise est étrangère à la société ou aux agences accessibles. Leurs historiques, compteurs et réponses serveur excluent également les relations interdites. Les écrans « introuvable » existants sont conservés.

Les relations facultatives absentes restent permises selon les droits existants. Les affectations historiques locales peuvent rester visibles après suspension de leur auteur. Les coûts opérationnels, projections des mesures Client, ACL des boîtes privées et absence de CCI dans les messages lus restent conservés. Les champs liés inutiles à ces écrans ne sont pas transmis.

Les tests injectent des incohérences sur SQL réel : leur présence dans la fixture ne prouve pas qu'un formulaire permet de les créer. Avant correction, quatre témoins cohérents passent ; les quatre refus de racines et trois exclusions d'historiques échouent. Le contrôle d'historique Équipement passe, soit cinq réussites et sept échecs sur douze cas.

L'acceptation couvre les racines, historiques fusionnés, auteurs et guides, conversations/messages/événements, achats/réceptions/incidents/retours, compteurs et révocation d'agence. Les témoins cohérents et l'absence de mutation sont vérifiés. Les droits sont relus dans la même session. Les [preuves](evidence/20261019-operations-details/README.md) séparent SQL local, sélection navigateur et résultat CI.

Ce lot porte sur ces quatre lecteurs. Il ne répare ni ne supprime de donnée, ne modifie pas les actions d'écriture, ne complète pas les annuaires et ne tranche pas la cohérence entre deux clients accessibles d'une même société. Aucun message envoyé ni document régénéré.
