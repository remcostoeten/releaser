import { beforeEach } from 'vitest'

process.env.RELEASER_TEST = '1'

beforeEach(() => {
  delete process.env.GITHUB_TOKEN
  delete process.env.GH_TOKEN
  delete process.env.NPM_TOKEN
  delete process.env.NODE_AUTH_TOKEN
})
