import type { MigrationPayload } from "@/lib/migrations/ingest"

export type SourcePayload = { [key: string]: MigrationPayload }
export type MigrationTargetKind =
  | "CLIENT"
  | "CONTACT"
  | "SITE"
  | "SUPPLIER"
  | "PRODUCT"
  | "WAREHOUSE"
  | "OPPORTUNITY"
  | "PROJECT"
  | "EQUIPMENT"
  | "TICKET"
  | "INTERVENTION"
  | "MAINTENANCE_CONTRACT"
  | "PURCHASE_ORDER"
  | "CUSTOMER_ORDER"
  | "DELIVERY_NOTE"
  | "GOODS_RECEIPT"
  | "STOCK_RESERVATION"
  | "STOCK_MOVEMENT"
  | "QUOTE"
  | "INVOICE"
  | "LINE_ITEM"
  | "PAYMENT"
  | "ACTIVITY"
  | "UNSUPPORTED"

function keyName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function entries(payload: SourcePayload) {
  return new Map(Object.entries(payload).map(([key, value]) => [keyName(key), value]))
}

function scalar(value: MigrationPayload | undefined) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

export function sourceValue(payload: SourcePayload, aliases: string[]) {
  const values = entries(payload)
  for (const alias of aliases) {
    const value = scalar(values.get(keyName(alias)))
    if (value) return value
  }
  return ""
}

function joinedName(payload: SourcePayload) {
  return [
    sourceValue(payload, ["firstname", "first_name", "prenom"]),
    sourceValue(payload, ["lastname", "last_name", "nom_de_famille"]),
  ].filter(Boolean).join(" ")
}

export function classifySourceObject(objectType: string): MigrationTargetKind {
  const type = keyName(objectType)
  if (/(^|_)(line_items?|lignes?_documents?|lignes?_devis|lignes?_factures?|discounts?|remises?|fees?|frais|taxes?)(_|$)/.test(type)) return "LINE_ITEM"
  if (/(contrats?|contracts?).*(maintenance|entretien|service)|(maintenance|entretien|service).*(contrats?|contracts?)/.test(type)) return "MAINTENANCE_CONTRACT"
  if (/(^|_)(delivery_notes?|bons?_de_livraison|bons?_livraison|bordereaux?_livraison)(_|$)/.test(type)) return "DELIVERY_NOTE"
  if (/(^|_)(goods_receipts?|receptions?_fournisseurs?|receptions?_achats?)(_|$)/.test(type)) return "GOODS_RECEIPT"
  if (/(^|_)(purchase_orders?|supplier_orders?|commandes?_fournisseurs?|commandes?_achat)(_|$)/.test(type)) return "PURCHASE_ORDER"
  if (/(^|_)(customer_orders?|sales_orders?|orders?|commandes?_clients?|commandes?_ventes?)(_|$)/.test(type)) return "CUSTOMER_ORDER"
  if (/(^|_)(stock_reservations?|reservations?_stock)(_|$)/.test(type)) return "STOCK_RESERVATION"
  if (/(^|_)(stock_movements?|mouvements?_stock|inventory_movements?)(_|$)/.test(type)) return "STOCK_MOVEMENT"
  if (/(^|_)(quotes?|devis|estimations?)(_|$)/.test(type)) return "QUOTE"
  if (/(^|_)(invoices?|factures?)(_|$)/.test(type)) return "INVOICE"
  if (/(^|_)(payments?|reglements?|encaissements?)(_|$)/.test(type)) return "PAYMENT"
  if (/(^|_)(interventions?|field_interventions?|visites?_techniques?|rendez_vous_techniques?)(_|$)/.test(type)) return "INTERVENTION"
  if (/(^|_)(tickets?|service_cases?|dossiers?_sav|sav)(_|$)/.test(type) && !/(intervention|visite)/.test(type)) return "TICKET"
  if (/(^|_)(equipments?|equipements?|materiels?|installed_products?|articles?_installes?)(_|$)/.test(type)) return "EQUIPMENT"
  if (/(^|_)(sites?|customer_sites?|adresses?_chantier|lieux?_installation)(_|$)/.test(type)) return "SITE"
  if (/(^|_)(suppliers?|fournisseurs?)(_|$)/.test(type)) return "SUPPLIER"
  if (/(^|_)(products?|produits?|articles?|catalogues?)(_|$)/.test(type) && !/(installed|installe|stock|movement|mouvement)/.test(type)) return "PRODUCT"
  if (/(^|_)(warehouses?|depots?|stock_locations?|emplacements?_stock)(_|$)/.test(type)) return "WAREHOUSE"
  if (/(^|_)(projects?|projets?|chantiers?)(_|$)/.test(type)) return "PROJECT"
  if (/(^|_)(notes?|calls?|emails?|meetings?|tasks?|communications?|appointments?|activities?|activites?)(_|$)/.test(type)) return "ACTIVITY"
  if (/^(companies|company|societes|societe|entreprises|entreprise|accounts|account)$/.test(type)) return "CLIENT"
  if (/(^|_)(clients?|customers?)(_|$)/.test(type) && !/(contact|activity|activite)/.test(type)) return "CLIENT"
  if (/(^|_)(contacts?|persons?|personnes?)(_|$)/.test(type)) return "CONTACT"
  if (/(^|_)(leads?|deals?|opportunit|affaires?)(_|$)/.test(type)) return "OPPORTUNITY"
  return "UNSUPPORTED"
}

