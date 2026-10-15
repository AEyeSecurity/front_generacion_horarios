import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const records = [];
const helpers = {
  parseApiErrorMessage: "return normalizeApiError(raw, fallback);",
  parseApiError: "return normalizeApiError(data, fallback);",
  safeApiText: "return normalizeApiError(raw, fallback);",
  buildApiErrorMessage: "return normalizeApiError(raw, fallback, { status });",
  parseStructuredApiError: "return normalizeApiError(payload);",
  parseGridDeleteErrorMessage: "return normalizeApiError(raw, fallback);",
  friendlyDeleteError: 'return normalizeApiError(raw, t("grid_actions.could_not_delete_grid"), { status, translate: t });',
  resolveErrorMessage: "return normalizeApiError(raw, fallback);",
  toFriendlyRuleError: 'return normalizeApiError(raw, "", { translate: translateFn });',
  getFriendlyRuleError: 'return normalizeApiError(error, "", { translate: translateFn });',
  humanizeAvailabilityRuleError: 'return normalizeApiError(raw);',
  formatPrecheckViolation: "return normalizeApiError(violation);",
  formatPlacementReasonMessage: 'return normalizeApiError(reason, t("solve_overlay.no_reasons_available"));',
};
function files(dir) { return fs.readdirSync(dir, { withFileTypes:true }).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir,e.name)] : []); }
for (const file of [...files("components"), ...files("app"), ...files("lib")]) {
  if (file.startsWith("app"+path.sep+"api") || /api-errors|api-error-translations|auth-error-messages|i18n\.ts/.test(file)) continue;
  const source=fs.readFileSync(file,"utf8"); const sf=ts.createSourceFile(file, source,ts.ScriptTarget.Latest,true,file.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const edits=[]; let useNormalize=false, useLocalized=false;
  const edit=(node,text,kind) => {edits.push({start:node.getStart(sf),end:node.end,text});records.push({file,line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,kind,before:node.getText(sf),after:text});};
  const visit=node=>{
    const isFunc=ts.isFunctionDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node);
    const name=isFunc ? node.name?.getText(sf) ?? (ts.isVariableDeclaration(node.parent)?node.parent.name.getText(sf):"") : "";
    if (name==="normalizeApiError") { edit(node.parent.parent,"", "central-parser"); useNormalize=true;return; }
    if (isFunc && helpers[name] && node.body) {edit(node.body,"{ "+helpers[name]+" }","central-parser");useNormalize=true;return;}
    if (ts.isNewExpression(node) && node.expression.getText(sf)==="Error" && node.arguments?.length) {
      const arg=node.arguments[0], text=arg.getText(sf);
      if (/^(normalizeApiError|parseApiErrorMessage|parseApiError|buildApiErrorMessage|parseTimeRangeDeleteError|safeApiText|toFriendlyRuleError|humanizeAvailabilityRuleError|getFriendlyRuleError|friendlyDeleteError|parseGridDeleteErrorMessage)\(/.test(text)) {
        edit(node.expression,"LocalizedApiError","translated-error");useLocalized=true;
      } else if (/^(txt|raw|text|rawError|detail|lastMessage)\s*\|\|/.test(text)) {
        const first=text.slice(0,text.indexOf("||")).trim(), fallback=text.slice(text.indexOf("||")+2).trim();
        edit(node,`new LocalizedApiError(normalizeApiError(${first}, ${fallback}))`,"raw-error");useNormalize=true;useLocalized=true;return;
      } else if (/JSON\.stringify\((j|parsed)\)/.test(text)) {
        edit(node,`new LocalizedApiError(normalizeApiError(${text.includes("JSON.stringify(j)")?"j":"parsed"}))`,"raw-error");useNormalize=true;useLocalized=true;return;
      }
    }
    ts.forEachChild(node,visit);
  }; visit(sf);
  if (!edits.length)continue;
  let out=source;for(const e of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,e.start)+e.text+out.slice(e.end);
  const imports=[useNormalize?"normalizeApiError":null,useLocalized?"LocalizedApiError":null].filter(Boolean);
  const line=`import { ${imports.join(", ")} } from "@/lib/api-errors";\n`;
  out=out.startsWith('"use client";')?out.replace('"use client";','"use client";\n'+line):line+out;
  fs.writeFileSync(file,out);
}
fs.writeFileSync("reports/api-error-frontend-migration.json",JSON.stringify(records,null,2));
console.log(records.length,"changes", new Set(records.map(r=>r.file)).size,"files");
