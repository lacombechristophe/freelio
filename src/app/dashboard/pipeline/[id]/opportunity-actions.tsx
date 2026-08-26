"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, Save } from "lucide-react";
import { toast } from "sonner";

import { addOpportunityActivity, updateOpportunity } from "@/actions/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  opportunityId: string;
  status: string;
  probability: number;
  ownerMembershipId: string | null;
  closeDate: string | null;
  lostReason: string | null;
  stages: Array<{ id: string; title: string }>;
  members: Array<{ id: string; name: string }>;
};

export function OpportunityActions(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    operation: () => Promise<unknown>,
    success: string,
    form?: HTMLFormElement,
  ) {
    startTransition(async () => {
      try {
        await operation();
        form?.reset();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Mise à jour impossible.",
        );
      }
    });
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        updateOpportunity(props.opportunityId, {
          status: String(form.get("status")),
          probability: Number(form.get("probability")),
          ownerMembershipId: String(form.get("ownerMembershipId") || ""),
          closeDate: String(form.get("closeDate") || ""),
          lostReason: String(form.get("lostReason") || ""),
        }),
      "Prévision commerciale mise à jour.",
    );
  }

  function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    run(
      () =>
        addOpportunityActivity(props.opportunityId, {
          type: String(form.get("type")),
          content: String(form.get("content")),
        }),
      "Activité ajoutée à la chronologie.",
      formElement,
    );
  }

  const selectClass =
    "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20";

  return (
    <div className="space-y-6">
      <form
        onSubmit={update}
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <div>
          <h2 className="text-sm font-semibold">Pilotage de l’opportunité</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Étape, confiance, responsable et date d’atterrissage.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="opportunityStatus">Étape</Label>
            <select
              id="opportunityStatus"
              name="status"
              defaultValue={props.status}
              className={selectClass}
            >
              {props.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.title}
                </option>
              ))}
              <option value="LOST">Perdue</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opportunityOwner">Responsable</Label>
            <select
              id="opportunityOwner"
              name="ownerMembershipId"
              defaultValue={props.ownerMembershipId ?? ""}
              className={selectClass}
            >
              <option value="">Non attribuée</option>
              {props.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opportunityProbability">Probabilité (%)</Label>
            <Input
              id="opportunityProbability"
              name="probability"
              type="number"
              min="0"
              max="100"
              defaultValue={props.probability}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opportunityCloseDate">Clôture prévue</Label>
            <Input
              id="opportunityCloseDate"
              name="closeDate"
              type="date"
              defaultValue={props.closeDate ?? ""}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opportunityLostReason">
            Motif de perte, si applicable
          </Label>
          <Input
            id="opportunityLostReason"
            name="lostReason"
            defaultValue={props.lostReason ?? ""}
            placeholder="Budget, délai, concurrence…"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}Enregistrer
        </Button>
      </form>

      <form
        onSubmit={addActivity}
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <div>
          <h2 className="text-sm font-semibold">Consigner une activité</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            La note alimente aussi l’historique du client.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opportunityActivityType">Type</Label>
          <select
            id="opportunityActivityType"
            name="type"
            defaultValue="NOTE"
            className={selectClass}
          >
            <option value="NOTE">Note</option>
            <option value="CALL">Appel</option>
            <option value="EMAIL">E-mail</option>
            <option value="MEETING">Rendez-vous</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="opportunityActivityContent">Compte rendu</Label>
          <textarea
            id="opportunityActivityContent"
            name="content"
            required
            minLength={2}
            maxLength={5000}
            className="min-h-28 w-full rounded-[10px] border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"
            placeholder="Décision, objections, prochaines étapes…"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <MessageSquarePlus />
          )}
          Ajouter à l’historique
        </Button>
      </form>
    </div>
  );
}
