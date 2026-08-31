export type ContractTemplateCategory =
  | "prestation"
  | "maintenance"
  | "conseil"
  | "creation"
  | "data"
  | "juridique"
  | "operation"

export type ContractTemplatePreset = {
  id: string
  name: string
  category: ContractTemplateCategory
  title: string
  description: string
  bestFor: string
  sections: number
  content: string
}

export type ContractClausePreset = {
  id: string
  title: string
  description: string
  content: string
}

export const CONTRACT_TEMPLATE_CATEGORY_LABELS: Record<ContractTemplateCategory, string> = {
  prestation: "Prestation",
  maintenance: "Maintenance",
  conseil: "Conseil",
  creation: "Création",
  data: "Data/RGPD",
  juridique: "Juridique",
  operation: "Opération",
}

const FRENCH_LEGAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAccord de confidentialite\b/g, "Accord de confidentialité"],
  [/\bConfidentialite\b/g, "Confidentialité"],
  [/\bconfidentialite\b/g, "confidentialité"],
  [/\bDonnees personnelles\b/g, "Données personnelles"],
  [/\bdonnees personnelles\b/g, "données personnelles"],
  [/\bdonnees\b/g, "données"],
  [/\bDonnees\b/g, "Données"],
  [/\bPropriete intellectuelle\b/g, "Propriété intellectuelle"],
  [/\bpropriete intellectuelle\b/g, "propriété intellectuelle"],
  [/\bpropriete\b/g, "propriété"],
  [/\bPropriete\b/g, "Propriété"],
  [/\bResponsabilite\b/g, "Responsabilité"],
  [/\bresponsabilite\b/g, "responsabilité"],
  [/\bSecurite\b/g, "Sécurité"],
  [/\bsecurite\b/g, "sécurité"],
  [/\bDuree\b/g, "Durée"],
  [/\bduree\b/g, "durée"],
  [/\bResiliation\b/g, "Résiliation"],
  [/\bresiliation\b/g, "résiliation"],
  [/\bReversibilite\b/g, "Réversibilité"],
  [/\breversibilite\b/g, "réversibilité"],
  [/\bPerimetre\b/g, "Périmètre"],
  [/\bperimetre\b/g, "périmètre"],
  [/\bEcheance\b/g, "Échéance"],
  [/\becheances\b/g, "échéances"],
  [/\becheance\b/g, "échéance"],
  [/\bdelais\b/g, "délais"],
  [/\bdelai\b/g, "délai"],
  [/\betapes\b/g, "étapes"],
  [/\betape\b/g, "étape"],
  [/\bmodalites\b/g, "modalités"],
  [/\bModalites\b/g, "Modalités"],
  [/\bnecessaires\b/g, "nécessaires"],
  [/\bnecessaire\b/g, "nécessaire"],
  [/\bnecessite\b/g, "nécessite"],
  [/\bnecessitent\b/g, "nécessitent"],
  [/\bspecifiques\b/g, "spécifiques"],
  [/\bspecifique\b/g, "spécifique"],
  [/\bgeneriques\b/g, "génériques"],
  [/\bgenerique\b/g, "générique"],
  [/\bpreexistants\b/g, "préexistants"],
  [/\bpreexistant\b/g, "préexistant"],
  [/\bprealable\b/g, "préalable"],
  [/\bprealables\b/g, "préalables"],
  [/\bseparee\b/g, "séparée"],
  [/\bsepare\b/g, "séparé"],
  [/\bcomplementaires\b/g, "complémentaires"],
  [/\bcomplementaire\b/g, "complémentaire"],
  [/\brealisees\b/g, "réalisées"],
  [/\brealises\b/g, "réalisés"],
  [/\brealisee\b/g, "réalisée"],
  [/\brealise\b/g, "réalisé"],
  [/\brealiser\b/g, "réaliser"],
  [/\bcrees\b/g, "créés"],
  [/\bcreee\b/g, "créée"],
  [/\bcree\b/g, "créé"],
  [/\bcedees\b/g, "cédées"],
  [/\bcedes\b/g, "cédés"],
  [/\bcedee\b/g, "cédée"],
  [/\bcede\b/g, "cède"],
  [/\bprotegees\b/g, "protégées"],
  [/\bproteges\b/g, "protégés"],
  [/\bprotegee\b/g, "protégée"],
  [/\bproteger\b/g, "protéger"],
  [/\bprotege\b/g, "protège"],
  [/\bechangees\b/g, "échangées"],
  [/\bechanges\b/g, "échanges"],
  [/\bechange\b/g, "échange"],
  [/\becrit\b/g, "écrit"],
  [/\becrite\b/g, "écrite"],
  [/\becrites\b/g, "écrites"],
  [/\becrits\b/g, "écrits"],
  [/\bexecution\b/g, "exécution"],
  [/\bExecution\b/g, "Exécution"],
  [/\bdebut\b/g, "début"],
  [/\bdeja\b/g, "déjà"],
  [/\bete\b/g, "été"],
  [/\bintégral\b/g, "intégral"],
  [/\bintegral\b/g, "intégral"],
  [/\binterne\b/g, "interne"],
  [/\bexternes\b/g, "externes"],
  [/\bfrancais\b/g, "français"],
  [/\bFrançais\b/g, "Français"],
  [/\bstrategiques\b/g, "stratégiques"],
  [/\bstrategie\b/g, "stratégie"],
  [/\bStrategie\b/g, "Stratégie"],
  [/\bfinancieres\b/g, "financières"],
  [/\beconomiques\b/g, "économiques"],
  [/\bmethodologie\b/g, "méthodologie"],
  [/\bmethodes\b/g, "méthodes"],
  [/\bmethode\b/g, "méthode"],
  [/\bMethodologie\b/g, "Méthodologie"],
  [/\bbibliotheques\b/g, "bibliothèques"],
  [/\bmodeles\b/g, "modèles"],
  [/\bModele\b/g, "Modèle"],
  [/\bmodele\b/g, "modèle"],
  [/\bDeveloppement\b/g, "Développement"],
  [/\bdeveloppement\b/g, "développement"],
  [/\bdevelopper\b/g, "développer"],
  [/\bdeploiement\b/g, "déploiement"],
  [/\bevolutive\b/g, "évolutive"],
  [/\bevolutif\b/g, "évolutif"],
  [/\bevolutions\b/g, "évolutions"],
  [/\bevolution\b/g, "évolution"],
  [/\bhebergement\b/g, "hébergement"],
  [/\bhebergeur\b/g, "hébergeur"],
  [/\bediteurs\b/g, "éditeurs"],
  [/\bediteur\b/g, "éditeur"],
  [/\bequipe\b/g, "équipe"],
  [/\bEquipe\b/g, "Équipe"],
  [/\bidentite\b/g, "identité"],
  [/\bIdentite\b/g, "Identité"],
  [/\bcreation\b/g, "création"],
  [/\bCreation\b/g, "Création"],
  [/\bdeclinaisons\b/g, "déclinaisons"],
  [/\bvisuels\b/g, "visuels"],
  [/\bIterations\b/g, "Itérations"],
  [/\bIteration\b/g, "Itération"],
  [/\biterations\b/g, "itérations"],
  [/\biteration\b/g, "itération"],
  [/\bpreparation\b/g, "préparation"],
  [/\bpresent\b/g, "présent"],
  [/\bPresent\b/g, "Présent"],
  [/\bprevues\b/g, "prévues"],
  [/\bprevus\b/g, "prévus"],
  [/\bprevue\b/g, "prévue"],
  [/\bprevu\b/g, "prévu"],
  [/\bevaluations\b/g, "évaluations"],
  [/\bevaluation\b/g, "évaluation"],
  [/\bintegration\b/g, "intégration"],
  [/\bintegrations\b/g, "intégrations"],
  [/\bmetier\b/g, "métier"],
  [/\bmetiers\b/g, "métiers"],
  [/\brecurrentes\b/g, "récurrentes"],
  [/\brecurrent\b/g, "récurrent"],
  [/\bsystemes\b/g, "systèmes"],
  [/\bsysteme\b/g, "système"],
  [/\bdemarrage\b/g, "démarrage"],
  [/\bdepassements\b/g, "dépassements"],
  [/\bdepassement\b/g, "dépassement"],
  [/\bechues\b/g, "échues"],
  [/\bechue\b/g, "échue"],
  [/\breglementaires\b/g, "réglementaires"],
  [/\breglementaire\b/g, "réglementaire"],
  [/\breglement\b/g, "règlement"],
  [/\butilisees\b/g, "utilisées"],
  [/\butilises\b/g, "utilisés"],
  [/\butilisee\b/g, "utilisée"],
  [/\butilise\b/g, "utilisé"],
  [/\binterpretation\b/g, "interprétation"],
  [/\bdifferend\b/g, "différend"],
  [/\bperiodicite\b/g, "périodicité"],
  [/\bperiode\b/g, "période"],
  [/\bpenalites\b/g, "pénalités"],
  [/\bdisponibilite\b/g, "disponibilité"],
  [/\bactivites\b/g, "activités"],
  [/\bactivite\b/g, "activité"],
  [/\bqualite\b/g, "qualité"],
  [/\bregles\b/g, "règles"],
  [/\breponse\b/g, "réponse"],
  [/\brole\b/g, "rôle"],
  [/\broles\b/g, "rôles"],
  [/\bindependance\b/g, "indépendance"],
  [/\bindependant\b/g, "indépendant"],
  [/\bindependamment\b/g, "indépendamment"],
  [/\bintegre\b/g, "intégré"],
  [/\bcoopere\b/g, "coopère"],
  [/\bcooperer\b/g, "coopérer"],
  [/\bcooperation\b/g, "coopération"],
  [/\bnotifiee\b/g, "notifiée"],
  [/\bdecisions\b/g, "décisions"],
  [/\bdecision\b/g, "décision"],
  [/\bdefinies\b/g, "définies"],
  [/\bdefinis\b/g, "définis"],
  [/\bdefinir\b/g, "définir"],
  [/\bdefaut\b/g, "défaut"],
  [/\bdiscussions\b/g, "discussions"],
  [/\bnegociations\b/g, "négociations"],
  [/\bconformite\b/g, "conformité"],
  [/\blicite\b/g, "licite"],
  [/\brecus\b/g, "reçus"],
  [/\boperationnelles\b/g, "opérationnelles"],
  [/\boperationnel\b/g, "opérationnel"],
  [/\bOperation\b/g, "Opération"],
  [/\boperation\b/g, "opération"],
  [/\btracabilite\b/g, "traçabilité"],
  [/\bopportunites\b/g, "opportunités"],
  [/\bpresentees\b/g, "présentées"],
  [/\bpresente\b/g, "présente"],
  [/\bderoulement\b/g, "déroulement"],
  [/\bmise a jour\b/g, "mise à jour"],
  [/\ba disposition\b/g, "à disposition"],
  [/\ba defaut\b/g, "à défaut"],
  [/\ba compter\b/g, "à compter"],
  [/\ba titre\b/g, "à titre"],
  [/\ba la fin\b/g, "à la fin"],
  [/\ba l'issue\b/g, "à l'issue"],
  [/\bci-apres\b/g, "ci-après"],
  [/\bvis-a-vis\b/g, "vis-à-vis"],
  [/\bimmatriculee\b/g, "immatriculée"],
  [/\bsoussignes\b/g, "soussignés"],
  [/\bnumerisee\b/g, "numérisée"],
  [/\belectronique\b/g, "électronique"],
]

