"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Navigation, Play, Route, Save, Send } from "lucide-react";
import { toast } from "sonner";

import {
  approvePurchaseOrder,
  sendPurchaseOrder,
  submitPurchaseOrder,
  routeServiceTicket,
  updateInterventionStatus,
  updateServiceTicket,
} from "@/actions/operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function useMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function mutate(operation: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await operation();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Mise à jour impossible.",
        );
      }
    });
  }
  return { pending, mutate };
}

export function TicketRecordActions({
  ticket,
}: {
  ticket: {
    id: string;
    status: string;
    priority: string;
    assignedMembershipId: string | null;
    dueAt: Date | null;
    resolution: string | null;
    requiredSkill: string | null;
    territory: string | null;
    routingReason: string | null;
    members: Array<{ id: string; name: string }>;
  };
}) {
  const { pending, mutate } = useMutation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") || "");
    mutate(
      () =>
        updateServiceTicket(ticket.id, {
          status: String(form.get("status")),
          priority: String(form.get("priority")),
          assignedMembershipId: String(form.get("assignedMembershipId") || ""),
          dueAt: dueAt ? new Date(dueAt).toISOString() : "",
          resolution: String(form.get("resolution") || ""),
          requiredSkill: String(form.get("requiredSkill") || ""),
          territory: String(form.get("territory") || ""),
        }),
      "Ticket SAV mis à jour.",
    );
  }
  const selectClass =
    "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20";
  const dueAt = ticket.dueAt
    ? new Date(
        ticket.dueAt.getTime() - ticket.dueAt.getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
  const formKey = JSON.stringify([ticket.status, ticket.priority, ticket.assignedMembershipId, dueAt, ticket.resolution, ticket.requiredSkill, ticket.territory, ticket.routingReason]);
  return (
    <form key={formKey} onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold">Traitement du ticket</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Affectation, priorité, échéance et résolution dans un seul contrôle.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ticketStatus">Statut</Label>
          <select
            id="ticketStatus"
            name="status"
            defaultValue={ticket.status}
            className={selectClass}
          >
            <option value="OPEN">Ouvert</option>
            <option value="QUALIFIED">Qualifié</option>
            <option value="PLANNED">Planifié</option>
            <option value="WAITING">En attente</option>
            <option value="RESOLVED">Résolu</option>
            <option value="CLOSED">Clos</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticketPriority">Priorité</Label>
          <select
            id="ticketPriority"
            name="priority"
            defaultValue={ticket.priority}
            className={selectClass}
          >
            <option value="LOW">Faible</option>
            <option value="NORMAL">Normale</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticketAssignee">Responsable</Label>
          <select
            id="ticketAssignee"
            name="assignedMembershipId"
            defaultValue={ticket.assignedMembershipId ?? ""}
            className={selectClass}
          >
            <option value="">Non affecté</option>
            {ticket.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          {ticket.routingReason ? <p className="text-xs leading-5 text-muted-foreground">{ticket.routingReason}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticketDueAt">Échéance</Label>
          <Input
            id="ticketDueAt"
            name="dueAt"
            type="datetime-local"
            defaultValue={dueAt}
          />
        </div>
        <div className="space-y-1.5"><Label htmlFor="ticketRequiredSkill">Compétence requise</Label><Input id="ticketRequiredSkill" name="requiredSkill" maxLength={80} defaultValue={ticket.requiredSkill ?? ""} placeholder="SAV, pompe, couverture…" /></div>
        <div className="space-y-1.5"><Label htmlFor="ticketTerritory">Zone</Label><Input id="ticketTerritory" name="territory" maxLength={80} defaultValue={ticket.territory ?? ""} placeholder="Ville ou secteur" /></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticketResolution">Résolution</Label>
        <textarea
          id="ticketResolution"
          name="resolution"
          defaultValue={ticket.resolution ?? ""}
          maxLength={5000}
          className="min-h-28 w-full rounded-[10px] border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"
          placeholder="Diagnostic, action réalisée, pièces remplacées, résultat du contrôle…"
        />
        <p className="text-xs text-muted-foreground">
          Obligatoire avant de passer le ticket en résolu ou clos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Enregistrer le traitement</Button><Button type="button" variant="outline" disabled={pending || ["RESOLVED", "CLOSED"].includes(ticket.status)} title={["RESOLVED", "CLOSED"].includes(ticket.status) ? "Rouvrez le ticket avant de le réaffecter" : "Choisir le membre le plus adapté selon compétence, zone et charge"} onClick={() => mutate(() => routeServiceTicket(ticket.id), "Affectation intelligente appliquée.")}>{pending ? <Loader2 className="animate-spin" /> : <Route />}Affecter selon les règles</Button></div>
    </form>
  );
}

export function InterventionRecordActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const { pending, mutate } = useMutation();
  if (["COMPLETED", "CANCELED"].includes(status)) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
      <p className="w-full text-xs font-semibold text-muted-foreground">
        Actions terrain
      </p>
      {status === "PLANNED" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            mutate(
              () => updateInterventionStatus(id, "EN_ROUTE"),
              "Intervention en route.",
            )
          }
        >
          <Navigation />
          Partir
        </Button>
      )}
      {["PLANNED", "EN_ROUTE"].includes(status) && (
        <Button
          disabled={pending}
          onClick={() =>
            mutate(
              () => updateInterventionStatus(id, "IN_PROGRESS"),
              "Intervention démarrée.",
            )
          }
        >
          <Play />
          Démarrer
        </Button>
      )}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          mutate(
            () => updateInterventionStatus(id, "CANCELED"),
            "Intervention annulée.",
          )
        }
      >
        Annuler
      </Button>
    </div>
  );
}

export function PurchaseOrderRecordActions({
  id,
  status,
  canApprove,
}: {
  id: string;
  status: string;
  canApprove: boolean;
}) {
  const { pending, mutate } = useMutation();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <Button
          disabled={pending}
          onClick={() =>
            mutate(
              () => submitPurchaseOrder(id),
              "Commande soumise pour approbation.",
            )
          }
        >
          <Send />
          Soumettre
        </Button>
      )}
      {status === "PENDING_APPROVAL" && canApprove && (
        <Button
          disabled={pending}
          onClick={() =>
            mutate(() => approvePurchaseOrder(id), "Commande approuvée.")
          }
        >
          <Check />
          Approuver
        </Button>
      )}
      {status === "APPROVED" && (
        <Button
          disabled={pending}
          onClick={() =>
            mutate(() => sendPurchaseOrder(id), "Commande marquée envoyée.")
          }
        >
          <Send />
          Marquer envoyée
        </Button>
      )}
    </div>
  );
}
