import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['src/render/spriteIsolation.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {isolateSilhouette}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const d=new Uint8ClampedArray(10*6*4);for(let y=1;y<5;y++)for(let x=1;x<5;x++)d[(y*10+x)*4+3]=255;d[(3*10+8)*4+3]=255;
isolateSilhouette(d,10,6);assert.equal(d[(3*10+8)*4+3],0);assert.equal(d[(3*10+3)*4+3],255);console.log('PASS: adjacent sprite fragment removed; main silhouette preserved');
