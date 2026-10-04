from pathlib import Path
import json
p=Path(__file__).parent
worklet=(p/'denoise-worklet.js').read_text()
core=(p/'core.js').read_text().replace('__WORKLET_SOURCE__',json.dumps(worklet))
(p/'edge').mkdir(exist_ok=True)
(p/'edge/content.js').write_text(core)
(p/'edge/denoise-worklet.js').write_text(worklet)
manifest={'manifest_version':3,'name':'西农云课堂增强','version':'0.1.0','description':'全屏可调字幕、本地人声增强与底噪采样降噪（试用版）','content_scripts':[{'matches':['https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*'],'js':['content.js'],'run_at':'document_idle'}],'web_accessible_resources':[{'resources':['denoise-worklet.js'],'matches':['https://ylb.nwafu.edu.cn/*']}]}
(p/'edge/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
header='''// ==UserScript==
// @name         西农云课堂增强
// @namespace    local.nwa.classroom
// @version      0.1.0
// @description  全屏可调字幕、本地人声增强和底噪采样降噪；仅学校云课堂生效
// @match        https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
'''
(p/'Classroom_Enhancer.user.js').write_text(header+core)
