import { notFound } from "next/navigation"

import { getProductDetail } from "@/actions/products"
import { ProductConfigurationView } from "./product-configuration-view"

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getProductDetail(id)
  if (!detail) notFound()
  return <ProductConfigurationView detail={detail} />
}
