import { HttpStatus } from './server-config.mjs'

export class ClientInputError extends Error {
  constructor(message, status = HttpStatus.BAD_REQUEST) {
    super(message)
    this.name = 'ClientInputError'
    this.status = status
  }
}

export function publicErrorResponse(error) {
  if (error instanceof ClientInputError) {
    return { status: error.status, body: { error: error.message }, internal: false }
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { error: 'Server error' }, internal: true }
}
