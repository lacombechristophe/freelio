export type FieldAssignment = {
  id: string
  title: string
  type: string
  status: string
  scheduledStart: string
  scheduledEnd: string | null
  report: string | null
  laborMinutes: number
  customerName: string | null
  site: { label: string; address1: string; address2: string | null; postalCode: string | null; city: string | null; clientName: string }
  ticketNumber: string | null
  technician: string | null
  files: Array<{ id: string; name: string; mimeType: string | null; size: number; kind: string }>
}

export type FieldSnapshot = {
  companyId: string
  companyName: string
  cachedAt: string
  expiresAt: string
  assignments: FieldAssignment[]
}

export type OfflinePhoto = { id: string; name: string; type: string; blob: Blob }

export type FieldDraft = {
  interventionId: string
  report: string
  laborMinutes: number
  customerName: string
  customerApproval: boolean
  photos: OfflinePhoto[]
  pendingCompletion: boolean
  updatedAt: string
}

const DB_NAME = "crm-field-offline-v1"
const DB_VERSION = 1
const STATE_STORE = "state"
const DRAFT_STORE = "drafts"

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("Stockage hors ligne indisponible"))
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE)
      if (!database.objectStoreNames.contains(DRAFT_STORE)) database.createObjectStore(DRAFT_STORE, { keyPath: "interventionId" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Ouverture du stockage hors ligne impossible"))
  })
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeName, mode)
    const request = operation(tx.objectStore(storeName))
    let result!: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error || new Error("Écriture hors ligne impossible"))
    tx.oncomplete = () => {
      database.close()
      resolve(result)
    }
    tx.onerror = () => {
      database.close()
      reject(tx.error || new Error("Transaction hors ligne impossible"))
    }
    tx.onabort = () => {
      database.close()
      reject(tx.error || new Error("Transaction hors ligne interrompue"))
    }
  })
}

export function saveFieldSnapshot(snapshot: FieldSnapshot) {
  return transaction(STATE_STORE, "readwrite", (store) => store.put(snapshot, "snapshot"))
}

export function getFieldSnapshot() {
  return transaction<FieldSnapshot | undefined>(STATE_STORE, "readonly", (store) => store.get("snapshot"))
}

export function saveFieldDraft(draft: FieldDraft) {
  return transaction(DRAFT_STORE, "readwrite", (store) => store.put(draft))
}

export function getFieldDraft(interventionId: string) {
  return transaction<FieldDraft | undefined>(DRAFT_STORE, "readonly", (store) => store.get(interventionId))
}

export function listFieldDrafts() {
  return transaction<FieldDraft[]>(DRAFT_STORE, "readonly", (store) => store.getAll())
}

export function deleteFieldDraft(interventionId: string) {
  return transaction(DRAFT_STORE, "readwrite", (store) => store.delete(interventionId))
}

export async function cacheFieldResources() {
  if (!("serviceWorker" in navigator)) throw new Error("Mode installable indisponible sur ce navigateur")
  const existingRegistration = await navigator.serviceWorker.getRegistration("/")
  if (!existingRegistration) await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  const registration = await navigator.serviceWorker.ready
  const worker = navigator.serviceWorker.controller || registration.active
  if (!worker) throw new Error("Le service hors ligne n’est pas encore prêt. Rechargez cette page.")
  const urls = [
    `${window.location.origin}/terrain-offline`,
    ...performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(window.location.origin) && (url.includes("/_next/static/") || url.includes("/fonts/"))),
  ]
  const channel = new MessageChannel()
  const result = new Promise<{ ok: boolean; cached: number }>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Le cache hors ligne n’a pas répondu")), 15_000)
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout)
      resolve(event.data)
    }
  })
  worker.postMessage({ type: "CACHE_FIELD_RESOURCES", urls: [...new Set(urls)] }, [channel.port2])
  const response = await result
  if (!response.ok) throw new Error("La copie locale de l’écran terrain a échoué")
  return response
}

export async function clearFieldOfflineData() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined)
    ;(navigator.serviceWorker.controller || registration?.active)?.postMessage({ type: "CLEAR_FIELD_CACHE" })
  }
  if ("caches" in window) await caches.delete("crm-field-v1-field")
  if ("indexedDB" in window) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  }
}
