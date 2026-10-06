"""Small desktop launcher; uses the same local processor, never hosts a video player."""
import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from classroom_processor import WhisperBackend, process

def main():
    app=tk.Tk();app.title('Classroom Enhancer · 本地课堂处理');app.geometry('760x580')
    frame=ttk.Frame(app,padding=18);frame.pack(fill='both',expand=True)
    fields={};running=False;events=queue.Queue();cancel=threading.Event()
    ttk.Label(frame,text='选择已有本地音频/视频和已准备好的模型；不会自动下载或上传。',wraplength=700).pack(anchor='w')
    for name,label,kind in [('source','音频 / 视频','file'),('model','本地模型目录','dir'),('output','处理结果目录','dir'),('lesson','本节课 ID','text'),('duration','原视频总秒数（可空）','text'),('offset','片段起始秒数（整课填 0）','text'),('track','音轨编号（从 0 开始）','text')]:
        row=ttk.Frame(frame);row.pack(fill='x',pady=5);ttk.Label(row,text=label,width=29).pack(side='left')
        var=tk.StringVar(value='0' if name in ('offset','track') else '');fields[name]=var
        ttk.Entry(row,textvariable=var).pack(side='left',fill='x',expand=True)
        if kind!='text':
            def browse(v=var,k=kind):
                selected=filedialog.askdirectory() if k=='dir' else filedialog.askopenfilename()
                if selected:v.set(selected)
            ttk.Button(row,text='选择',command=browse).pack(side='right')
    def metadata():
        f=filedialog.askopenfilename(filetypes=[('课次信息','*.json')])
        if not f:return
        try:
            d=json.loads(Path(f).read_text(encoding='utf-8'));fields['lesson'].set(d['lectureId']);fields['duration'].set(str(d.get('duration') or ''))
        except Exception as e:messagebox.showerror('未导入',str(e))
    ttk.Button(frame,text='导入扩展导出的课次信息',command=metadata).pack(anchor='w',pady=8)
    status=tk.StringVar(value='CPU 模式。模型大小会影响耗时；新识别稿仍需核对。')
    ttk.Label(frame,textvariable=status,wraplength=700).pack(anchor='w',pady=8)
    def start():
        nonlocal running
        if running:return
        args={k:v.get().strip() for k,v in fields.items()}
        if not all(args[k] for k in ('source','model','output','lesson')):
            messagebox.showerror('缺少信息','请选择媒体、模型、结果目录，并填写课次 ID。');return
        try:offset=float(args['offset']);duration=float(args['duration']) if args['duration'] else None;track=int(args['track'])
        except ValueError:messagebox.showerror('格式不正确','时间和音轨编号需要数字。');return
        running=True;cancel.clear();start_button.configure(state='disabled');status.set('正在加载本地模型和准备音频…')
        def worker():
            try:
                model=WhisperBackend(args['model'])
                data=process(args['source'],args['output'],args['lesson'],model,offset=offset,video_duration=duration,audio_track=track,progress=lambda s:events.put(('status',s)),cancel=cancel)
                events.put(('done',f'已生成 {Path(args["output"])/"classroom.json"}；{data["coverage"]["status"]}；内容待复核。'))
            except Exception as e:events.put(('done','未完成：'+str(e)))
        threading.Thread(target=worker,daemon=True).start()
    start_button=ttk.Button(frame,text='开始 / 继续上次处理',command=start);start_button.pack(anchor='w',pady=5)
    def stop():cancel.set();status.set('将在当前片段处理结束后停止；已完成结果保留。')
    ttk.Button(frame,text='停止后续片段',command=stop).pack(anchor='w',pady=5)
    ttk.Label(frame,text='结果：将 classroom.json 导入学校网页的“课堂字幕数据”。\n输入文件或参数改变时，请选择新的结果目录。',wraplength=700).pack(anchor='w',pady=8)
    def poll():
        nonlocal running
        while not events.empty():
            kind,text=events.get();status.set(text)
            if kind=='done':running=False;start_button.configure(state='normal')
        app.after(150,poll)
    def close():
        if running:
            messagebox.showinfo('处理进行中','请先停止并等待当前片段结束，再关闭窗口。');return
        app.destroy()
    app.protocol('WM_DELETE_WINDOW',close);poll();app.mainloop()

if __name__=='__main__':main()