function formatFrenchLegalText(value: string) {
  return FRENCH_LEGAL_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  )
}

function formatTemplatePreset(template: ContractTemplatePreset): ContractTemplatePreset {
  return {
    ...template,
    name: formatFrenchLegalText(template.name),
    title: formatFrenchLegalText(template.title),
    description: formatFrenchLegalText(template.description),
    bestFor: formatFrenchLegalText(template.bestFor),
    content: formatFrenchLegalText(template.content),
  }
}

function formatClausePreset(clause: ContractClausePreset): ContractClausePreset {
  return {
    ...clause,
    title: formatFrenchLegalText(clause.title),
    description: formatFrenchLegalText(clause.description),
    content: formatFrenchLegalText(clause.content),
  }
}

const parties = `
<p><strong>Entre les soussignés :</strong></p>
<p>{{entreprise.name}}, immatriculee sous le SIRET {{entreprise.siret}}, ci-apres "le Prestataire",</p>
<p>Et {{client.name}}, ci-apres "le Client".</p>
<p>Les Parties conviennent ce qui suit.</p>
`

function list(items: string[]) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
}

function section(title: string, body: string | string[]) {
  return `<h2>${title}</h2>${Array.isArray(body) ? list(body) : `<p>${body}</p>`}`
}

function contract(sections: Array<[string, string | string[]]>) {
  return formatFrenchLegalText([
    "<h1>{{contract.title}}</h1>",
    parties,
    ...sections.map(([title, body]) => section(title, body)),
    "<h2>Signature electronique</h2>",
    "<p>Les Parties reconnaissent que la signature electronique du present contrat produit les memes effets qu'une signature manuscrite, sous reserve de l'identification du signataire et de la conservation de la preuve de signature.</p>",
  ].join(""))
}

