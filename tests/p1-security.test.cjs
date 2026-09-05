const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app.js', 'utf8');
let signedOut = 0;
let profile = {kind:'client',status:'disabled'};
const sb = {auth:{getUser:async()=>({data:{user:{id:'test',email:'test@example.invalid'}}}),signOut:async()=>{signedOut++;}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:profile})})})})};
const context = {window:{STANZA_CONFIG:{},supabase:{createClient:()=>sb}},document:{addEventListener:()=>{}},setTimeout,clearTimeout};
const instrumented = source.replace('  boot();\n})();', `  window.qa = {canEdit,hasClientEditable,loadMe,modalHtml,financePageHtml,projectPageHtml,
 set(me,preview=false){ME=me; UI.previewClient=preview; UI.page='invoices';PROJECTS=[{id:'p',code:'QA'}];UI.projectId='p';D={};},
 modal(page,isNew=false){UI.modal={page,isNew,id:isNew?null:'row',draft:{title:'QA'}};return modalHtml();},
 me(){return ME;}};\n})();`);
vm.runInNewContext(instrumented,context);
const q=context.window.qa;
const matrix=JSON.parse(fs.readFileSync('security/role-map.json','utf8'));
let checks=0;
for(const role of ['managing_director','product_owner','project_manager','designer','finance','qs','sales','system_admin','subcontractor']) {
 for(const [resource,roles] of Object.entries(matrix)) for(const op of ['INSERT','UPDATE','DELETE']) {
  q.set({kind:'staff',status:'active',role});
  const expected=['managing_director','product_owner'].includes(role)||roles.includes(role)||(resource==='site_media'&&op==='INSERT'&&role==='subcontractor');
  assert.equal(q.canEdit(resource,op),expected,`${role}/${resource}/${op}`);checks++;
  q.set({kind:'staff',status:'disabled',role});assert.equal(q.canEdit(resource,op),false);checks++;
  q.set({kind:'staff',status:'active',role},true);assert.equal(q.canEdit(resource,op),false);checks++;
 }
}
q.set({kind:'staff',status:'active',role:'designer'});
assert(!q.modal('invoices').includes('data-action="save-row"'));
q.set({kind:'staff',status:'active',role:'subcontractor'});
assert(q.modal('site_media',true).includes('data-action="save-row"'));
assert(!q.modal('site_media').includes('data-action="save-row"'));
q.set({kind:'client',status:'active'});
assert(q.modal('approvals').includes('data-action="save-row"'));
q.set({kind:'staff',status:'active',role:'managing_director'},true);
assert(!q.modal('approvals').includes('data-action="save-row"'));
assert(!q.financePageHtml().includes('data-action="save-finance"'));
assert(!q.projectPageHtml().includes('data-action="save-project"'));
(async()=>{
 assert.equal(await q.loadMe(),false);assert.equal(signedOut,1);assert.equal(q.me(),null);
 profile={kind:'client',status:'active'};assert.equal(await q.loadMe(),true);
 console.log(`${checks} permission assertions plus modal, preview and disabled-login regression tests passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
