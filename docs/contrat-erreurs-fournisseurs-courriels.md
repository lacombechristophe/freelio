# Refus et temporisation des fournisseurs de courriels

Les réponses HTTP explicites du transport CRM sont distinguées des erreurs réseau
et des résultats incomplets. Une réponse 429, ou une raison Gmail 403 de limitation
reconnue, reporte la commande au plus tard du délai local et du `Retry-After`
valide. Ce délai est conservé en base et vérifié avant une relance manuelle ; les
séquences et programmations le conservent aussi après redémarrage.

Les réponses 401/403 d’autorisation et 400/422 de demande invalide arrêtent les
tentatives automatiques de cette commande figée. Les séquences restent en pause,
les programmations en échec et les commandes manuelles en journal. Une nouvelle
commande exige la correction de sa cause. Une reprise explicite de séquence après
correction d’autorisation garde le contrôle d’incertitude préexistant ; le journal
ne permet pas de relancer une demande invalide inchangée ou un quota nécessitant
une intervention. Une limite mensuelle Resend et un plafond de projet Gmail ne
déclenchent jamais un changement d’offre ni une date de remise à zéro inventée.
Le quota quotidien Resend utilise le prochain minuit UTC, selon sa documentation.

Les erreurs 5xx conservent le backoff et la limite de tentatives, en respectant un
`Retry-After` plus tardif. Leur résultat reste incertain. Une attente locale avant
ce délai ne compte pas comme une nouvelle tentative fournisseur. Un appel HTTP
effectivement tenté compte, même en cas de refus ; aucune admission de plafond
interne n’est remboursée. Les corps d’erreur fournisseurs ne sont pas affichés ou
stockés par cette classification, car ils peuvent contenir des adresses cachées
ou des secrets.

La catégorie persistée décrit la dernière réponse HTTP classifiée, sans affirmer
qu’une tentative précédente a échoué. Le contenu, la boîte, les clés d’idempotence,
les références de brouillon, les admissions et la première tentative sont
conservés. Une erreur réseau, un succès sans référence, un brouillon disparu ou
un conflit ne constitue pas une preuve de non-envoi. Ces situations gardent les
protections de reprise et la fenêtre Resend de 23 heures ; aucun compteur réinitialisé
ou refus ultérieur ne prolonge cette fenêtre. Une acceptation déjà conservée se
répare sans transport.

Le périmètre couvre l’envoi, les lectures de préparation/reprise et les pièces
Microsoft de ces commandes. Le renouvellement OAuth, la synchronisation, les
liens magiques et les limitations à l’échelle d’un compte fournisseur partagé
restent distincts. Une temporisation de commande ne bloque pas globalement les
autres commandes de sa boîte. La migration ajoute seulement une catégorie
nullable ; les anciennes commandes restent sans classification rétroactive.

Références consultées le 21 octobre 2026 : [erreurs Resend](https://resend.com/docs/api-reference/errors),
[limitation Microsoft Graph](https://learn.microsoft.com/en-us/graph/throttling),
[erreurs Gmail](https://developers.google.com/workspace/gmail/api/guides/handle-errors).
Ces contrats orientent la classification ; la recette fictive ne qualifie aucun
compte ni envoi réel.
