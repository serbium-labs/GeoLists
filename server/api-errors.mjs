export class ClientInputError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ClientInputError'
    this.status = status
  }
}

export function publicErrorResponse(error) {
  if (error instanceof ClientInputError) {
    return { status: error.status, body: { error: error.message }, internal: false }
  }

  return { status: 500, body: { error: 'Server error' }, internal: true }
}
