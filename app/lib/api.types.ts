export type MeResponse = {
  user: {
    id: string
    email: string
    name?: string
  }
  organizations: Array<{
    id: string
    name: string
    role: string
  }>
  active_org_id: string
}

export type SignupCompletedWithoutSessionResponse = {
  email: string
  signup_completed_without_session: true
}
