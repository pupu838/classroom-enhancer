# 电脑端课堂处理器 · 0.3.0 开发版

本工具只处理本地文件，生成字幕 JSON，不包含视频播放器。不自动下载模型，不联网上传媒体。学校音轨自动获取尚未实现。

## 准备

1. 安装 Python 3.10 或以上和 FFmpeg，将 ffmpeg 加到 PATH；运行 `python --version`、`ffmpeg -version` 确认。
2. 在项目目录执行 `python -m pip install -r processor/requirements.txt`。此步下载开源依赖，语音识别时只用本地模型。
3. 自行准备兼容 faster-whisper/CTranslate2 的模型目录，需要 model.bin、config.json、tokenizer.json，以及模型仓库提供的词表等配套文件；preprocessor_config.json 若该模型仓库提供也应保留。仅下载一个普通大语言模型不能替代语音识别模型。本版要求本地完整文件，缺失时会报错而不是偷偷下载。
4. 在学校网页扩展面板点“导出课次信息”，用于保持课次 ID 和原视频时长一致。准备你有权处理的本地音频/视频。

模型与硬件选型尚未按真实课程评测，默认 CPU/int8，不保证任意电脑的速度或字幕优于学校。初始识别后端参考官方 [faster-whisper 文档](https://github.com/SYSTRAN/faster-whisper)。

## 窗口操作

Windows 双击 `processor/start_windows.bat`，或执行 `python processor/gui.py`。窗口依赖 Python 的 Tkinter；常规 Windows Python 安装通常提供它，缺少时需安装对应组件。

选择音频/视频、本地模型目录、结果目录，导入课次信息；如果输入只是课堂片段，填写它在原视频中的开始秒数并保留原视频总时长。音轨编号从 0 开始，须先确认哪一路是老师声音。点击“开始 / 继续上次处理”。

“停止后续片段”会等待当前片段结束。输入、模型、课次或参数改变后必须选新结果目录。程序保留 checkpoint.json，以同样设置重跑可继续。该文件含完整分段原始模型输出，供回查；不要把真实课堂数据提交公开仓库。

完成或中途失败后，结果目录中的 `classroom.json` 可导入扩展。处理覆盖不完整时明确标记 partial。导入后仍需手动选择字幕来源并核对音画同步。修订数据保存在浏览器 IndexedDB，跨设备使用需要导出文件；没有自动云同步。

## 命令行

```bash
python processor/classroom_processor.py "lesson.mp4" --lecture-id "网页导出的课次ID" --model-dir "本地模型目录" --output "处理结果目录"
```

可选参数：

- `--terms terms.txt`：UTF-8 术语提示，最多 2000 字。提示不是老师讲过这些内容的证据。
- `--offset 600 --video-duration 5400`：输入为原课第 10 分钟起的片段，原课 90 分钟。未提供准确总时长的片段无法与全课可靠匹配。
- `--audio-track 1`：选择第二条音轨；不是第二路视频。
- `--chunk-seconds 60 --overlap-seconds 2`：核心 60 秒、两端提供上下文；按词时间中点分配接缝归属，保留接缝复核标记。真实识别的接缝仍可能错漏。
- `--device cuda --compute-type float16`：仅在你已配置兼容运行环境时使用；本次不验证 GPU。

输出 classroom.json 不含媒体 URL、登录凭据或本地路径；媒体内容指纹用于区分输入。浏览器只检查课次与时长，尚不能与学校远程媒体自动核对字节指纹，因此同课次错音轨仍需人工发现。

## 数据和验收边界

- 原始媒体不会修改。FFmpeg 生成临时单声道 16 kHz PCM，用完清理；完整音频临时文件会占用磁盘。失败重跑需重新解码媒体，但跳过已完成识别段。
- 未实现自动 AI 术语纠错或视觉理解。修订由用户另存，原稿保留；不可辨认内容应保留待核对状态。
- 不依赖降噪作为识别前置；当前使用原始音轨。播放端增强仍独立存在。
- 本程序的“complete”仅表示从 0 到总时长的音频区间处理完成，不表示识别准确、无漏句或教师重点已核实。
- 自动化测试的模拟识别和合成语音只验证工程流程，不能代替真实课堂准确率验收。
