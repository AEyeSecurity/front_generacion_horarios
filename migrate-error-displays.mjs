import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const records=[];
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):/\.tsx$/.test(e.name)?[path.join(d,e.name)]:[]);
for(const file of [...files("components"),...files("app")]){
 const source=fs.readFileSync(file,"utf8"),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],imports=new Set();
 const edit=(n,text)=>{edits.push({start:n.getStart(sf),end:n.end,text});records.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,before:n.getText(sf),after:text});};
 const messageTarget=n=>ts.isPropertyAccessExpression(n)&&n.name.text==="message"?n.expression.getText(sf):null;
 const visit=n=>{
  if(ts.isNewExpression(n)&&n.expression.getText(sf)==="Error"&&n.arguments?.length){
   let parent=n.parent;while(parent&&!ts.isIfStatement(parent)&&!ts.isFunctionLike(parent))parent=parent.parent;
   const condition=parent&&ts.isIfStatement(parent)?parent.expression.getText(sf):"";
   const response=/^!(\w+)\.ok$/.exec(condition)?.[1];
   if(response && !/\b(raw|txt|text|parse|normalize|safeApi)\b/.test(n.arguments[0].getText(sf))){
    edit(n,`new ApiError(${response}.status, await ${response}.text().catch(() => ""))`);imports.add("ApiError");return;
   }
   if(/\b(t|tt)\(/.test(n.arguments[0].getText(sf))){edit(n.expression,"LocalizedApiError");imports.add("LocalizedApiError");}
  }
  if(ts.isConditionalExpression(n)){
   const object=messageTarget(n.whenTrue);
   if(object&&/Error/.test(n.condition.getText(sf))){edit(n,`normalizeApiError(${object}, ${n.whenFalse.getText(sf)})`);imports.add("normalizeApiError");return;}
  }
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.BarBarToken){
   const object=messageTarget(n.left);
   if(object){edit(n,`normalizeApiError(${object}, ${n.right.getText(sf)})`);imports.add("normalizeApiError");return;}
  }
  if(ts.isCallExpression(n)&&/^set(?:Err|Error|\w+Error)$/.test(n.expression.getText(sf))&&n.arguments.length===1){
   const object=messageTarget(n.arguments[0]);if(object){edit(n.arguments[0],`normalizeApiError(${object})`);imports.add("normalizeApiError");return;}
  }
  ts.forEachChild(n,visit);
 };visit(sf);
 if(!edits.length)continue;
 let out=source;for(const e of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,e.start)+e.text+out.slice(e.end);
 const oldImport=/import \{ ([^}]+) \} from "@\/lib\/api-errors";/.exec(out);
 if(oldImport){oldImport[1].split(",").forEach(i=>imports.add(i.trim()));out=out.replace(oldImport[0],`import { ${[...imports].sort().join(", ")} } from "@/lib/api-errors";`);}
 else{const line=`import { ${[...imports].sort().join(", ")} } from "@/lib/api-errors";\n`;out=out.startsWith('"use client";')?out.replace('"use client";','"use client";\n'+line):line+out;}
 fs.writeFileSync(file,out);
}
fs.writeFileSync("reports/api-error-display-migration.json",JSON.stringify(records,null,2));console.log(records.length,"changes",new Set(records.map(r=>r.file)).size,"files");
