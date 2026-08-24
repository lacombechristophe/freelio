import { getServices, getServiceCategories } from "@/actions/catalogue"
import { CatalogueView } from "./catalogue-view"
import { getProductCatalogue } from "@/actions/products"

export default async function CataloguePage() {
  const [services, categories, productData] = await Promise.all([
    getServices(),
    getServiceCategories(),
    getProductCatalogue(),
  ])
  return (
    <div className="space-y-6">
      <CatalogueView services={services ?? []} categories={categories ?? []} productData={productData} />
    </div>
  )
}
