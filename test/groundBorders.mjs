import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import vm from 'node:vm';
const source=readFileSync('src/render/terrain.ts','utf8');const start=source.indexOf('function blendEdges('),end=source.indexOf('function paintScatter(',start);
const js=ts.transpile(source.slice(start,end),{target:ts.ScriptTarget.ES2022});
const Tile={Grass:0,Dirt:1,Water:2,Tree:3,Gold:4,Rock:5,Ice:6};let draws=0;
const context={Tile,T:40,DIRT:['brown'],ROCKC:['grey'],GRASS:['green'],pick:a=>a[0],fbm:()=>0,hash2:()=>0};vm.createContext(context);vm.runInContext(js,context);
for(const feature of [Tile.Tree,Tile.Gold]){draws=0;context.blendEdges({fillRect(){draws++;}},{get:(x,y)=>x===0&&y===0?feature:Tile.Grass,inBounds:()=>true,isHidden:()=>false},0,0,1);assert.equal(draws,0,'Feature must not paint green borders');}
draws=0;context.blendEdges({fillRect(){draws++;}},{get:(x,y)=>x===0&&y===0?Tile.Grass:Tile.Dirt,inBounds:()=>true,isHidden:()=>false},0,0,1);assert(draws>0,'Keep genuine dirt transitions');console.log('PASS: forests/mines have no green borders; dirt transitions remain');
