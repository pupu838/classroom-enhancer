import assert from 'node:assert/strict';
import {cleanLayout,viewRects,boundRect} from '../scripts/view-layout.mjs';
const ids=['teacher','slides'],layout=cleanLayout();let r=viewRects(ids,layout,true);assert.equal(r.arrangement,'column');assert.equal(r.rects.slides.y,50);assert.equal(r.aspect,8/9);
r=viewRects(ids,{...layout,arrangement:'row',ratio:70});assert.equal(r.rects.slides.x,70);assert.equal(r.rects.slides.w,30);
r=viewRects(['teacher','room','slides'],{...layout,arrangement:'focus',ratio:65});assert.equal(r.rects.teacher.w,65);assert.equal(r.rects.slides.y,50);
assert.deepEqual(boundRect({x:99,y:-5,w:80,h:150}),{x:20,y:0,w:80,h:100});
const free=cleanLayout({arrangement:'free',aspect:8/9,rects:{teacher:{x:20,y:30,w:40,h:50}},selected:['teacher','teacher','evil'],ratio:999});assert.equal(free.ratio,80);assert.deepEqual(free.selected,['teacher']);assert.equal(viewRects(['teacher'],free).rects.teacher.x,20);
console.log('PASS portrait vertical, ratios, main-secondary, bounded free placement, saved layout sanitization and single-view editing');
