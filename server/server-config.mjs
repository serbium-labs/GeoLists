export function httpHost(env = process.env) {
  return env.HTTP_HOST || '127.0.0.1'
}
