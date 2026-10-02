// visibility: public
// Audits every theme family at all 81 brightness values: contrast, color
// identity, distinctness between families, and the picker. Theme IDs, names,
// and saved preferences must keep behaving as they did at the baseline commit.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { families } from '../scripts/palettes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineCommit = 'cd6aac6380c70291fa876f8d1d802cde65b80b0a';
const stage = path.join(root, 'test-output', 'theme-palettes');
const oldThemes = ['mist','lilac','glacier','rose','sand','tidepool','cypress','starlight'];
const rainbowOrder = ['crimson','sand','ember','cypress','tidepool','mist','glacier','ultramarine','lilac','starlight','orchid','rose'];
const allThemes = rainbowOrder;
const failures = [];
const readCommit = (file) => execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd:root });
await mkdir(path.join(stage,'baseline','src'),{recursive:true});
await mkdir(path.join(stage,'baseline','fixtures'),{recursive:true});
const sourceNames = execFileSync('git',['ls-tree','-r','--name-only',baselineCommit,'src'],{cwd:root,encoding:'utf8'})
  .trim().split(/\r?\n/).filter((name)=>/\.(?:css|js)$/.test(name));
for(const name of sourceNames) await writeFile(path.join(stage,'baseline',name),readCommit(name));
await writeFile(path.join(stage,'baseline','fixtures','theme-surface.html'),readCommit('fixtures/theme-surface.html'));

const server=createServer(async(request,response)=>{
  try {
    const url=new URL(request.url,'http://localhost');
    const match=/^\/(baseline|proposed)\/(src|fixtures)\/([a-z0-9-]+\.(?:html|js|css))$/.exec(url.pathname);
    if(!match) {response.writeHead(404);response.end();return;}
    const directory=match[1]==='baseline'?path.join(stage,'baseline'):root;
    let bytes=await readFile(path.join(directory,match[2],match[3]));
    if(match[3]==='theme-surface.html') bytes=Buffer.from(bytes.toString('utf8')
      .replace('<html lang="en"','<html data-amyc-viewer="theme-additions-parity" lang="en"'));
    response.writeHead(200,{'Content-Type':match[3].endsWith('.html')?'text/html':match[3].endsWith('.css')?'text/css':'text/javascript'});
    response.end(bytes);
  } catch {response.writeHead(404);response.end();}
});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});