export function clientCandidate(payload: SourcePayload) {
  const firstName = sourceValue(payload, ["firstname", "first_name", "prenom"])
  const lastName = sourceValue(payload, ["lastname", "last_name", "nom_de_famille"])
  const companyName = sourceValue(payload, ["name", "company_name", "nom_entreprise", "raison_sociale", "denomination", "nom", "societe"])
  const name = companyName || [firstName, lastName].filter(Boolean).join(" ") || sourceValue(payload, ["email", "phone", "telephone"])
  const street = sourceValue(payload, ["address", "adresse", "address1", "adresse_1", "street"])
  const address2 = sourceValue(payload, ["address2", "adresse_2"])
  const postalCode = sourceValue(payload, ["zip", "zip_code", "postal_code", "code_postal"])
  const city = sourceValue(payload, ["city", "ville"])
  const country = sourceValue(payload, ["country", "pays"])

  return {
    name: name || "Client sans nom",
    type: companyName ? "ENTERPRISE" : "INDIVIDUAL",
    siret: sourceValue(payload, ["siret", "numero_siret", "company_registration_number"]) || null,
    tvaNumber: sourceValue(payload, ["tva_number", "numero_tva", "vat_number"]) || null,
    address: [street, address2, [postalCode, city].filter(Boolean).join(" "), country].filter(Boolean).join(", ") || null,
    website: sourceValue(payload, ["website", "site_web", "domain", "domaine", "web_site"]) || null,
    lifecycleStage: sourceValue(payload, ["lifecyclestage", "lifecycle_stage", "statut_client", "status"]) || null,
    customFields: payload,
  }
}

export function contactCandidate(payload: SourcePayload) {
  const firstName = sourceValue(payload, ["firstname", "first_name", "prenom"])
  const lastName = sourceValue(payload, ["lastname", "last_name", "nom_de_famille"])
  const fullName = sourceValue(payload, ["full_name", "fullname", "nom_complet", "contact_name"])
  const parts = fullName.split(/\s+/).filter(Boolean)
  return {
    firstName: firstName || (parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]) || "Contact",
    lastName: lastName || (parts.length > 1 ? parts.at(-1) : "") || "inconnu",
    email: sourceValue(payload, ["email", "e_mail", "adresse_email", "mail"]) || null,
    phone: sourceValue(payload, ["phone", "telephone", "mobilephone", "mobile_phone", "portable"]) || null,
    role: sourceValue(payload, ["jobtitle", "job_title", "fonction", "role", "poste"]) || null,
    lifecycleStage: sourceValue(payload, ["lifecyclestage", "lifecycle_stage", "statut", "status"]) || null,
    marketingStatus: sourceValue(payload, ["hs_email_optout", "email_opt_out", "consentement", "marketing_status"]) || null,
    customFields: payload,
  }
}

export function numericValue(value: string) {
  if (!value) return 0
  let normalized = value.replace(/[^0-9,.-]/g, "")
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "")
  } else normalized = normalized.replace(",", ".")
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