const RAW_CONTRACT_TEMPLATE_PRESETS: ContractTemplatePreset[] = [
  {
    id: "vertical-fourniture-pose",
    name: "Fourniture et pose",
    category: "prestation",
    title: "Contrat de fourniture et pose d’un équipement de piscine",
    description: "Cadre la fourniture, le relevé technique, la préparation et la pose chez le client.",
    bestFor: "Couverture, volet, équipement de sécurité ou accessoire posé par l’entreprise.",
    sections: 9,
    content: contract([
      ["1. Objet", "Le présent contrat définit les conditions de fourniture, de préparation et de pose de l’équipement de piscine décrit au devis accepté par le Client."],
      ["2. Documents contractuels", ["Le devis accepté et ses annexes techniques.", "Le relevé de dimensions validé pour fabrication ou préparation.", "Les présentes conditions et, le cas échéant, les avenants signés."]],
      ["3. Relevé technique", "Le Client garantit l’accès au bassin et signale toute contrainte connue. Les dimensions, obstacles, accès et alimentations relevés sur site conditionnent la solution finale. Toute modification postérieure peut entraîner un avenant."],
      ["4. Préparation du site", ["Le Client libère et sécurise la zone d’intervention.", "Les supports, alimentations et accès doivent être conformes aux prérequis communiqués.", "Les travaux de maçonnerie, électricité ou reprise non prévus au devis restent hors périmètre."]],
      ["5. Livraison et pose", "La date de pose est confirmée lorsque le matériel, le site et les équipes sont disponibles. Les intempéries, contraintes de sécurité ou impossibilités d’accès peuvent justifier un report."],
      ["6. Réception", "À la fin de la pose, les essais et points de contrôle sont consignés. Le compte rendu d’intervention signé mentionne les éventuelles réserves et vaut réception pour les éléments sans réserve."],
      ["7. Prix et paiement", "Le prix, l’acompte, les échéances et les modalités de paiement sont ceux du devis accepté. La commande peut être suspendue tant qu’un acompte exigible n’est pas encaissé."],
      ["8. Garanties", "Les garanties fabricant s’appliquent selon leurs conditions. La garantie de pose couvre les défauts directement imputables à l’intervention de {{entreprise.name}}, hors mauvaise utilisation, intervention d’un tiers, usure ou événement extérieur."],
      ["9. Responsabilité et sécurité", "Le Client respecte les consignes d’utilisation et d’entretien remises. Un équipement de sécurité ne remplace jamais la vigilance d’un adulte responsable autour du bassin."],
    ]),
  },
  {
    id: "vertical-entretien",
    name: "Entretien d’équipement",
    category: "maintenance",
    title: "Contrat d’entretien d’un équipement de piscine",
    description: "Définit la fréquence, le parc couvert et le contenu des visites d’entretien.",
    bestFor: "Couvertures, volets et équipements installés suivis dans le parc client.",
    sections: 8,
    content: contract([
      ["1. Objet", "{{entreprise.name}} réalise les visites d’entretien préventif des équipements identifiés au contrat selon la fréquence convenue."],
      ["2. Prestations incluses", ["Contrôle visuel et fonctionnel.", "Nettoyage et réglages courants accessibles.", "Signalement des pièces usées, anomalies et risques constatés.", "Compte rendu après chaque visite."]],
      ["3. Exclusions", "Les pièces, réparations, travaux électriques ou de maçonnerie et interventions consécutives à une mauvaise utilisation font l’objet d’un devis séparé."],
      ["4. Accès", "Le Client garantit l’accès au site et à l’équipement à la date convenue. Une visite empêchée sans préavis suffisant peut être considérée comme due."],
      ["5. Planification", "Les visites sont planifiées autour de la date indicative enregistrée. {{entreprise.name}} peut proposer un ajustement pour tenir compte de la saison, de la météo ou de la disponibilité des pièces."],
      ["6. Prix", "Le prix et les modalités de révision figurent au contrat ou au devis. Toute prestation non incluse nécessite l’accord préalable du Client."],
      ["7. Durée et résiliation", "Le contrat s’applique pendant la période indiquée. Les conditions de renouvellement et de résiliation suivent les mentions particulières acceptées par les Parties."],
      ["8. Traçabilité", "Chaque visite donne lieu à un rapport horodaté. L’accord du Client présent peut être recueilli électroniquement et conservé avec son empreinte de preuve."],
    ]),
  },
  {
    id: "vertical-sav",
    name: "Intervention SAV",
    category: "maintenance",
    title: "Conditions d’intervention de service après-vente",
    description: "Cadre diagnostic, réparation, pièces et réception d’une intervention SAV.",
    bestFor: "Dépannage ponctuel, garantie, diagnostic ou remise en service.",
    sections: 7,
    content: contract([
      ["1. Objet", "{{entreprise.name}} intervient sur le site du Client afin de diagnostiquer ou traiter l’anomalie déclarée sur l’équipement identifié."],
      ["2. Diagnostic", "Le diagnostic initial repose sur les informations fournies et les contrôles réalisables sur place. Une investigation ou un démontage complémentaire peut nécessiter un accord et un devis distincts."],
      ["3. Garantie", "Lorsque l’intervention relève d’une garantie applicable, sa prise en charge reste subordonnée aux conditions du fabricant et à l’absence d’exclusion."],
      ["4. Pièces et travaux complémentaires", "Aucune pièce ou réparation non prévue n’est facturée sans information et accord du Client, sauf mesure conservatoire indispensable à la sécurité."],
      ["5. Accès et sécurité", "Le Client assure un accès sûr au site, coupe les équipements lorsque cela est demandé et signale tout danger particulier."],
      ["6. Compte rendu", "Les opérations, le temps passé et les réserves sont consignés dans le rapport d’intervention. L’accord électronique du Client présent scelle le rapport horodaté."],
      ["7. Paiement", "Les frais de déplacement, diagnostic, main-d’œuvre et pièces sont facturés selon le devis, le tarif accepté ou les conditions de garantie applicables."],
    ]),
  },
  {
    id: "vertical-renovation-bassin",
    name: "Rénovation de bassin",
    category: "prestation",
    title: "Contrat de rénovation d’un bassin",
    description: "Cadre diagnostic initial, travaux, aléas du support, réception et réserves.",
    bestFor: "Liner, étanchéité, pièces à sceller, filtration, margelles ou remise à niveau complète.",
    sections: 10,
    content: contract([
      ["1. Objet", "Le présent contrat définit les travaux de rénovation décrits au devis accepté, sur le bassin et les équipements identifiés après visite technique."],
      ["2. État initial", "Les constats accessibles avant ouverture du chantier sont consignés dans le relevé technique. Les désordres cachés, réseaux enterrés non signalés et défauts révélés après dépose ne sont pas réputés inclus."],
      ["3. Périmètre", ["Déposes, fournitures et travaux expressément chiffrés.", "Essais et remise en service prévus au devis.", "Évacuation des déchets uniquement lorsqu’elle est mentionnée."]],
      ["4. Travaux imprévus", "Tout défaut caché ou adaptation indispensable fait l’objet d’une information documentée et d’un avenant avant exécution, sauf mesure urgente nécessaire à la sécurité ou à la conservation du site."],
      ["5. Préparation et accès", "Le Client garantit l’accès, les autorisations et la disponibilité des alimentations nécessaires. Il signale les réseaux, ouvrages enterrés et interventions antérieures dont il a connaissance."],
      ["6. Planning", "Les dates tiennent compte du séchage, de la météo, des approvisionnements et de l’état réel des supports. Un événement incompatible avec les règles de l’art peut entraîner un report justifié."],
      ["7. Prix et paiements", "L’échéancier et les acomptes suivent le devis. Les avenants acceptés sont facturés selon leurs propres conditions."],
      ["8. Réception", "La réception contradictoire mentionne les essais, documents remis et réserves éventuelles. Les réserves sont traitées dans un délai compatible avec leur nature et la disponibilité des pièces."],
      ["9. Garanties", "Les garanties légales et fabricant applicables sont précisées selon la nature des travaux. Sont exclus les dommages dus à une mauvaise utilisation, un défaut d’entretien, une intervention tierce ou un événement extérieur."],
      ["10. Sécurité", "Le Client maintient le chantier inaccessible aux tiers pendant les travaux et respecte après remise en service les consignes d’usage, de traitement de l’eau et de sécurité du bassin."],
    ]),
  },
  {
    id: "vertical-saisonnier",
    name: "Forfait saisonnier",
    category: "maintenance",
    title: "Contrat d’ouverture, d’entretien et d’hivernage",
    description: "Regroupe les passages saisonniers, contrôles, consommables et responsabilités du client.",
    bestFor: "Ouverture, visites d’entretien planifiées et hivernage actif ou passif.",
    sections: 9,
    content: contract([
      ["1. Objet", "{{entreprise.name}} assure les prestations saisonnières listées au devis pour le bassin et les équipements enregistrés dans le dossier client."],
      ["2. Visites incluses", ["Mise en service ou sortie d’hivernage selon le forfait.", "Contrôles et opérations d’entretien planifiés.", "Hivernage selon la méthode convenue et compte rendu de clôture."]],
      ["3. Eau et consommables", "Les produits, consommables et appoints d’eau ne sont inclus que s’ils sont explicitement mentionnés. Les dosages reposent sur les mesures réalisables au moment de la visite."],
      ["4. Obligations du Client", "Entre les visites, le Client réalise les contrôles et actions simples indiqués, maintient un niveau d’eau adapté, protège le local technique et signale rapidement toute alerte ou fuite."],
      ["5. Accès", "Le Client garantit un accès autorisé et sûr aux dates convenues. Les modalités de clé, code ou présence sont définies avant la première visite et restent révocables."],
      ["6. Anomalies et réparations", "Toute anomalie significative est documentée. Les pièces et réparations hors forfait nécessitent un accord séparé, sauf mesure conservatoire expressément autorisée."],
      ["7. Planification", "Les dates peuvent être ajustées selon la météo, la température de l’eau, les contraintes techniques et la saison, avec information du Client."],
      ["8. Durée et prix", "La période, le nombre de passages, le tarif, l’indexation et les conditions de renouvellement figurent aux conditions particulières."],
      ["9. Limites", "La prestation ne garantit pas l’absence de panne, d’algues ou de gel lorsque les consignes ne sont pas suivies, que le site est inaccessible ou qu’un événement extérieur intervient entre deux visites."],
    ]),
  },
  {
    id: "vertical-sous-traitance-pose",
    name: "Sous-traitance de pose",
    category: "operation",
    title: "Contrat de sous-traitance pour travaux de piscine",
    description: "Définit mission, autonomie, sécurité, réception et preuve des travaux confiés.",
    bestFor: "Équipe de pose partenaire, renfort chantier ou intervention spécialisée.",
    sections: 9,
    content: contract([
      ["1. Objet", "Le Prestataire confie au Sous-traitant les travaux décrits dans l’ordre de mission, sans pouvoir de représentation auprès du client final."],
      ["2. Documents de chantier", "L’ordre de mission, les plans, relevés, consignes fabricant et règles de sécurité définissent le périmètre. Toute incohérence doit être signalée avant exécution."],
      ["3. Autonomie", "Le Sous-traitant organise ses moyens et son personnel sous sa responsabilité, dans le respect du planning coordonné et sans lien de subordination."],
      ["4. Compétences et assurances", "Le Sous-traitant maintient les qualifications, assurances et autorisations nécessaires et en fournit les attestations à jour avant intervention."],
      ["5. Sécurité et protection du site", "Il applique les règles de sécurité, protège les ouvrages et signale immédiatement tout incident, dommage, aléa ou situation dangereuse."],
      ["6. Modifications", "Aucun travail supplémentaire ni substitution de matériel ne peut être engagé sans accord écrit, hors mesure immédiate de mise en sécurité."],
      ["7. Contrôle et réception", "Les photos, mesures, essais, numéros de série et réserves demandés sont remis avec le rapport. La réception par le Prestataire ne couvre pas un défaut non décelable lors du contrôle."],
      ["8. Prix et facturation", "Le prix et les justificatifs attendus figurent à l’ordre de mission. La facturation intervient après remise des preuves et validation des travaux, selon les délais convenus."],
      ["9. Confidentialité et client final", "Les données et conditions commerciales du client final sont confidentielles. Toute demande directe du client est transmise au Prestataire sauf urgence de sécurité."],
    ]),
  },
  {
    id: "vertical-avenant-chantier",
    name: "Avenant chantier",
    category: "operation",
    title: "Avenant de modification de travaux",
    description: "Formalise une variation de périmètre, de prix ou de délai sans réécrire le contrat source.",
    bestFor: "Aléa découvert, option ajoutée, matériau remplacé ou planning révisé.",
    sections: 6,
    content: contract([
      ["1. Contrat concerné", "Le présent avenant complète le contrat ou devis initial identifié dans le dossier. Toutes ses stipulations non modifiées restent applicables."],
      ["2. Motif", "La modification résulte du constat, de la demande ou de l’aléa documenté et accepté par les Parties."],
      ["3. Modification du périmètre", "Les prestations ajoutées, retirées ou remplacées sont décrites dans l’avenant et ses lignes chiffrées. Aucun autre élément du périmètre n’est modifié."],
      ["4. Incidence financière", "Le nouveau montant, les taxes et l’échéancier résultent du chiffrage annexé. Les montants déjà facturés ou encaissés restent tracés séparément."],
      ["5. Incidence sur le délai", "La date ou la durée révisée tient compte des approvisionnements, validations et conditions de chantier engendrés par la modification."],
      ["6. Prise d’effet", "L’avenant prend effet après acceptation des deux Parties. Les travaux concernés ne sont pas engagés avant cette acceptation, hors mesure de sécurité documentée."],
    ]),
  },
]

