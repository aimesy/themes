// visibility: public
// Preserve the original eight themes exactly; audit only the four additions for contrast.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineCommit = 'cd6aac6380c70291fa876f8d1d802cde65b80b0a';
const stage = path.join(root, 'test-output', 'theme-additions');
const oldThemes = ['mist','lilac','glacier','rose','sand','tidepool','cypress','starlight'];
const newThemes = ['crimson','ember','ultramarine','orchid'];
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

// Captures every computed custom property, rendered fixture color, original label,
// and saved preference at each of the 81 actual integer slider positions.
async function themeStates(page,theme,withContrast=false,lightnessValues=Array.from({length:81},(_,i)=>i-40)) {
  return page.evaluate(({theme,withContrast,oldThemes,lightnessValues})=>{
    document.querySelector(`[data-theme-choice="${theme}"]`).click();
    const slider=document.querySelector('[data-theme-lightness]');
    const nodes=[...document.querySelectorAll('[data-contrast-check]')];
    const diagramProbe=document.createElement('section');
    const diagramNodes=[];
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
            id,text:button.textContent,pressed:button.getAttribute('aria-pressed')};})},
        preferences:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))};
      if(withContrast) state.contrast=[...nodes,...diagramNodes].map(node=>{
        const bg=background(node);const fg=blend(rgba(getComputedStyle(node).color),bg);
        return {label:node.dataset.contrastCheck||node.dataset.diagramContrast,
          kind:node.dataset.diagramContrast?'consumer-diagram':'fixture',
          foreground:fg.slice(0,3),background:bg.slice(0,3),
          ratio:ratio(fg,bg),minimum:Number(node.dataset.contrastMin||4.5)};
      });
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
  const baselineStates=new Map();
  for(const theme of oldThemes) {
    const [expected,actual]=await Promise.all([themeStates(baseline,theme),themeStates(proposed,theme)]);
    baselineStates.set(theme,expected);
    let comparisons=0;
    for(let i=0;i<expected.length;i++) {
      const found=differences(expected[i],actual[i]);
      comparisons+=Object.keys(expected[i].tokens).length+expected[i].rendered.length*5;
      if(found.length)failures.push({type:'existing-theme-parity',theme,lightness:expected[i].lightness,differences:found});
    }
    parity.push({theme,states:81,computedComparisons:comparisons,unchanged:!failures.some(f=>f.type==='existing-theme-parity'&&f.theme===theme)});
    console.log(`${theme}: original behavior compared at all 81 brightness values`);
  }
  let switchStates=0;
  for(const added of newThemes) {
    for(const theme of oldThemes) {
      await proposed.evaluate(added=>document.querySelector(`[data-theme-choice="${added}"]`).click(),added);
      const states=await themeStates(proposed,theme,false,[-40,0,40]);
      for(const state of states) {
        const expected=baselineStates.get(theme).find(item=>item.lightness===state.lightness);
        const found=differences(expected,state);
        if(found.length)failures.push({type:'new-to-existing-theme-parity',from:added,theme,lightness:state.lightness,differences:found});
        switchStates++;
      }
    }
  }
  const [expectedPreferences,actualPreferences]=await Promise.all([originalPreferences(baseline),originalPreferences(proposed)]);
  const preferenceDifferences=differences(expectedPreferences,actualPreferences);
  if(preferenceDifferences.length)failures.push({type:'existing-theme-preference-parity',differences:preferenceDifferences});
  const additions=[];
  for(const theme of newThemes) {
    const states=await themeStates(proposed,theme,true);
    let checked=0,diagramChecked=0;
    for(const state of states) {
      if(state.actualLightness!==String(state.lightness))failures.push({type:'new-theme-lightness',theme,requested:state.lightness,actual:state.actualLightness});
      for(const reading of state.contrast) {
        if(reading.kind==='consumer-diagram')diagramChecked++;else checked++;
        if(reading.ratio<reading.minimum)failures.push({type:'new-theme-contrast',theme,lightness:state.lightness,...reading});
      }
    }
    additions.push({theme,states:81,renderedContrastPairs:checked,diagramContrastPairs:diagramChecked});
    console.log(`${theme}: added theme contrast inspected at all 81 brightness values`);
  }

  const pickers=[];
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
    if(picker.rows.length!==3||picker.rows[2]?.join()!==newThemes.join()||picker.rows.some(row=>row.length!==4))failures.push({type:'new-theme-third-row',viewport,...picker});
    if(picker.scrollWidth>picker.width+1||picker.left<0||picker.right>viewport.width+1)failures.push({type:'new-theme-picker-overflow',viewport,...picker});
    pickers.push({viewport,...picker});
    await proposed.keyboard.press('Escape');
  }
  await proposed.setViewportSize({width:1280,height:900});
  const persistence=[];
  for(const theme of newThemes) {
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
    if(observation.theme!==theme||observation.storedTheme!==theme||observation.lightness!=='24')failures.push({type:'new-theme-keyboard-persistence',expected:theme,...observation});
    persistence.push(observation);
  }
  await proposed.locator('[data-theme-toggle]').click();
  await proposed.locator('.theme-panel [data-amyc-sync-viewers]').uncheck();
  await proposed.locator('[data-theme-choice="crimson"]').click();
  await proposed.reload({waitUntil:'domcontentloaded'});
  const scoped=await proposed.evaluate(()=>({theme:document.documentElement.dataset.theme,
    global:localStorage.getItem('amyc-theme'),scoped:localStorage.getItem('amyc-viewer:theme-additions-parity:amyc-theme'),
    sync:localStorage.getItem('amyc-sync-viewers')}));
  if(scoped.theme!=='crimson'||scoped.global!=='orchid'||scoped.scoped!=='crimson'||scoped.sync!=='0')failures.push({type:'new-theme-scoped-persistence',...scoped});
  const customColors=await proposed.evaluate(newThemes=>{
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
    for(const theme of newThemes) {
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
  },newThemes);
  for(const item of customColors) {
    if(item.type==='paper-syntax') {
      if(item.expected&&item.actual.some((channel,i)=>Math.abs(channel-item.expected[i])>1))failures.push({type:'new-theme-custom-paper-preservation',...item});
      if(item.steps.some(step=>step.actual!==String(step.requested)||step.theme!==item.theme||step.paper.some(channel=>!Number.isFinite(channel))))failures.push({type:'new-theme-custom-paper-recovery',...item});
    } else {
      if(item.paper.some((channel,i)=>channel!==item.expectedPaper[i])||item.soft.some((channel,i)=>channel!==item.expectedSoft[i]))failures.push({type:'new-theme-custom-document-preservation',...item});
      for(const reading of item.readings)if(reading.ratio<4.5)failures.push({type:'new-theme-custom-document-contrast',theme:item.theme,lightness:item.lightness,...reading});
    }
  }
  const summary={originalThemes:8,originalBrightnessStates:648,newToOriginalSwitchStates:switchStates,
    computedComparisons:parity.reduce((n,item)=>n+item.computedComparisons,0),
    newThemes:4,newBrightnessStates:324,newRenderedContrastPairs:additions.reduce((n,item)=>n+item.renderedContrastPairs,0),
    consumerDiagramContrastPairs:additions.reduce((n,item)=>n+item.diagramContrastPairs,0),
    customPaperCases:customColors.filter(item=>item.type==='paper-syntax').length,
    fixedDocumentContrastPairs:customColors.filter(item=>item.type==='fixed-document-surfaces').reduce((sum,item)=>sum+item.readings.length,0),
    failures:failures.length};
  await writeFile(path.join(stage,'report.json'),JSON.stringify({visibility:'public',classification:'archive-internal',
    baselineCommit,summary,parity,originalPreferences:{expected:expectedPreferences,actual:actualPreferences},additions,pickers,persistence,scoped,customColors,failures},null,2)+'\n');
  console.log(JSON.stringify({...summary,failureCategories:Object.fromEntries([...new Set(failures.map(f=>f.type))].map(type=>[type,failures.filter(f=>f.type===type).length])),report:'test-output/theme-additions/report.json'},null,2));
  if(failures.length)process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