function integerValue(payload: SourcePayload, aliases: string[], fallback = 0) {
  const parsed = Math.round(numericValue(sourceValue(payload, aliases)))
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanValue(payload: SourcePayload, aliases: string[], fallback = false) {
  const value = keyName(sourceValue(payload, aliases))
  if (!value) return fallback
  if (["1", "true", "oui", "yes", "actif", "active"].includes(value)) return true
  if (["0", "false", "non", "no", "inactif", "inactive"].includes(value)) return false
  return fallback
}

export function siteCandidate(payload: SourcePayload) {
  return {
    label: sourceValue(payload, ["label", "name", "nom", "site_name", "nom_site", "adresse_nom"]) || "Site client",
    kind: sourceValue(payload, ["kind", "type", "type_site"]) || "INSTALLATION",
    address1: sourceValue(payload, ["address", "adresse", "address1", "adresse_1", "street", "rue"]) || "Adresse à compléter",
    address2: sourceValue(payload, ["address2", "adresse_2", "complement_adresse"]) || null,
    postalCode: sourceValue(payload, ["zip", "zip_code", "postal_code", "code_postal"]) || null,
    city: sourceValue(payload, ["city", "ville"]) || null,
    country: sourceValue(payload, ["country", "pays"]) || "France",
    accessNotes: sourceValue(payload, ["access_notes", "notes_acces", "instructions", "observations"]) || null,
    latitude: numericValue(sourceValue(payload, ["latitude", "lat"])) || null,
    longitude: numericValue(sourceValue(payload, ["longitude", "lng", "lon"])) || null,
    customFields: payload,
  }
}

export function supplierCandidate(payload: SourcePayload) {
  return {
    name: sourceValue(payload, ["name", "nom", "raison_sociale", "supplier_name", "nom_fournisseur"]) || "Fournisseur sans nom",
    code: sourceValue(payload, ["code", "supplier_code", "code_fournisseur", "reference"]) || null,
    contactName: sourceValue(payload, ["contact", "contact_name", "nom_contact"]) || null,
    email: sourceValue(payload, ["email", "mail", "adresse_email"]) || null,
    phone: sourceValue(payload, ["phone", "telephone", "tel", "mobile"]) || null,
    address: sourceValue(payload, ["address", "adresse", "full_address", "adresse_complete"]) || null,
    paymentTerms: sourceValue(payload, ["payment_terms", "conditions_reglement", "conditions_paiement"]) || null,
    deliveryDays: integerValue(payload, ["delivery_days", "delai_livraison", "delai_jours"]) || null,
    active: booleanValue(payload, ["active", "actif", "status", "statut"], true),
    customFields: payload,
  }
}

export function productCandidate(payload: SourcePayload, fallbackSku: string) {
  return {
    sku: sourceValue(payload, ["sku", "code", "reference", "ref", "article_code", "code_article"]) || fallbackSku,
    label: sourceValue(payload, ["label", "name", "nom", "designation", "libelle", "product_name"]) || "Article sans libellé",
    description: sourceValue(payload, ["description", "details", "notes"]) || null,
    kind: sourceValue(payload, ["kind", "type", "type_article"]) || "MATERIAL",
    manufacturer: sourceValue(payload, ["manufacturer", "fabricant", "marque", "brand"]) || null,
    family: sourceValue(payload, ["family", "famille", "category", "categorie"]) || null,
    unit: sourceValue(payload, ["unit", "unite"]) || "unité",
    purchasePriceCents: Math.round(numericValue(sourceValue(payload, ["purchase_price", "prix_achat", "pa_ht", "cout"])) * 100),
    salePriceCents: Math.round(numericValue(sourceValue(payload, ["sale_price", "prix_vente", "pv_ht", "price", "prix"])) * 100),
    tvaRate: numericValue(sourceValue(payload, ["tva_rate", "taux_tva", "vat_rate", "tva"])) || 20,
    stockTracked: booleanValue(payload, ["stock_tracked", "gestion_stock", "suivi_stock"], true),
    active: booleanValue(payload, ["active", "actif", "status", "statut"], true),
    customFields: payload,
  }
}

export function warehouseCandidate(payload: SourcePayload, fallbackCode: string) {
  return {
    name: sourceValue(payload, ["name", "nom", "label", "libelle", "warehouse_name", "nom_depot"]) || "Dépôt",
    code: sourceValue(payload, ["code", "warehouse_code", "code_depot", "reference"]) || fallbackCode,
    address: sourceValue(payload, ["address", "adresse", "full_address", "adresse_complete"]) || null,
    active: booleanValue(payload, ["active", "actif", "status", "statut"], true),
  }
}

export function projectCandidate(payload: SourcePayload) {
  const rawStatus = keyName(sourceValue(payload, ["status", "statut", "etat"]))
  const status = /(complete|termine|clos|fini|livre)/.test(rawStatus) ? "COMPLETED"
    : /(archive|annule|abandon)/.test(rawStatus) ? "ARCHIVED"
      : "ACTIVE"
  return {
    name: sourceValue(payload, ["name", "nom", "title", "titre", "project_name", "chantier"]) || "Chantier sans nom",
    description: sourceValue(payload, ["description", "notes", "commentaire", "objet"]) || null,
    status,
    worksiteType: sourceValue(payload, ["worksite_type", "type_chantier", "type_projet"]) || null,
    worksiteStage: sourceValue(payload, ["worksite_stage", "phase_chantier", "etape", "phase"]) || null,
    budgetCents: Math.round(numericValue(sourceValue(payload, ["budget", "montant", "total_ht", "amount"])) * 100),
    consumedCents: Math.round(numericValue(sourceValue(payload, ["consumed", "consomme", "cout_reel", "actual_cost"])) * 100),
    startDate: dateValue(payload, ["start_date", "date_debut", "started_at"]),
    endDate: dateValue(payload, ["end_date", "date_fin", "completed_at"]),
  }
}

export function equipmentCandidate(payload: SourcePayload) {
  return {
    label: sourceValue(payload, ["label", "name", "nom", "designation", "equipment_name"]) || "Équipement sans libellé",
    category: sourceValue(payload, ["category", "categorie", "family", "famille", "type"]) || null,
    manufacturer: sourceValue(payload, ["manufacturer", "fabricant", "marque", "brand"]) || null,
    model: sourceValue(payload, ["model", "modele", "variant", "variante"]) || null,
    serialNumber: sourceValue(payload, ["serial_number", "numero_serie", "no_serie", "serial"]) || null,
    installedAt: dateValue(payload, ["installed_at", "date_installation", "date_pose", "installation_date"]),
    warrantyUntil: dateValue(payload, ["warranty_until", "fin_garantie", "garantie_jusqu_au", "warranty_end"]),
    status: sourceValue(payload, ["status", "statut", "etat"]) || "ACTIVE",
    notes: sourceValue(payload, ["notes", "description", "observations"]) || null,
    customFields: payload,
  }
}

export function ticketCandidate(payload: SourcePayload, fallbackNumber: string) {
  const rawPriority = keyName(sourceValue(payload, ["priority", "priorite", "urgence"]))
  const priority = /(critical|critique|urgent|urgence)/.test(rawPriority) ? "URGENT"
    : /(high|haute|elevee)/.test(rawPriority) ? "HIGH"
      : /(low|basse|faible)/.test(rawPriority) ? "LOW"
        : "NORMAL"
  return {
    number: sourceValue(payload, ["number", "numero", "ticket_number", "reference", "ref_sav"]) || fallbackNumber,
    title: sourceValue(payload, ["title", "titre", "subject", "objet", "name", "nom"]) || "Demande SAV",
    description: sourceValue(payload, ["description", "body", "contenu", "details", "notes"]) || "Description à compléter",
    type: sourceValue(payload, ["type", "ticket_type", "type_sav"]) || "SAV",
    priority,
    status: sourceValue(payload, ["status", "statut", "etat"]) || "OPEN",
    source: sourceValue(payload, ["source", "origine", "channel", "canal"]) || "MIGRATION",
    requestedAt: dateValue(payload, ["requested_at", "date_demande", "createdate", "created_at", "date_creation"]) || new Date(),
    dueAt: dateValue(payload, ["due_at", "due_date", "echeance", "date_echeance"]),
    closedAt: dateValue(payload, ["closed_at", "closedate", "date_cloture"]),
    resolution: sourceValue(payload, ["resolution", "solution", "resultat"]) || null,
    customFields: payload,
  }
}

export function interventionCandidate(payload: SourcePayload) {
  const scheduledStart = dateValue(payload, ["scheduled_start", "start", "date_debut", "date_intervention", "appointment_date"]) || new Date()
  return {
    title: sourceValue(payload, ["title", "titre", "subject", "objet", "name", "nom"]) || "Intervention",
    type: sourceValue(payload, ["type", "intervention_type", "type_intervention"]) || "SAV",
    status: sourceValue(payload, ["status", "statut", "etat"]) || "PLANNED",
    scheduledStart,
    scheduledEnd: dateValue(payload, ["scheduled_end", "end", "date_fin", "end_date"]),
    startedAt: dateValue(payload, ["started_at", "debut_reel"]),
    completedAt: dateValue(payload, ["completed_at", "date_realisation", "termine_le"]),
    report: sourceValue(payload, ["report", "rapport", "compte_rendu", "description", "notes"]) || null,
    laborMinutes: integerValue(payload, ["labor_minutes", "duree_minutes", "duration_minutes", "duree"]),
    customerName: sourceValue(payload, ["customer_name", "nom_client", "signataire"]) || null,
    signedAt: dateValue(payload, ["signed_at", "date_signature"]),
    customFields: payload,
  }
}

export function maintenanceContractCandidate(payload: SourcePayload, fallbackNumber: string) {
  return {
    number: sourceValue(payload, ["number", "numero", "contract_number", "reference"]) || fallbackNumber,
    label: sourceValue(payload, ["label", "name", "nom", "title", "objet"]) || "Contrat d’entretien",
    status: sourceValue(payload, ["status", "statut", "etat"]) || "ACTIVE",
    startDate: dateValue(payload, ["start_date", "date_debut", "created_at"]) || new Date(),
    endDate: dateValue(payload, ["end_date", "date_fin", "echeance"]),
    frequency: sourceValue(payload, ["frequency", "frequence", "periodicite"]) || "ANNUAL",
    nextVisitAt: dateValue(payload, ["next_visit_at", "prochaine_visite", "date_prochaine_intervention"]),
    priceCents: Math.round(numericValue(sourceValue(payload, ["price", "prix", "amount", "montant"])) * 100),
    notes: sourceValue(payload, ["notes", "description", "observations"]) || null,
  }
}

export function purchaseOrderCandidate(payload: SourcePayload, fallbackNumber: string) {
  return {
    number: sourceValue(payload, ["number", "numero", "order_number", "reference", "ref_commande"]) || fallbackNumber,
    status: sourceValue(payload, ["status", "statut", "etat"]) || "DRAFT",
    orderDate: dateValue(payload, ["order_date", "date_commande", "date"]) || new Date(),
    expectedAt: dateValue(payload, ["expected_at", "date_livraison_prevue", "delivery_date"]),
    receivedAt: dateValue(payload, ["received_at", "date_reception", "delivered_at"]),
    notes: sourceValue(payload, ["notes", "description", "commentaire"]) || null,
    totalHtCents: Math.round(numericValue(sourceValue(payload, ["total_ht", "amount", "montant", "total"])) * 100),
  }
}

export function customerOrderCandidate(payload: SourcePayload, fallbackNumber: string) {
  const totalHtCents = Math.round(numericValue(sourceValue(payload, ["total_ht", "subtotal", "hs_subtotal", "amount", "montant_ht"])) * 100)
  const totalTvaCents = Math.round(numericValue(sourceValue(payload, ["total_tva", "tax", "taxes", "montant_tva"])) * 100)
  const explicitTtc = Math.round(numericValue(sourceValue(payload, ["total_ttc", "total", "hs_total", "montant_ttc"])) * 100)
  return {
    number: sourceValue(payload, ["number", "numero", "order_number", "hs_order_name", "reference"]) || fallbackNumber,
    status: sourceValue(payload, ["status", "statut", "hs_status", "etat"]) || "CONFIRMED",
    orderDate: dateValue(payload, ["order_date", "date_commande", "date", "hs_createdate"]) || new Date(),
    acceptedAt: dateValue(payload, ["accepted_at", "date_acceptation", "date_signature"]),
    expectedInstallationAt: dateValue(payload, ["expected_installation_at", "date_pose_prevue", "date_installation_prevue"]),
    notes: sourceValue(payload, ["notes", "description", "commentaire", "hs_description"]) || null,
    totalHtCents,
    totalTvaCents,
    totalTtcCents: explicitTtc || totalHtCents + totalTvaCents,
    depositCents: Math.round(numericValue(sourceValue(payload, ["deposit", "acompte", "deposit_amount", "montant_acompte"])) * 100),
    customFields: payload,
  }
}

export function deliveryNoteCandidate(payload: SourcePayload, fallbackNumber: string) {
  return {
    number: sourceValue(payload, ["number", "numero", "delivery_number", "numero_bl", "reference"]) || fallbackNumber,
    status: sourceValue(payload, ["status", "statut", "etat"]) || "DELIVERED",
    deliveredAt: dateValue(payload, ["delivered_at", "delivery_date", "date_livraison", "date"]),
    recipientName: sourceValue(payload, ["recipient_name", "receptionnaire", "nom_receptionnaire", "signataire"]) || null,
    signedAt: dateValue(payload, ["signed_at", "date_signature"]),
    signatureSha256: sourceValue(payload, ["signature_sha256", "hash_signature", "empreinte_signature"]) || null,
    notes: sourceValue(payload, ["notes", "description", "commentaire"]) || null,
    quantity: Math.max(1, integerValue(payload, ["quantity", "quantite", "qty"], 1)),
  }
}

export function goodsReceiptCandidate(payload: SourcePayload, fallbackNumber: string) {
  return {
    number: sourceValue(payload, ["number", "numero", "receipt_number", "numero_reception", "reference"]) || fallbackNumber,
    receivedAt: dateValue(payload, ["received_at", "receipt_date", "date_reception", "date"]) || new Date(),
    supplierReference: sourceValue(payload, ["supplier_reference", "reference_fournisseur", "numero_bl_fournisseur"]) || null,
    notes: sourceValue(payload, ["notes", "description", "commentaire"]) || null,
    quantity: Math.max(1, integerValue(payload, ["quantity", "quantite", "qty"], 1)),
    unitCostCents: Math.round(numericValue(sourceValue(payload, ["unit_cost", "cout_unitaire", "prix_achat"])) * 100) || null,
  }
}

export function stockReservationCandidate(payload: SourcePayload) {
  return {
    quantity: Math.max(1, integerValue(payload, ["quantity", "quantite", "qty"], 1)),
    status: sourceValue(payload, ["status", "statut", "etat"]) || "ACTIVE",
    notes: sourceValue(payload, ["notes", "description", "commentaire"]) || null,
    releasedAt: dateValue(payload, ["released_at", "date_liberation", "date_fin"]),
  }
}

export function stockMovementCandidate(payload: SourcePayload) {
  const rawType = keyName(sourceValue(payload, ["type", "movement_type", "type_mouvement", "sens"]))
  const type = /(out|sortie|consomm|debit)/.test(rawType) ? "OUT"
    : /(adjust|inventaire|correction)/.test(rawType) ? "ADJUST"
      : "IN"
  const rawQuantity = integerValue(payload, ["quantity", "quantite", "qty"], 1)
  return {
    type,
    quantity: type === "OUT" ? -Math.abs(rawQuantity) : rawQuantity,
    unitCostCents: Math.round(numericValue(sourceValue(payload, ["unit_cost", "cout_unitaire", "prix_achat"])) * 100) || null,
    reference: sourceValue(payload, ["reference", "ref", "document_number", "numero_piece"]) || null,
    notes: sourceValue(payload, ["notes", "description", "commentaire"]) || null,
    happenedAt: dateValue(payload, ["happened_at", "date", "movement_date", "date_mouvement"]) || new Date(),
  }
}

function documentStatus(value: string, kind: "QUOTE" | "INVOICE") {
  const status = keyName(value)
  if (/(cancel|annul|void)/.test(status)) return "CANCELLED"
  if (/(refus|reject|declin)/.test(status)) return kind === "QUOTE" ? "REJECTED" : "CANCELLED"
  if (/(paid|paye|regle|settled)/.test(status)) return kind === "INVOICE" ? "PAID" : "ACCEPTED"
  if (/(accept|signe|won|gagne)/.test(status)) return kind === "QUOTE" ? "ACCEPTED" : "SENT"
  if (/(sent|envoye|open|emis|issued)/.test(status)) return "SENT"
  if (/(overdue|retard|impaye)/.test(status)) return kind === "INVOICE" ? "OVERDUE" : "SENT"
  return "DRAFT"
}

export function quoteCandidate(payload: SourcePayload, fallbackNumber: string) {
  const totalHtCents = Math.round(numericValue(sourceValue(payload, ["total_ht", "subtotal", "hs_subtotal", "amount", "montant_ht"])) * 100)
  const totalTvaCents = Math.round(numericValue(sourceValue(payload, ["total_tva", "tax", "taxes", "montant_tva"])) * 100)
  const explicitTtc = Math.round(numericValue(sourceValue(payload, ["total_ttc", "total", "hs_total", "montant_ttc"])) * 100)
  return {
    number: sourceValue(payload, ["number", "numero", "quote_number", "hs_quote_number", "reference"]) || fallbackNumber,
    object: sourceValue(payload, ["object", "objet", "title", "name", "hs_title"]) || "Devis importé",
    status: documentStatus(sourceValue(payload, ["status", "statut", "hs_status", "hs_quote_status"]), "QUOTE"),
    date: dateValue(payload, ["date", "quote_date", "hs_createdate", "created_at"]) || new Date(),
    validUntil: dateValue(payload, ["valid_until", "date_validite", "expiration_date", "hs_expiration_date"]),
    totalHtCents,
    totalTvaCents,
    totalTtcCents: explicitTtc || totalHtCents + totalTvaCents,
  }
}

export function invoiceCandidate(payload: SourcePayload, fallbackNumber: string) {
  const totalHtCents = Math.round(numericValue(sourceValue(payload, ["total_ht", "subtotal", "hs_subtotal", "amount", "montant_ht"])) * 100)
  const totalTvaCents = Math.round(numericValue(sourceValue(payload, ["total_tva", "tax", "taxes", "montant_tva"])) * 100)
  const explicitTtc = Math.round(numericValue(sourceValue(payload, ["total_ttc", "total", "hs_total", "montant_ttc"])) * 100)
  const date = dateValue(payload, ["date", "invoice_date", "hs_invoice_date", "created_at", "hs_createdate"]) || new Date()
  const status = documentStatus(sourceValue(payload, ["status", "statut", "hs_invoice_status", "etat"]), "INVOICE")
  return {
    number: sourceValue(payload, ["number", "numero", "invoice_number", "hs_invoice_number", "reference"]) || fallbackNumber,
    object: sourceValue(payload, ["object", "objet", "title", "name", "hs_title"]) || "Facture importée",
    status,
    type: sourceValue(payload, ["type", "invoice_type", "type_facture"]) || "STANDARD",
    date,
    dueDate: dateValue(payload, ["due_date", "date_echeance", "hs_due_date", "echeance"]) || date,
    totalHtCents,
    totalTvaCents,
    totalTtcCents: explicitTtc || totalHtCents + totalTvaCents,
    paidAmountCents: Math.round(numericValue(sourceValue(payload, ["paid_amount", "montant_paye", "amount_paid", "hs_amount_paid"])) * 100),
    lockedAt: status === "DRAFT" ? null : date,
  }
}

export function lineItemCandidate(objectType: string, payload: SourcePayload) {
  const normalizedType = keyName(objectType)
  const quantity = numericValue(sourceValue(payload, ["quantity", "qty", "quantite", "hs_quantity"])) || 1
  const explicitUnitPrice = numericValue(sourceValue(payload, ["unit_price", "price", "prix_unitaire", "hs_price", "amount", "montant"]))
  const total = numericValue(sourceValue(payload, ["line_total", "total", "montant_total", "hs_total_discount", "hs_amount"]))
  const isDiscount = /(discount|remise)/.test(normalizedType)
  const amount = explicitUnitPrice || (quantity ? total / quantity : total)
  const unitPriceCents = Math.round(Math.abs(amount) * 100) * (isDiscount ? -1 : 1)
  const fallbackLabel = isDiscount ? "Remise" : /(tax)/.test(normalizedType) ? "Taxe" : /(fee|frais)/.test(normalizedType) ? "Frais" : "Article importé"
  return {
    label: sourceValue(payload, ["name", "label", "libelle", "designation", "hs_name", "description"]) || fallbackLabel,
    description: sourceValue(payload, ["description", "details", "notes", "hs_description"]) || null,
    quantity,
    unitPriceCents,
    tvaRate: numericValue(sourceValue(payload, ["tva_rate", "taux_tva", "vat_rate", "tax_rate", "hs_tax_rate"])) || 0,
    order: Math.max(0, integerValue(payload, ["order", "position", "sort_order", "hs_position_on_quote"], 0)),
  }
}

export function paymentCandidate(payload: SourcePayload) {
  return {
    amountCents: Math.round(numericValue(sourceValue(payload, ["amount", "montant", "payment_amount", "montant_reglement", "hs_amount"])) * 100),
    date: dateValue(payload, ["date", "payment_date", "date_reglement", "hs_createdate"]) || new Date(),
    method: sourceValue(payload, ["method", "payment_method", "mode_reglement", "moyen_paiement"]) || "OTHER",
    reference: sourceValue(payload, ["reference", "transaction_id", "numero", "payment_reference"]) || null,
  }
}

export function opportunityCandidate(payload: SourcePayload) {
  const stage = sourceValue(payload, ["dealstage", "deal_stage", "hs_lead_label", "hs_lead_type", "stage", "statut", "status"])
  const normalizedStage = keyName(stage)
  let status = "QUALIFIED"
  if (/(won|gagne|signe|accepte)/.test(normalizedStage)) status = "WON"
  else if (/(lost|perdu|refuse|abandon)/.test(normalizedStage)) status = "LOST"
  else if (/(sent|envoye|devis)/.test(normalizedStage)) status = "SENT"
  else if (/(contact)/.test(normalizedStage)) status = "CONTACTED"
  else if (/(prospect|new|nouveau)/.test(normalizedStage)) status = "PROSPECT"
  const rawProbability = sourceValue(payload, ["hs_deal_stage_probability", "probability", "probabilite"])
  const parsedProbability = numericValue(rawProbability)
  const probability = Math.min(100, Math.max(0, Math.round(parsedProbability > 0 && parsedProbability <= 1 ? parsedProbability * 100 : parsedProbability)))
  return {
    title: sourceValue(payload, ["dealname", "deal_name", "hs_lead_name", "name", "nom", "objet", "title"]) || "Affaire sans titre",
    status,
    valueCents: Math.round(numericValue(sourceValue(payload, ["amount", "montant", "total", "value"])) * 100),
    probability: probability || (status === "WON" ? 100 : status === "LOST" ? 0 : 25),
    closeDate: dateValue(payload, ["closedate", "close_date", "date_cloture", "date_signature"]),
    lostReason: sourceValue(payload, ["closed_lost_reason", "hs_closed_lost_reason", "motif_perte", "lost_reason"]) || null,
    ownerLabel: sourceValue(payload, ["hubspot_owner_id", "owner", "commercial", "responsable"]) || null,
    customFields: payload,
  }
}

export function dateValue(payload: SourcePayload, aliases: string[]) {
  const value = sourceValue(payload, aliases)
  if (!value) return null
  const date = new Date(/^\d{10,13}$/.test(value) ? Number(value.length === 10 ? `${value}000` : value) : value)
  return Number.isNaN(date.valueOf()) ? null : date
}

export function activityCandidate(objectType: string, payload: SourcePayload) {
  const normalized = keyName(objectType)
  const type = normalized.includes("call") ? "CALL"
    : normalized.includes("email") ? "EMAIL"
      : normalized.includes("meeting") || normalized.includes("appointment") ? "MEETING"
        : normalized.includes("task") ? "TASK"
          : "NOTE"
  const subject = sourceValue(payload, ["hs_email_subject", "hs_call_title", "hs_meeting_title", "hs_task_subject", "subject", "objet", "title"])
  return {
    type,
    subject: subject || null,
    content: sourceValue(payload, ["hs_note_body", "hs_email_text", "hs_email_html", "hs_call_body", "hs_meeting_body", "hs_task_body", "body", "content", "contenu", "notes", "description"]) || subject || "Activité importée",
    direction: sourceValue(payload, ["hs_email_direction", "hs_call_direction", "direction"]) || null,
    durationSec: Math.max(0, Math.round(numericValue(sourceValue(payload, ["hs_call_duration", "duration", "duree"])) / (sourceValue(payload, ["hs_call_duration"]) ? 1_000 : 1))) || null,
    outcome: sourceValue(payload, ["hs_call_disposition", "hs_meeting_outcome", "outcome", "resultat"]) || null,
    happenedAt: dateValue(payload, ["hs_timestamp", "timestamp", "date", "activity_date", "date_activite"]) || new Date(0),
    customFields: payload,
  }
}

function splitIds(value: MigrationPayload): string[] {
  if (Array.isArray(value)) return value.flatMap(splitIds)
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => keyName(key) === "id" ? [scalar(child)] : splitIds(child))
  return scalar(value).split(/[;,|\s]+/).map((part) => part.trim()).filter(Boolean)
}