export const CONTRACT_TEMPLATE_PRESETS: ContractTemplatePreset[] =
  RAW_CONTRACT_TEMPLATE_PRESETS
    .filter((template) => template.id.startsWith("vertical-"))
    .map(formatTemplatePreset)

const RAW_CONTRACT_CLAUSE_LIBRARY: ContractClausePreset[] = [
  {
    id: "acces-chantier",
    title: "Accès et préparation du chantier",
    description: "Conditionne le planning à un accès sûr et à une zone prête.",
    content: "Le Client garantit aux dates convenues un accès autorisé, dégagé et sûr au bassin, au local technique et aux alimentations nécessaires. Il retire les obstacles, protège les animaux et signale toute contrainte connue. Une intervention empêchée ou rendue dangereuse peut être reportée et les frais engagés restent dus dans les limites convenues.",
  },
  {
    id: "aleas-caches",
    title: "Aléas et ouvrages cachés",
    description: "Cadre les défauts révélés après dépose ou ouverture du chantier.",
    content: "Les désordres non visibles lors du relevé initial, réseaux enterrés non signalés, supports dégradés et non-conformités révélés après dépose ne sont pas inclus dans le prix initial. Ils sont documentés et font l'objet d'un avenant avant travaux, sauf mesure conservatoire indispensable à la sécurité du site.",
  },
  {
    id: "meteo-approvisionnement",
    title: "Météo et approvisionnements",
    description: "Permet un report justifié sans promettre une date irréaliste.",
    content: "Les dates d'intervention tiennent compte des conditions météorologiques compatibles avec les règles de l'art, des temps de séchage et de la disponibilité du matériel. Une intempérie, une rupture fournisseur ou un risque pour les personnes ou l'ouvrage peut entraîner un report motivé, sans modifier les autres engagements des Parties.",
  },
  {
    id: "securite-bassin",
    title: "Sécurité du bassin",
    description: "Rappelle les responsabilités pendant et après l'intervention.",
    content: "Pendant les travaux, le Client empêche l'accès des tiers à la zone signalée. Après remise en service, il respecte les notices, consignes d'utilisation et obligations de sécurité applicables. Aucun dispositif ne remplace la surveillance active d'un adulte responsable autour du bassin.",
  },
  {
    id: "garanties-equipements",
    title: "Garanties et exclusions",
    description: "Distingue garantie fabricant, pose et défaut d'entretien.",
    content: "Les équipements bénéficient des garanties légales et des garanties fabricant applicables selon leurs conditions. La garantie de pose couvre les défauts directement imputables aux travaux réalisés. Sont notamment exclus l'usure normale, le défaut d'entretien, la chimie de l'eau inadaptée, le gel, la mauvaise utilisation, la modification par un tiers et les événements extérieurs.",
  },
  {
    id: "reception-reserves",
    title: "Réception et réserves",
    description: "Formalise les essais, documents remis et réserves éventuelles.",
    content: "La réception est réalisée contradictoirement à l'issue des travaux ou de l'intervention. Le rapport précise les essais effectués, les documents remis et les réserves éventuelles. Les éléments sans réserve sont réputés reçus ; les réserves sont traitées dans un délai compatible avec leur nature et la disponibilité des pièces.",
  },
  {
    id: "travaux-supplementaires",
    title: "Travaux supplémentaires",
    description: "Empêche les dérives de périmètre et protège l'accord du client.",
    content: "Toute prestation, fourniture ou adaptation non prévue au devis initial fait l'objet d'une information chiffrée et d'une validation écrite avant exécution. Aucune demande orale ne modifie le prix ou le périmètre, hors mesure immédiate strictement nécessaire à la mise en sécurité.",
  },
  {
    id: "eau-consommables",
    title: "Eau, produits et consommables",
    description: "Précise ce qui est mesuré, fourni ou laissé à la charge du client.",
    content: "Les appoints d'eau, produits de traitement, consommables et évacuations ne sont inclus que s'ils figurent au devis ou au forfait. Les préconisations reposent sur les mesures disponibles lors de la visite ; le Client conserve entre les passages les contrôles et actions simples indiqués dans le compte rendu.",
  },
  {
    id: "acces-cle-code",
    title: "Clé, code et accès autonome",
    description: "Encadre l'accès au site en l'absence du client.",
    content: "Lorsque le Client autorise un accès autonome, la clé, le code ou l'instruction d'accès est utilisé uniquement pour les visites convenues, conservé de manière sécurisée et restitué ou supprimé à première demande. Toute perte ou suspicion de compromission est signalée sans délai.",
  },
  {
    id: "preuves-chantier",
    title: "Photos et preuves d'intervention",
    description: "Autorise une traçabilité proportionnée sans usage marketing implicite.",
    content: "Les mesures, numéros de série, photographies techniques et signatures peuvent être conservés dans le dossier afin de prouver l'état initial, les opérations et la réception. Ils ne sont pas utilisés à des fins de communication commerciale sans un accord distinct du Client.",
  },
  {
    id: "retard-paiement",
    title: "Retard de paiement",
    description: "Cadre la suspension d'une commande ou d'un chantier.",
    content: "En cas d'acompte ou de facture exigible non réglé, {{entreprise.name}} peut suspendre la commande, l'approvisionnement ou les travaux après information du Client, sans que ce report constitue un abandon du chantier. Les pénalités et frais applicables restent ceux indiqués sur les documents commerciaux.",
  },
  {
    id: "confidentialite",
    title: "Confidentialité",
    description: "Protège les informations privées échangées pendant l'intervention.",
    content: "Chaque Partie conserve confidentielles les informations non publiques reçues de l'autre Partie et ne les utilise que pour l'exécution du contrat. Cette obligation ne couvre pas les informations déjà publiques, légitimement détenues ou requises par une autorité compétente.",
  },
  {
    id: "force-majeure",
    title: "Force majeure",
    description: "Couvre un événement imprévisible empêchant l'exécution.",
    content: "Aucune Partie n'est responsable d'un manquement causé par un événement de force majeure au sens du droit applicable pendant la période où cet événement empêche raisonnablement l'exécution de ses obligations. La Partie concernée informe l'autre et limite autant que possible les conséquences.",
  },
  {
    id: "signature-electronique",
    title: "Signature électronique",
    description: "Relie l'accord à la preuve horodatée conservée dans le CRM.",
    content: "Les Parties reconnaissent que la signature électronique du présent document produit les mêmes effets qu'une signature manuscrite, sous réserve de l'identification du signataire, de l'intégrité du document signé et de la conservation de la preuve horodatée.",
  },
]

export const CONTRACT_CLAUSE_LIBRARY: ContractClausePreset[] =
  RAW_CONTRACT_CLAUSE_LIBRARY.map(formatClausePreset)
