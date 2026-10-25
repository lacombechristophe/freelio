export function contactMailScope(companyId: string) {
  return { companyId, OR: [{ channelId: null }, { channel: { companyId } }] }
}

export function contactEngagementSelection(companyId: string) {
  return {
    emailDeliveries: { where: contactMailScope(companyId) },
    sequenceEnrollments: { where: { sequence: { companyId }, leadCapture: { companyId } } },
  }
}
