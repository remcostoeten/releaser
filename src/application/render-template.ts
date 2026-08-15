export type TemplateValues = {
  version: string
  previousVersion: string
  major: string
  minor: string
  patch: string
}

const PLACEHOLDER = /\{\{\s*(version|previousVersion|major|minor|patch)\s*\}\}/gu

export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replaceAll(PLACEHOLDER, (_match, key: keyof TemplateValues) => values[key])
}
