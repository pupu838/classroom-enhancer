# 私有云端字幕流水线（待真实部署验收）

本目录是可部署后台，不代表 EdgeOne 已有转录能力，也不代表已经处理了真实课次。

## 已实现的协议

电脑扩展在学校页面读取媒体、提取音轨。扩展后台持有私有服务连接密钥；学校页面不接收密钥。
音频以 1 MiB 分块上传，服务器确认偏移，可在刷新后重新提取同一课次并续传。完整 SHA256 匹配后入队，才允许提示关闭浏览器。

后台：SQLite 队列 → faster-whisper 中文识别 → 从 Drive 教材检索相关片段 → OpenAI-compatible 模型逐句校正 → 字幕引用式章节 → 私有 Drive 输出。
原始识别、校正 VTT、可读 Markdown、章节 JSON、插件数据包和课程索引分别保存。模型不能修改时间戳、字幕ID或顺序。校正是机器校正，不等于人工核听无误。
插件进入真实 `id=` 回放路由自动取回同课次数据，显示校正字幕和可点击章节；课次/时长不匹配时拒绝加载。原本手工字幕保留。

## 部署所需资源

需要运行 Docker/Python 的持久云服务及 HTTPS，挂载 `/data`。不是把这些文件放进静态 EdgeOne `portal` 就会自动有计算资源。

1. 在有足够内存的云主机运行 `docker build -f cloud/Dockerfile -t classroom-worker .`。
2. 复制 `.env.example` 为主机私有 `.env`，填入配置；用 `docker run --env-file .env -v classroom-data:/data -p 8080:8080 classroom-worker` 运行。
3. `CE_API_TOKEN` 至少32随机字符；只能经私密配置渠道传入，不提交仓库、不发到公开日志。
4. Google OAuth client + refresh token 需用户对这个后台单独授权。ChatGPT 的 Drive 连接不能导出或自动变成后台授权。Drive scope 必须覆盖用户选定的已有教材以及字幕输出目录；按最小可行范围配置，不要求公开任何文件。
5. `GOOGLE_DRIVE_FOLDER_ID` 是专用输出文件夹。`CORRECTION_API_BASE`/`MODEL`/可选 KEY 指向选择的云模型或自建模型。未选择付费服务、未内置密钥。
6. 首次 ASR 将下载指定模型。默认 small/int8/CPU，硬件内存、耗时、中文课堂准确率需要实测。免费静态托管不能代替该计算资源。
7. 保持一个 uvicorn worker；持久卷保存上传字节、队列、原始识别和校正检查点。不要以多个容器共享一个未设计为分布式的队列。

## 扩展连接

运行 `python build.py && npm run build:connector`，加载 `connector-extension`。
在扩展设置中填写 HTTPS 后台地址、连接密钥及课程ID到 Drive 教材文件ID的对应表。
点击保存会只向该域名申请访问权限、检查后台缺失配置。
可以开启“提取后自动上传”或“登录后自动同步关联课程新增回放”。没有配置时音频提取仍可工作，明确显示未连接后台，不伪装处理成功。

## 第一版边界

- 当前只提交单媒体分段课次；多段课次明确拒绝，不把第一段冒充整节课。
- 自动同步一次最多枚举每门课600个回放；不会自动重做失败任务，需点重试。
- 学校登录过期需重新登录，上传确认前必须保持浏览器打开。
- 学校页面中的脚本能触发桥接操作，桥接仅接受固定作业操作、不允许任意URL代理；信任边界包括学校页面本身。后台连接密钥不进入页面、postMessage或Drive。
- 音频保存在私有后台持久卷，供重试；当前字幕文件写入Drive，音频长期归档/清理策略尚未接入。
- 后台未部署、未完成独立 Google 授权、未配置真实校正服务前，整个流水线不能投入使用。

## 验证

`PYTHONPATH=. pytest tests/cloud -q`
`node tests/cloud-player-test.cjs`
`npm run test:connector && npm run test:dom`

API/模型/Drive模拟测试只验证状态和格式，不是中文课堂准确率或真实Drive授权证据。
