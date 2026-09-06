import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The renderer is generic. Project layouts arrive only through the authenticated API.
export function mountWalkthrough(host, model) {
  if (!model || !Array.isArray(model.areas) || !model.areas.length) throw new Error('No 3D layout is available.');
  host.replaceChildren(); host.className = 'nova-viewer';
  const viewport=document.createElement('div');viewport.className='nova-viewport';host.append(viewport);
  const toolbar=document.createElement('div');toolbar.className='nova-toolbar';host.append(toolbar);
  const intro=document.createElement('p');intro.className='nova-model-note';intro.textContent=model.note || 'Approximate concept model.';host.append(intro);
  const select=document.createElement('select');select.setAttribute('aria-label','Choose area');
  model.areas.forEach((a,i)=>{const o=document.createElement('option');o.value=i;o.textContent=a.name;select.append(o);});toolbar.append(select);
  const viewpoints=document.createElement('div');viewpoints.className='nova-viewpoints';toolbar.append(viewpoints);
  const button=(label,fn,parent=toolbar)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);parent.append(b);return b;};
  button('Reset view',()=>teleport(area.start,area.yaw));
  button('Fullscreen',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else host.requestFullscreen?.().catch(()=>{});});
  const exportButton=button('Download area (.glb)',async()=>{
    exportButton.disabled=true;exportButton.textContent='Preparing model…';
    try {const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const data=await new GLTFExporter().parseAsync(scene,{binary:true});
      const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download='nova-'+area.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(error){status.textContent='Could not export. Please try again.';}finally{exportButton.disabled=false;exportButton.textContent='Download area (.glb)';}
  });
  const status=document.createElement('p');status.className='nova-status';status.textContent='Drag to look · W A S D / arrow keys to walk · Touch buttons to move';status.setAttribute('role','status');host.append(status);
  const pad=document.createElement('div');pad.className='nova-movement';host.append(pad);
  const keys=new Set(),listeners=[];
  const on=(el,name,fn,opt)=>{el.addEventListener(name,fn,opt);listeners.push(()=>el.removeEventListener(name,fn,opt));};
  for(const [label,key] of [['↑','KeyW'],['←','KeyA'],['↓','KeyS'],['→','KeyD']]){
    const b=button(label,()=>{},pad);b.setAttribute('aria-label',({KeyW:'Walk forward',KeyA:'Walk left',KeyS:'Walk backward',KeyD:'Walk right'})[key]);
    on(b,'pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(key);});on(b,'pointerup',()=>keys.delete(key));on(b,'pointercancel',()=>keys.delete(key));on(b,'lostpointercapture',()=>keys.delete(key));
  }
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Interactive 3D walkthrough. Drag to look, W A S D to move.');viewport.append(canvas);
  const map=document.createElement('canvas');map.width=130;map.height=180;map.className='nova-minimap';map.setAttribute('aria-label','Position within this area');host.append(map);const mapctx=map.getContext('2d');
  const camera=new THREE.PerspectiveCamera(68,1,.05,90);camera.rotation.order='YXZ';let yaw=0,pitch=0,scene,area,obstacles=[],raf,disposed=false,last=performance.now();
  const textures=[],materials=new Map();
  function material(color,roughness=.75){const key=color+roughness;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(key);}
  const colors={wall:'#d2c4b0',cream:'#eee6d7',rose:'#d9b2a2',gold:'#b19a70',wood:'#8e7159',dark:'#40382e'};
  function box(parent,w,h,d,x,y,z,c,r=.035){const geo=r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d);const m=new THREE.Mesh(geo,typeof c==='string'?material(c):c);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function cyl(parent,r,h,x,y,z,c){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),typeof c==='string'?material(c):c);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function sphere(parent,r,x,y,z,c,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),typeof c==='string'?material(c):c);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
  function textureCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);return t;}
  const stone=textureCanvas(512,512,(c,w,h)=>{c.fillStyle='#d8cdbc';c.fillRect(0,0,w,h);let seed=5;for(let i=0;i<9000;i++){seed=(seed*16807)%2147483647;const x=seed%w;seed=(seed*16807)%2147483647;const y=seed%h;c.fillStyle=i%2?'rgba(255,255,255,.075)':'rgba(70,50,30,.025)';c.fillRect(x,y,2,2);}c.strokeStyle='#bdb3a3';c.strokeRect(0,0,w,h);});stone.wrapS=stone.wrapT=THREE.RepeatWrapping;stone.repeat.set(6,12);
  const wood=textureCanvas(512,512,(c,w,h)=>{c.fillStyle='#977c63';c.fillRect(0,0,w,h);for(let i=0;i<8;i++){c.fillStyle=['#998069','#a18a70','#927b63','#aa9076'][i%4];c.fillRect(i*64,0,63,h);for(let j=0;j<18;j++){c.fillStyle='rgba(50,30,10,.07)';c.fillRect(i*64+j*3.5,0,.7,h);}c.fillStyle='#725f4c';c.fillRect(i*64,(i%3)*160,64,2);}});wood.wrapS=wood.wrapT=THREE.RepeatWrapping;wood.repeat.set(2,4);
  const stoneMat=new THREE.MeshStandardMaterial({map:stone,roughness:.42});const woodMat=new THREE.MeshStandardMaterial({map:wood,roughness:.65});
  const glow=new THREE.MeshStandardMaterial({color:'#fff4d7',emissive:'#fff0c9',emissiveIntensity:1.8});
  const artTex=textureCanvas(256,340,c=>{c.fillStyle='#eee5d7';c.fillRect(0,0,256,340);c.strokeStyle='#947858';c.lineWidth=2;for(let i=0;i<9;i++){c.beginPath();c.moveTo(128,320);c.quadraticCurveTo(70+i*12,190,60+i*18,40+i%3*35);c.stroke();c.fillStyle=['#b99a80','#c3ab8e','#8c8066'][i%3];c.beginPath();c.ellipse(60+i*18,70+i%3*35,15,42,i*.3,0,7);c.fill();}});
  function lamp(parent,x,z){cyl(parent,.012,.6,x,2.94,z,colors.dark);for(let i=0;i<3;i++)sphere(parent,.15,x+(i-1)*.2,2.59-i*.08,z+(i%2)*.15,glow);}
  function chair(g,x,z,rot=0){const q=new THREE.Group();q.position.set(x,0,z);q.rotation.y=rot;g.add(q);box(q,.55,.16,.54,0,.48,0,colors.rose,.075);box(q,.56,.48,.11,0,.78,.24,colors.rose,.055);for(const xx of [-.21,.21])for(const zz of [-.19,.19])cyl(q,.018,.4,xx,.22,zz,colors.gold);}
  function buildObject(o){const g=new THREE.Group();g.position.set(o.x,0,o.z);g.rotation.y=o.rot||0;scene.add(g);let collision;
    switch(o.kind){
      case 'sofa':{
        box(g,2,.25,.82,0,.32,0,o.color||colors.cream,.1);box(g,2,.7,.18,0,.68,-.36,o.color||colors.cream,.08);
        for(const x of [-.66,0,.66])box(g,.63,.2,.65,x,.52,0,o.color||colors.cream,.08);
        for(const x of [-1,1])box(g,.15,.55,.85,x,.49,0,o.color||colors.cream,.065);
        for(const x of [-.67,.67]){const p=box(g,.42,.42,.17,x,.82,-.19,colors.rose,.08);p.rotation.z=x*.25;}
        for(const x of [-.85,.85])for(const z of [-.25,.25])cyl(g,.026,.22,x,.11,z,colors.gold);collision=[2.2,.9];break;
      }
      case 'coffee':box(g,1,.065,.6,0,.4,0,colors.cream);for(const x of [-.42,.42])for(const z of [-.22,.22])box(g,.025,.38,.025,x,.2,z,colors.gold,.005);cyl(g,.07,.19,0,.53,0,colors.wood);collision=[1,.6];break;
      case 'reception':box(g,1.8,1.04,.63,0,.52,0,colors.cream,.09);box(g,1.6,.05,.75,0,1.065,.06,colors.cream);box(g,.48,.32,.035,.25,1.23,0,colors.dark,.015);box(g,.03,.12,.08,.25,1.08,.02,colors.gold);collision=[1.8,.75];break;
      case 'archShelf':{
        // Rounded vertical display fins evoke the arched room divider in the renders.
        for(const x of [-.65,0,.65]){const arch=new THREE.Shape();arch.moveTo(-.27,.2);arch.lineTo(.27,.2);arch.lineTo(.27,2.28);arch.absarc(0,2.28,.27,0,Math.PI,false);arch.lineTo(-.27,.2);const hole=new THREE.Path();hole.moveTo(-.21,.43);hole.lineTo(-.21,2.27);hole.absarc(0,2.27,.21,Math.PI,0,true);hole.lineTo(.21,.43);hole.lineTo(-.21,.43);arch.holes.push(hole);const frame=new THREE.Mesh(new THREE.ExtrudeGeometry(arch,{depth:.18,bevelEnabled:false,curveSegments:16}),material(colors.cream));frame.position.set(x,0,-.09);frame.castShadow=true;g.add(frame);for(let y=.55;y<2.2;y+=.35){box(g,.49,.045,.32,x,y,.1,colors.cream);for(let b=0;b<5;b++){cyl(g,.023,.105,x-.16+b*.08,y+.065,.14,['#ead6c6','#c7928a','#b25754','#9d665f','#a6887a'][b]);cyl(g,.017,.045,x-.16+b*.08,y+.14,.14,colors.dark);}}}collision=[1.9,.42];break;
      }
      case 'shelf':box(g,1.6,2.55,.12,0,1.4,0,colors.cream);for(let y=.55;y<2.5;y+=.28){box(g,1.48,.045,.27,0,y,.12,colors.cream);for(let b=0;b<12;b++){cyl(g,.028,.1,-.64+b*.116,y+.07,.15,['#8e5361','#b87685','#b398a5','#71536d','#cfafa7'][b%5]);cyl(g,.018,.04,-.64+b*.116,y+.14,.15,colors.dark);}}break;
      case 'manicure':box(g,1.45,.07,.62,0,.78,0,colors.cream);box(g,.29,.75,.6,-.55,.38,0,colors.cream);box(g,.075,.75,.6,.66,.38,0,colors.cream);chair(g,0,.58,0);chair(g,0,-.58,Math.PI);sphere(g,.12,.32,.86,0,colors.cream,1,.7,1);collision=[1.5,1.8];break;
      case 'pedicure':{
        box(g,1.2,.18,1.85,0,.09,0,colors.wood);box(g,1.07,.25,1.55,0,.26,0,colors.cream,.08);
        box(g,.82,.22,.72,0,.68,-.24,colors.cream,.1);const back=box(g,.84,.9,.23,0,1.18,-.65,colors.cream,.1);back.rotation.x=-.14;
        for(const x of [-.5,.5])box(g,.2,.5,.85,x,.7,-.28,colors.cream,.07);
        sphere(g,.3,0,.46,.46,colors.cream,1,.35,1);sphere(g,.24,0,.48,.46,material('#a9a59a',.2),1,.18,1);
        cyl(g,.27,.42,0,.23,1.22,colors.rose);collision=[1.3,2.7];break;
      }
      case 'bed':box(g,.86,.19,1.85,0,.75,0,colors.cream,.1);box(g,.7,.42,1.2,0,.36,0,colors.cream);box(g,.73,.12,.42,0,.89,-.56,'#f2ebdf',.08);box(g,.85,.04,.45,0,.88,.5,colors.rose);collision=[.95,2];break;
      case 'cart':for(const y of [.25,.55,.85])box(g,.45,.025,.42,0,y,0,colors.cream);for(const x of [-.2,.2])for(const z of [-.18,.18])cyl(g,.015,.84,x,.45,z,colors.gold);cyl(g,.045,.14,-.1,.93,0,colors.wood);collision=[.5,.48];break;
      case 'cabinet':box(g,1.6,.86,.5,0,.43,0,colors.wall);box(g,1.68,.06,.57,0,.9,0,colors.cream);for(const x of [-.5,0,.5])box(g,.47,.72,.025,x,.44,.27,colors.cream);cyl(g,.07,.2,.5,1.02,0,colors.gold);collision=[1.7,.6];break;
      case 'column':box(g,.24,3.18,.3,0,1.59,0,colors.cream);collision=[.3,.36];break;
      case 'curtain':for(let x=-(o.width||1.7)/2;x<(o.width||1.7)/2;x+=.09)cyl(g,.075,2.85,x,1.6,0,colors.cream);break;
      case 'pendant':lamp(g,0,0);break;
      case 'art':box(g,.72,1.02,.04,0,1.84,0,colors.gold,.008);box(g,.65,.95,.025,0,1.84,.03,new THREE.MeshStandardMaterial({map:artTex,roughness:1}),0);break;
      case 'sconce':cyl(g,.025,.25,0,1.95,.14,colors.gold);sphere(g,.085,0,2.14,.17,glow);break;
      case 'sign':{
        const tex=textureCanvas(1024,256,c=>{c.fillStyle='#d2c4b0';c.fillRect(0,0,1024,256);c.fillStyle='#675c49';c.font='44px Georgia';c.textAlign='center';c.fillText(o.text||'NOVA',512,140);});
        box(g,2.6,.65,.02,0,2.15,0,new THREE.MeshStandardMaterial({map:tex,roughness:1}),0);break;
      }
      case 'plant':cyl(g,.16,.35,0,.18,0,colors.cream);for(let i=0;i<7;i++){const a=i*.9;cyl(g,.008,.75,Math.sin(a)*.07,.66,Math.cos(a)*.07,colors.wood);sphere(g,.15,Math.sin(a)*.16,1+i%3*.13,Math.cos(a)*.16,'#7b8265',.5,1.5,.35);}break;
    }
    if(o.scale) g.scale.fromArray(o.scale);
    if(collision){const w=collision[0]*(o.scale?.[0]||1),d=collision[1]*(o.scale?.[2]||1);const c=Math.abs(Math.cos(o.rot||0)),s=Math.abs(Math.sin(o.rot||0));obstacles.push({x:o.x,z:o.z,w:w*c+d*s,d:d*c+w*s});}
  }
  function clearScene(){if(!scene)return;scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
  function teleport(pos,angle){camera.position.fromArray(pos);yaw=angle||0;pitch=0;keys.clear();camera.rotation.set(pitch,yaw,0,'YXZ');}
  function build(index){clearScene();area=model.areas[index];obstacles=[];scene=new THREE.Scene();scene.background=new THREE.Color('#d7cebf');
    box(scene,area.width,.1,area.depth,0,-.05,0,area.floor==='wood'?woodMat:stoneMat,0);
    box(scene,area.width,3.3,.12,0,1.65,-area.depth/2,colors.wall,0);if(area.floor==='stone'){box(scene,area.width,.55,.12,0,3.025,area.depth/2,colors.wall,0);const glass=new THREE.MeshStandardMaterial({color:'#d5e0dd',transparent:true,opacity:.2,roughness:.12});for(const x of [-area.width/2+.08,0,area.width/2-.08])box(scene,.04,2.8,.06,x,1.4,area.depth/2,colors.gold,0);box(scene,area.width-.15,2.75,.02,0,1.4,area.depth/2,glass,0);}else box(scene,area.width,3.3,.12,0,1.65,area.depth/2,colors.wall,0);
    box(scene,.12,3.3,area.depth,-area.width/2,1.65,0,colors.wall,0);box(scene,.12,3.3,area.depth,area.width/2,1.65,0,colors.wall,0);
    box(scene,area.width,.08,area.depth,0,3.3,0,colors.cream,0);
    // Ceiling reveals, skirting, illuminated linear details.
    for(const x of [-area.width/2+.12,area.width/2-.12]){box(scene,.08,.1,area.depth,x,.08,0,colors.cream,0);box(scene,.045,.035,area.depth-.6,x,3.16,0,glow,0);}
    for(let z=-area.depth/2+1;z<area.depth/2;z+=3.5){box(scene,area.width,.15,.2,0,3.15,z,colors.cream,0);const l=new THREE.PointLight('#ffe6bd',11,8,2);l.position.set(0,2.95,z);scene.add(l);}
    scene.add(new THREE.HemisphereLight('#fff2dd','#bba589',2.0));const sun=new THREE.DirectionalLight('#fff0d9',2.5);sun.position.set(-2,4,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.bias=-.001;scene.add(sun);scene.add(sun.target);
    area.objects.forEach(buildObject);teleport(area.start,area.yaw);
    viewpoints.replaceChildren();(area.views||[]).forEach(v=>button(v.name,()=>teleport(v.position,v.yaw),viewpoints));
    status.textContent=area.name+' · Drag to look · W A S D / arrows to walk';
  }
  select.addEventListener('change',()=>build(Number(select.value)));
  let drag=null;
  on(canvas,'pointerdown',e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};});
  on(canvas,'pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-1.15,1.15);drag.x=e.clientX;drag.y=e.clientY;});
  const release=()=>{drag=null;};on(canvas,'pointerup',release);on(canvas,'pointercancel',release);on(canvas,'lostpointercapture',release);
  const code=e=>({ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'})[e.code]||e.code;
  on(canvas,'keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD'].includes(code(e))){e.preventDefault();keys.add(code(e));}});on(window,'keyup',e=>keys.delete(code(e)));on(window,'blur',()=>keys.clear());on(canvas,'blur',()=>keys.clear());
  function free(x,z){return Math.abs(x)<area.width/2-.26&&Math.abs(z)<area.depth/2-.26&&!obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.2&&Math.abs(z-o.z)<o.d/2+.2);}
  function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
  const observer=new ResizeObserver(resize);observer.observe(viewport);
  function minimap(){const c=mapctx,w=map.width,h=map.height;c.fillStyle='rgba(35,30,25,.86)';c.fillRect(0,0,w,h);const s=Math.min((w-20)/area.width,(h-30)/area.depth),ox=w/2,oz=h/2;c.strokeStyle='#cab9a0';c.strokeRect(ox-area.width*s/2,oz-area.depth*s/2,area.width*s,area.depth*s);c.fillStyle='#796c5e';obstacles.forEach(o=>c.fillRect(ox+(o.x-o.w/2)*s,oz+(o.z-o.d/2)*s,o.w*s,o.d*s));c.fillStyle='#ee985a';const x=ox+camera.position.x*s,z=oz+camera.position.z*s;c.beginPath();c.arc(x,z,4,0,7);c.fill();c.strokeStyle='#ee985a';c.beginPath();c.moveTo(x,z);c.lineTo(x-Math.sin(yaw)*11,z-Math.cos(yaw)*11);c.stroke();}
  function tick(now){if(disposed)return;if(!host.isConnected){dispose();return;}const dt=Math.min((now-last)/1000,.04);last=now;
    let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),r=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const len=Math.hypot(f,r)||1;f/=len;r/=len;
    const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*1.6,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*dt*1.6;
    if(free(camera.position.x+dx,camera.position.z))camera.position.x+=dx;if(free(camera.position.x,camera.position.z+dz))camera.position.z+=dz;
    camera.rotation.set(pitch,yaw,0,'YXZ');renderer.render(scene,camera);minimap();raf=requestAnimationFrame(tick);
  }
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();listeners.forEach(fn=>fn());clearScene();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());stoneMat.dispose();woodMat.dispose();glow.dispose();renderer.dispose();keys.clear();}
  build(0);resize();raf=requestAnimationFrame(tick);return dispose;
}
