import { readFileSync, readdirSync } from 'node:fs'
const PLANR={'2025-10':4996400.22,'2025-11':7465870.90,'2025-12':10131395.70,'2026-01':9030088.30,'2026-02':12601230.59,'2026-03':40429003.18,'2026-04':43280410.49,'2026-05':45584688.98,'2026-06':25296202.48,'2026-07':23187057.86,'2026-08':19103526.18}
const PLANC={'2025-10':4311967.58,'2025-11':6383244.37,'2025-12':8909081.88,'2026-01':7909884.41,'2026-02':11317769.48,'2026-03':36666215.64,'2026-04':39169661.25,'2026-05':40983340.14,'2026-06':22841085.15,'2026-07':20943757.86,'2026-08':16695193.02}
const meses=Object.keys(PLANR); const n=(v)=>Math.round(v/1000).toLocaleString('pt-BR')+'k'
const nfs=[]
for (const f of readdirSync('robot/out').filter(f=>/^api-producao-20/.test(f))) { const c=JSON.parse(readFileSync('robot/out/'+f,'utf8'))
  for (const x of c.nfs??[]) if (x.idEmpresa===1) nfs.push({st:x.status, m:String(x.dataEmissao).slice(0,7), cf:String(x.cfop).slice(0,4), v:Number(x.valorTotalNf)||0, ent:!!x.entrada}) }
function testar(nome, PLAN, pred){ const s={}; for(const x of nfs){ if(x.st!=='Finalizada')continue; const v=pred(x); if(v) s[x.m]=(s[x.m]||0)+v }
  let e=0,a=0,p=0; const ds=[]; for(const m of meses){ const d=((s[m]||0)/PLAN[m]-1)*100; e+=Math.abs(d); ds.push(((d>0?'+':'')+d.toFixed(0)+'%').padStart(5)); if(m>='2026-01'){a+=s[m]||0;p+=PLAN[m]} }
  console.log(`${nome.padEnd(30)}${(e/meses.length).toFixed(1).padStart(5)} pts | ${ds.join(' ')} | ${((a/p-1)*100).toFixed(1).padStart(5)}%`) }
const ent=(x,set)=>x.ent&&set.has(x.cf)?x.v:0
console.log('COMPRA — HIPÓTESE              erro  | '+meses.map(m=>m.slice(2)).join('  ')+' | acum')
testar('1102',                    PLANC, x=>ent(x,new Set(['1102'])))
testar('1102+1117',               PLANC, x=>ent(x,new Set(['1102','1117'])))
testar('1102+1907',               PLANC, x=>ent(x,new Set(['1102','1907'])))
testar('1102+1117+1907',          PLANC, x=>ent(x,new Set(['1102','1117','1907'])))
testar('1102-5202(dev.compra)',   PLANC, x=>ent(x,new Set(['1102']))-(!x.ent&&x.cf==='5202'?x.v:0))
testar('1102+1117-5202',          PLANC, x=>ent(x,new Set(['1102','1117']))-(!x.ent&&x.cf==='5202'?x.v:0))
console.log('\nRECEITA — o que NÃO está na reconstrução, por mês (Finalizadas, filial MG):')
const REC=new Set(['5106','6106','6502','5102','5502','6152','1202','2202'])
const fora={}; for(const x of nfs){ if(x.ent||x.st!=='Finalizada'||REC.has(x.cf))continue; fora[x.m]??={}; fora[x.m][x.cf]=(fora[x.m][x.cf]||0)+x.v }
const canc={}; for(const x of nfs){ if(x.ent||x.st!=='Cancelada')continue; if(!new Set(['5106','6106','6502','5102','5502','6152']).has(x.cf))continue; canc[x.m]=(canc[x.m]||0)+x.v }
for(const m of ['2025-12','2026-01','2026-05','2026-06','2026-07']){ const rec=Object.entries(fora[m]||{}).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+'='+n(v)).join('  '); console.log(`  ${m}  canceladas(venda)=${n(canc[m]||0)}   outros CFOP: ${rec}`) }
