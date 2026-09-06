// Usage: node tests/walkthrough-scene.test.cjs /path/model.json /path/node_modules/three
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const root=process.argv[3],THREE=require(root);const {RoundedBoxGeometry}=await import('file://'+path.join(root,'examples/jsm/geometries/RoundedBoxGeometry.js'));
let frame,now=0,lastScene,lastCamera;
class Element{constructor(tag){this.tag=tag;this.children=[];this.events={};this.clientWidth=1000;this.clientHeight=560;this.isConnected=true;this.style={};}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(){}addEventListener(n,f){(this.events[n]??=[]).push(f);}removeEventListener(){}getContext(){return new Proxy({},{get:(o,k)=>o[k]??(()=>{})});}focus(){}click(){(this.events.click||[]).forEach(f=>f({}));}}
class Renderer{constructor(){this.domElement=new Element('canvas');this.shadowMap={};}setPixelRatio(){}setSize(){}render(s,c){lastScene=s;lastCamera=c;}dispose(){}}
const context={console,THREE:{...THREE,WebGLRenderer:Renderer},RoundedBoxGeometry,window:{devicePixelRatio:1,addEventListener(){},removeEventListener(){}},document:{createElement:t=>new Element(t)},performance:{now:()=>now},requestAnimationFrame:f=>(frame=f,1),cancelAnimationFrame(){},ResizeObserver:class{constructor(f){this.f=f;}observe(){this.f();}disconnect(){}},setTimeout,URL,Blob};
let source=fs.readFileSync('walkthrough-viewer.source.js','utf8').replace(/^import .*;$/gm,'').replace('export function mountWalkthrough','function mountWalkthrough');source+='\nthis.mount=mountWalkthrough;';vm.runInNewContext(source,context);
const model=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const host=new Element('host');const cleanup=context.mount(host,model);
const viewport=host.children[0],toolbar=host.children[1],select=toolbar.children[0],canvas=viewport.children[0];let checks=0;
for(let i=0;i<model.areas.length;i++){
 select.value=String(i);if(i)select.events.change[0]();now+=16;frame(now);
 assert(lastScene.children.length>15,'Scene has furniture and room geometry');let meshes=0;lastScene.traverse(o=>{if(o.isMesh){meshes++;assert(o.geometry.attributes.position.count>0);assert(o.position.toArray().every(Number.isFinite));}});assert(meshes>30);checks++;
 assert(lastCamera.position.toArray().every(Number.isFinite));const before=lastCamera.position.clone();canvas.events.keydown[0]({code:'KeyW',preventDefault(){}});for(let n=0;n<20;n++){now+=16;frame(now);}assert(lastCamera.position.distanceTo(before)>0,'Keyboard movement advances camera');checks++;
}
cleanup();console.log(checks+' 3D scene construction and keyboard movement checks passed across '+model.areas.length+' areas (WebGL drawing mocked)');
})().catch(e=>{console.error(e);process.exitCode=1;});