async function pageFor(kind) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',(route)=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',(error)=>failures.push({type:'page-error',kind,message:error.message}));
  await page.goto(`${base}/${kind}/fixtures/theme-surface.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    localStorage.clear();
    localStorage.setItem('amyc-sync-viewers','1');
  });
  await page.reload({waitUntil:'domcontentloaded'});
  return page;
}

// Captures every computed custom property, rendered fixture color, label, and
// saved preference at each requested integer slider position.
async function themeStates(page,theme,withContrast=false,lightnessValues=Array.from({length:81},(_,i)=>i-40)) {
  return page.evaluate(({theme,withContrast,oldThemes,lightnessValues})=>{
    document.querySelector(`[data-theme-choice="${theme}"]`).click();
    const slider=document.querySelector('[data-theme-lightness]');
    const nodes=[...document.querySelectorAll('[data-contrast-check]')];
    const diagramProbe=document.createElement('section');
    const diagramNodes=[];
    const headerNodes=[];
    if(withContrast) {
      // These are the existing consumer's actual CSS expressions. Resolve them
      // in the browser rather than duplicating the runtime's contrast math.
      const diagramFills={
        llm:'color-mix(in srgb, var(--link) 36%, var(--plain))',
        amy:'color-mix(in srgb, var(--bar-fill) 52%, var(--plain))',
        prog:'color-mix(in srgb, var(--ink-3) 26%, var(--plain))',
      };
      for(const [name,fill] of Object.entries(diagramFills)) {
        for(const token of ['ink','ink-2','ink-3']) {
          const label=document.createElement('span');
          label.dataset.diagramContrast=`${name}/${token}`;
          label.style.cssText=`display:block;background:${fill};color:var(--${token});font:14px sans-serif`;
          label.textContent=`${name} ${token}`;
          diagramProbe.append(label);diagramNodes.push(label);
        }
      }
      // Cividx's masthead tints chrome with up to 24% accent and fades its
      // secondary text to 82%. Flat-header contrast misses this case.
      for(let step=0;step<=16;step++) {
        for(const [token,opacity] of [['chrome-ink',1],['chrome-ink',.82],['chrome-accent',1]]) {
          const surface=document.createElement('div');
          surface.style.background=`color-mix(in srgb, var(--chrome) ${100-step*1.5}%, var(--accent))`;
          const label=document.createElement('span');
          label.dataset.headerContrast=`header/${step}/${token}/${opacity}`;
          label.style.color=`color-mix(in srgb, var(--${token}) ${opacity*100}%, transparent)`;
          label.textContent=token;
          surface.append(label);diagramProbe.append(surface);headerNodes.push(label);
        }
      }
      document.body.append(diagramProbe);
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const cache=new Map();
    const rgba=(value)=>{
      if(!cache.has(value)) {
        context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);
        cache.set(value,[...context.getImageData(0,0,1,1).data]);
      }
      return cache.get(value);
    };
    const blend=(fg,bg)=>fg.slice(0,3).map((c,i)=>c*fg[3]/255+bg[i]*(1-fg[3]/255)).concat(255);
    const background=(node)=>{
      const chain=[];for(let current=node;current;current=current.parentElement)chain.unshift(current);
      return chain.reduce((bg,el)=>blend(rgba(getComputedStyle(el).backgroundColor),bg),[255,255,255,255]);
    };
    const luminance=(rgb)=>rgb.slice(0,3).map(c=>c/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)
      .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(fg,bg)=>{const a=luminance(fg),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
    const states=[];
    for(const lightness of lightnessValues) {
      slider.value=String(lightness);slider.dispatchEvent(new Event('input',{bubbles:true}));
      const css=getComputedStyle(document.documentElement);
      const tokens=Object.fromEntries([...css].filter(key=>key.startsWith('--')).sort().map(key=>[key,css.getPropertyValue(key).trim()]));
      const rendered=nodes.map(node=>{
        const style=getComputedStyle(node);
        return {label:node.dataset.contrastCheck,color:style.color,backgroundColor:style.backgroundColor,
          borderColor:style.borderColor,fontFamily:style.fontFamily,fontSize:style.fontSize};
      });
      const state={theme,lightness,actualLightness:slider.value,tokens,rendered,
        labels:{toggle:document.querySelector('[data-theme-toggle]').getAttribute('aria-label'),
          title:document.querySelector('[data-theme-toggle]').getAttribute('title'),
          current:document.querySelector('[data-theme-current]').textContent,
          choices:oldThemes.map(id=>{const button=document.querySelector(`[data-theme-choice="${id}"]`);return {
            id,name:button.querySelector('.theme-name').textContent,pressed:button.getAttribute('aria-pressed')};})},
        preferences:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))};
      if(withContrast) {
        state.contrast=[...nodes,...diagramNodes,...headerNodes].map(node=>{
          const bg=background(node);const fg=blend(rgba(getComputedStyle(node).color),bg);
          return {label:node.dataset.contrastCheck||node.dataset.diagramContrast||node.dataset.headerContrast,
            kind:node.dataset.diagramContrast?'consumer-diagram':node.dataset.headerContrast?'consumer-header':'fixture',
            foreground:fg.slice(0,3),background:bg.slice(0,3),
            ratio:ratio(fg,bg),minimum:Number(node.dataset.contrastMin||4.5)};
        });
        state.palette=Object.fromEntries(['paper','paper-2','paper-3','plain','plain-soft','page-paper','chrome',
          'row-hover','rule','rule-2','page-line','accent'].map(token=>[token,rgba(css.getPropertyValue(`--${token}`).trim()).slice(0,3)]));
      }
      states.push(state);
    }
    diagramProbe.remove();
    return states;
  },{theme,withContrast,oldThemes,lightnessValues});
}

function differences(expected,actual,prefix='') {
  const items=[];
  for(const key of new Set([...Object.keys(expected||{}),...Object.keys(actual||{})])) {
    const name=prefix?`${prefix}.${key}`:key;
    const a=expected?.[key],b=actual?.[key];
    if(JSON.stringify(a)===JSON.stringify(b))continue;
    if(a&&b&&typeof a==='object'&&typeof b==='object')items.push(...differences(a,b,name));
    else items.push({field:name,expected:a,actual:b});
  }
  return items;
}

// Colors may change between releases; names, IDs, and stored preferences may not.
const behavior=(state)=>({lightness:state.lightness,actualLightness:state.actualLightness,labels:state.labels,
  preferences:state.preferences,fonts:state.rendered.map(({label,fontFamily,fontSize})=>({label,fontFamily,fontSize}))});

function oklch([r,g,b]) {
  const lin=[r,g,b].map(c=>c/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  const l=Math.cbrt(.4122214708*lin[0]+.5363325363*lin[1]+.0514459929*lin[2]);
  const m=Math.cbrt(.2119034982*lin[0]+.6806995451*lin[1]+.1073969566*lin[2]);
  const s=Math.cbrt(.0883024619*lin[0]+.2817188376*lin[1]+.6299787005*lin[2]);
  const L=.2104542553*l+.793617785*m-.0040720468*s;
  const a=1.9779984951*l-2.428592205*m+.4505937099*s;
  const bb=.0259040371*l+.7827717662*m-.808675766*s;
  return {L,a,b:bb,C:Math.hypot(a,bb),h:(Math.atan2(bb,a)*180/Math.PI+360)%360};
}
const hueGap=(a,b)=>Math.abs(((a-b+540)%360)-180);
const deltaE=(x,y)=>{const p=oklch(x),q=oklch(y);return Math.hypot(p.L-q.L,p.a-q.a,p.b-q.b);};

async function originalPreferences(page) {
  const snapshot=()=>page.evaluate(()=>({theme:document.documentElement.dataset.theme,
    lightness:document.querySelector('[data-theme-lightness]').value,
    preferences:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))}));
  await page.locator('[data-theme-toggle]').click();
  await page.locator('.theme-panel [data-amyc-sync-viewers]').uncheck();
  await page.locator('[data-theme-choice="mist"]').click();
  await page.reload({waitUntil:'domcontentloaded'});
  const scoped=await snapshot();
  await page.locator('[data-theme-toggle]').click();
  await page.locator('.theme-panel [data-amyc-sync-viewers]').check();
  const shared=await snapshot();
  await page.locator('[data-theme-reset]').click();
  const reset=await snapshot();
  await page.keyboard.press('Escape');
  return {scoped,shared,reset};
}

try {
  const baseline=await pageFor('baseline');
  const proposed=await pageFor('proposed');
  const parity=[];
  for(const theme of oldThemes) {
    const [expected,actual]=await Promise.all([themeStates(baseline,theme),themeStates(proposed,theme)]);
    for(let i=0;i<expected.length;i++) {
      const found=differences(behavior(expected[i]),behavior(actual[i]));
      if(found.length)failures.push({type:'existing-theme-behavior-parity',theme,lightness:expected[i].lightness,differences:found});
    }
    parity.push({theme,states:81,unchanged:!failures.some(f=>f.type==='existing-theme-behavior-parity'&&f.theme===theme)});
    console.log(`${theme}: names, labels, and preferences match the baseline at all 81 brightness values`);
  }
  const [expectedPreferences,actualPreferences]=await Promise.all([originalPreferences(baseline),originalPreferences(proposed)]);
  const preferenceDifferences=differences(expectedPreferences,actualPreferences);
  if(preferenceDifferences.length)failures.push({type:'existing-theme-preference-parity',differences:preferenceDifferences});

  const audits=[];
  const fullStates=new Map();
  const vibrancy=[];
  for(const theme of allThemes) {
    const family=families.find(item=>item.id===theme);
    const states=await themeStates(proposed,theme,true);
    fullStates.set(theme,states);
    let checked=0,diagramChecked=0,headerChecked=0;
    for(const state of states) {
      if(state.actualLightness!==String(state.lightness))failures.push({type:'theme-lightness',theme,requested:state.lightness,actual:state.actualLightness});
      for(const reading of state.contrast) {
        if(reading.kind==='consumer-diagram')diagramChecked++;else if(reading.kind==='consumer-header')headerChecked++;else checked++;
        if(reading.ratio<reading.minimum)failures.push({type:'theme-contrast',theme,lightness:state.lightness,...reading});
      }
      if(theme==='crimson'&&state.lightness<=-20) {
        for(const token of ['paper','paper-2','paper-3','plain','plain-soft','page-paper','chrome','row-hover']) {
          const rgb=state.palette[token];
          const [red,green,blue]=rgb;
          // A dark surface must retain visible burgundy color rather than
          // drifting back into neutral black or a brown palette.
          const chroma=(Math.max(...rgb)-Math.min(...rgb))/Math.max(1,...rgb);
          if(!(red>blue&&blue>green&&red-blue>=10&&chroma>=.35)) {
            failures.push({type:'crimson-dark-color-identity',theme,lightness:state.lightness,token,rgb,chroma});
          }
        }
      }
      if(theme==='ember') {
        for(const token of ['rule','rule-2','page-line']) {
          const rgb=state.palette[token];
          const [red,green,blue]=rgb;
          if(!(red>green&&green>blue))failures.push({type:'imperial-gold-divider-identity',theme,lightness:state.lightness,token,rgb});
        }
        const chrome=oklch(state.palette.chrome);
        if(chrome.C>.02)failures.push({type:'imperial-neutral-header',theme,lightness:state.lightness,rgb:state.palette.chrome,chroma:chrome.C});
      } else {
        // Every other family keeps a saturated header and a visibly tinted page
        // in its own hue at every brightness value, including the dark end.
        const header=oklch(state.palette.chrome),page=oklch(state.palette['paper-2']);
        const reading={theme,lightness:state.lightness,headerChroma:header.C,headerHue:header.h,pageChroma:page.C,pageHue:page.h};
        vibrancy.push(reading);
        const headerHue=family.hue.c??family.hue.h;
        if(header.C<.045||hueGap(header.h,headerHue)>30)failures.push({type:'theme-header-vibrancy',expectedHue:headerHue,...reading});
        if(page.C<.016||hueGap(page.h,family.hue.h)>30)failures.push({type:'theme-page-vibrancy',expectedHue:family.hue.h,...reading});
      }
    }
    audits.push({theme,states:81,renderedContrastPairs:checked,diagramContrastPairs:diagramChecked,headerContrastPairs:headerChecked});
    console.log(`${theme}: contrast and color identity inspected at all 81 brightness values`);
  }

  // Neighboring families must stay recognizable at each named brightness.
  const distinctness=[];
  for(const lightness of [-40,-20,0,20,40]) {
    const signatures=allThemes.map(theme=>({theme,palette:fullStates.get(theme).find(state=>state.lightness===lightness).palette}));
    for(let i=0;i<signatures.length;i++) for(let j=i+1;j<signatures.length;j++) {
      const a=signatures[i],b=signatures[j];
      const distance=Math.max(...['chrome','paper-2','accent'].map(token=>deltaE(a.palette[token],b.palette[token])));
      distinctness.push({lightness,themes:[a.theme,b.theme],distance});
      if(distance<.06)failures.push({type:'theme-distinctness',lightness,themes:[a.theme,b.theme],distance});
    }
  }

  // Leaving one theme must not leak adjusted tokens into the next.
  let switchStates=0;
  for(const theme of allThemes) {
    for(const from of allThemes.filter(item=>item!==theme)) {
      await proposed.evaluate(from=>document.querySelector(`[data-theme-choice="${from}"]`).click(),from);
      for(const state of await themeStates(proposed,theme,false,[-40,0,40])) {
        const expected=fullStates.get(theme).find(item=>item.lightness===state.lightness);
        const found=differences({tokens:expected.tokens,rendered:expected.rendered},{tokens:state.tokens,rendered:state.rendered});
        if(found.length)failures.push({type:'theme-switch-independence',from,theme,lightness:state.lightness,differences:found});
        switchStates++;
      }
    }
  }

  const pickers=[];
  const lightnessEndpoints=[];
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    await proposed.setViewportSize(viewport);
    await proposed.locator('[data-theme-toggle]').click();
    const picker=await proposed.locator('.theme-panel').evaluate(panel=>{
      const rows=new Map();
      for(const choice of panel.querySelectorAll('[data-theme-choice]')) {
        const top=Math.round(choice.getBoundingClientRect().top);
        rows.set(top,[...(rows.get(top)||[]),choice.dataset.themeChoice]);
      }
      const rect=panel.getBoundingClientRect();
      return {rows:[...rows.values()],width:panel.clientWidth,scrollWidth:panel.scrollWidth,left:rect.left,right:rect.right};
    });
    if(picker.rows.length!==3||picker.rows.flat().join()!==rainbowOrder.join()||picker.rows.some(row=>row.length!==4))failures.push({type:'theme-rainbow-order',viewport,...picker});
    if(picker.scrollWidth>picker.width+1||picker.left<0||picker.right>viewport.width+1)failures.push({type:'theme-picker-overflow',viewport,...picker});
    pickers.push({viewport,...picker});
    for(const withoutGlobalReset of [false,true]) {
      const observation=await proposed.locator('.theme-panel').evaluate((panel,withoutGlobalReset)=>{
        // Remove only the fixture's universal sizing reset to model a
        // consumer that loads the shared controls without its own reset.
        const resets=[];
        if(withoutGlobalReset) {
          for(const sheet of document.styleSheets) {
            for(const rule of sheet.cssRules) {
              if(rule.selectorText?.includes('*')&&rule.style?.getPropertyValue('box-sizing')) {
                resets.push({style:rule.style,value:rule.style.getPropertyValue('box-sizing'),
                  priority:rule.style.getPropertyPriority('box-sizing')});
                rule.style.removeProperty('box-sizing');
              }
            }
          }
        }
        try {
          const control=panel.querySelector('.lightness-control');
          const track=control.querySelector('.lightness-slider-wrap');
          const trackRect=track.getBoundingClientRect();
          const dots=[...control.querySelectorAll('.lightness-endpoint')].map(dot=>{
            const rect=dot.getBoundingClientRect(),style=getComputedStyle(dot);
            return {title:dot.title,filled:style.backgroundColor!=='rgba(0, 0, 0, 0)',
              background:style.backgroundColor,color:style.color,boxSizing:style.boxSizing,
              borderWidth:parseFloat(style.borderTopWidth),borderStyle:style.borderTopStyle,
              width:rect.width,height:rect.height,top:rect.top,bottom:rect.bottom,
              centerOffset:(rect.left+rect.width/2)-(trackRect.left+trackRect.width/2)};
          });
          const input=control.querySelector('[data-theme-lightness]');
          return {withoutGlobalReset,removedResets:resets.length,dots,
            topGap:dots[0]?trackRect.top-dots[0].bottom:null,
            bottomGap:dots[1]?dots[1].top-trackRect.bottom:null,
            hasTextEndpoints:!!control.querySelector('.lightness-label'),
            accessibleSlider:input?.type==='range'&&!!input.getAttribute('aria-label')};
        } finally {
          for(const reset of resets)reset.style.setProperty('box-sizing',reset.value,reset.priority);
        }
      },withoutGlobalReset);
      lightnessEndpoints.push({viewport,...observation});
      const [light,dark]=observation.dots;
      if(observation.dots.length!==2||light?.filled||!dark?.filled||dark?.background!==dark?.color||
        observation.hasTextEndpoints||!observation.accessibleSlider) {
        failures.push({type:'lightness-endpoint-symbols',viewport,...observation});
      }
      if(observation.topGap<1||observation.topGap>3||observation.bottomGap<1||observation.bottomGap>3||
        observation.dots.some(dot=>Math.abs(dot.centerOffset)>.5)) {
        failures.push({type:'lightness-endpoint-placement',viewport,...observation});
      }
      if(observation.dots.some(dot=>Math.abs(dot.width-8)>.1||Math.abs(dot.height-8)>.1||
        dot.boxSizing!=='border-box'||dot.borderWidth!==1||dot.borderStyle!=='solid')||
        withoutGlobalReset&&observation.removedResets===0) {
        failures.push({type:'lightness-endpoint-size-without-reset',viewport,...observation});
      }
    }
    await proposed.keyboard.press('Escape');
  }
  await proposed.setViewportSize({width:1280,height:900});
  const spectrumOrder=await proposed.evaluate(()=>{
    const input=document.querySelector('[data-theme-spectrum]');
    return Array.from({length:Number(input.max)+1},(_,index)=>{
      input.value=String(index);input.dispatchEvent(new Event('input',{bubbles:true}));
      return document.documentElement.dataset.theme;
    });
  });
  if(spectrumOrder.join()!==rainbowOrder.join())failures.push({type:'theme-spectrum-order',actual:spectrumOrder});
  // The spectrum and lightness tracks are painted with theme colors.
  const tracks=await proposed.evaluate(()=>({
    spectrum:document.querySelector('[data-theme-spectrum]').style.getPropertyValue('--theme-spectrum-track'),
    lightness:document.querySelector('[data-theme-lightness]').style.getPropertyValue('--theme-lightness-track'),
  }));
  if(!tracks.spectrum.startsWith('linear-gradient(')||(tracks.spectrum.match(/#[0-9a-f]{6}/gi)||[]).length!==rainbowOrder.length||
    !tracks.lightness.startsWith('linear-gradient('))failures.push({type:'theme-picker-tracks',...tracks});
  // Existing Ember selections must display Imperial without rewriting the ID.
  await proposed.evaluate(()=>{
    localStorage.setItem('amyc-theme','ember');localStorage.setItem('amyc-lightness','0');
  });
  await proposed.reload({waitUntil:'domcontentloaded'});
  const renamedTheme=await proposed.evaluate(()=>({
    id:document.documentElement.dataset.theme,storedId:localStorage.getItem('amyc-theme'),
    choice:document.querySelector('[data-theme-choice="ember"] .theme-name').textContent,
    current:document.querySelector('[data-theme-current]').textContent,
    spectrum:Number(document.querySelector('[data-theme-spectrum]').value),
  }));
  if(renamedTheme.id!=='ember'||renamedTheme.storedId!=='ember'||renamedTheme.choice!=='Imperial'||renamedTheme.current!=='Imperial'||renamedTheme.spectrum!==rainbowOrder.indexOf('ember'))failures.push({type:'imperial-saved-theme-compatibility',...renamedTheme});
  const persistence=[];
  for(const theme of allThemes) {
    await proposed.locator('[data-theme-toggle]').focus();
    await proposed.keyboard.press('Enter');
    await proposed.locator(`[data-theme-choice="${theme}"]`).focus();
    await proposed.keyboard.press('Enter');
    await proposed.locator('[data-theme-lightness]').evaluate(input=>{
      input.value='24';input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await proposed.reload({waitUntil:'domcontentloaded'});
    const observation=await proposed.evaluate(()=>({theme:document.documentElement.dataset.theme,
      storedTheme:localStorage.getItem('amyc-theme'),lightness:localStorage.getItem('amyc-lightness')}));
    if(observation.theme!==theme||observation.storedTheme!==theme||observation.lightness!=='24')failures.push({type:'theme-keyboard-persistence',expected:theme,...observation});
    persistence.push(observation);
  }
  // The sync control is a switch whose color follows its state, and the
  // theme and font panels stay in agreement.
  await proposed.locator('[data-theme-toggle]').click();
  const syncSwitch=proposed.locator('.theme-panel [data-amyc-sync-viewers]');
  const switchState=()=>proposed.evaluate(()=>{
    const [theme,font]=['.theme-panel','.amyc-font-panel'].map(scope=>document.querySelector(`${scope} [data-amyc-sync-viewers]`));
    const style=getComputedStyle(theme);
    return {role:theme.getAttribute('role'),tag:theme.tagName,checked:theme.getAttribute('aria-checked'),
      fontChecked:font?.getAttribute('aria-checked')??null,background:style.backgroundColor,color:style.color,
      stored:localStorage.getItem('amyc-sync-viewers')};
  });
  await proposed.evaluate(()=>document.querySelectorAll('.theme-persistence-toggle').forEach(node=>node.style.transition='none'));
  const syncOn=await switchState();
  await syncSwitch.click();
  const syncOff=await switchState();
  await syncSwitch.click();
  const syncBack=await switchState();
  const syncControl={on:syncOn,off:syncOff,back:syncBack};
  if(syncOn.role!=='switch'||syncOn.tag!=='BUTTON'||syncOn.checked!=='true'||syncOff.checked!=='false'||syncBack.checked!=='true'||
    syncOn.fontChecked!=='true'||syncOff.fontChecked!=='false'||syncOff.stored!=='0'||syncBack.stored!=='1'||
    syncOn.background===syncOff.background||syncOn.color===syncOff.color)failures.push({type:'sync-switch',...syncControl});
  await proposed.keyboard.press('Escape');
  await proposed.locator('[data-theme-toggle]').click();
  await proposed.locator('.theme-panel [data-amyc-sync-viewers]').uncheck();
  await proposed.locator('[data-theme-choice="crimson"]').click();
  await proposed.reload({waitUntil:'domcontentloaded'});
  const scoped=await proposed.evaluate(()=>({theme:document.documentElement.dataset.theme,
    global:localStorage.getItem('amyc-theme'),scoped:localStorage.getItem('amyc-viewer:theme-additions-parity:amyc-theme'),
    sync:localStorage.getItem('amyc-sync-viewers')}));
  if(scoped.theme!=='crimson'||scoped.global!==allThemes.at(-1)||scoped.scoped!=='crimson'||scoped.sync!=='0')failures.push({type:'theme-scoped-persistence',...scoped});
  const customColors=await proposed.evaluate(allThemes=>{
    const input=document.querySelector('[data-custom-css]');
    const apply=document.querySelector('[data-custom-css-apply]');
    const slider=document.querySelector('[data-theme-lightness]');
    const probe=document.createElement('span');document.body.append(probe);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const rgb=color=>{
      context.fillStyle='#fff';context.fillRect(0,0,1,1);
      context.fillStyle=color;context.fillRect(0,0,1,1);
      return [...context.getImageData(0,0,1,1).data].slice(0,3);
    };
    const tokenRgb=token=>{
      probe.style.backgroundColor=`var(--${token})`;
      return rgb(getComputedStyle(probe).backgroundColor);
    };
    const luminosity=channels=>channels.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
      .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>(Math.max(luminosity(a),luminosity(b))+.05)/(Math.min(luminosity(a),luminosity(b))+.05);
    const setLightness=value=>{slider.value=String(value);slider.dispatchEvent(new Event('input',{bubbles:true}));};
    const setCss=value=>{input.value=value;apply.click();};
    const cases=[];
    for(const theme of allThemes) {
      setCss('');document.querySelector(`[data-theme-choice="${theme}"]`).click();setLightness(0);
      for(const source of ['hsl(40 15% 97%)','oklch(97% 0.015 145)','notacolor']) {
        setCss(`:root[data-theme="${theme}"] { --paper: ${source}; }`);
        const expected=source==='notacolor'?null:rgb(source);
        const actual=tokenRgb('paper');
        const steps=[];
        for(const lightness of [-24,0,24]) {
          setLightness(lightness);
          steps.push({requested:lightness,actual:slider.value,theme:document.documentElement.dataset.theme,
            paper:tokenRgb('paper'),ink:tokenRgb('ink')});
        }
        setLightness(0);
        cases.push({type:'paper-syntax',theme,source,expected,actual,steps});
      }
      const paperSource='hsl(40 10% 100%)',softSource='color-mix(in srgb, #fff 82%, #b9c4d6)';
      setCss(`:root[data-theme="${theme}"] { --document-paper: ${paperSource}; --document-paper-soft: ${softSource}; }`);
      for(const lightness of [-40,0,40]) {
        setLightness(lightness);
        const paper=tokenRgb('document-paper'),soft=tokenRgb('document-paper-soft');
        cases.push({type:'fixed-document-surfaces',theme,lightness,
          paper,expectedPaper:rgb(paperSource),soft,expectedSoft:rgb(softSource),
          readings:['document-ink','document-ink-2','document-ink-3','document-accent'].flatMap(token=>{
            const ink=tokenRgb(token);return [{token,surface:'document-paper',ratio:ratio(ink,paper)},
              {token,surface:'document-paper-soft',ratio:ratio(ink,soft)}];
          })});
      }
    }
    setCss('');probe.remove();return cases;
  },allThemes);
  for(const item of customColors) {
    if(item.type==='paper-syntax') {
      if(item.expected&&item.actual.some((channel,i)=>Math.abs(channel-item.expected[i])>1))failures.push({...item,type:'theme-custom-paper-preservation'});
      if(item.steps.some(step=>step.actual!==String(step.requested)||step.theme!==item.theme||step.paper.some(channel=>!Number.isFinite(channel))))failures.push({...item,type:'theme-custom-paper-recovery'});
    } else {
      if(item.paper.some((channel,i)=>channel!==item.expectedPaper[i])||item.soft.some((channel,i)=>channel!==item.expectedSoft[i]))failures.push({...item,type:'theme-custom-document-preservation'});
      for(const reading of item.readings)if(reading.ratio<4.5)failures.push({type:'theme-custom-document-contrast',theme:item.theme,lightness:item.lightness,...reading});
    }
  }
  const closest=[...distinctness].sort((a,b)=>a.distance-b.distance).slice(0,5);
  const summary={themes:allThemes.length,brightnessStates:allThemes.length*81,originalBehaviorStates:oldThemes.length*81,
    switchStates,renderedContrastPairs:audits.reduce((n,item)=>n+item.renderedContrastPairs,0),
    consumerDiagramContrastPairs:audits.reduce((n,item)=>n+item.diagramContrastPairs,0),
    consumerHeaderContrastPairs:audits.reduce((n,item)=>n+item.headerContrastPairs,0),
    vibrancyReadings:vibrancy.length,distinctPairs:distinctness.length,
    closestPairs:closest.map(item=>`${item.themes.join('/')}@${item.lightness}=${item.distance.toFixed(3)}`),
    minHeaderChroma:Math.min(...vibrancy.map(item=>item.headerChroma)).toFixed(3),
    minPageChroma:Math.min(...vibrancy.map(item=>item.pageChroma)).toFixed(3),
    lightnessEndpointLayouts:lightnessEndpoints.length,
    customPaperCases:customColors.filter(item=>item.type==='paper-syntax').length,
    fixedDocumentContrastPairs:customColors.filter(item=>item.type==='fixed-document-surfaces').reduce((sum,item)=>sum+item.readings.length,0),
    failures:failures.length};
  await writeFile(path.join(stage,'report.json'),JSON.stringify({visibility:'public',classification:'archive-internal',
    baselineCommit,summary,parity,originalPreferences:{expected:expectedPreferences,actual:actualPreferences},audits,vibrancy,distinctness,
    pickers,lightnessEndpoints,spectrumOrder,tracks,renamedTheme,persistence,syncControl,scoped,customColors,failures},null,2)+'\n');
  console.log(JSON.stringify({...summary,failureCategories:Object.fromEntries([...new Set(failures.map(f=>f.type))].map(type=>[type,failures.filter(f=>f.type===type).length])),report:'test-output/theme-palettes/report.json'},null,2));
  if(failures.length)process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
