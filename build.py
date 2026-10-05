from pathlib import Path
import json
p=Path(__file__).parent
worklet=(p/'denoise-worklet.js').read_text(encoding='utf-8')
core=(p/'core.js').read_text(encoding='utf-8').replace('__WORKLET_SOURCE__',json.dumps(worklet)).replace('__LEARNING_MODULE__',(p/'learning.js').read_text(encoding='utf-8'))
(p/'edge').mkdir(exist_ok=True)
(p/'edge/content.js').write_text(core,encoding='utf-8',newline='\n')
(p/'edge/denoise-worklet.js').write_text(worklet,encoding='utf-8',newline='\n')
manifest={'manifest_version':3,'name':'西农云课堂增强','version':'0.2.0','description':'全屏可调字幕、本地人声增强与底噪采样降噪（试用版）','content_scripts':[{'matches':['https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*'],'js':['content.js'],'run_at':'document_idle'}],'web_accessible_resources':[{'resources':['denoise-worklet.js'],'matches':['https://ylb.nwafu.edu.cn/*']}]}
manifest['background']={'service_worker':'background.js'}
manifest['host_permissions']=['http://localhost:11434/*']
(p/'edge/background.js').write_text((p/'background.js').read_text(encoding='utf-8'),encoding='utf-8',newline='\n')
(p/'manifest.json').write_text(json.dumps({**manifest,'content_scripts':[{**manifest['content_scripts'][0],'js':['edge/content.js']}]},ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
(p/'edge/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
header='''// ==UserScript==
// @name         西农云课堂增强
// @namespace    local.nwa.classroom
// @version      0.2.0
// @description  全屏可调字幕、本地人声增强和底噪采样降噪；仅学校云课堂生效
// @match        https://ylb.nwafu.edu.cn/TeachingCenterStudentWeb/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
'''
(p/'Classroom_Enhancer.user.js').write_text(header+core,encoding='utf-8',newline='\n')

# Dedicated Edge package: manifest is at ZIP root, never below a wrapper folder.
import zipfile
(p/'downloads').mkdir(exist_ok=True)
with zipfile.ZipFile(p/'downloads/Classroom_Enhancer_Edge_v0.2.0.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((p/'edge').iterdir()):
        if f.is_file():
            info=zipfile.ZipInfo(f.name,(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,f.read_bytes())
    info=zipfile.ZipInfo('INSTALL.txt',(2026,10,5,0,0,0));info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
    z.writestr(info,'解压此 ZIP 到一个文件夹。在 Edge 的 edge://extensions 开启开发人员模式，加载解压缩的扩展，选择该文件夹。该文件夹内必须直接看到 manifest.json。版本 0.2.0。完整说明见 GitHub README。')
