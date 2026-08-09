import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "node_modules", "coverage"]);

export const SECRET_RULES = Object.freeze([
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: "roam-token", pattern: /\broam-(?:graph|local)-token-[A-Za-z0-9_-]{16,}\b/g },
  { id: "openai-key", pattern: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
]);

async function collectFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await collectFiles(resolve(directory, entry.name), files);
    } else if (entry.isFile() && entry.name !== ".DS_Store") {
      files.push(resolve(directory, entry.name));
    }
  }
  return files;
}

function allowanceReason(lines, lineIndex, ruleId) {
  const prefix = `secret-scan: allow ${ruleId} --`;
  for (const candidate of [lines[lineIndex], lines[lineIndex - 1]]) {
    const position = candidate?.indexOf(prefix) ?? -1;
    if (position < 0) continue;
    const reason = candidate.slice(position + prefix.length).trim();
    if (reason.length >= 8) return reason;
  }
  return null;
}

export async function scanSecrets(rootDirectory = defaultRoot) {
  const findings = [];
  const allowances = [];
  for (const filename of await collectFiles(resolve(rootDirectory))) {
    const content = await readFile(filename);
    if (content.includes(0)) continue;
    const lines = content.toString("utf8").split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      for (const rule of SECRET_RULES) {
        rule.pattern.lastIndex = 0;
        const matches = [...lines[lineIndex].matchAll(rule.pattern)];
        if (!matches.length) continue;
        const path = relative(rootDirectory, filename) || filename;
        const reason = allowanceReason(lines, lineIndex, rule.id);
        if (reason) allowances.push({ rule: rule.id, path, line: lineIndex + 1, reason });
        else findings.push({ rule: rule.id, path, line: lineIndex + 1 });
      }
    }
  }
  return { findings, allowances };
}

async function main() {
  const rootFlag = process.argv.indexOf("--root");
  const rootDirectory = rootFlag >= 0 ? resolve(process.argv[rootFlag + 1] || "") : defaultRoot;
  const { findings, allowances } = await scanSecrets(rootDirectory);
  for (const allowance of allowances) {
    process.stdout.write(`Allowed ${allowance.rule} at ${allowance.path}:${allowance.line} — ${allowance.reason}\n`);
  }
  if (findings.length) {
    for (const finding of findings) {
      process.stderr.write(`Potential ${finding.rule} at ${finding.path}:${finding.line}\n`);
    }
    process.stderr.write("Secret scan failed. Remove the secret or document a synthetic false positive with an inline allow marker.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Secret scan passed${allowances.length ? ` with ${allowances.length} documented allowance(s)` : ""}.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();


