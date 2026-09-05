const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app.js', 'utf8');
const listeners = {};
const calls = [];
let responder = () => ({data:[],error:null});
let signResponder = () => ({data:{signedUrl:'https://example.invalid/fresh'},error:null});
let signCalls = 0;
const root = {innerHTML:''};
const sb = {
 from(table) {
   const q={table,method:'select',payload:null,filters:[]};
   const api={};
   for(const method of ['select','insert','update','upsert','delete','eq','is','in','order']) api[method]=(...args)=>{
     if(['insert','update','upsert','delete'].includes(method)){q.method=method;q.payload=args[0];q.options=args[1];}
     else if(method!=='select')q.filters.push([method,...args]);
     return api;
   };
   const finish=()=>{calls.push(q);return Promise.resolve().then(()=>responder(q));};
   api.single=finish;api.maybeSingle=finish;api.then=(yes,no)=>finish().then(yes,no);
   return api;
 },
 storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null}),createSignedUrl:async()=>{signCalls++;return signResponder();}})}
};
const context={window:{STANZA_CONFIG:{},supabase:{createClient:()=>sb}},document:{addEventListener:(name,fn)=>{listeners[name]=fn;},getElementById:(id)=>id==='app'?root:null,querySelector:()=>null},setTimeout,clearTimeout,console};
const instrumented=source.replace('  boot();\n})();', `  window.qa={saveRow,grantMemberAccess,loadProjectData,projectLoadStateHtml,pageHtml,urlFor,openPdf,loadMembers,accessHtml,pillTone,sidebar,
 UI,SIGNED,WRITE_ACTIONS,
 setup(me={kind:'staff',status:'active',role:'managing_director',id:'manager'}){ME=me;PROJECTS=[{id:'project',name:'Test project',code:'QA'}];UI.projectId='project';UI.screen='loading';UI.previewClient=false;UI.dataLoading=false;UI.dataErrors=[];UI.page='overview';D={};SIGNED.clear();},
 data(value){if(value)D=value;return D;}};\n})();`);
vm.runInNewContext(instrumented,context);
const q=context.window.qa;
const clean=v=>JSON.parse(JSON.stringify(v));
let count=0;
function check(value,message){assert(value,message);count++;}
(async()=>{
 q.setup();
 responder=()=>({data:{id:'row'},error:null});
 await q.saveRow('documents',{name:'Doc',external_url:'',uploaded_at:'2026-09-05',__file:'ignored'},'row');
 check(calls.at(-1).payload.external_url==='', 'Cleared text is transmitted');
 check(!('__file' in calls.at(-1).payload), 'File input metadata excluded');
 await q.saveRow('site_issues',{title:'Issue',target_date:''},'row');
 check(calls.at(-1).payload.target_date===null, 'Optional cleared date becomes null');
 await q.saveRow('documents',{name:'Doc',uploaded_at:'',external_url:''},null);
 check(!('uploaded_at' in calls.at(-1).payload),'Blank create date retains database default');
 await assert.rejects(()=>q.saveRow('documents',{uploaded_at:''},'row'),/upload date/);count++;
 q.setup({kind:'client',status:'active',id:'client'});
 await q.saveRow('approvals',{response:'Approved',comment:'',responded_by:'forged'},'row');
 check(calls.at(-1).payload.comment==='', 'Client can clear a comment');
 check(!('responded_by' in calls.at(-1).payload),'Approval evidence excluded');
 responder=()=>({data:null,error:{message:'Denied'}});
 await assert.rejects(()=>q.saveRow('approvals',{response:'Approved'},'row'));count++;

 q.setup();responder=()=>({data:{user_id:'client'},error:null});
 await q.grantMemberAccess('client');
 const grant=calls.at(-1);
 check(grant.method==='upsert','Grant uses atomic upsert');
 check(grant.payload.revoked_at===null,'Grant clears revocation');
 check(grant.options.onConflict==='project_id,user_id','Grant uses membership key');
 check(grant.payload.granted_by==='manager','Grant preserves granting actor');
 q.UI.previewClient=true;
 const before=calls.length;
 await assert.rejects(()=>q.grantMemberAccess('client'),/permission/);count++;
 check(calls.length===before,'Preview grant never sends a query');
 for(const action of q.WRITE_ACTIONS){
   const target={dataset:{action}};
   await listeners.click({target:{closest:(selector)=>selector==='[data-action]'?target:null}});
   check(calls.length===before,`Preview blocks ${action}`);
 }
 await listeners.change({target:{matches:()=>false,closest:()=>({files:[{name:'test'}]})}});
 check(calls.length===before,'Preview blocks upload');
 check(!q.sidebar().includes('data-action="new-project"'),'Preview hides new project');

 q.setup();responder=(query)=>query.table==='invoices'?{error:{message:'network'}}:{data:[]};
 await q.loadProjectData();
 check(q.UI.dataErrors.includes('Invoices & Receipts'),'Failed table named');
 check(q.pageHtml().includes('data-action="retry-project"'),'Data error offers Retry');
 check(!q.pageHtml().includes('Nothing here yet'),'Data error is not empty state');
 responder=()=>({data:[]});
 await listeners.click({target:{closest:(selector)=>selector==='[data-action]'?{dataset:{action:'retry-project'}}:null}});
 check(q.UI.dataErrors.length===0,'Retry clears error');
 responder=()=>Promise.reject(new Error('offline'));
 await q.loadProjectData();
 check(q.UI.dataErrors.length>0&&!q.UI.dataLoading,'Rejected fetch releases loading state');

 // An older project's response must not populate the newly selected project.
 q.setup();let release;const pending=new Promise(resolve=>{release=resolve;});
 responder=(query)=>query.filters.some(f=>f[2]==='project')?pending:{data:[{project_id:'second',name:'second'}]};
 const first=q.loadProjectData();await new Promise(resolve=>setImmediate(resolve));
 q.UI.projectId='second';await q.loadProjectData();release({data:[{project_id:'project',name:'old'}]});await first;
 check(q.data().invoices[0].project_id==='second','Out-of-order response ignored');

 q.setup();q.data({files:[{id:'pdf',storage_path:'project/doc.pdf',original_name:'doc.pdf',size_bytes:100}]});
 q.SIGNED.set('project/doc.pdf',{url:'https://example.invalid/expired',expires:Date.now()-1000});
 check(q.urlFor('pdf')==='','Expired cache is rejected');
 await q.openPdf('pdf');
 check(q.UI.pdfView.url==='https://example.invalid/fresh','PDF obtains fresh link');
 const signedBefore=signCalls;await q.openPdf('pdf');
 check(signCalls===signedBefore,'Valid cache is reused');
 q.SIGNED.set('project/doc.pdf',{url:'https://example.invalid/near-expiry',expires:Date.now()+30000});
 await q.openPdf('pdf');check(signCalls===signedBefore+1,'Near-expiry link refreshed');
 q.SIGNED.clear();signResponder=()=>({error:{message:'denied'}});await q.openPdf('pdf');
 check(q.UI.pdfView===null&&q.UI.banner.type==='error','Failed signing has explicit feedback');
 q.data().files[0].deleted_at='2026-09-05';await q.openPdf('pdf');
 check(q.UI.pdfView===null,'Deleted file cannot preview');

 q.setup();responder=()=>({error:{message:'permission'}});await q.loadMembers();
 check(q.accessHtml().includes('data-action="retry-members"'),'Access load errors offer retry');
 check(q.pillTone('Partially Paid')==='warn','Partial payment has warning status');
 check(q.pillTone('Overdue')==='danger','Overdue has danger status');
 console.log(`${count} P2 regression checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
