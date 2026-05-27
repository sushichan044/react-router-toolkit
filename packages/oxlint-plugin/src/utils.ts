import pkg from "../package.json" with { type: "json" };

export function getRuleDocsURL(ruleName: string): string {
  const repoURL = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

  return `${repoURL}/blob/main/packages/oxlint-plugin/docs/rules/${ruleName}.md`;
}