export function associationIds(
  payload: SourcePayload,
  target: "company" | "contact" | "deal" | "site" | "supplier" | "product" | "project" | "equipment" | "ticket" | "warehouse" | "quote" | "invoice" | "customerOrder" | "purchaseOrder",
) {
  const aliases: Record<typeof target, string[]> = {
    company: ["company", "companies", "societe", "entreprise"],
    contact: ["contact", "contacts", "personne"],
    deal: ["deal", "deals", "opportunite", "affaire"],
    site: ["site", "sites", "adresse_chantier", "lieu_installation"],
    supplier: ["supplier", "suppliers", "fournisseur", "fournisseurs"],
    product: ["product", "products", "produit", "produits", "article", "articles"],
    project: ["project", "projects", "projet", "projets", "chantier", "chantiers"],
    equipment: ["equipment", "equipments", "equipement", "equipements", "materiel"],
    ticket: ["ticket", "tickets", "sav", "service_case"],
    warehouse: ["warehouse", "warehouses", "depot", "depots", "stock_location"],
    quote: ["quote", "quotes", "devis", "estimation"],
    invoice: ["invoice", "invoices", "facture", "factures"],
    customerOrder: ["customer_order", "customer_orders", "sales_order", "sales_orders", "order", "orders", "commande_client"],
    purchaseOrder: ["purchase_order", "purchase_orders", "supplier_order", "supplier_orders", "commande_fournisseur"],
  }
  const results = new Set<string>()
  function visit(value: MigrationPayload, parentPath = "") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value)) {
      const normalized = keyName(parentPath ? `${parentPath}_${key}` : key)
      const matchesTarget = aliases[target].some((alias) => normalized.includes(alias))
      const isAssociation = normalized.includes("association") || normalized.includes("associated") || normalized.includes("associe")
      const containsId = normalized.includes("id") || (child && typeof child === "object")
      if (matchesTarget && containsId && (isAssociation || normalized.endsWith("_id") || normalized.endsWith("_ids"))) {
        for (const id of splitIds(child)) if (id) results.add(id)
      }
      visit(child, normalized)
    }
  }
  visit(payload)
  return [...results]
}

export function sourceDisplayName(payload: SourcePayload) {
  return sourceValue(payload, ["name", "nom", "dealname", "title", "subject", "email"]) || joinedName(payload) || "Enregistrement sans nom"
}
