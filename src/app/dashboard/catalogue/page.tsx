import { getServices, getServiceCategories } from "@/actions/catalogue"
import { CatalogueView } from "./catalogue-view"

export default async function CataloguePage() {
  const [services, categories] = await Promise.all([
    getServices(),
    getServiceCategories(),
  ])
  return (
    <div className="space-y-6">
      <CatalogueView services={(services ?? []) as any} categories={categories ?? []} />
    </div>
  )
}
